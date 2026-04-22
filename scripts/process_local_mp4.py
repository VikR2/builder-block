#!/usr/bin/env python3
"""
Local MP4 Video Processor.

Processes local video files (MP4, etc.) for skill extraction:
1. Extracts audio and transcribes with Whisper
2. Extracts frames at configurable intervals
3. Creates manifest.json compatible with existing pipeline
4. Optionally runs reflective analysis

Usage:
    uv run python scripts/process_local_mp4.py video.mp4
    uv run python scripts/process_local_mp4.py video.mp4 --output-dir data/local-videos/my-video/
    uv run python scripts/process_local_mp4.py video.mp4 --whisper-model small --frame-interval 30
"""

import argparse
import hashlib
import json
import sqlite3
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional

# Import from shared library
sys.path.insert(0, str(Path(__file__).parent))
from lib.media_extraction import (
    find_executable,
    extract_video_frames,
    extract_scene_frames,
    transcribe_video,
    get_video_duration,
    WHISPER_AVAILABLE,
    ELEVENLABS_AVAILABLE,
)
from lib.manifest import create_manifest, save_manifest


# =============================================================================
# Configuration
# =============================================================================

SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent
DB_PATH = PROJECT_ROOT / "data" / "builder.db"
DEFAULT_OUTPUT_DIR = PROJECT_ROOT / "data" / "local-videos"


# =============================================================================
# Database Functions
# =============================================================================

def compute_file_hash(file_path: Path) -> str:
    """Compute SHA256 hash of file for deduplication."""
    sha256 = hashlib.sha256()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            sha256.update(chunk)
    return sha256.hexdigest()


def check_duplicate(db_path: Path, file_hash: str) -> Optional[dict]:
    """Check if file was already processed."""
    if not db_path.exists():
        return None

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    cursor.execute("""
        SELECT * FROM processed_local_videos
        WHERE file_hash = ?
    """, (file_hash,))

    row = cursor.fetchone()
    conn.close()

    if row:
        return dict(row)
    return None


def record_processing(
    db_path: Path,
    filename: str,
    file_path: str,
    file_hash: str,
    file_size: int,
    duration_sec: int,
    frame_count: int,
    transcript_method: str,
    whisper_model: Optional[str],
    transcript_path: Optional[str],
    output_dir: str,
    title: Optional[str] = None,
    source_type: str = "other",
) -> int:
    """Record processed video in database."""
    if not db_path.exists():
        print(f"Warning: Database not found at {db_path}", file=sys.stderr)
        return -1

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    cursor.execute("""
        INSERT INTO processed_local_videos (
            filename, file_path, file_hash, file_size_bytes,
            duration_sec, frame_count, transcript_method, whisper_model,
            transcript_path, processing_status, title, source_type,
            created_at, processed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        filename,
        file_path,
        file_hash,
        file_size,
        duration_sec,
        frame_count,
        transcript_method,
        whisper_model,
        transcript_path,
        "completed",
        title or filename,
        source_type,
        datetime.now().isoformat(),
        datetime.now().isoformat(),
    ))

    video_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return video_id


# =============================================================================
# Main Processing Function
# =============================================================================

def process_local_mp4(
    video_path: Path,
    output_dir: Optional[Path] = None,
    frame_interval: int = 45,
    max_frames: int = 30,
    whisper_model: str = "base",
    skip_transcription: bool = False,
    skip_frames: bool = False,
    title: Optional[str] = None,
    source_type: str = "other",
    check_duplicates: bool = True,
    transcription_backend: str = "whisper",
    elevenlabs_key: Optional[str] = None,
    audio_cleanup_mode: str = "none",
    keyterms: Optional[list[str]] = None,
    scene_detect: bool = False,
    scene_threshold: float = 0.3,
    existing_video_id: Optional[int] = None,
    skip_db_insert: bool = False,
    emit_progress_json: bool = False,
) -> dict:
    """
    Process a local video file for skill extraction.

    Args:
        video_path: Path to video file (MP4, etc.)
        output_dir: Output directory (default: data/local-videos/<filename>/)
        frame_interval: Seconds between frames
        max_frames: Maximum frames to extract
        whisper_model: Whisper model size (tiny, base, small, medium, large)
        skip_transcription: Skip audio transcription
        skip_frames: Skip frame extraction
        title: Human-readable title
        source_type: Type of source (webinar, screen_recording, course, other)
        check_duplicates: Check for duplicate files

    Returns:
        Processing result dictionary
    """
    def emit_progress(step: str, progress: int, message: str, **extra):
        payload = {
            "event": "progress",
            "step": step,
            "progress": progress,
            "message": message,
        }
        payload.update(extra)
        if emit_progress_json:
            print(json.dumps(payload), flush=True)
        else:
            print(message, flush=True)

    # Validate input
    if not video_path.exists():
        raise FileNotFoundError(f"Video file not found: {video_path}")

    # Compute file hash for deduplication
    emit_progress("extracting", 5, "Computing file hash...")
    file_hash = compute_file_hash(video_path)
    file_size = video_path.stat().st_size

    # Check for duplicates
    if check_duplicates:
        existing = check_duplicate(DB_PATH, file_hash)
        if existing:
            return {
                "status": "duplicate",
                "existing_id": existing["id"],
                "existing_path": existing.get("file_path")
            }

    # Determine output directory
    if output_dir is None:
        safe_name = video_path.stem.replace(" ", "_")
        output_dir = DEFAULT_OUTPUT_DIR / f"{safe_name}_{file_hash[:8]}"

    output_dir.mkdir(parents=True, exist_ok=True)

    if not emit_progress_json:
        print(f"Processing: {video_path.name}")
        print(f"Output dir: {output_dir}")

    result = {
        "status": "success",
        "video_path": str(video_path),
        "output_dir": str(output_dir),
        "file_hash": file_hash,
        "file_size": file_size,
        "existing_video_id": existing_video_id,
    }

    # Get video duration
    duration_sec = int(get_video_duration(video_path))
    result["duration_sec"] = duration_sec
    if not emit_progress_json:
        print(f"Duration: {duration_sec // 60}m {duration_sec % 60}s")

    # Step 1: Transcription
    transcript_data = {}
    if not skip_transcription:
        emit_progress("extracting", 15, "Transcribing audio...")
        if transcription_backend == "elevenlabs":
            if not emit_progress_json:
                print(f"\n[1/3] Transcribing with ElevenLabs Scribe v2...")
            try:
                transcript_data = transcribe_video(
                    video_path,
                    output_dir,
                    backend="elevenlabs",
                    elevenlabs_key=elevenlabs_key,
                    audio_cleanup_mode=audio_cleanup_mode,
                    keyterms=keyterms,
                )
                result["transcript_method"] = "elevenlabs"
                result["model"] = transcript_data.get("model_size", "scribe_v2")
                result["audio_cleanup_mode"] = audio_cleanup_mode
                result["audio_cleanup_status"] = transcript_data.get("audio_cleanup_status")
                result["cleaned_audio_path"] = transcript_data.get("cleaned_audio_path")
            except Exception as e:
                if not emit_progress_json:
                    print(f"Warning: ElevenLabs transcription failed: {e}")
                transcript_data = {"transcript": "", "timed_segments": []}
                result["transcript_method"] = "failed"
                result["transcript_error"] = str(e)
        elif not WHISPER_AVAILABLE:
            if not emit_progress_json:
                print("Warning: faster-whisper not installed. Skipping transcription.")
                print("  Install with: pip install faster-whisper")
            transcript_data = {"transcript": "", "timed_segments": []}
            result["transcript_method"] = "none"
        else:
            if not emit_progress_json:
                print(f"\n[1/3] Transcribing with Whisper ({whisper_model})...")
            try:
                transcript_data = transcribe_video(
                    video_path,
                    output_dir,
                    model_size=whisper_model,
                    keep_audio=False,
                )
                result["transcript_method"] = "whisper"
                result["whisper_model"] = whisper_model
            except Exception as e:
                if not emit_progress_json:
                    print(f"Warning: Transcription failed: {e}")
                transcript_data = {"transcript": "", "timed_segments": []}
                result["transcript_method"] = "failed"
                result["transcript_error"] = str(e)

        # Save transcript outputs (shared by all backends)
        if transcript_data.get("transcript"):
            transcript_path = output_dir / "transcript.txt"
            transcript_path.write_text(
                transcript_data["transcript"],
                encoding="utf-8"
            )
            result["transcript_path"] = str(transcript_path)

            timed_path = output_dir / "transcript_timed.json"
            timed_path.write_text(
                json.dumps(transcript_data.get("timed_segments", []), indent=2),
                encoding="utf-8"
            )
            if not emit_progress_json:
                print(f"  Transcript saved: {transcript_path}")
    else:
        if not emit_progress_json:
            print("\n[1/3] Skipping transcription (--skip-transcription)")
        transcript_data = {"transcript": "", "timed_segments": []}
        result["transcript_method"] = "skipped"

    # Step 2: Frame extraction
    frame_files = []
    if not skip_frames:
        emit_progress("extracting", 45, "Extracting frames...")
        if scene_detect:
            if not emit_progress_json:
                print(f"\n[2/3] Extracting frames (scene-detection, threshold={scene_threshold})...")
            try:
                frame_files = extract_scene_frames(
                    video_path,
                    output_dir,
                    scene_threshold=scene_threshold,
                    also_interval=frame_interval if frame_interval > 0 else None,
                )
                result["frame_count"] = len(frame_files)
                result["frame_method"] = "scene_detect"
            except Exception as e:
                if not emit_progress_json:
                    print(f"Warning: Scene-detection frame extraction failed: {e}")
                result["frame_extraction_error"] = str(e)
        else:
            if not emit_progress_json:
                print(f"\n[2/3] Extracting frames (interval: {frame_interval}s, max: {max_frames})...")
            try:
                frame_files = extract_video_frames(
                    video_path,
                    output_dir,
                    frame_interval=frame_interval,
                    max_frames=max_frames,
                    delete_video=False
                )
                result["frame_count"] = len(frame_files)
                result["frame_method"] = "fixed_interval"
            except Exception as e:
                if not emit_progress_json:
                    print(f"Warning: Frame extraction failed: {e}")
                result["frame_extraction_error"] = str(e)
    else:
        if not emit_progress_json:
            print("\n[2/3] Skipping frame extraction (--skip-frames)")
        result["frame_count"] = 0

    # Step 3: Create manifest
    emit_progress("extracting", 80, "Creating manifest...")
    if not emit_progress_json:
        print(f"\n[3/3] Creating manifest...")

    # Generate source ID from hash
    source_id = f"local_{file_hash[:12]}"

    manifest = create_manifest(
        output_dir=output_dir,
        source_id=source_id,
        source_url=f"file://{video_path.absolute()}",
        source_title=title or video_path.stem,
        source_type="local_mp4",
        transcript_data=transcript_data,
        frame_files=frame_files,
        frame_interval=frame_interval,
        duration_seconds=duration_sec,
        extra_metadata={
            "file_hash": file_hash,
            "file_size_bytes": file_size,
            "whisper_model": whisper_model if not skip_transcription else None,
            "source_subtype": source_type,
        }
    )

    manifest_path = save_manifest(manifest, output_dir)
    result["manifest_path"] = str(manifest_path)
    if not emit_progress_json:
        print(f"  Manifest saved: {manifest_path}")

    # Record in database
    if not skip_db_insert:
        try:
            video_id = record_processing(
                db_path=DB_PATH,
                filename=video_path.name,
                file_path=str(video_path.absolute()),
                file_hash=file_hash,
                file_size=file_size,
                duration_sec=duration_sec,
                frame_count=len(frame_files),
                transcript_method=result.get("transcript_method", "none"),
                whisper_model=whisper_model if not skip_transcription else None,
                transcript_path=result.get("transcript_path"),
                output_dir=str(output_dir),
                title=title,
                source_type=source_type,
            )
            result["database_id"] = video_id
            if not emit_progress_json:
                print(f"  Recorded in database (ID: {video_id})")
        except Exception as e:
            if not emit_progress_json:
                print(f"Warning: Database recording failed: {e}")
            result["database_error"] = str(e)

    emit_progress("extracting", 90, "Extraction artifacts created.")

    if not emit_progress_json:
        print(f"\n[OK] Processing complete!")
        print(f"  Output: {output_dir}")

    return result


# =============================================================================
# Main Entry Point
# =============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="Process local video files for skill extraction"
    )
    parser.add_argument(
        "video_file",
        type=Path,
        help="Path to video file (MP4, etc.)"
    )
    parser.add_argument(
        "--output-dir", "-o",
        type=Path,
        help="Output directory (default: data/local-videos/<filename>/)"
    )
    parser.add_argument(
        "--frame-interval", "-f",
        type=int,
        default=45,
        help="Seconds between extracted frames (default: 45)"
    )
    parser.add_argument(
        "--max-frames",
        type=int,
        default=30,
        help="Maximum frames to extract (default: 30)"
    )
    parser.add_argument(
        "--whisper-model", "-w",
        choices=["tiny", "base", "small", "medium", "large"],
        default="base",
        help="Whisper model size (default: base)"
    )
    parser.add_argument(
        "--skip-transcription",
        action="store_true",
        help="Skip audio transcription"
    )
    parser.add_argument(
        "--skip-frames",
        action="store_true",
        help="Skip frame extraction"
    )
    parser.add_argument(
        "--title", "-t",
        help="Human-readable title for the video"
    )
    parser.add_argument(
        "--source-type", "-s",
        choices=["webinar", "screen_recording", "course", "other"],
        default="other",
        help="Type of video source"
    )
    parser.add_argument(
        "--transcription-backend",
        choices=["whisper", "elevenlabs"],
        default="whisper",
        help="Transcription backend (default: whisper)"
    )
    parser.add_argument(
        "--elevenlabs-key",
        help="ElevenLabs API key (or set ELEVENLABS_API_KEY env var)"
    )
    parser.add_argument(
        "--audio-cleanup-mode",
        choices=["none", "voice_isolator"],
        default="none",
        help="Optional audio cleanup to run before transcription"
    )
    parser.add_argument(
        "--keyterms-json",
        default="[]",
        help="JSON array of transcription keyterms for ElevenLabs Scribe"
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Process even if file was already processed"
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Output result as JSON"
    )
    parser.add_argument(
        "--scene-detect",
        action="store_true",
        help="Use scene-change detection for frame extraction (ideal for screen recordings)"
    )
    parser.add_argument(
        "--scene-threshold",
        type=float,
        default=0.3,
        help="Scene change sensitivity 0.0-1.0 (default: 0.3, lower=more frames)"
    )
    parser.add_argument(
        "--existing-video-id",
        type=int,
        help="Existing processed_local_videos row to associate with this extraction run"
    )
    parser.add_argument(
        "--skip-duplicate-check",
        action="store_true",
        help="Skip duplicate-file detection (used by admin-managed uploads)"
    )
    parser.add_argument(
        "--skip-db-insert",
        action="store_true",
        help="Do not insert a new processed_local_videos row"
    )
    parser.add_argument(
        "--emit-progress-json",
        action="store_true",
        help="Emit line-delimited JSON progress events during extraction"
    )

    args = parser.parse_args()

    # Validate input
    if not args.video_file.exists():
        print(f"Error: Video file not found: {args.video_file}", file=sys.stderr)
        sys.exit(1)

    # Check dependencies
    try:
        find_executable("ffmpeg")
        find_executable("ffprobe")
    except Exception as e:
        print(f"Error: Required executable not found: {e}", file=sys.stderr)
        print("Please install ffmpeg and ensure it's in PATH.", file=sys.stderr)
        sys.exit(1)

    # Process video
    try:
        try:
            keyterms = json.loads(args.keyterms_json)
            if not isinstance(keyterms, list) or not all(isinstance(item, str) for item in keyterms):
                raise ValueError
        except ValueError as exc:
            raise ValueError("--keyterms-json must be a JSON array of strings") from exc

        result = process_local_mp4(
            video_path=args.video_file,
            output_dir=args.output_dir,
            frame_interval=args.frame_interval,
            max_frames=args.max_frames,
            whisper_model=args.whisper_model,
            skip_transcription=args.skip_transcription,
            skip_frames=args.skip_frames,
            title=args.title,
            source_type=args.source_type,
            check_duplicates=not args.force and not args.skip_duplicate_check,
            transcription_backend=args.transcription_backend,
            elevenlabs_key=args.elevenlabs_key,
            audio_cleanup_mode=args.audio_cleanup_mode,
            keyterms=keyterms,
            scene_detect=args.scene_detect,
            scene_threshold=args.scene_threshold,
            existing_video_id=args.existing_video_id,
            skip_db_insert=args.skip_db_insert,
            emit_progress_json=args.emit_progress_json,
        )

        if args.json or args.emit_progress_json:
            payload = {"event": "result", **result}
            print(json.dumps(payload), flush=True)
        elif result.get("status") == "duplicate":
            print(f"\nFile already processed. Use --force to reprocess.")
            sys.exit(0)

    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        if args.json or args.emit_progress_json:
            print(json.dumps({"event": "result", "status": "error", "error": str(e)}), flush=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
