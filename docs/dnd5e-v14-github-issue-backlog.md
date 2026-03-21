# DnD5e + v14 GitHub Issue Backlog

This document proposes a focused set of GitHub issues to create next.

Scope sources:
- `TOOL_INVENTORY.md` (DnD5e missing endpoint tracker)
- `docs/foundry-v14-compatibility-plan.md` (official v14 breaking-change watch list)
- `MAINTENANCE_ROADMAP.md` (quality and release guardrails)

## Label Suggestions

- `dnd5e`
- `v14`
- `api`
- `tooling`
- `testing`
- `security`
- `breaking-change`
- `enhancement`
- `priority:high`
- `priority:medium`

## Milestone Suggestions

1. `DnD Tooling Baseline`
2. `Foundry v14 Readiness`
3. `Quality and Stability`

## Issue Creation Order

Create in this order to maximize immediate value for DnD workflows:

1. Core actor write APIs
2. Actor embedded item CRUD APIs
3. DnD5e leveling and advancement APIs
4. DnD5e spell lifecycle APIs
5. v14 blocking compatibility tasks
6. Test + CI + safe dependency tasks

## Recommended Working Order (Execution Waves)

This is the implementation order (not just issue creation order).

### Wave 0: Foundation and Safety (must pass before feature waves)

1. Issue 16: Convert DSA5 filter test file into real Vitest suite.
2. Issue 17: Add CI quality gates for typecheck/test/build/audit.

Exit gate:
- CI is enforcing typecheck, tests, and build on PRs.
- Test suite has real assertions and passes consistently.

### Wave 1: DnD write unblockers (highest product value)

1. Issue 1: `update-actor`
2. Issue 2: `update-actor-resources`
3. Issue 3: actor item CRUD (`add-item-to-actor`, `update-actor-item`, `remove-item-from-actor`)
4. Issue 4: `batch-update-actor-items`

Dependencies:
- Issue 4 depends on Issue 3.

Exit gate:
- Core GM edits can be performed without manual Foundry UI edits.
- Integration tests cover actor + embedded-item mutation flows.

### Wave 2: DnD progression and spells

1. Issue 5: `dnd5e-level-up-character`
2. Issue 6: `dnd5e-add-class-levels`
3. Issue 7: `dnd5e-apply-advancement`
4. Issue 8: spell lifecycle tools
5. Issue 9: build safety/preview/transaction tools

Dependencies:
- Issue 5 depends on Issue 3 (class items manipulation).
- Issue 6 depends on Issues 3 and 5.
- Issue 7 depends on Issues 5 and 6.
- Issue 8 depends on Issue 3.
- Issue 9 should land after Issues 5-8 to validate full flows.

Exit gate:
- A full DnD level-up (including multiclass and advancement choice handling) is executable through MCP tools.

### Wave 3: v14 compatibility blockers (DnD-first)

1. Issue 10: DataModel operator audit/fix
2. Issue 11: ActiveEffect transferral behavior validation
3. Issue 13: `parseHTML` null safety
4. Issue 12: token detection modes type changes
5. Issue 14: chat visibility mode assumptions
6. Issue 15: publish DnD-focused v14 matrix results

Dependencies:
- Issue 15 depends on completion of Issues 10-14.

Exit gate:
- DnD-focused v14 matrix completed with pass/partial/blocked evidence linked to issues.

### Wave 4: Safe maintenance updates

1. Issue 18: safe dependency updates in batches A, B, C.

Dependencies:
- Run after Waves 0-3 to reduce debugging noise during feature work.

Exit gate:
- All batches pass typecheck/tests/build/schema smoke.

## Suggested Sprint Cut (if you want a smaller first cycle)

Sprint 1:
1. Issues 16, 17, 1, 3

Sprint 2:
1. Issues 2, 4, 5, 6

Sprint 3:
1. Issues 7, 8, 9

Sprint 4:
1. Issues 10, 11, 13, 12, 14, 15

Sprint 5:
1. Issue 18

## A. DnD Tool Coverage Issues (Highest Priority)

### 1) Add generic `update-actor` MCP tool
- Priority: `priority:high`
- Labels: `api`, `dnd5e`, `enhancement`
- Milestone: `DnD Tooling Baseline`
- Why:
  - Enables direct updates to biography/profile/core fields for DnD characters.
- Scope:
  - Add tool definition and handler for safe actor updates.
  - Validate allowed update paths.
  - Return updated actor summary.
- Acceptance criteria:
  - Update actor name and biography fields in DnD5e world.
  - Invalid paths rejected with clear errors.
  - Unit tests for success and failure paths.

### 2) Add generic `update-actor-resources` MCP tool
- Priority: `priority:high`
- Labels: `api`, `dnd5e`, `enhancement`
- Milestone: `DnD Tooling Baseline`
- Why:
  - Covers HP, temp HP, hit dice, death saves, exhaustion, and currency bookkeeping.
- Scope:
  - Add guarded resource updates with delta and absolute modes.
- Acceptance criteria:
  - Can update HP and temp HP without corrupting actor state.
  - Supports at least one delta update and one absolute update.
  - Includes validation tests.

### 3) Add actor embedded item CRUD: `add-item-to-actor`, `update-actor-item`, `remove-item-from-actor`
- Priority: `priority:high`
- Labels: `api`, `dnd5e`, `enhancement`
- Milestone: `DnD Tooling Baseline`
- Why:
  - Unblocks equipment, spells, feats, and class feature management.
- Scope:
  - Add three tools and handlers.
  - Support source from compendium, world item, or payload.
- Acceptance criteria:
  - Add and remove a DnD5e item from actor.
  - Update quantity/equipped/prepared fields on embedded item.
  - Integration tests for create/update/delete sequence.

### 4) Add `batch-update-actor-items` transactional tool
- Priority: `priority:high`
- Labels: `api`, `dnd5e`, `enhancement`
- Milestone: `DnD Tooling Baseline`
- Why:
  - Level-up and rebuild flows modify multiple embedded documents.
- Scope:
  - Atomic multi-item updates with partial-failure reporting.
- Acceptance criteria:
  - Supports at least 3 item updates in one request.
  - Either full success or explicit per-item failure report.
  - Covered by tests.

### 5) Add DnD5e leveling orchestrator: `dnd5e-level-up-character`
- Priority: `priority:high`
- Labels: `dnd5e`, `api`, `enhancement`
- Milestone: `DnD Tooling Baseline`
- Why:
  - No complete tool currently handles character level progression.
- Scope:
  - Increment level and trigger class/feature progression flow.
- Acceptance criteria:
  - Level increase reflected on actor and relevant class item.
  - Validation errors for invalid level jumps.
  - Tests for single-level and invalid scenarios.

### 6) Add multiclass support tool: `dnd5e-add-class-levels`
- Priority: `priority:high`
- Labels: `dnd5e`, `api`, `enhancement`
- Milestone: `DnD Tooling Baseline`
- Why:
  - Multiclass workflows require class-item manipulation.
- Scope:
  - Add new class item when needed; update existing class levels otherwise.
- Acceptance criteria:
  - Add first level in new class to existing actor.
  - Increase level in existing class.
  - Tests for both paths.

### 7) Add advancement application tool: `dnd5e-apply-advancement`
- Priority: `priority:high`
- Labels: `dnd5e`, `api`, `enhancement`
- Milestone: `DnD Tooling Baseline`
- Why:
  - DnD5e progression depends on advancement choices, not only numeric levels.
- Scope:
  - Apply ASI/feat/subclass/options with validation.
- Acceptance criteria:
  - Supports at least one ASI/feat flow and one subclass selection flow.
  - Reports unresolved advancement choices.

### 8) Add DnD5e spell lifecycle tools
- Priority: `priority:medium`
- Labels: `dnd5e`, `api`, `enhancement`
- Milestone: `DnD Tooling Baseline`
- Why:
  - Full caster workflows need learn/prepare/slot control.
- Scope:
  - `dnd5e-learn-spell`
  - `dnd5e-manage-prepared-spells`
  - `dnd5e-set-spell-slots`
- Acceptance criteria:
  - Learn spell from compendium to actor.
  - Prepare/unprepare spell where applicable.
  - Update slot max/current for at least one spell level.

### 9) Add DnD build safety tools
- Priority: `priority:medium`
- Labels: `dnd5e`, `api`, `enhancement`, `testing`
- Milestone: `DnD Tooling Baseline`
- Why:
  - Reduces risk before applying multi-step mutations.
- Scope:
  - `validate-dnd5e-character-build`
  - `preview-dnd5e-level-up`
  - `apply-character-patch-transaction`
- Acceptance criteria:
  - Preview returns structured diff.
  - Validation catches at least 3 invalid build patterns.
  - Transaction mode supports rollback on failure.

## B. v14 Readiness Issues (DnD-Focused)

### 10) Audit and patch DataModel update operator usage for v14
- Priority: `priority:high`
- Labels: `v14`, `breaking-change`, `api`, `priority:high`
- Milestone: `Foundry v14 Readiness`
- Upstream:
  - https://github.com/foundryvtt/foundryvtt/issues/13090
- Scope:
  - Replace deprecated `updateSource` operator assumptions.
  - Audit targeted files in v14 plan.
- Acceptance criteria:
  - No deprecated operator patterns in audited code.
  - v13 behavior unchanged.
  - v14 smoke tests pass for touched flows.

### 11) Validate ActiveEffect behavior after legacy transferral retirement
- Priority: `priority:high`
- Labels: `v14`, `breaking-change`, `dnd5e`, `priority:high`
- Milestone: `Foundry v14 Readiness`
- Upstream:
  - https://github.com/foundryvtt/foundryvtt/issues/13280
- Scope:
  - Verify token condition and actor effect workflows in DnD5e.
- Acceptance criteria:
  - `toggle-token-condition` works on v14 + DnD5e.
  - No effect duplication/loss in basic test cases.

### 12) Handle token detection modes type changes in token tooling
- Priority: `priority:medium`
- Labels: `v14`, `breaking-change`, `api`
- Milestone: `Foundry v14 Readiness`
- Upstream:
  - https://github.com/foundryvtt/foundryvtt/issues/12976
- Acceptance criteria:
  - Reads and writes are compatible with v14 shape.
  - Defensive guards added and tested.

### 13) Add null-safety for `parseHTML` call sites
- Priority: `priority:medium`
- Labels: `v14`, `breaking-change`, `api`
- Milestone: `Foundry v14 Readiness`
- Upstream:
  - https://github.com/foundryvtt/foundryvtt/issues/13145
- Acceptance criteria:
  - All relevant call sites guard against `null`.
  - Unit tests include null parse scenario.

### 14) Re-test chat visibility mode assumptions for DnD workflows
- Priority: `priority:medium`
- Labels: `v14`, `breaking-change`, `dnd5e`
- Milestone: `Foundry v14 Readiness`
- Upstream:
  - https://github.com/foundryvtt/foundryvtt/issues/8856
- Acceptance criteria:
  - Chat-related outputs validated for GM and player visibility contexts.
  - Any limitations documented.

### 15) Execute and publish v14 DnD test matrix results
- Priority: `priority:high`
- Labels: `v14`, `testing`, `dnd5e`
- Milestone: `Foundry v14 Readiness`
- Scope:
  - Run the matrix from `docs/foundry-v14-compatibility-plan.md` with DnD focus first.
- Acceptance criteria:
  - Results table posted with pass/partial/blocked status.
  - Blocking defects linked to individual issues.

## C. Quality and Platform Issues (Needed to Ship Safely)

### 16) Convert DSA5 filter test file into real Vitest suite
- Priority: `priority:high`
- Labels: `testing`, `tooling`
- Milestone: `Quality and Stability`
- Scope:
  - Replace console-only test file with real assertions.
- Acceptance criteria:
  - At least one passing suite with multiple tests.
  - No "No test suite found" output.

### 17) Add CI quality gates for typecheck/test/build/audit
- Priority: `priority:high`
- Labels: `tooling`, `testing`, `security`
- Milestone: `Quality and Stability`
- Acceptance criteria:
  - PRs fail on typecheck/test/build failure.
  - `npm audit --workspaces --audit-level=high` integrated.

### 18) Execute safe dependency update batches (A/B/C)
- Priority: `priority:medium`
- Labels: `security`, `tooling`
- Milestone: `Quality and Stability`
- Scope:
  - Batch A: `@modelcontextprotocol/sdk`, `axios`
  - Batch B: `ws`, `winston`, `socket.io-client`
  - Batch C: `typescript`, `@types/node`
- Acceptance criteria:
  - Each batch passes typecheck/tests/build/schema smoke.
  - Changelog updated with notable changes.

## Optional GitHub Epic Structure

If you want project-level grouping, create 3 umbrella issues:

1. Epic: `DnD5e Character Write and Progression APIs`
2. Epic: `Foundry v14 Compatibility and Breaking Changes`
3. Epic: `Quality Gates and Safe Dependency Upgrades`

Then link Issues 1-9 under Epic 1, 10-15 under Epic 2, and 16-18 under Epic 3.

## Definition of Done (Backlog Level)

- DnD write/progression tools cover core GM workflows without manual Foundry edits.
- v14 blockers are tracked with explicit status and test evidence.
- CI and tests prevent regressions before metadata or release changes.
- `packages/foundry-module/module.json` remains pinned to v13 until v14 gate criteria pass.
