import { beforeEach, describe, expect, it, vi } from 'vitest';

import { clearSystemCache, detectGameSystem, getCachedSystemId } from './system-detection.js';
import type { FoundryClient } from '../foundry-client.js';

describe('system detection', () => {
  beforeEach(() => {
    clearSystemCache();
  });

  it('preserves the raw Foundry system id for supported adapters and future systems', async () => {
    const query = vi.fn().mockResolvedValue({ system: 'coc7' });
    const foundryClient = { query } as unknown as FoundryClient;

    await expect(detectGameSystem(foundryClient)).resolves.toBe('coc7');
    expect(getCachedSystemId()).toBe('coc7');
    expect(query).toHaveBeenCalledOnce();
  });

  it('falls back to other when the world info response does not include a system id', async () => {
    const foundryClient = {
      query: vi.fn().mockResolvedValue({}),
    } as unknown as FoundryClient;

    await expect(detectGameSystem(foundryClient)).resolves.toBe('other');
    expect(getCachedSystemId()).toBeNull();
  });

  it('does not cache other after a transient detection failure', async () => {
    const query = vi
      .fn()
      .mockRejectedValueOnce(new Error('temporarily disconnected'))
      .mockResolvedValueOnce({ system: 'dnd5e' });
    const foundryClient = { query } as unknown as FoundryClient;

    await expect(detectGameSystem(foundryClient)).resolves.toBe('other');
    expect(getCachedSystemId()).toBeNull();

    await expect(detectGameSystem(foundryClient)).resolves.toBe('dnd5e');
    expect(getCachedSystemId()).toBe('dnd5e');
    expect(query).toHaveBeenCalledTimes(2);
  });
});
