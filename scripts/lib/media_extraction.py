"""
Media extraction utilities for video processing workflows.

Provides:
- Executable detection (ffmpeg, ffprobe, yt-dlp)
- Video frame extraction via ffmpeg (fixed-interval and scene-detection)
- Audio transcription via faster-whisper or ElevenLabs Scribe v2
- Video duration detection
"""

import json
import os
import shutil
import subprocess
import wave
from datetime import datetime
from pathlib import Path
from typing import Optional

# Try importing faster-whisper (optional dependency)
try:
    from faster_whisper import WhisperModel
    WHISPER_AVAILABLE = True
except ImportError:
    WHISPER_AVAILABLE = False

# Try importing elevenlabs (optional dependency)
try:
    from elevenlabs.client import ElevenLabs
    ELEVENLABS_AVAILABLE = True
except ImportError:
    ELEVENLABS_AVAILABLE = False


ELEVENLABS_AUDIO_ISOLATION_MAX_DURATION_SECONDS = 3500


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


def convert_audio_to_wav(
    input_path: Path,
    output_path: Path,
    sample_rate: int = 16000,
    channels: int = 1,
) -> Path:
    """
    Normalize an encoded audio file to PCM WAV.

    Args:
        input_path: Source encoded audio file
        output_path: Target WAV file path
        sample_rate: Target sample rate
        channels: Target channel count

    Returns:
        Path to normalized WAV file
    """
    ffmpeg_exe = find_executable("ffmpeg")
    convert_cmd = [
        ffmpeg_exe,
        "-y",
        "-i", str(input_path),
        "-acodec", "pcm_s16le",
        "-ar", str(sample_rate),
        "-ac", str(channels),
        str(output_path),
    ]

    result = subprocess.run(
        convert_cmd,
        capture_output=True,
        text=True,
        timeout=600,
    )
    if result.returncode != 0:
        raise RuntimeError(f"Audio conversion failed: {result.stderr}")

    return output_path


def wrap_pcm_file_as_wav(
    input_path: Path,
    output_path: Path,
    sample_rate: int = 16000,
    channels: int = 1,
    sample_width: int = 2,
) -> Path:
    """
    Wrap raw PCM bytes in a WAV container.

    Args:
        input_path: Source PCM file
        output_path: Target WAV file path
        sample_rate: PCM sample rate
        channels: PCM channel count
        sample_width: Bytes per sample

    Returns:
        Path to wrapped WAV file
    """
    with open(input_path, "rb") as source_file:
        pcm_bytes = source_file.read()

    with wave.open(str(output_path), "wb") as output_wav:
        output_wav.setnchannels(channels)
        output_wav.setsampwidth(sample_width)
        output_wav.setframerate(sample_rate)
        output_wav.writeframes(pcm_bytes)

    return output_path


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


def isolate_audio_with_elevenlabs(
    audio_path: Path,
    output_path: Path,
    api_key: str,
) -> Path:
    """
    Remove background noise from extracted audio with ElevenLabs Audio Isolation.

    Args:
        audio_path: Path to source WAV audio
        output_path: Path for cleaned WAV output
        api_key: ElevenLabs API key

    Returns:
        Path to cleaned audio file
    """
    if not ELEVENLABS_AVAILABLE:
        raise ImportError(
            "elevenlabs is not installed. "
            "Install with: pip install elevenlabs"
        )

    if not audio_path.exists():
        raise FileNotFoundError(f"Audio file not found: {audio_path}")

    client = ElevenLabs(api_key=api_key)

    print("  Cleaning audio with ElevenLabs Audio Isolation...")
    with open(audio_path, "rb") as source_file, client.audio_isolation.with_raw_response.convert(
        audio=source_file,
        file_format="pcm_s16le_16",
    ) as response:
        content_type = (response._response.headers.get("content-type") or "").lower()
        if content_type.startswith("audio/mpeg"):
            temp_output_path = output_path.with_name(f"{output_path.stem}.isolated.mp3")
        elif content_type.startswith("audio/wav"):
            temp_output_path = output_path.with_name(f"{output_path.stem}.isolated.wav")
        else:
            temp_output_path = output_path.with_name(f"{output_path.stem}.isolated.bin")

        with open(temp_output_path, "wb") as target_file:
            for chunk in response.data:
                if chunk:
                    target_file.write(chunk)

    try:
        with open(temp_output_path, "rb") as temp_file:
            header = temp_file.read(12)

        if header.startswith(b"RIFF"):
            shutil.move(temp_output_path, output_path)
        elif content_type.startswith("audio/mpeg") or header.startswith(b"ID3") or header[:2] == b"\xff\xfb":
            convert_audio_to_wav(temp_output_path, output_path)
        else:
            wrap_pcm_file_as_wav(temp_output_path, output_path)
    finally:
        temp_output_path.unlink(missing_ok=True)

    return output_path


def split_audio_for_isolation(
    audio_path: Path,
    output_dir: Path,
    chunk_duration_seconds: int = ELEVENLABS_AUDIO_ISOLATION_MAX_DURATION_SECONDS,
) -> list[Path]:
    """
    Split a long WAV file into smaller WAV chunks for audio isolation.

    Args:
        audio_path: Path to source WAV audio
        output_dir: Directory where chunk WAV files should be written
        chunk_duration_seconds: Maximum duration per chunk

    Returns:
        Ordered list of chunk paths
    """
    if not audio_path.exists():
        raise FileNotFoundError(f"Audio file not found: {audio_path}")

    duration_seconds = get_video_duration(audio_path)
    if duration_seconds <= 0:
        raise RuntimeError(f"Could not determine audio duration for {audio_path}")

    ffmpeg_exe = find_executable("ffmpeg")
    output_dir.mkdir(parents=True, exist_ok=True)

    chunk_paths: list[Path] = []
    start_seconds = 0
    chunk_index = 0

    while start_seconds < duration_seconds:
        chunk_path = output_dir / f"chunk_{chunk_index:03d}.wav"
        extract_cmd = [
            ffmpeg_exe,
            "-ss", str(start_seconds),
            "-t", str(chunk_duration_seconds),
            "-i", str(audio_path),
            "-acodec", "pcm_s16le",
            "-ar", "16000",
            "-ac", "1",
            "-y",
            str(chunk_path),
        ]

        result = subprocess.run(
            extract_cmd,
            capture_output=True,
            text=True,
            timeout=600,
        )
        if result.returncode != 0:
            raise RuntimeError(f"Audio chunk extraction failed: {result.stderr}")

        chunk_paths.append(chunk_path)
        start_seconds += chunk_duration_seconds
        chunk_index += 1

    return chunk_paths


def concatenate_wav_files(input_paths: list[Path], output_path: Path) -> Path:
    """
    Concatenate multiple PCM WAV files into a single WAV file.

    Args:
        input_paths: Ordered list of WAV chunk paths
        output_path: Final concatenated WAV path

    Returns:
        Path to the concatenated WAV file
    """
    if not input_paths:
        raise ValueError("At least one WAV file is required for concatenation")

    with wave.open(str(input_paths[0]), "rb") as first_wav:
        reference_params = (
            first_wav.getnchannels(),
            first_wav.getsampwidth(),
            first_wav.getframerate(),
            first_wav.getcomptype(),
            first_wav.getcompname(),
        )

        with wave.open(str(output_path), "wb") as output_wav:
            output_wav.setnchannels(reference_params[0])
            output_wav.setsampwidth(reference_params[1])
            output_wav.setframerate(reference_params[2])
            output_wav.setcomptype(reference_params[3], reference_params[4])
            output_wav.writeframes(first_wav.readframes(first_wav.getnframes()))

            for input_path in input_paths[1:]:
                with wave.open(str(input_path), "rb") as chunk_wav:
                    chunk_params = (
                        chunk_wav.getnchannels(),
                        chunk_wav.getsampwidth(),
                        chunk_wav.getframerate(),
                        chunk_wav.getcomptype(),
                        chunk_wav.getcompname(),
                    )
                    if chunk_params != reference_params:
                        raise ValueError(f"WAV parameters do not match for {input_path}")
                    output_wav.writeframes(chunk_wav.readframes(chunk_wav.getnframes()))

    return output_path


def isolate_long_audio_with_elevenlabs(
    audio_path: Path,
    output_path: Path,
    api_key: str,
) -> Path:
    """
    Isolate long audio by chunking it, isolating each chunk, then concatenating.

    Args:
        audio_path: Path to source WAV audio
        output_path: Path for cleaned concatenated WAV output
        api_key: ElevenLabs API key

    Returns:
        Path to cleaned audio file
    """
    chunk_dir = output_path.parent / "_audio_isolation_chunks"
    raw_chunk_paths = split_audio_for_isolation(
        audio_path,
        chunk_dir,
        chunk_duration_seconds=ELEVENLABS_AUDIO_ISOLATION_MAX_DURATION_SECONDS,
    )

    cleaned_chunk_paths: list[Path] = []

    try:
        for index, raw_chunk_path in enumerate(raw_chunk_paths):
            cleaned_chunk_path = chunk_dir / f"chunk_{index:03d}.cleaned.wav"
            isolate_audio_with_elevenlabs(raw_chunk_path, cleaned_chunk_path, api_key)
            cleaned_chunk_paths.append(cleaned_chunk_path)

        concatenate_wav_files(cleaned_chunk_paths, output_path)
        return output_path
    finally:
        shutil.rmtree(chunk_dir, ignore_errors=True)


def transcribe_with_elevenlabs(
    file_path: Path,
    api_key: str,
    keyterms: Optional[list[str]] = None,
) -> dict:
    """
    Transcribe audio/video using ElevenLabs Scribe v2.

    Args:
        file_path: Path to audio or video file
        api_key: ElevenLabs API key
        keyterms: Optional keyterms to bias transcription toward

    Returns:
        Dictionary with transcript and timed segments (same format as Whisper output)
    """
    from elevenlabs.client import ElevenLabs

    if not file_path.exists():
        raise FileNotFoundError(f"File not found: {file_path}")

    client = ElevenLabs(api_key=api_key)

    print(f"  Uploading to ElevenLabs Scribe v2...")
    with open(file_path, "rb") as f:
        result = client.speech_to_text.convert(
            file=f,
            model_id="scribe_v2",
            language_code="eng",
            tag_audio_events=False,
            diarize=False,
            file_format="other",
            keyterms=keyterms or None,
        )

    # Convert word-level output to sentence-level segments matching Whisper format
    timed_segments = []
    current_segment = {"start": 0.0, "end": 0.0, "text": ""}
    word_count = 0

    for word in result.words:
        if word.type == "word":
            if not current_segment["text"]:
                current_segment["start"] = word.start
            current_segment["end"] = word.end
            current_segment["text"] += word.text + " "
            word_count += 1

            # Segment on sentence boundaries (~30 words)
            if word_count >= 30 and word.text.rstrip().endswith((".", "!", "?")):
                timed_segments.append({
                    "start": current_segment["start"],
                    "end": current_segment["end"],
                    "text": current_segment["text"].strip(),
                })
                current_segment = {"start": 0.0, "end": 0.0, "text": ""}
                word_count = 0
        elif word.type == "spacing" and word.text == "\n":
            # Paragraph break -- flush current segment
            if current_segment["text"].strip():
                timed_segments.append({
                    "start": current_segment["start"],
                    "end": current_segment["end"],
                    "text": current_segment["text"].strip(),
                })
                current_segment = {"start": 0.0, "end": 0.0, "text": ""}
                word_count = 0

    # Flush remaining
    if current_segment["text"].strip():
        timed_segments.append({
            "start": current_segment["start"],
            "end": current_segment["end"],
            "text": current_segment["text"].strip(),
        })

    duration = result.words[-1].end if result.words else 0.0

    print(f"  Transcribed {len(timed_segments)} segments ({len(result.text)} chars)")

    return {
        "transcript": result.text,
        "timed_segments": timed_segments,
        "duration_seconds": duration,
        "language": result.language_code,
        "language_probability": result.language_probability,
        "model_size": "elevenlabs_scribe_v2",
        "transcribed_at": datetime.now().isoformat(),
    }


def extract_scene_frames(
    video_path: Path,
    output_dir: Path,
    scene_threshold: float = 0.3,
    also_interval: Optional[int] = 120,
) -> list[Path]:
    """
    Extract frames using ffmpeg scene-change detection.

    Captures frames where screen content changes significantly --
    ideal for screen recordings where chart views, annotations, or
    timeframes change.

    Args:
        video_path: Path to video file
        output_dir: Directory to save frames
        scene_threshold: Scene change sensitivity (0.0-1.0, lower = more frames)
        also_interval: Also extract fixed-interval frames every N seconds (None to skip)

    Returns:
        List of paths to extracted frame files (scene + interval combined)
    """
    if not video_path.exists():
        raise FileNotFoundError(f"Video file not found: {video_path}")

    ffmpeg_exe = find_executable("ffmpeg")
    frames_subdir = output_dir / "frames"
    frames_subdir.mkdir(parents=True, exist_ok=True)

    # Scene-detection frames
    print(f"  Extracting scene-change frames (threshold={scene_threshold})...")
    scene_cmd = [
        ffmpeg_exe,
        "-i", str(video_path),
        "-vf", f"select='gt(scene,{scene_threshold})',showinfo",
        "-vsync", "vfr",
        "-q:v", "2",
        "-y",
        str(frames_subdir / "scene_%03d.jpg"),
    ]

    result = subprocess.run(scene_cmd, capture_output=True, text=True, timeout=600)
    if result.returncode != 0:
        raise RuntimeError(f"Scene detection failed: {result.stderr[-500:]}")

    scene_files = sorted(frames_subdir.glob("scene_*.jpg"))
    print(f"  Scene-change: {len(scene_files)} frames")

    # Fixed-interval backup frames
    interval_files = []
    if also_interval:
        print(f"  Extracting interval frames (every {also_interval}s)...")
        interval_cmd = [
            ffmpeg_exe,
            "-i", str(video_path),
            "-vf", f"fps=1/{also_interval}",
            "-q:v", "2",
            "-y",
            str(frames_subdir / "interval_%03d.jpg"),
        ]

        result = subprocess.run(interval_cmd, capture_output=True, text=True, timeout=600)
        if result.returncode != 0:
            print(f"  Warning: Interval extraction failed (scene frames still available)")
        else:
            interval_files = sorted(frames_subdir.glob("interval_*.jpg"))
            print(f"  Interval: {len(interval_files)} frames")

    all_frames = scene_files + interval_files
    print(f"  Total: {len(all_frames)} frames extracted")

    return all_frames


def transcribe_video(
    video_path: Path,
    output_dir: Path,
    model_size: str = "base",
    keep_audio: bool = False,
    backend: str = "whisper",
    elevenlabs_key: Optional[str] = None,
    audio_cleanup_mode: str = "none",
    keyterms: Optional[list[str]] = None,
) -> dict:
    """
    Extract audio from video and transcribe with Whisper.

    Convenience function combining extract_audio and transcribe_with_whisper.

    Args:
        video_path: Path to video file
        output_dir: Directory for temporary/output files
        model_size: Whisper model size
        keep_audio: Keep extracted audio file (default: False)
        backend: Transcription backend ("whisper" or "elevenlabs")
        elevenlabs_key: ElevenLabs API key (required if backend="elevenlabs")
        audio_cleanup_mode: Audio cleanup mode ("none" or "voice_isolator")
        keyterms: Optional list of terms to bias transcription toward

    Returns:
        Transcript data dictionary
    """
    if backend == "elevenlabs":
        if not elevenlabs_key:
            elevenlabs_key = os.environ.get("ELEVENLABS_API_KEY")
        if not elevenlabs_key:
            raise ValueError("ElevenLabs API key required. Set ELEVENLABS_API_KEY or pass --elevenlabs-key")

        raw_audio_path = output_dir / "audio.raw.wav"
        cleaned_audio_path = output_dir / "audio.cleaned.wav"

        print("  Extracting audio from video...")
        extract_audio(video_path, raw_audio_path)

        transcription_input = raw_audio_path
        cleanup_status = "skipped"
        saved_cleaned_audio_path: Optional[str] = None

        if audio_cleanup_mode == "voice_isolator":
            try:
                raw_audio_duration_seconds = get_video_duration(raw_audio_path)
                if raw_audio_duration_seconds > ELEVENLABS_AUDIO_ISOLATION_MAX_DURATION_SECONDS:
                    isolate_long_audio_with_elevenlabs(
                        raw_audio_path,
                        cleaned_audio_path,
                        elevenlabs_key,
                    )
                else:
                    isolate_audio_with_elevenlabs(
                        raw_audio_path,
                        cleaned_audio_path,
                        elevenlabs_key,
                    )
                transcription_input = cleaned_audio_path
                cleanup_status = "completed"
                saved_cleaned_audio_path = str(cleaned_audio_path)
            except Exception as exc:
                cleaned_audio_path.unlink(missing_ok=True)
                print(f"  Warning: Audio cleanup failed, falling back to raw audio: {exc}")
                cleanup_status = "failed_fallback_raw"

        transcript_data = transcribe_with_elevenlabs(
            transcription_input,
            api_key=elevenlabs_key,
            keyterms=keyterms,
        )
        transcript_data["audio_cleanup_status"] = cleanup_status
        transcript_data["cleaned_audio_path"] = saved_cleaned_audio_path
        transcript_data["audio_path"] = str(transcription_input)

        return transcript_data

    # Whisper path: extract audio first
    audio_path = output_dir / "audio.wav"
    print(f"  Extracting audio from video...")
    extract_audio(video_path, audio_path)

    # Transcribe
    transcript_data = transcribe_with_whisper(audio_path, model_size=model_size)

    # Clean up audio if not keeping
    if not keep_audio:
        audio_path.unlink(missing_ok=True)

    return transcript_data
