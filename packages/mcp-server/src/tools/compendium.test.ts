import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { FoundryClient } from '../foundry-client.js';
import type { Logger } from '../logger.js';
import { DnD5eAdapter } from '../systems/dnd5e/adapter.js';
import { SystemRegistry } from '../systems/system-registry.js';
import { clearSystemCache } from '../utils/system-detection.js';
import { CompendiumTools } from './compendium.js';

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

describe('CompendiumTools', () => {
  beforeEach(() => {
    clearSystemCache();
  });

  it('returns an explicit unsupported-capability error when no adapter is registered', async () => {
    const foundryClient = {
      query: vi.fn().mockImplementation((method: string) => {
        if (method === 'foundry-mcp-bridge.getWorldInfo') {
          return Promise.resolve({ system: 'coc7' });
        }

        return Promise.reject(new Error(`Unexpected query: ${method}`));
      }),
    } as unknown as FoundryClient;

    const tools = new CompendiumTools({
      foundryClient,
      logger: createLoggerStub(),
      systemRegistry: new SystemRegistry(),
    });

    await expect(tools.handleListCreaturesByCriteria({ level: 3 })).rejects.toThrow(
      'UNSUPPORTED_CAPABILITY'
    );
  });

  it('validates criteria against the active system adapter schema', async () => {
    const foundryClient = {
      query: vi.fn().mockImplementation((method: string) => {
        if (method === 'foundry-mcp-bridge.getWorldInfo') {
          return Promise.resolve({ system: 'dnd5e' });
        }

        return Promise.reject(new Error(`Unexpected query: ${method}`));
      }),
    } as unknown as FoundryClient;

    const systemRegistry = new SystemRegistry();
    systemRegistry.register(new DnD5eAdapter());

    const tools = new CompendiumTools({
      foundryClient,
      logger: createLoggerStub(),
      systemRegistry,
    });

    await expect(tools.handleListCreaturesByCriteria({ level: 3 })).rejects.toThrow(
      'INVALID_FILTER_FOR_SYSTEM'
    );
  });

  it('uses the active adapter to shape compact and full creature compendium responses', async () => {
    const foundryClient = {
      query: vi.fn().mockImplementation((method: string) => {
        if (method === 'foundry-mcp-bridge.getWorldInfo') {
          return Promise.resolve({ system: 'dnd5e' });
        }

        if (method === 'foundry-mcp-bridge.getCompendiumDocumentFull') {
          return Promise.resolve({
            id: 'adult-black-dragon',
            name: 'Adult Black Dragon',
            type: 'npc',
            pack: 'dnd5e.monsters',
            packLabel: 'SRD Monsters',
            img: 'dragon.png',
            system: {
              details: {
                cr: 14,
                type: { value: 'dragon' },
                alignment: 'chaotic evil',
              },
              traits: {
                size: 'huge',
              },
              attributes: {
                hp: { value: 195, max: 195 },
                ac: { value: 19 },
                movement: { walk: 40, fly: 80, swim: 40 },
              },
              abilities: {
                str: { value: 23 },
                wis: { value: 15 },
              },
              resources: {
                legres: { value: 3 },
              },
            },
            items: [],
            effects: [],
          });
        }

        return Promise.reject(new Error(`Unexpected query: ${method}`));
      }),
    } as unknown as FoundryClient;

    const systemRegistry = new SystemRegistry();
    systemRegistry.register(new DnD5eAdapter());

    const tools = new CompendiumTools({
      foundryClient,
      logger: createLoggerStub(),
      systemRegistry,
    });

    const compactResponse = (await tools.handleGetCompendiumItem({
      packId: 'dnd5e.monsters',
      itemId: 'adult-black-dragon',
      compact: true,
    })) as Record<string, unknown>;

    expect(compactResponse.mode).toBe('compact');
    expect(compactResponse.stats).toMatchObject({
      challengeRating: 14,
      creatureType: 'dragon',
      armorClass: 19,
      hasLegendaryActions: true,
    });

    const fullResponse = (await tools.handleGetCompendiumItem({
      packId: 'dnd5e.monsters',
      itemId: 'adult-black-dragon',
      compact: false,
    })) as Record<string, unknown>;

    expect(fullResponse.mode).toBe('full');
    expect(fullResponse.creatureDetails).toMatchObject({
      challengeRating: 14,
      creatureType: 'dragon',
      armorClass: 19,
      hasLegendaryActions: true,
    });
  });

  it('requires a registered adapter for creature compendium detail formatting', async () => {
    const foundryClient = {
      query: vi.fn().mockImplementation((method: string) => {
        if (method === 'foundry-mcp-bridge.getWorldInfo') {
          return Promise.resolve({ system: 'coc7' });
        }

        if (method === 'foundry-mcp-bridge.getCompendiumDocumentFull') {
          return Promise.resolve({
            id: 'deep-one',
            name: 'Deep One',
            type: 'npc',
            pack: 'coc7.monsters',
            packLabel: 'CoC Monsters',
            system: {},
          });
        }

        return Promise.reject(new Error(`Unexpected query: ${method}`));
      }),
    } as unknown as FoundryClient;

    const tools = new CompendiumTools({
      foundryClient,
      logger: createLoggerStub(),
      systemRegistry: new SystemRegistry(),
    });

    await expect(
      tools.handleGetCompendiumItem({
        packId: 'coc7.monsters',
        itemId: 'deep-one',
        compact: true,
      })
    ).rejects.toThrow('UNSUPPORTED_CAPABILITY');
  });

  it('uses the shared compendium-search bridge request shape and formats lightweight results', async () => {
    const query = vi.fn().mockImplementation((method: string, data?: unknown) => {
      if (method === 'foundry-mcp-bridge.getWorldInfo') {
        return Promise.resolve({ system: 'dnd5e' });
      }

      if (method === 'foundry-mcp-bridge.searchCompendium') {
        expect(data).toEqual({
          query: 'dragon',
          packType: 'Actor',
        });
        return Promise.resolve([
          {
            id: 'adult-black-dragon',
            name: 'Adult Black Dragon',
            type: 'npc',
            pack: 'dnd5e.monsters',
            packLabel: 'SRD Monsters',
            summary: 'CR 14 dragon from SRD Monsters',
            system: {
              details: {
                cr: 14,
                type: { value: 'dragon' },
                alignment: 'chaotic evil',
              },
              traits: {
                size: 'huge',
              },
              attributes: {
                hp: { value: 195, max: 195 },
                ac: { value: 19 },
              },
              resources: {
                legres: { value: 3 },
              },
            },
          },
        ]);
      }

      return Promise.reject(new Error(`Unexpected query: ${method}`));
    });

    const systemRegistry = new SystemRegistry();
    systemRegistry.register(new DnD5eAdapter());

    const tools = new CompendiumTools({
      foundryClient: { query } as unknown as FoundryClient,
      logger: createLoggerStub(),
      systemRegistry,
    });

    const result = (await tools.handleSearchCompendium({
      query: 'dragon',
      packType: 'Actor',
    })) as Record<string, unknown>;

    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.searchCompendium', {
      query: 'dragon',
      packType: 'Actor',
      filters: undefined,
    });
    expect(result.results).toMatchObject([
      {
        id: 'adult-black-dragon',
        name: 'Adult Black Dragon',
      },
    ]);
  });

  it('uses the shared creature-search envelope and surfaces search summary data', async () => {
    const query = vi.fn().mockImplementation((method: string, data?: unknown) => {
      if (method === 'foundry-mcp-bridge.getWorldInfo') {
        return Promise.resolve({ system: 'dnd5e' });
      }

      if (method === 'foundry-mcp-bridge.listCreaturesByCriteria') {
        expect(data).toEqual({
          challengeRating: 3,
          limit: 100,
        });
        return Promise.resolve({
          response: {
            creatures: [
              {
                id: 'owlbear',
                name: 'Owlbear',
                type: 'npc',
                pack: 'dnd5e.monsters',
                packLabel: 'SRD Monsters',
                challengeRating: 3,
                creatureType: 'monstrosity',
                size: 'large',
                system: {
                  details: {
                    cr: 3,
                    type: { value: 'monstrosity' },
                  },
                  traits: {
                    size: 'large',
                  },
                },
              },
            ],
            searchSummary: {
              packsSearched: 1,
              topPacks: [
                {
                  id: 'dnd5e.monsters',
                  label: 'SRD Monsters',
                  priority: 100,
                },
              ],
              totalCreaturesFound: 1,
              resultsByPack: {
                'SRD Monsters': 1,
              },
              criteria: {
                challengeRating: 3,
                limit: 100,
              },
              searchMethod: 'enhanced_persistent_index',
            },
          },
        });
      }

      return Promise.reject(new Error(`Unexpected query: ${method}`));
    });

    const systemRegistry = new SystemRegistry();
    systemRegistry.register(new DnD5eAdapter());

    const tools = new CompendiumTools({
      foundryClient: { query } as unknown as FoundryClient,
      logger: createLoggerStub(),
      systemRegistry,
    });

    const result = (await tools.handleListCreaturesByCriteria({
      challengeRating: 3,
    })) as Record<string, unknown>;

    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.listCreaturesByCriteria', {
      challengeRating: 3,
      limit: 100,
    });
    expect(result.creatures).toMatchObject([
      {
        id: 'owlbear',
        name: 'Owlbear',
      },
    ]);
    expect(result.searchSummary).toMatchObject({
      packsSearched: 1,
      totalCreaturesFound: 1,
      searchMethod: 'enhanced_persistent_index',
    });
  });
});
