#!/usr/bin/env python3
"""
SessionStart hook for Skills Library continuity.
Loads library stats and semantically relevant skills on session start/resume.

Uses sqlite-vec for vector similarity search when conversation context is available.
Caches results for instant resume (<5ms vs ~150ms).
"""

import json
import sqlite3
import struct
import sys
from datetime import datetime
from pathlib import Path

# Paths
PROJECT_ROOT = Path(__file__).parent.parent.parent
DB_PATH = PROJECT_ROOT / "data" / "builder.db"
LEDGER_PATH = PROJECT_ROOT / "thoughts" / "ledgers" / "CONTINUITY_CLAUDE-skills-library.md"
CACHE_PATH = PROJECT_ROOT / ".claude" / "cache" / "relevant_skills_cache.json"

# Vector search config
EMBEDDING_DIM = 768
OLLAMA_MODEL = "nomic-embed-text"

# Cache config
CACHE_TTL_SECONDS = 3600  # 1 hour


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


def get_skill_index() -> str | None:
    """Generate lightweight skill index for context injection."""
    if not DB_PATH.exists():
        return None

    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()

        # Get skills grouped by category
        cursor.execute("""
            SELECT category, GROUP_CONCAT(name, ', ') as skills, COUNT(*) as count
            FROM skills GROUP BY category ORDER BY count DESC
        """)
        categories = cursor.fetchall()

        if not categories:
            conn.close()
            return None

        # Get all unique keywords
        cursor.execute("SELECT nlp_keywords FROM skills WHERE nlp_keywords IS NOT NULL")
        all_keywords = set()
        for row in cursor.fetchall():
            try:
                keywords = json.loads(row[0] or "[]")
                all_keywords.update(k.lower() for k in keywords if k)
            except:
                pass

        conn.close()

        # Format output
        total = sum(c[2] for c in categories)
        lines = [f"**NinjaTrader Skills Library ({total} skills)**", "", "CATEGORIES:"]

        for cat, skills, count in categories:
            # Truncate to first 5 skills
            skill_list = [s.strip() for s in skills.split(',')][:5]
            suffix = f"... (+{len(skills.split(',')) - 5} more)" if len(skills.split(',')) > 5 else ""
            lines.append(f"- {cat} ({count}): {', '.join(skill_list)}{suffix}")

        # Add top keywords
        if all_keywords:
            sorted_keywords = sorted(list(all_keywords))[:20]
            lines.append("")
            lines.append(f"KEYWORDS: {', '.join(sorted_keywords)}")

        lines.append("")
        lines.append("Use MCP `get_relevant_skills` for full code snippets.")

        return "\n".join(lines)

    except Exception:
        return None


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


def get_embedding_via_ollama(text: str) -> list[float] | None:
    """Generate embedding using Ollama nomic-embed-text model via API."""
    import urllib.request
    import urllib.error

    try:
        # Prefix for search queries (Nomic model convention)
        prefixed_text = f"search_query: {text}"

        # Call Ollama API
        data = json.dumps({"model": OLLAMA_MODEL, "prompt": prefixed_text}).encode("utf-8")
        req = urllib.request.Request(
            "http://localhost:11434/api/embeddings",
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        with urllib.request.urlopen(req, timeout=30) as response:
            result = json.loads(response.read().decode("utf-8"))
            embedding = result.get("embedding", [])

            if len(embedding) == EMBEDDING_DIM:
                return embedding
    except Exception:
        pass

    return None


def vector_to_blob(embedding: list[float]) -> bytes:
    """Convert embedding list to sqlite-vec compatible blob."""
    return struct.pack(f'{len(embedding)}f', *embedding)


def cosine_similarity(a: list[float], b: list[float]) -> float:
    """Compute cosine similarity between two vectors."""
    import math
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(x * x for x in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


def blob_to_vector(blob: bytes) -> list[float]:
    """Convert blob back to vector."""
    return list(struct.unpack(f'{len(blob) // 4}f', blob))


def get_semantically_relevant_skills(context: str, limit: int = 5) -> list[dict] | None:
    """Find semantically similar skills using in-memory cosine similarity.

    Note: Uses in-memory search since Python's sqlite3 doesn't load sqlite-vec.
    This is fast enough for ~100 skills.
    """
    if not DB_PATH.exists() or not context or len(context) < 20:
        return None

    # Generate embedding for the context
    query_embedding = get_embedding_via_ollama(context)
    if not query_embedding:
        return None

    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()

        # Get all skills with embeddings
        cursor.execute("""
            SELECT id, name, category, description, embedding
            FROM skills
            WHERE embedding IS NOT NULL
        """)

        # Compute similarity for each skill
        scored_skills = []
        for row in cursor.fetchall():
            skill_embedding = blob_to_vector(row[4])
            similarity = cosine_similarity(query_embedding, skill_embedding)
            scored_skills.append({
                "id": row[0],
                "name": row[1],
                "category": row[2],
                "description": row[3][:100] + "..." if len(row[3]) > 100 else row[3],
                "similarity": round(similarity, 3)
            })

        conn.close()

        # Sort by similarity (descending) and take top N
        scored_skills.sort(key=lambda x: x["similarity"], reverse=True)
        return scored_skills[:limit] if scored_skills else None

    except Exception:
        return None


def extract_conversation_context(input_data: dict) -> str | None:
    """Extract relevant context from SessionStart event data."""
    context_parts = []

    # Try to get recent messages (available on compact events)
    messages = input_data.get("recent_messages", [])
    if messages:
        # Take last 3 user/assistant messages
        for msg in messages[-3:]:
            if isinstance(msg, dict):
                content = msg.get("content", "")
            else:
                content = str(msg)
            if content:
                context_parts.append(content[:500])

    # Try to get summary (available on compact events)
    summary = input_data.get("summary", "")
    if summary:
        context_parts.append(summary[:500])

    # Try to get session context
    session_context = input_data.get("context", "")
    if session_context:
        context_parts.append(session_context[:500])

    if not context_parts:
        return None

    return " ".join(context_parts)


def load_cached_skills() -> list[dict] | None:
    """Load cached skills if cache is fresh (< TTL)."""
    if not CACHE_PATH.exists():
        return None

    try:
        cache = json.loads(CACHE_PATH.read_text())
        cached_time = datetime.fromisoformat(cache["timestamp"])
        age_seconds = (datetime.now() - cached_time).total_seconds()

        if age_seconds < CACHE_TTL_SECONDS:
            return cache.get("skills")
    except Exception:
        pass

    return None


def save_skills_to_cache(skills: list[dict]) -> None:
    """Save skills to cache file for instant resume."""
    try:
        CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
        cache = {
            "timestamp": datetime.now().isoformat(),
            "skills": skills
        }
        CACHE_PATH.write_text(json.dumps(cache, indent=2))
    except Exception:
        pass  # Cache write failure is non-fatal


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

    # Get library stats and skill index
    stats = get_library_stats()
    skill_index = get_skill_index()
    ledger_state = get_ledger_state()

    # Try cache first for instant resume
    relevant_skills = load_cached_skills()
    cache_hit = relevant_skills is not None

    # If no cache, compute semantically relevant skills and cache them
    if not cache_hit:
        conversation_context = extract_conversation_context(input_data)
        if conversation_context:
            relevant_skills = get_semantically_relevant_skills(conversation_context, limit=5)
            if relevant_skills:
                save_skills_to_cache(relevant_skills)

    # Build context message
    lines = []

    # Add semantically relevant skills first (most valuable for context awareness)
    if relevant_skills:
        cache_indicator = " [cached]" if cache_hit else ""
        lines.append(f"**Semantically Relevant Skills**{cache_indicator}:")
        for skill in relevant_skills:
            lines.append(f"- **{skill['name']}** ({skill['category']})")
            lines.append(f"  {skill['description']}")
        lines.append("")
        lines.append("Use `get_relevant_skills` for full code snippets.")
        lines.append("")
        lines.append("---")
        lines.append("")

    # Add skill index (lightweight category overview)
    if skill_index:
        lines.append(skill_index)
        lines.append("")
        lines.append("---")
        lines.append("")

    # Add basic stats
    lines.append("**Session Context:**")
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
