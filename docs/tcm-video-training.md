# TCM Video Training Workflow

Guide for adding new TCM (The Currency Merchant) videos to the tutor-style chat and lesson pipeline.

## Overview

The TCM mentor chat learns from video content through a multi-step pipeline:

```
Video File → Transcription → Frame Extraction → Embeddings → Lesson + Tutor Pack → Skill Linking → Database
```

For the current local extraction and noisy-audio cleanup workflow, see:

- [Video Extraction And Audio Cleanup](../.Codex/rules/video-extraction.md)
- [TCM ElevenLabs Audio Cleanup Implementation](./tcm-elevenlabs-audio-cleanup-implementation.md)

## Prerequisites

1. **Video File**: Local MP4 file (YouTube videos should be downloaded first)
2. **Whisper**: For transcription (automatically installed via uv)
3. **FFmpeg**: For frame extraction (must be installed on system)

## Quick Start

### 1. Process a Local Video

```bash
cd builder-block-C

# Basic processing
uv run python scripts/process_local_mp4.py path/to/video.mp4

# With custom output directory
uv run python scripts/process_local_mp4.py video.mp4 --output-dir data/local-videos/tcm-lesson-name/

# With options
uv run python scripts/process_local_mp4.py video.mp4 \
  --whisper-model small \
  --frame-interval 45 \
  --title "TCM Order Fulfillment Lesson 1"

# ElevenLabs transcription backend
uv run python scripts/process_local_mp4.py video.mp4 \
  --transcription-backend elevenlabs \
  --elevenlabs-key "$ELEVENLABS_API_KEY"

# ElevenLabs transcription with Voice Isolator noise reduction
uv run python scripts/process_local_mp4.py video.mp4 \
  --transcription-backend elevenlabs \
  --audio-cleanup-mode voice_isolator \
  --elevenlabs-key "$ELEVENLABS_API_KEY"

# Rebuild transcript embeddings with the project's default multimodal model
uv run python scripts/embed_transcripts.py --profiles coarse,fine
```

## Embedding Strategy

The current production embedding choice for this project is Google
`gemini-embedding-2-preview`.

Reason:

- the retrieval roadmap includes transcript text today plus PDFs, images, and
  video-aware retrieval later
- the current FAISS corpus on disk is already built with the Gemini preview
  multimodal embedding space
- keeping the same embedding family avoids mixed-corpus incompatibilities unless
  we do an intentional full rebuild

If you intentionally want to rebuild onto another embedding model, do it as a
full corpus migration, not as an incremental partial re-embed.

### 2. Verify Output

After processing, check the output directory:

```
data/local-videos/VideoName_abc12345/
├── frames/
│   ├── frame_001.jpg
│   ├── frame_002.jpg
│   └── ...
├── embeddings.faiss         # Vector index for transcript retrieval
├── lesson.json              # Lesson guide + tutorPack coaching artifact
├── manifest.json           # Frame metadata with transcript segments
├── transcript.txt          # Full plain text transcript
└── transcript_timed.json   # Timestamped transcript segments
```

### 3. Extract Skills

After video processing, use the YouTube extraction skill to extract trading concepts:

```
/youtube data/local-videos/VideoName_abc12345/transcript.txt
```

Or manually identify skills and add them to the database.

## Output Artifacts

### transcript_timed.json

Timestamped transcript for search:

```json
[
  {
    "start": 61.65,
    "end": 77.5,
    "text": "Today we're going to talk about the submission range..."
  },
  ...
]
```

### manifest.json

Links frames to transcript segments for visual context:

```json
{
  "video_id": "VideoName_abc12345",
  "title": "TCM Order Fulfillment",
  "duration_sec": 4860,
  "frames": [
    {
      "frame_number": 1,
      "timestamp": 0,
      "filename": "frame_001.jpg",
      "transcript_segment": "Introduction to today's lesson..."
    },
    ...
  ]
}
```

## How the Bot Uses Videos

### Search

When users ask questions, the bot:

1. Searches `transcript_timed.json` for matching text
2. Pulls lesson and `tutorPack` guidance from `lesson.json`
3. Prioritizes mentor-style notes, misconceptions, and chart-reading rules for lesson-specific questions
4. Identifies relevant timestamps and recommended clips
5. Returns corresponding frames from `frames/` directory when useful

### Tutor Pack

Each processed lesson now produces a `tutorPack` inside `lesson.json` with:

- mentor approach
- prerequisites
- teaching sequence
- core concepts
- common misconceptions
- chart-reading rules
- if-you-see-this-then-that coaching cues
- diagnostic questions
- practice prompts
- glossary

The chat uses this artifact before falling back to raw transcript fragments, which makes answers feel more like a tutor working from the video rather than a transcript search.

### Frame Display

The bot serves frames via `/api/tcm/frames/[videoId]/[frameNumber]`:

- Frames are matched to timestamps using 45-second intervals
- Transcript text is shown as tooltip on hover
- Users can see visual examples alongside text answers

### Study Guides

Generated study guides can reference specific video timestamps and frames.

## TCM-Specific Metadata

When processing TCM videos, include relevant metadata:

```bash
uv run python scripts/process_local_mp4.py video.mp4 \
  --title "TCM Akatsuki Bootcamp - Indicators" \
  --source-type tcm
```

This helps the bot prioritize TCM-specific content in search results.

## Database Tables

Videos are tracked in:

- `processed_local_videos` - Processing status and file info
- Skills are linked via `skill_sources` with `source_type = 'video'`

## Troubleshooting

### Whisper Not Working

```bash
# Check if whisper is installed
uv pip list | grep whisper

# Install manually if needed
uv pip install openai-whisper
```

### FFmpeg Not Found

Install FFmpeg on your system:
- Windows: `winget install ffmpeg`
- macOS: `brew install ffmpeg`
- Linux: `sudo apt install ffmpeg`

### Database Not Found

Ensure the database exists:

```bash
# Initialize database
sqlite3 data/builder.db < data/schema.sql
```

### Large Videos

For videos longer than 60 minutes:
- Consider increasing frame interval: `--frame-interval 60`
- Use a faster Whisper model: `--whisper-model tiny`

## Best Practices

1. **Naming**: Use descriptive directory names
2. **Intervals**: 45 seconds works well for most TCM videos
3. **Backup**: Keep original video files separate from processing output
4. **Verification**: Review transcript for accuracy after processing
5. **Skills**: Extract 3-5 key concepts per video section
6. **Noisy uploads**: Use the ElevenLabs `voice_isolator` path when you need denoising before transcription
