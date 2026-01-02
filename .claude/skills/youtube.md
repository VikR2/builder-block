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

### Step 5a: Understanding Checkpoint (reflective mode only)

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
Tool: skills-library__add_skill
Params: {
  "name": "<skill_name>",
  "category": "<category>",
  "description": "<description>",
  "source_video": "<youtube_url>"
}
```

For EXISTING skills, link the video as additional source.

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
