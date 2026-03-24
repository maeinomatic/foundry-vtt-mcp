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

export type UploadGeneratedMapRequest = {
  filename: string;
  imageData: string;
};

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

  async handleUploadGeneratedMap(
    data: UploadGeneratedMapRequest
  ): Promise<Record<string, unknown> | QueryErrorResult> {
    try {
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        console.error(`[${MODULE_ID}] Upload denied - not GM`);
        return { error: 'Access denied', success: false };
      }

      if (!data.filename || typeof data.filename !== 'string') {
        console.error(`[${MODULE_ID}] Upload failed - invalid filename`);
        notifyGM('error', 'Map upload failed: filename is missing or invalid');
        throw new Error('Filename is required and must be a string');
      }

      if (!data.imageData || typeof data.imageData !== 'string') {
        console.error(`[${MODULE_ID}] Upload failed - invalid image data`);
        notifyGM('error', 'Map upload failed: image data is missing or invalid');
        throw new Error('Image data is required and must be a base64 string');
      }

      const safeFilename = data.filename.replace(/[^a-zA-Z0-9_.-]/g, '_');
      if (
        !safeFilename.endsWith('.png') &&
        !safeFilename.endsWith('.jpg') &&
        !safeFilename.endsWith('.jpeg')
      ) {
        notifyGM('error', 'Map upload failed: only PNG and JPEG are supported');
        throw new Error('Only PNG and JPEG images are supported');
      }

      const byteCharacters = atob(data.imageData);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'image/png' });
      const file = new File([blob], safeFilename, { type: 'image/png' });

      const worldId = (game as { world?: { id?: string } }).world?.id ?? 'unknown-world';
      const uploadPath = `worlds/${worldId}/ai-generated-maps`;

      type FilePickerAPIType = {
        createDirectory: (
          source: string,
          target: string,
          options?: { bucket?: string | null }
        ) => Promise<unknown>;
        upload: (
          source: string,
          target: string,
          file: File,
          body?: Record<string, unknown>,
          options?: { notify?: boolean }
        ) => Promise<{ path?: string }>;
      };

      const root = globalThis as {
        foundry?: {
          applications?: {
            apps?: {
              FilePicker?: {
                implementation?: FilePickerAPIType;
              };
            };
          };
        };
        FilePicker?: FilePickerAPIType;
      };

      const filePickerAPI =
        root.foundry?.applications?.apps?.FilePicker?.implementation ?? root.FilePicker;

      if (!filePickerAPI) {
        throw new Error('Foundry FilePicker API is unavailable');
      }

      try {
        await filePickerAPI.createDirectory('data', uploadPath, { bucket: null });
      } catch (dirError: unknown) {
        const dirErrorMessage = this.errorMessage(dirError, 'Directory creation failed');
        if (!dirErrorMessage.includes('EEXIST') && !dirErrorMessage.includes('already exists')) {
          notifyGM('warn', `Map upload directory warning: ${dirErrorMessage}`);
          console.warn(`[${MODULE_ID}] Directory creation warning:`, dirErrorMessage);
        }
      }

      const response = await filePickerAPI.upload('data', uploadPath, file, {}, { notify: false });

      notifyGM('info', `Map uploaded: ${safeFilename}`);
      return {
        success: true,
        path: response.path,
        filename: safeFilename,
        message: `Map uploaded successfully to ${response.path}`,
      };
    } catch (error: unknown) {
      console.error(`[${MODULE_ID}] Failed to upload generated map:`, error);
      notifyGM('error', this.errorMessage(error, 'Failed to upload generated map'));
      return {
        error: this.errorMessage(error, 'Failed to upload generated map'),
        success: false,
      };
    }
  }
}
