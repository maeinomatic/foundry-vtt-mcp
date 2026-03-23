# Project Identity And Attribution

This repository began as a fork of
[`adambdooley/foundry-vtt-mcp`](https://github.com/adambdooley/foundry-vtt-mcp)
and is now independently maintained at
[`maeinomatic/foundry-vtt-mcp`](https://github.com/maeinomatic/foundry-vtt-mcp).

## Current Project Position

- This repo is an independent project, not just a temporary feature fork.
- Its roadmap, architecture, CI/CD setup, and release direction are maintained
  independently.
- Public branding in docs and manifests may differ from the original upstream.

## Attribution

- Original upstream author: Adam Dooley
- Current independent maintainer: maeinomatic

The project remains MIT-licensed. Upstream attribution is intentionally
preserved in the license, docs, and manifest metadata.

## Compatibility Note

Some technical identifiers still intentionally remain stable for compatibility,
including:

- the Foundry module ID `foundry-mcp-bridge`
- internal bridge query namespaces using `foundry-mcp-bridge`
- workspace package names under `@foundry-mcp/*`

These identifiers are currently retained so existing installations, socket
routing, and MCP integrations do not break during the branding transition.
