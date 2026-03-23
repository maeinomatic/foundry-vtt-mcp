# Technical Identity Plan

## Purpose

This document defines the project's canonical technical identity now that the
fork is being treated as an independent product.

It separates:

- public branding
- technical/runtime identifiers
- things we already migrated
- things we intentionally did not rename

Related docs:

- [../../NOTICE.md](../../NOTICE.md)
- [MCP_TOOL_CATALOG.md](./MCP_TOOL_CATALOG.md)
- [WORKFLOW_ROADMAP.md](./WORKFLOW_ROADMAP.md)

## Current Position

The technical identity migration is complete for the repo itself.

We are no longer preserving the old upstream-facing compatibility IDs inside the
codebase just for the sake of continuity. Because there are no external users
on this fork yet, the cleaner senior-level choice is to standardize now instead
of carrying invisible legacy identifiers forward.

## Canonical Identity

### Public Brand

- Product name: `Maeinomatic Foundry MCP Bridge`
- Server/app name: `Maeinomatic Foundry MCP Server`
- Maintainer: `maeinomatic`

### Runtime And Packaging IDs

- Foundry module ID: `maeinomatic-foundry-mcp`
- Bridge query namespace: `maeinomatic-foundry-mcp.*`
- Socket channel namespace: `module.maeinomatic-foundry-mcp`
- Claude Desktop MCP server key: `maeinomatic-foundry-mcp`
- Foundry namespace env value: `/maeinomatic-foundry-mcp`
- Default server name: `maeinomatic-foundry-mcp-server`

### Workspace Package Names

- `@maeinomatic/foundry-mcp-shared`
- `@maeinomatic/foundry-mcp-server`
- `@maeinomatic/foundry-mcp-module`

### Distribution And Installer Identity

- Foundry module zip: `maeinomatic-foundry-mcp.zip`
- Server zip: `maeinomatic-foundry-mcp-server-<version>.zip`
- Windows installer: `MaeinomaticFoundryMCPServer-Setup-<version>.exe`
- macOS DMG/PKG base name: `MaeinomaticFoundryMCPServer`
- Installer package identifiers: `io.github.maeinomatic.foundrymcp.*`

## Explicit Non-Identity Settings

These are runtime/transport settings, not branding surfaces:

- `FOUNDRY_STUN_SERVERS`
- `FOUNDRY_HOST`
- `FOUNDRY_PORT`
- `FOUNDRY_CONNECTION_TYPE`
- other generic transport/network options

They should only be renamed if we intentionally redesign the configuration
surface, not as part of rebranding.

## What We Intentionally Did Not Rename

These still reflect current reality outside the codebase and may change later:

- GitHub repository URL still uses `maeinomatic/foundry-vtt-mcp`
- local clone paths may still use `foundry-vtt-mcp`
- historical/archive docs still refer to the old upstream identity where that
  context is part of the record

Those are not runtime contracts, so they do not block the technical rename.

## Decision Rule Going Forward

Use these names as the source of truth for any new work.

If a new tool, workflow, installer change, or doc adds a new identifier, it
should align with the canonical values above unless there is a strong
compatibility reason not to.

## Future Follow-Up

Possible later cleanup, if wanted:

1. Rename the GitHub repository itself.
2. Update remaining non-runtime docs/examples that still mention legacy clone
   paths or older artifact names.
3. Audit third-party listings or repackaged npm entries that point at the repo.
