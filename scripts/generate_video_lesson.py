#!/usr/bin/env python3
"""
Generate lesson.json artifacts for processed local videos.

The lesson pipeline is intentionally hybrid:
- deterministically clean transcript/study-material inputs
- optionally use Anthropic to rewrite them into teaching language
- validate the result and fall back to deterministic notes when needed
"""

from __future__ import annotations

import argparse
import json
import os
import re
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any


SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent
ARCHITECTURES_DIR = PROJECT_ROOT / "data" / "architectures"
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY")
LESSON_MODEL = os.environ.get("TCM_LESSON_MODEL", "claude-3-5-haiku-latest")
LESSON_MAX_SECTIONS = 6

STOP_WORDS = {
    "a", "about", "after", "all", "an", "and", "any", "are", "as", "at", "be", "been",
    "but", "by", "can", "do", "for", "from", "go", "going", "got", "had", "has", "have",
    "how", "i", "if", "in", "into", "is", "it", "its", "just", "know", "like", "look",
    "me", "my", "no", "of", "ok", "okay", "on", "or", "our", "out", "really", "right",
    "say", "so", "that", "the", "then", "there", "they", "this", "to", "up", "want",
    "was", "we", "well", "what", "when", "where", "which", "with", "yeah", "you", "your",
}

FILLER_WORDS = {
    "all", "right", "alright", "okay", "ok", "well", "like", "you", "know", "um", "uh",
    "yeah", "so", "look", "thank", "thanks", "beautiful", "cool", "go", "ahead",
}

FILLER_PREFIX_RE = re.compile(
    r"^(?:(?:all\s+right|alright|okay|ok|well|um|uh|yeah|so|look|you\s+know|thank\s+you|thanks|go\s+ahead|let'?s\s+go)"
    r"[\s,.;:!-]*)+",
    re.IGNORECASE,
)

LOW_SIGNAL_PREFIXES = (
    "all right",
    "alright",
    "okay",
    "ok",
    "you know",
    "so",
    "well",
    "um",
    "uh",
)

SUPPRESSED_SECTION_HEADINGS = {
    "overview",
    "skills to extract",
    "relationship to existing tcm skills",
    "summary",
    "key quotes",
    "implementation notes for indicator",
    "formula:",
}

DOMAIN_KEYWORDS = {
    "submission", "range", "matching", "window", "book", "liquidity", "matched",
    "unmatched", "fill", "filled", "distribution", "bias", "eq", "equilibrium",
    "gap", "gaps", "deviation", "continuation", "reversal", "delivery", "orders",
}

FALLBACK_SECTION_LABELS = [
    ("Submission Range and Matching Window", {"submission", "matching", "window", "range"}),
    ("Book Formation and Liquidity", {"book", "liquidity", "matched"}),
    ("Matched vs Unmatched Orders", {"matched", "unmatched", "orders", "gap"}),
    ("Bias and Delivery", {"bias", "delivery", "continuation", "reversal"}),
    ("Fill Logic and Objectives", {"fill", "filled", "distribution", "equilibrium", "eq"}),
]

SECTION_TITLE_REWRITES = {
    "the book metaphor": "Book Formation and Liquidity",
    "order lifecycle (4 steps)": "Submission, Matching, Filling, and Distribution",
    "key insight: liquidity only after matching": "Liquidity Exists Only After Matching",
    "step 1: find the book (overlap)": "Submission Range and Matching Window Overlap",
    "step 2: identify levels from the book": "High, Low, and EQ from the Book",
    "step 3: determine liquidity type": "Matched Orders Define Liquidity Direction",
    "unmatched orders (gap days)": "Unmatched Orders Create Gap-Fill Obligations",
    "the 3-step analysis process": "Three-Step Daily Book Analysis",
    "practical rules": "Close Confirmation and Continuation Rules",
    "deviation levels technique": "Deviation Levels from Unmatched Orders",
    "dlp (designated liquidity provider) insight": "How Liquidity Providers Build the Book",
}

CONCEPT_SUMMARY_TEMPLATES = {
    "Book Formation and Liquidity": (
        "Matched buy and sell orders create the book. Once orders are matched, that zone becomes real liquidity "
        "that price can revisit and fill."
    ),
    "Submission, Matching, Filling, and Distribution": (
        "Orders move through submission, matching, filling, and distribution. Liquidity only exists after "
        "submission has progressed into matching."
    ),
    "Liquidity Exists Only After Matching": (
        "A submitted level is not liquidity by itself. Liquidity appears only when a counterparty matches the order "
        "and places it on the book."
    ),
    "Submission Range and Matching Window Overlap": (
        "The book is the overlap between the submission range and the matching window. Start by marking that overlap, "
        "because it defines the matched zone that matters."
    ),
    "High, Low, and EQ from the Book": (
        "Once the book is defined, its high, low, and EQ become the reference levels for later reactions, sweeps, "
        "and objectives."
    ),
    "Matched Orders Define Liquidity Direction": (
        "When price moves away after matching, the profitable side protects that position. That tells you whether the "
        "next meaningful liquidity sits above or below the book."
    ),
    "Unmatched Orders Create Gap-Fill Obligations": (
        "When the matching window does not overlap submission, the gap leaves orders unfilled. Price often returns to "
        "fill that imbalance before continuing."
    ),
    "Three-Step Daily Book Analysis": (
        "Each session starts with the same routine: find the book, project it into the field window, and then decide "
        "bias from liquidity location and objective alignment."
    ),
    "Close Confirmation and Continuation Rules": (
        "A sweep by itself is not enough for reversal. Wait for a confirming close or accept that continuation may "
        "still be active."
    ),
    "Deviation Levels from Unmatched Orders": (
        "Use the submission range to project deviation targets from the gap. Those projected bands help define likely "
        "expansion and rebalance objectives."
    ),
    "How Liquidity Providers Build the Book": (
        "Liquidity providers make money by filling and hedging orders across time. Thinking like the book builder helps "
        "explain why price returns to certain zones."
    ),
}

GLOSSARY_DEFINITIONS = {
    "Submission Range": (
        "The time window where larger orders are placed before the market proves which prices were actually matched."
    ),
    "Matching Window": (
        "The later session that trades back through submitted prices and turns valid overlap into real liquidity."
    ),
    "Book": (
        "The matched zone where buyers and sellers actually paired off, giving you a usable high, low, and EQ."
    ),
    "Liquidity": (
        "Executable resting interest that becomes meaningful only after submitted orders have been matched."
    ),
    "Matched Orders": (
        "Orders that found counterparties and now sit on the book as fillable liquidity."
    ),
    "Unmatched Orders": (
        "Orders that were submitted but never paired off, often leaving unfinished business the market may revisit."
    ),
    "Bias": (
        "The directional read that comes from combining the key level with the kind of delivery price shows there."
    ),
    "Delivery": (
        "How price behaves at a level, such as sweeping and rejecting or running through and continuing."
    ),
    "EQ": (
        "The equilibrium or midpoint of the book, used as an internal reference for balance and rebalancing."
    ),
    "Fill": (
        "The process of price returning to trade through matched or unfinished liquidity."
    ),
}


def format_timestamp(seconds: float) -> str:
    total_seconds = max(0, int(seconds))
    hours = total_seconds // 3600
    minutes = (total_seconds % 3600) // 60
    secs = total_seconds % 60
    if hours > 0:
        return f"{hours}:{minutes:02d}:{secs:02d}"
    return f"{minutes}:{secs:02d}"


def load_json(path: Path) -> Any:
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


def normalize_whitespace(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").replace("\r\n", "\n")).strip()


def clean_transcript_text(text: str) -> str:
    normalized = normalize_whitespace(text)
    if not normalized:
        return ""

    stripped = FILLER_PREFIX_RE.sub("", normalized).strip(" ,.;:-")
    if len(stripped) >= 30:
        normalized = stripped

    normalized = re.sub(r"\b([A-Za-z]{2,})(?:\s+\1\b){1,}", r"\1", normalized, flags=re.IGNORECASE)
    normalized = re.sub(r"\b([A-Za-z]+)\s*,\s*\1\b", r"\1", normalized, flags=re.IGNORECASE)
    normalized = re.sub(r"\s+([,.;:!?])", r"\1", normalized)
    normalized = re.sub(r"([,.;:!?]){2,}", r"\1", normalized)

    if normalized:
        normalized = normalized[0].upper() + normalized[1:]
    return normalized.strip()


def split_sentences(text: str) -> list[str]:
    normalized = normalize_whitespace(text)
    if not normalized:
        return []
    return [part.strip() for part in re.split(r"(?<=[.!?])\s+", normalized) if part.strip()]


def summarize_text(text: str, limit: int = 220) -> str:
    sentences = split_sentences(clean_transcript_text(text))
    if not sentences:
        compact = clean_transcript_text(text)
        if len(compact) <= limit:
            return compact
        return compact[: limit - 3].rstrip() + "..."

    summary = ""
    for sentence in sentences:
        candidate = sentence if not summary else f"{summary} {sentence}"
        if len(candidate) > limit:
            break
        summary = candidate

    if summary:
        return summary

    compact = clean_transcript_text(text)
    return compact[: limit - 3].rstrip() + "..."


def dedupe_text_items(items: list[str], limit: int | None = None) -> list[str]:
    seen: set[str] = set()
    results: list[str] = []

    for item in items:
        normalized = normalize_whitespace(item)
        if not normalized:
            continue

        lowered = normalized.lower()
        if lowered in seen:
            continue

        seen.add(lowered)
        results.append(normalized)

        if limit is not None and len(results) >= limit:
            break

    return results


def tokenize(text: str) -> set[str]:
    return {
        token
        for token in re.findall(r"[a-z0-9]+", normalize_whitespace(text).lower())
        if len(token) > 2 and token not in STOP_WORDS
    }


def filler_ratio(text: str) -> float:
    tokens = re.findall(r"[a-z0-9]+", normalize_whitespace(text).lower())
    if not tokens:
        return 1.0
    filler_count = sum(1 for token in tokens if token in FILLER_WORDS)
    return filler_count / len(tokens)


def is_low_signal(text: str) -> bool:
    normalized = normalize_whitespace(text).lower()
    if len(normalized) < 30:
        return True
    if normalized.startswith(LOW_SIGNAL_PREFIXES):
        return True
    return filler_ratio(normalized) > 0.22


def clean_study_material_text(text: str) -> str:
    without_code = re.sub(r"```[\s\S]*?```", " ", text)
    without_emphasis = re.sub(r"[*_`#]+", "", without_code)
    without_quotes = re.sub(r"^\s*>\s*", "", without_emphasis, flags=re.MULTILINE)
    merged_colons = re.sub(r":\s*\n\s*", ": ", without_quotes)
    normalized_arrows = merged_colons.replace("→", " to ").replace("|", " ")
    normalized_lists = re.sub(r"^\s*[-*]\s+", "", normalized_arrows, flags=re.MULTILINE)
    normalized_lists = re.sub(r"^\s*\d+\.\s+", "", normalized_lists, flags=re.MULTILINE)
    normalized_lists = normalized_lists.replace("---", " ")
    lines = [normalize_whitespace(line) for line in normalized_lists.splitlines() if normalize_whitespace(line)]
    return normalize_whitespace(". ".join(lines))


def normalize_section_title(title: str) -> str:
    normalized = normalize_whitespace(title)
    lowered = normalized.lower()

    if lowered in SECTION_TITLE_REWRITES:
        return SECTION_TITLE_REWRITES[lowered]

    normalized = re.sub(r"^step\s+\d+\s*:\s*", "", normalized, flags=re.IGNORECASE)
    normalized = normalized.replace("(4 Steps)", "").strip(" -")
    return normalized


def parse_markdown_sections(doc_title: str, content: str) -> list[dict[str, str]]:
    sections: list[dict[str, str]] = []
    lines = content.splitlines()
    current_title = "Overview"
    current_lines: list[str] = []

    def flush() -> None:
        raw = "\n".join(current_lines).strip()
        if not raw:
            return

        cleaned = clean_study_material_text(raw)
        if not cleaned:
            return

        lowered_title = current_title.strip().lower()
        if lowered_title in SUPPRESSED_SECTION_HEADINGS:
            section_type = "metadata"
        elif "key quotes" in lowered_title or re.search(r"^>\s", raw, re.MULTILINE):
            section_type = "quote"
        elif re.search(r"^\|.*\|$", raw, re.MULTILINE):
            section_type = "table"
        elif re.search(r"^\*\*(source|duration|extracted|type):\*\*", raw, re.MULTILINE | re.IGNORECASE):
            section_type = "metadata"
        else:
            section_type = "explanation"

        sections.append({
            "doc": doc_title,
            "title": normalize_section_title(current_title.strip()),
            "type": section_type,
            "content": cleaned,
        })

    for line in lines:
        if re.match(r"^#\s+", line):
            continue

        heading_match = re.match(r"^#{2,3}\s+(.*)$", line)
        if heading_match:
            flush()
            current_title = heading_match.group(1).strip()
            current_lines = []
            continue

        current_lines.append(line)

    flush()
    return sections


def score_doc_for_video(source_title: str, doc_title: str, content: str) -> int:
    source_tokens = tokenize(source_title)
    doc_tokens = tokenize(doc_title)
    content_lower = content.lower()
    score = len(source_tokens & doc_tokens) * 3

    normalized_source = source_title.lower().replace("_", "-").replace(" ", "-")
    if source_title.lower() in content_lower:
        score += 10
    if normalized_source in content_lower:
        score += 6

    return score


def load_relevant_study_sections(source_title: str) -> list[dict[str, str]]:
    if not ARCHITECTURES_DIR.exists():
        return []

    candidates: list[tuple[int, list[dict[str, str]]]] = []
    for path in ARCHITECTURES_DIR.iterdir():
        if path.suffix.lower() not in {".md", ".txt"}:
            continue

        try:
            content = path.read_text(encoding="utf-8")
        except OSError:
            continue

        first_line = content.splitlines()[0] if content.splitlines() else path.stem
        doc_title = re.sub(r"^#+\s*", "", first_line).strip() or path.stem
        score = score_doc_for_video(source_title, doc_title, content)
        if score <= 0:
            continue

        sections = [
            section
            for section in parse_markdown_sections(doc_title, content)
            if section["type"] == "explanation"
        ]
        if sections:
            candidates.append((score, sections))

    candidates.sort(key=lambda item: item[0], reverse=True)
    if not candidates:
        return []

    flattened: list[dict[str, str]] = []
    for _, sections in candidates[:2]:
        flattened.extend(sections)

    return flattened[:8]


def group_transcript_for_window(
    transcript_segments: list[dict[str, Any]],
    start_time: float,
    end_time: float,
) -> str:
    relevant = [
        clean_transcript_text(seg.get("text", ""))
        for seg in transcript_segments
        if seg.get("start", 0) < end_time and seg.get("end", 0) >= start_time
    ]
    return normalize_whitespace(" ".join(chunk for chunk in relevant if chunk))


def build_windows(
    manifest: dict[str, Any],
    transcript_segments: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    frames = manifest.get("frames", [])
    duration_sec = float(manifest.get("video_duration_sec", 0))
    windows: list[dict[str, Any]] = []

    for index, frame in enumerate(frames):
        start_time = float(frame.get("timestamp_sec", 0))
        end_time = float(frames[index + 1]["timestamp_sec"]) if index + 1 < len(frames) else duration_sec
        transcript_text = group_transcript_for_window(transcript_segments, start_time, end_time)
        if not transcript_text:
            continue

        domain_hits = len(tokenize(transcript_text) & DOMAIN_KEYWORDS)
        windows.append({
            "id": index,
            "startTime": start_time,
            "endTime": end_time,
            "timestampLabel": format_timestamp(start_time),
            "text": transcript_text,
            "keywords": tokenize(transcript_text),
            "domainHits": domain_hits,
            "score": domain_hits + max(len(transcript_text) / 220, 0),
        })

    return windows


def score_window_for_section(window: dict[str, Any], section: dict[str, str]) -> float:
    section_keywords = tokenize(f"{section['title']} {section['content']}")
    overlap = len(window["keywords"] & section_keywords)
    phrase_bonus = 2.0 if section["title"].lower() in window["text"].lower() else 0.0
    return overlap * 2.5 + window["domainHits"] * 0.5 + phrase_bonus


def fallback_label_for_window(window: dict[str, Any]) -> str:
    for label, keywords in FALLBACK_SECTION_LABELS:
        if len(window["keywords"] & keywords) >= 2:
            return label
    return "Key Teaching Moment"


def build_seed_sections(
    source_title: str,
    windows: list[dict[str, Any]],
    study_sections: list[dict[str, str]],
) -> list[dict[str, Any]]:
    seeds: list[dict[str, Any]] = []
    used_window_ids: set[int] = set()

    for section in study_sections:
      best_window: dict[str, Any] | None = None
      best_score = 0.0
      for window in windows:
          if window["id"] in used_window_ids:
              continue
          score = score_window_for_section(window, section)
          if score > best_score:
              best_score = score
              best_window = window

      if not best_window or best_score < 3:
          continue

      used_window_ids.add(best_window["id"])
      seeds.append({
          "title": section["title"],
          "startTime": best_window["startTime"],
          "endTime": best_window["endTime"],
          "timestampLabel": best_window["timestampLabel"],
          "studySummary": summarize_text(section["content"], 220),
          "transcriptExcerpt": summarize_text(best_window["text"], 320),
      })

      if len(seeds) >= LESSON_MAX_SECTIONS:
          break

    if seeds:
        return sorted(seeds, key=lambda item: item["startTime"])

    ranked_windows = sorted(windows, key=lambda item: item["score"], reverse=True)
    for window in ranked_windows[:LESSON_MAX_SECTIONS]:
        seeds.append({
            "title": fallback_label_for_window(window),
            "startTime": window["startTime"],
            "endTime": window["endTime"],
            "timestampLabel": window["timestampLabel"],
            "studySummary": summarize_text(window["text"], 220),
            "transcriptExcerpt": summarize_text(window["text"], 320),
        })

    return sorted(seeds, key=lambda item: item["startTime"])


def title_to_takeaway(title: str, summary: str) -> str:
    normalized_title = normalize_section_title(title)
    if normalized_title in CONCEPT_SUMMARY_TEMPLATES:
        return CONCEPT_SUMMARY_TEMPLATES[normalized_title]

    first_sentence = split_sentences(summary)
    if first_sentence:
        sentence = first_sentence[0]
        if not is_low_signal(sentence):
            return sentence
    return f"Use {normalized_title.lower()} to frame the setup with clear liquidity logic."


def build_concept_summary(title: str, fallback_text: str) -> str:
    normalized_title = normalize_section_title(title)
    if normalized_title in CONCEPT_SUMMARY_TEMPLATES:
        return CONCEPT_SUMMARY_TEMPLATES[normalized_title]

    return summarize_text(fallback_text, 240)


def build_fallback_summary(source_title: str, seeds: list[dict[str, Any]]) -> str:
    titles = [seed["title"] for seed in seeds[:3]]
    if not titles:
        return (
            f"{source_title} explains how TCM order flow moves from submission, to matching, to filling, "
            "and how traders can turn that process into a practical bias framework."
        )

    joined_titles = ", ".join(titles[:-1]) + (f", and {titles[-1]}" if len(titles) > 1 else titles[0])
    return (
        f"{source_title} teaches how to read the book by connecting {joined_titles}. "
        "The lesson keeps returning to one core idea: liquidity only matters after orders are matched, "
        "and that changes how you read bias, fill logic, and objectives."
    )


def build_suggested_questions(seeds: list[dict[str, Any]]) -> list[str]:
    questions: list[str] = []
    for seed in seeds[:3]:
        concept = seed["title"].lower()
        questions.append(f"How do I recognize {concept} on the chart in real time?")
        questions.append(f"How does {concept} affect trade bias or liquidity targets?")
    return questions[:6]


def build_mentor_approach(source_title: str, seeds: list[dict[str, Any]]) -> str:
    if not seeds:
        return (
            f"Treat {source_title} like a sequencing lesson instead of a vocabulary list. "
            "Start by locating submitted interest, confirm where matching turned it into real liquidity, "
            "and then let that confirmed book shape your bias and objective."
        )

    first_titles = ", ".join(seed["title"] for seed in seeds[:3])
    return (
        f"Treat {source_title} like a mentor walkthrough, not a search result. "
        f"The teaching flow moves through {first_titles}, and it keeps coming back to the same discipline: "
        "verify where orders were submitted, confirm where they were matched, and only then decide what price is likely to fill or defend next."
    )


def build_prerequisite_hint(title: str) -> str:
    lowered = title.lower()

    if "submission range" in lowered:
        return "Mark the submission range first so you know where institutional interest was placed before matching begins."
    if "matching window" in lowered:
        return "Separate the matching window from raw submission so you only treat traded overlap as real liquidity."
    if "book" in lowered or "liquidity" in lowered:
        return "Know how to identify the book high, low, and EQ before trying to project fills or sweeps."
    if "bias" in lowered or "delivery" in lowered:
        return "Read the type of delivery at the level before deciding whether the market is continuing or reversing."
    if "unmatched" in lowered or "gap" in lowered:
        return "Track unfinished or unmatched prices ahead of time so you can tell whether the market is filling old business or creating new imbalance."
    return f"Be able to explain what {title.lower()} is showing before you use it for execution."


def build_prerequisites(seeds: list[dict[str, Any]]) -> list[str]:
    candidates = [build_prerequisite_hint(seed["title"]) for seed in seeds[:4]]
    return dedupe_text_items(candidates, 4)


def build_teaching_step(title: str) -> str:
    lowered = title.lower()

    if "submission range" in lowered and "matching window" in lowered:
        return "Start by comparing the submission range with the matching window so you can see where the book was actually formed."
    if "book" in lowered or "liquidity" in lowered:
        return "Once matching is confirmed, map the book high, low, and EQ because those become the actionable liquidity references."
    if "matched" in lowered or "unmatched" in lowered or "gap" in lowered:
        return "Separate matched orders from unfinished business so you know whether price is filling active liquidity or returning to a gap."
    if "bias" in lowered or "delivery" in lowered:
        return "Let delivery at the level tell you whether the next expectation is continuation or reversal."
    if "fill" in lowered or "objective" in lowered or "distribution" in lowered:
        return "Project the next fill or objective from the liquidity that remains open rather than guessing direction in isolation."
    return f"Use {title.lower()} as one step in the overall order-flow story, not as a standalone signal."


def build_teaching_sequence(seeds: list[dict[str, Any]]) -> list[str]:
    return dedupe_text_items(
        [build_teaching_step(seed["title"]) for seed in seeds[:5]],
        5,
    )


def build_core_concepts(seeds: list[dict[str, Any]]) -> list[dict[str, Any]]:
    concepts = []
    for seed in seeds[:4]:
        concepts.append({
            "title": seed["title"],
            "summary": build_concept_summary(seed["title"], seed["studySummary"] or seed["transcriptExcerpt"]),
            "timestampLabel": seed["timestampLabel"],
        })

    return concepts


def build_common_misconceptions(seeds: list[dict[str, Any]]) -> list[str]:
    candidates: list[str] = []
    titles = " ".join(seed["title"].lower() for seed in seeds)

    if "submission range" in titles or "matching window" in titles:
        candidates.append(
            "A submitted price is not actionable liquidity until the matching window actually trades back through it."
        )
    if "book" in titles or "liquidity" in titles:
        candidates.append(
            "The book is not every line on the chart. It is the matched zone where buyers and sellers actually paired off."
        )
    if "matched" in titles or "unmatched" in titles or "gap" in titles:
        candidates.append(
            "An unmatched gap is not random magnetism. It is unfinished order flow that can still demand a fill."
        )
    if "bias" in titles or "delivery" in titles:
        candidates.append(
            "A sweep by itself does not prove reversal. The close and delivery still need to confirm the shift."
        )
    if "fill" in titles or "objective" in titles or "distribution" in titles:
        candidates.append(
            "A fill objective is not a blind target. It has to line up with the book or imbalance that created the unfinished business."
        )

    if not candidates:
        candidates.append(
            "The lesson is not asking you to memorize labels. It is asking you to follow the order-flow sequence in the right order."
        )

    return dedupe_text_items(candidates, 5)


def build_chart_reading_rules(seeds: list[dict[str, Any]]) -> list[str]:
    candidates = [
        "Mark the submission range before the matching session so you can compare intent with actual execution.",
        "Only promote a level to real liquidity after price trades back through it and matching is confirmed.",
        "Use the book high, low, and EQ as your first map for later fills, sweeps, and reactions.",
    ]

    titles = " ".join(seed["title"].lower() for seed in seeds)

    if "bias" in titles or "delivery" in titles:
        candidates.append(
            "Read the close after the level is attacked before calling reversal or continuation."
        )

    if "unmatched" in titles or "gap" in titles or "fill" in titles:
        candidates.append(
            "When price leaves unfinished business behind, track the fill path before assuming the move is complete."
        )

    return dedupe_text_items(candidates, 5)


def dedupe_rule_items(items: list[dict[str, Any]], limit: int | None = None) -> list[dict[str, str]]:
    seen: set[str] = set()
    results: list[dict[str, str]] = []

    for item in items:
        if_you_see = normalize_whitespace(item.get("ifYouSee", ""))
        then_expect = normalize_whitespace(item.get("thenExpect", ""))
        because = normalize_whitespace(item.get("because", ""))

        if not if_you_see or not then_expect or not because:
            continue

        key = if_you_see.lower()
        if key in seen:
            continue

        seen.add(key)
        results.append({
            "ifYouSee": if_you_see,
            "thenExpect": then_expect,
            "because": because,
        })

        if limit is not None and len(results) >= limit:
            break

    return results


def build_if_then_rules(seeds: list[dict[str, Any]]) -> list[dict[str, str]]:
    rules = [
        {
            "ifYouSee": "submission overlap with the matching window",
            "thenExpect": "a defined book with usable high, low, and EQ references",
            "because": "matched orders have now turned submitted interest into real liquidity",
        },
        {
            "ifYouSee": "price leaves a gap between submission and matching",
            "thenExpect": "unfinished business that may need a later fill before the move is complete",
            "because": "those submitted orders never found counterparties",
        },
        {
            "ifYouSee": "a sweep that closes back through the level",
            "thenExpect": "reversal conditions to strengthen",
            "because": "delivery rejected the prior side instead of cleanly continuing through it",
        },
        {
            "ifYouSee": "price runs through the level and keeps imbalance open",
            "thenExpect": "continuation conditions to stay active until the fill objective is satisfied",
            "because": "the market did not fully rebalance the liquidity it just displaced",
        },
    ]

    titles = " ".join(seed["title"].lower() for seed in seeds)
    if "bias" not in titles and "delivery" not in titles:
        rules = rules[:2] + rules[3:]
    if "unmatched" not in titles and "gap" not in titles and "fill" not in titles:
        rules = [rule for rule in rules if "gap between submission and matching" not in rule["ifYouSee"]]

    return dedupe_rule_items(rules, 4)


def build_diagnostic_questions(seeds: list[dict[str, Any]]) -> list[str]:
    questions = [
        "Where on the chart did submitted interest become matched liquidity instead of staying theoretical?",
        "Which level is the real book high, low, or EQ here, and what evidence proves it?",
        "What would invalidate your current bias read if the market handled this zone differently?",
        "If price returns to this book, who is most likely being filled or defended?",
    ]

    for seed in seeds[:2]:
        questions.append(
            f"Which clip in the lesson best demonstrates {seed['title'].lower()}, and what should you notice first?"
        )

    return dedupe_text_items(questions, 6)


def build_practice_prompts(source_title: str, seeds: list[dict[str, Any]]) -> list[str]:
    prompts = [
        "Open a recent session and mark the submission range, the matching window, and the book high, low, and EQ.",
        "Find a day where submission and matching did not overlap cleanly, then write down where unfinished business was left behind.",
        "Replay one lesson clip and narrate the exact moment submitted prices became actionable liquidity.",
    ]

    if seeds:
        prompts.append(
            f"Use {source_title} as your model and explain how {seeds[0]['title'].lower()} would change your trade plan before entry."
        )

    return dedupe_text_items(prompts, 4)


def build_glossary(seeds: list[dict[str, Any]]) -> list[dict[str, str]]:
    corpus_parts: list[str] = []
    for seed in seeds:
        corpus_parts.extend([
            seed["title"],
            seed.get("studySummary", ""),
            seed.get("transcriptExcerpt", ""),
        ])

    corpus = " ".join(corpus_parts).lower()

    glossary: list[dict[str, str]] = []
    for term, definition in GLOSSARY_DEFINITIONS.items():
        term_tokens = [token for token in re.findall(r"[a-z0-9]+", term.lower()) if token]
        if term.lower() in corpus or any(token in corpus for token in term_tokens):
            glossary.append({"term": term, "definition": definition})

    if not glossary and seeds:
        glossary.append({
            "term": seeds[0]["title"],
            "definition": build_concept_summary(seeds[0]["title"], seeds[0]["studySummary"] or seeds[0]["transcriptExcerpt"]),
        })

    return dedupe_rule_items(
        [{"ifYouSee": item["term"], "thenExpect": item["definition"], "because": "glossary"} for item in glossary],
        6,
    )


def normalize_glossary(glossary_rules: list[dict[str, str]]) -> list[dict[str, str]]:
    return [
        {"term": item["ifYouSee"], "definition": item["thenExpect"]}
        for item in glossary_rules
    ]


def build_tutor_pack(source_title: str, seeds: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "mentorApproach": build_mentor_approach(source_title, seeds),
        "prerequisites": build_prerequisites(seeds),
        "teachingSequence": build_teaching_sequence(seeds),
        "coreConcepts": build_core_concepts(seeds),
        "commonMisconceptions": build_common_misconceptions(seeds),
        "chartReadingRules": build_chart_reading_rules(seeds),
        "ifYouSeeThisThenThat": build_if_then_rules(seeds),
        "diagnosticQuestions": build_diagnostic_questions(seeds),
        "practicePrompts": build_practice_prompts(source_title, seeds),
        "glossary": normalize_glossary(build_glossary(seeds)),
    }


def build_deterministic_lesson(source_title: str, seeds: list[dict[str, Any]]) -> dict[str, Any]:
    sections = []
    recommended_moments = []

    for seed in seeds:
        citation = f"{source_title} @ {seed['timestampLabel']}"
        section_summary = build_concept_summary(seed["title"], seed["studySummary"] or seed["transcriptExcerpt"])
        sections.append({
            "title": seed["title"],
            "timestamp": seed["startTime"],
            "timestampLabel": seed["timestampLabel"],
            "startTime": seed["startTime"],
            "endTime": seed["endTime"],
            "summary": section_summary,
            "citation": citation,
            "transcriptExcerpt": summarize_text(seed["transcriptExcerpt"], 320),
        })
        recommended_moments.append({
            "title": seed["title"],
            "timestamp": seed["startTime"],
            "timestampLabel": seed["timestampLabel"],
            "reason": section_summary,
        })

    key_takeaways = [title_to_takeaway(seed["title"], seed["studySummary"] or seed["transcriptExcerpt"]) for seed in seeds[:5]]
    tutor_pack = build_tutor_pack(source_title, seeds)

    return {
        "summary": build_fallback_summary(source_title, seeds),
        "keyTakeaways": key_takeaways[:5],
        "recommendedMoments": recommended_moments[:5],
        "suggestedQuestions": build_suggested_questions(seeds),
        "sections": sections,
        "tutorPack": tutor_pack,
    }


def extract_json_block(text: str) -> dict[str, Any] | None:
    candidates = [text]
    fenced = re.findall(r"```(?:json)?\s*([\s\S]*?)```", text, flags=re.IGNORECASE)
    candidates.extend(fenced)

    for candidate in candidates:
        stripped = candidate.strip()
        if not stripped:
            continue
        try:
            return json.loads(stripped)
        except json.JSONDecodeError:
            start = stripped.find("{")
            end = stripped.rfind("}")
            if start != -1 and end != -1 and end > start:
                try:
                    return json.loads(stripped[start:end + 1])
                except json.JSONDecodeError:
                    continue

    return None


def call_anthropic(prompt: str) -> dict[str, Any] | None:
    if not ANTHROPIC_API_KEY:
        return None

    payload = json.dumps({
        "model": LESSON_MODEL,
        "max_tokens": 3200,
        "system": (
            "You rewrite trading lesson material into polished student-facing lesson guides. "
            "Return valid JSON only. Use clear teaching language, not transcript fragments. "
            "Do not use markdown tables, filler phrases, or conversational openings."
        ),
        "messages": [{"role": "user", "content": prompt}],
    }).encode("utf-8")

    request = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=payload,
        headers={
            "content-type": "application/json",
            "x-api-key": ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            data = json.loads(response.read().decode("utf-8"))
            text = data.get("content", [{}])[0].get("text", "")
            return extract_json_block(text)
    except (urllib.error.URLError, TimeoutError, KeyError, IndexError, json.JSONDecodeError):
        return None


def build_ai_prompt(source_title: str, fallback: dict[str, Any], seeds: list[dict[str, Any]], attempt: int, flags: list[str] | None = None) -> str:
    retry_suffix = ""
    if attempt > 1 and flags:
        retry_suffix = (
            "\nThe previous draft failed validation for these reasons: "
            f"{', '.join(flags)}. Repair those problems and keep the response clean."
        )

    seed_payload = [
        {
            "title": seed["title"],
            "timestampLabel": seed["timestampLabel"],
            "studySummary": seed["studySummary"],
            "transcriptExcerpt": seed["transcriptExcerpt"],
        }
        for seed in seeds
    ]

    return f"""
Create a polished lesson guide for the trading lesson "{source_title}".

Use the provided concept anchors and transcript evidence. Keep the same number of sections and keep each section tied to the supplied timestamp.

Return JSON with exactly these keys:
- summary: string (2-4 sentences)
- keyTakeaways: string[] (3-5 short teaching statements)
- suggestedQuestions: string[] (4-6 natural student questions)
- recommendedMoments: object[] with title and reason
- sections: object[] with title, summary, transcriptExcerpt
- tutorPack: object with:
  - mentorApproach: string
  - prerequisites: string[] (2-4)
  - teachingSequence: string[] (3-5)
  - coreConcepts: object[] with title, summary, timestampLabel
  - commonMisconceptions: string[] (3-5)
  - chartReadingRules: string[] (3-5)
  - ifYouSeeThisThenThat: object[] with ifYouSee, thenExpect, because
  - diagnosticQuestions: string[] (4-6)
  - practicePrompts: string[] (3-5)
  - glossary: object[] with term and definition

Rules:
- Section titles must be concept labels, not transcript fragments.
- Do not start any field with filler phrases like "All right", "you know", or "so".
- Do not quote the transcript unless the excerpt is short and necessary.
- Make the tone sound like a mentor teaching a trading student.
- Keep the tutorPack grounded in the supplied lesson evidence. Do not invent jargon or examples that are not supported by the anchors.
- Preserve the supplied timestamp order.
- Keep transcriptExcerpt concise and readable.

Concept anchors:
{json.dumps(seed_payload, indent=2)}

Deterministic fallback draft:
{json.dumps(fallback, indent=2)}
{retry_suffix}
""".strip()


def normalize_moment_title(title: str, fallback: str) -> str:
    cleaned = normalize_whitespace(title)
    if not cleaned:
        return fallback
    cleaned = cleaned.rstrip(".!?")
    return cleaned[:80]


def looks_like_concept_title(title: str) -> bool:
    normalized = normalize_whitespace(title)
    if not normalized:
        return False
    lowered = normalized.lower()
    if lowered in SUPPRESSED_SECTION_HEADINGS:
        return False
    if lowered.startswith("step "):
        return False
    if normalized.lower().startswith(LOW_SIGNAL_PREFIXES):
        return False
    if normalized.endswith(("...", ".", "?", "!")):
        return False
    if len(normalized.split()) > 10:
        return False
    return True


def normalized_string_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []

    return [
        normalize_whitespace(item)
        for item in value
        if isinstance(item, str) and normalize_whitespace(item)
    ]


def normalized_dict_list(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []

    return [item for item in value if isinstance(item, dict)]


def jaccard_similarity(left: str, right: str) -> float:
    left_tokens = tokenize(left)
    right_tokens = tokenize(right)
    if not left_tokens or not right_tokens:
        return 0.0
    return len(left_tokens & right_tokens) / len(left_tokens | right_tokens)


def validate_lesson_payload(lesson: dict[str, Any]) -> dict[str, Any]:
    flags: list[str] = []
    summary = normalize_whitespace(lesson.get("summary", ""))
    takeaways = [normalize_whitespace(item) for item in lesson.get("keyTakeaways", []) if normalize_whitespace(item)]
    questions = [normalize_whitespace(item) for item in lesson.get("suggestedQuestions", []) if normalize_whitespace(item)]
    sections = lesson.get("sections", [])

    if len(summary) < 80:
        flags.append("summary_too_thin")
    if is_low_signal(summary):
        flags.append("summary_low_signal")

    if len(takeaways) < 3:
        flags.append("too_few_takeaways")
    if any(is_low_signal(item) for item in takeaways):
        flags.append("takeaway_low_signal")

    if len(questions) < 4:
        flags.append("too_few_questions")
    if any(is_low_signal(item) for item in questions):
        flags.append("question_low_signal")

    if not sections or len(sections) < 3:
        flags.append("too_few_sections")

    for section in sections:
        title = normalize_whitespace(section.get("title", ""))
        section_summary = normalize_whitespace(section.get("summary", ""))
        transcript_excerpt = normalize_whitespace(section.get("transcriptExcerpt", ""))
        if not looks_like_concept_title(title):
            flags.append("section_title_fragment")
        if is_low_signal(section_summary):
            flags.append("section_summary_low_signal")
        if transcript_excerpt and jaccard_similarity(section_summary, transcript_excerpt) > 0.88:
            flags.append("section_summary_quote_like")

    tutor_pack = lesson.get("tutorPack") if isinstance(lesson.get("tutorPack"), dict) else {}
    if tutor_pack:
        mentor_approach = normalize_whitespace(tutor_pack.get("mentorApproach", ""))
        prerequisites = normalized_string_list(tutor_pack.get("prerequisites"))
        teaching_sequence = normalized_string_list(tutor_pack.get("teachingSequence"))
        common_misconceptions = normalized_string_list(tutor_pack.get("commonMisconceptions"))
        chart_reading_rules = normalized_string_list(tutor_pack.get("chartReadingRules"))
        diagnostic_questions = normalized_string_list(tutor_pack.get("diagnosticQuestions"))
        practice_prompts = normalized_string_list(tutor_pack.get("practicePrompts"))
        core_concepts = normalized_dict_list(tutor_pack.get("coreConcepts"))
        glossary = normalized_dict_list(tutor_pack.get("glossary"))

        if len(mentor_approach) < 80 or is_low_signal(mentor_approach):
            flags.append("mentor_approach_low_signal")

        if len(core_concepts) < 3 or len(common_misconceptions) < 2 or len(chart_reading_rules) < 2 or len(diagnostic_questions) < 4:
            flags.append("tutor_pack_thin")

        tutor_text = prerequisites + teaching_sequence + common_misconceptions + chart_reading_rules + diagnostic_questions + practice_prompts
        if any(is_low_signal(item) for item in tutor_text):
            flags.append("tutor_pack_low_signal")

        if glossary and any(
            not normalize_whitespace(item.get("term", "")) or not normalize_whitespace(item.get("definition", ""))
            for item in glossary
            if isinstance(item, dict)
        ):
            flags.append("glossary_incomplete")

    score = 1.0 - (0.12 * len(set(flags)))
    return {
        "score": max(0.0, round(score, 2)),
        "flags": sorted(set(flags)),
        "valid": len(flags) == 0,
    }


def merge_lesson_with_seeds(
    source_title: str,
    seeds: list[dict[str, Any]],
    payload: dict[str, Any],
) -> dict[str, Any]:
    merged_sections = []
    generated_sections = payload.get("sections", [])
    generated_moments = payload.get("recommendedMoments", [])

    for index, seed in enumerate(seeds):
        generated_section = generated_sections[index] if index < len(generated_sections) else {}
        merged_sections.append({
            "title": normalize_moment_title(generated_section.get("title", seed["title"]), seed["title"]),
            "timestamp": seed["startTime"],
            "timestampLabel": seed["timestampLabel"],
            "startTime": seed["startTime"],
            "endTime": seed["endTime"],
            "summary": summarize_text(generated_section.get("summary", seed["studySummary"]), 240),
            "citation": f"{source_title} @ {seed['timestampLabel']}",
            "transcriptExcerpt": summarize_text(generated_section.get("transcriptExcerpt", seed["transcriptExcerpt"]), 320),
        })

    merged_moments = []
    for index, seed in enumerate(seeds[:5]):
        generated_moment = generated_moments[index] if index < len(generated_moments) else {}
        merged_moments.append({
            "title": normalize_moment_title(generated_moment.get("title", seed["title"]), seed["title"]),
            "timestamp": seed["startTime"],
            "timestampLabel": seed["timestampLabel"],
            "reason": summarize_text(generated_moment.get("reason", seed["studySummary"]), 200),
        })

    fallback_tutor_pack = build_tutor_pack(source_title, seeds)
    generated_tutor_pack = payload.get("tutorPack") if isinstance(payload.get("tutorPack"), dict) else {}
    generated_core_concepts = (
        normalized_dict_list(generated_tutor_pack.get("coreConcepts"))
    )
    merged_core_concepts = []
    for index, seed in enumerate(seeds[:4]):
        generated_concept = generated_core_concepts[index] if index < len(generated_core_concepts) else {}
        merged_core_concepts.append({
            "title": normalize_moment_title(generated_concept.get("title", seed["title"]), seed["title"]),
            "summary": summarize_text(
                generated_concept.get(
                    "summary",
                    build_concept_summary(seed["title"], seed["studySummary"] or seed["transcriptExcerpt"]),
                ),
                220,
            ),
            "timestampLabel": seed["timestampLabel"],
        })

    merged_if_then = dedupe_rule_items(
        [
            {
                "ifYouSee": summarize_text(item.get("ifYouSee", ""), 120),
                "thenExpect": summarize_text(item.get("thenExpect", ""), 140),
                "because": summarize_text(item.get("because", ""), 140),
            }
            for item in normalized_dict_list(generated_tutor_pack.get("ifYouSeeThisThenThat"))
        ]
        + fallback_tutor_pack["ifYouSeeThisThenThat"],
        4,
    )

    merged_glossary = []
    seen_glossary_terms: set[str] = set()
    glossary_candidates = []
    glossary_candidates.extend(normalized_dict_list(generated_tutor_pack.get("glossary")))
    glossary_candidates.extend(fallback_tutor_pack["glossary"])

    for item in glossary_candidates:
        term = normalize_whitespace(item.get("term", ""))
        definition = normalize_whitespace(item.get("definition", ""))
        if not term or not definition:
            continue

        lowered = term.lower()
        if lowered in seen_glossary_terms:
            continue

        seen_glossary_terms.add(lowered)
        merged_glossary.append({
            "term": term,
            "definition": summarize_text(definition, 180),
        })

        if len(merged_glossary) >= 6:
            break

    return {
        "summary": summarize_text(payload.get("summary", ""), 420),
        "keyTakeaways": [summarize_text(item, 160) for item in payload.get("keyTakeaways", []) if normalize_whitespace(item)][:5],
        "suggestedQuestions": [summarize_text(item, 160) for item in payload.get("suggestedQuestions", []) if normalize_whitespace(item)][:6],
        "recommendedMoments": merged_moments,
        "sections": merged_sections,
        "tutorPack": {
            "mentorApproach": summarize_text(
                generated_tutor_pack.get("mentorApproach")
                if isinstance(generated_tutor_pack.get("mentorApproach"), str)
                else fallback_tutor_pack["mentorApproach"],
                420,
            ),
            "prerequisites": dedupe_text_items(
                [
                    summarize_text(item, 180)
                    for item in normalized_string_list(generated_tutor_pack.get("prerequisites"))
                ]
                + fallback_tutor_pack["prerequisites"],
                4,
            ),
            "teachingSequence": dedupe_text_items(
                [
                    summarize_text(item, 180)
                    for item in normalized_string_list(generated_tutor_pack.get("teachingSequence"))
                ]
                + fallback_tutor_pack["teachingSequence"],
                5,
            ),
            "coreConcepts": merged_core_concepts,
            "commonMisconceptions": dedupe_text_items(
                [
                    summarize_text(item, 180)
                    for item in normalized_string_list(generated_tutor_pack.get("commonMisconceptions"))
                ]
                + fallback_tutor_pack["commonMisconceptions"],
                5,
            ),
            "chartReadingRules": dedupe_text_items(
                [
                    summarize_text(item, 180)
                    for item in normalized_string_list(generated_tutor_pack.get("chartReadingRules"))
                ]
                + fallback_tutor_pack["chartReadingRules"],
                5,
            ),
            "ifYouSeeThisThenThat": merged_if_then,
            "diagnosticQuestions": dedupe_text_items(
                [
                    summarize_text(item, 180)
                    for item in normalized_string_list(generated_tutor_pack.get("diagnosticQuestions"))
                ]
                + fallback_tutor_pack["diagnosticQuestions"],
                6,
            ),
            "practicePrompts": dedupe_text_items(
                [
                    summarize_text(item, 180)
                    for item in normalized_string_list(generated_tutor_pack.get("practicePrompts"))
                ]
                + fallback_tutor_pack["practicePrompts"],
                4,
            ),
            "glossary": merged_glossary,
        },
    }


def generate_hybrid_lesson(source_title: str, fallback: dict[str, Any], seeds: list[dict[str, Any]]) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    first_attempt = call_anthropic(build_ai_prompt(source_title, fallback, seeds, attempt=1))
    if first_attempt:
        first_lesson = merge_lesson_with_seeds(source_title, seeds, first_attempt)
        quality = validate_lesson_payload(first_lesson)
        if quality["valid"]:
            return first_lesson, quality

        repaired_attempt = call_anthropic(
            build_ai_prompt(source_title, fallback, seeds, attempt=2, flags=quality["flags"])
        )
        if repaired_attempt:
            repaired_lesson = merge_lesson_with_seeds(source_title, seeds, repaired_attempt)
            repaired_quality = validate_lesson_payload(repaired_lesson)
            if repaired_quality["valid"]:
                return repaired_lesson, repaired_quality

    return None, None


def build_lesson(video_dir: Path) -> dict[str, Any]:
    manifest_path = video_dir / "manifest.json"
    transcript_path = video_dir / "transcript_timed.json"

    if not manifest_path.exists():
        raise FileNotFoundError(f"manifest.json not found in {video_dir}")
    if not transcript_path.exists():
        raise FileNotFoundError(f"transcript_timed.json not found in {video_dir}")

    manifest = load_json(manifest_path)
    transcript_segments = load_json(transcript_path)
    source_title = manifest.get("source_title") or video_dir.name
    generated_at = manifest.get("extracted_at")

    study_sections = load_relevant_study_sections(source_title)
    windows = build_windows(manifest, transcript_segments)
    seeds = build_seed_sections(source_title, windows, study_sections)
    fallback = build_deterministic_lesson(source_title, seeds)

    lesson_core: dict[str, Any]
    generation_mode = "deterministic-fallback"
    status = "fallback"
    quality = validate_lesson_payload(fallback)

    hybrid_lesson, hybrid_quality = generate_hybrid_lesson(source_title, fallback, seeds)
    if hybrid_lesson and hybrid_quality:
        lesson_core = hybrid_lesson
        generation_mode = "hybrid-ai"
        status = "ready"
        quality = hybrid_quality
    else:
        lesson_core = fallback
        if quality["score"] < 0.65:
            status = "needs_review"

    return {
        "videoId": video_dir.name,
        "videoTitle": source_title,
        "generatedAt": generated_at,
        "status": status,
        "generationMode": generation_mode,
        "quality": {
            "score": quality["score"],
            "flags": quality["flags"],
        },
        **lesson_core,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate lesson.json for a processed video")
    parser.add_argument("--video-dir", type=Path, required=True, help="Video directory containing manifest and transcript artifacts")
    parser.add_argument("--json", action="store_true", help="Emit result as JSON")
    args = parser.parse_args()

    lesson = build_lesson(args.video_dir)
    lesson_path = args.video_dir / "lesson.json"
    with open(lesson_path, "w", encoding="utf-8") as handle:
        json.dump(lesson, handle, indent=2)

    if args.json:
        print(json.dumps({
            "status": "success",
            "lessonPath": str(lesson_path),
            "sectionCount": len(lesson.get("sections", [])),
            "lessonStatus": lesson.get("status"),
            "generationMode": lesson.get("generationMode"),
            "quality": lesson.get("quality"),
        }))
    else:
        print(f"Lesson written to {lesson_path}")


if __name__ == "__main__":
    main()
