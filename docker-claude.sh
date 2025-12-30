#!/bin/bash
# Run Claude Code in Docker container
#
# Usage:
#   ./docker-claude.sh          # Start interactive session
#   ./docker-claude.sh --help   # Show Claude help
#
# First time: Build the image with:
#   docker build -t builder-block-claude .devcontainer/

docker run -it --rm \
  -v "$(pwd):/workspace" \
  -v "$HOME/.anthropic:/root/.anthropic" \
  -e ANTHROPIC_API_KEY \
  -w /workspace \
  builder-block-claude \
  claude "$@"
