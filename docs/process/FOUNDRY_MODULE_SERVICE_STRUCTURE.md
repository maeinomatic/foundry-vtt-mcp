# Foundry Module Service Structure

This module uses a small, practical service-oriented structure. It is not strict Domain-Driven Design, but it borrows one useful DDD habit: organize by domain and give each layer a clear responsibility.

## Naming Rules

- `facade`: the top-level entry point that coordinates the module-facing API and delegates work
- `service`: domain logic for a specific area such as characters, compendium, scenes, journals, or world state
- `strategy`: system-specific behavior selected at runtime for games like DnD5e, PF2e, or DSA5
- `strategy-registry`: resolves the correct strategy for the active game system
- `contract`: shared types and small shared primitives used by a service or strategy family
- `factory`: builds or maps a specific output shape when a file has one focused transformation responsibility

## Structure Gist

- `src/foundry-module-facade.ts`
  The module-facing facade. It wires services together and exposes the operations used by query handlers.

- `src/services/*-service.ts`
  Domain services. These hold orchestration and domain-specific module behavior.

- `src/services/*-strategies/`
  System-specific strategies for a domain when behavior differs by game system.

- `src/services/*-strategy-registry.ts`
  Lookup points that select the active strategy by `game.system.id`.

- `src/services/*-contract.ts`
  Shared contracts for a service or strategy group.

- `src/services/*-factory.ts`
  Focused builders for a single transformation concern.

## Intent

The goal is to avoid vague names like `helper` or overloaded names like `access` for files that actually contain orchestration or game logic. A reader should be able to tell a file's role from the filename alone, without relying on folder context or opening the file first.
