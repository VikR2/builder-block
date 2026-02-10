# Multimodal YouTube Extraction Workflow

## Reference Files (2026-01-15 Update)

- **Reference Guide:** `.claude/rules/video-extraction.md` - Stable patterns, thresholds, model context structure
- **Memory Protocol:** `.claude/skills/youtube/CLAUDE.md` - claude-mem recall/storage integration
- **Full Workflow:** `.claude/skills/youtube.md` - 11-step workflow with memory steps

## Purpose
Extract trading skills from YouTube videos using both transcript AND visual analysis (charts, annotations, indicators) for higher quality extraction.

## When to Use
- Processing trading education videos
- Videos with chart examples that are essential to understanding
- When transcript alone is insufficient context

## Prerequisites
- ffmpeg installed (via `winget install ffmpeg`)
- yt-dlp installed
- MCP youtube-transcript server running

## Workflow

### Step 1: Run Frame Extraction
```bash
uv run python -m runtime.harness scripts/generate_from_youtube.py \
    --url "https://youtu.be/VIDEO_ID" \
    --project-id 1 \
    --with-frames \
    --keep-frames
```

**CLI Arguments:**
- `--with-frames` - Enable frame extraction
- `--frame-interval 45` - Seconds between frames (default: 45)
- `--max-frames 15` - Maximum frames to extract (default: 15)
- `--keep-frames` - Don't delete frames after processing

**Output:**
- Frames saved to `data/temp-frames/{video_id}/`
- `manifest.json` with frame-transcript pairing

### Step 2: Claude Code Visual Analysis
Tell Claude Code:
```
analyze the video at data/temp-frames/{video_id}/
```

Claude Code will:
1. Read manifest.json
2. Read each frame image
3. Analyze visual content (charts, zones, annotations)
4. Determine video intent

### Step 3: Video Intent Classification
Three categories:
- **skills_library** - Teaching individual techniques (wicks, order blocks, etc.)
- **complete_strategy** - Full tradeable system with entry/exit rules
- **educational** - General concepts without actionable skills

### Step 4: QA Validation (REQUIRED - DO NOT SKIP)

**CRITICAL:** Claude Code MUST stop and ask for user approval at these checkpoints. This is enforced via:
- `.claude/rules/youtube-extraction-qa.md` - Claude rule
- `.claude/skills/generate-from-youtube.md` - Skill requirements
- `scripts/generate_from_youtube.py` - `--confirm-skills` defaults to True

**Gate 1: Intent Classification**
```
Video Analysis Summary:
- Title: "Liquidity Sweep Explained"
- Duration: 18 minutes
- Detected Intent: complete_strategy
- Key Concepts:
  - Liquidity Sweep Detection (high)
  - Order Block Entry (high)
  - Session Filters (medium)

Is this classification correct?
[Yes proceed] [Change intent] [Cancel]
```

**Gate 2: Skills Review**
```
Skills to Extract:

NEW (will create in database):
- Liquidity Sweep Detection - HTF sweep identification
- HTF Order Block Entry - M5 OB after H1 sweep

AMBIGUOUS (similar to existing):
- "Session Targets" ~ existing #86 "Session Trading"
  -> Recommend: Use existing

Extract these skills?
[Yes extract all] [Edit list] [Cancel]
```

**Gate 3: Artifact Generation** (complete_strategy only)
```
Strategy detected with full entry/exit rules.

Generate artifacts?
1. Strategy Architecture Document (SAD)? [Yes/No]
2. NinjaTrader C# Strategy Code? [Yes/No]
```

**NEVER skip these gates.** If you want to bypass, use `--auto-confirm` (with warning).

### Step 5: Output Based on Intent
| Intent | Skills to DB | Generate SAD |
|--------|-------------|--------------|
| skills_library | Yes | No |
| complete_strategy | Yes | Yes |
| educational | Yes (concepts) | No |

### Step 6: Cleanup
```bash
# Manual cleanup if used --keep-frames
rm -rf data/temp-frames/{video_id}/
```

## Example Session

```bash
# 1. Extract frames
uv run python -m runtime.harness scripts/generate_from_youtube.py \
    --url "https://youtu.be/LKNQDAdId4s" \
    --project-id 1 \
    --with-frames --keep-frames

# 2. Tell Claude Code to analyze
> analyze the video at data/temp-frames/LKNQDAdId4s/

# 3. Claude reads frames, identifies:
#    - Frame 1: "What are wicks?" title slide
#    - Frame 5: ES futures chart with fair value gap
#    - Frame 8: Gold chart with wick rejections
#    - Intent: skills_library (educational techniques)

# 4. Claude extracts skills:
#    - Wick Analysis
#    - Fair Value Gaps
#    - Support/Resistance from Wicks
```

## Key Files
- `scripts/generate_from_youtube.py` - Main pipeline with `--with-frames`
- `data/temp-frames/` - Temporary frame storage (gitignored)
- `data/temp-frames/{video_id}/manifest.json` - Frame metadata

## Related
- `/implement-strategy` - Generate code from SAD
- `740.cs` - Reference quality for generated code

## Memory Integration (2026-01-15)

**Hybrid Memory Strategy:**
- **Serena memories** (this file): Stable workflows, procedures
- **claude-mem**: Session learnings, errors, decisions (auto-captured)
- **CLAUDE.md files**: Directory entry context

The workflow now includes:
- **Step 1a**: Auto-recall past learnings from claude-mem before extraction
- **Step 11**: Auto-store successful extractions, prompt for issues

## Auto-Generated Indicators (New)

When a skill is saved to the library, the pipeline automatically:
1. Checks if the skill's category needs visualization
2. Generates a NinjaTrader indicator (.cs) if applicable
3. Updates the skill record with `indicator_path`

**Visual Categories** (auto-generate indicator):
- Entry Patterns
- Market Structure  
- Market Analysis

**Skip Categories** (no indicator needed):
- Risk Management
- Trade Management
- Indicators

**Indicator Location:** `scripts-output/Indicators/{SkillName}Indicator.cs`

**Backfill Command:**
```bash
python scripts/backfill_indicators.py [--dry-run]
```

**Schema Additions:**
- `skills.indicator_path` - Path to generated indicator file
- `skills.needs_indicator` - 1 if category needs visual representation
- `skills.dll_class_name` - Future: class name for DLL compilation

## Complete Strategy Videos (with QA Gates)

When a video is detected as a **complete strategy** (teaching a full trading system):

**With QA Gates (default):**
1. Claude asks: "Intent: complete_strategy - proceed?" (Gate 1)
2. Claude asks: "Skills to extract: [list] - proceed?" (Gate 2)
3. Claude asks: "Generate SAD and C# code?" (Gate 3)
4. User approves each step
5. Skills saved, SAD generated, C# generated

**With --auto-confirm (bypass):**
1. Ambiguous skills are auto-saved
2. Indicators are generated for new skills
3. SAD is generated
4. Strategy.cs is auto-generated
5. ⚠️ Warning printed about bypassed QA

**Detection criteria:**
- Has entry patterns (fair value gap, order block, sweep, etc.)
- Has risk management (stop loss, take profit, etc.)
- Has strategy keywords: "top-down", "chart lesson", "trade review", "full strategy", etc.

**QA-gated output:**
```
[QA GATE 3] Complete strategy detected.
  Generate Strategy Architecture Document? [Yes/No]
  Generate NinjaTrader C# Strategy? [Yes/No]
User: Yes, Yes
[GENERATING] SAD: docs/strategies/TopDownChartLesson-SAD.md
[GENERATING] Strategy: scripts-output/Strategies/TopDownChartLessonStrategy.cs
```

**Bypassed output (--auto-confirm):**
```
⚠️ [WARNING] Auto-confirm enabled - skipping skill confirmation QA gate
[AUTO] Complete strategy video detected!
[AUTO] Generating Strategy.cs for complete strategy...
[AUTO] Strategy saved: scripts-output/Strategies/TopDownChartLessonStrategy.cs
```
