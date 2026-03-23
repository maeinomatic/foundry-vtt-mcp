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
  DSA5ActorDocument,
  DSA5CompendiumDocument,
  DSA5ItemDocument,
  SystemCharacterAction,
  SystemCharacterInfo,
  SystemCompendiumCreatureEntity,
  SystemSpellcastingEntry,
  CharacterProgressionUpdateRequest,
  PreparedCharacterProgressionUpdate,
} from '../types.js';
import { createActorProgressionTarget } from '../types.js';
import type {
  FoundryActorDocumentBase,
  FoundryCompendiumPackSummary,
  FoundryItemDocumentBase,
  UnknownRecord,
} from '../../foundry-types.js';
import { DSA5FiltersSchema, matchesDSA5Filters, describeDSA5Filters } from './filters.js';
import {
  FIELD_PATHS,
  getExperienceLevel,
  getExperienceLevelByNumber,
  EIGENSCHAFT_NAMES,
} from './constants.js';

function asRecord(value: unknown): UnknownRecord | undefined {
  return typeof value === 'object' && value !== null ? (value as UnknownRecord) : undefined;
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

function toNumberField(value: unknown): number | undefined {
  const record = asRecord(value);
  if (record && 'value' in record) {
    return toNumber(record.value);
  }

  return toNumber(value);
}

function toStringField(value: unknown): string | undefined {
  const record = asRecord(value);
  if (record && 'value' in record) {
    return toStringValue(record.value);
  }

  return toStringValue(value);
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
    _doc: FoundryActorDocumentBase,
    _pack: FoundryCompendiumPackSummary
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

  formatRawCompendiumCreature(
    entity: SystemCompendiumCreatureEntity,
    mode: 'search' | 'criteria' | 'compact' | 'details'
  ): Record<string, unknown> {
    const creature = entity as DSA5CompendiumDocument;
    const system = creature.system;
    const experiencePoints = toNumber(system?.details?.experience?.total);
    const level =
      experiencePoints !== undefined
        ? getExperienceLevel(experiencePoints).level
        : toNumber(system?.level);
    const species = toStringField(system?.details?.species);
    const size = toStringField(system?.status?.size) ?? toStringField(system?.size);

    const wounds = system?.status?.wounds;
    const lifePointsCurrent = toNumber(wounds?.value);
    const lifePointsMax = toNumber(wounds?.max);
    const speed = toNumberField(system?.status?.speed);

    const hasSpellcasting =
      Boolean(system?.tradition?.magical ?? system?.tradition?.clerical) ||
      (toNumber(system?.status?.astralenergy?.max) ?? 0) > 0 ||
      (toNumber(system?.status?.karmaenergy?.max) ?? 0) > 0;

    if (mode === 'search') {
      const stats: Record<string, unknown> = {};
      if (level !== undefined) stats.level = level;
      if (species) stats.creatureType = species;
      if (size) stats.size = size;
      if (lifePointsCurrent !== undefined || lifePointsMax !== undefined) {
        stats.hitPoints = { current: lifePointsCurrent, max: lifePointsMax };
      }
      if (hasSpellcasting) stats.spellcaster = true;
      return Object.keys(stats).length > 0 ? { stats } : {};
    }

    if (mode === 'compact') {
      const stats: Record<string, unknown> = {};
      if (level !== undefined) stats.level = level;
      if (species) stats.creatureType = species;
      if (size) stats.size = size;
      if (experiencePoints !== undefined) stats.experiencePoints = experiencePoints;
      if (lifePointsMax !== undefined) stats.lifePoints = lifePointsMax;
      if (speed !== undefined) stats.speed = speed;
      if (hasSpellcasting) stats.spellcaster = true;
      return Object.keys(stats).length > 0 ? { stats } : {};
    }

    if (mode === 'details') {
      return {
        creatureDetails: {
          ...(level !== undefined ? { level } : {}),
          ...(species ? { creatureType: species } : {}),
          ...(size ? { size } : {}),
          ...(experiencePoints !== undefined ? { experiencePoints } : {}),
          ...(lifePointsCurrent !== undefined || lifePointsMax !== undefined
            ? { lifePoints: { current: lifePointsCurrent, max: lifePointsMax } }
            : {}),
          ...(speed !== undefined ? { speed } : {}),
          ...(hasSpellcasting ? { spellcaster: true } : {}),
        },
      };
    }

    return {
      ...(level !== undefined ? { level } : {}),
      ...(species ? { creatureType: species } : {}),
      ...(size ? { size } : {}),
      flags: {
        spellcaster: hasSpellcasting,
      },
    };
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
  extractCharacterStats(actorData: SystemCharacterInfo): Record<string, unknown> {
    const actor = actorData as DSA5ActorDocument;
    const system = actor.system;
    const stats: Record<string, unknown> = {};

    // Basic info
    stats.name = actor.name;
    stats.type = actor.type;

    // Experience and Level
    const totalAP = toNumber(system?.details?.experience?.total) ?? 0;
    const spentAP = toNumber(system?.details?.experience?.spent) ?? 0;

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
    const wounds = system?.status?.wounds;
    if (wounds) {
      stats.lifePoints = {
        current: toNumber(wounds.current) ?? 0,
        max: toNumber(wounds.max) ?? 0,
      };
    }

    // AsP (Astralenergie)
    const astral = system?.status?.astralenergy;
    if ((toNumber(astral?.max) ?? 0) > 0) {
      stats.astralEnergy = {
        current: toNumber(astral?.value) ?? 0,
        max: toNumber(astral?.max) ?? 0,
      };
    }

    // KaP (Karmaenergie)
    const karma = system?.status?.karmaenergy;
    if ((toNumber(karma?.max) ?? 0) > 0) {
      stats.karmaEnergy = {
        current: toNumber(karma?.value) ?? 0,
        max: toNumber(karma?.max) ?? 0,
      };
    }

    // Eigenschaften (Characteristics: MU, KL, IN, CH, FF, GE, KO, KK)
    const characteristics = system?.characteristics;
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
    const initiative = toNumberField(system?.status?.initiative);
    if (initiative !== undefined) {
      stats.initiative = initiative;
    }

    const speed = toNumberField(system?.status?.speed);
    if (speed !== undefined) {
      stats.speed = speed;
    }

    const dodge = toNumberField(system?.status?.dodge);
    if (dodge !== undefined) {
      stats.dodge = dodge;
    }

    const armor =
      toNumberField(system?.status?.armour) ?? toNumberField(system?.status?.armor) ?? 0;
    if (armor) {
      stats.armor = armor;
    }

    // Identity info
    if (system?.details) {
      const identity: Record<string, unknown> = {};

      const species = toStringField(system.details.species);
      if (species) {
        identity.species = species;
      }

      const culture = toStringField(system.details.culture);
      if (culture) {
        identity.culture = culture;
      }

      const career = toStringField(system.details.career);
      if (career) {
        identity.profession = career;
      }

      if (Object.keys(identity).length > 0) {
        stats.identity = identity;
      }
    }

    // Size
    const size = toNumberField(system?.status?.size);
    if (size) {
      stats.size = size;
    }

    // Tradition (magical/clerical)
    const traditionData = system?.tradition;
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

  formatCharacterBasicInfo(actorData: SystemCharacterInfo): Record<string, unknown> {
    const actor = actorData as DSA5ActorDocument;
    const system = actor.system;
    const basicInfo: Record<string, unknown> = {};

    const wounds = system?.status?.wounds;
    if (wounds) {
      basicInfo.lifePoints = {
        current: toNumber(wounds.current) ?? toNumber(wounds.value),
        max: toNumber(wounds.max),
      };
    }

    const size = toNumberField(system?.status?.size);
    if (size !== undefined) {
      basicInfo.size = size;
    }

    const species = toStringField(system?.details?.species);
    if (species) {
      basicInfo.species = species;
    }

    const culture = toStringField(system?.details?.culture);
    if (culture) {
      basicInfo.culture = culture;
    }

    const profession = toStringField(system?.details?.career);
    if (profession) {
      basicInfo.profession = profession;
    }

    const totalAP = toNumber(system?.details?.experience?.total);
    if (totalAP !== undefined) {
      basicInfo.experience = { total: totalAP };
    }

    return basicInfo;
  }

  formatCharacterItemForList(itemData: FoundryItemDocumentBase): Record<string, unknown> {
    const item = itemData as DSA5ItemDocument;
    const system = item.system;

    const formatted: Record<string, unknown> = {
      id: item.id,
      name: item.name,
      type: item.type,
    };

    const quantity = toNumber(system?.quantity);
    if (quantity !== undefined && quantity !== 1) {
      formatted.quantity = quantity;
    }

    const level = toNumberField(system?.level);
    if (level !== undefined) {
      formatted.level = level;
    }

    const equipped = system?.equipped;
    if (typeof equipped === 'boolean') {
      formatted.equipped = equipped;
    }

    return formatted;
  }

  formatCharacterItemForDetails(itemData: FoundryItemDocumentBase): Record<string, unknown> {
    const item = itemData as DSA5ItemDocument;
    const system = item.system;
    const formatted = this.formatCharacterItemForList(itemData);

    const description = system?.description;
    if (typeof description === 'string') {
      formatted.description = description;
    } else {
      formatted.description = toStringField(description) ?? '';
    }

    const actionType = toStringField(system?.actionType);
    if (actionType) {
      formatted.actionType = actionType;
    }

    const actions = toNumberField(system?.actions);
    if (actions !== undefined) {
      formatted.actions = actions;
    }

    formatted.hasImage = Boolean(item.img);
    formatted.system = system ?? {};

    return formatted;
  }

  formatCharacterActionForList(actionData: SystemCharacterAction): Record<string, unknown> {
    const action = asRecord(actionData);
    const formatted: Record<string, unknown> = {
      name: toStringValue(action?.name) ?? 'Unknown Action',
      type: toStringValue(action?.type),
    };

    const traits = action?.traits;
    if (Array.isArray(traits)) {
      const traitValues = traits.filter((t): t is string => typeof t === 'string');
      if (traitValues.length > 0) {
        formatted.traits = traitValues;
      }
    }

    const actionCost = toNumber(action?.actions);
    if (actionCost !== undefined) {
      formatted.actionCost = actionCost;
    }

    const itemId = toStringValue(action?.itemId);
    if (itemId) {
      formatted.itemId = itemId;
    }

    return formatted;
  }

  formatSpellcastingEntryForList(entryData: SystemSpellcastingEntry): Record<string, unknown> {
    const entry = asRecord(entryData);
    const formatted: Record<string, unknown> = {
      name: toStringValue(entry?.name) ?? 'Unknown Entry',
      type: toStringValue(entry?.type),
    };

    const tradition = toStringValue(entry?.tradition);
    if (tradition) {
      formatted.tradition = tradition;
    }

    const ability = toStringValue(entry?.ability);
    if (ability) {
      formatted.ability = ability;
    }

    const dc = toNumber(entry?.dc);
    if (dc !== undefined) {
      formatted.dc = dc;
    }

    const attack = toNumber(entry?.attack);
    if (attack !== undefined) {
      formatted.attack = attack;
    }

    const slots = asRecord(entry?.slots);
    if (slots && Object.keys(slots).length > 0) {
      formatted.slots = slots;
    }

    const spells = entry?.spells;
    if (Array.isArray(spells) && spells.length > 0) {
      formatted.spells = spells.map(spellValue => {
        const spell = asRecord(spellValue);
        const spellData: Record<string, unknown> = {
          id: toStringValue(spell?.id),
          name: toStringValue(spell?.name) ?? 'Unknown Spell',
          level: toNumber(spell?.level),
        };

        if (spell?.prepared === false) {
          spellData.prepared = false;
        }

        if (spell?.expended) {
          spellData.expended = true;
        }

        const traits = spell?.traits;
        if (Array.isArray(traits)) {
          const traitValues = traits.filter((t): t is string => typeof t === 'string');
          if (traitValues.length > 0) {
            spellData.traits = traitValues;
          }
        }

        const actionCost = spell?.actionCost;
        if (typeof actionCost === 'number' || typeof actionCost === 'string') {
          spellData.actionCost = actionCost;
        }

        const range = toStringValue(spell?.range);
        if (range) {
          spellData.range = range;
        }

        const target = toStringValue(spell?.target);
        if (target) {
          spellData.target = target;
        }

        const area = toStringValue(spell?.area);
        if (area) {
          spellData.area = area;
        }

        return spellData;
      });

      formatted.spellCount = spells.length;
    }

    return formatted;
  }

  prepareCharacterProgressionUpdate(
    _actorData: SystemCharacterInfo,
    request: CharacterProgressionUpdateRequest
  ): PreparedCharacterProgressionUpdate {
    const directExperience = request.experiencePoints;
    const targetLevel = request.targetLevel;

    if (directExperience === undefined && targetLevel === undefined) {
      throw new Error(
        'UNSUPPORTED_CAPABILITY: DSA5 progression updates require either experiencePoints or targetLevel.'
      );
    }

    const appliedExperience = directExperience ?? getExperienceLevelByNumber(targetLevel ?? 1).min;

    const updates: UnknownRecord = {
      'system.details.experience.total': appliedExperience,
    };

    if (request.experienceSpent !== undefined) {
      updates['system.details.experience.spent'] = request.experienceSpent;
    }

    const summary: Record<string, unknown> = {
      experiencePoints: appliedExperience,
      mode: directExperience !== undefined ? 'set-experience' : 'set-level-floor',
    };

    if (targetLevel !== undefined) {
      summary.targetLevel = targetLevel;
    }

    const warnings =
      directExperience === undefined && targetLevel !== undefined
        ? [
            `DSA5 level ${targetLevel} was mapped to the minimum AP threshold for that Erfahrungsgrad.`,
          ]
        : undefined;

    return {
      target: createActorProgressionTarget(),
      updates,
      summary,
      ...(warnings ? { warnings } : {}),
    };
  }
}
