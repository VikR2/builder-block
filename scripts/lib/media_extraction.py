"""
Media extraction utilities for video processing workflows.

Provides:
- Executable detection (ffmpeg, ffprobe, yt-dlp)
- Video frame extraction via ffmpeg
- Audio transcription via faster-whisper
- Video duration detection
"""

import json
import shutil
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Optional

# Try importing faster-whisper (optional dependency)
try:
    from faster_whisper import WhisperModel
    WHISPER_AVAILABLE = True
except ImportError:
    WHISPER_AVAILABLE = False


def find_executable(name: str) -> str:
    """
    Find executable, checking common Windows install locations.

    Args:
        name: Executable name (e.g., 'ffmpeg', 'ffprobe', 'yt-dlp')

    Returns:
        Path to executable or just the name if in PATH

    Raises:
        FileNotFoundError: If executable cannot be found
    """
    # Check if already in PATH
    if shutil.which(name):
        return name

    # Common Windows installation paths for ffmpeg
    if name in ("ffmpeg", "ffprobe"):
        winget_ffmpeg = Path.home() / "AppData/Local/Microsoft/WinGet/Packages"
        if winget_ffmpeg.exists():
            for pkg_dir in winget_ffmpeg.glob("Gyan.FFmpeg*"):
                for bin_dir in pkg_dir.glob("*/bin"):
                    exe_path = bin_dir / f"{name}.exe"
                    if exe_path.exists():
                        return str(exe_path)

        # Check chocolatey
        choco_path = Path("C:/ProgramData/chocolatey/bin") / f"{name}.exe"
        if choco_path.exists():
            return str(choco_path)

    # Fallback to name (will fail with clear error if not found)
    return name


def get_video_duration(video_path: Path) -> float:
    """
    Get video duration in seconds using ffprobe.

    Args:
        video_path: Path to video file

    Returns:
        Duration in seconds
    """
    ffprobe_exe = find_executable("ffprobe")

    probe_cmd = [
        ffprobe_exe,
        "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        str(video_path),
    ]

    result = subprocess.run(probe_cmd, capture_output=True, text=True)
    if result.returncode == 0:
        return float(result.stdout.strip())
    return 0.0


def extract_video_frames(
    video_path: Path,
    output_dir: Path,
    frame_interval: int = 45,
    max_frames: int = 15,
    delete_video: bool = False,
) -> list[Path]:
    """
    Extract frames from a video file using ffmpeg.

    Args:
        video_path: Path to video file (MP4, etc.)
        output_dir: Directory to save extracted frames
        frame_interval: Seconds between frames (default: 45)
        max_frames: Maximum frames to extract (default: 15)
        delete_video: Delete video file after extraction (default: False)

    Returns:
        List of paths to extracted frame files

    Raises:
        RuntimeError: If ffmpeg fails
        FileNotFoundError: If video file doesn't exist
    """
    if not video_path.exists():
        raise FileNotFoundError(f"Video file not found: {video_path}")

    ffmpeg_exe = find_executable("ffmpeg")

    # Create output directory
    frames_subdir = output_dir / "frames"
    frames_subdir.mkdir(parents=True, exist_ok=True)

    # Get video duration
    duration_seconds = get_video_duration(video_path)

    # Adjust interval if we'd get too many frames
    if duration_seconds > 0:
        potential_frames = int(duration_seconds / frame_interval)
        if potential_frames > max_frames:
            frame_interval = int(duration_seconds / max_frames)
            print(f"  Adjusted interval to {frame_interval}s for {max_frames} frames")

    # Extract frames with ffmpeg
    print(f"  Extracting frames at {frame_interval}s intervals...")
    extract_cmd = [
        ffmpeg_exe,
        "-i", str(video_path),
        "-vf", f"fps=1/{frame_interval}",
        "-q:v", "2",  # High quality JPEG
        "-y",  # Overwrite existing
        str(frames_subdir / "frame_%03d.jpg"),
    ]

    result = subprocess.run(
        extract_cmd,
        capture_output=True,
        text=True,
        timeout=300,  # 5 minute timeout
    )

    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg failed: {result.stderr}")

    # Delete video if requested
    if delete_video:
        video_path.unlink(missing_ok=True)

    # Return sorted list of frame files
    frame_files = sorted(frames_subdir.glob("frame_*.jpg"))
    print(f"  Extracted {len(frame_files)} frames")

    return frame_files


def extract_audio(
    video_path: Path,
    output_path: Optional[Path] = None,
) -> Path:
    """
    Extract audio track from video file.

    Args:
        video_path: Path to video file
        output_path: Path for audio output (default: same dir as video, .wav)

    Returns:
        Path to extracted audio file
    """
    ffmpeg_exe = find_executable("ffmpeg")

    if output_path is None:
        output_path = video_path.with_suffix(".wav")

    extract_cmd = [
        ffmpeg_exe,
        "-i", str(video_path),
        "-vn",  # No video
        "-acodec", "pcm_s16le",  # PCM format for Whisper
        "-ar", "16000",  # 16kHz sample rate (Whisper optimal)
        "-ac", "1",  # Mono
        "-y",  # Overwrite
        str(output_path),
    ]

    result = subprocess.run(
        extract_cmd,
        capture_output=True,
        text=True,
        timeout=300,
    )

    if result.returncode != 0:
        raise RuntimeError(f"Audio extraction failed: {result.stderr}")

    return output_path


def transcribe_with_whisper(
    audio_path: Path,
    model_size: str = "base",
    language: str = "en",
    device: str = "cpu",
    compute_type: str = "int8",
) -> dict:
    """
    Transcribe audio file using faster-whisper.

    Args:
        audio_path: Path to audio file (WAV recommended)
        model_size: Whisper model size (tiny, base, small, medium, large)
        language: Language code (default: "en")
        device: Device to use ("cpu" or "cuda")
        compute_type: Compute type ("int8", "float16", "float32")

    Returns:
        Dictionary with transcript and timed segments

    Raises:
        ImportError: If faster-whisper is not installed
        RuntimeError: If transcription fails
    """
    if not WHISPER_AVAILABLE:
        raise ImportError(
            "faster-whisper is not installed. "
            "Install with: pip install faster-whisper"
        )

    if not audio_path.exists():
        raise FileNotFoundError(f"Audio file not found: {audio_path}")

    print(f"  Loading Whisper model ({model_size})...")
    model = WhisperModel(model_size, device=device, compute_type=compute_type)

    print(f"  Transcribing audio...")
    segments, info = model.transcribe(
        str(audio_path),
        language=language,
        beam_size=5,
        vad_filter=True,  # Filter out non-speech
    )

    # Convert generator to list and build output
    timed_segments = []
    full_transcript_parts = []

    for segment in segments:
        timed_segments.append({
            "start": segment.start,
            "end": segment.end,
            "text": segment.text.strip(),
        })
        full_transcript_parts.append(segment.text.strip())

    full_transcript = " ".join(full_transcript_parts)

    print(f"  Transcribed {len(timed_segments)} segments ({len(full_transcript)} chars)")

    return {
        "transcript": full_transcript,
        "timed_segments": timed_segments,
        "duration_seconds": info.duration,
        "language": info.language,
        "language_probability": info.language_probability,
        "model_size": model_size,
        "transcribed_at": datetime.now().isoformat(),
    }


def transcribe_video(
    video_path: Path,
    output_dir: Path,
    model_size: str = "base",
    keep_audio: bool = False,
) -> dict:
    """
    Extract audio from video and transcribe with Whisper.

    Convenience function combining extract_audio and transcribe_with_whisper.

    Args:
        video_path: Path to video file
        output_dir: Directory for temporary/output files
        model_size: Whisper model size
        keep_audio: Keep extracted audio file (default: False)

    Returns:
        Transcript data dictionary
    """
    # Extract audio
    audio_path = output_dir / "audio.wav"
    print(f"  Extracting audio from video...")
    extract_audio(video_path, audio_path)

    # Transcribe
    transcript_data = transcribe_with_whisper(audio_path, model_size=model_size)

    # Clean up audio if not keeping
    if not keep_audio:
        audio_path.unlink(missing_ok=True)

    return transcript_data
