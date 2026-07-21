#!/usr/bin/env python3
"""
Generate FAISS embeddings for video transcripts.

Supports multiple indexing profiles so we can keep a coarse recall corpus and a
fine exact-clip rerank corpus side by side.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from dataclasses import dataclass
from pathlib import Path

try:
    import faiss
    import numpy as np
except ImportError as e:
    print(f"Missing dependency: {e}")
    print("\nInstall required packages:")
    print("  pip install sentence-transformers faiss-cpu numpy")
    sys.exit(1)

SCRIPT_DIR = Path(__file__).parent
sys.path.insert(0, str(SCRIPT_DIR / "lib"))

from tcm_embeddings import build_embedder, resolve_indexing_config

PROJECT_ROOT = SCRIPT_DIR.parent
DEFAULT_VIDEOS_PATH = PROJECT_ROOT / "data" / "local-videos"


@dataclass(frozen=True)
class IndexProfile:
    name: str
    window_size: int
    stride: int
    min_words: int
    title_prefix_mode: str
    index_filename: str
    metadata_filename: str


PROFILE_PRESETS = {
    "coarse": IndexProfile(
        name="coarse",
        window_size=3,
        stride=1,
        min_words=15,
        title_prefix_mode="first_window",
        index_filename="embeddings.faiss",
        metadata_filename="segments.json",
    ),
    "fine": IndexProfile(
        name="fine",
        window_size=1,
        stride=1,
        min_words=8,
        title_prefix_mode="none",
        index_filename="embeddings.fine.faiss",
        metadata_filename="segments.fine.json",
    ),
}


def load_transcript(video_path: Path) -> list[dict]:
    transcript_file = video_path / "transcript_timed.json"
    if not transcript_file.exists():
        return []
    with open(transcript_file, encoding="utf-8") as handle:
        return json.load(handle)


def load_video_title(video_path: Path) -> str | None:
    manifest_file = video_path / "manifest.json"
    if not manifest_file.exists():
        return None
    try:
        with open(manifest_file, encoding="utf-8") as handle:
            manifest = json.load(handle)
            return manifest.get("source_title")
    except Exception:
        return None


def transcript_fingerprint(video_path: Path) -> str:
    transcript_file = video_path / "transcript_timed.json"
    return hashlib.sha256(transcript_file.read_bytes()).hexdigest()


def parse_profiles(raw_profiles: str) -> list[IndexProfile]:
    selected_profiles: list[IndexProfile] = []
    seen_names: set[str] = set()

    for raw_name in raw_profiles.split(","):
        name = raw_name.strip().lower()
        if not name:
            continue
        if name not in PROFILE_PRESETS:
            valid = ", ".join(sorted(PROFILE_PRESETS))
            raise ValueError(f"Unsupported profile '{name}'. Expected one of: {valid}")
        if name in seen_names:
            continue
        selected_profiles.append(PROFILE_PRESETS[name])
        seen_names.add(name)

    if not selected_profiles:
        raise ValueError("At least one embedding profile must be selected")

    return selected_profiles


def create_windows(segments: list[dict], profile: IndexProfile) -> list[dict]:
    windows: list[dict] = []
    if len(segments) < profile.window_size:
        return windows

    for start_index in range(0, len(segments) - profile.window_size + 1, profile.stride):
        window_segments = segments[start_index:start_index + profile.window_size]
        text = " ".join(segment["text"] for segment in window_segments).strip()
        if len(text.split()) < profile.min_words:
            continue

        windows.append({
            "text": text,
            "start": window_segments[0]["start"],
            "end": window_segments[-1]["end"],
            "segment_indices": list(range(start_index, start_index + profile.window_size)),
        })

    return windows


def build_embedding_texts(
    windows: list[dict],
    *,
    video_title: str | None,
    profile: IndexProfile,
) -> list[str]:
    texts: list[str] = []
    for index, window in enumerate(windows):
        if (
            index == 0
            and video_title
            and profile.title_prefix_mode == "first_window"
        ):
            texts.append(f"Video: {video_title}. {window['text']}")
        else:
            texts.append(window["text"])
    return texts


def write_profile_index(
    embedder,
    config,
    video_path: Path,
    *,
    video_id: str,
    video_title: str | None,
    source_fingerprint: str,
    segments: list[dict],
    profile: IndexProfile,
) -> dict | None:
    windows = create_windows(segments, profile)
    if not windows:
        print(f"  [{profile.name}] No valid windows")
        return None

    print(f"  [{profile.name}] {len(segments)} transcript segments -> {len(windows)} windows")

    texts = build_embedding_texts(windows, video_title=video_title, profile=profile)
    embeddings = np.array(embedder.embed_documents(texts), dtype="float32")
    faiss.normalize_L2(embeddings)

    dimension = embeddings.shape[1]
    index = faiss.IndexFlatIP(dimension)
    index.add(embeddings)

    index_path = video_path / profile.index_filename
    metadata_path = video_path / profile.metadata_filename
    temporary_index_path = video_path / f"{profile.index_filename}.tmp"
    temporary_metadata_path = video_path / f"{profile.metadata_filename}.tmp"
    faiss.write_index(index, str(temporary_index_path))

    metadata = {
        "video_id": video_id,
        "video_title": video_title,
        "provider": config.provider,
        "model": config.model,
        "modality": config.modality,
        "index_version": config.index_version,
        "profile": profile.name,
        "window_size": profile.window_size,
        "stride": profile.stride,
        "min_words": profile.min_words,
        "title_prefix_mode": profile.title_prefix_mode,
        "dimension": dimension,
        "num_embeddings": int(embeddings.shape[0]),
        "source_fingerprint": source_fingerprint,
        "segments": windows,
    }
    with open(temporary_metadata_path, "w", encoding="utf-8") as handle:
        json.dump(metadata, handle, indent=2)
    temporary_index_path.replace(index_path)
    temporary_metadata_path.replace(metadata_path)

    print(
        f"  [{profile.name}] Saved {embeddings.shape[0]} embeddings "
        f"({dimension}-dim) -> {profile.index_filename}"
    )
    return {
        "profile": profile.name,
        "indexFile": profile.index_filename,
        "metadataFile": profile.metadata_filename,
        "windows": len(windows),
        "dimension": int(dimension),
    }


def current_profile_result(
    config,
    video_path: Path,
    *,
    source_fingerprint: str,
    profile: IndexProfile,
) -> dict | None:
    index_path = video_path / profile.index_filename
    metadata_path = video_path / profile.metadata_filename
    if not index_path.exists() or not metadata_path.exists():
        return None

    try:
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None

    expected = {
        "provider": config.provider,
        "model": config.model,
        "modality": config.modality,
        "index_version": config.index_version,
        "profile": profile.name,
        "source_fingerprint": source_fingerprint,
    }
    if any(metadata.get(key) != value for key, value in expected.items()):
        return None

    windows = metadata.get("num_embeddings")
    dimension = metadata.get("dimension")
    if not isinstance(windows, int) or windows <= 0 or not isinstance(dimension, int) or dimension <= 0:
        return None

    return {
        "profile": profile.name,
        "indexFile": profile.index_filename,
        "metadataFile": profile.metadata_filename,
        "windows": windows,
        "dimension": dimension,
        "skipped": True,
    }


def embed_video(
    embedder,
    config,
    video_path: Path,
    profiles: list[IndexProfile],
    *,
    skip_valid: bool = False,
) -> list[dict]:
    video_id = video_path.name
    segments = load_transcript(video_path)
    if not segments:
        print(f"  No transcript found for {video_id}")
        return []

    video_title = load_video_title(video_path)
    source_fingerprint = transcript_fingerprint(video_path)
    if video_title:
        print(f"  Title: '{video_title}'")

    generated: list[dict] = []
    for profile in profiles:
        if skip_valid:
            current_result = current_profile_result(
                config,
                video_path,
                source_fingerprint=source_fingerprint,
                profile=profile,
            )
            if current_result is not None:
                print(f"  [{profile.name}] Current index already valid; skipping")
                generated.append(current_result)
                continue

        result = write_profile_index(
            embedder,
            config,
            video_path,
            video_id=video_id,
            video_title=video_title,
            source_fingerprint=source_fingerprint,
            segments=segments,
            profile=profile,
        )
        if result is not None:
            generated.append(result)

    return generated


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate FAISS embeddings for video transcripts")
    parser.add_argument(
        "--video-dir",
        type=Path,
        help="Process a single video directory instead of all local videos",
    )
    parser.add_argument(
        "--videos-path",
        type=Path,
        default=DEFAULT_VIDEOS_PATH,
        help="Path to the corpus of video directories to embed",
    )
    parser.add_argument(
        "--profiles",
        default="coarse,fine",
        help="Comma-separated embedding profiles to build (coarse, fine, or coarse,fine)",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Emit final result as JSON",
    )
    parser.add_argument(
        "--provider",
        help="Embedding provider override (for example: google-gemini-api or legacy-minilm)",
    )
    parser.add_argument(
        "--model",
        help="Embedding model override",
    )
    parser.add_argument(
        "--skip-valid",
        action="store_true",
        help="Skip profile indexes already matching the transcript fingerprint and embedding configuration",
    )
    args = parser.parse_args()

    profiles = parse_profiles(args.profiles)
    config = resolve_indexing_config(
        provider=args.provider,
        model=args.model,
        videos_path=args.videos_path,
    )
    print(f"Loading embedding backend: {config.provider}:{config.model}")
    print(f"Profiles: {', '.join(profile.name for profile in profiles)}")
    embedder = build_embedder(config)

    if args.video_dir:
        video_dirs = [args.video_dir]
        print(f"\nProcessing single video directory: {args.video_dir}")
    else:
        videos_path = args.videos_path
        print(f"\nProcessing videos in {videos_path}")
        if not videos_path.exists():
            print(f"ERROR: Videos path does not exist: {videos_path}")
            sys.exit(1)
        video_dirs = sorted(videos_path.iterdir())

    success = 0
    total = 0
    embedded_dirs: list[dict] = []

    for video_dir in video_dirs:
        if not video_dir.is_dir():
            continue
        if not (video_dir / "transcript_timed.json").exists():
            continue

        total += 1
        print(f"\n{video_dir.name}")
        generated = embed_video(
            embedder,
            config,
            video_dir,
            profiles,
            skip_valid=args.skip_valid,
        )
        if len(generated) == len(profiles):
            success += 1
            embedded_dirs.append({
                "videoId": video_dir.name,
                "profiles": generated,
            })

    print(f"\n{'=' * 50}")
    print(f"Done! Embedded {success}/{total} videos.")

    if embedded_dirs:
        print("\nGenerated files:")
        for item in embedded_dirs:
            for profile in item["profiles"]:
                print(f"  - {item['videoId']}/{profile['indexFile']}")
                print(f"  - {item['videoId']}/{profile['metadataFile']}")

    if args.json:
        print(json.dumps({
            "status": "success" if success == total else "partial",
            "embedded": embedded_dirs,
            "success_count": success,
            "total_count": total,
            "profiles": [profile.name for profile in profiles],
        }))


if __name__ == "__main__":
    main()
