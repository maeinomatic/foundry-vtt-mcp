# Foundry Typing Plan

This file tracks the remaining typing work for the MCP server's Foundry-facing
code.

Status: active
Baseline target: Foundry v13 stable
Compatibility goal: stay tolerant of Foundry v14+ changes by typing only the
documented public subset we actually use
Last reviewed: 2026-03-22

## Typing Policy

Use `unknown` at the external boundary only:

- WebRTC/socket transport payloads
- Foundry bridge messages
- raw `foundryClient.query(...)` ingress before normalization

Do not let `unknown` leak through core tools, adapters, or shared logic once the
data shape is known.

Preferred pattern:

1. Receive raw data as `unknown`.
2. Validate or normalize immediately into repo-owned Foundry base types.
3. Let core tools depend on those stable base types.
4. Let system adapters narrow further into system-specific `system` data.

## Goals

1. Improve internal type safety without overfitting to private Foundry internals.
2. Keep v13 behavior stable.
3. Minimize v14 breakage by typing documented public concepts and using optional
   fields where versions may differ.
4. Keep system-specific semantics inside adapters, not core tools.

## Remaining Work

### Phase 1: Shared Foundry Base Types

- Create a shared base-types module for:
  - world info
  - actor documents
  - item documents
  - active effects
  - compendium pack summaries
  - compendium document summaries/details
  - common public `system` fragments we actually use
- Replace duplicated tool-local shapes in:
  - `packages/mcp-server/src/tools/character.ts`
  - `packages/mcp-server/src/tools/compendium.ts`
  - `packages/mcp-server/src/tools/actor-creation.ts`

### Phase 2: Typed Client and Bridge Boundary

- Make `FoundryClient.query<T>()` generic and use it consistently.
- Add typed result models for the bridge methods we rely on most:
  - `foundry-mcp-bridge.getWorldInfo`
  - `foundry-mcp-bridge.getCharacterInfo`
  - `foundry-mcp-bridge.listActors`
  - `foundry-mcp-bridge.searchCompendium`
  - `foundry-mcp-bridge.getCompendiumDocumentFull`
  - `foundry-mcp-bridge.listCreaturesByCriteria`
  - `foundry-mcp-bridge.getAvailablePacks`
- Reduce ad hoc `as Record<string, unknown>` parsing in:
  - `packages/mcp-server/src/foundry-client.ts`
  - `packages/mcp-server/src/foundry-connector.ts`
  - `packages/mcp-server/src/backend.ts`

### Phase 3: Adapter Contract Typing

- Replace generic `unknown` inputs in `packages/mcp-server/src/systems/types.ts`
  with shared Foundry base document types where possible.
- Update the three active adapters to accept typed base Foundry shapes:
  - `packages/mcp-server/src/systems/dnd5e/adapter.ts`
  - `packages/mcp-server/src/systems/pf2e/adapter.ts`
  - `packages/mcp-server/src/systems/dsa5/adapter.ts`
- Keep action/spellcasting helper inputs flexible until we have stable shared
  DTOs for those bridge-specific payloads.

### Phase 4: System-Specific Typing

- Add typed `system` payload overlays for:
  - D&D 5e
  - PF2e
  - DSA5
- Move adapter internals away from repeated `asRecord/getNestedValue`
  navigation when a typed field path is stable enough to justify it.
- Keep version-sensitive or weakly documented areas optional and adapter-local.

### Phase 5: Validation and Tests

- Add contract tests for typed adapter formatting paths.
- Add tests for explicit unsupported-system and unsupported-capability behavior.
- Run on every typing slice:
  - `npm run build`
  - `npm -w @foundry-mcp/server test -- --run`
  - `npm run test:mcp:schema`

## Priority File List

Highest value next:

- `packages/mcp-server/src/foundry-client.ts`
- `packages/mcp-server/src/systems/types.ts`
- `packages/mcp-server/src/tools/character.ts`
- `packages/mcp-server/src/tools/compendium.ts`

Then:

- `packages/mcp-server/src/foundry-connector.ts`
- `packages/mcp-server/src/backend.ts`
- `packages/mcp-server/src/tools/actor-creation.ts`
- `packages/mcp-server/src/systems/dsa5/character-creator.ts`

## Guardrails

- Do not type against private or underscore-prefixed Foundry internals.
- Do not turn the core layer into a system-specific type graveyard.
- Prefer small, well-named DTOs over one giant guessed Foundry interface.
- If a field is not stable across versions or systems, keep it optional and
  adapter-owned.
