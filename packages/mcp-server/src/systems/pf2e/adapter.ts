/**
 * Pathfinder 2e System Adapter
 *
 * Implements SystemAdapter interface for Pathfinder 2nd Edition support.
 * Handles creature indexing, filtering, formatting, and data extraction.
 */

import type {
  SystemAdapter,
  SystemMetadata,
  SystemCreatureIndex,
  PF2eCreatureIndex,
} from '../types.js';
import { PF2eFiltersSchema, matchesPF2eFilters, describePF2eFilters } from './filters.js';

type UnknownRecord = Record<string, unknown>;

const PF2E_CREATURE_TRAITS = [
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
];

function asRecord(value: unknown): UnknownRecord | undefined {
  return typeof value === 'object' && value !== null ? (value as UnknownRecord) : undefined;
}

function getNestedValue(source: UnknownRecord | undefined, path: string[]): unknown {
  let current: unknown = source;
  for (const segment of path) {
    const currentRecord = asRecord(current);
    if (!currentRecord) {
      return undefined;
    }
    current = currentRecord[segment];
  }
  return current;
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function toStringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(entry => toStringValue(entry))
    .filter((entry): entry is string => entry !== undefined);
}

/**
 * Pathfinder 2e system adapter
 */
export class PF2eAdapter implements SystemAdapter {
  getMetadata(): SystemMetadata {
    return {
      id: 'pf2e',
      name: 'pf2e',
      displayName: 'Pathfinder 2nd Edition',
      version: '1.0.0',
      description:
        'Support for PF2e game system with Level, traits, rarity, and spellcasting entries',
      supportedFeatures: {
        creatureIndex: true,
        characterStats: true,
        spellcasting: true,
        powerLevel: true, // Uses Level
      },
    };
  }

  canHandle(systemId: string): boolean {
    return systemId.toLowerCase() === 'pf2e';
  }

  /**
   * Extract creature data from Foundry document for indexing
   * This is called by the index builder in Foundry's browser context
   */
  extractCreatureData(
    _doc: unknown,
    _pack: unknown
  ): { creature: SystemCreatureIndex; errors: number } | null {
    // Implementation is in index-builder.ts since it runs in browser
    // This method is here for type compliance but delegates to IndexBuilder
    throw new Error('extractCreatureData should be called from PF2eIndexBuilder, not the adapter');
  }

  getFilterSchema(): typeof PF2eFiltersSchema {
    return PF2eFiltersSchema;
  }

  matchesFilters(creature: SystemCreatureIndex, filters: Record<string, unknown>): boolean {
    // Validate filters match PF2e schema
    const validated = PF2eFiltersSchema.safeParse(filters);
    if (!validated.success) {
      return false;
    }

    return matchesPF2eFilters(creature, validated.data);
  }

  getDataPaths(): Record<string, string | null> {
    return {
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
      legendaryResistances: null,
      spells: null, // PF2e uses spellcasting entries instead
    };
  }

  formatCreatureForList(creature: SystemCreatureIndex): Record<string, unknown> {
    const pf2eCreature = creature as PF2eCreatureIndex;
    const formatted: Record<string, unknown> = {
      id: creature.id,
      name: creature.name,
      type: creature.type,
      pack: {
        id: creature.packName,
        label: creature.packLabel,
      },
    };

    // Add PF2e specific stats
    if (pf2eCreature.systemData) {
      const stats: Record<string, unknown> = {};

      if (pf2eCreature.systemData.level !== undefined) {
        stats.level = pf2eCreature.systemData.level;
      }

      if (pf2eCreature.systemData.traits && pf2eCreature.systemData.traits.length > 0) {
        stats.traits = pf2eCreature.systemData.traits;

        // Extract primary creature type from traits
        const primaryType = pf2eCreature.systemData.traits.find((t: string) =>
          PF2E_CREATURE_TRAITS.includes(t.toLowerCase())
        );
        if (primaryType) stats.creatureType = primaryType;
      }

      if (pf2eCreature.systemData.rarity) {
        stats.rarity = pf2eCreature.systemData.rarity;
      }

      if (pf2eCreature.systemData.size) {
        stats.size = pf2eCreature.systemData.size;
      }

      if (pf2eCreature.systemData.alignment) {
        stats.alignment = pf2eCreature.systemData.alignment;
      }

      if (pf2eCreature.systemData.hitPoints) {
        stats.hitPoints = pf2eCreature.systemData.hitPoints;
      }

      if (pf2eCreature.systemData.armorClass) {
        stats.armorClass = pf2eCreature.systemData.armorClass;
      }

      if (pf2eCreature.systemData.hasSpellcasting) {
        stats.spellcaster = true;
      }

      if (Object.keys(stats).length > 0) {
        formatted.stats = stats;
      }
    }

    if (creature.img) {
      formatted.hasImage = true;
    }

    return formatted;
  }

  formatCreatureForDetails(creature: SystemCreatureIndex): Record<string, unknown> {
    const pf2eCreature = creature as PF2eCreatureIndex;
    const formatted = this.formatCreatureForList(creature);

    // Add additional details
    if (pf2eCreature.systemData) {
      formatted.detailedStats = {
        level: pf2eCreature.systemData.level,
        traits: pf2eCreature.systemData.traits,
        size: pf2eCreature.systemData.size,
        alignment: pf2eCreature.systemData.alignment,
        rarity: pf2eCreature.systemData.rarity,
        hitPoints: pf2eCreature.systemData.hitPoints,
        armorClass: pf2eCreature.systemData.armorClass,
        hasSpellcasting: pf2eCreature.systemData.hasSpellcasting,
      };
    }

    if (creature.img) {
      formatted.img = creature.img;
    }

    return formatted;
  }

  describeFilters(filters: Record<string, unknown>): string {
    const validated = PF2eFiltersSchema.safeParse(filters);
    if (!validated.success) {
      return 'invalid filters';
    }

    return describePF2eFilters(validated.data);
  }

  getPowerLevel(creature: SystemCreatureIndex): number | undefined {
    const pf2eCreature = creature as PF2eCreatureIndex;

    // PF2e: Level is the primary metric
    if (pf2eCreature.systemData?.level !== undefined) {
      return pf2eCreature.systemData.level;
    }

    return undefined;
  }

  /**
   * Extract character statistics from actor data
   */
  extractCharacterStats(actorData: unknown): Record<string, unknown> {
    const actor = asRecord(actorData);
    const system = asRecord(actor?.system);
    const stats: Record<string, unknown> = {};

    // Basic info
    stats.name = toStringValue(actor?.name);
    stats.type = toStringValue(actor?.type);

    // Level
    const level =
      toNumber(getNestedValue(system, ['details', 'level', 'value'])) ??
      toNumber(getNestedValue(system, ['details', 'level'])) ??
      toNumber(getNestedValue(system, ['level']));
    if (level !== undefined) {
      stats.level = level;
    }

    // Hit Points
    const hp = asRecord(getNestedValue(system, ['attributes', 'hp']));
    if (hp) {
      stats.hitPoints = {
        current: toNumber(hp.value) ?? 0,
        max: toNumber(hp.max) ?? 0,
        temp: toNumber(hp.temp) ?? 0,
      };
    }

    // Armor Class
    const ac =
      toNumber(getNestedValue(system, ['attributes', 'ac', 'value'])) ??
      toNumber(getNestedValue(system, ['attributes', 'ac']));
    if (ac !== undefined) {
      stats.armorClass = ac;
    }

    // Abilities (STR, DEX, CON, INT, WIS, CHA)
    const abilities = asRecord(getNestedValue(system, ['abilities']));
    if (abilities) {
      const abilityStats: Record<string, UnknownRecord> = {};
      for (const [key, ability] of Object.entries(abilities)) {
        const abilityData = asRecord(ability);
        abilityStats[key] = {
          value: toNumber(abilityData?.value) ?? toNumber(abilityData?.mod) ?? 0,
          modifier: toNumber(abilityData?.mod) ?? 0,
        };
      }
      stats.abilities = abilityStats;
    }

    // Skills
    const skills = asRecord(getNestedValue(system, ['skills']));
    if (skills) {
      const skillStats: Record<string, UnknownRecord> = {};
      for (const [key, skill] of Object.entries(skills)) {
        const skillData = asRecord(skill);
        const rank = toNumber(skillData?.rank) ?? 0;
        skillStats[key] = {
          modifier: toNumber(skillData?.value) ?? toNumber(skillData?.mod) ?? 0,
          rank,
          proficient: rank > 0,
        };
      }
      stats.skills = skillStats;
    }

    // Perception
    const perception = asRecord(getNestedValue(system, ['perception']));
    if (perception) {
      stats.perception = {
        modifier: toNumber(perception.value) ?? toNumber(perception.mod) ?? 0,
        rank: toNumber(perception.rank) ?? 0,
      };
    }

    // Saves
    const saves = asRecord(getNestedValue(system, ['saves']));
    if (saves) {
      const saveStats: Record<string, UnknownRecord> = {};
      for (const [key, save] of Object.entries(saves)) {
        const saveData = asRecord(save);
        saveStats[key] = {
          modifier: toNumber(saveData?.value) ?? toNumber(saveData?.mod) ?? 0,
          rank: toNumber(saveData?.rank) ?? 0,
        };
      }
      stats.saves = saveStats;
    }

    // Creature-specific info
    if (toStringValue(actor?.type) === 'npc') {
      const traits = toStringArray(getNestedValue(system, ['traits', 'value']));
      if (traits.length > 0) {
        stats.traits = traits;

        // Extract primary creature type
        const primaryType = traits.find(t => PF2E_CREATURE_TRAITS.includes(t.toLowerCase()));
        if (primaryType) {
          stats.creatureType = primaryType;
        }
      }

      const size =
        toStringValue(getNestedValue(system, ['traits', 'size', 'value'])) ??
        toStringValue(getNestedValue(system, ['traits', 'size']));
      if (size) {
        stats.size = size;
      }

      const alignment =
        toStringValue(getNestedValue(system, ['details', 'alignment', 'value'])) ??
        toStringValue(getNestedValue(system, ['details', 'alignment']));
      if (alignment) {
        stats.alignment = alignment;
      }

      const rarity = toStringValue(getNestedValue(system, ['traits', 'rarity']));
      if (rarity) {
        stats.rarity = rarity;
      }
    }

    // Spellcasting
    const spellcasting = asRecord(getNestedValue(system, ['spellcasting'])) ?? {};
    const hasSpells = Object.keys(spellcasting).length > 0;
    if (hasSpells) {
      stats.spellcasting = {
        hasSpells: true,
        entries: Object.keys(spellcasting).length,
      };
    }

    return stats;
  }
}
