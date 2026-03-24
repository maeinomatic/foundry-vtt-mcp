export type MapGenerationSize = 'small' | 'medium' | 'large';

export type MapGenerationQuality = 'low' | 'medium' | 'high';

export interface MapGenerationRequest {
  prompt: string;
  scene_name: string;
  size: MapGenerationSize;
  grid_size: number;
  quality?: MapGenerationQuality;
}

export interface MapGenerationJobState {
  id: string;
  status?: string;
  progress_percent?: number;
  current_stage?: string;
  result?: unknown;
  error?: string;
  comfyui_job_id?: string;
}

export interface MapGenerationStatusResponse {
  status: 'success' | 'error';
  message?: string;
  job?: MapGenerationJobState;
  jobId?: string;
  estimatedTime?: string;
}
