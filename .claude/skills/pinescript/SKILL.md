# /pinescript - Pine Script & Local MP4 Extraction Workflow

Extract trading skills from TradingView Pine Scripts or local MP4 video files.
Outputs: Skills to database + Strategy Architecture Document + Pine Script code.

## Invocation

```
/pinescript <path>                    # Auto-detect input type
/pinescript strategy.pine             # Parse Pine Script file
/pinescript webinar.mp4               # Process local video
/pinescript --help                    # Show options
```

## Arguments

| Argument | Type | Description |
|----------|------|-------------|
| `<path>` | File path | Path to .pine file or .mp4 video |
| `--output` | Directory | Output directory for generated files |
| `--type` | indicator/strategy | Output type for Pine generation |
| `--whisper-model` | tiny/base/small/medium/large | Whisper model for transcription |
| `--skip-sad` | Flag | Skip SAD generation |
| `--skip-code` | Flag | Skip Pine code generation |

## Workflow

```
                         /pinescript <path>
                                │
                ┌───────────────┴───────────────┐
                │                               │
         [.pine file]                    [.mp4 file]
                │                               │
                ▼                               ▼
     ┌──────────────────┐          ┌──────────────────┐
     │  Pine Parser     │          │  MP4 Processor   │
     │  (regex+Claude)  │          │  (Whisper+ffmpeg)│
     └────────┬─────────┘          └────────┬─────────┘
              │                             │
              ▼                             ▼
     ┌──────────────────┐          ┌──────────────────┐
     │ Extract:         │          │ Extract:         │
     │ - Inputs         │          │ - Transcript     │
     │ - Variables      │          │ - Frames         │
     │ - Functions      │          │ - Manifest       │
     │ - Patterns       │          │                  │
     └────────┬─────────┘          └────────┬─────────┘
              │                             │
              └──────────┬──────────────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │  CHECKPOINT 1        │
              │  Intent Classification│
              │  • complete_strategy │
              │  • skills_library    │
              │  • educational       │
              └──────────┬───────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │  Skill Matching      │
              │  (FTS + embeddings)  │
              └──────────┬───────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │  CHECKPOINT 2        │
              │  Skills Review       │
              │  • NEW (create)      │
              │  • AMBIGUOUS (decide)│
              │  • EXISTING (link)   │
              └──────────┬───────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │  Write to Database   │
              │  (builder.db)        │
              └──────────┬───────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │  CHECKPOINT 3        │
              │  SAD Approval        │
              │  (show generated SAD)│
              └──────────┬───────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │  Generate Pine Script│
              │  (from SAD + skills) │
              └──────────┬───────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │  CHECKPOINT 4        │
              │  Code Review         │
              │  (approve final Pine)│
              └──────────┬───────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │  Save Outputs        │
              │  scripts-output/TV/  │
              └──────────────────────┘
```

---

## Checkpoint Definitions

### CHECKPOINT 1: Intent Classification

After analyzing the input, STOP and ask the user:

```yaml
question: "What type of content is this?"
header: "Intent"
options:
  - label: "Complete Strategy"
    description: "Full trading model with entry/exit/risk rules"
  - label: "Skills Library Addition"
    description: "Individual patterns/techniques to add to library"
  - label: "Educational Content"
    description: "General trading education, no specific skills"
```

**Analysis Summary to Show:**
```
Input Analysis Summary:
- Source: [filename]
- Type: [Pine Script / MP4 Video]
- Duration/Lines: [X minutes / Y lines]
- Detected Intent: [complete_strategy | skills_library | educational]

Key findings:
- [Pattern/concept 1]
- [Pattern/concept 2]
- [Pattern/concept 3]
```

### CHECKPOINT 2: Skills Review

Before writing to database, STOP and present:

```
Skills to Extract:

NEW (will create):
- [Skill Name 1] - [brief description]
- [Skill Name 2] - [brief description]

AMBIGUOUS (similar to existing):
- "[Extracted Name]" ~= existing skill #[ID] "[Existing Name]"
  → Use existing / Create new / Skip

EXISTING (already in library):
- #[ID] [Skill Name] - will link to source

Extract these skills?
```

Use AskUserQuestion with options:
- "Yes, extract all"
- "No, let me edit the list"
- "Cancel extraction"

### CHECKPOINT 3: SAD Approval

After generating SAD, show preview and ask:

```yaml
question: "Approve this Strategy Architecture Document?"
header: "SAD Review"
options:
  - label: "Approve SAD"
    description: "Proceed to Pine Script generation"
  - label: "Edit SAD"
    description: "I'll make changes before continuing"
  - label: "Skip Pine Generation"
    description: "Keep SAD but don't generate code"
```

**Show SAD Preview:**
- Title
- Overview (first 200 chars)
- Skills count
- Timeframe configuration
- Entry checklist count

### CHECKPOINT 4: Code Review

Before saving generated Pine Script:

```yaml
question: "Approve this Pine Script?"
header: "Code Review"
options:
  - label: "Approve and Save"
    description: "Save to scripts-output/TradingView/"
  - label: "Edit Code"
    description: "I'll modify before saving"
  - label: "Regenerate"
    description: "Try generating again with different parameters"
  - label: "Cancel"
    description: "Don't save Pine Script"
```

---

## Input Detection

Detect input type by file extension:

```python
if path.suffix.lower() in ['.pine', '.pinescript', '.txt']:
    # Pine Script file
    run_pine_parser(path)
elif path.suffix.lower() in ['.mp4', '.mov', '.mkv', '.avi', '.webm']:
    # Video file
    run_mp4_processor(path)
else:
    # Unknown - ask user
    ask_input_type()
```

---

## Pine Script Processing

For `.pine` files:

### Step 1: Parse Structure

```bash
uv run python scripts/pine_parser.py <path> --pretty
```

Output:
```json
{
  "version": 6,
  "script_type": "indicator",
  "name": "Strategy Name",
  "inputs": [...],
  "variables": [...],
  "functions": [...],
  "plots": [...],
  "alerts": [...]
}
```

### Step 2: Semantic Analysis (Optional)

If user approves, run semantic analysis:

```bash
uv run python scripts/pine_parser.py <path> --semantic
```

This uses Claude to identify:
- Trading patterns (CISD, FVG, OB, etc.)
- Entry/exit conditions
- Risk management rules
- State machine structure

### Step 3: Skill Matching

Query skills database for matches:

```sql
SELECT id, name, description
FROM skills
WHERE name LIKE '%pattern_keyword%'
   OR description LIKE '%pattern_keyword%'
```

### Step 4: Generate Outputs

1. **Skills**: Write new skills to database
2. **SAD**: Generate Strategy Architecture Document
3. **Pine Script**: Regenerate clean Pine v6 code

---

## MP4 Video Processing

For video files:

### Step 1: Process Video

```bash
uv run python scripts/process_local_mp4.py <path> \
    --output-dir data/local-videos/<name>/ \
    --whisper-model base \
    --frame-interval 45
```

Output:
- `manifest.json` - Frame-transcript pairing
- `frames/frame_*.jpg` - Extracted frames
- `transcript.txt` - Full transcript
- `transcript_timed.json` - Timestamped segments

### Step 2: Analyze Content

Use reflective analysis (from youtube workflow):

```python
from scripts.reflective_analyzer import ReflectiveAnalyzer

analyzer = ReflectiveAnalyzer(db_path)
analysis = analyzer.analyze_manifest(manifest_path)
```

### Step 3: Extract Skills

Same skill extraction pipeline as YouTube workflow.

### Step 4: Generate Outputs

1. **Skills**: Write to database
2. **SAD**: Generate from analysis
3. **Pine Script**: Generate from SAD

---

## Output Files

| Output | Location | Description |
|--------|----------|-------------|
| Skills | `data/builder.db` | Inserted into skills table |
| SAD | `data/architectures/<name>.md` | Strategy Architecture Document |
| Pine Script | `scripts-output/TradingView/<name>.pine` | Generated v6 Pine Script |
| Manifest | `data/local-videos/<id>/manifest.json` | Video processing manifest |

---

## Database Schema

### Skills Table (Extended)

```sql
-- Existing columns
id, name, slug, category, description, code_snippet, ...

-- New columns (from migration 003)
pine_snippet TEXT,       -- Pine Script v6 code snippet
pine_version INTEGER     -- Pine Script version (default 6)
```

### Processed Local Videos Table

```sql
CREATE TABLE processed_local_videos (
    id INTEGER PRIMARY KEY,
    filename TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_hash TEXT UNIQUE,
    duration_sec INTEGER,
    transcript_method TEXT,
    whisper_model TEXT,
    frame_count INTEGER,
    skills_extracted INTEGER,
    sad_path TEXT,
    pine_path TEXT,
    processing_status TEXT,
    created_at TEXT,
    processed_at TEXT
);
```

---

## Error Handling

### Missing Dependencies

```
Error: faster-whisper not installed

Solution:
  pip install faster-whisper

Or skip transcription:
  /pinescript video.mp4 --skip-transcription
```

### ffmpeg Not Found

```
Error: ffmpeg not found in PATH

Solution:
  # Windows (winget)
  winget install Gyan.FFmpeg

  # Or download from: https://ffmpeg.org/download.html
```

### Database Errors

If database operations fail:
1. Migrations may not have run
2. Run: `sqlite3 data/builder.db < data/migrations/003_add_pine_fields.sql`
3. Run: `sqlite3 data/builder.db < data/migrations/004_add_local_videos.sql`

---

## Examples

### Extract from Pine Script

```
User: /pinescript scripts-output/TradingView/C2C3.pine

Claude: Parsing Pine Script...

Pine Script Analysis:
- Type: indicator
- Name: Candle 2 Closure [LuxAlgo]
- Version: 6
- Inputs: 15
- Functions: 6

CHECKPOINT 1: What type of content is this?
[complete_strategy | skills_library | educational]

User: skills_library

Claude: Analyzing patterns...

Detected patterns:
- Candle 2 reversal pattern
- Candle 3 expansion pattern
- Zone visualization

CHECKPOINT 2: Skills Review

NEW (will create):
- "Candle 2 Reversal Detection" - Detects reversal close below prior low
- "Candle 3 Expansion" - Detects expansion after reversal

EXISTING (in library):
- #64 Candle 2 Closure - matches extracted pattern

Extract these skills?
[Yes, extract all | Edit list | Cancel]

...
```

### Extract from MP4 Video

```
User: /pinescript ~/Downloads/trading-webinar.mp4

Claude: Processing video...

[1/3] Transcribing with Whisper (base)...
  Transcribed 142 segments (24,500 chars)

[2/3] Extracting frames...
  Extracted 25 frames at 45s intervals

[3/3] Creating manifest...
  Manifest saved: data/local-videos/trading-webinar_abc123/manifest.json

CHECKPOINT 1: What type of content is this?
[complete_strategy | skills_library | educational]

...
```

---

## Related Skills

- `/youtube <url>` - Extract from YouTube videos
- `/sad-to-pine <sad-path>` - Generate Pine from existing SAD
- `/implement-strategy` - Generate NinjaTrader C# from SAD

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "No transcript" | Check Whisper installation, try --whisper-model small |
| "No frames extracted" | Check ffmpeg installation and video codec |
| "Skill matching failed" | Database may be empty, check builder.db |
| "Pine generation empty" | Claude API may have failed, check ANTHROPIC_API_KEY |
| "Duplicate video" | File already processed, use --force to reprocess |

---

## Configuration

Environment variables:

```bash
ANTHROPIC_API_KEY=sk-...    # Required for semantic analysis & Pine generation
```

Database path: `data/builder.db`

Default output dirs:
- Local videos: `data/local-videos/`
- Pine Scripts: `scripts-output/TradingView/`
- SADs: `data/architectures/`
