#!/bin/bash
# Full reset - removes container AND volumes (fresh start)
set -e
cd "$(dirname "$0")"

echo "=== FULL RESET ==="
echo "This will delete the container and ALL cached data:"
echo "  - Installed plugins"
echo "  - node_modules"
echo "  - npm/uv caches"
echo ""
read -p "Are you sure? (y/N): " confirm

if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
    echo "Cancelled."
    exit 0
fi

echo ""
echo "Stopping and removing container..."
docker-compose down -v --remove-orphans 2>/dev/null || true
docker rm -f builder-block-persistent 2>/dev/null || true

echo "Removing volumes..."
docker volume rm devcontainer_claude-cache 2>/dev/null || true
docker volume rm devcontainer_node-modules 2>/dev/null || true
docker volume rm devcontainer_npm-cache 2>/dev/null || true
docker volume rm devcontainer_uv-cache 2>/dev/null || true

echo ""
echo "Reset complete. Run ./start.sh for fresh container."
