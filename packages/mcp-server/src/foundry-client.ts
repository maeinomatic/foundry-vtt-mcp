import { Logger } from './logger.js';
import { Config } from './config.js';
import { FoundryConnector } from './foundry-connector.js';
import type {
  FoundryApplyCharacterAdvancementChoiceRequest,
  FoundryApplyCharacterAdvancementChoiceResponse,
  FoundryApplyCharacterPatchTransactionRequest,
  FoundryApplyCharacterPatchTransactionResponse,
  FoundryActorSummary,
  FoundryActorCreationResult,
  FoundryBatchUpdateActorEmbeddedItemsRequest,
  FoundryBatchUpdateActorEmbeddedItemsResponse,
  FoundryBridgeMessage,
  FoundryBridgeQueryRequest,
  FoundryBridgeResponseEnvelope,
  FoundryCharacterInfo,
  FoundryCompendiumEntryFull,
  FoundryCompendiumPackSummary,
  FoundryCompendiumSearchRequest,
  FoundryCompendiumSearchResult,
  FoundryConnectionInfo,
  FoundryCreateActorFromCompendiumRequest,
  FoundryCreateCharacterActorRequest,
  FoundryCreateCharacterActorResponse,
  FoundryCreateActorEmbeddedItemRequest,
  FoundryCreateActorEmbeddedItemResponse,
  FoundryCreateCharacterCompanionRequest,
  FoundryCreateCharacterCompanionResponse,
  FoundryCreateCompendiumItemRequest,
  FoundryCreateCompendiumItemResponse,
  FoundryCreateWorldItemRequest,
  FoundryCreateWorldItemResponse,
  FoundryCreatureSearchCriteria,
  FoundryCreatureSearchEnvelope,
  FoundryDeleteCharacterCompanionRequest,
  FoundryDeleteCharacterCompanionResponse,
  FoundryDeleteActorEmbeddedItemRequest,
  FoundryDeleteActorEmbeddedItemResponse,
  FoundryDismissCharacterCompanionRequest,
  FoundryDismissCharacterCompanionResponse,
  FoundryConfigureCharacterCompanionSummonRequest,
  FoundryConfigureCharacterCompanionSummonResponse,
  FoundryGetCharacterAdvancementOptionsRequest,
  FoundryGetCharacterAdvancementOptionsResponse,
  FoundryGetCharacterInfoRequest,
  FoundryGetCompendiumDocumentRequest,
  FoundryImportItemToCompendiumRequest,
  FoundryImportItemToCompendiumResponse,
  FoundryListCharacterCompanionsRequest,
  FoundryListCharacterCompanionsResponse,
  FoundryListActorsRequest,
  FoundryPreviewCharacterProgressionRequest,
  FoundryPreviewCharacterProgressionResponse,
  FoundryRunDnD5eSummonActivityRequest,
  FoundryRunDnD5eSummonActivityResponse,
  FoundrySearchCharacterItemsRequest,
  FoundrySearchCharacterItemsResponse,
  FoundrySummonCharacterCompanionRequest,
  FoundrySummonCharacterCompanionResponse,
  FoundryRunCharacterRestWorkflowRequest,
  FoundryRunCharacterRestWorkflowResponse,
  FoundrySyncCharacterCompanionProgressionRequest,
  FoundrySyncCharacterCompanionProgressionResponse,
  FoundryUnlinkCharacterCompanionRequest,
  FoundryUnlinkCharacterCompanionResponse,
  FoundryUpdateActorRequest,
  FoundryUpdateActorEmbeddedItemRequest,
  FoundryUpdateActorEmbeddedItemResponse,
  FoundryUpdateActorResponse,
  FoundryUpdateCharacterCompanionLinkRequest,
  FoundryUpdateCharacterCompanionLinkResponse,
  FoundryValidateCharacterBuildRequest,
  FoundryValidateCharacterBuildResponse,
  FoundryUpdateWorldItemRequest,
  FoundryUpdateWorldItemResponse,
  UnknownRecord,
} from './foundry-types.js';

export interface FoundryQuery<TData = unknown> extends FoundryBridgeQueryRequest<TData> {}

export interface FoundryResponse<TData = unknown> extends FoundryBridgeResponseEnvelope<TData> {}

const asRecord = (value: unknown): UnknownRecord | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as UnknownRecord;
};

const toStringValue = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

export class FoundryClient {
  private logger: Logger;
  private config: Config['foundry'];
  private connector: FoundryConnector;

  constructor(
    config: Config['foundry'],
    logger: Logger,
    onConnectionStateChange?: (state: 'connected' | 'disconnected') => void
  ) {
    this.config = config;
    this.logger = logger.child({ component: 'FoundryClient' });

    // Initialize the socket connector
    this.connector = new FoundryConnector({
      config: this.config,
      logger: this.logger,
      onConnectionStateChange,
    });
  }

  async connect(): Promise<void> {
    this.logger.info('Starting Foundry connector socket.io server');

    try {
      // Start the socket.io server that Foundry will connect to
      await this.connector.start();
      this.logger.info('Foundry connector started, waiting for module connection...');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown connection error';
      this.logger.error('Failed to start Foundry connector', { error: errorMessage });
      throw new Error(`Failed to start Foundry connector: ${errorMessage}`);
    }
  }

  disconnect(): void {
    this.logger.info('Stopping Foundry connector...');
    this.connector.stop().catch(error => {
      this.logger.error('Error stopping connector', error);
    });
  }

  getConnectionType(): 'websocket' | 'webrtc' | null {
    return this.connector.getConnectionType();
  }

  async query(
    method: 'maeinomatic-foundry-mcp.getCharacterInfo',
    data: FoundryGetCharacterInfoRequest
  ): Promise<FoundryCharacterInfo<UnknownRecord, UnknownRecord, UnknownRecord>>;
  async query(
    method: 'maeinomatic-foundry-mcp.searchCharacterItems',
    data: FoundrySearchCharacterItemsRequest
  ): Promise<FoundrySearchCharacterItemsResponse>;
  async query(
    method: 'maeinomatic-foundry-mcp.updateActor',
    data: FoundryUpdateActorRequest
  ): Promise<FoundryUpdateActorResponse>;
  async query(
    method: 'maeinomatic-foundry-mcp.createActorEmbeddedItem',
    data: FoundryCreateActorEmbeddedItemRequest
  ): Promise<FoundryCreateActorEmbeddedItemResponse>;
  async query(
    method: 'maeinomatic-foundry-mcp.createCharacterCompanion',
    data: FoundryCreateCharacterCompanionRequest
  ): Promise<FoundryCreateCharacterCompanionResponse>;
  async query(
    method: 'maeinomatic-foundry-mcp.updateCharacterCompanionLink',
    data: FoundryUpdateCharacterCompanionLinkRequest
  ): Promise<FoundryUpdateCharacterCompanionLinkResponse>;
  async query(
    method: 'maeinomatic-foundry-mcp.listCharacterCompanions',
    data: FoundryListCharacterCompanionsRequest
  ): Promise<FoundryListCharacterCompanionsResponse>;
  async query(
    method: 'maeinomatic-foundry-mcp.configureCharacterCompanionSummon',
    data: FoundryConfigureCharacterCompanionSummonRequest
  ): Promise<FoundryConfigureCharacterCompanionSummonResponse>;
  async query(
    method: 'maeinomatic-foundry-mcp.summonCharacterCompanion',
    data: FoundrySummonCharacterCompanionRequest
  ): Promise<FoundrySummonCharacterCompanionResponse>;
  async query(
    method: 'maeinomatic-foundry-mcp.dismissCharacterCompanion',
    data: FoundryDismissCharacterCompanionRequest
  ): Promise<FoundryDismissCharacterCompanionResponse>;
  async query(
    method: 'maeinomatic-foundry-mcp.unlinkCharacterCompanion',
    data: FoundryUnlinkCharacterCompanionRequest
  ): Promise<FoundryUnlinkCharacterCompanionResponse>;
  async query(
    method: 'maeinomatic-foundry-mcp.deleteCharacterCompanion',
    data: FoundryDeleteCharacterCompanionRequest
  ): Promise<FoundryDeleteCharacterCompanionResponse>;
  async query(
    method: 'maeinomatic-foundry-mcp.syncCharacterCompanionProgression',
    data: FoundrySyncCharacterCompanionProgressionRequest
  ): Promise<FoundrySyncCharacterCompanionProgressionResponse>;
  async query(
    method: 'maeinomatic-foundry-mcp.batchUpdateActorEmbeddedItems',
    data: FoundryBatchUpdateActorEmbeddedItemsRequest
  ): Promise<FoundryBatchUpdateActorEmbeddedItemsResponse>;
  async query(
    method: 'maeinomatic-foundry-mcp.previewCharacterProgression',
    data: FoundryPreviewCharacterProgressionRequest
  ): Promise<FoundryPreviewCharacterProgressionResponse>;
  async query(
    method: 'maeinomatic-foundry-mcp.getCharacterAdvancementOptions',
    data: FoundryGetCharacterAdvancementOptionsRequest
  ): Promise<FoundryGetCharacterAdvancementOptionsResponse>;
  async query(
    method: 'maeinomatic-foundry-mcp.applyCharacterAdvancementChoice',
    data: FoundryApplyCharacterAdvancementChoiceRequest
  ): Promise<FoundryApplyCharacterAdvancementChoiceResponse>;
  async query(
    method: 'maeinomatic-foundry-mcp.validateCharacterBuild',
    data: FoundryValidateCharacterBuildRequest
  ): Promise<FoundryValidateCharacterBuildResponse>;
  async query(
    method: 'maeinomatic-foundry-mcp.runCharacterRestWorkflow',
    data: FoundryRunCharacterRestWorkflowRequest
  ): Promise<FoundryRunCharacterRestWorkflowResponse>;
  async query(
    method: 'maeinomatic-foundry-mcp.runDnD5eSummonActivity',
    data: FoundryRunDnD5eSummonActivityRequest
  ): Promise<FoundryRunDnD5eSummonActivityResponse>;
  async query(
    method: 'maeinomatic-foundry-mcp.updateActorEmbeddedItem',
    data: FoundryUpdateActorEmbeddedItemRequest
  ): Promise<FoundryUpdateActorEmbeddedItemResponse>;
  async query(
    method: 'maeinomatic-foundry-mcp.applyCharacterPatchTransaction',
    data: FoundryApplyCharacterPatchTransactionRequest
  ): Promise<FoundryApplyCharacterPatchTransactionResponse>;
  async query(
    method: 'maeinomatic-foundry-mcp.deleteActorEmbeddedItem',
    data: FoundryDeleteActorEmbeddedItemRequest
  ): Promise<FoundryDeleteActorEmbeddedItemResponse>;
  async query(
    method: 'maeinomatic-foundry-mcp.createWorldItem',
    data: FoundryCreateWorldItemRequest
  ): Promise<FoundryCreateWorldItemResponse>;
  async query(
    method: 'maeinomatic-foundry-mcp.updateWorldItem',
    data: FoundryUpdateWorldItemRequest
  ): Promise<FoundryUpdateWorldItemResponse>;
  async query(
    method: 'maeinomatic-foundry-mcp.createCompendiumItem',
    data: FoundryCreateCompendiumItemRequest
  ): Promise<FoundryCreateCompendiumItemResponse>;
  async query(
    method: 'maeinomatic-foundry-mcp.importItemToCompendium',
    data: FoundryImportItemToCompendiumRequest
  ): Promise<FoundryImportItemToCompendiumResponse>;
  async query(
    method: 'maeinomatic-foundry-mcp.searchCompendium',
    data: FoundryCompendiumSearchRequest
  ): Promise<FoundryCompendiumSearchResult<UnknownRecord>[]>;
  async query(
    method: 'maeinomatic-foundry-mcp.listCreaturesByCriteria',
    data: FoundryCreatureSearchCriteria
  ): Promise<FoundryCreatureSearchEnvelope<UnknownRecord>>;
  async query(
    method: 'maeinomatic-foundry-mcp.getCompendiumDocumentFull',
    data: FoundryGetCompendiumDocumentRequest
  ): Promise<FoundryCompendiumEntryFull<UnknownRecord, UnknownRecord, UnknownRecord> | null>;
  async query(
    method: 'maeinomatic-foundry-mcp.createActorFromCompendium',
    data: FoundryCreateActorFromCompendiumRequest
  ): Promise<FoundryActorCreationResult>;
  async query(
    method: 'maeinomatic-foundry-mcp.createCharacterActor',
    data: FoundryCreateCharacterActorRequest
  ): Promise<FoundryCreateCharacterActorResponse>;
  async query(
    method: 'maeinomatic-foundry-mcp.listActors',
    data?: FoundryListActorsRequest
  ): Promise<FoundryActorSummary[]>;
  async query(
    method: 'maeinomatic-foundry-mcp.getPartyCharacters',
    data?: Record<string, never>
  ): Promise<Array<{ id: string; name: string }>>;
  async query(
    method: 'maeinomatic-foundry-mcp.getAvailablePacks',
    data?: undefined
  ): Promise<FoundryCompendiumPackSummary[]>;
  async query<TResult = unknown, TData = unknown>(method: string, data?: TData): Promise<TResult>;

  async query(method: string, data?: unknown): Promise<unknown> {
    if (!this.connector.isConnected()) {
      throw new Error(
        'Foundry VTT module not connected. Please ensure Foundry is running and the MCP Bridge module is enabled.'
      );
    }

    this.logger.debug('Sending query to Foundry module', { method, data });

    try {
      const result = await this.connector.query(method, data);
      this.logger.debug('Query successful', { method, hasResult: !!result });
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown query error';
      this.logger.error('Query failed', { method, error: errorMessage });
      throw new Error(`Query ${method} failed: ${errorMessage}`);
    }
  }

  ping(): Promise<unknown> {
    return this.query('maeinomatic-foundry-mcp.ping');
  }

  getConnectionInfo(): FoundryConnectionInfo {
    return this.connector.getConnectionInfo();
  }

  getConnectionState(): string {
    return this.connector.isConnected() ? 'connected' : 'disconnected';
  }

  isReady(): boolean {
    return this.connector.isConnected();
  }

  sendMessage(message: FoundryBridgeMessage | UnknownRecord): void {
    const messageData = asRecord(message);
    this.logger.debug('Sending message to Foundry', {
      type: toStringValue(messageData?.type),
      requestId: toStringValue(messageData?.requestId),
    });
    this.connector.sendToFoundry(message);
  }

  broadcastMessage(message: FoundryBridgeMessage | UnknownRecord): void {
    const messageData = asRecord(message);
    this.logger.debug('Broadcasting message to Foundry', {
      type: toStringValue(messageData?.type),
    });
    this.connector.broadcastMessage(message);
  }

  isConnected(): boolean {
    return this.connector.isConnected();
  }
}
