# Foundry v14 E2E Validation Playbook

This playbook defines a reproducible, evidence-based manual end-to-end (E2E) test for the Foundry MCP bridge. It is intended for a disposable Foundry world and an MCP client such as Claude Desktop or the VS Code MCP client.

It complements automated regression checks. It does **not** claim that every MCP tool or every Foundry system has been tested.

## Scope and Evidence Standard

An E2E result is a pass only when all of the following are true:

1. The request is made through the public MCP stdio server, not directly through the backend control socket.
2. The MCP response indicates success and returns the expected identifiers or state.
3. The resulting Foundry document is inspected after the mutation.
4. The outcome, test-world versions, and any limitation are recorded in [foundry-v14-matrix-results.md](foundry-v14-matrix-results.md).

Backend-control calls are useful diagnostics, but they are not public-MCP E2E evidence.

## Latest Recorded Run

| Field            | Value                                                                                                                                    |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Date             | 2026-08-05                                                                                                                               |
| Foundry          | v14 Build 365                                                                                                                            |
| Node.js          | v25.6.0                                                                                                                                  |
| System           | DnD5e 5.3.3                                                                                                                              |
| Test world       | `MCP Progression Test`                                                                                                                   |
| Result           | Partial pass; controlled core reads and writes passed, including summon/transform activity coverage with explicit non-interactive inputs |
| Detailed results | [foundry-v14-matrix-results.md](foundry-v14-matrix-results.md)                                                                           |

The 2026-08-03 run created and connected a disposable non-GM `MCP E2E Player`. It confirmed public and recipient-targeted chat visibility, plus GM-only chat exclusion. The player received public and private roll requests, clicked both rendered controls, and produced a public result with no whisper recipients plus a private result visible to the player and GM only. A v14 issue was found where Foundry applied the `hidden` attribute after the synchronous chat-render hook. The module now defers roll-button setup until post-render processing completes. The public stdio MCP `preview-character-progression` check also passed for the controlled DnD5e class item, returning a level 2-to-3 update with no pending advancement steps.

The 2026-08-05 rerun added explicit DnD5e activity evidence in the same world. `run-dnd5e-summon-activity` succeeded non-interactively and placed one Bat token via DnD5e's native summon placement API. `run-dnd5e-transform-activity-workflow` succeeded non-interactively when `sourceActorUuid` was supplied, using DnD5e's native `Actor5e.transformInto` path to avoid the interactive compendium browser.

## Safety Rules

- Use a dedicated world and actors whose names begin with `MCP E2E`.
- Do not run destructive operations against a campaign world.
- Create an explicit cleanup list before running mutations.
- Do not use copyrighted compendium content unless it is already installed locally and permitted for the test world.
- Do not treat a successful tool response as persistence evidence. Inspect the document afterward.
- Keep player-dependent scenarios separate. A GM-only session cannot prove player visibility or player roll completion.

## Prerequisites

1. Start Foundry with the target world and enable the MCP module for the GM user.
2. Build production artifacts:

   ```text
   npm run build
   ```

3. Deploy the built module to the local Foundry installation when testing locally:

   ```text
   Copy packages/foundry-module/dist to the installed module's dist directory.
   ```

4. Start `packages/mcp-server/dist/index.js` through the configured MCP client.
5. Reload the Foundry game page after a backend restart or module deployment.
6. In the Foundry browser console, confirm the bridge is connected:

   ```js
   globalThis.foundryMCPDebug?.getStatus?.().connected;
   ```

   Expected result: `true`.

7. Run the preflight checks:

   ```text
   npm run format:check
   npm run lint
   npm run typecheck
   npm -w @maeinomatic/foundry-mcp-server test -- --run
   npm run test:mcp:schema
   ```

## Public MCP Protocol Probe

When troubleshooting a client integration, validate the public stdio server before testing mutations.

1. Send `initialize`.
2. Send `tools/list`.
3. Run `get-world-info` through `tools/call`.
4. Confirm the returned system and Foundry version match the loaded world.

Use the MCP client for normal testing. The following JSON-RPC shape is only a diagnostic reference:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "get-world-info",
    "arguments": {}
  }
}
```

## Prompt-Based Acceptance Suite

Run the prompts in order. Replace bracketed placeholders with local test-world names and IDs discovered during the run. Keep the exact responses in the test report.

### 0. Connection and system discovery

```text
Use Foundry MCP to report the active world, Foundry version, game system, and game-system version. Then list the available MCP tools. Do not change any world data.
```

Expected:

- The world reports the intended Foundry and system versions.
- The bridge is connected.
- Tool listing succeeds.

### 1. Read-only core workflow

```text
Without changing anything, get the active scene, list scenes, list available compendium packs, and search one installed compendium for "[safe local search term]". Report the IDs used and any missing capability.
```

Expected:

- Scene and compendium reads return structured data.
- No documents are created or modified.

### 2. Controlled actor and item read

```text
Inspect the character "MCP E2E [name]". Report its actor ID, owned class items, owned spells, current hit points, spell slots, and existing token if one is present. Do not update it.
```

Expected:

- The response identifies concrete actor, item, and token IDs for later steps.
- The reported state can be compared with the Foundry sheet.

### 3. Token mutation and persistence

```text
On the dedicated E2E token only, move it to [x, y], set its elevation to 5, then retrieve token details. Confirm the returned x, y, and elevation values. Do not modify any other token.
```

Verify in Foundry:

- Token position and elevation persist after reopening or refreshing the token document.
- `get-token-details` returns elevation `5`, not a legacy default.

### 4. Idempotent condition workflow

```text
On the dedicated E2E token, enable the Poisoned condition twice, inspect the token or actor effects, then disable Poisoned. Report the number of matching effects after each action.
```

Expected:

- First enable creates one actor-owned condition effect.
- Second explicit enable leaves the count at one.
- Disable removes the matching effect.

### 5. Actor, embedded-item, and journal writes

```text
On the character "MCP E2E [name]", apply the planned test-only hit point or resource update and update one test-only owned item. Create a journal named "MCP E2E [run id]", update its text to "E2E persistence verified", then read it back. Report all affected IDs and final values.
```

Verify in Foundry:

- Actor and item values persist.
- The journal has the exact updated text.

### 6. DnD5e progression and rest

```text
For the controlled DnD5e test character only, inspect class levels and pending advancement choices. If the test plan provides a safe already-supported advancement choice, apply it; otherwise do not guess. Run the planned short rest and report class levels, recovered resources, and unresolved choices.
```

Expected:

- Advancement operations use explicit class and step IDs.
- Rest results persist in the actor data.
- Unknown advancement options are reported as blocked rather than inferred from prose.

### 7. DnD5e 5.3 spellbook source and preparation

```text
For owned spell "[spell id or name]" on "MCP E2E [name]", assign its source class to the owned class "[class id or name]". Validate the DnD5e spellbook afterward. Report the class ID, source-class counts, preparation state, and all validation issues.
```

Verify in Foundry:

- DnD5e 5.3 data stores the assignment as `system.sourceItem: "class:<owned class id>"`.
- `system.sourceClass` is not required for the modern assignment.
- Spellbook validation associates the spell with the chosen class.

### 8. Chat and player visibility (requires a connected player)

```text
With one non-GM player connected, post one public test message, one GM-only test message, and one recipient-targeted test message. Ask the connected player to confirm which messages they can see. Then send one public and one private roll request to that player. Do not claim completion until the player clicks both buttons and confirms the resulting visibility.
```

Expected:

- Visibility is confirmed by both GM and player views.
- Roll request creation and player-side completion are documented separately.

If no player is connected, record this scenario as **blocked**, not passed.

### 9. Optional activity and map workflows

```text
If a controlled actor owns a known summon or transform activity, run that single activity and inspect the resulting actor or token state. If ComfyUI is installed and configured, generate a small test map, wait for completion, and inspect the created scene. Otherwise report the missing prerequisite and do not retry against arbitrary content.
```

### 10. Cleanup and final evidence

```text
List every document created or changed during this E2E run. Delete only the test artifacts whose names begin with "MCP E2E". Re-read the affected actor, scene, and journals to confirm cleanup. Summarize passed, failed, and blocked scenarios separately.
```

## Verification Checklist

Use this checklist for each execution.

```text
=== FOUNDRY MCP E2E RESULT ===

Run ID:
Date:
Commit or branch:
Foundry version:
Node.js version:
System and version:
World:
MCP client:

[ ] Public MCP initialize succeeded
[ ] Public MCP tools/list succeeded
[ ] Bridge status was connected
[ ] Core read workflow passed
[ ] Token move/update/read persisted
[ ] Condition create/repeat/remove was idempotent
[ ] Actor and item write persisted
[ ] Journal CRUD persisted
[ ] DnD5e progression/rest result recorded
[ ] DnD5e spell source uses sourceItem where supported
[ ] Player visibility and roll completion confirmed, or blocked
[ ] Activity/map results confirmed, or blocked
[ ] Test artifacts cleaned up

Passed:
Failed:
Blocked and prerequisite:
Created artifact IDs:
Changed artifact IDs:
Evidence links or captured MCP responses:
```

## Recording and Triage

After each run:

1. Add concise results to [foundry-v14-matrix-results.md](foundry-v14-matrix-results.md).
2. Record a defect only after preserving the public MCP request, response, and persisted-document observation.
3. State whether the failure is likely in the MCP server, the Foundry module, the game-system data model, or the local environment.
4. Do not change the module compatibility metadata based on a single partial-system run.

## Known Coverage Limits

The latest run does not cover every system or workflow. In particular, it does not establish PF2e or DSA5 compatibility, a v13 regression baseline, player-side roll completion, activity-specific workflows, or map generation without its local prerequisites. See [foundry-v14-matrix-results.md](foundry-v14-matrix-results.md) for the current status.
