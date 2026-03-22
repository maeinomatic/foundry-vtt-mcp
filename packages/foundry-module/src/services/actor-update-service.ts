import type {
  FoundryUpdateActorEmbeddedItemRequest,
  FoundryUpdateActorEmbeddedItemResponse,
  FoundryUpdateActorRequest,
  FoundryUpdateActorResponse,
} from '@foundry-mcp/shared';

type AuditStatus = 'success' | 'failure';

interface ActorUpdateActorLike {
  id?: string;
  name?: string;
  type?: string;
  items?: unknown;
  update?: (data: Record<string, unknown>) => Promise<unknown>;
  updateEmbeddedDocuments?: (type: string, updates: Record<string, unknown>[]) => Promise<unknown>;
}

interface ActorUpdateItemLike {
  id?: string;
  name?: string;
  type?: string;
}

export interface ActorUpdateServiceContext {
  auditLog(action: string, data: unknown, status: AuditStatus, errorMessage?: string): void;
  findActorByIdentifier(identifier: string): ActorUpdateActorLike | null;
  validateFoundryState(): void;
}

export class FoundryActorUpdateService {
  constructor(private readonly context: ActorUpdateServiceContext) {}

  private getActorItems(actor: ActorUpdateActorLike): ActorUpdateItemLike[] {
    if (Array.isArray(actor.items)) {
      return actor.items.filter((item): item is ActorUpdateItemLike =>
        Boolean(item && typeof item === 'object')
      );
    }

    if (
      actor.items &&
      typeof actor.items === 'object' &&
      Array.isArray((actor.items as { contents?: unknown[] }).contents)
    ) {
      return ((actor.items as { contents?: unknown[] }).contents ?? []).filter(
        (item): item is ActorUpdateItemLike => Boolean(item && typeof item === 'object')
      );
    }

    return [];
  }

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

  async updateActorEmbeddedItem(
    request: FoundryUpdateActorEmbeddedItemRequest
  ): Promise<FoundryUpdateActorEmbeddedItemResponse> {
    this.context.validateFoundryState();

    const actor = this.context.findActorByIdentifier(request.actorIdentifier);
    if (!actor) {
      throw new Error(`Actor not found: ${request.actorIdentifier}`);
    }

    if (typeof actor.updateEmbeddedDocuments !== 'function') {
      throw new Error(
        `Actor "${actor.name ?? request.actorIdentifier}" does not support updateEmbeddedDocuments()`
      );
    }

    const targetIdentifier = request.itemIdentifier.toLowerCase();
    const item = this.getActorItems(actor).find(candidate => {
      if (!candidate.id || !candidate.name) {
        return false;
      }

      if (request.itemType && candidate.type !== request.itemType) {
        return false;
      }

      return (
        candidate.id.toLowerCase() === targetIdentifier ||
        candidate.name.toLowerCase() === targetIdentifier
      );
    });

    if (!item?.id) {
      throw new Error(
        `Item "${request.itemIdentifier}" was not found on actor "${actor.name ?? request.actorIdentifier}".`
      );
    }

    try {
      await actor.updateEmbeddedDocuments('Item', [
        {
          _id: item.id,
          ...request.updates,
        },
      ]);

      const response: FoundryUpdateActorEmbeddedItemResponse = {
        success: true,
        actorId: actor.id ?? '',
        actorName: actor.name ?? request.actorIdentifier,
        itemId: item.id,
        itemName: item.name ?? request.itemIdentifier,
        itemType: item.type ?? request.itemType ?? 'unknown',
        appliedUpdates: request.updates,
        updatedFields: Object.keys(request.updates),
      };

      this.context.auditLog('updateActorEmbeddedItem', request, 'success');
      return response;
    } catch (error) {
      this.context.auditLog(
        'updateActorEmbeddedItem',
        request,
        'failure',
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw error;
    }
  }
}
