import { MODULE_ID } from '../constants.js';
import { ComfyUIManager } from '../comfyui-manager.js';
import { notifyGM } from '../gm-notifications.js';

export type QueryErrorResult = { error: string; success: false; status?: string };

export type GenerateMapRequest = {
  prompt: string;
  scene_name: string;
  size?: string;
  grid_size?: number;
};

export type MapJobRequest = { job_id: string };

type ComfyMapResponse = {
  success?: boolean;
  status?: string;
  error?: string;
  message?: string;
  jobId?: string;
  estimatedTime?: string;
  job?: unknown;
};

export interface MapQueryHandlersOptions {
  comfyuiManager: ComfyUIManager;
}

export class MapQueryHandlers {
  private comfyuiManager: ComfyUIManager;

  constructor(options: MapQueryHandlersOptions) {
    this.comfyuiManager = options.comfyuiManager;
  }

  private validateGMAccess(): { allowed: boolean } {
    if (!game.user?.isGM) {
      return { allowed: false };
    }

    return { allowed: true };
  }

  private errorMessage(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
  }

  private parseComfyResponse(value: unknown): ComfyMapResponse {
    if (!value || typeof value !== 'object') {
      return {};
    }

    const record = value as Record<string, unknown>;
    const parsed: ComfyMapResponse = {};

    if (typeof record.success === 'boolean') {
      parsed.success = record.success;
    }
    if (typeof record.status === 'string') {
      parsed.status = record.status;
    }
    if (typeof record.error === 'string') {
      parsed.error = record.error;
    }
    if (typeof record.message === 'string') {
      parsed.message = record.message;
    }
    if (typeof record.jobId === 'string') {
      parsed.jobId = record.jobId;
    }
    if (typeof record.estimatedTime === 'string') {
      parsed.estimatedTime = record.estimatedTime;
    }
    if ('job' in record) {
      parsed.job = record.job;
    }

    return parsed;
  }

  async handleGenerateMap(
    data: GenerateMapRequest
  ): Promise<Record<string, unknown> | QueryErrorResult> {
    try {
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      if (!data.prompt || typeof data.prompt !== 'string') {
        throw new Error('Prompt is required and must be a string');
      }

      if (!data.scene_name || typeof data.scene_name !== 'string') {
        throw new Error('Scene name is required and must be a string');
      }

      const qualitySetting = game.settings.get(MODULE_ID, 'mapGenQuality') as unknown;
      const quality =
        typeof qualitySetting === 'string' && qualitySetting.trim() ? qualitySetting : 'low';

      const params = {
        prompt: data.prompt.trim(),
        scene_name: data.scene_name.trim(),
        size: data.size ?? 'medium',
        grid_size: data.grid_size ?? 70,
        quality,
      };

      const response = this.parseComfyResponse(await this.comfyuiManager.generateMap(params));
      const isSuccess =
        typeof response.success === 'boolean' ? response.success : response.status === 'success';

      if (!isSuccess) {
        const errorMessage = response.error ?? response.message ?? 'Map generation failed';
        notifyGM('error', `Map generation failed: ${errorMessage}`);
        return {
          error: errorMessage,
          success: false,
          status: response.status ?? 'error',
        };
      }

      notifyGM('info', 'Map generation started');
      return {
        success: true,
        status: response.status ?? 'success',
        jobId: response.jobId,
        message: response.message ?? 'Map generation started',
        estimatedTime: response.estimatedTime ?? '30-90 seconds',
      };
    } catch (error: unknown) {
      notifyGM('error', this.errorMessage(error, 'Map generation failed'));
      return {
        error: this.errorMessage(error, 'Map generation failed'),
        success: false,
      };
    }
  }

  async handleCheckMapStatus(
    data: MapJobRequest
  ): Promise<Record<string, unknown> | QueryErrorResult> {
    try {
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      if (!data.job_id) {
        throw new Error('Job ID is required');
      }

      const response = this.parseComfyResponse(await this.comfyuiManager.checkMapStatus(data));
      const isSuccess =
        typeof response.success === 'boolean' ? response.success : response.status === 'success';

      if (!isSuccess) {
        const errorMessage = response.error ?? response.message ?? 'Status check failed';
        return {
          error: errorMessage,
          success: false,
          status: response.status ?? 'error',
        };
      }

      return {
        success: true,
        status: response.status ?? 'success',
        job: response.job,
      };
    } catch (error: unknown) {
      return {
        error: this.errorMessage(error, 'Status check failed'),
        success: false,
      };
    }
  }

  async handleCancelMapJob(
    data: MapJobRequest
  ): Promise<Record<string, unknown> | QueryErrorResult> {
    try {
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      if (!data.job_id) {
        throw new Error('Job ID is required');
      }

      const response = this.parseComfyResponse(await this.comfyuiManager.cancelMapJob(data));
      const isSuccess =
        typeof response.success === 'boolean' ? response.success : response.status === 'success';

      if (!isSuccess) {
        const errorMessage = response.error ?? response.message ?? 'Job cancellation failed';
        notifyGM('warn', `Map cancellation failed: ${errorMessage}`);
        return {
          error: errorMessage,
          success: false,
          status: response.status ?? 'error',
        };
      }

      return {
        success: true,
        status: response.status ?? 'success',
        message: response.message ?? 'Job cancelled successfully',
      };
    } catch (error: unknown) {
      notifyGM('error', this.errorMessage(error, 'Job cancellation failed'));
      return {
        error: this.errorMessage(error, 'Job cancellation failed'),
        success: false,
      };
    }
  }
}