#!/bin/bash
set -e

echo "Setting up builder-block development environment..."

# Create output directories for YouTube workflow
echo "Creating output directories..."
mkdir -p /workspace/scripts-output/Indicators
mkdir -p /workspace/scripts-output/Strategies
mkdir -p /workspace/data/temp-frames

# Verify YouTube workflow dependencies
echo "Verifying YouTube workflow dependencies..."
if command -v yt-dlp &> /dev/null; then
    echo "  yt-dlp: $(yt-dlp --version)"
else
    echo "  WARNING: yt-dlp not found - YouTube transcript fallback will not work"
fi

if command -v ffmpeg &> /dev/null; then
    echo "  ffmpeg: $(ffmpeg -version 2>&1 | head -1)"
else
    echo "  WARNING: ffmpeg not found - frame extraction will not work"
fi

# Build project MCP server
# NOTE: Must rebuild node_modules in container because better-sqlite3 has native bindings
# that are platform-specific (Windows vs Linux)
echo "Building nt-skills MCP server..."
cd /workspace/.claude/mcp-servers/nt-skills
rm -rf node_modules  # Force rebuild for Linux
npm install
npm run build

# Install youtube-transcript MCP server dependencies
echo "Installing youtube-transcript MCP server..."
cd /workspace/.claude/mcp-servers/youtube-transcript
rm -rf node_modules  # Force rebuild for Linux
npm install

# Verify database exists and is accessible
echo "Verifying database..."
SKILL_COUNT=$(sqlite3 /workspace/data/builder.db "SELECT COUNT(*) FROM skills;")
echo "Found $SKILL_COUNT skills in database."

# Ensure hooks are executable
chmod +x /workspace/.claude/hooks/*.sh 2>/dev/null || true

# Initialize Continuous Claude v2
echo "Initializing Continuous Claude v2..."
if command -v cc &> /dev/null; then
    cd /workspace
    cc init --yes 2>/dev/null || echo "CC-v2 already initialized or init skipped"
fi

# Plugins are configured in .claude/settings.json and will auto-download on first claude run
# Plugin cache persists in docker volume: claude-cache

echo ""
echo "Setup complete!"
echo "Run 'claude' to start a Claude Code session."
echo ""
echo "Configured plugins (will download on first run):"
echo "  - ralph-wiggum"
echo "  - frontend-design"
echo "  - github"
echo "  - serena"
echo "  - playwright"
