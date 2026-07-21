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
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any


SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent
ARCHITECTURES_DIR = PROJECT_ROOT / "data" / "architectures"


def project_env_value(name: str) -> str | None:
    direct_value = os.environ.get(name)
    if direct_value:
        return direct_value

    for env_path in (PROJECT_ROOT / ".env.local", PROJECT_ROOT / "ui" / ".env.local"):
        if not env_path.exists():
            continue

        for raw_line in env_path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue

            key, value = line.split("=", 1)
            if key.strip() == name:
                return value.strip().strip("'\"") or None

    return None


ANTHROPIC_API_KEY = project_env_value("ANTHROPIC_API_KEY")
LESSON_MODEL = os.environ.get("TCM_LESSON_MODEL", "claude-haiku-4-5-20251001")
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
    "psychology", "fear", "clarity", "confusion", "discipline", "confidence",
    "hesitation", "emotion", "emotional", "patient", "patience", "impulsive",
    "risk", "leverage", "stop", "loss", "losses", "position", "sizing", "exposure",
    "volume", "profile", "value", "acceptance", "rejection", "participation",
    "expansion", "compression", "fractal", "consolidation", "breakout", "structure",
    "execution", "entry", "entries", "setup", "setups", "confirmation", "invalidation",
    "weekly", "daily", "open", "high", "low", "initial", "above", "below", "bullish",
    "bearish", "candle", "candles", "close", "closing", "flow", "csd", "efficient",
    "efficiency", "inefficient", "rebalance", "bodies", "wicks", "manipulation",
    "session", "morning", "night", "mechanical", "rules",
}

FALLBACK_SECTION_LABELS = [
    ("Higher-Timeframe Range Context", {"weekly", "daily", "profile", "range", "high", "low"}),
    ("Range Formation and Reference Levels", {"range", "open", "high", "low", "start", "initial"}),
    ("Liquidity Location and Directional Bias", {"liquidity", "above", "below", "bullish", "bearish", "bias"}),
    ("Candle Confirmation and Order Flow", {"candle", "candles", "close", "closing", "order", "flow", "csd"}),
    ("Range Efficiency and Rebalancing", {"efficient", "efficiency", "inefficient", "rebalance", "bodies", "wicks"}),
    ("Manipulation and Structural Clarity", {"manipulation", "structure", "price", "action"}),
    ("Session Timing and Mechanical Execution", {"session", "morning", "night", "time", "mechanical", "rules"}),
    ("Fear, Clarity, and Decision Quality", {"fear", "clarity", "confusion", "hesitation"}),
    ("Trading Psychology and Emotional Control", {"psychology", "emotion", "emotional", "discipline"}),
    ("Patience and Execution Discipline", {"patient", "patience", "execution", "discipline"}),
    ("Risk, Leverage, and Position Sizing", {"risk", "leverage", "position", "sizing", "exposure"}),
    ("Stops, Losses, and Invalidation", {"stop", "loss", "losses", "invalidation"}),
    ("Volume, Value, and Market Participation", {"volume", "profile", "value", "participation"}),
    ("Acceptance and Rejection", {"acceptance", "rejection", "value", "volume"}),
    ("Expansion, Compression, and Structure", {"expansion", "compression", "structure", "consolidation"}),
    ("Fractal Range Development", {"fractal", "range", "expansion", "compression"}),
    ("Execution and Confirmation", {"execution", "entry", "entries", "confirmation"}),
    ("Submission Range and Matching Window", {"submission", "matching", "window", "range"}),
    ("Book Formation and Liquidity", {"book", "liquidity", "matched"}),
    ("Matched vs Unmatched Orders", {"matched", "unmatched", "orders", "gap"}),
    ("Bias and Delivery", {"bias", "delivery", "continuation", "reversal"}),
    ("Fill Logic and Objectives", {"fill", "filled", "distribution", "equilibrium", "eq"}),
]

SINGLE_KEYWORD_SECTION_LABELS = [
    ("Fear, Clarity, and Decision Quality", {"fear", "clarity", "confusion", "hesitation"}),
    ("Trading Psychology and Emotional Control", {"psychology", "emotion", "emotional"}),
    ("Patience and Execution Discipline", {"patient", "patience", "discipline"}),
    ("Risk, Leverage, and Position Sizing", {"risk", "leverage", "sizing", "exposure"}),
    ("Stops, Losses, and Invalidation", {"stop", "losses", "invalidation"}),
    ("Volume, Value, and Market Participation", {"volume", "profile", "participation"}),
    ("Acceptance and Rejection", {"acceptance", "rejection"}),
    ("Expansion, Compression, and Structure", {"expansion", "compression", "consolidation"}),
    ("Fractal Range Development", {"fractal"}),
    ("Execution and Confirmation", {"execution", "confirmation"}),
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
    "Fear, Clarity, and Decision Quality": (
        "Fear becomes most disruptive when the trader cannot clearly state the setup, risk, and invalidation. "
        "Clarity turns emotion into a prompt to re-check evidence instead of reacting impulsively."
    ),
    "Trading Psychology and Emotional Control": (
        "Trading psychology is the ability to follow an evidence-based plan while uncertainty, profit, and loss "
        "create emotional pressure."
    ),
    "Patience and Execution Discipline": (
        "Patience means waiting for the planned evidence, while execution discipline means following the risk and "
        "invalidation rules after the trade is active."
    ),
    "Risk, Leverage, and Position Sizing": (
        "Risk is defined before entry by pairing the invalidation distance with a position size the account can "
        "absorb without forcing an emotional decision."
    ),
    "Stops, Losses, and Invalidation": (
        "A stop belongs at the point where the trade thesis is no longer valid. A controlled loss is the cost of "
        "testing an idea, not a reason to abandon the decision process."
    ),
    "Volume, Value, and Market Participation": (
        "Volume becomes useful when it is read at a meaningful location. It shows where participation is building, "
        "but price response is still needed to distinguish acceptance from rejection."
    ),
    "Acceptance and Rejection": (
        "Acceptance appears when the market sustains trade around a location; rejection appears when price tests it "
        "and quickly moves away."
    ),
    "Expansion, Compression, and Structure": (
        "Expansion is a move away from balance, while compression is a tightening structure that can prepare the "
        "next directional auction."
    ),
    "Fractal Range Development": (
        "Market ranges repeat across timeframes. Reading the active range and its internal structure helps a trader "
        "avoid treating every small break as a new directional move."
    ),
    "Execution and Confirmation": (
        "Execution follows confirmation rather than anticipation alone. The entry, risk, and invalidation should all "
        "come from the same setup evidence."
    ),
    "Higher-Timeframe Range Context": (
        "Start with the active weekly or daily range so each lower-timeframe observation has a clear structural "
        "context and objective."
    ),
    "Range Formation and Reference Levels": (
        "Define where the range begins, then mark its open, initial high, and initial low before projecting how "
        "price may deliver around it."
    ),
    "Liquidity Location and Directional Bias": (
        "The location of liquidity above or below the active range shapes the directional scenario, but price still "
        "has to confirm whether that liquidity is a target or a rejection point."
    ),
    "Candle Confirmation and Order Flow": (
        "A candle matters through its close and the order flow that follows it. Use that confirmation to distinguish "
        "continuation from a failed directional attempt."
    ),
    "Range Efficiency and Rebalancing": (
        "Compare candle bodies and wicks across the range to find inefficient delivery. Unbalanced areas remain "
        "candidates for rebalancing until price trades through them efficiently."
    ),
    "Manipulation and Structural Clarity": (
        "Remove incidental manipulation from the chart mentally and check whether the same structural read still "
        "holds. A durable thesis should remain clear after that simplification."
    ),
    "Session Timing and Mechanical Execution": (
        "Anchor execution to the session windows and rules used in the lesson so participation is deliberate rather "
        "than driven by the urge to trade continuously."
    ),
    "Trading Decision Process": (
        "Move from observation to confirmation, execution, and invalidation in a fixed sequence. This prevents one "
        "interesting clue or emotional reaction from becoming a complete trade thesis."
    ),
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
    "Fear": (
        "An emotional response to uncertainty that should trigger a review of evidence and risk, not an automatic trade decision."
    ),
    "Clarity": (
        "The ability to state the setup, confirmation, risk, and invalidation before capital is committed."
    ),
    "Discipline": (
        "Following the predefined decision and risk process even when the open trade creates emotional pressure."
    ),
    "Invalidation": (
        "The market condition that proves the current trade thesis is no longer the working explanation."
    ),
    "Position Sizing": (
        "Choosing trade size from the distance to invalidation and the maximum account risk allowed."
    ),
    "Acceptance": (
        "Sustained trade around a price or value area, showing that the market is willing to keep transacting there."
    ),
    "Rejection": (
        "A test followed by a decisive move away, showing that the market did not sustain trade at that location."
    ),
    "Compression": (
        "A tightening market structure that reflects balance and can precede an expansion away from the range."
    ),
    "Expansion": (
        "Directional movement away from balance toward the next structural objective."
    ),
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
    frame_interval = float(manifest.get("frame_interval_sec", 0) or 0)
    frame_coverage_end = (
        float(frames[-1].get("timestamp_sec", 0)) + frame_interval
        if frames
        else 0.0
    )
    has_timeline_coverage = (
        bool(frames)
        and (
            duration_sec <= 0
            or frame_coverage_end >= duration_sec * 0.8
        )
    )

    if has_timeline_coverage:
        for index, frame in enumerate(frames):
            start_time = float(frame.get("timestamp_sec", 0))
            if duration_sec > 0 and start_time >= duration_sec:
                continue
            end_time = (
                float(frames[index + 1]["timestamp_sec"])
                if index + 1 < len(frames)
                else (
                    duration_sec
                    if duration_sec >= start_time
                    else start_time + frame_interval
                )
            )
            if duration_sec > 0:
                end_time = min(end_time, duration_sec)
            transcript_text = group_transcript_for_window(
                transcript_segments,
                start_time,
                end_time,
            )
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
                "score": domain_hits + min(len(transcript_text) / 220, 3.0),
            })

    if (not has_timeline_coverage or not windows) and transcript_segments:
        transcript_end = max(
            float(segment.get("end", segment.get("start", 0)))
            for segment in transcript_segments
        )
        fallback_duration = duration_sec if duration_sec > 0 else transcript_end
        window_seconds = 90.0
        start_time = 0.0
        window_id = 0

        while start_time < fallback_duration:
            end_time = min(start_time + window_seconds, fallback_duration)
            transcript_text = group_transcript_for_window(
                transcript_segments,
                start_time,
                end_time,
            )
            if transcript_text:
                domain_hits = len(tokenize(transcript_text) & DOMAIN_KEYWORDS)
                windows.append({
                    "id": window_id,
                    "startTime": start_time,
                    "endTime": end_time,
                    "timestampLabel": format_timestamp(start_time),
                    "text": transcript_text,
                    "keywords": tokenize(transcript_text),
                    "domainHits": domain_hits,
                    "score": domain_hits + min(len(transcript_text) / 220, 3.0),
                })
                window_id += 1
            start_time = end_time

    return windows


def score_window_for_section(window: dict[str, Any], section: dict[str, str]) -> float:
    section_keywords = tokenize(f"{section['title']} {section['content']}")
    overlap = len(window["keywords"] & section_keywords)
    phrase_bonus = 2.0 if section["title"].lower() in window["text"].lower() else 0.0
    return overlap * 2.5 + window["domainHits"] * 0.5 + phrase_bonus


def ranked_fallback_labels_for_window(window: dict[str, Any]) -> list[str]:
    scored_labels: list[tuple[float, int, str]] = []

    for index, (label, keywords) in enumerate(FALLBACK_SECTION_LABELS):
        overlap = window["keywords"] & keywords
        if len(overlap) < 2:
            continue
        specificity = len(overlap) / max(len(keywords), 1)
        scored_labels.append((len(overlap) * 3 + specificity, -index, label))

    for index, (label, keywords) in enumerate(SINGLE_KEYWORD_SECTION_LABELS):
        overlap = window["keywords"] & keywords
        if not overlap:
            continue
        scored_labels.append((1 + len(overlap), -index - 100, label))

    ranked: list[str] = []
    seen: set[str] = set()
    for _, _, label in sorted(scored_labels, reverse=True):
        lowered = label.lower()
        if lowered in seen:
            continue
        seen.add(lowered)
        ranked.append(label)

    return ranked


def source_fallback_label(source_title: str) -> str:
    source_tokens = tokenize(source_title)
    if "psychology" in source_tokens:
        return "Trading Psychology and Emotional Control"
    if "patience" in source_tokens:
        return "Patience and Execution Discipline"
    if source_tokens & {"volume", "profile"}:
        return "Volume, Value, and Market Participation"
    if source_tokens & {"expansion", "expansions"}:
        return "Expansion, Compression, and Structure"
    if source_tokens & {"risk", "leverage"}:
        return "Risk, Leverage, and Position Sizing"

    return "Trading Decision Process"


def fallback_label_for_window(
    window: dict[str, Any],
    source_title: str = "",
    used_titles: set[str] | None = None,
) -> str:
    used = used_titles or set()

    for label in ranked_fallback_labels_for_window(window):
        if label.lower() not in used:
            return label

    source_label = source_fallback_label(source_title)
    if source_label.lower() not in used:
        return source_label

    return ""


def representative_windows(
    windows: list[dict[str, Any]],
    max_sections: int,
) -> list[dict[str, Any]]:
    if len(windows) <= max_sections:
        return sorted(windows, key=lambda item: item["startTime"])

    timeline_start = min(window["startTime"] for window in windows)
    timeline_end = max(window["endTime"] for window in windows)
    span = max(timeline_end - timeline_start, 1.0)
    selected: list[dict[str, Any]] = []
    selected_ids: set[int] = set()

    for band_index in range(max_sections):
        band_start = timeline_start + span * band_index / max_sections
        band_end = timeline_start + span * (band_index + 1) / max_sections
        candidates = [
            window
            for window in windows
            if window["id"] not in selected_ids
            and band_start <= (window["startTime"] + window["endTime"]) / 2
            < band_end
        ]
        if not candidates:
            continue

        best = max(candidates, key=lambda item: (item["score"], len(item["text"])))
        selected.append(best)
        selected_ids.add(best["id"])

    return sorted(selected, key=lambda item: item["startTime"])


def normalize_seed_boundaries(
    seeds: list[dict[str, Any]],
    windows: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    ordered = sorted(seeds, key=lambda item: item["startTime"])
    timeline_end = max(
        [window["endTime"] for window in windows]
        + [seed["endTime"] for seed in ordered],
        default=0.0,
    )

    for index, seed in enumerate(ordered):
        next_start = (
            ordered[index + 1]["startTime"]
            if index + 1 < len(ordered)
            else timeline_end
        )
        seed["endTime"] = max(seed["startTime"], next_start)

    return ordered


def build_seed_sections(
    source_title: str,
    windows: list[dict[str, Any]],
    study_sections: list[dict[str, str]],
) -> list[dict[str, Any]]:
    seeds: list[dict[str, Any]] = []
    used_window_ids: set[int] = set()

    used_titles: set[str] = set()
    for section in study_sections:
        best_window: dict[str, Any] | None = None
        best_score = 0.0
        section_title = normalize_section_title(section["title"])
        if section_title.lower() in used_titles:
            continue

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
        used_titles.add(section_title.lower())
        seeds.append({
            "title": section_title,
            "startTime": best_window["startTime"],
            "endTime": best_window["endTime"],
            "timestampLabel": best_window["timestampLabel"],
            "studySummary": summarize_text(section["content"], 220),
            "transcriptExcerpt": summarize_text(best_window["text"], 320),
        })

        if len(seeds) >= LESSON_MAX_SECTIONS:
            break

    if seeds:
        return normalize_seed_boundaries(seeds, windows)

    selected_windows = representative_windows(windows, LESSON_MAX_SECTIONS)
    for window in selected_windows:
        title = fallback_label_for_window(window, source_title, used_titles)
        if not title:
            continue

        used_titles.add(title.lower())
        seeds.append({
            "title": title,
            "startTime": window["startTime"],
            "endTime": window["endTime"],
            "timestampLabel": window["timestampLabel"],
            "studySummary": summarize_text(window["text"], 220),
            "transcriptExcerpt": summarize_text(window["text"], 320),
        })

    return normalize_seed_boundaries(seeds, windows)


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


def lesson_topic_text(seeds: list[dict[str, Any]]) -> str:
    return " ".join(
        " ".join([
            seed.get("title", ""),
            seed.get("studySummary", ""),
            seed.get("transcriptExcerpt", ""),
        ]).lower()
        for seed in seeds
    )


def lesson_title_text(seeds: list[dict[str, Any]]) -> str:
    return " ".join(seed.get("title", "").lower() for seed in seeds)


def topic_matches(seeds: list[dict[str, Any]], keywords: set[str]) -> bool:
    return bool(tokenize(lesson_topic_text(seeds)) & keywords)


def is_order_flow_lesson(seeds: list[dict[str, Any]]) -> bool:
    title_tokens = tokenize(lesson_title_text(seeds))
    return bool(
        title_tokens
        & {
            "submission", "matching", "liquidity", "matched", "unmatched",
            "fill", "distribution", "orders", "equilibrium", "eq",
        }
    )


def build_fallback_summary(source_title: str, seeds: list[dict[str, Any]]) -> str:
    titles = list(dict.fromkeys(seed["title"] for seed in seeds))[:3]
    if not titles:
        return (
            f"{source_title} explains a TCM trading decision process and turns it into practical rules "
            "for reading evidence, planning a trade, and knowing when the original idea is invalid."
        )

    joined_titles = ", ".join(titles[:-1]) + (f", and {titles[-1]}" if len(titles) > 1 else titles[0])
    if not is_order_flow_lesson(seeds):
        return (
            f"{source_title} connects {joined_titles} into a practical decision process. "
            "The lesson shows what evidence to notice, how the mentor applies it before execution, "
            "and what should make a trader pause or revise the plan."
        )

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
            f"Treat {source_title} like a mentor-led decision lesson instead of a vocabulary list. "
            "Identify what the mentor notices, connect that evidence to the planned action, "
            "and state what would invalidate the read before considering execution."
        )

    first_titles = ", ".join(list(dict.fromkeys(seed["title"] for seed in seeds))[:3])
    if not is_order_flow_lesson(seeds):
        return (
            f"Treat {source_title} like a mentor walkthrough, not a search result. "
            f"The teaching flow moves through {first_titles}; at each step, identify the evidence the mentor uses, "
            "the decision that follows from it, and the condition that would make the trader stop or reassess."
        )

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
    if any(term in lowered for term in ("fear", "psychology", "emotion", "clarity", "discipline", "patience")):
        return f"Use {title.lower()} to separate an evidence-based decision from an emotional reaction before taking risk."
    if any(term in lowered for term in ("risk", "leverage", "position", "stop", "loss")):
        return f"Translate {title.lower()} into a defined risk limit and invalidation point before planning the entry."
    if any(term in lowered for term in ("volume", "value", "acceptance", "rejection", "participation")):
        return f"Read {title.lower()} as evidence of where the market is accepting trade or refusing to stay."
    if any(term in lowered for term in ("expansion", "compression", "fractal", "structure", "range")):
        return f"Place {title.lower()} inside the current market structure before projecting the next expansion."
    return f"Use {title.lower()} as one step in the mentor's decision process, not as a standalone signal."


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
    titles = lesson_title_text(seeds)

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
    if any(term in titles for term in ("fear", "psychology", "emotion", "clarity", "discipline")):
        candidates.extend([
            "Fear is not proof that the setup is wrong. It is a prompt to return to the chart evidence and the predefined risk.",
            "Confidence does not come from eliminating uncertainty. It comes from knowing the setup, invalidation, and acceptable loss before entry.",
        ])
    if any(term in titles for term in ("risk", "leverage", "position sizing", "stop")):
        candidates.append(
            "More conviction does not justify undefined risk. Position size still has to respect the invalidation point and account limit."
        )
    if any(term in titles for term in ("volume", "profile", "acceptance", "rejection")):
        candidates.append(
            "A single volume spike is not a complete trade signal. Its location and the market's response determine what it means."
        )
    if any(term in titles for term in ("expansion", "compression", "fractal", "structure")):
        candidates.append(
            "Expansion is not permission to chase. First identify the structure it left and the evidence needed for continuation."
        )

    if not candidates:
        candidates.append(
            "The lesson is not asking you to memorize labels. It is asking you to connect evidence, decision, risk, and invalidation in the right order."
        )
    if len(candidates) < 2:
        candidates.append(
            "One clue is not a complete setup. The observation still needs confirmation, a defined risk, and a condition that invalidates the idea."
        )

    return dedupe_text_items(candidates, 5)


def build_chart_reading_rules(seeds: list[dict[str, Any]]) -> list[str]:
    titles = lesson_topic_text(seeds)
    candidates: list[str] = []

    if is_order_flow_lesson(seeds):
        candidates.extend([
            "Mark the submission range before the matching session so you can compare intent with actual execution.",
            "Only promote a level to real liquidity after price trades back through it and matching is confirmed.",
            "Use the book high, low, and EQ as your first map for later fills, sweeps, and reactions.",
        ])
    elif any(term in titles for term in ("fear", "psychology", "emotion", "clarity", "discipline")):
        candidates.extend([
            "Write the setup evidence, invalidation, and acceptable loss before entry so emotion cannot silently rewrite the plan.",
            "When fear or confusion rises, pause and compare the live chart with the conditions that originally justified the trade.",
            "Treat hesitation after valid confirmation differently from hesitation caused by missing evidence.",
        ])
    elif any(term in titles for term in ("volume", "profile", "acceptance", "rejection")):
        candidates.extend([
            "Read volume at a location, not in isolation; compare participation with the structure price is testing.",
            "Use sustained trade around value as evidence of acceptance and a fast response away as evidence of rejection.",
            "Wait for price response to confirm what a volume event means before setting the directional expectation.",
        ])
    elif any(term in titles for term in ("expansion", "compression", "fractal", "structure")):
        candidates.extend([
            "Mark the range or compression that precedes expansion so the move has a structural origin.",
            "Separate a clean structural break from a temporary probe by checking whether price accepts beyond the boundary.",
            "Project objectives from the active structure and define the level that invalidates continuation.",
        ])
    else:
        candidates.extend([
            "Name the market evidence before naming the trade direction.",
            "Define the confirming condition and invalidation condition before entry.",
            "Use the mentor's sequence to move from observation to plan instead of treating one clue as a signal.",
        ])

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
    titles = lesson_topic_text(seeds)

    if any(term in titles for term in ("fear", "psychology", "emotion", "clarity", "discipline")):
        return dedupe_rule_items([
            {
                "ifYouSee": "fear rising while the original setup evidence remains valid",
                "thenExpect": "a pause to re-check the plan rather than an automatic exit or impulsive reversal",
                "because": "emotion is information about the trader, not new evidence about the market",
            },
            {
                "ifYouSee": "confusion about the setup, invalidation, or acceptable loss",
                "thenExpect": "the trader to reduce risk or stand aside",
                "because": "clarity has to exist before capital is committed",
            },
            {
                "ifYouSee": "the market violate the predefined invalidation condition",
                "thenExpect": "the thesis to be closed or reassessed",
                "because": "discipline means responding to contrary evidence instead of defending the original opinion",
            },
        ], 4)

    if any(term in titles for term in ("volume", "profile", "acceptance", "rejection")):
        return dedupe_rule_items([
            {
                "ifYouSee": "sustained participation and trade holding around a level",
                "thenExpect": "acceptance and further auction around that value",
                "because": "the market is spending time and volume there instead of immediately rejecting it",
            },
            {
                "ifYouSee": "a sharp response away from a tested value area",
                "thenExpect": "rejection to remain the working read until price reclaims it",
                "because": "price failed to attract continued participation at that location",
            },
        ], 4)

    if any(term in titles for term in ("expansion", "compression", "fractal", "structure")):
        return dedupe_rule_items([
            {
                "ifYouSee": "compression resolve with acceptance beyond its boundary",
                "thenExpect": "expansion toward the next structural objective",
                "because": "the market has left balance and is sustaining trade outside it",
            },
            {
                "ifYouSee": "a breakout return and hold back inside the prior range",
                "thenExpect": "the expansion thesis to weaken",
                "because": "price failed to maintain acceptance beyond the structure",
            },
        ], 4)

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

    if "bias" not in titles and "delivery" not in titles:
        rules = rules[:2] + rules[3:]
    if "unmatched" not in titles and "gap" not in titles and "fill" not in titles:
        rules = [rule for rule in rules if "gap between submission and matching" not in rule["ifYouSee"]]

    return dedupe_rule_items(rules, 4)


def build_diagnostic_questions(seeds: list[dict[str, Any]]) -> list[str]:
    titles = lesson_topic_text(seeds)
    if any(term in titles for term in ("fear", "psychology", "emotion", "clarity", "discipline")):
        questions = [
            "Which part of your reaction comes from new market evidence, and which part comes from fear or uncertainty?",
            "Can you state the setup, invalidation, and acceptable loss without adding a new rule after entry?",
            "What evidence would justify staying with the plan, and what evidence would require you to exit?",
            "Would you make the same decision if no open position or profit-and-loss number were visible?",
        ]
    elif any(term in titles for term in ("volume", "profile", "acceptance", "rejection")):
        questions = [
            "Where is the volume event occurring relative to value and the active structure?",
            "Does price show acceptance, rejection, or only a brief test at this location?",
            "What response would confirm your interpretation of participation here?",
            "What would invalidate the current acceptance or rejection read?",
        ]
    elif is_order_flow_lesson(seeds):
        questions = [
            "Where on the chart did submitted interest become matched liquidity instead of staying theoretical?",
            "Which level is the real book high, low, or EQ here, and what evidence proves it?",
            "What would invalidate your current bias read if the market handled this zone differently?",
            "If price returns to this book, who is most likely being filled or defended?",
        ]
    else:
        questions = [
            "What is the first piece of evidence the mentor identifies before forming a trade idea?",
            "How does that evidence change the plan rather than merely describe the chart?",
            "What confirmation is required before execution?",
            "What market behavior would invalidate the current interpretation?",
        ]

    for seed in seeds[:2]:
        questions.append(
            f"Which clip in the lesson best demonstrates {seed['title'].lower()}, and what should you notice first?"
        )

    return dedupe_text_items(questions, 6)


def build_practice_prompts(source_title: str, seeds: list[dict[str, Any]]) -> list[str]:
    titles = lesson_topic_text(seeds)
    if any(term in titles for term in ("fear", "psychology", "emotion", "clarity", "discipline")):
        prompts = [
            "Before a replay trade, write the setup evidence, invalidation, acceptable loss, and the emotion you expect to feel.",
            "Replay a difficult decision and pause when fear or confusion appears; separate new market evidence from your internal reaction.",
            "Review one losing trade and identify whether the plan failed or execution discipline failed.",
        ]
    elif any(term in titles for term in ("volume", "profile", "acceptance", "rejection")):
        prompts = [
            "Open a recent session and mark one accepted value area and one rejected value area with the price response that proves each label.",
            "Find a volume spike and explain what its location adds that the spike alone cannot tell you.",
            "Replay one lesson clip and narrate the evidence that confirms participation or rejection.",
        ]
    elif is_order_flow_lesson(seeds):
        prompts = [
            "Open a recent session and mark the submission range, the matching window, and the book high, low, and EQ.",
            "Find a day where submission and matching did not overlap cleanly, then write down where unfinished business was left behind.",
            "Replay one lesson clip and narrate the exact moment submitted prices became actionable liquidity.",
        ]
    else:
        prompts = [
            "Open a recent session and narrate the mentor's sequence from observation, to confirmation, to execution, to invalidation.",
            "Find one example where the setup evidence was present and one where a similar-looking setup lacked confirmation.",
            "Replay one lesson clip and pause before the mentor's conclusion so you can state the next decision yourself.",
        ]

    if seeds:
        prompts.append(
            f"Use {source_title} as your model and explain how {seeds[0]['title'].lower()} would change your trade plan before entry."
        )

    return dedupe_text_items(prompts, 4)


def build_glossary(seeds: list[dict[str, Any]]) -> list[dict[str, str]]:
    corpus = lesson_title_text(seeds)

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
    except urllib.error.HTTPError as exc:
        print(
            f"Anthropic lesson generation returned HTTP {exc.code}; using validated deterministic lesson",
            file=sys.stderr,
        )
        return None
    except (urllib.error.URLError, TimeoutError, KeyError, IndexError, json.JSONDecodeError) as exc:
        print(
            f"Anthropic lesson generation failed ({type(exc).__name__}); using validated deterministic lesson",
            file=sys.stderr,
        )
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

    section_titles: list[str] = []
    for section in sections:
        title = normalize_whitespace(section.get("title", ""))
        if title:
            section_titles.append(title.lower())
        section_summary = normalize_whitespace(section.get("summary", ""))
        transcript_excerpt = normalize_whitespace(section.get("transcriptExcerpt", ""))
        if not looks_like_concept_title(title):
            flags.append("section_title_fragment")
        if is_low_signal(section_summary):
            flags.append("section_summary_low_signal")
        if transcript_excerpt and jaccard_similarity(section_summary, transcript_excerpt) > 0.88:
            flags.append("section_summary_quote_like")

    if len(section_titles) != len(set(section_titles)):
        flags.append("duplicate_section_titles")

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
    quality = validate_lesson_payload(fallback)
    non_blocking_flags = {"section_summary_quote_like"}
    only_non_blocking_flags = set(quality["flags"]).issubset(non_blocking_flags)
    status = "ready" if quality["valid"] or (quality["score"] >= 0.88 and only_non_blocking_flags) else "fallback"

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
    temp_lesson_path = lesson_path.with_suffix(".json.tmp")
    with open(temp_lesson_path, "w", encoding="utf-8") as handle:
        json.dump(lesson, handle, indent=2)
    temp_lesson_path.replace(lesson_path)

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
