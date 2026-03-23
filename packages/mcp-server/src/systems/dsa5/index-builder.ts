/**
 * DSA5 Index Builder
 *
 * Builds enhanced creature index from Foundry compendiums.
 * This code runs in Foundry's browser context, not Node.js.
 *
 * Ported from foundry-module/src/tools/dsa5/creature-index.ts
 * Following v0.6.0 Registry Pattern.
 */

import type { IndexBuilder, DSA5CreatureIndex } from '../types.js';
import { SIZE_MAP_DE_TO_EN } from './constants.js';
import { getExperienceLevel } from './constants.js';

// Foundry browser globals (unavailable in Node.js TypeScript compilation)
declare const ui:
  | {
      notifications?: {
        info(message: string): unknown;
        warn(message: string): unknown;
        error(message: string): unknown;
        remove?(notification: unknown): void;
      };
    }
  | undefined;

type UnknownRecord = Record<string, unknown>;

interface FoundryPack {
  metadata: {
    type?: string;
    label: string;
    id: string;
  };
  indexed?: boolean;
  getIndex(options: UnknownRecord): Promise<unknown>;
  getDocuments(): Promise<FoundryDoc[]>;
}

interface FoundryDoc {
  _id: string;
  name: string;
  type: string;
  img?: string;
  system?: unknown;
}

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
 * Result of extractCreatureData operation
 */
interface DSA5ExtractionResult {
  creature: DSA5CreatureIndex;
  errors: number;
}

/**
 * DSA5 implementation of IndexBuilder
 */
export class DSA5IndexBuilder implements IndexBuilder {
  private moduleId: string;

  constructor(moduleId: string = 'maeinomatic-foundry-mcp') {
    this.moduleId = moduleId;
  }

  getSystemId(): 'dsa5' {
    return 'dsa5' as const;
  }

  /**
   * Build enhanced creature index from compendium packs
   */
  async buildIndex(packs: FoundryPack[], _force = false): Promise<DSA5CreatureIndex[]> {
    const startTime = Date.now();
    let progressNotification: unknown = null;
    let totalErrors = 0;

    try {
      const actorPacks = packs.filter(pack => pack.metadata.type === 'Actor');
      const enhancedCreatures: DSA5CreatureIndex[] = [];

      // Show initial progress notification
      ui?.notifications?.info(`Starte DSA5 Kreaturen-Index aus ${actorPacks.length} Paketen...`);

      for (let i = 0; i < actorPacks.length; i++) {
        const pack = actorPacks[i];
        const currentPack = i + 1;

        // Update progress notification
        this.clearNotification(progressNotification);
        if (ui?.notifications) {
          progressNotification = ui.notifications.info(
            `Erstelle DSA5 Index: Paket ${currentPack}/${actorPacks.length} (${pack.metadata.label})...`
          );
        }

        try {
          // Ensure pack index is loaded
          if (!pack.indexed) {
            await pack.getIndex({});
          }

          // Process creatures in this pack
          const packResult = await this.extractDataFromPack(pack);
          enhancedCreatures.push(...packResult.creatures);
          totalErrors += packResult.errors;
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
          ui?.notifications?.warn(
            `Warnung: Fehler beim Indizieren von "${pack.metadata.label}" - fahre fort (${message})`
          );
        }
      }

      // Clear progress notification
      this.clearNotification(progressNotification);

      const buildTimeSeconds = Math.round((Date.now() - startTime) / 1000);
      const errorText = totalErrors > 0 ? ` (${totalErrors} Extraktionsfehler)` : '';
      const successMessage = `DSA5 Kreaturen-Index fertig! ${enhancedCreatures.length} Kreaturen indiziert aus ${actorPacks.length} Paketen in ${buildTimeSeconds}s${errorText}`;

      ui?.notifications?.info(successMessage);

      return enhancedCreatures;
    } catch (error) {
      this.clearNotification(progressNotification);

      const errorMessage = `Fehler beim Erstellen des DSA5 Kreaturen-Index: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`;
      ui?.notifications?.error(errorMessage);

      throw error;
    }
  }

  /**
   * Extract creature data from a single compendium pack
   */
  async extractDataFromPack(
    pack: FoundryPack
  ): Promise<{ creatures: DSA5CreatureIndex[]; errors: number }> {
    const creatures: DSA5CreatureIndex[] = [];
    let errors = 0;

    try {
      // Load all documents from pack
      const documents = await pack.getDocuments();

      for (const doc of documents) {
        try {
          // Only process NPCs, characters, and creatures
          if (doc.type !== 'npc' && doc.type !== 'character' && doc.type !== 'creature') {
            continue;
          }

          const result = this.extractCreatureData(doc, pack);
          if (result) {
            creatures.push(result.creature);
            errors += result.errors;
          }
        } catch (_error) {
          errors++;
        }
      }
    } catch (_error) {
      errors++;
    }

    return { creatures, errors };
  }

  /**
   * Extract DSA5 creature data from a single Foundry document
   *
   * @param doc - Foundry actor document
   * @param pack - Source compendium pack
   * @returns Extracted creature data or null if failed
   */
  extractCreatureData(doc: FoundryDoc, pack: FoundryPack): DSA5ExtractionResult | null {
    try {
      const system = asRecord(doc.system);

      // Extract experience points (AP)
      const experiencePoints =
        toNumber(getNestedValue(system, ['details', 'experience', 'total'])) ??
        toNumber(getNestedValue(system, ['experience', 'total'])) ??
        toNumber(getNestedValue(system, ['status', 'experience'])) ??
        0;

      // Calculate level from AP using EXPERIENCE_LEVELS
      const experienceLevel = getExperienceLevel(experiencePoints);
      const level = experienceLevel.level;

      // Extract species
      const species =
        toStringValue(getNestedValue(system, ['details', 'species', 'value'])) ??
        toStringValue(getNestedValue(system, ['species', 'value'])) ??
        toStringValue(getNestedValue(system, ['details', 'type'])) ??
        'Unbekannt';

      // Extract culture (with default)
      const culture =
        toStringValue(getNestedValue(system, ['details', 'culture', 'value'])) ??
        toStringValue(getNestedValue(system, ['culture', 'value'])) ??
        'Keine';

      // Extract profession/career
      const profession =
        toStringValue(getNestedValue(system, ['details', 'career', 'value'])) ??
        toStringValue(getNestedValue(system, ['details', 'profession', 'value'])) ??
        toStringValue(getNestedValue(system, ['career', 'value'])) ??
        undefined;

      // Extract and normalize size
      const rawSize =
        toStringValue(getNestedValue(system, ['status', 'size', 'value'])) ??
        toStringValue(getNestedValue(system, ['size', 'value'])) ??
        'mittel';
      const size = SIZE_MAP_DE_TO_EN[rawSize.toLowerCase()] ?? 'medium';

      // Extract combat values
      // Note: wounds.current contains actual LeP (based on template.json reverse engineering)
      const lifePoints =
        toNumber(getNestedValue(system, ['status', 'wounds', 'max'])) ??
        toNumber(getNestedValue(system, ['status', 'wounds', 'current'])) ??
        toNumber(getNestedValue(system, ['wounds', 'max'])) ??
        1;

      const meleeDefense =
        toNumber(getNestedValue(system, ['status', 'defense', 'value'])) ??
        toNumber(getNestedValue(system, ['defense', 'value'])) ??
        toNumber(getNestedValue(system, ['status', 'defense'])) ??
        10;

      const rangedDefense =
        toNumber(getNestedValue(system, ['status', 'rangeDefense', 'value'])) ??
        toNumber(getNestedValue(system, ['rangeDefense', 'value'])) ??
        meleeDefense;

      const armor =
        toNumber(getNestedValue(system, ['status', 'armour', 'value'])) ??
        toNumber(getNestedValue(system, ['status', 'armor', 'value'])) ??
        0;

      // Detect spellcasting capability
      const hasAstralEnergy =
        (toNumber(getNestedValue(system, ['status', 'astralenergy', 'max'])) ?? 0) > 0;
      const hasKarmaEnergy =
        (toNumber(getNestedValue(system, ['status', 'karmaenergy', 'max'])) ?? 0) > 0;
      const hasSpells =
        hasAstralEnergy ||
        hasKarmaEnergy ||
        getNestedValue(system, ['spells']) !== undefined ||
        getNestedValue(system, ['liturgies']) !== undefined ||
        getNestedValue(system, ['details', 'tradition']) !== undefined;

      // Extract traits
      const traitsValue =
        getNestedValue(system, ['details', 'traits', 'value']) ??
        getNestedValue(system, ['traits', 'value']) ??
        [];
      const traits = Array.isArray(traitsValue)
        ? traitsValue
            .map(entry => toStringValue(entry))
            .filter((entry): entry is string => entry !== undefined)
        : [];

      // Optional fields
      const rarity =
        toStringValue(getNestedValue(system, ['details', 'rarity'])) ??
        toStringValue(getNestedValue(system, ['rarity'])) ??
        undefined;

      return {
        creature: {
          // Base SystemCreatureIndex fields
          id: doc._id,
          name: doc.name,
          type: doc.type,
          packName: pack.metadata.id,
          packLabel: pack.metadata.label,
          ...(doc.img ? { img: doc.img } : {}),
          system: 'dsa5',

          // DSA5-specific systemData
          systemData: {
            level,
            experiencePoints,
            species,
            culture,
            ...(profession ? { profession } : {}),
            size,
            lifePoints,
            meleeDefense,
            rangedDefense,
            armor,
            hasSpells,
            hasAstralEnergy,
            hasKarmaEnergy,
            traits,
            ...(rarity && { rarity }),
          },
        },
        errors: 0,
      };
    } catch (_error) {
      // Return fallback data with error flag
      return {
        creature: {
          id: doc._id,
          name: doc.name,
          type: doc.type,
          packName: pack.metadata.id,
          packLabel: pack.metadata.label,
          ...(doc.img ? { img: doc.img } : {}),
          system: 'dsa5',
          systemData: {
            level: 1,
            experiencePoints: 0,
            species: 'Unbekannt',
            culture: 'Keine',
            size: 'medium',
            lifePoints: 1,
            meleeDefense: 10,
            rangedDefense: 10,
            armor: 0,
            hasSpells: false,
            traits: [],
          },
        },
        errors: 1,
      };
    }
  }

  private clearNotification(notification: unknown): void {
    if (!notification) {
      return;
    }

    if (ui?.notifications?.remove) {
      ui.notifications.remove(notification);
      return;
    }

    const removeFn = asRecord(notification)?.remove;
    if (typeof removeFn === 'function') {
      removeFn();
    }
  }
}
