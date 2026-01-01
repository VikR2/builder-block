#!/usr/bin/env python3
"""
Trading Keyword Detection Hook (UserPromptSubmit)

Detects trading terms in user prompts and injects relevant skill summaries
from the NinjaTrader skills database.
"""

import json
import sqlite3
import sys
import re
from pathlib import Path

# Paths
PROJECT_ROOT = Path(__file__).parent.parent.parent
DB_PATH = PROJECT_ROOT / "data" / "builder.db"


def get_trading_keywords() -> dict[str, list[str]]:
    """Build keyword → skill names mapping from database."""
    if not DB_PATH.exists():
        return {}

    # Common non-trading words to filter out (extracted from YouTube transcripts)
    NOISE_WORDS = {
        "hello", "friends", "hi", "hey", "guys", "everyone", "thanks",
        "thank", "please", "today", "video", "youtube", "channel",
        "subscribe", "like", "comment", "share", "follow", "space",
        "crypto", "participating", "welcome", "good", "morning",
        "afternoon", "evening", "night", "great", "awesome"
    }

    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("SELECT name, nlp_keywords FROM skills")

        keyword_map = {}
        for name, keywords_json in cursor.fetchall():
            try:
                keywords = json.loads(keywords_json or "[]")
                for kw in keywords:
                    if kw:
                        kw_lower = kw.lower()
                        # Skip noise words
                        if kw_lower in NOISE_WORDS:
                            continue
                        if kw_lower not in keyword_map:
                            keyword_map[kw_lower] = []
                        if name not in keyword_map[kw_lower]:
                            keyword_map[kw_lower].append(name)
            except:
                pass

        conn.close()
        return keyword_map
    except Exception:
        return {}


def detect_keywords(text: str, keyword_map: dict) -> list[tuple[str, list[str]]]:
    """Find trading keywords in text using word boundary matching.

    Handles plurals by also matching keyword + 's' or keyword + 'es'.
    """
    text_lower = text.lower()
    matches = []

    for keyword, skills in keyword_map.items():
        # Skip very short keywords to avoid false positives
        if len(keyword) < 3:
            continue

        try:
            # Match keyword with optional plural suffix (s, es, ing)
            pattern = rf'\b{re.escape(keyword)}(?:s|es|ing)?\b'
            if re.search(pattern, text_lower):
                matches.append((keyword, skills))
        except:
            pass

    return matches


def get_skill_summaries(skill_names: list[str]) -> list[dict]:
    """Get brief summaries for matched skills."""
    if not skill_names or not DB_PATH.exists():
        return []

    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()

        # Deduplicate and limit
        unique_names = list(set(skill_names))[:5]
        placeholders = ','.join('?' * len(unique_names))

        cursor.execute(f"""
            SELECT name, category, description, complexity
            FROM skills WHERE name IN ({placeholders})
        """, unique_names)

        summaries = []
        for name, category, description, complexity in cursor.fetchall():
            # Truncate description to ~150 chars
            short_desc = description[:150] + "..." if len(description) > 150 else description
            summaries.append({
                "name": name,
                "category": category,
                "description": short_desc,
                "complexity": complexity
            })

        conn.close()
        return summaries
    except Exception:
        return []


def main():
    # Read stdin
    try:
        input_data = json.loads(sys.stdin.read())
    except Exception:
        print(json.dumps({"result": "continue"}))
        return

    # Get user message from prompt submit event
    user_message = input_data.get("user_message", "")
    if not user_message:
        print(json.dumps({"result": "continue"}))
        return

    # Skip if message is too short
    if len(user_message) < 10:
        print(json.dumps({"result": "continue"}))
        return

    # Get keyword mapping from database
    keyword_map = get_trading_keywords()
    if not keyword_map:
        print(json.dumps({"result": "continue"}))
        return

    # Detect trading keywords in user message
    matches = detect_keywords(user_message, keyword_map)
    if not matches:
        print(json.dumps({"result": "continue"}))
        return

    # Collect unique skill names from all matches
    all_skills = set()
    matched_keywords = []
    for keyword, skills in matches:
        matched_keywords.append(keyword)
        all_skills.update(skills)

    # Get summaries for matched skills
    summaries = get_skill_summaries(list(all_skills))
    if not summaries:
        print(json.dumps({"result": "continue"}))
        return

    # Build context message
    lines = [f"**Relevant Skills Detected** (keywords: {', '.join(matched_keywords[:5])}):"]
    for s in summaries:
        lines.append(f"- **{s['name']}** ({s['category']}, {s['complexity']}): {s['description']}")

    lines.append("")
    lines.append("Use MCP `get_relevant_skills` for full code snippets.")

    print(json.dumps({
        "result": "continue",
        "message": "\n".join(lines)
    }))


if __name__ == "__main__":
    main()
