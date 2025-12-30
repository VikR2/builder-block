# YouTube-to-NinjaTrader Code Generation Workflow

This guide explains how to extract trading concepts from YouTube videos and generate NinjaTrader C# code (Indicators and Strategies).

## Overview

```
YouTube URL
     ↓
[1] Fetch Transcript ──────────────► Text transcript
     ↓
[2] Extract Frames ────────────────► 10 key frames + manifest.json
     ↓
[3] Analyze Concepts ──────────────► Trading patterns identified
     ↓
[4] Match Skills ──────────────────► Relevant code snippets from DB
     ↓
[5] Generate Code ─────────────────► .cs files
     ↓
[6] Save to Database ──────────────► Metadata tracked
     ↓
scripts-output/Indicators/*.cs
scripts-output/Strategies/*.cs
```

---

## Prerequisites

### Container Setup
```bash
# Start the persistent container
cd .devcontainer
./start.sh        # Linux/Git Bash
start.bat         # Windows CMD

# Attach to container
./attach.sh       # Linux/Git Bash
attach.bat        # Windows CMD

# Or directly:
docker exec -it builder-block-persistent bash
```

### First-Time Claude Login
```bash
# Inside container
claude
# Type /login → browser opens for OAuth authentication
```

---

## Method 1: Using Claude Code (Recommended)

### Interactive Mode
```bash
# Start Claude with permissions
claude --dangerously-skip-permissions

# Then ask Claude to process a video:
> Generate from https://www.youtube.com/watch?v=VIDEO_ID
```

### What Claude Does
1. Calls `youtube-transcript` MCP server to fetch transcript
2. Downloads video and extracts 10 key frames
3. Analyzes transcript for trading concepts
4. Searches skill database for matching patterns
5. Generates NinjaTrader C# code
6. Saves files and updates database

---

## Method 2: Direct Script Execution

### Basic Usage
```bash
cd /workspace

# Full workflow
uv run python -m runtime.harness scripts/generate_from_youtube.py \
    --url "https://www.youtube.com/watch?v=VIDEO_ID" \
    --project-id 1 \
    --output-dir scripts-output/
```

### Command Options
```bash
uv run python -m runtime.harness scripts/generate_from_youtube.py \
    --url "URL"              # Required: YouTube video URL
    --project-id ID          # Project ID in database (default: 1)
    --output-dir DIR         # Output directory (default: scripts-output/)
    --skip-frames            # Skip video download/frame extraction
    --skip-analysis          # Skip concept analysis
    --skip-code-gen          # Skip code generation
    --template-mode          # Generate template-only code
    --force                  # Re-process even if video was processed before
    --verbose                # Enable detailed logging
    --keep-frames            # Don't delete frames after processing
```

### Examples

**Process a video with all steps:**
```bash
uv run python -m runtime.harness scripts/generate_from_youtube.py \
    --url "https://www.youtube.com/watch?v=LKNQDAdId4s" \
    --project-id 1 \
    --verbose
```

**Re-process a previously processed video:**
```bash
uv run python -m runtime.harness scripts/generate_from_youtube.py \
    --url "https://www.youtube.com/watch?v=LKNQDAdId4s" \
    --force
```

**Transcript only (no frames):**
```bash
uv run python -m runtime.harness scripts/generate_from_youtube.py \
    --url "https://www.youtube.com/watch?v=LKNQDAdId4s" \
    --skip-frames
```

---

## Method 3: Manual Step-by-Step

### Step 1: Fetch Transcript
```bash
# Using yt-dlp directly (for auto-generated captions)
yt-dlp --write-auto-sub --sub-lang en --skip-download \
    --sub-format vtt -o '/tmp/video' \
    'https://www.youtube.com/watch?v=VIDEO_ID'

# View transcript
cat /tmp/video.en.vtt
```

### Step 2: Extract Frames
```bash
# Get video duration
ffprobe -v error -show_entries format=duration \
    -of default=noprint_wrappers=1:nokey=1 \
    "$(yt-dlp -g 'https://www.youtube.com/watch?v=VIDEO_ID' | head -1)"

# Download and extract frames (10 evenly spaced)
yt-dlp -o '/tmp/video.mp4' 'https://www.youtube.com/watch?v=VIDEO_ID'
ffmpeg -i /tmp/video.mp4 -vf "select='not(mod(n,INTERVAL))'" \
    -vsync vfr /tmp/frames/frame_%03d.jpg
```

### Step 3: Query Skills Database
```bash
# Search for matching skills
sqlite3 /workspace/data/builder.db \
    "SELECT name, description FROM skills WHERE name LIKE '%sweep%';"

# Or use MCP server
node /workspace/.claude/mcp-servers/nt-skills/dist/index.js
# (requires JSON-RPC input)
```

---

## Output Structure

### Generated Files
```
scripts-output/
├── Indicators/
│   ├── LiquiditySweepDetectionIndicator.cs
│   ├── OrderBlockIndicator.cs
│   └── FairValueGapIndicator.cs
└── Strategies/
    ├── DailyFrameworkStrategy.cs
    └── YoutubegeneratedorderblockStrategy.cs
```

### Temporary Files
```
data/temp-frames/
└── VIDEO_ID/
    ├── frame_001.jpg
    ├── frame_002.jpg
    ├── ...
    ├── frame_010.jpg
    └── manifest.json
```

### Database Tables Updated
- `processed_videos` - Tracks which videos have been processed
- `scripts` - Stores generated script metadata
- `script_skills` - Links scripts to skills used

---

## Trading Concepts Detected

The workflow recognizes these trading patterns:

| Category | Keywords |
|----------|----------|
| **Entry Patterns** | sweep, liquidity grab, break of structure, order block, fair value gap, CISD |
| **Risk Management** | stop loss, take profit, breakeven, risk reward, position sizing |
| **Market Structure** | bias, trend, support, resistance, asian session, london, new york |
| **Indicators** | VWAP, POC, range, ATR, moving average, volume profile |

---

## Troubleshooting

### "No transcript available"
```bash
# Check if video has captions
yt-dlp --list-subs 'https://www.youtube.com/watch?v=VIDEO_ID'

# If no captions, provide manual description to Claude
```

### "Video already processed"
```bash
# Use --force flag to re-process
uv run python -m runtime.harness scripts/generate_from_youtube.py \
    --url "URL" --force
```

### "MCP server not responding"
```bash
# Rebuild MCP servers
cd /workspace/.claude/mcp-servers/nt-skills && npm run build
cd /workspace/.claude/mcp-servers/youtube-transcript && npm install

# Verify database
sqlite3 /workspace/data/builder.db "SELECT COUNT(*) FROM skills;"
```

### "yt-dlp errors"
```bash
# Update yt-dlp (may need newer version)
pip3 install --upgrade yt-dlp --break-system-packages

# Check version
yt-dlp --version
```

---

## Verification Commands

```bash
# Check all dependencies
yt-dlp --version
ffmpeg -version | head -1
sqlite3 --version
node --version

# Check MCP servers
ls -la /workspace/.claude/mcp-servers/*/

# Check database
sqlite3 /workspace/data/builder.db "SELECT COUNT(*) FROM skills;"
sqlite3 /workspace/data/builder.db "SELECT COUNT(*) FROM processed_videos;"

# Check output files
ls -la /workspace/scripts-output/Indicators/
ls -la /workspace/scripts-output/Strategies/
```

---

## NinjaTrader Compilation Order

After generating code:

1. **Compile Indicators first**
   - Open NinjaTrader 8
   - Go to: Tools → Edit NinjaScript → Indicators
   - Add generated .cs files
   - Press F5 to compile

2. **Then compile Strategies**
   - Go to: Tools → Edit NinjaScript → Strategies
   - Add generated .cs files
   - Press F5 to compile

3. **Test in Strategy Analyzer**
   - New → Strategy Analyzer
   - Select your strategy
   - Configure backtest parameters
   - Run analysis

---

## Quick Reference

| Task | Command |
|------|---------|
| Start container | `cd .devcontainer && ./start.sh` |
| Attach to container | `docker exec -it builder-block-persistent bash` |
| Start Claude | `claude --dangerously-skip-permissions` |
| Process video | `Generate from https://youtube.com/...` |
| Check skills | `sqlite3 data/builder.db "SELECT * FROM skills;"` |
| View outputs | `ls scripts-output/Indicators/` |
