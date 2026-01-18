"""
FAISS search utilities for video transcript embeddings.

This module provides semantic search across video transcripts using FAISS
vector similarity. Can be used as a library or called from Node.js.

Usage:
    # As CLI
    python scripts/lib/faiss_search.py "what is order fulfillment"

    # As library
    from scripts.lib.faiss_search import VideoSearcher
    searcher = VideoSearcher(Path("data/local-videos"))
    results = searcher.search("order fulfillment", top_k=5)
"""

import json
import math
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Optional


@dataclass
class VideoScore:
    """Aggregated score for a video across multiple matching segments."""
    video_id: str
    max_score: float
    avg_score: float
    match_count: int
    combined_score: float  # Weighted combination
    best_segment: dict  # The top-scoring segment


@dataclass
class SearchResult:
    """A single search result from FAISS similarity search."""
    video_id: str
    text: str
    start: float
    end: float
    score: float


class VideoSearcher:
    """Search video transcripts using FAISS embeddings."""

    def __init__(self, videos_path: Path, model_name: str = "all-MiniLM-L6-v2"):
        """
        Initialize searcher with video embeddings.

        Args:
            videos_path: Path to local-videos directory containing embeddings
            model_name: Name of sentence-transformer model (must match embedding model)
        """
        self.videos_path = videos_path
        self.model_name = model_name
        self.model = None  # Lazy load
        self.indexes: dict[str, tuple] = {}  # video_id -> (index, segments)
        self.video_titles: dict[str, str] = {}  # video_id -> title
        self._load_indexes()

    def _load_indexes(self):
        """Load all FAISS indexes into memory."""
        # Import here to avoid loading if not needed
        try:
            import faiss
        except ImportError:
            print("ERROR: faiss-cpu not installed", file=sys.stderr)
            return

        if not self.videos_path.exists():
            print(f"ERROR: Videos path does not exist: {self.videos_path}", file=sys.stderr)
            return

        for video_dir in self.videos_path.iterdir():
            if not video_dir.is_dir():
                continue

            index_file = video_dir / "embeddings.faiss"
            meta_file = video_dir / "segments.json"
            manifest_file = video_dir / "manifest.json"

            if index_file.exists() and meta_file.exists():
                try:
                    index = faiss.read_index(str(index_file))
                    with open(meta_file, encoding='utf-8') as f:
                        metadata = json.load(f)

                    self.indexes[video_dir.name] = (index, metadata["segments"])

                    # Load title from manifest.json if available
                    if manifest_file.exists():
                        with open(manifest_file, encoding='utf-8') as f:
                            manifest = json.load(f)
                            title = manifest.get("source_title", video_dir.name)
                            self.video_titles[video_dir.name] = title
                    else:
                        # Fallback: parse title from folder name
                        self.video_titles[video_dir.name] = video_dir.name.replace('_', ' ').split()[0]
                except Exception as e:
                    print(f"Warning: Failed to load index for {video_dir.name}: {e}", file=sys.stderr)

    def _ensure_model(self):
        """Lazy load the embedding model."""
        if self.model is None:
            from sentence_transformers import SentenceTransformer
            self.model = SentenceTransformer(self.model_name)

    def search(self, query: str, top_k: int = 5) -> list[SearchResult]:
        """
        Search all videos for query using semantic similarity.

        Args:
            query: Natural language search query
            top_k: Maximum number of results to return

        Returns:
            List of SearchResult sorted by similarity score (highest first)
        """
        if not self.indexes:
            return []

        import faiss
        import numpy as np

        self._ensure_model()

        # Embed query
        query_embedding = self.model.encode([query])
        query_embedding = np.array(query_embedding).astype('float32')
        faiss.normalize_L2(query_embedding)

        all_results = []

        for video_id, (index, segments) in self.indexes.items():
            # Search this video's index
            k = min(top_k, len(segments))
            scores, indices = index.search(query_embedding, k)

            for score, idx in zip(scores[0], indices[0]):
                if idx < 0:  # FAISS returns -1 for no result
                    continue

                segment = segments[idx]
                all_results.append(SearchResult(
                    video_id=video_id,
                    text=segment["text"],
                    start=segment["start"],
                    end=segment["end"],
                    score=float(score)
                ))

        # Sort by score and return top-k
        all_results.sort(key=lambda x: x.score, reverse=True)
        return all_results[:top_k]

    def search_json(self, query: str, top_k: int = 5) -> str:
        """Search and return results as JSON string (for Node.js integration)."""
        results = self.search(query, top_k)
        return json.dumps([{
            'videoId': r.video_id,
            'text': r.text,
            'start': r.start,
            'end': r.end,
            'score': r.score
        } for r in results])

    def _aggregate_video_scores(
        self,
        query: str,
        query_embedding,
        top_segments_per_video: int = 10
    ) -> list[VideoScore]:
        """
        Aggregate segment scores by video to find best VIDEO, not just best segment.

        This fixes the issue where a video with one strong incidental mention
        beats a dedicated video with many moderate mentions.

        Scoring: combined = max*0.5 + avg*0.3 + log(count+1)*0.2
        Also adds title match bonus if query keywords appear in video title.
        """
        import faiss
        import numpy as np

        video_scores: dict[str, dict] = {}

        # Get query keywords for title matching
        query_lower = query.lower()
        query_words = [w for w in query_lower.split() if len(w) > 3]

        for video_id, (index, segments) in self.indexes.items():
            k = min(top_segments_per_video, len(segments))
            scores, indices = index.search(query_embedding, k)

            valid_scores = []
            best_segment = None
            best_score = 0

            for score, idx in zip(scores[0], indices[0]):
                if idx < 0:
                    continue
                valid_scores.append(float(score))
                if score > best_score:
                    best_score = float(score)
                    best_segment = segments[idx]

            if valid_scores and best_segment:
                max_score = max(valid_scores)
                avg_score = sum(valid_scores) / len(valid_scores)
                match_count = len(valid_scores)

                # Base combined score
                combined = max_score * 0.5 + avg_score * 0.3 + math.log(match_count + 1) * 0.2

                # Title match bonus: boost if query keywords appear in video title
                video_title = self.video_titles.get(video_id, "").lower()
                title_match_bonus = 0.0
                for word in query_words:
                    if word in video_title:
                        title_match_bonus += 0.15  # 15% bonus per matching keyword

                combined += title_match_bonus

                video_scores[video_id] = {
                    'max': max_score,
                    'avg': avg_score,
                    'count': match_count,
                    'combined': combined,
                    'best_segment': best_segment,
                    'title_bonus': title_match_bonus
                }

        # Sort by combined score
        sorted_videos = sorted(
            video_scores.items(),
            key=lambda x: x[1]['combined'],
            reverse=True
        )

        return [
            VideoScore(
                video_id=vid,
                max_score=data['max'],
                avg_score=data['avg'],
                match_count=data['count'],
                combined_score=data['combined'],
                best_segment=data['best_segment']
            )
            for vid, data in sorted_videos
        ]

    def search_video_level(self, query: str, top_k: int = 3) -> list[VideoScore]:
        """
        Search for best matching VIDEOS (not just segments) using aggregated scoring.

        Returns top-k videos ranked by combined score of:
        - Max segment score (50% weight)
        - Average segment score (30% weight)
        - Number of matches (20% weight, log-scaled)
        - Title match bonus (15% per keyword)
        """
        if not self.indexes:
            return []

        import faiss
        import numpy as np

        self._ensure_model()

        # Embed query
        query_embedding = self.model.encode([query])
        query_embedding = np.array(query_embedding).astype('float32')
        faiss.normalize_L2(query_embedding)

        video_scores = self._aggregate_video_scores(query, query_embedding)
        return video_scores[:top_k]

    def search_video_level_json(self, query: str, top_k: int = 3) -> str:
        """Search for best videos and return as JSON."""
        results = self.search_video_level(query, top_k)
        return json.dumps([{
            'videoId': vs.video_id,
            'videoTitle': self.video_titles.get(vs.video_id, vs.video_id),
            'maxScore': vs.max_score,
            'avgScore': vs.avg_score,
            'matchCount': vs.match_count,
            'combinedScore': vs.combined_score,
            'bestSegment': {
                'text': vs.best_segment.get('text', '')[:200],
                'start': vs.best_segment.get('start', 0),
                'end': vs.best_segment.get('end', 0)
            }
        } for vs in results], indent=2)

    def search_with_boundary(
        self,
        query: str,
        similarity_threshold: float = 0.4,
        max_extension_seconds: float = 300.0,
        min_duration_seconds: float = 60.0,
        use_video_level_scoring: bool = True
    ) -> Optional[SearchResult]:
        """
        Find best match and extend to concept boundary using semantic similarity decay.

        Instead of using fixed time windows (which cut off explanations early),
        this method scans forward through subsequent segments and stops when
        the semantic similarity drops below threshold * peak_score.

        Args:
            query: Search query
            similarity_threshold: Stop when similarity drops below peak * threshold (default 0.4 = 40%)
            max_extension_seconds: Safety cap to prevent runaway clips (default 5 minutes)
            use_video_level_scoring: If True, pick best VIDEO first, then best segment in that video

        Returns:
            Single SearchResult with extended end time, or None if no match
        """
        if not self.indexes:
            return None

        import faiss
        import numpy as np

        self._ensure_model()

        # Embed query
        query_embedding = self.model.encode([query])
        query_embedding = np.array(query_embedding).astype('float32')
        faiss.normalize_L2(query_embedding)

        # NEW: Use video-level scoring to pick best VIDEO first
        if use_video_level_scoring:
            video_scores = self._aggregate_video_scores(query, query_embedding)
            if not video_scores:
                return None

            # Log video ranking for debugging
            print(f"[VideoLevel] Query: '{query}'", file=sys.stderr)
            for i, vs in enumerate(video_scores[:3]):
                title = self.video_titles.get(vs.video_id, vs.video_id)
                print(f"[VideoLevel] #{i+1}: {title} (combined={vs.combined_score:.3f}, max={vs.max_score:.3f}, avg={vs.avg_score:.3f}, count={vs.match_count})", file=sys.stderr)

            best_video = video_scores[0]
            best_video_id = best_video.video_id
            best_match = best_video.best_segment
            best_score = best_video.max_score

            # Find the segment index for boundary extension
            index, segments = self.indexes[best_video_id]
            best_segment_idx = 0
            for i, seg in enumerate(segments):
                if seg.get('start') == best_match.get('start') and seg.get('end') == best_match.get('end'):
                    best_segment_idx = i
                    break
        else:
            # Original behavior: find best segment across all videos
            best_match: Optional[dict] = None
            best_score: float = 0
            best_video_id: Optional[str] = None
            best_segment_idx: int = -1

            for video_id, (index, segments) in self.indexes.items():
                scores, indices = index.search(query_embedding, 1)
                if len(scores[0]) > 0 and scores[0][0] > best_score:
                    best_score = float(scores[0][0])
                    best_segment_idx = int(indices[0][0])
                    best_video_id = video_id
                    best_match = segments[best_segment_idx]

        if not best_match or best_video_id is None:
            return None

        import numpy as np

        # Extend forward until similarity drops below threshold
        index, segments = self.indexes[best_video_id]
        threshold = best_score * similarity_threshold
        end_idx = best_segment_idx
        start_idx = best_segment_idx

        print(f"[Boundary] Peak score: {best_score:.3f}, threshold: {threshold:.3f}", file=sys.stderr)

        # Extend BACKWARD to include high-similarity segments before the peak
        for i in range(best_segment_idx - 1, -1, -1):
            segment_embedding = np.zeros((1, index.d), dtype='float32')
            index.reconstruct(i, segment_embedding[0])
            similarity = float(np.dot(query_embedding, segment_embedding.T)[0][0])
            print(f"[Boundary] Backward segment {i}: similarity={similarity:.3f}", file=sys.stderr)
            if similarity >= threshold:
                start_idx = i
            else:
                break

        start_time = segments[start_idx]["start"]
        print(f"[Boundary] Backward extension: segments {start_idx}-{best_segment_idx} (start={start_time:.1f}s)", file=sys.stderr)

        for i in range(best_segment_idx + 1, len(segments)):
            # Check max extension limit
            current_segment = segments[i]
            if current_segment["end"] - start_time > max_extension_seconds:
                print(f"[Boundary] Hit max extension at segment {i}", file=sys.stderr)
                break

            # Get embedding for this segment by reconstructing from index
            segment_embedding = np.zeros((1, index.d), dtype='float32')
            index.reconstruct(i, segment_embedding[0])

            # Compute similarity to original query
            similarity = float(np.dot(query_embedding, segment_embedding.T)[0][0])

            print(f"[Boundary] Segment {i}: similarity={similarity:.3f} (vs threshold {threshold:.3f})", file=sys.stderr)

            if similarity < threshold:
                print(f"[Boundary] Stopped at segment {i} - similarity dropped below threshold", file=sys.stderr)
                break

            end_idx = i

        # Enforce minimum duration
        actual_duration = segments[end_idx]["end"] - start_time
        if actual_duration < min_duration_seconds:
            print(f"[Boundary] Duration {actual_duration:.1f}s below minimum {min_duration_seconds}s, extending...", file=sys.stderr)
            while end_idx + 1 < len(segments):
                next_end = segments[end_idx + 1]["end"]
                if next_end - start_time > max_extension_seconds:
                    print(f"[Boundary] Min duration extension hit max cap at {max_extension_seconds}s", file=sys.stderr)
                    break
                end_idx += 1
                new_duration = segments[end_idx]["end"] - start_time
                print(f"[Boundary] Extended to segment {end_idx} (duration={new_duration:.1f}s)", file=sys.stderr)
                if new_duration >= min_duration_seconds:
                    break

        # Get the extended end time
        extended_end = segments[end_idx]["end"]

        # Combine text from all included segments for description
        combined_text = " ".join(
            segments[j]["text"] for j in range(start_idx, end_idx + 1)
        )

        print(f"[Boundary] Final range: segments {start_idx}-{end_idx} "
              f"({start_time:.1f}s - {extended_end:.1f}s = {extended_end - start_time:.1f}s)", file=sys.stderr)

        return SearchResult(
            video_id=best_video_id,
            text=combined_text[:200],  # Truncate for description
            start=start_time,
            end=extended_end,
            score=best_score
        )

    def search_with_boundary_json(
        self,
        query: str,
        similarity_threshold: float = 0.4,
        max_extension_seconds: float = 300.0,
        min_duration_seconds: float = 60.0
    ) -> str:
        """Search with boundary detection and return result as JSON (for Node.js)."""
        result = self.search_with_boundary(query, similarity_threshold, max_extension_seconds, min_duration_seconds)
        if result is None:
            return "null"
        return json.dumps({
            'videoId': result.video_id,
            'text': result.text,
            'start': result.start,
            'end': result.end,
            'score': result.score
        })


def main():
    """CLI entry point for testing."""
    if len(sys.argv) < 2:
        print("Usage: python faiss_search.py <query> [top_k]")
        print("Example: python faiss_search.py 'what is order fulfillment' 5")
        sys.exit(1)

    query = sys.argv[1]
    top_k = int(sys.argv[2]) if len(sys.argv) > 2 else 5

    # Determine videos path relative to this script
    script_dir = Path(__file__).parent
    project_root = script_dir.parent.parent
    videos_path = project_root / "data" / "local-videos"

    print(f"Loading indexes from: {videos_path}", file=sys.stderr)
    searcher = VideoSearcher(videos_path)
    print(f"Loaded {len(searcher.indexes)} video indexes", file=sys.stderr)

    if not searcher.indexes:
        print("No FAISS indexes found. Run embed_transcripts.py first.", file=sys.stderr)
        sys.exit(1)

    print(f"\nQuery: {query}\n", file=sys.stderr)
    results = searcher.search(query, top_k)

    # Output JSON to stdout (for Node.js)
    print(json.dumps([{
        'videoId': r.video_id,
        'text': r.text,
        'start': r.start,
        'end': r.end,
        'score': r.score
    } for r in results], indent=2))


if __name__ == "__main__":
    main()
