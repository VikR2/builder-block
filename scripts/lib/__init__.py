"""
Shared library for media extraction and processing workflows.

This package provides common utilities used by:
- generate_from_youtube.py (YouTube → NinjaTrader C#)
- process_local_mp4.py (Local MP4 → Skills + SAD)
- pine_parser.py (Pine Script → Skills + SAD)
"""

from .media_extraction import (
    find_executable,
    extract_video_frames,
    transcribe_with_whisper,
    get_video_duration,
)
from .manifest import (
    create_manifest,
    load_manifest,
    extract_transcript_window,
)

__all__ = [
    # Media extraction
    "find_executable",
    "extract_video_frames",
    "transcribe_with_whisper",
    "get_video_duration",
    # Manifest utilities
    "create_manifest",
    "load_manifest",
    "extract_transcript_window",
]
