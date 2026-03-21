# Maintenance Roadmap (Fork)

This roadmap focuses on build/test/dependency hygiene while keeping the current build stack (`tsc` + `esbuild`) and avoiding risky migration work until coverage and CI quality are stronger.

## Goals

1. Keep Foundry v13 compatibility stable.
2. Maintain the existing TypeScript-first workspace baseline.
3. Improve confidence in changes with real tests and CI gates.
4. Reduce security and maintenance risk from outdated dependencies.
5. Keep build-tool decisions (for example optional Vite spikes) as explicit, test-driven decisions.
6. Preserve MCP-first adapter boundaries across all system integrations.

## Architecture Guardrail

Architecture source of truth:

- [MCP_ADAPTER_ARCHITECTURE.md](MCP_ADAPTER_ARCHITECTURE.md)

Roadmap work should avoid reintroducing system-specific branches in core tool
or utility layers. If work requires game-specific behavior, implement it in
system adapters and route through registry dispatch.

## Current Baseline

Historical migration analysis documents from previous work are archived in `docs/archive/`.
Treat them as reference context only, not active implementation scope.

- Build: passes (`npm run build`)
- Typecheck: passes (`npm run typecheck`)
- TypeScript status: already first-class across workspaces (`mcp-server`, `foundry-module`, `shared`)
- Test runner: configured (Vitest), but effective test coverage is near zero
- One existing test file is not a true test suite:
  - `packages/mcp-server/src/systems/dsa5/filters.test.ts`
- Security/dependency posture:
  - direct packages to prioritize: `@modelcontextprotocol/sdk`, `axios`
  - safe minor/patch candidates: `ws`, `winston`, `typescript`
  - major-risk candidates (defer): `zod@4`, `werift` major jump, `esbuild` major jump, Foundry type definitions jump

### Outdated Snapshot (2026-03-20)

Safe now (patch/minor only):

1. `@modelcontextprotocol/sdk` `1.17.2` -> `1.27.1`
2. `axios` `1.12.2` -> `1.13.6`
3. `ws` `8.18.3` -> `8.19.0`
4. `winston` `3.17.0` -> `3.19.0`
5. `typescript` `5.9.2` -> `5.9.3`
6. `@types/node` `20.19.10` -> `20.19.37`
7. `socket.io-client` `4.8.1` -> `4.8.3`

Defer (major/risky):

1. `zod` `3.x` -> `4.x`
2. `werift` `0.17.x` -> `0.22.x`
3. `esbuild` `0.19.x` -> `0.27.x`
4. `better-sqlite3` `11.x` -> `12.x`
5. `dotenv` `16.x` -> `17.x`
6. `vitest` `3.x` -> `4.x`
7. `@league-of-foundry-developers/foundry-vtt-types` `9.x` -> `13.x` (beta)

## Phase Plan

## Phase 1: Test Foundation (Immediate)

### Scope

1. Convert the console-only DSA5 filter file into a real Vitest suite.
2. Enforce a minimal CI test gate for server package.
3. Keep test scope small and stable first.

### Tasks

1. Rewrite `packages/mcp-server/src/systems/dsa5/filters.test.ts` to use `describe/it/expect`.
2. Add assertions for:
   - exact level filtering
   - level range filtering
   - species filtering
   - hasSpells filtering
   - combined filters
   - experience points filtering
   - helper validators
3. Ensure `npm -w @foundry-mcp/server test -- --run` passes.

### Commands

```bash
npm -w @foundry-mcp/server test -- --run
npm run typecheck
npm run build
```

### Exit Criteria

1. Vitest reports at least 1 passing suite and multiple passing tests.
2. No "No test suite found" errors.
3. Build and typecheck remain green.

## Phase 2: CI Guardrails (Immediate)

### Scope

1. Add mandatory CI checks for PRs in fork.
2. Define fail policy for vulnerabilities.

### Tasks

1. Add/update workflow to run:
   - `npm ci`
   - `npm run typecheck`
   - `npm -w @foundry-mcp/server test -- --run`
   - `npm run build`
2. Add security step:
   - `npm audit --workspaces --audit-level=high`
3. Decide policy:
   - fail on high/critical for direct dependencies
   - allow temporary exceptions only when documented

### Exit Criteria

1. CI blocks merges on typecheck/test/build failure.
2. CI reports high/critical vulnerabilities with clear failure signal.

## Phase 3: Safe Dependency Upgrades (Near Term)

### Scope

Only patch/minor updates first. No major upgrades in this phase.

### Prioritized Updates

1. `@modelcontextprotocol/sdk` to current secure minor.
2. `axios` to current secure minor.
3. `ws`, `winston`, `typescript` to latest safe minor/patch.
4. `@types/node` and `socket.io-client` to latest safe minor/patch.

### Tasks

1. Update package versions.
2. Run full validation:
   - typecheck
   - tests
   - build
   - schema smoke test
3. Document any behavior changes in changelog.

### Phase 3 Batch Order

1. Batch A (security-first): `@modelcontextprotocol/sdk`, `axios`
2. Batch B (runtime minors): `ws`, `winston`, `socket.io-client`
3. Batch C (tooling minors): `typescript`, `@types/node`
4. Validate after each batch before moving to the next one.

### Commands

```bash
npm outdated --workspaces
npm install
npm run typecheck
npm -w @foundry-mcp/server test -- --run
npm run build
npm run test:mcp:schema
```

### Exit Criteria

1. No regressions in build/test/typecheck.
2. Security audit reduced for direct high-risk dependencies.

## Phase 4: Lint and Tooling Consistency (Near Term)

### Scope

Resolve mismatch between lint command scope and ignore rules.

### Tasks

1. Align root lint behavior with desired policy:
   - either lint JS scripts intentionally, or
   - keep JS out of lint and narrow command to TS only.
2. Keep installer/scripts quality checks explicit if JS remains in repo.

### Exit Criteria

1. Lint command behavior matches documented project policy.
2. No surprise exclusions.

## Phase 5: Major Upgrades and Build Experiments (Later)

### Scope

Handle major-risk upgrades and optional Vite evaluation only after stronger test confidence.

### Deferred Items

1. `zod` v4 migration.
2. `werift` major upgrade.
3. `esbuild` major upgrade.
4. Foundry type definitions major jump (must align with target Foundry compatibility).
5. Optional Vite spike for Foundry module build.

### Vite Decision Gate

Only run a Vite spike if all are true:

1. Stable test coverage in critical paths.
2. CI guardrails are fully active.
3. A measurable benefit is defined (e.g., faster builds, easier bundling, plugin need).

### Exit Criteria

1. For each major upgrade, migration notes and risk test matrix are documented.
2. Foundry module output remains compatible with `packages/foundry-module/module.json` expectations.

## Branch and PR Strategy

Use small, focused branches from `feat/dnd5e-actor-write-tools`.

Suggested sequence:

1. `chore/tests-vitest-foundation`
2. `chore/ci-quality-gates`
3. `chore/deps-safe-minor-bumps`
4. `chore/lint-policy-alignment`
5. `spike/vite-foundry-module` (optional, later)

## Suggested Work Order for This Week

1. Finish Phase 1 (real Vitest tests).
2. Add Phase 2 CI gates.
3. Execute Phase 3 safe dependency bumps.
4. Re-run audit and record delta.

## Historical References

Use these only for background context:

1. `docs/archive/MIGRATION_PLAN.md`
2. `docs/archive/MISSING_TOOLS.md`
3. `docs/archive/RISK_ANALYSIS.md`
4. `TOOL_INVENTORY.md` is not archived and remains active, but includes historical sections.

## Tracking Template

Use this checklist in PR descriptions:

- [ ] Typecheck passes (`npm run typecheck`)
- [ ] Tests pass (`npm -w @foundry-mcp/server test -- --run`)
- [ ] Build passes (`npm run build`)
- [ ] Schema smoke test passes (`npm run test:mcp:schema`)
- [ ] Audit reviewed (`npm audit --workspaces`)
- [ ] Foundry v13 compatibility preserved
