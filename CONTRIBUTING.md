# Contributing

## Goals

- Keep the repository type-safe, testable, and release-safe.
- Prefer small, reviewable changes with clear acceptance criteria.
- Preserve Foundry compatibility and avoid silent behavior regressions.

## Development Baseline

- Node: see package engines in package.json.
- Install: npm ci --workspaces --include-workspace-root
- Validate before PR:
  - npm run format:check
  - npm run lint:strict
  - npm run typecheck
  - npm run test

You can run all in one command:

- npm run quality

## Versioning Rules

- Root package.json version is canonical.
- Keep these in sync:
  - package.json
  - packages/mcp-server/package.json
  - packages/foundry-module/module.json
- Use:
  - npm run version:sync
  - npm run version:check

## PR Expectations

- Include a concise summary of behavior changes.
- Include risk notes for Foundry compatibility impact.
- Add or update tests for modified behavior.
- Do not close issues directly; close via merged PR references.

## CI and Release Safety

- CI quality gates must pass (typecheck, lint, format, tests, build, audit).
- Use release smoke test workflow before tagged release changes.
- Keep registry/release secrets in GitHub secrets only, never in committed files.

## Coding Standards

- Avoid any in production paths unless there is a clear boundary and justification.
- Prefer unknown + narrow typing at IO boundaries.
- Keep utilities pure when possible; isolate side effects.
- Keep module boundaries explicit and small.
