# Tool Inventory

This file is no longer the main live planning document.

The old full inventory was useful while we were closing the large MCP and
Foundry-module capability gap, but that phase is now complete enough that a
single "inventory + roadmap + historical context" document would drift stale
again.

Use the following docs instead:

- [MCP_TOOL_CATALOG.md](./MCP_TOOL_CATALOG.md)
  Current MCP tool surface, grouped by capability and by whether a tool is a
  primitive or a higher-level workflow.
- [WORKFLOW_ROADMAP.md](./WORKFLOW_ROADMAP.md)
  The active next-phase plan for higher-level rule-aware automation and
  workflow completeness.
- [MCP_ADAPTER_ARCHITECTURE.md](./MCP_ADAPTER_ARCHITECTURE.md)
  The architecture source of truth for core-versus-adapter boundaries and MCP
  capability routing.

Archive references:

- [TOOL_INVENTORY_BASELINE_2026-03-23.md](../archive/TOOL_INVENTORY_BASELINE_2026-03-23.md)
  Snapshot of the completed inventory state before the split into a live
  catalog and a live workflow roadmap.
- [TOOL_INVENTORY_HISTORICAL.md](../archive/TOOL_INVENTORY_HISTORICAL.md)
  Older migration-era and branch-comparison archive notes.

Interpretation rule:

- Use the catalog for "what exists now".
- Use the workflow roadmap for "what we should build next".
- Use the archive files only for historical reasoning.
