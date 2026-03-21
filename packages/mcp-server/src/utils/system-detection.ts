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

const toNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

const toStringValue = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

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

/**
 * System-specific data paths for creature/actor stats
 */
export const SystemPaths = {
  dnd5e: {
    // D&D 5e specific paths
    challengeRating: 'system.details.cr',
    creatureType: 'system.details.type.value',
    size: 'system.traits.size',
    alignment: 'system.details.alignment',
    level: 'system.details.level.value', // For NPCs/characters
    hitPoints: 'system.attributes.hp',
    armorClass: 'system.attributes.ac.value',
    abilities: 'system.abilities',
    skills: 'system.skills',
    spells: 'system.spells',
    legendaryActions: 'system.resources.legact',
    legendaryResistances: 'system.resources.legres',
  },
  pf2e: {
    // Pathfinder 2e specific paths
    level: 'system.details.level.value',
    creatureType: 'system.traits.value', // Array of traits
    size: 'system.traits.size.value',
    alignment: 'system.details.alignment.value',
    rarity: 'system.traits.rarity',
    traits: 'system.traits.value', // All traits as array
    hitPoints: 'system.attributes.hp',
    armorClass: 'system.attributes.ac.value',
    abilities: 'system.abilities',
    skills: 'system.skills',
    perception: 'system.perception',
    saves: 'system.saves',
    // PF2e doesn't have CR or legendary actions
    challengeRating: null,
    legendaryActions: null,
  },
  dsa5: {
    // DSA5 specific paths
    level: 'system.details.experience.total',
    creatureType: 'system.details.species.value',
    size: 'system.status.size.value',
    alignment: null,
    rarity: null,
    traits: null,
    hitPoints: 'system.status.wounds.current',
    armorClass: null,
    abilities: 'system.characteristics',
    skills: null,
    perception: null,
    saves: null,
    challengeRating: null,
    legendaryActions: null,
    spells: null,
  },
  other: {
    challengeRating: null,
    creatureType: null,
    size: null,
    alignment: null,
    level: null,
    hitPoints: null,
    armorClass: null,
    abilities: null,
    skills: null,
    spells: null,
    legendaryActions: null,
    legendaryResistances: null,
  },
} as const;

/**
 * Get system-specific data paths based on detected system
 */
export function getSystemPaths(
  system: GameSystem
):
  | typeof SystemPaths.dnd5e
  | typeof SystemPaths.pf2e
  | typeof SystemPaths.dsa5
  | typeof SystemPaths.other {
  if (system === 'dnd5e') {
    return SystemPaths.dnd5e;
  } else if (system === 'pf2e') {
    return SystemPaths.pf2e;
  } else if (system === 'dsa5') {
    return SystemPaths.dsa5;
  }
  return SystemPaths.other;
}

/**
 * Extract a value from system data using a path string
 * Handles both simple and nested paths (e.g., "system.details.cr")
 */
export function extractSystemValue(data: unknown, path: string | null): unknown {
  if (!path || !data) {
    return undefined;
  }

  const parts = path.split('.');
  let value: unknown = data;

  for (const part of parts) {
    const record = asRecord(value);
    if (!record) {
      return undefined;
    }
    value = record[part];
  }

  return value;
}

/**
 * Get creature level/CR based on system
 * Returns a normalized level value for both D&D 5e and PF2e
 */
export function getCreatureLevel(actorData: unknown, system: GameSystem): number | undefined {
  const paths = getSystemPaths(system);

  if (system === 'dnd5e') {
    // D&D 5e: Try CR first, then level
    const cr = extractSystemValue(actorData, paths.challengeRating);
    const crNumber = toNumber(cr);
    if (crNumber !== undefined) return crNumber;

    const level = extractSystemValue(actorData, paths.level);
    const levelNumber = toNumber(level);
    if (levelNumber !== undefined) return levelNumber;
  } else if (system === 'pf2e') {
    // PF2e: Level is the primary metric
    const level = extractSystemValue(actorData, paths.level);
    const levelNumber = toNumber(level);
    if (levelNumber !== undefined) return levelNumber;
  } else if (system === 'dsa5') {
    const level = extractSystemValue(actorData, paths.level);
    const levelNumber = toNumber(level);
    if (levelNumber !== undefined) return levelNumber;
  }

  return undefined;
}

/**
 * Get creature type/traits based on system
 */
export function getCreatureType(
  actorData: unknown,
  system: GameSystem
): string | string[] | undefined {
  if (system === 'dnd5e') {
    // D&D 5e: Single creature type string
    return toStringValue(extractSystemValue(actorData, SystemPaths.dnd5e.creatureType));
  } else if (system === 'pf2e') {
    // PF2e: Array of traits
    const traits = extractSystemValue(actorData, SystemPaths.pf2e.traits);
    return Array.isArray(traits) ? traits : undefined;
  } else if (system === 'dsa5') {
    return toStringValue(extractSystemValue(actorData, SystemPaths.dsa5.creatureType));
  }

  return undefined;
}

/**
 * Check if creature has spellcasting based on system
 */
export function hasSpellcasting(actorData: unknown, system: GameSystem): boolean {
  if (system === 'dnd5e') {
    // D&D 5e: Check for spells object or spellcasting level
    const spells = extractSystemValue(actorData, SystemPaths.dnd5e.spells);
    const spellLevel = extractSystemValue(actorData, 'system.details.spellLevel');
    return !!(spells || spellLevel);
  } else if (system === 'pf2e') {
    // PF2e: Check for spellcasting entries
    const spellcasting = extractSystemValue(actorData, 'system.spellcasting');
    const spellcastingRecord = asRecord(spellcasting);
    return Boolean(spellcastingRecord && Object.keys(spellcastingRecord).length > 0);
  } else if (system === 'dsa5') {
    const tradition = extractSystemValue(actorData, 'system.tradition');
    const traditionRecord = asRecord(tradition);
    if (traditionRecord && (traditionRecord.magical || traditionRecord.clerical)) {
      return true;
    }

    const astralMax = toNumber(extractSystemValue(actorData, 'system.status.astralenergy.max'));
    const karmaMax = toNumber(extractSystemValue(actorData, 'system.status.karmaenergy.max'));
    return (astralMax ?? 0) > 0 || (karmaMax ?? 0) > 0;
  }

  return false;
}

/**
 * Format system-specific error messages
 */
export function formatSystemError(system: GameSystem, systemId: string | null): string {
  if (system === 'other') {
    return `This tool currently supports D&D 5e, Pathfinder 2e, and DSA5. Your world uses system: "${systemId ?? 'unknown'}". Please use a supported system or request support for additional systems.`;
  }
  return 'Unknown system error';
}
