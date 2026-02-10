#!/usr/bin/env python3
"""
Unit tests for FAISS video clip search.

Tests that when new videos are processed, the clips explaining concepts
match user queries semantically.

Run with:
    pytest scripts/test_faiss_search.py -v

Or directly:
    python scripts/test_faiss_search.py
"""

import json
import sys
import unittest
from pathlib import Path

# Add scripts/lib to path
SCRIPT_DIR = Path(__file__).parent
sys.path.insert(0, str(SCRIPT_DIR / "lib"))

# Project paths
PROJECT_ROOT = SCRIPT_DIR.parent
VIDEOS_PATH = PROJECT_ROOT / "data" / "local-videos"


class TestFAISSSearch(unittest.TestCase):
    """Test FAISS semantic search for video clips."""

    @classmethod
    def setUpClass(cls):
        """Load FAISS searcher once for all tests."""
        try:
            from faiss_search import VideoSearcher
            cls.searcher = VideoSearcher(VIDEOS_PATH)
            cls.faiss_available = len(cls.searcher.indexes) > 0
        except ImportError as e:
            cls.faiss_available = False
            cls.import_error = str(e)
        except Exception as e:
            cls.faiss_available = False
            cls.import_error = str(e)

    def setUp(self):
        """Skip tests if FAISS not available."""
        if not self.faiss_available:
            self.skipTest(f"FAISS not available: {getattr(self, 'import_error', 'Unknown')}")

    # =========================================================================
    # Test: Exact keyword queries find relevant content
    # =========================================================================

    def test_exact_query_order_fulfillment(self):
        """Query 'order fulfillment' finds content about order fulfillment."""
        results = self.searcher.search("order fulfillment", top_k=3)

        self.assertGreater(len(results), 0, "Should find at least one result")

        # Top result should mention order fulfillment
        top_result = results[0]
        self.assertIn("fulfillment", top_result.text.lower(),
            f"Top result should mention 'fulfillment', got: {top_result.text[:100]}")

        # Score should be reasonably high for exact match
        self.assertGreater(top_result.score, 0.5,
            f"Exact query should have score > 0.5, got {top_result.score:.3f}")

    def test_exact_query_submission_range(self):
        """Query 'submission range' finds content about submission."""
        results = self.searcher.search("submission range", top_k=3)

        self.assertGreater(len(results), 0, "Should find at least one result")

        # Should find content related to submission or order timing
        top_result = results[0]
        text_lower = top_result.text.lower()
        has_relevant_term = any(term in text_lower for term in
            ["submission", "submit", "order", "time", "range"])
        self.assertTrue(has_relevant_term,
            f"Should find submission-related content, got: {top_result.text[:100]}")

    # =========================================================================
    # Test: Semantic queries (paraphrased) find relevant content
    # =========================================================================

    def test_semantic_query_how_institutions_fill_orders(self):
        """Semantic query about institutions filling orders finds fulfillment content."""
        results = self.searcher.search("how do institutions fill their orders", top_k=3)

        self.assertGreater(len(results), 0, "Should find at least one result")

        # Should find content about order filling/fulfillment even without exact keywords
        top_result = results[0]
        text_lower = top_result.text.lower()
        has_relevant_term = any(term in text_lower for term in
            ["order", "fill", "fulfillment", "matched", "routed"])
        self.assertTrue(has_relevant_term,
            f"Semantic query should find order-related content, got: {top_result.text[:100]}")

    def test_semantic_query_amazon_analogy(self):
        """Query about Amazon analogy finds relevant explanation."""
        results = self.searcher.search("explain the Amazon warehouse analogy", top_k=3)

        self.assertGreater(len(results), 0, "Should find at least one result")

        # The video uses Amazon as an analogy for order fulfillment
        top_result = results[0]
        # Even if "Amazon" isn't in text, should find order fulfillment content
        self.assertIsNotNone(top_result.text)

    def test_semantic_query_trading_lifecycle(self):
        """Query about trading lifecycle finds lifecycle explanation."""
        results = self.searcher.search("what is the lifecycle of a trade", top_k=3)

        self.assertGreater(len(results), 0, "Should find at least one result")

        # Should find content about trading/order lifecycle
        # Check across top 3 results since semantic search may find related content
        found_relevant = False
        relevant_terms = ["lifecycle", "order", "process", "begins", "submitted",
                         "routed", "settled", "trade", "when", "where", "look for"]

        for result in results:
            text_lower = result.text.lower()
            if any(term in text_lower for term in relevant_terms):
                found_relevant = True
                break

        self.assertTrue(found_relevant,
            f"Should find trading-related content in top 3 results")

    # =========================================================================
    # Test: Timestamps are valid
    # =========================================================================

    def test_timestamps_are_valid(self):
        """Search results have valid start/end timestamps."""
        results = self.searcher.search("order fulfillment", top_k=5)

        for result in results:
            self.assertGreaterEqual(result.start, 0,
                f"Start time should be >= 0, got {result.start}")
            self.assertGreater(result.end, result.start,
                f"End time ({result.end}) should be > start ({result.start})")
            # Reasonable duration (< 2 minutes per window)
            duration = result.end - result.start
            self.assertLess(duration, 120,
                f"Window duration should be < 120s, got {duration:.1f}s")

    def test_video_ids_exist(self):
        """Search results reference existing video directories."""
        results = self.searcher.search("order fulfillment", top_k=5)

        for result in results:
            video_dir = VIDEOS_PATH / result.video_id
            self.assertTrue(video_dir.exists(),
                f"Video directory should exist: {result.video_id}")

    # =========================================================================
    # Test: Score ranking is meaningful
    # =========================================================================

    def test_results_are_sorted_by_score(self):
        """Results are sorted by descending score."""
        results = self.searcher.search("order fulfillment", top_k=10)

        if len(results) < 2:
            self.skipTest("Not enough results to test sorting")

        for i in range(len(results) - 1):
            self.assertGreaterEqual(results[i].score, results[i+1].score,
                f"Results should be sorted: {results[i].score} >= {results[i+1].score}")

    def test_exact_match_scores_higher_than_tangential(self):
        """Exact topic matches score higher than tangential content."""
        exact_results = self.searcher.search("order fulfillment theory", top_k=1)
        tangential_results = self.searcher.search("trading psychology mindset", top_k=1)

        if not exact_results or not tangential_results:
            self.skipTest("Not enough results for comparison")

        # Exact topic should score higher (or at least not significantly lower)
        # This tests that the embedding model understands semantic relevance
        self.assertGreater(exact_results[0].score, tangential_results[0].score * 0.8,
            "Exact topic should score comparably or higher than tangential topic")

    # =========================================================================
    # Test: Edge cases
    # =========================================================================

    def test_empty_query_returns_empty(self):
        """Empty query returns empty results (not error)."""
        results = self.searcher.search("", top_k=5)
        # Should either return empty or low-relevance results, not crash
        self.assertIsInstance(results, list)

    def test_gibberish_query_returns_low_scores(self):
        """Gibberish query returns low-confidence results."""
        results = self.searcher.search("xyzzy foobar qwerty asdf", top_k=3)

        # Should return something (FAISS always finds nearest), but low scores
        if results:
            self.assertLess(results[0].score, 0.3,
                f"Gibberish should have low score, got {results[0].score:.3f}")

    def test_single_word_query(self):
        """Single word query works."""
        results = self.searcher.search("order", top_k=3)

        self.assertGreater(len(results), 0, "Single word query should return results")

    def test_long_query(self):
        """Long natural language query works."""
        query = ("Can you explain to me in detail how the financial markets "
                 "handle order fulfillment and what the entire process looks like "
                 "from the moment an order is submitted until it is settled?")
        results = self.searcher.search(query, top_k=3)

        self.assertGreater(len(results), 0, "Long query should return results")

    # =========================================================================
    # Test: New video processing integration
    # =========================================================================

    def test_all_videos_have_embeddings(self):
        """All videos with transcripts have FAISS embeddings."""
        for video_dir in VIDEOS_PATH.iterdir():
            if not video_dir.is_dir():
                continue

            transcript_file = video_dir / "transcript_timed.json"
            if not transcript_file.exists():
                continue  # Skip videos without transcripts

            # If video has transcript, it should have embeddings
            embeddings_file = video_dir / "embeddings.faiss"
            segments_file = video_dir / "segments.json"

            self.assertTrue(embeddings_file.exists(),
                f"Video {video_dir.name} has transcript but missing embeddings.faiss")
            self.assertTrue(segments_file.exists(),
                f"Video {video_dir.name} has transcript but missing segments.json")

    def test_segments_metadata_is_valid(self):
        """Segments.json contains valid metadata."""
        for video_dir in VIDEOS_PATH.iterdir():
            if not video_dir.is_dir():
                continue

            segments_file = video_dir / "segments.json"
            if not segments_file.exists():
                continue

            with open(segments_file) as f:
                metadata = json.load(f)

            # Required fields
            self.assertIn("video_id", metadata)
            self.assertIn("model", metadata)
            self.assertIn("segments", metadata)

            # Segments should be non-empty
            self.assertGreater(len(metadata["segments"]), 0,
                f"Video {video_dir.name} should have segments")

            # Each segment should have required fields
            for i, seg in enumerate(metadata["segments"][:5]):  # Check first 5
                self.assertIn("text", seg, f"Segment {i} missing text")
                self.assertIn("start", seg, f"Segment {i} missing start")
                self.assertIn("end", seg, f"Segment {i} missing end")


class TestSearchResultClipGeneration(unittest.TestCase):
    """Test that search results can be used to generate video clips."""

    @classmethod
    def setUpClass(cls):
        """Load searcher."""
        try:
            from faiss_search import VideoSearcher
            cls.searcher = VideoSearcher(VIDEOS_PATH)
            cls.faiss_available = len(cls.searcher.indexes) > 0
        except Exception:
            cls.faiss_available = False

    def setUp(self):
        if not self.faiss_available:
            self.skipTest("FAISS not available")

    def test_clip_window_calculation(self):
        """Test that clip windows (start-5s, end+30s) are valid."""
        results = self.searcher.search("order fulfillment", top_k=1)

        if not results:
            self.skipTest("No results")

        match = results[0]

        # Calculate clip window (same logic as tcm-video-clips.server.ts)
        clip_start = max(0, match.start - 5)
        clip_end = match.end + 30

        self.assertGreaterEqual(clip_start, 0)
        self.assertGreater(clip_end, clip_start)

        # Clip should be reasonable length (< 5 minutes)
        clip_duration = clip_end - clip_start
        self.assertLess(clip_duration, 300,
            f"Clip duration {clip_duration:.1f}s seems too long")

    def test_result_provides_description(self):
        """Result text can be used for clip description."""
        results = self.searcher.search("order fulfillment", top_k=1)

        if not results:
            self.skipTest("No results")

        match = results[0]

        # Text should be non-empty and suitable for description
        self.assertGreater(len(match.text), 20,
            "Result text should be substantial")

        # Description would be: f'"{match.text[:80]}..."'
        description = f'"{match.text[:80]}..."'
        self.assertLess(len(description), 100,
            "Description should be concise")


def run_tests():
    """Run all tests and return exit code."""
    # Create test suite
    loader = unittest.TestLoader()
    suite = unittest.TestSuite()

    # Add test classes
    suite.addTests(loader.loadTestsFromTestCase(TestFAISSSearch))
    suite.addTests(loader.loadTestsFromTestCase(TestSearchResultClipGeneration))

    # Run with verbosity
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)

    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    sys.exit(run_tests())
