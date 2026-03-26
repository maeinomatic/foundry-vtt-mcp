import type { FoundryClient } from '../foundry-client.js';
import type { FoundryBackendComfyUIHandlers } from '../foundry-types.js';
import { Logger } from '../logger.js';
import { MapGenerationTools } from '../tools/map-generation.js';
import {
  createBackendComfyUIHandlers,
  type ComfyUIClientLike,
  type MapGenerationQueue,
} from './backend-comfyui-handlers.js';
import { ComfyUIService } from './comfyui-service.js';

export interface MapGenerationRuntimeOptions {
  logger: Logger;
  foundryClient: FoundryClient;
  comfyUIService: ComfyUIService;
  comfyuiPort: number;
}

export interface MapGenerationRuntime {
  mapGenerationTools: MapGenerationTools;
  backendComfyUIHandlers: FoundryBackendComfyUIHandlers;
}

export async function initializeMapGenerationRuntime(
  options: MapGenerationRuntimeOptions
): Promise<MapGenerationRuntime> {
  const { logger, foundryClient, comfyUIService, comfyuiPort } = options;

  let jobQueue: MapGenerationQueue | null = null;
  let comfyuiClient: ComfyUIClientLike | null = null;

  try {
    const { JobQueue } = await import('../job-queue.js');
    const { ComfyUIClient } = await import('../comfyui-client.js');

    jobQueue = new JobQueue({ logger });
    comfyuiClient = new ComfyUIClient({
      logger,
      config: {
        port: comfyuiPort,
      },
    });

    logger.info('Map generation backend components initialized (ComfyUI on localhost:31411)');

    if (comfyuiClient.checkInstallation) {
      const isInstalled = comfyuiClient.checkInstallation() ?? false;
      if (isInstalled) {
        logger.info('Auto-starting ComfyUI service...');
        try {
          await comfyuiClient.startService();
          logger.info('ComfyUI service auto-started successfully');
        } catch (error) {
          logger.warn('Failed to auto-start ComfyUI service', { error });
        }
      } else {
        logger.info('ComfyUI not installed, skipping auto-start');
      }
    }
  } catch (error) {
    logger.warn('Failed to initialize map generation components', { error });
  }

  const globalHandlers = globalThis as {
    backendComfyUIHandlers?: FoundryBackendComfyUIHandlers;
  };

  globalHandlers.backendComfyUIHandlers = createBackendComfyUIHandlers({
    logger,
    foundryClient,
    jobQueue,
    comfyuiClient,
    startComfyUIService: () => comfyUIService.startService(),
    stopComfyUIService: () => comfyUIService.stopService(),
    checkComfyUIStatus: () => comfyUIService.checkStatus(),
  });

  const mapGenerationTools = new MapGenerationTools({
    foundryClient,
    logger,
    backendComfyUIHandlers: globalHandlers.backendComfyUIHandlers,
  });

  return {
    mapGenerationTools,
    backendComfyUIHandlers: globalHandlers.backendComfyUIHandlers,
  };
}
