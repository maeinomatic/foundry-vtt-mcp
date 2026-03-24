import type { FoundryModuleFacade } from '../foundry-module-facade.js';

export type QueryErrorResult = { error: string; success: false; status?: string };

type ListScenesRequest = {
  filter?: string;
  include_active_only?: boolean;
};

type SwitchSceneRequest = {
  scene_identifier: string;
  optimize_view?: boolean;
};

type AddActorsToSceneRequest = {
  actorIds: string[];
  placement?: 'random' | 'grid' | 'center';
  hidden?: boolean;
};

type ValidateWritePermissionsRequest = {
  operation: 'createActor' | 'modifyScene';
};

export interface SceneQueryHandlersOptions {
  dataAccess: FoundryModuleFacade;
}

export class SceneQueryHandlers {
  private dataAccess: FoundryModuleFacade;

  constructor(options: SceneQueryHandlersOptions) {
    this.dataAccess = options.dataAccess;
  }

  private validateGMAccess(): { allowed: boolean } {
    if (!game.user?.isGM) {
      return { allowed: false };
    }

    return { allowed: true };
  }

  async handleGetActiveScene(): Promise<unknown> {
    try {
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();
      return await this.dataAccess.getActiveScene();
    } catch (error) {
      throw new Error(
        `Failed to get active scene: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async handleListScenes(data: ListScenesRequest = {}): Promise<unknown[] | QueryErrorResult> {
    try {
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();
      const scenes = (await Promise.resolve(this.dataAccess.listScenes(data))) as unknown;
      if (!Array.isArray(scenes)) {
        return [];
      }

      return scenes as unknown[];
    } catch (error) {
      throw new Error(
        `Failed to list scenes: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async handleSwitchScene(
    data: SwitchSceneRequest
  ): Promise<Record<string, unknown> | QueryErrorResult> {
    try {
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      if (!data.scene_identifier) {
        throw new Error('scene_identifier is required');
      }

      const result = (await this.dataAccess.switchScene(data)) as unknown;
      if (result && typeof result === 'object') {
        return result as Record<string, unknown>;
      }

      return { success: true };
    } catch (error) {
      throw new Error(
        `Failed to switch scene: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async handleAddActorsToScene(data: AddActorsToSceneRequest): Promise<unknown> {
    try {
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      if (!data.actorIds || !Array.isArray(data.actorIds) || data.actorIds.length === 0) {
        throw new Error('actorIds array is required and must not be empty');
      }

      return await this.dataAccess.addActorsToScene({
        actorIds: data.actorIds,
        placement: data.placement ?? 'random',
        hidden: data.hidden ?? false,
      });
    } catch (error) {
      throw new Error(
        `Failed to add actors to scene: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async handleValidateWritePermissions(data: ValidateWritePermissionsRequest): Promise<unknown> {
    try {
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      if (!data.operation) {
        throw new Error('operation is required');
      }

      return await this.dataAccess.validateWritePermissions(data.operation);
    } catch (error) {
      throw new Error(
        `Failed to validate write permissions: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
