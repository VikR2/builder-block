#!/usr/bin/env python3
"""
SessionStart hook for Skills Library continuity.
Loads library stats and ledger context on session start/resume.
"""

import json
import sqlite3
import sys
from pathlib import Path

# Paths
PROJECT_ROOT = Path(__file__).parent.parent.parent
DB_PATH = PROJECT_ROOT / "data" / "builder.db"
LEDGER_PATH = PROJECT_ROOT / "thoughts" / "ledgers" / "CONTINUITY_CLAUDE-skills-library.md"


def get_library_stats() -> dict:
    """Query database for library stats."""
    stats = {"skills": 0, "videos": 0, "last_skill": "(none)"}

    if not DB_PATH.exists():
        return stats

    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()

        # Skills count
        cursor.execute("SELECT COUNT(*) FROM skills")
        stats["skills"] = cursor.fetchone()[0]

        # Videos count
        cursor.execute("SELECT COUNT(*) FROM processed_videos")
        stats["videos"] = cursor.fetchone()[0]

        # Last skill added
        cursor.execute("SELECT name FROM skills ORDER BY created_at DESC LIMIT 1")
        row = cursor.fetchone()
        if row:
            stats["last_skill"] = row[0]

        conn.close()
    except Exception:
        pass

    return stats


def get_ledger_state() -> str | None:
    """Extract State section from ledger."""
    if not LEDGER_PATH.exists():
        return None

    try:
        content = LEDGER_PATH.read_text()
        # Find State section
        if "## State" in content:
            start = content.index("## State") + len("## State\n")
            # Find next section
            end = len(content)
            for marker in ["\n---", "\n## "]:
                if marker in content[start:]:
                    end = start + content[start:].index(marker)
                    break
            return content[start:end].strip()
    except Exception:
        pass

    return None


def main():
    # Read stdin
    try:
        input_data = json.loads(sys.stdin.read())
    except Exception:
        # Invalid input, continue without message
        print(json.dumps({"result": "continue"}))
        return

    event_type = input_data.get("type", "start")

    # Only inject context on resume or compact
    if event_type == "start":
        print(json.dumps({"result": "continue"}))
        return

    # Get library stats
    stats = get_library_stats()
    ledger_state = get_ledger_state()

    # Build context message
    lines = []
    lines.append("**Skills Library Context (auto-loaded)**")
    lines.append(f"- Skills in library: {stats['skills']}")
    lines.append(f"- Videos processed: {stats['videos']}")
    if stats["last_skill"] != "(none)":
        lines.append(f"- Last skill added: {stats['last_skill']}")

    if ledger_state:
        lines.append("")
        lines.append("**Current State:**")
        lines.append(ledger_state)

    lines.append("")
    lines.append("Ledger: `thoughts/ledgers/CONTINUITY_CLAUDE-skills-library.md`")

    message = "\n".join(lines)

    print(json.dumps({"result": "continue", "message": message}))


if __name__ == "__main__":
    main()
