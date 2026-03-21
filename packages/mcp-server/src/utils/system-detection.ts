/**
 * Game System Detection Utilities
 *
 * Detects the Foundry VTT game system (D&D 5e, Pathfinder 2e, etc.) and provides
 * system-specific data path mappings for cross-system compatibility.
 */

import { FoundryClient } from '../foundry-client.js';
import { Logger } from '../logger.js';
import type { FoundryWorldInfo, UnknownRecord } from '../foundry-types.js';
/**
 * The raw Foundry system id for the active world.
 *
 * Known systems will be values like `dnd5e`, `pf2e`, or `dsa5`, but this type
 * intentionally remains open so adapter routing can support new systems and
 * aliases without collapsing them to `other` first.
 */
export type GameSystem = string;

/**
 * Cache for system detection (avoid repeated queries)
 */
let cachedSystem: GameSystem | null = null;
let cachedSystemId: string | null = null;

const asRecord = (value: unknown): UnknownRecord | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as UnknownRecord;
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
    const worldInfo = await foundryClient.query<FoundryWorldInfo>('foundry-mcp-bridge.getWorldInfo');
    const worldInfoRecord = asRecord(worldInfo);
    const systemValue = worldInfoRecord?.system;
    const systemId = typeof systemValue === 'string' ? systemValue.toLowerCase() : '';

    cachedSystemId = systemId || null;
    cachedSystem = systemId || 'other';

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
