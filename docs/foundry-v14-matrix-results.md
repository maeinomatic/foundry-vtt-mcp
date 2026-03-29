# Foundry v14 Matrix Results

This document records the current v14-readiness evidence for the `feat/v14-hardening-wave` branch.

## Execution Context

Date: 2026-03-29

Available in this workspace:

- Source audit and code changes for v14-sensitive MCP paths
- Monorepo regression commands (`typecheck`, `build`, MCP server tests, schema smoke)

Not available in this workspace:

- Live Foundry v13 or v14 runtime
- DnD5e, PF2e, or DSA5 worlds running against this branch
- In-editor execution of GM/player visibility scenarios inside Foundry

## Branch Validation

| Check                 | Status | Evidence                                                            |
| --------------------- | ------ | ------------------------------------------------------------------- |
| TypeScript typecheck  | pass   | `npm run typecheck`                                                 |
| Build                 | pass   | `npm run build`                                                     |
| MCP server unit tests | pass   | `npm -w @maeinomatic/foundry-mcp-server test -- --run` (117 passed) |
| MCP schema smoke      | pass   | `npm run test:mcp:schema`                                           |

## DnD-Focused v14 Readiness Snapshot

| Area                                | Status | Evidence                                                                                                | Linked Issue |
| ----------------------------------- | ------ | ------------------------------------------------------------------------------------------------------- | ------------ |
| DataModel operator audit            | pass   | Static audit completed; no active deprecated operator usage found in current packages tree              | #13          |
| `parseHTML` null safety             | pass   | Static audit completed; no active `parseHTML` call sites remain in current packages tree                | #15          |
| Token detection modes               | pass   | Static audit completed; current token tooling does not read or write `TokenDocument.detectionModes`     | #16          |
| Chat visibility assumptions         | pass   | `request-player-rolls` hardened to use supported legacy roll modes and v14-aware `messageMode` fallback | #17          |
| ActiveEffect transferral retirement | pass   | Static audit completed; token-condition flow creates and removes actor-owned effects directly           | #14          |

## Runtime Matrix

| Environment         | Status  | Notes                                                         | Blocking Issue |
| ------------------- | ------- | ------------------------------------------------------------- | -------------- |
| Foundry v13 + DnD5e | blocked | No live Foundry runtime/world available in this workspace     | #18            |
| Foundry v14 + DnD5e | blocked | No live Foundry v14 runtime/world available in this workspace | #18            |
| Foundry v13 + PF2e  | blocked | No live Foundry runtime/world available in this workspace     | #18            |
| Foundry v14 + PF2e  | blocked | No live Foundry v14 runtime/world available in this workspace | #18            |
| Foundry v13 + DSA5  | blocked | No live Foundry runtime/world available in this workspace     | #18            |
| Foundry v14 + DSA5  | blocked | No live Foundry v14 runtime/world available in this workspace | #18            |

## Blocking Defects And Gaps

1. Runtime matrix execution is still blocked by environment availability, not by a branch-local regression.
2. No Foundry-hosted GM/player visibility walkthrough was executable from this workspace, so chat/effect validation is currently code-audit-backed rather than world-test-backed.
3. Module compatibility metadata must remain pinned to v13 until the runtime matrix rows above are exercised in live worlds.

## Next Required Runtime Checks

1. Launch a Foundry v13 world with DnD5e and run the token/chat/effect checklist.
2. Launch a Foundry v14 world with DnD5e and repeat the same checklist.
3. Record pass/partial/blocked results per system in this file and in `docs/foundry-v14-compatibility-plan.md`.
