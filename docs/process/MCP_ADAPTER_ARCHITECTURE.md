# MCP Adapter Architecture

## Purpose

Define the architectural baseline for this repository so MCP tools remain stable,
predictable, and easy to extend across multiple game systems (D&D 5e, PF2e,
DSA5, and future systems).

This document captures the preferred path:

- MCP-first capability architecture
- strict separation between core orchestration and system-specific logic
- explicit capability handling (no silent best-effort fallbacks)

## Decision Summary

Core tools must orchestrate, not implement game-system rules.
All system-specific behavior must live behind adapters.

If code asks system questions like "is this dnd5e or pf2e?" outside the adapter
layer, that is a design smell and should be refactored.

## Why This Fits MCP

MCP servers work best when:

1. Tool contracts are stable over time.
2. Outputs are deterministic and normalized.
3. Capabilities are explicit.
4. Unsupported behavior is returned as structured errors, not guessed.
5. Token usage is controlled through predictable response shapes.

This architecture aligns directly with those requirements.

## Separation Of Concerns

### Core Layer Responsibilities

- Tool registration and schemas
- Input validation and normalization
- Logging, retries, timeouts, pagination
- Transport/query wrappers to Foundry bridge
- Adapter resolution and dispatch
- Standard response and error envelopes

### Adapter Layer Responsibilities

- System field mapping and extraction
- System-specific filter schema and validation
- Character stat extraction and write mappings
- Compendium item formatting and creature index shaping
- Human-readable criteria text when terminology differs by system

## Required Behavior

1. Detect and propagate real system IDs end-to-end.
2. Resolve adapter by system ID.
3. If adapter is missing, return a structured unsupported error.
4. Never default unknown systems to another system's data paths.

## Anti-Patterns To Avoid

- System conditionals in core tool files
- Shared utility files containing system rules
- Silent fallback to D&D 5e paths for unknown systems
- Mixed responsibilities where core tools both orchestrate and transform

## Recommended Adapter Contract

The adapter interface should expose capabilities needed by tools, for example:

- `extractCharacterStats`
- `formatCompendiumItem`
- `formatCreatureListItem`
- `describeCriteria`
- `getFilterSchema`
- `normalizeFilters`
- `mapWriteOperation`

Not all systems must implement all capabilities initially, but missing
capabilities must be explicit and handled cleanly.

## Error Model

Use consistent error codes for predictable MCP behavior:

- `UNSUPPORTED_SYSTEM`
- `UNSUPPORTED_CAPABILITY`
- `INVALID_FILTER_FOR_SYSTEM`
- `ADAPTER_RESOLUTION_FAILED`

Each error should include:

- machine-readable code
- user-safe message
- optional remediation hint

## Migration Plan (Low Risk)

1. System ID flow

- Return canonical system IDs through detection and routing.
- Remove `other -> dnd5e` path fallback behavior.

2. Compendium extraction move

- Move system branches from core compendium tool into adapter methods.

3. Filter ownership move

- Move system-specific filter schemas and conversion logic into adapters.

4. Legacy fallback removal

- Keep temporary compatibility fallback for one release behind a flag.
- Remove fallback once adapter coverage and tests are complete.

5. Contract tests

- Add per-system contract tests that assert common response shape.
- Add explicit unsupported-capability tests.

## Code Review Rule Of Thumb

When reviewing architecture changes, ask:

"Could this logic be moved behind a system adapter without changing the MCP tool
contract?"

If yes, it probably belongs in the adapter layer.

## Alignment With Foundry API Guidance

Follow Foundry public API usage and avoid private API coupling. Keep
system-specific semantics in system-specific models/adapters and keep core
orchestration generic.

## Scope Note For DSA5 Work

This document supports the existing DSA5 direction:

- adapter-first implementation
- no broad core rewrites
- incremental adoption into existing tools
