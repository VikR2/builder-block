#!/usr/bin/env python3
"""
Backfill indicators for existing skills.

USAGE:
    uv run python scripts/backfill_indicators.py [--dry-run]

This script:
1. Finds all skills with needs_indicator=1 that don't have indicator_path
2. Generates indicators for each
3. Updates the database with indicator paths
"""

import argparse
import json
import sqlite3
from pathlib import Path
from datetime import datetime

# Import from generate_from_youtube
import sys
sys.path.insert(0, str(Path(__file__).parent))
from generate_from_youtube import (
    generate_indicator_code,
    sanitize_name,
    VISUAL_CATEGORIES,
)


def get_skills_needing_indicators(db_path: Path) -> list:
    """Get all skills that need indicators but don't have them."""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    cursor.execute("""
        SELECT * FROM skills 
        WHERE needs_indicator = 1 
        AND (indicator_path IS NULL OR indicator_path = '')
        ORDER BY category, name
    """)
    
    skills = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return skills


def generate_indicator_for_skill(skill: dict, output_dir: Path) -> str | None:
    """Generate indicator for a skill."""
    # Parse keywords
    nlp_keywords = skill.get("nlp_keywords", "[]")
    if isinstance(nlp_keywords, str):
        try:
            keywords = json.loads(nlp_keywords)
        except json.JSONDecodeError:
            keywords = []
    else:
        keywords = nlp_keywords or []

    # Build concepts dict
    concepts = {"keywords": keywords}

    # Generate code
    code = generate_indicator_code(
        name=skill.get("name", "Unknown"),
        description=skill.get("description", "Generated from skill library"),
        concepts=concepts,
        skills=[skill],
        url="",
    )

    # Generate filename
    safe_name = sanitize_name(skill.get("name", "Unknown"))
    filename = f"{safe_name}Indicator.cs"

    # Save to Indicators directory
    indicators_dir = output_dir / "Indicators"
    indicators_dir.mkdir(parents=True, exist_ok=True)

    file_path = indicators_dir / filename

    if file_path.exists():
        print(f"  [EXISTS] {filename}")
        return str(file_path)

    file_path.write_text(code, encoding="utf-8")
    print(f"  [CREATED] {filename}")
    return str(file_path)


def update_skill_indicator_path(db_path: Path, skill_id: int, indicator_path: str):
    """Update indicator_path in database."""
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE skills SET indicator_path = ? WHERE id = ?",
        (indicator_path, skill_id)
    )
    conn.commit()
    conn.close()


def main():
    parser = argparse.ArgumentParser(description="Backfill indicators for existing skills")
    parser.add_argument("--dry-run", action="store_true", help="Don't actually create files or update DB")
    args = parser.parse_args()

    # Paths
    base_dir = Path(__file__).parent.parent
    db_path = base_dir / "data" / "builder.db"
    output_dir = base_dir / "scripts-output"

    print("=" * 60)
    print("  Backfill Indicators for Skills")
    print("=" * 60)
    print()

    if args.dry_run:
        print("[DRY RUN MODE - No changes will be made]")
        print()

    # Get skills needing indicators
    skills = get_skills_needing_indicators(db_path)
    print(f"Found {len(skills)} skills needing indicators:")
    print()

    # Group by category
    by_category = {}
    for skill in skills:
        cat = skill.get("category", "Unknown")
        if cat not in by_category:
            by_category[cat] = []
        by_category[cat].append(skill)

    for category, cat_skills in sorted(by_category.items()):
        print(f"[{category}] ({len(cat_skills)} skills)")
        for skill in cat_skills:
            if args.dry_run:
                safe_name = sanitize_name(skill.get("name", "Unknown"))
                print(f"  [WOULD CREATE] {safe_name}Indicator.cs")
            else:
                indicator_path = generate_indicator_for_skill(skill, output_dir)
                if indicator_path:
                    update_skill_indicator_path(db_path, skill["id"], indicator_path)
        print()

    # Summary
    print("=" * 60)
    if args.dry_run:
        print(f"  Would generate {len(skills)} indicators")
    else:
        print(f"  Generated {len(skills)} indicators")
    print("=" * 60)


if __name__ == "__main__":
    main()
