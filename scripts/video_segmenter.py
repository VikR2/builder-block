#!/usr/bin/env python3
"""
Video Segmenter - Multi-Signal Concept Boundary Detection

Detects concept boundaries in trading videos using multiple signals:
1. Frame changes (visual diff)
2. Concept transition markers (linguistic)
3. Category changes (entry/exit/stop/context)
4. Pauses in speech (> 2 seconds)
5. Emphasis detection (intensifiers, rhetorical questions, teaching markers)
6. Extended explanations (high concept density over static chart)

This module is used by the reflective YouTube extraction workflow to create
intelligent segments for analysis rather than fixed-interval frame extraction.

USAGE:
    from video_segmenter import segment_video

    segments = segment_video(
        frames_dir=Path("data/temp-frames/abc123"),
        transcript="...",
        timed_transcript=[{"start": 0, "end": 5, "text": "..."}]
    )
"""

import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional
import struct
import math


# =============================================================================
# Data Structures
# =============================================================================

@dataclass
class Signal:
    """A detected signal that may indicate a segment boundary."""
    signal_type: str  # frame_change, concept_marker, category_change, pause, emphasis, explanation
    timestamp_seconds: float
    confidence: float = 1.0
    details: dict = field(default_factory=dict)


@dataclass
class Segment:
    """A video segment representing a coherent concept explanation."""
    segment_index: int
    start_seconds: float
    end_seconds: float
    trigger: str  # What triggered this segment
    trigger_details: dict
    frame_path: Optional[str]  # Best representative frame
    transcript: str
    detected_categories: list[str]
    is_explanation: bool  # True when presenter is teaching over static chart
    concept_density: float = 0.0


# =============================================================================
# Constants
# =============================================================================

# Concept transition phrases that indicate new topic
TRANSITION_PHRASES = [
    "now", "next", "so when", "here's the key", "important thing",
    "the trick is", "what you want to see", "this is where",
    "let me show you", "pay attention to", "notice how",
    "the first thing", "second thing", "finally",
    "moving on", "another thing", "also important",
]

# Trading category keywords
CATEGORY_KEYWORDS = {
    "entry": ["entry", "enter", "get in", "trigger", "signal", "long", "short", "buy", "sell"],
    "exit": ["exit", "get out", "take profit", "target", "close"],
    "stop": ["stop", "risk", "invalidation", "protect", "loss", "stop loss", "stoploss"],
    "context": ["bias", "trend", "session", "range", "setup", "structure", "market structure"],
}

# Emphasis detection patterns
INTENSIFIERS = [
    "very", "really", "absolutely", "always", "never", "must",
    "crucial", "critical", "essential", "key", "important",
    "this is where", "this is when", "this is how",
    "extremely", "definitely", "certainly",
]

RHETORICAL_PHRASES = [
    "do you see", "you see what", "make sense", "right?",
    "you understand", "get it?", "follow me", "with me so far",
    "see how", "notice that", "understand?",
]

TEACHING_MARKERS = [
    "remember this", "don't forget", "write this down", "key thing",
    "the trick is", "the secret is", "what separates", "the difference",
    "this is why", "that's why", "because", "the reason",
    "pay attention", "focus on", "keep in mind",
]

# Trading concepts for density calculation
TRADING_CONCEPTS = [
    # Entry concepts
    "entry", "enter", "long", "short", "buy", "sell", "trigger",
    # Exit concepts
    "exit", "target", "profit", "stop", "loss",
    # Price action
    "sweep", "liquidity", "wick", "rejection", "breakout", "breakdown",
    "support", "resistance", "range", "consolidation",
    # Session/context
    "open", "close", "session", "london", "new york", "asia",
    # Technical
    "fvg", "imbalance", "order block", "mitigation", "displacement",
    "cisd", "bos", "choch", "fair value gap",
]


# =============================================================================
# Frame Change Detection
# =============================================================================

def detect_frame_changes(frames_dir: Path, threshold: float = 0.3) -> list[Signal]:
    """
    Detect significant visual changes between consecutive frames.

    Uses pixel difference to identify when the chart/visual changes.
    Returns timestamps where significant changes occur.
    """
    signals = []
    frame_files = sorted(frames_dir.glob("frame_*.jpg"))

    if len(frame_files) < 2:
        return signals

    # Read manifest to get frame timestamps
    manifest_path = frames_dir / "manifest.json"
    if not manifest_path.exists():
        return signals

    try:
        manifest = json.loads(manifest_path.read_text())
        frame_timestamps = {f["file"]: f["timestamp_sec"] for f in manifest.get("frames", [])}
    except (json.JSONDecodeError, KeyError):
        return signals

    prev_frame_data = None

    for frame_file in frame_files:
        try:
            # Simple file size comparison as proxy for content change
            # In production, use PIL or cv2 for proper image comparison
            current_size = frame_file.stat().st_size

            if prev_frame_data is not None:
                prev_size = prev_frame_data["size"]
                # Size difference ratio as change indicator
                diff_ratio = abs(current_size - prev_size) / max(prev_size, 1)

                if diff_ratio > threshold:
                    timestamp = frame_timestamps.get(frame_file.name, 0)
                    signals.append(Signal(
                        signal_type="frame_change",
                        timestamp_seconds=timestamp,
                        confidence=min(diff_ratio / threshold, 1.0),
                        details={
                            "prev_frame": prev_frame_data["file"],
                            "curr_frame": frame_file.name,
                            "diff_ratio": round(diff_ratio, 3),
                        }
                    ))

            prev_frame_data = {"file": frame_file.name, "size": current_size}

        except Exception:
            continue

    return signals


# =============================================================================
# Transcript Analysis
# =============================================================================

def parse_timed_transcript(timed_transcript: list[dict]) -> list[dict]:
    """Normalize timed transcript format."""
    segments = []
    for item in timed_transcript:
        segments.append({
            "start": item.get("start", item.get("start_seconds", 0)),
            "end": item.get("end", item.get("end_seconds", 0)),
            "text": item.get("text", ""),
        })
    return segments


def detect_concept_transitions(timed_transcript: list[dict]) -> list[Signal]:
    """
    Detect concept transition phrases in transcript.

    Identifies linguistic markers that indicate a new topic is being introduced.
    """
    signals = []
    segments = parse_timed_transcript(timed_transcript)

    for segment in segments:
        text = segment["text"].lower()

        for phrase in TRANSITION_PHRASES:
            if phrase in text:
                signals.append(Signal(
                    signal_type="concept_marker",
                    timestamp_seconds=segment["start"],
                    confidence=0.8,
                    details={
                        "marker": phrase,
                        "text_snippet": text[:100],
                    }
                ))
                break  # One signal per segment

    return signals


def detect_category_transitions(timed_transcript: list[dict]) -> list[Signal]:
    """
    Detect when presenter switches between trading concept categories.

    Categories: entry, exit, stop, context
    """
    signals = []
    segments = parse_timed_transcript(timed_transcript)

    prev_category = None

    for segment in segments:
        text = segment["text"].lower()

        # Detect primary category for this segment
        category_scores = {}
        for category, keywords in CATEGORY_KEYWORDS.items():
            score = sum(1 for kw in keywords if kw in text)
            if score > 0:
                category_scores[category] = score

        if category_scores:
            current_category = max(category_scores, key=category_scores.get)

            if prev_category and current_category != prev_category:
                signals.append(Signal(
                    signal_type="category_change",
                    timestamp_seconds=segment["start"],
                    confidence=0.9,
                    details={
                        "from_category": prev_category,
                        "to_category": current_category,
                        "text_snippet": text[:100],
                    }
                ))

            prev_category = current_category

    return signals


def detect_pauses(timed_transcript: list[dict], min_pause: float = 2.0) -> list[Signal]:
    """
    Detect significant pauses (gaps) in speech.

    Gaps of 2+ seconds often indicate topic boundaries.
    """
    signals = []
    segments = parse_timed_transcript(timed_transcript)

    for i in range(1, len(segments)):
        prev_end = segments[i - 1]["end"]
        curr_start = segments[i]["start"]
        gap = curr_start - prev_end

        if gap >= min_pause:
            signals.append(Signal(
                signal_type="pause",
                timestamp_seconds=curr_start,
                confidence=min(gap / 5.0, 1.0),  # Longer pauses = higher confidence
                details={
                    "gap_seconds": round(gap, 2),
                }
            ))

    return signals


def detect_emphasis(timed_transcript: list[dict]) -> list[Signal]:
    """
    Detect emphasis points where presenter is stressing a key concept.

    Signals:
    1. Intensifier words ("very", "really", "absolutely", etc.)
    2. Rhetorical questions ("do you see?", "right?", "make sense?")
    3. Teaching markers ("remember this", "key thing", etc.)
    """
    signals = []
    segments = parse_timed_transcript(timed_transcript)

    all_markers = INTENSIFIERS + RHETORICAL_PHRASES + TEACHING_MARKERS

    for segment in segments:
        text = segment["text"].lower()
        matched_markers = [m for m in all_markers if m in text]

        if matched_markers:
            signals.append(Signal(
                signal_type="emphasis",
                timestamp_seconds=segment["start"],
                confidence=min(len(matched_markers) * 0.3, 1.0),
                details={
                    "markers_found": matched_markers[:5],  # Limit for readability
                    "text_snippet": text[:100],
                }
            ))

    return signals


def calculate_concept_density(text: str) -> float:
    """
    Count trading concepts per minute of speech.

    High density = presenter explaining/teaching
    Low density = showing action on chart
    """
    text_lower = text.lower()
    concept_count = sum(1 for concept in TRADING_CONCEPTS if concept in text_lower)

    # Estimate words per minute (average speech ~150 wpm)
    word_count = len(text.split())
    minutes = word_count / 150.0

    return concept_count / max(minutes, 0.1)  # Avoid division by zero


def detect_extended_explanations(
    frames_dir: Path,
    timed_transcript: list[dict],
    min_static_duration: float = 15.0,
    min_concept_density: float = 2.0,
) -> list[Signal]:
    """
    Detect segments where presenter explains concepts over a static chart.

    Key insight: When frame doesn't change but transcript has high concept density,
    this is often the most valuable teaching moment.
    """
    signals = []

    # Get frame timestamps
    manifest_path = frames_dir / "manifest.json"
    if not manifest_path.exists():
        return signals

    try:
        manifest = json.loads(manifest_path.read_text())
        frames = manifest.get("frames", [])
    except (json.JSONDecodeError, KeyError):
        return signals

    if len(frames) < 2:
        return signals

    # Find static periods (same frame for extended time)
    static_periods = []
    for i in range(len(frames) - 1):
        start_ts = frames[i]["timestamp_sec"]
        end_ts = frames[i + 1]["timestamp_sec"]
        duration = end_ts - start_ts

        if duration >= min_static_duration:
            static_periods.append({
                "start": start_ts,
                "end": end_ts,
                "duration": duration,
                "frame": frames[i].get("frame_path", frames[i].get("file", f"frame_{i:04d}.png")),
            })

    # Check concept density during static periods
    segments = parse_timed_transcript(timed_transcript)

    for period in static_periods:
        # Get transcript during this period
        relevant_text = []
        for seg in segments:
            if seg["start"] >= period["start"] and seg["end"] <= period["end"]:
                relevant_text.append(seg["text"])

        if relevant_text:
            combined_text = " ".join(relevant_text)
            density = calculate_concept_density(combined_text)

            if density >= min_concept_density:
                signals.append(Signal(
                    signal_type="explanation",
                    timestamp_seconds=period["start"],
                    confidence=min(density / 5.0, 1.0),
                    details={
                        "duration": round(period["duration"], 1),
                        "concept_density": round(density, 2),
                        "static_frame": period["frame"],
                    }
                ))

    return signals


# =============================================================================
# Signal Merging & Segment Creation
# =============================================================================

def merge_signals(signals: list[Signal], merge_window: float = 10.0) -> list[float]:
    """
    Merge nearby signals into segment boundaries.

    Signals within merge_window seconds are combined into a single boundary.
    """
    if not signals:
        return []

    # Sort by timestamp
    sorted_signals = sorted(signals, key=lambda s: s.timestamp_seconds)

    boundaries = []
    current_group = [sorted_signals[0]]

    for signal in sorted_signals[1:]:
        if signal.timestamp_seconds - current_group[-1].timestamp_seconds <= merge_window:
            current_group.append(signal)
        else:
            # Take the signal with highest confidence as the boundary
            best_signal = max(current_group, key=lambda s: s.confidence)
            boundaries.append({
                "timestamp": best_signal.timestamp_seconds,
                "trigger": best_signal.signal_type,
                "trigger_details": best_signal.details,
                "merged_from": len(current_group),
            })
            current_group = [signal]

    # Don't forget the last group
    if current_group:
        best_signal = max(current_group, key=lambda s: s.confidence)
        boundaries.append({
            "timestamp": best_signal.timestamp_seconds,
            "trigger": best_signal.signal_type,
            "trigger_details": best_signal.details,
            "merged_from": len(current_group),
        })

    return boundaries


def get_best_frame_for_segment(
    frames_dir: Path,
    start_seconds: float,
    end_seconds: float,
) -> Optional[str]:
    """Get the best representative frame for a segment."""
    manifest_path = frames_dir / "manifest.json"
    if not manifest_path.exists():
        return None

    try:
        manifest = json.loads(manifest_path.read_text())
        frames = manifest.get("frames", [])
    except (json.JSONDecodeError, KeyError):
        return None

    # Find frame closest to segment midpoint
    midpoint = (start_seconds + end_seconds) / 2
    best_frame = None
    best_distance = float("inf")

    for frame in frames:
        distance = abs(frame["timestamp_sec"] - midpoint)
        if distance < best_distance:
            best_distance = distance
            best_frame = frame.get("frame_path", frame.get("file", f"frame_{frame.get('index', 0):04d}.png"))

    return best_frame


def get_transcript_for_segment(
    timed_transcript: list[dict],
    start_seconds: float,
    end_seconds: float,
) -> str:
    """Get transcript text for a time range."""
    segments = parse_timed_transcript(timed_transcript)

    relevant_text = []
    for seg in segments:
        # Include segments that overlap with our range
        if seg["end"] >= start_seconds and seg["start"] <= end_seconds:
            relevant_text.append(seg["text"])

    return " ".join(relevant_text)


def get_categories_for_text(text: str) -> list[str]:
    """Detect trading categories mentioned in text."""
    text_lower = text.lower()
    categories = []

    for category, keywords in CATEGORY_KEYWORDS.items():
        if any(kw in text_lower for kw in keywords):
            categories.append(category)

    return categories


def create_segments(
    boundaries: list[dict],
    frames_dir: Path,
    timed_transcript: list[dict],
    video_duration: float,
) -> list[Segment]:
    """
    Create segments from boundary timestamps.
    """
    segments = []

    # Add start boundary if not present
    if not boundaries or boundaries[0]["timestamp"] > 5:
        boundaries.insert(0, {
            "timestamp": 0,
            "trigger": "start",
            "trigger_details": {},
            "merged_from": 1,
        })

    # Add end boundary
    boundaries.append({
        "timestamp": video_duration,
        "trigger": "end",
        "trigger_details": {},
        "merged_from": 1,
    })

    for i in range(len(boundaries) - 1):
        start = boundaries[i]["timestamp"]
        end = boundaries[i + 1]["timestamp"]

        # Skip very short segments
        if end - start < 5:
            continue

        transcript = get_transcript_for_segment(timed_transcript, start, end)
        frame_path = get_best_frame_for_segment(frames_dir, start, end)
        categories = get_categories_for_text(transcript)
        density = calculate_concept_density(transcript)

        # Determine if this is an explanation segment
        is_explanation = (
            boundaries[i]["trigger"] == "explanation" or
            density > 2.0
        )

        segments.append(Segment(
            segment_index=i,
            start_seconds=start,
            end_seconds=end,
            trigger=boundaries[i]["trigger"],
            trigger_details=boundaries[i]["trigger_details"],
            frame_path=frame_path,
            transcript=transcript,
            detected_categories=categories,
            is_explanation=is_explanation,
            concept_density=round(density, 2),
        ))

    return segments


# =============================================================================
# Main Entry Point
# =============================================================================

def segment_video(
    frames_dir: Path,
    transcript: str,
    timed_transcript: list[dict],
    video_duration: Optional[float] = None,
) -> list[Segment]:
    """
    Segment a video using multiple signals.

    Args:
        frames_dir: Directory containing extracted frames
        transcript: Full transcript text
        timed_transcript: List of {start, end, text} dicts
        video_duration: Total video duration in seconds

    Returns:
        List of Segment objects representing concept boundaries
    """
    print("  Detecting segment boundaries...")

    # Collect all signals
    signals = []

    # Signal 1: Frame changes (visual)
    frame_signals = detect_frame_changes(frames_dir, threshold=0.3)
    signals.extend(frame_signals)
    print(f"    Frame changes: {len(frame_signals)}")

    # Signal 2: Concept transition markers
    concept_signals = detect_concept_transitions(timed_transcript)
    signals.extend(concept_signals)
    print(f"    Concept markers: {len(concept_signals)}")

    # Signal 3: Category changes
    category_signals = detect_category_transitions(timed_transcript)
    signals.extend(category_signals)
    print(f"    Category changes: {len(category_signals)}")

    # Signal 4: Pauses
    pause_signals = detect_pauses(timed_transcript)
    signals.extend(pause_signals)
    print(f"    Pauses: {len(pause_signals)}")

    # Signal 5: Emphasis detection
    emphasis_signals = detect_emphasis(timed_transcript)
    signals.extend(emphasis_signals)
    print(f"    Emphasis points: {len(emphasis_signals)}")

    # Signal 6: Extended explanations
    explanation_signals = detect_extended_explanations(frames_dir, timed_transcript)
    signals.extend(explanation_signals)
    print(f"    Explanation segments: {len(explanation_signals)}")

    print(f"    Total signals: {len(signals)}")

    # Merge signals into boundaries
    boundaries = merge_signals(signals, merge_window=10.0)
    print(f"    Merged boundaries: {len(boundaries)}")

    # Estimate video duration if not provided
    if video_duration is None:
        if timed_transcript:
            video_duration = max(seg.get("end", 0) for seg in timed_transcript)
        else:
            video_duration = 600  # Default 10 minutes

    # Create segments
    segments = create_segments(boundaries, frames_dir, timed_transcript, video_duration)
    print(f"    Final segments: {len(segments)}")

    return segments


def segments_to_json(segments: list[Segment]) -> list[dict]:
    """Convert segments to JSON-serializable format."""
    return [
        {
            "segment_index": s.segment_index,
            "start_seconds": s.start_seconds,
            "end_seconds": s.end_seconds,
            "trigger": s.trigger,
            "trigger_details": s.trigger_details,
            "frame_path": s.frame_path,
            "transcript": s.transcript[:500] + "..." if len(s.transcript) > 500 else s.transcript,
            "detected_categories": s.detected_categories,
            "is_explanation": s.is_explanation,
            "concept_density": s.concept_density,
        }
        for s in segments
    ]


# =============================================================================
# CLI for Testing
# =============================================================================

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Segment video using multi-signal detection")
    parser.add_argument("frames_dir", type=Path, help="Directory with frames and manifest.json")
    parser.add_argument("--output", "-o", type=Path, help="Output JSON file")
    args = parser.parse_args()

    if not args.frames_dir.exists():
        print(f"Error: {args.frames_dir} does not exist")
        exit(1)

    manifest_path = args.frames_dir / "manifest.json"
    if not manifest_path.exists():
        print(f"Error: No manifest.json in {args.frames_dir}")
        exit(1)

    # Load manifest
    manifest = json.loads(manifest_path.read_text())

    # Build timed transcript from frames
    timed_transcript = [
        {
            "start": f["timestamp_sec"],
            "end": f["timestamp_sec"] + 45,  # Estimate
            "text": f.get("transcript_segment", ""),
        }
        for f in manifest.get("frames", [])
    ]

    # Run segmentation
    segments = segment_video(
        frames_dir=args.frames_dir,
        transcript=manifest.get("full_transcript", ""),
        timed_transcript=timed_transcript,
        video_duration=manifest.get("video_duration_sec"),
    )

    # Output
    output = segments_to_json(segments)

    if args.output:
        args.output.write_text(json.dumps(output, indent=2))
        print(f"\nSaved to {args.output}")
    else:
        print(json.dumps(output, indent=2))
