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
  DnD5eActorDocument,
  DnD5eCompendiumDocument,
  DnD5eItemDocument,
  SystemCharacterAction,
  SystemCharacterInfo,
  SystemCompendiumCreatureEntity,
  SystemSpellcastingEntry,
  CharacterProgressionUpdateRequest,
  PreparedCharacterProgressionUpdate,
} from '../types.js';
import { createActorProgressionTarget } from '../types.js';
import type {
  FoundryCompendiumPackSummary,
  FoundryActorDocumentBase,
  FoundryItemDocumentBase,
  UnknownRecord,
} from '../../foundry-types.js';
import { DnD5eFiltersSchema, matchesDnD5eFilters, describeDnD5eFilters } from './filters.js';

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
    _doc: FoundryActorDocumentBase,
    _pack: FoundryCompendiumPackSummary
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
    entity: SystemCompendiumCreatureEntity,
    mode: 'search' | 'criteria' | 'compact' | 'details'
  ): Record<string, unknown> {
    const creature = entity as DnD5eCompendiumDocument;
    const system = creature.system;
    const attributes = system?.attributes;
    const details = system?.details;
    const resources = system?.resources;
    const movement = asRecord(attributes?.movement);

    const challengeRating = toNumberField(details?.cr) ?? toNumberField(system?.cr);
    const creatureType = toStringField(details?.type) ?? toStringField(system?.type);
    const size = toStringField(system?.traits?.size) ?? toStringField(system?.size);
    const alignment = toStringField(details?.alignment) ?? toStringField(system?.alignment);

    const hpCurrent = toNumber(attributes?.hp?.value);
    const hpMax = toNumber(attributes?.hp?.max);
    const armorClass = toNumberField(attributes?.ac);

    const hasSpellcasting =
      system?.spells !== undefined ||
      attributes?.spellcasting !== undefined ||
      (toNumber(details?.spellLevel) ?? 0) > 0;

    const hasLegendaryActions =
      resources?.legact !== undefined ||
      system?.legendary !== undefined ||
      (toNumber(resources?.legres?.value) ?? 0) > 0;

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

    if (mode === 'compact') {
      const stats: Record<string, unknown> = {};
      if (challengeRating !== undefined) stats.challengeRating = challengeRating;
      if (creatureType) stats.creatureType = creatureType;
      if (size) stats.size = size;
      if (alignment) stats.alignment = alignment;
      if (hpMax !== undefined) stats.hitPoints = hpMax;
      if (armorClass !== undefined) stats.armorClass = armorClass;
      if (Object.keys(significantAbilities).length > 0) stats.abilities = significantAbilities;
      if (speeds.length > 0) stats.speed = speeds.join(', ');
      if (hasSpellcasting) stats.spellcaster = true;
      if (hasLegendaryActions) stats.hasLegendaryActions = true;
      return Object.keys(stats).length > 0 ? { stats } : {};
    }

    if (mode === 'details') {
      return {
        creatureDetails: {
          ...(challengeRating !== undefined ? { challengeRating } : {}),
          ...(creatureType ? { creatureType } : {}),
          ...(size ? { size } : {}),
          ...(alignment ? { alignment } : {}),
          ...(hpCurrent !== undefined || hpMax !== undefined
            ? { hitPoints: { current: hpCurrent, max: hpMax } }
            : {}),
          ...(armorClass !== undefined ? { armorClass } : {}),
          ...(Object.keys(significantAbilities).length > 0
            ? { abilities: significantAbilities }
            : {}),
          ...(speeds.length > 0 ? { speed: speeds.join(', ') } : {}),
          ...(hasSpellcasting ? { spellcaster: true } : {}),
          ...(hasLegendaryActions ? { hasLegendaryActions: true } : {}),
        },
      };
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
  extractCharacterStats(actorData: SystemCharacterInfo): Record<string, unknown> {
    const actor = actorData as DnD5eActorDocument;
    const system = actor.system;
    const stats: Record<string, unknown> = {};

    // Basic info
    stats.name = actor.name;
    stats.type = actor.type;

    // Challenge Rating or Level
    const cr = toNumberField(system?.details?.cr) ?? toNumberField(system?.cr);
    if (cr !== undefined) {
      stats.challengeRating = cr;
    }

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
          value: toNumber(abilityData?.value) ?? 10,
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
        skillStats[key] = {
          value: toNumber(skillData?.value) ?? 0,
          modifier: toNumber(skillData?.total) ?? toNumber(skillData?.mod) ?? 0,
          proficient: toNumber(skillData?.proficient) ?? 0,
        };
      }
      stats.skills = skillStats;
    }

    // Creature-specific info
    if (actor.type === 'npc') {
      const creatureType = toStringField(system?.details?.type);
      if (creatureType) {
        stats.creatureType = creatureType;
      }

      const size = toStringField(system?.traits?.size) ?? toStringField(system?.size);
      if (size) {
        stats.size = size;
      }

      const alignment = toStringField(system?.details?.alignment);
      if (alignment) {
        stats.alignment = alignment;
      }

      // Legendary actions
      const legact = system?.resources?.legact;
      if (legact) {
        stats.legendaryActions = {
          available: toNumber(legact.value) ?? 0,
          max: toNumber(legact.max) ?? 0,
        };
      }
    }

    // Spellcasting
    const spellLevel = toNumber(system?.details?.spellLevel) ?? 0;
    const hasSpells =
      system?.spells !== undefined ||
      system?.attributes?.spellcasting !== undefined ||
      spellLevel > 0;
    if (hasSpells) {
      stats.spellcasting = {
        hasSpells: true,
        spellLevel,
      };
    }

    return stats;
  }

  formatCharacterBasicInfo(actorData: SystemCharacterInfo): Record<string, unknown> {
    const actor = actorData as DnD5eActorDocument;
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

    const className = toStringValue(system?.details?.class);
    if (className) {
      basicInfo.class = className;
    }

    const race = toStringValue(system?.details?.race);
    if (race) {
      basicInfo.race = race;
    }

    return basicInfo;
  }

  formatCharacterItemForList(itemData: FoundryItemDocumentBase): Record<string, unknown> {
    const item = itemData as DnD5eItemDocument;
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

    const equipped = system?.equipped;
    if (typeof equipped === 'boolean') {
      formatted.equipped = equipped;
    }

    const attunement = system?.attunement;
    if (typeof attunement === 'number' || typeof attunement === 'string') {
      formatted.attunement = attunement;
    }

    return formatted;
  }

  formatCharacterItemForDetails(itemData: FoundryItemDocumentBase): Record<string, unknown> {
    const item = itemData as DnD5eItemDocument;
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

  prepareCharacterProgressionUpdate(
    actorData: SystemCharacterInfo,
    request: CharacterProgressionUpdateRequest
  ): PreparedCharacterProgressionUpdate {
    const actor = actorData as DnD5eActorDocument;
    const targetLevel = request.targetLevel;

    if (targetLevel === undefined) {
      throw new Error('UNSUPPORTED_CAPABILITY: DnD5e progression updates require a targetLevel.');
    }

    if (actor.type !== 'character') {
      return {
        target: createActorProgressionTarget(),
        updates: {
          'system.details.level': { value: targetLevel },
        },
        summary: {
          targetLevel,
          mode: 'set-level',
        },
        warnings: ['DnD5e non-character actors still use a direct actor level field update.'],
      };
    }

    const classItems = (actor.items ?? []).filter(
      (item): item is DnD5eItemDocument =>
        item.type === 'class' && typeof item.id === 'string' && typeof item.name === 'string'
    );

    if (classItems.length === 0) {
      throw new Error(
        'UNSUPPORTED_CAPABILITY: No DnD5e class item was found on this character, so class advancement cannot be applied safely.'
      );
    }

    const requestedClass = request.classIdentifier?.toLowerCase();
    const classItem =
      requestedClass !== undefined
        ? classItems.find(
            item =>
              item.id.toLowerCase() === requestedClass || item.name.toLowerCase() === requestedClass
          )
        : classItems.length === 1
          ? classItems[0]
          : null;

    if (!classItem) {
      if (requestedClass) {
        throw new Error(
          `UNSUPPORTED_CAPABILITY: Class "${request.classIdentifier}" was not found on this DnD5e character.`
        );
      }

      throw new Error(
        'UNSUPPORTED_CAPABILITY: DnD5e multiclass characters require classIdentifier so the correct class item can be advanced.'
      );
    }

    const currentLevel = toNumber(classItem.system?.levels);
    const advancementRules = Array.isArray(classItem.system?.advancement)
      ? classItem.system.advancement.length
      : 0;

    return {
      target: {
        kind: 'embedded-item',
        itemIdentifier: classItem.id,
        itemType: 'class',
      },
      updates: {
        'system.levels': targetLevel,
      },
      summary: {
        classId: classItem.id,
        className: classItem.name,
        ...(currentLevel !== undefined ? { previousLevel: currentLevel } : {}),
        targetLevel,
        mode: 'set-class-levels',
      },
      warnings: [
        'DnD5e progression is applied to the owned class item, not the actor level field.',
        ...(advancementRules > 0
          ? [
              `This class has ${advancementRules} advancement definition(s). Additional DnD5e advancement choices or feature grants may still need confirmation in Foundry.`,
            ]
          : []),
      ],
    };
  }
}
