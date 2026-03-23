import { describe, expect, it, vi } from 'vitest';

import type { FoundryClient } from '../foundry-client.js';
import type { Logger } from '../logger.js';
import { ActorCreationTools } from './actor-creation.js';

function createLoggerStub(): Logger {
  const logger = {
    child: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  logger.child.mockReturnValue(logger);
  return logger as unknown as Logger;
}

describe('ActorCreationTools', () => {
  it('rejects companion-specific fields for standalone create-character-actor', async () => {
    const query = vi.fn();

    const tools = new ActorCreationTools({
      foundryClient: { query } as unknown as FoundryClient,
      logger: createLoggerStub(),
    });

    await expect(
      tools.handleCreateCharacterActor({
        sourceUuid: 'Compendium.dnd5e.heroes.Actor.2Pdtnswo8Nj2nafY',
        name: 'Bram Ironfield',
        role: 'companion',
      })
    ).rejects.toThrow();

    expect(query).not.toHaveBeenCalled();
  });

  it('creates a standalone actor from sourceUuid through create-character-actor', async () => {
    const query = vi.fn().mockResolvedValue({
      success: true,
      linked: false,
      actorId: 'actor-standalone-1',
      actorName: 'Bram Ironfield',
      actorType: 'character',
      sourceUuid: 'Compendium.dnd5e.heroes.Actor.2Pdtnswo8Nj2nafY',
      packId: 'dnd5e.heroes',
      itemId: '2Pdtnswo8Nj2nafY',
      tokensPlaced: 0,
    });

    const tools = new ActorCreationTools({
      foundryClient: { query } as unknown as FoundryClient,
      logger: createLoggerStub(),
    });

    const result = (await tools.handleCreateCharacterActor({
      sourceUuid: 'Compendium.dnd5e.heroes.Actor.2Pdtnswo8Nj2nafY',
      name: 'Bram Ironfield',
      addToScene: false,
    })) as Record<string, unknown>;

    expect(query).toHaveBeenCalledWith('maeinomatic-foundry-mcp.createCharacterActor', {
      sourceUuid: 'Compendium.dnd5e.heroes.Actor.2Pdtnswo8Nj2nafY',
      name: 'Bram Ironfield',
      addToScene: false,
    });

    expect(result.kind).toBe('standalone-actor');
    expect(result.linked).toBe(false);
    expect(result.actor).toMatchObject({
      id: 'actor-standalone-1',
      name: 'Bram Ironfield',
      type: 'character',
    });
  });

  it('sends the normalized actor creation bridge request and formats the result', async () => {
    const query = vi.fn().mockResolvedValue({
      success: true,
      actors: [
        {
          id: 'actor-1',
          name: 'Gib',
          originalName: 'Goblin',
          type: 'npc',
          sourcePackId: 'dnd5e.monsters',
          sourcePackLabel: 'SRD Monsters',
        },
        {
          id: 'actor-2',
          name: 'Gib 2',
          originalName: 'Goblin',
          type: 'npc',
          sourcePackId: 'dnd5e.monsters',
          sourcePackLabel: 'SRD Monsters',
        },
      ],
      tokensPlaced: 2,
      totalRequested: 2,
      totalCreated: 2,
    });

    const tools = new ActorCreationTools({
      foundryClient: { query } as unknown as FoundryClient,
      logger: createLoggerStub(),
    });

    const result = (await tools.handleCreateActorFromCompendium({
      packId: 'dnd5e.monsters',
      itemId: 'goblin',
      names: ['Gib'],
      quantity: 2,
      addToScene: true,
      placement: { type: 'grid' },
    })) as Record<string, unknown>;

    expect(query).toHaveBeenCalledWith('maeinomatic-foundry-mcp.createActorFromCompendium', {
      packId: 'dnd5e.monsters',
      itemId: 'goblin',
      customNames: ['Gib', 'Gib 2'],
      quantity: 2,
      addToScene: true,
      placement: { type: 'grid' },
    });

    expect(result.success).toBe(true);
    expect(result.summary).toBe('✅ Created 2 of 2 requested actors');
    expect(result.details).toMatchObject({
      sourceEntry: {
        packId: 'dnd5e.monsters',
        itemId: 'goblin',
      },
      tokensPlaced: 2,
    });
  });

  it('uses the shared full-entry bridge request and formats the returned document', async () => {
    const query = vi.fn().mockResolvedValue({
      id: 'adult-black-dragon',
      name: 'Adult Black Dragon',
      type: 'npc',
      pack: 'dnd5e.monsters',
      packLabel: 'SRD Monsters',
      system: {
        details: {
          cr: 14,
        },
      },
      fullData: {
        id: 'adult-black-dragon',
      },
      items: [
        {
          id: 'bite',
          name: 'Bite',
          type: 'weapon',
        },
      ],
      effects: [
        {
          id: 'frightful-presence',
          name: 'Frightful Presence',
          type: 'ActiveEffect',
        },
      ],
    });

    const tools = new ActorCreationTools({
      foundryClient: { query } as unknown as FoundryClient,
      logger: createLoggerStub(),
    });

    const result = (await tools.handleGetCompendiumEntryFull({
      packId: 'dnd5e.monsters',
      entryId: 'adult-black-dragon',
    })) as Record<string, unknown>;

    expect(query).toHaveBeenCalledWith('maeinomatic-foundry-mcp.getCompendiumDocumentFull', {
      packId: 'dnd5e.monsters',
      documentId: 'adult-black-dragon',
    });

    expect(result).toMatchObject({
      name: 'Adult Black Dragon',
      type: 'npc',
      pack: 'SRD Monsters',
    });
    expect(result.items).toMatchObject([{ name: 'Bite' }]);
    expect(result.effects).toMatchObject([{ name: 'Frightful Presence' }]);
  });
});
