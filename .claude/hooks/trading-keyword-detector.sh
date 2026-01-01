#!/bin/bash
# Trading Keyword Detection Hook
# Detects trading terms in user prompts and injects relevant skill summaries
set -e
cd "$CLAUDE_PROJECT_DIR/.claude/hooks"
cat | python3 trading-keyword-detector.py
