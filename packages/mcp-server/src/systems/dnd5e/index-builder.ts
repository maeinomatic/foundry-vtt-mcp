/**
 * D&D 5e Index Builder
 *
 * Builds enhanced creature index from Foundry compendiums.
 * This code runs in Foundry's browser context, not Node.js.
 *
 * Extracted from data-access.ts for modular system support.
 */

import type { IndexBuilder, DnD5eCreatureIndex } from '../types.js';

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

/**
 * D&D 5e implementation of IndexBuilder
 */
export class DnD5eIndexBuilder implements IndexBuilder {
  private moduleId: string;

  constructor(moduleId: string = 'maeinomatic-foundry-mcp') {
    this.moduleId = moduleId;
  }

  getSystemId(): 'dnd5e' {
    return 'dnd5e' as const;
  }

  /**
   * Build enhanced creature index from compendium packs
   */
  async buildIndex(packs: FoundryPack[], _force = false): Promise<DnD5eCreatureIndex[]> {
    const startTime = Date.now();
    let progressNotification: unknown = null;
    let totalErrors = 0;

    try {
      const actorPacks = packs.filter(pack => pack.metadata.type === 'Actor');
      const enhancedCreatures: DnD5eCreatureIndex[] = [];

      // Show initial progress notification
      if (ui?.notifications) {
        progressNotification =
          ui.notifications.info(
            `Starting enhanced creature index build from ${actorPacks.length} packs...`
          ) ?? null;
      }

      for (let i = 0; i < actorPacks.length; i++) {
        const pack = actorPacks[i];
        const progressPercent = Math.round((i / actorPacks.length) * 100);

        // Update progress notification
        if (i % 3 === 0 || pack.metadata.label.toLowerCase().includes('monster')) {
          this.clearNotification(progressNotification);
          if (ui?.notifications) {
            progressNotification =
              ui.notifications.info(
                `Building creature index... ${progressPercent}% (${i + 1}/${actorPacks.length}) Processing: ${pack.metadata.label}`
              ) ?? null;
          }
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

          // Show milestone notifications
          if (i === 0 || (i + 1) % 5 === 0 || i === actorPacks.length - 1) {
            const totalCreaturesSoFar = enhancedCreatures.length;
            this.clearNotification(progressNotification);
            if (ui?.notifications) {
              progressNotification =
                ui.notifications.info(
                  `Index Progress: ${i + 1}/${actorPacks.length} packs complete, ${totalCreaturesSoFar} creatures indexed`
                ) ?? null;
            }
          }
        } catch (error) {
          if (ui?.notifications) {
            const message =
              error instanceof Error ? error.message : 'Unknown pack processing failure';
            ui.notifications.warn(
              `Warning: Failed to index pack "${pack.metadata.label}" - continuing with other packs`
            );
            ui.notifications.warn(`Reason: ${message}`);
          }
        }
      }

      // Clear progress notification
      this.clearNotification(progressNotification);

      const buildTimeSeconds = Math.round((Date.now() - startTime) / 1000);
      const errorText = totalErrors > 0 ? ` (${totalErrors} extraction errors)` : '';
      const successMessage = `D&D 5e creature index complete! ${enhancedCreatures.length} creatures indexed from ${actorPacks.length} packs in ${buildTimeSeconds}s${errorText}`;

      if (ui?.notifications) {
        ui.notifications.info(successMessage);
      }

      return enhancedCreatures;
    } catch (error) {
      this.clearNotification(progressNotification);

      const errorMessage = `Failed to build D&D 5e creature index: ${error instanceof Error ? error.message : 'Unknown error'}`;
      if (ui?.notifications) {
        ui.notifications.error(errorMessage);
      }

      throw error;
    }
  }

  /**
   * Extract creature data from a single compendium pack
   */
  async extractDataFromPack(
    pack: FoundryPack
  ): Promise<{ creatures: DnD5eCreatureIndex[]; errors: number }> {
    const creatures: DnD5eCreatureIndex[] = [];
    let errors = 0;

    try {
      // Load all documents from pack
      const documents = await pack.getDocuments();

      for (const doc of documents) {
        try {
          // Only process NPCs and characters
          if (doc.type !== 'npc' && doc.type !== 'character') {
            continue;
          }

          const result = this.extractCreatureData(doc, pack);
          if (result) {
            creatures.push(result.creature);
            errors += result.errors;
          }
        } catch (error) {
          errors++;
        }
      }
    } catch (error) {
      errors++;
    }

    return { creatures, errors };
  }

  /**
   * Extract D&D 5e creature data from a single document
   */
  extractCreatureData(
    doc: FoundryDoc,
    pack: FoundryPack
  ): { creature: DnD5eCreatureIndex; errors: number } | null {
    try {
      const system = this.asRecord(doc.system);

      // Extract challenge rating with comprehensive fallbacks
      let challengeRatingRaw: unknown = this.firstDefined(
        [
          this.getPath(system, ['details', 'cr']),
          this.getPath(system, ['details', 'cr', 'value']),
          this.getPath(system, ['cr', 'value']),
          this.getPath(system, ['cr']),
          this.getPath(system, ['attributes', 'cr', 'value']),
          this.getPath(system, ['attributes', 'cr']),
          this.getPath(system, ['challenge', 'rating']),
          this.getPath(system, ['challenge', 'cr']),
        ],
        0
      );

      // Handle null values
      if (challengeRatingRaw === null || challengeRatingRaw === undefined) {
        challengeRatingRaw = 0;
      }

      // Handle fractional CR strings
      if (typeof challengeRatingRaw === 'string') {
        if (challengeRatingRaw === '1/8') challengeRatingRaw = 0.125;
        else if (challengeRatingRaw === '1/4') challengeRatingRaw = 0.25;
        else if (challengeRatingRaw === '1/2') challengeRatingRaw = 0.5;
        else challengeRatingRaw = Number.parseFloat(challengeRatingRaw) || 0;
      }

      const challengeRating = Number(challengeRatingRaw) || 0;

      // Extract creature type
      let creatureType: string = String(
        this.firstDefined(
          [
            this.getPath(system, ['details', 'type', 'value']),
            this.getPath(system, ['details', 'type']),
            this.getPath(system, ['type', 'value']),
            this.getPath(system, ['type']),
            this.getPath(system, ['race', 'value']),
            this.getPath(system, ['race']),
            this.getPath(system, ['details', 'race']),
          ],
          'unknown'
        )
      );

      if (creatureType === '') {
        creatureType = 'unknown';
      }

      // Extract size
      const size: string = String(
        this.firstDefined(
          [
            this.getPath(system, ['traits', 'size', 'value']),
            this.getPath(system, ['traits', 'size']),
            this.getPath(system, ['size', 'value']),
            this.getPath(system, ['size']),
            this.getPath(system, ['details', 'size']),
          ],
          'medium'
        )
      );

      // Extract hit points
      const hitPoints =
        Number(
          this.firstDefined(
            [
              this.getPath(system, ['attributes', 'hp', 'max']),
              this.getPath(system, ['hp', 'max']),
              this.getPath(system, ['attributes', 'hp', 'value']),
              this.getPath(system, ['hp', 'value']),
              this.getPath(system, ['health', 'max']),
              this.getPath(system, ['health', 'value']),
            ],
            0
          )
        ) || 0;

      // Extract armor class
      const armorClass =
        Number(
          this.firstDefined(
            [
              this.getPath(system, ['attributes', 'ac', 'value']),
              this.getPath(system, ['ac', 'value']),
              this.getPath(system, ['attributes', 'ac']),
              this.getPath(system, ['ac']),
              this.getPath(system, ['armor', 'value']),
              this.getPath(system, ['armor']),
            ],
            10
          )
        ) || 10;

      // Extract alignment
      const alignment: string = String(
        this.firstDefined(
          [
            this.getPath(system, ['details', 'alignment', 'value']),
            this.getPath(system, ['details', 'alignment']),
            this.getPath(system, ['alignment', 'value']),
            this.getPath(system, ['alignment']),
          ],
          'unaligned'
        )
      );

      // Check for spellcasting
      const hasSpellcasting = !!(
        this.getPath(system, ['spells']) ||
        this.getPath(system, ['attributes', 'spellcasting']) ||
        (Number(this.getPath(system, ['details', 'spellLevel'])) || 0) > 0 ||
        (Number(this.getPath(system, ['resources', 'spell', 'max'])) || 0) > 0 ||
        this.getPath(system, ['spellcasting']) ||
        this.getPath(system, ['traits', 'spellcasting']) ||
        this.getPath(system, ['details', 'spellcaster'])
      );

      // Check for legendary actions
      const hasLegendaryActions = !!(
        this.getPath(system, ['resources', 'legact']) ||
        this.getPath(system, ['legendary']) ||
        (Number(this.getPath(system, ['resources', 'legres', 'value'])) || 0) > 0 ||
        this.getPath(system, ['details', 'legendary']) ||
        this.getPath(system, ['traits', 'legendary']) ||
        (Number(this.getPath(system, ['resources', 'legendary', 'max'])) || 0) > 0
      );

      // Extract character level (for PCs)
      const levelRaw = this.firstDefined(
        [
          this.getPath(system, ['details', 'level', 'value']),
          this.getPath(system, ['details', 'level']),
          this.getPath(system, ['level']),
        ],
        undefined
      );
      const parsedLevel = levelRaw === undefined ? undefined : Number(levelRaw);
      const level =
        parsedLevel !== undefined && Number.isFinite(parsedLevel) ? parsedLevel : undefined;

      // Successful extraction
      return {
        creature: {
          id: doc._id,
          name: doc.name,
          type: doc.type,
          packName: pack.metadata.id,
          packLabel: pack.metadata.label,
          img: doc.img ?? '',
          system: 'dnd5e',
          systemData: {
            challengeRating,
            creatureType: creatureType.toLowerCase(),
            size: size.toLowerCase(),
            alignment: alignment.toLowerCase(),
            ...(level !== undefined ? { level } : {}),
            hasSpellcasting,
            hasLegendaryActions,
            hitPoints,
            armorClass,
          },
        },
        errors: 0,
      };
    } catch (error) {
      // Return basic fallback with error count
      return {
        creature: {
          id: doc._id,
          name: doc.name,
          type: doc.type,
          packName: pack.metadata.id,
          packLabel: pack.metadata.label,
          img: doc.img ?? '',
          system: 'dnd5e',
          systemData: {
            challengeRating: 0,
            creatureType: 'unknown',
            size: 'medium',
            hitPoints: 1,
            armorClass: 10,
            hasSpellcasting: false,
            hasLegendaryActions: false,
            alignment: 'unaligned',
          },
        },
        errors: 1,
      };
    }
  }

  private asRecord(value: unknown): UnknownRecord {
    return value !== null && typeof value === 'object' ? (value as UnknownRecord) : {};
  }

  private clearNotification(notification: unknown): void {
    if (!notification) {
      return;
    }

    if (ui?.notifications?.remove) {
      ui.notifications.remove(notification);
      return;
    }

    const withRemove = this.asRecord(notification).remove;
    if (typeof withRemove === 'function') {
      withRemove();
    }
  }

  private getPath(root: unknown, path: string[]): unknown {
    let current: unknown = root;
    for (const key of path) {
      if (current === null || typeof current !== 'object') {
        return undefined;
      }
      current = (current as UnknownRecord)[key];
    }
    return current;
  }

  private firstDefined(values: unknown[], fallback: unknown): unknown {
    for (const value of values) {
      if (value !== undefined && value !== null && value !== '') {
        return value;
      }
    }
    return fallback;
  }
}
