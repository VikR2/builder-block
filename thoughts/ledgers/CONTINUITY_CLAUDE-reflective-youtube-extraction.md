# Continuity Ledger: Reflective YouTube Extraction Workflow

## Goal
Build a reflective analysis pipeline for extracting trading strategies from YouTube videos that:
- Segments videos by concept boundaries (not fixed intervals)
- Analyzes each segment like a human learner would
- Correlates to existing skills database
- Generates informed code (not templates)

**Success Criteria:** Pipeline extracts strategy from video with 80%+ confidence, matches existing skills, generates SAD + C# scaffold.

## Constraints
- Must use AskUserQuestion at mandatory checkpoints
- Must preserve user agency over extraction decisions
- Code generation depends on skills having `code_snippet` in database

## Key Decisions
1. **6-signal segmentation** - Frame changes, concept markers, category changes, pauses, emphasis, extended explanations
2. **5-question reflective analysis** - What's happening? Skills correlation? Bigger picture? Pros/cons? Makes sense?
3. **Accumulated understanding** - Strategy flow, matched skills, parameters, confidence score
4. **Multi-timeframe fractal** - Pattern applies at any TF pair (confirmed by user)

## State
- Done:
  - [x] Phase 1: Multi-Signal Segmentation (`scripts/video_segmenter.py`)
  - [x] Phase 2: Reflective Analyzer (`scripts/reflective_analyzer.py`)
  - [x] Phase 3: Understanding-to-Code (`scripts/understanding_to_code.py`)
  - [x] Phase 4: YouTube Skill Update (`.claude/skills/youtube.md`)
  - [x] Pipeline Orchestrator (`scripts/reflective_extraction_pipeline.py`)
  - [x] Test run on Candle 2 Closure video
- Now: [x] Documentation and commit
- Next: Add code_snippet implementations to skills for full code generation

## Open Questions
- RESOLVED: Timeframe applicability -> Multi-timeframe fractal
- RESOLVED: Stop placement -> C2 sweep wick or LTF protected swing
- RESOLVED: Targets -> ERL + 1:2/1:3 R:R

## Working Set

### Files Created/Modified
```
scripts/video_segmenter.py          # Multi-signal segmentation
scripts/reflective_analyzer.py       # 5-question reflective analysis
scripts/understanding_to_code.py     # Understanding -> C# code
scripts/reflective_extraction_pipeline.py  # Orchestrator
.claude/skills/youtube.md            # Updated skill workflow
data/architectures/2026-01-02-candle2-closure.md  # Generated SAD
scripts-output/Strategies/Candle2ClosureStrategy.cs  # Generated scaffold
```

### Test Artifacts
```
data/temp-frames/tyoxl1l-6iI/        # Candle 2 Closure video
  manifest.json                       # Frame-transcript mapping
  transcript_clean.txt                # Cleaned transcript
  frames/                             # Extracted frames (26)
```

### Database Updates
- Linked video to skills #64, #65, #66, #82 in `skill_sources` table
- Added video to `processed_videos` table

## Commands
```bash
# Run reflective extraction pipeline
cd scripts && python3 reflective_extraction_pipeline.py \
    --frames-dir ../data/temp-frames/{video_id} \
    --output-dir ../scripts-output/Strategies \
    --strategy-name {StrategyName}

# Analysis only (no code generation)
cd scripts && python3 reflective_extraction_pipeline.py \
    --frames-dir ../data/temp-frames/{video_id} \
    --analyze-only
```
