#!/usr/bin/env python3
"""
Batch-process a local folder of videos into lesson-ready playlist entries.

Supported workflows per video:
1. Generate transcript + frames + manifest into data/local-videos/<folder_id>/
2. Optionally clean audio with ElevenLabs and mux a streamable cleaned MP4
3. Generate embeddings, lesson, and shorts artifacts
4. Upsert the processed_local_videos row as published/ready
5. Add the video to the requested playlist

This supports two publish strategies:
- ``cleaned``: require completed ElevenLabs cleanup and publish ``video.cleaned.mp4``
- ``original``: publish the original source file now, while still generating
  library artifacts so the watch page works and a later cleanup pass can swap in
  denoised media without changing the library IDs.
"""

from __future__ import annotations

import argparse
import getpass
import json
import os
import sqlite3
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any


SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
DATA_DIR = PROJECT_ROOT / "data"
LOCAL_VIDEOS_DIR = DATA_DIR / "local-videos"
DB_PATH = DATA_DIR / "builder.db"

sys.path.insert(0, str(SCRIPT_DIR))
from process_local_mp4 import compute_file_hash, process_local_mp4  # noqa: E402


REQUIRED_ARTIFACTS = (
    "manifest.json",
    "transcript.txt",
    "transcript_timed.json",
    "lesson.json",
    "shorts_brief.json",
    "storyboard.md",
    "embeddings.faiss",
    "embeddings.fine.faiss",
)

BASE_LIBRARY_ARTIFACTS = (
    "manifest.json",
    "transcript.txt",
    "transcript_timed.json",
)


@dataclass
class ProcessedVideoRow:
    id: int
    filename: str
    file_path: str
    file_hash: str | None
    folder_id: str | None
    processing_status: str
    is_published: int | None
    transcript_method: str | None


@dataclass
class ArtifactSummary:
    duration_sec: int
    frame_count: int
    transcript_path: Path
    transcript_method: str


def slugify(value: str) -> str:
    return (
        value.lower()
        .replace("&", " and ")
        .replace("/", " ")
        .replace("\\", " ")
        .replace(".", " ")
        .replace("-", " ")
        .replace("_", " ")
        .strip()
    )


def filename_slug(filename: str) -> str:
    stem = Path(filename).stem
    slug = "".join(ch if ch.isalnum() else "_" for ch in slugify(stem))
    slug = "_".join(part for part in slug.split("_") if part)
    return slug[:50] or "video"


def clean_title(filename: str) -> str:
    return " ".join(part for part in slugify(Path(filename).stem).split() if part).title()


def ensure_db_tables(conn: sqlite3.Connection) -> None:
    migration_010 = DATA_DIR / "migrations" / "010_add_admin_tables.sql"
    if migration_010.exists():
        conn.executescript(migration_010.read_text(encoding="utf-8"))

    migration_040 = DATA_DIR / "migrations" / "040_add_video_organization.sql"
    if migration_040.exists():
        sql = migration_040.read_text(encoding="utf-8")
        for statement in [s.strip() for s in sql.split(";") if s.strip()]:
            try:
                conn.execute(statement)
            except sqlite3.OperationalError as exc:
                msg = str(exc)
                if "duplicate column" not in msg and "already exists" not in msg:
                    raise

    migration_041 = DATA_DIR / "migrations" / "041_add_video_lesson_readiness.sql"
    if migration_041.exists():
        sql = migration_041.read_text(encoding="utf-8")
        for statement in [s.strip() for s in sql.split(";") if s.strip()]:
            try:
                conn.execute(statement)
            except sqlite3.OperationalError as exc:
                msg = str(exc)
                if "duplicate column" not in msg and "already exists" not in msg:
                    raise

    conn.commit()


def connect_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    ensure_db_tables(conn)
    return conn


def fetch_video_by_hash(conn: sqlite3.Connection, file_hash: str) -> ProcessedVideoRow | None:
    row = conn.execute(
        """
        SELECT id, filename, file_path, file_hash, folder_id,
               processing_status, is_published, transcript_method
        FROM processed_local_videos
        WHERE file_hash = ?
        """,
        (file_hash,),
    ).fetchone()
    return ProcessedVideoRow(**dict(row)) if row else None


def find_existing_folder_for_hash(file_hash: str) -> str | None:
    suffix = f"_{file_hash[:8]}"
    for path in LOCAL_VIDEOS_DIR.iterdir():
        if path.is_dir() and path.name.endswith(suffix):
            return path.name
    return None


def compute_folder_id(filename: str, file_hash: str, existing: ProcessedVideoRow | None) -> str:
    if existing and existing.folder_id:
        return existing.folder_id
    existing_folder = find_existing_folder_for_hash(file_hash)
    if existing_folder:
        return existing_folder
    return f"{filename_slug(filename)}_{file_hash[:8]}"


def playlist_slug(name: str) -> str:
    slug = "".join(ch if ch.isalnum() else "-" for ch in name.lower().strip())
    slug = "-".join(part for part in slug.split("-") if part)
    return slug or "playlist"


def ensure_playlist(conn: sqlite3.Connection, name: str, description: str | None) -> int:
    slug = playlist_slug(name)
    row = conn.execute(
        "SELECT id FROM video_playlists WHERE slug = ?",
        (slug,),
    ).fetchone()
    if row:
        conn.execute(
            "UPDATE video_playlists SET name = ?, description = COALESCE(?, description), is_published = 1 WHERE id = ?",
            (name, description, row["id"]),
        )
        conn.commit()
        return int(row["id"])

    max_order = conn.execute("SELECT COALESCE(MAX(display_order), -1) AS max_order FROM video_playlists").fetchone()
    display_order = int(max_order["max_order"]) + 1
    cursor = conn.execute(
        """
        INSERT INTO video_playlists (name, slug, description, is_published, display_order)
        VALUES (?, ?, ?, 1, ?)
        """,
        (name, slug, description, display_order),
    )
    conn.commit()
    return int(cursor.lastrowid)


def ensure_playlist_item(conn: sqlite3.Connection, playlist_id: int, video_id: int) -> None:
    existing = conn.execute(
        "SELECT id FROM playlist_items WHERE playlist_id = ? AND video_id = ?",
        (playlist_id, video_id),
    ).fetchone()
    if existing:
        return
    max_pos = conn.execute(
        "SELECT COALESCE(MAX(position), -1) AS max_pos FROM playlist_items WHERE playlist_id = ?",
        (playlist_id,),
    ).fetchone()
    position = int(max_pos["max_pos"]) + 1
    conn.execute(
        "INSERT INTO playlist_items (playlist_id, video_id, position) VALUES (?, ?, ?)",
        (playlist_id, video_id, position),
    )
    conn.commit()


def row_is_clean_ready(row: ProcessedVideoRow | None, output_dir: Path) -> bool:
    if not row:
        return False
    if row.processing_status != "ready" or int(row.is_published or 0) != 1:
        return False
    if row.transcript_method != "elevenlabs":
        return False
    cleaned_mp4 = output_dir / "video.cleaned.mp4"
    cleaned_wav = output_dir / "audio.cleaned.wav"
    if not cleaned_mp4.exists() or not cleaned_wav.exists():
        return False
    return all((output_dir / artifact).exists() for artifact in REQUIRED_ARTIFACTS)


def row_is_original_ready(row: ProcessedVideoRow | None, output_dir: Path, source_video: Path) -> bool:
    if not row:
        return False
    if row.processing_status != "ready" or int(row.is_published or 0) != 1:
        return False
    published_path = Path(row.file_path)
    if published_path != source_video and not published_path.exists():
        return False
    return has_base_library_artifacts(output_dir)


def has_frame_jpegs(output_dir: Path) -> bool:
    frames_dir = output_dir / "frames"
    if not frames_dir.exists():
        return False
    return any(frame.suffix.lower() == ".jpg" for frame in frames_dir.iterdir() if frame.is_file())


def has_base_library_artifacts(output_dir: Path) -> bool:
    return (
        all((output_dir / artifact).exists() for artifact in BASE_LIBRARY_ARTIFACTS)
        and has_frame_jpegs(output_dir)
    )


def load_artifact_summary(output_dir: Path, transcript_method: str | None) -> ArtifactSummary:
    manifest = json.loads((output_dir / "manifest.json").read_text(encoding="utf-8"))
    transcript_path = output_dir / "transcript.txt"
    return ArtifactSummary(
        duration_sec=int(manifest.get("video_duration_sec") or 0),
        frame_count=int(manifest.get("frame_count") or 0),
        transcript_path=transcript_path,
        transcript_method=transcript_method or "unknown",
    )


def run_json_script(script_name: str, video_dir: Path) -> dict[str, Any]:
    cmd = [sys.executable, str(SCRIPT_DIR / script_name), "--video-dir", str(video_dir), "--json"]
    completed = subprocess.run(cmd, capture_output=True, text=True, check=False, cwd=str(PROJECT_ROOT))
    if completed.returncode != 0:
        raise RuntimeError(f"{script_name} failed: {completed.stderr.strip() or completed.stdout.strip()}")
    lines = [line.strip() for line in completed.stdout.splitlines() if line.strip().startswith("{")]
    if not lines:
        return {}
    return json.loads(lines[-1])


def run_optional_json_script(script_name: str, video_dir: Path, warnings: list[str]) -> None:
    try:
        run_json_script(script_name, video_dir)
    except Exception as exc:
        warnings.append(f"{script_name}: {exc}")


def mux_cleaned_video(source_video: Path, cleaned_audio: Path, target_video: Path) -> None:
    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        str(source_video),
        "-i",
        str(cleaned_audio),
        "-map",
        "0:v:0",
        "-map",
        "1:a:0",
        "-c:v",
        "copy",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-shortest",
        str(target_video),
    ]
    completed = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if completed.returncode != 0:
        raise RuntimeError(f"ffmpeg mux failed: {completed.stderr.strip()}")


def upsert_video_row(
    conn: sqlite3.Connection,
    existing: ProcessedVideoRow | None,
    *,
    filename: str,
    published_video_path: Path,
    source_hash: str,
    source_file_size: int,
    folder_id: str,
    title: str,
    source_type: str,
    duration_sec: int,
    frame_count: int,
    transcript_path: Path,
    transcript_method: str,
    error_message: str | None = None,
) -> int:
    payload = (
        filename,
        str(published_video_path),
        source_hash,
        source_file_size,
        folder_id,
        duration_sec,
        frame_count,
        transcript_method,
        None,
        str(transcript_path),
        "ready",
        error_message,
        title,
        source_type,
        1,
    )

    if existing:
        conn.execute(
            """
            UPDATE processed_local_videos
            SET filename = ?, file_path = ?, file_hash = ?, file_size_bytes = ?,
                folder_id = ?, duration_sec = ?, frame_count = ?, transcript_method = ?,
                whisper_model = ?, transcript_path = ?, processing_status = ?, error_message = ?,
                title = ?, source_type = ?, is_published = ?, processed_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            payload + (existing.id,),
        )
        conn.commit()
        return existing.id

    cursor = conn.execute(
        """
        INSERT INTO processed_local_videos (
            filename, file_path, file_hash, file_size_bytes, folder_id,
            duration_sec, frame_count, transcript_method, whisper_model,
            transcript_path, processing_status, error_message, title, source_type,
            is_published, created_at, processed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        """,
        payload,
    )
    conn.commit()
    return int(cursor.lastrowid)


def process_one_video(
    conn: sqlite3.Connection,
    playlist_id: int,
    source_video: Path,
    *,
    elevenlabs_key: str | None,
    source_type: str,
    force: bool,
    publish_mode: str,
    transcription_backend: str,
    audio_cleanup_mode: str,
) -> dict[str, Any]:
    file_hash = compute_file_hash(source_video)
    existing = fetch_video_by_hash(conn, file_hash)
    folder_id = compute_folder_id(source_video.name, file_hash, existing)
    output_dir = LOCAL_VIDEOS_DIR / folder_id
    output_dir.mkdir(parents=True, exist_ok=True)
    title = clean_title(source_video.name)

    if not force and row_is_clean_ready(existing, output_dir):
        ensure_playlist_item(conn, playlist_id, existing.id)
        return {
            "video": source_video.name,
            "status": "reused",
            "video_id": existing.id,
            "folder_id": folder_id,
        }

    if not force and publish_mode == "original" and row_is_original_ready(existing, output_dir, source_video):
        ensure_playlist_item(conn, playlist_id, existing.id)
        return {
            "video": source_video.name,
            "status": "reused",
            "video_id": existing.id,
            "folder_id": folder_id,
        }
    result: dict[str, Any] | None = None
    if force or not has_base_library_artifacts(output_dir):
        result = process_local_mp4(
            video_path=source_video,
            output_dir=output_dir,
            frame_interval=45,
            max_frames=30,
            whisper_model="base",
            skip_transcription=False,
            skip_frames=False,
            title=title,
            source_type=source_type,
            check_duplicates=False,
            transcription_backend=transcription_backend,
            elevenlabs_key=elevenlabs_key,
            audio_cleanup_mode=audio_cleanup_mode,
            keyterms=[],
            scene_detect=False,
            scene_threshold=0.3,
            existing_video_id=existing.id if existing else None,
            skip_db_insert=True,
            emit_progress_json=False,
        )

    if not has_base_library_artifacts(output_dir):
        raise RuntimeError(f"Base library artifacts missing for {source_video.name}")

    artifact_summary = load_artifact_summary(
        output_dir,
        transcript_method=(result or {}).get("transcript_method") or (existing.transcript_method if existing else None),
    )
    warnings: list[str] = []

    published_video_path = source_video
    if publish_mode == "cleaned":
        cleaned_audio = output_dir / "audio.cleaned.wav"
        if (result or {}).get("audio_cleanup_status") != "completed" or not cleaned_audio.exists():
            raise RuntimeError(
                f"Audio cleanup did not complete for {source_video.name}: {(result or {}).get('audio_cleanup_status')}"
            )

        cleaned_video = output_dir / "video.cleaned.mp4"
        mux_cleaned_video(source_video, cleaned_audio, cleaned_video)
        published_video_path = cleaned_video

    run_optional_json_script("embed_transcripts.py", output_dir, warnings)
    run_optional_json_script("generate_video_lesson.py", output_dir, warnings)
    run_optional_json_script("generate_shorts_brief.py", output_dir, warnings)

    video_id = upsert_video_row(
        conn,
        existing,
        filename=source_video.name,
        published_video_path=published_video_path,
        source_hash=file_hash,
        source_file_size=source_video.stat().st_size,
        folder_id=folder_id,
        title=title,
        source_type=source_type,
        duration_sec=artifact_summary.duration_sec,
        frame_count=artifact_summary.frame_count,
        transcript_path=artifact_summary.transcript_path,
        transcript_method=artifact_summary.transcript_method,
        error_message=" | ".join(warnings) if warnings else None,
    )
    ensure_playlist_item(conn, playlist_id, video_id)

    return {
        "video": source_video.name,
        "status": "processed",
        "video_id": video_id,
        "folder_id": folder_id,
        "output_dir": str(output_dir),
        "published_video": str(published_video_path),
        "warnings": warnings,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Batch-process a local folder into a TCM playlist")
    parser.add_argument("--folder", type=Path, required=True, help="Folder containing local video files")
    parser.add_argument("--playlist-name", required=True, help="Playlist name to create/update")
    parser.add_argument("--playlist-description", default=None, help="Optional playlist description")
    parser.add_argument("--source-type", default="course", help="processed_local_videos.source_type value")
    parser.add_argument("--elevenlabs-key", default=None, help="ElevenLabs API key (defaults to env / prompt)")
    parser.add_argument("--force", action="store_true", help="Reprocess even if a cleaned ready row already exists")
    parser.add_argument(
        "--publish-mode",
        choices=["cleaned", "original"],
        default="cleaned",
        help="Publish cleaned muxed video or the original source file",
    )
    parser.add_argument(
        "--transcription-backend",
        choices=["whisper", "elevenlabs"],
        default=None,
        help="Override transcription backend used when artifacts need to be generated",
    )
    parser.add_argument(
        "--audio-cleanup-mode",
        choices=["none", "voice_isolator"],
        default=None,
        help="Override audio cleanup mode used when artifacts need to be generated",
    )
    args = parser.parse_args()

    folder = args.folder
    if not folder.exists() or not folder.is_dir():
        print(f"Folder not found: {folder}", file=sys.stderr)
        return 1

    transcription_backend = (
        args.transcription_backend
        or ("elevenlabs" if args.publish_mode == "cleaned" else "whisper")
    )
    audio_cleanup_mode = (
        args.audio_cleanup_mode
        or ("voice_isolator" if args.publish_mode == "cleaned" else "none")
    )

    elevenlabs_key = args.elevenlabs_key or os.environ.get("ELEVENLABS_API_KEY")
    if transcription_backend == "elevenlabs" and not elevenlabs_key:
        elevenlabs_key = getpass.getpass("ElevenLabs API key: ").strip()
    if transcription_backend == "elevenlabs" and not elevenlabs_key:
        print("ElevenLabs API key is required.", file=sys.stderr)
        return 1

    videos = sorted(folder.glob("*.mp4"))
    if not videos:
        print(f"No MP4 files found in {folder}", file=sys.stderr)
        return 1

    conn = connect_db()
    try:
        playlist_id = ensure_playlist(conn, args.playlist_name, args.playlist_description)
        print(json.dumps({
            "event": "playlist_ready",
            "playlist_id": playlist_id,
            "playlist_name": args.playlist_name,
            "count": len(videos),
        }), flush=True)

        processed: list[dict[str, Any]] = []
        failed: list[dict[str, Any]] = []

        for index, video in enumerate(videos, start=1):
            print(json.dumps({
                "event": "video_start",
                "index": index,
                "total": len(videos),
                "video": video.name,
            }), flush=True)
            try:
                item = process_one_video(
                    conn,
                    playlist_id,
                    video,
                    elevenlabs_key=elevenlabs_key,
                    source_type=args.source_type,
                    force=args.force,
                    publish_mode=args.publish_mode,
                    transcription_backend=transcription_backend,
                    audio_cleanup_mode=audio_cleanup_mode,
                )
                processed.append(item)
                print(json.dumps({"event": "video_done", **item}), flush=True)
            except Exception as exc:
                failure = {
                    "video": video.name,
                    "status": "failed",
                    "error": str(exc),
                }
                failed.append(failure)
                print(json.dumps({"event": "video_failed", **failure}), flush=True)

        print(json.dumps({
            "event": "summary",
            "playlist_id": playlist_id,
            "playlist_name": args.playlist_name,
            "processed_count": len(processed),
            "failed_count": len(failed),
            "processed": processed,
            "failed": failed,
        }), flush=True)
        return 0 if not failed else 2
    finally:
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main())
