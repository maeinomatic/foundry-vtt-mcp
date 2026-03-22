import type { FoundryUpdateActorRequest, FoundryUpdateActorResponse } from '@foundry-mcp/shared';

type AuditStatus = 'success' | 'failure';

interface ActorUpdateActorLike {
  id?: string;
  name?: string;
  type?: string;
  update?: (data: Record<string, unknown>) => Promise<unknown>;
}

export interface ActorUpdateServiceContext {
  auditLog(action: string, data: unknown, status: AuditStatus, errorMessage?: string): void;
  findActorByIdentifier(identifier: string): ActorUpdateActorLike | null;
  validateFoundryState(): void;
}

export class FoundryActorUpdateService {
  constructor(private readonly context: ActorUpdateServiceContext) {}

  async updateActor(request: FoundryUpdateActorRequest): Promise<FoundryUpdateActorResponse> {
    this.context.validateFoundryState();

    const actor = this.context.findActorByIdentifier(request.identifier);
    if (!actor) {
      throw new Error(`Actor not found: ${request.identifier}`);
    }

    if (typeof actor.update !== 'function') {
      throw new Error(`Actor "${actor.name ?? request.identifier}" does not support update()`);
    }

    try {
      await actor.update(request.updates);

      const response: FoundryUpdateActorResponse = {
        success: true,
        actorId: actor.id ?? '',
        actorName: actor.name ?? request.identifier,
        actorType: actor.type ?? 'unknown',
        appliedUpdates: request.updates,
        updatedFields: Object.keys(request.updates),
      };

      this.context.auditLog('updateActor', request, 'success');
      return response;
    } catch (error) {
      this.context.auditLog(
        'updateActor',
        request,
        'failure',
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw error;
    }
  }
}
