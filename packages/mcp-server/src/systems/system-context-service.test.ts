import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { FoundryClient } from '../foundry-client.js';
import type { Logger } from '../logger.js';
import { DnD5eAdapter } from './dnd5e/adapter.js';
import { PF2eAdapter } from './pf2e/adapter.js';
import { SystemContextService } from './system-context-service.js';
import { SystemRegistry } from './system-registry.js';
import { clearSystemCache } from '../utils/system-detection.js';

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

describe('SystemContextService', () => {
  beforeEach(() => {
    clearSystemCache();
  });

  it('resolves the active system and adapter through one path', async () => {
    const foundryClient = {
      query: vi.fn().mockResolvedValue({ system: { id: 'dnd5e' } }),
    } as unknown as FoundryClient;
    const registry = new SystemRegistry();
    registry.register(new DnD5eAdapter());

    const service = new SystemContextService({
      foundryClient,
      logger: createLoggerStub(),
      systemRegistry: registry,
    });

    const result = await service.resolve();

    expect(result.system).toBe('dnd5e');
    expect(result.adapter?.getMetadata().id).toBe('dnd5e');
  });

  it('retries detection after invalidation', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ system: 'dnd5e' })
      .mockResolvedValueOnce({ system: 'pf2e' });
    const registry = new SystemRegistry();
    registry.register(new DnD5eAdapter());
    registry.register(new PF2eAdapter());

    const service = new SystemContextService({
      foundryClient: { query } as unknown as FoundryClient,
      logger: createLoggerStub(),
      systemRegistry: registry,
    });

    await expect(service.getGameSystem()).resolves.toBe('dnd5e');
    service.invalidateCache();
    clearSystemCache();
    await expect(service.getGameSystem()).resolves.toBe('pf2e');
  });

  it('throws an explicit capability error when no adapter is registered', async () => {
    const foundryClient = {
      query: vi.fn().mockResolvedValue({ system: 'coc7' }),
    } as unknown as FoundryClient;

    const service = new SystemContextService({
      foundryClient,
      logger: createLoggerStub(),
      systemRegistry: new SystemRegistry(),
    });

    await expect(service.requireAdapter('test-capability')).rejects.toThrow(
      'UNSUPPORTED_CAPABILITY'
    );
  });
}