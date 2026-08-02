# Issue #13 Analysis - DataModel Update Operator Audit

## Context

- Issue: `#13` Wave 3 (v14): Audit and patch DataModel update operator usage
- Branch: `issue-13-datamodel-update-audit`
- Analysis date: `2026-04-02`
- Parent wave: `#23`
- Blocks: `#18`

## Revalidation - 2026-08-02

This section supersedes the earlier conclusion that no concrete defect had been identified. The narrow operator scan remains correct, but rechecking the implementation against the current official Foundry v14 API and current DnD5e source exposed concrete compatibility and rollback gaps.

### Official sources checked

1. Foundry v14.365 `DataModel`, `Document`, `DatabaseUpdateOperation`, and `DataModelUpdateOptions` API documentation
2. Foundry v14 `ForcedReplacement` and `ForcedDeletion` API documentation
3. Foundry issue `#13090`, including its migration guidance and Version 16 deprecation window
4. DnD5e 5.3.3 release source for advancement storage, migration, and `Item5e.updateAdvancement()`

### Confirmed Foundry update semantics

1. `Document.update()` and `updateEmbeddedDocuments()` consume differential update data.
2. Normal object updates merge recursively.
3. `ForcedReplacement` is for explicit replacement without inner recursion; `recursive: false` is interpreted as forced replacement of top-level update keys.
4. `ForcedDeletion` resets a field to `undefined`.
5. Array assignment replaces the array value. The DnD5e 5.2.5 advancement payloads therefore do not need `ForcedReplacement` merely because they assign a complete array.
6. Legacy `-=` and `==` keys remain compatible during the documented deprecation period, but new v14-only operators must not be introduced unconditionally while this module remains pinned to Foundry v13.

### Confirmed code findings

1. The active package source still contains no authored `updateSource()`, legacy `-=`/`==` keys, `recursive: false`, `diff: false`, or `DataFieldOperator` use.
2. The progression adapter is tied to the DnD5e 5.2.5 advancement shape. `getItemAdvancements()` accepts arrays only, and each workflow writes a complete `system.advancement` array.
3. DnD5e 5.3.x migrated advancement storage to a keyed collection and exposes `Item5e.updateAdvancement(id, updates)`, which updates `system.advancement.<id>`. The current adapter will read the 5.3.x shape as empty and cannot safely apply its existing whole-array payloads.
4. The three mixed actor-plus-item workflows remain non-atomic. Their scalar actor rollback is reasonable for existing scalar paths, but rollback success is not verified by readback.
5. Size rollback is concretely incorrect when `system.traits.size` did not previously exist: it writes a fallback value or `null` instead of restoring path absence. Official v14 semantics require a deletion operation to restore `undefined`.
6. Character transaction rollback restores touched update paths rather than exact document snapshots. Object-valued rollback data is recursively merged, so keys introduced by a failed workflow are not guaranteed to be removed.
7. Deleted owned items are recreated after their identity fields have been removed. This creates an equivalent new item rather than restoring the original embedded-document identity and can invalidate ID-based references.
8. Item-choice replacement cleanup records a warning and returns success when deletion of the original item fails, leaving both items present after the advancement state has already been changed.
9. The Foundry module still compiles against Foundry v9 declarations and broad structural mutation interfaces. Current typecheck results cannot be treated as evidence that v14 update payloads are schema-correct.

### Safe continuation boundary

Do not add `_replace`, `ForcedReplacement`, `_del`, or `ForcedDeletion` directly to shared mutation payloads yet. Those values are v14 APIs and the manifest remains pinned to v13. First introduce an explicit runtime/version compatibility seam or avoid operator-dependent updates by using stable leaf paths and system-provided methods.

### Validation evidence - 2026-08-03

The following checks passed on the issue branch after the DnD5e advancement-shape compatibility update:

1. `npm run typecheck`
2. `npm run build`
3. `npm -w @maeinomatic/foundry-mcp-server test -- --run` (121 tests)
4. `npx vitest --root packages/foundry-module run src/services/actor-progression-strategies/dnd5e-actor-progression-strategy.test.ts` (3 focused regression tests)
5. `npm run lint -- --max-warnings=0`
6. `npm run test:mcp:schema`

Live Foundry v13 Build 351 with DnD5e 5.2.5 also exercised the public MCP progression path, including legacy array-backed advancement persistence and ASI handling. A live DnD5e 5.3.x and Foundry v14 runtime remains a separate uncompleted compatibility gate.

The next implementation pass should be ordered as follows:

1. Add progression tests that model both DnD5e 5.2.5 array advancement and DnD5e 5.3.x keyed advancement collection inputs.
2. Refactor advancement access behind a version/shape adapter. Preserve the tested 5.2.5 path and use keyed entry updates or `updateAdvancement()` for 5.3.x where available.
3. Add failure-path tests for ASI, hit points, size, item replacement cleanup, and unidentified created items before changing rollback code.
4. Fix size rollback with an explicit distinction between an absent path and a present value. Any deletion operator must be selected through the Foundry-version seam.
5. Define the transaction contract honestly: either provide exact restoration, including embedded identity and object-key deletion, or report compensating rollback without claiming exact restoration.
6. Only after these tests pass should the compatibility tracker move from `in-progress` to `done`; live Foundry v13/v14 execution remains a separate gate.

## Issue Summary

Issue `#13` asks for a static and implementation-level audit of Foundry-facing mutation code to ensure the repo does not rely on deprecated DataModel update operator semantics under v14.

The issue scope explicitly includes:

1. actor update services
2. embedded item CRUD and batch updates
3. transactional patch application
4. DnD5e progression and workflow mutation paths

## Current Tracker Mismatch

`docs/foundry-v14-compatibility-plan.md` currently marks the DataModel update operator item as `done`, with notes focused on:

1. no active `updateSource`
2. no `-=` / `==` legacy operator keys
3. no non-recursive update options or explicit compatibility shims

That conclusion is directionally useful, but it is too narrow for the actual issue scope.

The current repo contains a much broader mutation surface than the tracker note names. The codebase now relies heavily on:

1. `actor.update(...)`
2. `updateEmbeddedDocuments(...)`
3. `createEmbeddedDocuments(...)`
4. `deleteEmbeddedDocuments(...)`
5. manual rollback flows built on snapshot/patch assumptions

So the real audit question is not only whether deprecated operator syntax exists. It is also whether the repo's current update payload shapes and rollback assumptions are safe across the active mutation surface.

## Main Findings

### 1. No obvious legacy operator syntax was found

The search did not surface active uses of:

1. `updateSource(...)`
2. legacy `-=` or `==` update keys
3. explicit `DataFieldOperator` compatibility code
4. suspicious `recursive: false` or `diff: false` style update flags in the main package sources

This supports the earlier compatibility note, but it is only the first layer of the audit.

### 2. The real audit surface is service-layer mutations

The meaningful update paths are spread across the Foundry module service layer, not concentrated in a single low-level file.

Key mutation surfaces identified during this pass:

1. `packages/foundry-module/src/services/actor-update-service.ts`
   - direct `actor.update(request.updates)`
   - direct `actor.updateEmbeddedDocuments('Item', ...)`
   - batch embedded item updates

2. `packages/foundry-module/src/services/character-patch-transaction-service.ts`
   - transaction preparation from actor/item snapshots
   - rollback generation from dotted update paths
   - mixed actor updates plus embedded create/update/delete operations

3. `packages/foundry-module/src/services/actor-progression-strategies/dnd5e-actor-progression-strategy.ts`
   - multi-step workflows that update actor data and owned item advancement data
   - manual rollback after failure
   - repeated patterns for ability score, HP, size, and other advancement mutations

4. `packages/foundry-module/src/services/companion-service.ts`
   - flag-path mutations such as `flags.<module>.companionLink`
   - ownership synchronization via `update()` payloads

5. `packages/foundry-module/src/services/item-authoring-service.ts`
   - direct world-item updates with arbitrary user-provided payloads

6. `packages/foundry-module/src/services/journal-service.ts`
   - nested page updates such as `'text.content'`

7. `packages/foundry-module/src/services/actor-item-service.ts`
   - embedded item create/delete flows that rely on normalized document snapshots

### 3. DnD5e progression is the highest-risk area

The DnD5e progression strategy contains the densest concentration of multi-step update logic.

Observed pattern:

1. compute an actor patch
2. apply `actor.update(...)`
3. apply `actor.updateEmbeddedDocuments('Item', ...)`
4. attempt manual rollback if the second step fails

This is not necessarily wrong, but it is the area most likely to be sensitive to changed update semantics, because it assumes:

1. dotted path updates behave consistently
2. rollback payloads reconstruct prior state accurately
3. owned item advancement patches merge as expected

## What Seems Safe So Far

Based on this static pass, the following appear safer than originally feared:

1. there is no obvious reliance on deprecated operator keys
2. most update payloads use plain dotted-path assignments rather than special operator syntax
3. embedded document mutations are using the supported create/update/delete APIs rather than custom patch operators
4. the transaction service snapshots prior state instead of trying to synthesize rollback from assumptions alone

## Detailed Audit Pass - 2026-04-02

This pass went beyond generic grep checks and inspected the authored mutation logic in the highest-risk services.

### 1. Character patch transactions are stricter than the earlier tracker note implied

`packages/foundry-module/src/services/character-patch-transaction-service.ts` currently does several things right:

1. it snapshots actor and item state before mutation
2. it refuses transactional updates for dotted paths that do not already exist
3. it uses plain dotted-path rollback payloads instead of legacy operator syntax
4. it rolls created items back with `deleteEmbeddedDocuments()` and deleted items back with `createEmbeddedDocuments()`

This reduces the risk of silent v14 breakage from deprecated operator behavior.

Residual risk remains in one area:

1. rollback only restores touched paths, so correctness still depends on authored updates being narrow and path-stable

### 2. DnD5e progression mutations are mostly narrow, but they are still the highest-risk authored update surface

The progression strategy repeatedly uses a consistent pattern:

1. actor updates target stable dotted paths such as:
   - `system.abilities.<ability>.value`
   - `system.attributes.hp.value`
   - `system.attributes.hp.max`
   - `system.traits.size`
2. owned class/source item updates replace `system.advancement` on the specific embedded item
3. failures attempt rollback of the immediately previous actor mutation or created owned items

This is better than using legacy update operators, but it still deserves close review because:

1. `system.advancement` is being replaced as a composed structure, not patched per leaf path
2. rollback logic is handwritten in many advancement cases
3. there are many repeated patterns, so one subtle schema assumption could affect multiple advancement choices

More precise classification from the first deeper read:

1. mixed actor-plus-item mutation cases:
   - ability score improvement updates `system.abilities.<ability>.value` then replaces the class item's `system.advancement`
   - hit point advancement updates `system.attributes.hp.value` and `system.attributes.hp.max` then replaces the class item's `system.advancement`
   - size advancement updates `system.traits.size` then replaces the source item's `system.advancement`
2. embedded-item-only advancement cases:
   - feat choice
   - subclass choice
   - item choice
   - item grant choice
   - trait choice

This matters because the mixed actor-plus-item cases carry the highest rollback risk, while the embedded-item-only cases are more about whether whole-structure `system.advancement` replacement is schema-safe under v14.

### 3. Generic actor and item update services are intentionally pass-through surfaces

`packages/foundry-module/src/services/actor-update-service.ts` and `item-authoring-service.ts` expose generic mutation capabilities by design.

Important distinction:

1. these services are not necessarily wrong just because they pass `request.updates` through to Foundry
2. they do mean this issue must document residual risk separately for user-authored arbitrary patch payloads versus repo-authored update payloads

That distinction matters because issue `#13` can fully audit repo-authored mutations, but it cannot fully eliminate every bad update payload a caller might submit through a generic tool surface.

### 4. Companion and journal mutations currently look narrow and conventional

The authored update payloads inspected in these services are relatively narrow:

1. companion links update a specific `flags.<module>.companionLink` path and optional ownership
2. journal updates target `'text.content'` on a text page

These do not currently show the kinds of deprecated operator assumptions the issue is concerned with.

## Remaining Audit Questions

### 1. Are any rollback payloads incomplete for nested data?

The transaction and progression flows often reconstruct rollback data only for touched dotted paths.

That is usually correct, but it should be checked carefully where:

1. nested objects are partially replaced
2. arrays or schema-managed collections are updated indirectly
3. system-owned data structures may normalize or coerce values under v14

### 2. Are arbitrary external update payloads too permissive?

Some services, especially generic actor/item update tools, pass user-provided `updates` through directly.

That is part of the tool design, but it means the audit should distinguish between:

1. repo-authored update payloads
2. user-authored arbitrary patch payloads sent through MCP

The repo can harden its own authored updates more confidently than it can fully sanitize every arbitrary update path.

### 3. Does the tracker need to distinguish static-audit done vs. runtime confidence?

The compatibility-plan row is currently marked `done`, but a fuller reading suggests a better status model would be:

1. legacy operator syntax audit done
2. broader mutation-surface review in progress or documented

This is especially relevant because issue `#13` is still open.

## Recommended Next Audit Pass

The next concrete pass should focus on authored update payloads, not generic grep output.

Priority order:

1. `packages/foundry-module/src/services/actor-progression-strategies/dnd5e-actor-progression-strategy.ts`
   - enumerate all `actor.update(...)` and `updateEmbeddedDocuments(...)` payload shapes
   - check whether any payload replaces complex nested objects instead of targeted dotted paths
   - review rollback completeness case by case

2. `packages/foundry-module/src/services/character-patch-transaction-service.ts`
   - verify rollback extraction for nested paths and deletion cases
   - confirm no path logic assumes operator semantics that changed in v14

3. `packages/foundry-module/src/services/actor-update-service.ts`
   - classify which update surfaces are intentionally pass-through
   - document the residual risk for arbitrary user-supplied patch payloads

4. `packages/foundry-module/src/services/companion-service.ts`, `item-authoring-service.ts`, and `journal-service.ts`
   - confirm their authored dotted-path updates are narrow and schema-safe

## Per-File Audit Checklist

### `packages/foundry-module/src/services/actor-progression-strategies/dnd5e-actor-progression-strategy.ts`

- [x] Identify every authored `actor.update(...)` site
- [x] Identify every authored `updateEmbeddedDocuments('Item', ...)` site
- [x] Classify mixed actor-plus-item vs embedded-item-only mutations
- [ ] Verify whether any `system.advancement` replacement should be narrowed further
- [ ] Review whether rollback coverage is complete in the mixed actor-plus-item cases

### `packages/foundry-module/src/services/character-patch-transaction-service.ts`

- [x] Confirm transaction rollback is built from snapshots rather than legacy operators
- [x] Confirm missing dotted paths are rejected before mutation
- [x] Confirm create/update/delete rollback actions use supported embedded-document APIs
- [ ] Review whether dotted-path rollback is sufficient for all currently allowed nested updates

### `packages/foundry-module/src/services/actor-update-service.ts`

- [x] Confirm generic actor/item update surfaces are pass-through by design
- [ ] Document residual risk boundaries for arbitrary caller-supplied payloads

### `packages/foundry-module/src/services/companion-service.ts`

- [x] Confirm authored updates are narrow dotted-path or ownership mutations

### `packages/foundry-module/src/services/item-authoring-service.ts`

- [x] Confirm world-item updates are pass-through by design rather than authored nested mutations

### `packages/foundry-module/src/services/journal-service.ts`

- [x] Confirm authored update targets a narrow dotted path (`text.content`)

## Likely Deliverable Shape For This Issue

Issue `#13` now looks like a documentation-and-audit issue first, with code changes only if a concrete unsafe payload pattern is found.

The likely deliverables are:

1. a markdown audit record listing the inspected update surfaces
2. compatibility-plan notes updated to reflect the broader audit scope accurately
3. targeted tests only if a suspicious mutation pattern is discovered and patched

## Recommendation

Do not assume issue `#13` is already finished just because legacy operator syntax was not found.

The recommended path on this branch is:

1. turn this high-level analysis into a focused per-file audit checklist
2. inspect the authored mutation payloads in the DnD progression and transaction services in detail
3. update the compatibility plan so its notes match the real audit depth
4. only patch code if a specific unsafe update pattern is identified

In short: the initial conclusion that there is no obvious deprecated operator syntax is probably correct, but the issue remains valuable because the real risk lies in the repo's wider mutation and rollback surface rather than in literal `-=` or `==` usage.

## Historical Conclusion After The First Deeper Pass

This 2026-04-02 conclusion is retained as audit history but is superseded by the 2026-08-02 revalidation above. Concrete compatibility and rollback defects have now been identified.

The current best-supported conclusion is:

1. the original static audit was directionally correct
2. the broader mutation-surface review was still necessary
3. the highest remaining uncertainty is concentrated in DnD5e progression rollback behavior and whole-structure `system.advancement` updates
4. the next pass should stay focused on those authored workflows instead of reopening already low-risk generic grep checks

## Historical Recommendation For The Next Coding Step

The original recommendation was not to patch code before identifying a concrete unsafe pattern. That condition has now been met, but tests and a v13/v14 compatibility seam must precede operator-dependent code changes.

The original next step was to continue the authored-workflow audit until one of two outcomes became true:

1. a concrete unsafe update pattern is found and can be patched minimally
2. the remaining risk can be narrowed enough that the issue becomes a documentation/test-evidence update rather than a code-change task
