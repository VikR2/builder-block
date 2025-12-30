#!/bin/bash
# Stop the persistent container (keeps data in volumes)
set -e
cd "$(dirname "$0")"

echo "Stopping builder-block-persistent..."
docker stop builder-block-persistent 2>/dev/null || echo "Container not running"

echo ""
echo "Container stopped. Data preserved in volumes."
echo "Use ./start.sh to restart"
