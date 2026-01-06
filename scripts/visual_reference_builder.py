#!/usr/bin/env python3
"""
Visual Reference Builder - Build Categorized Visual Reference Library

Categorizes video frames into reference types for quick lookup:
1. Entry examples (valid and invalid)
2. Stop placement examples
3. Pattern examples (FVG, OB, CISD, etc.)
4. Skip conditions (what NOT to trade)

This library can be queried to:
- Find examples of specific patterns
- Compare current setups to historical examples
- Build training data for pattern recognition

USAGE:
    python scripts/visual_reference_builder.py --video-id 9AL41xON3hA --build
    python scripts/visual_reference_builder.py --query "FVG entry" --model-id 5
    python scripts/visual_reference_builder.py --list-categories

DEPENDENCIES:
    - visual_trade_analyzer.py (frame classification)
"""

import argparse
import json
import sqlite3
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Optional
from datetime import datetime


# =============================================================================
# Data Structures
# =============================================================================

@dataclass
class VisualReference:
    """A categorized visual reference frame."""
    id: int
    video_id: str
    model_id: Optional[int]
    frame_path: str
    timestamp_seconds: Optional[float]

    # Category information
    category: str  # "entry", "stop", "pattern", "skip", "explanation"
    subcategory: str  # "fvg_entry", "cisd_pattern", "range_skip", etc.
    validity: str  # "valid", "invalid", "neutral"

    # Description
    description: str
    concepts_shown: list[str]

    # Usage tracking
    linked_rule_id: Optional[int]  # Link to model rule this evidences
    reference_count: int  # How many times this was referenced


@dataclass
class ReferenceCategory:
    """A category in the visual reference library."""
    category: str
    subcategory: str
    description: str
    example_count: int
    valid_count: int
    invalid_count: int


# =============================================================================
# Visual Reference Builder
# =============================================================================

class VisualReferenceBuilder:
    """Builds and queries a categorized visual reference library."""

    def __init__(self, db_path: Optional[Path] = None):
        self.db_path = db_path or Path("data/builder.db")
        self._ensure_table()

    def _ensure_table(self):
        """Create visual_references table if it doesn't exist."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS visual_references (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                video_id TEXT NOT NULL,
                model_id INTEGER,
                frame_path TEXT NOT NULL,
                timestamp_seconds REAL,

                category TEXT NOT NULL,
                subcategory TEXT NOT NULL,
                validity TEXT DEFAULT 'neutral',

                description TEXT,
                concepts_shown TEXT,  -- JSON array

                linked_rule_id INTEGER,
                reference_count INTEGER DEFAULT 0,

                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                FOREIGN KEY (model_id) REFERENCES skill_combinations(id) ON DELETE SET NULL
            )
        """)

        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_visual_references_video
            ON visual_references(video_id)
        """)
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_visual_references_category
            ON visual_references(category, subcategory)
        """)
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_visual_references_validity
            ON visual_references(validity)
        """)

        conn.commit()
        conn.close()

    def build_from_video(
        self,
        video_id: str,
        model_id: Optional[int] = None,
        use_analyzer: bool = True
    ) -> list[VisualReference]:
        """Build visual references from video frames."""
        video_dir = Path(f"data/video-frames/{video_id}")
        if not video_dir.exists():
            raise ValueError(f"Video directory not found: {video_dir}")

        frames = sorted(video_dir.glob("frame_*.jpg"))
        references = []

        if use_analyzer:
            try:
                from visual_trade_analyzer import VisualTradeAnalyzer
                analyzer = VisualTradeAnalyzer()
            except ImportError:
                print("Warning: VisualTradeAnalyzer not available, using basic classification")
                use_analyzer = False

        for frame_path in frames:
            ref = self._classify_frame(frame_path, video_id, model_id, use_analyzer)
            if ref:
                references.append(ref)

        return references

    def _classify_frame(
        self,
        frame_path: Path,
        video_id: str,
        model_id: Optional[int],
        use_analyzer: bool
    ) -> Optional[VisualReference]:
        """Classify a single frame and create a reference."""

        if use_analyzer:
            try:
                from visual_trade_analyzer import VisualTradeAnalyzer
                analyzer = VisualTradeAnalyzer()
                classification = analyzer.classify_frame(frame_path)

                frame_type = classification.get("frame_type", "skip")
                concepts = classification.get("concepts_shown", [])
                has_trade = classification.get("has_trade_levels", False)

                # Map to categories
                if frame_type == "trade_entry":
                    category = "entry"
                    subcategory = self._infer_entry_subcategory(concepts)
                    validity = "valid"
                elif frame_type == "trade_exit":
                    category = "exit"
                    subcategory = "trade_result"
                    validity = "neutral"
                elif frame_type == "pattern":
                    category = "pattern"
                    subcategory = concepts[0] if concepts else "unknown"
                    validity = "neutral"
                elif frame_type == "explanation":
                    category = "explanation"
                    subcategory = "concept"
                    validity = "neutral"
                else:
                    return None  # Skip frames

                description = classification.get("notes", "")

            except Exception as e:
                print(f"  Error classifying {frame_path.name}: {e}")
                return None
        else:
            # Basic classification without analyzer
            category = "pattern"
            subcategory = "unknown"
            validity = "neutral"
            concepts = []
            description = ""

        return VisualReference(
            id=0,  # Will be set on save
            video_id=video_id,
            model_id=model_id,
            frame_path=str(frame_path),
            timestamp_seconds=self._extract_timestamp(frame_path),
            category=category,
            subcategory=subcategory,
            validity=validity,
            description=description,
            concepts_shown=concepts,
            linked_rule_id=None,
            reference_count=0
        )

    def _infer_entry_subcategory(self, concepts: list[str]) -> str:
        """Infer entry subcategory from concepts shown."""
        concepts_lower = [c.lower() for c in concepts]

        if "fvg" in concepts_lower or "fair_value_gap" in concepts_lower:
            return "fvg_entry"
        elif "cisd" in concepts_lower or "change_in_state" in concepts_lower:
            return "cisd_entry"
        elif "order_block" in concepts_lower or "ob" in concepts_lower:
            return "ob_entry"
        elif "sweep" in concepts_lower or "liquidity" in concepts_lower:
            return "sweep_entry"
        else:
            return "standard_entry"

    def _extract_timestamp(self, frame_path: Path) -> Optional[float]:
        """Extract timestamp from frame filename or manifest."""
        # Try to extract from filename (e.g., frame_008.jpg)
        import re
        match = re.search(r'frame_(\d+)', frame_path.name)
        if match:
            frame_num = int(match.group(1))
            # Assume 45 second intervals
            return (frame_num - 1) * 45

        return None

    def save_references(self, references: list[VisualReference]) -> list[int]:
        """Save references to database."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        saved_ids = []
        for ref in references:
            cursor.execute("""
                INSERT INTO visual_references (
                    video_id, model_id, frame_path, timestamp_seconds,
                    category, subcategory, validity,
                    description, concepts_shown, linked_rule_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                ref.video_id,
                ref.model_id,
                ref.frame_path,
                ref.timestamp_seconds,
                ref.category,
                ref.subcategory,
                ref.validity,
                ref.description,
                json.dumps(ref.concepts_shown),
                ref.linked_rule_id
            ))
            saved_ids.append(cursor.lastrowid)

        conn.commit()
        conn.close()

        return saved_ids

    def query(
        self,
        category: Optional[str] = None,
        subcategory: Optional[str] = None,
        validity: Optional[str] = None,
        model_id: Optional[int] = None,
        video_id: Optional[str] = None,
        concept: Optional[str] = None,
        limit: int = 20
    ) -> list[VisualReference]:
        """Query visual references."""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        query = "SELECT * FROM visual_references WHERE 1=1"
        params = []

        if category:
            query += " AND category = ?"
            params.append(category)
        if subcategory:
            query += " AND subcategory = ?"
            params.append(subcategory)
        if validity:
            query += " AND validity = ?"
            params.append(validity)
        if model_id:
            query += " AND model_id = ?"
            params.append(model_id)
        if video_id:
            query += " AND video_id = ?"
            params.append(video_id)
        if concept:
            query += " AND concepts_shown LIKE ?"
            params.append(f'%{concept}%')

        query += f" ORDER BY reference_count DESC, created_at DESC LIMIT ?"
        params.append(limit)

        cursor.execute(query, params)
        rows = cursor.fetchall()
        conn.close()

        return [self._row_to_reference(row) for row in rows]

    def _row_to_reference(self, row) -> VisualReference:
        """Convert database row to VisualReference."""
        return VisualReference(
            id=row["id"],
            video_id=row["video_id"],
            model_id=row["model_id"],
            frame_path=row["frame_path"],
            timestamp_seconds=row["timestamp_seconds"],
            category=row["category"],
            subcategory=row["subcategory"],
            validity=row["validity"],
            description=row["description"] or "",
            concepts_shown=json.loads(row["concepts_shown"]) if row["concepts_shown"] else [],
            linked_rule_id=row["linked_rule_id"],
            reference_count=row["reference_count"]
        )

    def get_categories(self) -> list[ReferenceCategory]:
        """Get all reference categories with counts."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute("""
            SELECT
                category,
                subcategory,
                COUNT(*) as total,
                SUM(CASE WHEN validity = 'valid' THEN 1 ELSE 0 END) as valid_count,
                SUM(CASE WHEN validity = 'invalid' THEN 1 ELSE 0 END) as invalid_count
            FROM visual_references
            GROUP BY category, subcategory
            ORDER BY category, subcategory
        """)

        rows = cursor.fetchall()
        conn.close()

        categories = []
        for row in rows:
            categories.append(ReferenceCategory(
                category=row[0],
                subcategory=row[1],
                description=f"{row[0]}/{row[1]}",
                example_count=row[2],
                valid_count=row[3],
                invalid_count=row[4]
            ))

        return categories

    def link_to_rule(self, reference_id: int, rule_id: int):
        """Link a visual reference to a model rule."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute("""
            UPDATE visual_references
            SET linked_rule_id = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        """, (rule_id, reference_id))

        conn.commit()
        conn.close()

    def increment_reference(self, reference_id: int):
        """Increment the reference count for a visual reference."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute("""
            UPDATE visual_references
            SET reference_count = reference_count + 1, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        """, (reference_id,))

        conn.commit()
        conn.close()


# =============================================================================
# CLI Entry Point
# =============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="Build and query visual reference library"
    )
    parser.add_argument(
        "--build",
        action="store_true",
        help="Build references from video frames"
    )
    parser.add_argument(
        "--video-id",
        type=str,
        help="Video ID to build from or query"
    )
    parser.add_argument(
        "--model-id",
        type=int,
        help="Model ID to associate references with"
    )
    parser.add_argument(
        "--query",
        type=str,
        help="Query string (searches concepts)"
    )
    parser.add_argument(
        "--category",
        type=str,
        choices=["entry", "stop", "pattern", "skip", "explanation", "exit"],
        help="Filter by category"
    )
    parser.add_argument(
        "--validity",
        type=str,
        choices=["valid", "invalid", "neutral"],
        help="Filter by validity"
    )
    parser.add_argument(
        "--list-categories",
        action="store_true",
        help="List all categories with counts"
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=20,
        help="Maximum results to return"
    )
    parser.add_argument(
        "--output",
        type=Path,
        help="Output JSON file"
    )

    args = parser.parse_args()

    builder = VisualReferenceBuilder()

    if args.build:
        if not args.video_id:
            print("Error: --video-id required for building")
            return 1

        print(f"\nBuilding visual references from {args.video_id}...")
        references = builder.build_from_video(args.video_id, args.model_id)

        if references:
            saved_ids = builder.save_references(references)
            print(f"\nSaved {len(saved_ids)} visual references")

            # Show summary by category
            categories = {}
            for ref in references:
                key = f"{ref.category}/{ref.subcategory}"
                categories[key] = categories.get(key, 0) + 1

            print("\nCategories:")
            for cat, count in sorted(categories.items()):
                print(f"  {cat}: {count}")
        else:
            print("No references created")

    elif args.list_categories:
        categories = builder.get_categories()

        print("\n" + "=" * 60)
        print("VISUAL REFERENCE LIBRARY CATEGORIES")
        print("=" * 60)

        for cat in categories:
            print(f"\n{cat.category}/{cat.subcategory}")
            print(f"  Total: {cat.example_count}")
            print(f"  Valid: {cat.valid_count}, Invalid: {cat.invalid_count}")

    elif args.query or args.category or args.validity:
        results = builder.query(
            category=args.category,
            validity=args.validity,
            model_id=args.model_id,
            video_id=args.video_id,
            concept=args.query,
            limit=args.limit
        )

        print(f"\nFound {len(results)} references:")
        for ref in results:
            print(f"\n  [{ref.category}/{ref.subcategory}] {Path(ref.frame_path).name}")
            print(f"    Validity: {ref.validity}")
            print(f"    Concepts: {ref.concepts_shown}")
            if ref.description:
                print(f"    Description: {ref.description}")

        if args.output:
            output = [asdict(r) for r in results]
            with open(args.output, "w") as f:
                json.dump(output, f, indent=2)
            print(f"\nSaved to {args.output}")

    else:
        parser.print_help()


if __name__ == "__main__":
    main()
