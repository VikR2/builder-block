#!/usr/bin/env python3
"""
Pine Script Parser for TradingView Pine Script v5/v6.

Extracts structural information from Pine Script files using regex patterns,
then optionally uses Claude for semantic analysis of trading logic.

Usage:
    uv run python scripts/pine_parser.py path/to/strategy.pine
    uv run python scripts/pine_parser.py path/to/strategy.pine --semantic
    uv run python scripts/pine_parser.py path/to/strategy.pine --output parsed.json
"""

import argparse
import json
import re
import sys
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Optional

# Try importing anthropic for semantic analysis
try:
    import anthropic
    ANTHROPIC_AVAILABLE = True
except ImportError:
    ANTHROPIC_AVAILABLE = False


# =============================================================================
# Data Classes
# =============================================================================

@dataclass
class PineInput:
    """Represents an input parameter in Pine Script."""
    name: str
    input_type: str  # "int", "float", "bool", "string", "color"
    default_value: str
    title: Optional[str] = None
    group: Optional[str] = None
    tooltip: Optional[str] = None
    minval: Optional[str] = None
    maxval: Optional[str] = None
    options: Optional[list[str]] = None
    inline: Optional[str] = None


@dataclass
class PineVariable:
    """Represents a variable declaration."""
    name: str
    var_type: str  # "var", "varip", "const", ""
    data_type: str  # "float", "int", "bool", "color", "box", "line", etc.
    initial_value: str
    is_array: bool = False


@dataclass
class PineFunction:
    """Represents a function definition."""
    name: str
    parameters: list[str]
    body: str
    return_type: Optional[str] = None


@dataclass
class PinePlot:
    """Represents a plot/drawing operation."""
    plot_type: str  # "plot", "plotshape", "plotchar", "bgcolor", "barcolor"
    series: str
    title: Optional[str] = None
    color: Optional[str] = None
    style: Optional[str] = None


@dataclass
class PineAlert:
    """Represents an alert condition."""
    condition: str
    message: str
    freq: Optional[str] = None


@dataclass
class PineStructure:
    """Complete parsed structure of a Pine Script."""
    version: int
    script_type: str  # "indicator", "strategy", "library"
    name: str
    overlay: bool = True
    inputs: list[PineInput] = field(default_factory=list)
    variables: list[PineVariable] = field(default_factory=list)
    functions: list[PineFunction] = field(default_factory=list)
    plots: list[PinePlot] = field(default_factory=list)
    alerts: list[PineAlert] = field(default_factory=list)
    raw_content: str = ""
    # Additional metadata
    groups: list[str] = field(default_factory=list)
    colors_defined: list[str] = field(default_factory=list)
    uses_tables: bool = False
    uses_arrays: bool = False
    uses_types: bool = False


@dataclass
class SemanticAnalysis:
    """Semantic analysis results from Claude."""
    trading_patterns: list[str]  # CISD, FVG, OB, etc.
    entry_conditions: list[str]
    exit_conditions: list[str]
    risk_management: dict
    state_machine: Optional[dict] = None
    skill_mappings: list[dict] = field(default_factory=list)
    summary: str = ""


# =============================================================================
# Regex Patterns for Pine Script v6
# =============================================================================

# Version declaration
VERSION_PATTERN = re.compile(r'//@version=(\d+)')

# Indicator/strategy declaration
INDICATOR_PATTERN = re.compile(
    r'indicator\s*\(\s*["\']([^"\']+)["\']\s*(?:,\s*["\']([^"\']+)["\'])?\s*(?:,\s*overlay\s*=\s*(true|false))?',
    re.IGNORECASE
)
STRATEGY_PATTERN = re.compile(
    r'strategy\s*\(\s*["\']([^"\']+)["\']\s*(?:,\s*["\']([^"\']+)["\'])?\s*(?:,\s*overlay\s*=\s*(true|false))?',
    re.IGNORECASE
)
LIBRARY_PATTERN = re.compile(
    r'library\s*\(\s*["\']([^"\']+)["\']',
    re.IGNORECASE
)

# Input patterns
INPUT_INT_PATTERN = re.compile(
    r'(\w+)\s*=\s*input\.int\s*\(\s*(-?\d+)\s*,\s*["\']([^"\']+)["\']([^)]*)\)',
    re.MULTILINE
)
INPUT_FLOAT_PATTERN = re.compile(
    r'(\w+)\s*=\s*input\.float\s*\(\s*(-?[\d.]+)\s*,\s*["\']([^"\']+)["\']([^)]*)\)',
    re.MULTILINE
)
INPUT_BOOL_PATTERN = re.compile(
    r'(\w+)\s*=\s*input\.bool\s*\(\s*(true|false)\s*,\s*["\']([^"\']+)["\']([^)]*)\)',
    re.IGNORECASE | re.MULTILINE
)
INPUT_STRING_PATTERN = re.compile(
    r'(\w+)\s*=\s*input\.string\s*\(\s*["\']([^"\']+)["\']\s*,\s*["\']([^"\']+)["\']([^)]*)\)',
    re.MULTILINE
)
INPUT_COLOR_PATTERN = re.compile(
    r'(\w+)\s*=\s*input\.color\s*\(\s*([^,]+)\s*,\s*["\']([^"\']+)["\']([^)]*)\)',
    re.MULTILINE
)

# Variable patterns
VAR_PATTERN = re.compile(
    r'^(var|varip)?\s*(float|int|bool|color|string|box|line|label|table|array<\w+>)\s+(\w+)\s*=\s*(.+)$',
    re.MULTILINE
)

# Function pattern (simple single-expression and multi-line)
FUNC_SIMPLE_PATTERN = re.compile(
    r'^(\w+)\s*\(([^)]*)\)\s*=>\s*(.+)$',
    re.MULTILINE
)
FUNC_MULTILINE_PATTERN = re.compile(
    r'^(\w+)\s*\(([^)]*)\)\s*=>\s*$',
    re.MULTILINE
)

# Plot patterns
PLOT_PATTERN = re.compile(
    r'(plot|plotshape|plotchar|bgcolor|barcolor)\s*\(([^)]+)\)',
    re.MULTILINE
)

# Alert patterns
ALERT_PATTERN = re.compile(
    r'alert\s*\(\s*["\']([^"\']+)["\']\s*(?:,\s*([^)]+))?\)',
    re.MULTILINE
)
ALERTCONDITION_PATTERN = re.compile(
    r'alertcondition\s*\(\s*([^,]+)\s*,\s*["\']([^"\']+)["\']\s*(?:,\s*["\']([^"\']+)["\'])?\)',
    re.MULTILINE
)

# Group pattern
GROUP_PATTERN = re.compile(
    r'group\s*=\s*(\w+)',
    re.MULTILINE
)

# Color definition pattern
COLOR_DEF_PATTERN = re.compile(
    r'var\s+color\s+(\w+)\s*=\s*color\.(new|rgb)\s*\(',
    re.MULTILINE
)

# Type definition (Pine v5+)
TYPE_PATTERN = re.compile(
    r'^type\s+(\w+)',
    re.MULTILINE
)


# =============================================================================
# Parser Functions
# =============================================================================

def extract_version(content: str) -> int:
    """Extract Pine Script version number."""
    match = VERSION_PATTERN.search(content)
    if match:
        return int(match.group(1))
    return 5  # Default to v5


def extract_script_type(content: str) -> tuple[str, str, bool]:
    """
    Extract script type, name, and overlay setting.

    Returns:
        Tuple of (script_type, name, overlay)
    """
    # Check for indicator
    match = INDICATOR_PATTERN.search(content)
    if match:
        name = match.group(1)
        overlay = match.group(3) != "false" if match.group(3) else True
        return ("indicator", name, overlay)

    # Check for strategy
    match = STRATEGY_PATTERN.search(content)
    if match:
        name = match.group(1)
        overlay = match.group(3) != "false" if match.group(3) else True
        return ("strategy", name, overlay)

    # Check for library
    match = LIBRARY_PATTERN.search(content)
    if match:
        return ("library", match.group(1), False)

    return ("unknown", "Unknown Script", True)


def _parse_input_extras(extras: str) -> dict:
    """Parse extra parameters from input function call."""
    result = {}

    # Extract group
    group_match = re.search(r'group\s*=\s*(\w+)', extras)
    if group_match:
        result["group"] = group_match.group(1)

    # Extract tooltip
    tooltip_match = re.search(r'tooltip\s*=\s*["\']([^"\']+)["\']', extras)
    if tooltip_match:
        result["tooltip"] = tooltip_match.group(1)

    # Extract minval
    minval_match = re.search(r'minval\s*=\s*(-?[\d.]+)', extras)
    if minval_match:
        result["minval"] = minval_match.group(1)

    # Extract maxval
    maxval_match = re.search(r'maxval\s*=\s*(-?[\d.]+)', extras)
    if maxval_match:
        result["maxval"] = maxval_match.group(1)

    # Extract options
    options_match = re.search(r'options\s*=\s*\[([^\]]+)\]', extras)
    if options_match:
        options_str = options_match.group(1)
        options = re.findall(r'["\']([^"\']+)["\']', options_str)
        result["options"] = options

    # Extract inline
    inline_match = re.search(r'inline\s*=\s*["\']([^"\']+)["\']', extras)
    if inline_match:
        result["inline"] = inline_match.group(1)

    return result


def extract_inputs(content: str) -> list[PineInput]:
    """Extract all input declarations."""
    inputs = []

    # input.int
    for match in INPUT_INT_PATTERN.finditer(content):
        extras = _parse_input_extras(match.group(4))
        inputs.append(PineInput(
            name=match.group(1),
            input_type="int",
            default_value=match.group(2),
            title=match.group(3),
            **extras
        ))

    # input.float
    for match in INPUT_FLOAT_PATTERN.finditer(content):
        extras = _parse_input_extras(match.group(4))
        inputs.append(PineInput(
            name=match.group(1),
            input_type="float",
            default_value=match.group(2),
            title=match.group(3),
            **extras
        ))

    # input.bool
    for match in INPUT_BOOL_PATTERN.finditer(content):
        extras = _parse_input_extras(match.group(4))
        inputs.append(PineInput(
            name=match.group(1),
            input_type="bool",
            default_value=match.group(2).lower(),
            title=match.group(3),
            **extras
        ))

    # input.string
    for match in INPUT_STRING_PATTERN.finditer(content):
        extras = _parse_input_extras(match.group(4))
        inputs.append(PineInput(
            name=match.group(1),
            input_type="string",
            default_value=match.group(2),
            title=match.group(3),
            **extras
        ))

    # input.color
    for match in INPUT_COLOR_PATTERN.finditer(content):
        extras = _parse_input_extras(match.group(4))
        inputs.append(PineInput(
            name=match.group(1),
            input_type="color",
            default_value=match.group(2).strip(),
            title=match.group(3),
            **extras
        ))

    return inputs


def extract_variables(content: str) -> list[PineVariable]:
    """Extract variable declarations."""
    variables = []

    for match in VAR_PATTERN.finditer(content):
        var_type = match.group(1) or ""
        data_type = match.group(2)
        name = match.group(3)
        initial_value = match.group(4).strip()

        is_array = data_type.startswith("array<")

        variables.append(PineVariable(
            name=name,
            var_type=var_type,
            data_type=data_type,
            initial_value=initial_value,
            is_array=is_array
        ))

    return variables


def extract_functions(content: str) -> list[PineFunction]:
    """Extract function definitions."""
    functions = []

    # Simple single-line functions
    for match in FUNC_SIMPLE_PATTERN.finditer(content):
        functions.append(PineFunction(
            name=match.group(1),
            parameters=match.group(2).split(",") if match.group(2).strip() else [],
            body=match.group(3).strip()
        ))

    # Multi-line functions (more complex parsing)
    # For now, just detect their presence
    for match in FUNC_MULTILINE_PATTERN.finditer(content):
        # Find the function body by looking for indented lines
        start_pos = match.end()
        lines = content[start_pos:].split('\n')
        body_lines = []
        for line in lines[1:]:  # Skip the => line
            if line.strip() and not line.startswith(' ') and not line.startswith('\t'):
                break
            if line.strip():
                body_lines.append(line)

        functions.append(PineFunction(
            name=match.group(1),
            parameters=[p.strip() for p in match.group(2).split(",") if p.strip()],
            body="\n".join(body_lines)
        ))

    return functions


def extract_plots(content: str) -> list[PinePlot]:
    """Extract plot/drawing operations."""
    plots = []

    for match in PLOT_PATTERN.finditer(content):
        plot_type = match.group(1)
        args = match.group(2)

        # Try to extract series and title
        series = args.split(",")[0].strip() if args else ""

        title_match = re.search(r'title\s*=\s*["\']([^"\']+)["\']', args)
        title = title_match.group(1) if title_match else None

        color_match = re.search(r'color\s*=\s*([^,)]+)', args)
        color = color_match.group(1).strip() if color_match else None

        plots.append(PinePlot(
            plot_type=plot_type,
            series=series,
            title=title,
            color=color
        ))

    return plots


def extract_alerts(content: str) -> list[PineAlert]:
    """Extract alert conditions."""
    alerts = []

    # alert() calls
    for match in ALERT_PATTERN.finditer(content):
        alerts.append(PineAlert(
            condition="runtime",
            message=match.group(1),
            freq=match.group(2).strip() if match.group(2) else None
        ))

    # alertcondition() calls
    for match in ALERTCONDITION_PATTERN.finditer(content):
        alerts.append(PineAlert(
            condition=match.group(1).strip(),
            message=match.group(2),
            freq=match.group(3) if match.group(3) else None
        ))

    return alerts


def extract_groups(content: str) -> list[str]:
    """Extract unique group names."""
    groups = set()

    # Find group variable definitions
    group_vars = re.findall(r'(\w+)\s*=\s*["\']([^"\']+)["\']', content)
    for var_name, _ in group_vars:
        if "GRP" in var_name.upper() or "GROUP" in var_name.upper():
            groups.add(var_name)

    # Find group= references
    for match in GROUP_PATTERN.finditer(content):
        groups.add(match.group(1))

    return list(groups)


def extract_colors(content: str) -> list[str]:
    """Extract defined color constants."""
    colors = []
    for match in COLOR_DEF_PATTERN.finditer(content):
        colors.append(match.group(1))
    return colors


def parse_pine_script(content: str) -> PineStructure:
    """
    Parse a Pine Script file and extract structural information.

    Args:
        content: Pine Script source code

    Returns:
        PineStructure with all extracted information
    """
    version = extract_version(content)
    script_type, name, overlay = extract_script_type(content)

    return PineStructure(
        version=version,
        script_type=script_type,
        name=name,
        overlay=overlay,
        inputs=extract_inputs(content),
        variables=extract_variables(content),
        functions=extract_functions(content),
        plots=extract_plots(content),
        alerts=extract_alerts(content),
        raw_content=content,
        groups=extract_groups(content),
        colors_defined=extract_colors(content),
        uses_tables="table" in content.lower() and "table.new" in content,
        uses_arrays="array." in content or "array<" in content,
        uses_types=bool(TYPE_PATTERN.search(content))
    )


# =============================================================================
# Semantic Analysis with Claude
# =============================================================================

SEMANTIC_ANALYSIS_PROMPT = """Analyze this TradingView Pine Script and extract trading semantics.

## Pine Script Content:
```pinescript
{content}
```

## Extracted Structure:
{structure_json}

## Task:
Analyze the trading logic and identify:

1. **Trading Patterns Used** - List any trading patterns like:
   - CISD (Change in State of Delivery)
   - FVG (Fair Value Gap)
   - Order Blocks (OB)
   - Liquidity Sweeps
   - Break of Structure (BOS)
   - Market Structure Shift (MSS)
   - Opening Range
   - Previous Day High/Low (PDH/PDL)
   - Candle patterns (engulfing, pin bar, etc.)

2. **Entry Conditions** - List the specific conditions that trigger entries

3. **Exit Conditions** - List take profit and stop loss logic

4. **Risk Management** - Describe stop placement, target calculation, position sizing

5. **State Machine** - If the script uses stages/phases, describe the state transitions

6. **Summary** - A 2-3 sentence summary of what this indicator/strategy does

Respond in JSON format:
```json
{{
    "trading_patterns": ["pattern1", "pattern2"],
    "entry_conditions": ["condition1", "condition2"],
    "exit_conditions": ["exit1", "exit2"],
    "risk_management": {{
        "stop_type": "description",
        "target_type": "description",
        "position_sizing": "description"
    }},
    "state_machine": {{
        "stages": ["stage1", "stage2"],
        "transitions": ["stage1 -> stage2 when condition"]
    }},
    "summary": "Brief description of the strategy"
}}
```
"""


def analyze_semantics(structure: PineStructure, api_key: Optional[str] = None) -> SemanticAnalysis:
    """
    Use Claude to analyze trading semantics in Pine Script.

    Args:
        structure: Parsed Pine Script structure
        api_key: Anthropic API key (uses env var if not provided)

    Returns:
        SemanticAnalysis with trading logic details
    """
    if not ANTHROPIC_AVAILABLE:
        raise ImportError(
            "anthropic package is not installed. "
            "Install with: pip install anthropic"
        )

    client = anthropic.Anthropic(api_key=api_key)

    # Prepare structure JSON (exclude raw_content to save tokens)
    structure_dict = asdict(structure)
    del structure_dict["raw_content"]
    structure_json = json.dumps(structure_dict, indent=2)

    prompt = SEMANTIC_ANALYSIS_PROMPT.format(
        content=structure.raw_content[:8000],  # Limit content length
        structure_json=structure_json
    )

    message = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=2000,
        messages=[
            {"role": "user", "content": prompt}
        ]
    )

    # Parse response
    response_text = message.content[0].text

    # Extract JSON from response
    json_match = re.search(r'```json\s*(.*?)\s*```', response_text, re.DOTALL)
    if json_match:
        try:
            data = json.loads(json_match.group(1))
            return SemanticAnalysis(
                trading_patterns=data.get("trading_patterns", []),
                entry_conditions=data.get("entry_conditions", []),
                exit_conditions=data.get("exit_conditions", []),
                risk_management=data.get("risk_management", {}),
                state_machine=data.get("state_machine"),
                summary=data.get("summary", "")
            )
        except json.JSONDecodeError:
            pass

    # Fallback: return empty analysis
    return SemanticAnalysis(
        trading_patterns=[],
        entry_conditions=[],
        exit_conditions=[],
        risk_management={},
        summary="Could not parse semantic analysis"
    )


# =============================================================================
# Main Entry Point
# =============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="Parse TradingView Pine Script files"
    )
    parser.add_argument(
        "file",
        type=Path,
        help="Path to Pine Script file (.pine)"
    )
    parser.add_argument(
        "--semantic",
        action="store_true",
        help="Include semantic analysis using Claude"
    )
    parser.add_argument(
        "--output", "-o",
        type=Path,
        help="Output file for JSON results"
    )
    parser.add_argument(
        "--pretty",
        action="store_true",
        help="Pretty-print JSON output"
    )

    args = parser.parse_args()

    # Validate file
    if not args.file.exists():
        print(f"Error: File not found: {args.file}", file=sys.stderr)
        sys.exit(1)

    if not args.file.suffix.lower() in (".pine", ".pinescript", ".txt"):
        print(f"Warning: File may not be Pine Script: {args.file}", file=sys.stderr)

    # Read and parse
    content = args.file.read_text(encoding="utf-8")
    structure = parse_pine_script(content)

    # Convert to dict for output
    result = asdict(structure)
    del result["raw_content"]  # Don't include raw content in output

    # Add semantic analysis if requested
    if args.semantic:
        try:
            semantics = analyze_semantics(structure)
            result["semantic_analysis"] = asdict(semantics)
        except ImportError as e:
            print(f"Warning: {e}", file=sys.stderr)
        except Exception as e:
            print(f"Warning: Semantic analysis failed: {e}", file=sys.stderr)

    # Output
    indent = 2 if args.pretty else None
    output_json = json.dumps(result, indent=indent, default=str)

    if args.output:
        args.output.write_text(output_json, encoding="utf-8")
        print(f"Output written to: {args.output}")
    else:
        print(output_json)

    # Print summary to stderr
    print(f"\n--- Summary ---", file=sys.stderr)
    print(f"Version: {structure.version}", file=sys.stderr)
    print(f"Type: {structure.script_type}", file=sys.stderr)
    print(f"Name: {structure.name}", file=sys.stderr)
    print(f"Inputs: {len(structure.inputs)}", file=sys.stderr)
    print(f"Variables: {len(structure.variables)}", file=sys.stderr)
    print(f"Functions: {len(structure.functions)}", file=sys.stderr)
    print(f"Plots: {len(structure.plots)}", file=sys.stderr)
    print(f"Alerts: {len(structure.alerts)}", file=sys.stderr)


if __name__ == "__main__":
    main()
