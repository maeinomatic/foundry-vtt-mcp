# Foundry MCP Tool Health Check

Date: 2026-03-23
Repository: foundry-vtt-mcp
Branch: master
Active world during test: Starting World Maeinomatic
Reported world system: dnd5e 5.2.5
Foundry version: 13.351

## Scope

This report tests the currently exposed Foundry MCP tools available in this session.

Classification used:

- Works: tool call succeeds with valid or safely-invalid input and returns expected response/error semantics.
- Fails: tool call returns timeout or capability/routing mismatch.
- Not fully verified: tool path confirmed, but only safe negative-path test was run to avoid mutating live game state.

## DnD-Specific Tool Results

1. run-dnd5e-transform-activity-workflow

- Status: Fails
- Input used: missing actor/item identifiers (safe negative path)
- Result: UNSUPPORTED_CAPABILITY stating it is only available when active system is dnd5e.
- Interpretation: This is inconsistent with get-world-info (which reports dnd5e). Strong indicator of MCP-side system detection/routing mismatch.

2. list-creatures-by-criteria

- Status: Fails
- Input used: humanoid, CR 1-2, limit 5
- Result: UNSUPPORTED_CAPABILITY for system other (no adapter registered).
- Interpretation: Same inconsistency as above. Strong MCP-side system detection/adaptation issue.

## Non-System-Specific Tool Results

1. get-world-info

- Status: Works
- Result: world returned with system object { id: dnd5e, version: 5.2.5 }.

2. get-current-scene

- Status: Works
- Result: active scene metadata returned correctly.

3. switch-scene

- Status: Works
- Input used: switch to current scene by name (safe no-op)
- Result: success true with matching scene id.

4. get-compendium-entry-full

- Status: Works (negative path)
- Input used: valid-like pack id plus missing entry id
- Result: not found style error message from compendium lookup.
- Interpretation: Query path to module is functional.

5. update-character-companion-link

- Status: Works (negative path)
- Input used: missing owner and companion identifiers
- Result: owner actor not found.
- Interpretation: Backend and plugin both handling request path correctly.

6. update-world-item

- Status: Works (negative path)
- Input used: missing item identifier with minimal update payload
- Result: world item not found.
- Interpretation: End-to-end request path is functional.

7. list-dsa5-archetypes

- Status: Works
- Result: completed successfully with zero archetypes (expected in dnd5e world).

8. check-map-status

- Status: Fails
- Input used: fake job id
- Result: query timeout on maeinomatic-foundry-mcp.check-map-status.
- Interpretation: Foundry module side likely does not reply for this method in current runtime state, or map subsystem handler not active.

9. generate-map

- Status: Fails
- Input used: small test prompt and scene name
- Result: query timeout on maeinomatic-foundry-mcp.generate-map.
- Interpretation: Same failure family as check-map-status, likely module/plugin-side map handler availability issue or stalled map subsystem.

10. create-campaign-dashboard

- Status: Works
- Input used: healthcheck campaign title/description
- Result: success true, dashboard journal created.
- Side effect: created journal/dashboard in world.

## Direct Evidence Pattern

Observed contradiction:

- get-world-info returns system.id = dnd5e
- DnD adapter-routed tools resolve active system as other

This pattern points to MCP backend detection/caching logic, not base connectivity:

- Connectivity is healthy for multiple non-system tools.
- Routing to system adapters is where behavior diverges.

Map generation issues appear separate:

- generate-map and check-map-status time out while unrelated tools succeed.
- This suggests a Foundry plugin/module handler or subsystem activation issue for map-related methods rather than a full MCP disconnect.

## MCP Side vs Foundry Plugin Side Assessment

MCP-side likely issue:

- System detection/routing mismatch in adapter-gated tools (dnd5e seen by world-info but other used by adapter-dependent tools).

Foundry plugin-side likely issue:

- Map methods timing out (check-map-status, generate-map) while general request/response remains healthy.

Not a pure connection issue:

- Multiple non-system methods are working end-to-end.

## Recommendations

1. Restart the running MCP backend process after rebuild/deploy and re-run two probes:

2. If mismatch persists, add temporary logging around adapter system detection just before adapter lookup in compendium and dnd5e workflow handlers.

3. For map timeouts, validate Foundry module handlers for generate-map/check-map-status are registered and reachable in the currently loaded world/module state.

4. Clean up healthcheck artifact created during testing:

## Map Status Check Error (2026-03-24)

### Error Observed

- Tool: check-map-status
- Input: (any job id, including fake)
- Result: Error checking status: Query maeinomatic-foundry-mcp.check-map-status failed: Query timeout: maeinomatic-foundry-mcp.check-map-status

### Interpretation

- This error indicates that the Foundry module/plugin did not respond to the check-map-status query within the expected timeout window.
- The failure is consistent with previous map subsystem issues (see generate-map), suggesting the handler for check-map-status is either not registered, not active, or the map subsystem is stalled in the current Foundry/module runtime state.
- This is distinct from general connectivity issues, as other non-map tool calls succeed in the same session.

### Recommendations

- Review the Foundry module/plugin code to ensure the check-map-status handler is registered and active for the current world/module state.
- Add logging or diagnostics to the handler registration and invocation path to confirm it is being reached.
- If the handler is present, investigate for possible deadlocks, blocking operations, or subsystem initialization failures that could prevent timely response.

---

## MCP Character Workflow Probe (2026-03-24)

Status note:

- This probe predates the later split between concept-safe creation and explicit template cloning.
- Current intended usage is:
  - `create-dnd5e-character-workflow` for fresh concept-driven DnD5e characters
  - `clone-dnd5e-character-template-workflow` for explicit cloning or adaptation of an authored template

Goal:

- Validate character creation through the MCP workflow path (call_tool -> create-dnd5e-character-workflow), not manual socket-side document edits.

Environment:

- World system confirmed via get-world-info: dnd5e 5.2.5

### Test A: Create level 1 fighter

- Tool: create-dnd5e-character-workflow
- Input summary:
  - sourceUuid: Compendium.dnd5e.heroes.Actor.2Pdtnswo8Nj2nafY
  - name: Bren Kestrel
  - targetLevel: 1
  - addToScene: false
- Result:
  - success: true
  - workflowStatus: completed
  - actor created: z52woRG0NJHuaRzd (Bren Kestrel)
  - sheet check: level 1 (expected)

### Test B: Create level 2 cleric

- Tool: create-dnd5e-character-workflow
- Input summary:
  - sourceUuid: Compendium.dnd5e.heroes.Actor.kfzBL0q1Y7LgGs2x
  - name: Sister Rowan Vale
  - targetLevel: 2
  - addToScene: false
- Result:
  - success: false
  - workflowStatus: invalid-selection
  - actor created: x2VMyPN4pZEP4Bup (Sister Rowan Vale)
  - sheet check: level 1 (target level-up not applied)

Exact failure message from progression payload:

- Query maeinomatic-foundry-mcp.applyCharacterAdvancementChoice failed: Failed to apply character advancement choice: Item "Compendium.dnd5e.classfeatures.Item.YpiLQEKGalROn7iJ" is not a valid option for this advancement step.

Pending step in returned payload:

- Step type: ItemGrant
- Step title: Features
- Default selected option ids: YpiLQEKGalROn7iJ, r91UIgwFdHwkXdia

### Failure Localization (Code Paths)

MCP server workflow and selection construction:

- packages/mcp-server/src/tools/character.ts:7158 (handleCompleteDnD5eLevelUpWorkflow)
- packages/mcp-server/src/tools/character.ts:7542 (request build for auto-applied choice)
- packages/mcp-server/src/tools/character.ts:7553 (query maeinomatic-foundry-mcp.applyCharacterAdvancementChoice)
- packages/mcp-server/src/tools/character.ts:7605 (ItemGrant choice handling)

Foundry module query dispatch and progression application:

- packages/foundry-module/src/queries.ts:730 (handleApplyCharacterAdvancementChoice)
- packages/foundry-module/src/queries.ts:788 (dataAccess.applyCharacterAdvancementChoice)
- packages/foundry-module/src/services/actor-progression-service.ts:90 (applyCharacterAdvancementChoice)

### Current Interpretation

- This run confirms a progression-pipeline bug specific to nontrivial DnD advancement selections (ItemGrant at level-up), not a generic connectivity failure.
- Level-1 creation succeeds.
- Level-up to level 2 fails when automatic advancement-choice application is attempted with an option id/shape rejected by applyCharacterAdvancementChoice.

### Clone Workflow Exposure Check (2026-03-27)

- Method: local MCP stdio client against the current `packages/mcp-server/dist/index.js` build
- Result after restarting a stale persistent backend process:
  - `clone-dnd5e-character-template-workflow` is present in `tools/list`
  - tool count observed: 84
- Runtime outcome:
  - direct tool call reached the server and routed correctly
  - execution stopped at the system gate with `UNSUPPORTED_CAPABILITY: clone-dnd5e-character-template-workflow is only available when the active system is dnd5e.`
- Interpretation:
  - tool exposure and routing are verified in the current build
  - full end-to-end clone validation was not possible in this session because no active DnD5e Foundry world was connected at test time
