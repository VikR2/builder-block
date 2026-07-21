"""
Quick context loader for strategy development.

Usage:
    python scripts/load_context.py --strategy tcm [--format json|markdown]
    python scripts/load_context.py -s ttrades -f json
    python scripts/load_context.py -s lumi --full

Loads:
    - Skills from database matching the pattern
    - Architecture documents from data/architectures/
    - Processed video metadata
"""

import sqlite3
import json
import argparse
import sys
from pathlib import Path
from typing import Optional

# Fix Windows console encoding
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding='utf-8')

DB_PATH = Path(__file__).parent.parent / "data" / "builder.db"
ARCH_PATH = Path(__file__).parent.parent / "data" / "architectures"


def load_skills_by_pattern(pattern: str) -> list[dict]:
    """Load skills matching pattern in name, category, or description."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    like_pattern = f"%{pattern}%"
    cur.execute("""
        SELECT id, name, slug, category, subcategory, description,
               code_snippet, pine_snippet, variables_required, dependencies,
               complexity, trading_style, timeframe, poi_types, timeframe_context
        FROM skills
        WHERE name LIKE ? OR description LIKE ? OR category LIKE ?
        ORDER BY id
    """, (like_pattern, like_pattern, like_pattern))

    skills = [dict(row) for row in cur.fetchall()]
    conn.close()
    return skills


def load_architecture_docs(pattern: str) -> list[dict]:
    """Load matching architecture documents from data/architectures/."""
    docs = []
    if not ARCH_PATH.exists():
        return docs

    for md_file in ARCH_PATH.glob("*.md"):
        if md_file.name == "CLAUDE.md":
            continue
        if pattern.lower() in md_file.name.lower() or pattern.lower() in md_file.read_text(encoding="utf-8").lower()[:500]:
            content = md_file.read_text(encoding="utf-8")
            docs.append({
                "path": str(md_file.relative_to(ARCH_PATH.parent.parent)),
                "name": md_file.stem,
                "content": content
            })
    return docs


def load_video_metadata(pattern: str) -> list[dict]:
    """Load processed video metadata from database."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    like_pattern = f"%{pattern}%"
    cur.execute("""
        SELECT id, filename, title, file_path, sad_path, pine_path,
               skills_extracted, duration_sec, processing_status
        FROM processed_local_videos
        WHERE filename LIKE ? OR title LIKE ?
    """, (like_pattern, like_pattern))

    videos = [dict(row) for row in cur.fetchall()]
    conn.close()
    return videos


def format_markdown(context: dict, full: bool = False) -> str:
    """Format context as Markdown for Claude consumption."""
    lines = [f"# Strategy Context: {context['strategy'].upper()}\n"]

    # Skills summary table
    if context["skills"]:
        lines.append("## Skills\n")
        lines.append("| ID | Name | Category |")
        lines.append("|-----|------|----------|")
        for s in context["skills"]:
            lines.append(f"| {s['id']} | {s['name']} | {s['category']} |")
        lines.append("")

        # Skill details
        lines.append("### Skill Details\n")
        for s in context["skills"]:
            lines.append(f"**#{s['id']} {s['name']}** ({s['category']})")
            desc = s['description'] or ""
            if full:
                lines.append(f"> {desc}")
            else:
                lines.append(f"> {desc[:300]}..." if len(desc) > 300 else f"> {desc}")

            # Show code snippets if available and full mode
            if full:
                if s.get('pine_snippet'):
                    lines.append("\n```pine")
                    lines.append(s['pine_snippet'][:500])
                    lines.append("```")
                if s.get('code_snippet'):
                    lines.append("\n```csharp")
                    lines.append(s['code_snippet'][:500])
                    lines.append("```")
            lines.append("")
    else:
        lines.append("## Skills\n")
        lines.append("*No skills found matching pattern*\n")

    # Architecture docs
    lines.append("## Architecture Documents\n")
    if context["architectures"]:
        for doc in context["architectures"]:
            lines.append(f"### {doc['name']}")
            lines.append(f"*Path: `{doc['path']}`*\n")
            if full:
                lines.append(doc['content'])
            else:
                # Show first 1000 chars
                preview = doc['content'][:1000]
                lines.append(preview + "..." if len(doc['content']) > 1000 else preview)
            lines.append("")
    else:
        lines.append("*No architecture documents found*\n")

    # Videos
    lines.append("## Source Videos\n")
    if context["videos"]:
        for v in context["videos"]:
            title = v.get('title') or v.get('filename', 'Unknown')
            skills_count = v.get('skills_extracted') or 0
            duration = v.get('duration_sec')
            duration_str = f" ({duration // 60}m {duration % 60}s)" if duration else ""
            lines.append(f"- **{title}**{duration_str} - {skills_count} skills extracted")
            if v.get('sad_path'):
                lines.append(f"  - SAD: `{v['sad_path']}`")
            if v.get('pine_path'):
                lines.append(f"  - Pine: `{v['pine_path']}`")
    else:
        lines.append("*No videos found*\n")

    # Summary stats
    lines.append("\n---")
    lines.append(f"**Total:** {len(context['skills'])} skills, {len(context['architectures'])} docs, {len(context['videos'])} videos")

    return "\n".join(lines)


def format_json(context: dict) -> str:
    """Format context as JSON."""
    # Convert to serializable format
    output = {
        "strategy": context["strategy"],
        "skills": context["skills"],
        "architectures": [
            {"path": d["path"], "name": d["name"]}
            for d in context["architectures"]
        ],
        "videos": context["videos"],
        "stats": {
            "skill_count": len(context["skills"]),
            "architecture_count": len(context["architectures"]),
            "video_count": len(context["videos"])
        }
    }
    return json.dumps(output, indent=2, default=str)


def load_context(pattern: str) -> dict:
    """Load all context for a strategy pattern."""
    return {
        "strategy": pattern,
        "skills": load_skills_by_pattern(pattern),
        "architectures": load_architecture_docs(pattern),
        "videos": load_video_metadata(pattern)
    }


def main():
    parser = argparse.ArgumentParser(
        description="Load strategy context from database and files",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python scripts/load_context.py -s tcm           # Load TCM context
  python scripts/load_context.py -s ttrades -f json  # TTrades as JSON
  python scripts/load_context.py -s lumi --full   # Full Lumi context
        """
    )
    parser.add_argument(
        "--strategy", "-s",
        required=True,
        help="Strategy pattern to search (tcm, ttrades, lumi, etc.)"
    )
    parser.add_argument(
        "--format", "-f",
        choices=["json", "markdown"],
        default="markdown",
        help="Output format (default: markdown)"
    )
    parser.add_argument(
        "--full",
        action="store_true",
        help="Include full descriptions and code snippets"
    )
    args = parser.parse_args()

    context = load_context(args.strategy)

    if args.format == "json":
        print(format_json(context))
    else:
        print(format_markdown(context, full=args.full))


if __name__ == "__main__":
    main()
