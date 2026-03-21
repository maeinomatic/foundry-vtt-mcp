import { RTCPeerConnection, RTCSessionDescription } from 'werift';
import { Logger } from './logger.js';
import type { Config } from './config.js';
import { WEBRTC_CONSTANTS } from './config.js';

export interface WebRTCPeerOptions {
  config: Config['foundry']['webrtc'];
  logger: Logger;
  onMessage: (message: unknown) => Promise<void>;
}

interface DataChannelLike {
  onopen?: () => void;
  onclose?: () => void;
  onerror?: (error: unknown) => void;
  onmessage?: (event: unknown) => void | Promise<void>;
  send: (data: string) => void;
  close: () => void;
}

interface ChunkMessage {
  chunkId: string;
  chunkIndex: number;
  totalChunks: number;
  chunk: string;
  originalType: string;
  originalId?: string;
}

const asRecord = (value: unknown): Record<string, unknown> | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
};

const toStringValue = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

const toNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const isDataChannelLike = (value: unknown): value is DataChannelLike => {
  const record = asRecord(value);
  if (!record) {
    return false;
  }

  return typeof record.send === 'function' && typeof record.close === 'function';
};

/**
 * WebRTC peer connection for Node.js server
 * Handles WebRTC signaling and data channel communication
 */
export class WebRTCPeer {
  private peerConnection: RTCPeerConnection | null = null;
  private dataChannel: DataChannelLike | null = null;
  private logger: Logger;
  private config: Config['foundry']['webrtc'];
  private onMessageHandler: (message: unknown) => Promise<void>;
  private isConnected = false;
  private pendingChunks: Map<
    string,
    {
      chunks: Map<number, string>;
      totalChunks: number;
      originalType: string;
      originalId?: string;
      timestamp: number; // For timeout cleanup
    }
  > = new Map();
  private chunkCleanupInterval: NodeJS.Timeout | null = null;

  constructor({ config, logger, onMessage }: WebRTCPeerOptions) {
    this.config = config;
    this.logger = logger.child({ component: 'WebRTCPeer' });
    this.onMessageHandler = onMessage;

    // Start cleanup interval for timed-out chunks
    this.startChunkCleanup();
  }

  /**
   * Handle incoming WebRTC offer from browser client
   * Returns answer to be sent back to client
   *
   * Critical: Send answer IMMEDIATELY, then trickle ICE candidates
   * Don't wait for data channel or ICE gathering before answering
   */
  async handleOffer(offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    const startTime = Date.now();
    this.logger.info('[WebRTC Timing] Received offer from client');

    // Create peer connection WITHOUT STUN servers for localhost connections
    this.peerConnection = new RTCPeerConnection({
      iceServers: [], // Empty for localhost - no external STUN needed
    });

    this.setupPeerConnectionHandlers();

    // Step 1: Set remote description (offer from client)
    const t1 = Date.now();
    const offerType = offer.type === 'offer' || offer.type === 'answer' ? offer.type : 'offer';
    const offerSdp = typeof offer.sdp === 'string' ? offer.sdp : '';
    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offerSdp, offerType));
    this.logger.info(`[WebRTC Timing] setRemoteDescription took ${Date.now() - t1}ms`);

    // Step 2: Create answer IMMEDIATELY - don't wait for data channel or ICE
    const t2 = Date.now();
    const answer = await this.peerConnection.createAnswer();
    this.logger.info(`[WebRTC Timing] createAnswer took ${Date.now() - t2}ms`);

    // Step 3: Set local description
    const t3 = Date.now();
    await this.peerConnection.setLocalDescription(answer);
    this.logger.info(`[WebRTC Timing] setLocalDescription took ${Date.now() - t3}ms`);

    this.logger.info(
      `[WebRTC Timing] Answer ready in ${Date.now() - startTime}ms - sending immediately`
    );

    // Data channel and ICE will arrive later via events - don't wait!
    // The ondatachannel event will fire when the channel is ready

    if (!this.peerConnection.localDescription) {
      throw new Error('Local description not available after creating WebRTC answer');
    }

    return this.peerConnection.localDescription;
  }

  private setupPeerConnectionHandlers(): void {
    if (!this.peerConnection) return;

    // ICE gathering state changes
    this.peerConnection.iceGatheringStateChange.subscribe((state): void => {
      this.logger.info(`[WebRTC] ICE gathering state: ${state}`);
    });

    // ICE connection state changes
    this.peerConnection.iceConnectionStateChange.subscribe((state): void => {
      this.logger.info(`[WebRTC] ICE connection state: ${state}`);

      if (state === 'failed') {
        this.logger.error('[WebRTC] ICE connection failed - check STUN/TURN config or firewall');
        this.isConnected = false;
      } else if (state === 'disconnected' || state === 'closed') {
        this.isConnected = false;
      } else if (state === 'connected') {
        this.logger.info('[WebRTC] ICE connection established');
      }
    });

    // Overall peer connection state
    this.peerConnection.onconnectionstatechange = (): void => {
      const state = this.peerConnection?.connectionState;
      this.logger.info(`[WebRTC] Peer connection state: ${state}`);

      if (state === 'connected') {
        this.logger.info('[WebRTC] Peer connection fully established');
        this.isConnected = true;
      } else if (state === 'failed') {
        this.logger.error('[WebRTC] Peer connection failed - DTLS handshake may have failed');
        this.isConnected = false;
      } else if (state === 'disconnected' || state === 'closed') {
        this.isConnected = false;
      }
    };

    // Data channel from client (critical event!)
    this.peerConnection.ondatachannel = (event: unknown): void => {
      const channel = asRecord(event)?.channel;
      if (!isDataChannelLike(channel)) {
        this.logger.error('[WebRTC] Received invalid data channel event payload');
        return;
      }

      this.logger.info('[WebRTC] Data channel received from client!');
      this.dataChannel = channel;
      this.setupDataChannelHandlers();
    };
  }

  private setupDataChannelHandlers(): void {
    if (!this.dataChannel) return;

    this.dataChannel.onopen = (): void => {
      this.logger.info('[WebRTC] ✓ Data channel opened - connection fully ready!');
      this.isConnected = true;
    };

    this.dataChannel.onclose = (): void => {
      this.logger.info('[WebRTC] Data channel closed');
      this.isConnected = false;
    };

    this.dataChannel.onerror = (error: unknown): void => {
      this.logger.error('[WebRTC] Data channel error:', error);
    };

    this.dataChannel.onmessage = async (event: unknown): Promise<void> => {
      try {
        const eventData = asRecord(event);
        const rawPayload = toStringValue(eventData?.data);

        this.logger.debug('Data channel received message', {
          dataLength: rawPayload?.length,
          dataPreview: rawPayload?.substring(0, 100),
        });

        if (!rawPayload) {
          throw new Error('WebRTC data channel message was not a string payload');
        }

        const message = JSON.parse(rawPayload) as unknown;
        const messageRecord = asRecord(message);
        const messageType = toStringValue(messageRecord?.type);

        // Handle chunked messages
        if (messageType === 'chunked-message') {
          await this.handleChunkedMessage(message);
          return;
        }

        this.logger.debug('Parsed message successfully', {
          type: messageType,
          requestId: toStringValue(messageRecord?.requestId),
          hasData: Boolean(messageRecord?.data),
        });
        await this.onMessageHandler(message);
        this.logger.debug('Message handler completed', { type: messageType });
      } catch (error) {
        const rawData = toStringValue(asRecord(event)?.data);
        this.logger.error('Failed to parse or handle message', {
          error: error instanceof Error ? error.message : String(error),
          rawData: rawData?.substring(0, 200),
        });
      }
    };
  }

  sendMessage(message: unknown): void {
    if (!this.dataChannel || !this.isConnected) {
      this.logger.warn('Cannot send message - data channel not open');
      return;
    }

    try {
      this.dataChannel.send(JSON.stringify(message));
      this.logger.debug('Sent WebRTC message', { type: toStringValue(asRecord(message)?.type) });
    } catch (error) {
      this.logger.error('Failed to send WebRTC message', error);
    }
  }

  /**
   * Handle incoming chunked message fragments
   * Validates chunks, stores them, and reassembles when all pieces arrive
   */
  private async handleChunkedMessage(chunkMessage: unknown): Promise<void> {
    const chunkRecord = asRecord(chunkMessage);
    let parsedChunk: ChunkMessage | undefined;
    if (chunkRecord) {
      const chunk: ChunkMessage = {
        chunkId: toStringValue(chunkRecord.chunkId) ?? '',
        chunkIndex: toNumber(chunkRecord.chunkIndex) ?? -1,
        totalChunks: toNumber(chunkRecord.totalChunks) ?? -1,
        chunk: toStringValue(chunkRecord.chunk) ?? '',
        originalType: toStringValue(chunkRecord.originalType) ?? 'unknown',
      };

      const originalId = toStringValue(chunkRecord.originalId);
      if (originalId) {
        chunk.originalId = originalId;
      }

      parsedChunk = chunk;
    }

    if (!parsedChunk) {
      this.logger.error('Invalid chunk message payload - not an object');
      return;
    }

    const { chunkId, chunkIndex, totalChunks, chunk, originalType, originalId } = parsedChunk;

    // === VALIDATION: Prevent malformed/malicious chunks ===

    // Validate required fields
    if (!chunkId || chunkIndex < 0 || totalChunks < 0) {
      this.logger.error('Invalid chunk message structure - missing required fields', {
        chunkMessage,
      });
      return;
    }

    // Validate chunk index range
    if (chunkIndex < 0 || chunkIndex >= totalChunks) {
      this.logger.error('Invalid chunk index out of range', {
        chunkId,
        chunkIndex,
        totalChunks,
      });
      return;
    }

    // Validate chunk data
    if (!chunk) {
      this.logger.error('Invalid chunk data - not a string', { chunkId, chunkIndex });
      return;
    }

    // === SECURITY: Prevent chunk bomb attacks ===
    if (totalChunks > WEBRTC_CONSTANTS.MAX_CHUNKS_PER_MESSAGE) {
      this.logger.error('SECURITY: Chunk count exceeds maximum allowed', {
        chunkId,
        totalChunks,
        maxAllowed: WEBRTC_CONSTANTS.MAX_CHUNKS_PER_MESSAGE,
        originalType,
      });
      return;
    }

    this.logger.debug(`Received chunk ${chunkIndex + 1}/${totalChunks}`, {
      chunkId,
      originalType,
      chunkSize: chunk.length,
    });

    // Initialize chunk storage for this message
    if (!this.pendingChunks.has(chunkId)) {
      this.pendingChunks.set(chunkId, {
        chunks: new Map(),
        totalChunks,
        originalType,
        ...(originalId ? { originalId } : {}),
        timestamp: Date.now(), // Track when first chunk arrived
      });
    }

    const pending = this.pendingChunks.get(chunkId);
    if (!pending) {
      return;
    }

    // === VALIDATION: Ensure totalChunks stays consistent ===
    if (pending.totalChunks !== totalChunks) {
      this.logger.error('Chunk count mismatch - aborting reassembly', {
        chunkId,
        expectedTotalChunks: pending.totalChunks,
        receivedTotalChunks: totalChunks,
      });
      this.pendingChunks.delete(chunkId);
      return;
    }

    // Store chunk
    pending.chunks.set(chunkIndex, chunk);

    this.logger.debug(`Collected ${pending.chunks.size}/${totalChunks} chunks`, { chunkId });

    // Check if we have all chunks
    if (pending.chunks.size === totalChunks) {
      this.logger.info('All chunks received - reassembling message', {
        chunkId,
        originalType,
        totalChunks,
      });

      // Reassemble in order
      let reassembled = '';
      for (let i = 0; i < totalChunks; i++) {
        const chunkData = pending.chunks.get(i);
        if (!chunkData) {
          this.logger.error('Missing chunk during reassembly', {
            chunkId,
            missingIndex: i,
            totalChunks,
          });
          this.pendingChunks.delete(chunkId);
          return;
        }
        reassembled += chunkData;
      }

      this.logger.debug(`Reassembled ${reassembled.length} bytes`, { chunkId });

      // Parse and handle the complete message
      try {
        const completeMessage = JSON.parse(reassembled) as unknown;
        const completeMessageRecord = asRecord(completeMessage);
        this.logger.debug('Parsed reassembled message successfully', {
          type: toStringValue(completeMessageRecord?.type),
          id: toStringValue(completeMessageRecord?.id),
        });
        await this.onMessageHandler(completeMessage);
        this.logger.debug('Reassembled message handler completed', {
          type: toStringValue(completeMessageRecord?.type),
        });
      } catch (error) {
        this.logger.error('Failed to parse or handle reassembled message', {
          error: error instanceof Error ? error.message : String(error),
          chunkId,
          reassembledLength: reassembled.length,
        });

        // Send error response to client if we have a requestId
        if (originalId) {
          this.sendMessage({
            type: 'error',
            requestId: originalId,
            error: 'Failed to reassemble chunked message',
            details: error instanceof Error ? error.message : String(error),
          });
        }
      }

      // Clean up completed message
      this.pendingChunks.delete(chunkId);
    }
  }

  /**
   * Start background cleanup task for timed-out chunks
   * Prevents memory leaks from incomplete message transfers
   */
  private startChunkCleanup(): void {
    this.chunkCleanupInterval = setInterval(() => {
      const now = Date.now();
      let cleanedCount = 0;

      for (const [chunkId, pending] of this.pendingChunks.entries()) {
        const age = now - pending.timestamp;

        if (age > WEBRTC_CONSTANTS.CHUNK_TIMEOUT_MS) {
          this.logger.warn('Chunk timeout - cleaning up incomplete message', {
            chunkId,
            originalType: pending.originalType,
            receivedChunks: pending.chunks.size,
            totalChunks: pending.totalChunks,
            ageMs: age,
          });

          // Send error response to client if we have a requestId
          if (pending.originalId) {
            this.sendMessage({
              type: 'error',
              requestId: pending.originalId,
              error: 'Chunked message timeout',
              details: `Received ${pending.chunks.size}/${pending.totalChunks} chunks before timeout`,
            });
          }

          this.pendingChunks.delete(chunkId);
          cleanedCount++;
        }
      }

      if (cleanedCount > 0) {
        this.logger.info(`Cleaned up ${cleanedCount} timed-out chunk message(s)`);
      }
    }, WEBRTC_CONSTANTS.CHUNK_CLEANUP_INTERVAL_MS);
  }

  disconnect(): void {
    // Stop chunk cleanup interval
    if (this.chunkCleanupInterval) {
      clearInterval(this.chunkCleanupInterval);
      this.chunkCleanupInterval = null;
    }

    if (this.dataChannel) {
      this.dataChannel.close();
      this.dataChannel = null;
    }

    if (this.peerConnection) {
      void this.peerConnection.close();
      this.peerConnection = null;
    }

    this.isConnected = false;
    this.pendingChunks.clear();
    this.logger.info('WebRTC peer disconnected');
  }

  getIsConnected(): boolean {
    return this.isConnected;
  }
}
