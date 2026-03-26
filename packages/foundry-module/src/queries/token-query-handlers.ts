import type { FoundryModuleFacade } from '../foundry-module-facade.js';

export type QueryErrorResult = { error: string; success: false; status?: string };

type MoveTokenRequest = {
  tokenId: string;
  x: number;
  y: number;
  animate?: boolean;
};

type UpdateTokenRequest = {
  tokenId: string;
  updates: Record<string, unknown>;
};

type DeleteTokensRequest = {
  tokenIds: string[];
};

type GetTokenDetailsRequest = {
  tokenId: string;
};

type ToggleTokenConditionRequest = {
  tokenId: string;
  conditionId: string;
  active: boolean;
};

export interface TokenQueryHandlersOptions {
  dataAccess: FoundryModuleFacade;
}

export class TokenQueryHandlers {
  private dataAccess: FoundryModuleFacade;

  constructor(options: TokenQueryHandlersOptions) {
    this.dataAccess = options.dataAccess;
  }

  private validateGMAccess(): { allowed: boolean } {
    if (!game.user?.isGM) {
      return { allowed: false };
    }

    return { allowed: true };
  }

  async handleMoveToken(data: MoveTokenRequest): Promise<unknown> {
    try {
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      if (!data.tokenId) {
        throw new Error('tokenId is required');
      }
      if (typeof data.x !== 'number' || typeof data.y !== 'number') {
        throw new Error('x and y coordinates are required and must be numbers');
      }

      return (await this.dataAccess.moveToken(data)) as unknown;
    } catch (error) {
      throw new Error(
        `Failed to move token: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async handleUpdateToken(data: UpdateTokenRequest): Promise<unknown> {
    try {
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      if (!data.tokenId) {
        throw new Error('tokenId is required');
      }
      if (!data.updates || typeof data.updates !== 'object') {
        throw new Error('updates object is required');
      }

      return (await this.dataAccess.updateToken(data)) as unknown;
    } catch (error) {
      throw new Error(
        `Failed to update token: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async handleDeleteTokens(data: DeleteTokensRequest): Promise<unknown> {
    try {
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      if (!data.tokenIds || !Array.isArray(data.tokenIds) || data.tokenIds.length === 0) {
        throw new Error('tokenIds array is required and must not be empty');
      }

      return (await this.dataAccess.deleteTokens(data)) as unknown;
    } catch (error) {
      throw new Error(
        `Failed to delete tokens: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  handleGetTokenDetails(data: GetTokenDetailsRequest): Promise<unknown> {
    try {
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return Promise.resolve({ error: 'Access denied', success: false });
      }

      this.dataAccess.validateFoundryState();

      if (!data.tokenId) {
        throw new Error('tokenId is required');
      }

      return Promise.resolve(this.dataAccess.getTokenDetails(data) as unknown);
    } catch (error) {
      throw new Error(
        `Failed to get token details: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async handleToggleTokenCondition(data: ToggleTokenConditionRequest): Promise<unknown> {
    try {
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      if (!data.tokenId) {
        throw new Error('tokenId is required');
      }
      if (!data.conditionId) {
        throw new Error('conditionId is required');
      }
      if (typeof data.active !== 'boolean') {
        throw new Error('active must be a boolean');
      }

      return (await this.dataAccess.toggleTokenCondition(data)) as unknown;
    } catch (error) {
      throw new Error(
        `Failed to toggle token condition: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  handleGetAvailableConditions(): Promise<unknown> {
    try {
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return Promise.resolve({ error: 'Access denied', success: false });
      }

      this.dataAccess.validateFoundryState();

      return Promise.resolve(this.dataAccess.getAvailableConditions() as unknown);
    } catch (error) {
      throw new Error(
        `Failed to get available conditions: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
