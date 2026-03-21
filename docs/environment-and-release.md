# Environment and Release Reference

This document explains:
- what the `.env` files in this repository do,
- which variables are actually used by the MCP server,
- and what the Foundry package registry release API step is doing in CI.

## 1) `.env` in this project

### Where environment variables are loaded

The MCP server reads environment variables in `packages/mcp-server/src/config.ts` using:
- `.env.local` first
- `.env` second

That means:
- the MCP runtime behavior is controlled by process environment variables,
- local `.env` files are optional helpers for local development,
- and `.env.local` values override `.env` values.

### Why there are two `.env.example` files

This repository currently has:
- root `.env.example`
- `packages/mcp-server/.env.example`

The server code lives in `packages/mcp-server`, so that package-level file is the authoritative template for server runtime settings.

The root file is intended as a convenience copy of the package-level template.

If both examples are kept, they should remain identical to avoid drift.

## 2) Environment variables used by MCP server

These are consumed in `packages/mcp-server/src/config.ts`.

### Logging
- `LOG_LEVEL`: `error|warn|info|debug` (default: `warn`)
- `LOG_FORMAT`: `json|simple` (default: `simple`)
- `ENABLE_FILE_LOGGING`: `true|false` (default: `false`)
- `LOG_FILE_PATH`: optional path

### Foundry connection
- `FOUNDRY_HOST`: host name (default: `localhost`)
- `FOUNDRY_PORT`: websocket/webrtc signaling port (default: `31415`)
- `FOUNDRY_NAMESPACE`: socket namespace (default: `/foundry-mcp`)
- `FOUNDRY_RECONNECT_ATTEMPTS`: reconnect tries (default: `5`)
- `FOUNDRY_RECONNECT_DELAY`: ms between reconnect attempts (default: `1000`)
- `FOUNDRY_CONNECTION_TIMEOUT`: connection timeout ms (default: `10000`)
- `FOUNDRY_CONNECTION_TYPE`: `auto|webrtc|websocket` (default: `auto`)
- `FOUNDRY_PROTOCOL`: `ws|wss` for websocket mode (default: `ws`)
- `FOUNDRY_REMOTE_MODE`: `true|false` remote file upload mode (default: `false`)
- `FOUNDRY_DATA_PATH`: optional custom Foundry data path
- `FOUNDRY_REJECT_UNAUTHORIZED`: TLS validation (default: `true`; set `false` only for development/self-signed cert testing)
- `FOUNDRY_STUN_SERVERS`: comma-separated STUN list for WebRTC

### ComfyUI
- `COMFYUI_PORT`: service port (default: `31411`)
- `COMFYUI_INSTALL_PATH`: optional install path override
- `COMFYUI_HOST`: host (default: `127.0.0.1`)
- `COMFYUI_PYTHON_COMMAND`: Python executable (platform dependent)

### Server metadata and output shaping
- `SERVER_NAME`: logical server name (default: `foundry-mcp-server`)
- `SERVER_VERSION`: optional override for display/runtime version string
- `TOOL_RESPONSE_MAX_CHARS`: truncation guard for large tool output (default: `20000`)

## 2.1) Canonical versioning model

This repository uses root `package.json` as the canonical release version.

Required alignment:
- root `package.json` `version`
- `packages/mcp-server/package.json` `version`
- `packages/foundry-module/module.json` `version`

Commands:
- `npm run version:sync` updates package/module versions from root
- `npm run version:check` validates all versions are aligned

On tagged releases, CI also enforces that tag `vX.Y.Z` matches the canonical package version.

## 3) GitHub Actions secret vs `.env`

`FOUNDRY_PACKAGE_RELEASE_TOKEN` is not a runtime MCP server variable.

It is a CI secret used only in `.github/workflows/build-complete-release.yml` to authenticate the call to Foundry's package registry API when publishing module updates.

Do not place this token in committed `.env.example` files.
Use GitHub repository secrets only.

## 4) What `https://foundryvtt.com/_api/packages/release_version/` does

In this project, CI posts a JSON payload to that endpoint after creating a tagged GitHub release.

The payload includes:
- package id (`module.json` `id`)
- release version
- manifest URL for the released `module.json`
- release notes URL
- compatibility range (`minimum`, `verified`, `maximum`)

Practical effect:
- this tells Foundry's package registry that a new release exists,
- so users can discover and update the module through Foundry's package browser.

Notes:
- The endpoint itself is not a human-readable documentation page.
- It is intended as an authenticated machine endpoint.

## 5) Release workflow standards applied

The release workflow now follows these standards:
- Repository metadata in released `module.json` is made repo-aware at release time.
- Registry auth token is passed as a step environment variable, not embedded inline in command text.
- API calls include retries and timeout bounds.
- Release text avoids hard-coded branch assumptions and uses repository default branch where applicable.

### Canonical release path

This repository uses a single canonical release workflow:
- `.github/workflows/build-complete-release.yml`

Trigger model:
- Tagged release (`vX.Y.Z`) for publishing artifacts and GitHub release.
- Manual dispatch defaults to build-only verification.
- Manual dispatch can optionally create a GitHub pre-release when `publish_prerelease=true` and a `version` is provided.

Safety rules:
- Foundry package registry update runs only for tagged releases.
- Manual pre-releases never push Foundry registry updates.

The quality workflow (`.github/workflows/ci-quality-gates.yml`) remains responsible for PR and branch validation.

### Release smoke-test path

For non-tag validation, use:
- `.github/workflows/release-smoke-test.yml`

Purpose:
- Build server/module artifacts and verify release file naming.
- Simulate release metadata updates for `module.json`.
- Generate a Foundry registry payload preview JSON.
- Never publish a GitHub release and never call Foundry registry API.

This is the safest way to validate release mechanics before pushing a real `vX.Y.Z` tag.

## 6) Recommended long-term cleanup

- Keep `packages/mcp-server/.env.example` as the authoritative runtime template.
- Keep root `.env.example` only if you need a top-level quickstart template; otherwise remove it to avoid drift.
- Add a CI check to validate that documented env keys stay in sync with `packages/mcp-server/src/config.ts`.
- Add a small release dry-run workflow for non-tag test execution if you want to validate Foundry API payload composition without publishing.
