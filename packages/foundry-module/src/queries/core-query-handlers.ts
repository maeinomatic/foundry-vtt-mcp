import { MODULE_ID } from '../constants.js';
import type {
  FoundryCharacterInfo,
  FoundryGetCharacterInfoRequest,
  FoundryWorldDetails,
} from '@maeinomatic/foundry-mcp-shared';

import type { FoundryModuleFacade } from '../foundry-module-facade.js';

export type QueryErrorResult = { error: string; success: false; status?: string };

type ListActorsRequest = {
  type?: string;
};

export interface CoreQueryHandlersOptions {
  dataAccess: FoundryModuleFacade;
}

export class CoreQueryHandlers {
  private dataAccess: FoundryModuleFacade;

  constructor(options: CoreQueryHandlersOptions) {
    this.dataAccess = options.dataAccess;
  }

  private validateGMAccess(): { allowed: boolean } {
    if (!game.user?.isGM) {
      return { allowed: false };
    }

    return { allowed: true };
  }

  async handleGetCharacterInfo(
    data: FoundryGetCharacterInfoRequest
  ): Promise<FoundryCharacterInfo | QueryErrorResult> {
    try {
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      if (!data.identifier) {
        throw new Error('identifier is required');
      }

      return await this.dataAccess.getCharacterInfo(data.identifier);
    } catch (error) {
      throw new Error(
        `Failed to get character info: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async handleListActors(data: ListActorsRequest = {}): Promise<unknown> {
    try {
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return Promise.resolve({ error: 'Access denied', success: false });
      }

      this.dataAccess.validateFoundryState();
      const actors = await this.dataAccess.listActors();

      if (data.type) {
        return actors.filter(actor => actor.type === data.type);
      }

      return actors;
    } catch (error) {
      throw new Error(
        `Failed to list actors: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async handleGetWorldInfo(): Promise<FoundryWorldDetails | QueryErrorResult> {
    try {
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();
      return await this.dataAccess.getWorldInfo();
    } catch (error) {
      throw new Error(
        `Failed to get world info: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  handlePing(): unknown {
    return {
      status: 'ok',
      timestamp: Date.now(),
      module: MODULE_ID,
      foundryVersion: game.version,
      worldId: game.world?.id,
      userId: game.user?.id,
    };
  }
}
