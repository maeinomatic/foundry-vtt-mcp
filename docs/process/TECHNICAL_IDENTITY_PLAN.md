# Technical Identity Plan

## Purpose

This document separates public branding from technical compatibility
identifiers.

Use it to answer:

- what we can rename immediately without breaking users
- what should stay stable for now
- what would require an explicit migration plan
- how to phase future identity changes safely

Related docs:

- [../../NOTICE.md](../../NOTICE.md)
- [MCP_ADAPTER_ARCHITECTURE.md](./MCP_ADAPTER_ARCHITECTURE.md)
- [MCP_TOOL_CATALOG.md](./MCP_TOOL_CATALOG.md)
- [WORKFLOW_ROADMAP.md](./WORKFLOW_ROADMAP.md)

## Decision Summary

This repo is now an independently maintained project.

We should treat identity in two layers:

1. Public identity
2. Technical identity

Public identity should reflect the independent project now.
Technical identity should only change when we have a migration path.

## Identity Layers

### Public Identity

These are user-facing and should reflect the current maintainer and project
direction:

- repository owner and links
- README and installation docs
- module title shown in Foundry
- workflow names
- release titles and release notes
- support and issue links
- installer copy shown to users

These are safe to rename as long as compatibility-sensitive IDs are left alone.

### Technical Identity

These are compatibility surfaces:

- Foundry module ID
- bridge query namespace
- socket event names
- Claude Desktop MCP server key examples
- workspace package scope
- artifact filenames
- app bundle and installer identifiers

These should not be changed casually.

## Current State

### Public Identity

Current public branding is now aligned with the independent project in the main
docs and workflow names.

Examples:

- repository metadata points to `maeinomatic/foundry-vtt-mcp`
- the Foundry module title is `Maeinomatic Foundry MCP Bridge`
- release and workflow labels now use Maeinomatic branding in the main CI/CD
  surfaces

### Technical Identity

The following compatibility-sensitive identifiers still intentionally remain
stable:

- Foundry module ID: `foundry-mcp-bridge`
- bridge query namespace prefix: `foundry-mcp-bridge.*`
- socket event names using `foundry-mcp-bridge`
- Claude Desktop example server key: `foundry-mcp`
- Claude Desktop environment namespace: `/foundry-mcp`
- workspace package scope: `@foundry-mcp/*`
- several artifact names such as `foundry-vtt-mcp.zip` and
  `foundry-mcp-server-<version>.zip`
- installer/app identifiers such as `com.foundry-mcp.*`

## Why The Technical IDs Still Exist

These identifiers are currently part of working runtime and packaging
contracts.

Examples:

- the module ID is used in Foundry module loading and socket wiring
- the query namespace is baked into MCP client calls and module handlers
- the Claude Desktop server key appears in examples and installer scripts
- the workspace scope is referenced in package manifests, TypeScript paths, and
  build scripts
- release filenames are embedded in GitHub workflows and manifest download
  metadata

Changing these all at once would be a breaking migration, not a branding pass.

## About `@foundry-mcp/*`

The scope `@foundry-mcp/*` is currently a local monorepo workspace scope.

It does not require publication on npmjs to work.

Current use:

- [../../shared/package.json](../../shared/package.json)
- [../../packages/mcp-server/package.json](../../packages/mcp-server/package.json)
- [../../packages/foundry-module/package.json](../../packages/foundry-module/package.json)
- [../../tsconfig.json](../../tsconfig.json)

Important clarification:

- `@foundry-mcp/*` in this repo is local workspace/package wiring
- a third-party npm package such as `@iflow-mcp/foundry-vtt-mcp` is a separate
  publisher scope and does not define this repo's internal package naming

## Rename Matrix

### Safe To Rename Now

- repo description text
- README wording
- installation instructions
- Foundry module title
- workflow display names
- release note titles
- support links
- in-app error messages that point to repository URLs
- installer copy that is only informational

### Delay Until We Have A Migration

- Foundry module ID `foundry-mcp-bridge`
- bridge query namespace `foundry-mcp-bridge.*`
- socket event names using `foundry-mcp-bridge`
- Claude Desktop MCP server key `foundry-mcp`
- environment namespace `/foundry-mcp`
- workspace package scope `@foundry-mcp/*`
- release ZIP names
- installer app bundle names
- installer package identifiers like `com.foundry-mcp.*`

### Likely Permanent Or Long-Lived Compatibility IDs

These may never need to match the public brand:

- internal package scope
- query namespace prefix
- environment namespace

If they are stable and invisible to most users, renaming them may create more
cost than value.

## Recommended Strategy

### Phase 1: Public Branding

Status: in progress and mostly complete.

Goals:

- make the repo clearly yours
- make support and release links point to your repo
- keep users from thinking this is still Adam's active project
- preserve attribution

### Phase 2: Technical Identity Review

Before renaming any technical IDs, decide whether the change provides real user
value.

Questions to ask:

1. Does the identifier leak into user setup?
2. Does changing it improve the product meaningfully?
3. Do we control every consumer of the identifier?
4. Can we support a migration window?

If the answer to any of those is "no", prefer leaving the ID stable.

### Phase 3: Migration-Only Changes

Only do these if we intentionally want a breaking or semi-breaking transition:

- rename module ID
- rename query namespace
- rename Claude server key
- rename package scope
- rename release asset filenames
- rename installer/app identifiers

These should be handled as a tracked migration project, not an opportunistic
cleanup.

## If We Ever Rename Technical IDs

Required migration work would likely include:

1. module manifest changes
2. runtime socket/query namespace changes
3. MCP client query name updates
4. installer script changes
5. Claude config example updates
6. release workflow filename changes
7. compatibility notes for existing users
8. possibly a dual-support window for old and new IDs

Without that work, renaming technical IDs would be a breaking change.

## Recommended Near-Term Position

For now, the repo should use this posture:

- public brand: Maeinomatic Foundry MCP Bridge / Maeinomatic Foundry MCP Server
- technical compatibility IDs: keep existing values stable
- attribution: explicit and permanent

That gives the project a clear independent identity without disrupting working
installs.

## Exit Criteria For Any Future Technical Rename

Only rename a technical identity surface if all of the following are true:

1. We can explain the user value clearly.
2. We know every place the identifier is used.
3. We have a migration and rollback plan.
4. We can document the change cleanly.
5. We are willing to support the transition burden.
