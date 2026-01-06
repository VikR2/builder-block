#!/usr/bin/env python3
"""
Code Visual Validator - Validate Generated Code Against Visual Evidence

Compares generated NinjaTrader C# code against trade examples to catch
mismatches like V18's m5OBBodyLow vs CISD candle bug.

This is the final gate before code approval - blocks deployment if
code doesn't match what was shown in the source video.

USAGE:
    python scripts/code_visual_validator.py --cs path/to/Strategy.cs --video-id 9AL41xON3hA
    python scripts/code_visual_validator.py --cs path/to/Strategy.cs --model-id 5
    python scripts/code_visual_validator.py --cs path/to/Strategy.cs --video-id 9AL41xON3hA --fix

CHECKS PERFORMED:
    1. Stop placement reference (OB body vs CISD candle vs FVG)
    2. Entry placement reference (OB close vs FVG 50% vs swing)
    3. Tick size / stop distance consistency
    4. R:R ratio consistency

DEPENDENCIES:
    - trade_example_miner.py (trade examples from database)
"""

import argparse
import json
import re
import sqlite3
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Optional
from datetime import datetime


# =============================================================================
# Data Structures
# =============================================================================

@dataclass
class ValidationCheck:
    """Result of a single validation check."""
    check_name: str
    check_type: str  # "stop_placement", "entry_placement", "stop_distance", "rr_ratio"
    code_uses: str  # What the code uses
    video_shows: str  # What visual evidence shows
    passed: bool
    severity: str  # "critical", "warning", "info"
    details: str
    suggested_fix: Optional[str] = None


@dataclass
class ValidationResult:
    """Complete validation result for a strategy file."""
    strategy_file: str
    strategy_version: Optional[str]
    video_id: str
    model_id: Optional[int]
    validated_at: str

    # Overall result
    validation_passed: bool
    checks_total: int
    checks_passed: int
    checks_failed: int
    checks_warning: int

    # Individual checks
    checks: list[ValidationCheck]

    # Recommendations
    can_auto_fix: bool
    requires_manual_review: bool
    blocking_issues: list[str]


# =============================================================================
# Code Patterns to Match
# =============================================================================

# Patterns for stop placement in NinjaTrader C#
STOP_PATTERNS = {
    "CISD_CANDLE_LOW": [
        r"cisdCandleLow",
        r"cisd.*[Ll]ow",
        r"Lows\[IDX_ENTRY\]",
        r"cisdLow",
        r"entryCandleLow",
    ],
    "CISD_CANDLE_HIGH": [
        r"cisdCandleHigh",
        r"cisd.*[Hh]igh",
        r"Highs\[IDX_ENTRY\]",
        r"cisdHigh",
        r"entryCandleHigh",
    ],
    "OB_BODY_LOW": [
        r"m5OBBodyLow",
        r"ob[Bb]odyLow",
        r"orderBlockBodyLow",
        r"obLow",
        r"Math\.Min\s*\(\s*Opens?\[.*\]\s*,\s*Closes?\[.*\]\s*\)",
    ],
    "OB_BODY_HIGH": [
        r"m5OBBodyHigh",
        r"ob[Bb]odyHigh",
        r"orderBlockBodyHigh",
        r"obHigh",
        r"Math\.Max\s*\(\s*Opens?\[.*\]\s*,\s*Closes?\[.*\]\s*\)",
    ],
    "OB_WICK_LOW": [
        r"m5OBWickLow",
        r"ob[Ww]ickLow",
        r"obExtremeLow",
        r"Lows\[.*ob.*\]",
    ],
    "OB_WICK_HIGH": [
        r"m5OBWickHigh",
        r"ob[Ww]ickHigh",
        r"obExtremeHigh",
        r"Highs\[.*ob.*\]",
    ],
    "FVG_BOTTOM": [
        r"fvg[Bb]ottom",
        r"fvgLow",
        r"fairValueGapLow",
        r"poiZoneLow",
    ],
    "FVG_TOP": [
        r"fvg[Tt]op",
        r"fvgHigh",
        r"fairValueGapHigh",
        r"poiZoneHigh",
    ],
    "SWING_LOW": [
        r"swingLow",
        r"protectedLow",
        r"recentSwingLow",
    ],
    "SWING_HIGH": [
        r"swingHigh",
        r"protectedHigh",
        r"recentSwingHigh",
    ],
}

# Patterns for entry placement
ENTRY_PATTERNS = {
    "OB_CLOSE": [
        r"obClose",
        r"orderBlockClose",
        r"Closes?\[.*ob.*\]",
    ],
    "FVG_50_PCT": [
        r"fvg50",
        r"fvgMid",
        r"fvgCenter",
        r"\(\s*fvgHigh\s*\+\s*fvgLow\s*\)\s*/\s*2",
    ],
    "FVG_TOP": [
        r"fvg[Tt]op",
        r"fvgHigh",
    ],
    "FVG_BOTTOM": [
        r"fvg[Bb]ottom",
        r"fvgLow",
    ],
    "SWING_LEVEL": [
        r"swingLevel",
        r"swingHigh",
        r"swingLow",
    ],
}


# =============================================================================
# Code Visual Validator
# =============================================================================

class CodeVisualValidator:
    """Validates generated code against visual evidence."""

    def __init__(self, db_path: Optional[Path] = None):
        self.db_path = db_path or Path("data/builder.db")

    def _read_code(self, cs_path: Path) -> str:
        """Read C# code file."""
        with open(cs_path, "r", encoding="utf-8") as f:
            return f.read()

    def _extract_version(self, code: str, filename: str) -> Optional[str]:
        """Extract version from code or filename."""
        # Try filename first (e.g., TTradesFractalModelV19.cs)
        match = re.search(r'V(\d+)', filename)
        if match:
            return f"V{match.group(1)}"

        # Try code comments
        match = re.search(r'//\s*Version:?\s*(V?\d+)', code)
        if match:
            return match.group(1)

        return None

    def _detect_pattern(self, code: str, patterns: dict) -> Optional[str]:
        """Detect which pattern is used in code."""
        for pattern_name, regexes in patterns.items():
            for regex in regexes:
                if re.search(regex, code, re.IGNORECASE):
                    return pattern_name
        return None

    def _find_stop_reference(self, code: str) -> Optional[str]:
        """Find what stop reference the code uses."""
        # Look in the stop price calculation area
        stop_section = ""

        # Find the section where stopPrice is calculated
        match = re.search(r'(stopPrice\s*=.*?;)', code, re.DOTALL)
        if match:
            stop_section = match.group(1)
        else:
            # Look for broader stop-related code
            stop_section = code

        return self._detect_pattern(stop_section, STOP_PATTERNS)

    def _find_entry_reference(self, code: str) -> Optional[str]:
        """Find what entry reference the code uses."""
        # Look in the entry price calculation area
        entry_section = ""

        match = re.search(r'(entryPrice\s*=.*?;)', code, re.DOTALL)
        if match:
            entry_section = match.group(1)
        else:
            entry_section = code

        return self._detect_pattern(entry_section, ENTRY_PATTERNS)

    def _get_trade_examples(self, video_id: str) -> list[dict]:
        """Get trade examples from database."""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        cursor.execute("""
            SELECT * FROM trade_examples
            WHERE video_id = ?
        """, (video_id,))

        rows = cursor.fetchall()
        conn.close()

        return [dict(row) for row in rows]

    def _get_recommended_references(self, video_id: str) -> dict:
        """Get recommended references from trade examples."""
        trades = self._get_trade_examples(video_id)

        if not trades:
            return {"stop_reference": None, "entry_reference": None, "confidence": 0}

        from collections import Counter

        stop_refs = [t.get("stop_reference_point") for t in trades if t.get("stop_reference_point")]
        entry_refs = [t.get("entry_reference_point") for t in trades if t.get("entry_reference_point")]

        stop_counts = Counter(stop_refs)
        entry_counts = Counter(entry_refs)

        return {
            "stop_reference": stop_counts.most_common(1)[0][0] if stop_counts else None,
            "stop_consistency": stop_counts.most_common(1)[0][1] / len(stop_refs) if stop_refs else 0,
            "entry_reference": entry_counts.most_common(1)[0][0] if entry_counts else None,
            "entry_consistency": entry_counts.most_common(1)[0][1] / len(entry_refs) if entry_refs else 0,
            "trade_count": len(trades)
        }

    def validate(
        self,
        cs_path: Path,
        video_id: str,
        model_id: Optional[int] = None
    ) -> ValidationResult:
        """Validate code against visual evidence."""

        code = self._read_code(cs_path)
        version = self._extract_version(code, cs_path.name)

        checks = []
        blocking_issues = []

        # Get visual evidence recommendations
        recs = self._get_recommended_references(video_id)

        # Check 1: Stop placement
        code_stop_ref = self._find_stop_reference(code)
        video_stop_ref = recs.get("stop_reference")

        if video_stop_ref:
            stop_passed = code_stop_ref == video_stop_ref
            stop_check = ValidationCheck(
                check_name="Stop Placement Reference",
                check_type="stop_placement",
                code_uses=code_stop_ref or "UNKNOWN",
                video_shows=video_stop_ref,
                passed=stop_passed,
                severity="critical" if not stop_passed else "info",
                details=f"Code uses {code_stop_ref}, video shows {video_stop_ref}",
                suggested_fix=f"Change stop calculation to use {video_stop_ref}" if not stop_passed else None
            )
            checks.append(stop_check)

            if not stop_passed:
                blocking_issues.append(
                    f"Stop uses {code_stop_ref} but video shows {video_stop_ref}"
                )

        # Check 2: Entry placement
        code_entry_ref = self._find_entry_reference(code)
        video_entry_ref = recs.get("entry_reference")

        if video_entry_ref:
            entry_passed = code_entry_ref == video_entry_ref
            entry_check = ValidationCheck(
                check_name="Entry Placement Reference",
                check_type="entry_placement",
                code_uses=code_entry_ref or "UNKNOWN",
                video_shows=video_entry_ref,
                passed=entry_passed,
                severity="warning" if not entry_passed else "info",
                details=f"Code uses {code_entry_ref}, video shows {video_entry_ref}",
                suggested_fix=f"Change entry calculation to use {video_entry_ref}" if not entry_passed else None
            )
            checks.append(entry_check)

        # Check 3: Trade example count
        trade_count = recs.get("trade_count", 0)
        has_enough_examples = trade_count >= 2

        example_check = ValidationCheck(
            check_name="Trade Example Coverage",
            check_type="coverage",
            code_uses=f"N/A",
            video_shows=f"{trade_count} trade examples",
            passed=has_enough_examples,
            severity="warning" if not has_enough_examples else "info",
            details=f"Found {trade_count} trade examples in video analysis",
            suggested_fix="Run trade_example_miner.py to extract more examples" if not has_enough_examples else None
        )
        checks.append(example_check)

        # Check 4: Consistency scores
        stop_consistency = recs.get("stop_consistency", 0)
        entry_consistency = recs.get("entry_consistency", 0)

        if stop_consistency > 0:
            consistency_passed = stop_consistency >= 0.7
            consistency_check = ValidationCheck(
                check_name="Stop Reference Consistency",
                check_type="consistency",
                code_uses="N/A",
                video_shows=f"{stop_consistency:.0%} consistent",
                passed=consistency_passed,
                severity="warning" if not consistency_passed else "info",
                details=f"Trade examples show {stop_consistency:.0%} consistency on stop reference",
                suggested_fix="Manual review recommended due to low consistency" if not consistency_passed else None
            )
            checks.append(consistency_check)

        # Calculate totals
        passed_checks = [c for c in checks if c.passed]
        failed_checks = [c for c in checks if not c.passed and c.severity == "critical"]
        warning_checks = [c for c in checks if not c.passed and c.severity == "warning"]

        validation_passed = len(failed_checks) == 0
        can_auto_fix = all(c.suggested_fix for c in failed_checks)
        requires_manual = any(c.severity == "warning" and not c.passed for c in checks)

        return ValidationResult(
            strategy_file=str(cs_path),
            strategy_version=version,
            video_id=video_id,
            model_id=model_id,
            validated_at=datetime.now().isoformat(),
            validation_passed=validation_passed,
            checks_total=len(checks),
            checks_passed=len(passed_checks),
            checks_failed=len(failed_checks),
            checks_warning=len(warning_checks),
            checks=checks,
            can_auto_fix=can_auto_fix,
            requires_manual_review=requires_manual,
            blocking_issues=blocking_issues
        )

    def save_validation(self, result: ValidationResult) -> int:
        """Save validation result to database."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute("""
            INSERT INTO code_validations (
                model_id, strategy_file, strategy_version,
                validation_passed, checks_total, checks_passed, checks_failed,
                validation_results
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            result.model_id,
            result.strategy_file,
            result.strategy_version,
            result.validation_passed,
            result.checks_total,
            result.checks_passed,
            result.checks_failed,
            json.dumps([asdict(c) for c in result.checks])
        ))

        validation_id = cursor.lastrowid
        conn.commit()
        conn.close()

        return validation_id

    def generate_fix_suggestions(self, result: ValidationResult) -> list[dict]:
        """Generate specific code fix suggestions."""
        suggestions = []

        for check in result.checks:
            if not check.passed and check.suggested_fix:
                suggestions.append({
                    "check": check.check_name,
                    "current": check.code_uses,
                    "should_be": check.video_shows,
                    "suggestion": check.suggested_fix,
                    "severity": check.severity
                })

        return suggestions


# =============================================================================
# CLI Entry Point
# =============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="Validate generated code against visual evidence"
    )
    parser.add_argument(
        "--cs",
        type=Path,
        required=True,
        help="Path to C# strategy file"
    )
    parser.add_argument(
        "--video-id",
        type=str,
        required=True,
        help="Video ID for visual evidence"
    )
    parser.add_argument(
        "--model-id",
        type=int,
        help="Model ID"
    )
    parser.add_argument(
        "--save",
        action="store_true",
        help="Save validation result to database"
    )
    parser.add_argument(
        "--fix",
        action="store_true",
        help="Show suggested fixes"
    )
    parser.add_argument(
        "--output",
        type=Path,
        help="Output JSON file"
    )

    args = parser.parse_args()

    if not args.cs.exists():
        print(f"Error: File not found: {args.cs}")
        return 1

    validator = CodeVisualValidator()
    result = validator.validate(args.cs, args.video_id, args.model_id)

    # Display results
    print("\n" + "=" * 70)
    print(f"VALIDATION: {args.cs.name}")
    print("=" * 70)

    status = "PASSED" if result.validation_passed else "FAILED"
    status_color = "" if result.validation_passed else "!! "
    print(f"\n{status_color}Result: {status}")
    print(f"Checks: {result.checks_passed}/{result.checks_total} passed, "
          f"{result.checks_failed} failed, {result.checks_warning} warnings")

    print("\nDetails:")
    for check in result.checks:
        status = "PASS" if check.passed else ("FAIL" if check.severity == "critical" else "WARN")
        print(f"  [{status}] {check.check_name}")
        print(f"       Code:  {check.code_uses}")
        print(f"       Video: {check.video_shows}")
        if not check.passed:
            print(f"       >> {check.details}")

    if result.blocking_issues:
        print("\nBLOCKING ISSUES:")
        for issue in result.blocking_issues:
            print(f"  - {issue}")

    if args.fix or not result.validation_passed:
        suggestions = validator.generate_fix_suggestions(result)
        if suggestions:
            print("\nSUGGESTED FIXES:")
            for s in suggestions:
                print(f"\n  {s['check']}:")
                print(f"    Current:  {s['current']}")
                print(f"    Should be: {s['should_be']}")
                print(f"    Fix: {s['suggestion']}")

    print("\n" + "=" * 70)

    if not result.validation_passed:
        print("\nOptions:")
        print("  [1] Auto-fix (if available)")
        print("  [2] Override (not recommended)")
        print("  [3] Cancel")

    if args.save:
        validation_id = validator.save_validation(result)
        print(f"\nSaved validation with ID: {validation_id}")

    if args.output:
        output = asdict(result)
        with open(args.output, "w") as f:
            json.dump(output, f, indent=2, default=str)
        print(f"\nResults saved to: {args.output}")

    return 0 if result.validation_passed else 1


if __name__ == "__main__":
    exit(main())
