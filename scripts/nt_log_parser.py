#!/usr/bin/env python3
"""
NinjaTrader Log Parser

Parse NinjaTrader strategy debug output to extract metrics for the
code generation iteration loop.

Usage:
    python nt_log_parser.py <log_path> [--json]

Example:
    python nt_log_parser.py screenshots/NinjaScript_Output.txt
    python nt_log_parser.py screenshots/NinjaScript_Output.txt --json
"""

import re
import sys
import json
import argparse
from pathlib import Path
from collections import defaultdict
from datetime import datetime
from typing import Dict, List, Any, Optional


def parse_nt_log(log_path: str) -> Dict[str, Any]:
    """
    Extract metrics from NinjaTrader strategy debug output.

    Args:
        log_path: Path to the NinjaTrader output log file

    Returns:
        Dictionary with parsed metrics:
        {
            "file": str,
            "lines_parsed": int,
            "date_range": {"start": str, "end": str},
            "entries": int,
            "cisd_confirmed": int,
            "cisd_failed": int,
            "cisd_success_rate": float,
            "skip_reasons": {reason: count},
            "poi_detected": int,
            "poi_invalidated": int,
            "h1_confirmations": int,
            "trades_by_hour": {hour: count},
            "avg_risk_ticks": float,
            "issues": [identified issues],
            "recommendations": [suggested fixes]
        }
    """
    path = Path(log_path)
    if not path.exists():
        raise FileNotFoundError(f"Log file not found: {log_path}")

    # Initialize counters
    metrics = {
        "file": str(path),
        "lines_parsed": 0,
        "date_range": {"start": None, "end": None},
        "entries": 0,
        "cisd_confirmed": 0,
        "cisd_failed": 0,
        "cisd_success_rate": 0.0,
        "skip_reasons": defaultdict(int),
        "poi_detected": 0,
        "poi_invalidated": 0,
        "h1_confirmations": 0,
        "trades_by_hour": defaultdict(int),
        "risk_ticks": [],
        "avg_risk_ticks": 0.0,
        "issues": [],
        "recommendations": []
    }

    # Regex patterns for log parsing
    patterns = {
        # [ENTRY] 1/20/2025 9:30:00 AM ... LONG at 6200.00 ... Risk: 25.0 ticks
        "entry": re.compile(
            r'\[ENTRY\]\s+(\d+/\d+/\d+\s+\d+:\d+:\d+\s+[AP]M).*?(LONG|SHORT).*?Risk:\s*([\d.]+)\s*ticks',
            re.IGNORECASE
        ),
        # [CISD] 1/20/2025 ... CONFIRMED
        "cisd_confirmed": re.compile(
            r'\[CISD\]\s+(\d+/\d+/\d+\s+\d+:\d+:\d+\s+[AP]M).*?CONFIRMED',
            re.IGNORECASE
        ),
        # [CISD] 1/20/2025 ... Failed - Close X did not break series open Y
        "cisd_failed": re.compile(
            r'\[CISD\]\s+(\d+/\d+/\d+\s+\d+:\d+:\d+\s+[AP]M).*?Failed.*?Close\s+([\d.]+).*?series open\s+([\d.]+)',
            re.IGNORECASE
        ),
        # [SKIP] 1/20/2025 ... <reason>
        "skip": re.compile(
            r'\[SKIP\]\s+(\d+/\d+/\d+\s+\d+:\d+:\d+\s+[AP]M)\s+(.+)',
            re.IGNORECASE
        ),
        # [POI] ... detected / OrderBlock / Swing
        "poi_detected": re.compile(
            r'\[POI\]\s+(OrderBlock|Swing|CandleHL|FVG)',
            re.IGNORECASE
        ),
        # POI invalidated
        "poi_invalidated": re.compile(
            r'\[POI\].*?(invalidat|reset)',
            re.IGNORECASE
        ),
        # [H1] ... CONFIRMED
        "h1_confirmed": re.compile(
            r'\[H1\].*?CONFIRMED',
            re.IGNORECASE
        ),
        # [M5] Protected swing started
        "m5_swing": re.compile(
            r'\[M5\].*?Protected swing started',
            re.IGNORECASE
        ),
        # Date extraction for any timestamp
        "timestamp": re.compile(
            r'(\d+/\d+/\d+)\s+(\d+):(\d+):\d+\s+([AP]M)'
        )
    }

    dates_seen = []

    # Read and parse log file
    with open(path, 'r', encoding='utf-8', errors='ignore') as f:
        for line in f:
            metrics["lines_parsed"] += 1

            # Extract entry info
            entry_match = patterns["entry"].search(line)
            if entry_match:
                metrics["entries"] += 1
                timestamp_str = entry_match.group(1)
                direction = entry_match.group(2)
                risk_ticks = float(entry_match.group(3))
                metrics["risk_ticks"].append(risk_ticks)

                # Extract hour for time distribution
                ts_match = patterns["timestamp"].search(timestamp_str)
                if ts_match:
                    hour = int(ts_match.group(2))
                    ampm = ts_match.group(4)
                    if ampm == "PM" and hour != 12:
                        hour += 12
                    elif ampm == "AM" and hour == 12:
                        hour = 0
                    metrics["trades_by_hour"][hour] += 1
                    dates_seen.append(ts_match.group(1))
                continue

            # CISD confirmed
            if patterns["cisd_confirmed"].search(line):
                metrics["cisd_confirmed"] += 1
                ts_match = patterns["timestamp"].search(line)
                if ts_match:
                    dates_seen.append(ts_match.group(1))
                continue

            # CISD failed
            cisd_fail_match = patterns["cisd_failed"].search(line)
            if cisd_fail_match:
                metrics["cisd_failed"] += 1
                ts_match = patterns["timestamp"].search(line)
                if ts_match:
                    dates_seen.append(ts_match.group(1))
                continue

            # Skip reasons
            skip_match = patterns["skip"].search(line)
            if skip_match:
                reason = skip_match.group(2).strip()
                # Normalize common skip reasons
                if "kill zone" in reason.lower():
                    reason = "Outside kill zone"
                elif "risk" in reason.lower() and "wide" in reason.lower():
                    reason = "Risk too wide"
                elif "risk" in reason.lower() and "narrow" in reason.lower():
                    reason = "Risk too narrow"
                elif "outside" in reason.lower() and "range" in reason.lower():
                    # "Risk X ticks outside Y-Z range" → categorize by over/under
                    risk_match = re.search(r'Risk\s+([\d.]+)\s+ticks\s+outside\s+([\d.]+)-([\d.]+)', reason)
                    if risk_match:
                        risk = float(risk_match.group(1))
                        min_risk = float(risk_match.group(2))
                        max_risk = float(risk_match.group(3))
                        if risk > max_risk:
                            reason = "Risk too wide"
                        elif risk < min_risk:
                            reason = "Risk too narrow"
                elif "invalid" in reason.lower() and "stop" in reason.lower():
                    reason = "Invalid stop placement"
                else:
                    # Truncate long reasons
                    reason = reason[:50] + "..." if len(reason) > 50 else reason
                metrics["skip_reasons"][reason] += 1
                continue

            # POI detected
            if patterns["poi_detected"].search(line):
                metrics["poi_detected"] += 1
                continue

            # POI invalidated
            if patterns["poi_invalidated"].search(line):
                metrics["poi_invalidated"] += 1
                continue

            # H1 confirmations
            if patterns["h1_confirmed"].search(line):
                metrics["h1_confirmations"] += 1
                continue

    # Calculate derived metrics
    total_cisd = metrics["cisd_confirmed"] + metrics["cisd_failed"]
    if total_cisd > 0:
        metrics["cisd_success_rate"] = round(metrics["cisd_confirmed"] / total_cisd, 3)

    if metrics["risk_ticks"]:
        metrics["avg_risk_ticks"] = round(sum(metrics["risk_ticks"]) / len(metrics["risk_ticks"]), 1)

    # Remove raw risk_ticks list from output
    del metrics["risk_ticks"]

    # Calculate date range
    if dates_seen:
        unique_dates = sorted(set(dates_seen))
        metrics["date_range"]["start"] = unique_dates[0]
        metrics["date_range"]["end"] = unique_dates[-1]

    # Identify issues and recommendations
    metrics["issues"], metrics["recommendations"] = analyze_issues(metrics)

    # Convert defaultdicts to regular dicts for JSON serialization
    metrics["skip_reasons"] = dict(metrics["skip_reasons"])
    metrics["trades_by_hour"] = dict(metrics["trades_by_hour"])

    return metrics


def analyze_issues(metrics: Dict[str, Any]) -> tuple[List[str], List[str]]:
    """
    Analyze metrics and identify issues with recommendations.

    Returns:
        Tuple of (issues list, recommendations list)
    """
    issues = []
    recommendations = []

    # Trade frequency analysis
    entries = metrics["entries"]
    if entries == 0:
        issues.append("NO ENTRIES - Strategy produced zero trades")
        recommendations.append("Check state machine flow - verify all transitions work")
    elif entries < 8:
        issues.append(f"LOW FREQUENCY - Only {entries} entries (target: 8-50/month)")
        if metrics["cisd_success_rate"] < 0.15:
            recommendations.append("Relax CISD: change > to >= for series open comparison")
        if metrics["skip_reasons"].get("Outside kill zone", 0) > 10:
            recommendations.append("Disable kill zones: UseKillZonesOnly = false")
    elif entries > 50:
        issues.append(f"HIGH FREQUENCY - {entries} entries may indicate relaxed filters")
        recommendations.append("Consider adding kill zone filter or stricter CISD")

    # CISD success rate
    if metrics["cisd_success_rate"] < 0.10 and (metrics["cisd_confirmed"] + metrics["cisd_failed"]) > 20:
        issues.append(f"LOW CISD SUCCESS - {metrics['cisd_success_rate']*100:.1f}% (target: >15%)")
        recommendations.append("Check CISD threshold - may need relaxation")

    # Skip reasons analysis
    skip_reasons = metrics["skip_reasons"]
    total_skips = sum(skip_reasons.values())

    if skip_reasons.get("Outside kill zone", 0) > total_skips * 0.4:
        issues.append(f"KILL ZONE BLOCKING - {skip_reasons['Outside kill zone']} skips")
        recommendations.append("Consider expanding kill zones or disabling filter")

    if skip_reasons.get("Risk too wide", 0) > total_skips * 0.3:
        issues.append(f"RISK FILTER BLOCKING - {skip_reasons['Risk too wide']} skips for wide stops")
        recommendations.append("Increase MaxRiskTicks or check stop reference point")

    # POI analysis
    if metrics["poi_detected"] > 0:
        invalidation_rate = metrics["poi_invalidated"] / metrics["poi_detected"]
        if invalidation_rate > 0.6:
            issues.append(f"HIGH POI INVALIDATION - {invalidation_rate*100:.0f}% of POIs invalidated")
            recommendations.append("Check POI invalidation threshold or buffer")

    # Time distribution
    trades_by_hour = metrics["trades_by_hour"]
    if trades_by_hour:
        # Check for 11 AM cluster issue
        am_11_trades = trades_by_hour.get(11, 0)
        total_trades = sum(trades_by_hour.values())
        if total_trades > 10 and am_11_trades / total_trades > 0.15:
            issues.append(f"11 AM CLUSTER - {am_11_trades} trades at 11 AM ({am_11_trades/total_trades*100:.0f}%)")
            recommendations.append("Consider 11 AM fade filter or skip window")

    return issues, recommendations


def find_log_files(search_paths: Optional[List[str]] = None) -> List[Path]:
    """
    Auto-detect NT log files from common locations.

    Args:
        search_paths: Optional list of paths to search

    Returns:
        List of found log file paths
    """
    if search_paths is None:
        search_paths = [
            "screenshots",
            "results",
            Path.home() / "Documents" / "NinjaTrader 8" / "trace"
        ]

    found_files = []
    patterns = ["*.txt", "NinjaScript*.txt", "trace*.txt"]

    for search_path in search_paths:
        path = Path(search_path)
        if path.exists():
            for pattern in patterns:
                found_files.extend(path.glob(pattern))

    # Sort by modification time, newest first
    found_files.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    return found_files


def print_report(metrics: Dict[str, Any]) -> None:
    """Print human-readable report of parsed metrics."""
    print("\n" + "="*60)
    print("NINJATRADER LOG ANALYSIS REPORT")
    print("="*60)
    print(f"\nFile: {metrics['file']}")
    print(f"Lines parsed: {metrics['lines_parsed']:,}")
    if metrics['date_range']['start']:
        print(f"Date range: {metrics['date_range']['start']} - {metrics['date_range']['end']}")

    print("\n--- TRADE METRICS ---")
    print(f"Entries: {metrics['entries']}")
    print(f"CISD Confirmed: {metrics['cisd_confirmed']}")
    print(f"CISD Failed: {metrics['cisd_failed']}")
    print(f"CISD Success Rate: {metrics['cisd_success_rate']*100:.1f}%")
    print(f"Avg Risk Ticks: {metrics['avg_risk_ticks']}")

    print("\n--- POI/CONFIRMATION ---")
    print(f"POI Detected: {metrics['poi_detected']}")
    print(f"POI Invalidated: {metrics['poi_invalidated']}")
    print(f"H1 Confirmations: {metrics['h1_confirmations']}")

    if metrics['skip_reasons']:
        print("\n--- SKIP REASONS ---")
        for reason, count in sorted(metrics['skip_reasons'].items(), key=lambda x: -x[1]):
            print(f"  {reason}: {count}")

    if metrics['trades_by_hour']:
        print("\n--- TRADES BY HOUR ---")
        for hour in sorted(metrics['trades_by_hour'].keys()):
            count = metrics['trades_by_hour'][hour]
            bar = "#" * min(count, 20)
            print(f"  {hour:02d}:00  {bar} {count}")

    if metrics['issues']:
        print("\n" + "="*60)
        print("[!] ISSUES IDENTIFIED")
        print("="*60)
        for issue in metrics['issues']:
            print(f"  * {issue}")

    if metrics['recommendations']:
        print("\n" + "="*60)
        print("[>] RECOMMENDATIONS")
        print("="*60)
        for rec in metrics['recommendations']:
            print(f"  -> {rec}")

    print("\n" + "="*60)


def main():
    parser = argparse.ArgumentParser(
        description="Parse NinjaTrader strategy debug logs",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python nt_log_parser.py screenshots/output.txt
  python nt_log_parser.py screenshots/output.txt --json
  python nt_log_parser.py --auto-detect
        """
    )
    parser.add_argument("log_path", nargs="?", help="Path to NinjaTrader log file")
    parser.add_argument("--json", action="store_true", help="Output as JSON")
    parser.add_argument("--auto-detect", action="store_true", help="Find logs automatically")

    args = parser.parse_args()

    if args.auto_detect:
        found = find_log_files()
        if not found:
            print("No log files found in common locations", file=sys.stderr)
            sys.exit(1)
        print(f"Found {len(found)} log files:")
        for i, f in enumerate(found[:10]):
            print(f"  [{i}] {f} ({f.stat().st_size / 1024:.1f} KB)")
        # Use most recent
        args.log_path = str(found[0])
        print(f"\nUsing: {args.log_path}")

    if not args.log_path:
        parser.print_help()
        sys.exit(1)

    try:
        metrics = parse_nt_log(args.log_path)

        if args.json:
            print(json.dumps(metrics, indent=2))
        else:
            print_report(metrics)

    except FileNotFoundError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Error parsing log: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
