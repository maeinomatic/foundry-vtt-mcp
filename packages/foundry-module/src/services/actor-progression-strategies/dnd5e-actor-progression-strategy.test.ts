import { afterEach, describe, expect, it, vi } from 'vitest';

import { dnd5eActorProgressionStrategy } from './dnd5e-actor-progression-strategy.js';

describe('dnd5eActorProgressionStrategy item grants', () => {
  const originalGame = globalThis.game;

  afterEach(() => {
    globalThis.game = originalGame;
    vi.restoreAllMocks();
  });

  it('accepts canonical compendium UUIDs for item grants when the configured pool uses a raw pack UUID', async () => {
    globalThis.game = {
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
              toObject: () => ({
                _id: 'YpiLQEKGalROn7iJ',
                name: 'Channel Divinity',
                type: 'feat',
                system: {},
              }),
            }),
          },
        ],
      },
    } as typeof globalThis.game;

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
    };

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
      expect.objectContaining({
        _id: 'class-cleric',
      }),
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
});
