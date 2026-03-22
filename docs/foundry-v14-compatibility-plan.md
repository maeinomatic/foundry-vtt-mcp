# Foundry v14 Compatibility Plan

This document defines how to evaluate and safely adopt Foundry VTT v14 support.

Canonical source links and official syntax conventions are maintained in:
`docs/process/FOUNDRY_OFFICIAL_REFERENCE.md`

## Purpose

1. Track v14 compatibility work without disrupting current v13 stability.
2. Make compatibility changes only after explicit verification.
3. Prevent accidental metadata bumps before code and system tests are complete.

## Current State

1. Module compatibility is currently pinned to v13 in `packages/foundry-module/module.json`.
2. Foundry v14.349 is a Version 14 Prototype release, not a final stable target.
3. There is no active v14 support commitment yet in this branch.

## Compatibility Policy

1. Keep v13 as the supported baseline until all v14 gates pass.
2. Treat v14 as experimental during evaluation.
3. Do not change `compatibility.maximum` to `14` until the final go/no-go checklist is complete.

## v14 Risk Areas to Audit

Focus on code paths most likely affected by v14 API and behavior changes.

1. Active Effects handling:
   - effect creation/update/removal
   - status effect toggling
   - token/actor effect interactions
2. Token and Scene operations:
   - token updates and movement
   - scene and canvas object access patterns
3. DataModel update and validation flows:
   - document updates and embedded document operations
   - schema assumptions in update payloads
4. UI framework assumptions:
   - any custom sheet/dialog integrations
   - references tied to legacy application behavior
5. Drag-and-drop and compendium import flows:
   - item drops to actor sheets
   - world/compendium document import behavior

## Official Breaking-Change Watch List

Source board: https://github.com/orgs/foundryvtt/projects/67/views/8 (label: breaking).

Prioritize these items first because they directly overlap MCP module/server behavior:

1. DataModel update operators changed (`-=` and `==` special keys deprecated in `updateSource`):
   - https://github.com/foundryvtt/foundryvtt/issues/13090
   - Audit all direct `updateSource`/update payload assumptions for operator semantics.
2. ActiveEffect legacy transferral retired:
   - https://github.com/foundryvtt/foundryvtt/issues/13280
   - Verify effect transfer behavior in token/actor condition flows.
3. Token detection modes field type changed:
   - https://github.com/foundryvtt/foundryvtt/issues/12976
   - Validate token document reads/writes for detection mode structures.
4. Token movement animation callback signature changed (`Token` to `TokenDocument`):
   - https://github.com/foundryvtt/foundryvtt/issues/13337
   - Check any token movement hooks or animation option integrations.
5. `parseHTML` may return `null`:
   - https://github.com/foundryvtt/foundryvtt/issues/13145
   - Add null guards where parse results are assumed non-null.
6. Chat visibility model changes (replacement of historical roll mode):
   - https://github.com/foundryvtt/foundryvtt/issues/8856
   - Re-test any chat-adjacent tooling assumptions and visibility handling.

Secondary (monitor as needed if touched by future work):

1. Region/canvas UX and shape-model changes impacting drawings, tiles, lights, templates.
2. Scene control layer behavior updates (including controls without tools).
3. Texture/shape data model field removals and pivot/anchor behavior changes.

## v14 Coding Tracker

Use this section as the active implementation checklist while coding.

Status legend: `todo`, `in-progress`, `blocked`, `done`.

| Status | Breaking Change                                                                 | Upstream Issue                                        | Primary Repo Areas                                                                              | Notes                                                                           |
| ------ | ------------------------------------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| todo   | DataModel update operators changed (`-=` and `==` deprecated in `updateSource`) | https://github.com/foundryvtt/foundryvtt/issues/13090 | `packages/foundry-module/src/queries.ts`, `packages/foundry-module/src/data-access.ts`          | Search for operator-style update payloads and replace with v14-safe semantics.  |
| todo   | ActiveEffect legacy transferral retired                                         | https://github.com/foundryvtt/foundryvtt/issues/13280 | `packages/foundry-module/src/queries.ts`, `packages/mcp-server/src/tools/token-manipulation.ts` | Validate status toggle and effect transfer behavior for token/actor operations. |
| todo   | `TokenDocument.detectionModes` changed to `TypedObjectField`                    | https://github.com/foundryvtt/foundryvtt/issues/12976 | `packages/foundry-module/src/queries.ts`                                                        | Confirm read/write shape and defensive guards for missing/invalid modes.        |
| todo   | Token movement animation callback now uses `TokenDocument`                      | https://github.com/foundryvtt/foundryvtt/issues/13337 | `packages/foundry-module/src/main.ts`, `packages/foundry-module/src/queries.ts`                 | Audit any movement animation hooks or option callbacks.                         |
| todo   | `parseHTML` can return `null`                                                   | https://github.com/foundryvtt/foundryvtt/issues/13145 | `packages/foundry-module/src/queries.ts`, `packages/mcp-server/src/tools/character.ts`          | Add null checks before traversing parsed nodes.                                 |
| todo   | Chat visibility modes replace historical roll mode assumptions                  | https://github.com/foundryvtt/foundryvtt/issues/8856  | `packages/foundry-module/src/queries.ts`                                                        | Re-test chat outputs and visibility constraints in GM/player contexts.          |

Implementation checklist:

- [ ] Open a tracking issue (or project item) per row above and link it in notes.
- [ ] For each row, record tested versions: Foundry build + game system version.
- [ ] Add or update tests before marking a row `done`.
- [ ] Run regression commands and paste summary results in the relevant issue.
- [ ] Keep `packages/foundry-module/module.json` pinned to v13 until all rows are `done` or explicitly accepted as deferred.

## Code Areas to Inspect First

1. `packages/foundry-module/src/queries.ts`
2. `packages/foundry-module/src/data-access.ts`
3. `packages/foundry-module/src/main.ts`
4. `packages/mcp-server/src/tools/token-manipulation.ts`
5. `packages/mcp-server/src/tools/character.ts`

## Test Matrix

Run these checks in separate worlds and record results.

1. Foundry v13 + DnD5e
2. Foundry v13 + PF2e
3. Foundry v13 + DSA5
4. Foundry v14 + DnD5e
5. Foundry v14 + PF2e
6. Foundry v14 + DSA5

## Functional Test Checklist

1. Core connectivity:
   - MCP bridge connects as GM
   - tool listing succeeds
2. Character tools:
   - `get-character`, `get-character-entity`, `search-character-items`
3. Token tools:
   - `move-token`, `update-token`, `delete-tokens`, `toggle-token-condition`, `get-token-details`
4. Write operations:
   - actor creation from compendium
   - journal creation/update
5. Scene operations:
   - `get-current-scene`, `list-scenes`, `switch-scene`

## Regression Commands

```bash
npm run typecheck
npm -w @foundry-mcp/server test -- --run
npm run build
npm run test:mcp:schema
```

## Go/No-Go Gate

All items must be true before changing module compatibility metadata.

1. No critical runtime errors on v14 across tested systems.
2. Token manipulation tools work correctly on v14.
3. Effect/condition workflows are validated on v14.
4. Build/typecheck/tests remain green.
5. Known issues are documented with severity and workarounds.

If any gate fails:

1. Keep metadata pinned to v13.
2. Track blockers in a dedicated v14 issue list.
3. Re-test after fixes.

## Metadata Update Procedure (Only After Gate Pass)

When all gates pass, update:

1. `packages/foundry-module/module.json`
   - `compatibility.verified`
   - optionally `compatibility.maximum`
2. `README.md` and `CHANGELOG.md`
   - clearly state tested Foundry versions
   - include known limitations if any

## Tracking Format

For each test world/system pair, capture:

1. Foundry version
2. Game system and version
3. Test date
4. Pass/fail per checklist item
5. Errors encountered
6. Decision: pass, partial, blocked
