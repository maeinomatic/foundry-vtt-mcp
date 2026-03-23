# CI / Release Pipeline

This repository uses three separate GitHub Actions workflows on purpose.

The split exists because this project ships two connected deliverables:

- the MCP server
- the Foundry VTT module

Both depend on the shared workspace, but they do not all need the same level of validation or publishing behavior on every run.

## Workflow Roles

### `ci-quality-gates.yml`

This is the normal development workflow.

Use it to validate pull requests and regular branch pushes.

It is responsible for:

- installing the full monorepo from the lockfile
- building the shared workspace first
- typechecking all workspaces
- linting and format checks
- running MCP server tests
- building all workspaces
- auditing production dependencies

It does **not** publish release artifacts.

### `release-smoke-test.yml`

This is the release simulation workflow.

Use it when we want to verify release mechanics without publishing anything.

It is responsible for:

- building the shared workspace, MCP server bundle, and Foundry module
- preparing release-style manifest metadata
- creating the expected ZIP artifacts
- generating a simulated Foundry registry payload
- uploading smoke-test artifacts for inspection

It is a safe way to validate release packaging changes before cutting a real tag.

### `build-complete-release.yml`

This is the real release pipeline.

Use it for tagged releases and manual pre-release runs.

It is responsible for:

- building Windows and macOS installer artifacts
- building the standalone MCP server ZIP
- building the Foundry module ZIP
- creating the GitHub Release
- optionally updating the Foundry package registry

This workflow is the only one that should publish release outputs.

## Why The Split Matters

Keeping these workflows separate helps us avoid two common problems:

- making normal CI slow and fragile by mixing in installer/release work
- hiding release packaging problems until after a version tag is created

The intended path is:

1. `ci-quality-gates.yml` keeps everyday changes healthy.
2. `release-smoke-test.yml` validates release packaging when release logic changes.
3. `build-complete-release.yml` publishes the real release artifacts.

## Contributor Guidance

When changing code:

- expect `ci-quality-gates.yml` to be the main feedback loop

When changing packaging, manifests, installer logic, or release metadata:

- run or inspect `release-smoke-test.yml`
- do not rely on `ci-quality-gates.yml` alone

When changing actual publishing behavior:

- review `build-complete-release.yml` carefully
- treat Foundry registry publishing and GitHub release steps as release-critical

## Maintenance Notes

- Keep the Node version aligned across all workflows unless there is a deliberate platform-specific reason not to.
- Keep `shared` as the upstream contract workspace that builds before dependent workspaces.
- Keep production audit policy focused on shipped dependencies, not dev-only typing/tooling noise.
