import { describe, expect, it, vi } from 'vitest';

import type { FoundryClient } from '../foundry-client.js';
import type { Logger } from '../logger.js';
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
});
