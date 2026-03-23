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
- `complete-dnd5e-level-up-workflow`
- `award-dnd5e-party-resources`
- `run-dnd5e-summon-activity`
- `organize-dnd5e-spellbook-workflow`

These should now be treated as the baseline pattern for future workflow work:

- preview
- validate
- apply
- verify
- report

## Next Phase

### Priority 1: Workflow Contract Hardening

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

### Priority 2: Complete DnD5e Multiclass Entry Workflow

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

### Priority 3: DnD5e Group Rest Workflow

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

### Priority 4: DnD5e Transform Activity Workflow

Proposed tool:

- `run-dnd5e-transform-activity-workflow`

Scope:

- execute a DnD5e Transform activity through the official activity model
- surface unresolved transform choices when needed
- report transformation outcome and actor/token consequences clearly

Why this is a workflow:

- Transform is an official activity type, not an invented MCP concept
- it is richer and more stateful than a simple actor update

### Priority 5: Cross-System Workflow Evaluation

Do not port DnD5e workflows blindly.

Before adding PF2e or DSA5 workflow tools, explicitly check:

1. whether the system has an equivalent documented workflow boundary
2. whether the operation can be expressed through public APIs
3. whether the result can be normalized without hiding system-specific meaning

The right output of this step may be:

- a new workflow tool for another system
- a decision to keep using primitives only
- a documented unsupported capability

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
