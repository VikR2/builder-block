#!/bin/bash
# Option 2: Run container with interactive terminal popup
# This starts a fresh container and opens a bash terminal immediately

set -e
cd "$(dirname "$0")"

echo "Starting builder-block container with interactive terminal..."
echo ""

# Build and run with terminal profile
docker-compose --profile terminal run --rm claude-terminal
