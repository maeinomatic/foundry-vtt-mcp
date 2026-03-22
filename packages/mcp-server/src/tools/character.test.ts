import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { FoundryClient } from '../foundry-client.js';
import type { Logger } from '../logger.js';
import { DnD5eAdapter } from '../systems/dnd5e/adapter.js';
import { PF2eAdapter } from '../systems/pf2e/adapter.js';
import { SystemRegistry } from '../systems/system-registry.js';
import { clearSystemCache } from '../utils/system-detection.js';
import { CharacterTools } from './character.js';

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

describe('CharacterTools', () => {
  beforeEach(() => {
    clearSystemCache();
  });

  it('uses the shared character-info bridge request shape', async () => {
    const query = vi.fn().mockImplementation((method: string, data?: unknown) => {
      if (method === 'foundry-mcp-bridge.getCharacterInfo') {
        expect(data).toEqual({ identifier: 'Aldric' });
        return Promise.resolve({
          id: 'actor-1',
          name: 'Aldric',
          type: 'character',
          system: {},
          items: [],
          effects: [],
        });
      }

      return Promise.reject(new Error(`Unexpected query: ${method}`));
    });

    const tools = new CharacterTools({
      foundryClient: { query } as unknown as FoundryClient,
      logger: createLoggerStub(),
    });

    const result = (await tools.handleGetCharacter({
      identifier: 'Aldric',
    })) as Record<string, unknown>;

    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.getCharacterInfo', {
      identifier: 'Aldric',
    });
    expect(result).toMatchObject({
      id: 'actor-1',
      name: 'Aldric',
      type: 'character',
      items: [],
      effects: [],
    });
  });

  it('uses the shared search-character-items bridge request shape with default limit', async () => {
    const query = vi.fn().mockImplementation((method: string, data?: unknown) => {
      if (method === 'foundry-mcp-bridge.searchCharacterItems') {
        expect(data).toEqual({
          characterIdentifier: 'Aldric',
          query: 'sword',
          type: 'weapon',
          limit: 20,
        });
        return Promise.resolve({
          characterId: 'actor-1',
          characterName: 'Aldric',
          query: 'sword',
          type: 'weapon',
          matches: [
            {
              id: 'item-1',
              name: 'Longsword',
              type: 'weapon',
            },
          ],
          totalMatches: 1,
        });
      }

      return Promise.reject(new Error(`Unexpected query: ${method}`));
    });

    const tools = new CharacterTools({
      foundryClient: { query } as unknown as FoundryClient,
      logger: createLoggerStub(),
    });

    const result = await tools.handleSearchCharacterItems({
      characterIdentifier: 'Aldric',
      query: 'sword',
      type: 'weapon',
    });

    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.searchCharacterItems', {
      characterIdentifier: 'Aldric',
      query: 'sword',
      type: 'weapon',
      limit: 20,
    });
    expect(result).toMatchObject({
      characterId: 'actor-1',
      characterName: 'Aldric',
      totalMatches: 1,
    });
  });

  it('uses the shared add-character-item bridge request shape', async () => {
    const query = vi.fn().mockImplementation((method: string, data?: unknown) => {
      if (method === 'foundry-mcp-bridge.createActorEmbeddedItem') {
        expect(data).toEqual({
          actorIdentifier: 'Aldric',
          sourceUuid: 'Compendium.dnd5e.items.Item.longsword',
          itemType: 'weapon',
          overrides: {
            system: {
              quantity: 2,
            },
          },
        });
        return Promise.resolve({
          success: true,
          actorId: 'actor-1',
          actorName: 'Aldric',
          itemId: 'item-weapon-1',
          itemName: 'Longsword',
          itemType: 'weapon',
          createdFrom: 'uuid',
          sourceUuid: 'Compendium.dnd5e.items.Item.longsword',
          appliedOverrides: {
            system: {
              quantity: 2,
            },
          },
        });
      }

      return Promise.reject(new Error(`Unexpected query: ${method}`));
    });

    const tools = new CharacterTools({
      foundryClient: { query } as unknown as FoundryClient,
      logger: createLoggerStub(),
    });

    const result = (await tools.handleAddCharacterItem({
      actorIdentifier: 'Aldric',
      sourceUuid: 'Compendium.dnd5e.items.Item.longsword',
      itemType: 'weapon',
      overrides: {
        system: {
          quantity: 2,
        },
      },
    })) as Record<string, unknown>;

    expect(result).toMatchObject({
      success: true,
      actor: {
        id: 'actor-1',
        name: 'Aldric',
      },
      item: {
        id: 'item-weapon-1',
        name: 'Longsword',
        type: 'weapon',
      },
      createdFrom: 'uuid',
    });
  });

  it('uses the shared update-character-item bridge request shape', async () => {
    const query = vi.fn().mockImplementation((method: string, data?: unknown) => {
      if (method === 'foundry-mcp-bridge.updateActorEmbeddedItem') {
        expect(data).toEqual({
          actorIdentifier: 'Aldric',
          itemIdentifier: 'Longsword',
          itemType: 'weapon',
          updates: {
            'system.quantity': 3,
          },
        });
        return Promise.resolve({
          success: true,
          actorId: 'actor-1',
          actorName: 'Aldric',
          itemId: 'item-weapon-1',
          itemName: 'Longsword',
          itemType: 'weapon',
          appliedUpdates: {
            'system.quantity': 3,
          },
          updatedFields: ['system.quantity'],
        });
      }

      return Promise.reject(new Error(`Unexpected query: ${method}`));
    });

    const tools = new CharacterTools({
      foundryClient: { query } as unknown as FoundryClient,
      logger: createLoggerStub(),
    });

    const result = (await tools.handleUpdateCharacterItem({
      actorIdentifier: 'Aldric',
      itemIdentifier: 'Longsword',
      itemType: 'weapon',
      updates: {
        'system.quantity': 3,
      },
    })) as Record<string, unknown>;

    expect(result).toMatchObject({
      success: true,
      item: {
        id: 'item-weapon-1',
        name: 'Longsword',
        type: 'weapon',
      },
      updatedFields: ['system.quantity'],
    });
  });

  it('uses the shared remove-character-item bridge request shape', async () => {
    const query = vi.fn().mockImplementation((method: string, data?: unknown) => {
      if (method === 'foundry-mcp-bridge.deleteActorEmbeddedItem') {
        expect(data).toEqual({
          actorIdentifier: 'Aldric',
          itemIdentifier: 'Longsword',
          itemType: 'weapon',
        });
        return Promise.resolve({
          success: true,
          actorId: 'actor-1',
          actorName: 'Aldric',
          itemId: 'item-weapon-1',
          itemName: 'Longsword',
          itemType: 'weapon',
        });
      }

      return Promise.reject(new Error(`Unexpected query: ${method}`));
    });

    const tools = new CharacterTools({
      foundryClient: { query } as unknown as FoundryClient,
      logger: createLoggerStub(),
    });

    const result = (await tools.handleRemoveCharacterItem({
      actorIdentifier: 'Aldric',
      itemIdentifier: 'Longsword',
      itemType: 'weapon',
    })) as Record<string, unknown>;

    expect(result).toMatchObject({
      success: true,
      item: {
        id: 'item-weapon-1',
        name: 'Longsword',
        type: 'weapon',
      },
      removed: true,
    });
  });

  it('learns a DnD5e spell through the generic item-create bridge', async () => {
    const query = vi.fn().mockImplementation((method: string, data?: unknown) => {
      if (method === 'foundry-mcp-bridge.getWorldInfo') {
        return Promise.resolve({ system: 'dnd5e' });
      }

      if (method === 'foundry-mcp-bridge.getCharacterInfo') {
        expect(data).toEqual({ identifier: 'Laeral' });
        return Promise.resolve({
          id: 'actor-3',
          name: 'Laeral',
          type: 'character',
          system: {},
          items: [
            {
              id: 'class-wizard',
              name: 'Wizard',
              type: 'class',
              system: {
                spellcasting: {
                  progression: 'full',
                  type: 'prepared',
                },
              },
            },
          ],
          effects: [],
        });
      }

      if (method === 'foundry-mcp-bridge.createActorEmbeddedItem') {
        expect(data).toEqual({
          actorIdentifier: 'Laeral',
          sourceUuid: 'Compendium.dnd5e.spells.Item.fireball',
          itemType: 'spell',
          overrides: {
            system: {
              preparation: {
                prepared: false,
              },
              sourceClass: 'class-wizard',
            },
          },
        });
        return Promise.resolve({
          success: true,
          actorId: 'actor-3',
          actorName: 'Laeral',
          itemId: 'spell-1',
          itemName: 'Fireball',
          itemType: 'spell',
          createdFrom: 'uuid',
        });
      }

      return Promise.reject(new Error(`Unexpected query: ${method}`));
    });

    const tools = new CharacterTools({
      foundryClient: { query } as unknown as FoundryClient,
      logger: createLoggerStub(),
    });

    const result = (await tools.handleLearnDnD5eSpell({
      actorIdentifier: 'Laeral',
      spellUuid: 'Compendium.dnd5e.spells.Item.fireball',
      prepared: false,
      sourceClass: 'Wizard',
    })) as Record<string, unknown>;

    expect(result).toMatchObject({
      success: true,
      spell: {
        id: 'spell-1',
        name: 'Fireball',
      },
      prepared: false,
      sourceClass: {
        id: 'class-wizard',
        name: 'Wizard',
      },
    });
  });

  it('updates DnD5e spell preparation through the shared item-update bridge', async () => {
    const query = vi.fn().mockImplementation((method: string, data?: unknown) => {
      if (method === 'foundry-mcp-bridge.getWorldInfo') {
        return Promise.resolve({ system: 'dnd5e' });
      }

      if (method === 'foundry-mcp-bridge.updateActorEmbeddedItem') {
        expect(data).toEqual({
          actorIdentifier: 'Laeral',
          itemIdentifier: 'Fireball',
          itemType: 'spell',
          updates: {
            'system.preparation.prepared': true,
          },
        });
        return Promise.resolve({
          success: true,
          actorId: 'actor-3',
          actorName: 'Laeral',
          itemId: 'spell-1',
          itemName: 'Fireball',
          itemType: 'spell',
          appliedUpdates: {
            'system.preparation.prepared': true,
          },
          updatedFields: ['system.preparation.prepared'],
        });
      }

      return Promise.reject(new Error(`Unexpected query: ${method}`));
    });

    const tools = new CharacterTools({
      foundryClient: { query } as unknown as FoundryClient,
      logger: createLoggerStub(),
    });

    const result = (await tools.handlePrepareDnD5eSpell({
      actorIdentifier: 'Laeral',
      spellIdentifier: 'Fireball',
      prepared: true,
    })) as Record<string, unknown>;

    expect(result).toMatchObject({
      success: true,
      spell: {
        id: 'spell-1',
        name: 'Fireball',
      },
      prepared: true,
      updatedFields: ['system.preparation.prepared'],
    });
  });

  it('forgets a DnD5e spell through the shared item-delete bridge', async () => {
    const query = vi.fn().mockImplementation((method: string, data?: unknown) => {
      if (method === 'foundry-mcp-bridge.getWorldInfo') {
        return Promise.resolve({ system: 'dnd5e' });
      }

      if (method === 'foundry-mcp-bridge.deleteActorEmbeddedItem') {
        expect(data).toEqual({
          actorIdentifier: 'Laeral',
          itemIdentifier: 'Fireball',
          itemType: 'spell',
        });
        return Promise.resolve({
          success: true,
          actorId: 'actor-3',
          actorName: 'Laeral',
          itemId: 'spell-1',
          itemName: 'Fireball',
          itemType: 'spell',
        });
      }

      return Promise.reject(new Error(`Unexpected query: ${method}`));
    });

    const tools = new CharacterTools({
      foundryClient: { query } as unknown as FoundryClient,
      logger: createLoggerStub(),
    });

    const result = (await tools.handleForgetDnD5eSpell({
      actorIdentifier: 'Laeral',
      spellIdentifier: 'Fireball',
    })) as Record<string, unknown>;

    expect(result).toMatchObject({
      success: true,
      spell: {
        id: 'spell-1',
        name: 'Fireball',
      },
      removed: true,
    });
  });

  it('updates DnD5e spell slots through the shared actor-update bridge', async () => {
    const query = vi.fn().mockImplementation((method: string, data?: unknown) => {
      if (method === 'foundry-mcp-bridge.getWorldInfo') {
        return Promise.resolve({ system: 'dnd5e' });
      }

      if (method === 'foundry-mcp-bridge.updateActor') {
        expect(data).toEqual({
          identifier: 'Laeral',
          updates: {
            'system.spells.spell3.value': 2,
            'system.spells.spell3.override': 3,
          },
        });
        return Promise.resolve({
          success: true,
          actorId: 'actor-3',
          actorName: 'Laeral',
          actorType: 'character',
          appliedUpdates: {
            'system.spells.spell3.value': 2,
            'system.spells.spell3.override': 3,
          },
          updatedFields: ['system.spells.spell3.value', 'system.spells.spell3.override'],
        });
      }

      return Promise.reject(new Error(`Unexpected query: ${method}`));
    });

    const tools = new CharacterTools({
      foundryClient: { query } as unknown as FoundryClient,
      logger: createLoggerStub(),
    });

    const result = (await tools.handleSetDnD5eSpellSlots({
      actorIdentifier: 'Laeral',
      slot: 'level3',
      value: 2,
      override: 3,
    })) as Record<string, unknown>;

    expect(result).toMatchObject({
      success: true,
      actor: {
        id: 'actor-3',
        name: 'Laeral',
        type: 'character',
      },
      slot: 'level3',
      value: 2,
      override: 3,
      updatedFields: ['system.spells.spell3.value', 'system.spells.spell3.override'],
    });
  });

  it('reassigns a DnD5e spell to a concrete spellcasting class item', async () => {
    const query = vi.fn().mockImplementation((method: string, data?: unknown) => {
      if (method === 'foundry-mcp-bridge.getWorldInfo') {
        return Promise.resolve({ system: 'dnd5e' });
      }

      if (method === 'foundry-mcp-bridge.getCharacterInfo') {
        expect(data).toEqual({ identifier: 'Laeral' });
        return Promise.resolve({
          id: 'actor-3',
          name: 'Laeral',
          type: 'character',
          system: {},
          items: [
            {
              id: 'class-wizard',
              name: 'Wizard',
              type: 'class',
              system: {
                spellcasting: {
                  progression: 'full',
                  type: 'prepared',
                },
              },
            },
            {
              id: 'class-cleric',
              name: 'Cleric',
              type: 'class',
              system: {
                spellcasting: {
                  progression: 'full',
                  type: 'prepared',
                },
              },
            },
          ],
          effects: [],
        });
      }

      if (method === 'foundry-mcp-bridge.updateActorEmbeddedItem') {
        expect(data).toEqual({
          actorIdentifier: 'Laeral',
          itemIdentifier: 'Fireball',
          itemType: 'spell',
          updates: {
            'system.sourceClass': 'class-wizard',
          },
        });
        return Promise.resolve({
          success: true,
          actorId: 'actor-3',
          actorName: 'Laeral',
          itemId: 'spell-1',
          itemName: 'Fireball',
          itemType: 'spell',
          appliedUpdates: {
            'system.sourceClass': 'class-wizard',
          },
          updatedFields: ['system.sourceClass'],
        });
      }

      return Promise.reject(new Error(`Unexpected query: ${method}`));
    });

    const tools = new CharacterTools({
      foundryClient: { query } as unknown as FoundryClient,
      logger: createLoggerStub(),
    });

    const result = (await tools.handleReassignDnD5eSpellSourceClass({
      actorIdentifier: 'Laeral',
      spellIdentifier: 'Fireball',
      classIdentifier: 'Wizard',
    })) as Record<string, unknown>;

    expect(result).toMatchObject({
      success: true,
      spell: {
        id: 'spell-1',
        name: 'Fireball',
      },
      sourceClass: {
        id: 'class-wizard',
        name: 'Wizard',
      },
      updatedFields: ['system.sourceClass'],
    });
  });

  it('bulk reassigns DnD5e spells to concrete spellcasting classes through the batch item-update bridge', async () => {
    const query = vi.fn().mockImplementation((method: string, data?: unknown) => {
      if (method === 'foundry-mcp-bridge.getWorldInfo') {
        return Promise.resolve({ system: 'dnd5e' });
      }

      if (method === 'foundry-mcp-bridge.getCharacterInfo') {
        expect(data).toEqual({ identifier: 'Laeral' });
        return Promise.resolve({
          id: 'actor-3',
          name: 'Laeral',
          type: 'character',
          system: {},
          items: [
            {
              id: 'class-wizard',
              name: 'Wizard',
              type: 'class',
              system: {
                spellcasting: {
                  progression: 'full',
                  type: 'prepared',
                },
              },
            },
            {
              id: 'class-cleric',
              name: 'Cleric',
              type: 'class',
              system: {
                spellcasting: {
                  progression: 'full',
                  type: 'prepared',
                },
              },
            },
            {
              id: 'spell-fireball',
              name: 'Fireball',
              type: 'spell',
              system: {},
            },
            {
              id: 'spell-bless',
              name: 'Bless',
              type: 'spell',
              system: {},
            },
          ],
          effects: [],
        });
      }

      if (method === 'foundry-mcp-bridge.batchUpdateActorEmbeddedItems') {
        expect(data).toEqual({
          actorIdentifier: 'Laeral',
          updates: [
            {
              itemIdentifier: 'spell-fireball',
              itemType: 'spell',
              updates: {
                'system.sourceClass': 'class-wizard',
              },
            },
            {
              itemIdentifier: 'spell-bless',
              itemType: 'spell',
              updates: {
                'system.sourceClass': 'class-cleric',
              },
            },
          ],
        });
        return Promise.resolve({
          success: true,
          actorId: 'actor-3',
          actorName: 'Laeral',
          updatedItems: [
            {
              itemId: 'spell-fireball',
              itemName: 'Fireball',
              itemType: 'spell',
              appliedUpdates: {
                'system.sourceClass': 'class-wizard',
              },
              updatedFields: ['system.sourceClass'],
            },
            {
              itemId: 'spell-bless',
              itemName: 'Bless',
              itemType: 'spell',
              appliedUpdates: {
                'system.sourceClass': 'class-cleric',
              },
              updatedFields: ['system.sourceClass'],
            },
          ],
        });
      }

      return Promise.reject(new Error(`Unexpected query: ${method}`));
    });

    const tools = new CharacterTools({
      foundryClient: { query } as unknown as FoundryClient,
      logger: createLoggerStub(),
    });

    const result = (await tools.handleBulkReassignDnD5eSpellSourceClass({
      actorIdentifier: 'Laeral',
      assignments: [
        {
          spellIdentifier: 'Fireball',
          classIdentifier: 'Wizard',
        },
        {
          spellIdentifier: 'Bless',
          classIdentifier: 'Cleric',
        },
      ],
    })) as Record<string, unknown>;

    expect(result).toMatchObject({
      success: true,
      updatedCount: 2,
      updatedSpells: [
        {
          id: 'spell-fireball',
          name: 'Fireball',
          type: 'spell',
        },
        {
          id: 'spell-bless',
          name: 'Bless',
          type: 'spell',
        },
      ],
    });
  });

  it('sets DnD5e prepared spells in replace mode through the batch item-update bridge', async () => {
    const query = vi.fn().mockImplementation((method: string, data?: unknown) => {
      if (method === 'foundry-mcp-bridge.getWorldInfo') {
        return Promise.resolve({ system: 'dnd5e' });
      }

      if (method === 'foundry-mcp-bridge.getCharacterInfo') {
        expect(data).toEqual({ identifier: 'Laeral' });
        return Promise.resolve({
          id: 'actor-3',
          name: 'Laeral',
          type: 'character',
          system: {},
          items: [
            {
              id: 'class-wizard',
              name: 'Wizard',
              type: 'class',
              system: {
                spellcasting: {
                  progression: 'full',
                  type: 'prepared',
                },
              },
            },
            {
              id: 'spell-fireball',
              name: 'Fireball',
              type: 'spell',
              system: {
                sourceClass: 'class-wizard',
                preparation: {
                  prepared: true,
                },
              },
            },
            {
              id: 'spell-shield',
              name: 'Shield',
              type: 'spell',
              system: {
                sourceClass: 'class-wizard',
                preparation: {
                  prepared: true,
                },
              },
            },
            {
              id: 'spell-detect-magic',
              name: 'Detect Magic',
              type: 'spell',
              system: {
                sourceClass: 'class-wizard',
                preparation: {
                  prepared: false,
                },
              },
            },
          ],
          effects: [],
        });
      }

      if (method === 'foundry-mcp-bridge.batchUpdateActorEmbeddedItems') {
        expect(data).toEqual({
          actorIdentifier: 'Laeral',
          updates: [
            {
              itemIdentifier: 'spell-fireball',
              itemType: 'spell',
              updates: {
                'system.preparation.prepared': true,
              },
            },
            {
              itemIdentifier: 'spell-shield',
              itemType: 'spell',
              updates: {
                'system.preparation.prepared': false,
              },
            },
            {
              itemIdentifier: 'spell-detect-magic',
              itemType: 'spell',
              updates: {
                'system.preparation.prepared': true,
              },
            },
          ],
        });
        return Promise.resolve({
          success: true,
          actorId: 'actor-3',
          actorName: 'Laeral',
          updatedItems: [
            {
              itemId: 'spell-fireball',
              itemName: 'Fireball',
              itemType: 'spell',
              appliedUpdates: {
                'system.preparation.prepared': true,
              },
              updatedFields: ['system.preparation.prepared'],
            },
            {
              itemId: 'spell-shield',
              itemName: 'Shield',
              itemType: 'spell',
              appliedUpdates: {
                'system.preparation.prepared': false,
              },
              updatedFields: ['system.preparation.prepared'],
            },
            {
              itemId: 'spell-detect-magic',
              itemName: 'Detect Magic',
              itemType: 'spell',
              appliedUpdates: {
                'system.preparation.prepared': true,
              },
              updatedFields: ['system.preparation.prepared'],
            },
          ],
        });
      }

      return Promise.reject(new Error(`Unexpected query: ${method}`));
    });

    const tools = new CharacterTools({
      foundryClient: { query } as unknown as FoundryClient,
      logger: createLoggerStub(),
    });

    const result = (await tools.handleSetDnD5ePreparedSpells({
      actorIdentifier: 'Laeral',
      mode: 'replace',
      sourceClass: 'Wizard',
      spellIdentifiers: ['Fireball', 'Detect Magic'],
    })) as Record<string, unknown>;

    expect(result).toMatchObject({
      success: true,
      mode: 'replace',
      updatedCount: 3,
      sourceClass: {
        id: 'class-wizard',
        name: 'Wizard',
      },
    });
    expect((result as { updatedSpells?: unknown }).updatedSpells).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'spell-fireball',
          name: 'Fireball',
          prepared: true,
        }),
        expect.objectContaining({
          id: 'spell-shield',
          name: 'Shield',
          prepared: false,
        }),
        expect.objectContaining({
          id: 'spell-detect-magic',
          name: 'Detect Magic',
          prepared: true,
        }),
      ])
    );
  });

  it('validates a DnD5e spellbook for multiclass source-class issues', async () => {
    const query = vi.fn().mockImplementation((method: string, data?: unknown) => {
      if (method === 'foundry-mcp-bridge.getWorldInfo') {
        return Promise.resolve({ system: 'dnd5e' });
      }

      if (method === 'foundry-mcp-bridge.getCharacterInfo') {
        expect(data).toEqual({ identifier: 'Laeral' });
        return Promise.resolve({
          id: 'actor-3',
          name: 'Laeral',
          type: 'character',
          system: {},
          items: [
            {
              id: 'class-wizard',
              name: 'Wizard',
              type: 'class',
              system: {
                spellcasting: {
                  progression: 'full',
                  type: 'prepared',
                },
              },
            },
            {
              id: 'class-cleric',
              name: 'Cleric',
              type: 'class',
              system: {
                spellcasting: {
                  progression: 'full',
                  type: 'prepared',
                },
              },
            },
            {
              id: 'spell-fireball',
              name: 'Fireball',
              type: 'spell',
              system: {
                sourceClass: 'class-wizard',
                preparation: {
                  prepared: true,
                },
              },
            },
            {
              id: 'spell-shield',
              name: 'Shield',
              type: 'spell',
              system: {
                preparation: {
                  prepared: true,
                },
              },
            },
            {
              id: 'spell-bless',
              name: 'Bless',
              type: 'spell',
              system: {
                sourceClass: 'lost-class',
                preparation: {
                  prepared: false,
                },
              },
            },
          ],
          effects: [],
        });
      }

      return Promise.reject(new Error(`Unexpected query: ${method}`));
    });

    const tools = new CharacterTools({
      foundryClient: { query } as unknown as FoundryClient,
      logger: createLoggerStub(),
    });

    const result = (await tools.handleValidateDnD5eSpellbook({
      actorIdentifier: 'Laeral',
    })) as Record<string, unknown>;

    expect(result).toMatchObject({
      success: true,
      summary: {
        spellCount: 3,
        preparedSpellCount: 2,
        spellcastingClassCount: 2,
        multiclassSpellcaster: true,
        issueCount: 2,
      },
    });
    expect(result.classes).toEqual([
      {
        id: 'class-wizard',
        name: 'Wizard',
        spellcastingType: 'prepared',
        spellcastingProgression: 'full',
      },
      {
        id: 'class-cleric',
        name: 'Cleric',
        spellcastingType: 'prepared',
        spellcastingProgression: 'full',
      },
    ]);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'missing-source-class',
          spellId: 'spell-shield',
          spellName: 'Shield',
        }),
        expect.objectContaining({
          code: 'unknown-source-class',
          spellId: 'spell-bless',
          spellName: 'Bless',
          sourceClass: 'lost-class',
        }),
      ])
    );
  });

  it('exposes DnD5e progression preview as a dedicated tool response', async () => {
    const query = vi.fn().mockImplementation((method: string, data?: unknown) => {
      if (method === 'foundry-mcp-bridge.getCharacterInfo') {
        expect(data).toEqual({ identifier: 'Laeral' });
        return Promise.resolve({
          id: 'actor-3',
          name: 'Laeral',
          type: 'character',
          system: {},
          items: [
            {
              id: 'class-wizard',
              name: 'Wizard',
              type: 'class',
              system: {
                levels: 4,
                advancement: [{ type: 'ItemGrant' }],
              },
            },
          ],
          effects: [],
        });
      }

      if (method === 'foundry-mcp-bridge.getWorldInfo') {
        return Promise.resolve({ system: 'dnd5e' });
      }

      if (method === 'foundry-mcp-bridge.previewCharacterProgression') {
        expect(data).toEqual({
          actorIdentifier: 'Laeral',
          classIdentifier: 'Wizard',
          targetLevel: 5,
        });
        return Promise.resolve({
          system: 'dnd5e',
          actorId: 'actor-3',
          actorName: 'Laeral',
          actorType: 'character',
          classId: 'class-wizard',
          className: 'Wizard',
          currentLevel: 4,
          targetLevel: 5,
          safeToApplyDirectly: false,
          pendingSteps: [
            {
              id: 'class-wizard:ItemGrant:5:0',
              level: 5,
              type: 'ItemGrant',
              title: 'ItemGrant',
              required: true,
              choicesRequired: false,
              autoApplySafe: false,
            },
          ],
          warnings: [
            'DnD5e class advancement is system-managed. Changing class levels alone would bypass one or more advancement steps.',
          ],
        });
      }

      return Promise.reject(new Error(`Unexpected query: ${method}`));
    });

    const registry = new SystemRegistry();
    registry.register(new DnD5eAdapter());

    const tools = new CharacterTools({
      foundryClient: { query } as unknown as FoundryClient,
      logger: createLoggerStub(),
      systemRegistry: registry,
    });

    const result = (await tools.handlePreviewCharacterProgression({
      characterIdentifier: 'Laeral',
      classIdentifier: 'Wizard',
      targetLevel: 5,
    })) as Record<string, unknown>;

    expect(result).toMatchObject({
      success: true,
      safeToApplyDirectly: false,
      character: {
        id: 'actor-3',
        name: 'Laeral',
        type: 'character',
      },
      progression: {
        classId: 'class-wizard',
        className: 'Wizard',
        previousLevel: 4,
        targetLevel: 5,
        mode: 'set-class-levels',
      },
      pendingAdvancements: [
        {
          id: 'class-wizard:ItemGrant:5:0',
          level: 5,
          type: 'ItemGrant',
        },
      ],
    });
  });

  it('returns DnD5e advancement options for an ASI step', async () => {
    const query = vi.fn().mockImplementation((method: string, data?: unknown) => {
      if (method === 'foundry-mcp-bridge.getCharacterAdvancementOptions') {
        expect(data).toEqual({
          actorIdentifier: 'Laeral',
          classIdentifier: 'Wizard',
          targetLevel: 8,
          stepId: 'asi-step',
          query: 'war',
          limit: 10,
        });
        return Promise.resolve({
          system: 'dnd5e',
          actorId: 'actor-3',
          actorName: 'Laeral',
          actorType: 'character',
          targetLevel: 8,
          stepId: 'asi-step',
          stepType: 'AbilityScoreImprovement',
          stepTitle: 'Ability Score Improvement',
          classId: 'class-wizard',
          className: 'Wizard',
          choiceDetails: {
            kind: 'ability-score-improvement',
            optionQuerySupported: true,
            featChoiceAvailable: true,
            points: 2,
          },
          options: [
            {
              id: 'asi',
              name: 'Ability Score Improvement',
              type: 'ability-score-improvement',
              source: 'synthetic',
            },
            {
              id: 'feat-war-caster',
              name: 'War Caster',
              type: 'feat',
              source: 'compendium',
              uuid: 'Compendium.dnd5e.feats.Item.feat-war-caster',
              packId: 'dnd5e.feats',
            },
          ],
          totalOptions: 2,
        });
      }

      return Promise.reject(new Error(`Unexpected query: ${method}`));
    });

    const tools = new CharacterTools({
      foundryClient: { query } as unknown as FoundryClient,
      logger: createLoggerStub(),
    });

    const result = (await tools.handleGetCharacterAdvancementOptions({
      characterIdentifier: 'Laeral',
      classIdentifier: 'Wizard',
      targetLevel: 8,
      stepId: 'asi-step',
      query: 'war',
      limit: 10,
    })) as Record<string, unknown>;

    expect(result).toMatchObject({
      success: true,
      character: {
        id: 'actor-3',
        name: 'Laeral',
        type: 'character',
      },
      step: {
        id: 'asi-step',
        type: 'AbilityScoreImprovement',
        title: 'Ability Score Improvement',
      },
      totalOptions: 2,
      classId: 'class-wizard',
      className: 'Wizard',
      options: [
        {
          id: 'asi',
          type: 'ability-score-improvement',
        },
        {
          id: 'feat-war-caster',
          type: 'feat',
        },
      ],
    });
  });

  it('applies a DnD5e ASI choice and refreshes the remaining progression state', async () => {
    const query = vi.fn().mockImplementation((method: string, data?: unknown) => {
      if (method === 'foundry-mcp-bridge.applyCharacterAdvancementChoice') {
        expect(data).toEqual({
          actorIdentifier: 'Laeral',
          classIdentifier: 'Wizard',
          targetLevel: 8,
          stepId: 'asi-step',
          choice: {
            type: 'ability-score-improvement',
            mode: 'asi',
            assignments: {
              int: 2,
            },
          },
        });
        return Promise.resolve({
          success: true,
          system: 'dnd5e',
          actorId: 'actor-3',
          actorName: 'Laeral',
          actorType: 'character',
          targetLevel: 8,
          stepId: 'asi-step',
          stepType: 'AbilityScoreImprovement',
          stepTitle: 'Ability Score Improvement',
          classId: 'class-wizard',
          className: 'Wizard',
          choice: {
            type: 'ability-score-improvement',
            mode: 'asi',
            assignments: {
              int: 2,
            },
          },
        });
      }

      if (method === 'foundry-mcp-bridge.previewCharacterProgression') {
        expect(data).toEqual({
          actorIdentifier: 'Laeral',
          classIdentifier: 'Wizard',
          targetLevel: 8,
        });
        return Promise.resolve({
          system: 'dnd5e',
          actorId: 'actor-3',
          actorName: 'Laeral',
          actorType: 'character',
          classId: 'class-wizard',
          className: 'Wizard',
          currentLevel: 7,
          targetLevel: 8,
          safeToApplyDirectly: true,
          pendingSteps: [],
        });
      }

      return Promise.reject(new Error(`Unexpected query: ${method}`));
    });

    const tools = new CharacterTools({
      foundryClient: { query } as unknown as FoundryClient,
      logger: createLoggerStub(),
    });

    const result = (await tools.handleApplyCharacterAdvancementChoice({
      characterIdentifier: 'Laeral',
      classIdentifier: 'Wizard',
      targetLevel: 8,
      stepId: 'asi-step',
      choice: {
        type: 'ability-score-improvement',
        mode: 'asi',
        assignments: {
          int: 2,
        },
      },
    })) as Record<string, unknown>;

    expect(result).toMatchObject({
      success: true,
      character: {
        id: 'actor-3',
        name: 'Laeral',
        type: 'character',
      },
      step: {
        id: 'asi-step',
        type: 'AbilityScoreImprovement',
        title: 'Ability Score Improvement',
      },
      classId: 'class-wizard',
      className: 'Wizard',
      safeToApplyDirectly: true,
      remainingPendingAdvancements: [],
    });
    expect(result.nextStep).toContain('update-character-progression');
  });

  it('applies a DnD5e feat choice and reports created feat items', async () => {
    const query = vi.fn().mockImplementation((method: string, data?: unknown) => {
      if (method === 'foundry-mcp-bridge.applyCharacterAdvancementChoice') {
        expect(data).toEqual({
          actorIdentifier: 'Laeral',
          classIdentifier: 'Wizard',
          targetLevel: 8,
          stepId: 'asi-step',
          choice: {
            type: 'ability-score-improvement',
            mode: 'feat',
            featUuid: 'Compendium.dnd5e.feats.Item.feat-war-caster',
          },
        });
        return Promise.resolve({
          success: true,
          system: 'dnd5e',
          actorId: 'actor-3',
          actorName: 'Laeral',
          actorType: 'character',
          targetLevel: 8,
          stepId: 'asi-step',
          stepType: 'AbilityScoreImprovement',
          stepTitle: 'Ability Score Improvement',
          classId: 'class-wizard',
          className: 'Wizard',
          choice: {
            type: 'ability-score-improvement',
            mode: 'feat',
            featUuid: 'Compendium.dnd5e.feats.Item.feat-war-caster',
          },
          createdItemIds: ['item-feat-1'],
        });
      }

      if (method === 'foundry-mcp-bridge.previewCharacterProgression') {
        return Promise.resolve({
          system: 'dnd5e',
          actorId: 'actor-3',
          actorName: 'Laeral',
          actorType: 'character',
          classId: 'class-wizard',
          className: 'Wizard',
          currentLevel: 7,
          targetLevel: 8,
          safeToApplyDirectly: false,
          pendingSteps: [
            {
              id: 'subclass-step',
              level: 8,
              type: 'Subclass',
              title: 'Arcane Tradition',
              required: true,
              choicesRequired: true,
              autoApplySafe: false,
            },
          ],
        });
      }

      return Promise.reject(new Error(`Unexpected query: ${method}`));
    });

    const tools = new CharacterTools({
      foundryClient: { query } as unknown as FoundryClient,
      logger: createLoggerStub(),
    });

    const result = (await tools.handleApplyCharacterAdvancementChoice({
      characterIdentifier: 'Laeral',
      classIdentifier: 'Wizard',
      targetLevel: 8,
      stepId: 'asi-step',
      choice: {
        type: 'ability-score-improvement',
        mode: 'feat',
        featUuid: 'Compendium.dnd5e.feats.Item.feat-war-caster',
      },
    })) as Record<string, unknown>;

    expect(result).toMatchObject({
      success: true,
      createdItemIds: ['item-feat-1'],
      safeToApplyDirectly: false,
      remainingPendingAdvancements: [
        {
          id: 'subclass-step',
          type: 'Subclass',
        },
      ],
    });
    expect(result.nextStep).toContain('remaining advancement choices');
  });

  it('applies a DnD5e subclass choice and exposes subclass-owned follow-up advancement steps', async () => {
    const query = vi.fn().mockImplementation((method: string, data?: unknown) => {
      if (method === 'foundry-mcp-bridge.applyCharacterAdvancementChoice') {
        expect(data).toEqual({
          actorIdentifier: 'Laeral',
          classIdentifier: 'Wizard',
          targetLevel: 8,
          stepId: 'subclass-step',
          choice: {
            type: 'subclass',
            subclassUuid: 'Compendium.dnd5e.subclasses.Item.evocation',
          },
        });
        return Promise.resolve({
          success: true,
          system: 'dnd5e',
          actorId: 'actor-3',
          actorName: 'Laeral',
          actorType: 'character',
          targetLevel: 8,
          stepId: 'subclass-step',
          stepType: 'Subclass',
          stepTitle: 'Arcane Tradition',
          classId: 'class-wizard',
          className: 'Wizard',
          choice: {
            type: 'subclass',
            subclassUuid: 'Compendium.dnd5e.subclasses.Item.evocation',
          },
          createdItemIds: ['item-subclass-1'],
        });
      }

      if (method === 'foundry-mcp-bridge.previewCharacterProgression') {
        return Promise.resolve({
          system: 'dnd5e',
          actorId: 'actor-3',
          actorName: 'Laeral',
          actorType: 'character',
          classId: 'class-wizard',
          className: 'Wizard',
          currentLevel: 7,
          targetLevel: 8,
          safeToApplyDirectly: false,
          pendingSteps: [
            {
              id: 'item-subclass-1:ItemGrant:8:0',
              level: 8,
              type: 'ItemGrant',
              title: 'Grant Feature',
              required: true,
              choicesRequired: false,
              autoApplySafe: true,
              sourceItemId: 'item-subclass-1',
              sourceItemName: 'School of Evocation',
              sourceItemType: 'subclass',
            },
          ],
        });
      }

      return Promise.reject(new Error(`Unexpected query: ${method}`));
    });

    const tools = new CharacterTools({
      foundryClient: { query } as unknown as FoundryClient,
      logger: createLoggerStub(),
    });

    const result = (await tools.handleApplyCharacterAdvancementChoice({
      characterIdentifier: 'Laeral',
      classIdentifier: 'Wizard',
      targetLevel: 8,
      stepId: 'subclass-step',
      choice: {
        type: 'subclass',
        subclassUuid: 'Compendium.dnd5e.subclasses.Item.evocation',
      },
    })) as Record<string, unknown>;

    expect(result).toMatchObject({
      success: true,
      createdItemIds: ['item-subclass-1'],
      safeToApplyDirectly: false,
      step: {
        id: 'subclass-step',
        type: 'Subclass',
      },
      remainingPendingAdvancements: [
        {
          id: 'item-subclass-1:ItemGrant:8:0',
          type: 'ItemGrant',
          sourceItemId: 'item-subclass-1',
          sourceItemName: 'School of Evocation',
          sourceItemType: 'subclass',
        },
      ],
    });
  });

  it('applies a DnD5e item-grant choice through the shared progression bridge', async () => {
    const query = vi.fn().mockImplementation((method: string, data?: unknown) => {
      if (method === 'foundry-mcp-bridge.applyCharacterAdvancementChoice') {
        expect(data).toEqual({
          actorIdentifier: 'Laeral',
          classIdentifier: 'Wizard',
          targetLevel: 8,
          stepId: 'item-subclass-1:ItemGrant:8:0',
          choice: {
            type: 'item-grant',
          },
        });
        return Promise.resolve({
          success: true,
          system: 'dnd5e',
          actorId: 'actor-3',
          actorName: 'Laeral',
          actorType: 'character',
          targetLevel: 8,
          stepId: 'item-subclass-1:ItemGrant:8:0',
          stepType: 'ItemGrant',
          stepTitle: 'Grant Feature',
          classId: 'class-wizard',
          className: 'Wizard',
          choice: {
            type: 'item-grant',
            itemUuids: ['Compendium.dnd5e.classfeatures.Item.evocation-savant'],
          },
          createdItemIds: ['item-feature-2'],
        });
      }

      if (method === 'foundry-mcp-bridge.previewCharacterProgression') {
        return Promise.resolve({
          system: 'dnd5e',
          actorId: 'actor-3',
          actorName: 'Laeral',
          actorType: 'character',
          classId: 'class-wizard',
          className: 'Wizard',
          currentLevel: 7,
          targetLevel: 8,
          safeToApplyDirectly: true,
          pendingSteps: [],
        });
      }

      return Promise.reject(new Error(`Unexpected query: ${method}`));
    });

    const tools = new CharacterTools({
      foundryClient: { query } as unknown as FoundryClient,
      logger: createLoggerStub(),
    });

    const result = (await tools.handleApplyCharacterAdvancementChoice({
      characterIdentifier: 'Laeral',
      classIdentifier: 'Wizard',
      targetLevel: 8,
      stepId: 'item-subclass-1:ItemGrant:8:0',
      choice: {
        type: 'item-grant',
      },
    })) as Record<string, unknown>;

    expect(result).toMatchObject({
      success: true,
      createdItemIds: ['item-feature-2'],
      safeToApplyDirectly: true,
      step: {
        id: 'item-subclass-1:ItemGrant:8:0',
        type: 'ItemGrant',
      },
      choice: {
        type: 'item-grant',
        itemUuids: ['Compendium.dnd5e.classfeatures.Item.evocation-savant'],
      },
    });
  });

  it('applies a DnD5e trait choice through the shared progression bridge', async () => {
    const query = vi.fn().mockImplementation((method: string, data?: unknown) => {
      if (method === 'foundry-mcp-bridge.applyCharacterAdvancementChoice') {
        expect(data).toEqual({
          actorIdentifier: 'Laeral',
          classIdentifier: 'Wizard',
          targetLevel: 8,
          stepId: 'trait-step',
          choice: {
            type: 'trait',
            selected: ['arc', 'his'],
          },
        });
        return Promise.resolve({
          success: true,
          system: 'dnd5e',
          actorId: 'actor-3',
          actorName: 'Laeral',
          actorType: 'character',
          targetLevel: 8,
          stepId: 'trait-step',
          stepType: 'Trait',
          stepTitle: 'Bonus Proficiencies',
          classId: 'class-wizard',
          className: 'Wizard',
          choice: {
            type: 'trait',
            selected: ['arc', 'his'],
          },
        });
      }

      if (method === 'foundry-mcp-bridge.previewCharacterProgression') {
        return Promise.resolve({
          system: 'dnd5e',
          actorId: 'actor-3',
          actorName: 'Laeral',
          actorType: 'character',
          classId: 'class-wizard',
          className: 'Wizard',
          currentLevel: 7,
          targetLevel: 8,
          safeToApplyDirectly: true,
          pendingSteps: [],
        });
      }

      return Promise.reject(new Error(`Unexpected query: ${method}`));
    });

    const tools = new CharacterTools({
      foundryClient: { query } as unknown as FoundryClient,
      logger: createLoggerStub(),
    });

    const result = (await tools.handleApplyCharacterAdvancementChoice({
      characterIdentifier: 'Laeral',
      classIdentifier: 'Wizard',
      targetLevel: 8,
      stepId: 'trait-step',
      choice: {
        type: 'trait',
        selected: ['arc', 'his'],
      },
    })) as Record<string, unknown>;

    expect(result).toMatchObject({
      success: true,
      safeToApplyDirectly: true,
      step: {
        id: 'trait-step',
        type: 'Trait',
      },
      choice: {
        type: 'trait',
        selected: ['arc', 'his'],
      },
    });
  });

  it('applies a DnD5e size choice through the shared progression bridge', async () => {
    const query = vi.fn().mockImplementation((method: string, data?: unknown) => {
      if (method === 'foundry-mcp-bridge.applyCharacterAdvancementChoice') {
        expect(data).toEqual({
          actorIdentifier: 'Laeral',
          classIdentifier: 'Wizard',
          targetLevel: 8,
          stepId: 'size-step',
          choice: {
            type: 'size',
            size: 'med',
          },
        });
        return Promise.resolve({
          success: true,
          system: 'dnd5e',
          actorId: 'actor-3',
          actorName: 'Laeral',
          actorType: 'character',
          targetLevel: 8,
          stepId: 'size-step',
          stepType: 'Size',
          stepTitle: 'Size',
          classId: 'class-wizard',
          className: 'Wizard',
          choice: {
            type: 'size',
            size: 'med',
          },
        });
      }

      if (method === 'foundry-mcp-bridge.previewCharacterProgression') {
        return Promise.resolve({
          system: 'dnd5e',
          actorId: 'actor-3',
          actorName: 'Laeral',
          actorType: 'character',
          classId: 'class-wizard',
          className: 'Wizard',
          currentLevel: 7,
          targetLevel: 8,
          safeToApplyDirectly: true,
          pendingSteps: [],
        });
      }

      return Promise.reject(new Error(`Unexpected query: ${method}`));
    });

    const tools = new CharacterTools({
      foundryClient: { query } as unknown as FoundryClient,
      logger: createLoggerStub(),
    });

    const result = (await tools.handleApplyCharacterAdvancementChoice({
      characterIdentifier: 'Laeral',
      classIdentifier: 'Wizard',
      targetLevel: 8,
      stepId: 'size-step',
      choice: {
        type: 'size',
        size: 'med',
      },
    })) as Record<string, unknown>;

    expect(result).toMatchObject({
      success: true,
      safeToApplyDirectly: true,
      step: {
        id: 'size-step',
        type: 'Size',
      },
      choice: {
        type: 'size',
        size: 'med',
      },
    });
  });

  it('applies a DnD5e hit-point choice through the shared progression bridge', async () => {
    const query = vi.fn().mockImplementation((method: string, data?: unknown) => {
      if (method === 'foundry-mcp-bridge.applyCharacterAdvancementChoice') {
        expect(data).toEqual({
          actorIdentifier: 'Laeral',
          classIdentifier: 'Wizard',
          targetLevel: 8,
          stepId: 'hp-step',
          choice: {
            type: 'hit-points',
            mode: 'average',
          },
        });
        return Promise.resolve({
          success: true,
          system: 'dnd5e',
          actorId: 'actor-3',
          actorName: 'Laeral',
          actorType: 'character',
          targetLevel: 8,
          stepId: 'hp-step',
          stepType: 'HitPoints',
          stepTitle: 'Hit Points',
          classId: 'class-wizard',
          className: 'Wizard',
          choice: {
            type: 'hit-points',
            mode: 'average',
            totalHitPointGain: 6,
            constitutionModifier: 2,
          },
        });
      }

      if (method === 'foundry-mcp-bridge.previewCharacterProgression') {
        return Promise.resolve({
          system: 'dnd5e',
          actorId: 'actor-3',
          actorName: 'Laeral',
          actorType: 'character',
          classId: 'class-wizard',
          className: 'Wizard',
          currentLevel: 7,
          targetLevel: 8,
          safeToApplyDirectly: true,
          pendingSteps: [],
        });
      }

      return Promise.reject(new Error(`Unexpected query: ${method}`));
    });

    const tools = new CharacterTools({
      foundryClient: { query } as unknown as FoundryClient,
      logger: createLoggerStub(),
    });

    const result = (await tools.handleApplyCharacterAdvancementChoice({
      characterIdentifier: 'Laeral',
      classIdentifier: 'Wizard',
      targetLevel: 8,
      stepId: 'hp-step',
      choice: {
        type: 'hit-points',
        mode: 'average',
      },
    })) as Record<string, unknown>;

    expect(result).toMatchObject({
      success: true,
      safeToApplyDirectly: true,
      step: {
        id: 'hp-step',
        type: 'HitPoints',
      },
      choice: {
        type: 'hit-points',
        mode: 'average',
      },
    });
  });

  it('applies a DnD5e item-choice selection through the shared progression bridge', async () => {
    const query = vi.fn().mockImplementation((method: string, data?: unknown) => {
      if (method === 'foundry-mcp-bridge.applyCharacterAdvancementChoice') {
        expect(data).toEqual({
          actorIdentifier: 'Laeral',
          classIdentifier: 'Wizard',
          targetLevel: 8,
          stepId: 'item-choice-step',
          choice: {
            type: 'item-choice',
            itemUuids: ['Compendium.dnd5e.classfeatures.Item.sculpt-spells'],
            replaceItemId: 'old-item-1',
          },
        });
        return Promise.resolve({
          success: true,
          system: 'dnd5e',
          actorId: 'actor-3',
          actorName: 'Laeral',
          actorType: 'character',
          targetLevel: 8,
          stepId: 'item-choice-step',
          stepType: 'ItemChoice',
          stepTitle: 'Choose Feature',
          classId: 'class-wizard',
          className: 'Wizard',
          choice: {
            type: 'item-choice',
            itemUuids: ['Compendium.dnd5e.classfeatures.Item.sculpt-spells'],
            replaceItemId: 'old-item-1',
          },
          createdItemIds: ['item-feature-1'],
        });
      }

      if (method === 'foundry-mcp-bridge.previewCharacterProgression') {
        return Promise.resolve({
          system: 'dnd5e',
          actorId: 'actor-3',
          actorName: 'Laeral',
          actorType: 'character',
          classId: 'class-wizard',
          className: 'Wizard',
          currentLevel: 7,
          targetLevel: 8,
          safeToApplyDirectly: false,
          pendingSteps: [
            {
              id: 'hp-step',
              level: 8,
              type: 'HitPoints',
              title: 'Hit Points',
              required: true,
              choicesRequired: true,
              autoApplySafe: false,
            },
          ],
        });
      }

      return Promise.reject(new Error(`Unexpected query: ${method}`));
    });

    const tools = new CharacterTools({
      foundryClient: { query } as unknown as FoundryClient,
      logger: createLoggerStub(),
    });

    const result = (await tools.handleApplyCharacterAdvancementChoice({
      characterIdentifier: 'Laeral',
      classIdentifier: 'Wizard',
      targetLevel: 8,
      stepId: 'item-choice-step',
      choice: {
        type: 'item-choice',
        itemUuids: ['Compendium.dnd5e.classfeatures.Item.sculpt-spells'],
        replaceItemId: 'old-item-1',
      },
    })) as Record<string, unknown>;

    expect(result).toMatchObject({
      success: true,
      createdItemIds: ['item-feature-1'],
      safeToApplyDirectly: false,
      remainingPendingAdvancements: [
        {
          id: 'hp-step',
          type: 'HitPoints',
        },
      ],
    });
  });

  it('uses the adapter-generated progression update and generic actor-update bridge request', async () => {
    const query = vi.fn().mockImplementation((method: string, data?: unknown) => {
      if (method === 'foundry-mcp-bridge.getCharacterInfo') {
        expect(data).toEqual({ identifier: 'Merisiel' });
        return Promise.resolve({
          id: 'actor-2',
          name: 'Merisiel',
          type: 'character',
          system: {
            details: {
              level: { value: 3 },
            },
          },
          items: [],
          effects: [],
        });
      }

      if (method === 'foundry-mcp-bridge.getWorldInfo') {
        return Promise.resolve({ system: 'pf2e' });
      }

      if (method === 'foundry-mcp-bridge.updateActor') {
        expect(data).toEqual({
          identifier: 'Merisiel',
          updates: {
            'system.details.level.value': 4,
          },
          reason: 'character progression update',
        });
        return Promise.resolve({
          success: true,
          actorId: 'actor-2',
          actorName: 'Merisiel',
          actorType: 'character',
          appliedUpdates: {
            'system.details.level.value': 4,
          },
          updatedFields: ['system.details.level.value'],
        });
      }

      return Promise.reject(new Error(`Unexpected query: ${method}`));
    });

    const registry = new SystemRegistry();
    registry.register(new PF2eAdapter());

    const tools = new CharacterTools({
      foundryClient: { query } as unknown as FoundryClient,
      logger: createLoggerStub(),
      systemRegistry: registry,
    });

    const result = (await tools.handleUpdateCharacterProgression({
      characterIdentifier: 'Merisiel',
      targetLevel: 4,
    })) as Record<string, unknown>;

    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.updateActor', {
      identifier: 'Merisiel',
      updates: {
        'system.details.level.value': 4,
      },
      reason: 'character progression update',
    });
    expect(result).toMatchObject({
      success: true,
      character: {
        id: 'actor-2',
        name: 'Merisiel',
      },
      progression: {
        targetLevel: 4,
        mode: 'set-level',
      },
      updatedFields: ['system.details.level.value'],
    });
  });

  it('blocks blind DnD5e class leveling when system-managed advancement steps are pending', async () => {
    const query = vi.fn().mockImplementation((method: string, data?: unknown) => {
      if (method === 'foundry-mcp-bridge.getCharacterInfo') {
        expect(data).toEqual({ identifier: 'Laeral' });
        return Promise.resolve({
          id: 'actor-3',
          name: 'Laeral',
          type: 'character',
          system: {},
          items: [
            {
              id: 'class-wizard',
              name: 'Wizard',
              type: 'class',
              system: {
                levels: 4,
                advancement: [{ type: 'ItemGrant' }],
              },
            },
          ],
          effects: [],
        });
      }

      if (method === 'foundry-mcp-bridge.getWorldInfo') {
        return Promise.resolve({ system: 'dnd5e' });
      }

      if (method === 'foundry-mcp-bridge.previewCharacterProgression') {
        expect(data).toEqual({
          actorIdentifier: 'Laeral',
          classIdentifier: 'Wizard',
          targetLevel: 5,
        });
        return Promise.resolve({
          system: 'dnd5e',
          actorId: 'actor-3',
          actorName: 'Laeral',
          actorType: 'character',
          classId: 'class-wizard',
          className: 'Wizard',
          currentLevel: 4,
          targetLevel: 5,
          safeToApplyDirectly: false,
          pendingSteps: [
            {
              id: 'class-wizard:ItemGrant:5:0',
              level: 5,
              type: 'ItemGrant',
              title: 'ItemGrant',
              required: true,
              choicesRequired: false,
              autoApplySafe: false,
              hints: [
                'This advancement is managed by the DnD5e system workflow and should not be assumed to be fully applied by changing class levels alone.',
              ],
            },
          ],
          warnings: [
            'DnD5e class advancement is system-managed. Changing class levels alone would bypass one or more advancement steps.',
          ],
        });
      }

      return Promise.reject(new Error(`Unexpected query: ${method}`));
    });

    const registry = new SystemRegistry();
    registry.register(new DnD5eAdapter());

    const tools = new CharacterTools({
      foundryClient: { query } as unknown as FoundryClient,
      logger: createLoggerStub(),
      systemRegistry: registry,
    });

    const result = (await tools.handleUpdateCharacterProgression({
      characterIdentifier: 'Laeral',
      classIdentifier: 'Wizard',
      targetLevel: 5,
    })) as Record<string, unknown>;

    expect(result).toMatchObject({
      success: false,
      requiresChoices: true,
      character: {
        id: 'actor-3',
        name: 'Laeral',
        type: 'character',
      },
      progression: {
        classId: 'class-wizard',
        className: 'Wizard',
        previousLevel: 4,
        targetLevel: 5,
        mode: 'set-class-levels',
      },
      pendingAdvancements: [
        {
          id: 'class-wizard:ItemGrant:5:0',
          level: 5,
          type: 'ItemGrant',
        },
      ],
    });
    expect(query).not.toHaveBeenCalledWith(
      'foundry-mcp-bridge.updateActorEmbeddedItem',
      expect.anything()
    );
  });

  it('uses the DnD5e class-item update only when no system-managed advancement steps are pending', async () => {
    const query = vi.fn().mockImplementation((method: string, data?: unknown) => {
      if (method === 'foundry-mcp-bridge.getCharacterInfo') {
        return Promise.resolve({
          id: 'actor-4',
          name: 'Khelben',
          type: 'character',
          system: {},
          items: [
            {
              id: 'class-wizard',
              name: 'Wizard',
              type: 'class',
              system: {
                levels: 4,
                advancement: [],
              },
            },
          ],
          effects: [],
        });
      }

      if (method === 'foundry-mcp-bridge.getWorldInfo') {
        return Promise.resolve({ system: 'dnd5e' });
      }

      if (method === 'foundry-mcp-bridge.previewCharacterProgression') {
        expect(data).toEqual({
          actorIdentifier: 'Khelben',
          classIdentifier: 'Wizard',
          targetLevel: 5,
        });
        return Promise.resolve({
          system: 'dnd5e',
          actorId: 'actor-4',
          actorName: 'Khelben',
          actorType: 'character',
          classId: 'class-wizard',
          className: 'Wizard',
          currentLevel: 4,
          targetLevel: 5,
          safeToApplyDirectly: true,
          pendingSteps: [],
        });
      }

      if (method === 'foundry-mcp-bridge.updateActorEmbeddedItem') {
        expect(data).toEqual({
          actorIdentifier: 'Khelben',
          itemIdentifier: 'class-wizard',
          itemType: 'class',
          updates: {
            'system.levels': 5,
          },
          reason: 'character progression update',
        });
        return Promise.resolve({
          success: true,
          actorId: 'actor-4',
          actorName: 'Khelben',
          itemId: 'class-wizard',
          itemName: 'Wizard',
          itemType: 'class',
          appliedUpdates: {
            'system.levels': 5,
          },
          updatedFields: ['system.levels'],
        });
      }

      return Promise.reject(new Error(`Unexpected query: ${method}`));
    });

    const registry = new SystemRegistry();
    registry.register(new DnD5eAdapter());

    const tools = new CharacterTools({
      foundryClient: { query } as unknown as FoundryClient,
      logger: createLoggerStub(),
      systemRegistry: registry,
    });

    const result = (await tools.handleUpdateCharacterProgression({
      characterIdentifier: 'Khelben',
      classIdentifier: 'Wizard',
      targetLevel: 5,
    })) as Record<string, unknown>;

    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.updateActorEmbeddedItem', {
      actorIdentifier: 'Khelben',
      itemIdentifier: 'class-wizard',
      itemType: 'class',
      updates: {
        'system.levels': 5,
      },
      reason: 'character progression update',
    });
    expect(result).toMatchObject({
      success: true,
      character: {
        id: 'actor-4',
        name: 'Khelben',
      },
      progression: {
        classId: 'class-wizard',
        className: 'Wizard',
        previousLevel: 4,
        targetLevel: 5,
        mode: 'set-class-levels',
      },
      updatedFields: ['system.levels'],
    });
  });

  it('uses explicit advancement selections during update-character-progression before finalizing', async () => {
    const query = vi.fn().mockImplementation((method: string, data?: unknown) => {
      if (method === 'foundry-mcp-bridge.getCharacterInfo') {
        return Promise.resolve({
          id: 'actor-6',
          name: 'Laeral',
          type: 'character',
          system: {},
          items: [
            {
              id: 'class-wizard',
              name: 'Wizard',
              type: 'class',
              system: {
                levels: 1,
                advancement: [
                  { type: 'Subclass', level: 2 },
                  { type: 'HitPoints', level: 2 },
                ],
              },
            },
          ],
          effects: [],
        });
      }

      if (method === 'foundry-mcp-bridge.getWorldInfo') {
        return Promise.resolve({ system: 'dnd5e' });
      }

      if (method === 'foundry-mcp-bridge.previewCharacterProgression') {
        const previewCallCount = query.mock.calls.filter(
          ([calledMethod]) => calledMethod === 'foundry-mcp-bridge.previewCharacterProgression'
        ).length;

        if (previewCallCount <= 1) {
          return Promise.resolve({
            system: 'dnd5e',
            actorId: 'actor-6',
            actorName: 'Laeral',
            actorType: 'character',
            classId: 'class-wizard',
            className: 'Wizard',
            currentLevel: 1,
            targetLevel: 2,
            safeToApplyDirectly: false,
            pendingSteps: [
              {
                id: 'subclass-step',
                level: 2,
                type: 'Subclass',
                title: 'Arcane Tradition',
                required: true,
                choicesRequired: true,
                autoApplySafe: false,
              },
              {
                id: 'hp-step',
                level: 2,
                type: 'HitPoints',
                title: 'Hit Points',
                required: true,
                choicesRequired: true,
                autoApplySafe: false,
              },
            ],
          });
        }

        if (previewCallCount === 2) {
          return Promise.resolve({
            system: 'dnd5e',
            actorId: 'actor-6',
            actorName: 'Laeral',
            actorType: 'character',
            classId: 'class-wizard',
            className: 'Wizard',
            currentLevel: 1,
            targetLevel: 2,
            safeToApplyDirectly: false,
            pendingSteps: [
              {
                id: 'hp-step',
                level: 2,
                type: 'HitPoints',
                title: 'Hit Points',
                required: true,
                choicesRequired: true,
                autoApplySafe: false,
              },
            ],
          });
        }

        return Promise.resolve({
          system: 'dnd5e',
          actorId: 'actor-6',
          actorName: 'Laeral',
          actorType: 'character',
          classId: 'class-wizard',
          className: 'Wizard',
          currentLevel: 1,
          targetLevel: 2,
          safeToApplyDirectly: true,
          pendingSteps: [],
        });
      }

      if (method === 'foundry-mcp-bridge.applyCharacterAdvancementChoice') {
        const applyCallCount = query.mock.calls.filter(
          ([calledMethod]) => calledMethod === 'foundry-mcp-bridge.applyCharacterAdvancementChoice'
        ).length;

        if (applyCallCount === 1) {
          expect(data).toEqual({
            actorIdentifier: 'Laeral',
            classIdentifier: 'Wizard',
            targetLevel: 2,
            stepId: 'subclass-step',
            choice: {
              type: 'subclass',
              subclassUuid: 'Compendium.dnd5e.subclasses.Item.evocation',
            },
          });
          return Promise.resolve({
            success: true,
            system: 'dnd5e',
            actorId: 'actor-6',
            actorName: 'Laeral',
            actorType: 'character',
            targetLevel: 2,
            stepId: 'subclass-step',
            stepType: 'Subclass',
            stepTitle: 'Arcane Tradition',
            classId: 'class-wizard',
            className: 'Wizard',
            choice: {
              type: 'subclass',
              subclassUuid: 'Compendium.dnd5e.subclasses.Item.evocation',
            },
            createdItemIds: ['item-subclass-2'],
          });
        }

        expect(data).toEqual({
          actorIdentifier: 'Laeral',
          classIdentifier: 'Wizard',
          targetLevel: 2,
          stepId: 'hp-step',
          choice: {
            type: 'hit-points',
            mode: 'average',
          },
        });
        return Promise.resolve({
          success: true,
          system: 'dnd5e',
          actorId: 'actor-6',
          actorName: 'Laeral',
          actorType: 'character',
          targetLevel: 2,
          stepId: 'hp-step',
          stepType: 'HitPoints',
          stepTitle: 'Hit Points',
          classId: 'class-wizard',
          className: 'Wizard',
          choice: {
            type: 'hit-points',
            mode: 'average',
            totalHitPointGain: 6,
            constitutionModifier: 2,
          },
        });
      }

      if (method === 'foundry-mcp-bridge.updateActorEmbeddedItem') {
        return Promise.resolve({
          success: true,
          actorId: 'actor-6',
          actorName: 'Laeral',
          itemId: 'class-wizard',
          itemName: 'Wizard',
          itemType: 'class',
          appliedUpdates: {
            'system.levels': 2,
          },
          updatedFields: ['system.levels'],
        });
      }

      return Promise.reject(new Error(`Unexpected query: ${method}`));
    });

    const registry = new SystemRegistry();
    registry.register(new DnD5eAdapter());

    const tools = new CharacterTools({
      foundryClient: { query } as unknown as FoundryClient,
      logger: createLoggerStub(),
      systemRegistry: registry,
    });

    const result = (await tools.handleUpdateCharacterProgression({
      characterIdentifier: 'Laeral',
      classIdentifier: 'Wizard',
      targetLevel: 2,
      advancementSelections: [
        {
          stepType: 'Subclass',
          choice: {
            type: 'subclass',
            subclassUuid: 'Compendium.dnd5e.subclasses.Item.evocation',
          },
        },
        {
          stepType: 'HitPoints',
          choice: {
            type: 'hit-points',
            mode: 'average',
          },
        },
      ],
    })) as Record<string, unknown>;

    expect(result).toMatchObject({
      success: true,
      autoAppliedAdvancements: [
        {
          stepId: 'subclass-step',
          stepType: 'Subclass',
        },
        {
          stepId: 'hp-step',
          stepType: 'HitPoints',
        },
      ],
      updatedFields: ['system.levels'],
    });
  });

  it('fails cleanly when update-character-progression receives a selection that does not exist for the level-up', async () => {
    const query = vi.fn().mockImplementation((method: string, _data?: unknown) => {
      if (method === 'foundry-mcp-bridge.getCharacterInfo') {
        return Promise.resolve({
          id: 'actor-7',
          name: 'Laeral',
          type: 'character',
          system: {},
          items: [
            {
              id: 'class-wizard',
              name: 'Wizard',
              type: 'class',
              system: {
                levels: 1,
                advancement: [{ type: 'Subclass', level: 2 }],
              },
            },
          ],
          effects: [],
        });
      }

      if (method === 'foundry-mcp-bridge.getWorldInfo') {
        return Promise.resolve({ system: 'dnd5e' });
      }

      if (method === 'foundry-mcp-bridge.previewCharacterProgression') {
        return Promise.resolve({
          system: 'dnd5e',
          actorId: 'actor-7',
          actorName: 'Laeral',
          actorType: 'character',
          classId: 'class-wizard',
          className: 'Wizard',
          currentLevel: 1,
          targetLevel: 2,
          safeToApplyDirectly: false,
          pendingSteps: [
            {
              id: 'subclass-step',
              level: 2,
              type: 'Subclass',
              title: 'Arcane Tradition',
              required: true,
              choicesRequired: true,
              autoApplySafe: false,
            },
          ],
        });
      }

      return Promise.reject(new Error(`Unexpected query: ${method}`));
    });

    const registry = new SystemRegistry();
    registry.register(new DnD5eAdapter());

    const tools = new CharacterTools({
      foundryClient: { query } as unknown as FoundryClient,
      logger: createLoggerStub(),
      systemRegistry: registry,
    });

    await expect(
      tools.handleUpdateCharacterProgression({
        characterIdentifier: 'Laeral',
        classIdentifier: 'Wizard',
        targetLevel: 2,
        advancementSelections: [
          {
            stepType: 'AbilityScoreImprovement',
            choice: {
              type: 'ability-score-improvement',
              mode: 'feat',
              featUuid: 'Compendium.dnd5e.feats.Item.war-caster',
            },
          },
        ],
      })
    ).rejects.toThrow(
      'The provided advancement selections did not match the actual pending steps for this level-up'
    );
  });

  it('auto-runs safe DnD5e item-grant steps before finalizing the class level update', async () => {
    const query = vi.fn().mockImplementation((method: string, data?: unknown) => {
      if (method === 'foundry-mcp-bridge.getCharacterInfo') {
        return Promise.resolve({
          id: 'actor-5',
          name: 'Laeral',
          type: 'character',
          system: {},
          items: [
            {
              id: 'class-wizard',
              name: 'Wizard',
              type: 'class',
              system: {
                levels: 7,
                advancement: [{ type: 'ItemGrant', level: 8 }],
              },
            },
          ],
          effects: [],
        });
      }

      if (method === 'foundry-mcp-bridge.getWorldInfo') {
        return Promise.resolve({ system: 'dnd5e' });
      }

      if (method === 'foundry-mcp-bridge.previewCharacterProgression') {
        expect(data).toEqual({
          actorIdentifier: 'Laeral',
          classIdentifier: 'Wizard',
          targetLevel: 8,
        });

        const previewCallCount = query.mock.calls.filter(
          ([calledMethod]) => calledMethod === 'foundry-mcp-bridge.previewCharacterProgression'
        ).length;

        if (previewCallCount <= 1) {
          return Promise.resolve({
            system: 'dnd5e',
            actorId: 'actor-5',
            actorName: 'Laeral',
            actorType: 'character',
            classId: 'class-wizard',
            className: 'Wizard',
            currentLevel: 7,
            targetLevel: 8,
            safeToApplyDirectly: false,
            pendingSteps: [
              {
                id: 'class-wizard:ItemGrant:8:0',
                level: 8,
                type: 'ItemGrant',
                title: 'Grant Feature',
                required: true,
                choicesRequired: false,
                autoApplySafe: true,
                choiceDetails: {
                  kind: 'grant-items',
                  defaultSelectedOptionIds: ['evocation-savant'],
                  options: [
                    {
                      id: 'evocation-savant',
                      name: 'Evocation Savant',
                      type: 'feat',
                      source: 'configured',
                      uuid: 'Compendium.dnd5e.classfeatures.Item.evocation-savant',
                      selectedByDefault: true,
                    },
                  ],
                },
              },
            ],
          });
        }

        return Promise.resolve({
          system: 'dnd5e',
          actorId: 'actor-5',
          actorName: 'Laeral',
          actorType: 'character',
          classId: 'class-wizard',
          className: 'Wizard',
          currentLevel: 7,
          targetLevel: 8,
          safeToApplyDirectly: true,
          pendingSteps: [],
        });
      }

      if (method === 'foundry-mcp-bridge.applyCharacterAdvancementChoice') {
        expect(data).toEqual({
          actorIdentifier: 'Laeral',
          classIdentifier: 'Wizard',
          targetLevel: 8,
          stepId: 'class-wizard:ItemGrant:8:0',
          choice: {
            type: 'item-grant',
            itemUuids: ['Compendium.dnd5e.classfeatures.Item.evocation-savant'],
          },
        });
        return Promise.resolve({
          success: true,
          system: 'dnd5e',
          actorId: 'actor-5',
          actorName: 'Laeral',
          actorType: 'character',
          targetLevel: 8,
          stepId: 'class-wizard:ItemGrant:8:0',
          stepType: 'ItemGrant',
          stepTitle: 'Grant Feature',
          classId: 'class-wizard',
          className: 'Wizard',
          choice: {
            type: 'item-grant',
            itemUuids: ['Compendium.dnd5e.classfeatures.Item.evocation-savant'],
          },
          createdItemIds: ['item-feature-3'],
        });
      }

      if (method === 'foundry-mcp-bridge.updateActorEmbeddedItem') {
        expect(data).toEqual({
          actorIdentifier: 'Laeral',
          itemIdentifier: 'class-wizard',
          itemType: 'class',
          updates: {
            'system.levels': 8,
          },
          reason: 'character progression update',
        });
        return Promise.resolve({
          success: true,
          actorId: 'actor-5',
          actorName: 'Laeral',
          itemId: 'class-wizard',
          itemName: 'Wizard',
          itemType: 'class',
          appliedUpdates: {
            'system.levels': 8,
          },
          updatedFields: ['system.levels'],
        });
      }

      return Promise.reject(new Error(`Unexpected query: ${method}`));
    });

    const registry = new SystemRegistry();
    registry.register(new DnD5eAdapter());

    const tools = new CharacterTools({
      foundryClient: { query } as unknown as FoundryClient,
      logger: createLoggerStub(),
      systemRegistry: registry,
    });

    const result = (await tools.handleUpdateCharacterProgression({
      characterIdentifier: 'Laeral',
      classIdentifier: 'Wizard',
      targetLevel: 8,
    })) as Record<string, unknown>;

    expect(result).toMatchObject({
      success: true,
      character: {
        id: 'actor-5',
        name: 'Laeral',
      },
      progression: {
        classId: 'class-wizard',
        className: 'Wizard',
        previousLevel: 7,
        targetLevel: 8,
        mode: 'set-class-levels',
      },
      autoAppliedAdvancements: [
        {
          stepId: 'class-wizard:ItemGrant:8:0',
          stepType: 'ItemGrant',
          choice: {
            type: 'item-grant',
            itemUuids: ['Compendium.dnd5e.classfeatures.Item.evocation-savant'],
          },
          createdItemIds: ['item-feature-3'],
        },
      ],
      updatedFields: ['system.levels'],
    });
  });

  it('auto-runs safe DnD5e size steps before finalizing the class level update', async () => {
    const query = vi.fn().mockImplementation((method: string, data?: unknown) => {
      if (method === 'foundry-mcp-bridge.getCharacterInfo') {
        return Promise.resolve({
          id: 'actor-8',
          name: 'Laeral',
          type: 'character',
          system: {},
          items: [
            {
              id: 'class-wizard',
              name: 'Wizard',
              type: 'class',
              system: {
                levels: 7,
                advancement: [{ type: 'Size', level: 8 }],
              },
            },
          ],
          effects: [],
        });
      }

      if (method === 'foundry-mcp-bridge.getWorldInfo') {
        return Promise.resolve({ system: 'dnd5e' });
      }

      if (method === 'foundry-mcp-bridge.previewCharacterProgression') {
        const previewCallCount = query.mock.calls.filter(
          ([calledMethod]) => calledMethod === 'foundry-mcp-bridge.previewCharacterProgression'
        ).length;

        if (previewCallCount <= 1) {
          expect(data).toEqual({
            actorIdentifier: 'Laeral',
            classIdentifier: 'Wizard',
            targetLevel: 8,
          });

          return Promise.resolve({
            system: 'dnd5e',
            actorId: 'actor-8',
            actorName: 'Laeral',
            actorType: 'character',
            classId: 'class-wizard',
            className: 'Wizard',
            currentLevel: 7,
            targetLevel: 8,
            safeToApplyDirectly: false,
            pendingSteps: [
              {
                id: 'size-step',
                level: 8,
                type: 'Size',
                title: 'Size',
                required: true,
                choicesRequired: false,
                autoApplySafe: true,
                choiceDetails: {
                  kind: 'size',
                  optionQuerySupported: true,
                  options: [
                    {
                      id: 'med',
                      name: 'Medium',
                      type: 'size',
                      source: 'configured',
                    },
                  ],
                },
              },
            ],
          });
        }

        return Promise.resolve({
          system: 'dnd5e',
          actorId: 'actor-8',
          actorName: 'Laeral',
          actorType: 'character',
          classId: 'class-wizard',
          className: 'Wizard',
          currentLevel: 7,
          targetLevel: 8,
          safeToApplyDirectly: true,
          pendingSteps: [],
        });
      }

      if (method === 'foundry-mcp-bridge.applyCharacterAdvancementChoice') {
        expect(data).toEqual({
          actorIdentifier: 'Laeral',
          classIdentifier: 'Wizard',
          targetLevel: 8,
          stepId: 'size-step',
          choice: {
            type: 'size',
            size: 'med',
          },
        });
        return Promise.resolve({
          success: true,
          system: 'dnd5e',
          actorId: 'actor-8',
          actorName: 'Laeral',
          actorType: 'character',
          targetLevel: 8,
          stepId: 'size-step',
          stepType: 'Size',
          stepTitle: 'Size',
          classId: 'class-wizard',
          className: 'Wizard',
          choice: {
            type: 'size',
            size: 'med',
          },
        });
      }

      if (method === 'foundry-mcp-bridge.updateActorEmbeddedItem') {
        expect(data).toEqual({
          actorIdentifier: 'Laeral',
          itemIdentifier: 'class-wizard',
          itemType: 'class',
          updates: {
            'system.levels': 8,
          },
          reason: 'character progression update',
        });
        return Promise.resolve({
          success: true,
          actorId: 'actor-8',
          actorName: 'Laeral',
          itemId: 'class-wizard',
          itemName: 'Wizard',
          itemType: 'class',
          appliedUpdates: {
            'system.levels': 8,
          },
          updatedFields: ['system.levels'],
        });
      }

      return Promise.reject(new Error(`Unexpected query: ${method}`));
    });

    const registry = new SystemRegistry();
    registry.register(new DnD5eAdapter());

    const tools = new CharacterTools({
      foundryClient: { query } as unknown as FoundryClient,
      logger: createLoggerStub(),
      systemRegistry: registry,
    });

    const result = (await tools.handleUpdateCharacterProgression({
      characterIdentifier: 'Laeral',
      classIdentifier: 'Wizard',
      targetLevel: 8,
    })) as Record<string, unknown>;

    expect(result).toMatchObject({
      success: true,
      character: {
        id: 'actor-8',
        name: 'Laeral',
      },
      autoAppliedAdvancements: [
        {
          stepId: 'size-step',
          stepType: 'Size',
          choice: {
            type: 'size',
            size: 'med',
          },
        },
      ],
      updatedFields: ['system.levels'],
    });
  });
});
