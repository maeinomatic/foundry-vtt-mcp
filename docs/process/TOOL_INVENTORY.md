# Complete MCP Tool Inventory

## Architecture Alignment

When adding or changing tools described in this inventory, follow:

- [MCP_ADAPTER_ARCHITECTURE.md](MCP_ADAPTER_ARCHITECTURE.md)

Interpretation rule for this inventory:

- Missing capabilities should be implemented through adapter capabilities and
  registry routing, not by adding system-specific branching in core tool files.

## Current Status Audit (2026-03-23)

This file is the live planning and gap-tracking document for the current repo state.

Current code reality in `packages/mcp-server/src/backend.ts`:

- The backend currently registers **41 tools**.
- Token manipulation tools are implemented and routed.
- DnD5e class progression, multiclass add-class flow, spellbook management, and companion/familiar workflows are implemented.

### DnD5e Relevance Check

For DnD5e gameplay, the current toolset is strong for:

- read/query (characters, entities, compendium data)
- scene and token operations
- creating actors from existing compendium entries
- using existing items and spells

For DnD5e character progression, the current toolset now supports:

- previewing class level-up steps
- listing concrete advancement options for pending steps
- applying advancement choices for ASI/feat, subclass, hit points, item choice, item grant, trait, and supported size selections
- finalizing class level updates after required advancement steps are complete
- auto-applying deterministic item-grant and size follow-up steps
- adding a new class item to a character for multiclass entry, then running the initial level-up flow for that class

For broader character management, the current toolset now supports:

- adding owned actor items from source UUIDs or raw item data
- updating owned actor item fields
- removing owned actor items
- DnD5e spell learning via spell UUID
- DnD5e spell prepare and unprepare
- DnD5e spell removal
- DnD5e spell slot and override updates
- DnD5e spell source-class reassignment for multiclass organization
- DnD5e bulk spell source-class reassignment
- DnD5e bulk prepared-spell management for rest-based spell changes
- DnD5e spellbook validation for missing or unknown source-class assignments
- creating or linking persistent character companions and familiars
- listing linked companions and familiars and whether they are already active on the scene
- summoning linked companions and familiars onto the active scene
- dismissing linked companion and familiar tokens from the active scene

## DnD5e Missing Endpoint Tracker

This section tracks capabilities needed for practical DnD5e character management.

### Priority A: Core Character Write APIs (system-agnostic)

1. `update-actor`

- Purpose: General actor updates such as name, biography, profile, notes, and stable core system fields.
- Why needed: Enables character description updates and many basic edits that still require ad hoc actor manipulation today.

2. `update-actor-resources`

- Purpose: Safe updates for HP, temp HP, hit dice, exhaustion, death saves, and currency.
- Why needed: Frequent gameplay bookkeeping with guarded update semantics.

3. `set-actor-ability-scores`

- Purpose: Update STR/DEX/CON/INT/WIS/CHA base values.
- Why needed: Character rebuild and correction workflows still need a direct write surface.

4. `set-actor-skill-proficiencies`

- Purpose: Set skill proficiency and expertise states.
- Why needed: Background, class progression, and retraining support.

### Priority A: Actor Item Management (system-agnostic surface)

1. `batch-update-actor-items`

- Purpose: Atomic multi-item update for safe complex changes.
- Why needed: Level-up and rebuild steps often touch multiple embedded documents.

### Priority A: DnD5e Leveling and Advancement

1. `dnd5e-set-proficiencies`

- Purpose: Manage weapon, armor, tool, language, and saving throw proficiencies.
- Why needed: Trait advancements now cover supported DnD5e progression steps, but direct proficiency editing outside advancement is still missing.

2. `dnd5e-handle-scale-advancement`

- Purpose: Keep Scale Value surfaced consistently as informational and system-derived during advancement flows.
- Why needed: Official DnD5e docs indicate Scale Value has no player choice payload, so this is a consistency and documentation concern more than a missing manual write path.

### Priority B: DnD5e Spell Management

1. `dnd5e-spell-validation`

- Purpose: Deeper validation of learned and prepared spell state against class progression and available spellcasting context beyond the current source-class organization checks.

### Priority B: Companion and Familiar Lifecycle

1. `update-character-companion-link`

- Purpose: Update role metadata, notes, summon defaults, and ownership-sync settings for an existing linked companion or familiar.
- Why needed: The current workflow creates the link cleanly, but there is no first-class way to manage that relationship afterward.

2. `unlink-character-companion`

- Purpose: Remove the persistent owner-companion link without necessarily deleting the actor.
- Why needed: Lets GMs retire or repurpose companions cleanly instead of treating them as permanent once linked.

3. `delete-character-companion`

- Purpose: Delete a linked companion actor and optionally dismiss its scene tokens as one audited workflow.
- Why needed: Completes the lifecycle; right now we can dismiss tokens but not fully remove an obsolete linked companion.

4. `configure-character-companion-summon`

- Purpose: Save preferred summon placement, hidden-state defaults, and reuse behavior per linked companion.
- Why needed: Reduces repeated prompt and tool friction for frequently summoned familiars and companions.

5. `sync-character-companion-progression`

- Purpose: Keep a linked companion or familiar aligned with owner-driven scaling rules, ownership changes, or template refreshes.
- Why needed: Important for systems or tables where companions level, rescale, or inherit state from the owner over time.

### Priority B: Item Authoring and Homebrew

1. `create-world-item`

- Purpose: Create a world item from payload such as weapon, spell, feat, armor, or consumable.

2. `update-world-item`

- Purpose: Modify existing world item and homebrew entries.

3. `create-compendium-item`

- Purpose: Create an item directly in a compendium pack.

4. `import-item-to-compendium`

- Purpose: Promote a world or homebrew item into a compendium.

### Priority C: Validation and Rule Guardrails

1. `validate-dnd5e-character-build`

- Purpose: Validate class levels, spell eligibility, proficiency constraints, and advancement completeness.

2. `preview-dnd5e-level-up`

- Purpose: Dry-run before mutations and return a diff of proposed changes.
- Current state: Covered by `preview-character-progression`; keep this as a conceptual requirement rather than a missing tool name.

3. `apply-character-patch-transaction`

- Purpose: Transactional patch with rollback for multi-step updates.

## Gap Conclusion (DnD5e)

Not a DnD5e-only problem. The core missing layer is still **actor and embedded-item write operations** in general.

DnD5e adds system-specific needs on top:

- advancement and class-level orchestration
- proficiency and ruleset editing outside advancement
- higher-level multiclass spellbook validation and automation beyond the current source-class reassignment, bulk preparation, and validation tools
- richer companion and familiar lifecycle support such as link management, summon customization, deletion and unlink flows, and progression sync

The repo now has the generic actor item CRUD layer plus practical DnD5e spell learning, single and bulk preparation changes, removal, slot updates, single and bulk source-class reassignment, spellbook validation, multiclass add-class flow, and persistent companion and familiar summon-despawn workflows.

The next most valuable gaps are `update-actor`, proficiencies, deeper spellbook validation and automation tied to class progression limits, and richer companion and familiar lifecycle tools.

## Historical Archive

Older branch-comparison and migration-era inventory material has been moved out of this live planning file.

For that historical context, see:

- [TOOL_INVENTORY_HISTORICAL.md](../archive/TOOL_INVENTORY_HISTORICAL.md)
- [BRANCH_COMPARISON_SUMMARY.md](../archive/BRANCH_COMPARISON_SUMMARY.md)
- [MISSING_TOOLS.md](../archive/MISSING_TOOLS.md)
- [MIGRATION_PLAN.md](../archive/MIGRATION_PLAN.md)
- [IMPLEMENTATION_ORDER.md](../archive/IMPLEMENTATION_ORDER.md)
