import { FoundryClient } from '../foundry-client.js';
import { Logger } from '../logger.js';
import type { GameSystem } from '../utils/system-detection.js';
import { detectGameSystem } from '../utils/system-detection.js';
import type { SystemAdapter } from './types.js';
import { SystemRegistry } from './system-registry.js';

export interface SystemContextServiceOptions {
  foundryClient: FoundryClient;
  logger: Logger;
  systemRegistry?: SystemRegistry | null;
}

export interface ResolvedSystemContext {
  system: GameSystem;
  adapter: SystemAdapter | null;
}

export class SystemContextService {
  private foundryClient: FoundryClient;
  private logger: Logger;
  private systemRegistry: SystemRegistry | null;
  private cachedGameSystem: GameSystem | null = null;

  constructor({ foundryClient, logger, systemRegistry }: SystemContextServiceOptions) {
    this.foundryClient = foundryClient;
    this.logger = logger.child({ component: 'SystemContextService' });
    this.systemRegistry = systemRegistry ?? null;
  }

  async getGameSystem(): Promise<GameSystem> {
    if (!this.cachedGameSystem || this.cachedGameSystem === 'other') {
      const detectedSystem = await detectGameSystem(this.foundryClient, this.logger);
      if (detectedSystem !== 'other') {
        this.cachedGameSystem = detectedSystem;
      } else if (!this.cachedGameSystem) {
        this.cachedGameSystem = detectedSystem;
      }
    }

    return this.cachedGameSystem;
  }

  invalidateCache(): void {
    this.cachedGameSystem = null;
  }

  async resolve(): Promise<ResolvedSystemContext> {
    const system = await this.getGameSystem();
    return {
      system,
      adapter: this.systemRegistry?.getAdapter(system) ?? null,
    };
  }

  async requireAdapter(
    capability: string
  ): Promise<{ adapter: SystemAdapter; system: GameSystem }> {
    if (!this.systemRegistry) {
      throw new Error(
        `UNSUPPORTED_CAPABILITY: No system adapter registry is available for ${capability}.`
      );
    }

    const { system, adapter } = await this.resolve();
    if (!adapter) {
      throw new Error(
        `UNSUPPORTED_CAPABILITY: No system adapter is available for ${capability} in this world.`
      );
    }

    return { adapter, system };
  }
}
