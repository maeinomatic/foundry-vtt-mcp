#!/bin/bash
# Quick update script to deploy backend changes without full reinstall

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_SOURCE="$SCRIPT_DIR/packages/mcp-server/dist/backend.bundle.cjs"
BACKEND_DEST="/Applications/MaeinomaticFoundryMCPServer.app/Contents/Resources/maeinomatic-foundry-mcp-server/backend.bundle.cjs"

echo "🔄 Updating backend with quality settings..."

# Copy updated backend
if [ ! -f "$BACKEND_SOURCE" ]; then
  echo "Backend bundle not found at $BACKEND_SOURCE"
  echo "Run the server build first and try again."
  exit 1
fi

sudo cp "$BACKEND_SOURCE" "$BACKEND_DEST"

# Kill old backend
echo "Stopping old backend..."
pkill -9 -f "backend.bundle.cjs"

echo "✅ Backend updated! It will auto-restart when Claude Desktop reconnects."
echo ""
echo "Next steps:"
echo "1. Restart Claude Desktop to pick up changes"
echo "2. Change quality setting in Foundry"
echo "3. Test map generation"
