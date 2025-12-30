#!/usr/bin/env python3
"""
YouTube to NinjaTrader Code Generator with Skill Extraction

Automates an enhanced 10-step workflow for generating NinjaTrader code from YouTube videos
with automatic skill library management:

PHASE 1 - Analysis:
  1. Fetch transcript from YouTube video
  2. Analyze trading concepts in transcript
  3. Map concepts to existing NinjaTrader skills

PHASE 2 - Skill Extraction (NEW):
  3a. Check which concepts are new vs existing
  3b. Extract metadata for new skills
  3c. Save new skills to library with source tracking
  3d. Resolve skill dependencies

PHASE 3 - Code Generation:
  4. Classify content type (indicator vs strategy)
  5. Generate C# code using NinjaTrader templates + skill code
  6. Save files to scripts-output/Indicators/ or scripts-output/Strategies/
  7. Save metadata to database

PHASE 4 - Tracking:
  10. Record video as processed (prevents duplicates)

USAGE:
    uv run python -m runtime.harness scripts/generate_from_youtube.py \\
        --url "https://youtube.com/watch?v=..." \\
        --project-id 1 \\
        [--type auto|indicator|strategy] \\
        [--output-dir "scripts-output"] \\
        [--extract-skills | --no-extract-skills] \\
        [--confirm-skills] \\
        [--skip-generation]

EXAMPLES:
    # Full pipeline with skill extraction (default)
    uv run python -m runtime.harness scripts/generate_from_youtube.py \\
        --url "https://youtube.com/watch?v=abc123" \\
        --project-id 1

    # Extract skills only (no code generation)
    uv run python -m runtime.harness scripts/generate_from_youtube.py \\
        --url "https://youtube.com/watch?v=xyz789" \\
        --project-id 1 \\
        --skip-generation

    # Interactive mode - confirm each skill before saving
    uv run python -m runtime.harness scripts/generate_from_youtube.py \\
        --url "https://youtube.com/watch?v=def456" \\
        --project-id 1 \\
        --confirm-skills

    # Legacy mode - code gen only, no skill extraction
    uv run python -m runtime.harness scripts/generate_from_youtube.py \\
        --url "https://youtube.com/watch?v=ghi789" \\
        --project-id 1 \\
        --no-extract-skills
"""

import argparse
import hashlib
import json
import os
import re
import sqlite3
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

# MCP tool calling - will be available via runtime.harness
try:
    from runtime.mcp_client import call_mcp_tool
except ImportError:
    # Fallback for direct execution (testing)
    def call_mcp_tool(tool_id: str, params: dict) -> dict:
        raise RuntimeError(
            "MCP client not available. Run via: "
            "uv run python -m runtime.harness scripts/generate_from_youtube.py ..."
        )


# =============================================================================
# Constants
# =============================================================================

# Project root (relative to script location)
PROJECT_ROOT = Path(__file__).parent.parent.resolve()
DB_PATH = PROJECT_ROOT / "data" / "builder.db"
DEFAULT_OUTPUT_DIR = PROJECT_ROOT / "scripts-output"

# Maximum transcript length to process (chars)
MAX_TRANSCRIPT_LENGTH = 50000

# Trading concept keywords for analysis
CONCEPT_KEYWORDS = {
    "entry_patterns": [
        "sweep", "liquidity grab", "liquidity sweep", "stop hunt",
        "break of structure", "bos", "change of character", "choch",
        "order block", "ob", "bullish order block", "bearish order block",
        "fair value gap", "fvg", "imbalance",
        "cisd", "change in state of delivery",
        "breaker", "breaker block", "mitigation block",
        "inducement", "equal highs", "equal lows",
        "turtle soup", "failure swing",
    ],
    "risk_management": [
        "stop loss", "stoploss", "stop-loss", "sl",
        "take profit", "takeprofit", "take-profit", "tp",
        "breakeven", "break even", "be",
        "risk reward", "risk to reward", "r:r", "rr",
        "position size", "position sizing", "lot size",
        "trail", "trailing stop", "trailing",
        "partial", "scale out", "scale in",
    ],
    "market_structure": [
        "bias", "daily bias", "session bias",
        "trend", "trending", "range", "ranging", "consolidation",
        "direction", "directional",
        "support", "resistance", "s/r", "s&r",
        "session", "london", "new york", "asian", "asia",
        "higher high", "hh", "higher low", "hl",
        "lower high", "lh", "lower low", "ll",
        "swing high", "swing low", "swing point",
        "premium", "discount", "equilibrium",
    ],
    "indicators": [
        "vwap", "volume weighted average price",
        "poc", "point of control", "value area",
        "atr", "average true range",
        "moving average", "ma", "ema", "sma",
        "rsi", "relative strength",
        "macd", "momentum",
        "fibonacci", "fib", "fib levels",
        "volume", "volume profile",
        "bollinger", "bands",
        "delta", "cumulative delta",
    ],
}

# Keywords for content type classification
INDICATOR_KEYWORDS = [
    "how to calculate", "how to identify", "how to detect",
    "how to measure", "measuring", "calculating",
    "indicator shows", "indicator plots",
    "draw", "plot", "display", "visualize",
    "identify when", "detect when", "signal when",
]

STRATEGY_KEYWORDS = [
    "when to enter", "entry signal", "entry trigger",
    "take profit", "exit", "close position",
    "stop loss", "stop out",
    "full strategy", "complete strategy", "complete system",
    "trading system", "trading plan",
    "backtest", "forward test",
    "win rate", "profit factor",
    "trade management", "position management",
]


# =============================================================================
# Step 1: Fetch Transcript
# =============================================================================

def fetch_transcript(url: str) -> dict:
    """
    Fetch transcript from YouTube video using MCP tool.

    Args:
        url: YouTube video URL

    Returns:
        dict with transcript text and metadata

    Raises:
        RuntimeError: If transcript cannot be fetched
    """
    print(f"\n[1/7] Fetching transcript...")

    # Validate URL format
    if not url:
        raise RuntimeError("Invalid URL: URL cannot be empty")

    if "youtube.com" not in url and "youtu.be" not in url:
        raise RuntimeError(
            f"Invalid YouTube URL: {url}\n"
            "Expected format: https://youtube.com/watch?v=... or https://youtu.be/..."
        )

    try:
        result = call_mcp_tool("youtube-transcript__get_transcript", {"url": url})

        # Parse MCP response
        if isinstance(result, str):
            data = json.loads(result)
        elif isinstance(result, dict):
            data = result
        else:
            raise RuntimeError(f"Unexpected response type: {type(result)}")

        # Check for errors
        if "error" in data:
            error_msg = data["error"]
            if "no captions" in error_msg.lower() or "no transcript" in error_msg.lower():
                raise RuntimeError("Video has no captions enabled. Cannot fetch transcript.")
            raise RuntimeError(f"MCP error: {error_msg}")

        transcript = data.get("transcript", "")
        if not transcript:
            raise RuntimeError("Empty transcript returned. Video may not have captions.")

        # Truncate if too long
        if len(transcript) > MAX_TRANSCRIPT_LENGTH:
            transcript = transcript[:MAX_TRANSCRIPT_LENGTH]
            print(f"  (Truncated to {MAX_TRANSCRIPT_LENGTH} characters)")

        char_count = data.get("character_count", len(transcript))
        print(f"  Fetched {char_count:,} characters")

        return {
            "transcript": transcript,
            "segments": data.get("segments", 0),
            "duration_seconds": data.get("duration_seconds", 0),
            "character_count": char_count,
        }

    except json.JSONDecodeError as e:
        raise RuntimeError(f"Failed to parse MCP response: {e}")
    except Exception as e:
        if "MCP" in str(e) or "mcp" in str(e):
            raise RuntimeError(
                f"MCP server not running or not responding: {e}\n"
                "Make sure youtube-transcript MCP server is configured in .mcp.json"
            )
        raise


# =============================================================================
# Step 2: Analyze Trading Concepts
# =============================================================================

def analyze_concepts(transcript: str) -> dict:
    """
    Analyze transcript to extract trading concepts.

    Args:
        transcript: Full transcript text

    Returns:
        dict mapping concept categories to found keywords
    """
    print(f"\n[2/7] Analyzing trading concepts...")

    transcript_lower = transcript.lower()
    found_concepts = {}

    for category, keywords in CONCEPT_KEYWORDS.items():
        found = []
        for keyword in keywords:
            # Use word boundaries for more accurate matching
            pattern = r'\b' + re.escape(keyword.lower()) + r'\b'
            if re.search(pattern, transcript_lower):
                # Normalize keyword (remove duplicates like "stop loss" and "stoploss")
                normalized = keyword.replace("-", " ").replace("_", " ").lower()
                if normalized not in [k.replace("-", " ").replace("_", " ").lower() for k in found]:
                    found.append(keyword)

        if found:
            found_concepts[category] = found

    # Print found concepts
    if found_concepts:
        print(f"  Found concepts:")
        for category, keywords in found_concepts.items():
            print(f"    - {category}: {', '.join(keywords)}")
    else:
        print(f"  No specific trading concepts detected")

    return found_concepts


# =============================================================================
# Step 3: Get Relevant Skills
# =============================================================================

def get_relevant_skills(concepts: dict) -> list:
    """
    Search for matching skills in the NinjaTrader skills library.

    Args:
        concepts: dict of found concepts from analyze_concepts()

    Returns:
        list of matching skill records
    """
    print(f"\n[3/7] Searching for matching skills...")

    all_skills = []
    searched_terms = set()

    # Flatten concepts into search terms
    for category, keywords in concepts.items():
        for keyword in keywords[:3]:  # Limit to top 3 per category
            if keyword not in searched_terms:
                searched_terms.add(keyword)

    if not searched_terms:
        # Fallback: search for common terms
        searched_terms = {"entry", "exit", "indicator"}

    # Search for each term
    for term in searched_terms:
        try:
            result = call_mcp_tool(
                "nt-skills__get_relevant_skills",
                {"query": term, "limit": 3}
            )

            # Parse response (may be formatted text, not JSON)
            if isinstance(result, str):
                # Try to extract skill names from formatted text
                # The MCP returns formatted markdown, not raw JSON
                if "Found" in result and "skill" in result.lower():
                    # Extract skill info from formatted response
                    skill_matches = re.findall(
                        r'\*\*([^*]+)\*\*\s*\(([^)]+)\)',
                        result
                    )
                    for name, category in skill_matches:
                        skill = {
                            "name": name.strip(),
                            "category": category.strip(),
                            "search_term": term,
                        }
                        # Avoid duplicates
                        if not any(s["name"] == skill["name"] for s in all_skills):
                            all_skills.append(skill)

        except Exception as e:
            # Log but continue - skills are enhancement, not required
            print(f"    Warning: Could not search for '{term}': {e}")

    print(f"  Found {len(all_skills)} skill matches")

    return all_skills


# =============================================================================
# Step 3a: Check for New vs Existing Skills
# =============================================================================

def find_new_vs_existing_skills(concepts: dict, transcript: str) -> dict:
    """
    For each detected concept, check if it already exists in the skills library.

    Args:
        concepts: dict of found concepts from analyze_concepts()
        transcript: Full transcript for keyword extraction

    Returns:
        dict with:
            - new_skills: concepts that should be created as new skills
            - existing_skills: concepts that match existing skills
            - ambiguous: concepts needing user decision
            - skip: concepts that are exact matches (don't need action)
    """
    print(f"\n[3a/10] Checking for new vs existing skills...")

    results = {
        "new_skills": [],      # score < 0.40 - create new
        "existing_skills": [], # score 0.70-0.84 - update existing
        "ambiguous": [],       # score 0.40-0.69 - ask user
        "skip": [],            # score > 0.85 - exact match, skip
    }

    # Common abbreviations and short terms to skip (not meaningful skills)
    SKIP_ABBREVIATIONS = {
        "be", "sl", "tp", "rr", "hh", "hl", "lh", "ll", "ma", "ema", "sma",
        "fvg", "ob", "bos", "fib", "rsi", "atr", "poc", "s/r", "s&r", "r:r",
    }

    # Flatten concepts into individual items to check
    concepts_to_check = []
    for category, keywords in concepts.items():
        for keyword in keywords[:5]:  # Limit to top 5 per category
            # Skip short abbreviations (< 3 chars or in skip list)
            keyword_lower = keyword.lower()
            if len(keyword) < 3 or keyword_lower in SKIP_ABBREVIATIONS:
                print(f"    Skipping abbreviation: '{keyword}'")
                continue

            concepts_to_check.append({
                "name": keyword,
                "category": category,
                "keywords": [keyword] + _extract_related_keywords(keyword, transcript),
            })

    if not concepts_to_check:
        print(f"  No concepts to check (all were abbreviations)")
        return results

    checked = 0
    for concept in concepts_to_check:
        try:
            result = call_mcp_tool(
                "nt-skills__check_skill_exists",
                {
                    "concept_name": concept["name"],
                    "keywords": concept["keywords"],
                }
            )

            # Parse response
            if isinstance(result, str):
                data = json.loads(result)
            elif isinstance(result, dict):
                data = result
            else:
                continue

            # MCP returns match_score (not score)
            score = data.get("match_score", data.get("score", 0))
            action = data.get("suggested_action", "create_new")
            # MCP returns existing_skill (not best_match)
            existing_skill = data.get("existing_skill", data.get("best_match"))

            concept["score"] = score
            concept["action"] = action
            concept["existing_match"] = existing_skill

            # Classify based on score:
            # > 0.70: Very likely exists, skip or update
            # 0.35-0.70: Likely related, mark as ambiguous
            # < 0.35: Likely new skill
            if action == "skip" or score > 0.70:
                results["skip"].append(concept)
            elif action == "update" or (0.50 <= score <= 0.70):
                results["existing_skills"].append(concept)
            elif action == "ask_user" or (0.35 <= score < 0.50):
                results["ambiguous"].append(concept)
            else:  # create_new or score < 0.35
                results["new_skills"].append(concept)

            checked += 1

        except Exception as e:
            # If check fails, default to creating new skill
            concept["score"] = 0
            concept["action"] = "create_new"
            concept["error"] = str(e)
            results["new_skills"].append(concept)

    print(f"  Checked {checked} concepts:")
    print(f"    - New skills to create: {len(results['new_skills'])}")
    print(f"    - Existing to update: {len(results['existing_skills'])}")
    print(f"    - Ambiguous (needs review): {len(results['ambiguous'])}")
    print(f"    - Skip (exact match): {len(results['skip'])}")

    return results


def _extract_related_keywords(concept: str, transcript: str) -> list:
    """Extract related keywords from transcript for a concept."""
    keywords = []
    transcript_lower = transcript.lower()

    # Find sentences containing the concept
    concept_lower = concept.lower()
    sentences = transcript_lower.split('.')

    for sentence in sentences:
        if concept_lower in sentence:
            # Extract potential keywords (words > 3 chars)
            words = re.findall(r'\b[a-z]{4,}\b', sentence)
            for word in words:
                if word != concept_lower and word not in keywords:
                    keywords.append(word)
                if len(keywords) >= 5:
                    break

    return keywords[:5]


# =============================================================================
# Step 3b: Extract Skill Metadata from Concepts
# =============================================================================

def extract_skill_from_concept(
    concept: dict,
    transcript: str,
    video_url: str,
) -> dict:
    """
    Use LLM to extract full skill metadata from a concept.

    Args:
        concept: dict with name, category, keywords
        transcript: Full transcript for context
        video_url: Source video URL

    Returns:
        dict with skill metadata ready for saving
    """
    # For now, construct skill metadata from available data
    # In a full implementation, this would call an LLM to generate
    # description, code snippets, etc.

    concept_name = concept["name"]
    category = concept["category"]

    # Determine NinjaTrader category mapping
    category_map = {
        "entry_patterns": "Entry Patterns",
        "risk_management": "Risk Management",
        "market_structure": "Market Analysis",
        "indicators": "Indicators",
    }
    nt_category = category_map.get(category, "Trading Concepts")

    # Extract context from transcript
    context = _extract_context_around_concept(concept_name, transcript)

    # Generate description from context
    description = f"Trading concept: {concept_name}. "
    if context:
        # Use first 200 chars of context as description basis
        description += context[:200].strip()
        if len(context) > 200:
            description += "..."

    # Generate basic code snippet placeholder
    safe_name = re.sub(r'[^a-zA-Z0-9]', '', concept_name.title())
    code_snippet = f"""// {concept_name} Detection
// TODO: Implement {concept_name} logic based on video explanation
private bool Check{safe_name}()
{{
    // Placeholder - implement based on video teaching
    return false;
}}"""

    return {
        "name": concept_name.title(),
        "category": nt_category,
        "subcategory": None,
        "description": description,
        "code_snippet": code_snippet,
        "variables": [],
        "keywords": concept.get("keywords", [concept_name]),
        "complexity": "medium",
        "dependencies": [],
        "source_type": "youtube",
        "source_url": video_url,
        "source_title": f"YouTube: {concept_name}",
        "extraction_confidence": 0.6,  # Moderate confidence for auto-extraction
    }


def _extract_context_around_concept(concept: str, transcript: str, chars: int = 500) -> str:
    """Extract surrounding context for a concept from transcript."""
    concept_lower = concept.lower()
    transcript_lower = transcript.lower()

    idx = transcript_lower.find(concept_lower)
    if idx == -1:
        return ""

    start = max(0, idx - chars // 2)
    end = min(len(transcript), idx + len(concept) + chars // 2)

    return transcript[start:end]


# =============================================================================
# Step 3c: Save New Skills
# =============================================================================

def save_new_skills(
    new_skills: list,
    transcript: str,
    video_url: str,
    confirm: bool = False,
) -> list:
    """
    Save extracted skills to the library using save_skill_with_source.

    Args:
        new_skills: list of concept dicts to save
        transcript: Full transcript for metadata extraction
        video_url: Source video URL
        confirm: If True, ask for confirmation before each save

    Returns:
        list of saved skill IDs
    """
    print(f"\n[3c/10] Saving {len(new_skills)} new skills...")

    saved_ids = []

    for concept in new_skills:
        # Extract full skill metadata
        skill_data = extract_skill_from_concept(concept, transcript, video_url)

        if confirm:
            print(f"\n  Skill: {skill_data['name']}")
            print(f"  Category: {skill_data['category']}")
            print(f"  Description: {skill_data['description'][:100]}...")
            response = input("  Save this skill? [Y/n]: ").strip().lower()
            if response == 'n':
                print(f"  Skipped")
                continue

        try:
            result = call_mcp_tool(
                "nt-skills__save_skill_with_source",
                skill_data
            )

            # Parse response for skill_id
            if isinstance(result, str):
                data = json.loads(result)
            elif isinstance(result, dict):
                data = result
            else:
                data = {}

            skill_id = data.get("skill_id")
            if skill_id:
                saved_ids.append(skill_id)
                print(f"    Saved: {skill_data['name']} (ID: {skill_id})")
            else:
                print(f"    Saved: {skill_data['name']}")

        except Exception as e:
            print(f"    Warning: Could not save '{skill_data['name']}': {e}")

    print(f"  Saved {len(saved_ids)} new skills")
    return saved_ids


# =============================================================================
# Step 3d: Resolve Skill Dependencies
# =============================================================================

def resolve_all_dependencies(skill_ids: list) -> dict:
    """
    Resolve dependencies for all selected skills.

    Args:
        skill_ids: list of skill IDs to resolve

    Returns:
        dict with:
            - skills: list of all skills including dependencies
            - dependency_order: ordered list for code generation
    """
    print(f"\n[3d/10] Resolving skill dependencies...")

    all_skills = []
    seen_ids = set()
    dependency_order = []

    for skill_id in skill_ids:
        if skill_id in seen_ids:
            continue

        try:
            result = call_mcp_tool(
                "nt-skills__get_skill_with_dependencies",
                {"skill_id": skill_id}
            )

            if isinstance(result, str):
                data = json.loads(result)
            elif isinstance(result, dict):
                data = result
            else:
                continue

            # Get main skill
            skill = data.get("skill")
            if skill and skill.get("id") not in seen_ids:
                seen_ids.add(skill.get("id"))
                all_skills.append(skill)

            # Get dependencies in order
            dep_order = data.get("dependency_order", [])
            for dep_skill in dep_order:
                dep_id = dep_skill.get("id")
                if dep_id and dep_id not in seen_ids:
                    seen_ids.add(dep_id)
                    all_skills.append(dep_skill)
                    dependency_order.append(dep_skill)

        except Exception as e:
            print(f"    Warning: Could not resolve dependencies for ID {skill_id}: {e}")

    # Add main skills at the end (after their dependencies)
    for skill_id in skill_ids:
        for skill in all_skills:
            if skill.get("id") == skill_id and skill not in dependency_order:
                dependency_order.append(skill)

    print(f"  Resolved {len(all_skills)} total skills ({len(skill_ids)} primary + {len(all_skills) - len(skill_ids)} dependencies)")

    return {
        "skills": all_skills,
        "dependency_order": dependency_order,
    }


# =============================================================================
# Step 10: Record Video Processing
# =============================================================================

def record_video_processed(
    url: str,
    title: str,
    skills_extracted: list,
    skills_matched: list,
) -> int:
    """
    Record that a video has been processed to prevent duplicates.

    Args:
        url: YouTube video URL
        title: Video title (if known)
        skills_extracted: list of skill IDs created from this video
        skills_matched: list of skill IDs that matched existing

    Returns:
        Database ID of the record
    """
    print(f"\n[10/10] Recording video processing...")

    if not DB_PATH.exists():
        print(f"  Warning: Database not found, skipping video tracking")
        return 0

    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()

        # Check if video already processed
        cursor.execute(
            "SELECT id FROM processed_videos WHERE url = ?",
            (url,)
        )
        existing = cursor.fetchone()

        if existing:
            # Update existing record
            cursor.execute('''
                UPDATE processed_videos
                SET skills_extracted = ?,
                    skills_matched = ?,
                    processing_status = 'reprocessed',
                    processed_at = CURRENT_TIMESTAMP
                WHERE url = ?
            ''', (
                json.dumps(skills_extracted),
                json.dumps(skills_matched),
                url,
            ))
            record_id = existing[0]
            print(f"  Updated existing record (ID: {record_id})")
        else:
            # Insert new record
            cursor.execute('''
                INSERT INTO processed_videos (
                    url,
                    title,
                    skills_extracted,
                    skills_matched,
                    processing_status
                ) VALUES (?, ?, ?, ?, ?)
            ''', (
                url,
                title,
                json.dumps(skills_extracted),
                json.dumps(skills_matched),
                "completed",
            ))
            record_id = cursor.lastrowid
            print(f"  Recorded new video (ID: {record_id})")

        conn.commit()
        conn.close()
        return record_id

    except sqlite3.Error as e:
        print(f"  Warning: Could not record video processing: {e}")
        return 0


# =============================================================================
# Step 4: Classify Content Type
# =============================================================================

def classify_content_type(transcript: str, concepts: dict, force_type: str = "auto") -> str:
    """
    Classify the content as indicator or strategy.

    Args:
        transcript: Full transcript text
        concepts: Found concepts from analyze_concepts()
        force_type: "auto", "indicator", or "strategy"

    Returns:
        "indicator" or "strategy"
    """
    print(f"\n[4/7] Classifying content type...")

    if force_type in ("indicator", "strategy"):
        print(f"  Type: {force_type} (forced)")
        return force_type

    transcript_lower = transcript.lower()

    # Count keyword matches
    indicator_score = 0
    strategy_score = 0

    for keyword in INDICATOR_KEYWORDS:
        if keyword.lower() in transcript_lower:
            indicator_score += 1

    for keyword in STRATEGY_KEYWORDS:
        if keyword.lower() in transcript_lower:
            strategy_score += 1

    # Consider concepts
    if "risk_management" in concepts:
        strategy_score += 2  # Risk management strongly suggests strategy

    if "entry_patterns" in concepts:
        strategy_score += 1

    if "indicators" in concepts and len(concepts.get("indicators", [])) > 2:
        indicator_score += 1

    # Determine type
    if strategy_score > indicator_score:
        content_type = "strategy"
    elif indicator_score > strategy_score:
        content_type = "indicator"
    else:
        # Default to strategy if concepts include entry patterns or risk
        if "entry_patterns" in concepts or "risk_management" in concepts:
            content_type = "strategy"
        else:
            content_type = "indicator"

    print(f"  Type: {content_type} (indicator_score={indicator_score}, strategy_score={strategy_score})")

    return content_type


# =============================================================================
# Step 5: Generate Code
# =============================================================================

def sanitize_name(name: str) -> str:
    """Convert string to valid C# identifier."""
    # Remove non-alphanumeric chars, capitalize words
    words = re.sub(r'[^a-zA-Z0-9\s]', '', name).split()
    return ''.join(word.capitalize() for word in words)


def generate_indicator_code(
    name: str,
    description: str,
    concepts: dict,
    skills: list,
    url: str,
) -> str:
    """
    Generate NinjaTrader Indicator C# code.

    Args:
        name: Indicator name (will be sanitized)
        description: Brief description
        concepts: Found trading concepts
        skills: Matched skills
        url: Source YouTube URL

    Returns:
        C# code string
    """
    safe_name = sanitize_name(name)
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # Build concept comments
    concept_comments = []
    for category, keywords in concepts.items():
        concept_comments.append(f"//   {category}: {', '.join(keywords)}")
    concept_section = "\n".join(concept_comments) if concept_comments else "//   (none detected)"

    # Build skills reference
    skill_comments = []
    for skill in skills[:5]:  # Limit to 5
        skill_comments.append(f"//   - {skill['name']} ({skill['category']})")
    skill_section = "\n".join(skill_comments) if skill_comments else "//   (none matched)"

    code = f'''//
// {safe_name}Indicator
//
// Generated from YouTube: {url}
// Generated at: {timestamp}
//
// Trading concepts detected:
{concept_section}
//
// Related skills:
{skill_section}
//
// NOTE: This is a template. Review and refine the logic before use.
//

#region Using declarations
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.ComponentModel.DataAnnotations;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Input;
using System.Windows.Media;
using System.Xml.Serialization;
using NinjaTrader.Cbi;
using NinjaTrader.Gui;
using NinjaTrader.Gui.Chart;
using NinjaTrader.Gui.SuperDom;
using NinjaTrader.Gui.Tools;
using NinjaTrader.Data;
using NinjaTrader.NinjaScript;
using NinjaTrader.Core.FloatingPoint;
using NinjaTrader.NinjaScript.DrawingTools;
#endregion

namespace NinjaTrader.NinjaScript.Indicators
{{
    public class {safe_name}Indicator : Indicator
    {{
        #region Variables
        // TODO: Add your indicator variables here
        // Example: private Series<double> signalSeries;
        #endregion

        protected override void OnStateChange()
        {{
            if (State == State.SetDefaults)
            {{
                Description                 = @"{description}";
                Name                        = "{safe_name}";
                Calculate                   = Calculate.OnBarClose;
                IsOverlay                   = true;
                DisplayInDataBox            = true;
                DrawOnPricePanel            = true;
                PaintPriceMarkers           = true;
                ScaleJustification          = NinjaTrader.Gui.Chart.ScaleJustification.Right;
                IsSuspendedWhileInactive    = true;

                // Default input parameters
                // TODO: Add your parameters here
                // Example: Period = 14;

                AddPlot(Brushes.DodgerBlue, "Signal");
            }}
            else if (State == State.Configure)
            {{
                // TODO: Add data series if needed
                // Example: AddDataSeries(BarsPeriodType.Minute, 5);
            }}
            else if (State == State.DataLoaded)
            {{
                // TODO: Initialize series if needed
                // Example: signalSeries = new Series<double>(this);
            }}
        }}

        protected override void OnBarUpdate()
        {{
            // Wait for enough bars
            if (CurrentBar < 20)
                return;

            // TODO: Implement your indicator logic here
            // Based on detected concepts:
{_indent_concepts(concepts, 12)}

            // Example calculation (replace with actual logic):
            double signalValue = Close[0];

            // Set the plot value
            Signal[0] = signalValue;
        }}

        #region Properties
        [Browsable(false)]
        [XmlIgnore]
        public Series<double> Signal
        {{
            get {{ return Values[0]; }}
        }}

        // TODO: Add your input parameters here
        // Example:
        // [NinjaScriptProperty]
        // [Range(1, int.MaxValue)]
        // [Display(Name = "Period", Order = 1, GroupName = "Parameters")]
        // public int Period {{ get; set; }}
        #endregion
    }}
}}

#region NinjaScript generated code. Neither change nor remove.

namespace NinjaTrader.NinjaScript.Indicators
{{
    public partial class Indicator : NinjaTrader.Gui.NinjaScript.IndicatorRenderBase
    {{
        private {safe_name}Indicator[] cache{safe_name}Indicator;
        public {safe_name}Indicator {safe_name}Indicator()
        {{
            return {safe_name}Indicator(Input);
        }}

        public {safe_name}Indicator {safe_name}Indicator(ISeries<double> input)
        {{
            if (cache{safe_name}Indicator != null)
                for (int idx = 0; idx < cache{safe_name}Indicator.Length; idx++)
                    if (cache{safe_name}Indicator[idx] != null && cache{safe_name}Indicator[idx].EqualsInput(input))
                        return cache{safe_name}Indicator[idx];
            return CacheIndicator<{safe_name}Indicator>(new {safe_name}Indicator(), input, ref cache{safe_name}Indicator);
        }}
    }}
}}

namespace NinjaTrader.NinjaScript.MarketAnalyzerColumns
{{
    public partial class MarketAnalyzerColumn : MarketAnalyzerColumnBase
    {{
        public Indicators.{safe_name}Indicator {safe_name}Indicator()
        {{
            return indicator.{safe_name}Indicator(Input);
        }}

        public Indicators.{safe_name}Indicator {safe_name}Indicator(ISeries<double> input)
        {{
            return indicator.{safe_name}Indicator(input);
        }}
    }}
}}

#endregion
'''
    return code


def generate_strategy_code(
    name: str,
    description: str,
    concepts: dict,
    skills: list,
    url: str,
) -> str:
    """
    Generate NinjaTrader Strategy C# code.

    Args:
        name: Strategy name (will be sanitized)
        description: Brief description
        concepts: Found trading concepts
        skills: Matched skills
        url: Source YouTube URL

    Returns:
        C# code string
    """
    safe_name = sanitize_name(name)
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # Build concept comments
    concept_comments = []
    for category, keywords in concepts.items():
        concept_comments.append(f"//   {category}: {', '.join(keywords)}")
    concept_section = "\n".join(concept_comments) if concept_comments else "//   (none detected)"

    # Build skills reference
    skill_comments = []
    for skill in skills[:5]:  # Limit to 5
        skill_comments.append(f"//   - {skill['name']} ({skill['category']})")
    skill_section = "\n".join(skill_comments) if skill_comments else "//   (none matched)"

    code = f'''//
// {safe_name}Strategy
//
// Generated from YouTube: {url}
// Generated at: {timestamp}
//
// Trading concepts detected:
{concept_section}
//
// Related skills:
{skill_section}
//
// NOTE: This is a template. Review and refine the logic before use.
// IMPORTANT: Backtest thoroughly before live trading!
//

#region Using declarations
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.ComponentModel.DataAnnotations;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Input;
using System.Windows.Media;
using System.Xml.Serialization;
using NinjaTrader.Cbi;
using NinjaTrader.Gui;
using NinjaTrader.Gui.Chart;
using NinjaTrader.Gui.SuperDom;
using NinjaTrader.Gui.Tools;
using NinjaTrader.Data;
using NinjaTrader.NinjaScript;
using NinjaTrader.Core.FloatingPoint;
using NinjaTrader.NinjaScript.Indicators;
using NinjaTrader.NinjaScript.DrawingTools;
#endregion

namespace NinjaTrader.NinjaScript.Strategies
{{
    public class {safe_name}Strategy : Strategy
    {{
        #region Variables
        // Risk management
        private int stopLossTicks = 20;
        private int profitTargetTicks = 40;

        // Trade state
        private bool inTrade = false;

        // TODO: Add your indicator references here
        // Example: private Indicators.YourIndicator indicator;
        #endregion

        protected override void OnStateChange()
        {{
            if (State == State.SetDefaults)
            {{
                Description                 = @"{description}";
                Name                        = "{safe_name}";
                Calculate                   = Calculate.OnBarClose;
                EntriesPerDirection         = 1;
                EntryHandling               = EntryHandling.AllEntries;
                IsExitOnSessionCloseStrategy = true;
                ExitOnSessionCloseSeconds   = 30;
                IsFillLimitOnTouch          = false;
                MaximumBarsLookBack         = MaximumBarsLookBack.TwoHundredFiftySix;
                OrderFillResolution         = OrderFillResolution.Standard;
                Slippage                    = 0;
                StartBehavior               = StartBehavior.WaitUntilFlat;
                TimeInForce                 = TimeInForce.Gtc;
                TraceOrders                 = false;
                RealtimeErrorHandling       = RealtimeErrorHandling.StopCancelClose;
                StopTargetHandling          = StopTargetHandling.PerEntryExecution;
                BarsRequiredToTrade         = 20;
                IsInstantiatedOnEachOptimizationIteration = true;

                // Default parameters
                StopLossTicks               = 20;
                ProfitTargetTicks           = 40;
            }}
            else if (State == State.Configure)
            {{
                // TODO: Add data series if needed
                // Example: AddDataSeries(BarsPeriodType.Minute, 5);
            }}
            else if (State == State.DataLoaded)
            {{
                // TODO: Initialize indicators
                // Example: indicator = Indicators.YourIndicator();
                // AddChartIndicator(indicator);
            }}
        }}

        protected override void OnBarUpdate()
        {{
            // Wait for enough bars
            if (CurrentBar < BarsRequiredToTrade)
                return;

            // Skip historical data if desired
            // if (State == State.Historical) return;

            // TODO: Implement your entry/exit logic here
            // Based on detected concepts:
{_indent_concepts(concepts, 12)}

            // ==========================================
            // ENTRY LOGIC
            // ==========================================

            if (Position.MarketPosition == MarketPosition.Flat)
            {{
                // TODO: Define your entry conditions
                bool longCondition = false;  // Replace with actual logic
                bool shortCondition = false; // Replace with actual logic

                if (longCondition)
                {{
                    EnterLong("LongEntry");
                    SetStopLoss(CalculationMode.Ticks, StopLossTicks);
                    SetProfitTarget(CalculationMode.Ticks, ProfitTargetTicks);
                }}
                else if (shortCondition)
                {{
                    EnterShort("ShortEntry");
                    SetStopLoss(CalculationMode.Ticks, StopLossTicks);
                    SetProfitTarget(CalculationMode.Ticks, ProfitTargetTicks);
                }}
            }}

            // ==========================================
            // EXIT LOGIC (beyond stop/target)
            // ==========================================

            if (Position.MarketPosition == MarketPosition.Long)
            {{
                // TODO: Add additional exit conditions
                // Example: if (CrossBelow(Close, SMA(20), 1)) ExitLong();
            }}
            else if (Position.MarketPosition == MarketPosition.Short)
            {{
                // TODO: Add additional exit conditions
                // Example: if (CrossAbove(Close, SMA(20), 1)) ExitShort();
            }}
        }}

        #region Properties
        [NinjaScriptProperty]
        [Range(1, int.MaxValue)]
        [Display(Name = "Stop Loss Ticks", Order = 1, GroupName = "Risk Management")]
        public int StopLossTicks
        {{
            get {{ return stopLossTicks; }}
            set {{ stopLossTicks = value; }}
        }}

        [NinjaScriptProperty]
        [Range(1, int.MaxValue)]
        [Display(Name = "Profit Target Ticks", Order = 2, GroupName = "Risk Management")]
        public int ProfitTargetTicks
        {{
            get {{ return profitTargetTicks; }}
            set {{ profitTargetTicks = value; }}
        }}

        // TODO: Add your custom parameters here
        // Example:
        // [NinjaScriptProperty]
        // [Range(1, int.MaxValue)]
        // [Display(Name = "Lookback Period", Order = 3, GroupName = "Parameters")]
        // public int LookbackPeriod {{ get; set; }}
        #endregion
    }}
}}
'''
    return code


def _indent_concepts(concepts: dict, indent: int) -> str:
    """Helper to format concepts as indented comments."""
    if not concepts:
        return " " * indent + "// No specific concepts detected"

    lines = []
    for category, keywords in concepts.items():
        lines.append(f"// {category}:")
        for kw in keywords[:3]:  # Limit per category
            lines.append(f"//   - {kw}")

    return "\n".join(" " * indent + line for line in lines)


def generate_code(
    content_type: str,
    concepts: dict,
    skills: list,
    url: str,
) -> tuple[str, str]:
    """
    Generate NinjaTrader code based on content type.

    Args:
        content_type: "indicator" or "strategy"
        concepts: Found trading concepts
        skills: Matched skills
        url: Source YouTube URL

    Returns:
        tuple of (code, filename)
    """
    print(f"\n[5/7] Generating {content_type} code...")

    # Generate name from concepts or default
    name_parts = ["YouTube", "Generated"]

    # Add primary concept to name
    if concepts.get("entry_patterns"):
        name_parts.append(concepts["entry_patterns"][0].replace(" ", "").title())
    elif concepts.get("indicators"):
        name_parts.append(concepts["indicators"][0].upper())

    name = "".join(name_parts)
    description = f"Auto-generated {content_type} from YouTube video analysis"

    if content_type == "indicator":
        code = generate_indicator_code(name, description, concepts, skills, url)
        filename = f"{sanitize_name(name)}Indicator.cs"
    else:
        code = generate_strategy_code(name, description, concepts, skills, url)
        filename = f"{sanitize_name(name)}Strategy.cs"

    print(f"  Code generated ({len(code):,} characters)")

    return code, filename


# =============================================================================
# Step 6: Save File
# =============================================================================

def save_file(
    code: str,
    filename: str,
    content_type: str,
    output_dir: Path,
) -> Path:
    """
    Save generated code to file.

    Args:
        code: C# code string
        filename: Filename (e.g., "MyIndicator.cs")
        content_type: "indicator" or "strategy"
        output_dir: Base output directory

    Returns:
        Full path to saved file
    """
    # Determine subdirectory
    if content_type == "indicator":
        subdir = output_dir / "Indicators"
    else:
        subdir = output_dir / "Strategies"

    # Ensure directory exists
    subdir.mkdir(parents=True, exist_ok=True)

    file_path = subdir / filename

    print(f"\n[6/7] Saving to {file_path}...")

    # Handle existing file
    if file_path.exists():
        # Add timestamp to avoid overwrite
        stem = file_path.stem
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"{stem}_{timestamp}.cs"
        file_path = subdir / filename
        print(f"  File exists, using: {filename}")

    file_path.write_text(code, encoding="utf-8")
    print(f"  File saved")

    return file_path


# =============================================================================
# Step 7: Save to Database
# =============================================================================

def save_to_database(
    project_id: int,
    name: str,
    description: str,
    file_path: Path,
    url: str,
    concepts: dict,
    skills: list,
) -> int:
    """
    Save script metadata to database.

    Args:
        project_id: Project ID
        name: Script name
        description: Brief description
        file_path: Path to saved file
        url: Source YouTube URL
        concepts: Found concepts
        skills: Matched skills

    Returns:
        Database ID of inserted record
    """
    print(f"\n[7/7] Saving to database...")

    if not DB_PATH.exists():
        raise RuntimeError(f"Database not found: {DB_PATH}")

    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()

        # Compute file hash
        file_content = file_path.read_bytes()
        file_hash = hashlib.sha256(file_content).hexdigest()

        # Build generation prompt (for reference)
        generation_prompt = f"Generated from YouTube: {url}"

        # Skills used (JSON)
        skills_used = json.dumps([s["name"] for s in skills])

        # Insert record
        cursor.execute('''
            INSERT INTO scripts (
                project_id,
                name,
                description,
                file_path,
                file_hash,
                generation_prompt,
                skills_used,
                deployment_status,
                compilation_status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            project_id,
            name,
            description,
            str(file_path),
            file_hash,
            generation_prompt,
            skills_used,
            "local",
            "untested",
        ))

        script_id = cursor.lastrowid
        conn.commit()
        conn.close()

        print(f"  Saved to database (ID: {script_id})")
        return script_id

    except sqlite3.Error as e:
        raise RuntimeError(f"Database error: {e}")


# =============================================================================
# Main
# =============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="Generate NinjaTrader code from YouTube video transcripts",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Auto-detect content type
  uv run python -m runtime.harness scripts/generate_from_youtube.py \\
      --url "https://youtube.com/watch?v=abc123" \\
      --project-id 1

  # Force strategy type
  uv run python -m runtime.harness scripts/generate_from_youtube.py \\
      --url "https://youtube.com/watch?v=xyz789" \\
      --project-id 1 \\
      --type strategy
        """,
    )

    parser.add_argument(
        "--url",
        required=True,
        help="YouTube video URL",
    )
    parser.add_argument(
        "--project-id",
        type=int,
        required=True,
        help="Project ID for database entry",
    )
    parser.add_argument(
        "--type",
        choices=["auto", "indicator", "strategy"],
        default="auto",
        help="Content type (default: auto-detect)",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help=f"Output directory (default: {DEFAULT_OUTPUT_DIR})",
    )
    parser.add_argument(
        "--extract-skills",
        action="store_true",
        default=True,
        help="Extract and save new skills from video (default: True)",
    )
    parser.add_argument(
        "--no-extract-skills",
        action="store_false",
        dest="extract_skills",
        help="Disable skill extraction",
    )
    parser.add_argument(
        "--confirm-skills",
        action="store_true",
        default=False,
        help="Ask for confirmation before saving each skill",
    )
    parser.add_argument(
        "--skip-generation",
        action="store_true",
        default=False,
        help="Extract skills only, skip code generation",
    )

    args = parser.parse_args()

    # Banner
    print("=" * 60)
    print(f"YouTube to NinjaTrader Pipeline")
    print(f"URL: {args.url}")
    print(f"Mode: {'Skill extraction only' if args.skip_generation else 'Full generation'}")
    print("=" * 60)

    try:
        # Track results for video processing record
        skills_extracted = []
        skills_matched = []

        # =====================================================================
        # PHASE 1: Transcript and Analysis
        # =====================================================================

        # Step 1: Fetch transcript
        transcript_data = fetch_transcript(args.url)
        transcript = transcript_data["transcript"]

        # Step 2: Analyze concepts
        concepts = analyze_concepts(transcript)

        # Step 3: Get relevant existing skills
        skills = get_relevant_skills(concepts)
        skills_matched = [s.get("id") for s in skills if s.get("id")]

        # =====================================================================
        # PHASE 2: Skill Extraction (if enabled)
        # =====================================================================

        if args.extract_skills:
            # Step 3a: Check which concepts are new vs existing
            skill_analysis = find_new_vs_existing_skills(concepts, transcript)

            # Step 3b: Save new skills
            if skill_analysis["new_skills"]:
                saved_ids = save_new_skills(
                    skill_analysis["new_skills"],
                    transcript,
                    args.url,
                    confirm=args.confirm_skills,
                )
                skills_extracted = saved_ids

                # Refresh skills list with newly created
                if saved_ids:
                    skills = get_relevant_skills(concepts)

            # Step 3c: Handle ambiguous and skipped
            if skill_analysis["ambiguous"] or skill_analysis["skip"]:
                if skill_analysis["skip"]:
                    print(f"\n  Skipped (matched existing skills):")
                    for concept in skill_analysis["skip"]:
                        match = concept.get("existing_match", {})
                        print(f"    - '{concept['name']}' -> '{match.get('name', 'unknown')}' (score: {concept.get('score', 0):.2f})")

                if skill_analysis["ambiguous"]:
                    print(f"\n  Ambiguous (similar to existing - skipped unless --confirm-skills):")
                    for concept in skill_analysis["ambiguous"]:
                        match = concept.get("existing_match", {})
                        print(f"    - '{concept['name']}' ~ '{match.get('name', 'unknown')}' (score: {concept.get('score', 0):.2f})")

            # Step 3d: Resolve dependencies for all relevant skills
            all_skill_ids = skills_matched + skills_extracted
            if all_skill_ids:
                dep_data = resolve_all_dependencies(all_skill_ids)
                # Use dependency-ordered skills for code generation
                if dep_data.get("dependency_order"):
                    skills = dep_data["dependency_order"]

        # =====================================================================
        # PHASE 3: Code Generation (if not skip)
        # =====================================================================

        if args.skip_generation:
            print()
            print("=" * 60)
            print("  Skill extraction complete (code generation skipped)")
            print("=" * 60)
            print()
            print(f"Skills extracted: {len(skills_extracted)}")
            print(f"Skills matched: {len(skills_matched)}")
            print()

            # Record video processing even without code generation
            record_video_processed(
                args.url,
                f"YouTube video",
                skills_extracted,
                skills_matched,
            )
            return

        # Step 4: Classify content type
        content_type = classify_content_type(transcript, concepts, args.type)

        # Step 5: Generate code
        code, filename = generate_code(content_type, concepts, skills, args.url)

        # Step 6: Save file
        file_path = save_file(code, filename, content_type, args.output_dir)

        # Step 7: Save to database
        name = filename.replace(".cs", "")
        description = f"Auto-generated {content_type} from YouTube video"
        script_id = save_to_database(
            args.project_id,
            name,
            description,
            file_path,
            args.url,
            concepts,
            skills,
        )

        # Step 10: Record video processing
        record_video_processed(
            args.url,
            f"YouTube: {name}",
            skills_extracted,
            skills_matched,
        )

        # Success summary
        print()
        print("=" * 60)
        print(f"  {content_type.upper()} generated successfully!")
        print("=" * 60)
        print()
        print(f"File: {file_path}")
        print(f"Type: {content_type}")
        print(f"Database ID: {script_id}")
        if skills_extracted:
            print(f"New skills saved: {len(skills_extracted)}")
        if skills_matched:
            print(f"Existing skills used: {len(skills_matched)}")
        print()
        print("Next steps:")
        print("1. Open in NinjaTrader and compile (F5 or Tools -> Compile)")
        print("2. Review generated code and refine logic")
        if content_type == "strategy":
            print("3. Backtest in Strategy Analyzer before live trading")
        else:
            print("3. Add to chart to verify behavior")
        print()

    except RuntimeError as e:
        print(f"\n  ERROR: {e}")
        sys.exit(1)
    except KeyboardInterrupt:
        print("\n\nCancelled by user")
        sys.exit(130)
    except Exception as e:
        print(f"\n  UNEXPECTED ERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
