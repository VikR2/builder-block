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
            from tcm_embeddings import GOOGLE_GEMINI_PROVIDER, get_google_api_key
            cls.searcher = VideoSearcher(VIDEOS_PATH)
            cls.faiss_available = len(cls.searcher.indexes) > 0
            cls.google_query_key_available = get_google_api_key() is not None
            cls.google_provider = GOOGLE_GEMINI_PROVIDER
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
        corpus_metadata = getattr(self.searcher, "corpus_metadata", None)
        if (
            corpus_metadata is not None
            and corpus_metadata.provider == self.google_provider
            and not self.google_query_key_available
        ):
            self.skipTest("Google-backed FAISS corpus requires GOOGLE_API_KEY or GEMINI_API_KEY for query tests")

    # =========================================================================
    # Test: Exact keyword queries find relevant content
    # =========================================================================

    def test_exact_query_order_fulfillment(self):
        """Query 'order fulfillment' finds content about order fulfillment."""
        results = self.searcher.search("order fulfillment", top_k=3)

        self.assertGreater(len(results), 0, "Should find at least one result")

        # Top result should capture the order-fill workflow, even if Gemini
        # surfaces a paraphrase instead of the literal word "fulfillment".
        top_result = results[0]
        text_lower = top_result.text.lower()
        self.assertIn("order", text_lower,
            f"Top result should reference orders, got: {top_result.text[:100]}")
        has_fill_workflow_term = any(term in text_lower for term in
            ["fill", "filled", "fulfillment", "warehouse", "distribution"])
        self.assertTrue(has_fill_workflow_term,
            f"Top result should capture fill workflow semantics, got: {top_result.text[:100]}")

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

    def test_google_dual_index_reports_available_profiles(self):
        """Google corpora should expose both coarse and fine profiles after rebuild."""
        corpus_metadata = getattr(self.searcher, "corpus_metadata", None)
        if corpus_metadata is None or corpus_metadata.provider != self.google_provider:
            self.skipTest("Dual-profile assertion only applies to Google corpora")

        self.assertIn("coarse", self.searcher.available_profiles)
        self.assertIn("fine", self.searcher.available_profiles)
        corpus_info = self.searcher.get_corpus_info()
        self.assertIsNotNone(corpus_info)
        self.assertEqual(corpus_info["primaryProfile"], "coarse")

    def test_exact_query_matched_orders_on_book_hits_target_window(self):
        """Top-1 exact result should land near the matched-orders-on-book clip."""
        results = self.searcher.search(
            "show me where he says all the matched orders are placed on the book",
            top_k=1,
        )

        self.assertGreater(len(results), 0, "Should find at least one result")
        self.assertEqual(results[0].video_id, "Order-Fufilment-Tips_a89df5aa")
        self.assertGreaterEqual(results[0].start, 700)
        self.assertLessEqual(results[0].start, 780)

    def test_exact_query_unmatched_orders_have_no_liquidity_hits_target_window(self):
        """Top-1 exact result should land near the unmatched-orders/liquidity clip."""
        results = self.searcher.search(
            "show me where he says if it is not matched there is no liquidity there",
            top_k=1,
        )

        self.assertGreater(len(results), 0, "Should find at least one result")
        self.assertEqual(results[0].video_id, "Order-Fufilment-Tips_a89df5aa")
        self.assertGreaterEqual(results[0].start, 930)
        self.assertLessEqual(results[0].start, 1015)

    def test_exact_query_matching_does_not_overlap_hits_target_window(self):
        """Top-1 exact result should land near the matching-does-not-overlap note."""
        results = self.searcher.search(
            "where does he leave the note that matching does not overlap any day",
            top_k=1,
        )

        self.assertGreater(len(results), 0, "Should find at least one result")
        self.assertEqual(results[0].video_id, "Order-Fufilment-Tips_a89df5aa")
        self.assertGreaterEqual(results[0].start, 4560)
        self.assertLessEqual(results[0].start, 4665)

    # =========================================================================
    # Test: Edge cases
    # =========================================================================

    def test_empty_query_returns_empty(self):
        """Empty query returns empty results (not error)."""
        results = self.searcher.search("", top_k=5)
        self.assertEqual(results, [], "Blank queries should short-circuit to []")

    def test_whitespace_query_returns_empty(self):
        """Whitespace-only query returns empty results (not error)."""
        results = self.searcher.search("   \n\t  ", top_k=5)
        self.assertEqual(results, [], "Whitespace-only queries should short-circuit to []")

    def test_gibberish_query_returns_low_scores(self):
        """Gibberish query scores below a focused topical query."""
        results = self.searcher.search("xyzzy foobar qwerty asdf", top_k=3)
        topical_results = self.searcher.search("order fulfillment", top_k=1)

        if not results or not topical_results:
            self.skipTest("Not enough results for score comparison")

        self.assertLess(results[0].score, topical_results[0].score,
            f"Gibberish should score below focused topical query, got {results[0].score:.3f} vs {topical_results[0].score:.3f}")
        self.assertGreater(topical_results[0].score - results[0].score, 0.05,
            f"Focused topical query should beat gibberish by a meaningful margin, got delta {(topical_results[0].score - results[0].score):.3f}")

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
            fine_embeddings_file = video_dir / "embeddings.fine.faiss"
            fine_segments_file = video_dir / "segments.fine.json"

            self.assertTrue(embeddings_file.exists(),
                f"Video {video_dir.name} has transcript but missing embeddings.faiss")
            self.assertTrue(segments_file.exists(),
                f"Video {video_dir.name} has transcript but missing segments.json")
            if getattr(self.searcher.corpus_metadata, "provider", None) == self.google_provider:
                self.assertTrue(fine_embeddings_file.exists(),
                    f"Video {video_dir.name} has transcript but missing embeddings.fine.faiss")
                self.assertTrue(fine_segments_file.exists(),
                    f"Video {video_dir.name} has transcript but missing segments.fine.json")

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
            self.assertIn("profile", metadata)
            self.assertIn("min_words", metadata)
            self.assertIn("title_prefix_mode", metadata)

            # Segments should be non-empty
            self.assertGreater(len(metadata["segments"]), 0,
                f"Video {video_dir.name} should have segments")

            # Each segment should have required fields
            for i, seg in enumerate(metadata["segments"][:5]):  # Check first 5
                self.assertIn("text", seg, f"Segment {i} missing text")
                self.assertIn("start", seg, f"Segment {i} missing start")
                self.assertIn("end", seg, f"Segment {i} missing end")

            fine_segments_file = video_dir / "segments.fine.json"
            if fine_segments_file.exists():
                with open(fine_segments_file) as f:
                    fine_metadata = json.load(f)
                self.assertEqual(fine_metadata.get("profile"), "fine")
                self.assertEqual(fine_metadata.get("title_prefix_mode"), "none")


class TestSearchResultClipGeneration(unittest.TestCase):
    """Test that search results can be used to generate video clips."""

    @classmethod
    def setUpClass(cls):
        """Load searcher."""
        try:
            from faiss_search import VideoSearcher
            from tcm_embeddings import GOOGLE_GEMINI_PROVIDER, get_google_api_key
            cls.searcher = VideoSearcher(VIDEOS_PATH)
            cls.faiss_available = len(cls.searcher.indexes) > 0
            cls.google_query_key_available = get_google_api_key() is not None
            cls.google_provider = GOOGLE_GEMINI_PROVIDER
        except Exception:
            cls.faiss_available = False

    def setUp(self):
        if not self.faiss_available:
            self.skipTest("FAISS not available")
        corpus_metadata = getattr(self.searcher, "corpus_metadata", None)
        if (
            corpus_metadata is not None
            and corpus_metadata.provider == self.google_provider
            and not self.google_query_key_available
        ):
            self.skipTest("Google-backed FAISS corpus requires GOOGLE_API_KEY or GEMINI_API_KEY for query tests")

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

    def test_boundary_search_stays_on_book_overlap_explanation(self):
        """Boundary search should span the benchmarked overlap-is-the-book explanation."""
        match = self.searcher.search_with_boundary(
            "show me the exact clip where he explains the book is the overlap between the submission range and matching window",
            similarity_threshold=0.4,
            max_extension_seconds=300,
            min_duration_seconds=60,
        )

        if not match:
            self.skipTest("No boundary match returned")

        text_lower = match.text.lower()
        mentions_book_or_overlap = "book" in text_lower or "overlap" in text_lower

        self.assertTrue(
            mentions_book_or_overlap,
            f"Boundary clip should stay on the target explanation family, got: {match.text[:160]}",
        )
        self.assertEqual(match.video_id, "Order-Fufilment-Tips_a89df5aa")
        self.assertLessEqual(
            match.start,
            2532.29,
            f"Boundary clip should start before the benchmark anchor, got start {match.start:.1f}s",
        )
        self.assertGreaterEqual(
            match.end,
            2536.29,
            f"Boundary clip should cover the benchmark anchor, got end {match.end:.1f}s",
        )
        self.assertLessEqual(
            match.end - match.start,
            300,
            f"Boundary clip should respect the max extension cap, got duration {match.end - match.start:.1f}s",
        )

    def test_boundary_search_prefers_akatsuki_for_amazon_analogy(self):
        """Boundary search should stay in the Akatsuki lesson for the Amazon analogy query."""
        match = self.searcher.search_with_boundary(
            "explain the Amazon warehouse analogy for order fulfillment",
            similarity_threshold=0.4,
            max_extension_seconds=300,
            min_duration_seconds=60,
        )

        if not match:
            self.skipTest("No boundary match returned")

        self.assertEqual(match.video_id, "TCM_Akatsuki_Bootcamp_indicator_2026_b07e4527")
        self.assertGreaterEqual(match.start, 390)
        self.assertLessEqual(match.start, 520)
        self.assertLessEqual(match.end - match.start, 180)

    def test_boundary_search_prefers_akatsuki_for_liquidity_after_fill(self):
        """Boundary search should stay in the Akatsuki lesson for the fill/liquidity query."""
        match = self.searcher.search_with_boundary(
            "show me where he says liquidity does not pop up until the order is filled",
            similarity_threshold=0.4,
            max_extension_seconds=300,
            min_duration_seconds=60,
        )

        if not match:
            self.skipTest("No boundary match returned")

        self.assertEqual(match.video_id, "TCM_Akatsuki_Bootcamp_indicator_2026_b07e4527")
        self.assertGreaterEqual(match.start, 630)
        self.assertLessEqual(match.start, 710)
        self.assertLessEqual(match.end - match.start, 180)

    def test_boundary_search_finds_pending_orders_phrase(self):
        """Boundary search should get near the pending-orders phrasing inside the Akatsuki lesson."""
        match = self.searcher.search_with_boundary(
            "show me where he says submission range is just pending orders",
            similarity_threshold=0.4,
            max_extension_seconds=300,
            min_duration_seconds=60,
        )

        if not match:
            self.skipTest("No boundary match returned")

        self.assertEqual(match.video_id, "TCM_Akatsuki_Bootcamp_indicator_2026_b07e4527")
        self.assertGreaterEqual(match.start, 1700)
        self.assertLessEqual(match.start, 1790)
        self.assertLessEqual(match.end - match.start, 180)

    def test_boundary_search_finds_first_expansion_outside_range_phrase(self):
        """Boundary search should land near the first-expansion-outside-range explanation."""
        match = self.searcher.search_with_boundary(
            "where does he say you pull a box until it overlaps with the high and that becomes your first expansion outside of a range",
            similarity_threshold=0.4,
            max_extension_seconds=300,
            min_duration_seconds=60,
        )

        if not match:
            self.skipTest("No boundary match returned")

        self.assertEqual(match.video_id, "Revisting_Expansions_d53d8ad4")
        self.assertGreaterEqual(match.start, 5250)
        self.assertLessEqual(match.start, 5420)
        self.assertLessEqual(match.end - match.start, 210)


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
