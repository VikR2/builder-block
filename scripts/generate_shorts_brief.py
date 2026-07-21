#!/usr/bin/env python3
"""
Generate educational shorts briefs from existing lesson artifacts.

This stage sits after lesson generation and produces a single, transformed,
chart-led teaching brief for a 30-second vertical short. Source footage is
treated as reference material only; final visuals must be newly produced.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any


TARGET_DURATION_SEC = 30
SHORT_STRUCTURE = [
    {"beat": "hook", "startTime": 0, "endTime": 3, "goal": "Introduce the concept or the misconception."},
    {"beat": "context", "startTime": 3, "endTime": 8, "goal": "Define the setup and the chart condition."},
    {"beat": "explain", "startTime": 8, "endTime": 20, "goal": "Teach what to mark and what confirmation matters."},
    {"beat": "contrast", "startTime": 20, "endTime": 26, "goal": "Show the common mistake or invalid read."},
    {"beat": "rule", "startTime": 26, "endTime": 30, "goal": "End on the one rule to remember."},
]

EDITORIAL_RULES = [
    "one concept per clip",
    "no trade callouts",
    "no PnL or look-how-much-this-made framing",
    "no urgency or hype language",
    "no original source footage in final output",
]

VISUAL_NOTES = [
    "Primary canvas is a rebuilt chart scene in 9:16, not a cropped source recording.",
    "Use one annotation layer at a time so the concept stays readable with audio off.",
    "Keep source footage reference-only; any chart shown in the short must be newly recreated.",
    "Nano Banana Pro can support intro textures and transition metaphors, but not analytical chart logic.",
]

QA_CHECKLIST = [
    "Clip teaches exactly one trading concept and one decision rule.",
    "Final runtime stays within 25 to 35 seconds.",
    "All visuals are newly produced; no original source footage appears.",
    "Captions are concise, readable, and understandable with audio off.",
    "Script contains no CTA, no hype, and no trade-performance framing.",
    "Trading logic matches the source lesson meaning before publish.",
]

PREFERRED_ENDINGS = (
    "The rule is",
    "This matters because",
    "If this part is missing",
)


def load_json(path: Path) -> Any:
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


def normalize_whitespace(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").replace("\r\n", "\n")).strip()


def format_timestamp(seconds: float) -> str:
    total_seconds = max(0, int(seconds))
    hours = total_seconds // 3600
    minutes = (total_seconds % 3600) // 60
    secs = total_seconds % 60
    if hours > 0:
        return f"{hours}:{minutes:02d}:{secs:02d}"
    return f"{minutes}:{secs:02d}"


def slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", normalize_whitespace(text).lower()).strip("-")


def clean_sentence(text: str) -> str:
    normalized = normalize_whitespace(text)
    normalized = normalized.rstrip(".!? ")
    return normalized


def split_sentences(text: str) -> list[str]:
    normalized = normalize_whitespace(text)
    if not normalized:
        return []
    return [
        sentence.strip()
        for sentence in re.split(r"(?<=[.!?])\s+", normalized)
        if sentence.strip()
    ]


def compact_caption(text: str, max_words: int = 10) -> str:
    words = normalize_whitespace(text).split()
    if len(words) <= max_words:
        return " ".join(words)
    return " ".join(words[:max_words]).rstrip(",.;:") + "..."


def resolve_section_window(section: dict[str, Any], video_duration_sec: float | None) -> tuple[float, float]:
    start_time = float(section.get("startTime", section.get("timestamp", 0)))
    end_time = float(section.get("endTime", start_time + 60))

    if end_time <= start_time:
        end_time = start_time + 60

    if video_duration_sec and video_duration_sec > 0:
        max_end = min(video_duration_sec, start_time + 90)
        min_end = min(video_duration_sec, start_time + 30)
    else:
        max_end = start_time + 90
        min_end = start_time + 30

    end_time = min(end_time, max_end)
    if end_time < min_end:
        end_time = min_end

    return start_time, end_time


def build_frame_path(frame: dict[str, Any]) -> str:
    if frame.get("frame_path"):
        return str(frame["frame_path"])
    if frame.get("path"):
        return str(frame["path"])
    if frame.get("file"):
        return f"frames/{frame['file']}"
    return ""


def score_section(
    section: dict[str, Any],
    manifest: dict[str, Any],
    recommended_titles: set[str],
) -> float:
    video_duration_sec = float(manifest.get("video_duration_sec", 0) or 0)
    start_time, end_time = resolve_section_window(section, video_duration_sec)
    duration = end_time - start_time
    raw_start_time = float(section.get("startTime", section.get("timestamp", 0)))
    raw_end_time = float(section.get("endTime", raw_start_time + 60))
    raw_duration = raw_end_time - raw_start_time
    score = 0.0

    if 30 <= duration <= 120:
        score += 100
    elif 20 <= duration < 30 or 120 < duration <= 180:
        score += 60
    else:
        score += 10

    if raw_duration > 180:
        score -= 80

    if normalize_whitespace(section.get("summary", "")):
        score += 25
    if normalize_whitespace(section.get("transcriptExcerpt", "")):
        score += 15

    title = clean_sentence(section.get("title", "")).lower()
    if title in recommended_titles:
        score += 10

    return score


def choose_primary_section(
    lesson: dict[str, Any],
    manifest: dict[str, Any],
    concept_title: str | None = None,
) -> dict[str, Any]:
    sections = lesson.get("sections", [])
    if not sections:
        recommended = lesson.get("recommendedMoments", [])
        fallback_title = "Core Trading Concept"
        fallback_timestamp = 0.0
        fallback_label = "0:00"

        if recommended:
            fallback_title = normalize_whitespace(recommended[0].get("title", "")) or fallback_title
            fallback_timestamp = float(recommended[0].get("timestamp", 0))
            fallback_label = normalize_whitespace(recommended[0].get("timestampLabel", "")) or format_timestamp(fallback_timestamp)
        elif lesson.get("keyTakeaways"):
            fallback_title = normalize_whitespace(lesson["keyTakeaways"][0])[:80] or fallback_title

        summary = normalize_whitespace(lesson.get("summary", ""))
        return {
            "title": fallback_title,
            "timestamp": fallback_timestamp,
            "timestampLabel": fallback_label,
            "startTime": fallback_timestamp,
            "endTime": fallback_timestamp + 60,
            "summary": summary,
            "citation": f"{normalize_whitespace(lesson.get('videoTitle', 'Lesson'))} @ {fallback_label}",
            "transcriptExcerpt": summary,
        }

    if concept_title:
        wanted = clean_sentence(concept_title).lower()
        for section in sections:
            if clean_sentence(section.get("title", "")).lower() == wanted:
                return section

    recommended_titles = {
        clean_sentence(moment.get("title", "")).lower()
        for moment in lesson.get("recommendedMoments", [])
        if clean_sentence(moment.get("title", ""))
    }

    scored_sections = [
        (score_section(section, manifest, recommended_titles), index, section)
        for index, section in enumerate(sections)
    ]
    scored_sections.sort(key=lambda item: (-item[0], item[1]))
    return scored_sections[0][2]


def extract_transcript_window(transcript_segments: list[dict[str, Any]], start_time: float, end_time: float) -> str:
    relevant = [
        normalize_whitespace(segment.get("text", ""))
        for segment in transcript_segments
        if float(segment.get("start", 0)) < end_time and float(segment.get("end", 0)) >= start_time
    ]
    return normalize_whitespace(" ".join(chunk for chunk in relevant if chunk))


def find_chart_reference_frames(manifest: dict[str, Any], start_time: float, end_time: float) -> list[dict[str, Any]]:
    frames = manifest.get("frames", [])
    if not frames:
        return []

    in_window = [frame for frame in frames if start_time <= float(frame.get("timestamp_sec", 0)) <= end_time]
    midpoint = (start_time + end_time) / 2
    ordered = sorted(frames, key=lambda frame: abs(float(frame.get("timestamp_sec", 0)) - midpoint))
    if not in_window:
        in_window = ordered[:3]
    elif len(in_window) < 2:
        chosen = {id(frame) for frame in in_window}
        for frame in ordered:
            if id(frame) in chosen:
                continue
            in_window.append(frame)
            if len(in_window) >= 3:
                break

    in_window = sorted(in_window, key=lambda frame: float(frame.get("timestamp_sec", 0)))
    purposes = ["setup context", "concept frame", "confirmation frame"]

    selected: list[dict[str, Any]] = []
    for index, frame in enumerate(in_window[:3]):
        selected.append({
            "timestamp": int(float(frame.get("timestamp_sec", 0))),
            "timestampLabel": str(frame.get("timestamp_str") or format_timestamp(float(frame.get("timestamp_sec", 0)))),
            "framePath": build_frame_path(frame),
            "purpose": purposes[min(index, len(purposes) - 1)],
            "transcriptSegment": normalize_whitespace(frame.get("transcript_segment", "")),
        })

    return selected


def infer_teaching_goal(concept_name: str, summary: str) -> str:
    return (
        f"Teach traders what {concept_name.lower()} looks like on the chart, "
        f"what confirmation makes it actionable, and how to avoid the most common misread."
    )


def infer_misconception(concept_name: str, summary: str, transcript_excerpt: str) -> str:
    lowered = f"{summary} {transcript_excerpt}".lower()
    if "liquidity only exists after" in lowered or "once orders are matched" in lowered:
        return (
            "Traders often label a price area as liquidity before orders there have actually been matched."
        )
    if "close" in lowered and ("confirm" in lowered or "confirmation" in lowered):
        return (
            f"Traders often treat {concept_name.lower()} as valid too early and ignore "
            "the closing confirmation that proves the read."
        )
    if "range" in lowered:
        return (
            f"Traders often see {concept_name.lower()} and assume an immediate reversal, "
            "when the range itself is only context."
        )
    return (
        f"Traders often recognize {concept_name.lower()} on chart but skip the context "
        "that tells them whether the concept is actually valid."
    )


def infer_core_rule(concept_name: str, summary: str) -> str:
    summary_sentence = clean_sentence(summary)
    lowered = summary_sentence.lower()
    if "liquidity only exists after" in lowered or "once orders are matched" in lowered:
        return "The rule is a price level only becomes real liquidity after orders are matched there."
    if "overlap" in lowered and "submission range" in lowered and "matching window" in lowered:
        return "The rule is the book is the overlap between the submission range and the matching window."
    if lowered.startswith("a "):
        return f"The rule is {lowered}."
    if " only " in lowered or lowered.startswith("only "):
        return f"The rule is {lowered}."
    return (
        f"The rule is treat {concept_name.lower()} as actionable only when the chart confirms "
        "the shift you are trying to teach."
    )


def build_voiceover_script(
    concept_name: str,
    summary: str,
    transcript_excerpt: str,
    misconception: str,
    core_rule: str,
) -> list[dict[str, Any]]:
    summary_sentences = split_sentences(summary)
    transcript_sentences = split_sentences(transcript_excerpt)
    context_line = (
        summary_sentences[0]
        if summary_sentences
        else f"{concept_name} starts with the setup forming, not with the trade already confirmed."
    )
    explain_line = (
        summary_sentences[1]
        if len(summary_sentences) > 1
        else transcript_sentences[0]
        if transcript_sentences
        else f"Mark the range, track the level that matters, and wait for the confirmation that tells you the {concept_name.lower()} is real."
    )
    beats = [
        {
            "beat": "hook",
            "startTime": 0,
            "endTime": 3,
            "text": misconception,
        },
        {
            "beat": "context",
            "startTime": 3,
            "endTime": 8,
            "text": context_line,
        },
        {
            "beat": "explain",
            "startTime": 8,
            "endTime": 20,
            "text": explain_line,
        },
        {
            "beat": "contrast",
            "startTime": 20,
            "endTime": 26,
            "text": (
                "The common mistake is acting before the condition that proves the idea is actually there."
            ),
        },
        {
            "beat": "rule",
            "startTime": 26,
            "endTime": 30,
            "text": core_rule,
        },
    ]
    return beats


def build_caption_lines(voiceover_script: list[dict[str, Any]]) -> list[dict[str, Any]]:
    captions = [
        (
            segment["startTime"],
            segment["endTime"],
            compact_caption(segment["text"].replace("The rule is ", "").rstrip(".")),
        )
        for segment in voiceover_script
    ]
    return [
        {"startTime": start, "endTime": end, "text": compact_caption(text)}
        for start, end, text in captions
    ]


def build_gen_visual_prompts(concept_name: str) -> list[str]:
    return [
        (
            f"Vertical 9:16 intro texture for an educational trading short about {concept_name.lower()}, "
            "deep charcoal background, subtle gold and teal linework, abstract market energy, no candlesticks, "
            "no chart axes, no human figure, premium editorial style."
        ),
        (
            f"Minimal transition card for {concept_name.lower()}, geometric range lines, muted finance palette, "
            "clean cinematic lighting, text-free, no actual chart data, suitable for a high-end educational short."
        ),
        (
            "Abstract branded background for a trading concept replay, soft grid texture, restrained motion cues, "
            "no indicators, no pricing numbers, no candles, built for captions and chart overlays."
        ),
    ]


def write_storyboard_markdown(video_dir: Path, brief: dict[str, Any]) -> Path:
    lines = [
        f"# Storyboard: {brief['conceptName']}",
        "",
        f"- Video: {brief['videoTitle']}",
        f"- Source citation: {brief['citation']}",
        f"- Teaching goal: {brief['teachingGoal']}",
        f"- Misconception: {brief['misconception']}",
        f"- Core rule: {brief['coreRule']}",
        "",
        "## Beats",
        "",
    ]

    for segment in brief["voiceoverScript"]:
        lines.extend([
            f"### {segment['beat'].title()} ({segment['startTime']}s-{segment['endTime']}s)",
            segment["text"],
            "",
        ])

    lines.extend([
        "## Chart Reference Frames",
        "",
    ])

    for frame in brief["chartReferenceFrames"]:
        lines.append(
            f"- {frame['timestampLabel']} — {frame['purpose']} — {frame['framePath']}"
        )

    lines.extend([
        "",
        "## Editorial Rules",
        "",
    ])
    lines.extend([f"- {rule}" for rule in brief["editorialRules"]])

    storyboard_path = video_dir / "storyboard.md"
    storyboard_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return storyboard_path


def build_shorts_brief(video_dir: Path, concept_title: str | None = None) -> dict[str, Any]:
    lesson_path = video_dir / "lesson.json"
    manifest_path = video_dir / "manifest.json"
    transcript_path = video_dir / "transcript_timed.json"

    if not lesson_path.exists():
        raise FileNotFoundError(f"lesson.json not found in {video_dir}")
    if not manifest_path.exists():
        raise FileNotFoundError(f"manifest.json not found in {video_dir}")
    if not transcript_path.exists():
        raise FileNotFoundError(f"transcript_timed.json not found in {video_dir}")

    lesson = load_json(lesson_path)
    manifest = load_json(manifest_path)
    transcript_segments = load_json(transcript_path)

    section = choose_primary_section(lesson, manifest, concept_title=concept_title)
    concept_name = normalize_whitespace(section.get("title", "")) or "Trading Concept"
    video_duration_sec = float(manifest.get("video_duration_sec", 0) or 0)
    start_time, end_time = resolve_section_window(section, video_duration_sec)
    summary = normalize_whitespace(section.get("summary", ""))
    transcript_excerpt = normalize_whitespace(section.get("transcriptExcerpt", ""))
    transcript_window = extract_transcript_window(transcript_segments, start_time, end_time)

    teaching_goal = infer_teaching_goal(concept_name, summary)
    misconception = infer_misconception(concept_name, summary, transcript_excerpt or transcript_window)
    core_rule = infer_core_rule(concept_name, summary)
    voiceover_script = build_voiceover_script(
        concept_name,
        summary,
        transcript_excerpt or transcript_window,
        misconception,
        core_rule,
    )
    caption_lines = build_caption_lines(voiceover_script)
    chart_reference_frames = find_chart_reference_frames(manifest, start_time, end_time)

    return {
        "videoId": lesson.get("videoId", video_dir.name),
        "videoTitle": lesson.get("videoTitle") or manifest.get("source_title") or video_dir.name,
        "generatedAt": lesson.get("generatedAt"),
        "objective": "educational-trading-concept-short",
        "targetDurationSec": TARGET_DURATION_SEC,
        "orientation": "9:16",
        "allNewVisuals": True,
        "sourceFootagePolicy": "reference-only",
        "structure": SHORT_STRUCTURE,
        "editorialRules": EDITORIAL_RULES,
        "briefId": f"{slugify(concept_name)}-{format_timestamp(start_time).replace(':', '-')}",
        "conceptName": concept_name,
        "teachingGoal": teaching_goal,
        "misconception": misconception,
        "coreRule": core_rule,
        "sourceSection": {
            "title": concept_name,
            "timestamp": start_time,
            "timestampLabel": section.get("timestampLabel") or format_timestamp(start_time),
            "startTime": start_time,
            "endTime": end_time,
        },
        "citation": normalize_whitespace(section.get("citation", "")),
        "summary": summary,
        "transcriptExcerpt": transcript_excerpt or transcript_window,
        "voiceoverScript": voiceover_script,
        "captionLines": caption_lines,
        "chartReferenceFrames": chart_reference_frames,
        "visualNotes": VISUAL_NOTES,
        "genVisualPrompts": build_gen_visual_prompts(concept_name),
        "qaChecklist": QA_CHECKLIST,
        "preferredEndings": list(PREFERRED_ENDINGS),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate shorts_brief.json for a processed video lesson")
    parser.add_argument("--video-dir", type=Path, required=True, help="Video directory containing lesson artifacts")
    parser.add_argument("--concept-title", help="Optional concept title to force a specific lesson section")
    parser.add_argument("--json", action="store_true", help="Emit summary as JSON")
    args = parser.parse_args()

    brief = build_shorts_brief(args.video_dir, concept_title=args.concept_title)
    brief_path = args.video_dir / "shorts_brief.json"
    with open(brief_path, "w", encoding="utf-8") as handle:
        json.dump(brief, handle, indent=2)

    storyboard_path = write_storyboard_markdown(args.video_dir, brief)

    if args.json:
        print(json.dumps({
            "status": "success",
            "briefPath": str(brief_path),
            "storyboardPath": str(storyboard_path),
            "conceptName": brief.get("conceptName"),
            "targetDurationSec": brief.get("targetDurationSec"),
            "allNewVisuals": brief.get("allNewVisuals"),
        }))
    else:
        print(f"Shorts brief written to {brief_path}")
        print(f"Storyboard written to {storyboard_path}")


if __name__ == "__main__":
    main()
