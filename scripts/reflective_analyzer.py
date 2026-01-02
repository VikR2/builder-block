#!/usr/bin/env python3
"""
Reflective Analyzer - Trading Concept Understanding Engine

Processes video segments like a human learner would:
1. What is happening here? (observe visual + transcript)
2. How does this correlate to my skills DB? (query, match, find delta)
3. How does this tie into the bigger picture? (context, connections)
4. What is good and bad about this approach? (evaluate pros/cons)
5. Does this make sense to me? (confidence, open questions)

This creates accumulated understanding that enables informed code generation.

USAGE:
    from reflective_analyzer import ReflectiveAnalyzer

    analyzer = ReflectiveAnalyzer(db_path=Path("data/builder.db"))
    analysis = analyzer.analyze_segment(segment)

    # After all segments:
    understanding = analyzer.get_accumulated_understanding()
"""

import json
import sqlite3
import struct
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional, Any
import math

# Import from sibling module
try:
    from video_segmenter import Segment
except ImportError:
    # Fallback dataclass for standalone use
    @dataclass
    class Segment:
        segment_index: int
        start_seconds: float
        end_seconds: float
        trigger: str
        trigger_details: dict
        frame_path: Optional[str]
        transcript: str
        detected_categories: list[str]
        is_explanation: bool
        concept_density: float = 0.0


# =============================================================================
# Data Structures
# =============================================================================

@dataclass
class Observation:
    """What we observe in this segment."""
    visual: str  # What's on the chart
    concept: str  # What concept is being explained
    raw_transcript: str


@dataclass
class SkillCorrelation:
    """How this segment correlates to existing skills."""
    matched_skill_id: Optional[int]
    matched_skill_name: Optional[str]
    similarity: float
    delta: str  # What's new vs what we already know
    is_new_skill: bool


@dataclass
class ContextRole:
    """The role this segment plays in the bigger picture."""
    role: str  # entry_trigger, exit_rule, context_setup, risk_management
    connects_to_segments: list[int]
    builds_on: Optional[str]


@dataclass
class Evaluation:
    """Pros and cons of the approach shown."""
    pros: list[str]
    cons: list[str]


@dataclass
class Reflection:
    """Meta-analysis of our understanding."""
    confidence: float  # 0-1
    open_questions: list[str]


@dataclass
class SegmentAnalysis:
    """Complete analysis of a single segment."""
    segment_index: int
    timestamp: str
    observation: Observation
    skill_correlation: SkillCorrelation
    context_role: ContextRole
    evaluation: Evaluation
    reflection: Reflection
    extracted_parameters: dict


@dataclass
class AccumulatedUnderstanding:
    """Understanding built up across all segments."""
    strategy_flow: list[str]  # Sequence of concepts
    matched_skills: list[int]  # IDs of matched skills
    new_skills_needed: list[dict]  # Skills to create
    parameters: dict  # Extracted parameters
    overall_confidence: float
    open_questions: list[str]
    context_summary: str


# =============================================================================
# Skills DB Integration
# =============================================================================

class SkillsDB:
    """Interface to the NinjaTrader skills database."""

    EMBEDDING_DIM = 768

    def __init__(self, db_path: Path):
        self.db_path = db_path
        self._conn = None

    def _get_conn(self) -> sqlite3.Connection:
        if self._conn is None:
            self._conn = sqlite3.connect(self.db_path)
            self._conn.row_factory = sqlite3.Row
        return self._conn

    def close(self):
        if self._conn:
            self._conn.close()
            self._conn = None

    def search_by_keywords(self, keywords: list[str], limit: int = 5) -> list[dict]:
        """Search skills by keyword matching."""
        conn = self._get_conn()

        # FTS5 query
        query_terms = " OR ".join(keywords)
        try:
            rows = conn.execute("""
                SELECT s.id, s.name, s.category, s.description, s.code_snippet
                FROM skills s
                JOIN skills_fts fts ON s.id = fts.rowid
                WHERE skills_fts MATCH ?
                ORDER BY rank
                LIMIT ?
            """, (query_terms, limit)).fetchall()
        except sqlite3.OperationalError:
            # FTS table might not exist
            rows = []

        if not rows:
            # Fallback to LIKE search
            like_conditions = " OR ".join([f"name LIKE '%{kw}%' OR description LIKE '%{kw}%'" for kw in keywords])
            rows = conn.execute(f"""
                SELECT id, name, category, description, code_snippet
                FROM skills
                WHERE {like_conditions}
                LIMIT ?
            """, (limit,)).fetchall()

        return [dict(row) for row in rows]

    def search_by_embedding(self, query_text: str, limit: int = 5) -> list[dict]:
        """Search skills by semantic similarity using embeddings."""
        conn = self._get_conn()

        # Check if embeddings exist
        try:
            has_embeddings = conn.execute(
                "SELECT COUNT(*) FROM skills WHERE embedding IS NOT NULL"
            ).fetchone()[0]
        except sqlite3.OperationalError:
            has_embeddings = 0

        if not has_embeddings:
            return []

        # Generate query embedding via Ollama
        query_embedding = self._get_embedding(query_text)
        if not query_embedding:
            return []

        # In-memory cosine similarity (since Python sqlite3 can't load sqlite-vec)
        rows = conn.execute("""
            SELECT id, name, category, description, code_snippet, embedding
            FROM skills
            WHERE embedding IS NOT NULL
        """).fetchall()

        scored = []
        for row in rows:
            skill_embedding = self._blob_to_vector(row["embedding"])
            similarity = self._cosine_similarity(query_embedding, skill_embedding)
            scored.append({
                "id": row["id"],
                "name": row["name"],
                "category": row["category"],
                "description": row["description"],
                "code_snippet": row["code_snippet"],
                "similarity": similarity,
            })

        # Sort by similarity (descending)
        scored.sort(key=lambda x: x["similarity"], reverse=True)
        return scored[:limit]

    def get_skill_by_id(self, skill_id: int) -> Optional[dict]:
        """Get a skill by ID."""
        conn = self._get_conn()
        row = conn.execute("""
            SELECT id, name, category, description, code_snippet, dependencies, nlp_keywords
            FROM skills
            WHERE id = ?
        """, (skill_id,)).fetchone()

        return dict(row) if row else None

    def _get_embedding(self, text: str) -> Optional[list[float]]:
        """Generate embedding via Ollama API."""
        import urllib.request
        import urllib.error

        try:
            prefixed_text = f"search_query: {text}"
            data = json.dumps({"model": "nomic-embed-text", "prompt": prefixed_text}).encode("utf-8")
            req = urllib.request.Request(
                "http://localhost:11434/api/embeddings",
                data=data,
                headers={"Content-Type": "application/json"},
                method="POST",
            )

            with urllib.request.urlopen(req, timeout=30) as response:
                result = json.loads(response.read().decode("utf-8"))
                embedding = result.get("embedding", [])

                if len(embedding) == self.EMBEDDING_DIM:
                    return embedding
        except Exception:
            pass

        return None

    def _blob_to_vector(self, blob: bytes) -> list[float]:
        """Convert blob back to vector."""
        return list(struct.unpack(f'{len(blob) // 4}f', blob))

    def _cosine_similarity(self, a: list[float], b: list[float]) -> float:
        """Compute cosine similarity between two vectors."""
        dot = sum(x * y for x, y in zip(a, b))
        norm_a = math.sqrt(sum(x * x for x in a))
        norm_b = math.sqrt(sum(x * x for x in b))
        if norm_a == 0 or norm_b == 0:
            return 0.0
        return dot / (norm_a * norm_b)


# =============================================================================
# Reflective Analyzer
# =============================================================================

class ReflectiveAnalyzer:
    """
    Analyzes video segments using a reflective learning approach.

    For each segment, asks:
    1. What is happening here?
    2. How does this correlate to my skills DB?
    3. How does this tie into the bigger picture?
    4. What is good and bad about this approach?
    5. Does this make sense to me?
    """

    # Context roles based on trading concept categories
    CONTEXT_ROLES = {
        "entry": "entry_trigger",
        "exit": "exit_rule",
        "stop": "risk_management",
        "context": "context_setup",
    }

    def __init__(self, db_path: Path):
        self.db = SkillsDB(db_path)
        self.analyses: list[SegmentAnalysis] = []
        self.accumulated_understanding = AccumulatedUnderstanding(
            strategy_flow=[],
            matched_skills=[],
            new_skills_needed=[],
            parameters={},
            overall_confidence=0.0,
            open_questions=[],
            context_summary="",
        )

    def analyze_segment(self, segment: Segment) -> SegmentAnalysis:
        """
        Perform reflective analysis on a single segment.
        """
        print(f"    Analyzing segment {segment.segment_index}...")

        # 1. What is happening here?
        observation = self._observe(segment)

        # 2. How does this correlate to my skills DB?
        correlation = self._correlate_to_skills(observation, segment)

        # 3. How does this tie into the bigger picture?
        context_role = self._contextualize(segment)

        # 4. What is good and bad about this approach?
        evaluation = self._evaluate(observation, correlation)

        # 5. Does this make sense to me?
        reflection = self._reflect(observation, correlation, evaluation)

        # Extract parameters
        parameters = self._extract_parameters(segment)

        # Build analysis
        analysis = SegmentAnalysis(
            segment_index=segment.segment_index,
            timestamp=self._format_timestamp(segment.start_seconds),
            observation=observation,
            skill_correlation=correlation,
            context_role=context_role,
            evaluation=evaluation,
            reflection=reflection,
            extracted_parameters=parameters,
        )

        # Update accumulated understanding
        self._update_understanding(analysis)

        self.analyses.append(analysis)
        return analysis

    def _observe(self, segment: Segment) -> Observation:
        """
        Q1: What is happening here?
        Analyze visual and transcript content.
        """
        # Analyze transcript for key concepts
        transcript = segment.transcript.lower()

        # Detect visual elements mentioned
        visual_elements = []
        if any(w in transcript for w in ["chart", "candle", "wick", "price"]):
            visual_elements.append("price chart")
        if any(w in transcript for w in ["line", "zone", "level"]):
            visual_elements.append("support/resistance levels")
        if any(w in transcript for w in ["arrow", "mark", "annotation"]):
            visual_elements.append("annotations")
        if any(w in transcript for w in ["indicator", "vwap", "ema", "sma"]):
            visual_elements.append("indicators")

        visual_desc = ", ".join(visual_elements) if visual_elements else "trading chart"

        # Summarize concept being explained
        concept = self._summarize_concept(segment)

        return Observation(
            visual=f"Chart shows {visual_desc}",
            concept=concept,
            raw_transcript=segment.transcript[:500],
        )

    def _summarize_concept(self, segment: Segment) -> str:
        """Generate a one-line concept summary."""
        categories = segment.detected_categories
        is_explanation = segment.is_explanation

        if is_explanation:
            prefix = "Explanation of"
        else:
            prefix = "Demonstration of"

        if "entry" in categories:
            return f"{prefix} entry trigger or pattern"
        elif "exit" in categories:
            return f"{prefix} exit/target rules"
        elif "stop" in categories:
            return f"{prefix} risk management/stop placement"
        elif "context" in categories:
            return f"{prefix} market context/setup conditions"
        else:
            return f"{prefix} trading concept"

    def _correlate_to_skills(self, observation: Observation, segment: Segment) -> SkillCorrelation:
        """
        Q2: How does this correlate to my skills DB?
        Search for matching skills and identify what's new.
        """
        # Extract keywords from transcript
        keywords = self._extract_keywords(segment.transcript)

        # Search by keywords first
        matches = self.db.search_by_keywords(keywords, limit=3)

        # Also search by semantic similarity if available
        semantic_matches = self.db.search_by_embedding(
            segment.transcript[:500], limit=3
        )

        # Merge results (semantic takes priority for similarity scores)
        if semantic_matches:
            best_match = semantic_matches[0]
            similarity = best_match.get("similarity", 0)
        elif matches:
            best_match = matches[0]
            similarity = 0.5  # Default similarity for keyword match
        else:
            best_match = None
            similarity = 0

        if best_match and similarity > 0.4:
            # We have a match - identify the delta
            delta = self._identify_delta(segment.transcript, best_match.get("description", ""))

            return SkillCorrelation(
                matched_skill_id=best_match["id"],
                matched_skill_name=best_match["name"],
                similarity=round(similarity, 3),
                delta=delta,
                is_new_skill=False,
            )
        else:
            return SkillCorrelation(
                matched_skill_id=None,
                matched_skill_name=None,
                similarity=0,
                delta="New concept not in skills database",
                is_new_skill=True,
            )

    def _extract_keywords(self, text: str) -> list[str]:
        """Extract trading-relevant keywords from text."""
        # Trading keywords to look for
        trading_terms = [
            "sweep", "liquidity", "stop hunt", "order block", "fvg", "fair value gap",
            "cisd", "bos", "choch", "breaker", "mitigation", "imbalance",
            "entry", "exit", "stop loss", "take profit", "target",
            "range", "session", "bias", "trend", "structure",
            "wick", "rejection", "breakout", "breakdown", "reversal",
        ]

        text_lower = text.lower()
        found = [term for term in trading_terms if term in text_lower]

        return found if found else ["trading concept"]

    def _identify_delta(self, transcript: str, skill_description: str) -> str:
        """Identify what's new in the video vs existing skill."""
        # Simple heuristic: look for things mentioned in transcript but not in skill
        transcript_lower = transcript.lower()
        skill_lower = skill_description.lower()

        # Key differentiators
        differentiators = []

        if "confirmation" in transcript_lower and "confirmation" not in skill_lower:
            differentiators.append("adds confirmation requirement")
        if "rejection" in transcript_lower and "rejection" not in skill_lower:
            differentiators.append("includes rejection candle")
        if "session" in transcript_lower and "session" not in skill_lower:
            differentiators.append("adds session filter")
        if "timeframe" in transcript_lower and "timeframe" not in skill_lower:
            differentiators.append("specifies timeframe")

        if differentiators:
            return f"Video {'; '.join(differentiators)}"
        else:
            return "Covers similar concepts"

    def _contextualize(self, segment: Segment) -> ContextRole:
        """
        Q3: How does this tie into the bigger picture?
        Determine the role this segment plays.
        """
        # Determine primary role
        role = "context_setup"  # Default
        for category in segment.detected_categories:
            if category in self.CONTEXT_ROLES:
                role = self.CONTEXT_ROLES[category]
                break

        # Find connections to previous segments
        connects_to = []
        for prev_analysis in self.analyses:
            # Entry triggers connect to context setups
            if role == "entry_trigger" and prev_analysis.context_role.role == "context_setup":
                connects_to.append(prev_analysis.segment_index)
            # Risk management connects to entry triggers
            if role == "risk_management" and prev_analysis.context_role.role == "entry_trigger":
                connects_to.append(prev_analysis.segment_index)
            # Exit rules connect to entry triggers
            if role == "exit_rule" and prev_analysis.context_role.role == "entry_trigger":
                connects_to.append(prev_analysis.segment_index)

        # What does this build on?
        builds_on = None
        if self.analyses:
            builds_on = self.analyses[-1].observation.concept

        return ContextRole(
            role=role,
            connects_to_segments=connects_to,
            builds_on=builds_on,
        )

    def _evaluate(self, observation: Observation, correlation: SkillCorrelation) -> Evaluation:
        """
        Q4: What is good and bad about this approach?
        """
        pros = []
        cons = []

        # Generic evaluations based on context
        if "clear" in observation.concept.lower() or "simple" in observation.concept.lower():
            pros.append("Clear, easy to identify")

        if correlation.matched_skill_id:
            pros.append(f"Matches known skill: {correlation.matched_skill_name}")
        else:
            cons.append("New concept needs validation")

        if correlation.delta and "confirmation" in correlation.delta:
            pros.append("Includes confirmation logic")

        # Common concerns for trading strategies
        cons.append("May need market condition filters")
        cons.append("Backtesting required")

        return Evaluation(pros=pros[:3], cons=cons[:3])

    def _reflect(
        self,
        observation: Observation,
        correlation: SkillCorrelation,
        evaluation: Evaluation,
    ) -> Reflection:
        """
        Q5: Does this make sense to me?
        Assess confidence and identify open questions.
        """
        # Calculate confidence
        confidence = 0.5  # Base confidence

        if correlation.matched_skill_id:
            confidence += 0.2 + (correlation.similarity * 0.2)
        if len(evaluation.pros) > len(evaluation.cons):
            confidence += 0.1

        confidence = min(confidence, 1.0)

        # Generate open questions
        questions = []

        if correlation.is_new_skill:
            questions.append("Is this a new skill to add to the database?")

        if "timeframe" not in observation.raw_transcript.lower():
            questions.append("What timeframe is this applicable to?")

        if "stop" not in observation.raw_transcript.lower():
            questions.append("Where should stop loss be placed?")

        if "target" not in observation.raw_transcript.lower():
            questions.append("What is the target/take profit?")

        return Reflection(
            confidence=round(confidence, 2),
            open_questions=questions[:3],
        )

    def _extract_parameters(self, segment: Segment) -> dict:
        """Extract concrete parameters from the segment."""
        import re

        params = {}
        text = segment.transcript.lower()

        # Look for tick values
        tick_match = re.search(r'(\d+)\s*ticks?', text)
        if tick_match:
            params["tick_value"] = int(tick_match.group(1))

        # Look for point values
        point_match = re.search(r'(\d+)\s*points?', text)
        if point_match:
            params["point_value"] = int(point_match.group(1))

        # Look for R:R ratios
        rr_match = re.search(r'(\d+)[:\s]to[:\s](\d+)|(\d+)[rR]', text)
        if rr_match:
            if rr_match.group(1) and rr_match.group(2):
                params["risk_reward"] = f"{rr_match.group(1)}:{rr_match.group(2)}"
            elif rr_match.group(3):
                params["risk_reward"] = f"1:{rr_match.group(3)}"

        # Look for time references
        time_match = re.search(r'(\d{1,2}):(\d{2})\s*(am|pm)?', text)
        if time_match:
            params["time_reference"] = time_match.group(0)

        # Look for session references
        for session in ["london", "new york", "asian", "tokyo"]:
            if session in text:
                params["session"] = session
                break

        return params

    def _format_timestamp(self, seconds: float) -> str:
        """Format seconds as MM:SS."""
        minutes = int(seconds // 60)
        secs = int(seconds % 60)
        return f"{minutes}:{secs:02d}"

    def _update_understanding(self, analysis: SegmentAnalysis):
        """Update accumulated understanding with this analysis."""
        understanding = self.accumulated_understanding

        # Add to strategy flow
        understanding.strategy_flow.append(analysis.context_role.role)

        # Track matched skills
        if analysis.skill_correlation.matched_skill_id:
            if analysis.skill_correlation.matched_skill_id not in understanding.matched_skills:
                understanding.matched_skills.append(analysis.skill_correlation.matched_skill_id)

        # Track new skills needed
        if analysis.skill_correlation.is_new_skill:
            understanding.new_skills_needed.append({
                "segment_index": analysis.segment_index,
                "concept": analysis.observation.concept,
            })

        # Merge parameters
        understanding.parameters.update(analysis.extracted_parameters)

        # Update confidence (running average)
        n = len(self.analyses)
        understanding.overall_confidence = (
            (understanding.overall_confidence * (n - 1) + analysis.reflection.confidence) / n
            if n > 0 else analysis.reflection.confidence
        )

        # Collect open questions
        for q in analysis.reflection.open_questions:
            if q not in understanding.open_questions:
                understanding.open_questions.append(q)

    def get_accumulated_understanding(self) -> AccumulatedUnderstanding:
        """Get the final accumulated understanding."""
        understanding = self.accumulated_understanding

        # Generate context summary
        if self.analyses:
            roles = [a.context_role.role for a in self.analyses]
            unique_roles = list(dict.fromkeys(roles))  # Preserve order, remove duplicates
            understanding.context_summary = " → ".join(unique_roles)

        return understanding

    def to_json(self) -> dict:
        """Convert all analyses and understanding to JSON."""
        return {
            "analyses": [
                {
                    "segment_index": a.segment_index,
                    "timestamp": a.timestamp,
                    "observation": {
                        "visual": a.observation.visual,
                        "concept": a.observation.concept,
                    },
                    "skill_correlation": {
                        "matched_skill_id": a.skill_correlation.matched_skill_id,
                        "matched_skill_name": a.skill_correlation.matched_skill_name,
                        "similarity": a.skill_correlation.similarity,
                        "delta": a.skill_correlation.delta,
                        "is_new_skill": a.skill_correlation.is_new_skill,
                    },
                    "context_role": {
                        "role": a.context_role.role,
                        "connects_to_segments": a.context_role.connects_to_segments,
                        "builds_on": a.context_role.builds_on,
                    },
                    "evaluation": {
                        "pros": a.evaluation.pros,
                        "cons": a.evaluation.cons,
                    },
                    "reflection": {
                        "confidence": a.reflection.confidence,
                        "open_questions": a.reflection.open_questions,
                    },
                    "extracted_parameters": a.extracted_parameters,
                }
                for a in self.analyses
            ],
            "accumulated_understanding": {
                "strategy_flow": self.accumulated_understanding.strategy_flow,
                "matched_skills": self.accumulated_understanding.matched_skills,
                "new_skills_needed": self.accumulated_understanding.new_skills_needed,
                "parameters": self.accumulated_understanding.parameters,
                "overall_confidence": self.accumulated_understanding.overall_confidence,
                "open_questions": self.accumulated_understanding.open_questions[:5],
                "context_summary": self.accumulated_understanding.context_summary,
            }
        }

    def close(self):
        """Close database connection."""
        self.db.close()


# =============================================================================
# CLI for Testing
# =============================================================================

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Reflective analysis of video segments")
    parser.add_argument("segments_file", type=Path, help="JSON file with segments from video_segmenter.py")
    parser.add_argument("--db", type=Path, default=Path("data/builder.db"), help="Skills database path")
    parser.add_argument("--output", "-o", type=Path, help="Output JSON file")
    args = parser.parse_args()

    if not args.segments_file.exists():
        print(f"Error: {args.segments_file} does not exist")
        exit(1)

    if not args.db.exists():
        print(f"Error: Database {args.db} does not exist")
        exit(1)

    # Load segments
    segments_data = json.loads(args.segments_file.read_text())

    # Convert to Segment objects
    segments = [
        Segment(
            segment_index=s["segment_index"],
            start_seconds=s["start_seconds"],
            end_seconds=s["end_seconds"],
            trigger=s["trigger"],
            trigger_details=s.get("trigger_details", {}),
            frame_path=s.get("frame_path"),
            transcript=s["transcript"],
            detected_categories=s.get("detected_categories", []),
            is_explanation=s.get("is_explanation", False),
            concept_density=s.get("concept_density", 0),
        )
        for s in segments_data
    ]

    print(f"Analyzing {len(segments)} segments...")

    # Run reflective analysis
    analyzer = ReflectiveAnalyzer(db_path=args.db)

    for segment in segments:
        analyzer.analyze_segment(segment)

    understanding = analyzer.get_accumulated_understanding()

    # Output
    output = analyzer.to_json()

    print(f"\n{'='*60}")
    print("ACCUMULATED UNDERSTANDING")
    print(f"{'='*60}")
    print(f"Strategy Flow: {understanding.context_summary}")
    print(f"Matched Skills: {len(understanding.matched_skills)}")
    print(f"New Skills Needed: {len(understanding.new_skills_needed)}")
    print(f"Overall Confidence: {understanding.overall_confidence:.2f}")
    print(f"Open Questions: {len(understanding.open_questions)}")
    print(f"{'='*60}")

    if args.output:
        args.output.write_text(json.dumps(output, indent=2))
        print(f"\nSaved to {args.output}")
    else:
        print("\nFull analysis:")
        print(json.dumps(output, indent=2))

    analyzer.close()
