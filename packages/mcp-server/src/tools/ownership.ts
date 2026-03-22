import { z } from 'zod';
import { FoundryClient } from '../foundry-client.js';
import { Logger } from '../logger.js';

export interface OwnershipToolsOptions {
  foundryClient: FoundryClient;
  logger: Logger;
}

// Foundry ownership permission levels
const OwnershipLevels = {
  NONE: 0,
  LIMITED: 1,
  OBSERVER: 2,
  OWNER: 3,
} as const;

const ownershipLevelSchema = z.enum(['NONE', 'LIMITED', 'OBSERVER', 'OWNER']);

const assignOwnershipSchema = z.object({
  actorIdentifier: z.string().min(1),
  playerIdentifier: z.string().min(1),
  permissionLevel: ownershipLevelSchema,
  confirmBulkOperation: z.boolean().optional().default(false),
});

const removeOwnershipSchema = z.object({
  actorIdentifier: z.string().min(1),
  playerIdentifier: z.string().min(1),
  confirmRemoval: z.boolean().optional().default(false),
});

const listOwnershipSchema = z.object({
  actorIdentifier: z.string().optional(),
  playerIdentifier: z.string().optional(),
});

interface ResolvedEntity {
  id: string;
  name: string;
}

interface OwnershipChangeResult {
  actor: string;
  player: string;
  permission: z.infer<typeof ownershipLevelSchema>;
  success: boolean;
  message?: string;
  error?: string;
}

interface OwnershipUpdateResponse {
  success?: boolean;
  message?: string;
  error?: string;
}

export class OwnershipTools {
  private foundryClient: FoundryClient;
  private logger: Logger;

  constructor({ foundryClient, logger }: OwnershipToolsOptions) {
    this.foundryClient = foundryClient;
    this.logger = logger.child({ component: 'OwnershipTools' });
  }

  /**
   * Get tool definitions for ownership management
   */
  getToolDefinitions(): Array<Record<string, unknown>> {
    return [
      {
        name: 'assign-actor-ownership',
        description:
          'Assign ownership permissions for actors to players. Supports individual assignments like "Assign Aragorn to John as owner" and bulk operations like "Give party observer access to all friendly NPCs".',
        inputSchema: {
          type: 'object',
          properties: {
            actorIdentifier: {
              type: 'string',
              description:
                'Actor name, ID, or "all friendly NPCs" for bulk operations. Use "party characters" for all player-owned actors.',
            },
            playerIdentifier: {
              type: 'string',
              description:
                'Player name, character name, or "party" for all connected players. Supports partial matching.',
            },
            permissionLevel: {
              type: 'string',
              enum: ['NONE', 'LIMITED', 'OBSERVER', 'OWNER'],
              description:
                'Permission level to assign: NONE (no access), LIMITED (basic view), OBSERVER (full view, no control), OWNER (full control)',
            },
            confirmBulkOperation: {
              type: 'boolean',
              description:
                'Required confirmation for bulk operations affecting multiple actors/players',
              default: false,
            },
          },
          required: ['actorIdentifier', 'playerIdentifier', 'permissionLevel'],
        },
      },
      {
        name: 'remove-actor-ownership',
        description:
          'Remove ownership permissions (set to NONE) for specific actors and players. Equivalent to "Remove ownership of Aragorn from John".',
        inputSchema: {
          type: 'object',
          properties: {
            actorIdentifier: {
              type: 'string',
              description: 'Actor name or ID to remove ownership from',
            },
            playerIdentifier: {
              type: 'string',
              description:
                'Player name or character name to remove ownership for. Supports partial matching.',
            },
            confirmRemoval: {
              type: 'boolean',
              description: 'Confirmation required for ownership removal',
              default: false,
            },
          },
          required: ['actorIdentifier', 'playerIdentifier'],
        },
      },
      {
        name: 'list-actor-ownership',
        description:
          'List current ownership permissions for actors, showing which players have what access levels.',
        inputSchema: {
          type: 'object',
          properties: {
            actorIdentifier: {
              type: 'string',
              description: 'Optional: specific actor name/ID to check, or "all" for all actors',
            },
            playerIdentifier: {
              type: 'string',
              description: 'Optional: specific player name to check ownership for',
            },
          },
        },
      },
    ];
  }

  /**
   * Handle tool execution
   */
  async handleToolCall(name: string, args: unknown): Promise<unknown> {
    try {
      switch (name) {
        case 'assign-actor-ownership':
          return await this.assignActorOwnership(args);
        case 'remove-actor-ownership':
          return await this.removeActorOwnership(args);
        case 'list-actor-ownership':
          return await this.listActorOwnership(args);
        default:
          throw new Error(`Unknown ownership tool: ${name}`);
      }
    } catch (error) {
      this.logger.error(`Error in ownership tool ${name}:`, error);
      throw error;
    }
  }

  /**
   * Assign actor ownership permissions
   */
  private async assignActorOwnership(args: unknown): Promise<unknown> {
    const parsed = assignOwnershipSchema.parse(args);
    const {
      actorIdentifier,
      playerIdentifier,
      permissionLevel,
      confirmBulkOperation = false,
    } = parsed;

    this.logger.info(
      `Assigning ${permissionLevel} ownership of "${actorIdentifier}" to "${playerIdentifier}"`
    );

    // Validate permission level
    const validatedLevel = permissionLevel;
    const numericLevel = OwnershipLevels[validatedLevel];

    // Resolve actors and players
    const actors = await this.resolveActors(actorIdentifier);
    const players = await this.resolvePlayers(playerIdentifier);

    // Check for bulk operations
    const isBulkOperation = actors.length > 1 || players.length > 1;
    if (isBulkOperation && !confirmBulkOperation) {
      return {
        success: false,
        error: `Bulk operation detected: ${actors.length} actors × ${players.length} players = ${actors.length * players.length} ownership changes. Please set confirmBulkOperation to true to proceed.`,
        actorsFound: actors.length,
        playersFound: players.length,
        totalChanges: actors.length * players.length,
      };
    }

    // Apply ownership changes
    const results: OwnershipChangeResult[] = [];
    for (const actor of actors) {
      for (const player of players) {
        try {
          const result = await this.foundryClient.query<OwnershipUpdateResponse>(
            'foundry-mcp-bridge.setActorOwnership',
            {
              actorId: actor.id,
              userId: player.id,
              permission: numericLevel,
            }
          );

          results.push({
            actor: actor.name,
            player: player.name,
            permission: validatedLevel,
            success: Boolean(result.success),
            ...(typeof result.message === 'string' ? { message: result.message } : {}),
            ...(typeof result.error === 'string' ? { error: result.error } : {}),
          });
        } catch (error) {
          results.push({
            actor: actor.name,
            player: player.name,
            permission: validatedLevel,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.length - successCount;

    return {
      success: successCount > 0,
      message: `${successCount} ownership assignments completed${failureCount > 0 ? `, ${failureCount} failed` : ''}`,
      results,
    };
  }

  /**
   * Remove actor ownership (set to NONE)
   */
  private async removeActorOwnership(args: unknown): Promise<unknown> {
    const { actorIdentifier, playerIdentifier, confirmRemoval } = removeOwnershipSchema.parse(args);

    if (!confirmRemoval) {
      return {
        success: false,
        error: 'Please set confirmRemoval to true to confirm ownership removal',
      };
    }

    // Use assign with NONE permission level
    return this.assignActorOwnership({
      actorIdentifier,
      playerIdentifier,
      permissionLevel: 'NONE',
      confirmBulkOperation: true, // Auto-confirm since user already confirmed removal
    });
  }

  /**
   * List actor ownership permissions
   */
  private async listActorOwnership(args: unknown): Promise<unknown> {
    const { actorIdentifier, playerIdentifier } = listOwnershipSchema.parse(args);

    this.logger.info(
      `Listing actor ownership for actor: "${actorIdentifier ?? 'all'}", player: "${playerIdentifier ?? 'all'}"`
    );

    try {
      const ownershipData = await this.foundryClient.query<unknown>(
        'foundry-mcp-bridge.getActorOwnership',
        {
          actorIdentifier,
          playerIdentifier,
        }
      );

      return {
        success: true,
        ownership: ownershipData,
      };
    } catch (error) {
      this.logger.error('Failed to list actor ownership:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Resolve actors from identifier (supports bulk operations)
   */
  private async resolveActors(identifier: string): Promise<ResolvedEntity[]> {
    this.logger.debug(`Resolving actors for identifier: ${identifier}`);

    try {
      if (identifier.toLowerCase().includes('all friendly npcs')) {
        // Get all tokens in current scene with friendly disposition
        const actors = await this.foundryClient.query<unknown[]>(
          'foundry-mcp-bridge.getFriendlyNPCs',
          {}
        );
        const resolved = this.toResolvedEntities(actors);
        this.logger.debug(`Found ${resolved.length} friendly NPCs`);
        return resolved;
      } else if (identifier.toLowerCase().includes('party characters')) {
        // Get all player-owned characters
        const actors = await this.foundryClient.query<unknown[]>(
          'foundry-mcp-bridge.getPartyCharacters',
          {}
        );
        const resolved = this.toResolvedEntities(actors);
        this.logger.debug(`Found ${resolved.length} party characters`);
        return resolved;
      } else {
        // Single actor lookup
        this.logger.debug(`Looking for single actor: ${identifier}`);
        const actor = await this.foundryClient.query<unknown>('foundry-mcp-bridge.findActor', {
          identifier,
        });
        this.logger.debug(`Single actor lookup result:`, actor);
        const resolved = this.toResolvedEntities(actor ? [actor] : []);
        return resolved;
      }
    } catch (error) {
      this.logger.error(`Failed to resolve actors for "${identifier}":`, error);
      return [];
    }
  }

  /**
   * Resolve players from identifier (supports partial matching)
   */
  private async resolvePlayers(identifier: string): Promise<ResolvedEntity[]> {
    this.logger.debug(`Resolving players for identifier: ${identifier}`);

    try {
      if (identifier.toLowerCase() === 'party') {
        // Get all connected players (excluding GM)
        const players = await this.foundryClient.query<unknown[]>(
          'foundry-mcp-bridge.getConnectedPlayers',
          {}
        );
        const resolved = this.toResolvedEntities(players);
        this.logger.debug(`Found ${resolved.length} connected players`);
        return resolved;
      } else {
        // Single player lookup with partial matching
        this.logger.debug(`Looking for single player: ${identifier}`);
        const players = await this.foundryClient.query<unknown[]>(
          'foundry-mcp-bridge.findPlayers',
          {
            identifier,
            allowPartialMatch: true,
            includeCharacterOwners: true, // Also match by character names they own
          }
        );
        this.logger.debug(`Player lookup result:`, players);
        return this.toResolvedEntities(players);
      }
    } catch (error) {
      this.logger.error(`Failed to resolve players for "${identifier}":`, error);
      return [];
    }
  }

  private toResolvedEntities(value: unknown): ResolvedEntity[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .filter(
        (entry): entry is Record<string, unknown> => entry !== null && typeof entry === 'object'
      )
      .map(entry => ({
        id: typeof entry.id === 'string' ? entry.id : '',
        name: typeof entry.name === 'string' ? entry.name : '',
      }))
      .filter(entry => entry.id.length > 0 && entry.name.length > 0);
  }
}
