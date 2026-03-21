import { z } from 'zod';
import { FoundryClient } from '../foundry-client.js';
import { Logger } from '../logger.js';

export interface TokenManipulationToolsOptions {
  foundryClient: FoundryClient;
  logger: Logger;
}

type UnknownRecord = Record<string, unknown>;

interface DeleteTokensResult {
  success?: boolean;
  deletedCount?: number;
  tokenIds?: string[];
  errors?: string[];
}

interface ToggleConditionResult {
  isActive?: boolean;
  conditionName?: string;
}

interface AvailableConditionsResult {
  conditions?: unknown[];
  gameSystem?: string;
}

export class TokenManipulationTools {
  private foundryClient: FoundryClient;
  private logger: Logger;

  constructor({ foundryClient, logger }: TokenManipulationToolsOptions) {
    this.foundryClient = foundryClient;
    this.logger = logger.child({ component: 'TokenManipulationTools' });
  }

  /**
   * Tool definitions for token manipulation operations
   */
  getToolDefinitions(): Array<Record<string, unknown>> {
    return [
      {
        name: 'move-token',
        description:
          'Move a token to a new position on the current scene. Can optionally animate the movement.',
        inputSchema: {
          type: 'object',
          properties: {
            tokenId: {
              type: 'string',
              description: 'The ID of the token to move',
            },
            x: {
              type: 'number',
              description: 'The new X coordinate (in pixels)',
            },
            y: {
              type: 'number',
              description: 'The new Y coordinate (in pixels)',
            },
            animate: {
              type: 'boolean',
              description: 'Whether to animate the movement (default: false)',
              default: false,
            },
          },
          required: ['tokenId', 'x', 'y'],
        },
      },
      {
        name: 'update-token',
        description:
          'Update various properties of a token such as visibility, disposition, size, rotation, elevation, or name',
        inputSchema: {
          type: 'object',
          properties: {
            tokenId: {
              type: 'string',
              description: 'The ID of the token to update',
            },
            updates: {
              type: 'object',
              description: 'Object containing the properties to update',
              properties: {
                x: {
                  type: 'number',
                  description: 'New X coordinate',
                },
                y: {
                  type: 'number',
                  description: 'New Y coordinate',
                },
                width: {
                  type: 'number',
                  description: 'New width in grid units',
                },
                height: {
                  type: 'number',
                  description: 'New height in grid units',
                },
                rotation: {
                  type: 'number',
                  description: 'New rotation in degrees (0-360)',
                },
                hidden: {
                  type: 'boolean',
                  description: 'Whether the token is hidden from players',
                },
                disposition: {
                  type: 'number',
                  description: 'Token disposition: -1 (hostile), 0 (neutral), 1 (friendly)',
                  enum: [-1, 0, 1],
                },
                name: {
                  type: 'string',
                  description: 'New display name for the token',
                },
                elevation: {
                  type: 'number',
                  description: 'Elevation in distance units',
                },
                lockRotation: {
                  type: 'boolean',
                  description: 'Whether to lock the rotation',
                },
              },
            },
          },
          required: ['tokenId', 'updates'],
        },
      },
      {
        name: 'delete-tokens',
        description: 'Delete one or more tokens from the current scene',
        inputSchema: {
          type: 'object',
          properties: {
            tokenIds: {
              type: 'array',
              description: 'Array of token IDs to delete',
              items: {
                type: 'string',
              },
              minItems: 1,
            },
          },
          required: ['tokenIds'],
        },
      },
      {
        name: 'get-token-details',
        description:
          'Get detailed information about a specific token including all properties and linked actor data',
        inputSchema: {
          type: 'object',
          properties: {
            tokenId: {
              type: 'string',
              description: 'The ID of the token to get details for',
            },
          },
          required: ['tokenId'],
        },
      },
      {
        name: 'toggle-token-condition',
        description:
          'Toggle a status effect/condition on or off for a token. Use this to apply or remove conditions like Prone, Poisoned, Blinded, etc.',
        inputSchema: {
          type: 'object',
          properties: {
            tokenId: {
              type: 'string',
              description: 'The ID of the token to modify',
            },
            conditionId: {
              type: 'string',
              description:
                'The ID of the condition/status effect to toggle (e.g., "prone", "poisoned", "blinded")',
            },
            active: {
              type: 'boolean',
              description:
                'Optional: true to add the condition, false to remove it. If not specified, will toggle the current state.',
            },
          },
          required: ['tokenId', 'conditionId'],
        },
      },
      {
        name: 'get-available-conditions',
        description:
          'Get a list of all available status effects/conditions that can be applied to tokens in the current game system',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ];
  }

  async handleMoveToken(args: unknown): Promise<unknown> {
    const schema = z.object({
      tokenId: z.string(),
      x: z.number(),
      y: z.number(),
      animate: z.boolean().optional().default(false),
    });

    const { tokenId, x, y, animate } = schema.parse(args);

    this.logger.info('Moving token', { tokenId, x, y, animate });

    try {
      await this.foundryClient.query('foundry-mcp-bridge.move-token', {
        tokenId,
        x,
        y,
        animate,
      });

      this.logger.debug('Token moved successfully', { tokenId });

      return {
        success: true,
        tokenId,
        newPosition: { x, y },
        animated: animate,
      };
    } catch (error) {
      this.logger.error('Failed to move token', error);
      throw new Error(
        `Failed to move token: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async handleUpdateToken(args: unknown): Promise<unknown> {
    const schema = z.object({
      tokenId: z.string(),
      updates: z.object({
        x: z.number().optional(),
        y: z.number().optional(),
        width: z.number().positive().optional(),
        height: z.number().positive().optional(),
        rotation: z.number().min(0).max(360).optional(),
        hidden: z.boolean().optional(),
        disposition: z.union([z.literal(-1), z.literal(0), z.literal(1)]).optional(),
        name: z.string().optional(),
        elevation: z.number().optional(),
        lockRotation: z.boolean().optional(),
      }),
    });

    const { tokenId, updates } = schema.parse(args);

    this.logger.info('Updating token', { tokenId, updates });

    try {
      const result = await this.foundryClient.query('foundry-mcp-bridge.update-token', {
        tokenId,
        updates,
      });

      this.logger.debug('Token updated successfully', { tokenId, result });

      return {
        success: true,
        tokenId,
        updated: true,
        appliedUpdates: updates,
      };
    } catch (error) {
      this.logger.error('Failed to update token', error);
      throw new Error(
        `Failed to update token: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async handleDeleteTokens(args: unknown): Promise<unknown> {
    const schema = z.object({
      tokenIds: z.array(z.string()).min(1),
    });

    const { tokenIds } = schema.parse(args);

    this.logger.info('Deleting tokens', { count: tokenIds.length, tokenIds });

    try {
      const result = (await this.foundryClient.query('foundry-mcp-bridge.delete-tokens', {
        tokenIds,
      })) as DeleteTokensResult;

      this.logger.debug('Tokens deleted successfully', {
        deleted: result.deletedCount,
        requested: tokenIds.length,
      });

      return {
        success: result.success,
        deletedCount: result.deletedCount,
        tokenIds: result.tokenIds,
        errors: result.errors,
      };
    } catch (error) {
      this.logger.error('Failed to delete tokens', error);
      throw new Error(
        `Failed to delete tokens: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async handleGetTokenDetails(args: unknown): Promise<unknown> {
    const schema = z.object({
      tokenId: z.string(),
    });

    const { tokenId } = schema.parse(args);

    this.logger.info('Getting token details', { tokenId });

    try {
      const tokenData = (await this.foundryClient.query('foundry-mcp-bridge.get-token-details', {
        tokenId,
      })) as UnknownRecord;

      const actorData = this.asRecord(tokenData.actorData);

      this.logger.debug('Retrieved token details', {
        tokenId,
        hasActorData: Object.keys(actorData).length > 0,
      });

      return this.formatTokenDetails(tokenData);
    } catch (error) {
      this.logger.error('Failed to get token details', error);
      throw new Error(
        `Failed to get token details: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private formatTokenDetails(tokenData: UnknownRecord): Record<string, unknown> {
    const actorData = this.asRecord(tokenData.actorData);
    const hasActorData = Object.keys(actorData).length > 0;

    return {
      id: this.getString(tokenData.id),
      name: this.getString(tokenData.name),
      position: {
        x: this.getNumber(tokenData.x),
        y: this.getNumber(tokenData.y),
      },
      size: {
        width: this.getNumber(tokenData.width),
        height: this.getNumber(tokenData.height),
      },
      appearance: {
        rotation: this.getNumber(tokenData.rotation),
        scale: tokenData.scale,
        alpha: this.getNumber(tokenData.alpha),
        hidden: this.getBoolean(tokenData.hidden),
        img: this.getString(tokenData.img),
      },
      behavior: {
        disposition: this.getDispositionName(this.getNumber(tokenData.disposition)),
        elevation: this.getNumber(tokenData.elevation),
        lockRotation: this.getBoolean(tokenData.lockRotation),
      },
      actor: hasActorData
        ? {
            id: this.getString(tokenData.actorId),
            name: this.getString(actorData.name),
            type: this.getString(actorData.type),
            img: this.getString(actorData.img),
            isLinked: this.getBoolean(tokenData.actorLink),
          }
        : null,
    };
  }

  private getDispositionName(disposition: number): string {
    switch (disposition) {
      case -1:
        return 'hostile';
      case 0:
        return 'neutral';
      case 1:
        return 'friendly';
      default:
        return 'unknown';
    }
  }

  async handleToggleTokenCondition(args: unknown): Promise<unknown> {
    const schema = z.object({
      tokenId: z.string(),
      conditionId: z.string(),
      active: z.boolean().optional(),
    });

    const { tokenId, conditionId, active } = schema.parse(args);

    this.logger.info('Toggling token condition', { tokenId, conditionId, active });

    try {
      const result = (await this.foundryClient.query('foundry-mcp-bridge.toggle-token-condition', {
        tokenId,
        conditionId,
        active,
      })) as ToggleConditionResult;

      this.logger.debug('Token condition toggled successfully', { tokenId, conditionId, result });

      return {
        success: true,
        tokenId,
        conditionId,
        isActive: result.isActive ?? false,
        conditionName: result.conditionName ?? conditionId,
      };
    } catch (error) {
      this.logger.error('Failed to toggle token condition', error);
      throw new Error(
        `Failed to toggle token condition: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async handleGetAvailableConditions(_args: unknown): Promise<unknown> {
    this.logger.info('Getting available conditions');

    try {
      const result = (await this.foundryClient.query(
        'foundry-mcp-bridge.get-available-conditions',
        {}
      )) as AvailableConditionsResult;

      this.logger.debug('Retrieved available conditions', {
        count: result.conditions?.length ?? 0,
      });

      return {
        success: true,
        conditions: result.conditions ?? [],
        gameSystem: result.gameSystem ?? 'unknown',
      };
    } catch (error) {
      this.logger.error('Failed to get available conditions', error);
      throw new Error(
        `Failed to get available conditions: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private asRecord(value: unknown): UnknownRecord {
    return value !== null && typeof value === 'object' ? (value as UnknownRecord) : {};
  }

  private getString(value: unknown): string {
    return typeof value === 'string' ? value : '';
  }

  private getNumber(value: unknown): number {
    return typeof value === 'number' ? value : 0;
  }

  private getBoolean(value: unknown): boolean {
    return typeof value === 'boolean' ? value : false;
  }
}
