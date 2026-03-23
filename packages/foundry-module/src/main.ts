import { MODULE_ID } from './constants.js';
import { SocketBridge } from './socket-bridge.js';
import { QueryHandlers } from './queries.js';
import { ModuleSettings } from './settings.js';
import { CampaignHooks } from './campaign-hooks.js';
import { ComfyUIManager } from './comfyui-manager.js';
import { debugGM } from './gm-notifications.js';
// Connection control now handled through settings menu

type FileBrowseResult = { files: string[] };

type FilePickerImplementation = {
  browse: (source: string, target: string) => Promise<FileBrowseResult>;
};

type FoundryApplications = {
  applications?: {
    apps?: {
      FilePicker?: {
        implementation?: FilePickerImplementation;
      };
    };
  };
};

type RollButtonMessageData = {
  type?: unknown;
  buttonId?: unknown;
  messageId?: unknown;
  userId?: unknown;
  rollLabel?: unknown;
  rollState?: {
    rolledBy?: unknown;
  };
};

type RollButtonsMap = Record<string, { rolled?: boolean }>;

type DataAccessLike = {
  rebuildEnhancedCreatureIndex?: () => Promise<unknown>;
  updateRollButtonMessage?: (
    buttonId: string,
    userId: string,
    rollLabel: string
  ) => Promise<unknown>;
  saveRollState?: (buttonId: string, rolledBy: string) => Promise<unknown>;
  attachRollButtonHandlers?: (html: JQuery<HTMLElement>) => void;
  ensureButtonStatesForMessage?: (html: JQuery<HTMLElement>) => void;
};

type FoundryMCPGlobals = {
  foundryMCPBridge?: FoundryMCPBridge & {
    dataAccess?: DataAccessLike;
  };
  foundryMCPDebug?: {
    bridge: unknown;
    getStatus: () => unknown;
    start: () => Promise<void>;
    stop: () => Promise<void>;
    restart: () => Promise<void>;
  };
};

type ChatMessageLike = {
  getFlag?: (scope: string, key: string) => unknown;
};

function asRollButtonMessageData(input: unknown): RollButtonMessageData | null {
  if (!input || typeof input !== 'object') {
    return null;
  }

  const data = input as Record<string, unknown>;
  const parsed: RollButtonMessageData = {};

  if ('type' in data) parsed.type = data.type;
  if ('buttonId' in data) parsed.buttonId = data.buttonId;
  if ('messageId' in data) parsed.messageId = data.messageId;
  if ('userId' in data) parsed.userId = data.userId;
  if ('rollLabel' in data) parsed.rollLabel = data.rollLabel;

  if (data.rollState && typeof data.rollState === 'object') {
    const rollState = data.rollState as Record<string, unknown>;
    parsed.rollState = { rolledBy: rollState.rolledBy };
  }

  return parsed;
}

function asRollButtonsMap(value: unknown): RollButtonsMap {
  if (!value || typeof value !== 'object') {
    return {};
  }

  const result: RollButtonsMap = {};
  for (const [key, data] of Object.entries(value as Record<string, unknown>)) {
    if (!data || typeof data !== 'object') {
      continue;
    }

    const buttonData = data as Record<string, unknown>;
    result[key] = {
      ...(typeof buttonData.rolled === 'boolean' ? { rolled: buttonData.rolled } : {}),
    };
  }

  return result;
}

/**
 * Main Maeinomatic Foundry MCP Bridge Module Class
 */
class FoundryMCPBridge {
  private settings: ModuleSettings;
  private queryHandlers: QueryHandlers;
  private campaignHooks: CampaignHooks;
  public comfyuiManager: ComfyUIManager;
  private socketBridge: SocketBridge | null = null;
  private isInitialized = false;
  private heartbeatInterval: number | null = null;
  private lastActivity: Date = new Date();
  private isConnecting = false;

  constructor() {
    this.settings = new ModuleSettings();
    this.queryHandlers = new QueryHandlers();
    this.campaignHooks = new CampaignHooks(this);
    this.comfyuiManager = new ComfyUIManager();
  }

  private log(message: string, details?: unknown): void {
    if (details === undefined) {
      debugGM(message);
      return;
    }
    debugGM(message, details);
  }

  public getDataAccess(): DataAccessLike | undefined {
    return this.queryHandlers.dataAccess as unknown as DataAccessLike;
  }

  /**
   * Check if current user is a GM (silent check for security)
   */
  private isGMUser(): boolean {
    return game.user?.isGM ?? false;
  }

  /**
   * Initialize the module during Foundry's init hook
   */
  initialize(): void {
    try {
      this.log('Initializing Maeinomatic Foundry MCP Bridge...');

      // Register module settings
      this.settings.registerSettings();

      // Register query handlers
      this.queryHandlers.registerHandlers();

      // Register campaign hooks for interactive dashboards
      this.campaignHooks.register();

      // Expose data access globally for settings UI
      const bridgeWindow = window as unknown as FoundryMCPGlobals;
      if (bridgeWindow.foundryMCPBridge) {
        bridgeWindow.foundryMCPBridge.dataAccess = this.queryHandlers.dataAccess;
      }

      this.isInitialized = true;
      this.log('Module initialized successfully');
    } catch (error) {
      this.log('Failed to initialize', error);
      ui.notifications.error('Failed to initialize Maeinomatic Foundry MCP Bridge');
      throw error;
    }
  }

  /**
   * Start the module after Foundry is ready
   */
  async onReady(): Promise<void> {
    try {
      // SECURITY: Silent GM-only check - non-GM users get no access and no messages
      if (!this.isGMUser()) {
        this.log('Module ready (user access restricted)');
        return;
      }

      this.log('Foundry ready, checking bridge status...');

      // Connection control now handled through settings menu

      // Validate settings
      const validation = this.settings.validateSettings();
      if (!validation.valid) {
        this.log('Invalid settings', validation.errors);
        ui.notifications.warn(
          `MCP Bridge settings validation failed: ${validation.errors.join(', ')}`
        );
      }

      // Auto-connect when enabled (always automatic)
      const enabled = this.settings.getSetting('enabled') === true;

      if (enabled) {
        await this.start();
      }

      // Auto-build enhanced creature index if enabled and not exists
      await this.checkAndBuildEnhancedIndex();

      // Start ComfyUI startup monitoring if module is enabled
      if (enabled) {
        this.startComfyUIMonitoring();
      }

      this.log('Module ready');
    } catch (error) {
      this.log('Failed during ready', error);
    }
  }

  /**
   * Check if enhanced creature index exists and build if needed (better UX)
   */
  private async checkAndBuildEnhancedIndex(): Promise<void> {
    try {
      // Only for GM users
      if (!this.isGMUser()) return;

      // Check if enhanced index is enabled
      const enhancedIndexEnabled = this.settings.getSetting('enableEnhancedCreatureIndex') === true;
      if (!enhancedIndexEnabled) return;

      // Check if index file exists
      const indexFilename = 'enhanced-creature-index.json';
      try {
        const foundryLike = foundry as unknown as FoundryApplications;
        const filePicker = foundryLike.applications?.apps?.FilePicker?.implementation;
        if (!filePicker) {
          return;
        }

        const browseResult = await filePicker.browse('data', `worlds/${game.world.id}`);
        const indexExists = browseResult.files.some(file => file.endsWith(indexFilename));

        if (!indexExists) {
          this.log('Enhanced creature index not found, building automatically for better UX...');
          ui.notifications?.info('Building enhanced creature index for faster searches...');

          // Trigger index build through data access
          if (this.queryHandlers?.dataAccess?.rebuildEnhancedCreatureIndex) {
            await this.queryHandlers.dataAccess.rebuildEnhancedCreatureIndex();
          }
        } else {
          this.log('Enhanced creature index exists, ready for instant searches');
        }
      } catch (error) {
        // World directory might not exist yet, that's okay
        this.log('Could not check for enhanced index file (world directory may not exist yet)');
      }
    } catch (error) {
      this.log('Failed to auto-build enhanced index', error);
    }
  }

  /**
   * Start the MCP bridge connection
   */
  async start(): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Module not initialized');
    }

    // SECURITY: Double-check GM access (safety measure)
    if (!this.isGMUser()) {
      this.log('Attempted to start bridge without GM access');
      return;
    }

    const isConnected = this.socketBridge?.isConnected() ?? false;
    if (isConnected || this.isConnecting) {
      this.log('Bridge already running or connecting');
      return;
    }

    this.isConnecting = true;

    try {
      this.log('Starting MCP bridge...');

      const config = this.settings.getBridgeConfig();

      // Validate configuration
      const validation = this.settings.validateSettings();
      if (!validation.valid) {
        throw new Error(`Invalid configuration: ${validation.errors.join(', ')}`);
      }

      // Create and connect socket bridge
      this.socketBridge = new SocketBridge(config);
      await this.socketBridge.connect();

      // Log connection details for debugging
      const connectionInfo = this.socketBridge.getConnectionInfo();
      this.log(
        `Bridge started successfully - Type: ${connectionInfo.type}, State: ${connectionInfo.state}`
      );

      await this.settings.setSetting('lastConnectionState', 'connected');
      await this.settings.setSetting('lastActivity', new Date().toISOString());
      this.updateLastActivity();

      // Update settings display with connection status
      this.settings.updateConnectionStatusDisplay(true, 17); // 17 MCP tools

      // Start heartbeat monitoring if enabled
      this.startHeartbeat();

      // Show connection notification based on user preference
      if (this.settings.getSetting<boolean>('enableNotifications')) {
        ui.notifications.info('🔗 MCP Bridge connected successfully');
      }
      this.log(
        `GM connection established - Bridge active for user: ${game.user?.name ?? 'Unknown'}`
      );
    } catch (error) {
      // Log as warning instead of error for initial connection failures
      this.log('Failed to start bridge', error);

      // Show helpful message for GM users when MCP server isn't available
      if (this.isGMUser()) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        // Check if it's a connection refusal (MCP server not running)
        if (
          errorMessage.includes('ECONNREFUSED') ||
          errorMessage.includes('connect ECONNREFUSED')
        ) {
          // Only show this notification if it's been more than 30 seconds since last shown
          const lastShownRaw: unknown = this.settings.getSetting('lastMCPServerNotification');
          const lastShown = typeof lastShownRaw === 'string' ? lastShownRaw : '';
          const now = new Date().getTime();
          const thirtySecondsAgo = now - 30 * 1000;

          if (!lastShown || new Date(lastShown).getTime() < thirtySecondsAgo) {
            ui.notifications?.warn(
              'MCP Server not found. Install it from https://github.com/maeinomatic/foundry-vtt-mcp'
            );

            // Remember when we showed this notification
            void this.settings.setSetting('lastMCPServerNotification', new Date().toISOString());
          }
        }
      }

      await this.settings.setSetting('lastConnectionState', 'error');
      throw error;
    } finally {
      this.isConnecting = false;
    }
  }

  /**
   * Stop the MCP bridge connection
   */
  async stop(): Promise<void> {
    if (!this.socketBridge) {
      this.log('Bridge not running');
      return;
    }

    try {
      this.log('Stopping MCP bridge...');

      // Stop heartbeat monitoring
      this.stopHeartbeat();

      this.socketBridge.disconnect();
      this.socketBridge = null;

      await this.settings.setSetting('lastConnectionState', 'disconnected');

      // Update settings display with disconnected status
      this.settings.updateConnectionStatusDisplay(false, 0);

      this.log('Bridge stopped');

      // Show disconnection notification based on user preference
      if (this.settings.getSetting<boolean>('enableNotifications')) {
        ui.notifications.info('MCP Bridge disconnected');
      }
    } catch (error) {
      this.log('Error stopping bridge', error);
    }
  }

  /**
   * Restart the bridge with current settings
   */
  async restart(): Promise<void> {
    this.log('Restarting bridge...');

    await this.stop();

    // Small delay to ensure clean disconnect
    await new Promise(resolve => setTimeout(resolve, 1000));

    if (this.settings.getSetting<boolean>('enabled')) {
      await this.start();
    }
  }

  /**
   * Get current bridge status
   */
  getStatus(): {
    initialized: boolean;
    enabled: unknown;
    connected: boolean;
    connectionState: string;
    connectionInfo: ReturnType<SocketBridge['getConnectionInfo']> | undefined;
    settings: ReturnType<ModuleSettings['getAllSettings']>;
    registeredMethods: ReturnType<QueryHandlers['getRegisteredMethods']>;
    lastConnectionState: unknown;
    lastActivity: string;
    heartbeatActive: boolean;
  } {
    return {
      initialized: this.isInitialized,
      enabled: this.settings.getSetting<boolean>('enabled'),
      connected: this.socketBridge?.isConnected() ?? false,
      connectionState: this.socketBridge?.getConnectionState() ?? 'disconnected',
      connectionInfo: this.socketBridge?.getConnectionInfo(),
      settings: this.settings.getAllSettings(),
      registeredMethods: this.queryHandlers.getRegisteredMethods(),
      lastConnectionState: this.settings.getSetting<string>('lastConnectionState'),
      lastActivity: this.lastActivity.toISOString(),
      heartbeatActive: this.heartbeatInterval !== null,
    };
  }

  /**
   * Start heartbeat monitoring
   */
  private startHeartbeat(): void {
    this.stopHeartbeat(); // Ensure no duplicate intervals

    const interval = this.settings.getSetting<number>('heartbeatInterval') * 1000; // Convert to milliseconds

    this.heartbeatInterval = window.setInterval(() => {
      void this.performHeartbeat();
    }, interval);

    this.log(`Heartbeat monitoring started (${interval}ms interval)`);
  }

  /**
   * Stop heartbeat monitoring
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
      this.log('Heartbeat monitoring stopped');
    }
  }

  /**
   * Perform heartbeat check
   */
  private async performHeartbeat(): Promise<void> {
    try {
      // Lightweight connection check - just verify socket state
      if (!this.socketBridge || !this.socketBridge.isConnected()) {
        // Only log once per disconnection to avoid spam
        if (this.lastActivity && new Date().getTime() - this.lastActivity.getTime() > 60000) {
          this.log('Heartbeat: Connection lost');

          // Attempt auto-reconnection if enabled (with backoff)
          if (this.settings.getSetting<boolean>('autoReconnectEnabled')) {
            this.log('Attempting auto-reconnection...');
            await this.restart();
          }
        }
        return;
      }

      // Just update activity timestamp - no actual network ping needed
      // The socket bridge already handles connection state monitoring
      this.updateLastActivity();
    } catch (error) {
      // Only attempt reconnect once per failure cycle
      if (this.settings.getSetting<boolean>('autoReconnectEnabled')) {
        this.log('Heartbeat failure - attempting single reconnection...');
        try {
          await this.restart();
        } catch (reconnectError) {
          this.log('Auto-reconnection failed', reconnectError);
          // Disable further attempts until manual intervention
          await this.settings.setSetting('autoReconnectEnabled', false);
          if (this.settings.getSetting<boolean>('enableNotifications')) {
            ui.notifications.warn('⚠️ Lost connection to AI model - Auto-reconnect disabled');
          }
        }
      }
    }
  }

  /**
   * Update last activity timestamp
   */
  updateLastActivity(): void {
    this.lastActivity = new Date();
    void this.settings.setSetting('lastActivity', this.lastActivity.toISOString());
  }

  /**
   * Get query handlers for campaign hooks
   */
  getQueryHandlers(): QueryHandlers {
    return this.queryHandlers;
  }

  /**
   * Monitor ComfyUI startup and show status banners
   */
  startComfyUIMonitoring(): void {
    try {
      // Check if ComfyUI monitoring is needed
      const autoStart = this.settings.getSetting('mapGenAutoStart') === true;
      if (!autoStart) {
        this.log('ComfyUI auto-start disabled, skipping monitoring');
        return;
      }

      this.log('Starting ComfyUI monitoring...');

      // Show initial loading banner
      ui.notifications?.info(
        `🔗 Starting AI Map Generation service... (Models loading, please wait)`
      );

      let attempts = 0;
      const maxAttempts = 24; // 2 minutes with 5-second intervals
      const checkInterval = 5000; // 5 seconds

      const checkStatus = async (): Promise<void> => {
        try {
          attempts++;

          const status = await this.comfyuiManager.checkStatus();
          this.log(`ComfyUI status check #${attempts}`, status);

          if (status.status === 'running') {
            // Success! ComfyUI is ready
            ui.notifications?.info(
              `✅ AI Map Generation service ready! Models loaded successfully.`
            );
            this.log(`ComfyUI ready after ${attempts} attempts (${attempts * 5}s)`);
            return;
          }

          if (attempts >= maxAttempts) {
            // Timeout - show failure banner
            ui.notifications?.warn(
              `⚠️ AI Map Generation service failed to start (timeout after 2 minutes). Check ComfyUI installation.`
            );
            this.log(`ComfyUI startup timeout after ${maxAttempts} attempts`);
            return;
          }

          // Continue checking
          setTimeout(() => {
            void checkStatus();
          }, checkInterval);
        } catch (error) {
          this.log('ComfyUI status check failed', error);

          if (attempts >= maxAttempts) {
            ui.notifications?.error(
              `❌ AI Map Generation service failed to start. Error: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
            return;
          }

          // Continue checking despite errors (ComfyUI might still be starting)
          setTimeout(() => {
            void checkStatus();
          }, checkInterval);
        }
      };

      // Start monitoring
      setTimeout(() => {
        void checkStatus();
      }, 2000); // Initial 2-second delay to let backend start
    } catch (error) {
      this.log('Failed to start ComfyUI monitoring', error);
      ui.notifications?.warn(
        `⚠️ Failed to monitor AI Map Generation startup: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Connection control is now handled through the settings menu
   */

  /**
   * Cleanup when module is disabled or world is closed
   */
  async cleanup(): Promise<void> {
    this.log('Cleaning up...');

    await this.stop();
    this.queryHandlers.unregisterHandlers();
    this.campaignHooks.unregister();

    this.log('Cleanup complete');
  }
}

// Create global instance
const foundryMCPBridge = new FoundryMCPBridge();

// Make it available globally for settings callbacks
(window as unknown as FoundryMCPGlobals).foundryMCPBridge = foundryMCPBridge;

// Foundry VTT Hooks
Hooks.once('init', () => {
  try {
    foundryMCPBridge.initialize();
  } catch (error) {
    debugGM('Initialization failed', error);
  }
});

Hooks.once('ready', async () => {
  try {
    await foundryMCPBridge.onReady();

    // Register socket listener for roll state management (after game.user is available)

    game.socket?.on('module.maeinomatic-foundry-mcp', data => {
      const messageData = asRollButtonMessageData(data);
      if (!messageData) {
        return;
      }

      void (async (): Promise<void> => {
        try {
          // Handle ChatMessage update requests (GM only)
          if (
            messageData.type === 'requestMessageUpdate' &&
            typeof messageData.buttonId === 'string' &&
            typeof messageData.messageId === 'string'
          ) {
            // Only GM can update ChatMessages for other users
            if (game.user?.isGM) {
              try {
                // Get the data access instance to update the message
                const dataAccess = foundryMCPBridge.getDataAccess();
                if (
                  dataAccess?.updateRollButtonMessage &&
                  typeof messageData.userId === 'string' &&
                  typeof messageData.rollLabel === 'string'
                ) {
                  await dataAccess.updateRollButtonMessage(
                    messageData.buttonId,
                    messageData.userId,
                    messageData.rollLabel
                  );
                }
              } catch (error) {
                debugGM('GM failed to update message', error);
                // Notify GM about the failure
                if (game.user?.isGM) {
                  ui.notifications?.error(
                    `Failed to update player roll message: ${error instanceof Error ? error.message : 'Unknown error'}`
                  );
                }
              }
            }
            return;
          }

          // Handle roll state save requests (GM only) - LEGACY
          if (
            messageData.type === 'requestRollStateSave' &&
            typeof messageData.buttonId === 'string' &&
            messageData.rollState
          ) {
            // Only GM can save to world settings
            if (game.user?.isGM) {
              try {
                // Get the data access instance to save the roll state
                const dataAccess = foundryMCPBridge.getDataAccess();
                if (
                  dataAccess?.saveRollState &&
                  typeof messageData.rollState.rolledBy === 'string'
                ) {
                  await dataAccess.saveRollState(
                    messageData.buttonId,
                    messageData.rollState.rolledBy
                  );
                }
              } catch (error) {
                debugGM('GM failed to save LEGACY roll state', error);
                // Notify GM about the failure so they can take action
                if (game.user?.isGM) {
                  ui.notifications?.error(
                    `Failed to save player roll state: ${error instanceof Error ? error.message : 'Unknown error'}`
                  );
                }
              }
            }
            return;
          }

          // Handle real-time roll state updates - LEGACY (now handled by ChatMessage.update())
          if (
            messageData.type === 'rollStateUpdate' &&
            typeof messageData.buttonId === 'string' &&
            messageData.rollState
          ) {
            // No longer needed - ChatMessage.update() automatically syncs across all clients
          }

          // Note: rollStateSaved confirmations removed - not needed since rollStateUpdate handles UI sync
        } catch (error) {
          debugGM('Error handling socket message', error);
        }
      })();
    });
  } catch (error) {
    debugGM('Ready failed', error);
  }
});

// Handle settings menu close to check for changes
Hooks.on('closeSettingsConfig', () => {
  try {
    const enabled = foundryMCPBridge.getStatus().enabled;
    const connected = foundryMCPBridge.getStatus().connected;

    if (enabled && !connected) {
      // Setting was enabled but not connected, try to start
      void foundryMCPBridge.start().catch(error => {
        debugGM('Failed to start after settings change', error);
      });
    } else if (!enabled && connected) {
      // Setting was disabled but still connected, stop
      void foundryMCPBridge.stop().catch(error => {
        debugGM('Failed to stop after settings change', error);
      });
    }
  } catch (error) {
    debugGM('Error handling settings change', error);
  }
});

// Global hook to handle MCP roll button rendering and state management
// Using renderChatMessageHTML for Foundry v13 compatibility (renderChatMessage is deprecated)
Hooks.on('renderChatMessageHTML', (message: unknown, html: HTMLElement) => {
  try {
    // Convert HTMLElement to jQuery for compatibility with existing handler code
    const $html = $(html);
    const typedMessage = message as ChatMessageLike;

    // Check if this message has MCP roll button flags
    const rollButtons = asRollButtonsMap(typedMessage.getFlag?.(MODULE_ID, 'rollButtons'));

    if (Object.keys(rollButtons).length > 0) {
      // Get the data access instance
      const dataAccess = foundryMCPBridge.getDataAccess();
      if (dataAccess) {
        // Check if any buttons in this message are already rolled
        for (const [_buttonId, buttonData] of Object.entries(rollButtons)) {
          if (buttonData.rolled) {
            break;
          }
        }

        // If message has rolled buttons, the content should already be updated
        // Just attach any necessary handlers for active buttons
        if ($html.find('.mcp-roll-button').length > 0) {
          // Only attach handlers to active (non-rolled) buttons
          dataAccess.attachRollButtonHandlers?.($html);
        }
      }
    } else if ($html.find('.mcp-roll-button').length > 0) {
      // Legacy message without flags - fall back to old behavior

      const dataAccess = foundryMCPBridge.getDataAccess();
      if (dataAccess) {
        dataAccess.attachRollButtonHandlers?.($html);

        // Check for legacy roll states
        setTimeout(() => {
          dataAccess.ensureButtonStatesForMessage?.($html);
        }, 100);
      }
    }
  } catch (error) {
    debugGM('Error processing roll buttons in chat message', error);
  }
});

// Socket listener will be registered in the 'ready' hook when game.user is available

// Handle world close/reload
Hooks.on('canvasReady', () => {
  // Canvas ready indicates the world is fully loaded
  // Good time to ensure bridge is in correct state
  try {
    const status = foundryMCPBridge.getStatus();
    if (status.enabled && !status.connected) {
      void foundryMCPBridge.start().catch(error => {
        debugGM('Failed to reconnect on canvas ready', error);
      });
    }
  } catch (error) {
    debugGM('Error on canvas ready', error);
  }
});

// Cleanup on unload
window.addEventListener('beforeunload', () => {
  void foundryMCPBridge.cleanup().catch(error => {
    debugGM('Cleanup failed', error);
  });
});

// Development helpers (only in debug mode)
if (typeof window !== 'undefined') {
  (window as unknown as FoundryMCPGlobals).foundryMCPDebug = {
    bridge: foundryMCPBridge,
    getStatus: (): ReturnType<FoundryMCPBridge['getStatus']> => foundryMCPBridge.getStatus(),
    start: async (): Promise<void> => foundryMCPBridge.start(),
    stop: async (): Promise<void> => foundryMCPBridge.stop(),
    restart: async (): Promise<void> => foundryMCPBridge.restart(),
  };
}

export { foundryMCPBridge };
