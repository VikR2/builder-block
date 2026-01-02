#!/usr/bin/env python3
"""
Backfill Embeddings Script

Generates embeddings for existing skills that don't have them.
Uses Ollama with nomic-embed-text model for local embedding generation.

Usage:
    python scripts/backfill_embeddings.py [--dry-run] [--limit N]

Options:
    --dry-run    Show what would be done without making changes
    --limit N    Process only N skills (default: all)

Requirements:
    - Ollama running locally with nomic-embed-text model
    - pip install requests
"""

import argparse
import json
import sqlite3
import struct
import sys
import time
import urllib.request
import urllib.error

# Configuration
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "data" / "builder.db"
OLLAMA_URL = "http://localhost:11434/api/embeddings"
MODEL_NAME = "nomic-embed-text"
EMBEDDING_DIM = 768


def embed_text(text: str) -> list:
    """Generate embedding for text using Ollama."""
    data = json.dumps({"model": MODEL_NAME, "prompt": text}).encode("utf-8")
    req = urllib.request.Request(
        OLLAMA_URL,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=60) as response:
            result = json.loads(response.read().decode("utf-8"))
            embedding = result["embedding"]

            if len(embedding) != EMBEDDING_DIM:
                raise ValueError(
                    f"Unexpected embedding dimension: {len(embedding)}, expected {EMBEDDING_DIM}"
                )

            return embedding
    except urllib.error.URLError as e:
        raise RuntimeError(f"Ollama request failed: {e}")


def embedding_to_blob(embedding: list) -> bytes:
    """Convert embedding list to BLOB for SQLite storage."""
    return struct.pack(f"{len(embedding)}f", *embedding)


def create_skill_text(name: str, description: str, nlp_keywords: str) -> str:
    """Create searchable text from skill fields."""
    try:
        keywords = json.loads(nlp_keywords or "[]")
    except json.JSONDecodeError:
        keywords = []

    keyword_str = f"Keywords: {', '.join(keywords)}" if keywords else ""
    return f"{name}: {description}. {keyword_str}".strip()


def main():
    parser = argparse.ArgumentParser(description="Backfill embeddings for skills")
    parser.add_argument(
        "--dry-run", action="store_true", help="Show what would be done"
    )
    parser.add_argument("--limit", type=int, help="Process only N skills")
    args = parser.parse_args()

    print("=" * 60)
    print("Backfill Embeddings Script")
    print("=" * 60)
    print(f"Database: {DB_PATH}")
    print(f"Mode: {'DRY RUN' if args.dry_run else 'LIVE'}")
    if args.limit:
        print(f"Limit: {args.limit}")
    print()

    # Check Ollama is running
    try:
        req = urllib.request.Request(
            "http://localhost:11434/api/tags", method="GET"
        )
        urllib.request.urlopen(req, timeout=5)
    except urllib.error.URLError:
        print("ERROR: Ollama is not running. Start it with: ollama serve")
        print("Then pull the model: ollama pull nomic-embed-text")
        sys.exit(1)

    # Connect to database
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    # Check if embedding column exists
    columns = conn.execute("PRAGMA table_info(skills)").fetchall()
    has_embedding = any(c["name"] == "embedding" for c in columns)
    if not has_embedding:
        print("Adding embedding column to skills table...")
        if not args.dry_run:
            conn.execute("ALTER TABLE skills ADD COLUMN embedding BLOB")
            conn.commit()

    # Find skills without embeddings
    query = """
        SELECT id, name, description, nlp_keywords
        FROM skills
        WHERE embedding IS NULL
        ORDER BY id
    """
    if args.limit:
        query = query.replace("ORDER BY id", f"ORDER BY id LIMIT {args.limit}")

    skills = conn.execute(query).fetchall()
    print(f"\nFound {len(skills)} skills without embeddings\n")

    if not skills:
        print("Nothing to do!")
        conn.close()
        return

    if args.dry_run:
        print("Skills that would be processed:")
        for skill in skills:
            print(f"  - [{skill['id']}] {skill['name']}")
        print("\nRun without --dry-run to process these skills.")
        conn.close()
        return

    # Process skills
    processed = 0
    failed = 0
    start_time = time.time()

    for skill in skills:
        try:
            text = create_skill_text(
                skill["name"], skill["description"], skill["nlp_keywords"]
            )
            embedding = embed_text(text)
            blob = embedding_to_blob(embedding)

            # Update skill
            conn.execute(
                "UPDATE skills SET embedding = ? WHERE id = ?", (blob, skill["id"])
            )
            conn.commit()

            processed += 1
            print(f"\rProcessed: {processed}/{len(skills)}", end="", flush=True)

        except Exception as e:
            failed += 1
            print(f"\nFailed to process skill {skill['id']}: {e}")

    elapsed = time.time() - start_time
    print(f"\n\nCompleted in {elapsed:.1f}s")
    print(f"  Processed: {processed}")
    print(f"  Failed: {failed}")

    # Verify
    with_embeddings = conn.execute(
        "SELECT COUNT(*) FROM skills WHERE embedding IS NOT NULL"
    ).fetchone()[0]

    print(f"\nVerification:")
    print(f"  Skills with embeddings: {with_embeddings}")

    conn.close()
    print("\nDone!")


if __name__ == "__main__":
    main()
