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
  PF2eActorDocument,
  PF2eCompendiumDocument,
  PF2eItemDocument,
  SystemCharacterAction,
  SystemCharacterInfo,
  SystemCompendiumCreatureEntity,
  SystemSpellcastingEntry,
  CharacterProgressionUpdateRequest,
  PreparedCharacterProgressionUpdate,
} from '../types.js';
import type {
  FoundryActorDocumentBase,
  FoundryCompendiumPackSummary,
  FoundryItemDocumentBase,
  UnknownRecord,
} from '../../foundry-types.js';
import { PF2eFiltersSchema, matchesPF2eFilters, describePF2eFilters } from './filters.js';

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
    _doc: FoundryActorDocumentBase,
    _pack: FoundryCompendiumPackSummary
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

  formatRawCompendiumCreature(
    entity: SystemCompendiumCreatureEntity,
    mode: 'search' | 'criteria' | 'compact' | 'details'
  ): Record<string, unknown> {
    const creature = entity as PF2eCompendiumDocument;
    const system = creature.system;
    const attributes = system?.attributes;

    const level = toNumberField(system?.details?.level) ?? toNumber(system?.level);
    const traits = toStringArray(system?.traits?.value);
    const primaryType = traits.find(t => PF2E_CREATURE_TRAITS.includes(t.toLowerCase()));
    const size = toStringField(system?.traits?.size) ?? toStringField(system?.size);
    const rarity = toStringValue(system?.traits?.rarity) ?? toStringValue(system?.rarity);

    const hpCurrent = toNumber(attributes?.hp?.value);
    const hpMax = toNumber(attributes?.hp?.max);
    const armorClass = toNumberField(attributes?.ac);
    const movement = asRecord(attributes?.movement);

    const spellcasting = asRecord(system?.spellcasting);
    const hasSpellcasting = Boolean(spellcasting && Object.keys(spellcasting).length > 0);

    const significantAbilities: Record<string, unknown> = {};
    const abilities = system?.abilities;
    if (abilities) {
      for (const [key, abilityValue] of Object.entries(abilities)) {
        const ability = asRecord(abilityValue);
        const score = toNumber(ability?.value);
        if (score !== undefined) {
          const mod = Math.floor((score - 10) / 2);
          if (Math.abs(mod) >= 2) {
            significantAbilities[key.toUpperCase()] = { value: score, modifier: mod };
          }
        }
      }
    }

    const speeds: string[] = [];
    const walk = toNumber(movement?.walk);
    const fly = toNumber(movement?.fly);
    const swim = toNumber(movement?.swim);
    if (walk !== undefined) speeds.push(`${walk} ft`);
    if (fly !== undefined) speeds.push(`fly ${fly} ft`);
    if (swim !== undefined) speeds.push(`swim ${swim} ft`);

    if (mode === 'search') {
      const stats: Record<string, unknown> = {};
      if (level !== undefined) stats.level = level;
      if (traits.length > 0) stats.traits = traits;
      if (primaryType) stats.creatureType = primaryType;
      if (rarity) stats.rarity = rarity;
      if (size) stats.size = size;
      if (hpCurrent !== undefined || hpMax !== undefined) {
        stats.hitPoints = { current: hpCurrent, max: hpMax };
      }
      if (armorClass !== undefined) stats.armorClass = armorClass;
      if (hasSpellcasting) stats.spellcaster = true;
      return Object.keys(stats).length > 0 ? { stats } : {};
    }

    if (mode === 'compact') {
      const stats: Record<string, unknown> = {};
      if (level !== undefined) stats.level = level;
      if (traits.length > 0) stats.traits = traits;
      if (primaryType) stats.creatureType = primaryType;
      if (rarity) stats.rarity = rarity;
      if (size) stats.size = size;
      if (hpMax !== undefined) stats.hitPoints = hpMax;
      if (armorClass !== undefined) stats.armorClass = armorClass;
      if (Object.keys(significantAbilities).length > 0) stats.abilities = significantAbilities;
      if (speeds.length > 0) stats.speed = speeds.join(', ');
      if (hasSpellcasting) stats.spellcaster = true;
      return Object.keys(stats).length > 0 ? { stats } : {};
    }

    if (mode === 'details') {
      return {
        creatureDetails: {
          ...(level !== undefined ? { level } : {}),
          ...(traits.length > 0 ? { traits } : {}),
          ...(primaryType ? { creatureType: primaryType } : {}),
          ...(size ? { size } : {}),
          ...(rarity ? { rarity } : {}),
          ...(hpCurrent !== undefined || hpMax !== undefined
            ? { hitPoints: { current: hpCurrent, max: hpMax } }
            : {}),
          ...(armorClass !== undefined ? { armorClass } : {}),
          ...(Object.keys(significantAbilities).length > 0
            ? { abilities: significantAbilities }
            : {}),
          ...(speeds.length > 0 ? { speed: speeds.join(', ') } : {}),
          ...(hasSpellcasting ? { spellcaster: true } : {}),
        },
      };
    }

    return {
      ...(level !== undefined ? { level } : {}),
      ...(traits.length > 0 ? { traits } : {}),
      ...(primaryType ? { creatureType: primaryType } : {}),
      ...(size ? { size } : {}),
      ...(rarity ? { rarity } : {}),
      flags: {
        spellcaster: hasSpellcasting,
      },
    };
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
  extractCharacterStats(actorData: SystemCharacterInfo): Record<string, unknown> {
    const actor = actorData as PF2eActorDocument;
    const system = actor.system;
    const stats: Record<string, unknown> = {};

    // Basic info
    stats.name = actor.name;
    stats.type = actor.type;

    // Level
    const level = toNumberField(system?.details?.level) ?? toNumber(system?.level);
    if (level !== undefined) {
      stats.level = level;
    }

    // Hit Points
    const hp = system?.attributes?.hp;
    if (hp) {
      stats.hitPoints = {
        current: toNumber(hp.value) ?? 0,
        max: toNumber(hp.max) ?? 0,
        temp: toNumber(hp.temp) ?? 0,
      };
    }

    // Armor Class
    const ac = toNumberField(system?.attributes?.ac);
    if (ac !== undefined) {
      stats.armorClass = ac;
    }

    // Abilities (STR, DEX, CON, INT, WIS, CHA)
    const abilities = system?.abilities;
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
    const skills = system?.skills;
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
    const perception = system?.perception;
    if (perception) {
      stats.perception = {
        modifier: toNumber(perception.value) ?? toNumber(perception.mod) ?? 0,
        rank: toNumber(perception.rank) ?? 0,
      };
    }

    // Saves
    const saves = system?.saves;
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
    if (actor.type === 'npc') {
      const traits = toStringArray(system?.traits?.value);
      if (traits.length > 0) {
        stats.traits = traits;

        // Extract primary creature type
        const primaryType = traits.find(t => PF2E_CREATURE_TRAITS.includes(t.toLowerCase()));
        if (primaryType) {
          stats.creatureType = primaryType;
        }
      }

      const size = toStringField(system?.traits?.size);
      if (size) {
        stats.size = size;
      }

      const alignment = toStringField(system?.details?.alignment);
      if (alignment) {
        stats.alignment = alignment;
      }

      const rarity = toStringValue(system?.traits?.rarity);
      if (rarity) {
        stats.rarity = rarity;
      }
    }

    // Spellcasting
    const spellcasting = asRecord(system?.spellcasting) ?? {};
    const hasSpells = Object.keys(spellcasting).length > 0;
    if (hasSpells) {
      stats.spellcasting = {
        hasSpells: true,
        entries: Object.keys(spellcasting).length,
      };
    }

    return stats;
  }

  formatCharacterBasicInfo(actorData: SystemCharacterInfo): Record<string, unknown> {
    const actor = actorData as PF2eActorDocument;
    const system = actor.system;
    const basicInfo: Record<string, unknown> = {};

    const hp = system?.attributes?.hp;
    if (hp) {
      basicInfo.hitPoints = {
        current: toNumber(hp.value),
        max: toNumber(hp.max),
        temp: toNumber(hp.temp) ?? 0,
      };
    }

    const ac = toNumberField(system?.attributes?.ac);
    if (ac !== undefined) {
      basicInfo.armorClass = ac;
    }

    const level = toNumberField(system?.details?.level) ?? toNumber(system?.level);
    if (level !== undefined) {
      basicInfo.level = level;
    }

    const ancestry = toStringValue(system?.details?.ancestry);
    if (ancestry) {
      basicInfo.ancestry = ancestry;
    }

    const className = toStringValue(system?.details?.class);
    if (className) {
      basicInfo.class = className;
    }

    return basicInfo;
  }

  formatCharacterItemForList(itemData: FoundryItemDocumentBase): Record<string, unknown> {
    const item = itemData as PF2eItemDocument;
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

    const traits = toStringArray(system?.traits?.value);
    if (traits.length > 0) {
      formatted.traits = traits;
    }

    const rarity = toStringValue(system?.traits?.rarity);
    if (rarity) {
      formatted.rarity = rarity;
    }

    const level = toNumberField(system?.level);
    if (level !== undefined) {
      formatted.level = level;
    }

    const actionType = toStringField(system?.actionType);
    if (actionType) {
      formatted.actionType = actionType;
    }

    const equipped = system?.equipped;
    if (typeof equipped === 'boolean') {
      formatted.equipped = equipped;
    }

    return formatted;
  }

  formatCharacterItemForDetails(itemData: FoundryItemDocumentBase): Record<string, unknown> {
    const item = itemData as PF2eItemDocument;
    const system = item.system;
    const formatted = this.formatCharacterItemForList(itemData);

    const description = system?.description;
    if (typeof description === 'string') {
      formatted.description = description;
    } else {
      formatted.description = toStringField(description) ?? '';
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
    const targetLevel = request.targetLevel;
    if (targetLevel === undefined) {
      throw new Error(
        'UNSUPPORTED_CAPABILITY: PF2e progression updates currently require targetLevel.'
      );
    }

    return {
      updates: {
        'system.details.level.value': targetLevel,
      },
      summary: {
        targetLevel,
        mode: 'set-level',
      },
    };
  }
}
