#!/usr/bin/env python3
"""
Benchmark semantic and boundary retrieval quality for TCM video search.

This script measures retrieval quality for one or two embedding corpora using a
gold set of benchmark queries with expected videos and clip ranges.

Examples:
    python scripts/eval_tcm_retrieval.py
    python scripts/eval_tcm_retrieval.py --json
    python scripts/eval_tcm_retrieval.py ^
      --videos-path data/local-videos ^
      --compare-videos-path data/local-videos-legacy ^
      --label gemini ^
      --compare-label legacy
"""

from __future__ import annotations

import argparse
import contextlib
import io
import json
import statistics
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent
DEFAULT_VIDEOS_PATH = PROJECT_ROOT / "data" / "local-videos"
DEFAULT_BENCHMARK_FILE = SCRIPT_DIR / "tcm_retrieval_benchmark.json"

sys.path.insert(0, str(SCRIPT_DIR / "lib"))

from faiss_search import SearchResult, VideoSearcher


@dataclass(frozen=True)
class BenchmarkCase:
    case_id: str
    query: str
    expected_video_id: str
    expected_start: Optional[float] = None
    expected_end: Optional[float] = None
    acceptable_video_ids: tuple[str, ...] = ()
    notes: Optional[str] = None

    @property
    def expected_duration(self) -> Optional[float]:
        if self.expected_start is None or self.expected_end is None:
            return None
        return max(0.0, self.expected_end - self.expected_start)

    def matches_video(self, video_id: Optional[str]) -> bool:
        if not video_id:
            return False
        return video_id == self.expected_video_id or video_id in self.acceptable_video_ids


def interval_overlap(
    expected_start: float,
    expected_end: float,
    actual_start: float,
    actual_end: float,
) -> float:
    return max(0.0, min(expected_end, actual_end) - max(expected_start, actual_start))


def interval_coverage(
    expected_start: float,
    expected_end: float,
    actual_start: float,
    actual_end: float,
) -> float:
    expected_duration = max(0.0, expected_end - expected_start)
    if expected_duration == 0:
        return 0.0
    return interval_overlap(expected_start, expected_end, actual_start, actual_end) / expected_duration


def interval_iou(
    expected_start: float,
    expected_end: float,
    actual_start: float,
    actual_end: float,
) -> float:
    overlap = interval_overlap(expected_start, expected_end, actual_start, actual_end)
    union = max(expected_end, actual_end) - min(expected_start, actual_start)
    if union <= 0:
        return 0.0
    return overlap / union


def _result_interval_scores(case: BenchmarkCase, result: SearchResult) -> tuple[Optional[float], Optional[float], Optional[float]]:
    if case.expected_start is None or case.expected_end is None:
        return (None, None, None)

    coverage = interval_coverage(case.expected_start, case.expected_end, result.start, result.end)
    iou = interval_iou(case.expected_start, case.expected_end, result.start, result.end)
    duration_ratio = None
    if case.expected_duration and case.expected_duration > 0:
        duration_ratio = max(0.0, result.end - result.start) / case.expected_duration
    return (coverage, iou, duration_ratio)


def score_segment_results(case: BenchmarkCase, results: list[SearchResult]) -> dict:
    top1_video_hit = bool(results) and case.matches_video(results[0].video_id)
    top3_video_hit = any(case.matches_video(result.video_id) for result in results[:3])

    best_rank = None
    best_video_id = None
    best_score = None
    best_coverage = None
    best_iou = None
    best_duration_ratio = None
    best_clip_hit = False

    for index, result in enumerate(results, start=1):
        if not case.matches_video(result.video_id):
            continue
        coverage, iou, duration_ratio = _result_interval_scores(case, result)
        clip_hit = coverage is None or coverage > 0

        if best_rank is None:
            best_rank = index
            best_video_id = result.video_id
            best_score = result.score

        if clip_hit:
            best_clip_hit = True

        if best_coverage is None and coverage is not None:
            best_coverage = coverage
            best_iou = iou
            best_duration_ratio = duration_ratio
        elif coverage is not None and best_coverage is not None and coverage > best_coverage:
            best_coverage = coverage
            best_iou = iou
            best_duration_ratio = duration_ratio

    top1_video_id = results[0].video_id if results else None
    top1_score = results[0].score if results else None
    top1_start = results[0].start if results else None
    top1_end = results[0].end if results else None
    top1_coverage = None
    top1_iou = None
    top1_duration_ratio = None
    if results and case.matches_video(results[0].video_id):
        top1_coverage, top1_iou, top1_duration_ratio = _result_interval_scores(case, results[0])
    top1_clip_hit = top1_coverage is None or (top1_coverage is not None and top1_coverage > 0)
    top3_clip_hit = False
    for result in results[:3]:
        if not case.matches_video(result.video_id):
            continue
        coverage, _, _ = _result_interval_scores(case, result)
        if coverage is None or coverage > 0:
            top3_clip_hit = True
            break

    return {
        "top1Hit": top1_video_hit,
        "top3Hit": top3_video_hit,
        "top1VideoHit": top1_video_hit,
        "top3VideoHit": top3_video_hit,
        "top1ClipHit": top1_video_hit and top1_clip_hit,
        "top3ClipHit": top3_clip_hit,
        "bestClipHit": best_clip_hit,
        "top1VideoId": top1_video_id,
        "top1Score": top1_score,
        "top1Start": top1_start,
        "top1End": top1_end,
        "top1Coverage": top1_coverage,
        "top1IoU": top1_iou,
        "top1DurationRatio": top1_duration_ratio,
        "bestRank": best_rank,
        "bestVideoId": best_video_id,
        "bestScore": best_score,
        "bestCoverage": best_coverage,
        "bestIoU": best_iou,
        "bestDurationRatio": best_duration_ratio,
    }


def score_boundary_result(case: BenchmarkCase, result: Optional[SearchResult]) -> dict:
    if result is None:
        return {
            "hit": False,
            "videoHit": False,
            "clipHit": False,
            "videoId": None,
            "score": None,
            "start": None,
            "end": None,
            "coverage": None,
            "iou": None,
            "durationRatio": None,
        }

    coverage, iou, duration_ratio = (None, None, None)
    video_hit = case.matches_video(result.video_id)
    if video_hit:
        coverage, iou, duration_ratio = _result_interval_scores(case, result)
    clip_hit = video_hit and (coverage is None or coverage > 0)

    return {
        "hit": video_hit,
        "videoHit": video_hit,
        "clipHit": clip_hit,
        "videoId": result.video_id,
        "score": result.score,
        "start": result.start,
        "end": result.end,
        "coverage": coverage,
        "iou": iou,
        "durationRatio": duration_ratio,
    }


def _mean(values: list[Optional[float]]) -> Optional[float]:
    filtered = [value for value in values if value is not None]
    if not filtered:
        return None
    return statistics.fmean(filtered)


def aggregate_corpus_summary(
    label: str,
    videos_path: Path,
    case_results: list[dict],
    *,
    profiles: Optional[list[str]] = None,
) -> dict:
    cases = len(case_results)
    if cases == 0:
        raise ValueError("Cannot aggregate an empty benchmark run")

    return {
        "label": label,
        "videosPath": str(videos_path),
        "profiles": profiles or [],
        "cases": cases,
        "segmentTop1HitRate": sum(1 for item in case_results if item["segment"]["top1Hit"]) / cases,
        "segmentTop3HitRate": sum(1 for item in case_results if item["segment"]["top3Hit"]) / cases,
        "segmentTop1ClipHitRate": sum(1 for item in case_results if item["segment"]["top1ClipHit"]) / cases,
        "segmentTop3ClipHitRate": sum(1 for item in case_results if item["segment"]["top3ClipHit"]) / cases,
        "segmentClipHitRate": sum(1 for item in case_results if item["segment"]["bestClipHit"]) / cases,
        "boundaryHitRate": sum(1 for item in case_results if item["boundary"]["hit"]) / cases,
        "boundaryClipHitRate": sum(1 for item in case_results if item["boundary"]["clipHit"]) / cases,
        "segmentCoverageMean": _mean([item["segment"]["bestCoverage"] for item in case_results]),
        "segmentIoUMean": _mean([item["segment"]["bestIoU"] for item in case_results]),
        "boundaryCoverageMean": _mean([item["boundary"]["coverage"] for item in case_results]),
        "boundaryIoUMean": _mean([item["boundary"]["iou"] for item in case_results]),
        "boundaryDurationRatioMean": _mean([item["boundary"]["durationRatio"] for item in case_results]),
        "avgSearchMs": statistics.fmean(item["timings"]["searchMs"] for item in case_results),
        "avgBoundaryMs": statistics.fmean(item["timings"]["boundaryMs"] for item in case_results),
    }


def load_benchmark_cases(path: Path) -> list[BenchmarkCase]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    raw_cases = raw["cases"] if isinstance(raw, dict) else raw

    cases: list[BenchmarkCase] = []
    for index, item in enumerate(raw_cases, start=1):
        case_id = item.get("id") or f"case-{index}"
        query = item.get("query")
        expected_video_id = item.get("expectedVideoId")
        if not query or not expected_video_id:
            raise ValueError(f"Benchmark case {case_id} is missing required fields")

        cases.append(
            BenchmarkCase(
                case_id=case_id,
                query=query,
                expected_video_id=expected_video_id,
                expected_start=item.get("expectedStart"),
                expected_end=item.get("expectedEnd"),
                acceptable_video_ids=tuple(item.get("acceptableVideoIds", [])),
                notes=item.get("notes"),
            )
        )

    return cases


def evaluate_case(
    searcher: VideoSearcher,
    case: BenchmarkCase,
    *,
    top_k: int,
    similarity_threshold: float,
    max_extension_seconds: float,
    min_duration_seconds: float,
    suppress_boundary_debug: bool,
) -> dict:
    search_started_at = time.perf_counter()
    segment_results = searcher.search(case.query, top_k=top_k)
    search_ms = (time.perf_counter() - search_started_at) * 1000

    boundary_started_at = time.perf_counter()
    if suppress_boundary_debug:
        with contextlib.redirect_stderr(io.StringIO()):
            boundary_result = searcher.search_with_boundary(
                case.query,
                similarity_threshold=similarity_threshold,
                max_extension_seconds=max_extension_seconds,
                min_duration_seconds=min_duration_seconds,
            )
    else:
        boundary_result = searcher.search_with_boundary(
            case.query,
            similarity_threshold=similarity_threshold,
            max_extension_seconds=max_extension_seconds,
            min_duration_seconds=min_duration_seconds,
        )
    boundary_ms = (time.perf_counter() - boundary_started_at) * 1000

    return {
        "id": case.case_id,
        "query": case.query,
        "expectedVideoId": case.expected_video_id,
        "expectedStart": case.expected_start,
        "expectedEnd": case.expected_end,
        "notes": case.notes,
        "segment": score_segment_results(case, segment_results),
        "boundary": score_boundary_result(case, boundary_result),
        "timings": {
            "searchMs": round(search_ms, 2),
            "boundaryMs": round(boundary_ms, 2),
        },
    }


def evaluate_corpus(
    label: str,
    videos_path: Path,
    cases: list[BenchmarkCase],
    *,
    top_k: int,
    similarity_threshold: float,
    max_extension_seconds: float,
    min_duration_seconds: float,
    suppress_boundary_debug: bool,
) -> dict:
    searcher = VideoSearcher(videos_path)
    if not searcher.indexes:
        raise RuntimeError(f"No FAISS indexes were loaded from {videos_path}")

    case_results = [
        evaluate_case(
            searcher,
            case,
            top_k=top_k,
            similarity_threshold=similarity_threshold,
            max_extension_seconds=max_extension_seconds,
            min_duration_seconds=min_duration_seconds,
            suppress_boundary_debug=suppress_boundary_debug,
        )
        for case in cases
    ]

    return {
        "summary": aggregate_corpus_summary(
            label,
            videos_path,
            case_results,
            profiles=list(searcher.available_profiles),
        ),
        "cases": case_results,
    }


def print_corpus_report(report: dict) -> None:
    summary = report["summary"]
    print(f"\nCorpus: {summary['label']}")
    print(f"Path:   {summary['videosPath']}")
    if summary.get("profiles"):
        print(f"Profiles: {', '.join(summary['profiles'])}")
    print(f"Cases:  {summary['cases']}")
    print(f"Segment top-1 video hit: {summary['segmentTop1HitRate']:.1%}")
    print(f"Segment top-3 video hit: {summary['segmentTop3HitRate']:.1%}")
    print(f"Segment top-1 clip hit:  {summary['segmentTop1ClipHitRate']:.1%}")
    print(f"Segment top-3 clip hit:  {summary['segmentTop3ClipHitRate']:.1%}")
    print(f"Boundary video hit:      {summary['boundaryHitRate']:.1%}")
    print(f"Boundary clip hit:       {summary['boundaryClipHitRate']:.1%}")

    if summary["segmentCoverageMean"] is not None:
        print(f"Segment coverage:  {summary['segmentCoverageMean']:.3f}")
    if summary["segmentIoUMean"] is not None:
        print(f"Segment IoU:       {summary['segmentIoUMean']:.3f}")
    if summary["boundaryCoverageMean"] is not None:
        print(f"Boundary coverage: {summary['boundaryCoverageMean']:.3f}")
    if summary["boundaryIoUMean"] is not None:
        print(f"Boundary IoU:      {summary['boundaryIoUMean']:.3f}")
    if summary["boundaryDurationRatioMean"] is not None:
        print(f"Boundary duration: {summary['boundaryDurationRatioMean']:.2f}x expected")

    print(f"Avg search latency:   {summary['avgSearchMs']:.2f} ms")
    print(f"Avg boundary latency: {summary['avgBoundaryMs']:.2f} ms")

    misses = [
        item
        for item in report["cases"]
        if not item["segment"]["top1ClipHit"] or not item["boundary"]["clipHit"]
    ]
    if misses:
        print("\nMisses:")
        for item in misses[:8]:
            print(
                f"- {item['id']}: segment={item['segment']['top1VideoId']} "
                f"boundary={item['boundary']['videoId']} expected={item['expectedVideoId']}"
            )


def print_comparison(primary: dict, secondary: dict) -> None:
    a = primary["summary"]
    b = secondary["summary"]

    def render_delta(key: str, percent: bool = False) -> str:
        a_value = a.get(key)
        b_value = b.get(key)
        if a_value is None or b_value is None:
            return "n/a"
        delta = a_value - b_value
        if percent:
            return f"{a_value:.1%} vs {b_value:.1%} (delta {delta:+.1%})"
        return f"{a_value:.3f} vs {b_value:.3f} (delta {delta:+.3f})"

    print("\nComparison:")
    print(f"- Segment top-1 video: {render_delta('segmentTop1HitRate', percent=True)}")
    print(f"- Segment top-3 video: {render_delta('segmentTop3HitRate', percent=True)}")
    print(f"- Segment top-1 clip:  {render_delta('segmentTop1ClipHitRate', percent=True)}")
    print(f"- Segment top-3 clip:  {render_delta('segmentTop3ClipHitRate', percent=True)}")
    print(f"- Boundary video:      {render_delta('boundaryHitRate', percent=True)}")
    print(f"- Boundary clip:       {render_delta('boundaryClipHitRate', percent=True)}")
    print(f"- Segment cov:   {render_delta('segmentCoverageMean')}")
    print(f"- Boundary cov:  {render_delta('boundaryCoverageMean')}")
    print(f"- Boundary IoU:  {render_delta('boundaryIoUMean')}")
    print(f"- Avg search ms: {a['avgSearchMs']:.2f} vs {b['avgSearchMs']:.2f} (delta {a['avgSearchMs'] - b['avgSearchMs']:+.2f})")
    print(f"- Avg bound ms:  {a['avgBoundaryMs']:.2f} vs {b['avgBoundaryMs']:.2f} (delta {a['avgBoundaryMs'] - b['avgBoundaryMs']:+.2f})")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Benchmark TCM retrieval quality")
    parser.add_argument("--benchmark-file", type=Path, default=DEFAULT_BENCHMARK_FILE)
    parser.add_argument("--videos-path", type=Path, default=DEFAULT_VIDEOS_PATH)
    parser.add_argument("--label", default="primary")
    parser.add_argument("--compare-videos-path", type=Path)
    parser.add_argument("--compare-label", default="comparison")
    parser.add_argument("--top-k", type=int, default=3)
    parser.add_argument("--boundary-similarity-threshold", type=float, default=0.4)
    parser.add_argument("--boundary-max-extension-seconds", type=float, default=300.0)
    parser.add_argument("--boundary-min-duration-seconds", type=float, default=60.0)
    parser.add_argument("--show-boundary-debug", action="store_true")
    parser.add_argument("--json", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    cases = load_benchmark_cases(args.benchmark_file)

    primary = evaluate_corpus(
        args.label,
        args.videos_path,
        cases,
        top_k=args.top_k,
        similarity_threshold=args.boundary_similarity_threshold,
        max_extension_seconds=args.boundary_max_extension_seconds,
        min_duration_seconds=args.boundary_min_duration_seconds,
        suppress_boundary_debug=not args.show_boundary_debug,
    )

    comparison = None
    if args.compare_videos_path:
        comparison = evaluate_corpus(
            args.compare_label,
            args.compare_videos_path,
            cases,
            top_k=args.top_k,
            similarity_threshold=args.boundary_similarity_threshold,
            max_extension_seconds=args.boundary_max_extension_seconds,
            min_duration_seconds=args.boundary_min_duration_seconds,
            suppress_boundary_debug=not args.show_boundary_debug,
        )

    if args.json:
        payload = {"primary": primary}
        if comparison is not None:
            payload["comparison"] = comparison
        print(json.dumps(payload, indent=2))
        return 0

    print_corpus_report(primary)
    if comparison is not None:
        print_corpus_report(comparison)
        print_comparison(primary, comparison)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
