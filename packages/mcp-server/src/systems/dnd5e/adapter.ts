/**
 * D&D 5e System Adapter
 *
 * Implements SystemAdapter interface for D&D 5th Edition support.
 * Handles creature indexing, filtering, formatting, and data extraction.
 */

import type {
  SystemAdapter,
  SystemMetadata,
  SystemCreatureIndex,
  DnD5eCreatureIndex,
} from '../types.js';
import { DnD5eFiltersSchema, matchesDnD5eFilters, describeDnD5eFilters } from './filters.js';

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
 * D&D 5e system adapter
 */
export class DnD5eAdapter implements SystemAdapter {
  getMetadata(): SystemMetadata {
    return {
      id: 'dnd5e',
      name: 'dnd5e',
      displayName: 'Dungeons & Dragons 5th Edition',
      version: '1.0.0',
      description:
        'Support for D&D 5e game system with Challenge Rating, creature types, and legendary actions',
      supportedFeatures: {
        creatureIndex: true,
        characterStats: true,
        spellcasting: true,
        powerLevel: true, // Uses Challenge Rating
      },
    };
  }

  canHandle(systemId: string): boolean {
    return systemId.toLowerCase() === 'dnd5e';
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
    throw new Error('extractCreatureData should be called from DnD5eIndexBuilder, not the adapter');
  }

  getFilterSchema(): typeof DnD5eFiltersSchema {
    return DnD5eFiltersSchema;
  }

  matchesFilters(creature: SystemCreatureIndex, filters: Record<string, unknown>): boolean {
    // Validate filters match D&D 5e schema
    const validated = DnD5eFiltersSchema.safeParse(filters);
    if (!validated.success) {
      return false;
    }

    return matchesDnD5eFilters(creature, validated.data);
  }

  getDataPaths(): Record<string, string | null> {
    return {
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
      // PF2e-specific paths don't exist in D&D 5e
      perception: null,
      saves: null,
      rarity: null,
    };
  }

  formatCreatureForList(creature: SystemCreatureIndex): Record<string, unknown> {
    const dnd5eCreature = creature as DnD5eCreatureIndex;
    const formatted: Record<string, unknown> = {
      id: creature.id,
      name: creature.name,
      type: creature.type,
      pack: {
        id: creature.packName,
        label: creature.packLabel,
      },
    };

    // Add D&D 5e specific stats
    if (dnd5eCreature.systemData) {
      const stats: Record<string, unknown> = {};

      if (dnd5eCreature.systemData.challengeRating !== undefined) {
        stats.challengeRating = dnd5eCreature.systemData.challengeRating;
      }

      if (dnd5eCreature.systemData.creatureType) {
        stats.creatureType = dnd5eCreature.systemData.creatureType;
      }

      if (dnd5eCreature.systemData.size) {
        stats.size = dnd5eCreature.systemData.size;
      }

      if (dnd5eCreature.systemData.alignment) {
        stats.alignment = dnd5eCreature.systemData.alignment;
      }

      if (dnd5eCreature.systemData.hitPoints) {
        stats.hitPoints = dnd5eCreature.systemData.hitPoints;
      }

      if (dnd5eCreature.systemData.armorClass) {
        stats.armorClass = dnd5eCreature.systemData.armorClass;
      }

      if (dnd5eCreature.systemData.hasLegendaryActions) {
        stats.hasLegendaryActions = true;
      }

      if (dnd5eCreature.systemData.hasSpellcasting) {
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
    const dnd5eCreature = creature as DnD5eCreatureIndex;
    const formatted = this.formatCreatureForList(creature);

    // Add additional details
    if (dnd5eCreature.systemData) {
      formatted.detailedStats = {
        challengeRating: dnd5eCreature.systemData.challengeRating,
        creatureType: dnd5eCreature.systemData.creatureType,
        size: dnd5eCreature.systemData.size,
        alignment: dnd5eCreature.systemData.alignment,
        level: dnd5eCreature.systemData.level,
        hitPoints: dnd5eCreature.systemData.hitPoints,
        armorClass: dnd5eCreature.systemData.armorClass,
        hasSpellcasting: dnd5eCreature.systemData.hasSpellcasting,
        hasLegendaryActions: dnd5eCreature.systemData.hasLegendaryActions,
      };
    }

    if (creature.img) {
      formatted.img = creature.img;
    }

    return formatted;
  }

  describeFilters(filters: Record<string, unknown>): string {
    const validated = DnD5eFiltersSchema.safeParse(filters);
    if (!validated.success) {
      return 'invalid filters';
    }

    return describeDnD5eFilters(validated.data);
  }

  formatRawCompendiumCreature(
    entity: unknown,
    mode: 'search' | 'criteria'
  ): Record<string, unknown> {
    const record = asRecord(entity);
    const system = asRecord(record?.system);

    const challengeRating =
      toNumber(getNestedValue(system, ['details', 'cr'])) ??
      toNumber(getNestedValue(system, ['cr']));
    const creatureType =
      toStringValue(getNestedValue(system, ['details', 'type', 'value'])) ??
      toStringValue(getNestedValue(system, ['type', 'value']));
    const size =
      toStringValue(getNestedValue(system, ['traits', 'size'])) ??
      toStringValue(getNestedValue(system, ['traits', 'size', 'value'])) ??
      toStringValue(getNestedValue(system, ['size']));
    const alignment =
      toStringValue(getNestedValue(system, ['details', 'alignment'])) ??
      toStringValue(getNestedValue(system, ['details', 'alignment', 'value'])) ??
      toStringValue(getNestedValue(system, ['alignment']));

    const hpCurrent = toNumber(getNestedValue(system, ['attributes', 'hp', 'value']));
    const hpMax = toNumber(getNestedValue(system, ['attributes', 'hp', 'max']));
    const armorClass = toNumber(getNestedValue(system, ['attributes', 'ac', 'value']));

    const hasSpellcasting = Boolean(
      getNestedValue(system, ['spells']) ||
        getNestedValue(system, ['attributes', 'spellcasting']) ||
        (toNumber(getNestedValue(system, ['details', 'spellLevel'])) ?? 0) > 0
    );

    const hasLegendaryActions = Boolean(
      getNestedValue(system, ['resources', 'legact']) ||
        getNestedValue(system, ['legendary']) ||
        (toNumber(getNestedValue(system, ['resources', 'legres', 'value'])) ?? 0) > 0
    );

    if (mode === 'search') {
      const stats: Record<string, unknown> = {};
      if (challengeRating !== undefined) stats.challengeRating = challengeRating;
      if (creatureType) stats.creatureType = creatureType;
      if (size) stats.size = size;
      if (alignment) stats.alignment = alignment;
      if (hpCurrent !== undefined || hpMax !== undefined) {
        stats.hitPoints = { current: hpCurrent, max: hpMax };
      }
      if (armorClass !== undefined) stats.armorClass = armorClass;
      if (hasLegendaryActions) stats.hasLegendaryActions = true;
      if (hasSpellcasting) stats.spellcaster = true;
      return Object.keys(stats).length > 0 ? { stats } : {};
    }

    const typeLower = (creatureType ?? '').toLowerCase();
    return {
      ...(challengeRating !== undefined ? { challengeRating } : {}),
      ...(creatureType ? { creatureType } : {}),
      ...(size ? { size } : {}),
      flags: {
        spellcaster: hasSpellcasting,
        legendary: hasLegendaryActions,
        undead: typeLower === 'undead',
        dragon: typeLower === 'dragon',
        fiend: typeLower === 'fiend',
      },
    };
  }

  getPowerLevel(creature: SystemCreatureIndex): number | undefined {
    const dnd5eCreature = creature as DnD5eCreatureIndex;

    // D&D 5e: Try CR first, then character level
    if (dnd5eCreature.systemData?.challengeRating !== undefined) {
      return dnd5eCreature.systemData.challengeRating;
    }

    if (dnd5eCreature.systemData?.level !== undefined) {
      return dnd5eCreature.systemData.level;
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

    // Challenge Rating or Level
    const cr =
      toNumber(getNestedValue(system, ['details', 'cr'])) ??
      toNumber(getNestedValue(system, ['details', 'cr', 'value'])) ??
      toNumber(getNestedValue(system, ['cr']));
    if (cr !== undefined) {
      stats.challengeRating = cr;
    }

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
          value: toNumber(abilityData?.value) ?? 10,
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
        skillStats[key] = {
          value: toNumber(skillData?.value) ?? 0,
          modifier: toNumber(skillData?.total) ?? toNumber(skillData?.mod) ?? 0,
          proficient: toNumber(skillData?.proficient) ?? 0,
        };
      }
      stats.skills = skillStats;
    }

    // Creature-specific info
    if (toStringValue(actor?.type) === 'npc') {
      const creatureType =
        toStringValue(getNestedValue(system, ['details', 'type', 'value'])) ??
        toStringValue(getNestedValue(system, ['details', 'type']));
      if (creatureType) {
        stats.creatureType = creatureType;
      }

      const size =
        toStringValue(getNestedValue(system, ['traits', 'size', 'value'])) ??
        toStringValue(getNestedValue(system, ['traits', 'size'])) ??
        toStringValue(getNestedValue(system, ['size']));
      if (size) {
        stats.size = size;
      }

      const alignment =
        toStringValue(getNestedValue(system, ['details', 'alignment', 'value'])) ??
        toStringValue(getNestedValue(system, ['details', 'alignment']));
      if (alignment) {
        stats.alignment = alignment;
      }

      // Legendary actions
      const legact = asRecord(getNestedValue(system, ['resources', 'legact']));
      if (legact) {
        stats.legendaryActions = {
          available: toNumber(legact.value) ?? 0,
          max: toNumber(legact.max) ?? 0,
        };
      }
    }

    // Spellcasting
    const spellLevel = toNumber(getNestedValue(system, ['details', 'spellLevel'])) ?? 0;
    const hasSpells =
      getNestedValue(system, ['spells']) !== undefined ||
      getNestedValue(system, ['attributes', 'spellcasting']) !== undefined ||
      spellLevel > 0;
    if (hasSpells) {
      stats.spellcasting = {
        hasSpells: true,
        spellLevel,
      };
    }

    return stats;
  }

  formatCharacterBasicInfo(actorData: unknown): Record<string, unknown> {
    const actor = asRecord(actorData);
    const system = asRecord(actor?.system);
    const basicInfo: Record<string, unknown> = {};

    const hp = asRecord(getNestedValue(system, ['attributes', 'hp']));
    if (hp) {
      basicInfo.hitPoints = {
        current: toNumber(hp.value),
        max: toNumber(hp.max),
        temp: toNumber(hp.temp) ?? 0,
      };
    }

    const ac =
      toNumber(getNestedValue(system, ['attributes', 'ac', 'value'])) ??
      toNumber(getNestedValue(system, ['attributes', 'ac']));
    if (ac !== undefined) {
      basicInfo.armorClass = ac;
    }

    const level =
      toNumber(getNestedValue(system, ['details', 'level', 'value'])) ??
      toNumber(getNestedValue(system, ['details', 'level'])) ??
      toNumber(getNestedValue(system, ['level']));
    if (level !== undefined) {
      basicInfo.level = level;
    }

    const className = toStringValue(getNestedValue(system, ['details', 'class']));
    if (className) {
      basicInfo.class = className;
    }

    const race = toStringValue(getNestedValue(system, ['details', 'race']));
    if (race) {
      basicInfo.race = race;
    }

    return basicInfo;
  }

  formatCharacterItemForList(itemData: unknown): Record<string, unknown> {
    const item = asRecord(itemData);
    const system = asRecord(item?.system);

    const formatted: Record<string, unknown> = {
      id: toStringValue(item?.id) ?? '',
      name: toStringValue(item?.name) ?? 'Unknown Item',
      type: toStringValue(item?.type) ?? 'unknown',
    };

    const quantity = toNumber(getNestedValue(system, ['quantity']));
    if (quantity !== undefined && quantity !== 1) {
      formatted.quantity = quantity;
    }

    const equipped = getNestedValue(system, ['equipped']);
    if (typeof equipped === 'boolean') {
      formatted.equipped = equipped;
    }

    const attunement = getNestedValue(system, ['attunement']);
    if (typeof attunement === 'number' || typeof attunement === 'string') {
      formatted.attunement = attunement;
    }

    return formatted;
  }

  formatCharacterActionForList(actionData: unknown): Record<string, unknown> {
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

  formatSpellcastingEntryForList(entryData: unknown): Record<string, unknown> {
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

        const actionCost = toNumber(spell?.actionCost);
        if (actionCost !== undefined) {
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
}
