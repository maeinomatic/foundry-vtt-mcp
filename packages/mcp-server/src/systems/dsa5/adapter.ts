/**
 * DSA5 System Adapter
 *
 * Implements SystemAdapter interface for DSA5 (Das Schwarze Auge 5) support.
 * Handles creature indexing, filtering, formatting, and data extraction.
 */

import type {
  SystemAdapter,
  SystemMetadata,
  SystemCreatureIndex,
  DSA5CreatureIndex,
} from '../types.js';
import { DSA5FiltersSchema, matchesDSA5Filters, describeDSA5Filters } from './filters.js';
import { FIELD_PATHS, getExperienceLevel, EIGENSCHAFT_NAMES } from './constants.js';

type UnknownRecord = Record<string, unknown>;

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

/**
 * DSA5 system adapter
 */
export class DSA5Adapter implements SystemAdapter {
  getMetadata(): SystemMetadata {
    return {
      id: 'dsa5',
      name: 'dsa5',
      displayName: 'Das Schwarze Auge 5',
      version: '1.0.0',
      description:
        'Support for DSA5 (Das Schwarze Auge 5. Edition) with Eigenschaften, Talente, Erfahrungsgrade, and LeP/AsP/KaP resources',
      supportedFeatures: {
        creatureIndex: true,
        characterStats: true,
        spellcasting: true,
        powerLevel: true, // Uses Experience Level (Erfahrungsgrad 1-7)
      },
    };
  }

  canHandle(systemId: string): boolean {
    return systemId.toLowerCase() === 'dsa5';
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
    throw new Error('extractCreatureData should be called from DSA5IndexBuilder, not the adapter');
  }

  getFilterSchema(): typeof DSA5FiltersSchema {
    return DSA5FiltersSchema;
  }

  matchesFilters(creature: SystemCreatureIndex, filters: Record<string, unknown>): boolean {
    // Validate filters match DSA5 schema
    const validated = DSA5FiltersSchema.safeParse(filters);
    if (!validated.success) {
      return false;
    }

    return matchesDSA5Filters(creature, validated.data);
  }

  getDataPaths(): Record<string, string | null> {
    return {
      // DSA5 specific paths
      level: FIELD_PATHS.DETAILS_EXPERIENCE_TOTAL, // Level is calculated from AP
      species: FIELD_PATHS.DETAILS_SPECIES,
      culture: FIELD_PATHS.DETAILS_CULTURE,
      profession: FIELD_PATHS.DETAILS_CAREER, // IMPORTANT: 'career' not 'profession'
      size: FIELD_PATHS.STATUS_SIZE,

      // Characteristics (Eigenschaften)
      characteristics: FIELD_PATHS.CHARACTERISTICS,
      mu: FIELD_PATHS.CHAR_MU,
      kl: FIELD_PATHS.CHAR_KL,
      in: FIELD_PATHS.CHAR_IN,
      ch: FIELD_PATHS.CHAR_CH,
      ff: FIELD_PATHS.CHAR_FF,
      ge: FIELD_PATHS.CHAR_GE,
      ko: FIELD_PATHS.CHAR_KO,
      kk: FIELD_PATHS.CHAR_KK,

      // Status values
      wounds: FIELD_PATHS.STATUS_WOUNDS,
      lifePoints: FIELD_PATHS.STATUS_WOUNDS_CURRENT, // wounds.current has actual LeP
      astralenergy: FIELD_PATHS.STATUS_ASTRAL,
      karmaenergy: FIELD_PATHS.STATUS_KARMA,
      speed: FIELD_PATHS.STATUS_SPEED,
      initiative: FIELD_PATHS.STATUS_INITIATIVE,
      dodge: FIELD_PATHS.STATUS_DODGE,
      armor: FIELD_PATHS.STATUS_ARMOR,

      // Tradition
      tradition: FIELD_PATHS.TRADITION,

      // D&D5e-specific paths don't exist in DSA5
      challengeRating: null,
      creatureType: null,
      alignment: null,
      hitPoints: null,
      armorClass: null,
      legendaryActions: null,
      legendaryResistances: null,

      // PF2e-specific paths don't exist in DSA5
      perception: null,
      saves: null,
      rarity: null,
    };
  }

  formatCreatureForList(creature: SystemCreatureIndex): Record<string, unknown> {
    const dsa5Creature = creature as DSA5CreatureIndex;
    const formatted: Record<string, unknown> = {
      id: creature.id,
      name: creature.name,
      type: creature.type,
      pack: {
        id: creature.packName,
        label: creature.packLabel,
      },
    };

    // Add DSA5 specific stats
    if (dsa5Creature.systemData) {
      const stats: Record<string, unknown> = {};

      if (dsa5Creature.systemData.level !== undefined) {
        stats.level = dsa5Creature.systemData.level;

        // Add experience level name (e.g., "Erfahren")
        const expLevel = getExperienceLevel(dsa5Creature.systemData.experiencePoints ?? 0);
        stats.experienceLevel = expLevel.name;
      }

      if (dsa5Creature.systemData.species) {
        stats.species = dsa5Creature.systemData.species;
      }

      if (dsa5Creature.systemData.culture) {
        stats.culture = dsa5Creature.systemData.culture;
      }

      if (dsa5Creature.systemData.size) {
        stats.size = dsa5Creature.systemData.size;
      }

      if (dsa5Creature.systemData.lifePoints) {
        stats.lifePoints = dsa5Creature.systemData.lifePoints;
      }

      if (dsa5Creature.systemData.meleeDefense) {
        stats.meleeDefense = dsa5Creature.systemData.meleeDefense;
      }

      if (dsa5Creature.systemData.hasSpells) {
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
    const dsa5Creature = creature as DSA5CreatureIndex;
    const formatted = this.formatCreatureForList(creature);

    // Add additional details
    if (dsa5Creature.systemData) {
      const expLevel = getExperienceLevel(dsa5Creature.systemData.experiencePoints ?? 0);

      formatted.detailedStats = {
        level: dsa5Creature.systemData.level,
        experienceLevel: {
          name: expLevel.name,
          nameEn: expLevel.nameEn,
          level: expLevel.level,
          apRange: `${expLevel.min}-${expLevel.max === Infinity ? '∞' : expLevel.max}`,
        },
        experiencePoints: dsa5Creature.systemData.experiencePoints,
        species: dsa5Creature.systemData.species,
        culture: dsa5Creature.systemData.culture,
        profession: dsa5Creature.systemData.profession,
        size: dsa5Creature.systemData.size,
        lifePoints: dsa5Creature.systemData.lifePoints,
        meleeDefense: dsa5Creature.systemData.meleeDefense,
        rangedDefense: dsa5Creature.systemData.rangedDefense,
        armor: dsa5Creature.systemData.armor,
        hasSpells: dsa5Creature.systemData.hasSpells,
        hasAstralEnergy: dsa5Creature.systemData.hasAstralEnergy,
        hasKarmaEnergy: dsa5Creature.systemData.hasKarmaEnergy,
        traits: dsa5Creature.systemData.traits ?? [],
        rarity: dsa5Creature.systemData.rarity,
      };
    }

    if (creature.img) {
      formatted.img = creature.img;
    }

    return formatted;
  }

  describeFilters(filters: Record<string, unknown>): string {
    const validated = DSA5FiltersSchema.safeParse(filters);
    if (!validated.success) {
      return 'ungültige Filter';
    }

    return describeDSA5Filters(validated.data);
  }

  getPowerLevel(creature: SystemCreatureIndex): number | undefined {
    const dsa5Creature = creature as DSA5CreatureIndex;

    // DSA5: Use Experience Level (Erfahrungsgrad 1-7)
    if (dsa5Creature.systemData?.level !== undefined) {
      return dsa5Creature.systemData.level;
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

    // Experience and Level
    const totalAP = toNumber(getNestedValue(system, ['details', 'experience', 'total'])) ?? 0;
    const spentAP = toNumber(getNestedValue(system, ['details', 'experience', 'spent'])) ?? 0;

    if (totalAP > 0) {
      const expLevel = getExperienceLevel(totalAP);
      stats.experience = {
        total: totalAP,
        spent: spentAP,
        available: totalAP - spentAP,
        level: expLevel.level,
        levelName: expLevel.name,
        levelNameEn: expLevel.nameEn,
      };
    }

    // LeP (Lebensenergie) - wounds.current contains actual current LeP
    const wounds = asRecord(getNestedValue(system, ['status', 'wounds']));
    if (wounds) {
      stats.lifePoints = {
        current: toNumber(wounds.current) ?? 0,
        max: toNumber(wounds.max) ?? 0,
      };
    }

    // AsP (Astralenergie)
    const astral = asRecord(getNestedValue(system, ['status', 'astralenergy']));
    if ((toNumber(astral?.max) ?? 0) > 0) {
      stats.astralEnergy = {
        current: toNumber(astral?.value) ?? 0,
        max: toNumber(astral?.max) ?? 0,
      };
    }

    // KaP (Karmaenergie)
    const karma = asRecord(getNestedValue(system, ['status', 'karmaenergy']));
    if ((toNumber(karma?.max) ?? 0) > 0) {
      stats.karmaEnergy = {
        current: toNumber(karma?.value) ?? 0,
        max: toNumber(karma?.max) ?? 0,
      };
    }

    // Eigenschaften (Characteristics: MU, KL, IN, CH, FF, GE, KO, KK)
    const characteristics = asRecord(getNestedValue(system, ['characteristics']));
    if (characteristics) {
      const characteristicStats: Record<string, UnknownRecord> = {};
      for (const [key, eigenschaft] of Object.entries(characteristics)) {
        const eigenschaftData = asRecord(eigenschaft);
        const upperKey = key.toUpperCase();
        const eigenschaftNames = EIGENSCHAFT_NAMES[upperKey];
        characteristicStats[upperKey] = {
          value: toNumber(eigenschaftData?.value) ?? 8,
          initial: toNumber(eigenschaftData?.initial) ?? 8,
          name: eigenschaftNames?.german,
          nameEn: eigenschaftNames?.english,
        };
      }
      stats.characteristics = characteristicStats;
    }

    // Combat values
    const initiative =
      toNumber(getNestedValue(system, ['status', 'initiative', 'value'])) ??
      toNumber(getNestedValue(system, ['status', 'initiative']));
    if (initiative !== undefined) {
      stats.initiative = initiative;
    }

    const speed =
      toNumber(getNestedValue(system, ['status', 'speed', 'value'])) ??
      toNumber(getNestedValue(system, ['status', 'speed']));
    if (speed !== undefined) {
      stats.speed = speed;
    }

    const dodge =
      toNumber(getNestedValue(system, ['status', 'dodge', 'value'])) ??
      toNumber(getNestedValue(system, ['status', 'dodge']));
    if (dodge !== undefined) {
      stats.dodge = dodge;
    }

    const armor =
      toNumber(getNestedValue(system, ['status', 'armour', 'value'])) ??
      toNumber(getNestedValue(system, ['status', 'armor', 'value'])) ??
      0;
    if (armor) {
      stats.armor = armor;
    }

    // Identity info
    if (asRecord(getNestedValue(system, ['details']))) {
      const identity: Record<string, unknown> = {};

      const species = toStringValue(getNestedValue(system, ['details', 'species', 'value']));
      if (species) {
        identity.species = species;
      }

      const culture = toStringValue(getNestedValue(system, ['details', 'culture', 'value']));
      if (culture) {
        identity.culture = culture;
      }

      const career = toStringValue(getNestedValue(system, ['details', 'career', 'value']));
      if (career) {
        identity.profession = career;
      }

      if (Object.keys(identity).length > 0) {
        stats.identity = identity;
      }
    }

    // Size
    const size = toNumber(getNestedValue(system, ['status', 'size', 'value']));
    if (size) {
      stats.size = size;
    }

    // Tradition (magical/clerical)
    const traditionData = asRecord(getNestedValue(system, ['tradition']));
    if (traditionData) {
      const tradition: Record<string, unknown> = {};

      if (traditionData.magical) {
        tradition.magical = traditionData.magical;
      }

      if (traditionData.clerical) {
        tradition.clerical = traditionData.clerical;
      }

      if (Object.keys(tradition).length > 0) {
        stats.tradition = tradition;
      }
    }

    // Spellcasting detection
    const hasSpells =
      (toNumber(astral?.max) ?? 0) > 0 ||
      (toNumber(karma?.max) ?? 0) > 0 ||
      traditionData !== undefined;
    if (hasSpells) {
      stats.spellcasting = {
        hasSpells: true,
        hasAstralEnergy: (toNumber(astral?.max) ?? 0) > 0,
        hasKarmaEnergy: (toNumber(karma?.max) ?? 0) > 0,
      };
    }

    return stats;
  }
}
