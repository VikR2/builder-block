#!/usr/bin/env python3
"""
Strategy Optimization CLI Wrapper

Combines backtest analysis and filter generation into a single workflow.
Focus: Find better opportunities, optimize parameters, not just reduce trades.

USAGE:
    # Full optimization workflow
    python scripts/optimize_strategy.py \\
        --backtest "NinjaTrader Grid 2025-12-31.csv" \\
        --strategy scripts-output/Strategies/TTradesReversalV2Strategy.cs

    # Analysis only (no code generation)
    python scripts/optimize_strategy.py \\
        --backtest "NinjaTrader Grid 2025-12-31.csv" \\
        --analyze-only

    # Compare before/after optimization runs
    python scripts/optimize_strategy.py --compare-runs

    # View skill usage in strategy
    python scripts/optimize_strategy.py \\
        --strategy scripts-output/Strategies/TTradesReversalV2Strategy.cs \\
        --analyze-skills
"""

import argparse
import json
import re
import sqlite3
import subprocess
import sys
from datetime import datetime
from pathlib import Path


def run_analyzer(csv_path: str, strategy_name: str, db_path: str) -> dict:
    """Run backtest analyzer and return recommendations"""
    from backtest_analyzer import (
        load_trades_from_csv,
        calculate_metrics,
        analyze_by_time,
        analyze_by_duration,
        generate_recommendations,
        print_report,
        save_recommendations,
        save_to_database
    )

    print("="*60)
    print("STEP 1: ANALYZING BACKTEST DATA")
    print("="*60)

    trades = load_trades_from_csv(csv_path)
    print(f"Loaded {len(trades)} trades from {csv_path}")

    if not trades:
        print("ERROR: No trades found")
        return None

    # Extract strategy name from trades if not provided
    if strategy_name == 'Unknown':
        strategy_name = trades[0].strategy

    metrics = calculate_metrics(trades)
    time_analysis = analyze_by_time(trades)
    duration_analysis = analyze_by_duration(trades)
    recommendations = generate_recommendations(metrics, time_analysis, duration_analysis)

    print_report(metrics, time_analysis, duration_analysis, recommendations)

    # Save recommendations
    recs_path = csv_path.replace('.csv', '_recommendations.json')
    save_recommendations(recommendations, metrics, recs_path)

    # Save to database
    if Path(db_path).exists():
        save_to_database(db_path, strategy_name, csv_path, recommendations, metrics)

    return {
        'recommendations': {
            'filters_to_add': recommendations.filters_to_add,
            'parameter_adjustments': recommendations.parameter_adjustments,
            'analysis_notes': recommendations.analysis_notes
        },
        'metrics': {
            'total_trades': metrics.total_trades,
            'win_rate': metrics.win_rate,
            'profit_factor': metrics.profit_factor,
            'total_profit': metrics.total_profit,
            'max_drawdown': metrics.max_drawdown,
            'max_consecutive_losses': metrics.max_consecutive_losses,
            'avg_bars_held': metrics.avg_bars_held
        },
        'recommendations_path': recs_path
    }


def run_generator(strategy_path: str, recommendations: dict, output_path: str = None) -> str:
    """Run filter generator and return output path"""
    from strategy_filter_generator import (
        StrategyFilterGenerator,
        generate_parameter_optimization_report
    )

    print("\n" + "="*60)
    print("STEP 2: GENERATING OPTIMIZED STRATEGY")
    print("="*60)

    generator = StrategyFilterGenerator(strategy_path, recommendations['recommendations'])
    optimized_code = generator.generate_optimized_strategy()

    # Determine output path
    if not output_path:
        strategy = Path(strategy_path)
        output_path = str(strategy.parent / f"{strategy.stem}_optimized{strategy.suffix}")

    Path(output_path).write_text(optimized_code, encoding='utf-8')

    print(f"\nOptimized strategy written to: {output_path}")
    print("\nChanges made:")
    for change in generator.get_changes_summary():
        print(f"  - {change}")

    # Show parameter optimization report
    report = generate_parameter_optimization_report(strategy_path, recommendations.get('metrics', {}))
    print(report)

    return output_path


def analyze_skills(strategy_path: str):
    """Analyze skills used in a strategy and suggest improvements"""

    print("\n" + "="*60)
    print("SKILL ANALYSIS")
    print("="*60)

    code = Path(strategy_path).read_text(encoding='utf-8')

    # Extract skills from header comments
    skills_match = re.search(r'Skills integrated \((\d+) total\):(.*?)(?=\n\n|#region)', code, re.DOTALL)

    if skills_match:
        skill_count = skills_match.group(1)
        skills_section = skills_match.group(2)

        print(f"\nStrategy has {skill_count} integrated skills:")

        skills = re.findall(r'\[\+\]\s+(.+?)\s+\(([^)]+)\)', skills_section)
        for skill_name, category in skills:
            print(f"  [{category}] {skill_name}")

    # Analyze which skills might need adjustment based on code patterns
    print("\n--- SKILL OPTIMIZATION SUGGESTIONS ---")

    suggestions = []

    # Check for CISD pattern usage
    if 'cisdConfirmed' in code:
        suggestions.append({
            'skill': 'CISD Pattern',
            'issue': 'May trigger too early',
            'suggestion': 'Consider requiring FVG confirmation before CISD entry'
        })

    # Check for liquidity sweep
    if 'liquiditySweepDetected' in code:
        suggestions.append({
            'skill': 'Liquidity Sweep Detection',
            'issue': 'Single sweep triggers entry',
            'suggestion': 'Could require multiple sweeps or sweep + rejection candle'
        })

    # Check breakeven settings
    if 'BreakevenTicks' in code:
        match = re.search(r'BreakevenTicks\s*=\s*(\d+)', code)
        if match and int(match.group(1)) < 100:
            suggestions.append({
                'skill': 'Automatic Breakeven Stop',
                'issue': f'Current: {match.group(1)} ticks (may be too tight)',
                'suggestion': 'Increase to 100-120 ticks to let trades develop'
            })

    # Check for reversal stage requirement
    stage_match = re.search(r'reversalStage >= (\d+)', code)
    if stage_match:
        min_stage = int(stage_match.group(1))
        if min_stage == 1:
            suggestions.append({
                'skill': 'Reversal Sequence (5-Stage)',
                'issue': f'Requires only stage {min_stage} for entry',
                'suggestion': 'Consider requiring stage 2 or 3 for higher probability entries'
            })

    # Check for daily bias usage
    if 'pmBias' in code:
        suggestions.append({
            'skill': 'Daily Bias Determination',
            'issue': 'Bias may conflict with intraday reversals',
            'suggestion': 'Consider allowing counter-bias trades when reversal stage >= 3'
        })

    if suggestions:
        for s in suggestions:
            print(f"\n  [{s['skill']}]")
            print(f"    Issue: {s['issue']}")
            print(f"    Suggestion: {s['suggestion']}")
    else:
        print("\n  No immediate skill optimization suggestions found.")

    # Skills that could be added
    print("\n--- SKILLS TO CONSIDER ADDING ---")
    potential_skills = [
        ("Volume Profile", "Confirm entries at high-volume nodes"),
        ("ATR-based Stops", "Dynamic stops based on volatility"),
        ("Multi-Timeframe Bias", "Confirm direction on higher timeframe"),
        ("Session Opening Gap", "Filter based on overnight gap"),
        ("Market Internals", "ADD/TICK confirmation for index futures"),
    ]

    for skill, reason in potential_skills:
        # Check if already implemented
        if skill.lower().replace(' ', '') not in code.lower():
            print(f"  - {skill}: {reason}")

    # Skills that might be redundant
    print("\n--- SKILLS TO CONSIDER SIMPLIFYING ---")
    if 'protectedSwing' in code and 'swingHigh' in code:
        print("  - Protected Swings + Swing Tracking: May have overlapping logic")
    if 'fvgDirection' in code and 'cisdConfirmed' in code:
        print("  - FVG + CISD: Both confirm same reversal - consider combining into single check")


def compare_optimization_runs(db_path: str):
    """Compare optimization runs from database"""

    print("\n" + "="*60)
    print("OPTIMIZATION RUN HISTORY")
    print("="*60)

    if not Path(db_path).exists():
        print(f"Database not found: {db_path}")
        return

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # Check if table exists
    cursor.execute("""
        SELECT name FROM sqlite_master
        WHERE type='table' AND name='optimization_runs'
    """)
    if not cursor.fetchone():
        print("No optimization runs recorded yet.")
        conn.close()
        return

    cursor.execute("""
        SELECT id, strategy_name, run_date, before_metrics, after_metrics
        FROM optimization_runs
        ORDER BY run_date DESC
        LIMIT 10
    """)

    runs = cursor.fetchall()
    if not runs:
        print("No optimization runs recorded yet.")
        conn.close()
        return

    print(f"\nLast {len(runs)} optimization runs:\n")
    print(f"{'ID':>4} | {'Strategy':<25} | {'Date':<20} | {'Win%':>6} | {'Profit':>12} | {'PF':>5}")
    print("-" * 85)

    for run_id, strategy, date, before_json, after_json in runs:
        before = json.loads(before_json) if before_json else {}
        after = json.loads(after_json) if after_json else {}

        win_rate = before.get('win_rate', 0)
        profit = before.get('total_profit', 0)
        pf = before.get('profit_factor', 0)

        print(f"{run_id:>4} | {strategy:<25} | {date:<20} | {win_rate:>5.1f}% | ${profit:>10,.0f} | {pf:>5.2f}")

    conn.close()


def main():
    parser = argparse.ArgumentParser(
        description='NinjaTrader Strategy Optimization Workflow'
    )
    parser.add_argument('--backtest', '-b',
                        help='Path to NinjaTrader Grid CSV export')
    parser.add_argument('--strategy', '-s',
                        help='Path to strategy .cs file')
    parser.add_argument('--output', '-o',
                        help='Output path for optimized strategy')
    parser.add_argument('--db', default='data/builder.db',
                        help='SQLite database path')
    parser.add_argument('--analyze-only', action='store_true',
                        help='Only run analysis, no code generation')
    parser.add_argument('--analyze-skills', action='store_true',
                        help='Analyze skills in strategy and suggest improvements')
    parser.add_argument('--compare-runs', action='store_true',
                        help='Compare previous optimization runs')
    parser.add_argument('--strategy-name', default='Unknown',
                        help='Strategy name for database logging')

    args = parser.parse_args()

    # Handle compare-runs mode
    if args.compare_runs:
        compare_optimization_runs(args.db)
        return

    # Handle analyze-skills mode
    if args.analyze_skills:
        if not args.strategy:
            print("ERROR: --strategy required for skill analysis")
            return
        analyze_skills(args.strategy)
        return

    # Require backtest for analysis
    if not args.backtest:
        parser.print_help()
        return

    # Run analysis
    strategy_name = args.strategy_name
    if args.strategy and strategy_name == 'Unknown':
        strategy_name = Path(args.strategy).stem

    result = run_analyzer(args.backtest, strategy_name, args.db)

    if not result:
        return

    # Stop here if analyze-only
    if args.analyze_only:
        print("\n" + "="*60)
        print("Analysis complete. Use --strategy to generate optimized code.")
        print("="*60)
        return

    # Generate optimized strategy
    if args.strategy:
        output_path = run_generator(args.strategy, result, args.output)

        print("\n" + "="*60)
        print("OPTIMIZATION COMPLETE")
        print("="*60)
        print(f"\nNext steps:")
        print(f"  1. Copy {output_path} to NinjaTrader strategies folder")
        print(f"  2. Compile in NinjaTrader")
        print(f"  3. Run backtest with same date range")
        print(f"  4. Export new CSV and compare results")
        print(f"\nTo compare: python scripts/optimize_strategy.py --compare-runs")
    else:
        print("\n" + "="*60)
        print("Analysis complete. Provide --strategy to generate optimized code.")
        print("="*60)


if __name__ == '__main__':
    main()
