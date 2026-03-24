import type {
  FoundryApplyCharacterAdvancementChoiceRequest,
  FoundryApplyCharacterAdvancementChoiceResponse,
  FoundryApplyCharacterPatchTransactionRequest,
  FoundryApplyCharacterPatchTransactionResponse,
  FoundryActorCreationResult,
  FoundryBatchUpdateActorEmbeddedItemsRequest,
  FoundryBatchUpdateActorEmbeddedItemsResponse,
  FoundryCreateActorFromCompendiumRequest,
  FoundryCreateActorEmbeddedItemRequest,
  FoundryCreateActorEmbeddedItemResponse,
  FoundryCreateCharacterActorRequest,
  FoundryCreateCharacterActorResponse,
  FoundryDeleteActorEmbeddedItemRequest,
  FoundryDeleteActorEmbeddedItemResponse,
  FoundryGetCharacterAdvancementOptionsRequest,
  FoundryGetCharacterAdvancementOptionsResponse,
  FoundryPreviewCharacterProgressionRequest,
  FoundryPreviewCharacterProgressionResponse,
  FoundryRunCharacterRestWorkflowRequest,
  FoundryRunCharacterRestWorkflowResponse,
  FoundryRunDnD5eSummonActivityRequest,
  FoundryRunDnD5eSummonActivityResponse,
  FoundryRunDnD5eTransformActivityRequest,
  FoundryRunDnD5eTransformActivityResponse,
  FoundrySearchCharacterItemsRequest,
  FoundryUpdateActorEmbeddedItemRequest,
  FoundryUpdateActorEmbeddedItemResponse,
  FoundryUpdateActorRequest,
  FoundryUpdateActorResponse,
  FoundryValidateCharacterBuildRequest,
  FoundryValidateCharacterBuildResponse,
} from '@maeinomatic/foundry-mcp-shared';

import type { FoundryModuleFacade } from '../foundry-module-facade.js';

export type QueryErrorResult = { error: string; success: false; status?: string };

type UseItemRequest = {
  actorIdentifier: string;
  itemIdentifier: string;
  targets?: string[];
  options?: {
    consume?: boolean;
    configureDialog?: boolean;
    spellLevel?: number;
    versatile?: boolean;
  };
};

export interface CharacterQueryHandlersOptions {
  dataAccess: FoundryModuleFacade;
}

export class CharacterQueryHandlers {
  private dataAccess: FoundryModuleFacade;

  constructor(options: CharacterQueryHandlersOptions) {
    this.dataAccess = options.dataAccess;
  }

  private validateGMAccess(): { allowed: boolean } {
    if (!game.user?.isGM) {
      return { allowed: false };
    }

    return { allowed: true };
  }

  async handleCreateActorFromCompendium(
    data: FoundryCreateActorFromCompendiumRequest
  ): Promise<FoundryActorCreationResult | QueryErrorResult> {
    try {
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      return await this.dataAccess.createActorFromCompendiumEntry({
        packId: data.packId,
        itemId: data.itemId,
        customNames: data.customNames ?? [],
        quantity: data.quantity ?? 1,
        addToScene: data.addToScene ?? false,
        ...(data.placement
          ? {
              placement: {
                type: data.placement.type,
                ...(data.placement.coordinates ? { coordinates: data.placement.coordinates } : {}),
              },
            }
          : {}),
      });
    } catch (error) {
      throw new Error(
        `Failed to create actor from compendium: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async handleCreateCharacterActor(
    data: FoundryCreateCharacterActorRequest
  ): Promise<FoundryCreateCharacterActorResponse | QueryErrorResult> {
    try {
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      const permissionCheck = await this.dataAccess.validateWritePermissions('createActor');
      if (!permissionCheck.allowed) {
        return {
          error: permissionCheck.reason ?? 'Actor creation not allowed',
          success: false,
        };
      }

      if (!data.sourceUuid) {
        throw new Error('sourceUuid is required');
      }

      if (!data.name) {
        throw new Error('name is required');
      }

      return await this.dataAccess.createCharacterActor(data);
    } catch (error) {
      throw new Error(
        `Failed to create standalone character actor: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async handlePreviewCharacterProgression(
    data: FoundryPreviewCharacterProgressionRequest
  ): Promise<FoundryPreviewCharacterProgressionResponse | QueryErrorResult> {
    try {
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      if (!data.actorIdentifier) {
        throw new Error('actorIdentifier is required');
      }

      if (!Number.isInteger(data.targetLevel) || data.targetLevel <= 0) {
        throw new Error('targetLevel must be a positive integer');
      }

      return await this.dataAccess.previewCharacterProgression(data);
    } catch (error) {
      throw new Error(
        `Failed to preview character progression: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async handleGetCharacterAdvancementOptions(
    data: FoundryGetCharacterAdvancementOptionsRequest
  ): Promise<FoundryGetCharacterAdvancementOptionsResponse | QueryErrorResult> {
    try {
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      if (!data.actorIdentifier) {
        throw new Error('actorIdentifier is required');
      }

      if (!Number.isInteger(data.targetLevel) || data.targetLevel <= 0) {
        throw new Error('targetLevel must be a positive integer');
      }

      if (!data.stepId) {
        throw new Error('stepId is required');
      }

      return await this.dataAccess.getCharacterAdvancementOptions(data);
    } catch (error) {
      throw new Error(
        `Failed to get character advancement options: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async handleApplyCharacterAdvancementChoice(
    data: FoundryApplyCharacterAdvancementChoiceRequest
  ): Promise<FoundryApplyCharacterAdvancementChoiceResponse | QueryErrorResult> {
    try {
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      const permissionCheck = await this.dataAccess.validateWritePermissions('updateActor');
      if (!permissionCheck.allowed) {
        return {
          error: permissionCheck.reason ?? 'Character advancement choice application not allowed',
          success: false,
        };
      }

      if (!data.actorIdentifier) {
        throw new Error('actorIdentifier is required');
      }

      if (!Number.isInteger(data.targetLevel) || data.targetLevel <= 0) {
        throw new Error('targetLevel must be a positive integer');
      }

      if (!data.stepId) {
        throw new Error('stepId is required');
      }

      if (!data.choice || typeof data.choice !== 'object') {
        throw new Error('choice is required');
      }

      if (data.choice.type !== 'ability-score-improvement') {
        if (data.choice.type === 'subclass') {
          if (!data.choice.subclassUuid) {
            throw new Error('Subclass choices require subclassUuid');
          }
        } else if (data.choice.type === 'hit-points') {
          if (data.choice.mode !== 'average' && data.choice.mode !== 'roll') {
            throw new Error('Hit point choices require mode "average" or "roll"');
          }
        } else if (data.choice.type === 'item-choice') {
          if (!Array.isArray(data.choice.itemUuids) || data.choice.itemUuids.length === 0) {
            throw new Error('Item-choice selections require one or more itemUuids');
          }
        } else if (data.choice.type === 'item-grant') {
          if (
            data.choice.itemUuids !== undefined &&
            (!Array.isArray(data.choice.itemUuids) ||
              !data.choice.itemUuids.every((itemUuid: unknown) => typeof itemUuid === 'string'))
          ) {
            throw new Error('Item-grant selections require itemUuids to be a string array');
          }
        }

        return await this.dataAccess.applyCharacterAdvancementChoice(data);
      }

      if (data.choice.mode === 'asi') {
        if (
          !data.choice.assignments ||
          typeof data.choice.assignments !== 'object' ||
          Array.isArray(data.choice.assignments)
        ) {
          throw new Error('ASI choices require an assignments object');
        }
      } else if (data.choice.mode === 'feat' && !data.choice.featUuid) {
        throw new Error('Feat choices require featUuid');
      }

      return await this.dataAccess.applyCharacterAdvancementChoice(data);
    } catch (error) {
      throw new Error(
        `Failed to apply character advancement choice: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async handleValidateCharacterBuild(
    data: FoundryValidateCharacterBuildRequest
  ): Promise<FoundryValidateCharacterBuildResponse | QueryErrorResult> {
    try {
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      if (!data.actorIdentifier) {
        throw new Error('actorIdentifier is required');
      }

      return await this.dataAccess.validateCharacterBuild(data);
    } catch (error) {
      throw new Error(
        `Failed to validate character build: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async handleRunCharacterRestWorkflow(
    data: FoundryRunCharacterRestWorkflowRequest
  ): Promise<FoundryRunCharacterRestWorkflowResponse | QueryErrorResult> {
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

      if (!data.actorIdentifier) {
        throw new Error('actorIdentifier is required');
      }

      if (data.restType !== 'short' && data.restType !== 'long') {
        throw new Error('restType must be "short" or "long"');
      }

      return await this.dataAccess.runCharacterRestWorkflow(data);
    } catch (error) {
      throw new Error(
        `Failed to run character rest workflow: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async handleRunDnD5eSummonActivity(
    data: FoundryRunDnD5eSummonActivityRequest
  ): Promise<FoundryRunDnD5eSummonActivityResponse | QueryErrorResult> {
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

      if (!data.actorIdentifier) {
        throw new Error('actorIdentifier is required');
      }

      if (!data.itemIdentifier) {
        throw new Error('itemIdentifier is required');
      }

      return await this.dataAccess.runDnD5eSummonActivity(data);
    } catch (error) {
      throw new Error(
        `Failed to run DnD5e summon activity: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async handleRunDnD5eTransformActivity(
    data: FoundryRunDnD5eTransformActivityRequest
  ): Promise<FoundryRunDnD5eTransformActivityResponse | QueryErrorResult> {
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

      if (!data.actorIdentifier) {
        throw new Error('actorIdentifier is required');
      }

      if (!data.itemIdentifier) {
        throw new Error('itemIdentifier is required');
      }

      return await this.dataAccess.runDnD5eTransformActivity(data);
    } catch (error) {
      throw new Error(
        `Failed to run DnD5e transform activity: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async handleUpdateActor(
    data: FoundryUpdateActorRequest
  ): Promise<FoundryUpdateActorResponse | QueryErrorResult> {
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

      if (!data.identifier) {
        throw new Error('identifier is required');
      }

      if (!data.updates || typeof data.updates !== 'object' || Array.isArray(data.updates)) {
        throw new Error('updates must be an object');
      }

      return await this.dataAccess.updateActor(data);
    } catch (error) {
      throw new Error(
        `Failed to update actor: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async handleCreateActorEmbeddedItem(
    data: FoundryCreateActorEmbeddedItemRequest
  ): Promise<FoundryCreateActorEmbeddedItemResponse | QueryErrorResult> {
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

      if (!data.actorIdentifier) {
        throw new Error('actorIdentifier is required');
      }

      if (!data.sourceUuid && !data.itemData) {
        throw new Error('sourceUuid or itemData is required');
      }

      if (
        data.itemData !== undefined &&
        (!data.itemData || typeof data.itemData !== 'object' || Array.isArray(data.itemData))
      ) {
        throw new Error('itemData must be an object');
      }

      if (
        data.overrides !== undefined &&
        (!data.overrides || typeof data.overrides !== 'object' || Array.isArray(data.overrides))
      ) {
        throw new Error('overrides must be an object');
      }

      return await this.dataAccess.createActorEmbeddedItem(data);
    } catch (error) {
      throw new Error(
        `Failed to create actor embedded item: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async handleBatchUpdateActorEmbeddedItems(
    data: FoundryBatchUpdateActorEmbeddedItemsRequest
  ): Promise<FoundryBatchUpdateActorEmbeddedItemsResponse | QueryErrorResult> {
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

      if (!data.actorIdentifier) {
        throw new Error('actorIdentifier is required');
      }

      if (!Array.isArray(data.updates) || data.updates.length === 0) {
        throw new Error('updates must be a non-empty array');
      }

      for (const entry of data.updates) {
        if (!entry.itemIdentifier) {
          throw new Error('Each batch update entry requires itemIdentifier');
        }
        if (!entry.updates || typeof entry.updates !== 'object' || Array.isArray(entry.updates)) {
          throw new Error('Each batch update entry requires an updates object');
        }
      }

      return await this.dataAccess.batchUpdateActorEmbeddedItems(data);
    } catch (error) {
      throw new Error(
        `Failed to batch update actor embedded items: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async handleApplyCharacterPatchTransaction(
    data: FoundryApplyCharacterPatchTransactionRequest
  ): Promise<FoundryApplyCharacterPatchTransactionResponse | QueryErrorResult> {
    try {
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      const permissionCheck = await this.dataAccess.validateWritePermissions('updateActor');
      if (!permissionCheck.allowed) {
        return {
          error: permissionCheck.reason ?? 'Character patch transaction not allowed',
          success: false,
        };
      }

      if (!data.actorIdentifier) {
        throw new Error('actorIdentifier is required');
      }

      if (
        data.actorUpdates !== undefined &&
        (!data.actorUpdates ||
          typeof data.actorUpdates !== 'object' ||
          Array.isArray(data.actorUpdates))
      ) {
        throw new Error('actorUpdates must be an object when provided');
      }

      if (data.createItems !== undefined && !Array.isArray(data.createItems)) {
        throw new Error('createItems must be an array when provided');
      }

      if (data.updateItems !== undefined && !Array.isArray(data.updateItems)) {
        throw new Error('updateItems must be an array when provided');
      }

      if (data.deleteItems !== undefined && !Array.isArray(data.deleteItems)) {
        throw new Error('deleteItems must be an array when provided');
      }

      return await this.dataAccess.applyCharacterPatchTransaction(data);
    } catch (error) {
      throw new Error(
        `Failed to apply character patch transaction: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async handleUpdateActorEmbeddedItem(
    data: FoundryUpdateActorEmbeddedItemRequest
  ): Promise<FoundryUpdateActorEmbeddedItemResponse | QueryErrorResult> {
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

      if (!data.actorIdentifier) {
        throw new Error('actorIdentifier is required');
      }

      if (!data.itemIdentifier) {
        throw new Error('itemIdentifier is required');
      }

      if (!data.updates || typeof data.updates !== 'object' || Array.isArray(data.updates)) {
        throw new Error('updates must be an object');
      }

      return await this.dataAccess.updateActorEmbeddedItem(data);
    } catch (error) {
      throw new Error(
        `Failed to update actor embedded item: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async handleDeleteActorEmbeddedItem(
    data: FoundryDeleteActorEmbeddedItemRequest
  ): Promise<FoundryDeleteActorEmbeddedItemResponse | QueryErrorResult> {
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

      if (!data.actorIdentifier) {
        throw new Error('actorIdentifier is required');
      }

      if (!data.itemIdentifier) {
        throw new Error('itemIdentifier is required');
      }

      return await this.dataAccess.deleteActorEmbeddedItem(data);
    } catch (error) {
      throw new Error(
        `Failed to delete actor embedded item: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async handleUseItem(data: UseItemRequest): Promise<unknown> {
    try {
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      if (!data.actorIdentifier) {
        throw new Error('actorIdentifier is required');
      }
      if (!data.itemIdentifier) {
        throw new Error('itemIdentifier is required');
      }

      return await this.dataAccess.useItem({
        actorIdentifier: data.actorIdentifier,
        itemIdentifier: data.itemIdentifier,
        targets: data.targets,
        options: data.options,
      });
    } catch (error) {
      throw new Error(
        `Failed to use item: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async handleSearchCharacterItems(data: FoundrySearchCharacterItemsRequest): Promise<unknown> {
    try {
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      if (!data.characterIdentifier) {
        throw new Error('characterIdentifier is required');
      }

      return await this.dataAccess.searchCharacterItems({
        characterIdentifier: data.characterIdentifier,
        ...(data.query !== undefined ? { query: data.query } : {}),
        ...(data.type !== undefined ? { type: data.type } : {}),
        ...(data.category !== undefined ? { category: data.category } : {}),
        ...(data.limit !== undefined ? { limit: data.limit } : {}),
      });
    } catch (error) {
      throw new Error(
        `Failed to search character items: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
