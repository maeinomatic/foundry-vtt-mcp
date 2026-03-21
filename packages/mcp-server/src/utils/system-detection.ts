/**
 * Game System Detection Utilities
 *
 * Detects the Foundry VTT game system (D&D 5e, Pathfinder 2e, etc.) and provides
 * system-specific data path mappings for cross-system compatibility.
 */

import { FoundryClient } from '../foundry-client.js';
import { Logger } from '../logger.js';
import type { SystemId } from '../systems/types.js';

/**
 * Supported game systems
 */
export type GameSystem = SystemId;

/**
 * Cache for system detection (avoid repeated queries)
 */
let cachedSystem: GameSystem | null = null;
let cachedSystemId: string | null = null;

const asRecord = (value: unknown): Record<string, unknown> | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
};

/**
 * Detect the active Foundry game system
 * Results are cached to avoid repeated queries
 */
export async function detectGameSystem(
  foundryClient: FoundryClient,
  logger?: Logger
): Promise<GameSystem> {
  if (cachedSystem) {
    return cachedSystem;
  }

  try {
    const worldInfo: unknown = await foundryClient.query('foundry-mcp-bridge.getWorldInfo');
    const worldInfoRecord = asRecord(worldInfo);
    const systemValue = worldInfoRecord?.system;
    const systemId = typeof systemValue === 'string' ? systemValue.toLowerCase() : '';

    cachedSystemId = systemId;

    if (systemId === 'dnd5e' || systemId === 'pf2e' || systemId === 'dsa5') {
      cachedSystem = systemId;
    } else {
      cachedSystem = 'other';
    }

    if (logger) {
      logger.info('Game system detected', { systemId, detectedAs: cachedSystem });
    }

    return cachedSystem;
  } catch (error) {
    if (logger) {
      logger.error('Failed to detect game system, defaulting to other', { error });
    }
    cachedSystem = 'other';
    return cachedSystem;
  }
}

/**
 * Get the raw system ID string (e.g., "dnd5e", "pf2e", "coc7")
 */
export function getCachedSystemId(): string | null {
  return cachedSystemId;
}

/**
 * Clear cached system detection (useful for testing or world switches)
 */
export function clearSystemCache(): void {
  cachedSystem = null;
  cachedSystemId = null;
}
