#!/bin/bash
# Attach to the persistent container
set -e
cd "$(dirname "$0")"

# Check if container is running
if ! docker ps --format '{{.Names}}' | grep -q '^builder-block-persistent$'; then
    echo "Container not running. Starting it first..."
    ./start.sh
fi

echo "Attaching to builder-block-persistent..."
echo "Tip: Use 'tmux' for persistent sessions inside the container"
echo ""

# Attach with interactive bash
docker exec -it builder-block-persistent bash
