import { MODULE_ID } from './constants.js';
import { FoundryModuleFacade } from './foundry-module-facade.js';
import { ComfyUIManager } from './comfyui-manager.js';
import { notifyGM } from './gm-notifications.js';
import type {
  FoundryApplyCharacterAdvancementChoiceRequest,
  FoundryApplyCharacterAdvancementChoiceResponse,
  FoundryActorCreationResult,
  FoundryBatchUpdateActorEmbeddedItemsRequest,
  FoundryBatchUpdateActorEmbeddedItemsResponse,
  FoundryCharacterInfo,
  FoundryCreateActorFromCompendiumRequest,
  FoundryCreateActorEmbeddedItemRequest,
  FoundryCreateActorEmbeddedItemResponse,
  FoundryCompendiumSearchRequest,
  FoundryCreatureSearchCriteria,
  FoundryCompendiumEntryFull,
  FoundryDeleteActorEmbeddedItemRequest,
  FoundryDeleteActorEmbeddedItemResponse,
  FoundryGetCharacterAdvancementOptionsRequest,
  FoundryGetCharacterAdvancementOptionsResponse,
  FoundryGetCharacterInfoRequest,
  FoundryJournalEntryResponse,
  FoundryJournalSummary,
  FoundryPreviewCharacterProgressionRequest,
  FoundryPreviewCharacterProgressionResponse,
  FoundrySearchCharacterItemsRequest,
  FoundryUpdateActorEmbeddedItemRequest,
  FoundryUpdateActorEmbeddedItemResponse,
  FoundryUpdateActorRequest,
  FoundryUpdateActorResponse,
  FoundryWorldDetails,
} from '@foundry-mcp/shared';

type QueryErrorResult = { error: string; success: false; status?: string };

type FindPlayersRequest = {
  identifier: string;
  allowPartialMatch?: boolean;
  includeCharacterOwners?: boolean;
};

type FindActorRequest = { identifier: string };

type ListScenesRequest = {
  filter?: string;
  include_active_only?: boolean;
};

type SwitchSceneRequest = {
  scene_identifier: string;
  optimize_view?: boolean;
};

type GenerateMapRequest = {
  prompt: string;
  scene_name: string;
  size?: string;
  grid_size?: number;
};

type MapJobRequest = { job_id: string };

type UploadGeneratedMapRequest = {
  filename: string;
  imageData: string;
};

type CreateJournalEntryRequest = {
  name: string;
  content: string;
};

type SetActorOwnershipRequest = {
  actorId: string;
  userId: string;
  permission: number;
};

type GetActorOwnershipRequest = {
  actorIdentifier?: string;
  playerIdentifier?: string;
};

type ComfyMapResponse = {
  success?: boolean;
  status?: string;
  error?: string;
  message?: string;
  jobId?: string;
  estimatedTime?: string;
  job?: unknown;
};

export class QueryHandlers {
  public dataAccess: FoundryModuleFacade;
  private comfyuiManager: ComfyUIManager;

  constructor() {
    this.dataAccess = new FoundryModuleFacade();
    this.comfyuiManager = new ComfyUIManager();
  }

  /**
   * SECURITY: Validate GM access - returns silent failure for non-GM users
   */
  private validateGMAccess(): { allowed: boolean; error?: unknown } {
    if (!game.user?.isGM) {
      // Silent failure - no error message for non-GM users
      return { allowed: false };
    }
    return { allowed: true };
  }

  private errorMessage(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
  }

  private parseComfyResponse(value: unknown): ComfyMapResponse {
    if (!value || typeof value !== 'object') {
      return {};
    }

    const record = value as Record<string, unknown>;
    const parsed: ComfyMapResponse = {};

    if (typeof record.success === 'boolean') {
      parsed.success = record.success;
    }
    if (typeof record.status === 'string') {
      parsed.status = record.status;
    }
    if (typeof record.error === 'string') {
      parsed.error = record.error;
    }
    if (typeof record.message === 'string') {
      parsed.message = record.message;
    }
    if (typeof record.jobId === 'string') {
      parsed.jobId = record.jobId;
    }
    if (typeof record.estimatedTime === 'string') {
      parsed.estimatedTime = record.estimatedTime;
    }
    if ('job' in record) {
      parsed.job = record.job;
    }

    return parsed;
  }

  /**
   * Register all query handlers in CONFIG.queries
   */
  registerHandlers(): void {
    const modulePrefix = MODULE_ID;

    // Character/Actor queries
    CONFIG.queries[`${modulePrefix}.getCharacterInfo`] = this.handleGetCharacterInfo.bind(this);
    CONFIG.queries[`${modulePrefix}.listActors`] = this.handleListActors.bind(this);

    // Compendium queries
    CONFIG.queries[`${modulePrefix}.searchCompendium`] = this.handleSearchCompendium.bind(this);
    CONFIG.queries[`${modulePrefix}.listCreaturesByCriteria`] =
      this.handleListCreaturesByCriteria.bind(this);
    CONFIG.queries[`${modulePrefix}.getAvailablePacks`] = this.handleGetAvailablePacks.bind(this);

    // Scene queries
    CONFIG.queries[`${modulePrefix}.getActiveScene`] = this.handleGetActiveScene.bind(this);
    CONFIG.queries[`${modulePrefix}.list-scenes`] = this.handleListScenes.bind(this);
    CONFIG.queries[`${modulePrefix}.switch-scene`] = this.handleSwitchScene.bind(this);

    // World queries
    CONFIG.queries[`${modulePrefix}.getWorldInfo`] = this.handleGetWorldInfo.bind(this);

    // Utility queries
    CONFIG.queries[`${modulePrefix}.ping`] = this.handlePing.bind(this);

    // Phase 2 & 3: Write operation queries
    CONFIG.queries[`${modulePrefix}.createActorFromCompendium`] =
      this.handleCreateActorFromCompendium.bind(this);
    CONFIG.queries[`${modulePrefix}.previewCharacterProgression`] =
      this.handlePreviewCharacterProgression.bind(this);
    CONFIG.queries[`${modulePrefix}.getCharacterAdvancementOptions`] =
      this.handleGetCharacterAdvancementOptions.bind(this);
    CONFIG.queries[`${modulePrefix}.applyCharacterAdvancementChoice`] =
      this.handleApplyCharacterAdvancementChoice.bind(this);
    CONFIG.queries[`${modulePrefix}.updateActor`] = this.handleUpdateActor.bind(this);
    CONFIG.queries[`${modulePrefix}.createActorEmbeddedItem`] =
      this.handleCreateActorEmbeddedItem.bind(this);
    CONFIG.queries[`${modulePrefix}.batchUpdateActorEmbeddedItems`] =
      this.handleBatchUpdateActorEmbeddedItems.bind(this);
    CONFIG.queries[`${modulePrefix}.updateActorEmbeddedItem`] =
      this.handleUpdateActorEmbeddedItem.bind(this);
    CONFIG.queries[`${modulePrefix}.deleteActorEmbeddedItem`] =
      this.handleDeleteActorEmbeddedItem.bind(this);
    CONFIG.queries[`${modulePrefix}.getCompendiumDocumentFull`] =
      this.handleGetCompendiumDocumentFull.bind(this);
    CONFIG.queries[`${modulePrefix}.addActorsToScene`] = this.handleAddActorsToScene.bind(this);
    CONFIG.queries[`${modulePrefix}.validateWritePermissions`] =
      this.handleValidateWritePermissions.bind(this);
    CONFIG.queries[`${modulePrefix}.createJournalEntry`] = this.handleCreateJournalEntry.bind(this);
    CONFIG.queries[`${modulePrefix}.listJournals`] = this.handleListJournals.bind(this);
    CONFIG.queries[`${modulePrefix}.getJournalContent`] = this.handleGetJournalContent.bind(this);
    CONFIG.queries[`${modulePrefix}.updateJournalContent`] =
      this.handleUpdateJournalContent.bind(this);

    // Phase 4: Dice roll queries
    CONFIG.queries[`${modulePrefix}.request-player-rolls`] =
      this.handleRequestPlayerRolls.bind(this);

    // Enhanced creature index for campaign analysis
    CONFIG.queries[`${modulePrefix}.getEnhancedCreatureIndex`] =
      this.handleGetEnhancedCreatureIndex.bind(this);

    // Campaign management queries
    CONFIG.queries[`${modulePrefix}.updateCampaignProgress`] =
      this.handleUpdateCampaignProgress.bind(this);

    // Phase 6: Actor ownership management
    CONFIG.queries[`${modulePrefix}.setActorOwnership`] = this.handleSetActorOwnership.bind(this);
    CONFIG.queries[`${modulePrefix}.getActorOwnership`] = this.handleGetActorOwnership.bind(this);
    CONFIG.queries[`${modulePrefix}.getFriendlyNPCs`] = this.handleGetFriendlyNPCs.bind(this);
    CONFIG.queries[`${modulePrefix}.getPartyCharacters`] = this.handleGetPartyCharacters.bind(this);
    CONFIG.queries[`${modulePrefix}.getConnectedPlayers`] =
      this.handleGetConnectedPlayers.bind(this);
    CONFIG.queries[`${modulePrefix}.findPlayers`] = this.handleFindPlayers.bind(this);
    CONFIG.queries[`${modulePrefix}.findActor`] = this.handleFindActor.bind(this);

    // Token manipulation queries
    CONFIG.queries[`${modulePrefix}.moveToken`] = this.handleMoveToken.bind(this);
    CONFIG.queries[`${modulePrefix}.updateToken`] = this.handleUpdateToken.bind(this);
    CONFIG.queries[`${modulePrefix}.deleteTokens`] = this.handleDeleteTokens.bind(this);
    CONFIG.queries[`${modulePrefix}.getTokenDetails`] = this.handleGetTokenDetails.bind(this);
    CONFIG.queries[`${modulePrefix}.toggleTokenCondition`] =
      this.handleToggleTokenCondition.bind(this);
    CONFIG.queries[`${modulePrefix}.getAvailableConditions`] =
      this.handleGetAvailableConditions.bind(this);

    // Map generation queries (hybrid architecture)
    CONFIG.queries[`${modulePrefix}.generate-map`] = this.handleGenerateMap.bind(this);
    CONFIG.queries[`${modulePrefix}.check-map-status`] = this.handleCheckMapStatus.bind(this);
    CONFIG.queries[`${modulePrefix}.cancel-map-job`] = this.handleCancelMapJob.bind(this);
    CONFIG.queries[`${modulePrefix}.upload-generated-map`] =
      this.handleUploadGeneratedMap.bind(this);

    // Item usage queries
    CONFIG.queries[`${modulePrefix}.useItem`] = this.handleUseItem.bind(this);

    // Character search queries
    CONFIG.queries[`${modulePrefix}.searchCharacterItems`] =
      this.handleSearchCharacterItems.bind(this);

    // Phase 7: Token manipulation queries
    CONFIG.queries[`${modulePrefix}.move-token`] = this.handleMoveToken.bind(this);
    CONFIG.queries[`${modulePrefix}.update-token`] = this.handleUpdateToken.bind(this);
    CONFIG.queries[`${modulePrefix}.delete-tokens`] = this.handleDeleteTokens.bind(this);
    CONFIG.queries[`${modulePrefix}.get-token-details`] = this.handleGetTokenDetails.bind(this);
    CONFIG.queries[`${modulePrefix}.toggle-token-condition`] =
      this.handleToggleTokenCondition.bind(this);
    CONFIG.queries[`${modulePrefix}.get-available-conditions`] =
      this.handleGetAvailableConditions.bind(this);
  }

  /**
   * Unregister all query handlers
   */
  unregisterHandlers(): void {
    const modulePrefix = MODULE_ID;
    const keysToRemove = Object.keys(CONFIG.queries).filter(key => key.startsWith(modulePrefix));

    for (const key of keysToRemove) {
      delete CONFIG.queries[key];
    }
  }

  /**
   * Handle query requests from other parts of the module
   */
  async handleQuery(queryName: string, data: unknown): Promise<unknown> {
    try {
      const handler = CONFIG.queries[queryName] as
        | ((payload: unknown) => Promise<unknown>)
        | undefined;
      if (!handler || typeof handler !== 'function') {
        throw new Error(`Query handler not found: ${queryName}`);
      }

      return await handler(data);
    } catch (error) {
      console.error(`[${MODULE_ID}] Query failed: ${queryName}`, error);
      return {
        error: error instanceof Error ? error.message : 'Unknown error',
        success: false,
      };
    }
  }

  /**
   * Handle character information request
   */
  private async handleGetCharacterInfo(
    data:
      | FoundryGetCharacterInfoRequest
      | {
          characterName?: string;
          characterId?: string;
        }
  ): Promise<FoundryCharacterInfo | QueryErrorResult> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return Promise.resolve({ error: 'Access denied', success: false });
      }

      this.dataAccess.validateFoundryState();

      const identifier =
        ('identifier' in data ? data.identifier : undefined) ??
        ('characterName' in data ? data.characterName : undefined) ??
        ('characterId' in data ? data.characterId : undefined);
      if (!identifier) {
        throw new Error('identifier is required');
      }

      const characterInfo = await this.dataAccess.getCharacterInfo(identifier);
      return characterInfo;
    } catch (error) {
      throw new Error(
        `Failed to get character info: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Handle list actors request
   */
  private async handleListActors(data: { type?: string }): Promise<unknown> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return Promise.resolve({ error: 'Access denied', success: false });
      }

      this.dataAccess.validateFoundryState();

      const actors = await this.dataAccess.listActors();

      // Filter by type if specified
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

  /**
   * Handle compendium search request
   */
  private async handleSearchCompendium(data: FoundryCompendiumSearchRequest): Promise<unknown> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return Promise.resolve({ error: 'Access denied', success: false });
      }

      this.dataAccess.validateFoundryState();

      // Add better parameter validation
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

  /**
   * Handle list creatures by criteria request
   */
  private async handleListCreaturesByCriteria(
    data: FoundryCreatureSearchCriteria
  ): Promise<unknown> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return Promise.resolve({ error: 'Access denied', success: false });
      }

      this.dataAccess.validateFoundryState();

      const result = await this.dataAccess.listCreaturesByCriteria(data);

      // Handle the new format with search summary
      return {
        response: result,
      };
    } catch (error) {
      throw new Error(
        `Failed to list creatures by criteria: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Handle get available packs request
   */
  private async handleGetAvailablePacks(): Promise<unknown> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return Promise.resolve({ error: 'Access denied', success: false });
      }

      this.dataAccess.validateFoundryState();
      return await this.dataAccess.getAvailablePacks();
    } catch (error) {
      throw new Error(
        `Failed to get available packs: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Handle get active scene request
   */
  private async handleGetActiveScene(): Promise<unknown> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return Promise.resolve({ error: 'Access denied', success: false });
      }

      this.dataAccess.validateFoundryState();
      return await this.dataAccess.getActiveScene();
    } catch (error) {
      throw new Error(
        `Failed to get active scene: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Handle get world info request
   */
  private async handleGetWorldInfo(): Promise<FoundryWorldDetails | QueryErrorResult> {
    try {
      // SECURITY: Silent GM validation
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

  /**
   * Handle ping request
   */
  private handlePing(): unknown {
    return {
      status: 'ok',
      timestamp: Date.now(),
      module: MODULE_ID,
      foundryVersion: game.version,
      worldId: game.world?.id,
      userId: game.user?.id,
    };
  }

  /**
   * Get list of all registered query methods
   */
  getRegisteredMethods(): string[] {
    const modulePrefix = MODULE_ID;
    return Object.keys(CONFIG.queries)
      .filter(key => key.startsWith(modulePrefix))
      .map(key => key.replace(`${modulePrefix}.`, ''));
  }

  /**
   * Test if a specific query handler is registered
   */
  isMethodRegistered(method: string): boolean {
    const queryKey = `${MODULE_ID}.${method}`;
    return queryKey in CONFIG.queries && typeof CONFIG.queries[queryKey] === 'function';
  }

  // ===== PHASE 2: WRITE OPERATION HANDLERS =====

  /**
   * Handle actor creation from specific compendium entry
   */
  private async handleCreateActorFromCompendium(
    data: FoundryCreateActorFromCompendiumRequest
  ): Promise<FoundryActorCreationResult | QueryErrorResult> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      // Clean interface - direct pack/item reference only
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

  /**
   * Handle character progression preview request
   */
  private async handlePreviewCharacterProgression(
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

  /**
   * Handle character advancement option lookup request
   */
  private async handleGetCharacterAdvancementOptions(
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

  /**
   * Handle character advancement choice application request
   */
  private async handleApplyCharacterAdvancementChoice(
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

  /**
   * Handle actor update request
   */
  private async handleUpdateActor(
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

  /**
   * Handle embedded item creation request
   */
  private async handleCreateActorEmbeddedItem(
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

  /**
   * Handle batch embedded item update request
   */
  private async handleBatchUpdateActorEmbeddedItems(
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

  /**
   * Handle embedded item update request
   */
  private async handleUpdateActorEmbeddedItem(
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

  /**
   * Handle embedded item deletion request
   */
  private async handleDeleteActorEmbeddedItem(
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

  /**
   * Handle get compendium document full request
   */
  private async handleGetCompendiumDocumentFull(data: {
    packId: string;
    documentId: string;
  }): Promise<FoundryCompendiumEntryFull | QueryErrorResult> {
    try {
      // SECURITY: Silent GM validation
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

  /**
   * Handle add actors to scene request
   */
  private async handleAddActorsToScene(data: {
    actorIds: string[];
    placement?: 'random' | 'grid' | 'center';
    hidden?: boolean;
  }): Promise<unknown> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      if (!data.actorIds || !Array.isArray(data.actorIds) || data.actorIds.length === 0) {
        throw new Error('actorIds array is required and must not be empty');
      }

      return await this.dataAccess.addActorsToScene({
        actorIds: data.actorIds,
        placement: data.placement ?? 'random',
        hidden: data.hidden ?? false,
      });
    } catch (error) {
      throw new Error(
        `Failed to add actors to scene: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Handle validate write permissions request
   */
  private async handleValidateWritePermissions(data: {
    operation: 'createActor' | 'modifyScene';
  }): Promise<unknown> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      if (!data.operation) {
        throw new Error('operation is required');
      }

      return await this.dataAccess.validateWritePermissions(data.operation);
    } catch (error) {
      throw new Error(
        `Failed to validate write permissions: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Handle journal entry creation
   */
  async handleCreateJournalEntry(
    data: CreateJournalEntryRequest
  ): Promise<FoundryJournalEntryResponse | QueryErrorResult> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      if (!data.name) {
        throw new Error('name is required');
      }
      if (!data.content) {
        throw new Error('content is required');
      }

      return await this.dataAccess.createJournalEntry({
        name: data.name,
        content: data.content,
      });
    } catch (error) {
      throw new Error(
        `Failed to create journal entry: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Handle list journals request
   */
  async handleListJournals(): Promise<FoundryJournalSummary[] | QueryErrorResult> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();
      return await this.dataAccess.listJournals();
    } catch (error) {
      throw new Error(
        `Failed to list journals: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Handle get journal content request
   */
  async handleGetJournalContent(data: {
    journalId: string;
  }): Promise<FoundryJournalEntryResponse | QueryErrorResult> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      if (!data.journalId) {
        throw new Error('journalId is required');
      }

      const journalContent = await this.dataAccess.getJournalContent(data.journalId);
      if (!journalContent) {
        return { error: 'Journal entry not found', success: false };
      }

      return journalContent;
    } catch (error) {
      throw new Error(
        `Failed to get journal content: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Handle update journal content request
   */
  async handleUpdateJournalContent(data: { journalId: string; content: string }): Promise<unknown> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      if (!data.journalId) {
        throw new Error('journalId is required');
      }
      if (!data.content) {
        throw new Error('content is required');
      }

      return await this.dataAccess.updateJournalContent({
        journalId: data.journalId,
        content: data.content,
      });
    } catch (error) {
      throw new Error(
        `Failed to update journal content: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Handle request player rolls - creates interactive roll buttons in chat
   */
  async handleRequestPlayerRolls(data: {
    rollType: string;
    rollTarget: string;
    targetPlayer: string;
    isPublic: boolean;
    rollModifier: string;
    flavor: string;
  }): Promise<unknown> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      if (!data.rollType || !data.rollTarget || !data.targetPlayer) {
        throw new Error('rollType, rollTarget, and targetPlayer are required');
      }

      return await this.dataAccess.requestPlayerRolls(data);
    } catch (error) {
      throw new Error(
        `Failed to request player rolls: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Handle get enhanced creature index request
   */
  async handleGetEnhancedCreatureIndex(): Promise<unknown> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      const creatureIndex = (await this.dataAccess.getEnhancedCreatureIndex()) as unknown;
      return creatureIndex;
    } catch (error) {
      throw new Error(
        `Failed to get enhanced creature index: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Handle campaign progress update request
   */
  handleUpdateCampaignProgress(data: {
    campaignId: string;
    partId: string;
    newStatus: string;
  }): unknown {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      // For now, this is a pass-through to the MCP server
      // In the future, campaign data might be stored in Foundry world flags
      // Currently, the campaign dashboard regeneration happens server-side

      return {
        success: true,
        message: `Campaign progress updated: ${data.partId} is now ${data.newStatus}`,
        campaignId: data.campaignId,
        partId: data.partId,
        newStatus: data.newStatus,
      };
    } catch (error) {
      throw new Error(
        `Failed to update campaign progress: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Handle set actor ownership request
   */
  async handleSetActorOwnership(data: SetActorOwnershipRequest): Promise<unknown> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      if (!data.actorId || !data.userId || data.permission === undefined) {
        throw new Error('actorId, userId, and permission are required');
      }

      return await this.dataAccess.setActorOwnership(data);
    } catch (error) {
      throw new Error(
        `Failed to set actor ownership: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Handle get actor ownership request
   */
  async handleGetActorOwnership(data: GetActorOwnershipRequest): Promise<unknown> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      const actorOwnership = (await this.dataAccess.getActorOwnership(data)) as unknown;
      return actorOwnership;
    } catch (error) {
      throw new Error(
        `Failed to get actor ownership: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Handle get friendly NPCs request
   */
  async handleGetFriendlyNPCs(): Promise<unknown> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      return this.dataAccess.getFriendlyNPCs();
    } catch (error) {
      throw new Error(
        `Failed to get friendly NPCs: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Handle get party characters request
   */
  async handleGetPartyCharacters(): Promise<unknown> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      return this.dataAccess.getPartyCharacters();
    } catch (error) {
      throw new Error(
        `Failed to get party characters: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Handle get connected players request
   */
  async handleGetConnectedPlayers(): Promise<unknown> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      return await this.dataAccess.getConnectedPlayers();
    } catch (error) {
      throw new Error(
        `Failed to get connected players: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Handle find players request
   */
  async handleFindPlayers(
    data: FindPlayersRequest
  ): Promise<Array<{ id: string; name: string }> | QueryErrorResult> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      if (!data.identifier) {
        throw new Error('identifier is required');
      }

      return await this.dataAccess.findPlayers(data);
    } catch (error) {
      throw new Error(
        `Failed to find players: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Handle find actor request
   */
  async handleFindActor(
    data: FindActorRequest
  ): Promise<{ id: string; name: string } | null | QueryErrorResult> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      if (!data.identifier) {
        throw new Error('identifier is required');
      }

      return await this.dataAccess.findActor(data);
    } catch (error) {
      throw new Error(
        `Failed to find actor: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Handle list scenes request
   */
  private async handleListScenes(
    data: ListScenesRequest = {}
  ): Promise<unknown[] | QueryErrorResult> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();
      const scenes = (await Promise.resolve(this.dataAccess.listScenes(data))) as unknown;
      if (!Array.isArray(scenes)) {
        return [];
      }

      return scenes as unknown[];
    } catch (error) {
      throw new Error(
        `Failed to list scenes: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Handle switch scene request
   */
  private async handleSwitchScene(
    data: SwitchSceneRequest
  ): Promise<Record<string, unknown> | QueryErrorResult> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      if (!data.scene_identifier) {
        throw new Error('scene_identifier is required');
      }

      const result = (await this.dataAccess.switchScene(data)) as unknown;
      if (result && typeof result === 'object') {
        return result as Record<string, unknown>;
      }

      return { success: true };
    } catch (error) {
      throw new Error(
        `Failed to switch scene: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Handle map generation request - uses hybrid architecture
   */
  private async handleGenerateMap(
    data: GenerateMapRequest
  ): Promise<Record<string, unknown> | QueryErrorResult> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      if (!data.prompt || typeof data.prompt !== 'string') {
        throw new Error('Prompt is required and must be a string');
      }

      if (!data.scene_name || typeof data.scene_name !== 'string') {
        throw new Error('Scene name is required and must be a string');
      }

      // Get quality setting from module settings
      const qualitySetting = game.settings.get(MODULE_ID, 'mapGenQuality') as unknown;
      const quality =
        typeof qualitySetting === 'string' && qualitySetting.trim() ? qualitySetting : 'low';

      const params = {
        prompt: data.prompt.trim(),
        scene_name: data.scene_name.trim(),
        size: data.size ?? 'medium',
        grid_size: data.grid_size ?? 70,
        quality,
      };

      // Use ComfyUIManager to communicate with backend via WebSocket
      const response = this.parseComfyResponse(await this.comfyuiManager.generateMap(params));
      const isSuccess =
        typeof response.success === 'boolean' ? response.success : response.status === 'success';

      if (!isSuccess) {
        const errorMessage = response.error ?? response.message ?? 'Map generation failed';
        notifyGM('error', `Map generation failed: ${errorMessage}`);
        return {
          error: errorMessage,
          success: false,
          status: response.status ?? 'error',
        };
      }

      notifyGM('info', 'Map generation started');
      return {
        success: true,
        status: response.status ?? 'success',
        jobId: response.jobId,
        message: response.message ?? 'Map generation started',
        estimatedTime: response.estimatedTime ?? '30-90 seconds',
      };
    } catch (error: unknown) {
      notifyGM('error', this.errorMessage(error, 'Map generation failed'));
      return {
        error: this.errorMessage(error, 'Map generation failed'),
        success: false,
      };
    }
  }

  /**
   * Handle map status check request - uses hybrid architecture
   */
  private async handleCheckMapStatus(
    data: MapJobRequest
  ): Promise<Record<string, unknown> | QueryErrorResult> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      if (!data.job_id) {
        throw new Error('Job ID is required');
      }

      // Use ComfyUIManager to communicate with backend via WebSocket
      const response = this.parseComfyResponse(await this.comfyuiManager.checkMapStatus(data));
      const isSuccess =
        typeof response.success === 'boolean' ? response.success : response.status === 'success';

      if (!isSuccess) {
        const errorMessage = response.error ?? response.message ?? 'Status check failed';
        return {
          error: errorMessage,
          success: false,
          status: response.status ?? 'error',
        };
      }

      return {
        success: true,
        status: response.status ?? 'success',
        job: response.job,
      };
    } catch (error: unknown) {
      return {
        error: this.errorMessage(error, 'Status check failed'),
        success: false,
      };
    }
  }

  /**
   * Handle map job cancellation request - uses hybrid architecture
   */
  private async handleCancelMapJob(
    data: MapJobRequest
  ): Promise<Record<string, unknown> | QueryErrorResult> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      if (!data.job_id) {
        throw new Error('Job ID is required');
      }

      // Use ComfyUIManager to communicate with backend via WebSocket
      const response = this.parseComfyResponse(await this.comfyuiManager.cancelMapJob(data));
      const isSuccess =
        typeof response.success === 'boolean' ? response.success : response.status === 'success';

      if (!isSuccess) {
        const errorMessage = response.error ?? response.message ?? 'Job cancellation failed';
        notifyGM('warn', `Map cancellation failed: ${errorMessage}`);
        return {
          error: errorMessage,
          success: false,
          status: response.status ?? 'error',
        };
      }

      return {
        success: true,
        status: response.status ?? 'success',
        message: response.message ?? 'Job cancelled successfully',
      };
    } catch (error: unknown) {
      notifyGM('error', this.errorMessage(error, 'Job cancellation failed'));
      return {
        error: this.errorMessage(error, 'Job cancellation failed'),
        success: false,
      };
    }
  }

  /**
   * Handle upload of generated map image (for remote Foundry instances)
   * Receives base64-encoded image data and saves it to generated-maps folder
   */
  private async handleUploadGeneratedMap(
    data: UploadGeneratedMapRequest
  ): Promise<Record<string, unknown> | QueryErrorResult> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        console.error(`[${MODULE_ID}] Upload denied - not GM`);
        return { error: 'Access denied', success: false };
      }

      if (!data.filename || typeof data.filename !== 'string') {
        console.error(`[${MODULE_ID}] Upload failed - invalid filename`);
        notifyGM('error', 'Map upload failed: filename is missing or invalid');
        throw new Error('Filename is required and must be a string');
      }

      if (!data.imageData || typeof data.imageData !== 'string') {
        console.error(`[${MODULE_ID}] Upload failed - invalid image data`);
        notifyGM('error', 'Map upload failed: image data is missing or invalid');
        throw new Error('Image data is required and must be a base64 string');
      }

      // Validate filename for security (prevent path traversal)
      const safeFilename = data.filename.replace(/[^a-zA-Z0-9_.-]/g, '_');
      if (
        !safeFilename.endsWith('.png') &&
        !safeFilename.endsWith('.jpg') &&
        !safeFilename.endsWith('.jpeg')
      ) {
        notifyGM('error', 'Map upload failed: only PNG and JPEG are supported');
        throw new Error('Only PNG and JPEG images are supported');
      }

      // Convert base64 to Blob
      const byteCharacters = atob(data.imageData);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'image/png' });

      // Create a File object from the Blob
      const file = new File([blob], safeFilename, { type: 'image/png' });

      // Upload to world-specific folder so maps persist even if module is deleted
      // This also keeps maps organized per world
      const worldId = (game as { world?: { id?: string } }).world?.id ?? 'unknown-world';
      const uploadPath = `worlds/${worldId}/ai-generated-maps`;

      type FilePickerAPIType = {
        createDirectory: (
          source: string,
          target: string,
          options?: { bucket?: string | null }
        ) => Promise<unknown>;
        upload: (
          source: string,
          target: string,
          file: File,
          body?: Record<string, unknown>,
          options?: { notify?: boolean }
        ) => Promise<{ path?: string }>;
      };

      const root = globalThis as {
        foundry?: {
          applications?: {
            apps?: {
              FilePicker?: {
                implementation?: FilePickerAPIType;
              };
            };
          };
        };
        FilePicker?: FilePickerAPIType;
      };

      const filePickerAPI =
        root.foundry?.applications?.apps?.FilePicker?.implementation ?? root.FilePicker;

      if (!filePickerAPI) {
        throw new Error('Foundry FilePicker API is unavailable');
      }

      try {
        // Use the modern Foundry API (v13+) with fallback for older versions
        await filePickerAPI.createDirectory('data', uploadPath, { bucket: null });
      } catch (dirError: unknown) {
        // Directory might already exist, that's okay
        const dirErrorMessage = this.errorMessage(dirError, 'Directory creation failed');
        if (!dirErrorMessage.includes('EEXIST') && !dirErrorMessage.includes('already exists')) {
          notifyGM('warn', `Map upload directory warning: ${dirErrorMessage}`);
          console.warn(`[${MODULE_ID}] Directory creation warning:`, dirErrorMessage);
        }
      }

      // Upload using Foundry's FilePicker.upload method with modern API
      const response = await filePickerAPI.upload('data', uploadPath, file, {}, { notify: false });

      notifyGM('info', `Map uploaded: ${safeFilename}`);
      return {
        success: true,
        path: response.path,
        filename: safeFilename,
        message: `Map uploaded successfully to ${response.path}`,
      };
    } catch (error: unknown) {
      console.error(`[${MODULE_ID}] Failed to upload generated map:`, error);
      notifyGM('error', this.errorMessage(error, 'Failed to upload generated map'));
      return {
        error: this.errorMessage(error, 'Failed to upload generated map'),
        success: false,
      };
    }
  }

  // ===== PHASE 7: TOKEN MANIPULATION HANDLERS =====

  /**
   * Handle move token request
   */
  private async handleMoveToken(data: {
    tokenId: string;
    x: number;
    y: number;
    animate?: boolean;
  }): Promise<unknown> {
    try {
      // SECURITY: Silent GM validation
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

      const moveResult = (await this.dataAccess.moveToken(data)) as unknown;
      return moveResult;
    } catch (error) {
      throw new Error(
        `Failed to move token: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Handle update token request
   */
  private async handleUpdateToken(data: {
    tokenId: string;
    updates: Record<string, unknown>;
  }): Promise<unknown> {
    try {
      // SECURITY: Silent GM validation
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

      const updateResult = (await this.dataAccess.updateToken(data)) as unknown;
      return updateResult;
    } catch (error) {
      throw new Error(
        `Failed to update token: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Handle delete tokens request
   */
  private async handleDeleteTokens(data: { tokenIds: string[] }): Promise<unknown> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      if (!data.tokenIds || !Array.isArray(data.tokenIds) || data.tokenIds.length === 0) {
        throw new Error('tokenIds array is required and must not be empty');
      }

      const deleteResult = (await this.dataAccess.deleteTokens(data)) as unknown;
      return deleteResult;
    } catch (error) {
      throw new Error(
        `Failed to delete tokens: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Handle get token details request
   */
  private handleGetTokenDetails(data: { tokenId: string }): Promise<unknown> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return Promise.resolve({ error: 'Access denied', success: false });
      }

      this.dataAccess.validateFoundryState();

      if (!data.tokenId) {
        throw new Error('tokenId is required');
      }

      const tokenDetails = this.dataAccess.getTokenDetails(data) as unknown;
      return Promise.resolve(tokenDetails);
    } catch (error) {
      throw new Error(
        `Failed to get token details: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Handle toggle token condition request
   */
  private async handleToggleTokenCondition(data: {
    tokenId: string;
    conditionId: string;
    active: boolean;
  }): Promise<unknown> {
    try {
      // SECURITY: Silent GM validation
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

      const toggleResult = (await this.dataAccess.toggleTokenCondition(data)) as unknown;
      return toggleResult;
    } catch (error) {
      throw new Error(
        `Failed to toggle token condition: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Handle get available conditions request
   */
  private handleGetAvailableConditions(): Promise<unknown> {
    try {
      // SECURITY: Silent GM validation
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return Promise.resolve({ error: 'Access denied', success: false });
      }

      this.dataAccess.validateFoundryState();

      const conditions = this.dataAccess.getAvailableConditions() as unknown;
      return Promise.resolve(conditions);
    } catch (error) {
      throw new Error(
        `Failed to get available conditions: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Handle use item request (cast spell, use ability, consume item, etc.)
   */
  private async handleUseItem(data: {
    actorIdentifier: string;
    itemIdentifier: string;
    targets?: string[];
    options?: {
      consume?: boolean;
      configureDialog?: boolean;
      spellLevel?: number;
      versatile?: boolean;
    };
  }): Promise<unknown> {
    try {
      // SECURITY: Silent GM validation
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

  /**
   * Handle search character items request
   */
  private async handleSearchCharacterItems(
    data: FoundrySearchCharacterItemsRequest
  ): Promise<unknown> {
    try {
      // SECURITY: Silent GM validation
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
