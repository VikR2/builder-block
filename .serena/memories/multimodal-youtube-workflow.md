# Multimodal YouTube Extraction Workflow

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

### Step 4: QA Validation
Claude Code asks:
- "Video intent appears to be [X] - proceed?"
- "Found these skills: [list] - extract all?"
- "Ambiguous skill match - create new or use existing?"

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
