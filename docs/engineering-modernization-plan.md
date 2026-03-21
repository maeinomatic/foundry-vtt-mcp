# Engineering Modernization Plan

## Objective
Build a professional, scalable, type-safe project baseline with predictable CI/release behavior and a practical warning-to-zero path.

## Current Baseline (Measured)
- Version alignment: passing (npm run version:check).
- Type diagnostics: currently clean for modified files.
- Lint strict gate: failing due to warnings (not errors).
- Lint warning volume snapshot:
  - Total warnings: 6765
  - Total linted files: 60
  - Top warning hotspots:
    - packages/foundry-module/src/data-access.ts: 2406
    - packages/mcp-server/src/tools/compendium.ts: 522
    - packages/mcp-server/src/tools/character.ts: 388
    - packages/mcp-server/src/backend.ts: 387
    - packages/foundry-module/src/queries.ts: 241

## Guiding Principles
- Enforce quality through automation, not memory.
- Reduce risk with phased, measurable change sets.
- Prioritize hotspots with highest warning density first.
- Maintain Foundry compatibility while refactoring internals.
- Keep MCP core orchestration generic and move system behavior into adapters.

Architecture reference:

- [process/MCP_ADAPTER_ARCHITECTURE.md](process/MCP_ADAPTER_ARCHITECTURE.md)

## Phase 1: Quality Gate Foundation (Done in this pass)
- Added strict lint script:
  - npm run lint:strict
- Added unified quality command:
  - npm run quality
- Hardened CI quality gates to include:
  - lint (no warnings)
  - format check
- Reduced unsafe typing in central error handling (unknown instead of any).
- Added repository-wide editor and line-ending standards:
  - .editorconfig
  - .gitattributes
- Added contributor baseline:
  - CONTRIBUTING.md

## Phase 2: Warning Burn-Down (Top-Down)
Focus files in this order:
1. packages/foundry-module/src/data-access.ts
2. packages/mcp-server/src/tools/compendium.ts
3. packages/mcp-server/src/tools/character.ts
4. packages/mcp-server/src/backend.ts
5. packages/foundry-module/src/queries.ts

Per file acceptance criteria:
- No explicit any in new/edited sections.
- No no-unsafe-* warnings in touched code.
- No behavior regression (tests pass).
- For system-aware behavior, no new game-specific branches in core tools.
- Refactors prefer adapter capability methods over utility-level system rules.

## Phase 3: Type Boundary Hardening
- Introduce typed DTOs for Foundry bridge responses.
- Replace implicit dynamic object access with typed guards.
- Move broad unknown/object parsing to edge modules only.

## Phase 4: Dependency Hygiene
Safe-now candidate updates:
- @modelcontextprotocol/sdk
- axios
- ws
- winston
- typescript patch/minor

Deferred/risky major updates:
- zod v4
- esbuild major
- werift major
- foundry-vtt-types major jump

Policy:
- Monthly safe updates (minor/patch).
- Quarterly major review with migration tests.

## Phase 5: Pipeline and Release Maturity
- Keep one canonical tagged release path.
- Keep smoke-test workflow for non-tag packaging validation.
- Maintain release metadata consistency checks and version sync checks.
- Ensure secrets are passed through step env and never embedded into scripts.

## Definition of Done
The modernization track is complete when:
- npm run quality passes on default branch.
- Lint warnings = 0 on enforced scope.
- Typecheck is clean without suppressions.
- CI quality gates pass consistently.
- Release smoke and tagged release workflows are both reliable.

## Next Implementation Slice
Start with warnings in:
- packages/mcp-server/src/tools/compendium.ts
- packages/mcp-server/src/tools/character.ts

Reason:
- High warning density and high runtime impact.
- Refactors here improve safety in core MCP user paths quickly.
