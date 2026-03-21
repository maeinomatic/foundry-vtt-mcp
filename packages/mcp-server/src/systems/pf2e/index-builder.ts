/**
 * Pathfinder 2e Index Builder
 *
 * Builds enhanced creature index from Foundry compendiums.
 * This code runs in Foundry's browser context, not Node.js.
 *
 * Extracted from data-access.ts for modular system support.
 */

import type { IndexBuilder, PF2eCreatureIndex } from '../types.js';

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

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(entry => toStringValue(entry))
    .filter((entry): entry is string => entry !== undefined);
}

/**
 * PF2e implementation of IndexBuilder
 */
export class PF2eIndexBuilder implements IndexBuilder {
  private moduleId: string;

  constructor(moduleId: string = 'foundry-mcp-bridge') {
    this.moduleId = moduleId;
  }

  getSystemId(): 'pf2e' {
    return 'pf2e' as const;
  }

  /**
   * Build enhanced creature index from compendium packs
   */
  async buildIndex(packs: FoundryPack[], _force = false): Promise<PF2eCreatureIndex[]> {
    const startTime = Date.now();
    let progressNotification: unknown = null;
    let totalErrors = 0;

    try {
      const actorPacks = packs.filter(pack => pack.metadata.type === 'Actor');
      const enhancedCreatures: PF2eCreatureIndex[] = [];

      ui?.notifications?.info(
        `Starting PF2e creature index build from ${actorPacks.length} packs...`
      );

      let currentPack = 0;
      for (const pack of actorPacks) {
        currentPack++;

        this.clearNotification(progressNotification);
        if (ui?.notifications) {
          progressNotification = ui.notifications.info(
            `Building PF2e index: Pack ${currentPack}/${actorPacks.length} (${pack.metadata.label})...`
          );
        }

        const result = await this.extractDataFromPack(pack);
        enhancedCreatures.push(...result.creatures);
        totalErrors += result.errors;
      }

      this.clearNotification(progressNotification);
      ui?.notifications?.info(
        `Saving PF2e index to world database... (${enhancedCreatures.length} creatures)`
      );

      const buildTimeSeconds = Math.round((Date.now() - startTime) / 1000);
      const errorText = totalErrors > 0 ? ` (${totalErrors} extraction errors)` : '';
      const successMessage = `PF2e creature index complete! ${enhancedCreatures.length} creatures indexed from ${actorPacks.length} packs in ${buildTimeSeconds}s${errorText}`;

      ui?.notifications?.info(successMessage);

      return enhancedCreatures;
    } catch (error) {
      this.clearNotification(progressNotification);

      const errorMessage = `Failed to build PF2e creature index: ${error instanceof Error ? error.message : 'Unknown error'}`;
      ui?.notifications?.error(errorMessage);

      throw error;
    }
  }

  /**
   * Extract creature data from a single compendium pack
   */
  async extractDataFromPack(
    pack: FoundryPack
  ): Promise<{ creatures: PF2eCreatureIndex[]; errors: number }> {
    const creatures: PF2eCreatureIndex[] = [];
    let errors = 0;

    try {
      const documents = await pack.getDocuments();

      for (const doc of documents) {
        try {
          if (doc.type !== 'npc' && doc.type !== 'character') {
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
   * Extract Pathfinder 2e creature data from a single document
   */
  extractCreatureData(
    doc: FoundryDoc,
    pack: FoundryPack
  ): { creature: PF2eCreatureIndex; errors: number } | null {
    try {
      const system = asRecord(doc.system);

      // Level extraction (PF2e primary power metric)
      const level = toNumber(getNestedValue(system, ['details', 'level', 'value'])) ?? 0;

      // Traits extraction (PF2e uses array of traits)
      const traits = toStringArray(getNestedValue(system, ['traits', 'value']));

      // Extract primary creature type from traits
      const creatureTraits = [
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
      const _creatureType =
        traits.find((t: string) => creatureTraits.includes(t.toLowerCase()))?.toLowerCase() ??
        'unknown';

      // Rarity extraction (PF2e specific)
      const rarity = toStringValue(getNestedValue(system, ['traits', 'rarity'])) ?? 'common';

      // Size extraction
      const rawSize = toStringValue(getNestedValue(system, ['traits', 'size', 'value'])) ?? 'med';
      // Normalize PF2e size values (tiny, sm, med, lg, huge, grg)
      const sizeMap: Record<string, string> = {
        tiny: 'tiny',
        sm: 'small',
        med: 'medium',
        lg: 'large',
        huge: 'huge',
        grg: 'gargantuan',
      };
      const size = sizeMap[rawSize.toLowerCase()] || 'medium';

      // Hit Points
      const hitPoints = toNumber(getNestedValue(system, ['attributes', 'hp', 'max'])) ?? 0;

      // Armor Class
      const armorClass = toNumber(getNestedValue(system, ['attributes', 'ac', 'value'])) ?? 10;

      // Spellcasting detection (PF2e uses spellcasting entries)
      const spellcasting = asRecord(getNestedValue(system, ['spellcasting'])) ?? {};
      const hasSpellcasting = Object.keys(spellcasting).length > 0;

      // Alignment
      const alignment =
        toStringValue(getNestedValue(system, ['details', 'alignment', 'value'])) ?? 'N';

      return {
        creature: {
          id: doc._id,
          name: doc.name,
          type: doc.type,
          packName: pack.metadata.id,
          packLabel: pack.metadata.label,
          ...(doc.img ? { img: doc.img } : {}),
          system: 'pf2e',
          systemData: {
            level,
            traits,
            size,
            alignment: alignment.toUpperCase(),
            rarity,
            hasSpellcasting,
            hitPoints,
            armorClass,
          },
        },
        errors: 0,
      };
    } catch (_error) {
      // Fallback with error count
      return {
        creature: {
          id: doc._id,
          name: doc.name,
          type: doc.type,
          packName: pack.metadata.id,
          packLabel: pack.metadata.label,
          ...(doc.img ? { img: doc.img } : {}),
          system: 'pf2e',
          systemData: {
            level: 0,
            traits: [],
            size: 'medium',
            alignment: 'N',
            rarity: 'common',
            hasSpellcasting: false,
            hitPoints: 1,
            armorClass: 10,
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
