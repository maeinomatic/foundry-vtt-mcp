# Issue #17 Analysis - V14 Chat Visibility Retest

## Context

- Issue: `#17` Wave 3 (v14): Re-test chat visibility mode assumptions for DnD workflows
- Branch: `issue-17-v14-chat-visibility-retest`
- Analysis date: `2026-04-02`
- Parent wave: `#23`
- Related issue: `#5`
- Blocks: `#18`

## Issue Summary

Issue `#17` is not asking for a new chat feature. It is asking for current Foundry v14 runtime evidence that the repo's existing chat-adjacent visibility assumptions still hold for the DnD-facing workflow surface.

The required outcome is:

1. Re-test GM/public visibility behavior under Foundry v14.
2. Validate assumptions used by workflow reporting and chat-adjacent tool output.
3. Record behavior differences or limitations instead of relying on v13 expectations.
4. Feed those results into the broader v14 compatibility matrix work in `#18`.

## Current Repo State

### What is already implemented

The repo already contains the core visibility handling needed for this issue.

Relevant implementation areas:

1. `packages/foundry-module/src/services/chat-message-service.ts`
   - `post-chat-message` supports `public`, `gm-only`, and `recipients` visibility.
   - GM-only messages resolve live GM recipients.
   - Recipient-targeted messages validate recipient user identifiers.
   - Messages store visibility/source metadata in module flags.

2. `packages/foundry-module/src/services/roll-request-service.ts`
   - Request creation distinguishes public vs private roll requests.
   - Private request cards whisper to target users.
   - Roll execution uses visibility-aware message delivery via `buildRollToMessageOptions` and whisper targeting.
   - The chat card markup was recently normalized and mojibake-safe strings were fixed.

3. `packages/foundry-module/src/queries/utility-query-handlers.ts`
   - `post-chat-message` and `request-player-rolls` are both GM-gated query surfaces.

4. `docs/CHAT_AND_ROLL_RUNTIME_VALIDATION_2026-03-30.md`
   - Contains strong live validation evidence, but only for Foundry v13.

5. `docs/foundry-v14-compatibility-plan.md`
   - The chat visibility row is currently marked `done` based on static audit and baseline validation.

### What is already validated

The v13 runtime validation document shows that the following were exercised successfully on Foundry `13.351` with DnD5e `5.2.5`:

1. `post-chat-message` with `public`
2. `post-chat-message` with `gm-only`
3. `post-chat-message` with `recipients`
4. actor-backed and alias-only speaker handling
5. validation failures for invalid actors and invalid recipients
6. `request-player-rolls` request creation for both public and private visibility

## Main Analysis Finding

Issue `#17` appears to be mostly a runtime verification and documentation task, not primarily an implementation task.

The repo already has:

1. the chat-output primitive
2. explicit visibility handling in the Foundry module
3. recent hardening around roll-result delivery assumptions
4. a detailed v13 runtime validation record

What it does not yet have is a focused Foundry v14 validation record proving that those same assumptions still hold under v14.

## Gaps That Still Need To Be Closed

### 1. Missing live v14 evidence

There is no checked-in document showing live Foundry v14 runtime results for:

1. public chat output
2. GM-only chat output
3. recipient-targeted chat output
4. public roll request creation and click-through
5. private roll request creation and click-through
6. final roll-result visibility behavior after click

This is the primary blocker for closing `#17`.

### 2. DnD workflow scope is only partially covered

The existing v13 runtime validation is close to the issue scope, but it still centers on primitive chat output and the adjacent roll-request path.

For `#17`, the v14 retest should confirm whether any DnD-facing workflow reporting or chat-adjacent output depends on assumptions that changed in v14.

That means the retest should explicitly capture:

1. primitive `post-chat-message`
2. `request-player-rolls`
3. any DnD workflow outputs that surface visibility-sensitive chat results

### 3. End-to-end player-side verification is still incomplete

The existing runtime document explicitly notes that request creation succeeded, but player-side click-through and final rendered visibility were not fully verified after the encoding/build cleanup.

For issue `#17`, the player-side result matters because v14 changed chat visibility assumptions more than the request-creation path itself.

### 4. Compatibility-plan status may be overstated

`docs/foundry-v14-compatibility-plan.md` currently marks the chat visibility row as `done`, but the open issue and the available evidence indicate a narrower truth:

1. static hardening is done
2. baseline branch validation is done
3. focused live v14 verification is not yet done

That mismatch should be resolved as part of this issue.

## Risks And Open Questions

### 1. Foundry v14 behavior may differ at render time rather than API-call time

The current code paths may still succeed at `ChatMessage.create` and `Roll.toMessage` while rendering or visibility semantics differ in the UI.

### 2. Private roll behavior may differ between request-card delivery and roll-result delivery

The code currently distinguishes:

1. request-card whisper delivery
2. roll-result delivery via roll-mode/message-mode helpers

This is the exact kind of split behavior that needs live v14 confirmation.

### 3. Restart regression may interfere with runtime testing

The v13 validation surfaced a reconnect delay after backend restart. That is not the main scope of `#17`, but it may complicate repeated runtime test cycles.

### 4. The test environment may still be v13-only

If no live v14 Foundry environment is currently available, this branch can still complete the test plan and documentation prep work, but issue closure would remain blocked on actual runtime execution.

## Current Constraint

As of `2026-04-02`, the available live test environment is Foundry v13 only.

That means:

1. issue `#17` cannot be truthfully closed from this environment alone
2. the branch can still prepare evidence structure, checklist updates, and any static audit follow-up
3. the final acceptance criteria that require v14 validation must remain blocked until a live v14 runtime is available

## Recommended Decision

Treat issue `#17` as `blocked by environment` for live execution.

Do not manufacture v14 conclusions from:

1. v13 runtime behavior
2. static code inspection alone
3. prior hardening work that was not executed against a v14 world

The honest deliverable from the current environment is:

1. a prepared v14 validation plan
2. a clear list of scenarios to execute later
3. any static code review or documentation cleanup that reduces future test uncertainty

## Proposed Work Plan

### Phase 1: Static prep and scope tightening

1. Identify all chat-adjacent DnD-facing outputs that need v14 retest coverage.
2. Review any helper functions that translate `isPublic` or visibility into Foundry message/roll options.
3. Decide whether the compatibility-plan row should move from `done` to a state that reflects pending live verification.

### Phase 2: Live v14 execution

Run a focused Foundry v14 + DnD5e validation pass covering:

1. `post-chat-message` public
2. `post-chat-message` gm-only
3. `post-chat-message` recipients
4. invalid recipient validation
5. public `request-player-rolls` request creation
6. private `request-player-rolls` request creation
7. public roll button click-through and final message visibility
8. private roll button click-through and final message visibility
9. any DnD workflow output that emits chat messages or roll-adjacent reporting

### Phase 3: Documentation and tracker updates

1. Record v14 findings in a dedicated runtime-validation markdown file.
2. Update `docs/foundry-v14-compatibility-plan.md` with the actual result.
3. Add links from the issue to the new validation record.
4. If new behavior differences are found, open focused follow-up issues instead of stretching `#17`.

## Concrete Deliverables For This Issue

To close `#17`, the branch should ideally produce:

1. a dedicated v14 chat visibility validation markdown file
2. any minimal code fix required by that validation
3. an updated compatibility-plan entry that reflects the live v14 outcome
4. a short issue comment summary or PR summary referencing the validation artifact

## Recommended Validation Matrix For This Branch

Minimum target matrix:

1. Foundry `v14.x`
2. DnD5e current supported test version in the local environment
3. GM context
4. player-visible context for roll-button click-through

Minimum scenarios:

1. Public plain chat message
2. GM-only plain chat message
3. Recipient-targeted plain chat message
4. Public roll request card creation
5. Private roll request card creation
6. Public roll result after button click
7. Private roll result after button click
8. Invalid recipient failure path

## Recommendation

The most efficient path on this branch is:

1. finish a targeted code/documentation audit of the current visibility helpers
2. prepare a v14-specific runtime checklist from the existing v13 validation document
3. execute the live Foundry v14 retest as soon as the environment is available
4. only patch code if the live retest exposes a real v14-specific behavior difference

In short: this issue should be treated as evidence-driven compatibility validation first, and a code-change issue only if the v14 runtime proves the current assumptions wrong.

## Best Fallback Work From A V13-Only Environment

If work should continue without a v14 instance, the best follow-up options are:

1. convert this analysis into a compact executable v14 checklist document
2. review and tighten any chat-visibility helper code paths that still rely on mixed legacy/new message-mode assumptions
3. pick a different issue that is not blocked by missing v14 runtime access

The best alternative issue from the current backlog is likely a non-runtime static audit or hardening task rather than more v14 execution work.