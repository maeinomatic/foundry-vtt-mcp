import { describe, expect, it, vi } from 'vitest';

import type { FoundryClient } from '../foundry-client.js';
import type { Logger } from '../logger.js';
import { SceneTools } from './scene.js';

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

describe('SceneTools', () => {
  it('uses the shared active-scene bridge request and formats visible scene data', async () => {
    const query = vi.fn().mockImplementation((method: string) => {
      if (method === 'maeinomatic-foundry-mcp.getActiveScene') {
        return Promise.resolve({
          id: 'scene-1',
          name: 'Goblin Caves',
          active: true,
          width: 4000,
          height: 3000,
          padding: 0.25,
          background: { src: 'caves.webp' },
          navigation: true,
          walls: 12,
          lights: 3,
          sounds: 1,
          notes: [{ id: 'note-1', text: 'Entrance', x: 100, y: 200 }],
          tokens: [
            {
              id: 'token-1',
              name: 'Goblin Scout',
              x: 500,
              y: 600,
              width: 1,
              height: 1,
              actorId: 'actor-1',
              disposition: -1,
              hidden: false,
              img: 'goblin.png',
            },
            {
              id: 'token-2',
              name: 'Hidden Trap',
              x: 800,
              y: 900,
              width: 1,
              height: 1,
              disposition: 0,
              hidden: true,
            },
          ],
        });
      }

      return Promise.reject(new Error(`Unexpected query: ${method}`));
    });

    const tools = new SceneTools({
      foundryClient: { query } as unknown as FoundryClient,
      logger: createLoggerStub(),
    });

    const result = (await tools.handleGetCurrentScene({
      includeTokens: true,
      includeHidden: false,
    })) as Record<string, unknown>;

    expect(query).toHaveBeenCalledWith('maeinomatic-foundry-mcp.getActiveScene');
    expect(result).toMatchObject({
      id: 'scene-1',
      name: 'Goblin Caves',
      active: true,
      hasBackground: true,
      navigation: true,
      elements: {
        walls: 12,
        lights: 3,
        sounds: 1,
        notes: 1,
      },
      tokenSummary: {
        total: 1,
        hasActors: 1,
        withoutActors: 0,
      },
    });
    expect(result.tokens).toMatchObject([
      {
        id: 'token-1',
        name: 'Goblin Scout',
        disposition: 'hostile',
        hidden: false,
      },
    ]);
  });

  it('uses the shared world-info bridge request and summarizes active users', async () => {
    const query = vi.fn().mockImplementation((method: string) => {
      if (method === 'maeinomatic-foundry-mcp.getWorldInfo') {
        return Promise.resolve({
          id: 'world-1',
          title: 'Shadows of the Coast',
          system: 'dnd5e',
          systemVersion: '5.1.10',
          foundryVersion: '13.350',
          users: [
            { id: 'user-1', name: 'GM', active: true, isGM: true },
            { id: 'user-2', name: 'Player One', active: true, isGM: false },
            { id: 'user-3', name: 'Player Two', active: false, isGM: false },
          ],
        });
      }

      return Promise.reject(new Error(`Unexpected query: ${method}`));
    });

    const tools = new SceneTools({
      foundryClient: { query } as unknown as FoundryClient,
      logger: createLoggerStub(),
    });

    const result = await tools.handleGetWorldInfo({});

    expect(query).toHaveBeenCalledWith('maeinomatic-foundry-mcp.getWorldInfo');
    expect(result).toMatchObject({
      id: 'world-1',
      title: 'Shadows of the Coast',
      system: {
        id: 'dnd5e',
        version: '5.1.10',
      },
      users: {
        total: 3,
        active: 2,
        gms: 1,
        players: 2,
      },
      activeUsers: [
        { id: 'user-1', name: 'GM', isGM: true },
        { id: 'user-2', name: 'Player One', isGM: false },
      ],
    });
  });
});
