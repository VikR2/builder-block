#!/usr/bin/env python3
"""
Backfill lesson-ready artifacts for legacy local videos.

Repairs missing folder_id values, generates embeddings/lesson guides when possible,
and republishes only videos whose full artifact set is present.
"""

from __future__ import annotations

import argparse
import json
import sqlite3
import subprocess
import sys
import shutil
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
DB_PATH = PROJECT_ROOT / "data" / "builder.db"
LOCAL_VIDEOS_PATH = PROJECT_ROOT / "data" / "local-videos"
EMBED_SCRIPT = SCRIPT_DIR / "embed_transcripts.py"
LESSON_SCRIPT = SCRIPT_DIR / "generate_video_lesson.py"
SHORTS_BRIEF_SCRIPT = SCRIPT_DIR / "generate_shorts_brief.py"


def build_managed_video_path(folder_id: str, filename: str) -> Path:
    return LOCAL_VIDEOS_PATH / folder_id / filename


@dataclass
class BackfillRowResult:
    video_id: int
    folder_id: str | None
    file_path: str | None
    video_file: bool
    transcript: bool
    frames: bool
    manifest: bool
    embeddings: bool
    lesson: bool
    lesson_tutor_pack: bool
    shorts_brief: bool
    ready: bool
    updated: bool
    actions: list[str]
    error: str | None = None


def infer_folder_id_from_path(path_value: str | None) -> str | None:
    if not path_value:
        return None
    try:
        parent = Path(path_value).resolve().parent
    except OSError:
        return None

    try:
        if parent.parent == LOCAL_VIDEOS_PATH.resolve():
            return parent.name
    except OSError:
        return None

    return None


def infer_folder_id(file_path: str | None, transcript_path: str | None = None) -> str | None:
    return infer_folder_id_from_path(file_path) or infer_folder_id_from_path(transcript_path)


def has_frames(video_dir: Path) -> bool:
    manifest_file = video_dir / "manifest.json"
    if manifest_file.exists():
      try:
        manifest = json.loads(manifest_file.read_text(encoding="utf-8"))
        if (manifest.get("frame_count") or 0) > 0:
            return True
        if manifest.get("frames"):
            return True
      except Exception:
        pass

    frames_dir = video_dir / "frames"
    return frames_dir.exists() and any(
        frame.suffix.lower() in {".jpg", ".png"} for frame in frames_dir.iterdir()
    )


def artifact_status(video_dir: Path, expected_file_path: str | None = None) -> dict[str, bool]:
    video_files = list(video_dir.glob("*.mp4"))
    video_file = any(path.is_file() for path in video_files)
    if expected_file_path:
        try:
            video_file = Path(expected_file_path).exists() or video_file
        except OSError:
            pass
    transcript = (video_dir / "transcript_timed.json").exists()
    manifest = (video_dir / "manifest.json").exists()
    embeddings = (video_dir / "embeddings.faiss").exists() and (video_dir / "segments.json").exists()
    lesson_file = video_dir / "lesson.json"
    lesson = lesson_file.exists()
    lesson_tutor_pack = False
    if lesson:
        try:
            lesson_payload = json.loads(lesson_file.read_text(encoding="utf-8"))
            lesson_tutor_pack = isinstance(lesson_payload.get("tutorPack"), dict)
        except Exception:
            lesson_tutor_pack = False
    shorts_brief = (video_dir / "shorts_brief.json").exists()
    frames = has_frames(video_dir)
    ready = video_file and transcript and manifest and frames and embeddings and lesson
    return {
        "video_file": video_file,
        "transcript": transcript,
        "manifest": manifest,
        "frames": frames,
        "embeddings": embeddings,
        "lesson": lesson,
        "lesson_tutor_pack": lesson_tutor_pack,
        "shorts_brief": shorts_brief,
        "ready": ready,
    }


def run_script(script_path: Path, video_dir: Path) -> None:
    proc = subprocess.run(
        [sys.executable, str(script_path), "--video-dir", str(video_dir), "--json"],
        cwd=str(PROJECT_ROOT),
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip() or proc.stdout.strip() or f"{script_path.name} failed")


def normalize_managed_video_file(
    row: sqlite3.Row,
    folder_id: str | None,
    *,
    apply_changes: bool,
    actions: list[str],
) -> str | None:
    current_path = row["file_path"]
    if not folder_id or not row["filename"]:
        return current_path

    managed_path = build_managed_video_path(folder_id, row["filename"])
    managed_path.parent.mkdir(parents=True, exist_ok=True)

    if managed_path.exists():
        if current_path != str(managed_path):
            actions.append("normalized-file-path")
        return str(managed_path)

    if current_path:
        source_path = Path(current_path)
        if source_path.exists():
            actions.append("copied-video-to-managed-storage")
            if apply_changes:
                shutil.copy2(source_path, managed_path)
            return str(managed_path)

    return current_path


def backfill_video(row: sqlite3.Row, *, apply_changes: bool) -> BackfillRowResult:
    video_id = int(row["id"])
    actions: list[str] = []
    updated = False

    folder_id = row["folder_id"] or infer_folder_id(row["file_path"], row["transcript_path"])
    if folder_id and folder_id != row["folder_id"]:
        actions.append("filled-folder-id")
        updated = True

    normalized_file_path = normalize_managed_video_file(
        row,
        folder_id,
        apply_changes=apply_changes,
        actions=actions,
    )
    if normalized_file_path != row["file_path"]:
        updated = True

    video_dir = LOCAL_VIDEOS_PATH / folder_id if folder_id else None
    if not video_dir or not video_dir.exists():
        return BackfillRowResult(
            video_id=video_id,
            folder_id=folder_id,
            file_path=normalized_file_path,
            video_file=False,
            transcript=False,
            frames=False,
            manifest=False,
            embeddings=False,
            lesson=False,
            lesson_tutor_pack=False,
            shorts_brief=False,
            ready=False,
            updated=updated,
            actions=actions,
            error="Video directory missing",
        )

    before = artifact_status(video_dir, normalized_file_path)

    try:
        if before["transcript"] and not before["embeddings"]:
            actions.append("generated-embeddings")
            if apply_changes:
                run_script(EMBED_SCRIPT, video_dir)

        refreshed = artifact_status(video_dir, normalized_file_path)

        lesson_needs_refresh = refreshed["manifest"] and refreshed["transcript"] and (
            not refreshed["lesson"] or not refreshed["lesson_tutor_pack"]
        )
        lesson_updated = False

        if lesson_needs_refresh:
            actions.append("generated-lesson" if not refreshed["lesson"] else "refreshed-lesson-tutor-pack")
            if apply_changes:
                run_script(LESSON_SCRIPT, video_dir)
            lesson_updated = True

        lesson_refreshed = artifact_status(video_dir, normalized_file_path)

        if lesson_refreshed["lesson"] and (not lesson_refreshed["shorts_brief"] or lesson_updated):
            actions.append("generated-shorts-brief" if not lesson_refreshed["shorts_brief"] else "refreshed-shorts-brief")
            if apply_changes:
                run_script(SHORTS_BRIEF_SCRIPT, video_dir)

        final_status = artifact_status(video_dir, normalized_file_path)
    except Exception as exc:
        return BackfillRowResult(
            video_id=video_id,
            folder_id=folder_id,
            file_path=normalized_file_path,
            video_file=before["video_file"],
            transcript=before["transcript"],
            frames=before["frames"],
            manifest=before["manifest"],
            embeddings=before["embeddings"],
            lesson=before["lesson"],
            lesson_tutor_pack=before["lesson_tutor_pack"],
            shorts_brief=before["shorts_brief"],
            ready=before["ready"],
            updated=updated,
            actions=actions,
            error=str(exc),
        )

    return BackfillRowResult(
        video_id=video_id,
        folder_id=folder_id,
        file_path=normalized_file_path,
        video_file=final_status["video_file"],
        transcript=final_status["transcript"],
        frames=final_status["frames"],
        manifest=final_status["manifest"],
        embeddings=final_status["embeddings"],
        lesson=final_status["lesson"],
        lesson_tutor_pack=final_status["lesson_tutor_pack"],
        shorts_brief=final_status["shorts_brief"],
        ready=final_status["ready"],
        updated=updated,
        actions=actions,
    )


def update_row(conn: sqlite3.Connection, row: sqlite3.Row, result: BackfillRowResult) -> None:
    now = datetime.now(timezone.utc).isoformat()
    processing_status = "ready" if result.ready else (row["processing_status"] or "failed")
    is_published = 1 if result.ready else 0
    processed_at = row["processed_at"] or now if result.ready else row["processed_at"]
    error_message = None if result.ready else result.error or row["error_message"]

    conn.execute(
        """
        UPDATE processed_local_videos
        SET folder_id = ?,
            file_path = ?,
            processing_status = ?,
            is_published = ?,
            processed_at = ?,
            error_message = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        """,
        (
            result.folder_id,
            result.file_path,
            processing_status,
            is_published,
            processed_at,
            error_message,
            result.video_id,
        ),
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Backfill legacy video lesson artifacts")
    parser.add_argument("--video-id", type=int, help="Process a single processed_local_videos row")
    parser.add_argument("--dry-run", action="store_true", help="Inspect changes without modifying files or DB")
    parser.add_argument("--json", action="store_true", help="Emit machine-readable summary")
    args = parser.parse_args()

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    query = "SELECT * FROM processed_local_videos"
    params: tuple[object, ...] = ()
    if args.video_id is not None:
        query += " WHERE id = ?"
        params = (args.video_id,)

    rows = conn.execute(query, params).fetchall()
    results: list[BackfillRowResult] = []

    for row in rows:
        result = backfill_video(row, apply_changes=not args.dry_run)
        results.append(result)
        if not args.dry_run:
            update_row(conn, row, result)

    if not args.dry_run:
        conn.commit()
    conn.close()

    summary = {
        "status": "success",
        "processed": len(results),
        "ready_count": sum(1 for r in results if r.ready),
        "error_count": sum(1 for r in results if r.error),
        "results": [asdict(result) for result in results],
    }

    if args.json:
        print(json.dumps(summary))
    else:
        print(json.dumps(summary, indent=2))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
