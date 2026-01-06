#!/usr/bin/env python3
"""
Trade Example Miner - Find and Catalog Trade Examples from Video Frames

Orchestrates visual_trade_analyzer to:
1. Scan video frames for trade setups
2. Extract stop/entry reference points
3. Calculate consistency patterns across trades
4. Generate trade example summaries for code generation

The key output is `stop_reference_point` - this determines code generation:
- "CISD_CANDLE_LOW" -> stopPrice = cisdCandleLow - buffer
- "OB_BODY_LOW" -> stopPrice = m5OBBodyLow - buffer
- "FVG_BOTTOM" -> stopPrice = fvgBottom - buffer

USAGE:
    python scripts/trade_example_miner.py --video-id 9AL41xON3hA
    python scripts/trade_example_miner.py --video-id 9AL41xON3hA --model-id 5 --save
    python scripts/trade_example_miner.py --analyze-consistency --video-id 9AL41xON3hA

DEPENDENCIES:
    - visual_trade_analyzer.py (in same directory)
    - anthropic (Claude API)
"""

import argparse
import json
import sqlite3
from collections import Counter
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Optional
from datetime import datetime

from visual_trade_analyzer import VisualTradeAnalyzer, FrameAnalysis, TradeSetup


# =============================================================================
# Data Structures
# =============================================================================

@dataclass
class TradeExampleSummary:
    """Summary of a mined trade example."""
    frame_path: str
    timestamp: Optional[float]
    direction: str
    entry_price: Optional[float]
    stop_price: Optional[float]
    target_price: Optional[float]
    stop_distance_ticks: Optional[float]
    stop_reference_point: Optional[str]
    entry_reference_point: Optional[str]
    confidence: float


@dataclass
class ConsistencyAnalysis:
    """Analysis of consistency across multiple trade examples."""
    video_id: str
    total_trades: int
    trades_with_stop_ref: int

    # Stop reference consistency
    stop_references_found: dict  # {"CISD_CANDLE_LOW": 3, "OB_BODY_LOW": 1}
    dominant_stop_reference: Optional[str]
    stop_reference_consistency: float  # 0-1, how consistent are stop references

    # Entry reference consistency
    entry_references_found: dict
    dominant_entry_reference: Optional[str]
    entry_reference_consistency: float

    # Stop distance patterns
    avg_stop_distance_ticks: Optional[float]
    stop_distance_range: tuple  # (min, max)

    # R:R patterns
    avg_rr_ratio: Optional[float]
    rr_range: tuple  # (min, max)

    # Recommendations
    recommended_stop_reference: str
    recommended_entry_reference: str
    confidence_score: float


@dataclass
class MiningResult:
    """Complete result of mining a video for trade examples."""
    video_id: str
    model_id: Optional[int]
    mined_at: str
    frames_scanned: int
    frames_with_trades: int
    trade_examples: list[TradeExampleSummary]
    consistency: Optional[ConsistencyAnalysis]


# =============================================================================
# Trade Example Miner Class
# =============================================================================

class TradeExampleMiner:
    """Mines trade examples from video frames and analyzes patterns."""

    def __init__(self, db_path: Optional[Path] = None):
        self.db_path = db_path or Path("data/builder.db")
        self.analyzer = VisualTradeAnalyzer(db_path)

    def mine_video(
        self,
        video_id: str,
        instrument: str = "ES",
        model_id: Optional[int] = None,
        save_to_db: bool = False
    ) -> MiningResult:
        """Mine all trade examples from a video."""
        video_dir = Path(f"data/video-frames/{video_id}")
        if not video_dir.exists():
            raise ValueError(f"Video directory not found: {video_dir}")

        # Get all frames
        all_frames = sorted(video_dir.glob("frame_*.jpg"))
        print(f"Scanning {len(all_frames)} frames in {video_id}...")

        trade_examples = []
        frames_with_trades = 0

        for frame_path in all_frames:
            try:
                # First classify to filter
                classification = self.analyzer.classify_frame(frame_path)

                if classification.get("frame_type") in ["trade_entry", "trade_exit"] or \
                   classification.get("has_trade_levels"):

                    # Full analysis
                    analysis = self.analyzer.extract_trade_setup(frame_path, instrument)

                    if analysis.has_trade_setup and analysis.trade_setup:
                        frames_with_trades += 1
                        trade = analysis.trade_setup

                        summary = TradeExampleSummary(
                            frame_path=str(frame_path),
                            timestamp=analysis.timestamp_seconds,
                            direction=trade.direction or "UNKNOWN",
                            entry_price=trade.entry_price,
                            stop_price=trade.stop_price,
                            target_price=trade.target_price,
                            stop_distance_ticks=trade.stop_distance_ticks,
                            stop_reference_point=trade.stop_reference_point,
                            entry_reference_point=trade.entry_reference_point,
                            confidence=analysis.analysis_confidence
                        )
                        trade_examples.append(summary)

                        if save_to_db:
                            self.analyzer.save_trade_example(analysis, video_id, model_id)

                        print(f"  Found trade: {frame_path.name} - {trade.direction} "
                              f"stop_ref={trade.stop_reference_point}")

            except Exception as e:
                print(f"  Error with {frame_path.name}: {e}")
                continue

        # Analyze consistency if we have enough trades
        consistency = None
        if len(trade_examples) >= 2:
            consistency = self._analyze_consistency(video_id, trade_examples)

        result = MiningResult(
            video_id=video_id,
            model_id=model_id,
            mined_at=datetime.now().isoformat(),
            frames_scanned=len(all_frames),
            frames_with_trades=frames_with_trades,
            trade_examples=trade_examples,
            consistency=consistency
        )

        if save_to_db:
            self._update_video_stats(video_id, result)

        return result

    def _analyze_consistency(
        self,
        video_id: str,
        trade_examples: list[TradeExampleSummary]
    ) -> ConsistencyAnalysis:
        """Analyze consistency patterns across trade examples."""

        # Count stop reference points
        stop_refs = [t.stop_reference_point for t in trade_examples if t.stop_reference_point]
        stop_ref_counts = Counter(stop_refs)

        # Count entry reference points
        entry_refs = [t.entry_reference_point for t in trade_examples if t.entry_reference_point]
        entry_ref_counts = Counter(entry_refs)

        # Calculate consistency scores
        stop_consistency = 0.0
        dominant_stop = None
        if stop_refs:
            dominant_stop = stop_ref_counts.most_common(1)[0][0]
            stop_consistency = stop_ref_counts[dominant_stop] / len(stop_refs)

        entry_consistency = 0.0
        dominant_entry = None
        if entry_refs:
            dominant_entry = entry_ref_counts.most_common(1)[0][0]
            entry_consistency = entry_ref_counts[dominant_entry] / len(entry_refs)

        # Stop distance stats
        stop_distances = [t.stop_distance_ticks for t in trade_examples if t.stop_distance_ticks]
        avg_stop = sum(stop_distances) / len(stop_distances) if stop_distances else None
        stop_range = (min(stop_distances), max(stop_distances)) if stop_distances else (None, None)

        # R:R stats
        rr_ratios = []
        for t in trade_examples:
            if t.entry_price and t.stop_price and t.target_price:
                risk = abs(t.entry_price - t.stop_price)
                reward = abs(t.target_price - t.entry_price)
                if risk > 0:
                    rr_ratios.append(reward / risk)

        avg_rr = sum(rr_ratios) / len(rr_ratios) if rr_ratios else None
        rr_range = (min(rr_ratios), max(rr_ratios)) if rr_ratios else (None, None)

        # Overall confidence
        confidence = (stop_consistency + entry_consistency) / 2 if stop_refs and entry_refs else 0.0

        return ConsistencyAnalysis(
            video_id=video_id,
            total_trades=len(trade_examples),
            trades_with_stop_ref=len(stop_refs),
            stop_references_found=dict(stop_ref_counts),
            dominant_stop_reference=dominant_stop,
            stop_reference_consistency=stop_consistency,
            entry_references_found=dict(entry_ref_counts),
            dominant_entry_reference=dominant_entry,
            entry_reference_consistency=entry_consistency,
            avg_stop_distance_ticks=avg_stop,
            stop_distance_range=stop_range,
            avg_rr_ratio=avg_rr,
            rr_range=rr_range,
            recommended_stop_reference=dominant_stop or "CISD_CANDLE_LOW",
            recommended_entry_reference=dominant_entry or "OB_CLOSE",
            confidence_score=confidence
        )

    def _update_video_stats(self, video_id: str, result: MiningResult):
        """Update processed_videos with mining stats."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute("""
            UPDATE processed_videos
            SET trade_examples_extracted = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE video_id = ?
        """, (result.frames_with_trades, video_id))

        conn.commit()
        conn.close()

    def get_existing_trades(self, video_id: str) -> list[dict]:
        """Get existing trade examples from database."""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        cursor.execute("""
            SELECT * FROM trade_examples
            WHERE video_id = ?
            ORDER BY frame_number
        """, (video_id,))

        rows = cursor.fetchall()
        conn.close()

        return [dict(row) for row in rows]

    def get_recommended_references(self, video_id: str) -> dict:
        """Get recommended stop/entry references based on mined examples."""
        trades = self.get_existing_trades(video_id)

        if not trades:
            return {
                "stop_reference": None,
                "entry_reference": None,
                "confidence": 0.0,
                "message": "No trade examples found"
            }

        stop_refs = [t["stop_reference_point"] for t in trades if t.get("stop_reference_point")]
        entry_refs = [t["entry_reference_point"] for t in trades if t.get("entry_reference_point")]

        stop_counts = Counter(stop_refs)
        entry_counts = Counter(entry_refs)

        recommended_stop = stop_counts.most_common(1)[0][0] if stop_counts else None
        recommended_entry = entry_counts.most_common(1)[0][0] if entry_counts else None

        stop_consistency = stop_counts[recommended_stop] / len(stop_refs) if stop_refs else 0
        entry_consistency = entry_counts[recommended_entry] / len(entry_refs) if entry_refs else 0

        return {
            "stop_reference": recommended_stop,
            "stop_consistency": stop_consistency,
            "entry_reference": recommended_entry,
            "entry_consistency": entry_consistency,
            "confidence": (stop_consistency + entry_consistency) / 2,
            "trade_count": len(trades),
            "message": f"Based on {len(trades)} trade examples"
        }


# =============================================================================
# CLI Entry Point
# =============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="Mine trade examples from video frames"
    )
    parser.add_argument(
        "--video-id",
        type=str,
        required=True,
        help="Video ID to mine"
    )
    parser.add_argument(
        "--model-id",
        type=int,
        help="Model ID to associate trades with"
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
        "--analyze-consistency",
        action="store_true",
        help="Only show consistency analysis for existing trades"
    )
    parser.add_argument(
        "--recommendations",
        action="store_true",
        help="Show recommended references from existing trades"
    )
    parser.add_argument(
        "--output",
        type=Path,
        help="Output JSON file"
    )

    args = parser.parse_args()

    miner = TradeExampleMiner()

    if args.recommendations:
        recs = miner.get_recommended_references(args.video_id)
        print("\n" + "=" * 60)
        print("RECOMMENDED REFERENCES")
        print("=" * 60)
        print(f"Stop Reference:  {recs['stop_reference']} ({recs['stop_consistency']:.0%} consistent)")
        print(f"Entry Reference: {recs['entry_reference']} ({recs['entry_consistency']:.0%} consistent)")
        print(f"Overall Confidence: {recs['confidence']:.0%}")
        print(f"{recs['message']}")
        print("=" * 60 + "\n")
        print(json.dumps(recs, indent=2))

    elif args.analyze_consistency:
        trades = miner.get_existing_trades(args.video_id)
        summaries = [TradeExampleSummary(
            frame_path=t.get("frame_path", ""),
            timestamp=t.get("timestamp_seconds"),
            direction=t.get("direction", "UNKNOWN"),
            entry_price=t.get("entry_price"),
            stop_price=t.get("stop_price"),
            target_price=t.get("target_price"),
            stop_distance_ticks=t.get("stop_distance_ticks"),
            stop_reference_point=t.get("stop_reference_point"),
            entry_reference_point=t.get("entry_reference_point"),
            confidence=t.get("extraction_confidence", 0.5)
        ) for t in trades]

        consistency = miner._analyze_consistency(args.video_id, summaries)
        output = asdict(consistency)
        print(json.dumps(output, indent=2, default=str))

    else:
        result = miner.mine_video(
            args.video_id,
            args.instrument,
            args.model_id,
            args.save
        )

        output = asdict(result)
        print("\n" + "=" * 60)
        print(f"MINING COMPLETE: {args.video_id}")
        print("=" * 60)
        print(f"Frames scanned:     {result.frames_scanned}")
        print(f"Frames with trades: {result.frames_with_trades}")

        if result.consistency:
            c = result.consistency
            print(f"\nConsistency Analysis:")
            print(f"  Stop refs found: {c.stop_references_found}")
            print(f"  Dominant stop:   {c.dominant_stop_reference} ({c.stop_reference_consistency:.0%})")
            print(f"  Entry refs:      {c.entry_references_found}")
            print(f"  Dominant entry:  {c.dominant_entry_reference} ({c.entry_reference_consistency:.0%})")
            print(f"\nRECOMMENDED for code generation:")
            print(f"  stop_reference_point = \"{c.recommended_stop_reference}\"")
            print(f"  entry_reference_point = \"{c.recommended_entry_reference}\"")

        print("=" * 60 + "\n")

        if args.output:
            with open(args.output, "w") as f:
                json.dump(output, f, indent=2, default=str)
            print(f"Results saved to {args.output}")


if __name__ == "__main__":
    main()
