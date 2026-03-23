# Workflow Roadmap

## Purpose

This is the live roadmap for the next phase of MCP work after the foundational
write surface and the first DnD5e workflow phase were completed.

Use this file to answer:

- when we should build a workflow tool instead of another primitive
- which workflow slices are the best next candidates
- what architectural rules should govern new workflow work

Related docs:

- [MCP_ADAPTER_ARCHITECTURE.md](./MCP_ADAPTER_ARCHITECTURE.md)
- [MCP_TOOL_CATALOG.md](./MCP_TOOL_CATALOG.md)

## Workflow Evaluation

### Why Workflow Tools Are Valuable

Workflow tools are a good fit when the target system already models a real
process rather than a single isolated mutation.

Advantages:

- They match the way users naturally ask for work to be done.
- They reduce bad intermediate states by owning the full process.
- They centralize validation, rollback, and reporting.
- They let MCP clients and LLMs do more useful work with fewer round trips.

### Where Workflow Tools Can Go Wrong

Workflow tools are not automatically better than primitives.

Disadvantages:

- They are heavier to design and test.
- They can become system-specific very quickly.
- They can hide reusable primitives if overused.
- They need more disciplined result contracts than single-purpose tools.

### Decision Rule

Use a workflow tool when:

1. The system has a real official workflow boundary.
2. The process spans multiple validated primitive operations.
3. The user would naturally think of it as one task.
4. The result can be reported in a stable, explicit way.

Keep a primitive tool when:

- the action is a direct read or write
- the operation is composable and low-risk on its own
- the workflow boundary is invented by us rather than by the system

## Documentation Signals We Should Follow

The official docs point to workflow-oriented MCP tools most strongly in DnD5e:

- Awards
- Advancement
- Activities
- Rest-related hooks
- Activity-specific flows such as Summon and Transform

References:

- Foundry public `Document` API:
  https://foundryvtt.com/api/v13/classes/foundry.abstract.Document.html
- DnD5e wiki home:
  https://github-wiki-see.page/m/foundryvtt/dnd5e/wiki
- DnD5e Hooks:
  https://github-wiki-see.page/m/foundryvtt/dnd5e/wiki/Hooks
- DnD5e Advancement:
  https://github-wiki-see.page/m/foundryvtt/dnd5e/wiki/Advancement
- DnD5e Activities:
  https://github-wiki-see.page/m/foundryvtt/dnd5e/wiki/Activities
- DnD5e Awards:
  https://github-wiki-see.page/m/foundryvtt/dnd5e/wiki/Awards
- DnD5e Summon activity:
  https://github-wiki-see.page/m/foundryvtt/dnd5e/wiki/Activity-Type-Summon
- DnD5e Transform activity:
  https://github-wiki-see.page/m/foundryvtt/dnd5e/wiki/Activity-Type-Transform

## Completed Workflow Baseline

The repo already has a solid first workflow phase:

- `run-dnd5e-rest-workflow`
- `run-dnd5e-group-rest-workflow`
- `complete-dnd5e-level-up-workflow`
- `complete-dnd5e-multiclass-entry-workflow`
- `award-dnd5e-party-resources`
- `run-dnd5e-summon-activity`
- `run-dnd5e-transform-activity-workflow`
- `organize-dnd5e-spellbook-workflow`

These should now be treated as the baseline pattern for future workflow work:

- preview
- validate
- apply
- verify
- report

## Next Phase

### Priority 1: Workflow Contract Hardening (Completed)

Before we keep expanding the workflow surface too far, keep the result shape
disciplined.

Scope:

- normalize workflow result envelopes
- keep field naming consistent across workflow tools
- standardize reporting for warnings, unresolved choices, verification, and
  auto-applied steps

Why first:

- this improves every future workflow tool
- it reduces MCP client complexity
- it keeps LLM behavior more predictable

Completed in the current baseline:

- shared `workflow` metadata on the baseline DnD5e workflow tools
- consistent `workflowStatus` coverage across the baseline workflow tools
- normalized `verification` reporting where workflows perform build or state
  validation
- normalized `unresolved` reporting where workflows stop on remaining choices or
  review-required states
- explicit `autoApplied` reporting where workflows safely applied deterministic
  steps

### Priority 2: Complete DnD5e Multiclass Entry Workflow (Completed)

Proposed tool:

- `complete-dnd5e-multiclass-entry-workflow`

Scope:

- resolve the class to add
- create the owned class item
- run the initial level-up or advancement flow for that class
- handle required choices or stop with guided next-step data
- reconcile multiclass spellbook state
- validate and report the final build

Why this is next:

- it is the most direct extension of the current progression work
- it maps closely to the original MCP character-progression goal
- the repo already has most of the needed primitives

Completed in the current baseline:

- `complete-dnd5e-multiclass-entry-workflow` now handles initial class creation
  or safe resume via `classIdentifier`
- it composes class creation, initial level-up progression, multiclass spellbook
  organization, and final build validation under one workflow contract
- unresolved advancement choices now stop with resumable guidance instead of
  forcing the caller to rediscover the owned class item state

### Priority 3: DnD5e Group Rest Workflow (Completed)

Proposed tool:

- `run-dnd5e-group-rest-workflow`

Scope:

- identify the group or party target
- execute rest handling across the group
- reconcile per-actor rest outcomes
- return a structured summary for the full party

Why this belongs here:

- DnD5e hooks explicitly mention group-rest completion boundaries
- it fits the same "bookkeeping workflow" family as party awards

Completed in the current baseline:

- `run-dnd5e-group-rest-workflow` now orchestrates the existing
  single-character DnD5e rest workflow across either the primary party target
  or an explicit actor list
- it returns a normalized party-level workflow result with per-actor outcomes,
  partial-failure reporting, aggregate verification, and post-rest spell
  preparation support per actor
- it stays aligned with the documented DnD5e workflow boundary without
  inventing an undocumented headless group-rest API

### Priority 4: DnD5e Transform Activity Workflow (Completed)

Proposed tool:

- `run-dnd5e-transform-activity-workflow`

Scope:

- execute a DnD5e Transform activity through the official activity model
- surface unresolved transform choices when needed
- report transformation outcome and actor/token consequences clearly

Why this is a workflow:

- Transform is an official activity type, not an invented MCP concept
- it is richer and more stateful than a simple actor update

Completed in the current baseline:

- `run-dnd5e-transform-activity-workflow` now executes a DnD5e transform
  activity from an owned item through the public activity API
- it surfaces unresolved activity selection cleanly when an item exposes more
  than one transform activity
- it captures source actor and transformed actor details using the documented
  DnD5e activity and transform hooks, and reports token consequences when the
  workflow surfaces them

### Priority 5: Cross-System Workflow Evaluation (Completed)

Do not port DnD5e workflows blindly.

Evaluation questions:

1. Does the system have an equivalent documented workflow boundary?
2. Can the operation be expressed through public APIs?
3. Can the result be normalized without hiding system-specific meaning?

Cross-system conclusion:

- PF2e should stay primitive-first for now.
  The official PF2e docs strongly emphasize rule-element driven automation such
  as `ChoiceSet`, `GrantItem`, and `Battle Form`, which is a different
  architecture from DnD5e's explicit activity, awards, and rest workflow
  surfaces. That suggests targeted adapter helpers and primitive orchestration
  are the safer design, not DnD5e-style workflow tools by default.
- DSA5 should also stay primitive-first for now.
  The official Foundry package and public project material highlight broad
  system automation features, but they do not expose documented public workflow
  boundaries comparable to DnD5e's activity and rest hooks. Until the system's
  public docs or repo expose stable workflow APIs, MCP should prefer narrow
  primitives and explicit unsupported-capability behavior over invented
  high-level workflows.
- DnD5e remains the only system in this repo with strong official evidence for
  a broader workflow layer.

Recommended direction after the evaluation:

- continue adding DnD5e workflows only where the official activity or hook model
  provides a clear system boundary
- for PF2e, improve rule-aware primitive orchestration instead of adding broad
  workflow wrappers
- for DSA5, focus on adapter completeness and stable low-level writes until a
  documented workflow surface is available

Sources considered for this evaluation:

- Foundry public `Document` API:
  https://foundryvtt.com/api/v13/classes/foundry.abstract.Document.html
- DnD5e wiki home:
  https://github-wiki-see.page/m/foundryvtt/dnd5e/wiki
- DnD5e Hooks:
  https://github-wiki-see.page/m/foundryvtt/dnd5e/wiki/Hooks
- PF2e GM's Starter Guide:
  https://github.com/foundryvtt/pf2e/wiki/GM%27s-Starter-Guide
- PF2e Quickstart guide for rule elements:
  https://github.com/foundryvtt/pf2e/wiki/Quickstart-guide-for-rule-elements
- DSA5 package ecosystem pages on Foundry:
  https://foundryvtt.com/packages/dsa5-introduction

## Things We Should Avoid

Do not build workflow tools for:

- generic reads like character or compendium lookup
- simple scene or token CRUD
- world-item authoring
- direct patch/update helpers that already work well as primitives

Those should remain narrow, composable tools.

## Exit Criteria For New Workflow Work

For any new workflow tool, require:

1. A documented system boundary or official source rationale.
2. A stable request schema.
3. A stable result envelope.
4. Focused contract tests.
5. Clear unsupported or unresolved-choice behavior.

## Maintenance Note

This file is now the live next-phase plan.

If a workflow phase becomes mostly complete, do not grow this file into another
monolithic inventory. Instead:

- move the completed phase summary into the catalog or an archive snapshot
- keep this roadmap focused on active next work
