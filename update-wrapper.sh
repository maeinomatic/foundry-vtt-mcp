#!/bin/bash
# Update wrapper with debug logging

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WRAPPER_SOURCE="$SCRIPT_DIR/packages/mcp-server/dist/index.bundle.cjs"
WRAPPER_DEST="/Applications/MaeinomaticFoundryMCPServer.app/Contents/Resources/maeinomatic-foundry-mcp-server/index.cjs"

echo "Updating wrapper with debug logging..."

if [ ! -f "$WRAPPER_SOURCE" ]; then
  echo "Wrapper bundle not found at $WRAPPER_SOURCE"
  echo "Run the server build first and try again."
  exit 1
fi

sudo cp "$WRAPPER_SOURCE" "$WRAPPER_DEST"

echo "✅ Wrapper updated"
echo ""
echo "Now:"
echo "1. Quit Claude Desktop completely (Cmd+Q)"
echo "2. Wait 3 seconds"
echo "3. Reopen Claude Desktop"
echo "4. Check wrapper log: tail -f /tmp/maeinomatic-foundry-mcp-server/wrapper.log"
