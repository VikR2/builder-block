#!/usr/bin/env python3
"""
Tests for TCM embedding metadata normalization and corpus validation.

These tests protect the migration from legacy MiniLM indexes to the Google
Gemini embedding stack by ensuring the searcher can:
1. Infer legacy metadata for old indexes
2. Reject mixed embedding corpora at load time
"""

from __future__ import annotations

import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import faiss
import numpy as np


SCRIPT_DIR = Path(__file__).parent
sys.path.insert(0, str(SCRIPT_DIR / "lib"))


def _write_index(
    video_dir: Path,
    metadata: dict,
    *,
    dimension: int = 4,
    index_filename: str = "embeddings.faiss",
    metadata_filename: str = "segments.json",
) -> None:
    """Create a tiny FAISS index and matching metadata for a test video."""
    video_dir.mkdir(parents=True, exist_ok=True)

    vectors = np.array(
        [
            [1.0] + [0.0] * (dimension - 1),
            [0.8, 0.2] + [0.0] * max(dimension - 2, 0),
        ],
        dtype="float32",
    )
    faiss.normalize_L2(vectors)

    index = faiss.IndexFlatIP(dimension)
    index.add(vectors)
    faiss.write_index(index, str(video_dir / index_filename))

    with open(video_dir / metadata_filename, "w", encoding="utf-8") as handle:
        json.dump(metadata, handle, indent=2)


class TestEmbeddingMetadataNormalization(unittest.TestCase):
    def test_normalize_legacy_metadata_infers_provider_and_index_version(self):
        from tcm_embeddings import normalize_embedding_metadata

        metadata = normalize_embedding_metadata({
            "video_id": "legacy-video",
            "model": "all-MiniLM-L6-v2",
            "dimension": 384,
            "segments": [{"text": "legacy clip", "start": 0.0, "end": 10.0}],
        })

        self.assertEqual(metadata.provider, "legacy-minilm")
        self.assertEqual(metadata.model, "all-MiniLM-L6-v2")
        self.assertEqual(metadata.modality, "text")
        self.assertEqual(metadata.index_version, "legacy-minilm-v1")

    def test_normalize_google_profile_metadata_preserves_profile(self):
        from tcm_embeddings import normalize_embedding_metadata

        metadata = normalize_embedding_metadata({
            "video_id": "google-video",
            "provider": "google-gemini-api",
            "model": "gemini-embedding-2-preview",
            "modality": "text",
            "index_version": "tcm-gemini-v3",
            "profile": "fine",
            "dimension": 3072,
            "segments": [{"text": "google clip", "start": 0.0, "end": 10.0}],
        })

        self.assertEqual(metadata.provider, "google-gemini-api")
        self.assertEqual(metadata.index_version, "tcm-gemini-v3")
        self.assertEqual(metadata.profile, "fine")

    def test_mixed_corpus_configs_raise_clear_error(self):
        from tcm_embeddings import ensure_single_corpus_config, normalize_embedding_metadata

        legacy = normalize_embedding_metadata({
            "video_id": "legacy-video",
            "model": "all-MiniLM-L6-v2",
            "dimension": 384,
            "segments": [{"text": "legacy clip", "start": 0.0, "end": 10.0}],
        })
        google = normalize_embedding_metadata({
            "video_id": "google-video",
            "provider": "google-gemini-api",
            "model": "gemini-embedding-2-preview",
            "modality": "text",
            "index_version": "tcm-gemini-v3",
            "dimension": 3072,
            "segments": [{"text": "google clip", "start": 0.0, "end": 10.0}],
        })

        with self.assertRaises(ValueError):
            ensure_single_corpus_config([legacy, google])

    def test_google_api_key_falls_back_to_local_env_file(self):
        from tcm_embeddings import get_google_api_key

        with tempfile.TemporaryDirectory() as temp_dir:
            env_file = Path(temp_dir) / ".env.local"
            env_file.write_text("GOOGLE_API_KEY=test-local-key\n", encoding="utf-8")

            with patch.dict(os.environ, {"GOOGLE_API_KEY": "", "GEMINI_API_KEY": ""}, clear=False):
                with patch("tcm_embeddings._candidate_env_files", return_value=[env_file]):
                    self.assertEqual(get_google_api_key(), "test-local-key")


class TestVideoSearcherCorpusValidation(unittest.TestCase):
    def test_video_searcher_exposes_normalized_legacy_corpus_metadata(self):
        from faiss_search import VideoSearcher

        with tempfile.TemporaryDirectory() as temp_dir:
            videos_path = Path(temp_dir)
            _write_index(
                videos_path / "legacy-video",
                {
                    "video_id": "legacy-video",
                    "model": "all-MiniLM-L6-v2",
                    "dimension": 4,
                    "segments": [
                        {"text": "legacy clip one", "start": 0.0, "end": 8.0},
                        {"text": "legacy clip two", "start": 8.0, "end": 16.0},
                    ],
                },
            )

            searcher = VideoSearcher(videos_path)

            self.assertEqual(searcher.corpus_metadata.provider, "legacy-minilm")
            self.assertEqual(searcher.corpus_metadata.index_version, "legacy-minilm-v1")
            self.assertEqual(searcher.corpus_metadata.model, "all-MiniLM-L6-v2")
            self.assertEqual(searcher.available_profiles, ["coarse"])

    def test_video_searcher_loads_multi_profile_google_corpus(self):
        from faiss_search import VideoSearcher

        with tempfile.TemporaryDirectory() as temp_dir:
            videos_path = Path(temp_dir)
            video_dir = videos_path / "google-video"
            metadata = {
                "video_id": "google-video",
                "provider": "google-gemini-api",
                "model": "gemini-embedding-2-preview",
                "modality": "text",
                "index_version": "tcm-gemini-v3",
                "dimension": 4,
                "segments": [
                    {"text": "google clip one", "start": 0.0, "end": 8.0, "segment_indices": [0]},
                    {"text": "google clip two", "start": 8.0, "end": 16.0, "segment_indices": [1]},
                ],
            }
            _write_index(video_dir, {**metadata, "profile": "coarse"})
            _write_index(
                video_dir,
                {**metadata, "profile": "fine"},
                index_filename="embeddings.fine.faiss",
                metadata_filename="segments.fine.json",
            )

            searcher = VideoSearcher(videos_path)

            self.assertEqual(searcher.corpus_metadata.provider, "google-gemini-api")
            self.assertEqual(searcher.corpus_metadata.index_version, "tcm-gemini-v3")
            self.assertEqual(searcher.available_profiles, ["coarse", "fine"])
            self.assertEqual(searcher.primary_profile, "coarse")
            self.assertIn("google-video", searcher.profile_indexes["fine"])

    def test_video_searcher_rejects_mixed_embedding_corpus(self):
        from faiss_search import VideoSearcher

        with tempfile.TemporaryDirectory() as temp_dir:
            videos_path = Path(temp_dir)
            _write_index(
                videos_path / "legacy-video",
                {
                    "video_id": "legacy-video",
                    "model": "all-MiniLM-L6-v2",
                    "dimension": 4,
                    "segments": [
                        {"text": "legacy clip one", "start": 0.0, "end": 8.0},
                        {"text": "legacy clip two", "start": 8.0, "end": 16.0},
                    ],
                },
            )
            _write_index(
                videos_path / "google-video",
                {
                    "video_id": "google-video",
                    "provider": "google-gemini-api",
                    "model": "gemini-embedding-2-preview",
                    "modality": "text",
                    "index_version": "tcm-gemini-v3",
                    "dimension": 4,
                    "segments": [
                        {"text": "google clip one", "start": 0.0, "end": 8.0},
                        {"text": "google clip two", "start": 8.0, "end": 16.0},
                    ],
                },
            )

            with self.assertRaises(ValueError):
                VideoSearcher(videos_path)

    def test_search_keeps_coarse_only_videos_when_fine_profile_exists(self):
        from faiss_search import SearchResult, VideoSearcher

        searcher = VideoSearcher.__new__(VideoSearcher)
        searcher.available_profiles = ["coarse", "fine"]
        searcher.primary_profile = "coarse"
        searcher.profile_indexes = {
            "coarse": {"fine-video": object(), "coarse-only-video": object()},
            "fine": {"fine-video": object()},
        }

        coarse_candidates = [
            SearchResult("fine-video", "fine candidate", 0.0, 10.0, 0.7),
            SearchResult("coarse-only-video", "coarse candidate", 20.0, 30.0, 0.69),
        ]

        with (
            patch.object(searcher, "_embed_query", return_value=object()),
            patch.object(
                searcher,
                "_build_candidate_video_ids",
                return_value=(coarse_candidates, [], ["fine-video", "coarse-only-video"]),
            ),
            patch.object(searcher, "_build_video_prior_scores", return_value={}),
            patch.object(
                searcher,
                "_rank_profile_results",
                side_effect=[
                    [SearchResult("fine-video", "fine result", 0.0, 10.0, 0.8)],
                    [SearchResult("coarse-only-video", "coarse-only result", 20.0, 30.0, 0.75)],
                ],
            ) as rank_results,
        ):
            results = searcher.search("psychology fear", top_k=5)

        self.assertEqual(
            [result.video_id for result in results],
            ["fine-video", "coarse-only-video"],
        )
        self.assertEqual(rank_results.call_args_list[1].args[3], ["coarse-only-video"])

    def test_video_searcher_rejects_fine_profile_with_wrong_dimension(self):
        from faiss_search import VideoSearcher

        with tempfile.TemporaryDirectory() as temp_dir:
            videos_path = Path(temp_dir)
            video_dir = videos_path / "google-video"
            coarse_metadata = {
                "video_id": "google-video",
                "provider": "google-gemini-api",
                "model": "gemini-embedding-2-preview",
                "modality": "text",
                "index_version": "tcm-gemini-v3",
                "profile": "coarse",
                "dimension": 4,
                "segments": [
                    {"text": "google clip one", "start": 0.0, "end": 8.0, "segment_indices": [0]},
                ],
            }
            fine_metadata = {
                "video_id": "google-video",
                "provider": "google-gemini-api",
                "model": "gemini-embedding-2-preview",
                "modality": "text",
                "index_version": "tcm-gemini-v3",
                "profile": "fine",
                "dimension": 8,
                "segments": [
                    {"text": "google clip one", "start": 0.0, "end": 8.0, "segment_indices": [0]},
                ],
            }

            _write_index(video_dir, coarse_metadata, dimension=4)
            _write_index(
                video_dir,
                fine_metadata,
                dimension=8,
                index_filename="embeddings.fine.faiss",
                metadata_filename="segments.fine.json",
            )

            with self.assertRaises(ValueError):
                VideoSearcher(videos_path)


if __name__ == "__main__":
    unittest.main(verbosity=2)
