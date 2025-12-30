#!/bin/bash
# SessionStart hook for Skills Library continuity
# Loads ledger and injects library stats into conversation context
set -e

# Pass stdin to Python handler
python3 "$CLAUDE_PROJECT_DIR/.claude/hooks/session-start-skills.py"
