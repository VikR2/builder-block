#!/usr/bin/env python3
"""
YouTube to NinjaTrader Code Generator with Skill Extraction

Automates an enhanced 10-step workflow for generating NinjaTrader code from YouTube videos
with automatic skill library management:

PHASE 1 - Analysis:
  1. Fetch transcript from YouTube video
  1b. (Optional) Extract video frames for Claude Code vision analysis
  2. Analyze trading concepts in transcript
  3. Map concepts to existing NinjaTrader skills

PHASE 2 - Skill Extraction:
  3a. Check which concepts are new vs existing
  3b. Extract metadata for new skills
  3c. Save new skills to library with source tracking
  3d. Resolve skill dependencies

PHASE 3 - Output Generation:
  4. Generate Strategy Architecture Document (SAD) by default
  5. Save SAD to data/architectures/<name>.md
  6. (Legacy mode) Classify content type and generate C# code

PHASE 4 - Tracking:
  10. Record video as processed (prevents duplicates)

USAGE:
    uv run python -m runtime.harness scripts/generate_from_youtube.py \\
        --url "https://youtube.com/watch?v=..." \\
        --project-id 1 \\
        [--with-frames]               # Extract video frames for visual analysis
        [--frame-interval 45]         # Seconds between frames (default: 45)
        [--max-frames 15]             # Max frames to extract (default: 15)
        [--keep-frames]               # Don't delete frames after processing
        [--extract-skills | --no-extract-skills] \\
        [--confirm-skills] \\
        [--skip-generation] \\
        [--legacy-codegen]

EXAMPLES:
    # Default: Generate Strategy Architecture Document (SAD)
    uv run python -m runtime.harness scripts/generate_from_youtube.py \\
        --url "https://youtube.com/watch?v=abc123" \\
        --project-id 1

    # With frame extraction for visual analysis
    uv run python -m runtime.harness scripts/generate_from_youtube.py \\
        --url "https://youtube.com/watch?v=abc123" \\
        --project-id 1 \\
        --with-frames

    # Extract skills only (no SAD generation)
    uv run python -m runtime.harness scripts/generate_from_youtube.py \\
        --url "https://youtube.com/watch?v=xyz789" \\
        --project-id 1 \\
        --skip-generation

    # Interactive mode - confirm each skill before saving
    uv run python -m runtime.harness scripts/generate_from_youtube.py \\
        --url "https://youtube.com/watch?v=def456" \\
        --project-id 1 \\
        --confirm-skills

    # Legacy mode - generate C# code directly (old behavior)
    uv run python -m runtime.harness scripts/generate_from_youtube.py \\
        --url "https://youtube.com/watch?v=ghi789" \\
        --project-id 1 \\
        --legacy-codegen

MULTIMODAL WORKFLOW:
    When using --with-frames, the script:
    1. Downloads the video via yt-dlp
    2. Extracts frames at specified intervals via ffmpeg
    3. Creates manifest.json pairing frames with transcript segments
    4. Saves to data/temp-frames/{video_id}/
    5. Claude Code can then read these frames for visual analysis
    6. Frames are deleted after processing (unless --keep-frames)
"""

import argparse
import hashlib
import json
import os
import re
import shutil
import sqlite3
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

# MCP tool calling - will be available via runtime.harness
try:
    from runtime.mcp_client import call_mcp_tool
except ImportError:
    # Fallback for direct execution (testing)
    def call_mcp_tool(tool_id: str, params: dict) -> dict:
        raise RuntimeError(
            "MCP client not available. Run via: "
            "uv run python -m runtime.harness scripts/generate_from_youtube.py ..."
        )


# =============================================================================
# Constants
# =============================================================================

# Project root (relative to script location)
PROJECT_ROOT = Path(__file__).parent.parent.resolve()
DB_PATH = PROJECT_ROOT / "data" / "builder.db"
DEFAULT_OUTPUT_DIR = PROJECT_ROOT / "scripts-output"
ARCHITECTURES_DIR = PROJECT_ROOT / "data" / "architectures"
SAD_TEMPLATE_PATH = PROJECT_ROOT / "scripts" / "templates" / "sad_template.md"
TEMP_FRAMES_DIR = PROJECT_ROOT / "data" / "temp-frames"

# Maximum transcript length to process (chars)
MAX_TRANSCRIPT_LENGTH = 50000

# Trading concept keywords for analysis
CONCEPT_KEYWORDS = {
    "entry_patterns": [
        "sweep", "liquidity grab", "liquidity sweep", "stop hunt",
        "break of structure", "bos", "change of character", "choch",
        "order block", "ob", "bullish order block", "bearish order block",
        "fair value gap", "fvg", "imbalance",
        "cisd", "change in state of delivery",
        "breaker", "breaker block", "mitigation block",
        "inducement", "equal highs", "equal lows",
        "turtle soup", "failure swing",
    ],
    "risk_management": [
        "stop loss", "stoploss", "stop-loss", "sl",
        "take profit", "takeprofit", "take-profit", "tp",
        "breakeven", "break even", "be",
        "risk reward", "risk to reward", "r:r", "rr",
        "position size", "position sizing", "lot size",
        "trail", "trailing stop", "trailing",
        "partial", "scale out", "scale in",
    ],
    "market_structure": [
        "bias", "daily bias", "session bias",
        "trend", "trending", "range", "ranging", "consolidation",
        "direction", "directional",
        "support", "resistance", "s/r", "s&r",
        "session", "london", "new york", "asian", "asia",
        "higher high", "hh", "higher low", "hl",
        "lower high", "lh", "lower low", "ll",
        "swing high", "swing low", "swing point",
        "premium", "discount", "equilibrium",
    ],
    "indicators": [
        "vwap", "volume weighted average price",
        "poc", "point of control", "value area",
        "atr", "average true range",
        "moving average", "ma", "ema", "sma",
        "rsi", "relative strength",
        "macd", "momentum",
        "fibonacci", "fib", "fib levels",
        "volume", "volume profile",
        "bollinger", "bands",
        "delta", "cumulative delta",
    ],
}

# Keywords for content type classification
INDICATOR_KEYWORDS = [
    "how to calculate", "how to identify", "how to detect",
    "how to measure", "measuring", "calculating",
    "indicator shows", "indicator plots",
    "draw", "plot", "display", "visualize",
    "identify when", "detect when", "signal when",
]

STRATEGY_KEYWORDS = [
    "when to enter", "entry signal", "entry trigger",
    "take profit", "exit", "close position",
    "stop loss", "stop out",
    "full strategy", "complete strategy", "complete system",
    "trading system", "trading plan",
    "backtest", "forward test",
    "win rate", "profit factor",
    "trade management", "position management",
]


# =============================================================================
# Step 1: Fetch Transcript
# =============================================================================

def fetch_transcript(url: str) -> dict:
    """
    Fetch transcript from YouTube video using MCP tool.

    Args:
        url: YouTube video URL

    Returns:
        dict with transcript text and metadata

    Raises:
        RuntimeError: If transcript cannot be fetched
    """
    print(f"\n[1/7] Fetching transcript...")

    # Validate URL format
    if not url:
        raise RuntimeError("Invalid URL: URL cannot be empty")

    if "youtube.com" not in url and "youtu.be" not in url:
        raise RuntimeError(
            f"Invalid YouTube URL: {url}\n"
            "Expected format: https://youtube.com/watch?v=... or https://youtu.be/..."
        )

    try:
        result = call_mcp_tool("youtube-transcript__get_transcript", {"url": url})

        # Parse MCP response
        if isinstance(result, str):
            data = json.loads(result)
        elif isinstance(result, dict):
            data = result
        else:
            raise RuntimeError(f"Unexpected response type: {type(result)}")

        # Check for errors
        if "error" in data:
            error_msg = data["error"]
            if "no captions" in error_msg.lower() or "no transcript" in error_msg.lower():
                raise RuntimeError("Video has no captions enabled. Cannot fetch transcript.")
            raise RuntimeError(f"MCP error: {error_msg}")

        transcript = data.get("transcript", "")
        if not transcript:
            raise RuntimeError("Empty transcript returned. Video may not have captions.")

        # Truncate if too long
        if len(transcript) > MAX_TRANSCRIPT_LENGTH:
            transcript = transcript[:MAX_TRANSCRIPT_LENGTH]
            print(f"  (Truncated to {MAX_TRANSCRIPT_LENGTH} characters)")

        char_count = data.get("character_count", len(transcript))
        print(f"  Fetched {char_count:,} characters")

        return {
            "transcript": transcript,
            "segments": data.get("segments", 0),
            "duration_seconds": data.get("duration_seconds", 0),
            "character_count": char_count,
        }

    except json.JSONDecodeError as e:
        raise RuntimeError(f"Failed to parse MCP response: {e}")
    except Exception as e:
        if "MCP" in str(e) or "mcp" in str(e):
            raise RuntimeError(
                f"MCP server not running or not responding: {e}\n"
                "Make sure youtube-transcript MCP server is configured in .mcp.json"
            )
        raise


# =============================================================================
# Step 1b: Extract Video Frames (NEW - Multimodal)
# =============================================================================

def extract_video_id(url: str) -> str:
    """
    Extract video ID from YouTube URL.

    Supports:
        - https://youtube.com/watch?v=VIDEO_ID
        - https://youtu.be/VIDEO_ID
        - https://www.youtube.com/watch?v=VIDEO_ID&...

    Returns:
        Video ID string
    """
    parsed = urlparse(url)

    if "youtu.be" in parsed.netloc:
        # Short URL format: https://youtu.be/VIDEO_ID
        return parsed.path.lstrip("/")

    if "youtube.com" in parsed.netloc:
        # Standard format: https://youtube.com/watch?v=VIDEO_ID
        query_params = parse_qs(parsed.query)
        if "v" in query_params:
            return query_params["v"][0]

    raise ValueError(f"Could not extract video ID from URL: {url}")


def _find_executable(name: str) -> str:
    """
    Find executable, checking common Windows install locations.

    Args:
        name: Executable name (e.g., 'ffmpeg', 'ffprobe', 'yt-dlp')

    Returns:
        Path to executable or just the name if in PATH
    """
    # Check if already in PATH
    if shutil.which(name):
        return name

    # Common Windows installation paths for ffmpeg
    if name in ("ffmpeg", "ffprobe"):
        winget_ffmpeg = Path.home() / "AppData/Local/Microsoft/WinGet/Packages"
        for pkg_dir in winget_ffmpeg.glob("Gyan.FFmpeg*"):
            for bin_dir in pkg_dir.glob("*/bin"):
                exe_path = bin_dir / f"{name}.exe"
                if exe_path.exists():
                    return str(exe_path)

    # Fallback to name (will fail with clear error if not found)
    return name


def extract_video_frames(
    url: str,
    video_id: str,
    transcript_data: dict,
    frame_interval: int = 45,
    max_frames: int = 15,
) -> Path:
    """
    Download video via yt-dlp and extract frames via ffmpeg.

    Args:
        url: YouTube video URL
        video_id: Extracted video ID
        transcript_data: Transcript data with segments/duration
        frame_interval: Seconds between frames (default: 45)
        max_frames: Maximum frames to extract (default: 15)

    Returns:
        Path to output directory containing frames and manifest.json

    Raises:
        RuntimeError: If yt-dlp or ffmpeg fails
    """
    print(f"\n[1b/7] Extracting video frames...")

    # Find executables (handles Windows PATH issues)
    ffmpeg_exe = _find_executable("ffmpeg")
    ffprobe_exe = _find_executable("ffprobe")
    ytdlp_exe = _find_executable("yt-dlp")

    # Create output directory
    frames_dir = TEMP_FRAMES_DIR / video_id
    frames_dir.mkdir(parents=True, exist_ok=True)

    video_path = frames_dir / "video.mp4"

    try:
        # Step 1: Download video with yt-dlp
        print(f"  Downloading video...")
        download_cmd = [
            ytdlp_exe,
            "-f", "best[height<=720]",  # Limit to 720p to save bandwidth
            "-o", str(video_path),
            "--no-playlist",
            "--quiet",
            url,
        ]

        result = subprocess.run(
            download_cmd,
            capture_output=True,
            text=True,
            timeout=300,  # 5 minute timeout
        )

        if result.returncode != 0:
            raise RuntimeError(f"yt-dlp failed: {result.stderr}")

        if not video_path.exists():
            # yt-dlp might add extension
            possible_files = list(frames_dir.glob("video.*"))
            if possible_files:
                video_path = possible_files[0]
            else:
                raise RuntimeError("Video download failed - no file found")

        print(f"  Downloaded: {video_path.name}")

        # Step 2: Get video duration if not in transcript data
        duration_seconds = transcript_data.get("duration_seconds", 0)
        if duration_seconds == 0:
            # Use ffprobe to get duration
            probe_cmd = [
                ffprobe_exe,
                "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                str(video_path),
            ]
            probe_result = subprocess.run(probe_cmd, capture_output=True, text=True)
            if probe_result.returncode == 0:
                duration_seconds = float(probe_result.stdout.strip())

        # Step 3: Calculate frame extraction parameters
        if duration_seconds > 0:
            # Calculate how many frames we'd get at this interval
            potential_frames = int(duration_seconds / frame_interval)
            if potential_frames > max_frames:
                # Adjust interval to get max_frames
                frame_interval = int(duration_seconds / max_frames)
                print(f"  Adjusted interval to {frame_interval}s for {max_frames} frames")

        # Step 4: Extract frames with ffmpeg
        print(f"  Extracting frames at {frame_interval}s intervals...")
        extract_cmd = [
            ffmpeg_exe,
            "-i", str(video_path),
            "-vf", f"fps=1/{frame_interval}",
            "-q:v", "2",  # High quality JPEG
            "-y",  # Overwrite existing
            str(frames_dir / "frame_%03d.jpg"),
        ]

        result = subprocess.run(
            extract_cmd,
            capture_output=True,
            text=True,
            timeout=120,  # 2 minute timeout
        )

        if result.returncode != 0:
            raise RuntimeError(f"ffmpeg failed: {result.stderr}")

        # Step 5: Delete the video file to save space
        video_path.unlink(missing_ok=True)

        # Count extracted frames
        frame_files = sorted(frames_dir.glob("frame_*.jpg"))
        print(f"  Extracted {len(frame_files)} frames")

        # Step 6: Create manifest
        manifest = create_frame_manifest(
            frames_dir=frames_dir,
            video_id=video_id,
            video_url=url,
            transcript_data=transcript_data,
            frame_interval=frame_interval,
            frame_files=frame_files,
            duration_seconds=duration_seconds,
        )

        # Save manifest
        manifest_path = frames_dir / "manifest.json"
        manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        print(f"  Created manifest.json")

        return frames_dir

    except subprocess.TimeoutExpired:
        raise RuntimeError("Video processing timed out")
    except Exception as e:
        # Clean up on failure
        if frames_dir.exists():
            shutil.rmtree(frames_dir, ignore_errors=True)
        raise RuntimeError(f"Frame extraction failed: {e}")


def create_frame_manifest(
    frames_dir: Path,
    video_id: str,
    video_url: str,
    transcript_data: dict,
    frame_interval: int,
    frame_files: list,
    duration_seconds: float,
) -> dict:
    """
    Create manifest.json pairing frames with transcript segments.

    Args:
        frames_dir: Directory containing frames
        video_id: YouTube video ID
        video_url: Full YouTube URL
        transcript_data: Transcript data from fetch_transcript
        frame_interval: Seconds between frames
        frame_files: List of frame file paths
        duration_seconds: Video duration in seconds

    Returns:
        Manifest dictionary
    """
    transcript = transcript_data.get("transcript", "")

    # Build frame entries with timestamps and transcript segments
    frames = []
    for i, frame_path in enumerate(frame_files):
        timestamp_sec = i * frame_interval
        timestamp_str = f"{int(timestamp_sec // 60)}:{int(timestamp_sec % 60):02d}"

        # Extract transcript segment around this timestamp
        # Use a window of +/- half the interval
        segment_text = _extract_transcript_window(
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

    return {
        "video_id": video_id,
        "video_url": video_url,
        "video_title": f"YouTube Video {video_id}",  # Could be enhanced with yt-dlp metadata
        "extracted_at": datetime.now().isoformat(),
        "frame_interval_sec": frame_interval,
        "frame_count": len(frames),
        "video_duration_sec": duration_seconds,
        "frames": frames,
        "full_transcript": transcript,
    }


def _extract_transcript_window(
    transcript: str,
    timestamp_sec: float,
    window_seconds: float,
) -> str:
    """
    Extract a portion of transcript around a timestamp.

    Since we don't have precise word-level timestamps, we estimate based on
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


def cleanup_frames(video_id: str) -> None:
    """
    Delete temporary frame files for a video.

    Args:
        video_id: YouTube video ID
    """
    frames_dir = TEMP_FRAMES_DIR / video_id
    if frames_dir.exists():
        shutil.rmtree(frames_dir, ignore_errors=True)
        print(f"  Cleaned up frames for {video_id}")


# =============================================================================
# Step 2: Analyze Trading Concepts
# =============================================================================

def analyze_concepts(transcript: str) -> dict:
    """
    Analyze transcript to extract trading concepts.

    Args:
        transcript: Full transcript text

    Returns:
        dict mapping concept categories to found keywords
    """
    print(f"\n[2/7] Analyzing trading concepts...")

    transcript_lower = transcript.lower()
    found_concepts = {}

    for category, keywords in CONCEPT_KEYWORDS.items():
        found = []
        for keyword in keywords:
            # Use word boundaries for more accurate matching
            pattern = r'\b' + re.escape(keyword.lower()) + r'\b'
            if re.search(pattern, transcript_lower):
                # Normalize keyword (remove duplicates like "stop loss" and "stoploss")
                normalized = keyword.replace("-", " ").replace("_", " ").lower()
                if normalized not in [k.replace("-", " ").replace("_", " ").lower() for k in found]:
                    found.append(keyword)

        if found:
            found_concepts[category] = found

    # Print found concepts
    if found_concepts:
        print(f"  Found concepts:")
        for category, keywords in found_concepts.items():
            print(f"    - {category}: {', '.join(keywords)}")
    else:
        print(f"  No specific trading concepts detected")

    return found_concepts


# =============================================================================
# Step 3: Get Relevant Skills
# =============================================================================

def get_relevant_skills(concepts: dict) -> list:
    """
    Search for matching skills in the NinjaTrader skills library.

    Args:
        concepts: dict of found concepts from analyze_concepts()

    Returns:
        list of matching skill records
    """
    print(f"\n[3/7] Searching for matching skills...")

    all_skills = []
    searched_terms = set()

    # Flatten concepts into search terms
    for category, keywords in concepts.items():
        for keyword in keywords[:3]:  # Limit to top 3 per category
            if keyword not in searched_terms:
                searched_terms.add(keyword)

    if not searched_terms:
        # Fallback: search for common terms
        searched_terms = {"entry", "exit", "indicator"}

    # Search for each term
    for term in searched_terms:
        try:
            result = call_mcp_tool(
                "nt-skills__get_relevant_skills",
                {"query": term, "limit": 3}
            )

            # Parse response (may be formatted text, not JSON)
            if isinstance(result, str):
                # Try to extract skill names from formatted text
                # The MCP returns formatted markdown, not raw JSON
                if "Found" in result and "skill" in result.lower():
                    # Extract skill info from formatted response
                    skill_matches = re.findall(
                        r'\*\*([^*]+)\*\*\s*\(([^)]+)\)',
                        result
                    )
                    for name, category in skill_matches:
                        skill = {
                            "name": name.strip(),
                            "category": category.strip(),
                            "search_term": term,
                        }
                        # Avoid duplicates
                        if not any(s["name"] == skill["name"] for s in all_skills):
                            all_skills.append(skill)

        except Exception as e:
            # Log but continue - skills are enhancement, not required
            print(f"    Warning: Could not search for '{term}': {e}")

    print(f"  Found {len(all_skills)} skill matches")

    return all_skills


# =============================================================================
# Step 3a: Check for New vs Existing Skills
# =============================================================================

def find_new_vs_existing_skills(concepts: dict, transcript: str) -> dict:
    """
    For each detected concept, check if it already exists in the skills library.

    Args:
        concepts: dict of found concepts from analyze_concepts()
        transcript: Full transcript for keyword extraction

    Returns:
        dict with:
            - new_skills: concepts that should be created as new skills
            - existing_skills: concepts that match existing skills
            - ambiguous: concepts needing user decision
            - skip: concepts that are exact matches (don't need action)
    """
    print(f"\n[3a/10] Checking for new vs existing skills...")

    results = {
        "new_skills": [],      # score < 0.40 - create new
        "existing_skills": [], # score 0.70-0.84 - update existing
        "ambiguous": [],       # score 0.40-0.69 - ask user
        "skip": [],            # score > 0.85 - exact match, skip
    }

    # Common abbreviations and short terms to skip (not meaningful skills)
    SKIP_ABBREVIATIONS = {
        "be", "sl", "tp", "rr", "hh", "hl", "lh", "ll", "ma", "ema", "sma",
        "fvg", "ob", "bos", "fib", "rsi", "atr", "poc", "s/r", "s&r", "r:r",
    }

    # Flatten concepts into individual items to check
    concepts_to_check = []
    for category, keywords in concepts.items():
        for keyword in keywords[:5]:  # Limit to top 5 per category
            # Skip short abbreviations (< 3 chars or in skip list)
            keyword_lower = keyword.lower()
            if len(keyword) < 3 or keyword_lower in SKIP_ABBREVIATIONS:
                print(f"    Skipping abbreviation: '{keyword}'")
                continue

            concepts_to_check.append({
                "name": keyword,
                "category": category,
                "keywords": [keyword] + _extract_related_keywords(keyword, transcript),
            })

    if not concepts_to_check:
        print(f"  No concepts to check (all were abbreviations)")
        return results

    checked = 0
    for concept in concepts_to_check:
        try:
            result = call_mcp_tool(
                "nt-skills__check_skill_exists",
                {
                    "concept_name": concept["name"],
                    "keywords": concept["keywords"],
                }
            )

            # Parse response
            if isinstance(result, str):
                data = json.loads(result)
            elif isinstance(result, dict):
                data = result
            else:
                continue

            # MCP returns match_score (not score)
            score = data.get("match_score", data.get("score", 0))
            action = data.get("suggested_action", "create_new")
            # MCP returns existing_skill (not best_match)
            existing_skill = data.get("existing_skill", data.get("best_match"))

            concept["score"] = score
            concept["action"] = action
            concept["existing_match"] = existing_skill

            # Classify based on score:
            # > 0.70: Very likely exists, skip or update
            # 0.35-0.70: Likely related, mark as ambiguous
            # < 0.35: Likely new skill
            if action == "skip" or score > 0.70:
                results["skip"].append(concept)
            elif action == "update" or (0.50 <= score <= 0.70):
                results["existing_skills"].append(concept)
            elif action == "ask_user" or (0.35 <= score < 0.50):
                results["ambiguous"].append(concept)
            else:  # create_new or score < 0.35
                results["new_skills"].append(concept)

            checked += 1

        except Exception as e:
            # If check fails, default to creating new skill
            concept["score"] = 0
            concept["action"] = "create_new"
            concept["error"] = str(e)
            results["new_skills"].append(concept)

    print(f"  Checked {checked} concepts:")
    print(f"    - New skills to create: {len(results['new_skills'])}")
    print(f"    - Existing to update: {len(results['existing_skills'])}")
    print(f"    - Ambiguous (needs review): {len(results['ambiguous'])}")
    print(f"    - Skip (exact match): {len(results['skip'])}")

    return results


def _extract_related_keywords(concept: str, transcript: str) -> list:
    """Extract related keywords from transcript for a concept."""
    keywords = []
    transcript_lower = transcript.lower()

    # Find sentences containing the concept
    concept_lower = concept.lower()
    sentences = transcript_lower.split('.')

    for sentence in sentences:
        if concept_lower in sentence:
            # Extract potential keywords (words > 3 chars)
            words = re.findall(r'\b[a-z]{4,}\b', sentence)
            for word in words:
                if word != concept_lower and word not in keywords:
                    keywords.append(word)
                if len(keywords) >= 5:
                    break

    return keywords[:5]


# =============================================================================
# Step 3b: Extract Skill Metadata from Concepts
# =============================================================================

def extract_skill_from_concept(
    concept: dict,
    transcript: str,
    video_url: str,
) -> dict:
    """
    Use LLM to extract full skill metadata from a concept.

    Args:
        concept: dict with name, category, keywords
        transcript: Full transcript for context
        video_url: Source video URL

    Returns:
        dict with skill metadata ready for saving
    """
    # For now, construct skill metadata from available data
    # In a full implementation, this would call an LLM to generate
    # description, code snippets, etc.

    concept_name = concept["name"]
    category = concept["category"]

    # Determine NinjaTrader category mapping
    category_map = {
        "entry_patterns": "Entry Patterns",
        "risk_management": "Risk Management",
        "market_structure": "Market Analysis",
        "indicators": "Indicators",
    }
    nt_category = category_map.get(category, "Trading Concepts")

    # Extract context from transcript
    context = _extract_context_around_concept(concept_name, transcript)

    # Generate description from context
    description = f"Trading concept: {concept_name}. "
    if context:
        # Use first 200 chars of context as description basis
        description += context[:200].strip()
        if len(context) > 200:
            description += "..."

    # Generate basic code snippet placeholder
    safe_name = re.sub(r'[^a-zA-Z0-9]', '', concept_name.title())
    code_snippet = f"""// {concept_name} Detection
// TODO: Implement {concept_name} logic based on video explanation
private bool Check{safe_name}()
{{
    // Placeholder - implement based on video teaching
    return false;
}}"""

    return {
        "name": concept_name.title(),
        "category": nt_category,
        "subcategory": None,
        "description": description,
        "code_snippet": code_snippet,
        "variables": [],
        "keywords": concept.get("keywords", [concept_name]),
        "complexity": "medium",
        "dependencies": [],
        "source_type": "youtube",
        "source_url": video_url,
        "source_title": f"YouTube: {concept_name}",
        "extraction_confidence": 0.6,  # Moderate confidence for auto-extraction
    }


def _extract_context_around_concept(concept: str, transcript: str, chars: int = 500) -> str:
    """Extract surrounding context for a concept from transcript."""
    concept_lower = concept.lower()
    transcript_lower = transcript.lower()

    idx = transcript_lower.find(concept_lower)
    if idx == -1:
        return ""

    start = max(0, idx - chars // 2)
    end = min(len(transcript), idx + len(concept) + chars // 2)

    return transcript[start:end]


# =============================================================================
# Step 3c: Save New Skills
# =============================================================================

def save_new_skills(
    new_skills: list,
    transcript: str,
    video_url: str,
    confirm: bool = False,
) -> list:
    """
    Save extracted skills to the library using save_skill_with_source.

    Args:
        new_skills: list of concept dicts to save
        transcript: Full transcript for metadata extraction
        video_url: Source video URL
        confirm: If True, ask for confirmation before each save

    Returns:
        list of saved skill IDs
    """
    print(f"\n[3c/10] Saving {len(new_skills)} new skills...")

    saved_ids = []

    for concept in new_skills:
        # Extract full skill metadata
        skill_data = extract_skill_from_concept(concept, transcript, video_url)

        if confirm:
            print(f"\n  Skill: {skill_data['name']}")
            print(f"  Category: {skill_data['category']}")
            print(f"  Description: {skill_data['description'][:100]}...")
            response = input("  Save this skill? [Y/n]: ").strip().lower()
            if response == 'n':
                print(f"  Skipped")
                continue

        try:
            result = call_mcp_tool(
                "nt-skills__save_skill_with_source",
                skill_data
            )

            # Parse response for skill_id
            if isinstance(result, str):
                data = json.loads(result)
            elif isinstance(result, dict):
                data = result
            else:
                data = {}

            skill_id = data.get("skill_id")
            if skill_id:
                saved_ids.append(skill_id)
                print(f"    Saved: {skill_data['name']} (ID: {skill_id})")
            else:
                print(f"    Saved: {skill_data['name']}")

        except Exception as e:
            print(f"    Warning: Could not save '{skill_data['name']}': {e}")

    print(f"  Saved {len(saved_ids)} new skills")
    return saved_ids


# =============================================================================
# Step 3d: Resolve Skill Dependencies
# =============================================================================

def resolve_all_dependencies(skill_ids: list) -> dict:
    """
    Resolve dependencies for all selected skills.

    Args:
        skill_ids: list of skill IDs to resolve

    Returns:
        dict with:
            - skills: list of all skills including dependencies
            - dependency_order: ordered list for code generation
    """
    print(f"\n[3d/10] Resolving skill dependencies...")

    all_skills = []
    seen_ids = set()
    dependency_order = []

    for skill_id in skill_ids:
        if skill_id in seen_ids:
            continue

        try:
            result = call_mcp_tool(
                "nt-skills__get_skill_with_dependencies",
                {"skill_id": skill_id}
            )

            if isinstance(result, str):
                data = json.loads(result)
            elif isinstance(result, dict):
                data = result
            else:
                continue

            # Get main skill
            skill = data.get("skill")
            if skill and skill.get("id") not in seen_ids:
                seen_ids.add(skill.get("id"))
                all_skills.append(skill)

            # Get dependencies in order
            dep_order = data.get("dependency_order", [])
            for dep_skill in dep_order:
                dep_id = dep_skill.get("id")
                if dep_id and dep_id not in seen_ids:
                    seen_ids.add(dep_id)
                    all_skills.append(dep_skill)
                    dependency_order.append(dep_skill)

        except Exception as e:
            print(f"    Warning: Could not resolve dependencies for ID {skill_id}: {e}")

    # Add main skills at the end (after their dependencies)
    for skill_id in skill_ids:
        for skill in all_skills:
            if skill.get("id") == skill_id and skill not in dependency_order:
                dependency_order.append(skill)

    print(f"  Resolved {len(all_skills)} total skills ({len(skill_ids)} primary + {len(all_skills) - len(skill_ids)} dependencies)")

    return {
        "skills": all_skills,
        "dependency_order": dependency_order,
    }


# =============================================================================
# Step 4a: Generate Strategy Architecture Document
# =============================================================================

def generate_architecture_document(
    concepts: dict,
    skills: list,
    transcript: str,
    url: str,
    skill_analysis: dict | None = None,
) -> tuple[str, str]:
    """
    Generate a Strategy Architecture Document (SAD) from analyzed content.

    Args:
        concepts: Found trading concepts from analyze_concepts()
        skills: Matched skills from get_relevant_skills()
        transcript: Full transcript text
        url: Source YouTube URL
        skill_analysis: Optional dict with new_skills, existing_skills, etc.

    Returns:
        tuple of (sad_content, sad_filename)
    """
    print(f"\n[4/7] Generating Strategy Architecture Document...")

    # Generate name from concepts
    name_parts = []
    if concepts.get("entry_patterns"):
        name_parts.append(concepts["entry_patterns"][0].replace(" ", "_").title())
    elif concepts.get("market_structure"):
        name_parts.append(concepts["market_structure"][0].replace(" ", "_").title())
    elif concepts.get("indicators"):
        name_parts.append(concepts["indicators"][0].upper())

    if not name_parts:
        name_parts.append("YouTube_Strategy")

    strategy_name = "_".join(name_parts)
    safe_name = sanitize_name(strategy_name)

    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    date_str = datetime.now().strftime("%Y-%m-%d")

    # Determine complexity based on concepts
    complexity = _determine_complexity(concepts)

    # Determine content type
    content_type = "strategy" if ("entry_patterns" in concepts or "risk_management" in concepts) else "indicator"

    # Build skills composition summary
    direct_skills, adapted_skills, novel_skills = _classify_skills_by_match(skills, skill_analysis)

    # Extract key passages from transcript
    transcript_excerpts = _extract_key_passages(transcript, concepts)

    # Determine trading style from concepts
    trading_style = _determine_trading_style(concepts)

    # Determine timeframe from transcript
    timeframe = _extract_timeframe(transcript)

    # Build sections
    metadata_section = _build_metadata_section(safe_name, url, content_type, complexity, timestamp)
    overview_section = _build_overview_section(concepts, trading_style, timeframe)
    bias_section = _build_bias_section(concepts, skills, transcript)
    setup_section = _build_setup_section(concepts, skills, transcript)
    entry_section = _build_entry_section(concepts, skills, transcript)
    risk_section = _build_risk_section(concepts, skills, transcript)
    time_windows_section = _build_time_windows_section(transcript)
    state_machine_section = _build_state_machine_section(concepts)
    variables_section = _build_variables_section(concepts)
    skills_summary_section = _build_skills_summary_section(direct_skills, adapted_skills, novel_skills)
    checklist_section = _build_implementation_checklist(concepts)
    questions_section = _build_questions_section(concepts, transcript)
    appendix_section = _build_skill_appendix(skills)

    # Assemble the full document
    sad_content = f"""# Strategy Architecture Document

{metadata_section}

---

## 1. Overview

{overview_section}

---

## 2. Market Context & Bias

{bias_section}

---

## 3. Setup Conditions

{setup_section}

---

## 4. Entry Scenarios

{entry_section}

---

## 5. Risk Management

{risk_section}

---

## 6. Time Windows

{time_windows_section}

---

## 7. State Machine

{state_machine_section}

---

## 8. State Variables

{variables_section}

---

## 9. Skills Composition Summary

{skills_summary_section}

---

## 10. Implementation Checklist

{checklist_section}

---

## 11. User Questions

{questions_section}

---

## 12. Transcript Excerpts

### Key Passages
{transcript_excerpts}

---

## Appendix: Full Skill Code References

{appendix_section}
"""

    filename = f"{date_str}-{safe_name.lower()}.md"
    print(f"  SAD generated ({len(sad_content):,} characters)")

    return sad_content, filename


def _determine_complexity(concepts: dict) -> str:
    """Determine strategy complexity based on concepts."""
    total_concepts = sum(len(v) for v in concepts.values())
    num_categories = len(concepts)

    if total_concepts >= 10 or num_categories >= 4:
        return "complex"
    elif total_concepts >= 5 or num_categories >= 2:
        return "medium"
    else:
        return "simple"


def _classify_skills_by_match(skills: list, skill_analysis: dict | None) -> tuple[list, list, list]:
    """Classify skills into direct use, adaptation needed, and novel synthesis."""
    direct = []
    adapted = []
    novel = []

    if skill_analysis:
        # Use the skill analysis results
        for s in skill_analysis.get("skip", []):
            direct.append({"name": s.get("name", "unknown"), "score": s.get("score", 0.9)})
        for s in skill_analysis.get("existing_skills", []):
            adapted.append({"name": s.get("name", "unknown"), "score": s.get("score", 0.75)})
        for s in skill_analysis.get("ambiguous", []) + skill_analysis.get("new_skills", []):
            novel.append({"name": s.get("name", "unknown"), "score": s.get("score", 0.5)})
    else:
        # Classify based on matched skills
        for skill in skills:
            score = skill.get("score", 0.7)
            if score > 0.85:
                direct.append(skill)
            elif score >= 0.7:
                adapted.append(skill)
            else:
                novel.append(skill)

    return direct, adapted, novel


def _extract_key_passages(transcript: str, concepts: dict) -> str:
    """Extract relevant passages from transcript based on concepts."""
    passages = []
    transcript_lower = transcript.lower()

    # Find passages for each category
    for category, keywords in concepts.items():
        for keyword in keywords[:2]:  # Limit per category
            keyword_lower = keyword.lower()
            idx = transcript_lower.find(keyword_lower)
            if idx != -1:
                # Extract surrounding context
                start = max(0, idx - 100)
                end = min(len(transcript), idx + len(keyword) + 200)
                passage = transcript[start:end].strip()

                # Clean up passage
                if start > 0:
                    passage = "..." + passage
                if end < len(transcript):
                    passage = passage + "..."

                passages.append(f"**{keyword}** ({category}):\n> {passage}\n")

    if not passages:
        return "> No specific passages extracted. Review full transcript for context."

    return "\n".join(passages[:5])  # Limit to 5 passages


def _determine_trading_style(concepts: dict) -> str:
    """Determine trading style from concepts."""
    styles = []

    if "entry_patterns" in concepts:
        patterns = [p.lower() for p in concepts["entry_patterns"]]
        if any(p in ["sweep", "liquidity sweep", "stop hunt"] for p in patterns):
            styles.append("Liquidity-based")
        if any(p in ["order block", "fvg", "fair value gap"] for p in patterns):
            styles.append("Smart Money Concepts (SMC)")
        if any(p in ["break of structure", "bos", "change of character"] for p in patterns):
            styles.append("Market Structure")

    if "risk_management" in concepts:
        rm = [r.lower() for r in concepts["risk_management"]]
        if any(r in ["breakeven", "break even"] for r in rm):
            styles.append("Break-even management")
        if any(r in ["trail", "trailing stop"] for r in rm):
            styles.append("Trailing stops")

    return ", ".join(styles) if styles else "Discretionary / Not specified"


def _extract_timeframe(transcript: str) -> str:
    """Extract timeframe mentions from transcript."""
    transcript_lower = transcript.lower()

    timeframes = []
    tf_patterns = [
        ("1-minute", ["1 minute", "1m", "one minute"]),
        ("5-minute", ["5 minute", "5m", "five minute"]),
        ("15-minute", ["15 minute", "15m", "fifteen minute"]),
        ("1-hour", ["1 hour", "1h", "one hour", "hourly"]),
        ("4-hour", ["4 hour", "4h", "four hour"]),
        ("daily", ["daily", "day chart", "daily chart"]),
    ]

    for name, patterns in tf_patterns:
        if any(p in transcript_lower for p in patterns):
            timeframes.append(name)

    return ", ".join(timeframes) if timeframes else "Not specified"


def _build_metadata_section(name: str, url: str, content_type: str, complexity: str, timestamp: str) -> str:
    """Build the metadata YAML section."""
    return f"""## Metadata
```yaml
name: "{name}"
source_url: "{url}"
source_title: "YouTube Video Analysis"
type: "{content_type}"
complexity: "{complexity}"
generated: "{timestamp}"
confidence: 0.7
```"""


def _build_overview_section(concepts: dict, trading_style: str, timeframe: str) -> str:
    """Build the overview section."""
    # Build core concept description
    core_concepts = []
    for category, keywords in concepts.items():
        if keywords:
            core_concepts.append(f"{category.replace('_', ' ').title()}: {', '.join(keywords[:3])}")

    core_description = "\n".join(f"- {c}" for c in core_concepts) if core_concepts else "Strategy details extracted from video"

    return f"""**Core Concept:**
{core_description}

**Trading Style:** {trading_style}

**Timeframe:** {timeframe}"""


def _build_bias_section(concepts: dict, skills: list, transcript: str) -> str:
    """Build the market context and bias section."""
    # Look for bias-related skills
    bias_skill = None
    for skill in skills:
        if any(kw in skill.get("name", "").lower() for kw in ["bias", "session", "vwap", "poc"]):
            bias_skill = skill
            break

    skill_ref = f"`{bias_skill['name']}`" if bias_skill else "`TBD - synthesis needed`"
    skill_usage = "direct" if bias_skill else "novel"

    # Extract bias logic from concepts
    bias_logic = "Not specified in transcript"
    if "market_structure" in concepts:
        ms = concepts["market_structure"]
        if any(k in ["bias", "daily bias", "session bias"] for k in ms):
            bias_logic = "Determine directional bias based on session structure"
        if any(k in ["session", "london", "new york", "asian"] for k in ms):
            bias_logic = "Session-based bias determination (e.g., pre-market analysis)"

    # Check for time window mentions
    time_window = "Session start to key time boundary"
    if "asian" in transcript.lower() or "london" in transcript.lower():
        time_window = "Asian/London session overlap or specific session window"

    return f"""### 2.1 Bias Calculation
**Skill:** {skill_ref} ({skill_usage})

**Logic:**
{bias_logic}

**Time Window:** {time_window}

**Variables Required:**
- `sessionHigh`, `sessionLow` (session range)
- `bias` (Bullish/Bearish/Neutral)
- `biasCalculated` (bool)

**Code Snippet:**
```csharp
// TODO: Implement bias calculation based on video teaching
// Example structure:
// if (inBiasWindow) {{ collectSessionData(); }}
// if (biasWindowEnded) {{ calculateBias(); }}
```"""


def _build_setup_section(concepts: dict, skills: list, transcript: str) -> str:
    """Build the setup conditions section."""
    setups = []

    # Check for range-based setups
    if "market_structure" in concepts:
        ms_concepts = [c.lower() for c in concepts["market_structure"]]
        if any(k in ms_concepts for k in ["range", "ranging", "consolidation"]):
            setups.append({
                "name": "Range Building",
                "description": "Build a range during specified time window",
                "variables": "rangeHigh, rangeLow, equilibrium, rangeSet",
            })

    # Check for pattern-based setups
    if "entry_patterns" in concepts:
        patterns = concepts["entry_patterns"][:3]
        for pattern in patterns:
            setups.append({
                "name": pattern.title(),
                "description": f"Detect {pattern} pattern from video explanation",
                "variables": f"{sanitize_name(pattern).lower()}Detected, {sanitize_name(pattern).lower()}Price",
            })

    if not setups:
        setups.append({
            "name": "Setup Detection",
            "description": "Setup conditions from video (needs synthesis)",
            "variables": "setupDetected (bool)",
        })

    # Build section text
    sections = []
    for i, setup in enumerate(setups[:3], 1):  # Limit to 3 setups
        skill_match = _find_matching_skill(setup["name"], skills)
        skill_ref = f"`{skill_match['name']}`" if skill_match else "`TBD - synthesis needed`"
        skill_usage = "direct" if skill_match else "novel"

        sections.append(f"""### 3.{i} {setup['name']}
**Skill:** {skill_ref} ({skill_usage})

**Description:** {setup['description']}

**Time Window:** Specified in video (extract from transcript)

**Variables Required:**
- {setup['variables']}

**Code Snippet:**
```csharp
// TODO: Implement {setup['name'].lower()} logic
// Based on video teaching
```""")

    return "\n\n".join(sections)


def _find_matching_skill(name: str, skills: list) -> dict | None:
    """Find a skill matching the given name."""
    name_lower = name.lower()
    for skill in skills:
        skill_name = skill.get("name", "").lower()
        if name_lower in skill_name or skill_name in name_lower:
            return skill
    return None


def _build_entry_section(concepts: dict, skills: list, transcript: str) -> str:
    """Build the entry scenarios section."""
    scenarios = []

    # Check for reversal patterns (Scenario A type)
    if "entry_patterns" in concepts:
        patterns = concepts["entry_patterns"]
        reversal_keywords = ["sweep", "liquidity", "stop hunt", "cisd", "change in state"]
        continuation_keywords = ["breakout", "break of structure", "bos", "continuation"]

        reversal_patterns = [p for p in patterns if any(k in p.lower() for k in reversal_keywords)]
        continuation_patterns = [p for p in patterns if any(k in p.lower() for k in continuation_keywords)]

        if reversal_patterns:
            scenarios.append({
                "name": "Reversal Entry",
                "type": "reversal",
                "patterns": reversal_patterns,
                "conditions": _build_entry_conditions(reversal_patterns, "reversal"),
            })

        if continuation_patterns:
            scenarios.append({
                "name": "Continuation Entry",
                "type": "continuation",
                "patterns": continuation_patterns,
                "conditions": _build_entry_conditions(continuation_patterns, "continuation"),
            })

    if not scenarios:
        scenarios.append({
            "name": "Primary Entry",
            "type": "TBD",
            "patterns": ["Entry pattern from video"],
            "conditions": "- Conditions to be extracted from transcript",
        })

    # Build section text
    sections = []
    for i, scenario in enumerate(scenarios[:2], 1):  # Limit to 2 scenarios
        pattern_skills = [_find_matching_skill(p, skills) for p in scenario["patterns"]]
        skill_refs = [f"- `{s['name']}`" if s else f"- `{p}` (synthesis needed)"
                      for s, p in zip(pattern_skills, scenario["patterns"])]

        letter = chr(ord('A') + i - 1)  # A, B, C...
        sections.append(f"""### 4.{i} Scenario {letter}: {scenario['name']}
**Type:** {scenario['type']}

**Skills Used:**
{chr(10).join(skill_refs)}

**Entry Conditions:**
{scenario['conditions']}

**Code Snippet:**
```csharp
// Scenario {letter}: {scenario['name']}
// TODO: Implement entry logic based on video
bool entryCondition = false;  // Replace with actual logic

if (entryCondition)
{{
    if (tradeDirection == 1)
        EnterLong("Entry{letter}");
    else
        EnterShort("Entry{letter}");
}}
```""")

    return "\n\n".join(sections)


def _build_entry_conditions(patterns: list, entry_type: str) -> str:
    """Build entry conditions from patterns."""
    conditions = []

    for pattern in patterns[:3]:
        pattern_lower = pattern.lower()
        if "sweep" in pattern_lower or "liquidity" in pattern_lower:
            conditions.append(f"- Price sweeps key level ({pattern})")
            conditions.append("- Wait for rejection/reversal candle")
        elif "cisd" in pattern_lower or "change in state" in pattern_lower:
            conditions.append(f"- CISD confirmed (close through reference candle open)")
        elif "breakout" in pattern_lower or "bos" in pattern_lower:
            conditions.append(f"- Price breaks structure level ({pattern})")
        elif "order block" in pattern_lower:
            conditions.append(f"- Price returns to order block zone")
        elif "fvg" in pattern_lower or "fair value gap" in pattern_lower:
            conditions.append(f"- Price fills fair value gap")
        else:
            conditions.append(f"- {pattern} condition met (from video)")

    if not conditions:
        conditions.append("- Entry conditions to be extracted from video")

    return "\n".join(conditions)


def _build_risk_section(concepts: dict, skills: list, transcript: str) -> str:
    """Build the risk management section."""
    rm_concepts = concepts.get("risk_management", [])

    # Stop loss
    stop_logic = "Below/above recent swing or entry structure"
    if any(k.lower() in ["sweep", "liquidity sweep"] for k in concepts.get("entry_patterns", [])):
        stop_logic = "Below sweep low (long) or above sweep high (short)"

    stop_skill = _find_matching_skill("stop", skills) or _find_matching_skill("risk", skills)
    stop_ref = f"`{stop_skill['name']}`" if stop_skill else "`TBD - synthesis needed`"

    # Take profit
    tp_logic = "Fixed R:R or structural target"
    tp_skill = _find_matching_skill("profit", skills) or _find_matching_skill("target", skills)
    tp_ref = f"`{tp_skill['name']}`" if tp_skill else "`TBD - synthesis needed`"

    # Breakeven
    be_logic = "Move stop to entry after X ticks profit"
    if any("breakeven" in k.lower() or "break even" in k.lower() for k in rm_concepts):
        be_logic = "Move stop to entry after specified profit threshold"
    be_skill = _find_matching_skill("breakeven", skills) or _find_matching_skill("break even", skills)
    be_ref = f"`{be_skill['name']}`" if be_skill else "`TBD - standard pattern`"

    return f"""### 5.1 Stop Loss
**Skill:** {stop_ref}

**Logic:** {stop_logic}

**Code Snippet:**
```csharp
// Stop loss placement
double stopPrice = tradeDirection == 1 ? sweepLow : sweepHigh;
SetStopLoss(orderName, CalculationMode.Price, stopPrice, false);
```

### 5.2 Take Profit
**Skill:** {tp_ref}

**Logic:** {tp_logic}

**Code Snippet:**
```csharp
// Take profit placement
double tpPrice = tradeDirection == 1
    ? entryPrice + (TakeProfitTicks * TickSize)
    : entryPrice - (TakeProfitTicks * TickSize);
SetProfitTarget(orderName, CalculationMode.Price, tpPrice);
```

### 5.3 Breakeven
**Skill:** {be_ref}

**Logic:** {be_logic}

**Code Snippet:**
```csharp
// Breakeven management
double currentProfit = Position.MarketPosition == MarketPosition.Long
    ? Close[0] - Position.AveragePrice
    : Position.AveragePrice - Close[0];

if (currentProfit / TickSize >= BreakevenTicks && !breakevenSet)
{{
    SetStopLoss(orderName, CalculationMode.Price, Position.AveragePrice, false);
    breakevenSet = true;
}}
```"""


def _build_time_windows_section(transcript: str) -> str:
    """Build the time windows table."""
    # Default time windows (common pattern)
    windows = [
        ("Pre-market", "3:00 AM", "7:00 AM", "Bias calculation"),
        ("Range Building", "7:00 AM", "7:40 AM", "Build trading range"),
        ("Execution", "7:40 AM", "9:30 AM", "Look for setups and entries"),
        ("Session End", "4:00 PM", "-", "Close all positions"),
    ]

    # Check transcript for specific times
    transcript_lower = transcript.lower()
    if "london" in transcript_lower:
        windows.insert(1, ("London Open", "3:00 AM", "4:00 AM", "London session context"))
    if "new york" in transcript_lower:
        windows.append(("NY Open", "9:30 AM", "10:30 AM", "NY session volatility"))

    table_rows = [f"| {w[0]} | {w[1]} | {w[2]} | {w[3]} |" for w in windows]

    return """| Phase | Start | End | Activity |
|-------|-------|-----|----------|
""" + "\n".join(table_rows)


def _build_state_machine_section(concepts: dict) -> str:
    """Build a text-based state machine diagram."""
    states = ["IDLE"]

    if "market_structure" in concepts:
        states.append("COLLECTING_BIAS")
        states.append("BUILDING_RANGE")

    if "entry_patterns" in concepts:
        states.append("WAITING_SETUP")
        states.append("SETUP_DETECTED")
        states.append("WAITING_ENTRY")

    states.extend(["IN_POSITION", "MANAGING_TRADE"])

    # Build simple state diagram
    diagram_lines = ["```"]
    for i, state in enumerate(states):
        if i < len(states) - 1:
            diagram_lines.append(f"[{state}] --> [{states[i+1]}]")
        else:
            diagram_lines.append(f"[{state}] --> [IDLE] (on exit/EOD)")
    diagram_lines.append("```")

    return "\n".join(diagram_lines)


def _build_variables_section(concepts: dict) -> str:
    """Build the state variables section."""
    variables = []

    # Always needed
    variables.extend([
        "// Core state",
        "private DateTime currentDate;",
        "private bool tradeTaken;",
        "private int tradeDirection;  // 1 = long, -1 = short",
    ])

    # Bias-related
    if "market_structure" in concepts:
        variables.extend([
            "",
            "// Bias state",
            "private double sessionHigh;",
            "private double sessionLow;",
            "private BiasType bias;  // Bullish/Bearish/Neutral",
            "private bool biasCalculated;",
        ])

    # Range-related
    if any(k in concepts.get("market_structure", []) for k in ["range", "ranging", "consolidation"]):
        variables.extend([
            "",
            "// Range state",
            "private double rangeHigh;",
            "private double rangeLow;",
            "private double equilibrium;",
            "private bool rangeSet;",
        ])

    # Entry pattern state
    if "entry_patterns" in concepts:
        variables.extend([
            "",
            "// Setup state",
            "private bool setupDetected;",
            "private double setupPrice;",
            "private int setupBar;",
        ])

    # Position management
    variables.extend([
        "",
        "// Position management",
        "private double entryPrice;",
        "private double stopLoss;",
        "private double takeProfit;",
        "private bool breakevenSet;",
    ])

    reset_code = """// Daily reset - call at start of each day
private void ResetDailyState()
{
    // Reset all state variables to defaults
    tradeTaken = false;
    tradeDirection = 0;
    setupDetected = false;
    breakevenSet = false;
    // ... reset other state as needed
}"""

    return f"""### Required Variables
```csharp
{chr(10).join(variables)}
```

### Daily Reset
```csharp
{reset_code}
```"""


def _build_skills_summary_section(direct: list, adapted: list, novel: list) -> str:
    """Build the skills composition summary."""
    def format_skill_list(skills: list) -> str:
        if not skills:
            return "- None identified"
        return "\n".join(f"- `{s.get('name', 'unknown')}` (score: {s.get('score', 0):.2f})" for s in skills[:5])

    return f"""### Direct Use (score > 0.85)
{format_skill_list(direct)}

### Adaptation Needed (0.7-0.85)
{format_skill_list(adapted)}

### Novel Synthesis Required (< 0.7)
{format_skill_list(novel)}"""


def _build_implementation_checklist(concepts: dict) -> str:
    """Build the implementation checklist."""
    checklist = [
        "- [ ] Declare all state variables (#region Variables)",
        "- [ ] Implement OnStateChange with all parameters",
    ]

    if "market_structure" in concepts:
        checklist.append("- [ ] Implement bias calculation")

    if any(k in concepts.get("market_structure", []) for k in ["range", "ranging", "consolidation"]):
        checklist.append("- [ ] Implement range building")

    if "entry_patterns" in concepts:
        checklist.append("- [ ] Implement setup detection")
        checklist.append("- [ ] Implement entry logic for each scenario")

    checklist.extend([
        "- [ ] Implement OnExecutionUpdate for stop/target",
        "- [ ] Implement breakeven management",
        "- [ ] Implement daily reset",
        "- [ ] Add time window controls",
        "- [ ] Add debug output option",
        "- [ ] Backtest on historical data",
    ])

    return "\n".join(checklist)


def _build_questions_section(concepts: dict, transcript: str) -> str:
    """Build the user questions section for ambiguities."""
    questions = []

    # Check for common ambiguities
    if "entry_patterns" in concepts and len(concepts["entry_patterns"]) > 2:
        questions.append("- Which entry patterns should be prioritized when multiple are present?")

    if "risk_management" in concepts:
        rm = [r.lower() for r in concepts["risk_management"]]
        if "stop loss" not in " ".join(rm) and "stoploss" not in " ".join(rm):
            questions.append("- What is the specific stop loss placement logic?")
        if "take profit" not in " ".join(rm) and "takeprofit" not in " ".join(rm):
            questions.append("- What is the take profit target (fixed R:R or structural)?")

    # Check for missing info
    if "market_structure" not in concepts:
        questions.append("- What is the bias/direction determination method?")

    if "session" not in transcript.lower() and "time" not in transcript.lower():
        questions.append("- Are there specific time windows for trading?")

    if not questions:
        questions.append("- No major ambiguities detected. Review transcript excerpts for nuances.")

    return "\n".join(questions)


def _build_skill_appendix(skills: list) -> str:
    """Build the appendix with full skill code references."""
    if not skills:
        return "No skills matched. All patterns require novel synthesis from transcript."

    appendix_entries = []
    for skill in skills[:10]:  # Limit to 10 skills
        name = skill.get("name", "Unknown")
        category = skill.get("category", "Uncategorized")
        code = skill.get("code_snippet", "// Code not available - retrieve from skills library")

        appendix_entries.append(f"""### {name}
**Category:** {category}

```csharp
{code}
```
""")

    return "\n".join(appendix_entries)


# =============================================================================
# Step 4b: Save Architecture Document
# =============================================================================

def save_architecture_document(
    content: str,
    filename: str,
) -> Path:
    """
    Save Strategy Architecture Document to data/architectures/.

    Args:
        content: SAD markdown content
        filename: Filename (e.g., "2025-01-15-sweep_cisd.md")

    Returns:
        Full path to saved file
    """
    print(f"\n[5/7] Saving architecture document...")

    # Ensure directory exists
    ARCHITECTURES_DIR.mkdir(parents=True, exist_ok=True)

    file_path = ARCHITECTURES_DIR / filename

    # Handle existing file (add timestamp)
    if file_path.exists():
        stem = file_path.stem
        timestamp = datetime.now().strftime("%H%M%S")
        filename = f"{stem}_{timestamp}.md"
        file_path = ARCHITECTURES_DIR / filename
        print(f"  File exists, using: {filename}")

    file_path.write_text(content, encoding="utf-8")
    print(f"  Saved to: {file_path}")

    return file_path


# =============================================================================
# Step 10: Record Video Processing
# =============================================================================

def record_video_processed(
    url: str,
    title: str,
    skills_extracted: list,
    skills_matched: list,
) -> int:
    """
    Record that a video has been processed to prevent duplicates.

    Args:
        url: YouTube video URL
        title: Video title (if known)
        skills_extracted: list of skill IDs created from this video
        skills_matched: list of skill IDs that matched existing

    Returns:
        Database ID of the record
    """
    print(f"\n[10/10] Recording video processing...")

    if not DB_PATH.exists():
        print(f"  Warning: Database not found, skipping video tracking")
        return 0

    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()

        # Check if video already processed
        cursor.execute(
            "SELECT id FROM processed_videos WHERE url = ?",
            (url,)
        )
        existing = cursor.fetchone()

        if existing:
            # Update existing record
            cursor.execute('''
                UPDATE processed_videos
                SET skills_extracted = ?,
                    skills_matched = ?,
                    processing_status = 'reprocessed',
                    processed_at = CURRENT_TIMESTAMP
                WHERE url = ?
            ''', (
                json.dumps(skills_extracted),
                json.dumps(skills_matched),
                url,
            ))
            record_id = existing[0]
            print(f"  Updated existing record (ID: {record_id})")
        else:
            # Insert new record
            cursor.execute('''
                INSERT INTO processed_videos (
                    url,
                    title,
                    skills_extracted,
                    skills_matched,
                    processing_status
                ) VALUES (?, ?, ?, ?, ?)
            ''', (
                url,
                title,
                json.dumps(skills_extracted),
                json.dumps(skills_matched),
                "completed",
            ))
            record_id = cursor.lastrowid
            print(f"  Recorded new video (ID: {record_id})")

        conn.commit()
        conn.close()
        return record_id

    except sqlite3.Error as e:
        print(f"  Warning: Could not record video processing: {e}")
        return 0


# =============================================================================
# Step 4: Classify Content Type
# =============================================================================

def classify_content_type(transcript: str, concepts: dict, force_type: str = "auto") -> str:
    """
    Classify the content as indicator or strategy.

    Args:
        transcript: Full transcript text
        concepts: Found concepts from analyze_concepts()
        force_type: "auto", "indicator", or "strategy"

    Returns:
        "indicator" or "strategy"
    """
    print(f"\n[4/7] Classifying content type...")

    if force_type in ("indicator", "strategy"):
        print(f"  Type: {force_type} (forced)")
        return force_type

    transcript_lower = transcript.lower()

    # Count keyword matches
    indicator_score = 0
    strategy_score = 0

    for keyword in INDICATOR_KEYWORDS:
        if keyword.lower() in transcript_lower:
            indicator_score += 1

    for keyword in STRATEGY_KEYWORDS:
        if keyword.lower() in transcript_lower:
            strategy_score += 1

    # Consider concepts
    if "risk_management" in concepts:
        strategy_score += 2  # Risk management strongly suggests strategy

    if "entry_patterns" in concepts:
        strategy_score += 1

    if "indicators" in concepts and len(concepts.get("indicators", [])) > 2:
        indicator_score += 1

    # Determine type
    if strategy_score > indicator_score:
        content_type = "strategy"
    elif indicator_score > strategy_score:
        content_type = "indicator"
    else:
        # Default to strategy if concepts include entry patterns or risk
        if "entry_patterns" in concepts or "risk_management" in concepts:
            content_type = "strategy"
        else:
            content_type = "indicator"

    print(f"  Type: {content_type} (indicator_score={indicator_score}, strategy_score={strategy_score})")

    return content_type


# =============================================================================
# Step 5: Generate Code
# =============================================================================

def sanitize_name(name: str) -> str:
    """Convert string to valid C# identifier."""
    # Remove non-alphanumeric chars, capitalize words
    words = re.sub(r'[^a-zA-Z0-9\s]', '', name).split()
    return ''.join(word.capitalize() for word in words)


def is_complete_strategy_video(concepts: dict, transcript: str) -> bool:
    """
    Detect if video teaches a complete trading strategy.

    A complete strategy video has:
    1. Entry patterns (how to enter trades)
    2. Risk management (stop loss, take profit, etc.)
    3. Keywords indicating full strategy/trade review

    Returns:
        True if this appears to be a complete strategy video
    """
    has_entry = bool(concepts.get('entry_patterns'))
    has_risk = bool(concepts.get('risk_management'))

    # Normalize transcript for matching (handle "top- down" variations)
    transcript_normalized = transcript.lower().replace('- ', '-').replace(' -', '-')

    strategy_keywords = [
        'top-down', 'topdown', 'full strategy', 'complete strategy',
        'trade review', 'trade example', 'how i traded', 'my trade',
        'entry and exit', 'full breakdown', 'step by step', 'walkthrough',
        'chart lesson', 'reviewing a trade', 'trade from'
    ]
    has_strategy_keywords = any(kw in transcript_normalized for kw in strategy_keywords)

    return has_entry and has_risk and has_strategy_keywords


def generate_indicator_code(
    name: str,
    description: str,
    concepts: dict,
    skills: list,
    url: str,
) -> str:
    """
    Generate NinjaTrader Indicator C# code.

    Args:
        name: Indicator name (will be sanitized)
        description: Brief description
        concepts: Found trading concepts
        skills: Matched skills
        url: Source YouTube URL

    Returns:
        C# code string
    """
    safe_name = sanitize_name(name)
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # Build concept comments
    concept_comments = []
    for category, keywords in concepts.items():
        concept_comments.append(f"//   {category}: {', '.join(keywords)}")
    concept_section = "\n".join(concept_comments) if concept_comments else "//   (none detected)"

    # Build skills reference
    skill_comments = []
    for skill in skills[:5]:  # Limit to 5
        skill_comments.append(f"//   - {skill['name']} ({skill['category']})")
    skill_section = "\n".join(skill_comments) if skill_comments else "//   (none matched)"

    code = f'''//
// {safe_name}Indicator
//
// Generated from YouTube: {url}
// Generated at: {timestamp}
//
// Trading concepts detected:
{concept_section}
//
// Related skills:
{skill_section}
//
// NOTE: This is a template. Review and refine the logic before use.
//

#region Using declarations
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.ComponentModel.DataAnnotations;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Input;
using System.Windows.Media;
using System.Xml.Serialization;
using NinjaTrader.Cbi;
using NinjaTrader.Gui;
using NinjaTrader.Gui.Chart;
using NinjaTrader.Gui.SuperDom;
using NinjaTrader.Gui.Tools;
using NinjaTrader.Data;
using NinjaTrader.NinjaScript;
using NinjaTrader.Core.FloatingPoint;
using NinjaTrader.NinjaScript.DrawingTools;
#endregion

namespace NinjaTrader.NinjaScript.Indicators
{{
    public class {safe_name}Indicator : Indicator
    {{
        #region Variables
        // TODO: Add your indicator variables here
        // Example: private Series<double> signalSeries;
        #endregion

        protected override void OnStateChange()
        {{
            if (State == State.SetDefaults)
            {{
                Description                 = @"{description}";
                Name                        = "{safe_name}";
                Calculate                   = Calculate.OnBarClose;
                IsOverlay                   = true;
                DisplayInDataBox            = true;
                DrawOnPricePanel            = true;
                PaintPriceMarkers           = true;
                ScaleJustification          = NinjaTrader.Gui.Chart.ScaleJustification.Right;
                IsSuspendedWhileInactive    = true;

                // Default input parameters
                // TODO: Add your parameters here
                // Example: Period = 14;

                AddPlot(Brushes.DodgerBlue, "Signal");
            }}
            else if (State == State.Configure)
            {{
                // TODO: Add data series if needed
                // Example: AddDataSeries(BarsPeriodType.Minute, 5);
            }}
            else if (State == State.DataLoaded)
            {{
                // TODO: Initialize series if needed
                // Example: signalSeries = new Series<double>(this);
            }}
        }}

        protected override void OnBarUpdate()
        {{
            // Wait for enough bars
            if (CurrentBar < 20)
                return;

            // TODO: Implement your indicator logic here
            // Based on detected concepts:
{_indent_concepts(concepts, 12)}

            // Example calculation (replace with actual logic):
            double signalValue = Close[0];

            // Set the plot value
            Signal[0] = signalValue;
        }}

        #region Properties
        [Browsable(false)]
        [XmlIgnore]
        public Series<double> Signal
        {{
            get {{ return Values[0]; }}
        }}

        // TODO: Add your input parameters here
        // Example:
        // [NinjaScriptProperty]
        // [Range(1, int.MaxValue)]
        // [Display(Name = "Period", Order = 1, GroupName = "Parameters")]
        // public int Period {{ get; set; }}
        #endregion
    }}
}}

#region NinjaScript generated code. Neither change nor remove.

namespace NinjaTrader.NinjaScript.Indicators
{{
    public partial class Indicator : NinjaTrader.Gui.NinjaScript.IndicatorRenderBase
    {{
        private {safe_name}Indicator[] cache{safe_name}Indicator;
        public {safe_name}Indicator {safe_name}Indicator()
        {{
            return {safe_name}Indicator(Input);
        }}

        public {safe_name}Indicator {safe_name}Indicator(ISeries<double> input)
        {{
            if (cache{safe_name}Indicator != null)
                for (int idx = 0; idx < cache{safe_name}Indicator.Length; idx++)
                    if (cache{safe_name}Indicator[idx] != null && cache{safe_name}Indicator[idx].EqualsInput(input))
                        return cache{safe_name}Indicator[idx];
            return CacheIndicator<{safe_name}Indicator>(new {safe_name}Indicator(), input, ref cache{safe_name}Indicator);
        }}
    }}
}}

namespace NinjaTrader.NinjaScript.MarketAnalyzerColumns
{{
    public partial class MarketAnalyzerColumn : MarketAnalyzerColumnBase
    {{
        public Indicators.{safe_name}Indicator {safe_name}Indicator()
        {{
            return indicator.{safe_name}Indicator(Input);
        }}

        public Indicators.{safe_name}Indicator {safe_name}Indicator(ISeries<double> input)
        {{
            return indicator.{safe_name}Indicator(input);
        }}
    }}
}}

#endregion
'''
    return code


# =============================================================================
# Step 3e: Generate Indicator for Skill
# =============================================================================

# Categories that need visual representation on chart
VISUAL_CATEGORIES = ["Entry Patterns", "Market Structure", "Market Analysis"]
SKIP_CATEGORIES = ["Risk Management", "Trade Management", "Indicators"]


def generate_indicator_for_skill(
    skill: dict,
    output_dir: Path = None,
) -> str | None:
    """
    Generate a NinjaTrader indicator for a skill if it needs visual representation.

    Args:
        skill: Skill record dict with name, category, description, nlp_keywords, etc.
        output_dir: Base output directory (defaults to scripts-output/)

    Returns:
        Path to generated indicator file, or None if not needed
    """
    # Check if category needs indicator
    category = skill.get("category", "")
    if category not in VISUAL_CATEGORIES:
        print(f"    Skipping indicator for '{skill.get('name')}' (category: {category})")
        return None

    if output_dir is None:
        output_dir = Path(__file__).parent.parent / "scripts-output"

    # Parse keywords
    nlp_keywords = skill.get("nlp_keywords", "[]")
    if isinstance(nlp_keywords, str):
        try:
            keywords = json.loads(nlp_keywords)
        except json.JSONDecodeError:
            keywords = []
    else:
        keywords = nlp_keywords or []

    # Build concepts dict for template
    concepts = {"keywords": keywords}

    # Generate indicator code using existing template
    code = generate_indicator_code(
        name=skill.get("name", "Unknown"),
        description=skill.get("description", "Generated from skill library"),
        concepts=concepts,
        skills=[skill],
        url=skill.get("source_url", ""),
    )

    # Generate safe filename
    safe_name = sanitize_name(skill.get("name", "Unknown"))
    filename = f"{safe_name}Indicator.cs"

    # Save to Indicators directory
    indicators_dir = output_dir / "Indicators"
    indicators_dir.mkdir(parents=True, exist_ok=True)

    file_path = indicators_dir / filename

    # Handle existing file (don't overwrite)
    if file_path.exists():
        print(f"    Indicator already exists: {file_path}")
        return str(file_path)

    file_path.write_text(code, encoding="utf-8")
    print(f"    Generated indicator: {file_path}")

    return str(file_path)


def update_skill_indicator_path(skill_id: int, indicator_path: str) -> bool:
    """
    Update the indicator_path for a skill in the database.

    Args:
        skill_id: ID of the skill to update
        indicator_path: Path to the generated indicator file

    Returns:
        True if successful, False otherwise
    """
    try:
        db_path = Path(__file__).parent.parent / "data" / "builder.db"
        import sqlite3
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE skills SET indicator_path = ?, needs_indicator = 1 WHERE id = ?",
            (indicator_path, skill_id)
        )
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        print(f"    Warning: Could not update indicator_path: {e}")
        return False


def generate_strategy_code(
    name: str,
    description: str,
    concepts: dict,
    skills: list,
    url: str,
) -> str:
    """
    Generate NinjaTrader Strategy C# code.

    Args:
        name: Strategy name (will be sanitized)
        description: Brief description
        concepts: Found trading concepts
        skills: Matched skills
        url: Source YouTube URL

    Returns:
        C# code string
    """
    safe_name = sanitize_name(name)
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # Build concept comments
    concept_comments = []
    for category, keywords in concepts.items():
        concept_comments.append(f"//   {category}: {', '.join(keywords)}")
    concept_section = "\n".join(concept_comments) if concept_comments else "//   (none detected)"

    # Build skills reference
    skill_comments = []
    for skill in skills[:5]:  # Limit to 5
        skill_comments.append(f"//   - {skill['name']} ({skill['category']})")
    skill_section = "\n".join(skill_comments) if skill_comments else "//   (none matched)"

    code = f'''//
// {safe_name}Strategy
//
// Generated from YouTube: {url}
// Generated at: {timestamp}
//
// Trading concepts detected:
{concept_section}
//
// Related skills:
{skill_section}
//
// NOTE: This is a template. Review and refine the logic before use.
// IMPORTANT: Backtest thoroughly before live trading!
//

#region Using declarations
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.ComponentModel.DataAnnotations;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Input;
using System.Windows.Media;
using System.Xml.Serialization;
using NinjaTrader.Cbi;
using NinjaTrader.Gui;
using NinjaTrader.Gui.Chart;
using NinjaTrader.Gui.SuperDom;
using NinjaTrader.Gui.Tools;
using NinjaTrader.Data;
using NinjaTrader.NinjaScript;
using NinjaTrader.Core.FloatingPoint;
using NinjaTrader.NinjaScript.Indicators;
using NinjaTrader.NinjaScript.DrawingTools;
#endregion

namespace NinjaTrader.NinjaScript.Strategies
{{
    public class {safe_name}Strategy : Strategy
    {{
        #region Variables
        // Risk management
        private int stopLossTicks = 20;
        private int profitTargetTicks = 40;

        // Trade state
        private bool inTrade = false;

        // TODO: Add your indicator references here
        // Example: private Indicators.YourIndicator indicator;
        #endregion

        protected override void OnStateChange()
        {{
            if (State == State.SetDefaults)
            {{
                Description                 = @"{description}";
                Name                        = "{safe_name}";
                Calculate                   = Calculate.OnBarClose;
                EntriesPerDirection         = 1;
                EntryHandling               = EntryHandling.AllEntries;
                IsExitOnSessionCloseStrategy = true;
                ExitOnSessionCloseSeconds   = 30;
                IsFillLimitOnTouch          = false;
                MaximumBarsLookBack         = MaximumBarsLookBack.TwoHundredFiftySix;
                OrderFillResolution         = OrderFillResolution.Standard;
                Slippage                    = 0;
                StartBehavior               = StartBehavior.WaitUntilFlat;
                TimeInForce                 = TimeInForce.Gtc;
                TraceOrders                 = false;
                RealtimeErrorHandling       = RealtimeErrorHandling.StopCancelClose;
                StopTargetHandling          = StopTargetHandling.PerEntryExecution;
                BarsRequiredToTrade         = 20;
                IsInstantiatedOnEachOptimizationIteration = true;

                // Default parameters
                StopLossTicks               = 20;
                ProfitTargetTicks           = 40;
            }}
            else if (State == State.Configure)
            {{
                // TODO: Add data series if needed
                // Example: AddDataSeries(BarsPeriodType.Minute, 5);
            }}
            else if (State == State.DataLoaded)
            {{
                // TODO: Initialize indicators
                // Example: indicator = Indicators.YourIndicator();
                // AddChartIndicator(indicator);
            }}
        }}

        protected override void OnBarUpdate()
        {{
            // Wait for enough bars
            if (CurrentBar < BarsRequiredToTrade)
                return;

            // Skip historical data if desired
            // if (State == State.Historical) return;

            // TODO: Implement your entry/exit logic here
            // Based on detected concepts:
{_indent_concepts(concepts, 12)}

            // ==========================================
            // ENTRY LOGIC
            // ==========================================

            if (Position.MarketPosition == MarketPosition.Flat)
            {{
                // TODO: Define your entry conditions
                bool longCondition = false;  // Replace with actual logic
                bool shortCondition = false; // Replace with actual logic

                if (longCondition)
                {{
                    EnterLong("LongEntry");
                    SetStopLoss(CalculationMode.Ticks, StopLossTicks);
                    SetProfitTarget(CalculationMode.Ticks, ProfitTargetTicks);
                }}
                else if (shortCondition)
                {{
                    EnterShort("ShortEntry");
                    SetStopLoss(CalculationMode.Ticks, StopLossTicks);
                    SetProfitTarget(CalculationMode.Ticks, ProfitTargetTicks);
                }}
            }}

            // ==========================================
            // EXIT LOGIC (beyond stop/target)
            // ==========================================

            if (Position.MarketPosition == MarketPosition.Long)
            {{
                // TODO: Add additional exit conditions
                // Example: if (CrossBelow(Close, SMA(20), 1)) ExitLong();
            }}
            else if (Position.MarketPosition == MarketPosition.Short)
            {{
                // TODO: Add additional exit conditions
                // Example: if (CrossAbove(Close, SMA(20), 1)) ExitShort();
            }}
        }}

        #region Properties
        [NinjaScriptProperty]
        [Range(1, int.MaxValue)]
        [Display(Name = "Stop Loss Ticks", Order = 1, GroupName = "Risk Management")]
        public int StopLossTicks
        {{
            get {{ return stopLossTicks; }}
            set {{ stopLossTicks = value; }}
        }}

        [NinjaScriptProperty]
        [Range(1, int.MaxValue)]
        [Display(Name = "Profit Target Ticks", Order = 2, GroupName = "Risk Management")]
        public int ProfitTargetTicks
        {{
            get {{ return profitTargetTicks; }}
            set {{ profitTargetTicks = value; }}
        }}

        // TODO: Add your custom parameters here
        // Example:
        // [NinjaScriptProperty]
        // [Range(1, int.MaxValue)]
        // [Display(Name = "Lookback Period", Order = 3, GroupName = "Parameters")]
        // public int LookbackPeriod {{ get; set; }}
        #endregion
    }}
}}
'''
    return code


def _indent_concepts(concepts: dict, indent: int) -> str:
    """Helper to format concepts as indented comments."""
    if not concepts:
        return " " * indent + "// No specific concepts detected"

    lines = []
    for category, keywords in concepts.items():
        lines.append(f"// {category}:")
        for kw in keywords[:3]:  # Limit per category
            lines.append(f"//   - {kw}")

    return "\n".join(" " * indent + line for line in lines)


def generate_code(
    content_type: str,
    concepts: dict,
    skills: list,
    url: str,
) -> tuple[str, str]:
    """
    Generate NinjaTrader code based on content type.

    Args:
        content_type: "indicator" or "strategy"
        concepts: Found trading concepts
        skills: Matched skills
        url: Source YouTube URL

    Returns:
        tuple of (code, filename)
    """
    print(f"\n[5/7] Generating {content_type} code...")

    # Generate name from concepts or default
    name_parts = ["YouTube", "Generated"]

    # Add primary concept to name
    if concepts.get("entry_patterns"):
        name_parts.append(concepts["entry_patterns"][0].replace(" ", "").title())
    elif concepts.get("indicators"):
        name_parts.append(concepts["indicators"][0].upper())

    name = "".join(name_parts)
    description = f"Auto-generated {content_type} from YouTube video analysis"

    if content_type == "indicator":
        code = generate_indicator_code(name, description, concepts, skills, url)
        filename = f"{sanitize_name(name)}Indicator.cs"
    else:
        code = generate_strategy_code(name, description, concepts, skills, url)
        filename = f"{sanitize_name(name)}Strategy.cs"

    print(f"  Code generated ({len(code):,} characters)")

    return code, filename


# =============================================================================
# Step 6: Save File
# =============================================================================

def save_file(
    code: str,
    filename: str,
    content_type: str,
    output_dir: Path,
) -> Path:
    """
    Save generated code to file.

    Args:
        code: C# code string
        filename: Filename (e.g., "MyIndicator.cs")
        content_type: "indicator" or "strategy"
        output_dir: Base output directory

    Returns:
        Full path to saved file
    """
    # Determine subdirectory
    if content_type == "indicator":
        subdir = output_dir / "Indicators"
    else:
        subdir = output_dir / "Strategies"

    # Ensure directory exists
    subdir.mkdir(parents=True, exist_ok=True)

    file_path = subdir / filename

    print(f"\n[6/7] Saving to {file_path}...")

    # Handle existing file
    if file_path.exists():
        # Add timestamp to avoid overwrite
        stem = file_path.stem
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"{stem}_{timestamp}.cs"
        file_path = subdir / filename
        print(f"  File exists, using: {filename}")

    file_path.write_text(code, encoding="utf-8")
    print(f"  File saved")

    return file_path


# =============================================================================
# Step 7: Save to Database
# =============================================================================

def save_to_database(
    project_id: int,
    name: str,
    description: str,
    file_path: Path,
    url: str,
    concepts: dict,
    skills: list,
) -> int:
    """
    Save script metadata to database.

    Args:
        project_id: Project ID
        name: Script name
        description: Brief description
        file_path: Path to saved file
        url: Source YouTube URL
        concepts: Found concepts
        skills: Matched skills

    Returns:
        Database ID of inserted record
    """
    print(f"\n[7/7] Saving to database...")

    if not DB_PATH.exists():
        raise RuntimeError(f"Database not found: {DB_PATH}")

    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()

        # Compute file hash
        file_content = file_path.read_bytes()
        file_hash = hashlib.sha256(file_content).hexdigest()

        # Build generation prompt (for reference)
        generation_prompt = f"Generated from YouTube: {url}"

        # Skills used (JSON)
        skills_used = json.dumps([s["name"] for s in skills])

        # Insert record
        cursor.execute('''
            INSERT INTO scripts (
                project_id,
                name,
                description,
                file_path,
                file_hash,
                generation_prompt,
                skills_used,
                deployment_status,
                compilation_status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            project_id,
            name,
            description,
            str(file_path),
            file_hash,
            generation_prompt,
            skills_used,
            "local",
            "untested",
        ))

        script_id = cursor.lastrowid
        conn.commit()
        conn.close()

        print(f"  Saved to database (ID: {script_id})")
        return script_id

    except sqlite3.Error as e:
        raise RuntimeError(f"Database error: {e}")


# =============================================================================
# Main
# =============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="Generate NinjaTrader code from YouTube video transcripts",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Generate Strategy Architecture Document (default)
  uv run python -m runtime.harness scripts/generate_from_youtube.py \\
      --url "https://youtube.com/watch?v=abc123" \\
      --project-id 1

  # Use legacy code generation (old behavior)
  uv run python -m runtime.harness scripts/generate_from_youtube.py \\
      --url "https://youtube.com/watch?v=xyz789" \\
      --project-id 1 \\
      --legacy-codegen \\
      --type strategy
        """,
    )

    parser.add_argument(
        "--url",
        required=True,
        help="YouTube video URL",
    )
    parser.add_argument(
        "--project-id",
        type=int,
        required=True,
        help="Project ID for database entry",
    )
    parser.add_argument(
        "--type",
        choices=["auto", "indicator", "strategy"],
        default="auto",
        help="Content type for legacy codegen (default: auto-detect)",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help=f"Output directory for legacy codegen (default: {DEFAULT_OUTPUT_DIR})",
    )
    parser.add_argument(
        "--extract-skills",
        action="store_true",
        default=True,
        help="Extract and save new skills from video (default: True)",
    )
    parser.add_argument(
        "--no-extract-skills",
        action="store_false",
        dest="extract_skills",
        help="Disable skill extraction",
    )
    parser.add_argument(
        "--confirm-skills",
        action="store_true",
        default=False,
        help="Ask for confirmation before saving each skill",
    )
    parser.add_argument(
        "--skip-generation",
        action="store_true",
        default=False,
        help="Extract skills only, skip SAD/code generation",
    )
    parser.add_argument(
        "--legacy-codegen",
        action="store_true",
        default=False,
        help="Use legacy code generation instead of Strategy Architecture Document output",
    )
    # Frame extraction arguments (multimodal support)
    parser.add_argument(
        "--with-frames",
        action="store_true",
        default=False,
        help="Extract video frames for Claude Code vision analysis",
    )
    parser.add_argument(
        "--frame-interval",
        type=int,
        default=45,
        help="Seconds between frame extractions (default: 45)",
    )
    parser.add_argument(
        "--max-frames",
        type=int,
        default=15,
        help="Maximum frames to extract (default: 15)",
    )
    parser.add_argument(
        "--keep-frames",
        action="store_true",
        default=False,
        help="Keep frames after processing (don't delete temp-frames)",
    )

    args = parser.parse_args()

    # Banner
    print("=" * 60)
    print(f"YouTube to NinjaTrader Pipeline")
    print(f"URL: {args.url}")
    if args.skip_generation:
        mode = "Skill extraction only"
    elif args.legacy_codegen:
        mode = "Legacy code generation"
    else:
        mode = "Strategy Architecture Document (SAD)"
    if args.with_frames:
        mode += " + Frame extraction"
    print(f"Mode: {mode}")
    print("=" * 60)

    try:
        # Track results for video processing record
        skills_extracted = []
        skills_matched = []
        skill_analysis = None  # Track for SAD generation

        # =====================================================================
        # PHASE 1: Transcript and Analysis
        # =====================================================================

        # Step 1: Fetch transcript
        transcript_data = fetch_transcript(args.url)
        transcript = transcript_data["transcript"]

        # Track video_id and frames_dir for cleanup
        video_id = None
        frames_dir = None

        # Step 1b: Extract video frames (if enabled)
        if args.with_frames:
            try:
                video_id = extract_video_id(args.url)
                frames_dir = extract_video_frames(
                    url=args.url,
                    video_id=video_id,
                    transcript_data=transcript_data,
                    frame_interval=args.frame_interval,
                    max_frames=args.max_frames,
                )

                # Print ready message for Claude Code
                print()
                print("=" * 60)
                print("  FRAMES READY FOR ANALYSIS")
                print("=" * 60)
                print(f"  Location: {frames_dir}")
                print(f"  Frames: {len(list(frames_dir.glob('*.jpg')))}")
                print(f"  Manifest: {frames_dir / 'manifest.json'}")
                print()
                print("  Claude Code can now read these frames for visual analysis.")
                print("=" * 60)
                print()

            except Exception as e:
                print(f"\n  Warning: Frame extraction failed: {e}")
                print("  Continuing with transcript-only analysis...")
                frames_dir = None

        # Step 2: Analyze concepts
        concepts = analyze_concepts(transcript)

        # Step 3: Get relevant existing skills
        skills = get_relevant_skills(concepts)
        skills_matched = [s.get("id") for s in skills if s.get("id")]

        # Check if this is a complete strategy video (used for auto-generation)
        is_complete_strategy = is_complete_strategy_video(concepts, transcript)

        # =====================================================================
        # PHASE 2: Skill Extraction (if enabled)
        # =====================================================================

        if args.extract_skills:
            # Step 3a: Check which concepts are new vs existing
            skill_analysis = find_new_vs_existing_skills(concepts, transcript)

            # For complete strategy videos, include ambiguous skills
            if is_complete_strategy:
                print("\n[AUTO] Complete strategy video detected!")
                # For complete strategies, also save ambiguous skills (bypass confirmation)
                if skill_analysis["ambiguous"]:
                    print(f"[AUTO] Including {len(skill_analysis['ambiguous'])} ambiguous skills for complete strategy")
                    skill_analysis["new_skills"].extend(skill_analysis["ambiguous"])
                    skill_analysis["ambiguous"] = []

            # Step 3b: Save new skills
            if skill_analysis["new_skills"]:
                saved_ids = save_new_skills(
                    skill_analysis["new_skills"],
                    transcript,
                    args.url,
                    confirm=args.confirm_skills,
                )
                skills_extracted = saved_ids

                # Refresh skills list with newly created
                if saved_ids:
                    skills = get_relevant_skills(concepts)

                # Step 3e: Generate indicators for new skills
                print(f"\n[3e/10] Generating indicators for new skills...")
                for skill_id in saved_ids:
                    # Get full skill data from database
                    try:
                        db_path = Path(__file__).parent.parent / "data" / "builder.db"
                        import sqlite3
                        conn = sqlite3.connect(db_path)
                        conn.row_factory = sqlite3.Row
                        cursor = conn.cursor()
                        cursor.execute("SELECT * FROM skills WHERE id = ?", (skill_id,))
                        row = cursor.fetchone()
                        conn.close()

                        if row:
                            skill = dict(row)
                            indicator_path = generate_indicator_for_skill(skill)
                            if indicator_path:
                                update_skill_indicator_path(skill_id, indicator_path)
                    except Exception as e:
                        print(f"    Warning: Could not generate indicator for skill {skill_id}: {e}")

            # Step 3c: Handle ambiguous and skipped
            if skill_analysis["ambiguous"] or skill_analysis["skip"]:
                if skill_analysis["skip"]:
                    print(f"\n  Skipped (matched existing skills):")
                    for concept in skill_analysis["skip"]:
                        match = concept.get("existing_match", {})
                        print(f"    - '{concept['name']}' -> '{match.get('name', 'unknown')}' (score: {concept.get('score', 0):.2f})")

                if skill_analysis["ambiguous"]:
                    print(f"\n  Ambiguous (similar to existing - skipped unless --confirm-skills):")
                    for concept in skill_analysis["ambiguous"]:
                        match = concept.get("existing_match", {})
                        print(f"    - '{concept['name']}' ~ '{match.get('name', 'unknown')}' (score: {concept.get('score', 0):.2f})")

            # Step 3d: Resolve dependencies for all relevant skills
            all_skill_ids = skills_matched + skills_extracted
            if all_skill_ids:
                dep_data = resolve_all_dependencies(all_skill_ids)
                # Use dependency-ordered skills for code generation
                if dep_data.get("dependency_order"):
                    skills = dep_data["dependency_order"]

        # =====================================================================
        # PHASE 3: Output Generation
        # =====================================================================

        if args.skip_generation:
            print()
            print("=" * 60)
            print("  Skill extraction complete (generation skipped)")
            print("=" * 60)
            print()
            print(f"Skills extracted: {len(skills_extracted)}")
            print(f"Skills matched: {len(skills_matched)}")
            print()

            # Record video processing even without generation
            record_video_processed(
                args.url,
                f"YouTube video",
                skills_extracted,
                skills_matched,
            )
            return

        # =====================================================================
        # BRANCH: SAD Generation (default) vs Legacy Code Generation
        # =====================================================================

        if args.legacy_codegen:
            # -----------------------------------------------------------------
            # LEGACY PATH: Generate C# code directly
            # -----------------------------------------------------------------

            # Step 4: Classify content type
            content_type = classify_content_type(transcript, concepts, args.type)

            # Step 5: Generate code
            code, filename = generate_code(content_type, concepts, skills, args.url)

            # Step 6: Save file
            file_path = save_file(code, filename, content_type, args.output_dir)

            # Step 7: Save to database
            name = filename.replace(".cs", "")
            description = f"Auto-generated {content_type} from YouTube video"
            script_id = save_to_database(
                args.project_id,
                name,
                description,
                file_path,
                args.url,
                concepts,
                skills,
            )

            # Step 10: Record video processing
            record_video_processed(
                args.url,
                f"YouTube: {name}",
                skills_extracted,
                skills_matched,
            )

            # Success summary
            print()
            print("=" * 60)
            print(f"  {content_type.upper()} generated successfully!")
            print("=" * 60)
            print()
            print(f"File: {file_path}")
            print(f"Type: {content_type}")
            print(f"Database ID: {script_id}")
            if skills_extracted:
                print(f"New skills saved: {len(skills_extracted)}")
            if skills_matched:
                print(f"Existing skills used: {len(skills_matched)}")
            print()
            print("Next steps:")
            print("1. Open in NinjaTrader and compile (F5 or Tools -> Compile)")
            print("2. Review generated code and refine logic")
            if content_type == "strategy":
                print("3. Backtest in Strategy Analyzer before live trading")
            else:
                print("3. Add to chart to verify behavior")
            print()

        else:
            # -----------------------------------------------------------------
            # DEFAULT PATH: Generate Strategy Architecture Document (SAD)
            # -----------------------------------------------------------------

            # Step 4: Generate SAD
            sad_content, sad_filename = generate_architecture_document(
                concepts,
                skills,
                transcript,
                args.url,
                skill_analysis=skill_analysis,
            )

            # Step 5: Save SAD
            sad_path = save_architecture_document(sad_content, sad_filename)

            # Step 6: Auto-generate Strategy.cs for complete strategy videos
            strategy_path = None
            if is_complete_strategy:
                print("\n[AUTO] Generating Strategy.cs for complete strategy...")
                strategy_name = sad_filename.replace('.md', '')
                strategy_code = generate_strategy_code(
                    name=strategy_name,
                    description=f"Auto-generated from YouTube: {args.url}",
                    concepts=concepts,
                    skills=skills,
                    url=args.url,
                )
                strategy_filename = f"{sanitize_name(strategy_name)}Strategy.cs"
                strategy_path = save_file(
                    strategy_code,
                    strategy_filename,
                    "strategy",
                    args.output_dir,
                )
                print(f"[AUTO] Strategy saved: {strategy_path}")

            # Step 10: Record video processing
            record_video_processed(
                args.url,
                f"SAD: {sad_filename.replace('.md', '')}",
                skills_extracted,
                skills_matched,
            )

            # Success summary
            print()
            print("=" * 60)
            if strategy_path:
                print("  Complete Strategy Generated!")
            else:
                print("  Strategy Architecture Document generated!")
            print("=" * 60)
            print()
            print(f"SAD: {sad_path}")
            if strategy_path:
                print(f"Strategy: {strategy_path}")
            if skills_extracted:
                print(f"New skills saved: {len(skills_extracted)}")
            if skills_matched:
                print(f"Existing skills matched: {len(skills_matched)}")
            print()
            if strategy_path:
                print("Next steps:")
                print("  1. Open strategy in NinjaTrader and compile (F5)")
                print("  2. Backtest in Strategy Analyzer")
                print("  3. Review and refine entry/exit logic")
            else:
                print("Next steps:")
                sad_name = sad_filename.replace(".md", "")
                print(f"  Run '/implement-strategy {sad_name}' to generate code")
                print()
                print("Or review and edit the SAD first:")
                print(f"  1. Open {sad_path}")
                print("  2. Fill in TODOs and answer User Questions")
                print("  3. Run /implement-strategy when ready")
            print()

        # Cleanup frames (unless --keep-frames)
        if frames_dir and video_id and not args.keep_frames:
            cleanup_frames(video_id)

    except RuntimeError as e:
        print(f"\n  ERROR: {e}")
        # Cleanup on error too (unless --keep-frames)
        if video_id and not args.keep_frames:
            cleanup_frames(video_id)
        sys.exit(1)
    except KeyboardInterrupt:
        print("\n\nCancelled by user")
        if video_id and not args.keep_frames:
            cleanup_frames(video_id)
        sys.exit(130)
    except Exception as e:
        print(f"\n  UNEXPECTED ERROR: {e}")
        import traceback
        traceback.print_exc()
        if video_id and not args.keep_frames:
            cleanup_frames(video_id)
        sys.exit(1)


if __name__ == "__main__":
    main()
