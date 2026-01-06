---
name: youtube
description: Orchestrated YouTube extraction with reflective analysis and human-in-loop checkpoints
---

# YouTube Extraction Workflow

Extract trading concepts from YouTube videos using **reflective analysis** that:
1. Segments video by concept boundaries (not fixed intervals)
2. Analyzes each segment like a human learner would
3. Correlates to existing skills database
4. Builds accumulated understanding before code generation

## When to Use

- User provides a YouTube URL
- User says "extract from YouTube", "learn from this video", "process this video"
- User invokes `/youtube <url>`

---

## CRITICAL: This is an Orchestrator Skill

This skill **orchestrates** multiple phases with **mandatory checkpoints**.
DO NOT skip any AskUserQuestion checkpoint - they are blocking gates.

---

## Workflow Execution

### Step 1: Parse Input

Extract the YouTube URL from the args. Accept formats:
- `https://www.youtube.com/watch?v=VIDEO_ID`
- `https://youtu.be/VIDEO_ID`
- Just the VIDEO_ID

### Step 2: Fetch Transcript

Use the `youtube-transcript` MCP server to get the transcript:

```
Tool: youtube-transcript__get_transcript
Params: { "url": "<youtube_url>" }
```

If transcript fails, inform user and ask if they want to provide a text description instead.

Save transcript to: `data/temp-frames/{video_id}/transcript_clean.txt`

### Step 3: CHECKPOINT 1 - Intent & Options (MANDATORY)

**YOU MUST USE AskUserQuestion HERE - DO NOT SKIP**

Present to user:
- Video title (from transcript metadata or URL)
- Duration estimate (from transcript length)
- Key concepts detected (scan for: sweep, CISD, order block, FVG, bias, etc.)

Ask THREE questions:

**Q1: Video Intent**
- `skills_library` - Extract individual trading concepts to skills database
- `complete_strategy` - Full strategy with entry/exit rules → generate SAD + code
- `educational` - Just learn from it, no extraction
- `cancel` - Stop workflow

**Q2: Analysis Mode**
- `reflective` (RECOMMENDED) - Multi-signal segmentation + reflective analysis (deeper understanding)
- `simple` - Basic keyword extraction (faster, less accurate)

**Q3: Extract Frames?**
- `Yes` - Download video and extract frames for visual chart analysis (required for reflective mode)
- `No` - Transcript only (faster, simple mode only)

**If user selects "cancel" → END WORKFLOW**
**If user selects "reflective" → frames are required, auto-set to Yes**

### Step 4: Frame Extraction (if requested or reflective mode)

If user selected "Yes" for frames:

```bash
# Create output directory
mkdir -p data/temp-frames/{video_id}/frames

# Download video
yt-dlp -f "best[height<=720]" -o "data/temp-frames/{video_id}/video.mp4" "{url}"

# Extract frames every 45 seconds
ffmpeg -i "data/temp-frames/{video_id}/video.mp4" -vf "fps=1/45" "data/temp-frames/{video_id}/frames/frame_%03d.jpg"
```

Read the extracted frames to analyze chart content.

### Step 5: Reflective Analysis (if reflective mode)

**For reflective mode, run the full pipeline:**

```bash
uv run python scripts/reflective_extraction_pipeline.py \
    --frames-dir data/temp-frames/{video_id} \
    --output-dir scripts-output/Strategies \
    --strategy-name {StrategyName} \
    --analyze-only
```

This pipeline:
1. **Multi-Signal Segmentation** - Detects concept boundaries using:
   - Frame changes (visual)
   - Concept transition markers ("now", "here's the key", etc.)
   - Category changes (entry → exit → stop)
   - Pauses in speech (>2 seconds)
   - Emphasis detection (intensifiers, rhetorical questions)
   - Extended explanations (high concept density over static chart)

2. **Reflective Analysis** - For each segment asks:
   - Q1: What is happening here? (visual + transcript)
   - Q2: How does this correlate to my skills DB?
   - Q3: How does this tie into the bigger picture?
   - Q4: What is good and bad about this approach?
   - Q5: Does this make sense to me?

3. **Understanding Accumulation** - Builds:
   - Strategy flow (sequence of concepts)
   - Matched skills (from database)
   - New skills needed (not in database)
   - Extracted parameters
   - Open questions

**Output files:**
- `{StrategyName}_segments.json` - Detected segments
- `{StrategyName}_analysis.json` - Full reflective analysis

### Step 5a: CHECKPOINT 1a - Model Detection (for complete_strategy)

**YOU MUST USE AskUserQuestion HERE IF COMPLETE MODEL DETECTED - DO NOT SKIP**

When intent is `complete_strategy`, analyze the accumulated understanding with a **professional trader mindset**:

**Model Detection Criteria:**
- Does it have a complete trade flow? (entry → management → exit)
- Does it specify conditional logic? (if HTF bullish THEN..., if sweep detected THEN...)
- Does it describe context requirements? (timeframes, sessions, confirmations)
- Does it address risk management?
- Does it address when NOT to trade?

**If criteria are met (3+ of 5), this is a COMPLETE MODEL:**

```
╔═══════════════════════════════════════════════════════════════╗
║           MODEL DETECTION: Complete Trading Model Found        ║
╠═══════════════════════════════════════════════════════════════╣
║                                                               ║
║  This video describes a COMPLETE TRADING MODEL:               ║
║                                                               ║
║  Trade Flow Detected:                                         ║
║  ├── Pre-Market: Daily bias via SMA                          ║
║  ├── Setup: Wait for session range to form                   ║
║  ├── Entry: Sweep detection + CISD confirmation              ║
║  ├── Management: Move to BE at 1R, trail protected swings    ║
║  └── Exit: Target at opposing FVG or session extreme         ║
║                                                               ║
║  Conditional Logic Detected:                                  ║
║  • "Only take longs if daily bias is bullish"                ║
║  • "Skip trades in premium zone for longs"                   ║
║  • "Fade setups at 11 AM instead of following"               ║
║                                                               ║
║  Context Requirements:                                        ║
║  • HTF: Daily for bias, H1 for structure, M5 for entry       ║
║  • Sessions: London and NY AM only                            ║
║  • Confirmations: Sweep + CISD + OB return                   ║
║                                                               ║
╠═══════════════════════════════════════════════════════════════╣
║                                                               ║
║  How should this be extracted?                                ║
║                                                               ║
║  [1] COMPLETE MODEL                                           ║
║      Save to skill_combinations with:                         ║
║      - trade_flow_rules (conditional logic)                   ║
║      - context_annotations (HTF, sessions, edge cases)        ║
║      - skill_contexts (how each skill is used)                ║
║      - Links to skills database                               ║
║                                                               ║
║  [2] INDIVIDUAL SKILLS ONLY                                   ║
║      Extract skills without model structure                   ║
║      (miss the nuance of how they work together)              ║
║                                                               ║
║  [3] CANCEL                                                   ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
```

**If user selects COMPLETE MODEL:**
- Set `model_extraction_mode = true`
- Continue to Step 5b to capture model details

**If user selects INDIVIDUAL SKILLS:**
- Set `model_extraction_mode = false`
- Skip Step 5b, proceed to normal flow

### Step 5b: Model Specification Capture (if model_extraction_mode = true)

Capture the professional trader nuances:

**Trade Flow Rules (Conditional Logic):**
```json
{
  "trade_flow_rules": {
    "pre_market": [{"skill": "daily-bias-sma", "output": "bias_direction"}],
    "entry": {
      "trigger": "liquidity-sweep-detection",
      "confirmations": [{"skill": "cisd-pattern", "required": true}],
      "filters": [{"condition": "bias_direction == sweep_direction", "action": "proceed"}]
    },
    "exit": {
      "targets": [{"type": "dynamic", "skill": "opposing-fvg-target"}],
      "stops": [{"type": "trailing", "skill": "protected-swings"}]
    }
  }
}
```

**Context Annotations (Trader Wisdom):**
```json
{
  "context_annotations": {
    "htf_timeframes": {"bias": "Daily", "structure": "H1", "entry": "M5"},
    "session_restrictions": {"allowed": ["london", "ny_am"], "reason": "Volume required"},
    "trade_type": "reversal",
    "edge_cases": {"11am": "Consider fading - historically losers"},
    "common_mistakes": {"chasing": "Don't enter after price extended from sweep"}
  }
}
```

**Skill Contexts (How Each Skill is Used in THIS Model):**
```json
{
  "skill_contexts": {
    "12": {"phase": "entry", "order": 1, "notes": "Primary trigger - sweep detection"},
    "45": {"phase": "confirmation", "order": 2, "conditions": "Must occur within 5 bars"},
    "7": {"phase": "risk", "order": 1, "conditions": "Move to BE at 1R profit"}
  }
}
```

**Trader Reflection Questions:**
- Is this trend-following or counter-trend?
- Where in the range should entries occur?
- What HTF confirmation is required?
- When should you NOT take this trade?

### Step 5c: Trade Example Mining (reflective mode only)

**Visual Trade Analysis Phase - Extracts stop/entry references from frames**

The pipeline now includes visual trade analysis that:
1. Scans video frames for actual trade examples
2. Extracts measured stop/entry reference points
3. Identifies patterns across multiple trades

This solves the transcript-to-code gap (e.g., "stop below order block" → which level exactly?).

**Output includes:**
- `stop_reference_point`: The measured reference (CISD_CANDLE_LOW, OB_BODY_LOW, etc.)
- `entry_reference_point`: The measured entry reference
- Consistency scores across trade examples

### Step 5d: CHECKPOINT 1b - Trade Example Review (MANDATORY)

**YOU MUST USE AskUserQuestion HERE IF TRADE EXAMPLES FOUND - DO NOT SKIP**

If trade examples were mined from video frames, present for review:

```
╔═══════════════════════════════════════════════════════════════╗
║           TRADE EXAMPLES REVIEW                                ║
╠═══════════════════════════════════════════════════════════════╣
║                                                               ║
║  Trade Examples Found: 3                                      ║
║                                                               ║
║  TRADE 1 (frame_008.jpg @ 7:00):                             ║
║    Direction: SHORT                                           ║
║    Entry: 6480.00                                             ║
║    Stop: 6483.25 (13 ticks)                                  ║
║    Stop Reference: CISD_CANDLE_HIGH + 3 ticks                ║
║                                                               ║
║  TRADE 2 (frame_012.jpg @ 11:00):                            ║
║    Direction: LONG                                            ║
║    Entry: 6076.50                                             ║
║    Stop: 6073.25 (13 ticks)                                  ║
║    Stop Reference: CISD_CANDLE_LOW - 3 ticks                 ║
║                                                               ║
║  CONSISTENCY ANALYSIS:                                        ║
║    Stop Reference: CISD_CANDLE (100% consistent)             ║
║    Entry Reference: OB_CLOSE (67% consistent)                ║
║                                                               ║
║  RECOMMENDED for code generation:                             ║
║    stop_reference_point = "CISD_CANDLE_LOW"                  ║
║    entry_reference_point = "OB_CLOSE"                        ║
║                                                               ║
╠═══════════════════════════════════════════════════════════════╣
║  OPTIONS:                                                     ║
║  [1] Use these references - Proceed with visual evidence      ║
║  [2] Override - Use different references                      ║
║  [3] Skip visual analysis - Fall back to transcript           ║
╚═══════════════════════════════════════════════════════════════╝
```

**If user selects "Override" → ask for custom references**
**If user selects "Skip" → warn that code may use incorrect references**

### Step 5e: Understanding Diagram Generation (reflective mode only)

**Anti-Hallucination Check - Links concepts to evidence**

Generates a Mermaid diagram showing:
1. Trade flow (HTF → LTF vertical structure)
2. Each concept with source evidence (frame + transcript)
3. Confidence indicators
4. Flagged concepts needing verification

This prevents hallucinated understanding by making extraction TRACEABLE.

### Step 5f: Understanding Checkpoint (reflective mode only)

**YOU MUST USE AskUserQuestion HERE - DO NOT SKIP**

After reflective analysis completes, present the accumulated understanding:

```
Accumulated Understanding:

Strategy Flow: [context_setup → entry_trigger → risk_management → exit_rule]

Matched Skills (from database):
- #12 "Liquidity Sweep Detection" (0.87 match)
- #45 "Fair Value Gap" (0.92 match)

New Skills Needed:
- "Rejection Candle Confirmation" - Not in database

Extracted Parameters:
- stop_placement: sweep_high
- entry_type: market_after_sweep
- target_type: ERL_IRL_oscillation

Confidence: 84%

Open Questions:
- "Should rejection candle close below sweep level?"
- "What timeframe alignment is required?"
```

Ask:
- `Looks good` - Proceed to skills review
- `Let me clarify` - User provides answers to open questions
- `Re-analyze` - Run analysis again with different parameters
- `Cancel` - Stop workflow

**If user provides clarifications → incorporate into understanding before proceeding**

### Step 5b: Simple Analysis (if simple mode)

**For simple mode, use basic keyword extraction:**

Based on intent, analyze the transcript for trading concepts:

**For skills_library:**
- Identify distinct trading concepts
- Search existing skills database for matches
- Categorize as: NEW, AMBIGUOUS (similar exists), EXISTING

**For complete_strategy:**
- Identify entry rules, exit rules, risk management
- Map to skill categories
- Note any gaps in the strategy

### Step 6: CHECKPOINT 2 - Skills Review (MANDATORY)

**YOU MUST USE AskUserQuestion HERE - DO NOT SKIP**

Present the skills analysis:

```
Skills Analysis:

NEW (will create in database):
- [Skill Name] - [brief description]

AMBIGUOUS (similar to existing):
- "[Extracted]" ≈ existing #[ID] "[Name]"
  Recommendation: Use existing / Create new

EXISTING (will link to video):
- #[ID] [Skill Name]
```

Ask:
- `Approve all` - Proceed with extraction
- `Edit list` - User provides changes
- `Cancel` - Stop workflow

**If user selects "cancel" → END WORKFLOW**

### Step 7: Write Skills to Database

For each approved NEW skill:
```
Tool: nt-skills__save_skill_with_source
Params: {
  "name": "<skill_name>",
  "category": "<category>",
  "description": "<description>",
  "keywords": ["<keyword1>", "<keyword2>"],
  "source_type": "youtube",
  "source_url": "<youtube_url>",
  "source_title": "<video_title>",
  "extraction_confidence": 0.85
}
```

For EXISTING skills, link the video as additional source.

### Step 7a: CHECKPOINT 2a - Model Specification Review (if model_extraction_mode = true)

**YOU MUST USE AskUserQuestion HERE - DO NOT SKIP**

Present the complete model specification for review:

```
╔═══════════════════════════════════════════════════════════════╗
║        MODEL SPECIFICATION REVIEW                              ║
╠═══════════════════════════════════════════════════════════════╣
║                                                               ║
║  Model Name: LumiTraders Liquidity Sweep                      ║
║  Trade Type: Reversal                                         ║
║  Complexity: Complex                                          ║
║                                                               ║
║  TRADE FLOW RULES:                                            ║
║  ┌────────────────────────────────────────────────────────┐   ║
║  │ Pre-Market: Check Daily bias via SMA comparison        │   ║
║  │     ↓                                                  │   ║
║  │ Setup: Wait for session range to form                  │   ║
║  │     ↓                                                  │   ║
║  │ Entry Trigger: Liquidity sweep detected                │   ║
║  │     ↓                                                  │   ║
║  │ Confirmation: CISD pattern within 5 bars               │   ║
║  │     ↓                                                  │   ║
║  │ Filter: Only if sweep direction == bias direction      │   ║
║  │     ↓                                                  │   ║
║  │ Entry: Market order after confirmation                 │   ║
║  │     ↓                                                  │   ║
║  │ Stop: Below sweep level                                │   ║
║  │     ↓                                                  │   ║
║  │ Target: Opposing FVG or 2R, whichever first            │   ║
║  └────────────────────────────────────────────────────────┘   ║
║                                                               ║
║  CONTEXT ANNOTATIONS:                                         ║
║  • HTF Timeframes: Daily (bias) → H1 (structure) → M5 (entry)║
║  • Sessions: London, NY AM only                               ║
║  • Edge Cases:                                                ║
║    - 11 AM window: Consider fading setups                    ║
║    - Double sweep: Higher probability                        ║
║  • Common Mistakes:                                           ║
║    - Don't chase after price extended from sweep             ║
║    - Don't long from premium zone                            ║
║                                                               ║
║  SKILL CONTEXTS:                                              ║
║  • #12 Sweep Detection: Entry trigger (phase: entry, order 1)║
║  • #45 CISD Pattern: Confirmation (phase: confirm, order 2)  ║
║  • #7 Breakeven Stop: Risk (activate at 1R profit)           ║
║                                                               ║
╠═══════════════════════════════════════════════════════════════╣
║  OPTIONS:                                                    ║
║  [1] Approve - Save model to database                        ║
║  [2] Edit specifications - Modify before saving              ║
║  [3] Link as variant - This is a variant of existing model   ║
║  [4] Cancel - Don't save model                               ║
╚═══════════════════════════════════════════════════════════════╝
```

**If user selects "Link as variant":**
- Ask which existing model this is a variant of
- Set `variant_of` to parent model ID

### Step 7b: Save Model to Database (if model_extraction_mode = true and approved)

```
Tool: nt-skills__save_model
Params: {
  "name": "<model_name>",
  "description": "<model_description>",
  "skill_ids": [12, 45, 7, ...],
  "skill_contexts": {
    "12": {"phase": "entry", "order": 1, "notes": "Primary trigger"},
    "45": {"phase": "confirmation", "order": 2, "conditions": "Within 5 bars"},
    ...
  },
  "trade_flow_rules": { ... },
  "context_annotations": { ... },
  "source_video_url": "<youtube_url>",
  "source_video_title": "<video_title>",
  "extraction_confidence": 0.85,
  "complexity": "complex",
  "variant_of": null  // or parent model ID
}
```

Report:
```
✓ Model saved: LumiTraders Liquidity Sweep
  ID: #5
  Skills linked: 3
  Trade flow rules: Captured
  Context annotations: Captured
  Source: YouTube (https://youtu.be/...)
```

### Step 8: CHECKPOINT 3 - Generation (MANDATORY for complete_strategy)

**For complete_strategy intent only:**

**YOU MUST USE AskUserQuestion HERE - DO NOT SKIP**

Ask:
- Generate Strategy Architecture Document (SAD)? [Yes/No]
- Generate NinjaTrader C# code? [Yes/No]

**DO NOT generate any files without explicit approval**

### Step 9: Generate Artifacts (if approved)

**SAD Generation:**
- Create `data/architectures/{date}-{strategy_name}.md`
- Include: overview, entry rules, exit rules, risk management, skills used

**C# Generation (Reflective Mode):**

For reflective mode, use the full pipeline with accumulated understanding:

```bash
uv run python scripts/reflective_extraction_pipeline.py \
    --frames-dir data/temp-frames/{video_id} \
    --output-dir scripts-output/Strategies \
    --strategy-name {StrategyName}
```

This generates code using:
1. State machine from strategy flow
2. Actual skill implementations from database
3. Extracted parameters (not hardcoded defaults)
4. Understanding-informed logic (not template placeholders)

**C# Generation (Simple Mode):**
- Generate indicator files to `scripts-output/Indicators/`
- Generate strategy file to `scripts-output/Strategies/`
- Uses template-based generation with keyword extraction

### Step 9a: CHECKPOINT 4 - Code Validation (MANDATORY for reflective mode)

**YOU MUST USE AskUserQuestion HERE IF VALIDATION FAILS - DO NOT SKIP**

After code generation, validate against visual evidence:

```
╔═══════════════════════════════════════════════════════════════╗
║           CODE VALIDATION: TTradesFractalModelV20.cs           ║
╠═══════════════════════════════════════════════════════════════╣
║                                                               ║
║  Result: FAILED (1 critical issue)                            ║
║                                                               ║
║  CHECK 1: Stop Placement                                      ║
║    Status: FAIL                                               ║
║    Code uses:  m5OBBodyLow                                    ║
║    Video shows: CISD_CANDLE_LOW                               ║
║    >> Stop reference mismatch!                                ║
║                                                               ║
║  CHECK 2: Entry Placement                                     ║
║    Status: PASS                                               ║
║    Code uses:  obClose                                        ║
║    Video shows: OB_CLOSE                                      ║
║                                                               ║
║  CHECK 3: Consistency Score                                   ║
║    Status: PASS                                               ║
║    Visual evidence: 100% consistent on stop reference         ║
║                                                               ║
╠═══════════════════════════════════════════════════════════════╣
║  SUGGESTED FIX:                                               ║
║    Change stop calculation from:                              ║
║      stopPrice = m5OBBodyLow - (StopBufferTicks * TickSize)  ║
║    To:                                                        ║
║      stopPrice = cisdCandleLow - (StopBufferTicks * TickSize)║
║                                                               ║
╠═══════════════════════════════════════════════════════════════╣
║  OPTIONS:                                                     ║
║  [1] Auto-fix - Apply suggested changes                       ║
║  [2] Manual review - I'll fix it myself                       ║
║  [3] Override - Deploy anyway (not recommended)               ║
║  [4] Cancel - Don't deploy strategy                           ║
╚═══════════════════════════════════════════════════════════════╝
```

**If user selects "Auto-fix":**
- Apply the suggested code changes
- Re-run validation to confirm fix worked
- Proceed if validation passes

**If user selects "Override":**
- Log the override reason
- Warn about potential incorrect behavior
- Proceed with deployment

**If validation PASSES:**
- No checkpoint needed
- Proceed directly to summary

### Step 10: Report Summary

Show final summary:
- Skills added/linked: [count]
- Files generated: [list]
- Video marked as processed

---

## Error Handling

| Error | Action |
|-------|--------|
| Invalid URL | Ask user to verify |
| No transcript | Offer text description alternative |
| MCP tool fails | Show error, ask to retry |
| User cancels | Clean up temp files, end gracefully |

---

## State Files

All state saved to `data/temp-frames/{video_id}/`:
- `transcript_clean.txt` - Raw transcript
- `analysis.json` - Concept analysis results
- `frames/` - Extracted video frames (if requested)
- `manifest.json` - Frame-to-transcript mapping

---

## Example Invocation (Reflective Mode)

```
User: /youtube https://www.youtube.com/watch?v=ABC123

[Fetches transcript...]

CHECKPOINT 1:
Video: "ICT Liquidity Concepts Explained"
Duration: ~25 minutes
Concepts detected: liquidity sweep, order block, fair value gap

Q1: What is your intent?
- complete_strategy ← selected
- skills_library
- educational
- cancel

Q2: Analysis mode?
- reflective (RECOMMENDED) ← selected
- simple

Q3: Extract frames? (auto: Yes for reflective mode)

[Downloads video, extracts frames...]
[Runs multi-signal segmentation: 8 segments detected...]
[Runs reflective analysis on each segment...]

UNDERSTANDING CHECKPOINT:

Strategy Flow: context_setup → sweep_detection → entry → stop_at_sweep → target_at_fvg

Matched Skills:
- #12 "Liquidity Sweep Detection" (0.88)
- #45 "Fair Value Gap" (0.92)
- #7 "Fixed Stop Loss" (0.72)

New Skills Needed:
- "Rejection Candle Confirmation"

Parameters:
- stop_placement: sweep_high
- entry_type: market_after_rejection
- target_type: opposing_fvg

Confidence: 85%

Open Questions:
- What minimum rejection wick size?

Proceed?
- Looks good ← selected
- Let me clarify
- Re-analyze
- Cancel

CHECKPOINT 2: Skills Review
[Shows NEW/AMBIGUOUS/EXISTING skills...]
[User approves...]

CHECKPOINT 3: Generation
Generate SAD? Yes
Generate C#? Yes

[Generates using accumulated understanding...]

COMPLETE:
- SAD: data/architectures/2026-01-01-ict-liquidity.md
- Strategy: scripts-output/Strategies/ICTLiquidityStrategy.cs
- 1 new skill added (#99 "Rejection Candle Confirmation")
- 2 existing skills linked (#12, #45)
```

## Example Invocation (Simple Mode)

```
User: /youtube https://www.youtube.com/watch?v=ABC123

CHECKPOINT 1:
Q1: skills_library ← selected
Q2: simple ← selected
Q3: No (transcript only)

[Basic keyword extraction...]

CHECKPOINT 2:
NEW: "Liquidity Sweep Detection", "Order Block Identification"
EXISTING: #45 "Fair Value Gap"

[User approves, writes to database...]

COMPLETE:
- 2 new skills added
- 1 existing skill linked
```
