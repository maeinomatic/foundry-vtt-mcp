import { describe, expect, it, vi } from 'vitest';

import type { FoundryClient } from '../foundry-client.js';
import type { Logger } from '../logger.js';
import { TokenManipulationTools } from './token-manipulation.js';

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

describe('TokenManipulationTools', () => {
  it('uses the move-token bridge request shape', async () => {
    const query = vi.fn().mockResolvedValue({ success: true });

    const tools = new TokenManipulationTools({
      foundryClient: { query } as unknown as FoundryClient,
      logger: createLoggerStub(),
    });

    const result = await tools.handleMoveToken({
      tokenId: 'token-1',
      x: 420,
      y: 840,
      animate: true,
    });

    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.move-token', {
      tokenId: 'token-1',
      x: 420,
      y: 840,
      animate: true,
    });
    expect(result).toMatchObject({
      success: true,
      tokenId: 'token-1',
      newPosition: { x: 420, y: 840 },
      animated: true,
    });
  });

  it('uses the update-token bridge request shape', async () => {
    const query = vi.fn().mockResolvedValue({ success: true });

    const tools = new TokenManipulationTools({
      foundryClient: { query } as unknown as FoundryClient,
      logger: createLoggerStub(),
    });

    const result = await tools.handleUpdateToken({
      tokenId: 'token-1',
      updates: {
        hidden: true,
        rotation: 90,
      },
    });

    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.update-token', {
      tokenId: 'token-1',
      updates: {
        hidden: true,
        rotation: 90,
      },
    });
    expect(result).toMatchObject({
      success: true,
      tokenId: 'token-1',
      updated: true,
      appliedUpdates: {
        hidden: true,
        rotation: 90,
      },
    });
  });

  it('uses the delete-tokens bridge request shape', async () => {
    const query = vi.fn().mockResolvedValue({
      success: true,
      deletedCount: 2,
      tokenIds: ['token-1', 'token-2'],
      errors: [],
    });

    const tools = new TokenManipulationTools({
      foundryClient: { query } as unknown as FoundryClient,
      logger: createLoggerStub(),
    });

    const result = await tools.handleDeleteTokens({
      tokenIds: ['token-1', 'token-2'],
    });

    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.delete-tokens', {
      tokenIds: ['token-1', 'token-2'],
    });
    expect(result).toMatchObject({
      success: true,
      deletedCount: 2,
      tokenIds: ['token-1', 'token-2'],
    });
  });

  it('uses the get-token-details bridge request shape and formats actor-linked details', async () => {
    const query = vi.fn().mockResolvedValue({
      id: 'token-1',
      name: 'Goblin Scout',
      x: 500,
      y: 600,
      width: 1,
      height: 1,
      rotation: 0,
      alpha: 1,
      hidden: false,
      img: 'goblin.png',
      disposition: -1,
      elevation: 10,
      lockRotation: false,
      actorId: 'actor-1',
      actorLink: true,
      actorData: {
        name: 'Goblin',
        type: 'npc',
        img: 'actor-goblin.png',
      },
    });

    const tools = new TokenManipulationTools({
      foundryClient: { query } as unknown as FoundryClient,
      logger: createLoggerStub(),
    });

    const result = await tools.handleGetTokenDetails({
      tokenId: 'token-1',
    });

    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.get-token-details', {
      tokenId: 'token-1',
    });
    expect(result).toMatchObject({
      id: 'token-1',
      name: 'Goblin Scout',
      behavior: {
        disposition: 'hostile',
        elevation: 10,
      },
      actor: {
        id: 'actor-1',
        name: 'Goblin',
        type: 'npc',
        isLinked: true,
      },
    });
  });

  it('uses the toggle-token-condition bridge request shape', async () => {
    const query = vi.fn().mockResolvedValue({
      success: true,
      isActive: true,
      conditionName: 'Prone',
    });

    const tools = new TokenManipulationTools({
      foundryClient: { query } as unknown as FoundryClient,
      logger: createLoggerStub(),
    });

    const result = await tools.handleToggleTokenCondition({
      tokenId: 'token-1',
      conditionId: 'prone',
      active: true,
    });

    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.toggle-token-condition', {
      tokenId: 'token-1',
      conditionId: 'prone',
      active: true,
    });
    expect(result).toMatchObject({
      success: true,
      tokenId: 'token-1',
      conditionId: 'prone',
      isActive: true,
      conditionName: 'Prone',
    });
  });

  it('uses the get-available-conditions bridge request shape', async () => {
    const query = vi.fn().mockResolvedValue({
      conditions: [
        { id: 'prone', name: 'Prone' },
        { id: 'poisoned', name: 'Poisoned' },
      ],
      gameSystem: 'dnd5e',
    });

    const tools = new TokenManipulationTools({
      foundryClient: { query } as unknown as FoundryClient,
      logger: createLoggerStub(),
    });

    const result = await tools.handleGetAvailableConditions({});

    expect(query).toHaveBeenCalledWith('foundry-mcp-bridge.get-available-conditions', {});
    expect(result).toMatchObject({
      success: true,
      gameSystem: 'dnd5e',
      conditions: [
        { id: 'prone', name: 'Prone' },
        { id: 'poisoned', name: 'Poisoned' },
      ],
    });
  });
});
