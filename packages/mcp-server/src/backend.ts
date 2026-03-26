import { ComfyUIService } from './app/comfyui-service.js';
import { createBackendCoreRuntime } from './app/runtime.js';
import { config } from './config.js';
import { MapGenerationTools } from './tools/map-generation.js';
import { startControlSocketServer } from './transport/control-socket-server.js';

const CONTROL_HOST = '127.0.0.1';

const CONTROL_PORT = 31414;

async function startBackend(): Promise<void> {
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

  const { initializeMapGenerationRuntime } = await import('./app/map-generation-runtime.js');
  const { mapGenerationTools }: { mapGenerationTools: MapGenerationTools } =
    await initializeMapGenerationRuntime({
      logger,
      foundryClient,
      comfyUIService,
      comfyuiPort: config.comfyui?.port || 31411,
    });

  const allTools = [...baseToolDefinitions, ...mapGenerationTools.getToolDefinitions()];

  // Start Foundry connector (owns app port 31415)

  foundryClient.connect().catch(e => {
    logger.error('Foundry connector failed to start', e);
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

      // Don't throw - backend should continue even if ComfyUI fails to start
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

  const { registerBackendShutdownHandlers } = await import('./app/backend-process-lifecycle.js');
  registerBackendShutdownHandlers(() => {
    foundryClient.disconnect();
  });
}

void (async (): Promise<void> => {
  const { runBackendMain } = await import('./app/backend-process-lifecycle.js');
  await runBackendMain(startBackend);
})();
