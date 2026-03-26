import type {
  FoundryBackendComfyUIHandlers,
  FoundryBridgeMessage,
  FoundryConnectionType,
  UnknownRecord,
} from '../foundry-types.js';
import { Logger } from '../logger.js';

export interface MapGenerationParams {
  prompt: string;
  scene_name?: string;
  size: 'small' | 'medium' | 'large';
  grid_size: number;
  quality?: 'low' | 'medium' | 'high';
}

export interface QueueJob {
  id: string;
  created_at?: number;
  started_at?: number;
  status?: string;
  progress_percent?: number;
  current_stage?: string;
  result?: unknown;
  error?: string;
  comfyui_job_id?: string;
  params: MapGenerationParams;
}

export interface MapGenerationQueue {
  createJob(input: { params: MapGenerationParams }): Promise<QueueJob>;
  getJob(jobId: string): Promise<QueueJob | undefined>;
  markJobStarted(jobId: string): Promise<void>;
  updateJobProgress(jobId: string, progress: number, stage: string): Promise<void>;
  markJobComplete(jobId: string, result: UnknownRecord): Promise<void>;
  markJobFailed(jobId: string, error: string): Promise<void>;
  cancelJob(jobId: string): Promise<boolean>;
}

export interface ComfyUIClientLike {
  checkInstallation?(): boolean;
  checkHealth(): Promise<{ available?: boolean }>;
  startService(): Promise<void | UnknownRecord>;
  getSizePixels(size: string): number;
  submitJob(input: {
    prompt: string;
    width: number;
    height: number;
    quality?: 'low' | 'medium' | 'high';
  }): Promise<{ prompt_id: string }>;
  getJobStatus(promptId: string): Promise<string>;
  getJobImages(promptId: string): Promise<string[]>;
  downloadImage(filename: string): Promise<Buffer | null>;
  registerProgressCallback(
    promptId: string,
    callback: (progress: { currentStep: number; totalSteps: number }) => void
  ): void;
  unregisterProgressCallback(promptId: string): void;
  cancelJob(promptId: string): Promise<boolean>;
}

export interface FoundryMessenger {
  sendMessage(message: FoundryBridgeMessage | UnknownRecord): void;
  broadcastMessage(message: FoundryBridgeMessage | UnknownRecord): void;
  query<TResult = unknown, TParams extends UnknownRecord | undefined = UnknownRecord>(
    method: string,
    params?: TParams
  ): Promise<TResult>;
  getConnectionType?(): FoundryConnectionType;
}

export interface CreateBackendComfyUIHandlersOptions {
  logger: Logger;
  foundryClient: FoundryMessenger;
  jobQueue: MapGenerationQueue | null;
  comfyuiClient: ComfyUIClientLike | null;
  startComfyUIService: () => Promise<Record<string, unknown>>;
  stopComfyUIService: () => Promise<Record<string, unknown>>;
  checkComfyUIStatus: () => Promise<Record<string, unknown>>;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === 'object' ? (value as UnknownRecord) : {};
}

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' ? value : fallback;
}

function asSize(
  value: unknown,
  fallback: 'small' | 'medium' | 'large'
): 'small' | 'medium' | 'large' {
  if (value === 'small' || value === 'medium' || value === 'large') {
    return value;
  }
  return fallback;
}

function asQuality(value: unknown, fallback: 'low' | 'medium' | 'high'): 'low' | 'medium' | 'high' {
  if (value === 'low' || value === 'medium' || value === 'high') {
    return value;
  }
  return fallback;
}

async function processMapGenerationInBackend(
  jobId: string,
  jobQueue: MapGenerationQueue,
  comfyuiClient: ComfyUIClientLike,
  logger: Logger,
  foundryClient: FoundryMessenger
): Promise<void> {
  const fs2 = await import('fs').then(m => m.promises);
  const path2 = await import('path');
  const os2 = await import('os');
  const processDebugLog = path2.join(os2.tmpdir(), 'process-mapgen-debug.log');
  await fs2.appendFile(
    processDebugLog,
    `[${new Date().toISOString()}] processMapGenerationInBackend ENTERED - jobId: ${jobId}\n`
  );

  try {
    await fs2.appendFile(
      processDebugLog,
      `[${new Date().toISOString()}] Getting job from queue...\n`
    );
    const job = await jobQueue.getJob(jobId);
    if (!job) {
      await fs2.appendFile(
        processDebugLog,
        `[${new Date().toISOString()}] ERROR: Job not found!\n`
      );
      throw new Error(`Job ${jobId} not found`);
    }

    await fs2.appendFile(
      processDebugLog,
      `[${new Date().toISOString()}] Job retrieved: ${JSON.stringify(job.params)}\n`
    );
    logger.info('Starting background map generation processing', { jobId, params: job.params });

    await fs2.appendFile(
      processDebugLog,
      `[${new Date().toISOString()}] Marking job as started...\n`
    );
    await jobQueue.markJobStarted(jobId);
    await fs2.appendFile(processDebugLog, `[${new Date().toISOString()}] Job marked as started\n`);

    foundryClient.sendMessage({
      type: 'map-generation-progress',
      jobId,
      progress: 10,
      stage: 'Starting processing...',
    });

    await fs2.appendFile(
      processDebugLog,
      `[${new Date().toISOString()}] Checking ComfyUI health...\n`
    );
    const healthInfo = await comfyuiClient.checkHealth();
    await fs2.appendFile(
      processDebugLog,
      `[${new Date().toISOString()}] Health check: ${JSON.stringify(healthInfo)}\n`
    );
    if (!healthInfo.available) {
      await comfyuiClient.startService();
    }

    await jobQueue.updateJobProgress(jobId, 25, 'Submitting to ComfyUI...');
    foundryClient.sendMessage({
      type: 'map-generation-progress',
      jobId,
      progress: 25,
      stage: 'Submitting to ComfyUI...',
    });

    await fs2.appendFile(
      processDebugLog,
      `[${new Date().toISOString()}] Submitting job to ComfyUI...\n`
    );
    const sizePixels = comfyuiClient.getSizePixels(job.params.size);
    await fs2.appendFile(
      processDebugLog,
      `[${new Date().toISOString()}] Size pixels: ${sizePixels}\n`
    );

    let comfyuiJob: { prompt_id: string };
    try {
      comfyuiJob = await comfyuiClient.submitJob({
        prompt: job.params.prompt,
        width: sizePixels,
        height: sizePixels,
        quality: job.params.quality ?? 'low',
      });
      await fs2.appendFile(
        processDebugLog,
        `[${new Date().toISOString()}] ComfyUI job submitted: ${comfyuiJob.prompt_id}\n`
      );

      const currentJob = await jobQueue.getJob(jobId);
      if (currentJob) {
        currentJob.comfyui_job_id = comfyuiJob.prompt_id;
      }
    } catch (submitError: unknown) {
      await fs2.appendFile(
        processDebugLog,
        `[${new Date().toISOString()}] ERROR submitting to ComfyUI: ${getErrorMessage(submitError)}\n`
      );
      await fs2.appendFile(
        processDebugLog,
        `[${new Date().toISOString()}] Error stack: ${submitError instanceof Error ? (submitError.stack ?? 'none') : 'none'}\n`
      );
      throw submitError;
    }

    await jobQueue.updateJobProgress(jobId, 50, 'Generating battlemap...');
    foundryClient.sendMessage({
      type: 'map-generation-progress',
      jobId,
      progress: 50,
      stage: 'Generating battlemap...',
    });

    await fs2.appendFile(
      processDebugLog,
      `[${new Date().toISOString()}] Starting status polling with WebSocket progress...\n`
    );

    comfyuiClient.registerProgressCallback(
      comfyuiJob.prompt_id,
      (progress: { currentStep: number; totalSteps: number }) => {
        const { currentStep, totalSteps } = progress;
        const progressPercent = Math.floor((currentStep / totalSteps) * 100);

        logger.info('Real-time progress update from ComfyUI', {
          jobId,
          promptId: comfyuiJob.prompt_id,
          currentStep,
          totalSteps,
          progressPercent,
        });

        foundryClient.sendMessage({
          type: 'map-generation-progress',
          data: {
            jobId,
            progress: 50 + progressPercent / 2,
            status: 'AI generating battlemap...',
            queueInfo: {
              currentStep,
              totalSteps,
              estimatedTimeRemaining: undefined,
            },
          },
        });
      }
    );

    let status = await comfyuiClient.getJobStatus(comfyuiJob.prompt_id);
    logger.info('Initial job status', { jobId, promptId: comfyuiJob.prompt_id, status });
    await fs2.appendFile(
      processDebugLog,
      `[${new Date().toISOString()}] Initial status: ${status}\n`
    );

    let pollCount = 0;
    while (status === 'queued' || status === 'running') {
      pollCount++;
      logger.info('Polling job status', {
        jobId,
        promptId: comfyuiJob.prompt_id,
        pollCount,
        currentStatus: status,
      });

      await new Promise(resolve => setTimeout(resolve, 5000));
      status = await comfyuiClient.getJobStatus(comfyuiJob.prompt_id);

      logger.info('Job status after poll', {
        jobId,
        promptId: comfyuiJob.prompt_id,
        pollCount,
        newStatus: status,
      });
    }

    comfyuiClient.unregisterProgressCallback(comfyuiJob.prompt_id);

    logger.info('Job polling completed', {
      jobId,
      promptId: comfyuiJob.prompt_id,
      finalStatus: status,
      totalPolls: pollCount,
    });
    await fs2.appendFile(
      processDebugLog,
      `[${new Date().toISOString()}] Polling complete, status: ${status}\n`
    );

    if (status === 'failed') {
      throw new Error('ComfyUI generation failed');
    }

    await fs2.appendFile(processDebugLog, `[${new Date().toISOString()}] Getting job images...\n`);
    await jobQueue.updateJobProgress(jobId, 85, 'Downloading image...');

    const imageFilenames = await comfyuiClient.getJobImages(comfyuiJob.prompt_id);
    await fs2.appendFile(
      processDebugLog,
      `[${new Date().toISOString()}] Images: ${JSON.stringify(imageFilenames)}\n`
    );
    if (!imageFilenames || imageFilenames.length === 0) {
      throw new Error('No images found in ComfyUI job output');
    }

    await fs2.appendFile(
      processDebugLog,
      `[${new Date().toISOString()}] Downloading image: ${imageFilenames[0]}\n`
    );
    const firstImageFilename = imageFilenames[0] ?? '';
    const imageBuffer = await comfyuiClient.downloadImage(firstImageFilename);
    await fs2.appendFile(
      processDebugLog,
      `[${new Date().toISOString()}] Downloaded, buffer size: ${imageBuffer?.length ?? 0}\n`
    );
    if (!imageBuffer) {
      throw new Error(`Failed to download generated image: ${firstImageFilename}`);
    }

    await fs2.appendFile(
      processDebugLog,
      `[${new Date().toISOString()}] Updating progress to 90%...\n`
    );
    await jobQueue.updateJobProgress(jobId, 90, 'Saving image...');
    await fs2.appendFile(processDebugLog, `[${new Date().toISOString()}] Progress updated\n`);

    await fs2.appendFile(
      processDebugLog,
      `[${new Date().toISOString()}] About to import fs/path/os for upload...\n`
    );
    const fs = await import('fs').then(m => m.promises);
    const path = await import('path');
    const os = await import('os');
    await fs2.appendFile(processDebugLog, `[${new Date().toISOString()}] Imports complete\n`);

    await fs2.appendFile(
      processDebugLog,
      `[${new Date().toISOString()}] Creating filename and checking connection type...\n`
    );
    const timestamp = Date.now();
    const filename = `map_${jobId}_${timestamp}.png`;

    await fs2.appendFile(
      processDebugLog,
      `[${new Date().toISOString()}] foundryClient exists: ${!!foundryClient}, type: ${typeof foundryClient}\n`
    );
    await fs2.appendFile(
      processDebugLog,
      `[${new Date().toISOString()}] About to call getConnectionType()...\n`
    );
    let connectionType: 'websocket' | 'webrtc' | null = null;
    try {
      connectionType = foundryClient.getConnectionType?.() ?? null;
      await fs2.appendFile(
        processDebugLog,
        `[${new Date().toISOString()}] getConnectionType() returned: ${connectionType}\n`
      );
    } catch (err: unknown) {
      await fs2.appendFile(
        processDebugLog,
        `[${new Date().toISOString()}] getConnectionType() threw error: ${getErrorMessage(err)}\n`
      );
      connectionType = 'webrtc';
    }

    await fs2.appendFile(
      processDebugLog,
      `[${new Date().toISOString()}] Using upload method for all connections\n`
    );

    const debugLog = async (msg: string): Promise<void> => {
      const logPath = path.join(os.tmpdir(), 'foundry-mcp-upload-debug.log');
      await fs.appendFile(logPath, `[${new Date().toISOString()}] ${msg}\n`);
    };

    await debugLog(`=== MAP GENERATION DEBUG START ===`);
    await debugLog(`JobId: ${jobId}, Filename: ${filename}`);
    await debugLog(`Connection type: ${connectionType}`);
    await debugLog(`Image size: ${imageBuffer.length} bytes`);
    await debugLog(`Using upload method (always) - imageSize: ${imageBuffer.length} bytes`);

    const base64Image = imageBuffer.toString('base64');
    await debugLog(
      `Base64 conversion complete - size: ${base64Image.length} bytes (${(base64Image.length / 1024 / 1024).toFixed(2)} MB)`
    );

    await debugLog('Sending upload query to Foundry...');

    let uploadResult: UnknownRecord;
    try {
      const uploadResponse = await foundryClient.query<
        UnknownRecord,
        { filename: string; imageData: string }
      >('maeinomatic-foundry-mcp.upload-generated-map', {
        filename,
        imageData: base64Image,
      });
      uploadResult = asRecord(uploadResponse);

      await debugLog(`Upload query completed - success: ${String(uploadResult.success)}`);
      await debugLog(`Full uploadResult: ${JSON.stringify(uploadResult)}`);

      if (uploadResult.success !== true) {
        const uploadError = asString(uploadResult.error, 'Unknown upload error');
        await debugLog(`Upload failed - error: ${uploadError}`);
        throw new Error(`Failed to upload image to Foundry: ${uploadError}`);
      }
    } catch (error) {
      await debugLog(`Upload exception: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }

    await debugLog(`Extracting path from uploadResult...`);
    const webPath = asString(uploadResult.path, '');
    if (!webPath) {
      throw new Error('Upload succeeded but no path was returned by Foundry');
    }
    await debugLog(`webPath extracted: ${webPath}`);
    logger.info('Image uploaded successfully to Foundry', { path: webPath });

    await jobQueue.updateJobProgress(jobId, 95, 'Creating scene data...');

    const sceneSize = comfyuiClient.getSizePixels(job.params.size);
    logger.info('Job params received', {
      scene_name: job.params.scene_name,
      prompt: job.params.prompt,
      all_params: job.params,
    });

    if (!job.params.scene_name) {
      throw new Error(
        `Scene name missing from job params. Received params: ${JSON.stringify(job.params)}`
      );
    }

    const sceneName = job.params.scene_name.trim();
    logger.info('Using scene name', { scene_name: sceneName });
    const sceneData = {
      name: sceneName,
      img: webPath,
      background: { src: webPath },
      width: sceneSize,
      height: sceneSize,
      padding: 0.25,
      initial: {
        x: sceneSize / 2,
        y: sceneSize / 2,
        scale: 1,
      },
      backgroundColor: '#999999',
      grid: {
        type: 1,
        size: job.params.grid_size ?? 100,
        color: '#000000',
        alpha: 0.2,
        distance: 5,
        units: 'ft',
      },
      tokenVision: true,
      fogExploration: true,
      fogReset: Date.now(),
      globalLight: false,
      darkness: 0,
      navigation: true,
      active: false,
      permission: {
        default: 2,
      },
      walls: [],
    };

    await jobQueue.updateJobProgress(jobId, 100, 'Complete');
    await jobQueue.markJobComplete(jobId, {
      generation_time_ms: Date.now() - (job.started_at ?? job.created_at ?? Date.now()),
      image_url: webPath,
      foundry_scene_payload: sceneData,
    });

    foundryClient.broadcastMessage({
      type: 'job-completed',
      jobId,
      data: {
        status: 'completed',
        result: sceneData,
        image_path: webPath,
        prompt: job.params.prompt,
      },
    });

    logger.info('Map generation completed successfully', { jobId });
  } catch (error: unknown) {
    await fs2.appendFile(
      processDebugLog,
      `[${new Date().toISOString()}] ERROR in processMapGenerationInBackend: ${getErrorMessage(error)}\n`
    );
    await fs2.appendFile(
      processDebugLog,
      `[${new Date().toISOString()}] Error stack: ${error instanceof Error ? (error.stack ?? 'none') : 'none'}\n`
    );

    logger.error('Background map generation processing failed', { jobId, error });
    await jobQueue.markJobFailed(jobId, getErrorMessage(error));

    foundryClient.sendMessage({
      type: 'map-generation-failed',
      jobId,
      error: getErrorMessage(error),
    });
  }
}

async function handleGenerateMapRequest(
  message: unknown,
  jobQueue: MapGenerationQueue,
  comfyuiClient: ComfyUIClientLike,
  logger: Logger,
  foundryClient: FoundryMessenger
): Promise<Record<string, unknown>> {
  try {
    const messageRecord = asRecord(message);
    const data = asRecord(messageRecord.data ?? message);

    if (typeof data.prompt !== 'string' || data.prompt.length === 0) {
      throw new Error('Prompt is required and must be a string');
    }

    if (typeof data.scene_name !== 'string' || data.scene_name.length === 0) {
      throw new Error('Scene name is required and must be a string');
    }

    const params: MapGenerationParams = {
      prompt: data.prompt.trim(),
      scene_name: data.scene_name.trim(),
      size: asSize(data.size, 'medium'),
      grid_size: asNumber(data.grid_size, 70),
      quality: asQuality(data.quality, 'low'),
    };

    const job = await jobQueue.createJob({ params });
    const jobId = job.id;

    processMapGenerationInBackend(jobId, jobQueue, comfyuiClient, logger, foundryClient).catch(
      (error: unknown) => {
        logger.error('Background map generation failed', { jobId, error });
      }
    );

    return {
      status: 'success',
      jobId,
      message: 'Map generation started',
      estimatedTime: 'varies by hardware and quality setting',
    };
  } catch (error: unknown) {
    logger.error('Map generation request failed', { error: getErrorMessage(error) });
    return {
      status: 'error',
      message: getErrorMessage(error),
    };
  }
}

async function handleCheckMapStatusRequest(
  data: unknown,
  jobQueue: MapGenerationQueue,
  logger: Logger
): Promise<Record<string, unknown>> {
  try {
    const dataRecord = asRecord(data);
    if (Object.keys(dataRecord).length === 0) {
      throw new Error('Request data is required');
    }
    const jobId = asString(dataRecord.job_id, '');
    if (!jobId) {
      throw new Error('Job ID is required');
    }

    const job = await jobQueue.getJob(jobId);
    if (!job) {
      return {
        status: 'error',
        message: `Job ${jobId} not found`,
      };
    }

    return {
      status: 'success',
      job: {
        id: job.id,
        status: job.status,
        progress_percent: job.progress_percent,
        current_stage: job.current_stage,
        result: job.result,
        error: job.error,
      },
    };
  } catch (error: unknown) {
    logger.error('Map status check failed', { error: getErrorMessage(error) });
    return {
      status: 'error',
      message: getErrorMessage(error),
    };
  }
}

async function handleCancelMapJobRequest(
  data: unknown,
  jobQueue: MapGenerationQueue,
  comfyuiClient: ComfyUIClientLike,
  logger: Logger
): Promise<Record<string, unknown>> {
  try {
    const dataRecord = asRecord(data);
    if (Object.keys(dataRecord).length === 0) {
      throw new Error('Request data is required');
    }
    const jobId = asString(dataRecord.job_id, '');
    if (!jobId) {
      throw new Error('Job ID is required');
    }

    const job = await jobQueue.getJob(jobId);
    if (!job) {
      return {
        status: 'error',
        message: 'Job not found',
      };
    }

    if (job.comfyui_job_id) {
      logger.info('Cancelling ComfyUI job', { jobId, promptId: job.comfyui_job_id });
      const comfyuiCancelled = await comfyuiClient.cancelJob(job.comfyui_job_id);
      if (comfyuiCancelled) {
        logger.info('ComfyUI job interrupted successfully', {
          jobId,
          promptId: job.comfyui_job_id,
        });
      } else {
        logger.warn('Failed to interrupt ComfyUI job', { jobId, promptId: job.comfyui_job_id });
      }
    }

    const cancelled = await jobQueue.cancelJob(jobId);

    return {
      status: cancelled ? 'success' : 'error',
      message: cancelled ? 'Job cancelled successfully' : 'Failed to cancel job',
    };
  } catch (error: unknown) {
    logger.error('Map job cancellation failed', { error: getErrorMessage(error) });
    return {
      status: 'error',
      message: getErrorMessage(error),
    };
  }
}

export function createBackendComfyUIHandlers(
  options: CreateBackendComfyUIHandlersOptions
): FoundryBackendComfyUIHandlers {
  const {
    logger,
    foundryClient,
    jobQueue,
    comfyuiClient,
    startComfyUIService,
    stopComfyUIService,
    checkComfyUIStatus,
  } = options;

  return {
    handleMessage: async (
      message: FoundryBridgeMessage | UnknownRecord
    ): Promise<UnknownRecord> => {
      const fs = await import('fs').then(m => m.promises);
      const path = await import('path');
      const os = await import('os');
      const debugLog = path.join(os.tmpdir(), 'backend-handler-debug.log');
      const messageRecord = asRecord(message);
      const messageType = asString(messageRecord.type, 'unknown');
      const requestId = asString(messageRecord.requestId, '');
      const messageData = messageRecord.data;

      await fs.appendFile(
        debugLog,
        `[${new Date().toISOString()}] handleMessage called - type: ${messageType}, requestId: ${requestId}\n`
      );

      logger.info('Handling ComfyUI message', {
        requestId,
        type: messageType,
        hasData: Boolean(messageData),
      });

      try {
        await fs.appendFile(
          debugLog,
          `[${new Date().toISOString()}] About to switch on message.type: "${messageType}"\n`
        );

        let result: UnknownRecord;

        switch (messageType) {
          case 'start-comfyui-service':
            result = await startComfyUIService();
            break;

          case 'stop-comfyui-service':
            result = await stopComfyUIService();
            break;

          case 'check-comfyui-status':
            result = await checkComfyUIStatus();
            break;

          case 'generate-map-request':
            await fs.appendFile(
              debugLog,
              `[${new Date().toISOString()}] Matched generate-map-request case, calling handler...\n`
            );
            if (!jobQueue || !comfyuiClient) {
              throw new Error('Map generation components not initialized');
            }
            result = await handleGenerateMapRequest(
              messageRecord,
              jobQueue,
              comfyuiClient,
              logger,
              foundryClient
            );
            await fs.appendFile(
              debugLog,
              `[${new Date().toISOString()}] Handler returned: ${JSON.stringify(result)}\n`
            );
            break;

          case 'check-map-status-request':
            if (!jobQueue) {
              throw new Error('Map generation components not initialized');
            }
            result = await handleCheckMapStatusRequest(messageData, jobQueue, logger);
            break;

          case 'cancel-map-job-request':
            if (!jobQueue || !comfyuiClient) {
              throw new Error('Map generation components not initialized');
            }
            result = await handleCancelMapJobRequest(messageData, jobQueue, comfyuiClient, logger);
            break;

          default:
            logger.warn('Unknown ComfyUI message type', { type: messageType });
            result = { status: 'error', message: `Unknown message type: ${messageType}` };
        }

        if (requestId) {
          const response: FoundryBridgeMessage<UnknownRecord> = {
            type: `${messageType}-response`,
            requestId,
            ...asRecord(result),
          };

          try {
            foundryClient.sendMessage(response);
          } catch (error) {
            logger.error('Failed to send ComfyUI response to Foundry', { error, response });
          }
        }

        return result;
      } catch (error: unknown) {
        logger.error('ComfyUI message handling failed', {
          requestId,
          type: messageType,
          error: getErrorMessage(error),
        });

        const errorResult: UnknownRecord = {
          status: 'error',
          message: getErrorMessage(error),
        };

        if (requestId) {
          try {
            foundryClient.sendMessage({
              type: `${messageType}-response`,
              requestId,
              ...errorResult,
            });
          } catch (sendError) {
            logger.error('Failed to send ComfyUI error response', { sendError });
          }
        }

        return errorResult;
      }
    },
  };
}
