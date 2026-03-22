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

## Current State

Completed foundation work:

- Shared Foundry DTOs now exist in `shared/src/foundry-types.ts`.
- The Foundry module and MCP server both consume the shared DTO layer.
- `FoundryClient.query(...)` is generic, and the highest-value bridge methods are
  now moving toward method-specific request/response typing.
- The adapter contract is already typed against Foundry base documents and
  system overlays instead of loose `unknown` inputs.
- The Foundry module side has been decomposed into a facade + service +
  strategy structure, which gives us a cleaner place to keep typed boundaries.

This means the remaining work is no longer "create the typing foundation." The
remaining work is "finish adopting the shared contract consistently and prove it
with tests."

## Remaining Work

### Phase 1: Shared Contract Adoption

- Remove remaining MCP-tool-local DTO copies where a shared bridge DTO already
  exists.
- Prefer shared request/response models for these bridge methods first:
  - `foundry-mcp-bridge.getCharacterInfo`
  - `foundry-mcp-bridge.searchCharacterItems`
  - `foundry-mcp-bridge.searchCompendium`
  - `foundry-mcp-bridge.listCreaturesByCriteria`
  - `foundry-mcp-bridge.getCompendiumDocumentFull`
  - `foundry-mcp-bridge.getAvailablePacks`
- Keep full compendium entry DTOs and lightweight search DTOs distinct. Do not
  collapse them into one giant "compendium entity" type.

### Phase 2: MCP Client Boundary Hardening

- Add method-specific typing at the `FoundryClient` boundary for the bridge
  methods we rely on most.
- Reduce unnecessary explicit generic arguments in tool code when the method
  name alone can provide the request/response type.
- Continue shrinking ad hoc `Record<string, unknown>` parsing in:
  - `packages/mcp-server/src/foundry-client.ts`
  - `packages/mcp-server/src/foundry-connector.ts`
  - `packages/mcp-server/src/backend.ts`

### Phase 3: Tool and Adapter Cleanup

- Continue replacing tool-local result models in:
  - `packages/mcp-server/src/tools/character.ts`
  - `packages/mcp-server/src/tools/compendium.ts`
  - `packages/mcp-server/src/tools/actor-creation.ts`
- Keep adapter inputs aligned with the richer bridge payloads the tools already
  pass around, especially character info and compendium creature formatting.
- Keep system-specific semantics adapter-owned even when improving typings.

### Phase 4: Contract Tests

- Add contract tests around the shared module/server boundary for:
  - character info
  - character item search
  - compendium search
  - full compendium entry fetch
  - creature criteria search envelopes
- Add tests for explicit unsupported-system and unsupported-capability behavior.

### Phase 5: Ongoing Validation

Run on every typing slice:

- `npm run lint:strict`
- `npm run typecheck`
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

- `packages/mcp-server/src/tools/actor-creation.ts`
- `packages/mcp-server/src/foundry-connector.ts`
- `packages/mcp-server/src/backend.ts`
- contract tests spanning `packages/foundry-module` and `packages/mcp-server`

## Guardrails

- Do not type against private or underscore-prefixed Foundry internals.
- Do not turn the core layer into a system-specific type graveyard.
- Prefer small, well-named DTOs over one giant guessed Foundry interface.
- If a field is not stable across versions or systems, keep it optional and
  adapter-owned.
