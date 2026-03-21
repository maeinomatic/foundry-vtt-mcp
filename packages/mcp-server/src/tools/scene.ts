import { z } from 'zod';
import { FoundryClient } from '../foundry-client.js';
import { Logger } from '../logger.js';

export interface SceneToolsOptions {
  foundryClient: FoundryClient;
  logger: Logger;
}

interface SceneNote {
  id: string;
  text?: string;
  x: number;
  y: number;
}

interface SceneToken {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  actorId?: string;
  disposition: number;
  hidden: boolean;
  img?: string;
}

interface ActiveSceneData {
  id: string;
  name: string;
  active: boolean;
  width: number;
  height: number;
  padding?: number;
  background?: unknown;
  navigation?: boolean;
  walls?: number;
  lights?: number;
  sounds?: number;
  notes?: SceneNote[];
  tokens?: SceneToken[];
}

interface WorldUser {
  id: string;
  name: string;
  active: boolean;
  isGM: boolean;
}

interface WorldInfoData {
  id: string;
  title: string;
  system: string;
  systemVersion?: string;
  foundryVersion?: string;
  users?: WorldUser[];
}

export class SceneTools {
  private foundryClient: FoundryClient;
  private logger: Logger;

  constructor({ foundryClient, logger }: SceneToolsOptions) {
    this.foundryClient = foundryClient;
    this.logger = logger.child({ component: 'SceneTools' });
  }

  /**
   * Tool definitions for scene operations
   */
  getToolDefinitions(): Array<{
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
  }> {
    return [
      {
        name: 'get-current-scene',
        description:
          'Get information about the currently active scene, including tokens and layout',
        inputSchema: {
          type: 'object',
          properties: {
            includeTokens: {
              type: 'boolean',
              description: 'Whether to include detailed token information (default: true)',
              default: true,
            },
            includeHidden: {
              type: 'boolean',
              description: 'Whether to include hidden tokens and elements (default: false)',
              default: false,
            },
          },
        },
      },
      {
        name: 'get-world-info',
        description: 'Get basic information about the Foundry world and system',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ];
  }

  async handleGetCurrentScene(
    args: unknown
  ): Promise<ReturnType<SceneTools['formatSceneResponse']>> {
    const schema = z.object({
      includeTokens: z.boolean().default(true),
      includeHidden: z.boolean().default(false),
    });

    const { includeTokens, includeHidden } = schema.parse(args);

    this.logger.info('Getting current scene information', { includeTokens, includeHidden });

    try {
      const sceneData = (await this.foundryClient.query(
        'foundry-mcp-bridge.getActiveScene'
      )) as ActiveSceneData;

      this.logger.debug('Successfully retrieved scene data', {
        sceneId: sceneData.id,
        sceneName: sceneData.name,
        tokenCount: sceneData.tokens?.length ?? 0,
      });

      return this.formatSceneResponse(sceneData, includeTokens, includeHidden);
    } catch (error) {
      this.logger.error('Failed to get current scene', error);
      throw new Error(
        `Failed to get current scene: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async handleGetWorldInfo(_args: unknown): Promise<ReturnType<SceneTools['formatWorldResponse']>> {
    this.logger.info('Getting world information');

    try {
      const worldData = (await this.foundryClient.query(
        'foundry-mcp-bridge.getWorldInfo'
      )) as WorldInfoData;

      this.logger.debug('Successfully retrieved world data', {
        worldId: worldData.id,
        system: worldData.system,
      });

      return this.formatWorldResponse(worldData);
    } catch (error) {
      this.logger.error('Failed to get world information', error);
      throw new Error(
        `Failed to get world information: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private formatSceneResponse(
    sceneData: ActiveSceneData,
    includeTokens: boolean,
    includeHidden: boolean
  ): {
    id: string;
    name: string;
    active: boolean;
    dimensions: { width: number; height: number; padding?: number };
    hasBackground: boolean;
    navigation: boolean;
    elements: { walls: number; lights: number; sounds: number; notes: number };
    tokens?: Array<{
      id: string;
      name: string;
      position: { x: number; y: number };
      size: { width: number; height: number };
      actorId?: string;
      disposition: string;
      hidden: boolean;
      hasImage: boolean;
    }>;
    tokenSummary?: {
      total: number;
      byDisposition: { friendly: number; neutral: number; hostile: number; unknown: number };
      hasActors: number;
      withoutActors: number;
    };
    notes?: Array<{ id: string; text: string; position: { x: number; y: number } }>;
  } {
    const response: {
      id: string;
      name: string;
      active: boolean;
      dimensions: { width: number; height: number; padding?: number };
      hasBackground: boolean;
      navigation: boolean;
      elements: { walls: number; lights: number; sounds: number; notes: number };
      tokens?: Array<{
        id: string;
        name: string;
        position: { x: number; y: number };
        size: { width: number; height: number };
        actorId?: string;
        disposition: string;
        hidden: boolean;
        hasImage: boolean;
      }>;
      tokenSummary?: {
        total: number;
        byDisposition: { friendly: number; neutral: number; hostile: number; unknown: number };
        hasActors: number;
        withoutActors: number;
      };
      notes?: Array<{ id: string; text: string; position: { x: number; y: number } }>;
    } = {
      id: sceneData.id,
      name: sceneData.name,
      active: sceneData.active,
      dimensions: {
        width: sceneData.width,
        height: sceneData.height,
        padding: sceneData.padding,
      },
      hasBackground: !!sceneData.background,
      navigation: sceneData.navigation ?? false,
      elements: {
        walls: sceneData.walls ?? 0,
        lights: sceneData.lights ?? 0,
        sounds: sceneData.sounds ?? 0,
        notes: sceneData.notes?.length ?? 0,
      },
    };

    if (includeTokens && sceneData.tokens) {
      response.tokens = this.formatTokens(sceneData.tokens, includeHidden);
      response.tokenSummary = this.createTokenSummary(sceneData.tokens, includeHidden);
    }

    if (sceneData.notes && sceneData.notes.length > 0) {
      response.notes = sceneData.notes.map(note => ({
        id: note.id,
        text: this.truncateText(note.text ?? '', 100),
        position: { x: note.x, y: note.y },
      }));
    }

    return response;
  }

  private formatTokens(
    tokens: SceneToken[],
    includeHidden: boolean
  ): Array<{
    id: string;
    name: string;
    position: { x: number; y: number };
    size: { width: number; height: number };
    actorId?: string;
    disposition: string;
    hidden: boolean;
    hasImage: boolean;
  }> {
    return tokens
      .filter(token => includeHidden || !token.hidden)
      .map(token => ({
        id: token.id,
        name: token.name,
        position: {
          x: token.x,
          y: token.y,
        },
        size: {
          width: token.width,
          height: token.height,
        },
        actorId: token.actorId,
        disposition: this.getDispositionName(token.disposition),
        hidden: token.hidden,
        hasImage: !!token.img,
      }));
  }

  private createTokenSummary(
    tokens: SceneToken[],
    includeHidden: boolean
  ): {
    total: number;
    byDisposition: { friendly: number; neutral: number; hostile: number; unknown: number };
    hasActors: number;
    withoutActors: number;
  } {
    const visibleTokens = includeHidden ? tokens : tokens.filter(t => !t.hidden);

    const summary = {
      total: visibleTokens.length,
      byDisposition: {
        friendly: 0,
        neutral: 0,
        hostile: 0,
        unknown: 0,
      },
      hasActors: 0,
      withoutActors: 0,
    };

    visibleTokens.forEach(token => {
      // Count by disposition
      const disposition = this.getDispositionName(token.disposition);
      if (disposition in summary.byDisposition) {
        summary.byDisposition[disposition as keyof typeof summary.byDisposition]++;
      } else {
        summary.byDisposition.unknown++;
      }

      // Count actor association
      if (token.actorId) {
        summary.hasActors++;
      } else {
        summary.withoutActors++;
      }
    });

    return summary;
  }

  private formatWorldResponse(worldData: WorldInfoData): Record<string, unknown> {
    return {
      id: worldData.id,
      title: worldData.title,
      system: {
        id: worldData.system,
        version: worldData.systemVersion,
      },
      foundry: {
        version: worldData.foundryVersion,
      },
      users: {
        total: worldData.users?.length ?? 0,
        active: worldData.users?.filter(u => u.active).length ?? 0,
        gms: worldData.users?.filter(u => u.isGM).length ?? 0,
        players: worldData.users?.filter(u => !u.isGM).length ?? 0,
      },
      activeUsers:
        worldData.users
          ?.filter(u => u.active)
          .map(u => ({
            id: u.id,
            name: u.name,
            isGM: u.isGM,
          })) ?? [],
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

  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;
    }
    return `${text.substring(0, maxLength - 3)}...`;
  }
}
