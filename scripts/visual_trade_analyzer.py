#!/usr/bin/env python3
"""
Visual Trade Analyzer - Extract Trade Mechanics from Video Frames

Uses Claude vision to analyze trading video frames and extract:
1. Price levels (entry, stop, target)
2. Zone boundaries (FVG, OB, Swing)
3. Stop reference points (CISD candle, OB body, etc.)
4. Entry reference points (OB close, FVG 50%, etc.)

This solves the transcript-to-code gap where ambiguous text like
"stop below order block" could mean OB body, OB wick, or CISD candle.

USAGE:
    python scripts/visual_trade_analyzer.py --frame data/video-frames/VIDEO_ID/frame_008.jpg
    python scripts/visual_trade_analyzer.py --video-id 9AL41xON3hA --find-trades
    python scripts/visual_trade_analyzer.py --frame frame.jpg --extract-levels

DEPENDENCIES:
    - anthropic (Claude API)
    - Pillow (image handling)
"""

import argparse
import base64
import json
import os
import re
import sqlite3
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Optional, Any
from datetime import datetime


# =============================================================================
# Configuration
# =============================================================================

# Default tick sizes by instrument
TICK_SIZES = {
    "ES": 0.25,
    "NQ": 0.25,
    "MES": 0.25,
    "MNQ": 0.25,
    "CL": 0.01,
    "GC": 0.10,
    "EURUSD": 0.0001,
    "USDJPY": 0.01,
    "DEFAULT": 0.25
}


# =============================================================================
# Data Structures
# =============================================================================

@dataclass
class PriceLevel:
    """A price level extracted from a frame."""
    price: float
    label: str  # What is marked on the chart
    level_type: str  # "entry", "stop", "target", "zone_high", "zone_low", "swing"
    confidence: float  # 0-1, how clear the level is


@dataclass
class ZoneInfo:
    """Information about a highlighted zone (FVG, OB, etc.)."""
    zone_type: str  # "FVG", "OB", "DEMAND", "SUPPLY", "SWING"
    high: float
    low: float
    color: Optional[str]  # "yellow", "blue", "gray", etc.
    is_active: bool  # Is price currently in/near this zone?


@dataclass
class TradeSetup:
    """A complete trade setup extracted from a frame."""
    direction: str  # "LONG" or "SHORT"
    entry_price: Optional[float]
    stop_price: Optional[float]
    target_price: Optional[float]

    # Reference point identification (KEY for code generation)
    stop_reference_point: Optional[str]  # "CISD_CANDLE_LOW", "OB_BODY_LOW", "FVG_BOTTOM"
    stop_reference_offset_ticks: Optional[float]  # Additional buffer beyond reference
    entry_reference_point: Optional[str]  # "OB_CLOSE", "FVG_50_PCT", "SWING_LEVEL"
    entry_reference_offset_ticks: Optional[float]

    # Calculated values
    stop_distance_ticks: Optional[float]
    risk_reward_ratio: Optional[float]

    # Context
    zones: list[ZoneInfo] = field(default_factory=list)
    price_levels: list[PriceLevel] = field(default_factory=list)


@dataclass
class FrameAnalysis:
    """Complete analysis of a single video frame."""
    frame_path: str
    frame_number: Optional[int]
    timestamp_seconds: Optional[float]

    # What's visible on the chart
    instrument: Optional[str]
    timeframe: Optional[str]
    current_price: Optional[float]

    # Trade-related content
    has_trade_setup: bool
    trade_setup: Optional[TradeSetup]

    # Zone and level detection
    zones_detected: list[ZoneInfo] = field(default_factory=list)
    levels_detected: list[PriceLevel] = field(default_factory=list)

    # Frame category
    frame_type: str  # "trade_entry", "trade_exit", "explanation", "pattern", "skip"

    # Analysis metadata
    analysis_confidence: float
    analysis_notes: str
    raw_vision_response: Optional[str] = None


# =============================================================================
# Vision Analysis Prompts
# =============================================================================

TRADE_EXTRACTION_PROMPT = """Analyze this trading chart screenshot and extract trade setup information.

Look for:
1. **Entry/Stop/Target markers** - Lines, boxes, or labels showing trade levels
2. **Zone highlighting** - Colored zones (FVG=yellow, OB=gray/blue, demand/supply)
3. **Position info boxes** - Showing entry price, stop, target, P/L
4. **Candle patterns** - CISD candles, order blocks, swing points

Extract and return JSON with this structure:
{
    "has_trade": true/false,
    "direction": "LONG" or "SHORT" or null,
    "entry_price": number or null,
    "stop_price": number or null,
    "target_price": number or null,
    "stop_reference": {
        "reference_point": "CISD_CANDLE_LOW" | "OB_BODY_LOW" | "OB_WICK_LOW" | "FVG_BOTTOM" | "SWING_LOW" | null,
        "how_identified": "description of how you determined this"
    },
    "entry_reference": {
        "reference_point": "OB_CLOSE" | "FVG_50_PCT" | "FVG_TOP" | "SWING_LEVEL" | null,
        "how_identified": "description"
    },
    "zones": [
        {"type": "FVG/OB/SWING", "high": number, "low": number, "color": "yellow/blue/gray"}
    ],
    "instrument": "ES/NQ/EURUSD/etc" or null,
    "timeframe": "5m/1h/1d/etc" or null,
    "current_price": number or null,
    "confidence": 0.0 to 1.0,
    "notes": "additional observations"
}

IMPORTANT for stop_reference:
- If stop is just below a candle that closed through a series (CISD), it's CISD_CANDLE_LOW
- If stop is below the BODY of an order block (ignoring wicks), it's OB_BODY_LOW
- If stop is below the WICK of an order block (including wicks), it's OB_WICK_LOW
- If stop is at the bottom of a fair value gap, it's FVG_BOTTOM
- Measure the actual stop distance to help determine reference

Return ONLY valid JSON, no other text."""

FRAME_CLASSIFICATION_PROMPT = """Classify this trading video frame into one of these categories:

1. **trade_entry** - Shows an actual trade being taken (entry line, position box visible)
2. **trade_exit** - Shows trade exit/result (P/L visible, closed position)
3. **pattern** - Shows a pattern without a trade (FVG, OB, swing point explanation)
4. **explanation** - Educational diagram or concept explanation
5. **skip** - Intro/outro, face cam, irrelevant content

Return JSON:
{
    "frame_type": "trade_entry/trade_exit/pattern/explanation/skip",
    "has_trade_levels": true/false,
    "concepts_shown": ["FVG", "CISD", "order_block", etc],
    "confidence": 0.0 to 1.0,
    "notes": "brief description"
}

Return ONLY valid JSON."""


# =============================================================================
# Visual Trade Analyzer Class
# =============================================================================

class VisualTradeAnalyzer:
    """Analyzes trading video frames using Claude vision."""

    def __init__(self, db_path: Optional[Path] = None):
        self.db_path = db_path or Path("data/builder.db")
        self.api_key = os.environ.get("ANTHROPIC_API_KEY")
        if not self.api_key:
            raise ValueError("ANTHROPIC_API_KEY environment variable required")

    def _encode_image(self, image_path: Path) -> tuple[str, str]:
        """Encode image to base64 for Claude API."""
        with open(image_path, "rb") as f:
            image_data = base64.b64encode(f.read()).decode("utf-8")

        suffix = image_path.suffix.lower()
        media_types = {
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".png": "image/png",
            ".gif": "image/gif",
            ".webp": "image/webp"
        }
        media_type = media_types.get(suffix, "image/jpeg")

        return image_data, media_type

    def _call_claude_vision(self, image_path: Path, prompt: str) -> str:
        """Call Claude API with vision capabilities."""
        import anthropic

        client = anthropic.Anthropic(api_key=self.api_key)
        image_data, media_type = self._encode_image(image_path)

        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=2000,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": media_type,
                                "data": image_data
                            }
                        },
                        {
                            "type": "text",
                            "text": prompt
                        }
                    ]
                }
            ]
        )

        return response.content[0].text

    def _parse_json_response(self, response: str) -> dict:
        """Parse JSON from Claude response, handling markdown code blocks."""
        # Try to extract JSON from markdown code blocks
        json_match = re.search(r'```(?:json)?\s*([\s\S]*?)\s*```', response)
        if json_match:
            response = json_match.group(1)

        # Clean up common issues
        response = response.strip()

        try:
            return json.loads(response)
        except json.JSONDecodeError:
            # Try to find JSON object in response
            match = re.search(r'\{[\s\S]*\}', response)
            if match:
                try:
                    return json.loads(match.group())
                except json.JSONDecodeError:
                    pass
            return {"error": "Failed to parse response", "raw": response}

    def classify_frame(self, image_path: Path) -> dict:
        """Classify a frame into categories."""
        response = self._call_claude_vision(image_path, FRAME_CLASSIFICATION_PROMPT)
        return self._parse_json_response(response)

    def extract_trade_setup(self, image_path: Path, instrument: str = "ES") -> FrameAnalysis:
        """Extract trade setup information from a frame."""
        response = self._call_claude_vision(image_path, TRADE_EXTRACTION_PROMPT)
        data = self._parse_json_response(response)

        # Calculate tick values
        tick_size = TICK_SIZES.get(instrument, TICK_SIZES["DEFAULT"])

        trade_setup = None
        if data.get("has_trade"):
            entry = data.get("entry_price")
            stop = data.get("stop_price")
            target = data.get("target_price")

            # Calculate stop distance in ticks
            stop_distance = None
            if entry and stop:
                stop_distance = abs(entry - stop) / tick_size

            # Calculate R:R ratio
            rr_ratio = None
            if entry and stop and target:
                risk = abs(entry - stop)
                reward = abs(target - entry)
                if risk > 0:
                    rr_ratio = reward / risk

            # Build zones list
            zones = []
            for zone_data in data.get("zones", []):
                zones.append(ZoneInfo(
                    zone_type=zone_data.get("type", "UNKNOWN"),
                    high=zone_data.get("high", 0),
                    low=zone_data.get("low", 0),
                    color=zone_data.get("color"),
                    is_active=True
                ))

            trade_setup = TradeSetup(
                direction=data.get("direction"),
                entry_price=entry,
                stop_price=stop,
                target_price=target,
                stop_reference_point=data.get("stop_reference", {}).get("reference_point"),
                stop_reference_offset_ticks=3.0,  # Default buffer
                entry_reference_point=data.get("entry_reference", {}).get("reference_point"),
                entry_reference_offset_ticks=0.0,
                stop_distance_ticks=stop_distance,
                risk_reward_ratio=rr_ratio,
                zones=zones
            )

        return FrameAnalysis(
            frame_path=str(image_path),
            frame_number=None,
            timestamp_seconds=None,
            instrument=data.get("instrument"),
            timeframe=data.get("timeframe"),
            current_price=data.get("current_price"),
            has_trade_setup=data.get("has_trade", False),
            trade_setup=trade_setup,
            zones_detected=[],
            levels_detected=[],
            frame_type="trade_entry" if data.get("has_trade") else "pattern",
            analysis_confidence=data.get("confidence", 0.5),
            analysis_notes=data.get("notes", ""),
            raw_vision_response=response
        )

    def find_trade_frames(self, video_id: str) -> list[Path]:
        """Find frames in a video that likely contain trade setups."""
        video_dir = Path(f"data/video-frames/{video_id}")
        if not video_dir.exists():
            raise ValueError(f"Video directory not found: {video_dir}")

        frames = sorted(video_dir.glob("frame_*.jpg"))
        trade_frames = []

        for frame_path in frames:
            classification = self.classify_frame(frame_path)
            if classification.get("frame_type") in ["trade_entry", "trade_exit"]:
                trade_frames.append(frame_path)
            elif classification.get("has_trade_levels"):
                trade_frames.append(frame_path)

        return trade_frames

    def analyze_video_trades(self, video_id: str, instrument: str = "ES") -> list[FrameAnalysis]:
        """Analyze all trade frames in a video."""
        trade_frames = self.find_trade_frames(video_id)
        analyses = []

        for frame_path in trade_frames:
            try:
                analysis = self.extract_trade_setup(frame_path, instrument)
                if analysis.has_trade_setup:
                    analyses.append(analysis)
            except Exception as e:
                print(f"Error analyzing {frame_path}: {e}")

        return analyses

    def save_trade_example(self, analysis: FrameAnalysis, video_id: str, model_id: Optional[int] = None):
        """Save extracted trade example to database."""
        if not analysis.has_trade_setup or not analysis.trade_setup:
            return None

        trade = analysis.trade_setup

        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute("""
            INSERT INTO trade_examples (
                video_id, model_id, frame_path, frame_number, timestamp_seconds,
                direction, entry_price, stop_price, target_price,
                stop_distance_ticks, stop_reference_point, stop_reference_measurement,
                entry_reference_point, entry_reference_measurement,
                target_rr_ratio, extraction_confidence, analysis_notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            video_id,
            model_id,
            analysis.frame_path,
            analysis.frame_number,
            analysis.timestamp_seconds,
            trade.direction,
            trade.entry_price,
            trade.stop_price,
            trade.target_price,
            trade.stop_distance_ticks,
            trade.stop_reference_point,
            json.dumps({"anchor": trade.stop_reference_point, "offset_ticks": trade.stop_reference_offset_ticks}),
            trade.entry_reference_point,
            json.dumps({"anchor": trade.entry_reference_point, "offset_ticks": trade.entry_reference_offset_ticks}),
            trade.risk_reward_ratio,
            analysis.analysis_confidence,
            analysis.analysis_notes
        ))

        trade_id = cursor.lastrowid
        conn.commit()
        conn.close()

        return trade_id


# =============================================================================
# CLI Entry Point
# =============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="Extract trade mechanics from video frames using Claude vision"
    )
    parser.add_argument(
        "--frame",
        type=Path,
        help="Single frame to analyze"
    )
    parser.add_argument(
        "--video-id",
        type=str,
        help="Video ID to scan for trade frames"
    )
    parser.add_argument(
        "--find-trades",
        action="store_true",
        help="Find frames with trade setups"
    )
    parser.add_argument(
        "--extract-levels",
        action="store_true",
        help="Extract price levels from frame"
    )
    parser.add_argument(
        "--instrument",
        type=str,
        default="ES",
        help="Instrument for tick size (default: ES)"
    )
    parser.add_argument(
        "--save",
        action="store_true",
        help="Save results to database"
    )
    parser.add_argument(
        "--model-id",
        type=int,
        help="Model ID to associate trades with"
    )
    parser.add_argument(
        "--output",
        type=Path,
        help="Output JSON file for results"
    )

    args = parser.parse_args()

    analyzer = VisualTradeAnalyzer()

    if args.frame:
        if args.extract_levels:
            result = analyzer.extract_trade_setup(args.frame, args.instrument)
        else:
            result = analyzer.classify_frame(args.frame)

        if isinstance(result, FrameAnalysis):
            output = asdict(result)
        else:
            output = result

        if args.save and isinstance(result, FrameAnalysis):
            video_id = args.video_id or args.frame.parent.name
            trade_id = analyzer.save_trade_example(result, video_id, args.model_id)
            output["saved_trade_id"] = trade_id

        print(json.dumps(output, indent=2, default=str))

        if args.output:
            with open(args.output, "w") as f:
                json.dump(output, f, indent=2, default=str)

    elif args.video_id:
        if args.find_trades:
            trade_frames = analyzer.find_trade_frames(args.video_id)
            print(f"Found {len(trade_frames)} frames with potential trades:")
            for frame in trade_frames:
                print(f"  - {frame.name}")
        else:
            analyses = analyzer.analyze_video_trades(args.video_id, args.instrument)
            output = [asdict(a) for a in analyses]

            if args.save:
                for analysis in analyses:
                    analyzer.save_trade_example(analysis, args.video_id, args.model_id)

            print(json.dumps(output, indent=2, default=str))

            if args.output:
                with open(args.output, "w") as f:
                    json.dump(output, f, indent=2, default=str)

    else:
        parser.print_help()


if __name__ == "__main__":
    main()
