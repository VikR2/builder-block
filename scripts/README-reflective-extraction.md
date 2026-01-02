# Reflective YouTube Extraction Pipeline

Extract trading strategies from YouTube videos using reflective analysis that processes each segment like a human learner would.

## Quick Start

### Using the Skill (Recommended)

```
/youtube https://youtu.be/VIDEO_ID
```

This invokes the orchestrated workflow with mandatory checkpoints.

### Using the CLI Directly

```bash
# 1. Download video and extract frames
mkdir -p data/temp-frames/{video_id}/frames
yt-dlp -f "best[height<=720]" -o "data/temp-frames/{video_id}/video.mp4" "URL"
ffmpeg -i "data/temp-frames/{video_id}/video.mp4" -vf "fps=1/30" "data/temp-frames/{video_id}/frames/frame_%04d.png"

# 2. Download transcript
yt-dlp --write-auto-sub --sub-lang en --skip-download --convert-subs vtt -o "data/temp-frames/{video_id}/transcript" "URL"

# 3. Create manifest.json (see below)

# 4. Run pipeline
cd scripts
python3 reflective_extraction_pipeline.py \
    --frames-dir ../data/temp-frames/{video_id} \
    --output-dir ../scripts-output/Strategies \
    --strategy-name MyStrategy
```

## Pipeline Components

| Script | Purpose |
|--------|---------|
| `video_segmenter.py` | Multi-signal concept boundary detection |
| `reflective_analyzer.py` | 5-question reflective analysis per segment |
| `understanding_to_code.py` | Convert understanding to NinjaTrader C# |
| `reflective_extraction_pipeline.py` | Orchestrates all components |

## Segmentation Signals

The segmenter detects concept boundaries using 6 signals:

1. **Frame changes** - Visual differences between frames
2. **Concept markers** - Phrases like "now", "here's the key", "important"
3. **Category changes** - Switching between entry/exit/stop topics
4. **Pauses** - Gaps > 2 seconds in speech
5. **Emphasis** - Intensifiers, rhetorical questions, teaching markers
6. **Extended explanations** - High concept density over static chart

## Reflective Analysis

For each segment, the analyzer asks:

1. **What is happening here?** (visual + transcript observation)
2. **How does this correlate to my skills DB?** (keyword + semantic search)
3. **How does this tie into the bigger picture?** (context role)
4. **What is good and bad about this approach?** (pros/cons)
5. **Does this make sense to me?** (confidence + open questions)

## manifest.json Format

```json
{
  "video_id": "VIDEO_ID",
  "video_url": "https://youtu.be/VIDEO_ID",
  "video_title": "Video Title",
  "video_duration_sec": 786,
  "frame_interval_sec": 30,
  "frame_count": 26,
  "full_transcript": "Full transcript text...",
  "frames": [
    {
      "index": 0,
      "frame_path": "frames/frame_0001.png",
      "timestamp_sec": 0,
      "transcript_segment": "Transcript around this timestamp..."
    }
  ]
}
```

## Output Files

| File | Description |
|------|-------------|
| `{Name}_segments.json` | Detected segment boundaries |
| `{Name}_analysis.json` | Full reflective analysis with accumulated understanding |
| `{Name}.cs` | Generated NinjaTrader C# strategy |

## CLI Options

```
--frames-dir PATH     Directory with frames/ and manifest.json (required)
--output-dir PATH     Output directory (default: scripts-output/Strategies)
--strategy-name NAME  Strategy class name (default: from video ID)
--db PATH             Skills database (default: data/builder.db)
--analyze-only        Skip code generation, just analyze
```

## Example Output

```
============================================================
REFLECTIVE EXTRACTION PIPELINE
============================================================
  Frames: data/temp-frames/tyoxl1l-6iI
  Strategy: Candle2ClosureStrategy

STAGE 1: VIDEO SEGMENTATION
  Created 19 segments

STAGE 2: REFLECTIVE ANALYSIS
  Analyzing segment 0...
  ...
  Analyzing segment 18...

STAGE 3: UNDERSTANDING CHECKPOINT
  Strategy Flow: context_setup -> exit_rule -> risk_management
  Matched Skills: 4
  Confidence: 86%

SAVING OUTPUTS
  Saved: Candle2ClosureStrategy_segments.json
  Saved: Candle2ClosureStrategy_analysis.json
  Saved: Candle2ClosureStrategy.cs
```

## Limitations

- **Code generation requires skill code_snippets**: The generated C# is a scaffold unless skills have `code_snippet` populated in the database
- **Frame extraction optional for simple mode**: Reflective mode requires frames
- **Windows encoding**: Unicode characters may cause issues in Windows console (arrows, checkmarks)
