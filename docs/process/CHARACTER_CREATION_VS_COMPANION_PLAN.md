# Character Creation vs Companion Linking Plan

## Summary

The current MCP workflow made it too easy to use companion-link tooling for standalone character creation requests. This created semantic mismatch:

- User intent: create independent characters (PC/NPC actors)
- Executed path: create companion links tied to an owner actor

This plan introduces a clear architectural separation between:

1. Standalone actor creation workflows
2. Companion/familiar link workflows

The goal is to make tool intent explicit and enforce correct behavior in code, schema, and runtime validation.

## Problem Statement

Current `create-character-companion` behavior is correct for linked companions, but it was used for generic character creation because no first-class standalone creation workflow existed in the same MCP experience.

Observed mismatch:

- Names included target level/class text
- Actor class template was cloned
- Actual DnD5e class progression was not applied to target levels
- Actors were linked as companions to an owner character, which was not requested

## Goals

- Add a first-class standalone character creation workflow for world actors.
- Preserve companion/familiar functionality without changing semantics.
- Ensure DnD5e target level requests invoke progression workflow, not display-name hacks.
- Make misuse difficult through schema design, naming, and validation.

## Non-Goals

- Replacing existing companion features.
- Building a full arbitrary actor builder from raw stats in this phase.
- Cross-system deep progression parity in the first iteration.

## Design Principles

- Intent-first APIs: tool names and required fields must encode intent.
- Safe defaults: no implicit linking to owners unless explicitly requested.
- Composition over coupling: character creation may call progression workflows, but companion service remains independent.
- Backward compatibility: existing `create-character-companion` remains functional.

## Proposed Tool/API Surface

### Keep (unchanged semantics)

- `create-character-companion`
- `update-character-companion-link`
- `sync-character-companion-progression`

### Add

1. `create-character-actor`

Purpose: create standalone world actor (not linked)

Request (initial shape):

- `sourceUuid` (required in phase 1)
- `customName` (optional)
- `actorType` (optional validation hint)
- `addToScene` + placement options (optional)
- `metadata` (optional, e.g. tags/notes)

Response:

- actor identity and placement result
- explicit `linked: false`

2. `create-dnd5e-character-workflow`

Purpose: create standalone DnD5e character from template and set target class level correctly

Request:

- `sourceUuid` (starter template/classed template)
- `customName`
- `targetLevel` (required)
- `classIdentifier` (optional but recommended)
- `advancementSelections` (optional)
- `biography` (optional)
- `addToScene` (optional)

Response:

- creation result
- progression workflow status
- unresolved advancement steps if choices are needed
- verification payload from build validation

## Architecture Changes by Package

### 1) shared

File: `shared/src/foundry-types.ts`

Add request/response contracts for:

- `FoundryCreateCharacterActorRequest/Response`
- `FoundryCreateDnD5eCharacterWorkflowRequest/Response`

Important:

- Do not add `targetLevel` to `FoundryCreateCharacterCompanionRequest`.
- Keep companion contract focused on linking/summon metadata.

### 2) foundry-module

Files:

- `packages/foundry-module/src/queries.ts`
- `packages/foundry-module/src/foundry-module-facade.ts`
- `packages/foundry-module/src/services/` (new `actor-creation-service.ts` or extension of existing creation logic)

Add bridge handlers:

- `maeinomatic-foundry-mcp.createCharacterActor`
- `maeinomatic-foundry-mcp.createDnD5eCharacterWorkflow`

Implementation notes:

- Reuse existing compendium actor clone path used by companion creation, but return standalone actor and skip link metadata.
- For DnD5e workflow:
  1. Create standalone actor
  2. Invoke existing progression preview/update workflow for `targetLevel`
  3. Return unresolved advancements if required
  4. Apply optional biography patch

### 3) mcp-server

File: `packages/mcp-server/src/tools/character.ts`

Add MCP tools with clear descriptions emphasizing standalone creation.

Handlers:

- `handleCreateCharacterActor`
- `handleCreateDnD5eCharacterWorkflow`

Key safeguards:

- Reject owner/link fields for standalone creation tools.
- Reject companion-only fields (`role`, `syncOwnership`, etc.) in standalone tools.
- Enforce `targetLevel` for DnD5e workflow tool.

File: `packages/mcp-server/src/backend.ts`

- Register new tool routes and dispatch cases.

## Behavioral Guardrails

1. Tool description hardening

- Update `create-character-companion` description to begin with: "Link a companion/familiar actor to an owner character".
- Include warning: "Not for standalone character/NPC creation".

2. Runtime warning for suspicious calls

In companion creation path, emit warning if:

- `customName` contains pattern like `Level <n>`
- and no summon/link semantics are present in notes/intent metadata

(Warning only, no hard failure in first release.)

3. Agent-facing docs

- Update tool catalog and workflow docs with decision tree:
  - standalone actor => new standalone creation tool
  - linked familiar/companion => companion tool

## Migration and Compatibility

- No breaking changes to companion APIs.
- Existing clients continue to use companion endpoints unchanged.
- New tools are additive.
- Optional future deprecation warning in docs for misusing companion path for standalone creation.

## Test Plan

### Unit tests

`packages/mcp-server/src/tools/character.test.ts`

- New schemas validate required/forbidden fields correctly.
- Standalone tool does not accept companion-only fields.
- DnD5e workflow requires `targetLevel`.

`packages/foundry-module/src/...` service tests

- Standalone creation does not write companion flags.
- DnD5e workflow applies progression and returns unresolved steps when needed.

### Integration tests

- Create standalone actor from compendium and verify appears in actor directory unlinked.
- Create DnD5e actor with target level > 1 and verify class item level/progression reflects target level.
- Verify companion creation still links properly and remains owner-scoped.

## Rollout Plan

1. Phase A: Type contracts + bridge plumbing
2. Phase B: Standalone creation tool
3. Phase C: DnD5e creation workflow tool
4. Phase D: Docs + warnings + test hardening

## Acceptance Criteria

- "Create 5 NPCs level 1..5" can be fulfilled without creating companion links.
- Generated actors are standalone by default.
- DnD5e class level is mechanically correct (not name-only).
- Companion workflow remains dedicated to linked companions/familiars.
- Tool descriptions and docs make wrong-path usage unlikely.

## Open Questions

1. Should standalone creation support raw actor data in v1 or remain template-first?
2. Should `create-dnd5e-character-workflow` auto-handle unresolved advancement choices using safe defaults, or always require explicit selections when ambiguity exists?
3. Should we introduce a generic `create-actor` tool across systems and keep system-specific wrappers as convenience workflows?
