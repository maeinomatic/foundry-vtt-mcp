import type {
  FoundryApplyCharacterAdvancementChoiceRequest,
  FoundryApplyCharacterAdvancementChoiceResponse,
  FoundryGetCharacterAdvancementOptionsRequest,
  FoundryGetCharacterAdvancementOptionsResponse,
  FoundryPreviewCharacterProgressionRequest,
  FoundryPreviewCharacterProgressionResponse,
} from '@foundry-mcp/shared';
import { getActorProgressionStrategy } from './actor-progression-strategies/actor-progression-strategy-registry.js';
import type { ActorProgressionActorLike } from './actor-progression-strategies/actor-progression-strategy-contract.js';

type AuditStatus = 'success' | 'failure';

export interface ActorProgressionServiceContext {
  auditLog(action: string, data: unknown, status: AuditStatus, errorMessage?: string): void;
  findActorByIdentifier(identifier: string): ActorProgressionActorLike | null;
  validateFoundryState(): void;
  getSystemId(): string;
}

export class FoundryActorProgressionService {
  constructor(private readonly context: ActorProgressionServiceContext) {}

  async previewCharacterProgression(
    request: FoundryPreviewCharacterProgressionRequest
  ): Promise<FoundryPreviewCharacterProgressionResponse> {
    this.context.validateFoundryState();

    const actor = this.context.findActorByIdentifier(request.actorIdentifier);
    if (!actor) {
      throw new Error(`Actor not found: ${request.actorIdentifier}`);
    }

    const systemId = this.context.getSystemId();
    const strategy = getActorProgressionStrategy(systemId);
    if (!strategy) {
      throw new Error(
        `UNSUPPORTED_CAPABILITY: Character progression preview is not implemented for system "${systemId}".`
      );
    }

    try {
      const response = await strategy.previewCharacterProgression({ actor, request });
      this.context.auditLog('previewCharacterProgression', request, 'success');
      return response;
    } catch (error) {
      this.context.auditLog(
        'previewCharacterProgression',
        request,
        'failure',
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw error;
    }
  }

  async getCharacterAdvancementOptions(
    request: FoundryGetCharacterAdvancementOptionsRequest
  ): Promise<FoundryGetCharacterAdvancementOptionsResponse> {
    this.context.validateFoundryState();

    const actor = this.context.findActorByIdentifier(request.actorIdentifier);
    if (!actor) {
      throw new Error(`Actor not found: ${request.actorIdentifier}`);
    }

    const systemId = this.context.getSystemId();
    const strategy = getActorProgressionStrategy(systemId);
    if (!strategy) {
      throw new Error(
        `UNSUPPORTED_CAPABILITY: Character advancement options are not implemented for system "${systemId}".`
      );
    }

    try {
      const response = await strategy.getCharacterAdvancementOptions({ actor, request });
      this.context.auditLog('getCharacterAdvancementOptions', request, 'success');
      return response;
    } catch (error) {
      this.context.auditLog(
        'getCharacterAdvancementOptions',
        request,
        'failure',
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw error;
    }
  }

  async applyCharacterAdvancementChoice(
    request: FoundryApplyCharacterAdvancementChoiceRequest
  ): Promise<FoundryApplyCharacterAdvancementChoiceResponse> {
    this.context.validateFoundryState();

    const actor = this.context.findActorByIdentifier(request.actorIdentifier);
    if (!actor) {
      throw new Error(`Actor not found: ${request.actorIdentifier}`);
    }

    const systemId = this.context.getSystemId();
    const strategy = getActorProgressionStrategy(systemId);
    if (!strategy) {
      throw new Error(
        `UNSUPPORTED_CAPABILITY: Applying character advancement choices is not implemented for system "${systemId}".`
      );
    }

    try {
      const response = await strategy.applyCharacterAdvancementChoice({ actor, request });
      this.context.auditLog('applyCharacterAdvancementChoice', request, 'success');
      return response;
    } catch (error) {
      this.context.auditLog(
        'applyCharacterAdvancementChoice',
        request,
        'failure',
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw error;
    }
  }
}
