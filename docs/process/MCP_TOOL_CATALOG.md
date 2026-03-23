# MCP Tool Catalog

## Purpose

This is the live catalog of the MCP tool surface exposed by the current repo.

Use this file to answer:

- what tools already exist
- which tools are generic Foundry tools versus DnD5e-specific tools
- which tools are low-level primitives versus higher-level workflows

Architecture source of truth:

- [MCP_ADAPTER_ARCHITECTURE.md](./MCP_ADAPTER_ARCHITECTURE.md)
- [../NOTICE.md](../../NOTICE.md)
- [TECHNICAL_IDENTITY_PLAN.md](./TECHNICAL_IDENTITY_PLAN.md)

## Reading Guide

### Primitive Tools

Primitive tools are the building blocks:

- read/query operations
- direct actor or embedded-item writes
- validation helpers
- narrow single-purpose mutations

These should stay predictable, composable, and reusable by higher-level tools.

### Workflow Tools

Workflow tools orchestrate multiple primitives into a documented system process:

- preview
- validate
- apply
- verify
- report

We should only introduce workflow tools when the target system already has a
real workflow boundary, such as advancement, awards, rest, summon, or activity
execution.

### Scope Labels

- `General Foundry`: generic MCP tools that should remain useful outside DnD5e
- `DnD5e-specific`: system-aware tools that rely on DnD5e semantics

## Current Surface

### General Foundry Read And Query

- `get-character`
- `get-character-entity`
- `list-characters`
- `search-character-items`
- `search-compendium`
- `get-compendium-item`
- `list-creatures-by-criteria`
- `list-compendium-packs`
- `get-current-scene`
- `get-world-info`
- `get-token-details`
- `get-available-conditions`

### General Foundry Primitive Writes

- `use-item`
- `update-character`
- `update-character-resources`
- `set-character-ability-scores`
- `set-character-skill-proficiencies`
- `batch-update-character-items`
- `apply-character-patch-transaction`
- `add-character-item`
- `update-character-item`
- `remove-character-item`
- `create-world-item`
- `update-world-item`
- `create-compendium-item`
- `import-item-to-compendium`
- `move-token`
- `update-token`
- `delete-tokens`
- `toggle-token-condition`

### General Foundry Linked-Actor Lifecycle

These are generic linked-actor workflows even if "companion" and "familiar"
sound DnD-flavored.

- `create-character-companion`
- `list-character-companions`
- `summon-character-companion`
- `dismiss-character-companion`
- `update-character-companion-link`
- `configure-character-companion-summon`
- `unlink-character-companion`
- `delete-character-companion`
- `sync-character-companion-progression`

### DnD5e Primitive Character Management

- `add-dnd5e-class-to-character`
- `learn-dnd5e-spell`
- `prepare-dnd5e-spell`
- `forget-dnd5e-spell`
- `set-dnd5e-spell-slots`
- `set-dnd5e-proficiencies`
- `reassign-dnd5e-spell-source-class`
- `bulk-reassign-dnd5e-spell-source-class`
- `set-dnd5e-prepared-spells`
- `validate-dnd5e-spellbook`
- `validate-dnd5e-character-build`

### DnD5e Primitive Progression Tools

- `preview-character-progression`
- `get-character-advancement-options`
- `apply-character-advancement-choice`
- `update-character-progression`

These remain valuable even though higher-level workflows exist, because they
allow controlled step-by-step orchestration when choices are ambiguous or when
an MCP client wants fine-grained control.

## Workflow Tools

### DnD5e Workflow Tools

- `run-dnd5e-rest-workflow`
- `run-dnd5e-group-rest-workflow`
- `complete-dnd5e-level-up-workflow`
- `complete-dnd5e-multiclass-entry-workflow`
- `award-dnd5e-party-resources`
- `run-dnd5e-summon-activity`
- `run-dnd5e-transform-activity-workflow`
- `organize-dnd5e-spellbook-workflow`

## Catalog Notes

### What This Catalog Is Not

This file is not the implementation roadmap.

Use [WORKFLOW_ROADMAP.md](./WORKFLOW_ROADMAP.md) for what we should build next.

### Tool Design Rule

Prefer primitives by default.

Add a workflow tool only when all of the following are true:

1. The system already has a real workflow boundary.
2. The workflow meaningfully reduces invalid intermediate states.
3. The workflow can return a predictable result envelope.
4. The workflow still composes cleanly with the primitive layer.

### Current Direction

The repo now has enough primitives that most new value should come from:

- workflow completeness
- rule-aware orchestration
- better result normalization

not from adding large numbers of new low-level write tools by default.
