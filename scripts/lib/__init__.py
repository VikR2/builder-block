"""
Shared library for media extraction and processing workflows.

This package provides common utilities used by the TCM video pipeline
(process_local_mp4.py, embed_transcripts.py and the FAISS search worker).
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
