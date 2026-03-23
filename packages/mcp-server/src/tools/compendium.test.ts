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

  it('uses the shared create-world-item bridge request shape', async () => {
    const query = vi.fn().mockImplementation((method: string, data?: unknown) => {
      if (method === 'foundry-mcp-bridge.createWorldItem') {
        expect(data).toEqual({
          itemData: {
            name: 'Storm Sigil',
            type: 'feat',
            system: {
              description: {
                value: '<p>Homebrew feat</p>',
              },
            },
          },
          reason: 'homebrew authoring',
        });
        return Promise.resolve({
          success: true,
          itemId: 'world-item-1',
          itemName: 'Storm Sigil',
          itemType: 'feat',
          createdFrom: 'raw',
        });
      }

      return Promise.reject(new Error(`Unexpected query: ${method}`));
    });

    const tools = new CompendiumTools({
      foundryClient: { query } as unknown as FoundryClient,
      logger: createLoggerStub(),
      systemRegistry: new SystemRegistry(),
    });

    const result = (await tools.handleCreateWorldItem({
      itemData: {
        name: 'Storm Sigil',
        type: 'feat',
        system: {
          description: {
            value: '<p>Homebrew feat</p>',
          },
        },
      },
      reason: 'homebrew authoring',
    })) as Record<string, unknown>;

    expect(result).toMatchObject({
      success: true,
      item: {
        id: 'world-item-1',
        name: 'Storm Sigil',
        type: 'feat',
      },
      createdFrom: 'raw',
    });
  });

  it('uses the shared update-world-item bridge request shape', async () => {
    const query = vi.fn().mockImplementation((method: string, data?: unknown) => {
      if (method === 'foundry-mcp-bridge.updateWorldItem') {
        expect(data).toEqual({
          itemIdentifier: 'Storm Sigil',
          updates: {
            'system.description.value': '<p>Updated feat text</p>',
          },
        });
        return Promise.resolve({
          success: true,
          itemId: 'world-item-1',
          itemName: 'Storm Sigil',
          itemType: 'feat',
          appliedUpdates: {
            'system.description.value': '<p>Updated feat text</p>',
          },
          updatedFields: ['system.description.value'],
        });
      }

      return Promise.reject(new Error(`Unexpected query: ${method}`));
    });

    const tools = new CompendiumTools({
      foundryClient: { query } as unknown as FoundryClient,
      logger: createLoggerStub(),
      systemRegistry: new SystemRegistry(),
    });

    const result = (await tools.handleUpdateWorldItem({
      itemIdentifier: 'Storm Sigil',
      updates: {
        'system.description.value': '<p>Updated feat text</p>',
      },
    })) as Record<string, unknown>;

    expect(result).toMatchObject({
      success: true,
      item: {
        id: 'world-item-1',
        name: 'Storm Sigil',
        type: 'feat',
      },
      updatedFields: ['system.description.value'],
    });
  });

  it('uses the shared create-compendium-item bridge request shape', async () => {
    const query = vi.fn().mockImplementation((method: string, data?: unknown) => {
      if (method === 'foundry-mcp-bridge.createCompendiumItem') {
        expect(data).toEqual({
          packId: 'world.homebrew-items',
          sourceUuid: 'Compendium.dnd5e.items.wandOfMagicMissiles',
          overrides: {
            name: 'Wand of Tempest Bolts',
          },
        });
        return Promise.resolve({
          success: true,
          packId: 'world.homebrew-items',
          packLabel: 'Homebrew Items',
          itemId: 'comp-item-1',
          itemName: 'Wand of Tempest Bolts',
          itemType: 'consumable',
          createdFrom: 'uuid',
          sourceUuid: 'Compendium.dnd5e.items.wandOfMagicMissiles',
          appliedOverrides: {
            name: 'Wand of Tempest Bolts',
          },
        });
      }

      return Promise.reject(new Error(`Unexpected query: ${method}`));
    });

    const tools = new CompendiumTools({
      foundryClient: { query } as unknown as FoundryClient,
      logger: createLoggerStub(),
      systemRegistry: new SystemRegistry(),
    });

    const result = (await tools.handleCreateCompendiumItem({
      packId: 'world.homebrew-items',
      sourceUuid: 'Compendium.dnd5e.items.wandOfMagicMissiles',
      overrides: {
        name: 'Wand of Tempest Bolts',
      },
    })) as Record<string, unknown>;

    expect(result).toMatchObject({
      success: true,
      pack: {
        id: 'world.homebrew-items',
        label: 'Homebrew Items',
      },
      item: {
        id: 'comp-item-1',
        name: 'Wand of Tempest Bolts',
      },
      createdFrom: 'uuid',
    });
  });

  it('uses the shared import-item-to-compendium bridge request shape', async () => {
    const query = vi.fn().mockImplementation((method: string, data?: unknown) => {
      if (method === 'foundry-mcp-bridge.importItemToCompendium') {
        expect(data).toEqual({
          itemIdentifier: 'Storm Sigil',
          packId: 'world.homebrew-items',
        });
        return Promise.resolve({
          success: true,
          sourceItemId: 'world-item-1',
          sourceItemName: 'Storm Sigil',
          sourceItemType: 'feat',
          packId: 'world.homebrew-items',
          packLabel: 'Homebrew Items',
          itemId: 'comp-item-2',
          itemName: 'Storm Sigil',
          itemType: 'feat',
        });
      }

      return Promise.reject(new Error(`Unexpected query: ${method}`));
    });

    const tools = new CompendiumTools({
      foundryClient: { query } as unknown as FoundryClient,
      logger: createLoggerStub(),
      systemRegistry: new SystemRegistry(),
    });

    const result = (await tools.handleImportItemToCompendium({
      itemIdentifier: 'Storm Sigil',
      packId: 'world.homebrew-items',
    })) as Record<string, unknown>;

    expect(result).toMatchObject({
      success: true,
      sourceItem: {
        id: 'world-item-1',
        name: 'Storm Sigil',
        type: 'feat',
      },
      pack: {
        id: 'world.homebrew-items',
        label: 'Homebrew Items',
      },
      item: {
        id: 'comp-item-2',
        name: 'Storm Sigil',
        type: 'feat',
      },
    });
  });
});
