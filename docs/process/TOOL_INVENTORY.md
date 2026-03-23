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

- The backend currently registers a broad MCP tool surface across character,
  compendium, scene, creation, journal, ownership, token, dice, campaign, and
  map workflows.
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

- direct audited actor updates for stable actor fields
- typed resource updates for common bookkeeping such as HP and DnD5e hit dice
- system-aware ability score updates
- system-aware skill proficiency updates
- atomic batch embedded-item updates
- adding owned actor items from source UUIDs or raw item data
- updating owned actor item fields
- removing owned actor items
- DnD5e direct proficiency editing for languages, armor, weapons, tools, and saving throws
- DnD5e spell learning via spell UUID
- DnD5e spell prepare and unprepare
- DnD5e spell removal
- DnD5e spell slot and override updates
- DnD5e spell source-class reassignment for multiclass organization
- DnD5e bulk spell source-class reassignment
- DnD5e bulk prepared-spell management for rest-based spell changes
- DnD5e short-rest and long-rest workflow execution with optional post-rest spell preparation plans
- DnD5e spellbook validation for source-class, preparation-mode, and class-assignment issues
- creating or linking persistent character companions and familiars
- listing linked companions and familiars and whether they are already active on the scene
- summoning linked companions and familiars onto the active scene
- dismissing linked companion and familiar tokens from the active scene
- updating companion and familiar link metadata, sync settings, and summon defaults
- unlinking linked companions and familiars without deleting the actor
- deleting linked companions and familiars as an audited lifecycle workflow
- syncing linked companions and familiars from source templates, ownership, or owner-level data where supported
- creating world items from raw payloads or cloned item UUIDs
- updating world items with direct patch payloads
- creating item entries directly inside unlocked compendium packs
- importing world items into item compendium packs
- validating DnD5e character builds for level, spellbook, proficiency, and advancement issues
- applying scoped actor and owned-item patch transactions with rollback

## DnD5e Missing Endpoint Tracker

This section tracks capabilities needed for practical DnD5e character management.

### Priority 1: Foundation and High-Leverage Gameplay Writes

Priority 1 is complete in the current branch.

Implemented surfaces:

- `update-character`
- `update-character-resources`
- `set-character-ability-scores`
- `set-character-skill-proficiencies`
- `batch-update-character-items`
- `set-dnd5e-proficiencies`
- deeper `validate-dnd5e-spellbook`

Implementation notes:

- The system-specific write mapping for these tools now routes through adapter capabilities instead of growing new core-tool conditionals.
- DnD5e `Scale Value` remains intentionally informational/system-derived during advancement flows, consistent with the official DnD5e documentation that describes it as a no-choice advancement type.

### Priority 2: Lifecycle and Content Management

Priority 2 is complete in the current branch.

Implemented surfaces:

- `update-character-companion-link`
- `configure-character-companion-summon`
- `unlink-character-companion`
- `delete-character-companion`
- `sync-character-companion-progression`
- `create-world-item`
- `update-world-item`
- `create-compendium-item`
- `import-item-to-compendium`

Implementation notes:

- Companion and familiar lifecycle remains a general Foundry linked-actor workflow, not a replacement for system-native summon activities.
- Companion sync is intentionally configuration-driven: ownership sync, source refresh, and owner-level alignment where a stable level field exists.
- Item authoring uses the public Foundry document creation and update paths for world items and unlocked item compendium packs.

### Priority 3: Validation and Transaction Safety

Priority 3 is complete in the current branch.

Implemented surfaces:

- `validate-dnd5e-character-build`
- `apply-character-patch-transaction`

Implementation notes:

- `preview-character-progression` continues to satisfy the dry-run level-up requirement, so a separate `preview-dnd5e-level-up` tool remains unnecessary.
- `validate-dnd5e-character-build` checks class levels, spellbook integrity, supported proficiency ranges, and unresolved advancement steps against the current actor state.
- `apply-character-patch-transaction` is intentionally scoped to actor and owned-item mutations that can be validated up front and rolled back with captured snapshots if a later step fails.

## Next Direction: Higher-Level Rule-Aware Automation

The next phase should build workflow tools on top of the current primitive write layer,
not bypass it.

Architecture rules for this phase:

- Workflow tools should orchestrate existing validated primitives such as progression preview,
  advancement choice application, actor updates, item updates, and spellbook tools.
- Rule-heavy behavior should remain system-specific through adapter capabilities and module-side
  system services, not leak back into core tool routing.
- Every automation flow should follow a predictable lifecycle where possible:
  preview -> validate -> apply -> verify -> report
- Deterministic steps may auto-run, but ambiguous or invalid choices must still fail clearly and
  return actionable next steps.
- Prefer official Foundry and DnD5e workflow surfaces when they exist, especially document APIs,
  advancement-manager behavior, activity workflows, and documented hook points.

### Priority 4: Workflow Automation

1. `run-dnd5e-rest-workflow`

- Goal: Handle short-rest and long-rest bookkeeping as one MCP workflow.
- Scope:
  - prepared-spell refresh for rest-based casters
  - spell slot recovery
  - hit die and HP recovery handling
  - rest result summary and validation
- Why first:
  - The official DnD5e hooks expose `preShortRest`, `preLongRest`, `preRestCompleted`, and
    `restCompleted`, so this is a natural rule-aware workflow boundary rather than an invented one.
- Current state:
  - Implemented in the current branch.
  - The workflow delegates to the system rest API, returns before/after resource summaries, and can
    chain post-rest prepared-spell updates in the same MCP call.

2. `complete-dnd5e-level-up-workflow`

- Goal: Turn the current preview / options / apply / finalize primitives into one guided orchestration flow.
- Scope:
  - accept a structured set of advancement selections
  - auto-apply deterministic follow-up steps
  - stop only on unresolved or invalid choices
  - return a final applied-changes summary
- Why next:
  - The official DnD5e advancement hooks and manager lifecycle give us a stable completion boundary.
- Current state:
  - Implemented in the current branch.
  - The workflow composes the existing progression primitives, enriches unresolved steps with option data,
    auto-applies safe follow-up steps, and validates the finished DnD5e build after completion.

3. `award-dnd5e-party-resources`

- Goal: Automate the step between encounter/session outcomes and actor progression.
- Scope:
  - XP awards
  - currency awards
  - optional group-first distribution model
  - follow-up validation for level-up readiness
- Why next:
  - The official DnD5e award system already models XP and currency grants as first-class workflows.

4. `run-dnd5e-summon-activity`

- Goal: Bridge DnD5e summon activities into MCP as a rule-aware workflow instead of only generic linked companions.
- Scope:
  - summon profile selection
  - CR/type filtering or direct-link profile resolution
  - summon placement and result reporting
  - surfaced summon-specific choices where the activity allows them
- Why next:
  - The official DnD5e Summon activity is richer than our generic companion lifecycle and has its own
    profile, placement, and creature-modification model.

5. `organize-dnd5e-spellbook-workflow`

- Goal: Turn spell validation plus source-class/preparation tools into one cleanup workflow.
- Scope:
  - detect invalid class assignments
  - reassign spells where the target is unambiguous
  - report remaining ambiguous or illegal states
- Why later:
  - The primitives are already present, so this is mainly orchestration and safety logic.

## Gap Conclusion (DnD5e)

The repo now has the general actor and embedded-item write layer needed for practical gameplay editing.

DnD5e adds system-specific needs on top:

- advancement and class-level orchestration
- higher-level multiclass spellbook validation and automation beyond the current source-class reassignment, bulk preparation, and validation tools

The repo now has:

- generic actor updates
- typed resource updates
- ability score and skill proficiency writes
- batch embedded-item updates
- DnD5e direct proficiency editing
- practical DnD5e spell learning, single and bulk preparation changes, removal, slot updates, source-class reassignment, and spellbook validation
- multiclass add-class flow
- persistent companion and familiar lifecycle workflows including link updates, summon defaults, unlink, deletion, and sync operations
- world item and item-compendium authoring workflows
- DnD5e character build validation for classes, spellbook state, proficiencies, and unresolved advancements
- scoped actor and owned-item patch transactions with rollback for larger automated changes

The next most valuable gaps are now higher-level rule-aware automation on top of this foundation, not missing core write surfaces.

## Historical Archive

Older branch-comparison and migration-era inventory material has been moved out of this live planning file.

For that historical context, see:

- [TOOL_INVENTORY_HISTORICAL.md](../archive/TOOL_INVENTORY_HISTORICAL.md)
- [BRANCH_COMPARISON_SUMMARY.md](../archive/BRANCH_COMPARISON_SUMMARY.md)
- [MISSING_TOOLS.md](../archive/MISSING_TOOLS.md)
- [MIGRATION_PLAN.md](../archive/MIGRATION_PLAN.md)
- [IMPLEMENTATION_ORDER.md](../archive/IMPLEMENTATION_ORDER.md)
