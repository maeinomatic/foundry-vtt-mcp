import type {
  FoundryCompendiumEntryFull,
  FoundryCompendiumSearchRequest,
  FoundryCreateCompendiumItemRequest,
  FoundryCreateCompendiumItemResponse,
  FoundryCreateWorldItemRequest,
  FoundryCreateWorldItemResponse,
  FoundryCreatureSearchCriteria,
  FoundryImportItemToCompendiumRequest,
  FoundryImportItemToCompendiumResponse,
  FoundryUpdateWorldItemRequest,
  FoundryUpdateWorldItemResponse,
} from '@maeinomatic/foundry-mcp-shared';

import type { FoundryModuleFacade } from '../foundry-module-facade.js';

export type QueryErrorResult = { error: string; success: false; status?: string };

export interface CompendiumQueryHandlersOptions {
  dataAccess: FoundryModuleFacade;
}

export class CompendiumQueryHandlers {
  private dataAccess: FoundryModuleFacade;

  constructor(options: CompendiumQueryHandlersOptions) {
    this.dataAccess = options.dataAccess;
  }

  private validateGMAccess(): { allowed: boolean } {
    if (!game.user?.isGM) {
      return { allowed: false };
    }

    return { allowed: true };
  }

  async handleSearchCompendium(data: FoundryCompendiumSearchRequest): Promise<unknown> {
    try {
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      if (!data || typeof data !== 'object') {
        throw new Error('Invalid data parameter structure');
      }

      if (!data.query || typeof data.query !== 'string') {
        throw new Error('query parameter is required and must be a string');
      }

      return await this.dataAccess.searchCompendium(data.query, data.packType, data.filters);
    } catch (error) {
      throw new Error(
        `Failed to search compendium: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async handleListCreaturesByCriteria(data: FoundryCreatureSearchCriteria): Promise<unknown> {
    try {
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      const result = await this.dataAccess.listCreaturesByCriteria(data);

      return {
        response: result,
      };
    } catch (error) {
      throw new Error(
        `Failed to list creatures by criteria: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async handleGetAvailablePacks(): Promise<unknown> {
    try {
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      return await this.dataAccess.getAvailablePacks();
    } catch (error) {
      throw new Error(
        `Failed to get available packs: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async handleCreateWorldItem(
    data: FoundryCreateWorldItemRequest
  ): Promise<FoundryCreateWorldItemResponse | QueryErrorResult> {
    try {
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();
      return await this.dataAccess.createWorldItem(data);
    } catch (error) {
      throw new Error(
        `Failed to create world item: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async handleUpdateWorldItem(
    data: FoundryUpdateWorldItemRequest
  ): Promise<FoundryUpdateWorldItemResponse | QueryErrorResult> {
    try {
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();
      if (!data.itemIdentifier) {
        throw new Error('itemIdentifier is required');
      }
      if (!data.updates || typeof data.updates !== 'object') {
        throw new Error('updates is required');
      }

      return await this.dataAccess.updateWorldItem(data);
    } catch (error) {
      throw new Error(
        `Failed to update world item: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async handleCreateCompendiumItem(
    data: FoundryCreateCompendiumItemRequest
  ): Promise<FoundryCreateCompendiumItemResponse | QueryErrorResult> {
    try {
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();
      if (!data.packId) {
        throw new Error('packId is required');
      }

      return await this.dataAccess.createCompendiumItem(data);
    } catch (error) {
      throw new Error(
        `Failed to create compendium item: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async handleImportItemToCompendium(
    data: FoundryImportItemToCompendiumRequest
  ): Promise<FoundryImportItemToCompendiumResponse | QueryErrorResult> {
    try {
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();
      if (!data.itemIdentifier) {
        throw new Error('itemIdentifier is required');
      }
      if (!data.packId) {
        throw new Error('packId is required');
      }

      return await this.dataAccess.importItemToCompendium(data);
    } catch (error) {
      throw new Error(
        `Failed to import item to compendium: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async handleGetCompendiumDocumentFull(data: {
    packId: string;
    documentId: string;
  }): Promise<FoundryCompendiumEntryFull | QueryErrorResult> {
    try {
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      if (!data.packId) {
        throw new Error('packId is required');
      }

      if (!data.documentId) {
        throw new Error('documentId is required');
      }

      return await this.dataAccess.getCompendiumDocumentFull(data.packId, data.documentId);
    } catch (error) {
      throw new Error(
        `Failed to get compendium document: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
