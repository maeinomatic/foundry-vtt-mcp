/**
 * System Adapter Architecture - Core Types
 *
 * This file defines the interfaces for the Registry pattern that enables
 * extensible multi-system support without editing core files.
 */

import { z } from 'zod';
import type {
  FoundryActorAttributesBase,
  FoundryActorDocumentBase,
  FoundryActorSystemBase,
  FoundryCharacterInfo,
  FoundryCompendiumDocumentBase,
  FoundryCompendiumPackSummary,
  FoundryCompendiumSearchResult,
  FoundryDescriptionField,
  FoundryItemDocumentBase,
  FoundryItemSystemBase,
  FoundryResourceField,
  FoundryTraitsData,
  FoundryValueField,
  FoundryCharacterAction,
  FoundrySpellInfo,
  FoundrySpellcastingEntry,
  UnknownRecord,
} from '../foundry-types.js';

/**
 * Supported game system identifiers
 * Extend this type when adding new systems
 */
export type SystemId = 'dnd5e' | 'pf2e' | 'dsa5' | 'other';

/**
 * System metadata returned by adapters
 */
export interface SystemMetadata {
  id: SystemId;
  name: string;
  displayName: string;
  version: string;
  description: string;
  supportedFeatures: {
    creatureIndex: boolean;
    characterStats: boolean;
    spellcasting: boolean;
    powerLevel: boolean; // CR/Level/equivalent
  };
}

/**
 * Base interface for system-specific creature data
 * Each system extends this with their own fields
 */
export interface SystemCreatureIndex {
  // Common fields across all systems
  id: string;
  name: string;
  type: string; // Actor type from Foundry
  packName: string;
  packLabel: string;
  img?: string;

  // System-specific metadata
  system: SystemId;
  systemData: UnknownRecord; // System-specific fields (D&D 5e CR, PF2e level, etc.)
}

export interface SystemCharacterAction extends FoundryCharacterAction {}

export interface SystemSpellData extends FoundrySpellInfo {}

export interface SystemSpellcastingEntry extends FoundrySpellcastingEntry {}

export interface CharacterProgressionUpdateRequest {
  targetLevel?: number;
  experiencePoints?: number;
  experienceSpent?: number;
}

export interface PreparedCharacterProgressionUpdate {
  updates: UnknownRecord;
  summary: Record<string, unknown>;
  warnings?: string[];
}

export type SystemCharacterInfo = FoundryCharacterInfo<
  FoundryActorSystemBase,
  FoundryItemSystemBase,
  UnknownRecord
>;

export type SystemCompendiumCreatureEntity =
  | FoundryCompendiumDocumentBase<UnknownRecord, UnknownRecord, UnknownRecord>
  | FoundryCompendiumSearchResult<UnknownRecord>;

export interface DnD5eAbilityData extends UnknownRecord {
  value?: number;
  mod?: number;
}

export interface DnD5eSkillData extends UnknownRecord {
  value?: number;
  total?: number;
  mod?: number;
  proficient?: number;
}

export interface DnD5eActorSystemData extends FoundryActorSystemBase {
  attributes?: FoundryActorAttributesBase & {
    hp?: FoundryResourceField<number>;
    ac?: FoundryValueField<number> | number;
    spellcasting?: UnknownRecord;
  };
  details?: FoundryActorSystemBase['details'] & {
    cr?: number | string | FoundryValueField<number>;
    type?: string | FoundryValueField<string> | { value?: string };
    alignment?: string | FoundryValueField<string>;
    level?: number | FoundryValueField<number>;
    class?: string;
    race?: string;
  };
  traits?: FoundryTraitsData;
  abilities?: Record<string, DnD5eAbilityData>;
  skills?: Record<string, DnD5eSkillData>;
  resources?: UnknownRecord & {
    legact?: FoundryResourceField<number>;
    legres?: FoundryResourceField<number>;
  };
  spells?: UnknownRecord;
}

export interface DnD5eItemSystemData extends FoundryItemSystemBase {
  description?: FoundryDescriptionField | string;
  quantity?: number;
  equipped?: boolean;
  attunement?: number | string;
  actionType?: string | FoundryValueField<string>;
  actions?: number | FoundryValueField<number>;
}

export type DnD5eActorDocument = FoundryActorDocumentBase<
  DnD5eActorSystemData,
  DnD5eItemSystemData
>;
export type DnD5eItemDocument = FoundryItemDocumentBase<DnD5eItemSystemData>;
export type DnD5eCompendiumDocument = FoundryCompendiumDocumentBase<
  DnD5eActorSystemData,
  DnD5eItemSystemData
>;

export interface PF2eAbilityData extends UnknownRecord {
  value?: number;
  mod?: number;
}

export interface PF2eSkillData extends UnknownRecord {
  value?: number;
  mod?: number;
  rank?: number;
}

export interface PF2eActorSystemData extends FoundryActorSystemBase {
  attributes?: FoundryActorAttributesBase & {
    hp?: FoundryResourceField<number>;
    ac?: FoundryValueField<number> | number;
    spellcasting?: UnknownRecord;
  };
  details?: FoundryActorSystemBase['details'] & {
    level?: number | FoundryValueField<number>;
    alignment?: string | FoundryValueField<string>;
    ancestry?: string;
    class?: string;
  };
  traits?: FoundryTraitsData;
  abilities?: Record<string, PF2eAbilityData>;
  skills?: Record<string, PF2eSkillData>;
  perception?: UnknownRecord & {
    value?: number;
    mod?: number;
    rank?: number;
  };
  saves?: Record<
    string,
    UnknownRecord & {
      value?: number;
      mod?: number;
      rank?: number;
    }
  >;
  spellcasting?: UnknownRecord;
}

export interface PF2eItemSystemData extends FoundryItemSystemBase {
  description?: FoundryDescriptionField | string;
  quantity?: number;
  equipped?: boolean;
  traits?: FoundryTraitsData;
  level?: number | FoundryValueField<number>;
  actionType?: string | FoundryValueField<string>;
  actions?: number | FoundryValueField<number>;
}

export type PF2eActorDocument = FoundryActorDocumentBase<PF2eActorSystemData, PF2eItemSystemData>;
export type PF2eItemDocument = FoundryItemDocumentBase<PF2eItemSystemData>;
export type PF2eCompendiumDocument = FoundryCompendiumDocumentBase<
  PF2eActorSystemData,
  PF2eItemSystemData
>;

export interface DSA5CharacteristicData extends UnknownRecord {
  value?: number;
  initial?: number;
}

export interface DSA5ActorSystemData extends FoundryActorSystemBase {
  details?: FoundryActorSystemBase['details'] & {
    species?: FoundryValueField<string>;
    culture?: FoundryValueField<string>;
    career?: FoundryValueField<string>;
    experience?: {
      total?: number;
      spent?: number;
    };
  };
  status?: UnknownRecord & {
    wounds?: {
      current?: number;
      value?: number;
      max?: number;
    };
    astralenergy?: FoundryResourceField<number>;
    karmaenergy?: FoundryResourceField<number>;
    speed?: number | FoundryValueField<number>;
    initiative?: number | FoundryValueField<number>;
    dodge?: number | FoundryValueField<number>;
    armour?: number | FoundryValueField<number>;
    armor?: number | FoundryValueField<number>;
    size?: number | FoundryValueField<number>;
  };
  characteristics?: Record<string, DSA5CharacteristicData>;
  tradition?: UnknownRecord & {
    magical?: boolean | UnknownRecord;
    clerical?: boolean | UnknownRecord;
  };
}

export interface DSA5ItemSystemData extends FoundryItemSystemBase {
  description?: FoundryDescriptionField | string;
  quantity?: number;
  equipped?: boolean;
  level?: number | FoundryValueField<number>;
  actionType?: string | FoundryValueField<string>;
  actions?: number | FoundryValueField<number>;
}

export type DSA5ActorDocument = FoundryActorDocumentBase<DSA5ActorSystemData, DSA5ItemSystemData>;
export type DSA5ItemDocument = FoundryItemDocumentBase<DSA5ItemSystemData>;
export type DSA5CompendiumDocument = FoundryCompendiumDocumentBase<
  DSA5ActorSystemData,
  DSA5ItemSystemData
>;

/**
 * System Adapter Interface
 *
 * Each game system implements this interface to provide system-specific
 * logic for creature indexing, filtering, formatting, and data extraction.
 */
export interface SystemAdapter {
  /**
   * Get system metadata
   */
  getMetadata(): SystemMetadata;

  /**
   * Check if this adapter can handle a given system ID
   * @param systemId - The Foundry system ID (e.g., "dnd5e", "pf2e", "dsa5")
   */
  canHandle(systemId: string): boolean;

  /**
   * Extract creature data from a Foundry document for indexing
   * Called during enhanced creature index building
   * @param doc - Foundry actor document
   * @param pack - Compendium pack metadata
   * @returns Creature data or null if not a valid creature
   */
  extractCreatureData(
    doc: FoundryActorDocumentBase,
    pack: FoundryCompendiumPackSummary
  ): { creature: SystemCreatureIndex; errors: number } | null;

  /**
   * Get Zod schema for filter validation
   * Used by search-compendium and list-creatures-by-criteria tools
   */
  getFilterSchema(): z.ZodSchema;

  /**
   * Check if a creature matches the given filters
   * @param creature - Indexed creature data
   * @param filters - User-provided filter criteria
   */
  matchesFilters(creature: SystemCreatureIndex, filters: Record<string, unknown>): boolean;

  /**
   * Get system-specific data paths for actor properties
   * Returns null for paths that don't exist in this system
   */
  getDataPaths(): Record<string, string | null>;

  /**
   * Format creature data for list display
   * Used in search results and creature lists
   */
  formatCreatureForList(creature: SystemCreatureIndex): Record<string, unknown>;

  /**
   * Format creature data for detailed display
   * Used when showing full creature information
   */
  formatCreatureForDetails(creature: SystemCreatureIndex): Record<string, unknown>;

  /**
   * Generate human-readable description of filters
   * @param filters - Filter criteria to describe
   */
  describeFilters(filters: Record<string, unknown>): string;

  /**
   * Format raw compendium creature entity data for MCP responses.
   * `mode=search` is used by search-compendium output.
   * `mode=criteria` is used by list-creatures-by-criteria output.
   * `mode=compact` is used by get-compendium-item compact actor responses.
   * `mode=details` is used by get-compendium-item full actor responses.
   */
  formatRawCompendiumCreature(
    entity: SystemCompendiumCreatureEntity,
    mode: 'search' | 'criteria' | 'compact' | 'details'
  ): Record<string, unknown>;

  /**
   * Get normalized power level for a creature
   * D&D 5e: CR (0-30)
   * PF2e: Level (-1 to 25+)
   * DSA5: Challenge Points or equivalent
   * @returns Numeric power level for comparison, or undefined if not applicable
   */
  getPowerLevel(creature: SystemCreatureIndex): number | undefined;

  /**
   * Extract character statistics from actor data
   * Used by get-character and list-characters tools
   * @param actorData - Raw Foundry actor data
   */
  extractCharacterStats(actorData: SystemCharacterInfo): Record<string, unknown>;

  /**
   * Format basic character info for compact character responses.
   * Used by get-character for system-specific basic info shaping.
   */
  formatCharacterBasicInfo(actorData: SystemCharacterInfo): Record<string, unknown>;

  /**
   * Format a character item for compact list responses.
   * Used by get-character item listings to keep core tools system-agnostic.
   */
  formatCharacterItemForList(item: FoundryItemDocumentBase): Record<string, unknown>;

  /**
   * Format a character item for detailed entity responses.
   * Used by get-character-entity to keep system-specific item semantics out of core tools.
   */
  formatCharacterItemForDetails(item: FoundryItemDocumentBase): Record<string, unknown>;

  /**
   * Format a character action for compact list responses.
   */
  formatCharacterActionForList(action: SystemCharacterAction): Record<string, unknown>;

  /**
   * Format a spellcasting entry for compact list responses.
   */
  formatSpellcastingEntryForList(entry: SystemSpellcastingEntry): Record<string, unknown>;

  /**
   * Prepare a system-safe actor update payload for character progression changes.
   * This should only use public Document.update-compatible differential data.
   */
  prepareCharacterProgressionUpdate(
    actorData: SystemCharacterInfo,
    request: CharacterProgressionUpdateRequest
  ): PreparedCharacterProgressionUpdate;
}

/**
 * Index Builder Interface
 *
 * Handles building the enhanced creature index in Foundry's browser context.
 * Separate from SystemAdapter because this runs in Foundry module (browser),
 * while SystemAdapter runs in MCP server (Node.js).
 */
export interface IndexBuilder {
  /**
   * Get the system ID this builder handles
   */
  getSystemId(): SystemId;

  /**
   * Build enhanced creature index from compendium packs
   * @param packs - Array of compendium packs to index
   * @param force - Force rebuild even if cache exists
   * @returns Array of indexed creatures
   */
  buildIndex(packs: unknown[], force?: boolean): Promise<SystemCreatureIndex[]>;

  /**
   * Extract creature data from a single compendium pack
   * @param pack - Compendium pack to process
   * @returns Creatures and error count
   */
  extractDataFromPack(pack: unknown): Promise<{ creatures: SystemCreatureIndex[]; errors: number }>;
}

/**
 * D&D 5e specific creature index structure
 */
export interface DnD5eCreatureIndex extends SystemCreatureIndex {
  system: 'dnd5e';
  systemData: {
    challengeRating?: number;
    creatureType?: string;
    size?: string;
    alignment?: string;
    level?: number;
    hasSpellcasting: boolean;
    hasLegendaryActions: boolean;
    hitPoints?: number;
    armorClass?: number;
  };
}

/**
 * Pathfinder 2e specific creature index structure
 */
export interface PF2eCreatureIndex extends SystemCreatureIndex {
  system: 'pf2e';
  systemData: {
    level?: number;
    traits?: string[];
    size?: string;
    alignment?: string;
    rarity?: string;
    hasSpellcasting: boolean;
    hitPoints?: number;
    armorClass?: number;
  };
}

/**
 * DSA5 (Das Schwarze Auge 5) specific creature index structure
 */
export interface DSA5CreatureIndex extends SystemCreatureIndex {
  system: 'dsa5';
  systemData: {
    level?: number; // Experience level 1-7
    species?: string; // Spezies (Human, Elf, Dwarf, etc.)
    culture?: string; // Kultur
    profession?: string; // Profession (career)
    size?: string; // Size category
    hasSpells: boolean; // Has spellcasting abilities
    hasAstralEnergy?: boolean; // Has AsP (Astralenergie)
    hasKarmaEnergy?: boolean; // Has KaP (Karmaenergie)
    traits?: string[]; // Special abilities/traits
    hitPoints?: number; // Deprecated, use lifePoints
    lifePoints?: number; // LeP (Lebensenergie)
    experiencePoints?: number; // Abenteuerpunkte (AP)
    meleeDefense?: number; // Parry defense (PAW)
    rangedDefense?: number; // Dodge defense (AW)
    armor?: number; // Armor rating (RS)
    rarity?: string; // Rarity classification
  };
}

/**
 * Generic creature index for unsupported systems
 */
export interface GenericCreatureIndex extends SystemCreatureIndex {
  system: 'other';
  systemData: Record<string, unknown>;
}

/**
 * Union type of all creature index types
 */
export type AnyCreatureIndex =
  | DnD5eCreatureIndex
  | PF2eCreatureIndex
  | DSA5CreatureIndex
  | GenericCreatureIndex;
