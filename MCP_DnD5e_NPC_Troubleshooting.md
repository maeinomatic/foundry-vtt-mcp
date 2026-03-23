# MCP D&D 5e NPC Creation Troubleshooting Log

## 1. Problem Statement

- Unable to create or fetch D&D 5e NPCs by level using MCP automation.
- MCP backend returns errors for level filtering and times out for humanoid queries.

## 2. Observed Errors

- `INVALID_FILTER_FOR_SYSTEM: Unrecognized key(s) in object: 'level'`
- `Query timeout: maeinomatic-foundry-mcp.listCreaturesByCriteria`

## 3. System State

- World: Starting World Maeinomatic
- System: dnd5e (version 5.2.5)
- Foundry version: 13.351
- MCP detects system as dnd5e (not 'other')

## 4. Suspected Causes

- MCP D&D 5e adapter does not support filtering by 'level' (may use 'challengeRating' or other field).
- Query for humanoids may be too broad or slow, causing a timeout.
- Possible issues with system adapter registration or compendium indexing.
- Backend or world data may be missing, corrupted, or incompatible.

## 4a. Confirmed Findings

- The world itself is not the problem. The Foundry module returns the system correctly from `game.system.id`.
- The MCP server sets the system to `other` only when `detectGameSystem()` fails to query world info.
- The failure is strongly correlated with backend-to-Foundry disconnects.
- After one failed detection, the MCP server caches `other` and can continue using it even after the Foundry connection returns.
- There is a second, separate issue: broad creature queries can hit the backend's fixed 10 second query timeout.

## 4b. Code Evidence

- Foundry world info source: `packages/foundry-module/src/services/world-service.ts`
  - Returns:
    - `system: game.system.id`
    - `systemVersion: game.system.version`
- MCP system detection: `packages/mcp-server/src/utils/system-detection.ts`
  - Calls `maeinomatic-foundry-mcp.getWorldInfo`
  - If the query succeeds, it uses the returned `system`
  - If the query throws, it logs `Failed to detect game system, defaulting to other`
  - It then sets `cachedSystem = 'other'`
- Sticky cache behavior:
  - `packages/mcp-server/src/utils/system-detection.ts` has a module-level cache
  - `packages/mcp-server/src/tools/compendium.ts` also caches `gameSystem`
  - `packages/mcp-server/src/tools/character.ts` also caches `cachedGameSystem`
  - There is no reconnect hook clearing these caches
- Query timeout:
  - `packages/mcp-server/src/foundry-connector.ts` uses a fixed 10 second timeout for all queries
  - `listCreaturesByCriteria` can exceed that on broad searches

## 4c. Log Evidence

- `mcp-server.log` shows:
  - `Failed to detect game system, defaulting to other`
  - immediately followed by `No adapter found for system: other`
- The same log also shows separate connection failures:
  - `Foundry VTT module not connected. Please ensure Foundry is running and the MCP Bridge module is enabled.`
- The timeout path is also present:
  - `Query timeout: maeinomatic-foundry-mcp.listCreaturesByCriteria`

## 4d. Root Cause

There are two overlapping failures:

1. Connection instability between the MCP server and the Foundry module
   - When the MCP server loses its module connection, `detectGameSystem()` cannot fetch world info.
   - It then falls back to `other`.

2. Bad cache invalidation after fallback
   - Once `other` is cached, later tool calls can continue using `other` even if the world is actually D&D 5e and `get-world-info` succeeds again.
   - This explains the apparent contradiction:
     - `get-world-info` can succeed and show `dnd5e`
     - while `list-creatures-by-criteria` still says system `other`

This is not evidence that the world is misconfigured. It is evidence that the MCP server is caching a fallback state after a failed world-info lookup.

## 4e. Why The Contradiction Happens

- `get-world-info` is a direct tool call through `SceneTools.handleGetWorldInfo()`.
- `list-creatures-by-criteria` first calls `detectGameSystem()` through `CompendiumTools.getGameSystem()`.
- If a prior detection failed during a disconnect, `detectGameSystem()` can return cached `other` without retrying.
- So one tool can report live world data correctly while another tool still routes through stale cached system state.

## 4f. Most Likely Fixes

1. Do not cache `other` after a failed detection.
2. Clear system detection caches whenever the Foundry connection is lost or re-established.
3. Consider re-checking world info when cached system is `other` instead of trusting the fallback indefinitely.
4. Increase or make configurable the 10 second query timeout for large compendium searches.
5. Optionally, retry `getWorldInfo` once before falling back to `other`.

## 4g. Implemented Fix

- Updated `packages/mcp-server/src/utils/system-detection.ts`
  - `detectGameSystem()` no longer persists `other` after transient query failure.
  - Missing system ids now return uncached `other` instead of poisoning the global cache.
- Updated `packages/mcp-server/src/tools/compendium.ts`
  - Tool-level cached game system is re-detected if the cached value is `other`.
- Updated `packages/mcp-server/src/tools/character.ts`
  - Same retry behavior for character tool system cache.
- Updated `packages/mcp-server/src/foundry-connector.ts`
  - Added connection lifecycle notifications for connect and disconnect events.
  - Query timeout now uses `config.foundry.connectionTimeout` instead of a hard-coded 10 seconds.
- Updated `packages/mcp-server/src/foundry-client.ts`
  - Propagates connector connection-state changes to backend startup.
- Updated `packages/mcp-server/src/backend.ts`
  - Clears global and tool-local system caches whenever the Foundry bridge connects or disconnects.

## 4h. Validation

- Focused tests passed:
  - `packages/mcp-server/src/utils/system-detection.test.ts`
  - `packages/mcp-server/src/tools/compendium.test.ts`
- Additional focused validation passed:
  - `packages/mcp-server/src/tools/character.test.ts`
- Added regression coverage for:
  - transient detection failure followed by successful retry
  - compendium tool recovering from stale `other` fallback
  - lifecycle-style cache invalidation for tool-local system state

## 4i. Whole mcp-server Sweep

### A. Primary root-cause locations

#### 1. Global system detection cache

- File: `packages/mcp-server/src/utils/system-detection.ts`
- This is the single global source of detected system identity.
- Any failure here affects downstream adapter routing.
- Status: fixed for transient `other` poisoning, but still process-global and still not cleared automatically on connection lifecycle events.

#### 2. Character tool local cache

- File: `packages/mcp-server/src/tools/character.ts`
- Local field: `cachedGameSystem`
- Blast radius: all character tools that gate behavior on active system or require a system adapter.
- Status: fixed so `other` is retried, but still caches successful values and is not actively cleared on reconnect/world switch.

#### 3. Compendium tool local cache

- File: `packages/mcp-server/src/tools/compendium.ts`
- Local field: `gameSystem`
- Blast radius: all compendium methods that do system-aware filtering or formatting.
- Status: fixed so `other` is retried, but still caches successful values and is not actively cleared on reconnect/world switch.

### B. All compendium surfaces where system-state issues can appear

#### 1. Search and filter shaping

- File: `packages/mcp-server/src/tools/compendium.ts`
- Relevant areas:
  - search-compendium flow around system-aware filtering and formatting
  - `get-compendium-item` creature formatting
  - `list-creatures-by-criteria`
- Why affected:
  - these methods call `getGameSystem()` and/or `requireSystemAdapter()`
  - stale or failed system detection can cause wrong formatting or `UNSUPPORTED_CAPABILITY`

#### 2. Direct adapter-required features

- File: `packages/mcp-server/src/tools/compendium.ts`
- Confirmed adapter-dependent operations:
  - `get-compendium-item creature formatting`
  - `list-creatures-by-criteria`
- These are the highest-risk compendium surfaces for the original bug.

### C. All character surfaces where system-state issues can appear

#### 1. Shared adapter-routed character features

- File: `packages/mcp-server/src/tools/character.ts`
- Adapter-dependent operations include:
  - typed resource updates
  - ability score updates
  - skill proficiency updates
  - system spellbook validation / organization
  - progression update routing

#### 2. DnD5e-only feature gates

- File: `packages/mcp-server/src/tools/character.ts`
- Confirmed system-gated DnD5e handlers include:
  - `set-dnd5e-proficiencies`
  - `add-dnd5e-class-to-character`
  - `complete-dnd5e-multiclass-entry-workflow`
  - `learn-dnd5e-spell`
  - `prepare-dnd5e-spell`
  - `forget-dnd5e-spell`
  - `set-dnd5e-spell-slots`
  - `reassign-dnd5e-spell-source-class`
  - `validate-dnd5e-spellbook`
  - `validate-dnd5e-character-build`
  - `bulk-reassign-dnd5e-spell-source-class`
  - `set-dnd5e-prepared-spells`
  - `run-dnd5e-rest-workflow`
  - `run-dnd5e-group-rest-workflow`
  - `award-dnd5e-party-resources`
  - `run-dnd5e-summon-activity`
  - `run-dnd5e-transform-activity-workflow`
  - `organize-dnd5e-spellbook-workflow`
  - `complete-dnd5e-level-up-workflow`
  - `create-dnd5e-character-workflow`
- If system detection is wrong, any of these can incorrectly reject with `only available when the active system is dnd5e`.

### D. Places where disconnects show up without stale-system caching

#### 1. Scene tools

- File: `packages/mcp-server/src/tools/scene.ts`
- `get-world-info` and scene queries do not use the stale system cache.
- They fail directly when the Foundry module is disconnected.
- This is why `get-world-info` is a good “live connectivity” probe.

#### 2. All Foundry-backed tools

- Files:
  - `packages/mcp-server/src/tools/campaign-management.ts`
  - `packages/mcp-server/src/tools/ownership.ts`
  - `packages/mcp-server/src/tools/actor-creation.ts`
  - `packages/mcp-server/src/tools/map-generation.ts`
  - `packages/mcp-server/src/tools/dice-roll.ts`
  - `packages/mcp-server/src/tools/token-manipulation.ts`
  - `packages/mcp-server/src/tools/quest-creation.ts`
  - `packages/mcp-server/src/tools/scene.ts`
  - `packages/mcp-server/src/tools/character.ts`
  - `packages/mcp-server/src/tools/compendium.ts`
- Why affected:
  - all of them ultimately call `FoundryClient.query(...)`
  - if the bridge is disconnected, all can fail with “module not connected”
- Important distinction:
  - most of these only fail transiently
  - `character.ts` and `compendium.ts` were special because they also had stale system-state fan-out

### E. Global timeout blast radius

#### 1. One timeout setting governs all Foundry queries

- File: `packages/mcp-server/src/foundry-connector.ts`
- Current behavior:
  - every MCP query to Foundry uses a fixed 10 second timeout
- Consequence:
  - any slow Foundry operation can fail with `Query timeout: <method>`
- Highest-risk known path:
  - `maeinomatic-foundry-mcp.listCreaturesByCriteria`
- But this is not limited to compendium search. Any slow bridge query can hit the same limit.

### F. Remaining structural risk not yet fixed

#### 1. No production lifecycle cache invalidation

- File references:
  - `packages/mcp-server/src/utils/system-detection.ts`
  - `packages/mcp-server/src/foundry-connector.ts`
- Observation:
  - `clearSystemCache()` exists
  - production hook now clears system caches on disconnect and reconnect
- Result:
  - reconnect recovery is now handled
  - explicit world-switch invalidation without reconnect is still a remaining structural risk

#### 2. Tool-local caches also remain lifecycle-unaware

- File references:
  - `packages/mcp-server/src/tools/character.ts`
  - `packages/mcp-server/src/tools/compendium.ts`
- Observation:
  - local tool caches are now reset by backend connection lifecycle hooks
- Result:
  - reconnect recovery is now explicit
  - world-switch invalidation without reconnect is still not automatic

## 4j. WebRTC Bridge Startup Instability

### A. Primary startup race

- The Foundry module auto-connects the bridge during the Foundry `ready` hook.
  - `packages/foundry-module/src/main.ts`
  - `Hooks.once('ready', ...)` calls `foundryMCPBridge.onReady()`
  - `onReady()` immediately calls `start()` when the bridge is enabled
- The desktop MCP wrapper starts the backend lazily, only when the wrapper itself first needs it.
  - `packages/mcp-server/src/index.ts`
  - `ensure()` -> `connectWithRetry()` -> `startBackend()`
- Result:
  - Foundry can try its first WebRTC connection before the backend or WebRTC signaling server exists.
  - The first attempt then fails with connection refusal, which looks like flaky WebRTC even though the backend simply was not listening yet.

### B. Why opening Settings or reloading can make it work

- The module already has later retry paths:
  - `packages/foundry-module/src/main.ts`
  - `Hooks.on('closeSettingsConfig', ...)` attempts `start()` again if enabled and not connected
  - `Hooks.on('canvasReady', ...)` also attempts `start()` again if enabled and not connected
- This means opening and then closing the settings window, or reloading the session, can trigger a second connection attempt after the backend is already up.
- That behavior matches the user symptom closely and suggests the instability is partly a startup-order problem, not only a transport problem.

### C. Reconnect backoff makes the bridge feel late

- `packages/foundry-module/src/socket-bridge.ts`
  - failed connects call `scheduleReconnect()`
  - reconnect delay uses exponential backoff: 1s, 2s, 4s, 8s, 16s (max 30s per attempt)
- If the backend becomes available just after a failed attempt, the module can sit idle until the next retry window.
- This explains the bridge feeling like it connects "quite late" even when it eventually succeeds.

### D. WebRTC client/server handshake mismatch

- Browser-side WebRTC still waits for full ICE gathering before it even posts the offer.
  - `packages/foundry-module/src/webrtc-connection.ts`
  - `await this.waitForIceGathering();`
- Server-side WebRTC was already optimized to answer immediately and not wait for ICE/data-channel readiness.
  - `packages/mcp-server/src/webrtc-peer.ts`
  - comment and implementation explicitly say to send the answer immediately
- Result:
  - the browser side is still the slower side of the handshake
  - if the page is busy during early world load, the first signaling round can be delayed or time out more easily

### E. Connection state is reported too early on the browser side

- `packages/foundry-module/src/socket-bridge.ts`
  - after `await this.webrtc.connect(...)`, it sets `this.connectionState = CONNECTED`
  - it logs `Connected via WebRTC`
- But the actual WebRTC transport marks itself connected only when the data channel opens.
  - `packages/foundry-module/src/webrtc-connection.ts`
  - `dataChannel.onopen` is where `connectionState = CONNECTED` is also set
- Result:
  - one layer reports "connected" after signaling completes
  - another layer treats the connection as truly ready only after the data channel opens
  - this creates a real gap between "signaling succeeded" and "bridge is actually usable"

### F. Server-side connection status is also announced before the data channel is fully ready

- `packages/mcp-server/src/foundry-connector.ts`
  - `handleWebRTCOfferHTTP()` sets `activeConnectionType = 'webrtc'`
  - logs `WebRTC connection established via HTTP signaling`
  - notifies `connected`
- But the server WebRTC peer only becomes truly usable when `getIsConnected()` becomes true from peer/data-channel events.
  - `packages/mcp-server/src/webrtc-peer.ts`
  - `Peer connection fully established`
  - `Data channel opened - connection fully ready`
- This is safer than the browser side because actual queries still check `getIsConnected()`, but it still makes lifecycle reporting optimistic.

### G. Most likely explanation of the instability

This now looks like a combination of two problems:

1. Backend startup race
   - Foundry tries to connect before the backend and signaling server are running.

2. WebRTC readiness mismatch
   - signaling success is treated as connection success before the data channel is fully open.

These together can produce exactly the reported behavior:

- first attempt fails or half-succeeds during initial load
- later UI activity or reload causes a second attempt
- the second attempt works because the backend is already up and the page is fully loaded

### H. Likely fixes

1. Make the backend available before Foundry attempts auto-connect, or have the module delay first auto-connect until the backend is expected to exist.
2. Make browser-side WebRTC `connect()` resolve only after the data channel is actually open.
3. Avoid reporting `connected` on either side purely from signaling completion.
4. Consider deferring initial WebRTC auto-connect from `ready` to a later point such as `canvasReady`, or retry immediately once on `canvasReady` without waiting for long backoff.
5. Add explicit timing logs for first-attempt WebRTC startup so the next live test can distinguish:
   - backend not listening
   - signaling timeout
   - ICE timeout
   - data channel never opening

### I. Implemented so far

- Updated `packages/foundry-module/src/webrtc-connection.ts`
  - browser-side WebRTC `connect()` now waits for the data channel to actually open before resolving success
  - failed or closed channels now reject the pending connect attempt instead of leaving a false-ready gap
- Updated `packages/foundry-module/src/main.ts`
  - the primary automatic bridge startup is no longer triggered in the Foundry `ready` hook
  - `ready` now defers auto-connect until `canvasReady`, which is closer to the world actually being usable
- Updated `packages/foundry-module/src/socket-bridge.ts`
  - reconnect no longer stops permanently after the initial burst window
  - retry policy is now two-phase:
    - startup burst using exponential backoff
    - low-frequency maintenance reconnects every 60 seconds while enabled
  - long-lived maintenance mode logs only once when entered to avoid log spam on low-power hosts
- Updated `packages/foundry-module/src/constants.ts`
  - added a dedicated maintenance reconnect interval constant for low-cost background retries
- Updated `packages/mcp-server/src/foundry-connector.ts`
  - added a bounded `waitForConnection()` helper for short reconnect grace windows
- Updated `packages/mcp-server/src/foundry-client.ts`
  - queries now wait briefly for the Foundry bridge to reconnect before failing immediately
  - this is a fallback for first-call timing races, not the primary connection strategy
- This removes two confirmed problems:
  - premature "connected" state on the browser side
  - permanent reconnect exhaustion for the "backend starts much later" scenario
- It also improves a third case:
  - a user starts MCP/backend shortly before issuing the first command, and the backend-side query path can now tolerate a short in-progress reconnect

### J. Connection Strategy Going Forward

The working strategy is now:

1. Do not rely on the first MCP tool call to create the bridge.
   - Tool calls should use an already-maintained connection whenever possible.

2. Do not rely on the Foundry `ready` hook as the authoritative first connect point.
   - `ready` can happen before the world is fully settled.
   - `canvasReady` is a better first meaningful connect point.

3. Support both startup orders.
   - If MCP/backend is already running before the world starts, Foundry should connect automatically after the world is ready.
   - If the world is already running before MCP/backend starts, Foundry should keep retrying cheaply in the background until the backend appears.

4. Keep reconnect cheap enough for low-power hosts.
   - short burst at startup
   - then sparse maintenance retries instead of aggressive permanent polling
   - no heavy queries during maintenance reconnect attempts

5. Reserve tool-call waiting as a future fallback, not the primary strategy.
   - Backend queries now include a short grace wait for an in-progress reconnect.
   - This complements background bridge maintenance rather than replacing it.

## 5. Next Troubleshooting Steps

1. **Fix cache invalidation in the MCP server:**
   - Prevent `detectGameSystem()` from persisting `other` after transient failures.
   - Clear cached system state on Foundry disconnect/reconnect.
2. **Re-test system-dependent tools after the cache fix:**
   - `list-creatures-by-criteria`
   - character and compendium tools that require adapter routing
3. **Handle large compendium searches separately:**
   - Increase the query timeout beyond 10 seconds, or
   - reduce search scope / optimize index usage.
4. **Then revisit NPC generation:**
   - once adapter routing is stable and creature search no longer times out.

## 6. Additional Notes

- The system is correctly detected as dnd5e, so fallback to 'other' is not the issue.
- Filtering by 'level' is not supported for D&D 5e in MCP; use 'challengeRating' for CR-based filtering.
- Large or unfiltered queries may cause timeouts if compendium data is large or slow to access.
- The strongest current evidence points to connection loss plus stale fallback caching, not a bad world configuration.

---

**Update this log as you proceed with each troubleshooting step.**
