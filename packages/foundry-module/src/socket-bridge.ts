import { CONNECTION_STATES } from './constants.js';
import { debugGM, notifyGM } from './gm-notifications.js';
import { WebRTCConnection, type WebRTCConfig } from './webrtc-connection.js';

export interface BridgeConfig {
  enabled: boolean;
  serverHost: string;
  serverPort: number;
  namespace: string;
  reconnectAttempts: number;
  reconnectDelay: number;
  connectionTimeout: number;
  debugLogging: boolean;
  connectionType?: 'auto' | 'webrtc' | 'websocket'; // Connection type: auto (HTTPS→WebRTC, HTTP→WebSocket), webrtc, websocket
}

type MCPBridgeMessage = {
  type: string;
  id?: string;
  data?: unknown;
};

type MCPQueryPayload = {
  method: string;
  data?: unknown;
};

type ProgressQueueInfo = {
  currentStep?: number;
  totalSteps?: number;
  estimatedTimeRemaining?: number;
};

type ProgressUpdate = {
  progress?: number;
  status?: string;
  queueInfo?: ProgressQueueInfo;
};

type WallData = {
  c?: unknown;
  movement?: number;
  sight?: number;
  direction?: number;
  door?: number;
  doorState?: number;
  flags?: Record<string, unknown>;
};

type SceneData = {
  name?: string;
  img?: string;
  walls?: WallData[];
  folder?: string;
  [key: string]: unknown;
};

type JobCompletedData = {
  result?: SceneData;
  image_path?: string;
};

type SceneLike = {
  name?: string;
  img?: string;
  update: (data: Record<string, unknown>) => Promise<unknown>;
  activate: () => Promise<unknown>;
  createEmbeddedDocuments: (
    embeddedName: string,
    docs: Array<Record<string, unknown>>
  ) => Promise<unknown>;
};

type FolderLike = {
  id: string;
  name: string;
  type: string;
};

type QueryHandler = (payload: unknown) => unknown;

/**
 * Browser-compatible socket bridge that supports both WebSocket and WebRTC
 */
export class SocketBridge {
  private ws: WebSocket | null = null;
  private webrtc: WebRTCConnection | null = null;
  private connectionState: string = CONNECTION_STATES.DISCONNECTED;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private activeConnectionType: 'websocket' | 'webrtc' | null = null;

  constructor(private config: BridgeConfig) {
    this.maxReconnectAttempts = config.reconnectAttempts;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Unknown error';
  }

  private parseMessageEvent(raw: unknown): MCPBridgeMessage | null {
    if (typeof raw !== 'string') {
      return null;
    }

    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== 'object') {
        return null;
      }

      const record = parsed as Record<string, unknown>;
      if (typeof record.type !== 'string') {
        return null;
      }

      const message: MCPBridgeMessage = {
        type: record.type,
      };

      if (typeof record.id === 'string') {
        message.id = record.id;
      }
      if ('data' in record) {
        message.data = record.data;
      }

      return message;
    } catch {
      return null;
    }
  }

  private asMcpQueryPayload(data: unknown): MCPQueryPayload | null {
    if (!data || typeof data !== 'object') {
      return null;
    }

    const record = data as Record<string, unknown>;
    if (typeof record.method !== 'string') {
      return null;
    }

    return {
      method: record.method,
      data: record.data,
    };
  }

  private asProgressUpdate(data: unknown): ProgressUpdate | null {
    if (!data || typeof data !== 'object') {
      return null;
    }

    const record = data as Record<string, unknown>;
    const queueInfoRaw = record.queueInfo;
    let queueInfo: ProgressQueueInfo | undefined;

    if (queueInfoRaw && typeof queueInfoRaw === 'object') {
      const q = queueInfoRaw as Record<string, unknown>;
      const parsedQueueInfo: ProgressQueueInfo = {};
      if (typeof q.currentStep === 'number') {
        parsedQueueInfo.currentStep = q.currentStep;
      }
      if (typeof q.totalSteps === 'number') {
        parsedQueueInfo.totalSteps = q.totalSteps;
      }
      if (typeof q.estimatedTimeRemaining === 'number') {
        parsedQueueInfo.estimatedTimeRemaining = q.estimatedTimeRemaining;
      }
      queueInfo = parsedQueueInfo;
    }

    const parsedProgress: ProgressUpdate = {};
    if (typeof record.progress === 'number') {
      parsedProgress.progress = record.progress;
    }
    if (typeof record.status === 'string') {
      parsedProgress.status = record.status;
    }
    if (queueInfo) {
      parsedProgress.queueInfo = queueInfo;
    }

    return parsedProgress;
  }

  private asJobCompletedData(data: unknown): JobCompletedData | null {
    if (!data || typeof data !== 'object') {
      return null;
    }

    const record = data as Record<string, unknown>;
    const resultRaw = record.result;
    let result: SceneData | undefined;
    if (resultRaw && typeof resultRaw === 'object') {
      result = resultRaw as SceneData;
    }

    const parsedCompletion: JobCompletedData = {};
    if (result) {
      parsedCompletion.result = result;
    }
    if (typeof record.image_path === 'string') {
      parsedCompletion.image_path = record.image_path;
    }

    return parsedCompletion;
  }

  private getSceneConstructor(): { create: (data: SceneData) => Promise<SceneLike> } | null {
    const root = globalThis as { Scene?: { create: (data: SceneData) => Promise<SceneLike> } };
    return root.Scene ?? null;
  }

  private getFolderConstructor(): {
    create: (data: Record<string, unknown>) => Promise<FolderLike | null>;
  } | null {
    const root = globalThis as {
      Folder?: { create: (data: Record<string, unknown>) => Promise<FolderLike | null> };
    };
    return root.Folder ?? null;
  }

  private isWallCoordinates(value: unknown): value is [number, number, number, number] {
    if (!Array.isArray(value) || value.length !== 4) {
      return false;
    }
    return value.every(coord => typeof coord === 'number' && !Number.isNaN(coord));
  }

  async connect(): Promise<void> {
    if (
      this.connectionState === CONNECTION_STATES.CONNECTED ||
      this.connectionState === CONNECTION_STATES.CONNECTING
    ) {
      return;
    }

    this.connectionState = CONNECTION_STATES.CONNECTING;
    this.log('Connecting to MCP server...');

    // Determine connection type
    const connectionType = this.determineConnectionType();
    this.log(`Using connection type: ${connectionType}`);

    if (connectionType === 'webrtc') {
      await this.connectWebRTC();
    } else {
      await this.connectWebSocket();
    }
  }

  private determineConnectionType(): 'websocket' | 'webrtc' {
    const configType = this.config.connectionType ?? 'auto';

    if (configType === 'auto') {
      // Use WebRTC for HTTPS (secure), WebSocket for HTTP (localhost)
      // WebRTC provides P2P encrypted channel without needing SSL certificates
      const isHttps = window.location.protocol === 'https:';
      const type = isHttps ? 'webrtc' : 'websocket';
      this.log(`Auto-detected connection type: ${type} (page is ${window.location.protocol})`);
      return type;
    }

    // Use explicit connection type from config
    return configType as 'websocket' | 'webrtc';
  }

  private async connectWebRTC(): Promise<void> {
    this.activeConnectionType = 'webrtc';

    const webrtcConfig: WebRTCConfig = {
      serverHost: this.config.serverHost,
      serverPort: this.config.serverPort,
      namespace: this.config.namespace,
      stunServers: [], // Empty for localhost - must match server configuration
      connectionTimeout: this.config.connectionTimeout,
      debugLogging: this.config.debugLogging,
    };

    this.webrtc = new WebRTCConnection(webrtcConfig);

    try {
      await this.webrtc.connect(this.handleMessage.bind(this));
      this.connectionState = CONNECTION_STATES.CONNECTED;
      this.reconnectAttempts = 0;
      this.log('Connected via WebRTC');
    } catch (error) {
      this.log(`WebRTC connection failed: ${this.errorMessage(error)}`);
      this.connectionState = CONNECTION_STATES.DISCONNECTED;
      this.scheduleReconnect();
      throw error;
    }
  }

  private async connectWebSocket(): Promise<void> {
    this.activeConnectionType = 'websocket';

    // WebSocket for HTTP localhost connections only
    const protocol = 'ws';
    const host = this.config.serverHost;
    this.log(`Using WebSocket (${protocol}://${host}:${this.config.serverPort})`);

    const wsUrl = `${protocol}://${host}:${this.config.serverPort}${this.config.namespace}`;

    return new Promise((resolve, reject) => {
      const connectTimeout = setTimeout(() => {
        this.log('Connection timeout');
        this.connectionState = CONNECTION_STATES.DISCONNECTED;
        reject(new Error('Connection timeout'));
      }, this.config.connectionTimeout * 1000);

      try {
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = (): void => {
          clearTimeout(connectTimeout);
          this.connectionState = CONNECTION_STATES.CONNECTED;
          this.reconnectAttempts = 0;
          this.log('Connected to MCP server via WebSocket');
          this.setupEventHandlers();
          resolve();
        };

        this.ws.onerror = (_error: Event): void => {
          clearTimeout(connectTimeout);
          // Use more informative message for connection failures
          const isFirstAttempt = this.reconnectAttempts === 0;
          const errorMsg = isFirstAttempt
            ? "MCP server not available (this is normal if server isn't running)"
            : `Connection error after ${this.reconnectAttempts} attempts`;
          this.log(errorMsg);
          this.connectionState = CONNECTION_STATES.DISCONNECTED;
          this.scheduleReconnect();
          reject(new Error('WebSocket connection failed'));
        };

        this.ws.onclose = (event: CloseEvent): void => {
          this.log(`Disconnected: ${event.reason ?? 'Connection closed'}`);
          this.connectionState = CONNECTION_STATES.DISCONNECTED;

          if (event.wasClean) {
            // Clean disconnect, don't reconnect
            return;
          }

          this.scheduleReconnect();
        };
      } catch (error) {
        clearTimeout(connectTimeout);
        this.log(`Failed to create WebSocket: ${this.errorMessage(error)}`);
        this.connectionState = CONNECTION_STATES.DISCONNECTED;
        reject(error);
      }
    });
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.webrtc) {
      this.webrtc.disconnect();
      this.webrtc = null;
    }

    if (this.ws) {
      this.ws.close(1000, 'Manual disconnect');
      this.ws = null;
    }

    this.activeConnectionType = null;
    this.connectionState = CONNECTION_STATES.DISCONNECTED;
    this.log('Disconnected from MCP server');
  }

  private setupEventHandlers(): void {
    if (!this.ws) return;

    this.ws.onmessage = (event: MessageEvent): void => {
      const message = this.parseMessageEvent(event.data);
      if (!message) {
        this.log('Failed to parse incoming message');
        return;
      }

      void this.handleMessage(message);
    };
  }

  private async handleMessage(message: MCPBridgeMessage): Promise<void> {
    try {
      if (message.type === 'mcp-query') {
        const payload = this.asMcpQueryPayload(message.data);
        if (!payload) {
          throw new Error('Invalid mcp-query payload');
        }

        await this.handleMCPQuery(payload, response => {
          this.sendMessage({
            type: 'mcp-response',
            id: message.id,
            data: response,
          });
        });
      } else if (message.type === 'ping') {
        this.sendMessage({
          type: 'pong',
          id: message.id,
          data: { timestamp: Date.now(), status: 'ok' },
        });
      } else if (message.type === 'job-completed') {
        await this.handleJobCompleted(message.data);
      } else if (message.type === 'map-generation-progress') {
        this.handleProgressUpdate(message.data);
      }
    } catch (error) {
      console.error(`[foundry-mcp-bridge] ERROR in handleMessage:`, error);
      this.log(`Error handling message: ${this.errorMessage(error)}`);
    }
  }

  private handleProgressUpdate(data: unknown): void {
    try {
      const progressData = this.asProgressUpdate(data);
      if (!progressData) {
        return;
      }

      // Build progress message
      let message = `Generating battlemap: ${progressData.progress ?? 0}%`;

      if (progressData.queueInfo) {
        const { currentStep, totalSteps, estimatedTimeRemaining } = progressData.queueInfo;
        if (currentStep !== undefined && totalSteps !== undefined) {
          message += ` (Step ${currentStep}/${totalSteps})`;
        }
        if (estimatedTimeRemaining) {
          const minutes = Math.floor(estimatedTimeRemaining / 60);
          const seconds = Math.floor(estimatedTimeRemaining % 60);
          if (minutes > 0) {
            message += ` - ${minutes}m ${seconds}s remaining`;
          } else {
            message += ` - ${seconds}s remaining`;
          }
        }
      }

      if (progressData.status) {
        message += ` - ${progressData.status}`;
      }

      // Show as banner notification to GM only
      notifyGM('info', message);

      this.log(`Progress: ${message}`);
    } catch (error) {
      console.error(`[foundry-mcp-bridge] Error handling progress update:`, error);
    }
  }

  private async handleMCPQuery(
    data: MCPQueryPayload,
    callback: (response: { success: boolean; data?: unknown; error?: string }) => void
  ): Promise<void> {
    try {
      this.log(`Handling MCP query: ${data.method}`);

      // Check if the query handler exists in CONFIG.queries
      const queryKey = data.method;
      const handler = CONFIG.queries[queryKey] as QueryHandler | undefined;

      if (!handler) {
        throw new Error(`No handler found for query: ${data.method}`);
      }

      // Execute the query handler
      const result = await handler(data.data ?? {});

      this.log(`Query completed: ${data.method}`);
      callback({ success: true, data: result });
    } catch (error) {
      this.log(
        `Query failed: ${data.method} - ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      callback({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private async handleJobCompleted(data: unknown): Promise<void> {
    try {
      const completionData = this.asJobCompletedData(data);

      // Handle mapgen-style data structure
      if (!completionData?.result) {
        throw new Error('No scene result data provided');
      }

      if (!completionData.image_path) {
        throw new Error('No image path provided for scene creation');
      }

      // Use the complete scene data from backend (like mapgen does)
      const sceneData = completionData.result;

      // Ensure "AI Generated Maps" folder exists and get its ID
      const folderId = await this.ensureAIMapsFolderExists();

      // Add folder to scene data
      if (folderId) {
        sceneData.folder = folderId;
      }

      // Create the scene using the complete payload from backend
      const SceneCtor = this.getSceneConstructor();
      if (!SceneCtor) {
        throw new Error('Foundry Scene API unavailable');
      }
      const scene = await SceneCtor.create(sceneData);

      // CRITICAL: Foundry v13 bug workaround (like working mapgen system)
      if (!scene.img && typeof sceneData.img === 'string') {
        await scene.update({
          img: sceneData.img,
          background: { src: sceneData.img },
        });
      }

      if (Array.isArray(sceneData.walls) && sceneData.walls.length > 0) {
        await this.createSceneWalls(scene, sceneData.walls);
      }

      const sceneName = sceneData.name ?? 'Unnamed Scene';
      notifyGM('info', `Scene "${sceneName}" created successfully!`);

      // Auto-activate the scene if enabled
      const autoActivate = true; // You might want to make this configurable
      if (autoActivate) {
        await scene.activate();
        notifyGM('info', `Switched to "${sceneName}" - Ready for token placement!`);
      }

      this.log(`Scene "${sceneName}" created and activated`);
    } catch (error) {
      this.log(
        `Failed to create scene from generated map: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      notifyGM(
        'error',
        `Failed to create scene: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private async createSceneWalls(scene: SceneLike, wallsData: WallData[]): Promise<void> {
    if (wallsData.length === 0) {
      this.log('No wall data provided');
      return;
    }

    try {
      this.log(`Creating ${wallsData.length} walls for scene ${scene.name ?? 'Unnamed Scene'}`);

      // Filter out walls with invalid coordinates
      const validWalls = wallsData.filter(wall => {
        if (!this.isWallCoordinates(wall.c)) {
          this.log(`Invalid wall coordinates: ${JSON.stringify(wall)}`);
          return false;
        }
        return true;
      });

      this.log(`${validWalls.length} valid walls out of ${wallsData.length} total`);

      const wallDocuments = validWalls.map(wall => ({
        c: wall.c,
        move: wall.movement ?? 0,
        sense: wall.sight ?? 0,
        doorSound: '',
        dir: wall.direction ?? 0,
        door: wall.door ?? 0,
        ds: wall.doorState ?? 0,
        flags: wall.flags ?? {},
      }));

      if (wallDocuments.length > 0) {
        await scene.createEmbeddedDocuments('Wall', wallDocuments);
        notifyGM(
          'info',
          `Created ${wallDocuments.length} walls in scene "${scene.name ?? 'Unnamed Scene'}"`
        );
      } else {
        this.log('No valid walls to create');
        notifyGM('warn', 'No valid walls could be created from detection data');
      }
    } catch (error) {
      this.log(
        `Failed to create walls: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      notifyGM(
        'warn',
        `Some walls could not be created: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Ensure "AI Generated Maps" folder exists for organizing generated scenes
   */
  private async ensureAIMapsFolderExists(): Promise<string | null> {
    try {
      const folderName = 'AI Generated Maps';

      // Check if folder already exists
      const folders = game.folders as unknown;
      const matchesFolder = (folder: unknown): boolean => {
        if (!folder || typeof folder !== 'object') {
          return false;
        }
        const f = folder as FolderLike;
        return f.type === 'Scene' && f.name === folderName;
      };

      let existingFolder: FolderLike | undefined;
      if (folders && typeof folders === 'object' && 'find' in folders) {
        const maybeFind = (folders as { find?: unknown }).find;
        if (typeof maybeFind === 'function') {
          const found = (
            folders as {
              find: (predicate: (folder: unknown) => boolean) => unknown;
            }
          ).find(matchesFolder);

          if (found && typeof found === 'object') {
            existingFolder = found as FolderLike;
          }
        }
      } else if (Array.isArray(folders)) {
        const folderArray = folders as unknown[];
        const found = folderArray.find(matchesFolder);
        if (found && typeof found === 'object') {
          existingFolder = found as FolderLike;
        }
      }

      if (existingFolder) {
        this.log(`AI Generated Maps folder already exists with ID: ${existingFolder.id}`);
        return existingFolder.id;
      }

      // Create the folder
      this.log('Creating AI Generated Maps folder...');
      const FolderCtor = this.getFolderConstructor();
      if (!FolderCtor) {
        throw new Error('Foundry Folder API unavailable');
      }

      const folder = await FolderCtor.create({
        name: folderName,
        type: 'Scene',
        description: 'Scenes created by AI Map Generation',
        color: '#4a90e2', // Nice blue color
        sorting: 'a', // Sort alphabetically
      });

      if (folder) {
        this.log(`Created AI Generated Maps folder with ID: ${folder.id}`);
        return folder.id;
      }

      this.log('Failed to create AI Generated Maps folder');
      return null;
    } catch (error) {
      this.log(
        `Error managing AI Generated Maps folder: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      return null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.log(`Max reconnection attempts reached (${this.maxReconnectAttempts})`);
      return;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000); // Exponential backoff, max 30s
    this.reconnectAttempts++;

    this.log(`Scheduling reconnection attempt ${this.reconnectAttempts} in ${delay}ms`);
    this.connectionState = CONNECTION_STATES.RECONNECTING;

    this.reconnectTimer = setTimeout((): void => {
      void this.connect().catch(() => {
        // Connection failed, scheduleReconnect will be called again from connect()
      });
    }, delay);
  }

  private sendMessage(message: Record<string, unknown>): void {
    if (this.connectionState !== CONNECTION_STATES.CONNECTED) {
      this.log(`Cannot send message - not connected`);
      return;
    }

    try {
      if (this.activeConnectionType === 'webrtc' && this.webrtc) {
        this.webrtc.sendMessage(message);
      } else if (this.activeConnectionType === 'websocket' && this.ws) {
        this.ws.send(JSON.stringify(message));
      } else {
        this.log('No active connection to send message');
        return;
      }

      const messageType = typeof message.type === 'string' ? message.type : 'unknown';
      this.log(`Sent message via ${this.activeConnectionType}: ${messageType}`);
    } catch (error) {
      this.log(`Failed to send message: ${this.errorMessage(error)}`);
    }
  }

  emitToServer(event: string, data?: unknown): void {
    this.sendMessage({
      type: event,
      data,
      timestamp: Date.now(),
    });
  }

  isConnected(): boolean {
    return this.connectionState === CONNECTION_STATES.CONNECTED;
  }

  getConnectionState(): string {
    return this.connectionState;
  }

  getConnectionInfo(): {
    type: 'websocket' | 'webrtc' | null;
    state: string;
    reconnectAttempts: number;
    maxReconnectAttempts: number;
    config: { host: string; port: number; namespace: string };
  } {
    return {
      type: this.activeConnectionType,
      state: this.connectionState,
      reconnectAttempts: this.reconnectAttempts,
      maxReconnectAttempts: this.maxReconnectAttempts,
      config: {
        host: this.config.serverHost,
        port: this.config.serverPort,
        namespace: this.config.namespace,
      },
    };
  }

  private log(message: string): void {
    if (this.config.debugLogging && game.user?.isGM) {
      debugGM(`Socket Bridge: ${message}`);
    }
  }
}
