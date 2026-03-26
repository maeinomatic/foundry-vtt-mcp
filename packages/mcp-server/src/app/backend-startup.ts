import { config } from '../config.js';
import { MapGenerationTools } from '../tools/map-generation.js';
import { startControlSocketServer } from '../transport/control-socket-server.js';
import { registerBackendShutdownHandlers } from './backend-process-lifecycle.js';
import { ComfyUIService } from './comfyui-service.js';
import { initializeMapGenerationRuntime } from './map-generation-runtime.js';
import { createBackendCoreRuntime } from './runtime.js';

const CONTROL_HOST = '127.0.0.1';

const CONTROL_PORT = 31414;

export async function startBackendServices(): Promise<void> {
  const {
    logger,
    foundryClient,
    characterTools,
    compendiumTools,
    sceneTools,
    actorCreationTools,
    dsa5CharacterCreator,
    questCreationTools,
    diceRollTools,
    campaignManagementTools,
    ownershipTools,
    tokenManipulationTools,
    baseToolDefinitions,
  } = await createBackendCoreRuntime();

  const comfyUIService = new ComfyUIService({
    logger,
    port: config.comfyui?.port || 31411,
    host: '127.0.0.1',
  });

  const { mapGenerationTools }: { mapGenerationTools: MapGenerationTools } =
    await initializeMapGenerationRuntime({
      logger,
      foundryClient,
      comfyUIService,
      comfyuiPort: config.comfyui?.port || 31411,
    });

  const allTools = [...baseToolDefinitions, ...mapGenerationTools.getToolDefinitions()];

  foundryClient.connect().catch(error => {
    logger.error('Foundry connector failed to start', error);
  });

  const autoStartComfyUI = async (): Promise<void> => {
    try {
      logger.info('Auto-starting ComfyUI service...');

      const result = await comfyUIService.startService();

      logger.info('ComfyUI auto-start result', result);
    } catch (error: unknown) {
      logger.warn('ComfyUI auto-start failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  await startControlSocketServer({
    host: CONTROL_HOST,
    port: CONTROL_PORT,
    logger,
    allTools,
    toolDependencies: {
      characterTools,
      compendiumTools,
      sceneTools,
      actorCreationTools,
      dsa5CharacterCreator,
      questCreationTools,
      diceRollTools,
      campaignManagementTools,
      ownershipTools,
      tokenManipulationTools,
      mapGenerationTools,
    },
  });

  void autoStartComfyUI();

  registerBackendShutdownHandlers(() => {
    foundryClient.disconnect();
  });
}
