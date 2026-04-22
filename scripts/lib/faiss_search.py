"""
FAISS search utilities for video transcript embeddings.

This module provides semantic search across video transcripts using FAISS
vector similarity. It supports a dual-index setup where the coarse profile is
used for recall/boundary expansion and the fine profile is used for exact clip
reranking when available.
"""

from __future__ import annotations

import json
import math
import re
import sys
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from tcm_embeddings import (
    EmbeddingConfig,
    EmbeddingMetadata,
    build_embedder,
    ensure_single_corpus_config,
    normalize_embedding_metadata,
)


PRIMARY_PROFILE = "coarse"
PROFILE_ASSETS = {
    "coarse": ("embeddings.faiss", "segments.json"),
    "fine": ("embeddings.fine.faiss", "segments.fine.json"),
}


@dataclass
class VideoScore:
    """Aggregated score for a video across multiple matching segments."""

    video_id: str
    max_score: float
    avg_score: float
    match_count: int
    combined_score: float
    best_segment: dict


@dataclass
class SearchResult:
    """A single search result from FAISS similarity search."""

    video_id: str
    text: str
    start: float
    end: float
    score: float


TOKEN_PATTERN = re.compile(r"[a-z0-9]+")
QUERY_STOPWORDS = {
    "a", "an", "all", "and", "are", "at", "be", "been", "being", "by", "can",
    "clip", "does", "exact", "explain", "explains", "for", "from", "had", "has",
    "have", "he", "her", "here", "him", "how", "i", "if", "in", "into", "is",
    "it", "its", "just", "me", "of", "on", "or", "out", "say", "says", "she",
    "show", "that", "the", "then", "there", "this", "to", "until", "up", "was",
    "we", "were", "what", "when", "where", "why", "with", "you", "your",
}


class VideoSearcher:
    """Search video transcripts using FAISS embeddings."""

    def __init__(self, videos_path: Path, model_name: Optional[str] = None):
        self.videos_path = videos_path
        self.model_name = model_name
        self.embedder = None
        self.corpus_metadata: Optional[EmbeddingMetadata] = None
        self.primary_profile = PRIMARY_PROFILE
        self.available_profiles: list[str] = []
        self.profile_indexes: dict[str, dict[str, tuple]] = {
            profile: {} for profile in PROFILE_ASSETS
        }
        self.profile_index_metadata: dict[str, dict[str, EmbeddingMetadata]] = {
            profile: {} for profile in PROFILE_ASSETS
        }
        self.profile_segment_token_cache: dict[str, dict[tuple[str, int], set[str]]] = {
            profile: {} for profile in PROFILE_ASSETS
        }
        self.profile_title_token_cache: dict[str, dict[str, set[str]]] = {
            profile: {} for profile in PROFILE_ASSETS
        }
        self.profile_token_document_frequency: dict[str, Counter[str]] = {
            profile: Counter() for profile in PROFILE_ASSETS
        }
        self.profile_total_segment_documents: dict[str, int] = {
            profile: 0 for profile in PROFILE_ASSETS
        }
        self.video_titles: dict[str, str] = {}
        self.indexes: dict[str, tuple] = {}
        self.index_metadata: dict[str, EmbeddingMetadata] = {}
        self._load_indexes()

    def _load_indexes(self) -> None:
        try:
            import faiss
        except ImportError:
            print("ERROR: faiss-cpu not installed", file=sys.stderr)
            return

        if not self.videos_path.exists():
            print(f"ERROR: Videos path does not exist: {self.videos_path}", file=sys.stderr)
            return

        loaded_metadata: list[EmbeddingMetadata] = []

        for video_dir in sorted(self.videos_path.iterdir()):
            if not video_dir.is_dir():
                continue

            manifest_file = video_dir / "manifest.json"
            if manifest_file.exists():
                try:
                    with open(manifest_file, encoding="utf-8") as handle:
                        manifest = json.load(handle)
                    self.video_titles[video_dir.name] = manifest.get("source_title", video_dir.name)
                except Exception:
                    self.video_titles[video_dir.name] = video_dir.name.replace("_", " ")
            else:
                self.video_titles[video_dir.name] = video_dir.name.replace("_", " ")

            for profile, (index_filename, metadata_filename) in PROFILE_ASSETS.items():
                index_path = video_dir / index_filename
                metadata_path = video_dir / metadata_filename
                if not index_path.exists() or not metadata_path.exists():
                    continue

                try:
                    index = faiss.read_index(str(index_path))
                    with open(metadata_path, encoding="utf-8") as handle:
                        metadata = json.load(handle)
                except ValueError:
                    raise
                except Exception as exc:
                    print(
                        f"Warning: Failed to load {profile} index for {video_dir.name}: {exc}",
                        file=sys.stderr,
                    )
                    continue

                self.profile_indexes[profile][video_dir.name] = (index, metadata["segments"])
                normalized = normalize_embedding_metadata(metadata)
                self.profile_index_metadata[profile][video_dir.name] = normalized
                loaded_metadata.append(normalized)

        self.available_profiles = [
            profile for profile, indexes in self.profile_indexes.items() if indexes
        ]
        if self.available_profiles and self.primary_profile not in self.available_profiles:
            self.primary_profile = self.available_profiles[0]

        self.indexes = self.profile_indexes.get(self.primary_profile, {})
        self.index_metadata = self.profile_index_metadata.get(self.primary_profile, {})

        if loaded_metadata:
            self.corpus_metadata = ensure_single_corpus_config(loaded_metadata)

        for profile in self.available_profiles:
            self._build_token_indexes(profile)

    def get_corpus_info(self) -> Optional[dict]:
        if not self.corpus_metadata:
            return None

        return {
            "provider": self.corpus_metadata.provider,
            "model": self.corpus_metadata.model,
            "modality": self.corpus_metadata.modality,
            "indexVersion": self.corpus_metadata.index_version,
            "dimension": self.corpus_metadata.dimension,
            "profiles": list(self.available_profiles),
            "primaryProfile": self.primary_profile,
        }

    def _get_profile_indexes(self, profile: str) -> dict[str, tuple]:
        return self.profile_indexes.get(profile, {})

    def _build_token_indexes(self, profile: str) -> None:
        segment_cache: dict[tuple[str, int], set[str]] = {}
        title_cache: dict[str, set[str]] = {}
        document_frequency: Counter[str] = Counter()
        total_documents = 0

        for video_id, (_, segments) in self._get_profile_indexes(profile).items():
            for index, segment in enumerate(segments):
                tokens = set(self._tokenize(segment.get("text", "")))
                segment_cache[(video_id, index)] = tokens
                if tokens:
                    document_frequency.update(tokens)
                total_documents += 1

            title_cache[video_id] = set(self._tokenize(self.video_titles.get(video_id, "")))

        self.profile_segment_token_cache[profile] = segment_cache
        self.profile_title_token_cache[profile] = title_cache
        self.profile_token_document_frequency[profile] = document_frequency
        self.profile_total_segment_documents[profile] = total_documents

    def _ensure_embedder(self) -> None:
        if self.embedder is not None:
            return
        if self.corpus_metadata is None:
            raise ValueError("No embedding corpus metadata is available")

        config = EmbeddingConfig(
            provider=self.corpus_metadata.provider,
            model=self.model_name or self.corpus_metadata.model,
            modality=self.corpus_metadata.modality,
            index_version=self.corpus_metadata.index_version,
            output_dimensionality=self.corpus_metadata.dimension,
        )
        self.embedder = build_embedder(config)

    def _embed_query(self, query: str):
        import faiss
        import numpy as np

        self._ensure_embedder()

        query_embedding = self.embedder.embed_queries([query])
        query_embedding = np.array(query_embedding).astype("float32")

        expected_dimension = self.corpus_metadata.dimension if self.corpus_metadata else None
        if expected_dimension is not None and query_embedding.shape[1] != expected_dimension:
            raise ValueError(
                f"Query embedding dimension {query_embedding.shape[1]} does not match corpus dimension {expected_dimension}"
            )

        faiss.normalize_L2(query_embedding)
        return query_embedding

    def _tokenize(self, text: str) -> list[str]:
        tokens = TOKEN_PATTERN.findall(text.lower())
        return [
            token for token in tokens
            if len(token) >= 2 and token not in QUERY_STOPWORDS
        ]

    def _idf(self, profile: str, token: str) -> float:
        total_documents = self.profile_total_segment_documents.get(profile, 0)
        document_frequency = self.profile_token_document_frequency.get(profile, Counter())
        return math.log((total_documents + 1) / (document_frequency.get(token, 0) + 1)) + 1.0

    def _query_terms(self, query: str) -> set[str]:
        return set(self._tokenize(query))

    def _ordered_query_terms(self, query: str) -> list[str]:
        ordered_terms: list[str] = []
        seen_terms: set[str] = set()
        for token in self._tokenize(query):
            if token in seen_terms:
                continue
            seen_terms.add(token)
            ordered_terms.append(token)
        return ordered_terms

    def _lexical_overlap_score(
        self,
        profile: str,
        query_terms: set[str],
        candidate_terms: set[str],
    ) -> float:
        if not query_terms or not candidate_terms:
            return 0.0

        matched_terms = query_terms & candidate_terms
        if not matched_terms:
            return 0.0

        matched_weight = sum(self._idf(profile, token) for token in matched_terms)
        total_weight = sum(self._idf(profile, token) for token in query_terms)
        if total_weight == 0:
            return 0.0
        return matched_weight / total_weight

    def _salient_query_terms(
        self,
        profile: str,
        query_terms: set[str],
    ) -> set[str]:
        if not query_terms:
            return set()

        ranked_terms = sorted(
            query_terms,
            key=lambda token: (self._idf(profile, token), len(token)),
            reverse=True,
        )
        salient_count = min(
            len(ranked_terms),
            max(2, math.ceil(len(ranked_terms) / 3)),
        )
        return set(ranked_terms[:salient_count])

    def _salient_overlap_score(
        self,
        profile: str,
        query_terms: set[str],
        candidate_terms: set[str],
    ) -> float:
        salient_terms = self._salient_query_terms(profile, query_terms)
        if not salient_terms:
            return 0.0
        return self._lexical_overlap_score(profile, salient_terms, candidate_terms)

    def _leading_overlap_score(
        self,
        profile: str,
        query: str,
        candidate_terms: set[str],
        *,
        max_terms: int = 2,
    ) -> float:
        leading_terms = set(self._ordered_query_terms(query)[:max_terms])
        if not leading_terms:
            return 0.0
        return self._lexical_overlap_score(profile, leading_terms, candidate_terms)

    def _search_profile(
        self,
        profile: str,
        query_embedding,
        *,
        top_k: int,
        video_ids: Optional[list[str]] = None,
    ) -> list[SearchResult]:
        indexes = self._get_profile_indexes(profile)
        if not indexes:
            return []

        all_results: list[SearchResult] = []
        target_video_ids = video_ids or list(indexes.keys())
        for video_id in target_video_ids:
            if video_id not in indexes:
                continue

            index, segments = indexes[video_id]
            k = min(max(top_k, 1), len(segments))
            scores, indices = index.search(query_embedding, k)

            for score, idx in zip(scores[0], indices[0]):
                if idx < 0:
                    continue

                segment = segments[int(idx)]
                all_results.append(
                    SearchResult(
                        video_id=video_id,
                        text=segment["text"],
                        start=segment["start"],
                        end=segment["end"],
                        score=float(score),
                    )
                )

        all_results.sort(key=lambda result: result.score, reverse=True)
        return all_results[:top_k]

    def _collect_refined_matches(
        self,
        profile: str,
        query: str,
        query_embedding,
        candidate_video_ids: list[str],
        *,
        per_video_k: int = 60,
        video_prior_scores: Optional[dict[str, float]] = None,
    ) -> list[dict]:
        indexes = self._get_profile_indexes(profile)
        if not indexes:
            return []

        query_terms = self._query_terms(query)
        if not query_terms:
            return []

        matches: list[dict] = []
        segment_cache = self.profile_segment_token_cache.get(profile, {})

        for video_id in candidate_video_ids:
            if video_id not in indexes:
                continue

            index, segments = indexes[video_id]
            k = min(per_video_k, len(segments))
            scores, indices = index.search(query_embedding, k)

            for score, idx in zip(scores[0], indices[0]):
                if idx < 0:
                    continue

                segment_index = int(idx)
                lexical_score = self._lexical_overlap_score(
                    profile,
                    query_terms,
                    segment_cache.get((video_id, segment_index), set()),
                )
                salient_score = self._salient_overlap_score(
                    profile,
                    query_terms,
                    segment_cache.get((video_id, segment_index), set()),
                )
                prior_score = (video_prior_scores or {}).get(video_id, 0.0)
                refinement_score = (
                    float(score) * 0.52
                    + lexical_score * 0.26
                    + salient_score * 0.34
                    + prior_score * 0.18
                )
                matches.append({
                    "profile": profile,
                    "videoId": video_id,
                    "segmentIndex": segment_index,
                    "segment": segments[segment_index],
                    "semanticScore": float(score),
                    "lexicalScore": lexical_score,
                    "salientScore": salient_score,
                    "priorScore": prior_score,
                    "refinementScore": refinement_score,
                })

        matches.sort(key=lambda match: match["refinementScore"], reverse=True)
        return matches

    def _select_refined_segment(
        self,
        query: str,
        query_embedding,
        candidate_video_ids: list[str],
        *,
        profile: str,
        per_video_k: int = 60,
        video_prior_scores: Optional[dict[str, float]] = None,
    ) -> Optional[dict]:
        matches = self._collect_refined_matches(
            profile,
            query,
            query_embedding,
            candidate_video_ids,
            per_video_k=per_video_k,
            video_prior_scores=video_prior_scores,
        )
        return matches[0] if matches else None

    def _rank_profile_results(
        self,
        profile: str,
        query: str,
        query_embedding,
        candidate_video_ids: list[str],
        *,
        top_k: int,
        per_video_k: int = 60,
        video_prior_scores: Optional[dict[str, float]] = None,
    ) -> list[SearchResult]:
        refined_matches = self._collect_refined_matches(
            profile,
            query,
            query_embedding,
            candidate_video_ids,
            per_video_k=per_video_k,
            video_prior_scores=video_prior_scores,
        )
        return [
            SearchResult(
                video_id=match["videoId"],
                text=match["segment"]["text"],
                start=match["segment"]["start"],
                end=match["segment"]["end"],
                score=match["refinementScore"],
            )
            for match in refined_matches[:top_k]
        ]

    def _build_video_prior_scores(
        self,
        video_scores: list[VideoScore],
        candidate_video_ids: list[str],
    ) -> dict[str, float]:
        if not candidate_video_ids:
            return {}

        score_lookup = {
            video_score.video_id: video_score.combined_score
            for video_score in video_scores
            if video_score.video_id in candidate_video_ids
        }
        if not score_lookup:
            return {}

        highest_score = max(score_lookup.values())
        lowest_score = min(score_lookup.values())
        score_span = highest_score - lowest_score
        rank_lookup = {
            video_score.video_id: rank
            for rank, video_score in enumerate(video_scores)
            if video_score.video_id in score_lookup
        }
        max_rank = max(rank_lookup.values(), default=0)

        prior_scores: dict[str, float] = {}
        for video_id in candidate_video_ids:
            if video_id not in score_lookup:
                continue

            combined_score = score_lookup[video_id]
            if score_span > 1e-6:
                normalized_score = (combined_score - lowest_score) / score_span
            else:
                normalized_score = 1.0

            rank = rank_lookup.get(video_id, max_rank)
            if max_rank > 0:
                rank_score = 1.0 - (rank / max_rank)
            else:
                rank_score = 1.0

            prior_scores[video_id] = normalized_score * 0.7 + rank_score * 0.3

        return prior_scores

    def _build_query_aligned_excerpt(
        self,
        text: str,
        query: str,
        *,
        max_length: int = 260,
        context_chars: int = 72,
    ) -> str:
        normalized_text = " ".join(text.split())
        if len(normalized_text) <= max_length:
            return normalized_text

        text_lower = normalized_text.lower()
        best_position: Optional[int] = None
        for term in self._query_terms(query):
            position = text_lower.find(term)
            if position >= 0 and (best_position is None or position < best_position):
                best_position = position

        if best_position is None:
            return normalized_text[:max_length]

        start = max(best_position - context_chars, 0)
        end = min(start + max_length, len(normalized_text))
        if end - start < max_length:
            start = max(end - max_length, 0)

        excerpt = normalized_text[start:end]
        if start > 0:
            excerpt = f"...{excerpt}"
        if end < len(normalized_text):
            excerpt = f"{excerpt}..."
        return excerpt

    def _clip_alignment_score(
        self,
        profile: str,
        query: str,
        text: str,
    ) -> float:
        query_terms = self._query_terms(query)
        if not query_terms:
            return 0.0

        candidate_terms = set(self._tokenize(text))
        lexical_score = self._lexical_overlap_score(profile, query_terms, candidate_terms)
        salient_score = self._salient_overlap_score(profile, query_terms, candidate_terms)
        leading_score = self._leading_overlap_score(profile, query, candidate_terms)
        return lexical_score * 0.38 + salient_score * 0.27 + leading_score * 0.52

    def _collect_keyword_anchor_candidates(
        self,
        profile: str,
        query: str,
        candidate_video_ids: list[str],
        *,
        top_k_per_video: int = 4,
        video_prior_scores: Optional[dict[str, float]] = None,
    ) -> list[dict]:
        indexes = self._get_profile_indexes(profile)
        if not indexes:
            return []

        query_terms = self._query_terms(query)
        if not query_terms:
            return []

        segment_cache = self.profile_segment_token_cache.get(profile, {})
        matches: list[dict] = []
        for video_id in candidate_video_ids:
            if video_id not in indexes:
                continue

            _, segments = indexes[video_id]
            video_matches: list[dict] = []
            for segment_index, segment in enumerate(segments):
                candidate_terms = segment_cache.get((video_id, segment_index), set())
                lexical_score = self._lexical_overlap_score(profile, query_terms, candidate_terms)
                salient_score = self._salient_overlap_score(profile, query_terms, candidate_terms)
                leading_score = self._leading_overlap_score(profile, query, candidate_terms)
                if lexical_score <= 0 and salient_score <= 0 and leading_score <= 0:
                    continue

                prior_score = (video_prior_scores or {}).get(video_id, 0.0)
                keyword_score = (
                    lexical_score * 0.24
                    + salient_score * 0.34
                    + leading_score * 0.46
                    + prior_score * 0.12
                )
                video_matches.append({
                    "profile": profile,
                    "videoId": video_id,
                    "segmentIndex": segment_index,
                    "segment": segment,
                    "lexicalScore": lexical_score,
                    "salientScore": salient_score,
                    "leadingScore": leading_score,
                    "priorScore": prior_score,
                    "keywordScore": keyword_score,
                })

            video_matches.sort(key=lambda match: match["keywordScore"], reverse=True)
            matches.extend(video_matches[:top_k_per_video])

        matches.sort(key=lambda match: match["keywordScore"], reverse=True)
        return matches

    def _expand_boundary_from_anchor(
        self,
        *,
        video_id: str,
        segment_index: int,
        query: str,
        query_embedding,
        similarity_threshold: float,
        max_extension_seconds: float,
        min_duration_seconds: float,
        max_similarity_drop: float,
    ) -> Optional[dict]:
        if video_id not in self.indexes:
            return None

        index, segments = self.indexes[video_id]
        if segment_index < 0 or segment_index >= len(segments):
            return None

        best_score = self._segment_similarity(index, segment_index, query_embedding)
        relative_threshold = best_score * similarity_threshold
        drop_threshold = max(best_score - max_similarity_drop, 0.0)
        threshold = max(relative_threshold, drop_threshold)
        start_idx = segment_index
        end_idx = segment_index

        for index_candidate in range(segment_index - 1, -1, -1):
            similarity = self._segment_similarity(index, index_candidate, query_embedding)
            if similarity >= threshold:
                start_idx = index_candidate
            else:
                break

        start_time = segments[start_idx]["start"]
        earliest_allowed_start = max(
            0.0,
            segments[segment_index]["end"] - max_extension_seconds,
        )
        while start_idx < segment_index and segments[start_idx]["start"] < earliest_allowed_start:
            start_idx += 1
        start_time = segments[start_idx]["start"]

        for index_candidate in range(segment_index + 1, len(segments)):
            current_segment = segments[index_candidate]
            if current_segment["end"] - start_time > max_extension_seconds:
                break

            similarity = self._segment_similarity(index, index_candidate, query_embedding)
            if similarity < threshold:
                break

            end_idx = index_candidate

        actual_duration = segments[end_idx]["end"] - start_time
        if actual_duration < min_duration_seconds:
            while end_idx + 1 < len(segments):
                next_end = segments[end_idx + 1]["end"]
                if next_end - start_time > max_extension_seconds:
                    break
                end_idx += 1
                new_duration = segments[end_idx]["end"] - start_time
                if new_duration >= min_duration_seconds:
                    break

        extended_end = segments[end_idx]["end"]
        combined_text = " ".join(
            segments[index_candidate]["text"]
            for index_candidate in range(start_idx, end_idx + 1)
        )
        excerpt_text = self._build_query_aligned_excerpt(combined_text, query)
        clip_alignment = self._clip_alignment_score(self.primary_profile, query, combined_text)

        return {
            "result": SearchResult(
                video_id=video_id,
                text=excerpt_text,
                start=start_time,
                end=extended_end,
                score=best_score,
            ),
            "clipAlignment": clip_alignment,
            "durationSeconds": extended_end - start_time,
            "startIndex": start_idx,
            "endIndex": end_idx,
            "threshold": threshold,
            "bestScore": best_score,
        }

    def _aggregate_video_scores(
        self,
        query: str,
        query_embedding,
        *,
        profile: Optional[str] = None,
        top_segments_per_video: int = 10,
    ) -> list[VideoScore]:
        active_profile = profile or self.primary_profile
        indexes = self._get_profile_indexes(active_profile)
        if not indexes:
            return []

        query_terms = self._query_terms(query.lower())
        title_cache = self.profile_title_token_cache.get(active_profile, {})
        video_scores: dict[str, dict] = {}

        for video_id, (index, segments) in indexes.items():
            k = min(top_segments_per_video, len(segments))
            scores, indices = index.search(query_embedding, k)

            valid_scores: list[float] = []
            best_segment = None
            best_score = 0.0

            for score, idx in zip(scores[0], indices[0]):
                if idx < 0:
                    continue
                semantic_score = float(score)
                valid_scores.append(semantic_score)
                if semantic_score > best_score:
                    best_score = semantic_score
                    best_segment = segments[int(idx)]

            if valid_scores and best_segment:
                max_score = max(valid_scores)
                top_scores = sorted(valid_scores, reverse=True)[:3]
                avg_score = sum(top_scores) / len(top_scores)
                match_count = len(valid_scores)
                title_match_bonus = self._lexical_overlap_score(
                    active_profile,
                    query_terms,
                    title_cache.get(video_id, set()),
                )
                combined = (
                    max_score * 0.72
                    + avg_score * 0.22
                    + title_match_bonus * 0.12
                    + math.log(match_count + 1) * 0.03
                )

                video_scores[video_id] = {
                    "max": max_score,
                    "avg": avg_score,
                    "count": match_count,
                    "combined": combined,
                    "best_segment": best_segment,
                }

        sorted_videos = sorted(
            video_scores.items(),
            key=lambda item: item[1]["combined"],
            reverse=True,
        )

        return [
            VideoScore(
                video_id=video_id,
                max_score=data["max"],
                avg_score=data["avg"],
                match_count=data["count"],
                combined_score=data["combined"],
                best_segment=data["best_segment"],
            )
            for video_id, data in sorted_videos
        ]

    def _build_candidate_video_ids(
        self,
        query: str,
        query_embedding,
        *,
        search_top_k: int = 5,
        video_top_k: int = 5,
    ) -> tuple[list[SearchResult], list[VideoScore], list[str]]:
        segment_results = self._search_profile(
            self.primary_profile,
            query_embedding,
            top_k=max(search_top_k, 1),
        )
        video_scores = self._aggregate_video_scores(
            query,
            query_embedding,
            profile=self.primary_profile,
        )

        candidate_video_ids: list[str] = []
        for result in segment_results:
            if result.video_id not in candidate_video_ids:
                candidate_video_ids.append(result.video_id)
        for video_score in video_scores[:video_top_k]:
            if video_score.video_id not in candidate_video_ids:
                candidate_video_ids.append(video_score.video_id)

        return segment_results, video_scores, candidate_video_ids

    def _segment_similarity(self, index, segment_index: int, query_embedding) -> float:
        import numpy as np

        segment_embedding = np.zeros((1, index.d), dtype="float32")
        index.reconstruct(segment_index, segment_embedding[0])
        return float(np.dot(query_embedding, segment_embedding.T)[0][0])

    def _map_fine_anchor_to_primary(
        self,
        fine_anchor: dict,
        query_embedding,
    ) -> Optional[dict]:
        video_id = fine_anchor["videoId"]
        if video_id not in self.indexes:
            return None

        target_indices = set(fine_anchor["segment"].get("segment_indices", []))
        if not target_indices:
            return None

        index, segments = self.indexes[video_id]
        best_match: Optional[dict] = None

        for segment_index, segment in enumerate(segments):
            segment_indices = set(segment.get("segment_indices", []))
            overlap = len(target_indices & segment_indices)
            if overlap <= 0:
                continue

            semantic_score = self._segment_similarity(index, segment_index, query_embedding)
            if best_match is None:
                best_match = {
                    "videoId": video_id,
                    "segmentIndex": segment_index,
                    "segment": segment,
                    "semanticScore": semantic_score,
                    "overlap": overlap,
                }
                continue

            if overlap > best_match["overlap"] or (
                overlap == best_match["overlap"]
                and semantic_score > best_match["semanticScore"]
            ):
                best_match = {
                    "videoId": video_id,
                    "segmentIndex": segment_index,
                    "segment": segment,
                    "semanticScore": semantic_score,
                    "overlap": overlap,
                }

        return best_match

    def search(self, query: str, top_k: int = 5) -> list[SearchResult]:
        if not self.available_profiles:
            return []

        normalized_query = query.strip()
        if not normalized_query:
            return []

        query_embedding = self._embed_query(normalized_query)
        coarse_results, video_scores, candidate_video_ids = self._build_candidate_video_ids(
            normalized_query,
            query_embedding,
            search_top_k=max(top_k, 5),
        )
        video_prior_scores = self._build_video_prior_scores(video_scores, candidate_video_ids)

        if "fine" in self.available_profiles and candidate_video_ids:
            fine_results = self._rank_profile_results(
                "fine",
                normalized_query,
                query_embedding,
                candidate_video_ids,
                top_k=top_k,
                per_video_k=max(top_k * 12, 40),
                video_prior_scores=video_prior_scores,
            )
            if fine_results:
                return fine_results

        return coarse_results[:top_k]

    def search_json(self, query: str, top_k: int = 5) -> str:
        results = self.search(query, top_k)
        return json.dumps([
            {
                "videoId": result.video_id,
                "text": result.text,
                "start": result.start,
                "end": result.end,
                "score": result.score,
            }
            for result in results
        ])

    def search_video_level(self, query: str, top_k: int = 3) -> list[VideoScore]:
        if not self.available_profiles:
            return []

        normalized_query = query.strip()
        if not normalized_query:
            return []

        query_embedding = self._embed_query(normalized_query)
        video_scores = self._aggregate_video_scores(
            normalized_query,
            query_embedding,
            profile=self.primary_profile,
        )
        return video_scores[:top_k]

    def search_video_level_json(self, query: str, top_k: int = 3) -> str:
        results = self.search_video_level(query, top_k)
        return json.dumps([
            {
                "videoId": result.video_id,
                "videoTitle": self.video_titles.get(result.video_id, result.video_id),
                "maxScore": result.max_score,
                "avgScore": result.avg_score,
                "matchCount": result.match_count,
                "combinedScore": result.combined_score,
                "bestSegment": {
                    "text": result.best_segment.get("text", "")[:200],
                    "start": result.best_segment.get("start", 0),
                    "end": result.best_segment.get("end", 0),
                },
            }
            for result in results
        ], indent=2)

    def search_with_boundary(
        self,
        query: str,
        similarity_threshold: float = 0.4,
        max_extension_seconds: float = 300.0,
        min_duration_seconds: float = 60.0,
        max_similarity_drop: float = 0.08,
        use_video_level_scoring: bool = True,
    ) -> Optional[SearchResult]:
        if not self.available_profiles:
            return None

        normalized_query = query.strip()
        if not normalized_query:
            return None

        query_embedding = self._embed_query(normalized_query)
        _, video_scores, candidate_video_ids = self._build_candidate_video_ids(
            normalized_query,
            query_embedding,
        )
        video_prior_scores = self._build_video_prior_scores(video_scores, candidate_video_ids)

        best_match: Optional[dict] = None
        best_score = 0.0
        best_video_id: Optional[str] = None
        best_segment_idx = -1

        if use_video_level_scoring:
            if not video_scores:
                return None

            print(f"[VideoLevel] Query: '{normalized_query}'", file=sys.stderr)
            for index, video_score in enumerate(video_scores[:3], start=1):
                title = self.video_titles.get(video_score.video_id, video_score.video_id)
                print(
                    "[VideoLevel] "
                    f"#{index}: {title} (combined={video_score.combined_score:.3f}, "
                    f"max={video_score.max_score:.3f}, avg={video_score.avg_score:.3f}, "
                    f"count={video_score.match_count})",
                    file=sys.stderr,
                )

            anchor_candidates: dict[tuple[str, int], dict] = {}
            if "fine" in self.available_profiles and candidate_video_ids:
                fine_matches = self._collect_refined_matches(
                    "fine",
                    normalized_query,
                    query_embedding,
                    candidate_video_ids,
                    per_video_k=80,
                    video_prior_scores=video_prior_scores,
                )
                for fine_match in fine_matches[:10]:
                    mapped_anchor = self._map_fine_anchor_to_primary(fine_match, query_embedding)
                    if mapped_anchor is not None:
                        anchor_key = (
                            mapped_anchor["videoId"],
                            mapped_anchor["segmentIndex"],
                        )
                        candidate = {
                            "videoId": mapped_anchor["videoId"],
                            "segmentIndex": mapped_anchor["segmentIndex"],
                            "anchorScore": fine_match["refinementScore"],
                            "source": "fine",
                        }
                        existing = anchor_candidates.get(anchor_key)
                        if existing is None or candidate["anchorScore"] > existing["anchorScore"]:
                            anchor_candidates[anchor_key] = candidate

            coarse_matches = self._collect_refined_matches(
                self.primary_profile,
                normalized_query,
                query_embedding,
                candidate_video_ids or [video_scores[0].video_id],
                per_video_k=50,
                video_prior_scores=video_prior_scores,
            )
            for coarse_match in coarse_matches[:12]:
                anchor_key = (
                    coarse_match["videoId"],
                    coarse_match["segmentIndex"],
                )
                candidate = {
                    "videoId": coarse_match["videoId"],
                    "segmentIndex": coarse_match["segmentIndex"],
                    "anchorScore": coarse_match["refinementScore"],
                    "source": "coarse",
                }
                existing = anchor_candidates.get(anchor_key)
                if existing is None or candidate["anchorScore"] > existing["anchorScore"]:
                    anchor_candidates[anchor_key] = candidate

            keyword_matches = self._collect_keyword_anchor_candidates(
                self.primary_profile,
                normalized_query,
                candidate_video_ids or [video_scores[0].video_id],
                top_k_per_video=5,
                video_prior_scores=video_prior_scores,
            )
            for keyword_match in keyword_matches[:15]:
                anchor_key = (
                    keyword_match["videoId"],
                    keyword_match["segmentIndex"],
                )
                candidate = {
                    "videoId": keyword_match["videoId"],
                    "segmentIndex": keyword_match["segmentIndex"],
                    "anchorScore": keyword_match["keywordScore"],
                    "source": "keyword",
                }
                existing = anchor_candidates.get(anchor_key)
                if existing is None or candidate["anchorScore"] > existing["anchorScore"]:
                    anchor_candidates[anchor_key] = candidate

            ranked_anchor_candidates = sorted(
                anchor_candidates.values(),
                key=lambda candidate: candidate["anchorScore"],
                reverse=True,
            )

            best_boundary_candidate: Optional[dict] = None
            best_boundary_score = float("-inf")
            for anchor_candidate in ranked_anchor_candidates[:12]:
                boundary_candidate = self._expand_boundary_from_anchor(
                    video_id=anchor_candidate["videoId"],
                    segment_index=anchor_candidate["segmentIndex"],
                    query=normalized_query,
                    query_embedding=query_embedding,
                    similarity_threshold=similarity_threshold,
                    max_extension_seconds=max_extension_seconds,
                    min_duration_seconds=min_duration_seconds,
                    max_similarity_drop=max_similarity_drop,
                )
                if boundary_candidate is None:
                    continue

                duration_penalty = math.log1p(
                    max(0.0, boundary_candidate["durationSeconds"] - min_duration_seconds) / 60.0
                ) * 0.08
                source_bonus = 0.05 if anchor_candidate["source"] == "keyword" else 0.0
                boundary_score = (
                    anchor_candidate["anchorScore"] * 0.48
                    + boundary_candidate["clipAlignment"] * 0.62
                    - duration_penalty
                    + source_bonus
                )
                if boundary_score > best_boundary_score:
                    best_boundary_score = boundary_score
                    best_boundary_candidate = {
                        **boundary_candidate,
                        "anchor": anchor_candidate,
                        "boundaryScore": boundary_score,
                    }

            if best_boundary_candidate is not None:
                best_video_id = best_boundary_candidate["result"].video_id
                best_match = {"text": best_boundary_candidate["result"].text}
                best_score = best_boundary_candidate["result"].score
                best_segment_idx = best_boundary_candidate["anchor"]["segmentIndex"]

                print(
                    "[Boundary] Selected "
                    f"{best_boundary_candidate['anchor']['source']} anchor "
                    f"{best_video_id}/{best_segment_idx} "
                    f"(anchorScore={best_boundary_candidate['anchor']['anchorScore']:.3f}, "
                    f"clipAlignment={best_boundary_candidate['clipAlignment']:.3f}, "
                    f"boundaryScore={best_boundary_candidate['boundaryScore']:.3f}, "
                    f"duration={best_boundary_candidate['durationSeconds']:.1f}s)",
                    file=sys.stderr,
                )

                return best_boundary_candidate["result"]

            if best_match is None:
                best_video = video_scores[0]
                best_video_id = best_video.video_id
                best_match = best_video.best_segment
                best_score = best_video.max_score
                best_segment_idx = 0

                for index, segment in enumerate(self.indexes[best_video_id][1]):
                    if (
                        segment.get("start") == best_match.get("start")
                        and segment.get("end") == best_match.get("end")
                    ):
                        best_segment_idx = index
                        break
        else:
            for video_id, (index, segments) in self.indexes.items():
                scores, indices = index.search(query_embedding, 1)
                if len(scores[0]) > 0 and scores[0][0] > best_score:
                    best_score = float(scores[0][0])
                    best_segment_idx = int(indices[0][0])
                    best_video_id = video_id
                    best_match = segments[best_segment_idx]

        if not best_match or best_video_id is None or best_segment_idx < 0:
            return None

        fallback_boundary = self._expand_boundary_from_anchor(
            video_id=best_video_id,
            segment_index=best_segment_idx,
            query=normalized_query,
            query_embedding=query_embedding,
            similarity_threshold=similarity_threshold,
            max_extension_seconds=max_extension_seconds,
            min_duration_seconds=min_duration_seconds,
            max_similarity_drop=max_similarity_drop,
        )
        if fallback_boundary is None:
            return None
        return fallback_boundary["result"]

    def search_with_boundary_json(
        self,
        query: str,
        similarity_threshold: float = 0.4,
        max_extension_seconds: float = 300.0,
        min_duration_seconds: float = 60.0,
    ) -> str:
        result = self.search_with_boundary(
            query,
            similarity_threshold,
            max_extension_seconds,
            min_duration_seconds,
        )
        if result is None:
            return "null"
        return json.dumps({
            "videoId": result.video_id,
            "text": result.text,
            "start": result.start,
            "end": result.end,
            "score": result.score,
        })


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python faiss_search.py <query> [top_k]")
        print("Example: python faiss_search.py 'what is order fulfillment' 5")
        sys.exit(1)

    query = sys.argv[1]
    top_k = int(sys.argv[2]) if len(sys.argv) > 2 else 5

    script_dir = Path(__file__).parent
    project_root = script_dir.parent.parent
    videos_path = project_root / "data" / "local-videos"

    print(f"Loading indexes from: {videos_path}", file=sys.stderr)
    searcher = VideoSearcher(videos_path)
    print(f"Loaded {len(searcher.indexes)} {searcher.primary_profile} indexes", file=sys.stderr)

    if not searcher.available_profiles:
        print("No FAISS indexes found. Run embed_transcripts.py first.", file=sys.stderr)
        sys.exit(1)

    print(f"\nQuery: {query}\n", file=sys.stderr)
    results = searcher.search(query, top_k)
    print(json.dumps([
        {
            "videoId": result.video_id,
            "text": result.text,
            "start": result.start,
            "end": result.end,
            "score": result.score,
        }
        for result in results
    ], indent=2))


if __name__ == "__main__":
    main()
