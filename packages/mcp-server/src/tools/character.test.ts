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
      if (method === 'maeinomatic-foundry-mcp.getCharacterInfo') {
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

    expect(query).toHaveBeenCalledWith('maeinomatic-foundry-mcp.getCharacterInfo', {
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
      if (method === 'maeinomatic-foundry-mcp.searchCharacterItems') {
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

    expect(query).toHaveBeenCalledWith('maeinomatic-foundry-mcp.searchCharacterItems', {
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

  it('uses the shared update-character bridge request shape', async () => {
    const query = vi.fn().mockImplementation((method: string, data?: unknown) => {
      if (method === 'maeinomatic-foundry-mcp.updateActor') {
        expect(data).toEqual({
          identifier: 'Aldric',
          updates: {
            name: 'Aldric the Bold',
            'system.details.biography.value': 'Promoted after the siege.',
          },
        });
        return Promise.resolve({
          success: true,
          actorId: 'actor-1',
          actorName: 'Aldric the Bold',
          actorType: 'character',
          appliedUpdates: {
            name: 'Aldric the Bold',
            'system.details.biography.value': 'Promoted after the siege.',
          },
          updatedFields: ['name', 'system.details.biography.value'],
        });
      }

      return Promise.reject(new Error(`Unexpected query: ${method}`));
    });

    const tools = new CharacterTools({
      foundryClient: { query } as unknown as FoundryClient,
      logger: createLoggerStub(),
    });

    const result = (await tools.handleUpdateCharacter({
      actorIdentifier: 'Aldric',
      updates: {
        name: 'Aldric the Bold',
        'system.details.biography.value': 'Promoted after the siege.',
      },
    })) as Record<string, unknown>;

    expect(result).toMatchObject({
      success: true,
      actor: {
        id: 'actor-1',
        name: 'Aldric the Bold',
        type: 'character',
      },
      updatedFields: ['name', 'system.details.biography.value'],
    });
  });

  it('routes DnD5e resource updates through shared actor and item update bridges', async () => {
    const query = vi.fn().mockImplementation((method: string, data?: unknown) => {
      if (method === 'maeinomatic-foundry-mcp.getWorldInfo') {
        return Promise.resolve({ system: 'dnd5e' });
      }

      if (method === 'maeinomatic-foundry-mcp.getCharacterInfo') {
        expect(data).toEqual({ identifier: 'Laeral' });
        return Promise.resolve({
          id: 'actor-3',
          name: 'Laeral',
          type: 'character',
          system: {
            abilities: {
              wis: {},
            },
          },
          items: [
            {
              id: 'class-wizard',
              name: 'Wizard',
              type: 'class',
              system: {},
            },
          ],
          effects: [],
        });
      }

      if (method === 'maeinomatic-foundry-mcp.updateActor') {
        expect(data).toEqual({
          identifier: 'Laeral',
          updates: {
            'system.attributes.hp.value': 24,
            'system.attributes.hp.temp': 5,
            'system.attributes.inspiration': true,
            'system.attributes.exhaustion': 2,
            'system.attributes.death.success': 1,
            'system.currency.gp': 120,
          },
        });
        return Promise.resolve({
          success: true,
          actorId: 'actor-3',
          actorName: 'Laeral',
          actorType: 'character',
          appliedUpdates: {
            'system.attributes.hp.value': 24,
            'system.attributes.hp.temp': 5,
            'system.attributes.inspiration': true,
            'system.attributes.exhaustion': 2,
            'system.attributes.death.success': 1,
            'system.currency.gp': 120,
          },
          updatedFields: [
            'system.attributes.hp.value',
            'system.attributes.hp.temp',
            'system.attributes.inspiration',
            'system.attributes.exhaustion',
            'system.attributes.death.success',
            'system.currency.gp',
          ],
        });
      }

      if (method === 'maeinomatic-foundry-mcp.batchUpdateActorEmbeddedItems') {
        expect(data).toEqual({
          actorIdentifier: 'Laeral',
          updates: [
            {
              itemIdentifier: 'class-wizard',
              itemType: 'class',
              updates: {
                'system.hd.spent': 3,
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
              itemId: 'class-wizard',
              itemName: 'Wizard',
              itemType: 'class',
              appliedUpdates: {
                'system.hd.spent': 3,
              },
              updatedFields: ['system.hd.spent'],
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

    const result = (await tools.handleUpdateCharacterResources({
      actorIdentifier: 'Laeral',
      hitPoints: {
        current: 24,
        temp: 5,
      },
      inspiration: true,
      exhaustion: 2,
      deathSaves: {
        success: 1,
      },
      currency: {
        gp: 120,
      },
      hitDice: [
        {
          classIdentifier: 'Wizard',
          used: 3,
        },
      ],
    })) as Record<string, unknown>;

    expect(result).toMatchObject({
      success: true,
      actor: {
        id: 'actor-3',
        name: 'Laeral',
        type: 'character',
      },
      resources: {
        mode: 'update-resources',
      },
      updatedItems: [
        {
          id: 'class-wizard',
          name: 'Wizard',
          type: 'class',
          updatedFields: ['system.hd.spent'],
        },
      ],
    });
    expect(result.updatedFields).toEqual(
      expect.arrayContaining(['system.attributes.hp.value', 'system.currency.gp'])
    );
  });

  it('routes PF2e ability score updates through adapter-prepared actor paths', async () => {
    const query = vi.fn().mockImplementation((method: string, data?: unknown) => {
      if (method === 'maeinomatic-foundry-mcp.getWorldInfo') {
        return Promise.resolve({ system: 'pf2e' });
      }

      if (method === 'maeinomatic-foundry-mcp.getCharacterInfo') {
        expect(data).toEqual({ identifier: 'Seoni' });
        return Promise.resolve({
          id: 'actor-pf2e-1',
          name: 'Seoni',
          type: 'character',
          system: {
            abilities: {
              str: {},
              dex: {},
              int: {},
            },
          },
          items: [],
          effects: [],
        });
      }

      if (method === 'maeinomatic-foundry-mcp.updateActor') {
        expect(data).toEqual({
          identifier: 'Seoni',
          updates: {
            'system.abilities.dex.value': 18,
            'system.abilities.int.value': 19,
          },
        });
        return Promise.resolve({
          success: true,
          actorId: 'actor-pf2e-1',
          actorName: 'Seoni',
          actorType: 'character',
          appliedUpdates: {
            'system.abilities.dex.value': 18,
            'system.abilities.int.value': 19,
          },
          updatedFields: ['system.abilities.dex.value', 'system.abilities.int.value'],
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

    const result = (await tools.handleSetCharacterAbilityScores({
      actorIdentifier: 'Seoni',
      scores: {
        dex: 18,
        int: 19,
      },
    })) as Record<string, unknown>;

    expect(result).toMatchObject({
      success: true,
      actor: {
        id: 'actor-pf2e-1',
        name: 'Seoni',
        type: 'character',
      },
      scores: {
        dex: 18,
        int: 19,
      },
      updatedFields: ['system.abilities.dex.value', 'system.abilities.int.value'],
    });
  });

  it('routes DnD5e skill proficiency updates through adapter-prepared actor paths', async () => {
    const query = vi.fn().mockImplementation((method: string, data?: unknown) => {
      if (method === 'maeinomatic-foundry-mcp.getWorldInfo') {
        return Promise.resolve({ system: 'dnd5e' });
      }

      if (method === 'maeinomatic-foundry-mcp.getCharacterInfo') {
        expect(data).toEqual({ identifier: 'Aldric' });
        return Promise.resolve({
          id: 'actor-1',
          name: 'Aldric',
          type: 'character',
          system: {
            skills: {
              ath: {},
              prc: {},
            },
          },
          items: [],
          effects: [],
        });
      }

      if (method === 'maeinomatic-foundry-mcp.updateActor') {
        expect(data).toEqual({
          identifier: 'Aldric',
          updates: {
            'system.skills.ath.value': 1,
            'system.skills.prc.value': 2,
          },
        });
        return Promise.resolve({
          success: true,
          actorId: 'actor-1',
          actorName: 'Aldric',
          actorType: 'character',
          appliedUpdates: {
            'system.skills.ath.value': 1,
            'system.skills.prc.value': 2,
          },
          updatedFields: ['system.skills.ath.value', 'system.skills.prc.value'],
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

    const result = (await tools.handleSetCharacterSkillProficiencies({
      actorIdentifier: 'Aldric',
      skills: [
        { skill: 'ath', proficiency: 1 },
        { skill: 'prc', proficiency: 2 },
      ],
    })) as Record<string, unknown>;

    expect(result).toMatchObject({
      success: true,
      skills: [
        { skill: 'ath', proficiency: 1 },
        { skill: 'prc', proficiency: 2 },
      ],
      updatedFields: ['system.skills.ath.value', 'system.skills.prc.value'],
    });
  });

  it('uses the shared batch-update-character-items bridge request shape', async () => {
    const query = vi.fn().mockImplementation((method: string, data?: unknown) => {
      if (method === 'maeinomatic-foundry-mcp.batchUpdateActorEmbeddedItems') {
        expect(data).toEqual({
          actorIdentifier: 'Aldric',
          updates: [
            {
              itemIdentifier: 'Longsword',
              itemType: 'weapon',
              updates: {
                'system.quantity': 3,
              },
            },
            {
              itemIdentifier: 'Chain Mail',
              itemType: 'equipment',
              updates: {
                'system.equipped': true,
              },
            },
          ],
        });
        return Promise.resolve({
          success: true,
          actorId: 'actor-1',
          actorName: 'Aldric',
          updatedItems: [
            {
              itemId: 'item-weapon-1',
              itemName: 'Longsword',
              itemType: 'weapon',
              appliedUpdates: {
                'system.quantity': 3,
              },
              updatedFields: ['system.quantity'],
            },
            {
              itemId: 'item-armor-1',
              itemName: 'Chain Mail',
              itemType: 'equipment',
              appliedUpdates: {
                'system.equipped': true,
              },
              updatedFields: ['system.equipped'],
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

    const result = (await tools.handleBatchUpdateCharacterItems({
      actorIdentifier: 'Aldric',
      updates: [
        {
          itemIdentifier: 'Longsword',
          itemType: 'weapon',
          updates: {
            'system.quantity': 3,
          },
        },
        {
          itemIdentifier: 'Chain Mail',
          itemType: 'equipment',
          updates: {
            'system.equipped': true,
          },
        },
      ],
    })) as Record<string, unknown>;

    expect(result).toMatchObject({
      success: true,
      updatedCount: 2,
      updatedItems: [
        {
          id: 'item-weapon-1',
          name: 'Longsword',
          type: 'weapon',
          updatedFields: ['system.quantity'],
        },
        {
          id: 'item-armor-1',
          name: 'Chain Mail',
          type: 'equipment',
          updatedFields: ['system.equipped'],
        },
      ],
    });
  });

  it('uses the shared apply-character-patch-transaction bridge request shape', async () => {
    const query = vi.fn().mockImplementation((method: string, data?: unknown) => {
      if (method === 'maeinomatic-foundry-mcp.applyCharacterPatchTransaction') {
        expect(data).toEqual({
          actorIdentifier: 'Aldric',
          actorUpdates: {
            'system.attributes.hp.value': 22,
          },
          createItems: [
            {
              sourceUuid: 'Compendium.dnd5e.items.healing-potion',
              itemType: 'consumable',
            },
          ],
          updateItems: [
            {
              itemIdentifier: 'Longsword',
              itemType: 'weapon',
              updates: {
                'system.equipped': true,
              },
            },
          ],
          deleteItems: [
            {
              itemIdentifier: 'Old Shield',
              itemType: 'equipment',
            },
          ],
          validateOnly: false,
          reason: 'Apply a rest-and-rebuild patch',
        });
        return Promise.resolve({
          success: true,
          transactionId: 'tx-123',
          actorId: 'actor-1',
          actorName: 'Aldric',
          actorType: 'character',
          validateOnly: false,
          plannedOperations: {
            actorUpdated: true,
            createdItemCount: 1,
            updatedItemCount: 1,
            deletedItemCount: 1,
          },
          actorUpdatedFields: ['system.attributes.hp.value'],
          createdItems: [
            {
              itemId: 'item-potion-1',
              itemName: 'Potion of Healing',
              itemType: 'consumable',
              createdFrom: 'uuid',
              sourceUuid: 'Compendium.dnd5e.items.healing-potion',
            },
          ],
          updatedItems: [
            {
              itemId: 'item-weapon-1',
              itemName: 'Longsword',
              itemType: 'weapon',
              updatedFields: ['system.equipped'],
            },
          ],
          deletedItems: [
            {
              itemId: 'item-shield-1',
              itemName: 'Old Shield',
              itemType: 'equipment',
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

    const result = (await tools.handleApplyCharacterPatchTransaction({
      actorIdentifier: 'Aldric',
      actorUpdates: {
        'system.attributes.hp.value': 22,
      },
      createItems: [
        {
          sourceUuid: 'Compendium.dnd5e.items.healing-potion',
          itemType: 'consumable',
        },
      ],
      updateItems: [
        {
          itemIdentifier: 'Longsword',
          itemType: 'weapon',
          updates: {
            'system.equipped': true,
          },
        },
      ],
      deleteItems: [
        {
          itemIdentifier: 'Old Shield',
          itemType: 'equipment',
        },
      ],
      validateOnly: false,
      reason: 'Apply a rest-and-rebuild patch',
    })) as Record<string, unknown>;

    expect(result).toMatchObject({
      success: true,
      transactionId: 'tx-123',
      actor: {
        id: 'actor-1',
        name: 'Aldric',
        type: 'character',
      },
      plannedOperations: {
        actorUpdated: true,
        createdItemCount: 1,
        updatedItemCount: 1,
        deletedItemCount: 1,
      },
      actorUpdatedFields: ['system.attributes.hp.value'],
      createdItems: [
        {
          id: 'item-potion-1',
          name: 'Potion of Healing',
          type: 'consumable',
          createdFrom: 'uuid',
        },
      ],
      updatedItems: [
        {
          id: 'item-weapon-1',
          name: 'Longsword',
          type: 'weapon',
          updatedFields: ['system.equipped'],
        },
      ],
      deletedItems: [
        {
          id: 'item-shield-1',
          name: 'Old Shield',
          type: 'equipment',
        },
      ],
    });
  });

  it('routes DnD5e proficiency updates through adapter-prepared actor paths', async () => {
    const query = vi.fn().mockImplementation((method: string, data?: unknown) => {
      if (method === 'maeinomatic-foundry-mcp.getWorldInfo') {
        return Promise.resolve({ system: 'dnd5e' });
      }

      if (method === 'maeinomatic-foundry-mcp.getCharacterInfo') {
        expect(data).toEqual({ identifier: 'Laeral' });
        return Promise.resolve({
          id: 'actor-3',
          name: 'Laeral',
          type: 'character',
          system: {
            abilities: {
              str: {},
              dex: {},
              wis: {},
            },
            tools: {
              herb: {},
              thief: {},
            },
          },
          items: [],
          effects: [],
        });
      }

      if (method === 'maeinomatic-foundry-mcp.updateActor') {
        expect(data).toEqual({
          identifier: 'Laeral',
          updates: {
            'system.traits.languages.value': ['common', 'draconic'],
            'system.traits.languages.custom': 'Abyssal',
            'system.traits.weaponProf.value': ['simpleM', 'simpleR'],
            'system.traits.armorProf.value': ['light', 'medium'],
            'system.tools.herb.value': 1,
            'system.tools.thief.value': 2,
            'system.abilities.str.proficient': 0,
            'system.abilities.dex.proficient': 0,
            'system.abilities.wis.proficient': 1,
          },
        });
        return Promise.resolve({
          success: true,
          actorId: 'actor-3',
          actorName: 'Laeral',
          actorType: 'character',
          appliedUpdates: {
            'system.traits.languages.value': ['common', 'draconic'],
            'system.traits.languages.custom': 'Abyssal',
            'system.traits.weaponProf.value': ['simpleM', 'simpleR'],
            'system.traits.armorProf.value': ['light', 'medium'],
            'system.tools.herb.value': 1,
            'system.tools.thief.value': 2,
            'system.abilities.str.proficient': 0,
            'system.abilities.dex.proficient': 0,
            'system.abilities.wis.proficient': 1,
          },
          updatedFields: [
            'system.traits.languages.value',
            'system.traits.languages.custom',
            'system.traits.weaponProf.value',
            'system.traits.armorProf.value',
            'system.tools.herb.value',
            'system.tools.thief.value',
            'system.abilities.str.proficient',
            'system.abilities.dex.proficient',
            'system.abilities.wis.proficient',
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

    const result = (await tools.handleSetDnD5eProficiencies({
      actorIdentifier: 'Laeral',
      languages: {
        values: ['common', 'draconic'],
        custom: 'Abyssal',
      },
      weaponProficiencies: {
        values: ['simpleM', 'simpleR'],
      },
      armorProficiencies: {
        values: ['light', 'medium'],
      },
      toolProficiencies: [
        { tool: 'herb', proficiency: 1 },
        { tool: 'thief', proficiency: 2 },
      ],
      savingThrowProficiencies: ['wis'],
    })) as Record<string, unknown>;

    expect(result).toMatchObject({
      success: true,
      proficiencies: {
        mode: 'set-dnd5e-proficiencies',
      },
    });
    expect(result.updatedFields).toEqual(
      expect.arrayContaining([
        'system.traits.languages.value',
        'system.tools.thief.value',
        'system.abilities.wis.proficient',
      ])
    );
  });

  it('uses the shared add-character-item bridge request shape', async () => {
    const query = vi.fn().mockImplementation((method: string, data?: unknown) => {
      if (method === 'maeinomatic-foundry-mcp.createActorEmbeddedItem') {
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
      if (method === 'maeinomatic-foundry-mcp.updateActorEmbeddedItem') {
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
      if (method === 'maeinomatic-foundry-mcp.deleteActorEmbeddedItem') {
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
      if (method === 'maeinomatic-foundry-mcp.getWorldInfo') {
        return Promise.resolve({ system: 'dnd5e' });
      }

      if (method === 'maeinomatic-foundry-mcp.getCharacterInfo') {
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

      if (method === 'maeinomatic-foundry-mcp.createActorEmbeddedItem') {
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
      if (method === 'maeinomatic-foundry-mcp.getWorldInfo') {
        return Promise.resolve({ system: 'dnd5e' });
      }

      if (method === 'maeinomatic-foundry-mcp.updateActorEmbeddedItem') {
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
      if (method === 'maeinomatic-foundry-mcp.getWorldInfo') {
        return Promise.resolve({ system: 'dnd5e' });
      }

      if (method === 'maeinomatic-foundry-mcp.deleteActorEmbeddedItem') {
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
      if (method === 'maeinomatic-foundry-mcp.getWorldInfo') {
        return Promise.resolve({ system: 'dnd5e' });
      }

      if (method === 'maeinomatic-foundry-mcp.updateActor') {
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
      if (method === 'maeinomatic-foundry-mcp.getWorldInfo') {
        return Promise.resolve({ system: 'dnd5e' });
      }

      if (method === 'maeinomatic-foundry-mcp.getCharacterInfo') {
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

      if (method === 'maeinomatic-foundry-mcp.updateActorEmbeddedItem') {
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
      if (method === 'maeinomatic-foundry-mcp.getWorldInfo') {
        return Promise.resolve({ system: 'dnd5e' });
      }

      if (method === 'maeinomatic-foundry-mcp.getCharacterInfo') {
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

      if (method === 'maeinomatic-foundry-mcp.batchUpdateActorEmbeddedItems') {
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
      if (method === 'maeinomatic-foundry-mcp.getWorldInfo') {
        return Promise.resolve({ system: 'dnd5e' });
      }

      if (method === 'maeinomatic-foundry-mcp.getCharacterInfo') {
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

      if (method === 'maeinomatic-foundry-mcp.batchUpdateActorEmbeddedItems') {
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
      if (method === 'maeinomatic-foundry-mcp.getWorldInfo') {
        return Promise.resolve({ system: 'dnd5e' });
      }

      if (method === 'maeinomatic-foundry-mcp.getCharacterInfo') {
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

    const registry = new SystemRegistry();
    registry.register(new DnD5eAdapter());

    const tools = new CharacterTools({
      foundryClient: { query } as unknown as FoundryClient,
      logger: createLoggerStub(),
      systemRegistry: registry,
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
        sourceClassCounts: {
          'class-wizard': 1,
          'lost-class': 1,
        },
        preparedSpellCountsByClass: {
          'class-wizard': 1,
        },
        preparationModeCounts: {
          prepared: 3,
        },
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

  it('organizes a DnD5e spellbook by auto-fixing safe source-class and preparation issues', async () => {
    const query = vi.fn().mockImplementation((method: string, data?: unknown) => {
      if (method === 'maeinomatic-foundry-mcp.getWorldInfo') {
        return Promise.resolve({ system: 'dnd5e' });
      }

      if (method === 'maeinomatic-foundry-mcp.getCharacterInfo') {
        expect(data).toEqual({ identifier: 'Laeral' });
        const characterInfoCallCount = query.mock.calls.filter(
          ([calledMethod]) => calledMethod === 'maeinomatic-foundry-mcp.getCharacterInfo'
        ).length;

        if (characterInfoCallCount === 1) {
          return Promise.resolve({
            id: 'actor-spellbook-1',
            name: 'Laeral',
            type: 'character',
            system: {},
            items: [
              {
                id: 'class-sorcerer',
                name: 'Sorcerer',
                type: 'class',
                system: {
                  spellcasting: {
                    progression: 'full',
                    type: 'known',
                  },
                },
              },
              {
                id: 'spell-magic-missile',
                name: 'Magic Missile',
                type: 'spell',
                system: {
                  sourceClass: 'lost-class',
                },
              },
              {
                id: 'spell-shield',
                name: 'Shield',
                type: 'spell',
                system: {
                  sourceClass: 'class-sorcerer',
                  preparation: {
                    prepared: true,
                  },
                },
              },
            ],
            effects: [],
          });
        }

        if (characterInfoCallCount === 2) {
          return Promise.resolve({
            id: 'actor-spellbook-1',
            name: 'Laeral',
            type: 'character',
            system: {},
            items: [
              {
                id: 'class-sorcerer',
                name: 'Sorcerer',
                type: 'class',
                system: {
                  spellcasting: {
                    progression: 'full',
                    type: 'known',
                  },
                },
              },
              {
                id: 'spell-magic-missile',
                name: 'Magic Missile',
                type: 'spell',
                system: {
                  sourceClass: 'class-sorcerer',
                },
              },
              {
                id: 'spell-shield',
                name: 'Shield',
                type: 'spell',
                system: {
                  sourceClass: 'class-sorcerer',
                  preparation: {
                    prepared: true,
                  },
                },
              },
            ],
            effects: [],
          });
        }

        return Promise.resolve({
          id: 'actor-spellbook-1',
          name: 'Laeral',
          type: 'character',
          system: {},
          items: [
            {
              id: 'class-sorcerer',
              name: 'Sorcerer',
              type: 'class',
              system: {
                spellcasting: {
                  progression: 'full',
                  type: 'known',
                },
              },
            },
            {
              id: 'spell-magic-missile',
              name: 'Magic Missile',
              type: 'spell',
              system: {
                sourceClass: 'class-sorcerer',
              },
            },
            {
              id: 'spell-shield',
              name: 'Shield',
              type: 'spell',
              system: {
                sourceClass: 'class-sorcerer',
              },
            },
          ],
          effects: [],
        });
      }

      if (method === 'maeinomatic-foundry-mcp.batchUpdateActorEmbeddedItems') {
        const batchCallCount = query.mock.calls.filter(
          ([calledMethod]) =>
            calledMethod === 'maeinomatic-foundry-mcp.batchUpdateActorEmbeddedItems'
        ).length;

        if (batchCallCount === 1) {
          expect(data).toEqual({
            actorIdentifier: 'Laeral',
            updates: [
              {
                itemIdentifier: 'spell-magic-missile',
                itemType: 'spell',
                updates: {
                  'system.sourceClass': 'class-sorcerer',
                },
              },
            ],
            reason: 'dnd5e spellbook organization workflow',
          });

          return Promise.resolve({
            success: true,
            actorId: 'actor-spellbook-1',
            actorName: 'Laeral',
            updatedItems: [
              {
                itemId: 'spell-magic-missile',
                itemName: 'Magic Missile',
                itemType: 'spell',
                appliedUpdates: {
                  'system.sourceClass': 'class-sorcerer',
                },
                updatedFields: ['system.sourceClass'],
              },
            ],
          });
        }

        expect(data).toEqual({
          actorIdentifier: 'Laeral',
          updates: [
            {
              itemIdentifier: 'spell-shield',
              itemType: 'spell',
              updates: {
                'system.preparation.prepared': false,
              },
            },
          ],
          reason: 'dnd5e spellbook organization workflow',
        });

        return Promise.resolve({
          success: true,
          actorId: 'actor-spellbook-1',
          actorName: 'Laeral',
          updatedItems: [
            {
              itemId: 'spell-shield',
              itemName: 'Shield',
              itemType: 'spell',
              appliedUpdates: {
                'system.preparation.prepared': false,
              },
              updatedFields: ['system.preparation.prepared'],
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

    const result = (await tools.handleOrganizeDnD5eSpellbookWorkflow({
      actorIdentifier: 'Laeral',
    })) as Record<string, unknown>;

    expect(result).toMatchObject({
      success: true,
      workflow: {
        name: 'organize-dnd5e-spellbook-workflow',
        system: 'dnd5e',
      },
      workflowStatus: 'completed',
      completed: true,
      character: {
        id: 'actor-spellbook-1',
        name: 'Laeral',
        type: 'character',
      },
      fixes: {
        sourceClassAssignmentsApplied: 1,
        preparationUpdatesApplied: 1,
        spellPreparationPlansApplied: 0,
      },
      appliedSourceClassAssignments: [
        {
          spellId: 'spell-magic-missile',
          spellName: 'Magic Missile',
          classId: 'class-sorcerer',
          className: 'Sorcerer',
          appliedBy: 'auto',
        },
      ],
      appliedPreparationUpdates: [
        {
          spellId: 'spell-shield',
          spellName: 'Shield',
          prepared: false,
          appliedBy: 'auto',
        },
      ],
      initialValidation: {
        issues: [
          expect.objectContaining({ code: 'unknown-source-class' }),
          expect.objectContaining({ code: 'preparation-mode-mismatch' }),
        ],
      },
      finalValidation: {
        issues: [],
      },
      verification: {
        verified: true,
        final: {
          issues: [],
        },
      },
      autoApplied: {
        sourceClassAssignments: [
          expect.objectContaining({
            spellId: 'spell-magic-missile',
            appliedBy: 'auto',
          }),
        ],
        preparationUpdates: [
          expect.objectContaining({
            spellId: 'spell-shield',
            appliedBy: 'auto',
          }),
        ],
      },
    });
  });

  it('returns review-required guidance when a DnD5e spellbook issue is still ambiguous after safe fixes', async () => {
    const query = vi.fn().mockImplementation((method: string, data?: unknown) => {
      if (method === 'maeinomatic-foundry-mcp.getWorldInfo') {
        return Promise.resolve({ system: 'dnd5e' });
      }

      if (method === 'maeinomatic-foundry-mcp.getCharacterInfo') {
        expect(data).toEqual({ identifier: 'Laeral' });
        return Promise.resolve({
          id: 'actor-spellbook-2',
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
              id: 'spell-shield',
              name: 'Shield',
              type: 'spell',
              system: {
                preparation: {
                  prepared: true,
                },
              },
            },
          ],
          effects: [],
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

    const result = (await tools.handleOrganizeDnD5eSpellbookWorkflow({
      actorIdentifier: 'Laeral',
    })) as Record<string, unknown>;

    expect(result).toMatchObject({
      success: false,
      partialSuccess: false,
      workflow: {
        name: 'organize-dnd5e-spellbook-workflow',
        system: 'dnd5e',
      },
      workflowStatus: 'needs-review',
      reviewRequired: true,
      character: {
        id: 'actor-spellbook-2',
        name: 'Laeral',
        type: 'character',
      },
      fixes: {
        sourceClassAssignmentsApplied: 0,
        preparationUpdatesApplied: 0,
      },
      finalValidation: {
        issues: [
          expect.objectContaining({
            code: 'missing-source-class',
            spellId: 'spell-shield',
            spellName: 'Shield',
          }),
        ],
      },
      verification: {
        verified: false,
      },
      unresolved: {
        kind: 'spellbook-review',
        reviewRequired: true,
        issues: [
          expect.objectContaining({
            code: 'missing-source-class',
            spellId: 'spell-shield',
            spellName: 'Shield',
          }),
        ],
      },
    });
  });

  it('applies explicit spell preparation plans during the DnD5e spellbook workflow', async () => {
    const query = vi.fn().mockImplementation((method: string, data?: unknown) => {
      if (method === 'maeinomatic-foundry-mcp.getWorldInfo') {
        return Promise.resolve({ system: 'dnd5e' });
      }

      if (method === 'maeinomatic-foundry-mcp.getCharacterInfo') {
        const characterInfoCallCount = query.mock.calls.filter(
          ([calledMethod]) => calledMethod === 'maeinomatic-foundry-mcp.getCharacterInfo'
        ).length;

        expect(data).toEqual({ identifier: 'Laeral' });

        if (characterInfoCallCount <= 2) {
          return Promise.resolve({
            id: 'actor-spellbook-3',
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
                    prepared: false,
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
            ],
            effects: [],
          });
        }

        return Promise.resolve({
          id: 'actor-spellbook-3',
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
                  prepared: false,
                },
              },
            },
          ],
          effects: [],
        });
      }

      if (method === 'maeinomatic-foundry-mcp.batchUpdateActorEmbeddedItems') {
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
          ],
          reason: 'Spell prep cleanup',
        });

        return Promise.resolve({
          success: true,
          actorId: 'actor-spellbook-3',
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

    const result = (await tools.handleOrganizeDnD5eSpellbookWorkflow({
      actorIdentifier: 'Laeral',
      spellPreparationPlans: [
        {
          mode: 'replace',
          sourceClass: 'Wizard',
          spellIdentifiers: ['Fireball'],
          reason: 'Spell prep cleanup',
        },
      ],
    })) as Record<string, unknown>;

    expect(result).toMatchObject({
      success: true,
      workflow: {
        name: 'organize-dnd5e-spellbook-workflow',
        system: 'dnd5e',
      },
      workflowStatus: 'completed',
      completed: true,
      fixes: {
        sourceClassAssignmentsApplied: 0,
        preparationUpdatesApplied: 2,
        spellPreparationPlansApplied: 1,
      },
      appliedPreparationUpdates: [
        {
          spellId: 'spell-fireball',
          spellName: 'Fireball',
          prepared: true,
          appliedBy: 'explicit-plan',
        },
        {
          spellId: 'spell-shield',
          spellName: 'Shield',
          prepared: false,
          appliedBy: 'explicit-plan',
        },
      ],
      finalValidation: {
        issues: [],
      },
    });
  });

  it('uses the shared run-dnd5e-rest-workflow bridge request shape and applies post-rest spell preparation plans', async () => {
    const query = vi.fn().mockImplementation((method: string, data?: unknown) => {
      if (method === 'maeinomatic-foundry-mcp.getWorldInfo') {
        return Promise.resolve({ system: 'dnd5e' });
      }

      if (method === 'maeinomatic-foundry-mcp.runCharacterRestWorkflow') {
        expect(data).toEqual({
          actorIdentifier: 'Laeral',
          restType: 'long',
          suppressChat: true,
          newDay: true,
          reason: 'Overnight recovery',
        });

        return Promise.resolve({
          success: true,
          system: 'dnd5e',
          actorId: 'actor-3',
          actorName: 'Laeral',
          actorType: 'character',
          restType: 'long',
          before: {
            hitPoints: { current: 18, max: 32, temp: 5 },
            spellSlots: [{ key: 'spell1', value: 1, max: 4 }],
          },
          after: {
            hitPoints: { current: 32, max: 32, temp: 0 },
            spellSlots: [{ key: 'spell1', value: 4, max: 4 }],
          },
          changes: {
            hitPointsChanged: true,
            inspirationChanged: false,
            exhaustionChanged: false,
            deathSavesChanged: false,
            changedSpellSlots: [
              {
                key: 'spell1',
                before: { key: 'spell1', value: 1, max: 4 },
                after: { key: 'spell1', value: 4, max: 4 },
              },
            ],
            changedClassHitDice: [],
          },
          warnings: ['Review optional rest-time choices after automation.'],
        });
      }

      if (method === 'maeinomatic-foundry-mcp.getCharacterInfo') {
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
                  prepared: false,
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
          ],
          effects: [],
        });
      }

      if (method === 'maeinomatic-foundry-mcp.batchUpdateActorEmbeddedItems') {
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
          ],
          reason: 'Overnight recovery',
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
          ],
        });
      }

      return Promise.reject(new Error(`Unexpected query: ${method}`));
    });

    const tools = new CharacterTools({
      foundryClient: { query } as unknown as FoundryClient,
      logger: createLoggerStub(),
    });

    const result = (await tools.handleRunDnD5eRestWorkflow({
      actorIdentifier: 'Laeral',
      restType: 'long',
      suppressChat: true,
      newDay: true,
      reason: 'Overnight recovery',
      spellPreparationPlans: [
        {
          mode: 'replace',
          sourceClass: 'Wizard',
          spellIdentifiers: ['Fireball'],
        },
      ],
    })) as Record<string, unknown>;

    expect(result).toMatchObject({
      success: true,
      workflow: {
        name: 'run-dnd5e-rest-workflow',
        system: 'dnd5e',
      },
      workflowStatus: 'completed',
      restCompleted: true,
      character: {
        id: 'actor-3',
        name: 'Laeral',
        type: 'character',
      },
      rest: {
        type: 'long',
        changes: {
          hitPointsChanged: true,
          changedSpellSlots: [
            {
              key: 'spell1',
            },
          ],
        },
      },
      verification: {
        verified: true,
        restCompleted: true,
        postRestPreparationPlansApplied: 1,
      },
      warnings: ['Review optional rest-time choices after automation.'],
    });
    expect(result).toHaveProperty('spellPreparationUpdates');
  });

  it('runs a DnD5e group rest workflow across party characters and applies per-actor post-rest spell preparation plans', async () => {
    const query = vi.fn().mockImplementation((method: string, data?: unknown) => {
      if (method === 'maeinomatic-foundry-mcp.getWorldInfo') {
        return Promise.resolve({ system: 'dnd5e' });
      }

      if (method === 'maeinomatic-foundry-mcp.getPartyCharacters') {
        expect(data).toEqual({});
        return Promise.resolve([
          { id: 'actor-laeral', name: 'Laeral' },
          { id: 'actor-khelben', name: 'Khelben' },
        ]);
      }

      if (method === 'maeinomatic-foundry-mcp.runCharacterRestWorkflow') {
        if ((data as Record<string, unknown>).actorIdentifier === 'actor-laeral') {
          expect(data).toEqual({
            actorIdentifier: 'actor-laeral',
            restType: 'long',
            suppressChat: true,
            newDay: true,
            reason: 'party rest',
          });
          return Promise.resolve({
            success: true,
            system: 'dnd5e',
            actorId: 'actor-laeral',
            actorName: 'Laeral',
            actorType: 'character',
            restType: 'long',
            before: {},
            after: {},
            changes: {
              hitPointsChanged: true,
              inspirationChanged: false,
              exhaustionChanged: false,
              deathSavesChanged: false,
              changedSpellSlots: [],
              changedClassHitDice: [],
            },
          });
        }

        expect(data).toEqual({
          actorIdentifier: 'actor-khelben',
          restType: 'long',
          suppressChat: true,
          newDay: true,
          reason: 'party rest',
        });
        return Promise.resolve({
          success: true,
          system: 'dnd5e',
          actorId: 'actor-khelben',
          actorName: 'Khelben',
          actorType: 'character',
          restType: 'long',
          before: {},
          after: {},
          changes: {
            hitPointsChanged: false,
            inspirationChanged: false,
            exhaustionChanged: false,
            deathSavesChanged: false,
            changedSpellSlots: [],
            changedClassHitDice: [],
          },
        });
      }

      if (method === 'maeinomatic-foundry-mcp.getCharacterInfo') {
        expect(data).toEqual({ identifier: 'actor-laeral' });
        return Promise.resolve({
          id: 'actor-laeral',
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
                  prepared: false,
                },
              },
            },
          ],
          effects: [],
        });
      }

      if (method === 'maeinomatic-foundry-mcp.batchUpdateActorEmbeddedItems') {
        expect(data).toEqual({
          actorIdentifier: 'actor-laeral',
          updates: [
            {
              itemIdentifier: 'spell-fireball',
              itemType: 'spell',
              updates: {
                'system.preparation.prepared': true,
              },
            },
          ],
          reason: 'party rest',
        });
        return Promise.resolve({
          success: true,
          actorId: 'actor-laeral',
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
          ],
        });
      }

      return Promise.reject(new Error(`Unexpected query: ${method}`));
    });

    const tools = new CharacterTools({
      foundryClient: { query } as unknown as FoundryClient,
      logger: createLoggerStub(),
    });

    const result = (await tools.handleRunDnD5eGroupRestWorkflow({
      restType: 'long',
      newDay: true,
      spellPreparationPlansByActor: [
        {
          actorIdentifier: 'Laeral',
          spellPreparationPlans: [
            {
              mode: 'replace',
              sourceClass: 'Wizard',
              spellIdentifiers: ['Fireball'],
            },
          ],
        },
      ],
      reason: 'party rest',
    })) as Record<string, unknown>;

    expect(result).toMatchObject({
      success: true,
      workflow: {
        name: 'run-dnd5e-group-rest-workflow',
        system: 'dnd5e',
      },
      workflowStatus: 'completed',
      completed: true,
      restTarget: 'party-characters',
      restType: 'long',
      actorCount: 2,
      summary: {
        completedActorCount: 2,
        failedActorCount: 0,
        restCompletedActorCount: 2,
        hitPointsChangedActorCount: 1,
        spellPreparationPlanCount: 1,
      },
      verification: {
        verified: true,
        targetedActorCount: 2,
        attemptedActorCount: 2,
        failedActorCount: 0,
      },
      actors: [
        {
          actor: {
            id: 'actor-laeral',
            name: 'Laeral',
            type: 'character',
          },
          success: true,
          workflowStatus: 'completed',
          restCompleted: true,
          spellPreparationUpdates: [
            {
              success: true,
              updatedCount: 1,
            },
          ],
        },
        {
          actor: {
            id: 'actor-khelben',
            name: 'Khelben',
            type: 'character',
          },
          success: true,
          workflowStatus: 'completed',
          restCompleted: true,
        },
      ],
    });
  });

  it('reports partial failure when one actor in the DnD5e group rest workflow does not complete cleanly', async () => {
    const query = vi.fn().mockImplementation((method: string, data?: unknown) => {
      if (method === 'maeinomatic-foundry-mcp.getWorldInfo') {
        return Promise.resolve({ system: 'dnd5e' });
      }

      if (method === 'maeinomatic-foundry-mcp.runCharacterRestWorkflow') {
        if ((data as Record<string, unknown>).actorIdentifier === 'Laeral') {
          return Promise.resolve({
            success: true,
            system: 'dnd5e',
            actorId: 'actor-laeral',
            actorName: 'Laeral',
            actorType: 'character',
            restType: 'short',
            before: {},
            after: {},
            changes: {
              hitPointsChanged: true,
              inspirationChanged: false,
              exhaustionChanged: false,
              deathSavesChanged: false,
              changedSpellSlots: [],
              changedClassHitDice: [],
            },
          });
        }

        throw new Error('Khelben could not complete the short rest.');
      }

      return Promise.reject(new Error(`Unexpected query: ${method}`));
    });

    const tools = new CharacterTools({
      foundryClient: { query } as unknown as FoundryClient,
      logger: createLoggerStub(),
    });

    const result = (await tools.handleRunDnD5eGroupRestWorkflow({
      restTarget: 'explicit-characters',
      characterIdentifiers: ['Laeral', 'Khelben'],
      restType: 'short',
    })) as Record<string, unknown>;

    expect(result).toMatchObject({
      success: false,
      partialSuccess: true,
      workflow: {
        name: 'run-dnd5e-group-rest-workflow',
        system: 'dnd5e',
      },
      workflowStatus: 'partial-failure',
      restTarget: 'explicit-characters',
      actorCount: 2,
      summary: {
        completedActorCount: 1,
        failedActorCount: 1,
        restCompletedActorCount: 1,
        partialFailureActorCount: 0,
      },
      failedActors: [
        {
          actor: {
            id: 'Khelben',
            name: 'Khelben',
            type: 'character',
          },
          success: false,
        },
      ],
      verification: {
        verified: false,
        failedActorCount: 1,
      },
    });
    expect(result.nextStep).toContain('rerun run-dnd5e-group-rest-workflow');
  });

  it('exposes DnD5e progression preview as a dedicated tool response', async () => {
    const query = vi.fn().mockImplementation((method: string, data?: unknown) => {
      if (method === 'maeinomatic-foundry-mcp.getCharacterInfo') {
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

      if (method === 'maeinomatic-foundry-mcp.getWorldInfo') {
        return Promise.resolve({ system: 'dnd5e' });
      }

      if (method === 'maeinomatic-foundry-mcp.previewCharacterProgression') {
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
      if (method === 'maeinomatic-foundry-mcp.getCharacterAdvancementOptions') {
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

  it('uses the shared validate-dnd5e-character-build bridge request shape', async () => {
    const query = vi.fn().mockImplementation((method: string, data?: unknown) => {
      if (method === 'maeinomatic-foundry-mcp.getWorldInfo') {
        return Promise.resolve({ system: 'dnd5e' });
      }

      if (method === 'maeinomatic-foundry-mcp.validateCharacterBuild') {
        expect(data).toEqual({
          actorIdentifier: 'Laeral',
        });
        return Promise.resolve({
          system: 'dnd5e',
          actorId: 'actor-3',
          actorName: 'Laeral',
          actorType: 'character',
          summary: {
            classCount: 2,
            totalClassLevels: 8,
            outstandingAdvancementCount: 1,
            issueCount: 2,
            errorCount: 1,
            warningCount: 1,
            infoCount: 0,
          },
          issues: [
            {
              severity: 'error',
              code: 'outstanding-advancement',
              category: 'advancement',
              classId: 'class-wizard',
              className: 'Wizard',
              stepId: 'adv-asi-8',
              stepType: 'AbilityScoreImprovement',
              message:
                'Required advancement "Ability Score Improvement" at level 8 is still unresolved.',
            },
            {
              severity: 'warning',
              code: 'preparation-mode-mismatch',
              category: 'spellbook',
              itemId: 'spell-fireball',
              itemName: 'Fireball',
              message:
                'This spell is marked as prepared, but its source class "Wizard" uses spellcasting type "pact".',
            },
          ],
          outstandingAdvancements: [
            {
              id: 'adv-asi-8',
              level: 8,
              type: 'AbilityScoreImprovement',
              title: 'Ability Score Improvement',
              required: true,
              sourceItemId: 'class-wizard',
              sourceItemName: 'Wizard',
              sourceItemType: 'class',
            },
          ],
          recommendations: [
            'Use preview-character-progression, get-character-advancement-options, apply-character-advancement-choice, and update-character-progression to finish unresolved DnD5e advancement steps.',
          ],
        });
      }

      return Promise.reject(new Error(`Unexpected query: ${method}`));
    });

    const tools = new CharacterTools({
      foundryClient: { query } as unknown as FoundryClient,
      logger: createLoggerStub(),
    });

    const result = (await tools.handleValidateDnD5eCharacterBuild({
      actorIdentifier: 'Laeral',
    })) as Record<string, unknown>;

    expect(result).toMatchObject({
      success: true,
      character: {
        id: 'actor-3',
        name: 'Laeral',
        type: 'character',
      },
      summary: {
        classCount: 2,
        outstandingAdvancementCount: 1,
      },
      issues: [
        expect.objectContaining({
          code: 'outstanding-advancement',
          category: 'advancement',
        }),
        expect.objectContaining({
          code: 'preparation-mode-mismatch',
          category: 'spellbook',
        }),
      ],
      outstandingAdvancements: [
        {
          id: 'adv-asi-8',
          level: 8,
          type: 'AbilityScoreImprovement',
          title: 'Ability Score Improvement',
          required: true,
          sourceItemId: 'class-wizard',
          sourceItemName: 'Wizard',
          sourceItemType: 'class',
        },
      ],
    });
  });

  it('applies a DnD5e ASI choice and refreshes the remaining progression state', async () => {
    const query = vi.fn().mockImplementation((method: string, data?: unknown) => {
      if (method === 'maeinomatic-foundry-mcp.applyCharacterAdvancementChoice') {
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

      if (method === 'maeinomatic-foundry-mcp.previewCharacterProgression') {
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
      if (method === 'maeinomatic-foundry-mcp.applyCharacterAdvancementChoice') {
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

      if (method === 'maeinomatic-foundry-mcp.previewCharacterProgression') {
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
      if (method === 'maeinomatic-foundry-mcp.applyCharacterAdvancementChoice') {
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

      if (method === 'maeinomatic-foundry-mcp.previewCharacterProgression') {
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
      if (method === 'maeinomatic-foundry-mcp.applyCharacterAdvancementChoice') {
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

      if (method === 'maeinomatic-foundry-mcp.previewCharacterProgression') {
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
      if (method === 'maeinomatic-foundry-mcp.applyCharacterAdvancementChoice') {
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

      if (method === 'maeinomatic-foundry-mcp.previewCharacterProgression') {
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
      if (method === 'maeinomatic-foundry-mcp.applyCharacterAdvancementChoice') {
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

      if (method === 'maeinomatic-foundry-mcp.previewCharacterProgression') {
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
      if (method === 'maeinomatic-foundry-mcp.applyCharacterAdvancementChoice') {
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

      if (method === 'maeinomatic-foundry-mcp.previewCharacterProgression') {
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
      if (method === 'maeinomatic-foundry-mcp.applyCharacterAdvancementChoice') {
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

      if (method === 'maeinomatic-foundry-mcp.previewCharacterProgression') {
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
      if (method === 'maeinomatic-foundry-mcp.getCharacterInfo') {
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

      if (method === 'maeinomatic-foundry-mcp.getWorldInfo') {
        return Promise.resolve({ system: 'pf2e' });
      }

      if (method === 'maeinomatic-foundry-mcp.updateActor') {
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

    expect(query).toHaveBeenCalledWith('maeinomatic-foundry-mcp.updateActor', {
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
      if (method === 'maeinomatic-foundry-mcp.getCharacterInfo') {
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

      if (method === 'maeinomatic-foundry-mcp.getWorldInfo') {
        return Promise.resolve({ system: 'dnd5e' });
      }

      if (method === 'maeinomatic-foundry-mcp.previewCharacterProgression') {
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
      'maeinomatic-foundry-mcp.updateActorEmbeddedItem',
      expect.anything()
    );
  });

  it('uses the DnD5e class-item update only when no system-managed advancement steps are pending', async () => {
    const query = vi.fn().mockImplementation((method: string, data?: unknown) => {
      if (method === 'maeinomatic-foundry-mcp.getCharacterInfo') {
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

      if (method === 'maeinomatic-foundry-mcp.getWorldInfo') {
        return Promise.resolve({ system: 'dnd5e' });
      }

      if (method === 'maeinomatic-foundry-mcp.previewCharacterProgression') {
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

      if (method === 'maeinomatic-foundry-mcp.updateActorEmbeddedItem') {
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

    expect(query).toHaveBeenCalledWith('maeinomatic-foundry-mcp.updateActorEmbeddedItem', {
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
      if (method === 'maeinomatic-foundry-mcp.getCharacterInfo') {
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

      if (method === 'maeinomatic-foundry-mcp.getWorldInfo') {
        return Promise.resolve({ system: 'dnd5e' });
      }

      if (method === 'maeinomatic-foundry-mcp.previewCharacterProgression') {
        const previewCallCount = query.mock.calls.filter(
          ([calledMethod]) => calledMethod === 'maeinomatic-foundry-mcp.previewCharacterProgression'
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

      if (method === 'maeinomatic-foundry-mcp.applyCharacterAdvancementChoice') {
        const applyCallCount = query.mock.calls.filter(
          ([calledMethod]) =>
            calledMethod === 'maeinomatic-foundry-mcp.applyCharacterAdvancementChoice'
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

      if (method === 'maeinomatic-foundry-mcp.updateActorEmbeddedItem') {
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
      if (method === 'maeinomatic-foundry-mcp.getCharacterInfo') {
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

      if (method === 'maeinomatic-foundry-mcp.getWorldInfo') {
        return Promise.resolve({ system: 'dnd5e' });
      }

      if (method === 'maeinomatic-foundry-mcp.previewCharacterProgression') {
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
      if (method === 'maeinomatic-foundry-mcp.getCharacterInfo') {
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

      if (method === 'maeinomatic-foundry-mcp.getWorldInfo') {
        return Promise.resolve({ system: 'dnd5e' });
      }

      if (method === 'maeinomatic-foundry-mcp.previewCharacterProgression') {
        expect(data).toEqual({
          actorIdentifier: 'Laeral',
          classIdentifier: 'Wizard',
          targetLevel: 8,
        });

        const previewCallCount = query.mock.calls.filter(
          ([calledMethod]) => calledMethod === 'maeinomatic-foundry-mcp.previewCharacterProgression'
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

      if (method === 'maeinomatic-foundry-mcp.applyCharacterAdvancementChoice') {
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

      if (method === 'maeinomatic-foundry-mcp.updateActorEmbeddedItem') {
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
      if (method === 'maeinomatic-foundry-mcp.getCharacterInfo') {
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

      if (method === 'maeinomatic-foundry-mcp.getWorldInfo') {
        return Promise.resolve({ system: 'dnd5e' });
      }

      if (method === 'maeinomatic-foundry-mcp.previewCharacterProgression') {
        const previewCallCount = query.mock.calls.filter(
          ([calledMethod]) => calledMethod === 'maeinomatic-foundry-mcp.previewCharacterProgression'
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

      if (method === 'maeinomatic-foundry-mcp.applyCharacterAdvancementChoice') {
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

      if (method === 'maeinomatic-foundry-mcp.updateActorEmbeddedItem') {
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

  it('returns guided pending-step options when complete-dnd5e-level-up-workflow still needs choices', async () => {
    const query = vi.fn().mockImplementation((method: string, data?: unknown) => {
      if (method === 'maeinomatic-foundry-mcp.getWorldInfo') {
        return Promise.resolve({ system: 'dnd5e' });
      }

      if (method === 'maeinomatic-foundry-mcp.getCharacterInfo') {
        return Promise.resolve({
          id: 'actor-8b',
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
                advancement: [{ type: 'Subclass', level: 8 }],
              },
            },
          ],
          effects: [],
        });
      }

      if (method === 'maeinomatic-foundry-mcp.previewCharacterProgression') {
        expect(data).toEqual({
          actorIdentifier: 'Laeral',
          classIdentifier: 'Wizard',
          targetLevel: 8,
        });
        return Promise.resolve({
          system: 'dnd5e',
          actorId: 'actor-8b',
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
          warnings: [
            'DnD5e class advancement is system-managed. Changing class levels alone would bypass one or more advancement steps.',
          ],
        });
      }

      if (method === 'maeinomatic-foundry-mcp.getCharacterAdvancementOptions') {
        expect(data).toEqual({
          actorIdentifier: 'Laeral',
          classIdentifier: 'Wizard',
          targetLevel: 8,
          stepId: 'subclass-step',
          limit: 25,
        });
        return Promise.resolve({
          system: 'dnd5e',
          actorId: 'actor-8b',
          actorName: 'Laeral',
          actorType: 'character',
          targetLevel: 8,
          stepId: 'subclass-step',
          stepType: 'Subclass',
          stepTitle: 'Arcane Tradition',
          choiceDetails: {
            kind: 'subclass',
            optionQuerySupported: false,
          },
          options: [
            {
              id: 'evocation',
              name: 'School of Evocation',
              type: 'subclass',
              source: 'compendium',
              uuid: 'Compendium.dnd5e.subclasses.Item.evocation',
            },
            {
              id: 'illusion',
              name: 'School of Illusion',
              type: 'subclass',
              source: 'compendium',
              uuid: 'Compendium.dnd5e.subclasses.Item.illusion',
            },
          ],
          totalOptions: 2,
          classId: 'class-wizard',
          className: 'Wizard',
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

    const result = (await tools.handleCompleteDnD5eLevelUpWorkflow({
      characterIdentifier: 'Laeral',
      classIdentifier: 'Wizard',
      targetLevel: 8,
    })) as Record<string, unknown>;

    expect(result).toMatchObject({
      success: false,
      workflow: {
        name: 'complete-dnd5e-level-up-workflow',
        system: 'dnd5e',
      },
      workflowStatus: 'needs-choices',
      requiresChoices: true,
      character: {
        id: 'actor-8b',
        name: 'Laeral',
        type: 'character',
      },
      pendingAdvancements: [
        {
          id: 'subclass-step',
          type: 'Subclass',
          title: 'Arcane Tradition',
        },
      ],
      pendingAdvancementOptions: [
        {
          stepId: 'subclass-step',
          stepType: 'Subclass',
          totalOptions: 2,
          options: [
            {
              id: 'evocation',
              type: 'subclass',
            },
            {
              id: 'illusion',
              type: 'subclass',
            },
          ],
        },
      ],
      unresolved: {
        kind: 'advancement',
        requiresChoices: true,
        pendingAdvancementOptions: [
          expect.objectContaining({
            stepId: 'subclass-step',
          }),
        ],
      },
    });
  });

  it('completes the DnD5e level-up workflow and validates the finished build', async () => {
    const query = vi.fn().mockImplementation((method: string, data?: unknown) => {
      if (method === 'maeinomatic-foundry-mcp.getWorldInfo') {
        return Promise.resolve({ system: 'dnd5e' });
      }

      if (method === 'maeinomatic-foundry-mcp.getCharacterInfo') {
        const characterInfoCallCount = query.mock.calls.filter(
          ([calledMethod]) => calledMethod === 'maeinomatic-foundry-mcp.getCharacterInfo'
        ).length;

        if (characterInfoCallCount === 1) {
          return Promise.resolve({
            id: 'actor-8c',
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
                  advancement: [{ type: 'Subclass', level: 8 }],
                },
              },
            ],
            effects: [],
          });
        }

        return Promise.resolve({
          id: 'actor-8c',
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
                advancement: [{ type: 'Subclass', level: 8 }],
              },
            },
            {
              id: 'subclass-evocation',
              name: 'School of Evocation',
              type: 'subclass',
              system: {},
            },
          ],
          effects: [],
        });
      }

      if (method === 'maeinomatic-foundry-mcp.previewCharacterProgression') {
        const previewCallCount = query.mock.calls.filter(
          ([calledMethod]) => calledMethod === 'maeinomatic-foundry-mcp.previewCharacterProgression'
        ).length;

        expect(data).toEqual({
          actorIdentifier: 'Laeral',
          classIdentifier: 'Wizard',
          targetLevel: 8,
        });

        if (previewCallCount === 1) {
          return Promise.resolve({
            system: 'dnd5e',
            actorId: 'actor-8c',
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

        return Promise.resolve({
          system: 'dnd5e',
          actorId: 'actor-8c',
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

      if (method === 'maeinomatic-foundry-mcp.applyCharacterAdvancementChoice') {
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
          actorId: 'actor-8c',
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
          createdItemIds: ['subclass-evocation'],
        });
      }

      if (method === 'maeinomatic-foundry-mcp.updateActorEmbeddedItem') {
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
          actorId: 'actor-8c',
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

      if (method === 'maeinomatic-foundry-mcp.validateCharacterBuild') {
        expect(data).toEqual({
          actorIdentifier: 'Laeral',
        });
        return Promise.resolve({
          system: 'dnd5e',
          actorId: 'actor-8c',
          actorName: 'Laeral',
          actorType: 'character',
          summary: {
            classCount: 1,
            totalClassLevels: 8,
            outstandingAdvancementCount: 0,
            issueCount: 0,
            errorCount: 0,
            warningCount: 0,
            infoCount: 0,
          },
          issues: [],
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

    const result = (await tools.handleCompleteDnD5eLevelUpWorkflow({
      characterIdentifier: 'Laeral',
      classIdentifier: 'Wizard',
      targetLevel: 8,
      advancementSelections: [
        {
          stepType: 'Subclass',
          choice: {
            type: 'subclass',
            subclassUuid: 'Compendium.dnd5e.subclasses.Item.evocation',
          },
        },
      ],
    })) as Record<string, unknown>;

    expect(result).toMatchObject({
      success: true,
      workflowStatus: 'completed',
      completed: true,
      character: {
        id: 'actor-8c',
        name: 'Laeral',
      },
      appliedAdvancements: [
        {
          stepId: 'subclass-step',
          stepType: 'Subclass',
          appliedBy: 'selection',
          createdItemIds: ['subclass-evocation'],
        },
      ],
      updatedFields: ['system.levels'],
      verification: {
        verified: true,
        summary: {
          totalClassLevels: 8,
          outstandingAdvancementCount: 0,
          errorCount: 0,
        },
        issues: [],
      },
    });
    expect(result.validation).toEqual(result.verification);
  });

  it('awards split DnD5e party resources with remainder reporting and build validation', async () => {
    const query = vi.fn().mockImplementation((method: string, data?: unknown) => {
      if (method === 'maeinomatic-foundry-mcp.getWorldInfo') {
        return Promise.resolve({ system: 'dnd5e' });
      }

      if (method === 'maeinomatic-foundry-mcp.getPartyCharacters') {
        expect(data).toEqual({});
        return Promise.resolve([
          { id: 'actor-award-1', name: 'Laeral' },
          { id: 'actor-award-2', name: 'Khelben' },
        ]);
      }

      if (method === 'maeinomatic-foundry-mcp.getCharacterInfo') {
        if ((data as Record<string, unknown>).identifier === 'actor-award-1') {
          return Promise.resolve({
            id: 'actor-award-1',
            name: 'Laeral',
            type: 'character',
            system: {
              details: {
                xp: { value: 2500, max: 2700 },
              },
              currency: {
                gp: 10,
                sp: { value: 5 },
              },
            },
            items: [],
            effects: [],
          });
        }

        if ((data as Record<string, unknown>).identifier === 'actor-award-2') {
          return Promise.resolve({
            id: 'actor-award-2',
            name: 'Khelben',
            type: 'character',
            system: {
              details: {
                xp: { value: 500, max: 900 },
              },
              currency: {
                gp: 3,
                sp: { value: 1 },
              },
            },
            items: [],
            effects: [],
          });
        }
      }

      if (method === 'maeinomatic-foundry-mcp.updateActor') {
        if ((data as Record<string, unknown>).identifier === 'actor-award-1') {
          expect(data).toEqual({
            identifier: 'actor-award-1',
            updates: {
              'system.details.xp.value': 2800,
              'system.currency.gp': 12,
              'system.currency.sp.value': 6,
            },
            reason: 'session reward',
          });
          return Promise.resolve({
            success: true,
            actorId: 'actor-award-1',
            actorName: 'Laeral',
            actorType: 'character',
            appliedUpdates: {
              'system.details.xp.value': 2800,
              'system.currency.gp': 12,
              'system.currency.sp.value': 6,
            },
            updatedFields: [
              'system.details.xp.value',
              'system.currency.gp',
              'system.currency.sp.value',
            ],
          });
        }

        expect(data).toEqual({
          identifier: 'actor-award-2',
          updates: {
            'system.details.xp.value': 800,
            'system.currency.gp': 5,
            'system.currency.sp.value': 2,
          },
          reason: 'session reward',
        });
        return Promise.resolve({
          success: true,
          actorId: 'actor-award-2',
          actorName: 'Khelben',
          actorType: 'character',
          appliedUpdates: {
            'system.details.xp.value': 800,
            'system.currency.gp': 5,
            'system.currency.sp.value': 2,
          },
          updatedFields: [
            'system.details.xp.value',
            'system.currency.gp',
            'system.currency.sp.value',
          ],
        });
      }

      if (method === 'maeinomatic-foundry-mcp.validateCharacterBuild') {
        return Promise.resolve({
          system: 'dnd5e',
          actorId: (data as Record<string, unknown>).actorIdentifier,
          actorName:
            (data as Record<string, unknown>).actorIdentifier === 'actor-award-1'
              ? 'Laeral'
              : 'Khelben',
          actorType: 'character',
          summary: {
            classCount: 1,
            totalClassLevels:
              (data as Record<string, unknown>).actorIdentifier === 'actor-award-1' ? 5 : 3,
            outstandingAdvancementCount: 0,
            issueCount: 0,
            errorCount: 0,
            warningCount: 0,
            infoCount: 0,
          },
          issues: [],
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

    const result = (await tools.handleAwardDnD5ePartyResources({
      experiencePoints: 601,
      currency: {
        gp: 5,
        sp: 3,
      },
      reason: 'session reward',
    })) as Record<string, unknown>;

    expect(result).toMatchObject({
      success: true,
      workflow: {
        name: 'award-dnd5e-party-resources',
        system: 'dnd5e',
      },
      workflowStatus: 'completed',
      awardTarget: 'party-characters',
      distributionMode: 'split',
      recipientCount: 2,
      perRecipientAward: {
        experiencePoints: 300,
        currency: {
          gp: 2,
          sp: 1,
        },
      },
      undistributedExperiencePoints: 1,
      undistributedCurrency: {
        gp: 1,
        sp: 1,
      },
      recipients: [
        {
          actor: {
            id: 'actor-award-1',
            name: 'Laeral',
          },
          awarded: {
            experiencePoints: 300,
            currency: {
              gp: 2,
              sp: 1,
            },
          },
          experience: {
            before: 2500,
            after: 2800,
            nextLevelAt: 2700,
            levelUpReady: true,
          },
        },
        {
          actor: {
            id: 'actor-award-2',
            name: 'Khelben',
          },
          experience: {
            before: 500,
            after: 800,
            nextLevelAt: 900,
            levelUpReady: false,
          },
        },
      ],
      verification: {
        verified: true,
        validatedRecipientCount: 2,
      },
    });
  });

  it('awards explicit DnD5e character resources in each mode without validation', async () => {
    const query = vi.fn().mockImplementation((method: string, data?: unknown) => {
      if (method === 'maeinomatic-foundry-mcp.getWorldInfo') {
        return Promise.resolve({ system: 'dnd5e' });
      }

      if (method === 'maeinomatic-foundry-mcp.getCharacterInfo') {
        return Promise.resolve({
          id: (data as Record<string, unknown>).identifier,
          name: (data as Record<string, unknown>).identifier,
          type: 'character',
          system: {
            details: {
              xp: { value: 100, max: 300 },
            },
            currency: {
              gp: 1,
            },
          },
          items: [],
          effects: [],
        });
      }

      if (method === 'maeinomatic-foundry-mcp.updateActor') {
        if ((data as Record<string, unknown>).identifier === 'Laeral') {
          expect(data).toEqual({
            identifier: 'Laeral',
            updates: {
              'system.details.xp.value': 150,
              'system.currency.gp': 11,
            },
            reason: 'each reward',
          });
        } else {
          expect(data).toEqual({
            identifier: 'Khelben',
            updates: {
              'system.details.xp.value': 150,
              'system.currency.gp': 11,
            },
            reason: 'each reward',
          });
        }

        return Promise.resolve({
          success: true,
          actorId: (data as Record<string, unknown>).identifier,
          actorName: (data as Record<string, unknown>).identifier,
          actorType: 'character',
          appliedUpdates: (data as Record<string, unknown>).updates,
          updatedFields: ['system.details.xp.value', 'system.currency.gp'],
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

    const result = (await tools.handleAwardDnD5ePartyResources({
      awardTarget: 'explicit-characters',
      characterIdentifiers: ['Laeral', 'Khelben'],
      distributionMode: 'each',
      experiencePoints: 50,
      currency: {
        gp: 10,
      },
      validateCharacterBuilds: false,
      reason: 'each reward',
    })) as Record<string, unknown>;

    expect(query).not.toHaveBeenCalledWith(
      'maeinomatic-foundry-mcp.validateCharacterBuild',
      expect.anything()
    );
    expect(result).toMatchObject({
      success: true,
      workflowStatus: 'completed',
      awardTarget: 'explicit-characters',
      distributionMode: 'each',
      recipientCount: 2,
      perRecipientAward: {
        experiencePoints: 50,
        currency: {
          gp: 10,
        },
      },
      recipients: [
        {
          actor: { id: 'Laeral', name: 'Laeral' },
          awarded: {
            experiencePoints: 50,
            currency: {
              gp: 10,
            },
          },
        },
        {
          actor: { id: 'Khelben', name: 'Khelben' },
          awarded: {
            experiencePoints: 50,
            currency: {
              gp: 10,
            },
          },
        },
      ],
    });
  });

  it('stages DnD5e awards on a primary party group actor', async () => {
    const query = vi.fn().mockImplementation((method: string, data?: unknown) => {
      if (method === 'maeinomatic-foundry-mcp.getWorldInfo') {
        return Promise.resolve({ system: 'dnd5e' });
      }

      if (method === 'maeinomatic-foundry-mcp.listActors') {
        expect(data).toEqual({ type: 'group' });
        return Promise.resolve([{ id: 'party-group-1', name: 'The Company', type: 'group' }]);
      }

      if (method === 'maeinomatic-foundry-mcp.getCharacterInfo') {
        expect(data).toEqual({ identifier: 'party-group-1' });
        return Promise.resolve({
          id: 'party-group-1',
          name: 'The Company',
          type: 'group',
          system: {
            details: {
              xp: { value: 1200, max: 2700 },
            },
            currency: {
              gp: 10,
              sp: { value: 4 },
            },
          },
          items: [],
          effects: [],
        });
      }

      if (method === 'maeinomatic-foundry-mcp.updateActor') {
        expect(data).toEqual({
          identifier: 'party-group-1',
          updates: {
            'system.details.xp.value': 1801,
            'system.currency.gp': 15,
            'system.currency.sp.value': 6,
          },
          reason: 'session reward',
        });

        return Promise.resolve({
          success: true,
          actorId: 'party-group-1',
          actorName: 'The Company',
          actorType: 'group',
          appliedUpdates: (data as Record<string, unknown>).updates,
          updatedFields: [
            'system.details.xp.value',
            'system.currency.gp',
            'system.currency.sp.value',
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

    const result = (await tools.handleAwardDnD5ePartyResources({
      awardTarget: 'primary-party-group',
      experiencePoints: 601,
      currency: {
        gp: 5,
        sp: 2,
      },
      reason: 'session reward',
    })) as Record<string, unknown>;

    expect(result).toMatchObject({
      success: true,
      workflowStatus: 'staged',
      awardSource: 'new-award',
      awardTarget: 'primary-party-group',
      partyGroup: {
        id: 'party-group-1',
        name: 'The Company',
        type: 'group',
      },
      stagedAward: {
        experiencePoints: 601,
        currency: {
          gp: 5,
          sp: 2,
        },
      },
      stagedBefore: {
        experiencePoints: 1200,
        currency: {
          gp: 10,
          sp: 4,
        },
      },
      stagedAfter: {
        experiencePoints: 1801,
        currency: {
          gp: 15,
          sp: 6,
        },
      },
    });
  });

  it('distributes staged DnD5e party awards with caps and retained remainders', async () => {
    const query = vi.fn().mockImplementation((method: string, data?: unknown) => {
      if (method === 'maeinomatic-foundry-mcp.getWorldInfo') {
        return Promise.resolve({ system: 'dnd5e' });
      }

      if (method === 'maeinomatic-foundry-mcp.getPartyCharacters') {
        expect(data).toEqual({});
        return Promise.resolve([
          { id: 'actor-award-1', name: 'Laeral' },
          { id: 'actor-award-2', name: 'Khelben' },
        ]);
      }

      if (method === 'maeinomatic-foundry-mcp.listActors') {
        expect(data).toEqual({ type: 'group' });
        return Promise.resolve([{ id: 'party-group-1', name: 'The Company', type: 'group' }]);
      }

      if (method === 'maeinomatic-foundry-mcp.getCharacterInfo') {
        if ((data as Record<string, unknown>).identifier === 'party-group-1') {
          return Promise.resolve({
            id: 'party-group-1',
            name: 'The Company',
            type: 'group',
            system: {
              details: {
                xp: { value: 401, max: 9999 },
              },
              currency: {
                gp: 7,
              },
            },
            items: [],
            effects: [],
          });
        }

        if ((data as Record<string, unknown>).identifier === 'actor-award-1') {
          return Promise.resolve({
            id: 'actor-award-1',
            name: 'Laeral',
            type: 'character',
            system: {
              details: {
                xp: { value: 100, max: 300 },
              },
              currency: {
                gp: 1,
              },
            },
            items: [],
            effects: [],
          });
        }

        if ((data as Record<string, unknown>).identifier === 'actor-award-2') {
          return Promise.resolve({
            id: 'actor-award-2',
            name: 'Khelben',
            type: 'character',
            system: {
              details: {
                xp: { value: 200, max: 900 },
              },
              currency: {
                gp: 2,
              },
            },
            items: [],
            effects: [],
          });
        }
      }

      if (method === 'maeinomatic-foundry-mcp.updateActor') {
        if ((data as Record<string, unknown>).identifier === 'actor-award-1') {
          expect(data).toEqual({
            identifier: 'actor-award-1',
            updates: {
              'system.details.xp.value': 300,
              'system.currency.gp': 4,
            },
            reason: 'grant staged rewards',
          });
          return Promise.resolve({
            success: true,
            actorId: 'actor-award-1',
            actorName: 'Laeral',
            actorType: 'character',
            appliedUpdates: (data as Record<string, unknown>).updates,
            updatedFields: ['system.details.xp.value', 'system.currency.gp'],
          });
        }

        if ((data as Record<string, unknown>).identifier === 'actor-award-2') {
          expect(data).toEqual({
            identifier: 'actor-award-2',
            updates: {
              'system.details.xp.value': 400,
              'system.currency.gp': 5,
            },
            reason: 'grant staged rewards',
          });
          return Promise.resolve({
            success: true,
            actorId: 'actor-award-2',
            actorName: 'Khelben',
            actorType: 'character',
            appliedUpdates: (data as Record<string, unknown>).updates,
            updatedFields: ['system.details.xp.value', 'system.currency.gp'],
          });
        }

        expect(data).toEqual({
          identifier: 'party-group-1',
          updates: {
            'system.details.xp.value': 1,
            'system.currency.gp': 1,
          },
          reason: 'grant staged rewards staged-distribution deduction',
        });
        return Promise.resolve({
          success: true,
          actorId: 'party-group-1',
          actorName: 'The Company',
          actorType: 'group',
          appliedUpdates: (data as Record<string, unknown>).updates,
          updatedFields: ['system.details.xp.value', 'system.currency.gp'],
        });
      }

      if (method === 'maeinomatic-foundry-mcp.validateCharacterBuild') {
        return Promise.resolve({
          system: 'dnd5e',
          actorId: (data as Record<string, unknown>).actorIdentifier,
          actorName:
            (data as Record<string, unknown>).actorIdentifier === 'actor-award-1'
              ? 'Laeral'
              : 'Khelben',
          actorType: 'character',
          summary: {
            classCount: 1,
            totalClassLevels:
              (data as Record<string, unknown>).actorIdentifier === 'actor-award-1' ? 4 : 5,
            outstandingAdvancementCount: 0,
            issueCount: 0,
            errorCount: 0,
            warningCount: 0,
            infoCount: 0,
          },
          issues: [],
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

    const result = (await tools.handleAwardDnD5ePartyResources({
      awardSource: 'staged-party-group',
      awardTarget: 'party-characters',
      distributionMode: 'each',
      experiencePoints: 250,
      currency: {
        gp: 4,
      },
      reason: 'grant staged rewards',
    })) as Record<string, unknown>;

    expect(result).toMatchObject({
      success: true,
      workflowStatus: 'completed',
      awardSource: 'staged-party-group',
      awardTarget: 'party-characters',
      distributionMode: 'each',
      recipientCount: 2,
      totalAwarded: {
        experiencePoints: 400,
        currency: {
          gp: 6,
        },
      },
      perRecipientAward: {
        experiencePoints: 200,
        currency: {
          gp: 3,
        },
      },
      undistributedExperiencePoints: 1,
      undistributedCurrency: {
        gp: 1,
      },
      requestedButUnavailable: {
        experiencePoints: 100,
        currency: {
          gp: 2,
        },
      },
      partyGroup: {
        id: 'party-group-1',
        name: 'The Company',
        type: 'group',
      },
      stagedBefore: {
        experiencePoints: 401,
        currency: {
          gp: 7,
        },
      },
      stagedConsumed: {
        experiencePoints: 400,
        currency: {
          gp: 6,
        },
      },
      stagedAfter: {
        experiencePoints: 1,
        currency: {
          gp: 1,
        },
      },
      recipients: [
        {
          actor: {
            id: 'actor-award-1',
            name: 'Laeral',
          },
          awarded: {
            experiencePoints: 200,
            currency: {
              gp: 3,
            },
          },
          experience: {
            before: 100,
            after: 300,
          },
        },
        {
          actor: {
            id: 'actor-award-2',
            name: 'Khelben',
          },
          awarded: {
            experiencePoints: 200,
            currency: {
              gp: 3,
            },
          },
          experience: {
            before: 200,
            after: 400,
          },
        },
      ],
    });
  });

  it('requires partyIdentifier when staged awards cannot resolve a unique group actor', async () => {
    const query = vi.fn().mockImplementation((method: string, data?: unknown) => {
      if (method === 'maeinomatic-foundry-mcp.getWorldInfo') {
        return Promise.resolve({ system: 'dnd5e' });
      }

      if (method === 'maeinomatic-foundry-mcp.listActors') {
        expect(data).toEqual({ type: 'group' });
        return Promise.resolve([
          { id: 'group-1', name: 'Heroes', type: 'group' },
          { id: 'group-2', name: 'Ambushers', type: 'group' },
        ]);
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
      tools.handleAwardDnD5ePartyResources({
        awardTarget: 'primary-party-group',
        experiencePoints: 100,
      })
    ).rejects.toThrow('Multiple DnD5e group actors were found');
  });

  it('uses the shared run-dnd5e-summon-activity bridge request shape', async () => {
    const query = vi.fn().mockImplementation((method: string, data?: unknown) => {
      if (method === 'maeinomatic-foundry-mcp.getWorldInfo') {
        return Promise.resolve({ system: 'dnd5e' });
      }

      if (method === 'maeinomatic-foundry-mcp.runDnD5eSummonActivity') {
        expect(data).toEqual({
          actorIdentifier: 'Laeral',
          itemIdentifier: 'Conjure Elemental',
          activityIdentifier: 'summon-elemental',
          profileId: 'air-elemental',
          placementType: 'coordinates',
          coordinates: [{ x: 1400, y: 900 }],
          hidden: false,
          reason: 'Combat summon workflow',
        });
        return Promise.resolve({
          success: true,
          system: 'dnd5e',
          actorId: 'actor-laeral',
          actorName: 'Laeral',
          actorType: 'character',
          itemId: 'item-conjure-elemental',
          itemName: 'Conjure Elemental',
          itemType: 'spell',
          workflowStatus: 'completed',
          activityId: 'summon-elemental',
          activityName: 'Summon Elemental',
          profileId: 'air-elemental',
          profileName: 'Air Elemental',
          tokensPlaced: 1,
          tokenIds: ['token-air-elemental-1'],
          tokenNames: ['Air Elemental'],
          message: 'Summoned 1 token from Summon Elemental.',
        });
      }

      return Promise.reject(new Error(`Unexpected query: ${method}`));
    });

    const tools = new CharacterTools({
      foundryClient: { query } as unknown as FoundryClient,
      logger: createLoggerStub(),
    });

    const result = (await tools.handleRunDnD5eSummonActivity({
      actorIdentifier: 'Laeral',
      itemIdentifier: 'Conjure Elemental',
      activityIdentifier: 'summon-elemental',
      profileId: 'air-elemental',
      placementType: 'coordinates',
      coordinates: [{ x: 1400, y: 900 }],
      hidden: false,
      reason: 'Combat summon workflow',
    })) as Record<string, unknown>;

    expect(result).toMatchObject({
      success: true,
      workflow: {
        name: 'run-dnd5e-summon-activity',
        system: 'dnd5e',
      },
      workflowStatus: 'completed',
      actor: {
        id: 'actor-laeral',
        name: 'Laeral',
        type: 'character',
      },
      item: {
        id: 'item-conjure-elemental',
        name: 'Conjure Elemental',
        type: 'spell',
      },
      activity: {
        id: 'summon-elemental',
        name: 'Summon Elemental',
      },
      profile: {
        id: 'air-elemental',
        name: 'Air Elemental',
      },
      tokensPlaced: 1,
      tokenIds: ['token-air-elemental-1'],
      tokenNames: ['Air Elemental'],
    });
  });

  it('surfaces summon profile choices when run-dnd5e-summon-activity still needs selection data', async () => {
    const query = vi.fn().mockImplementation((method: string, data?: unknown) => {
      if (method === 'maeinomatic-foundry-mcp.getWorldInfo') {
        return Promise.resolve({ system: 'dnd5e' });
      }

      if (method === 'maeinomatic-foundry-mcp.runDnD5eSummonActivity') {
        expect(data).toEqual({
          actorIdentifier: 'Laeral',
          itemIdentifier: 'Conjure Elemental',
        });
        return Promise.resolve({
          success: false,
          system: 'dnd5e',
          actorId: 'actor-laeral',
          actorName: 'Laeral',
          actorType: 'character',
          itemId: 'item-conjure-elemental',
          itemName: 'Conjure Elemental',
          itemType: 'spell',
          workflowStatus: 'needs-profile',
          requiresChoices: true,
          activityId: 'summon-elemental',
          activityName: 'Summon Elemental',
          availableProfiles: [
            {
              id: 'air-elemental',
              name: 'Air Elemental',
            },
            {
              id: 'fire-elemental',
              name: 'Fire Elemental',
            },
          ],
          message:
            'This summon activity exposes multiple summon profiles. Provide profileId to choose which summon profile to run.',
        });
      }

      return Promise.reject(new Error(`Unexpected query: ${method}`));
    });

    const tools = new CharacterTools({
      foundryClient: { query } as unknown as FoundryClient,
      logger: createLoggerStub(),
    });

    const result = (await tools.handleRunDnD5eSummonActivity({
      actorIdentifier: 'Laeral',
      itemIdentifier: 'Conjure Elemental',
    })) as Record<string, unknown>;

    expect(result).toMatchObject({
      success: false,
      workflow: {
        name: 'run-dnd5e-summon-activity',
        system: 'dnd5e',
      },
      workflowStatus: 'needs-profile',
      requiresChoices: true,
      activity: {
        id: 'summon-elemental',
        name: 'Summon Elemental',
      },
      availableProfiles: [
        {
          id: 'air-elemental',
          name: 'Air Elemental',
        },
        {
          id: 'fire-elemental',
          name: 'Fire Elemental',
        },
      ],
      unresolved: {
        kind: 'summon-profile',
        requiresChoices: true,
        availableProfiles: [
          {
            id: 'air-elemental',
            name: 'Air Elemental',
          },
          {
            id: 'fire-elemental',
            name: 'Fire Elemental',
          },
        ],
      },
    });
  });

  it('uses the shared run-dnd5e-transform-activity-workflow bridge request shape', async () => {
    const query = vi.fn().mockImplementation((method: string, data?: unknown) => {
      if (method === 'maeinomatic-foundry-mcp.getWorldInfo') {
        return Promise.resolve({ system: 'dnd5e' });
      }

      if (method === 'maeinomatic-foundry-mcp.runDnD5eTransformActivity') {
        expect(data).toEqual({
          actorIdentifier: 'Laeral',
          itemIdentifier: 'Wild Shape',
          activityIdentifier: 'wild-shape-bear',
          reason: 'Combat transformation workflow',
        });
        return Promise.resolve({
          success: true,
          system: 'dnd5e',
          actorId: 'actor-laeral',
          actorName: 'Laeral',
          actorType: 'character',
          itemId: 'item-wild-shape',
          itemName: 'Wild Shape',
          itemType: 'feat',
          workflowStatus: 'completed',
          activityId: 'wild-shape-bear',
          activityName: 'Wild Shape',
          sourceActorId: 'actor-brown-bear',
          sourceActorName: 'Brown Bear',
          sourceActorType: 'npc',
          transformedActorId: 'actor-laeral',
          transformedActorName: 'Laeral',
          transformedActorType: 'character',
          tokenIds: ['token-laeral-1'],
          tokenNames: ['Laeral'],
          message:
            'Transform activity "Wild Shape" completed using Brown Bear as the transformation source.',
        });
      }

      return Promise.reject(new Error(`Unexpected query: ${method}`));
    });

    const tools = new CharacterTools({
      foundryClient: { query } as unknown as FoundryClient,
      logger: createLoggerStub(),
    });

    const result = (await tools.handleRunDnD5eTransformActivityWorkflow({
      actorIdentifier: 'Laeral',
      itemIdentifier: 'Wild Shape',
      activityIdentifier: 'wild-shape-bear',
      reason: 'Combat transformation workflow',
    })) as Record<string, unknown>;

    expect(result).toMatchObject({
      success: true,
      workflow: {
        name: 'run-dnd5e-transform-activity-workflow',
        system: 'dnd5e',
      },
      workflowStatus: 'completed',
      actor: {
        id: 'actor-laeral',
        name: 'Laeral',
        type: 'character',
      },
      item: {
        id: 'item-wild-shape',
        name: 'Wild Shape',
        type: 'feat',
      },
      activity: {
        id: 'wild-shape-bear',
        name: 'Wild Shape',
      },
      sourceActor: {
        id: 'actor-brown-bear',
        name: 'Brown Bear',
        type: 'npc',
      },
      transformedActor: {
        id: 'actor-laeral',
        name: 'Laeral',
        type: 'character',
      },
      tokenIds: ['token-laeral-1'],
      tokenNames: ['Laeral'],
    });
  });

  it('surfaces transform activity choices when run-dnd5e-transform-activity-workflow needs selection data', async () => {
    const query = vi.fn().mockImplementation((method: string, data?: unknown) => {
      if (method === 'maeinomatic-foundry-mcp.getWorldInfo') {
        return Promise.resolve({ system: 'dnd5e' });
      }

      if (method === 'maeinomatic-foundry-mcp.runDnD5eTransformActivity') {
        expect(data).toEqual({
          actorIdentifier: 'Laeral',
          itemIdentifier: 'Wild Shape',
        });
        return Promise.resolve({
          success: false,
          system: 'dnd5e',
          actorId: 'actor-laeral',
          actorName: 'Laeral',
          actorType: 'character',
          itemId: 'item-wild-shape',
          itemName: 'Wild Shape',
          itemType: 'feat',
          workflowStatus: 'needs-activity',
          requiresChoices: true,
          availableActivities: [
            {
              id: 'wild-shape-bear',
              name: 'Wild Shape Bear',
              type: 'transform',
            },
            {
              id: 'wild-shape-wolf',
              name: 'Wild Shape Wolf',
              type: 'transform',
            },
          ],
          message:
            'This item exposes multiple transform activities. Provide activityIdentifier to select the one to run.',
        });
      }

      return Promise.reject(new Error(`Unexpected query: ${method}`));
    });

    const tools = new CharacterTools({
      foundryClient: { query } as unknown as FoundryClient,
      logger: createLoggerStub(),
    });

    const result = (await tools.handleRunDnD5eTransformActivityWorkflow({
      actorIdentifier: 'Laeral',
      itemIdentifier: 'Wild Shape',
    })) as Record<string, unknown>;

    expect(result).toMatchObject({
      success: false,
      workflow: {
        name: 'run-dnd5e-transform-activity-workflow',
        system: 'dnd5e',
      },
      workflowStatus: 'needs-activity',
      requiresChoices: true,
      availableActivities: [
        {
          id: 'wild-shape-bear',
          name: 'Wild Shape Bear',
          type: 'transform',
        },
        {
          id: 'wild-shape-wolf',
          name: 'Wild Shape Wolf',
          type: 'transform',
        },
      ],
      unresolved: {
        kind: 'transform-activity',
        requiresChoices: true,
        availableActivities: [
          {
            id: 'wild-shape-bear',
            name: 'Wild Shape Bear',
            type: 'transform',
          },
          {
            id: 'wild-shape-wolf',
            name: 'Wild Shape Wolf',
            type: 'transform',
          },
        ],
      },
    });
  });

  it('completes the DnD5e multiclass entry workflow, reconciles the spellbook, and validates the final build', async () => {
    const query = vi.fn().mockImplementation((method: string, data?: unknown) => {
      if (method === 'maeinomatic-foundry-mcp.getWorldInfo') {
        return Promise.resolve({ system: 'dnd5e' });
      }

      if (method === 'maeinomatic-foundry-mcp.getCharacterInfo') {
        const characterInfoCallCount = query.mock.calls.filter(
          ([calledMethod]) => calledMethod === 'maeinomatic-foundry-mcp.getCharacterInfo'
        ).length;

        expect(data).toEqual({ identifier: 'Laeral' });

        if (characterInfoCallCount === 1) {
          return Promise.resolve({
            id: 'actor-10',
            name: 'Laeral',
            type: 'character',
            system: {},
            items: [
              {
                id: 'class-fighter',
                name: 'Fighter',
                type: 'class',
                system: {
                  levels: 3,
                },
              },
            ],
            effects: [],
          });
        }

        return Promise.resolve({
          id: 'actor-10',
          name: 'Laeral',
          type: 'character',
          system: {},
          items: [
            {
              id: 'class-fighter',
              name: 'Fighter',
              type: 'class',
              system: {
                levels: 3,
              },
            },
            {
              id: 'class-wizard-new',
              name: 'Wizard',
              type: 'class',
              system: {
                levels: 1,
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

      if (method === 'maeinomatic-foundry-mcp.getCompendiumDocumentFull') {
        expect(data).toEqual({
          packId: 'dnd5e.classes',
          documentId: 'wizard',
        });
        return Promise.resolve({
          id: 'wizard',
          name: 'Wizard',
          type: 'class',
        });
      }

      if (method === 'maeinomatic-foundry-mcp.createActorEmbeddedItem') {
        expect(data).toEqual({
          actorIdentifier: 'Laeral',
          sourceUuid: 'Compendium.dnd5e.classes.wizard',
          itemType: 'class',
          reason: 'multiclass entry',
        });
        return Promise.resolve({
          success: true,
          actorId: 'actor-10',
          actorName: 'Laeral',
          itemId: 'class-wizard-new',
          itemName: 'Wizard',
          itemType: 'class',
          createdFrom: 'uuid',
          sourceUuid: 'Compendium.dnd5e.classes.wizard',
        });
      }

      if (method === 'maeinomatic-foundry-mcp.previewCharacterProgression') {
        expect(data).toEqual({
          actorIdentifier: 'Laeral',
          classIdentifier: 'class-wizard-new',
          targetLevel: 1,
        });
        return Promise.resolve({
          system: 'dnd5e',
          actorId: 'actor-10',
          actorName: 'Laeral',
          actorType: 'character',
          classId: 'class-wizard-new',
          className: 'Wizard',
          currentLevel: 0,
          targetLevel: 1,
          safeToApplyDirectly: true,
          pendingSteps: [],
        });
      }

      if (method === 'maeinomatic-foundry-mcp.updateActorEmbeddedItem') {
        expect(data).toEqual({
          actorIdentifier: 'Laeral',
          itemIdentifier: 'class-wizard-new',
          itemType: 'class',
          updates: {
            'system.levels': 1,
          },
          reason: 'character progression update',
        });
        return Promise.resolve({
          success: true,
          actorId: 'actor-10',
          actorName: 'Laeral',
          itemId: 'class-wizard-new',
          itemName: 'Wizard',
          itemType: 'class',
          appliedUpdates: {
            'system.levels': 1,
          },
          updatedFields: ['system.levels'],
        });
      }

      if (method === 'maeinomatic-foundry-mcp.validateCharacterBuild') {
        return Promise.resolve({
          system: 'dnd5e',
          actorId: 'actor-10',
          actorName: 'Laeral',
          actorType: 'character',
          summary: {
            classCount: 2,
            totalClassLevels: 4,
            outstandingAdvancementCount: 0,
            issueCount: 0,
            errorCount: 0,
            warningCount: 0,
            infoCount: 0,
          },
          issues: [],
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

    const result = (await tools.handleCompleteDnD5eMulticlassEntryWorkflow({
      characterIdentifier: 'Laeral',
      classUuid: 'Compendium.dnd5e.classes.wizard',
      reason: 'multiclass entry',
    })) as Record<string, unknown>;

    expect(result).toMatchObject({
      success: true,
      workflow: {
        name: 'complete-dnd5e-multiclass-entry-workflow',
        system: 'dnd5e',
      },
      workflowStatus: 'completed',
      completed: true,
      classCreated: true,
      progressionComplete: true,
      spellbookOrganized: true,
      class: {
        id: 'class-wizard-new',
        name: 'Wizard',
        type: 'class',
      },
      sourceUuid: 'Compendium.dnd5e.classes.wizard',
      levelUp: {
        workflowStatus: 'completed',
      },
      spellbook: {
        workflowStatus: 'completed',
      },
      verification: {
        verified: true,
        build: {
          verified: true,
          summary: {
            classCount: 2,
            totalClassLevels: 4,
          },
        },
        spellbook: {
          verified: true,
        },
      },
    });
  });

  it('returns resumable level-up guidance when multiclass entry still needs advancement choices', async () => {
    const query = vi.fn().mockImplementation((method: string) => {
      if (method === 'maeinomatic-foundry-mcp.getWorldInfo') {
        return Promise.resolve({ system: 'dnd5e' });
      }

      if (method === 'maeinomatic-foundry-mcp.getCharacterInfo') {
        const characterInfoCallCount = query.mock.calls.filter(
          ([calledMethod]) => calledMethod === 'maeinomatic-foundry-mcp.getCharacterInfo'
        ).length;

        if (characterInfoCallCount === 1) {
          return Promise.resolve({
            id: 'actor-11',
            name: 'Laeral',
            type: 'character',
            system: {},
            items: [
              {
                id: 'class-fighter',
                name: 'Fighter',
                type: 'class',
                system: {
                  levels: 3,
                },
              },
            ],
            effects: [],
          });
        }

        return Promise.resolve({
          id: 'actor-11',
          name: 'Laeral',
          type: 'character',
          system: {},
          items: [
            {
              id: 'class-fighter',
              name: 'Fighter',
              type: 'class',
              system: {
                levels: 3,
              },
            },
            {
              id: 'class-wizard-new',
              name: 'Wizard',
              type: 'class',
              system: {
                levels: 0,
                advancement: [{ type: 'Subclass', level: 1 }],
              },
            },
          ],
          effects: [],
        });
      }

      if (method === 'maeinomatic-foundry-mcp.getCompendiumDocumentFull') {
        return Promise.resolve({
          id: 'wizard',
          name: 'Wizard',
          type: 'class',
        });
      }

      if (method === 'maeinomatic-foundry-mcp.createActorEmbeddedItem') {
        return Promise.resolve({
          success: true,
          actorId: 'actor-11',
          actorName: 'Laeral',
          itemId: 'class-wizard-new',
          itemName: 'Wizard',
          itemType: 'class',
          createdFrom: 'uuid',
          sourceUuid: 'Compendium.dnd5e.classes.wizard',
        });
      }

      if (method === 'maeinomatic-foundry-mcp.previewCharacterProgression') {
        return Promise.resolve({
          system: 'dnd5e',
          actorId: 'actor-11',
          actorName: 'Laeral',
          actorType: 'character',
          classId: 'class-wizard-new',
          className: 'Wizard',
          currentLevel: 0,
          targetLevel: 1,
          safeToApplyDirectly: false,
          pendingSteps: [
            {
              id: 'subclass-step',
              level: 1,
              type: 'Subclass',
              title: 'Arcane Tradition',
              required: true,
              choicesRequired: true,
              autoApplySafe: false,
            },
          ],
        });
      }

      if (method === 'maeinomatic-foundry-mcp.getCharacterAdvancementOptions') {
        return Promise.resolve({
          system: 'dnd5e',
          actorId: 'actor-11',
          actorName: 'Laeral',
          actorType: 'character',
          stepId: 'subclass-step',
          stepType: 'Subclass',
          stepTitle: 'Arcane Tradition',
          options: [
            {
              id: 'evocation',
              name: 'School of Evocation',
              type: 'subclass',
              source: 'compendium',
              uuid: 'Compendium.dnd5e.subclasses.Item.evocation',
            },
          ],
          totalOptions: 1,
          classId: 'class-wizard-new',
          className: 'Wizard',
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

    const result = (await tools.handleCompleteDnD5eMulticlassEntryWorkflow({
      characterIdentifier: 'Laeral',
      classUuid: 'Compendium.dnd5e.classes.wizard',
    })) as Record<string, unknown>;

    expect(result).toMatchObject({
      success: false,
      partialSuccess: true,
      workflow: {
        name: 'complete-dnd5e-multiclass-entry-workflow',
        system: 'dnd5e',
      },
      workflowStatus: 'needs-choices',
      classCreated: true,
      progressionComplete: false,
      spellbookOrganized: false,
      class: {
        id: 'class-wizard-new',
        name: 'Wizard',
        type: 'class',
      },
      levelUp: {
        workflowStatus: 'needs-choices',
        pendingAdvancements: [
          expect.objectContaining({
            id: 'subclass-step',
          }),
        ],
      },
      unresolved: {
        phase: 'level-up',
        kind: 'advancement',
        requiresChoices: true,
      },
    });
    expect(result.nextStep).toContain('classIdentifier');
  });

  it('adds a new DnD5e class item and finalizes the initial multiclass level flow', async () => {
    const query = vi.fn().mockImplementation((method: string, data?: unknown) => {
      if (method === 'maeinomatic-foundry-mcp.getWorldInfo') {
        return Promise.resolve({ system: 'dnd5e' });
      }

      if (method === 'maeinomatic-foundry-mcp.getCharacterInfo') {
        const characterInfoCallCount = query.mock.calls.filter(
          ([calledMethod]) => calledMethod === 'maeinomatic-foundry-mcp.getCharacterInfo'
        ).length;

        if (characterInfoCallCount === 1) {
          return Promise.resolve({
            id: 'actor-9',
            name: 'Laeral',
            type: 'character',
            system: {},
            items: [
              {
                id: 'class-fighter',
                name: 'Fighter',
                type: 'class',
                system: {
                  levels: 3,
                },
              },
            ],
            effects: [],
          });
        }

        return Promise.resolve({
          id: 'actor-9',
          name: 'Laeral',
          type: 'character',
          system: {},
          items: [
            {
              id: 'class-fighter',
              name: 'Fighter',
              type: 'class',
              system: {
                levels: 3,
              },
            },
            {
              id: 'class-wizard-new',
              name: 'Wizard',
              type: 'class',
              system: {
                levels: 0,
              },
            },
          ],
          effects: [],
        });
      }

      if (method === 'maeinomatic-foundry-mcp.getCompendiumDocumentFull') {
        expect(data).toEqual({
          packId: 'dnd5e.classes',
          documentId: 'wizard',
        });
        return Promise.resolve({
          id: 'wizard',
          name: 'Wizard',
          type: 'class',
        });
      }

      if (method === 'maeinomatic-foundry-mcp.createActorEmbeddedItem') {
        expect(data).toEqual({
          actorIdentifier: 'Laeral',
          sourceUuid: 'Compendium.dnd5e.classes.wizard',
          itemType: 'class',
        });
        return Promise.resolve({
          success: true,
          actorId: 'actor-9',
          actorName: 'Laeral',
          itemId: 'class-wizard-new',
          itemName: 'Wizard',
          itemType: 'class',
          createdFrom: 'uuid',
          sourceUuid: 'Compendium.dnd5e.classes.wizard',
        });
      }

      if (method === 'maeinomatic-foundry-mcp.previewCharacterProgression') {
        expect(data).toEqual({
          actorIdentifier: 'Laeral',
          classIdentifier: 'class-wizard-new',
          targetLevel: 1,
        });
        return Promise.resolve({
          system: 'dnd5e',
          actorId: 'actor-9',
          actorName: 'Laeral',
          actorType: 'character',
          classId: 'class-wizard-new',
          className: 'Wizard',
          currentLevel: 0,
          targetLevel: 1,
          safeToApplyDirectly: true,
          pendingSteps: [],
        });
      }

      if (method === 'maeinomatic-foundry-mcp.updateActorEmbeddedItem') {
        expect(data).toEqual({
          actorIdentifier: 'Laeral',
          itemIdentifier: 'class-wizard-new',
          itemType: 'class',
          updates: {
            'system.levels': 1,
          },
          reason: 'character progression update',
        });
        return Promise.resolve({
          success: true,
          actorId: 'actor-9',
          actorName: 'Laeral',
          itemId: 'class-wizard-new',
          itemName: 'Wizard',
          itemType: 'class',
          appliedUpdates: {
            'system.levels': 1,
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

    const result = (await tools.handleAddDnD5eClassToCharacter({
      characterIdentifier: 'Laeral',
      classUuid: 'Compendium.dnd5e.classes.wizard',
    })) as Record<string, unknown>;

    expect(result).toMatchObject({
      success: true,
      classCreated: true,
      progressionComplete: true,
      class: {
        id: 'class-wizard-new',
        name: 'Wizard',
        type: 'class',
      },
      progression: {
        classId: 'class-wizard-new',
        className: 'Wizard',
        previousLevel: 0,
        targetLevel: 1,
        mode: 'set-class-levels',
      },
      updatedFields: ['system.levels'],
    });
  });

  it('uses the shared create-character-companion bridge request shape', async () => {
    const query = vi.fn().mockImplementation((method: string, data?: unknown) => {
      if (method === 'maeinomatic-foundry-mcp.createCharacterCompanion') {
        expect(data).toEqual({
          ownerActorIdentifier: 'Laeral',
          role: 'familiar',
          sourceUuid: 'Compendium.dnd5e.monsters.owl',
          customName: 'Nimbus',
          addToScene: true,
          placement: {
            type: 'near-owner',
          },
          syncOwnership: true,
        });
        return Promise.resolve({
          success: true,
          ownerActorId: 'actor-9',
          ownerActorName: 'Laeral',
          companionActorId: 'actor-owl',
          companionActorName: 'Nimbus',
          companionActorType: 'npc',
          role: 'familiar',
          created: true,
          sourceUuid: 'Compendium.dnd5e.monsters.owl',
          linkedAt: '2026-03-22T12:00:00.000Z',
          tokensPlaced: 1,
          tokenIds: ['token-owl-1'],
        });
      }

      return Promise.reject(new Error(`Unexpected query: ${method}`));
    });

    const tools = new CharacterTools({
      foundryClient: { query } as unknown as FoundryClient,
      logger: createLoggerStub(),
    });

    const result = (await tools.handleCreateCharacterCompanion({
      ownerActorIdentifier: 'Laeral',
      role: 'familiar',
      sourceUuid: 'Compendium.dnd5e.monsters.owl',
      customName: 'Nimbus',
      addToScene: true,
      placement: {
        type: 'near-owner',
      },
      syncOwnership: true,
    })) as Record<string, unknown>;

    expect(result).toMatchObject({
      success: true,
      companion: {
        id: 'actor-owl',
        name: 'Nimbus',
        type: 'npc',
        role: 'familiar',
      },
      created: true,
      tokensPlaced: 1,
      tokenIds: ['token-owl-1'],
    });
  });

  it('uses the shared list-character-companions bridge request shape', async () => {
    const query = vi.fn().mockImplementation((method: string, data?: unknown) => {
      if (method === 'maeinomatic-foundry-mcp.listCharacterCompanions') {
        expect(data).toEqual({
          ownerActorIdentifier: 'Laeral',
          role: 'familiar',
        });
        return Promise.resolve({
          ownerActorId: 'actor-9',
          ownerActorName: 'Laeral',
          companions: [
            {
              actorId: 'actor-owl',
              actorName: 'Nimbus',
              actorType: 'npc',
              role: 'familiar',
              ownerActorId: 'actor-9',
              ownerActorName: 'Laeral',
              onScene: true,
              tokenIds: ['token-owl-1'],
            },
          ],
          totalCompanions: 1,
        });
      }

      return Promise.reject(new Error(`Unexpected query: ${method}`));
    });

    const tools = new CharacterTools({
      foundryClient: { query } as unknown as FoundryClient,
      logger: createLoggerStub(),
    });

    const result = (await tools.handleListCharacterCompanions({
      ownerActorIdentifier: 'Laeral',
      role: 'familiar',
    })) as Record<string, unknown>;

    expect(result).toMatchObject({
      success: true,
      totalCompanions: 1,
      companions: [
        {
          actorId: 'actor-owl',
          actorName: 'Nimbus',
          role: 'familiar',
          onScene: true,
        },
      ],
    });
  });

  it('uses the shared summon-character-companion bridge request shape', async () => {
    const query = vi.fn().mockImplementation((method: string, data?: unknown) => {
      if (method === 'maeinomatic-foundry-mcp.summonCharacterCompanion') {
        expect(data).toEqual({
          ownerActorIdentifier: 'Laeral',
          companionIdentifier: 'Nimbus',
          placementType: 'near-owner',
          reuseExisting: true,
        });
        return Promise.resolve({
          success: true,
          ownerActorId: 'actor-9',
          ownerActorName: 'Laeral',
          companionActorId: 'actor-owl',
          companionActorName: 'Nimbus',
          role: 'familiar',
          tokensPlaced: 0,
          tokenIds: ['token-owl-1'],
          reusedExisting: true,
        });
      }

      return Promise.reject(new Error(`Unexpected query: ${method}`));
    });

    const tools = new CharacterTools({
      foundryClient: { query } as unknown as FoundryClient,
      logger: createLoggerStub(),
    });

    const result = (await tools.handleSummonCharacterCompanion({
      ownerActorIdentifier: 'Laeral',
      companionIdentifier: 'Nimbus',
      placementType: 'near-owner',
      reuseExisting: true,
    })) as Record<string, unknown>;

    expect(result).toMatchObject({
      success: true,
      companion: {
        id: 'actor-owl',
        name: 'Nimbus',
        role: 'familiar',
      },
      tokenIds: ['token-owl-1'],
      reusedExisting: true,
    });
  });

  it('uses the shared dismiss-character-companion bridge request shape', async () => {
    const query = vi.fn().mockImplementation((method: string, data?: unknown) => {
      if (method === 'maeinomatic-foundry-mcp.dismissCharacterCompanion') {
        expect(data).toEqual({
          ownerActorIdentifier: 'Laeral',
          companionIdentifier: 'Nimbus',
        });
        return Promise.resolve({
          success: true,
          ownerActorId: 'actor-9',
          ownerActorName: 'Laeral',
          dismissedCompanions: [
            {
              actorId: 'actor-owl',
              actorName: 'Nimbus',
              role: 'familiar',
              tokenIds: ['token-owl-1'],
            },
          ],
          dismissedTokenCount: 1,
        });
      }

      return Promise.reject(new Error(`Unexpected query: ${method}`));
    });

    const tools = new CharacterTools({
      foundryClient: { query } as unknown as FoundryClient,
      logger: createLoggerStub(),
    });

    const result = (await tools.handleDismissCharacterCompanion({
      ownerActorIdentifier: 'Laeral',
      companionIdentifier: 'Nimbus',
    })) as Record<string, unknown>;

    expect(result).toMatchObject({
      success: true,
      dismissedTokenCount: 1,
      dismissedCompanions: [
        {
          actorId: 'actor-owl',
          actorName: 'Nimbus',
          role: 'familiar',
        },
      ],
    });
  });

  it('uses the shared update-character-companion-link bridge request shape', async () => {
    const query = vi.fn().mockImplementation((method: string, data?: unknown) => {
      if (method === 'maeinomatic-foundry-mcp.updateCharacterCompanionLink') {
        expect(data).toEqual({
          ownerActorIdentifier: 'Laeral',
          companionIdentifier: 'Nimbus',
          notes: 'Scout and messenger',
          syncSettings: {
            syncOwnership: true,
            refreshFromSource: true,
          },
        });
        return Promise.resolve({
          success: true,
          ownerActorId: 'actor-9',
          ownerActorName: 'Laeral',
          companionActorId: 'actor-owl',
          companionActorName: 'Nimbus',
          companionActorType: 'npc',
          role: 'familiar',
          notes: 'Scout and messenger',
          syncSettings: {
            syncOwnership: true,
            refreshFromSource: true,
          },
          updatedFields: ['notes', 'syncSettings'],
        });
      }

      return Promise.reject(new Error(`Unexpected query: ${method}`));
    });

    const tools = new CharacterTools({
      foundryClient: { query } as unknown as FoundryClient,
      logger: createLoggerStub(),
    });

    const result = (await tools.handleUpdateCharacterCompanionLink({
      ownerActorIdentifier: 'Laeral',
      companionIdentifier: 'Nimbus',
      notes: 'Scout and messenger',
      syncSettings: {
        syncOwnership: true,
        refreshFromSource: true,
      },
    })) as Record<string, unknown>;

    expect(result).toMatchObject({
      success: true,
      companion: {
        id: 'actor-owl',
        name: 'Nimbus',
        role: 'familiar',
      },
      updatedFields: ['notes', 'syncSettings'],
      syncSettings: {
        syncOwnership: true,
        refreshFromSource: true,
      },
    });
  });

  it('uses the shared configure-character-companion-summon bridge request shape', async () => {
    const query = vi.fn().mockImplementation((method: string, data?: unknown) => {
      if (method === 'maeinomatic-foundry-mcp.configureCharacterCompanionSummon') {
        expect(data).toEqual({
          ownerActorIdentifier: 'Laeral',
          companionIdentifier: 'Nimbus',
          placementType: 'near-owner',
          hidden: false,
          reuseExisting: true,
        });
        return Promise.resolve({
          success: true,
          ownerActorId: 'actor-9',
          ownerActorName: 'Laeral',
          companionActorId: 'actor-owl',
          companionActorName: 'Nimbus',
          role: 'familiar',
          summonDefaults: {
            placementType: 'near-owner',
            hidden: false,
            reuseExisting: true,
          },
          updatedFields: ['summonDefaults'],
        });
      }

      return Promise.reject(new Error(`Unexpected query: ${method}`));
    });

    const tools = new CharacterTools({
      foundryClient: { query } as unknown as FoundryClient,
      logger: createLoggerStub(),
    });

    const result = (await tools.handleConfigureCharacterCompanionSummon({
      ownerActorIdentifier: 'Laeral',
      companionIdentifier: 'Nimbus',
      placementType: 'near-owner',
      hidden: false,
      reuseExisting: true,
    })) as Record<string, unknown>;

    expect(result).toMatchObject({
      success: true,
      companion: {
        id: 'actor-owl',
        name: 'Nimbus',
        role: 'familiar',
      },
      summonDefaults: {
        placementType: 'near-owner',
        hidden: false,
        reuseExisting: true,
      },
    });
  });

  it('uses the shared unlink-character-companion bridge request shape', async () => {
    const query = vi.fn().mockImplementation((method: string, data?: unknown) => {
      if (method === 'maeinomatic-foundry-mcp.unlinkCharacterCompanion') {
        expect(data).toEqual({
          ownerActorIdentifier: 'Laeral',
          companionIdentifier: 'Nimbus',
        });
        return Promise.resolve({
          success: true,
          ownerActorId: 'actor-9',
          ownerActorName: 'Laeral',
          companionActorId: 'actor-owl',
          companionActorName: 'Nimbus',
          role: 'familiar',
          unlinked: true,
        });
      }

      return Promise.reject(new Error(`Unexpected query: ${method}`));
    });

    const tools = new CharacterTools({
      foundryClient: { query } as unknown as FoundryClient,
      logger: createLoggerStub(),
    });

    const result = (await tools.handleUnlinkCharacterCompanion({
      ownerActorIdentifier: 'Laeral',
      companionIdentifier: 'Nimbus',
    })) as Record<string, unknown>;

    expect(result).toMatchObject({
      success: true,
      companion: {
        id: 'actor-owl',
        name: 'Nimbus',
        role: 'familiar',
      },
      unlinked: true,
    });
  });

  it('uses the shared delete-character-companion bridge request shape', async () => {
    const query = vi.fn().mockImplementation((method: string, data?: unknown) => {
      if (method === 'maeinomatic-foundry-mcp.deleteCharacterCompanion') {
        expect(data).toEqual({
          ownerActorIdentifier: 'Laeral',
          companionIdentifier: 'Nimbus',
          dismissSceneTokens: true,
        });
        return Promise.resolve({
          success: true,
          ownerActorId: 'actor-9',
          ownerActorName: 'Laeral',
          companionActorId: 'actor-owl',
          companionActorName: 'Nimbus',
          role: 'familiar',
          actorDeleted: true,
          dismissedTokenCount: 1,
          dismissedTokenIds: ['token-owl-1'],
        });
      }

      return Promise.reject(new Error(`Unexpected query: ${method}`));
    });

    const tools = new CharacterTools({
      foundryClient: { query } as unknown as FoundryClient,
      logger: createLoggerStub(),
    });

    const result = (await tools.handleDeleteCharacterCompanion({
      ownerActorIdentifier: 'Laeral',
      companionIdentifier: 'Nimbus',
      dismissSceneTokens: true,
    })) as Record<string, unknown>;

    expect(result).toMatchObject({
      success: true,
      companion: {
        id: 'actor-owl',
        name: 'Nimbus',
        role: 'familiar',
      },
      actorDeleted: true,
      dismissedTokenCount: 1,
      dismissedTokenIds: ['token-owl-1'],
    });
  });

  it('uses the shared sync-character-companion-progression bridge request shape', async () => {
    const query = vi.fn().mockImplementation((method: string, data?: unknown) => {
      if (method === 'maeinomatic-foundry-mcp.syncCharacterCompanionProgression') {
        expect(data).toEqual({
          ownerActorIdentifier: 'Laeral',
          companionIdentifier: 'Nimbus',
          syncOwnership: true,
          refreshFromSource: true,
          matchOwnerLevel: true,
          levelOffset: 0,
        });
        return Promise.resolve({
          success: true,
          ownerActorId: 'actor-9',
          ownerActorName: 'Laeral',
          companionActorId: 'actor-owl',
          companionActorName: 'Nimbus',
          role: 'familiar',
          appliedOperations: ['refreshFromSource', 'syncOwnership', 'matchOwnerLevel'],
          updatedFields: ['img', 'system', 'ownership', 'system.details.level.value'],
        });
      }

      return Promise.reject(new Error(`Unexpected query: ${method}`));
    });

    const tools = new CharacterTools({
      foundryClient: { query } as unknown as FoundryClient,
      logger: createLoggerStub(),
    });

    const result = (await tools.handleSyncCharacterCompanionProgression({
      ownerActorIdentifier: 'Laeral',
      companionIdentifier: 'Nimbus',
      syncOwnership: true,
      refreshFromSource: true,
      matchOwnerLevel: true,
      levelOffset: 0,
    })) as Record<string, unknown>;

    expect(result).toMatchObject({
      success: true,
      companion: {
        id: 'actor-owl',
        name: 'Nimbus',
        role: 'familiar',
      },
      appliedOperations: ['refreshFromSource', 'syncOwnership', 'matchOwnerLevel'],
      updatedFields: ['img', 'system', 'ownership', 'system.details.level.value'],
    });
  });
});
