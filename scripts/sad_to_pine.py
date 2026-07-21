#!/usr/bin/env python3
"""
SAD to Pine Script Generator.

Converts Strategy Architecture Documents (SADs) to TradingView Pine Script v6.

Usage:
    uv run python scripts/sad_to_pine.py data/architectures/my-strategy.md
    uv run python scripts/sad_to_pine.py data/architectures/my-strategy.md --output scripts-output/TradingView/
    uv run python scripts/sad_to_pine.py data/architectures/my-strategy.md --type strategy
"""

import argparse
import json
import re
import sqlite3
import sys
from dataclasses import dataclass, field
from pathlib import Path
from string import Template
from typing import Optional

# Try importing anthropic for code generation
try:
    import anthropic
    ANTHROPIC_AVAILABLE = True
except ImportError:
    ANTHROPIC_AVAILABLE = False


# =============================================================================
# Configuration
# =============================================================================

SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent
TEMPLATES_DIR = SCRIPT_DIR / "templates"
DB_PATH = PROJECT_ROOT / "data" / "builder.db"
DEFAULT_OUTPUT_DIR = PROJECT_ROOT / "scripts-output" / "TradingView"


# =============================================================================
# Data Classes
# =============================================================================

@dataclass
class SADMetadata:
    """Extracted metadata from SAD file."""
    title: str
    source_url: Optional[str] = None
    creator: Optional[str] = None
    status: Optional[str] = None
    model_id: Optional[str] = None


@dataclass
class SADSection:
    """A section from the SAD document."""
    heading: str
    level: int
    content: str


@dataclass
class ParsedSAD:
    """Complete parsed SAD document."""
    metadata: SADMetadata
    overview: str
    sections: list[SADSection]
    skills_used: list[dict]  # {skill_id, name, role}
    entry_checklist: list[str]
    timeframes: dict  # {bias_tf, confirm_tf, entry_tf}
    state_machine: Optional[str] = None
    mermaid_diagrams: list[str] = field(default_factory=list)
    raw_content: str = ""


@dataclass
class PineGenerationContext:
    """Context for Pine Script generation."""
    sad: ParsedSAD
    skills_with_pine: list[dict]  # Skills that have pine_snippet
    output_type: str  # "indicator" or "strategy"
    author: str = "builder-block-C"


# =============================================================================
# SAD Parser
# =============================================================================

def parse_sad_metadata(content: str) -> SADMetadata:
    """Extract metadata from SAD header."""
    title_match = re.search(r'^#\s+(?:Strategy Architecture Document:?\s*)?(.+)$', content, re.MULTILINE)
    title = title_match.group(1).strip() if title_match else "Untitled Strategy"

    source_match = re.search(r'\*\*Source:\*\*\s*\[([^\]]+)\]\(([^)]+)\)', content)
    source_url = source_match.group(2) if source_match else None

    creator_match = re.search(r'\*\*Creator:\*\*\s*(.+)$', content, re.MULTILINE)
    creator = creator_match.group(1).strip() if creator_match else None

    status_match = re.search(r'\*\*Status:\*\*\s*(.+)$', content, re.MULTILINE)
    status = status_match.group(1).strip() if status_match else None

    model_id_match = re.search(r'\*\*Model ID:\*\*\s*#?(\d+)', content)
    model_id = model_id_match.group(1) if model_id_match else None

    return SADMetadata(
        title=title,
        source_url=source_url,
        creator=creator,
        status=status,
        model_id=model_id
    )


def parse_sad_sections(content: str) -> list[SADSection]:
    """Parse SAD into sections by headings."""
    sections = []

    # Split by markdown headings
    heading_pattern = re.compile(r'^(#{1,4})\s+(.+)$', re.MULTILINE)

    matches = list(heading_pattern.finditer(content))

    for i, match in enumerate(matches):
        level = len(match.group(1))
        heading = match.group(2).strip()

        # Get content until next heading
        start = match.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(content)
        section_content = content[start:end].strip()

        sections.append(SADSection(
            heading=heading,
            level=level,
            content=section_content
        ))

    return sections


def extract_skills_from_sad(content: str) -> list[dict]:
    """Extract skills table from SAD."""
    skills = []

    # Look for skills table
    table_match = re.search(r'\|\s*Phase\s*\|.*Skill ID.*\|.*Skill Name.*\|.*Role.*\|', content, re.IGNORECASE)
    if not table_match:
        # Try alternative format
        table_match = re.search(r'\|\s*ID\s*\|.*Name.*\|', content, re.IGNORECASE)

    if table_match:
        # Find table rows after header
        table_start = table_match.start()
        table_section = content[table_start:table_start + 2000]

        # Parse rows
        row_pattern = re.compile(r'\|\s*([^|]+)\s*\|\s*(\d+)\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|')
        for match in row_pattern.finditer(table_section):
            phase = match.group(1).strip()
            skill_id = int(match.group(2))
            name = match.group(3).strip()
            role = match.group(4).strip()

            if phase != "---" and name:  # Skip separator rows
                skills.append({
                    "phase": phase,
                    "skill_id": skill_id,
                    "name": name,
                    "role": role
                })

    return skills


def extract_timeframes(content: str) -> dict:
    """Extract timeframe configuration from SAD."""
    timeframes = {
        "bias_tf": "D",
        "confirm_tf": "60",
        "entry_tf": "5"
    }

    # Look for timeframe table
    tf_pattern = re.compile(r'\|\s*\*\*([^*]+)\*\*\s*\|[^|]+\|\s*(\w+)\s*\|', re.IGNORECASE)
    for match in tf_pattern.finditer(content):
        tf_type = match.group(1).lower()
        value = match.group(2)

        if "bias" in tf_type:
            timeframes["bias_tf"] = value
        elif "confirm" in tf_type:
            timeframes["confirm_tf"] = value
        elif "entry" in tf_type:
            timeframes["entry_tf"] = value

    return timeframes


def extract_entry_checklist(content: str) -> list[str]:
    """Extract entry checklist items from SAD."""
    items = []

    # Find checklist section
    checklist_match = re.search(r'##\s*Entry\s*Checklist(.*?)(?=##|$)', content, re.DOTALL | re.IGNORECASE)
    if checklist_match:
        checklist_content = checklist_match.group(1)

        # Extract checkbox items
        item_pattern = re.compile(r'[-*]\s*\[\s*[xX ]?\s*\]\s*(.+)$', re.MULTILINE)
        for match in item_pattern.finditer(checklist_content):
            item = match.group(1).strip()
            if item and not item.startswith("---"):
                items.append(item)

    return items


def extract_mermaid_diagrams(content: str) -> list[str]:
    """Extract mermaid diagrams from SAD."""
    diagrams = []

    mermaid_pattern = re.compile(r'```mermaid\s*(.*?)\s*```', re.DOTALL)
    for match in mermaid_pattern.finditer(content):
        diagrams.append(match.group(1).strip())

    return diagrams


def extract_state_machine(content: str) -> Optional[str]:
    """Extract state machine description from SAD."""
    # Look for state machine section
    sm_match = re.search(r'##\s*State\s*Machine(.*?)(?=##|$)', content, re.DOTALL | re.IGNORECASE)
    if sm_match:
        return sm_match.group(1).strip()
    return None


def extract_overview(content: str) -> str:
    """Extract overview section from SAD."""
    overview_match = re.search(r'##\s*Overview\s*(.*?)(?=##|---)', content, re.DOTALL | re.IGNORECASE)
    if overview_match:
        return overview_match.group(1).strip()
    return ""


def parse_sad(file_path: Path) -> ParsedSAD:
    """Parse a SAD file into structured data."""
    content = file_path.read_text(encoding="utf-8")

    metadata = parse_sad_metadata(content)
    sections = parse_sad_sections(content)
    skills = extract_skills_from_sad(content)
    timeframes = extract_timeframes(content)
    checklist = extract_entry_checklist(content)
    mermaid = extract_mermaid_diagrams(content)
    state_machine = extract_state_machine(content)
    overview = extract_overview(content)

    return ParsedSAD(
        metadata=metadata,
        overview=overview,
        sections=sections,
        skills_used=skills,
        entry_checklist=checklist,
        timeframes=timeframes,
        state_machine=state_machine,
        mermaid_diagrams=mermaid,
        raw_content=content
    )


# =============================================================================
# Skills Database
# =============================================================================

def get_skills_with_pine(db_path: Path, skill_ids: list[int]) -> list[dict]:
    """Fetch skills with their Pine Script snippets from database."""
    if not db_path.exists():
        print(f"Warning: Database not found at {db_path}", file=sys.stderr)
        return []

    if not skill_ids:
        return []

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    placeholders = ",".join("?" * len(skill_ids))
    cursor.execute(f"""
        SELECT id, name, slug, category, description, code_snippet, pine_snippet
        FROM skills
        WHERE id IN ({placeholders})
    """, skill_ids)

    skills = []
    for row in cursor.fetchall():
        skills.append({
            "id": row["id"],
            "name": row["name"],
            "slug": row["slug"],
            "category": row["category"],
            "description": row["description"],
            "code_snippet": row["code_snippet"],
            "pine_snippet": row["pine_snippet"]
        })

    conn.close()
    return skills


# =============================================================================
# Pine Script Generation
# =============================================================================

PINE_GENERATION_PROMPT = """Generate TradingView Pine Script v6 code based on this Strategy Architecture Document.

## SAD Content:
{sad_content}

## Skills Used:
{skills_json}

## Timeframes:
- Bias TF: {bias_tf}
- Confirmation TF: {confirm_tf}
- Entry TF: {entry_tf}

## Entry Checklist:
{checklist}

## Output Type: {output_type}

## Requirements:
1. Generate complete, working Pine Script v6 code
2. Use proper Pine Script v6 syntax (indicator() or strategy())
3. Include all necessary input parameters with sensible defaults
4. Implement the entry logic described in the SAD
5. Include state tracking variables for multi-step setups
6. Add visualization (zones, levels, signals)
7. Include alertcondition() for entry signals
8. Add a dashboard table showing current state
9. Use the color scheme: bullish=#22C55E, bearish=#EF4444, neutral=#6B7280

## Output Format:
Return ONLY the Pine Script code, wrapped in ```pinescript and ``` tags.
No explanations before or after the code.
"""


def generate_pine_with_claude(context: PineGenerationContext) -> str:
    """Use Claude to generate Pine Script from SAD context."""
    if not ANTHROPIC_AVAILABLE:
        raise ImportError(
            "anthropic package is not installed. "
            "Install with: pip install anthropic"
        )

    client = anthropic.Anthropic()

    # Prepare skills JSON
    skills_json = json.dumps(context.skills_with_pine, indent=2)

    # Prepare checklist
    checklist = "\n".join(f"- {item}" for item in context.sad.entry_checklist)

    prompt = PINE_GENERATION_PROMPT.format(
        sad_content=context.sad.raw_content[:10000],  # Limit content
        skills_json=skills_json,
        bias_tf=context.sad.timeframes.get("bias_tf", "D"),
        confirm_tf=context.sad.timeframes.get("confirm_tf", "60"),
        entry_tf=context.sad.timeframes.get("entry_tf", "5"),
        checklist=checklist,
        output_type=context.output_type
    )

    message = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=8000,
        messages=[
            {"role": "user", "content": prompt}
        ]
    )

    response_text = message.content[0].text

    # Extract Pine Script from response
    pine_match = re.search(r'```(?:pinescript|pine)?\s*(.*?)\s*```', response_text, re.DOTALL)
    if pine_match:
        return pine_match.group(1).strip()

    return response_text


def generate_pine_from_template(context: PineGenerationContext) -> str:
    """Generate Pine Script using templates (fallback when Claude unavailable)."""
    template_name = f"pine_{context.output_type}.template"
    template_path = TEMPLATES_DIR / template_name

    if not template_path.exists():
        raise FileNotFoundError(f"Template not found: {template_path}")

    template_content = template_path.read_text(encoding="utf-8")

    # Simple template substitution
    substitutions = {
        "STRATEGY_NAME": context.sad.metadata.title,
        "AUTHOR": context.author,
        "OVERLAY": "true",
        "TIME_INPUTS": "// Time inputs will be configured based on strategy",
        "STRATEGY_INPUTS": "// Strategy-specific inputs",
        "STATE_VARIABLES": "// State tracking variables",
        "HELPER_FUNCTIONS": "// Helper functions",
        "DAILY_RESET": "// Reset state on new day",
        "MAIN_LOGIC": "// Main trading logic",
        "ENTRY_CONDITIONS": "// Entry condition detection",
        "EXIT_CONDITIONS": "// Exit logic",
        "SIGNAL_VISUALIZATION": "// Signal markers",
        "ZONE_VISUALIZATION": "// Zone drawing",
        "LEVEL_VISUALIZATION": "// Entry/SL/TP levels",
        "DASHBOARD": "// Dashboard table",
        "ALERTS": "// Alert conditions",
        # Strategy-specific
        "INITIAL_CAPITAL": "100000",
        "QTY_PERCENT": "1",
        "COMMISSION": "2.5",
        "LONG_CONDITION": "false",
        "SHORT_CONDITION": "false",
        "LONG_STOP": "na",
        "SHORT_STOP": "na",
    }

    # Use Template for safe substitution
    template = Template(template_content)
    try:
        return template.safe_substitute(substitutions)
    except Exception as e:
        print(f"Warning: Template substitution error: {e}", file=sys.stderr)
        return template_content


def generate_pine_script(
    sad_path: Path,
    output_type: str = "indicator",
    use_claude: bool = True,
    author: str = "builder-block-C"
) -> str:
    """
    Generate Pine Script from SAD file.

    Args:
        sad_path: Path to SAD markdown file
        output_type: "indicator" or "strategy"
        use_claude: Whether to use Claude for generation
        author: Author name for script header

    Returns:
        Generated Pine Script code
    """
    # Parse SAD
    sad = parse_sad(sad_path)

    # Get skills with Pine snippets
    skill_ids = [s["skill_id"] for s in sad.skills_used]
    skills_with_pine = get_skills_with_pine(DB_PATH, skill_ids)

    # Create generation context
    context = PineGenerationContext(
        sad=sad,
        skills_with_pine=skills_with_pine,
        output_type=output_type,
        author=author
    )

    # Generate
    if use_claude and ANTHROPIC_AVAILABLE:
        try:
            return generate_pine_with_claude(context)
        except Exception as e:
            print(f"Warning: Claude generation failed: {e}", file=sys.stderr)
            print("Falling back to template generation...", file=sys.stderr)

    return generate_pine_from_template(context)


# =============================================================================
# Main Entry Point
# =============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="Generate Pine Script from Strategy Architecture Document"
    )
    parser.add_argument(
        "sad_file",
        type=Path,
        help="Path to SAD markdown file"
    )
    parser.add_argument(
        "--output", "-o",
        type=Path,
        help="Output file path or directory"
    )
    parser.add_argument(
        "--type", "-t",
        choices=["indicator", "strategy"],
        default="indicator",
        help="Output type (indicator or strategy)"
    )
    parser.add_argument(
        "--no-claude",
        action="store_true",
        help="Don't use Claude for generation (use templates only)"
    )
    parser.add_argument(
        "--author",
        default="builder-block-C",
        help="Author name for script header"
    )
    parser.add_argument(
        "--parse-only",
        action="store_true",
        help="Only parse SAD and output JSON (no code generation)"
    )

    args = parser.parse_args()

    # Validate input
    if not args.sad_file.exists():
        print(f"Error: SAD file not found: {args.sad_file}", file=sys.stderr)
        sys.exit(1)

    # Parse-only mode
    if args.parse_only:
        sad = parse_sad(args.sad_file)
        output = {
            "metadata": {
                "title": sad.metadata.title,
                "source_url": sad.metadata.source_url,
                "creator": sad.metadata.creator,
                "status": sad.metadata.status,
                "model_id": sad.metadata.model_id
            },
            "overview": sad.overview,
            "skills_used": sad.skills_used,
            "timeframes": sad.timeframes,
            "entry_checklist": sad.entry_checklist,
            "has_state_machine": sad.state_machine is not None,
            "mermaid_diagram_count": len(sad.mermaid_diagrams),
            "section_count": len(sad.sections)
        }
        print(json.dumps(output, indent=2))
        return

    # Generate Pine Script
    print(f"Generating Pine Script from: {args.sad_file}", file=sys.stderr)
    print(f"Output type: {args.type}", file=sys.stderr)

    pine_code = generate_pine_script(
        args.sad_file,
        output_type=args.type,
        use_claude=not args.no_claude,
        author=args.author
    )

    # Determine output path
    if args.output:
        if args.output.is_dir():
            # Generate filename from SAD title
            sad = parse_sad(args.sad_file)
            safe_name = re.sub(r'[^\w\s-]', '', sad.metadata.title).strip()
            safe_name = re.sub(r'[-\s]+', '_', safe_name)
            output_path = args.output / f"{safe_name}.pine"
        else:
            output_path = args.output
    else:
        output_path = None

    # Write output
    if output_path:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(pine_code, encoding="utf-8")
        print(f"Pine Script written to: {output_path}", file=sys.stderr)
    else:
        print(pine_code)


if __name__ == "__main__":
    main()
