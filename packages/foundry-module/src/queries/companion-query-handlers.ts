import type {
  FoundryConfigureCharacterCompanionSummonRequest,
  FoundryConfigureCharacterCompanionSummonResponse,
  FoundryCreateCharacterCompanionRequest,
  FoundryCreateCharacterCompanionResponse,
  FoundryDeleteCharacterCompanionRequest,
  FoundryDeleteCharacterCompanionResponse,
  FoundryDismissCharacterCompanionRequest,
  FoundryDismissCharacterCompanionResponse,
  FoundryListCharacterCompanionsRequest,
  FoundryListCharacterCompanionsResponse,
  FoundrySummonCharacterCompanionRequest,
  FoundrySummonCharacterCompanionResponse,
  FoundrySyncCharacterCompanionProgressionRequest,
  FoundrySyncCharacterCompanionProgressionResponse,
  FoundryUnlinkCharacterCompanionRequest,
  FoundryUnlinkCharacterCompanionResponse,
  FoundryUpdateCharacterCompanionLinkRequest,
  FoundryUpdateCharacterCompanionLinkResponse,
} from '@maeinomatic/foundry-mcp-shared';

import type { FoundryModuleFacade } from '../foundry-module-facade.js';

export type QueryErrorResult = { error: string; success: false; status?: string };

export interface CompanionQueryHandlersOptions {
  dataAccess: FoundryModuleFacade;
}

export class CompanionQueryHandlers {
  private dataAccess: FoundryModuleFacade;

  constructor(options: CompanionQueryHandlersOptions) {
    this.dataAccess = options.dataAccess;
  }

  private validateGMAccess(): { allowed: boolean } {
    if (!game.user?.isGM) {
      return { allowed: false };
    }

    return { allowed: true };
  }

  async handleCreateCharacterCompanion(
    data: FoundryCreateCharacterCompanionRequest
  ): Promise<FoundryCreateCharacterCompanionResponse | QueryErrorResult> {
    try {
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      const updatePermissionCheck = await this.dataAccess.validateWritePermissions('updateActor');
      if (!updatePermissionCheck.allowed) {
        return {
          error: updatePermissionCheck.reason ?? 'Actor update not allowed',
          success: false,
        };
      }

      if (!data.ownerActorIdentifier) {
        throw new Error('ownerActorIdentifier is required');
      }

      if (!data.role || !['companion', 'familiar'].includes(data.role)) {
        throw new Error('role must be companion or familiar');
      }

      if (!data.sourceUuid && !data.existingActorIdentifier) {
        throw new Error('sourceUuid or existingActorIdentifier is required');
      }

      return await this.dataAccess.createCharacterCompanion(data);
    } catch (error) {
      throw new Error(
        `Failed to create character companion: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async handleUpdateCharacterCompanionLink(
    data: FoundryUpdateCharacterCompanionLinkRequest
  ): Promise<FoundryUpdateCharacterCompanionLinkResponse | QueryErrorResult> {
    try {
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      const permissionCheck = await this.dataAccess.validateWritePermissions('updateActor');
      if (!permissionCheck.allowed) {
        return {
          error: permissionCheck.reason ?? 'Actor update not allowed',
          success: false,
        };
      }

      if (!data.ownerActorIdentifier) {
        throw new Error('ownerActorIdentifier is required');
      }
      if (!data.companionIdentifier) {
        throw new Error('companionIdentifier is required');
      }

      return await this.dataAccess.updateCharacterCompanionLink(data);
    } catch (error) {
      throw new Error(
        `Failed to update character companion link: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async handleListCharacterCompanions(
    data: FoundryListCharacterCompanionsRequest
  ): Promise<FoundryListCharacterCompanionsResponse | QueryErrorResult> {
    try {
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      const permissionCheck = await this.dataAccess.validateWritePermissions('modifyScene');
      if (!permissionCheck.allowed) {
        return {
          error: permissionCheck.reason ?? 'Scene modification not allowed',
          success: false,
        };
      }

      if (!data.ownerActorIdentifier) {
        throw new Error('ownerActorIdentifier is required');
      }

      return await this.dataAccess.listCharacterCompanions(data);
    } catch (error) {
      throw new Error(
        `Failed to list character companions: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async handleConfigureCharacterCompanionSummon(
    data: FoundryConfigureCharacterCompanionSummonRequest
  ): Promise<FoundryConfigureCharacterCompanionSummonResponse | QueryErrorResult> {
    try {
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      const permissionCheck = await this.dataAccess.validateWritePermissions('modifyScene');
      if (!permissionCheck.allowed) {
        return {
          error: permissionCheck.reason ?? 'Scene modification not allowed',
          success: false,
        };
      }

      if (!data.ownerActorIdentifier) {
        throw new Error('ownerActorIdentifier is required');
      }
      if (!data.companionIdentifier) {
        throw new Error('companionIdentifier is required');
      }

      return await this.dataAccess.configureCharacterCompanionSummon(data);
    } catch (error) {
      throw new Error(
        `Failed to configure character companion summon defaults: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async handleSummonCharacterCompanion(
    data: FoundrySummonCharacterCompanionRequest
  ): Promise<FoundrySummonCharacterCompanionResponse | QueryErrorResult> {
    try {
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      const permissionCheck = await this.dataAccess.validateWritePermissions('modifyScene');
      if (!permissionCheck.allowed) {
        return {
          error: permissionCheck.reason ?? 'Scene modification not allowed',
          success: false,
        };
      }

      if (!data.ownerActorIdentifier) {
        throw new Error('ownerActorIdentifier is required');
      }

      if (!data.companionIdentifier) {
        throw new Error('companionIdentifier is required');
      }

      return await this.dataAccess.summonCharacterCompanion(data);
    } catch (error) {
      throw new Error(
        `Failed to summon character companion: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async handleDismissCharacterCompanion(
    data: FoundryDismissCharacterCompanionRequest
  ): Promise<FoundryDismissCharacterCompanionResponse | QueryErrorResult> {
    try {
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      if (!data.ownerActorIdentifier) {
        throw new Error('ownerActorIdentifier is required');
      }

      return await this.dataAccess.dismissCharacterCompanion(data);
    } catch (error) {
      throw new Error(
        `Failed to dismiss character companion: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async handleUnlinkCharacterCompanion(
    data: FoundryUnlinkCharacterCompanionRequest
  ): Promise<FoundryUnlinkCharacterCompanionResponse | QueryErrorResult> {
    try {
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      if (!data.ownerActorIdentifier) {
        throw new Error('ownerActorIdentifier is required');
      }
      if (!data.companionIdentifier) {
        throw new Error('companionIdentifier is required');
      }

      return await this.dataAccess.unlinkCharacterCompanion(data);
    } catch (error) {
      throw new Error(
        `Failed to unlink character companion: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async handleDeleteCharacterCompanion(
    data: FoundryDeleteCharacterCompanionRequest
  ): Promise<FoundryDeleteCharacterCompanionResponse | QueryErrorResult> {
    try {
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      const permissionCheck = await this.dataAccess.validateWritePermissions('updateActor');
      if (!permissionCheck.allowed) {
        return {
          error: permissionCheck.reason ?? 'Actor update not allowed',
          success: false,
        };
      }

      if (!data.ownerActorIdentifier) {
        throw new Error('ownerActorIdentifier is required');
      }
      if (!data.companionIdentifier) {
        throw new Error('companionIdentifier is required');
      }

      return await this.dataAccess.deleteCharacterCompanion(data);
    } catch (error) {
      throw new Error(
        `Failed to delete character companion: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async handleSyncCharacterCompanionProgression(
    data: FoundrySyncCharacterCompanionProgressionRequest
  ): Promise<FoundrySyncCharacterCompanionProgressionResponse | QueryErrorResult> {
    try {
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      const permissionCheck = await this.dataAccess.validateWritePermissions('updateActor');
      if (!permissionCheck.allowed) {
        return {
          error: permissionCheck.reason ?? 'Actor update not allowed',
          success: false,
        };
      }

      if (!data.ownerActorIdentifier) {
        throw new Error('ownerActorIdentifier is required');
      }
      if (!data.companionIdentifier) {
        throw new Error('companionIdentifier is required');
      }

      return await this.dataAccess.syncCharacterCompanionProgression(data);
    } catch (error) {
      throw new Error(
        `Failed to sync character companion progression: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
