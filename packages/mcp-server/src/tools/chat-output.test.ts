import { describe, expect, it, vi } from 'vitest';

import type { FoundryClient } from '../foundry-client.js';
import type { Logger } from '../logger.js';
import { ChatOutputTools } from './chat-output.js';

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

describe('ChatOutputTools', () => {
  it('uses the public post-chat-message bridge request shape', async () => {
    const query = vi.fn().mockResolvedValue({
      success: true,
      messageId: 'message-1',
      content: 'Scout ahead.',
      visibility: 'public',
    });

    const tools = new ChatOutputTools({
      foundryClient: { query } as unknown as FoundryClient,
      logger: createLoggerStub(),
    });

    const result = await tools.handlePostChatMessage({
      content: 'Scout ahead.',
      visibility: 'public',
    });

    expect(query).toHaveBeenCalledWith('maeinomatic-foundry-mcp.post-chat-message', {
      content: 'Scout ahead.',
      visibility: 'public',
    });
    expect(result).toMatchObject({
      success: true,
      messageId: 'message-1',
      visibility: 'public',
    });
  });

  it('uses the gm-only post-chat-message bridge request shape', async () => {
    const query = vi.fn().mockResolvedValue({
      success: true,
      messageId: 'message-2',
      content: 'Secret note.',
      visibility: 'gm-only',
      recipientUserIds: ['gm-1'],
    });

    const tools = new ChatOutputTools({
      foundryClient: { query } as unknown as FoundryClient,
      logger: createLoggerStub(),
    });

    const result = await tools.handlePostChatMessage({
      content: 'Secret note.',
      visibility: 'gm-only',
      speakerAlias: 'Narrator',
    });

    expect(query).toHaveBeenCalledWith('maeinomatic-foundry-mcp.post-chat-message', {
      content: 'Secret note.',
      visibility: 'gm-only',
      speakerAlias: 'Narrator',
    });
    expect(result).toMatchObject({
      success: true,
      messageId: 'message-2',
      visibility: 'gm-only',
      recipientUserIds: ['gm-1'],
    });
  });

  it('uses the selected-recipient post-chat-message bridge request shape', async () => {
    const query = vi.fn().mockResolvedValue({
      success: true,
      messageId: 'message-3',
      content: 'Only you see this.',
      visibility: 'recipients',
      recipientUserIds: ['user-1'],
      recipientUserNames: ['Aelar'],
    });

    const tools = new ChatOutputTools({
      foundryClient: { query } as unknown as FoundryClient,
      logger: createLoggerStub(),
    });

    const result = await tools.handlePostChatMessage({
      content: 'Only you see this.',
      visibility: 'recipients',
      recipientUsers: ['Aelar'],
      speakerActorIdentifier: 'Scout',
    });

    expect(query).toHaveBeenCalledWith('maeinomatic-foundry-mcp.post-chat-message', {
      content: 'Only you see this.',
      visibility: 'recipients',
      recipientUsers: ['Aelar'],
      speakerActorIdentifier: 'Scout',
    });
    expect(result).toMatchObject({
      success: true,
      messageId: 'message-3',
      visibility: 'recipients',
      recipientUserNames: ['Aelar'],
    });
  });

  it('rejects recipientUsers when visibility is not recipients', async () => {
    const tools = new ChatOutputTools({
      foundryClient: { query: vi.fn() } as unknown as FoundryClient,
      logger: createLoggerStub(),
    });

    await expect(
      tools.handlePostChatMessage({
        content: 'Invalid visibility payload.',
        visibility: 'public',
        recipientUsers: ['Aelar'],
      })
    ).rejects.toThrow('recipientUsers can only be provided when visibility is recipients');
  });
});
