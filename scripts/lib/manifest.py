"""
Manifest utilities for video/media processing workflows.

Provides:
- Manifest creation for frame-transcript pairing
- Manifest loading and validation
- Transcript window extraction
"""

import json
from datetime import datetime
from pathlib import Path
from typing import Optional


def extract_transcript_window(
    transcript: str,
    timestamp_sec: float,
    window_seconds: float,
) -> str:
    """
    Extract a portion of transcript around a timestamp.

    Since we may not have precise word-level timestamps, we estimate based on
    total length and duration. This is approximate but useful for context.

    Args:
        transcript: Full transcript text
        timestamp_sec: Target timestamp in seconds
        window_seconds: Window size in seconds

    Returns:
        Transcript segment text
    """
    if not transcript:
        return ""

    # Rough estimation: assume ~150 words per minute spoken
    # Average word length ~5 chars + space = 6 chars per word
    # So ~900 chars per minute, or 15 chars per second
    chars_per_second = 15

    start_char = max(0, int((timestamp_sec - window_seconds / 2) * chars_per_second))
    end_char = min(len(transcript), int((timestamp_sec + window_seconds / 2) * chars_per_second))

    segment = transcript[start_char:end_char].strip()

    # Try to start/end at word boundaries
    if start_char > 0:
        # Find next space and start after it
        space_idx = segment.find(" ")
        if space_idx != -1 and space_idx < 50:
            segment = segment[space_idx + 1:]

    if end_char < len(transcript):
        # Find last space and end before it
        space_idx = segment.rfind(" ")
        if space_idx != -1 and len(segment) - space_idx < 50:
            segment = segment[:space_idx]

    return segment


def extract_transcript_at_time(
    timed_segments: list[dict],
    timestamp_sec: float,
    window_seconds: float = 30,
) -> str:
    """
    Extract transcript text from timed segments around a timestamp.

    Unlike extract_transcript_window, this uses actual segment timing data
    from Whisper or similar transcription services.

    Args:
        timed_segments: List of {start, end, text} segment dicts
        timestamp_sec: Target timestamp in seconds
        window_seconds: Window size in seconds (default: 30)

    Returns:
        Combined transcript text from matching segments
    """
    if not timed_segments:
        return ""

    window_start = timestamp_sec - window_seconds / 2
    window_end = timestamp_sec + window_seconds / 2

    matching_texts = []
    for seg in timed_segments:
        seg_start = seg.get("start", 0)
        seg_end = seg.get("end", 0)

        # Check if segment overlaps with window
        if seg_end >= window_start and seg_start <= window_end:
            matching_texts.append(seg.get("text", ""))

    return " ".join(matching_texts)


def create_manifest(
    output_dir: Path,
    source_id: str,
    source_url: str,
    source_title: str,
    source_type: str,  # "youtube", "local_mp4", "pinescript"
    transcript_data: dict,
    frame_files: list[Path],
    frame_interval: int,
    duration_seconds: float,
    extra_metadata: Optional[dict] = None,
) -> dict:
    """
    Create manifest.json pairing frames with transcript segments.

    Args:
        output_dir: Directory containing frames
        source_id: Unique identifier (video_id, file hash, etc.)
        source_url: URL or file path
        source_title: Human-readable title
        source_type: Type of source ("youtube", "local_mp4", "pinescript")
        transcript_data: Dict with "transcript" and optionally "timed_segments"
        frame_files: List of frame file paths
        frame_interval: Seconds between frames
        duration_seconds: Total duration in seconds
        extra_metadata: Additional metadata to include

    Returns:
        Manifest dictionary
    """
    transcript = transcript_data.get("transcript", "")
    timed_segments = transcript_data.get("timed_segments", [])

    # Build frame entries with timestamps and transcript segments
    frames = []
    for i, frame_path in enumerate(frame_files):
        timestamp_sec = i * frame_interval
        timestamp_str = f"{int(timestamp_sec // 60)}:{int(timestamp_sec % 60):02d}"

        # Extract transcript segment around this timestamp
        if timed_segments:
            # Use precise timing if available
            segment_text = extract_transcript_at_time(
                timed_segments,
                timestamp_sec,
                window_seconds=frame_interval,
            )
        else:
            # Fall back to estimation
            segment_text = extract_transcript_window(
                transcript,
                timestamp_sec,
                window_seconds=frame_interval,
            )

        frames.append({
            "file": frame_path.name,
            "timestamp_sec": timestamp_sec,
            "timestamp_str": timestamp_str,
            "transcript_segment": segment_text,
        })

    manifest = {
        "source_id": source_id,
        "source_url": source_url,
        "source_title": source_title,
        "source_type": source_type,
        "extracted_at": datetime.now().isoformat(),
        "frame_interval_sec": frame_interval,
        "frame_count": len(frames),
        "video_duration_sec": duration_seconds,
        "frames": frames,
        "full_transcript": transcript,
    }

    # Add timed segments if available
    if timed_segments:
        manifest["timed_segments"] = timed_segments

    # Add extra metadata
    if extra_metadata:
        manifest.update(extra_metadata)

    return manifest


def save_manifest(manifest: dict, output_dir: Path) -> Path:
    """
    Save manifest to JSON file.

    Args:
        manifest: Manifest dictionary
        output_dir: Directory to save manifest.json

    Returns:
        Path to saved manifest file
    """
    manifest_path = output_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return manifest_path


def load_manifest(manifest_path: Path) -> dict:
    """
    Load manifest from JSON file.

    Args:
        manifest_path: Path to manifest.json

    Returns:
        Manifest dictionary

    Raises:
        FileNotFoundError: If manifest file doesn't exist
        json.JSONDecodeError: If manifest is invalid JSON
    """
    if not manifest_path.exists():
        raise FileNotFoundError(f"Manifest not found: {manifest_path}")

    return json.loads(manifest_path.read_text(encoding="utf-8"))


def validate_manifest(manifest: dict) -> list[str]:
    """
    Validate manifest structure and return list of issues.

    Args:
        manifest: Manifest dictionary

    Returns:
        List of validation issue strings (empty if valid)
    """
    issues = []

    required_fields = [
        "source_id",
        "source_type",
        "frames",
        "full_transcript",
    ]

    for field in required_fields:
        if field not in manifest:
            issues.append(f"Missing required field: {field}")

    if "frames" in manifest:
        if not isinstance(manifest["frames"], list):
            issues.append("'frames' must be a list")
        elif len(manifest["frames"]) == 0:
            issues.append("'frames' list is empty")
        else:
            # Check first frame has required fields
            frame = manifest["frames"][0]
            frame_fields = ["file", "timestamp_sec"]
            for field in frame_fields:
                if field not in frame:
                    issues.append(f"Frame missing required field: {field}")

    return issues
