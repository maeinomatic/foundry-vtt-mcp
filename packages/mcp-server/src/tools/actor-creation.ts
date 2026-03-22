import { z } from 'zod';
import { FoundryClient } from '../foundry-client.js';
import type {
  FoundryActorCreationResult,
  FoundryCompendiumEntryFull,
  FoundryDocumentBase,
  UnknownRecord,
} from '../foundry-types.js';
import { Logger } from '../logger.js';
import { ErrorHandler } from '../utils/error-handler.js';

export interface ActorCreationToolsOptions {
  foundryClient: FoundryClient;
  logger: Logger;
}

type NamedEntity = Pick<FoundryDocumentBase, 'name'>;

export class ActorCreationTools {
  private foundryClient: FoundryClient;
  private logger: Logger;
  private errorHandler: ErrorHandler;

  constructor({ foundryClient, logger }: ActorCreationToolsOptions) {
    this.foundryClient = foundryClient;
    this.logger = logger.child({ component: 'ActorCreationTools' });
    this.errorHandler = new ErrorHandler(this.logger);
  }

  /**
   * Tool definitions for actor creation operations
   */
  getToolDefinitions(): UnknownRecord[] {
    return [
      {
        name: 'create-actor-from-compendium',
        description:
          'Create one or more actors from a specific compendium entry with custom names. Use search-compendium first to find the exact creature you want, then use this tool with the packId and itemId from the search results.',
        inputSchema: {
          type: 'object',
          properties: {
            packId: {
              type: 'string',
              description:
                'ID of the compendium pack containing the creature (e.g., "dnd5e.monsters")',
            },
            itemId: {
              type: 'string',
              description:
                'ID of the specific creature entry within the pack (get this from search-compendium results)',
            },
            names: {
              type: 'array',
              items: { type: 'string' },
              description:
                'Custom names for the created actors (e.g., ["Flameheart", "Sneak", "Peek"])',
              minItems: 1,
            },
            quantity: {
              type: 'number',
              description: 'Number of actors to create (default: based on names array length)',
              minimum: 1,
              maximum: 10,
            },
            addToScene: {
              type: 'boolean',
              description: 'Whether to add created actors to the current scene as tokens',
              default: false,
            },
            placement: {
              type: 'object',
              description: 'Token placement options (only used when addToScene is true)',
              properties: {
                type: {
                  type: 'string',
                  enum: ['random', 'grid', 'center', 'coordinates'],
                  description: 'Placement strategy',
                  default: 'grid',
                },
                coordinates: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      x: { type: 'number', description: 'X coordinate in pixels' },
                      y: { type: 'number', description: 'Y coordinate in pixels' },
                    },
                    required: ['x', 'y'],
                  },
                  description:
                    'Specific coordinates for each token (required when type is "coordinates")',
                },
              },
              required: ['type'],
            },
          },
          required: ['packId', 'itemId', 'names'],
        },
      },
      {
        name: 'get-compendium-entry-full',
        description:
          'Retrieve complete stat block data including items, spells, and abilities for actor creation',
        inputSchema: {
          type: 'object',
          properties: {
            packId: {
              type: 'string',
              description: 'Compendium pack identifier',
            },
            entryId: {
              type: 'string',
              description: 'Entry identifier within the pack',
            },
          },
          required: ['packId', 'entryId'],
        },
      },
    ];
  }

  /**
   * Handle actor creation from specific compendium entry
   */
  async handleCreateActorFromCompendium(args: unknown): Promise<UnknownRecord> {
    const schema = z.object({
      packId: z.string().min(1, 'Pack ID cannot be empty'),
      itemId: z.string().min(1, 'Item ID cannot be empty'),
      names: z.array(z.string().min(1)).min(1, 'At least one name is required'),
      quantity: z.number().min(1).max(10).optional(),
      addToScene: z.boolean().default(false),
      placement: z
        .object({
          type: z.enum(['random', 'grid', 'center', 'coordinates']).default('grid'),
          coordinates: z
            .array(
              z.object({
                x: z.number(),
                y: z.number(),
              })
            )
            .optional(),
        })
        .optional(),
    });

    const { packId, itemId, names, quantity, addToScene, placement } = schema.parse(args);
    const finalQuantity = quantity ?? names.length;

    this.logger.info('Creating actors from specific compendium entry', {
      packId,
      itemId,
      names,
      quantity: finalQuantity,
      addToScene,
    });

    try {
      // Ensure we have enough names for the quantity
      const customNames = [...names];
      while (customNames.length < finalQuantity) {
        const baseName = names[0] ?? 'Unnamed';
        customNames.push(`${baseName} ${customNames.length + 1}`);
      }

      // Create the actors via Foundry module using exact pack/item IDs
      const result = await this.foundryClient.query<FoundryActorCreationResult>(
        'foundry-mcp-bridge.createActorFromCompendium',
        {
          packId,
          itemId,
          customNames: customNames.slice(0, finalQuantity),
          quantity: finalQuantity,
          addToScene,
          placement: placement
            ? {
                type: placement.type,
                coordinates: placement.coordinates,
              }
            : undefined,
        }
      );

      this.logger.info('Actor creation completed', {
        totalCreated: result.totalCreated ?? 0,
        totalRequested: result.totalRequested ?? 0,
        tokensPlaced: result.tokensPlaced ?? 0,
        hasErrors: Boolean(result.errors?.length),
      });

      // Format response for Claude
      return this.formatSimpleActorCreationResponse(
        result,
        packId,
        itemId,
        customNames.slice(0, finalQuantity)
      );
    } catch (error) {
      return this.errorHandler.handleToolError(
        error,
        'create-actor-from-compendium',
        'actor creation'
      );
    }
  }

  /**
   * Handle getting full compendium entry data
   */
  async handleGetCompendiumEntryFull(args: unknown): Promise<UnknownRecord> {
    const schema = z.object({
      packId: z.string().min(1, 'Pack ID cannot be empty'),
      entryId: z.string().min(1, 'Entry ID cannot be empty'),
    });

    const { packId, entryId } = schema.parse(args);

    this.logger.info('Getting full compendium entry', { packId, entryId });

    try {
      const fullEntry = await this.foundryClient.query<FoundryCompendiumEntryFull>(
        'foundry-mcp-bridge.getCompendiumDocumentFull',
        {
          packId,
          documentId: entryId,
        }
      );

      this.logger.debug('Successfully retrieved full compendium entry', {
        packId,
        entryId,
        name: fullEntry.name ?? 'Unknown',
        hasItems: Boolean(fullEntry.items?.length),
        hasEffects: Boolean(fullEntry.effects?.length),
      });

      return this.formatCompendiumEntryResponse(fullEntry);
    } catch (error) {
      return this.errorHandler.handleToolError(
        error,
        'get-compendium-entry-full',
        'compendium retrieval'
      );
    }
  }

  /**
   * Format compendium entry response
   */
  private formatCompendiumEntryResponse(entry: FoundryCompendiumEntryFull): UnknownRecord {
    const items = entry.items ?? [];
    const effects = entry.effects ?? [];

    const itemsInfo =
      items.length > 0
        ? `\n📦 Items: ${items.map((item: NamedEntity) => item.name ?? 'Unknown').join(', ')}`
        : '';

    const effectsInfo =
      effects.length > 0
        ? `\n✨ Effects: ${effects.map((effect: NamedEntity) => effect.name ?? 'Unknown').join(', ')}`
        : '';

    return {
      name: entry.name ?? 'Unknown',
      type: entry.type ?? 'unknown',
      pack: entry.packLabel ?? 'unknown',
      system: entry.system,
      fullData: entry.fullData,
      items,
      effects,
      summary: `📊 **${entry.name ?? 'Unknown'}** (${entry.type ?? 'unknown'} from ${entry.packLabel ?? 'unknown'})${itemsInfo}${effectsInfo}`,
    };
  }

  /**
   * Format simplified actor creation response
   */
  private formatSimpleActorCreationResponse(
    result: FoundryActorCreationResult,
    packId: string,
    itemId: string,
    customNames: string[]
  ): UnknownRecord {
    const totalCreated = result.totalCreated ?? 0;
    const totalRequested = result.totalRequested ?? customNames.length;
    const actors = result.actors ?? [];
    const tokensPlaced = result.tokensPlaced ?? 0;
    const errors = result.errors ?? [];

    const summary = `✅ Created ${totalCreated} of ${totalRequested} requested actors`;

    const details = actors
      .map(actor => `• **${actor.name ?? 'Unnamed'}** (from ${packId})`)
      .join('\n');

    const sceneInfo =
      tokensPlaced > 0 ? `\n🎯 Added ${tokensPlaced} tokens to the current scene` : '';

    const errorInfo = errors.length > 0 ? `\n⚠️ Issues: ${errors.join(', ')}` : '';

    return {
      summary,
      success: result.success ?? errors.length === 0,
      details: {
        actors,
        sourceEntry: {
          packId,
          itemId,
        },
        tokensPlaced,
        errors,
      },
      message: `${summary}\n\n${details}${sceneInfo}${errorInfo}`,
    };
  }
}
