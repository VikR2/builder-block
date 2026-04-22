#!/usr/bin/env python3
"""
Unit tests for the TCM retrieval benchmark harness.
"""

import sys
import unittest
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
sys.path.insert(0, str(SCRIPT_DIR))
sys.path.insert(0, str(SCRIPT_DIR / "lib"))

from eval_tcm_retrieval import (
    BenchmarkCase,
    aggregate_corpus_summary,
    interval_coverage,
    interval_iou,
    interval_overlap,
    score_boundary_result,
    score_segment_results,
)
from faiss_search import SearchResult


class TestBenchmarkIntervals(unittest.TestCase):
    def test_interval_overlap_returns_seconds(self):
        self.assertEqual(interval_overlap(10.0, 20.0, 15.0, 25.0), 5.0)
        self.assertEqual(interval_overlap(10.0, 20.0, 20.0, 25.0), 0.0)

    def test_interval_coverage_uses_expected_span_as_denominator(self):
        self.assertAlmostEqual(interval_coverage(10.0, 20.0, 15.0, 25.0), 0.5)
        self.assertAlmostEqual(interval_coverage(10.0, 20.0, 5.0, 30.0), 1.0)

    def test_interval_iou_penalizes_excess_clip_length(self):
        self.assertAlmostEqual(interval_iou(10.0, 20.0, 10.0, 20.0), 1.0)
        self.assertAlmostEqual(interval_iou(10.0, 20.0, 5.0, 25.0), 0.5)


class TestBenchmarkScoring(unittest.TestCase):
    def setUp(self):
        self.case = BenchmarkCase(
            case_id="book-overlap",
            query="show me where he says the book is the overlap",
            expected_video_id="video-a",
            expected_start=100.0,
            expected_end=140.0,
            acceptable_video_ids=("video-b",),
        )

    def test_segment_scoring_tracks_rank_and_overlap(self):
        results = [
            SearchResult(video_id="video-x", text="miss", start=0.0, end=20.0, score=0.91),
            SearchResult(video_id="video-a", text="hit", start=110.0, end=150.0, score=0.89),
            SearchResult(video_id="video-b", text="alt", start=95.0, end=145.0, score=0.84),
        ]

        scored = score_segment_results(self.case, results)

        self.assertFalse(scored["top1Hit"])
        self.assertTrue(scored["top3Hit"])
        self.assertFalse(scored["top1ClipHit"])
        self.assertTrue(scored["top3ClipHit"])
        self.assertTrue(scored["bestClipHit"])
        self.assertEqual(scored["bestRank"], 2)
        self.assertEqual(scored["bestVideoId"], "video-a")
        self.assertAlmostEqual(scored["bestCoverage"], 1.0)
        self.assertAlmostEqual(scored["bestIoU"], 0.8)

    def test_segment_scoring_accepts_alternate_videos(self):
        results = [
            SearchResult(video_id="video-b", text="alt", start=100.0, end=140.0, score=0.95),
        ]

        scored = score_segment_results(self.case, results)

        self.assertTrue(scored["top1Hit"])
        self.assertTrue(scored["top1ClipHit"])
        self.assertTrue(scored["top3ClipHit"])
        self.assertTrue(scored["bestClipHit"])
        self.assertEqual(scored["bestRank"], 1)
        self.assertEqual(scored["bestVideoId"], "video-b")
        self.assertAlmostEqual(scored["bestCoverage"], 1.0)
        self.assertAlmostEqual(scored["bestIoU"], 1.0)

    def test_boundary_scoring_reports_hit_and_excess_ratio(self):
        result = SearchResult(
            video_id="video-a",
            text="extended clip",
            start=90.0,
            end=170.0,
            score=0.87,
        )

        scored = score_boundary_result(self.case, result)

        self.assertTrue(scored["hit"])
        self.assertTrue(scored["videoHit"])
        self.assertTrue(scored["clipHit"])
        self.assertAlmostEqual(scored["coverage"], 1.0)
        self.assertAlmostEqual(scored["iou"], 0.5)
        self.assertAlmostEqual(scored["durationRatio"], 2.0)

    def test_boundary_scoring_handles_missing_result(self):
        scored = score_boundary_result(self.case, None)

        self.assertFalse(scored["hit"])
        self.assertFalse(scored["videoHit"])
        self.assertFalse(scored["clipHit"])
        self.assertIsNone(scored["coverage"])
        self.assertIsNone(scored["iou"])
        self.assertIsNone(scored["durationRatio"])


class TestBenchmarkSummary(unittest.TestCase):
    def test_aggregate_summary_computes_hit_rates_and_means(self):
        case_results = [
            {
                "segment": {
                    "top1Hit": True,
                    "top3Hit": True,
                    "top1ClipHit": True,
                    "top3ClipHit": True,
                    "bestClipHit": True,
                    "bestCoverage": 1.0,
                    "bestIoU": 0.8,
                },
                "boundary": {
                    "hit": True,
                    "clipHit": True,
                    "coverage": 1.0,
                    "iou": 0.5,
                    "durationRatio": 1.5,
                },
                "timings": {"searchMs": 120.0, "boundaryMs": 240.0},
            },
            {
                "segment": {
                    "top1Hit": False,
                    "top3Hit": True,
                    "top1ClipHit": False,
                    "top3ClipHit": True,
                    "bestClipHit": True,
                    "bestCoverage": 0.5,
                    "bestIoU": 0.25,
                },
                "boundary": {
                    "hit": False,
                    "clipHit": False,
                    "coverage": 0.25,
                    "iou": 0.1,
                    "durationRatio": 3.0,
                },
                "timings": {"searchMs": 180.0, "boundaryMs": 360.0},
            },
        ]

        summary = aggregate_corpus_summary(
            label="gemini",
            videos_path=Path("data/local-videos"),
            case_results=case_results,
            profiles=["coarse", "fine"],
        )

        self.assertEqual(summary["cases"], 2)
        self.assertEqual(summary["profiles"], ["coarse", "fine"])
        self.assertAlmostEqual(summary["segmentTop1HitRate"], 0.5)
        self.assertAlmostEqual(summary["segmentTop3HitRate"], 1.0)
        self.assertAlmostEqual(summary["segmentTop1ClipHitRate"], 0.5)
        self.assertAlmostEqual(summary["segmentTop3ClipHitRate"], 1.0)
        self.assertAlmostEqual(summary["segmentClipHitRate"], 1.0)
        self.assertAlmostEqual(summary["boundaryHitRate"], 0.5)
        self.assertAlmostEqual(summary["boundaryClipHitRate"], 0.5)
        self.assertAlmostEqual(summary["segmentCoverageMean"], 0.75)
        self.assertAlmostEqual(summary["segmentIoUMean"], 0.525)
        self.assertAlmostEqual(summary["boundaryCoverageMean"], 0.625)
        self.assertAlmostEqual(summary["boundaryIoUMean"], 0.3)
        self.assertAlmostEqual(summary["boundaryDurationRatioMean"], 2.25)
        self.assertAlmostEqual(summary["avgSearchMs"], 150.0)
        self.assertAlmostEqual(summary["avgBoundaryMs"], 300.0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
