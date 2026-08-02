import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ActorProgressionActorLike } from './actor-progression-strategy-contract.js';
import { dnd5eActorProgressionStrategy } from './dnd5e-actor-progression-strategy.js';

interface TestCompendiumPackDocument {
  _id: string;
  name: string;
  type: string;
}

interface TestCompendiumPack {
  metadata: {
    id: string;
    type: string;
  };
  index: {
    values: () => TestCompendiumPackDocument[];
  };
  getDocument: ReturnType<typeof vi.fn>;
}

interface TestGameLike {
  packs: {
    values: () => TestCompendiumPack[];
  };
}

function getGlobalScope(): Record<string, unknown> {
  return globalThis as unknown as Record<string, unknown>;
}

function setGame(value: unknown): void {
  getGlobalScope().game = value;
}

function getGame(): unknown {
  return getGlobalScope().game;
}

describe('dnd5eActorProgressionStrategy item grants', () => {
  const originalGame = getGame();

  afterEach((): void => {
    setGame(originalGame);
    vi.restoreAllMocks();
  });

  it('accepts canonical compendium UUIDs for item grants when the configured pool uses a raw pack UUID', async (): Promise<void> => {
    const mockGame: TestGameLike = {
      packs: {
        values: () => [
          {
            metadata: {
              id: 'dnd5e.classfeatures',
              type: 'Item',
            },
            index: {
              values: () => [
                {
                  _id: 'YpiLQEKGalROn7iJ',
                  name: 'Channel Divinity',
                  type: 'feat',
                },
              ],
            },
            getDocument: vi.fn().mockResolvedValue({
              id: 'YpiLQEKGalROn7iJ',
              name: 'Channel Divinity',
              type: 'feat',
              toObject: (): Record<string, unknown> => ({
                _id: 'YpiLQEKGalROn7iJ',
                name: 'Channel Divinity',
                type: 'feat',
                system: {},
              }),
            }),
          },
        ],
      },
    };
    setGame(mockGame);

    const createEmbeddedDocuments = vi.fn().mockResolvedValue([{ id: 'created-feature-1' }]);
    const updateEmbeddedDocuments = vi.fn().mockResolvedValue([]);

    const actor = {
      id: 'actor-1',
      name: 'Laeral',
      type: 'character',
      items: [
        {
          id: 'class-cleric',
          name: 'Cleric',
          type: 'class',
          system: {
            levels: 1,
            advancement: [
              {
                id: 'grant-step',
                type: 'ItemGrant',
                level: 2,
                configuration: {
                  pool: ['Compendium.dnd5e.classfeatures.YpiLQEKGalROn7iJ'],
                },
              },
            ],
          },
        },
      ],
      createEmbeddedDocuments,
      updateEmbeddedDocuments,
    } as ActorProgressionActorLike;

    const result = await dnd5eActorProgressionStrategy.applyCharacterAdvancementChoice({
      actor,
      request: {
        actorIdentifier: 'Laeral',
        classIdentifier: 'Cleric',
        targetLevel: 2,
        stepId: 'grant-step',
        choice: {
          type: 'item-grant',
          itemUuids: ['Compendium.dnd5e.classfeatures.Item.YpiLQEKGalROn7iJ'],
        },
      },
    });

    expect(createEmbeddedDocuments).toHaveBeenCalledWith('Item', [
      expect.objectContaining({
        name: 'Channel Divinity',
        type: 'feat',
      }),
    ]);
    expect(updateEmbeddedDocuments).toHaveBeenCalledWith('Item', [
      {
        _id: 'class-cleric',
        'system.advancement': [
          {
            id: 'grant-step',
            type: 'ItemGrant',
            level: 2,
            configuration: {
              pool: ['Compendium.dnd5e.classfeatures.YpiLQEKGalROn7iJ'],
            },
            value: {
              'created-feature-1': 'Compendium.dnd5e.classfeatures.Item.YpiLQEKGalROn7iJ',
            },
          },
        ],
      },
    ]);
    expect(result).toMatchObject({
      success: true,
      actorId: 'actor-1',
      classId: 'class-cleric',
      createdItemIds: ['created-feature-1'],
      choice: {
        type: 'item-grant',
        itemUuids: ['Compendium.dnd5e.classfeatures.Item.YpiLQEKGalROn7iJ'],
      },
    });
  });

  it('uses the DnD5e keyed advancement API when the source item stores advancements in a collection', async (): Promise<void> => {
    const mockGame: TestGameLike = {
      packs: {
        values: () => [
          {
            metadata: {
              id: 'dnd5e.classfeatures',
              type: 'Item',
            },
            index: {
              values: () => [
                {
                  _id: 'YpiLQEKGalROn7iJ',
                  name: 'Channel Divinity',
                  type: 'feat',
                },
              ],
            },
            getDocument: vi.fn().mockResolvedValue({
              id: 'YpiLQEKGalROn7iJ',
              name: 'Channel Divinity',
              type: 'feat',
              toObject: (): Record<string, unknown> => ({
                _id: 'YpiLQEKGalROn7iJ',
                name: 'Channel Divinity',
                type: 'feat',
                system: {},
              }),
            }),
          },
        ],
      },
    };
    setGame(mockGame);

    const updateAdvancement = vi.fn().mockResolvedValue(undefined);
    const classItem = {
      id: 'class-cleric',
      name: 'Cleric',
      type: 'class',
      system: {
        levels: 1,
        advancement: new Map([
          [
            'grant-step',
            {
              id: 'grant-step',
              type: 'ItemGrant',
              level: 2,
              configuration: {
                pool: ['Compendium.dnd5e.classfeatures.YpiLQEKGalROn7iJ'],
              },
            },
          ],
        ]),
      },
      updateAdvancement,
    };
    const createEmbeddedDocuments = vi.fn().mockResolvedValue([{ id: 'created-feature-1' }]);
    const actor = {
      id: 'actor-1',
      name: 'Laeral',
      type: 'character',
      items: [classItem],
      createEmbeddedDocuments,
    } as ActorProgressionActorLike;

    const result = await dnd5eActorProgressionStrategy.applyCharacterAdvancementChoice({
      actor,
      request: {
        actorIdentifier: 'Laeral',
        classIdentifier: 'Cleric',
        targetLevel: 2,
        stepId: 'grant-step',
        choice: {
          type: 'item-grant',
          itemUuids: ['Compendium.dnd5e.classfeatures.Item.YpiLQEKGalROn7iJ'],
        },
      },
    });

    expect(updateAdvancement).toHaveBeenCalledWith('grant-step', {
      id: 'grant-step',
      type: 'ItemGrant',
      level: 2,
      configuration: {
        pool: ['Compendium.dnd5e.classfeatures.YpiLQEKGalROn7iJ'],
      },
      value: {
        'created-feature-1': 'Compendium.dnd5e.classfeatures.Item.YpiLQEKGalROn7iJ',
      },
    });
    expect(result).toMatchObject({
      success: true,
      createdItemIds: ['created-feature-1'],
    });
  });

  it('keeps a default ASI value pending until abilities or a feat are selected', async (): Promise<void> => {
    const actor = {
      id: 'actor-asi',
      name: 'Laeral',
      type: 'character',
      items: [
        {
          id: 'class-cleric',
          name: 'Cleric',
          type: 'class',
          system: {
            levels: 3,
            advancement: [
              {
                id: 'asi-step',
                type: 'AbilityScoreImprovement',
                level: 4,
                configuration: {
                  points: 2,
                  cap: 2,
                  fixed: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 },
                },
                value: { type: 'asi' },
              },
            ],
          },
        },
      ],
    } as ActorProgressionActorLike;

    const result = await dnd5eActorProgressionStrategy.previewCharacterProgression({
      actor,
      request: {
        actorIdentifier: 'Laeral',
        classIdentifier: 'Cleric',
        targetLevel: 4,
      },
    });

    expect(result.safeToApplyDirectly).toBe(false);
    expect(result.pendingSteps).toEqual([
      expect.objectContaining({
        id: 'asi-step',
        type: 'AbilityScoreImprovement',
        level: 4,
        choicesRequired: true,
      }),
    ]);
  });
});
