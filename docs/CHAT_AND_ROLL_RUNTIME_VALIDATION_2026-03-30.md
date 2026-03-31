# Chat And Roll Runtime Validation - 2026-03-30

## Context

- Repository: `maeinomatic/foundry-vtt-mcp`
- Branch: `master`
- Connected world: `Starting World Maeinomatic`
- Foundry version: `13.351`
- System: `dnd5e 5.2.5`
- Active GM user during testing: `Gamemaster`

## Scope

This session validated the runtime behavior of the `post-chat-message` MCP feature and the adjacent `request-player-rolls` visibility path against a live Foundry-connected server.

The goal was to confirm that the new guarded chat-output path works correctly across:

- visibility modes
- actor-backed speaker resolution
- alias-based speaker overrides
- recipient targeting
- validation failures
- plain-text content handling

It also validates that the roll-request path can still create both public and private roll buttons after the visibility hardening in `roll-request-service.ts`.

## Tests Performed

### 1. Baseline connectivity

- `get-world-info` returned the expected world, system, and Foundry version.
- `list-scenes` returned the active scene successfully.

Result: passed.

### 2. GM-only chat post

- Sent a GM-only `post-chat-message` with `speakerAlias: "GitHub Copilot"`.
- Foundry returned success with a message id and resolved the GM recipient correctly.

Result: passed.

### 3. Actor-backed GM-only post

- Sent a GM-only `post-chat-message` as `Danny Phantom`.
- Foundry resolved the actor successfully and returned a message id.

Result: passed.

### 4. Actor-backed public post

- Sent a public `post-chat-message` as `Danny Phantom`.
- Foundry resolved the actor successfully and returned a message id.

Result: passed.

### 5. In-character public post

- Sent an original in-character public line as `Danny Phantom`.
- Message posted successfully with actor-backed speaker resolution.

Result: passed.

### 6. Longer public monologue

- Sent a longer original public monologue as `Danny Phantom`.
- Message posted successfully with actor-backed speaker resolution.

Result: passed.

### 7. Recipient-targeted post

- Sent a `visibility: recipients` message targeted to `Gamemaster`.
- Foundry resolved the recipient explicitly and returned success.

Result: passed.

### 8. Actor plus alias

- Sent a public message with `speakerActorIdentifier: "Danny Phantom"` and `speakerAlias: "Ghost Danny"`.
- Foundry returned success and preserved both the actor and alias in the speaker payload.

Result: passed.

### 9. Alias-only post

- Sent a GM-only message with `speakerAlias: "Narrator"` and no actor.
- Foundry returned success and preserved the alias-only speaker payload.

Result: passed.

### 10. Invalid actor validation

- Sent a message using `speakerActorIdentifier: "Definitely Not A Real Actor"`.
- Foundry rejected the request with `Speaker actor not found: Definitely Not A Real Actor`.

Result: passed.

### 11. Invalid recipient validation

- Sent a recipient-targeted message using `recipientUsers: ["Definitely Not A Real User"]`.
- Foundry rejected the request with `Recipient user not found: Definitely Not A Real User`.

Result: passed.

### 12. Content edge cases

- Sent multiline text containing quotes, brackets, and punctuation.
- Foundry returned success and accepted the message content without breaking the request.

Result: passed.

### 13. Post-test connection sanity check

- Re-ran `get-world-info` after the write-heavy test sequence.
- MCP bridge remained healthy and connected.

Result: passed.

### 14. Public roll-request visibility

- Invoked `request-player-rolls` directly through the running backend control socket on `127.0.0.1:31414` because that tool was not exposed through the current chat tool list.
- Targeted `Gamemaster` with a public stealth skill roll request.
- Backend returned: `Roll request sent successfully! Roll request sent to Gamemaster. Public roll button created in chat.`

Result: passed.

### 15. Private roll-request visibility

- Invoked `request-player-rolls` directly through the running backend control socket on `127.0.0.1:31414`.
- Targeted `Gamemaster` with a private stealth skill roll request.
- Backend returned: `Roll request sent successfully! Roll request sent to Gamemaster. Private roll button created in chat.`

Result: passed.

### 16. Roll completion status rendering finding

- Manual observation in Foundry chat showed corrupted completion text after a skill check was completed.
- Observed output included mojibake like `âœ…` in the status line: `Status: âœ… Completed by Gamemaster ...`.
- Source inspection found two separate corrupted strings in `packages/foundry-module/src/services/roll-request-service.ts`:
  - fallback button text: `âœ" Rolled`
  - completed status line: `âœ… Completed by ...`
- Both strings were replaced with ASCII-safe text so the status block no longer depends on a mis-encoded checkmark glyph.

Result: bug found and fixed in source.

### 17. Invalid roll target

- Invoked `request-player-rolls` with `targetPlayer: "Definitely Not A Real Target"`.
- Backend returned an explicit error and helpfully listed the available player name.
- Observed response: `No player or character named "Definitely Not A Real Target" found. Available players: Player1`.

Result: passed.

### 18. Missing visibility confirmation schema validation

- Invoked `request-player-rolls` without `userConfirmedVisibility`.
- Backend rejected the request at schema-validation time.
- Observed response: `Parameter error: Invalid literal value, expected true`.

Result: passed.

### 19. Offline player roll request

- Invoked `request-player-rolls` targeting the discovered non-GM player `Player1` while they were offline.
- Backend returned the expected offline-player error.
- Observed response: `Player "Player1" is registered but not currently logged in. They need to be online to receive roll requests.`

Result: passed.

### 20. Invalid roll type enum validation

- Invoked `request-player-rolls` with `rollType: "nonsense"`.
- Backend rejected the request with an enum validation error that listed the accepted roll types.

Result: passed.

### 21. Controlled backend restart regression

- Identified the active backend control-socket listener on `127.0.0.1:31414` and confirmed it was running `packages/mcp-server/dist/backend.js`.
- Captured a pre-restart baseline where `request-player-rolls` still succeeded.
- Terminated the active backend process and restarted it from the same entrypoint.
- Verified that the control socket returned on a new process id.
- Retried runtime queries after restart.
- Observed that the backend itself was alive, but the Foundry module did not automatically reconnect to it within the initial retry window.
- Initial post-restart failures included:
  - `get-world-info` -> `Foundry VTT module not connected. Please ensure Foundry is running and the MCP Bridge module is enabled.`
  - `request-player-rolls` -> `Error: Foundry VTT module not connected. Please ensure Foundry is running and the MCP Bridge module is enabled.`
- Continued probing later in the session showed that the Foundry module did eventually reattach:
  - actor-backed GM-only `post-chat-message` succeeded again after restart
  - `get-world-info` succeeded again after restart
  - `request-player-rolls` succeeded again after restart
- User observation: reloading the Foundry page in the browser restored the connection reliably when the automatic reconnect did not catch it by itself.

Result: partial pass with a real regression. Backend restart causes a transient disconnect window where tool calls fail, but the live Foundry module attachment later recovered and normal tool calls resumed.

### 22. Fresh post-fix public/private roll verification requests

- After reconnection was restored, created a fresh public stealth roll request for `Gamemaster` with flavor `Post-fix public roll verification`.
- Created a fresh private stealth roll request for `Gamemaster` with flavor `Post-fix private roll verification`.
- These requests are intended for manual in-Foundry verification of:
  - post-fix status text rendering
  - button click behavior
  - final public/private roll visibility after click

Result: requests created successfully; manual UI verification still required.

### 23. Follow-up mojibake scope confirmation

- Manual Foundry verification on the fresh requests still showed mojibake in both the initial request text and the completed status text.
- Source and built-artifact inspection confirmed that this was not limited to one string:
  - source still contained corrupted button/progress labels like `ðŸŽ² ${buttonLabel}`, `ðŸŽ² Rolling...`, and `ðŸŽ² Processing...`
  - built files under `packages/foundry-module/dist` still contained both the older corrupted request text and the older corrupted completion text
- This means the fix required two actions:
  - patch the remaining source strings
  - rebuild the Foundry module so the loaded `dist` files match the corrected source
- Additional build-system finding: the package build did not clean `dist` before compiling, so obsolete artifacts could survive across rebuilds and continue to look like live code during validation.
- The module build script was hardened to remove `dist` before running `tsc`, and a clean rebuild removed the stale `dist/data-access` roll-request artifact entirely.

Result: root cause confirmed. The live mojibake came from a combination of incomplete source cleanup and stale built artifacts.

## Runtime Conclusions

The chat-output feature is runtime-validated for the currently connected Foundry v13 world across:

- `public` visibility
- `gm-only` visibility
- `recipients` visibility
- actor-backed speaker resolution
- alias-only speaker resolution
- actor plus alias combinations
- explicit validation failure for missing actors
- explicit validation failure for missing recipients
- multiline and punctuation-heavy plain-text content

The adjacent roll visibility path is also runtime-validated at the request-creation layer for:

- public roll request button creation
- private roll request button creation
- invalid target failures
- offline player failures
- MCP schema validation for missing required confirmation
- MCP schema validation for invalid roll type values

This session also surfaced a real rendering defect in the roll request and completion text caused by mojibake in both source and built module artifacts.

This session also demonstrated a restart regression: restarting `packages/mcp-server/dist/backend.js` restored the control socket immediately, but the live Foundry module connection did not recover within the initial retry window and only reattached later.

Based on this session, the chat-output and roll-request creation paths appear stable during a continuous live session, but the backend restart path is not yet robust because there is a transient post-restart period where MCP calls fail before the Foundry module eventually reattaches.

## Items Not Yet Exercised Here

### Roll button execution and rendered chat verification

The roll-request path was validated through successful backend responses for both public and private requests, but this session did not independently inspect the rendered Foundry chat entry after the encoding fix was rebuilt and reloaded, or click the resulting button as a player.

That means the request-creation path is covered, but the full player-side click-through and resulting roll message visibility still remains unverified in this document.

### Restart regression

A controlled restart regression was executed and exposed a real issue: the backend could be restarted and would rebind its control socket, but the live Foundry module did not reconnect within the observed initial retry window.

Later checks in the same session showed eventual recovery without a full manual test re-run, so the issue appears to be delayed reconnect behavior rather than permanent loss of attachment.

Current workaround observed in practice: reloading the Foundry page restores the module attachment when automatic reconnect does not recover quickly enough.

### Chat log retrieval gap

This session could post chat messages and create roll requests, but it could not retrieve or inspect Foundry chat history through the currently exposed MCP tool surface.

That means manual visual verification inside Foundry was still required for checks like the mojibake status rendering issue.

Follow-up needed: investigate whether Foundry chat history can be exposed safely as a read-only MCP capability, for example by reading recent `ChatMessage` documents with configurable limits and visibility-aware filtering.

## Recommended Next Checks

1. Reload the Foundry module or refresh the Foundry client so it picks up the clean rebuilt `dist`, then click the generated public and private roll buttons and confirm the resulting request text, progress text, and final status text no longer contain mojibake.
2. Confirm the resulting roll messages respect the expected public/private visibility after button click.
3. Investigate and, if feasible, implement a read-only MCP tool for recent chat-log retrieval so runtime chat validation does not depend on manual inspection alone.
4. Investigate why the Foundry module does not reconnect quickly after backend restart, and add or harden reconnect behavior so a browser page reload is not required as a fallback.
5. Use the fresh `Post-fix public roll verification` and `Post-fix private roll verification` requests to verify rendered status text and final roll visibility in the Foundry UI.
6. After a reconnect fix, rerun the backend restart regression and confirm both `get-world-info` and `request-player-rolls` recover within the expected retry window without manual page reload.
7. Keep this file as evidence of live runtime validation for issue `#5` and the adjacent roll-visibility hardening follow-up.
