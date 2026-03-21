/**
 * Pathfinder 2e Filter Schemas
 *
 * Extracted from compendium-filters.ts for modular system support.
 */

import { z } from 'zod';

/**
 * Pathfinder 2e creature types (traits)
 * This is a common subset - PF2e has many more creature traits
 */
export const PF2eCreatureTypes = [
  'aberration',
  'animal',
  'beast',
  'celestial',
  'construct',
  'dragon',
  'elemental',
  'fey',
  'fiend',
  'fungus',
  'humanoid',
  'monitor',
  'ooze',
  'plant',
  'undead',
] as const;

export type PF2eCreatureType = (typeof PF2eCreatureTypes)[number];

/**
 * Pathfinder 2e rarity levels
 */
export const PF2eRarities = ['common', 'uncommon', 'rare', 'unique'] as const;
export type PF2eRarity = (typeof PF2eRarities)[number];

/**
 * Common creature sizes
 */
export const CreatureSizes = ['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan'] as const;
export type CreatureSize = (typeof CreatureSizes)[number];

/**
 * Pathfinder 2e filter schema
 */
export const PF2eFiltersSchema = z.object({
  level: z
    .union([
      z.number().min(-1).max(30), // PF2e levels range from -1 to 25+ (accounting for higher levels)
      z.object({
        min: z.number().min(-1).optional(),
        max: z.number().max(30).optional(),
      }),
    ])
    .optional(),
  creatureType: z.enum(PF2eCreatureTypes).optional(),
  traits: z.array(z.string()).optional(), // Array of trait names
  rarity: z.enum(PF2eRarities).optional(),
  size: z.enum(CreatureSizes).optional(),
  alignment: z.string().optional(),
  hasSpells: z.boolean().optional(), // PF2e uses spellcasting entries
});

export type PF2eFilters = z.infer<typeof PF2eFiltersSchema>;

const asRecord = (value: unknown): Record<string, unknown> | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
};

const getSystemData = (creature: unknown): Record<string, unknown> | undefined => {
  const record = asRecord(creature);
  return asRecord(record?.systemData);
};

const toStringValue = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

const toNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  return undefined;
};

const toBoolean = (value: unknown): boolean | undefined =>
  typeof value === 'boolean' ? value : undefined;

/**
 * Check if a creature matches PF2e filters
 */
export function matchesPF2eFilters(creature: unknown, filters: PF2eFilters): boolean {
  const systemData = getSystemData(creature);

  // Level filter
  if (filters.level !== undefined) {
    const level = toNumber(systemData?.level);
    if (level === undefined) return false;

    if (typeof filters.level === 'number') {
      if (level !== filters.level) return false;
    } else {
      const min = filters.level.min ?? -1;
      const max = filters.level.max ?? 30;
      if (level < min || level > max) return false;
    }
  }

  // Creature Type filter (checks traits array)
  if (filters.creatureType) {
    const traits = systemData?.traits;
    if (!Array.isArray(traits)) return false;

    const hasType = traits.some(
      trait => toStringValue(trait)?.toLowerCase() === filters.creatureType.toLowerCase()
    );
    if (!hasType) return false;
  }

  // Traits filter (creature must have all specified traits)
  if (filters.traits && filters.traits.length > 0) {
    const creatureTraits = systemData?.traits;
    if (!Array.isArray(creatureTraits)) return false;

    const lowerTraits = creatureTraits
      .map(t => toStringValue(t)?.toLowerCase())
      .filter((t): t is string => typeof t === 'string');
    for (const requiredTrait of filters.traits) {
      if (!lowerTraits.includes(requiredTrait.toLowerCase())) {
        return false;
      }
    }
  }

  // Rarity filter
  if (filters.rarity) {
    const rarity = toStringValue(systemData?.rarity);
    if (!rarity || rarity.toLowerCase() !== filters.rarity.toLowerCase()) {
      return false;
    }
  }

  // Size filter
  if (filters.size) {
    const size = toStringValue(systemData?.size);
    if (!size || size.toLowerCase() !== filters.size.toLowerCase()) {
      return false;
    }
  }

  // Alignment filter
  if (filters.alignment) {
    const alignment = toStringValue(systemData?.alignment);
    if (!alignment?.toLowerCase().includes(filters.alignment.toLowerCase())) {
      return false;
    }
  }

  // Spellcaster filter
  if (filters.hasSpells !== undefined) {
    const hasSpells = toBoolean(systemData?.hasSpellcasting) ?? false;
    if (hasSpells !== filters.hasSpells) {
      return false;
    }
  }

  return true;
}

/**
 * Generate human-readable description of PF2e filters
 */
export function describePF2eFilters(filters: PF2eFilters): string {
  const parts: string[] = [];

  if (filters.level !== undefined) {
    if (typeof filters.level === 'number') {
      parts.push(`Level ${filters.level}`);
    } else {
      const min = filters.level.min ?? -1;
      const max = filters.level.max ?? 25;
      parts.push(`Level ${min}-${max}`);
    }
  }

  if (filters.creatureType) parts.push(filters.creatureType);
  if (filters.rarity) parts.push(filters.rarity);
  if (filters.size) parts.push(filters.size);
  if (filters.alignment) parts.push(filters.alignment);
  if (filters.traits && filters.traits.length > 0) {
    parts.push(`traits: ${filters.traits.join(', ')}`);
  }
  if (filters.hasSpells) parts.push('spellcaster');

  return parts.length > 0 ? parts.join(', ') : 'no filters';
}

/**
 * Validate creature type
 */
export function isValidPF2eCreatureType(creatureType: string): boolean {
  return PF2eCreatureTypes.includes(creatureType as PF2eCreatureType);
}
