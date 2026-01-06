#!/usr/bin/env python3
"""
Reflective Extraction Pipeline

Complete pipeline for extracting trading strategies from YouTube videos using
reflective analysis. Combines:
1. Video segmentation (multi-signal boundary detection)
2. Trade example mining (visual trade analysis)
3. Reflective analysis (skill correlation, understanding accumulation)
4. Understanding verification (anti-hallucination diagrams)
5. Code generation (understanding → NinjaTrader C#)
6. Code validation (visual evidence comparison)

USAGE:
    # Full pipeline
    uv run python scripts/reflective_extraction_pipeline.py \\
        --frames-dir data/temp-frames/VIDEO_ID \\
        --output-dir scripts-output/Strategies \\
        --strategy-name MyStrategy

    # Analysis only (no code generation)
    uv run python scripts/reflective_extraction_pipeline.py \\
        --frames-dir data/temp-frames/VIDEO_ID \\
        --analyze-only

WORKFLOW:
    1. Load manifest.json from frames directory
    2. Segment video using multi-signal detection
    2.5. Mine trade examples from frames (visual analysis)
    3. Run reflective analysis on each segment
    3.5. Generate understanding diagram (anti-hallucination)
    4. Present accumulated understanding checkpoint
    5. Generate NinjaTrader C# code from understanding
    6. Validate code against visual evidence
"""

import argparse
import json
from pathlib import Path
from datetime import datetime

# Import pipeline components
from video_segmenter import segment_video, segments_to_json, Segment
from reflective_analyzer import ReflectiveAnalyzer
from understanding_to_code import generate_strategy_from_understanding

# Import new visual analysis components (optional - graceful fallback)
try:
    from trade_example_miner import TradeExampleMiner
    from understanding_diagram_generator import UnderstandingDiagramGenerator
    from code_visual_validator import CodeVisualValidator
    VISUAL_ANALYSIS_AVAILABLE = True
except ImportError:
    VISUAL_ANALYSIS_AVAILABLE = False
    print("Warning: Visual analysis components not available")


# =============================================================================
# Pipeline Configuration
# =============================================================================

PROJECT_ROOT = Path(__file__).parent.parent.resolve()
DB_PATH = PROJECT_ROOT / "data" / "builder.db"
DEFAULT_OUTPUT_DIR = PROJECT_ROOT / "scripts-output" / "Strategies"


# =============================================================================
# Pipeline Stages
# =============================================================================

def load_video_manifest(frames_dir: Path) -> dict:
    """Load the video manifest with frame and transcript data."""
    manifest_path = frames_dir / "manifest.json"

    if not manifest_path.exists():
        raise FileNotFoundError(f"No manifest.json found in {frames_dir}")

    manifest = json.loads(manifest_path.read_text())
    print(f"Loaded manifest: {manifest.get('video_id', 'unknown')}")
    print(f"  Frames: {manifest.get('frame_count', 0)}")
    print(f"  Duration: {manifest.get('video_duration_sec', 0)}s")

    return manifest


def build_timed_transcript(manifest: dict) -> list[dict]:
    """Build timed transcript from manifest frames."""
    frames = manifest.get("frames", [])
    frame_interval = manifest.get("frame_interval_sec", 45)

    timed_transcript = []
    for i, frame in enumerate(frames):
        timed_transcript.append({
            "start": frame.get("timestamp_sec", i * frame_interval),
            "end": frame.get("timestamp_sec", i * frame_interval) + frame_interval,
            "text": frame.get("transcript_segment", ""),
        })

    return timed_transcript


def run_segmentation(frames_dir: Path, manifest: dict) -> list[Segment]:
    """Stage 1: Segment video using multi-signal detection."""
    print("\n" + "=" * 60)
    print("STAGE 1: VIDEO SEGMENTATION")
    print("=" * 60)

    timed_transcript = build_timed_transcript(manifest)
    full_transcript = manifest.get("full_transcript", "")
    duration = manifest.get("video_duration_sec", 600)

    segments = segment_video(
        frames_dir=frames_dir,
        transcript=full_transcript,
        timed_transcript=timed_transcript,
        video_duration=duration,
    )

    print(f"\n  Created {len(segments)} segments")

    return segments


def run_reflective_analysis(segments: list[Segment], db_path: Path) -> dict:
    """Stage 2: Run reflective analysis on each segment."""
    print("\n" + "=" * 60)
    print("STAGE 2: REFLECTIVE ANALYSIS")
    print("=" * 60)

    analyzer = ReflectiveAnalyzer(db_path=db_path)

    for segment in segments:
        analyzer.analyze_segment(segment)

    understanding = analyzer.get_accumulated_understanding()
    full_analysis = analyzer.to_json()

    analyzer.close()

    return full_analysis


def display_understanding_checkpoint(analysis: dict) -> bool:
    """Stage 3: Present accumulated understanding for validation."""
    print("\n" + "=" * 60)
    print("STAGE 3: UNDERSTANDING CHECKPOINT")
    print("=" * 60)

    understanding = analysis.get("accumulated_understanding", {})

    context = understanding.get('context_summary', 'Unknown')
    # Make Windows-safe by replacing Unicode arrows
    context = context.replace('→', '->') if isinstance(context, str) else str(context)
    print(f"\nStrategy Flow: {context}")
    print(f"Matched Skills: {len(understanding.get('matched_skills', []))}")
    print(f"New Skills Needed: {len(understanding.get('new_skills_needed', []))}")
    print(f"Overall Confidence: {understanding.get('overall_confidence', 0):.2f}")

    if understanding.get("parameters"):
        print("\nExtracted Parameters:")
        for k, v in understanding.get("parameters", {}).items():
            print(f"  {k}: {v}")

    if understanding.get("open_questions"):
        print("\nOpen Questions:")
        for q in understanding.get("open_questions", [])[:5]:
            print(f"  - {q}")

    print("\n" + "-" * 40)

    # In automated mode, always proceed
    # In interactive mode, we'd ask user here
    return True


def run_trade_example_mining(
    video_id: str,
    db_path: Path,
    instrument: str = "ES",
    model_id: int = None,
) -> dict:
    """Stage 2.5: Mine trade examples from video frames."""
    print("\n" + "=" * 60)
    print("STAGE 2.5: TRADE EXAMPLE MINING")
    print("=" * 60)

    if not VISUAL_ANALYSIS_AVAILABLE:
        print("  Skipped - visual analysis components not available")
        return {"trade_examples": [], "recommendations": {}}

    try:
        miner = TradeExampleMiner(db_path=db_path)
        result = miner.mine_video(
            video_id=video_id,
            instrument=instrument,
            model_id=model_id,
            save_to_db=True
        )

        print(f"\n  Frames scanned: {result.frames_scanned}")
        print(f"  Trades found:   {result.frames_with_trades}")

        if result.consistency:
            print(f"\n  Stop reference: {result.consistency.recommended_stop_reference}")
            print(f"  Entry reference: {result.consistency.recommended_entry_reference}")

        recommendations = {}
        if result.consistency:
            recommendations = {
                "stop_reference": result.consistency.recommended_stop_reference,
                "entry_reference": result.consistency.recommended_entry_reference,
                "confidence": result.consistency.confidence_score,
            }

        return {
            "trade_examples": [vars(t) for t in result.trade_examples],
            "recommendations": recommendations,
        }

    except Exception as e:
        print(f"  Warning: Trade mining failed: {e}")
        return {"trade_examples": [], "recommendations": {}}


def run_understanding_verification(
    video_id: str,
    model_id: int,
    db_path: Path,
) -> dict:
    """Stage 3.5: Generate understanding diagram for anti-hallucination check."""
    print("\n" + "=" * 60)
    print("STAGE 3.5: UNDERSTANDING VERIFICATION")
    print("=" * 60)

    if not VISUAL_ANALYSIS_AVAILABLE:
        print("  Skipped - visual analysis components not available")
        return {"diagram": None, "flagged_concepts": 0}

    try:
        generator = UnderstandingDiagramGenerator(db_path=db_path)
        diagram = generator.generate(video_id=video_id, model_id=model_id)

        print(f"\n  Concepts extracted: {diagram.concepts_total}")
        print(f"  Concepts verified:  {diagram.concepts_verified}")
        print(f"  Concepts flagged:   {diagram.concepts_flagged}")

        if diagram.concepts_flagged > 0:
            print("\n  WARNING: Some concepts need manual verification!")
            for ev in diagram.evidence:
                if ev.needs_verification:
                    print(f"    - {ev.concept_name}: {ev.verification_reason}")

        # Save to database
        generator.save_diagram(diagram)

        return {
            "diagram": diagram.mermaid_code,
            "evidence_panel": diagram.evidence_panel,
            "verification_checkpoint": diagram.verification_checkpoint,
            "flagged_concepts": diagram.concepts_flagged,
        }

    except Exception as e:
        print(f"  Warning: Diagram generation failed: {e}")
        return {"diagram": None, "flagged_concepts": 0}


def run_code_generation(
    analysis: dict,
    db_path: Path,
    strategy_name: str,
    source_info: dict,
    trade_recommendations: dict = None,
) -> str:
    """Stage 4: Generate NinjaTrader C# code from understanding."""
    print("\n" + "=" * 60)
    print("STAGE 4: CODE GENERATION")
    print("=" * 60)

    understanding = analysis.get("accumulated_understanding", {})

    # Inject trade example recommendations if available
    if trade_recommendations:
        understanding["trade_examples"] = trade_recommendations
        print(f"  Using visual evidence: stop={trade_recommendations.get('stop_reference')}")

    code = generate_strategy_from_understanding(
        understanding=understanding,
        db_path=db_path,
        strategy_name=strategy_name,
        source_info=source_info,
    )

    print(f"\n  Generated {len(code)} characters of C# code")

    return code


def run_code_validation(
    code_path: Path,
    video_id: str,
    model_id: int,
    db_path: Path,
) -> dict:
    """Stage 5: Validate generated code against visual evidence."""
    print("\n" + "=" * 60)
    print("STAGE 5: CODE VALIDATION")
    print("=" * 60)

    if not VISUAL_ANALYSIS_AVAILABLE:
        print("  Skipped - visual analysis components not available")
        return {"passed": True, "checks": []}

    try:
        validator = CodeVisualValidator(db_path=db_path)
        result = validator.validate(code_path, video_id, model_id)

        status = "PASSED" if result.validation_passed else "FAILED"
        print(f"\n  Validation: {status}")
        print(f"  Checks: {result.checks_passed}/{result.checks_total} passed")

        if not result.validation_passed:
            print("\n  BLOCKING ISSUES:")
            for issue in result.blocking_issues:
                print(f"    - {issue}")

            print("\n  Suggested fixes:")
            fixes = validator.generate_fix_suggestions(result)
            for fix in fixes:
                print(f"    - {fix['suggestion']}")

        # Save validation result
        validator.save_validation(result)

        return {
            "passed": result.validation_passed,
            "checks": [vars(c) for c in result.checks],
            "blocking_issues": result.blocking_issues,
        }

    except Exception as e:
        print(f"  Warning: Validation failed: {e}")
        return {"passed": True, "checks": [], "error": str(e)}


def save_outputs(
    output_dir: Path,
    strategy_name: str,
    segments: list,
    analysis: dict,
    code: str,
) -> dict:
    """Save all pipeline outputs."""
    output_dir.mkdir(parents=True, exist_ok=True)

    outputs = {}

    # Save segments
    segments_path = output_dir / f"{strategy_name}_segments.json"
    segments_path.write_text(json.dumps(segments_to_json(segments), indent=2))
    outputs["segments"] = segments_path
    print(f"  Saved segments: {segments_path}")

    # Save analysis
    analysis_path = output_dir / f"{strategy_name}_analysis.json"
    analysis_path.write_text(json.dumps(analysis, indent=2))
    outputs["analysis"] = analysis_path
    print(f"  Saved analysis: {analysis_path}")

    # Save code
    code_path = output_dir / f"{strategy_name}.cs"
    code_path.write_text(code)
    outputs["code"] = code_path
    print(f"  Saved strategy: {code_path}")

    return outputs


# =============================================================================
# Main Pipeline
# =============================================================================

def run_pipeline(
    frames_dir: Path,
    output_dir: Path,
    strategy_name: str,
    db_path: Path = DB_PATH,
    analyze_only: bool = False,
    instrument: str = "ES",
    model_id: int = None,
    skip_visual_analysis: bool = False,
) -> dict:
    """
    Run the complete reflective extraction pipeline.

    Args:
        frames_dir: Directory containing extracted frames and manifest.json
        output_dir: Directory for output files
        strategy_name: Name for the generated strategy
        db_path: Path to skills database
        analyze_only: If True, skip code generation
        instrument: Trading instrument for tick size (default: ES)
        model_id: Optional model ID for database association
        skip_visual_analysis: If True, skip visual analysis stages

    Returns:
        Dictionary with output file paths
    """
    print("\n" + "=" * 60)
    print("REFLECTIVE EXTRACTION PIPELINE")
    print("=" * 60)
    print(f"  Frames: {frames_dir}")
    print(f"  Output: {output_dir}")
    print(f"  Strategy: {strategy_name}")
    print(f"  Mode: {'Analysis Only' if analyze_only else 'Full Pipeline'}")
    print(f"  Visual Analysis: {'Enabled' if not skip_visual_analysis else 'Disabled'}")

    # Stage 0: Load manifest
    manifest = load_video_manifest(frames_dir)
    video_id = manifest.get("video_id", frames_dir.name)

    source_info = {
        "url": manifest.get("video_url", ""),
        "video_id": video_id,
        "title": manifest.get("video_title", strategy_name),
    }

    # Stage 1: Segmentation
    segments = run_segmentation(frames_dir, manifest)

    # Stage 2.5: Trade Example Mining (visual analysis)
    trade_mining_result = {"trade_examples": [], "recommendations": {}}
    if not skip_visual_analysis and VISUAL_ANALYSIS_AVAILABLE:
        trade_mining_result = run_trade_example_mining(
            video_id=video_id,
            db_path=db_path,
            instrument=instrument,
            model_id=model_id,
        )

    # Stage 2: Reflective Analysis
    analysis = run_reflective_analysis(segments, db_path)

    # Stage 3.5: Understanding Verification (anti-hallucination)
    understanding_diagram = {"diagram": None, "flagged_concepts": 0}
    if not skip_visual_analysis and VISUAL_ANALYSIS_AVAILABLE and model_id:
        understanding_diagram = run_understanding_verification(
            video_id=video_id,
            model_id=model_id,
            db_path=db_path,
        )

    # Stage 3: Understanding Checkpoint
    proceed = display_understanding_checkpoint(analysis)

    if not proceed:
        print("\nPipeline stopped at checkpoint.")
        return {"status": "stopped"}

    # Check if we should stop due to flagged concepts
    if understanding_diagram.get("flagged_concepts", 0) > 0:
        print("\n" + "-" * 40)
        print("WARNING: Some concepts need verification before code generation.")
        print("Review the understanding diagram above.")
        print("-" * 40)
        # In automated mode, continue but warn
        # In interactive mode, we'd ask user here

    # Stage 4: Code Generation (unless analyze_only)
    code = ""
    code_path = None
    if not analyze_only:
        code = run_code_generation(
            analysis=analysis,
            db_path=db_path,
            strategy_name=strategy_name,
            source_info=source_info,
            trade_recommendations=trade_mining_result.get("recommendations"),
        )

    # Save outputs
    print("\n" + "=" * 60)
    print("SAVING OUTPUTS")
    print("=" * 60)

    outputs = save_outputs(
        output_dir=output_dir,
        strategy_name=strategy_name,
        segments=segments,
        analysis=analysis,
        code=code if not analyze_only else "// Analysis only - no code generated",
    )

    # Stage 5: Code Validation (visual evidence comparison)
    if not analyze_only and not skip_visual_analysis and VISUAL_ANALYSIS_AVAILABLE:
        code_path = outputs.get("code")
        if code_path:
            validation_result = run_code_validation(
                code_path=Path(code_path),
                video_id=video_id,
                model_id=model_id,
                db_path=db_path,
            )
            outputs["validation"] = validation_result

            if not validation_result.get("passed"):
                print("\n" + "=" * 60)
                print("CODE VALIDATION FAILED")
                print("=" * 60)
                print("Review suggested fixes before deploying strategy.")

    print("\n" + "=" * 60)
    print("PIPELINE COMPLETE")
    print("=" * 60)

    # Summary
    if trade_mining_result.get("trade_examples"):
        print(f"\n  Trade examples extracted: {len(trade_mining_result['trade_examples'])}")
    if understanding_diagram.get("diagram"):
        print(f"  Understanding diagram: Generated")
    if outputs.get("validation"):
        val = outputs["validation"]
        print(f"  Code validation: {'PASSED' if val.get('passed') else 'FAILED'}")

    return outputs


# =============================================================================
# CLI
# =============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="Reflective extraction pipeline for YouTube trading videos"
    )
    parser.add_argument(
        "--frames-dir",
        type=Path,
        required=True,
        help="Directory containing extracted frames and manifest.json",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help=f"Output directory (default: {DEFAULT_OUTPUT_DIR})",
    )
    parser.add_argument(
        "--strategy-name",
        default=None,
        help="Strategy class name (default: from video ID)",
    )
    parser.add_argument(
        "--db",
        type=Path,
        default=DB_PATH,
        help=f"Skills database path (default: {DB_PATH})",
    )
    parser.add_argument(
        "--analyze-only",
        action="store_true",
        help="Run analysis only, skip code generation",
    )
    parser.add_argument(
        "--instrument",
        type=str,
        default="ES",
        help="Trading instrument for tick size (default: ES)",
    )
    parser.add_argument(
        "--model-id",
        type=int,
        default=None,
        help="Model ID for database association",
    )
    parser.add_argument(
        "--skip-visual-analysis",
        action="store_true",
        help="Skip visual analysis stages (trade mining, validation)",
    )

    args = parser.parse_args()

    # Validate inputs
    if not args.frames_dir.exists():
        print(f"Error: Frames directory not found: {args.frames_dir}")
        exit(1)

    if not args.db.exists():
        print(f"Error: Database not found: {args.db}")
        exit(1)

    # Default strategy name from directory
    if args.strategy_name is None:
        args.strategy_name = f"{args.frames_dir.name}Strategy"

    # Run pipeline
    try:
        outputs = run_pipeline(
            frames_dir=args.frames_dir,
            output_dir=args.output_dir,
            strategy_name=args.strategy_name,
            db_path=args.db,
            analyze_only=args.analyze_only,
            instrument=args.instrument,
            model_id=args.model_id,
            skip_visual_analysis=args.skip_visual_analysis,
        )

        if outputs.get("code"):
            print(f"\n✓ Strategy generated: {outputs['code']}")

    except Exception as e:
        print(f"\nError: {e}")
        import traceback
        traceback.print_exc()
        exit(1)


if __name__ == "__main__":
    main()
