# Architecture Refactor Orchestration Plan

## Purpose

This document turns the architectural direction for this repository into a
practical refactor sequence.

It is not a request for a full rewrite. The goal is to preserve working
behavior, reduce architectural risk in the highest-pressure files, and improve
the codebase in small, reviewable steps.

This plan assumes the current package split remains in place:

- `shared`
- `packages/mcp-server`
- `packages/foundry-module`

## Source Of Truth

Related documents:

- [MCP_ADAPTER_ARCHITECTURE.md](./MCP_ADAPTER_ARCHITECTURE.md)
- [FOUNDRY_MODULE_SERVICE_STRUCTURE.md](./FOUNDRY_MODULE_SERVICE_STRUCTURE.md)
- [WORKFLOW_ROADMAP.md](./WORKFLOW_ROADMAP.md)
- [MAINTENANCE_ROADMAP.md](./MAINTENANCE_ROADMAP.md)
- [../../Claude.md](../../Claude.md)

## Core Decision

Keep the monorepo and the package boundaries.

Refactor internal structure toward:

1. thin entrypoints
2. domain-sliced orchestration
3. centralized system resolution
4. explicit adapter boundaries
5. shared contracts with clear ownership

## Problems This Plan Targets

The current architecture is already pointed in the right direction, but a few
files carry too many responsibilities and create unnecessary bug surface.

Primary hotspots:

1. `packages/mcp-server/src/backend.ts`
2. `packages/mcp-server/src/tools/character.ts`
3. `packages/mcp-server/src/tools/compendium.ts`
4. `packages/foundry-module/src/queries.ts`

Common failure pattern behind these hotspots:

- orchestration and domain logic are mixed together
- runtime/system resolution is too close to individual tools
- workflow logic grows inside giant files instead of domain modules
- transport concerns leak into business logic

## Architectural Guardrails

These guardrails apply to every refactor step.

1. No broad rewrite branch.
2. No package boundary collapse.
3. No new system-specific branches in core utility files.
4. No DSA5 logic outside adapter-specific areas.
5. Keep runtime behavior compatible unless a bug fix is explicitly intended.
6. Prefer extraction and relocation over redesigning public contracts.
7. Each PR must leave the codebase in a buildable and testable state.

## Non-Goals

This plan does not aim to:

1. migrate the runtime to a new build tool
2. replace the monorepo with separate repositories
3. introduce a heavy dependency-injection framework
4. redesign every tool contract at once
5. complete DSA5 feature work before core seams are stabilized

## Target Shape

The target structure is conceptually:

```text
packages/
  mcp-server/
    src/
      app/
        bootstrap.ts
        runtime.ts
        dependency-container.ts
      transport/
        mcp-tool-router.ts
        foundry-query-client.ts
        control-socket-server.ts
      capabilities/
        tool-registry.ts
        tool-definitions.ts
      domains/
        characters/
          character-tool.ts
          character-workflow-service.ts
          character-read-service.ts
          character-write-service.ts
          progression/
            preview-service.ts
            advancement-choice-service.ts
            workflow-runner.ts
        compendium/
          compendium-tool.ts
          creature-search-service.ts
          compendium-format-service.ts
        maps/
          map-tool.ts
          map-job-service.ts
      systems/
        contracts.ts
        system-registry.ts
        system-context-service.ts
        dnd5e/
        pf2e/
        dsa5/
      errors/
      logging/
      utils/

  foundry-module/
    src/
      bootstrap/
        main.ts
        query-registration.ts
      queries/
        character-query-handlers.ts
        compendium-query-handlers.ts
        map-query-handlers.ts
        scene-query-handlers.ts
      services/
        characters/
        compendium/
        maps/
        scenes/
        journals/
      systems/
        dnd5e/
        pf2e/
        dsa5/
      infrastructure/
        socket-bridge.ts
        settings.ts
        permissions.ts

shared/
  src/
    contracts/
      character.ts
      compendium.ts
      map-jobs.ts
      scenes.ts
    schemas/
    primitives/
```

This is a direction, not a single-step migration requirement.

## Delivery Strategy

The refactor should be delivered as a sequence of small PRs.

Recommended size:

- one architectural seam per PR
- one major file split per PR
- no mixed refactor plus feature expansion unless the feature is the reason for
  the seam extraction

Every phase below is designed so it can be stopped after completion without
leaving the repo in a half-designed state.

## Phase 0: Baseline And Safety Nets

### Goal

Make the refactor observable and reversible before moving code around.

### Steps

1. Record current hotspot behavior and known bugs.
2. Confirm baseline commands remain green:
   - `npm run build`
   - `npm run typecheck`
   - `npm run test`
3. Add or tighten tests around known failure-prone paths before extraction work:
   - system detection and adapter resolution
   - DnD5e advancement workflow behavior
   - map job request/response behavior
4. Mark architectural hotspots in docs and issue tracker so the sequence stays
   intentional.

### Outputs

1. Stable baseline branch state
2. Test coverage around routing and workflow seams
3. Clear list of files being actively decomposed

### Exit Criteria

1. Build and typecheck pass
2. Known failing behavior is reproduced or documented
3. At least minimal tests exist around system detection and workflow routing

## Phase 1: Create Stable Runtime Seams In MCP Server

### Goal

Turn the MCP server entry layer into assembly code instead of a logic hub.

### Why First

`backend.ts` is currently too broad. If it stays broad, every later refactor is
more expensive.

### Steps

1. Extract transport-facing concerns from `backend.ts` into dedicated files:
   - control socket lifecycle
   - backend request dispatch
   - tool dispatch router
2. Keep `backend.ts` as the top-level bootstrap and composition point.
3. Introduce one runtime wiring module that constructs tool instances and shared
   dependencies.
4. Preserve public behavior and message contracts during the extraction.

### Outputs

1. Smaller `backend.ts`
2. Clear separation between bootstrap, transport, and routing
3. Easier debug path for individual request families

### Exit Criteria

1. `backend.ts` is primarily composition and startup logic
2. Tool dispatch is moved behind a dedicated router
3. Existing behavior remains unchanged under smoke tests

## Phase 2: Centralize System Resolution

### Goal

Make system detection and adapter resolution a single runtime path.

### Why Second

The current inconsistency between world-info and adapter-routed tools shows that
system identity is not being propagated consistently enough.

### Steps

1. Introduce a single system-context service in the MCP server.
2. Move canonical system detection, caching, and adapter lookup behind that
   service.
3. Refactor `character.ts` and `compendium.ts` to depend on the service rather
   than orchestrating detection ad hoc.
4. Standardize unsupported-system and unsupported-capability errors.
5. Add tests that prove the same detected system flows through all adapter-gated
   tool paths.

### Outputs

1. One canonical source of system identity
2. Fewer repeated detection calls in tools
3. Reduced routing drift between tools

### Exit Criteria

1. System-routed tools resolve adapters through one code path
2. Detection behavior is covered by tests
3. No tool-specific fallback to unrelated systems remains

## Phase 3: Split Character Domain In MCP Server

### Goal

Break `packages/mcp-server/src/tools/character.ts` into domain modules.

### Why Third

This file is the highest-risk logic concentration in the repository.

### Steps

1. Split character reads from character writes.
2. Extract progression preview and advancement-choice logic into dedicated
   modules.
3. Extract workflow-specific orchestration from primitive operations.
4. Keep one thin public character tool facade that delegates to focused domain
   services.
5. Move shared helper types used only by character workflows next to the
   workflow modules.
6. Keep public MCP tool names stable.

### Suggested Internal Breakdown

1. `domains/characters/character-read-service.ts`
2. `domains/characters/character-write-service.ts`
3. `domains/characters/progression/preview-service.ts`
4. `domains/characters/progression/advancement-choice-service.ts`
5. `domains/characters/workflows/dnd5e-level-up-workflow.ts`
6. `domains/characters/workflows/dnd5e-multiclass-workflow.ts`

### Outputs

1. Smaller, testable workflow units
2. Clear separation between primitives and workflows
3. Easier isolation of progression bugs

### Exit Criteria

1. Character file responsibilities are split by domain concern
2. Workflow bugs can be tested without loading a giant tool surface
3. Public MCP contract remains unchanged

## Phase 4: Split Compendium Domain In MCP Server

### Goal

Move compendium filtering, formatting, and adapter-dependent behavior into
smaller domain units.

### Steps

1. Extract adapter-dependent formatting from the main compendium tool.
2. Separate search/filter normalization from document retrieval.
3. Move system-specific criteria shaping into adapters only.
4. Keep one thin compendium tool facade for MCP registration.

### Outputs

1. More explicit adapter ownership
2. Less system branching in core compendium logic
3. Cleaner contract tests per system

### Exit Criteria

1. Core compendium orchestration no longer contains system-specific formatting
   rules
2. Adapter responsibilities are testable in isolation

## Phase 5: Decompose Foundry Query Layer

### Goal

Turn the Foundry module query surface into domain-specific handlers rather than
one large central file.

### Steps

1. Split `queries.ts` into domain handler modules:
   - character query handlers
   - compendium query handlers
   - map query handlers
   - scene query handlers
2. Keep a single registration point that wires query names to handlers.
3. Ensure each handler delegates immediately to the relevant facade or service.
4. Remove direct domain logic from the registration layer.

### Outputs

1. Smaller query modules
2. Better traceability from query name to domain implementation
3. Easier isolation of plugin-side timeout issues

### Exit Criteria

1. Query registration is separate from query implementation
2. Map and character query paths are independently testable

## Phase 6: Make Map Jobs A First-Class Domain

### Goal

Stop treating map generation as a transport-side special case.

### Why This Matters

The current timeout behavior around `generate-map` and `check-map-status`
suggests that the lifecycle and observability of map jobs need clearer domain
ownership.

### Steps

1. Define one shared contract for map job lifecycle state.
2. Standardize request, response, and status shapes across MCP and Foundry
   module.
3. Move map job orchestration into dedicated map-domain services on both sides.
4. Add instrumentation and timeout diagnostics at the map-domain boundary.
5. Ensure handler registration is explicit and testable.

### Outputs

1. Clear map job state model
2. Better timeout diagnostics
3. Less ambiguity about whether failures are in MCP transport or Foundry module

### Exit Criteria

1. `generate-map`, `check-map-status`, and `cancel-map-job` share one coherent
   lifecycle model
2. Timeout failures can be localized to a specific layer quickly

## Phase 7: Tighten Shared Contract Ownership

### Goal

Keep `shared` focused on contracts and reusable schemas, not catch-all runtime
logic.

### Steps

1. Group shared artifacts by domain rather than broad generic buckets where it
   improves clarity.
2. Move domain contracts into focused files when existing files become mixed.
3. Keep Foundry runtime behavior out of `shared`.
4. Keep server-only and module-only logic out of `shared`.

### Outputs

1. Better contract discoverability
2. Less drift between shared schemas and actual domain ownership

### Exit Criteria

1. `shared` contains contracts, schemas, and small primitives only
2. No domain orchestration logic lives in `shared`

## Phase 8: Align Docs, Tests, And Debugging With The New Seams

### Goal

Make the refactored structure durable for future contributors.

### Steps

1. Update process docs to reflect new module locations.
2. Add or refresh debug configurations and tasks if runtime entrypoints changed.
3. Update architecture docs with the new canonical folder boundaries.
4. Add review guidance for future contributors:
   - where orchestration belongs
   - where system behavior belongs
   - where contracts belong

### Outputs

1. Docs match implementation
2. Debugging remains straightforward
3. New contributors have a clear architectural map

### Exit Criteria

1. Architectural docs match the live repository shape
2. Debugging and test workflows still work after refactor

## PR Template For This Refactor

Every refactor PR should answer these questions explicitly.

1. What responsibility is being extracted or narrowed?
2. What public contract remains unchanged?
3. What tests prove behavior stayed stable?
4. What file is now the new ownership point for that concern?
5. What follow-up extraction is intentionally deferred?

## Suggested PR Order

Use this order unless a bug fix forces an exception.

1. Baseline tests and diagnostics
2. MCP runtime seam extraction from `backend.ts`
3. Central system-context service
4. Character domain split
5. Compendium domain split
6. Foundry query layer split
7. Map job domain hardening
8. Shared contract cleanup
9. Documentation and contributor guidance pass

## Change Management Rules

1. Do not mix architecture refactors with unrelated feature work.
2. Do not move files only for aesthetic reasons.
3. Do not change public MCP tool names during internal decomposition.
4. Prefer a compatibility facade when extracting logic out of a large file.
5. If a phase reveals deeper design problems, stop and update this document
   before continuing.

## Definition Of Done

This refactor is complete when:

1. entrypoints are thin and readable
2. system routing is centralized and deterministic
3. domain workflows live in focused modules
4. Foundry query registration is separate from query implementation
5. map job lifecycle is explicit and observable
6. shared contracts have clear ownership boundaries
7. docs and debug workflows reflect the real structure

## Immediate Next Action

Start with a small first PR that does only two things:

1. extract MCP runtime/router seams from `packages/mcp-server/src/backend.ts`
2. add or tighten tests around system detection and adapter-routed tool paths

That first PR creates the safest foundation for every later step.
