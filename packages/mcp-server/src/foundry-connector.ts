import { WebSocketServer, WebSocket } from 'ws';
import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import type { Duplex } from 'stream';
import { Logger } from './logger.js';
import { Config } from './config.js';
import { WebRTCPeer } from './webrtc-peer.js';

export interface FoundryConnectorOptions {
  config: Config['foundry'];
  logger: Logger;
}

interface PendingQuery {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

interface BackendComfyUIHandlers {
  handleMessage?: (message: unknown) => Promise<void>;
}

interface MCPMessage {
  type?: string;
  id?: string;
  offer?: RTCSessionDescriptionInit;
  data?: unknown;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function asMessage(value: unknown): MCPMessage {
  const record = asRecord(value);
  return {
    type: typeof record?.type === 'string' ? record.type : undefined,
    id: typeof record?.id === 'string' ? record.id : undefined,
    offer: record?.offer as RTCSessionDescriptionInit | undefined,
    data: record?.data,
  };
}

export class FoundryConnector {
  private wss: WebSocketServer | null = null;
  private httpServer: ReturnType<typeof createServer> | null = null;
  private webrtcSignalingServer: ReturnType<typeof createServer> | null = null; // Separate HTTP server for WebRTC signaling
  private logger: Logger;
  private config: Config['foundry'];
  private isStarted = false;
  private foundrySocket: WebSocket | null = null;
  private webrtcPeer: WebRTCPeer | null = null;
  private activeConnectionType: 'websocket' | 'webrtc' | null = null;
  private pendingQueries = new Map<string, PendingQuery>();
  private queryIdCounter = 0;

  constructor({ config, logger }: FoundryConnectorOptions) {
    this.config = config;
    this.logger = logger.child({ component: 'FoundryConnector' });
  }

  async start(): Promise<void> {
    if (this.isStarted) {
      this.logger.debug('Foundry connector already started');
      return;
    }

    this.logger.info('Starting Foundry connector WebSocket server', {
      port: this.config.port,
      protocol: this.config.protocol || 'ws',
      remoteMode: this.config.remoteMode || false,
    });

    // Create HTTP server for WebSocket connections
    this.httpServer = createServer((req, res) => {
      res.writeHead(404);
      res.end();
    });

    // Create SEPARATE HTTP server for WebRTC signaling (port 31416)
    const WEBRTC_PORT = 31416;
    this.webrtcSignalingServer = createServer((req, res) => {
      // Set CORS headers for all requests
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      // Handle OPTIONS preflight
      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      // Only handle POST to /webrtc-offer
      if (req.method === 'POST' && req.url === '/webrtc-offer') {
        void this.handleWebRTCOfferHTTP(req, res).catch(error => {
          this.logger.error('WebRTC offer handling failed', error);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Internal server error' }));
        });
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
      }
    });

    // Start WebRTC signaling server
    await new Promise<void>((resolve, reject) => {
      this.webrtcSignalingServer.listen(WEBRTC_PORT, '0.0.0.0', () => {
        this.logger.info(`WebRTC signaling server listening on port ${WEBRTC_PORT}`);
        console.error(`[WebRTC] Server started on 0.0.0.0:${WEBRTC_PORT}`);
        resolve();
      });
      this.webrtcSignalingServer.on('error', (error: Error) => {
        this.logger.error('Failed to start WebRTC signaling server', error);
        console.error(`[WebRTC] Server error:`, error);
        reject(error);
      });
    });

    // Create WebSocket server in noServer mode to avoid request consumption
    this.wss = new WebSocketServer({ noServer: true });

    // Manually handle upgrade for WebSocket connections
    this.httpServer.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
      const pathname = req.url ?? '/';

      // Only upgrade if path matches WebSocket namespace
      if (pathname === (this.config.namespace ?? '/')) {
        this.wss?.handleUpgrade(req, socket, head, ws => {
          this.wss?.emit('connection', ws, req);
        });
      } else {
        socket.destroy();
      }
    });

    // Handle WebSocket connections (both signaling and direct WebSocket)
    this.wss.on('connection', ws => {
      this.logger.info('Client connected via WebSocket');

      // Register the connection immediately on connect, not on first message
      // This fixes Issue #19: WebSocket handshake deadlock where both sides
      // waited for the other to send a message first
      if (!this.foundrySocket) {
        this.foundrySocket = ws;
        this.activeConnectionType = 'websocket';
        this.logger.info('Foundry module registered via WebSocket');
      }

      ws.on('close', () => {
        this.logger.info('Client disconnected');
        if (this.activeConnectionType === 'websocket' && this.foundrySocket === ws) {
          this.foundrySocket = null;
          this.activeConnectionType = null;
          // Reject all pending queries
          this.pendingQueries.forEach(({ reject, timeout }) => {
            clearTimeout(timeout);
            reject(new Error('Connection closed'));
          });
          this.pendingQueries.clear();
        }
      });

      ws.on('message', data => {
        try {
          const rawText = Buffer.isBuffer(data) ? data.toString() : String(data);
          const message = asMessage(JSON.parse(rawText));

          // Check if this is WebRTC signaling
          if (message.type === 'webrtc-offer') {
            if (message.offer) {
              void this.handleWebRTCOffer(message.offer, ws);
            }
          } else {
            // Regular WebSocket message - process it directly
            void this.handleMessage(message);
          }
        } catch (error) {
          this.logger.error('Failed to parse message', error);
        }
      });

      ws.on('error', error => {
        this.logger.error('WebSocket error', error);
      });
    });

    // Start the HTTP server
    await new Promise<void>((resolve, reject) => {
      this.httpServer.listen(this.config.port, () => {
        this.isStarted = true;
        this.logger.info('Foundry connector listening', { port: this.config.port });
        resolve();
      });

      this.httpServer.on('error', (error: Error) => {
        this.logger.error('Failed to start Foundry connector', error);
        reject(error);
      });
    });
  }

  async stop(): Promise<void> {
    if (!this.isStarted) {
      return;
    }

    this.logger.info('Stopping Foundry connector...');

    // Reject all pending queries
    this.pendingQueries.forEach(({ reject, timeout }) => {
      clearTimeout(timeout);
      reject(new Error('Server shutting down'));
    });
    this.pendingQueries.clear();

    if (this.foundrySocket) {
      this.foundrySocket.close();
      this.foundrySocket = null;
    }

    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }

    if (this.httpServer) {
      await new Promise<void>(resolve => {
        this.httpServer.close(() => {
          resolve();
        });
      });
      this.httpServer = null;
    }

    this.isStarted = false;
    this.logger.info('Foundry connector stopped');
  }

  private async handleMessage(messageInput: unknown): Promise<void> {
    const message = asMessage(messageInput);

    if (message.type === 'mcp-response' && message.id) {
      const pending = this.pendingQueries.get(message.id);
      if (pending) {
        clearTimeout(pending.timeout);
        this.pendingQueries.delete(message.id);

        const responseData = asRecord(message.data);
        const success = responseData?.success === true;
        const responsePayload = responseData?.data;
        const responseError =
          typeof responseData?.error === 'string' ? responseData.error : 'Query failed';

        if (success) {
          this.logger.debug('Query response received', {
            id: message.id,
            hasData: responsePayload !== undefined,
          });
          pending.resolve(responsePayload);
        } else {
          this.logger.error('Query failed', { id: message.id, error: responseError });
          pending.reject(new Error(responseError));
        }
      }
      return;
    }

    if (message.type === 'pong') {
      const pending = this.pendingQueries.get(message.id);
      if (pending) {
        clearTimeout(pending.timeout);
        this.pendingQueries.delete(message.id);
        pending.resolve(message.data);
      }
      return;
    }

    const comfyHandlers = asRecord(globalThis as unknown)?.backendComfyUIHandlers as
      | BackendComfyUIHandlers
      | undefined;
    if (comfyHandlers?.handleMessage) {
      this.logger.debug('Routing message to backend ComfyUI handlers', { type: message.type });
      try {
        await comfyHandlers.handleMessage(message);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error('Failed to forward message to backendComfyUIHandlers', {
          type: message.type,
          error: errorMessage,
        });
      }
      return;
    }

    this.logger.debug('Received unknown message type', { type: message.type });
  }

  private async handleWebRTCOffer(
    offer: RTCSessionDescriptionInit,
    signalingWs: WebSocket
  ): Promise<void> {
    try {
      this.logger.info('Handling WebRTC offer for signaling');

      // Create WebRTC peer
      this.webrtcPeer = new WebRTCPeer({
        config: this.config.webrtc,
        logger: this.logger,
        onMessage: this.handleMessage.bind(this),
      });

      // Handle offer and get answer
      const answer = await this.webrtcPeer.handleOffer(offer);

      // Send answer back via signaling WebSocket
      signalingWs.send(
        JSON.stringify({
          type: 'webrtc-answer',
          answer,
        })
      );

      this.activeConnectionType = 'webrtc';
      this.logger.info('WebRTC connection established');

      // Close signaling WebSocket after handshake
      setTimeout(() => {
        signalingWs.close();
      }, 1000);
    } catch (error) {
      this.logger.error('Failed to handle WebRTC offer', error);
      signalingWs.send(
        JSON.stringify({
          type: 'webrtc-error',
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      );
    }
  }

  private async handleWebRTCOfferHTTP(
    req: IncomingMessage,
    res: ServerResponse<IncomingMessage>
  ): Promise<void> {
    // CRITICAL: Call resume() to enable stream data flow
    req.resume();

    try {
      // Read body using promise wrapper around classic events
      const body = await new Promise<string>((resolve, reject) => {
        const chunks: Buffer[] = [];

        req.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
        });

        req.on('end', () => {
          resolve(Buffer.concat(chunks).toString());
        });

        req.on('error', reject);
      });

      const parsed = asRecord(JSON.parse(body));
      const offer = parsed?.offer as RTCSessionDescriptionInit | undefined;

      if (!offer) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing offer in request body' }));
        return;
      }

      // Create WebRTC peer
      this.webrtcPeer = new WebRTCPeer({
        config: this.config.webrtc,
        logger: this.logger,
        onMessage: this.handleMessage.bind(this),
      });

      // Handle offer and get answer
      const answer = await this.webrtcPeer.handleOffer(offer);

      this.activeConnectionType = 'webrtc';
      this.logger.info('WebRTC connection established via HTTP signaling');

      // Send answer back via HTTP response
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ answer }));
    } catch (error) {
      this.logger.error('Failed to handle WebRTC offer via HTTP', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      );
    }
  }

  async query(method: string, data?: unknown): Promise<unknown> {
    // Check connection based on active connection type
    const isConnected =
      this.activeConnectionType === 'webrtc'
        ? this.webrtcPeer && this.webrtcPeer.getIsConnected()
        : this.foundrySocket && this.foundrySocket.readyState === WebSocket.OPEN;

    if (!isConnected) {
      throw new Error('Not connected to Foundry VTT module');
    }

    const queryId = `query-${++this.queryIdCounter}`;
    this.logger.debug('Sending query to Foundry', {
      method,
      data,
      queryId,
      connectionType: this.activeConnectionType,
    });

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingQueries.delete(queryId);
        reject(new Error(`Query timeout: ${method}`));
      }, 10000); // 10 second timeout

      this.pendingQueries.set(queryId, { resolve, reject, timeout });

      const message = {
        type: 'mcp-query',
        id: queryId,
        data: { method, data },
      };

      // Use sendToFoundry to support both WebSocket and WebRTC
      this.sendToFoundry(message);
    });
  }

  sendToFoundry(message: unknown): void {
    if (this.activeConnectionType === 'webrtc' && this.webrtcPeer) {
      this.webrtcPeer.sendMessage(message);
    } else if (
      this.activeConnectionType === 'websocket' &&
      this.foundrySocket &&
      this.foundrySocket.readyState === WebSocket.OPEN
    ) {
      this.foundrySocket.send(JSON.stringify(message));
    } else {
      throw new Error('Not connected to Foundry VTT module');
    }
  }

  isConnected(): boolean {
    if (!this.isStarted) return false;

    if (this.activeConnectionType === 'webrtc') {
      return this.webrtcPeer !== null && this.webrtcPeer.getIsConnected();
    } else if (this.activeConnectionType === 'websocket') {
      return this.foundrySocket !== null && this.foundrySocket.readyState === WebSocket.OPEN;
    }

    return false;
  }

  getConnectionInfo(): {
    started: boolean;
    connected: boolean;
    connectionType: 'websocket' | 'webrtc' | null;
    readyState: number | 'CLOSED';
    config: { port: number; namespace?: string };
  } {
    return {
      started: this.isStarted,
      connected: this.isConnected(),
      connectionType: this.activeConnectionType,
      readyState: this.foundrySocket?.readyState ?? 'CLOSED',
      config: {
        port: this.config.port,
        namespace: this.config.namespace,
      },
    };
  }

  getConnectionType(): 'websocket' | 'webrtc' | null {
    return this.activeConnectionType;
  }

  /**
   * Send a message to the connected Foundry module
   */
  sendMessage(message: unknown): void {
    if (!this.isConnected()) {
      throw new Error('Not connected to Foundry VTT module');
    }

    try {
      this.sendToFoundry(message);
      this.logger.debug('Sent message to Foundry module', {
        type: asMessage(message).type,
        connectionType: this.activeConnectionType,
      });
    } catch (error) {
      this.logger.error('Failed to send message to Foundry module', error);
      throw error;
    }
  }

  /**
   * Broadcast a message to all connected Foundry clients (alias for sendMessage for single connection)
   */
  broadcastMessage(message: unknown): void {
    this.sendMessage(message);
  }
}
