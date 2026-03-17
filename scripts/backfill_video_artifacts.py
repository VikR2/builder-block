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


@dataclass
class BackfillRowResult:
    video_id: int
    folder_id: str | None
    transcript: bool
    frames: bool
    manifest: bool
    embeddings: bool
    lesson: bool
    shorts_brief: bool
    ready: bool
    updated: bool
    actions: list[str]
    error: str | None = None


def infer_folder_id(file_path: str | None) -> str | None:
    if not file_path:
        return None
    try:
        parent = Path(file_path).resolve().parent
    except OSError:
        return None

    try:
        if parent.parent == LOCAL_VIDEOS_PATH.resolve():
            return parent.name
    except OSError:
        return None

    return None


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


def artifact_status(video_dir: Path) -> dict[str, bool]:
    transcript = (video_dir / "transcript_timed.json").exists()
    manifest = (video_dir / "manifest.json").exists()
    embeddings = (video_dir / "embeddings.faiss").exists() and (video_dir / "segments.json").exists()
    lesson = (video_dir / "lesson.json").exists()
    shorts_brief = (video_dir / "shorts_brief.json").exists()
    frames = has_frames(video_dir)
    ready = transcript and manifest and frames and embeddings and lesson
    return {
        "transcript": transcript,
        "manifest": manifest,
        "frames": frames,
        "embeddings": embeddings,
        "lesson": lesson,
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


def backfill_video(row: sqlite3.Row, *, apply_changes: bool) -> BackfillRowResult:
    video_id = int(row["id"])
    actions: list[str] = []
    updated = False

    folder_id = row["folder_id"] or infer_folder_id(row["file_path"])
    if folder_id and folder_id != row["folder_id"]:
        actions.append("filled-folder-id")
        updated = True

    video_dir = LOCAL_VIDEOS_PATH / folder_id if folder_id else None
    if not video_dir or not video_dir.exists():
        return BackfillRowResult(
            video_id=video_id,
            folder_id=folder_id,
            transcript=False,
            frames=False,
            manifest=False,
            embeddings=False,
            lesson=False,
            shorts_brief=False,
            ready=False,
            updated=updated,
            actions=actions,
            error="Video directory missing",
        )

    before = artifact_status(video_dir)

    try:
        if before["transcript"] and not before["embeddings"]:
            actions.append("generated-embeddings")
            if apply_changes:
                run_script(EMBED_SCRIPT, video_dir)

        refreshed = artifact_status(video_dir)

        if refreshed["manifest"] and refreshed["transcript"] and not refreshed["lesson"]:
            actions.append("generated-lesson")
            if apply_changes:
                run_script(LESSON_SCRIPT, video_dir)

        lesson_refreshed = artifact_status(video_dir)

        if lesson_refreshed["lesson"] and not lesson_refreshed["shorts_brief"]:
            actions.append("generated-shorts-brief")
            if apply_changes:
                run_script(SHORTS_BRIEF_SCRIPT, video_dir)

        final_status = artifact_status(video_dir)
    except Exception as exc:
        return BackfillRowResult(
            video_id=video_id,
            folder_id=folder_id,
            transcript=before["transcript"],
            frames=before["frames"],
            manifest=before["manifest"],
            embeddings=before["embeddings"],
            lesson=before["lesson"],
            shorts_brief=before["shorts_brief"],
            ready=before["ready"],
            updated=updated,
            actions=actions,
            error=str(exc),
        )

    return BackfillRowResult(
        video_id=video_id,
        folder_id=folder_id,
        transcript=final_status["transcript"],
        frames=final_status["frames"],
        manifest=final_status["manifest"],
        embeddings=final_status["embeddings"],
        lesson=final_status["lesson"],
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
            processing_status = ?,
            is_published = ?,
            processed_at = ?,
            error_message = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        """,
        (
            result.folder_id,
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
