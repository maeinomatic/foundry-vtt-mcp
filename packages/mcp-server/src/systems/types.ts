/**
 * System Adapter Architecture - Core Types
 *
 * This file defines the interfaces for the Registry pattern that enables
 * extensible multi-system support without editing core files.
 */

import { z } from 'zod';
import type {
  FoundryActorDocumentBase,
  FoundryCompendiumDocumentBase,
  FoundryCompendiumPackSummary,
  FoundryItemDocumentBase,
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

export interface SystemCharacterAction extends UnknownRecord {
  name: string;
  type?: string;
  itemId?: string;
  traits?: string[];
  variants?: unknown[];
  ready?: boolean;
  description?: string;
  actions?: number;
}

export interface SystemSpellData extends UnknownRecord {
  id: string;
  name: string;
  level?: number;
  prepared?: boolean;
  expended?: boolean;
  traits?: string[];
  actionCost?: number | string;
  range?: string;
  target?: string;
  area?: string;
}

export interface SystemSpellcastingEntry extends UnknownRecord {
  name: string;
  type?: string;
  tradition?: string;
  ability?: string;
  dc?: number;
  attack?: number;
  slots?: UnknownRecord;
  spells?: SystemSpellData[];
}

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
    entity: FoundryCompendiumDocumentBase,
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
  extractCharacterStats(actorData: FoundryActorDocumentBase): Record<string, unknown>;

  /**
   * Format basic character info for compact character responses.
   * Used by get-character for system-specific basic info shaping.
   */
  formatCharacterBasicInfo(actorData: FoundryActorDocumentBase): Record<string, unknown>;

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
