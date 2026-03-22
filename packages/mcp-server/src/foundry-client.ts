import { Logger } from './logger.js';
import { Config } from './config.js';
import { FoundryConnector } from './foundry-connector.js';
import type {
  FoundryActorSummary,
  FoundryBridgeMessage,
  FoundryBridgeQueryRequest,
  FoundryBridgeResponseEnvelope,
  FoundryCharacterInfo,
  FoundryCompendiumEntryFull,
  FoundryCompendiumPackSummary,
  FoundryCompendiumSearchRequest,
  FoundryCompendiumSearchResult,
  FoundryConnectionInfo,
  FoundryCreatureSearchCriteria,
  FoundryCreatureSearchEnvelope,
  FoundryGetCharacterInfoRequest,
  FoundryGetCompendiumDocumentRequest,
  FoundryListActorsRequest,
  FoundrySearchCharacterItemsRequest,
  FoundrySearchCharacterItemsResponse,
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

  constructor(config: Config['foundry'], logger: Logger) {
    this.config = config;
    this.logger = logger.child({ component: 'FoundryClient' });

    // Initialize the socket connector
    this.connector = new FoundryConnector({
      config: this.config,
      logger: this.logger,
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
    method: 'foundry-mcp-bridge.getCharacterInfo',
    data: FoundryGetCharacterInfoRequest
  ): Promise<FoundryCharacterInfo<UnknownRecord, UnknownRecord, UnknownRecord>>;
  async query(
    method: 'foundry-mcp-bridge.searchCharacterItems',
    data: FoundrySearchCharacterItemsRequest
  ): Promise<FoundrySearchCharacterItemsResponse>;
  async query(
    method: 'foundry-mcp-bridge.searchCompendium',
    data: FoundryCompendiumSearchRequest
  ): Promise<FoundryCompendiumSearchResult<UnknownRecord>[]>;
  async query(
    method: 'foundry-mcp-bridge.listCreaturesByCriteria',
    data: FoundryCreatureSearchCriteria
  ): Promise<FoundryCreatureSearchEnvelope<UnknownRecord>>;
  async query(
    method: 'foundry-mcp-bridge.getCompendiumDocumentFull',
    data: FoundryGetCompendiumDocumentRequest
  ): Promise<FoundryCompendiumEntryFull<UnknownRecord, UnknownRecord, UnknownRecord> | null>;
  async query(
    method: 'foundry-mcp-bridge.listActors',
    data?: FoundryListActorsRequest
  ): Promise<FoundryActorSummary[]>;
  async query(
    method: 'foundry-mcp-bridge.getAvailablePacks',
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
    return this.query('foundry-mcp-bridge.ping');
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
