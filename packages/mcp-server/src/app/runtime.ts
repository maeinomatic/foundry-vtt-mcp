import * as os from 'os';
import * as path from 'path';

import { config } from '../config.js';
import { FoundryClient } from '../foundry-client.js';
import type { UnknownRecord } from '../foundry-types.js';
import { Logger } from '../logger.js';
import { DSA5CharacterCreator } from '../systems/dsa5/character-creator.js';
import { ActorCreationTools } from '../tools/actor-creation.js';
import { CampaignManagementTools } from '../tools/campaign-management.js';
import { CharacterTools } from '../tools/character.js';
import { CompendiumTools } from '../tools/compendium.js';
import { DiceRollTools } from '../tools/dice-roll.js';
import { OwnershipTools } from '../tools/ownership.js';
import { QuestCreationTools } from '../tools/quest-creation.js';
import { SceneTools } from '../tools/scene.js';
import { TokenManipulationTools } from '../tools/token-manipulation.js';

export interface BackendCoreRuntime {
  logger: Logger;
  foundryClient: FoundryClient;
  characterTools: CharacterTools;
  compendiumTools: CompendiumTools;
  sceneTools: SceneTools;
  actorCreationTools: ActorCreationTools;
  dsa5CharacterCreator: DSA5CharacterCreator;
  questCreationTools: QuestCreationTools;
  diceRollTools: DiceRollTools;
  campaignManagementTools: CampaignManagementTools;
  ownershipTools: OwnershipTools;
  tokenManipulationTools: TokenManipulationTools;
  baseToolDefinitions: UnknownRecord[];
}

export async function createBackendCoreRuntime(): Promise<BackendCoreRuntime> {
  const logger = new Logger({
    level: config.logLevel,
    format: config.logFormat,
    enableConsole: false,
    enableFile: true,
    filePath: path.join(os.tmpdir(), 'maeinomatic-foundry-mcp-server', 'mcp-server.log'),
  });

  logger.info('Starting Foundry MCP Backend', {
    version: config.server.version,
    foundryHost: config.foundry.host,
    foundryPort: config.foundry.port,
  });

  const { clearSystemCache } = await import('../utils/system-detection.js');

  let characterTools: CharacterTools | null = null;
  let compendiumTools: CompendiumTools | null = null;

  const foundryClient = new FoundryClient(config.foundry, logger, state => {
    clearSystemCache();
    characterTools?.invalidateSystemCache();
    compendiumTools?.invalidateSystemCache();
    logger.info('Cleared system caches after Foundry connection state change', { state });
  });

  const { getSystemRegistry } = await import('../systems/index.js');
  const { DnD5eAdapter } = await import('../systems/dnd5e/adapter.js');
  const { PF2eAdapter } = await import('../systems/pf2e/adapter.js');
  const { DSA5Adapter } = await import('../systems/dsa5/adapter.js');

  const systemRegistry = getSystemRegistry(logger);
  systemRegistry.register(new DnD5eAdapter());
  systemRegistry.register(new PF2eAdapter());
  systemRegistry.register(new DSA5Adapter());

  logger.info('System registry initialized', {
    supportedSystems: systemRegistry.getSupportedSystems(),
  });

  characterTools = new CharacterTools({ foundryClient, logger, systemRegistry });
  compendiumTools = new CompendiumTools({ foundryClient, logger, systemRegistry });

  const sceneTools = new SceneTools({ foundryClient, logger });
  const actorCreationTools = new ActorCreationTools({ foundryClient, logger });
  const dsa5CharacterCreator = new DSA5CharacterCreator({ foundryClient, logger });
  const questCreationTools = new QuestCreationTools({ foundryClient, logger });
  const diceRollTools = new DiceRollTools({ foundryClient, logger });
  const campaignManagementTools = new CampaignManagementTools(foundryClient, logger);
  const ownershipTools = new OwnershipTools({ foundryClient, logger });
  const tokenManipulationTools = new TokenManipulationTools({ foundryClient, logger });

  const baseToolDefinitions = [
    ...characterTools.getToolDefinitions(),
    ...compendiumTools.getToolDefinitions(),
    ...sceneTools.getToolDefinitions(),
    ...actorCreationTools.getToolDefinitions(),
    ...dsa5CharacterCreator.getToolDefinitions(),
    ...questCreationTools.getToolDefinitions(),
    ...diceRollTools.getToolDefinitions(),
    ...campaignManagementTools.getToolDefinitions(),
    ...ownershipTools.getToolDefinitions(),
    ...tokenManipulationTools.getToolDefinitions(),
  ];

  return {
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
  };
}
