#!/usr/bin/env python3
"""
Generate FAISS embeddings for video transcripts.
Uses sliding window to preserve trading concept context.

Usage:
    python scripts/embed_transcripts.py

Dependencies:
    pip install sentence-transformers faiss-cpu numpy
"""

import json
import sys
from pathlib import Path

# Check dependencies before importing
try:
    import faiss
    import numpy as np
    from sentence_transformers import SentenceTransformer
except ImportError as e:
    print(f"Missing dependency: {e}")
    print("\nInstall required packages:")
    print("  pip install sentence-transformers faiss-cpu numpy")
    sys.exit(1)

# Config
MODEL_NAME = "all-MiniLM-L6-v2"  # 384-dim, fast, good quality
WINDOW_SIZE = 3      # segments per window (~30-45 sec)
STRIDE = 1           # overlap for context continuity
MIN_WORDS = 15       # skip short windows (filler)

# Path to local videos (relative to script location)
SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent
VIDEOS_PATH = PROJECT_ROOT / "data" / "local-videos"


def load_transcript(video_path: Path) -> list[dict]:
    """Load timed transcript segments."""
    transcript_file = video_path / "transcript_timed.json"
    if not transcript_file.exists():
        return []
    with open(transcript_file, encoding='utf-8') as f:
        return json.load(f)


def load_video_title(video_path: Path) -> str | None:
    """Load video title from manifest.json."""
    manifest_file = video_path / "manifest.json"
    if not manifest_file.exists():
        return None
    try:
        with open(manifest_file, encoding='utf-8') as f:
            manifest = json.load(f)
            return manifest.get("source_title")
    except Exception:
        return None


def create_windows(segments: list[dict], window_size: int, stride: int) -> list[dict]:
    """Create sliding windows from segments."""
    windows = []

    for i in range(0, len(segments) - window_size + 1, stride):
        window_segments = segments[i:i + window_size]

        # Combine text
        text = " ".join(seg["text"] for seg in window_segments)

        # Skip short windows (likely filler)
        if len(text.split()) < MIN_WORDS:
            continue

        windows.append({
            "text": text,
            "start": window_segments[0]["start"],
            "end": window_segments[-1]["end"],
            "segment_indices": list(range(i, i + window_size))
        })

    return windows


def embed_video(model: SentenceTransformer, video_path: Path) -> bool:
    """Generate embeddings for a single video."""
    video_id = video_path.name

    # Load transcript
    segments = load_transcript(video_path)
    if not segments:
        print(f"  No transcript found for {video_id}")
        return False

    # Load video title from manifest
    video_title = load_video_title(video_path)
    if video_title:
        print(f"  Title: '{video_title}'")

    # Create windows
    windows = create_windows(segments, WINDOW_SIZE, STRIDE)
    if not windows:
        print(f"  No valid windows for {video_id}")
        return False

    print(f"  {len(segments)} segments -> {len(windows)} windows")

    # Generate embeddings
    # Prepend title to first window for title relevance boost
    texts = []
    for i, w in enumerate(windows):
        if i == 0 and video_title:
            # First window gets title prepended for better title-based search
            texts.append(f"Video: {video_title}. {w['text']}")
        else:
            texts.append(w["text"])
    embeddings = model.encode(texts, show_progress_bar=False)
    embeddings = np.array(embeddings).astype('float32')

    # Normalize for cosine similarity
    faiss.normalize_L2(embeddings)

    # Create FAISS index (Inner Product = cosine similarity after normalization)
    dimension = embeddings.shape[1]
    index = faiss.IndexFlatIP(dimension)
    index.add(embeddings)

    # Save index
    faiss.write_index(index, str(video_path / "embeddings.faiss"))

    # Save segment metadata
    metadata = {
        "video_id": video_id,
        "video_title": video_title,  # Include title for search-time boosting
        "model": MODEL_NAME,
        "window_size": WINDOW_SIZE,
        "stride": STRIDE,
        "dimension": dimension,
        "num_embeddings": int(embeddings.shape[0]),
        "segments": windows
    }
    with open(video_path / "segments.json", "w", encoding='utf-8') as f:
        json.dump(metadata, f, indent=2)

    print(f"  Saved {embeddings.shape[0]} embeddings ({dimension}-dim)")
    return True


def main():
    print("Loading embedding model...")
    model = SentenceTransformer(MODEL_NAME)

    print(f"\nProcessing videos in {VIDEOS_PATH}")

    if not VIDEOS_PATH.exists():
        print(f"ERROR: Videos path does not exist: {VIDEOS_PATH}")
        sys.exit(1)

    success = 0
    total = 0

    for video_dir in sorted(VIDEOS_PATH.iterdir()):
        if not video_dir.is_dir():
            continue

        # Skip directories that don't have transcripts
        if not (video_dir / "transcript_timed.json").exists():
            continue

        total += 1
        print(f"\n{video_dir.name}")

        if embed_video(model, video_dir):
            success += 1

    print(f"\n{'='*50}")
    print(f"Done! Embedded {success}/{total} videos.")

    if success > 0:
        print("\nGenerated files:")
        for video_dir in VIDEOS_PATH.iterdir():
            if (video_dir / "embeddings.faiss").exists():
                print(f"  - {video_dir.name}/embeddings.faiss")
                print(f"  - {video_dir.name}/segments.json")


if __name__ == "__main__":
    main()
