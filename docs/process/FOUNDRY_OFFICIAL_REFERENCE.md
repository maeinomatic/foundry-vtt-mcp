# Foundry Official Reference (v13 Baseline, v14 Watch)

This file is the canonical source for official Foundry documentation links and
compatibility rules used by this repository.

Last reviewed: 2026-03-21

## 1) Official Sources

Use these links as authoritative references before implementing or changing
Foundry-facing behavior.

### Core platform docs

- API docs (v13 stable docs): https://foundryvtt.com/api/
- API modules index: https://foundryvtt.com/api/modules.html
- Hook events module: https://foundryvtt.com/api/modules/hookEvents.html
- Foundry release notes (all versions): https://foundryvtt.com/releases/
- Versioning phases and update channels: https://foundryvtt.com/article/versioning/
- Module development and manifest guidance: https://foundryvtt.com/article/module-development/

### Breaking change tracking (v14)

- Foundry v14 breaking board (label: breaking):
  https://github.com/orgs/foundryvtt/projects/67/views/8
- Foundry core issue tracker:
  https://github.com/foundryvtt/foundryvtt/issues

### System-level reference

- dnd5e system repository: https://github.com/foundryvtt/dnd5e
- dnd5e releases: https://github.com/foundryvtt/dnd5e/releases

## 2) Official Syntax and API Rules We Follow

These are the official conventions we treat as policy in this repo.

### Public vs private API usage

From the Foundry API docs:

- Prefer documented public API.
- Treat underscore-prefixed members as private unless clearly documented.
- Avoid relying on private/internal behavior for production paths.

Practical repo rule:

- If a change requires private API usage, document the risk and add a fallback
  strategy.

### Hook usage syntax

From hookEvents docs:

- Standard startup order is init -> i18nInit -> setup -> ready.
- Cancellable hooks are cancelled by returning false.
- Hooks are not awaited; async cancellable hooks do not behave as expected.

Practical repo rule:

- Keep cancellable hook handlers synchronous unless there is explicit,
  documented support for async behavior.

### Module manifest syntax

From module-development docs:

- module.json is required at module root.
- id must match module folder name.
- compatibility fields are minimum, verified, maximum.

Current project syntax template:

{
  "compatibility": {
    "minimum": "13",
    "verified": "13",
    "maximum": "13"
  }
}

Practical repo rule:

- Do not bump compatibility to 14 until v14 gate criteria in
  docs/foundry-v14-compatibility-plan.md are complete.

## 3) Version Policy for This Repo

- Supported baseline: Foundry v13 stable.
- v14 support status: tracked and validated incrementally; no compatibility bump
  until go/no-go gate passes.

As of this review:

- v13 stable releases exist through 13.351.
- v14 is active and has progressed through prototype/development/testing stages
  (see releases page for latest build).

## 4) Update Workflow (Keep This Fresh)

Run this process weekly, and before any release candidate:

1. Review https://foundryvtt.com/releases/ for new v13/v14 builds.
2. Review the v14 breaking board for newly closed or added items.
3. For each relevant breaking issue, map impact to repository files.
4. Update docs/foundry-v14-compatibility-plan.md tracker rows.
5. Run regression checks:
   - npm run typecheck
   - npm -w @foundry-mcp/server test -- --run
   - npm run build
   - npm run test:mcp:schema
6. Record tested Foundry build + system versions in the compatibility plan.

## 5) Compatibility Change Control

Only change module compatibility metadata after all of the following are true:

1. No critical runtime errors on v14 across tested systems.
2. Token/effect/chat/compendium workflows pass validation.
3. Build, typecheck, and tests are green.
4. Known limitations are documented.

Then update:

- packages/foundry-module/module.json
- README.md
- CHANGELOG.md

## 6) Where to Put New Findings

- Add breaking-change execution details to:
  docs/foundry-v14-compatibility-plan.md
- Add stable source links or official policy clarifications to this file.
- Do not store canonical policy details only in ad-hoc PR comments.
