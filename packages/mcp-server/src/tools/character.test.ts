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
});
