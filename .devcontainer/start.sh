#!/bin/bash
# Start the persistent container (builds if needed)
set -e
cd "$(dirname "$0")"

echo "=== Builder Block Persistent Container ==="
echo ""

# Check if container exists and is running
if docker ps --format '{{.Names}}' | grep -q '^builder-block-persistent$'; then
    echo "Container already running. Use ./attach.sh to connect."
    exit 0
fi

# Check if container exists but stopped
if docker ps -a --format '{{.Names}}' | grep -q '^builder-block-persistent$'; then
    echo "Starting existing container..."
    docker start builder-block-persistent
else
    echo "Building and starting new container..."
    docker-compose up -d --build claude-persistent

    echo ""
    echo "Running first-time setup..."
    docker exec builder-block-persistent bash /workspace/.devcontainer/setup.sh
fi

echo ""
echo "Container is running!"
echo "Use ./attach.sh to connect"
echo "Use ./stop.sh to stop"
