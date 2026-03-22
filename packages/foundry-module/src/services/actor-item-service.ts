import type {
  FoundryCreateActorEmbeddedItemRequest,
  FoundryCreateActorEmbeddedItemResponse,
  FoundryDeleteActorEmbeddedItemRequest,
  FoundryDeleteActorEmbeddedItemResponse,
  UnknownRecord,
} from '@foundry-mcp/shared';

type AuditStatus = 'success' | 'failure';

interface ActorItemActorLike {
  id?: string;
  name?: string;
  items?: unknown;
  createEmbeddedDocuments?: (type: string, data: Record<string, unknown>[]) => Promise<unknown>;
  deleteEmbeddedDocuments?: (type: string, ids: string[]) => Promise<unknown>;
}

interface ActorItemLike {
  id?: string;
  name?: string;
  type?: string;
  toObject?: () => unknown;
}

interface UuidResolverDocumentLike extends ActorItemLike {
  img?: string;
  system?: unknown;
  flags?: unknown;
  effects?: unknown;
}

export interface ActorItemServiceContext {
  auditLog(action: string, data: unknown, status: AuditStatus, errorMessage?: string): void;
  findActorByIdentifier(identifier: string): ActorItemActorLike | null;
  validateFoundryState(): void;
}

type UuidResolver = (uuid: string) => Promise<unknown>;

function asRecord(value: unknown): UnknownRecord | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  return value as UnknownRecord;
}

function cloneRecord(value: UnknownRecord): UnknownRecord {
  return Object.entries(value).reduce<UnknownRecord>((result, [key, entry]) => {
    if (Array.isArray(entry)) {
      const arrayEntries = entry as unknown[];
      result[key] = arrayEntries.map((item: unknown) => {
        const itemRecord = asRecord(item);
        return itemRecord ? cloneRecord(itemRecord) : item;
      });
      return result;
    }

    const entryRecord = asRecord(entry);
    result[key] = entryRecord ? cloneRecord(entryRecord) : entry;
    return result;
  }, {});
}

function mergeRecords(base: UnknownRecord, overrides: UnknownRecord): UnknownRecord {
  const result = cloneRecord(base);

  for (const [key, value] of Object.entries(overrides)) {
    const existing = asRecord(result[key]);
    const overrideRecord = asRecord(value);
    if (existing && overrideRecord) {
      result[key] = mergeRecords(existing, overrideRecord);
      continue;
    }

    result[key] = value;
  }

  return result;
}

function deleteIdentityFields(record: UnknownRecord): void {
  delete record._id;
  delete record.id;
}

export class FoundryActorItemService {
  constructor(private readonly context: ActorItemServiceContext) {}

  private async resolveUuidDocument(uuid: string): Promise<UuidResolverDocumentLike | null> {
    const root = globalThis as { fromUuid?: UuidResolver };
    if (typeof root.fromUuid !== 'function') {
      throw new Error('Foundry fromUuid() API is unavailable');
    }

    const resolved = await root.fromUuid(uuid);
    if (!resolved || typeof resolved !== 'object') {
      return null;
    }

    return resolved as UuidResolverDocumentLike;
  }

  private getActorItems(actor: ActorItemActorLike): ActorItemLike[] {
    if (Array.isArray(actor.items)) {
      return actor.items.filter((item): item is ActorItemLike => Boolean(asRecord(item)));
    }

    const itemCollection = asRecord(actor.items);
    if (itemCollection && Array.isArray(itemCollection.contents)) {
      return itemCollection.contents.filter((item): item is ActorItemLike =>
        Boolean(asRecord(item))
      );
    }

    return [];
  }

  private findItemOnActor(
    actor: ActorItemActorLike,
    identifier: string,
    itemType?: string
  ): ActorItemLike | null {
    const targetIdentifier = identifier.toLowerCase();

    return (
      this.getActorItems(actor).find(candidate => {
        if (!candidate.id || !candidate.name) {
          return false;
        }

        if (itemType && candidate.type !== itemType) {
          return false;
        }

        return (
          candidate.id.toLowerCase() === targetIdentifier ||
          candidate.name.toLowerCase() === targetIdentifier
        );
      }) ?? null
    );
  }

  private normalizeSourceData(source: UuidResolverDocumentLike): UnknownRecord {
    const sourceRecord = asRecord(source.toObject?.() ?? source);
    if (!sourceRecord) {
      throw new Error('Resolved source item could not be serialized');
    }

    const normalized = cloneRecord(sourceRecord);
    deleteIdentityFields(normalized);
    return normalized;
  }

  private extractCreatedItem(result: unknown): ActorItemLike | null {
    if (Array.isArray(result)) {
      const createdItems = result as unknown[];
      const first = createdItems.find((candidate: unknown) => Boolean(asRecord(candidate)));
      return first ? (first as ActorItemLike) : null;
    }

    const record = asRecord(result);
    if (record && Array.isArray(record.contents)) {
      const createdItems = record.contents as unknown[];
      const first = createdItems.find((candidate: unknown) => Boolean(asRecord(candidate)));
      return first ? (first as ActorItemLike) : null;
    }

    return null;
  }

  async createActorEmbeddedItem(
    request: FoundryCreateActorEmbeddedItemRequest
  ): Promise<FoundryCreateActorEmbeddedItemResponse> {
    this.context.validateFoundryState();

    const actor = this.context.findActorByIdentifier(request.actorIdentifier);
    if (!actor) {
      throw new Error(`Actor not found: ${request.actorIdentifier}`);
    }

    if (typeof actor.createEmbeddedDocuments !== 'function') {
      throw new Error(
        `Actor "${actor.name ?? request.actorIdentifier}" does not support createEmbeddedDocuments()`
      );
    }

    try {
      let baseData: UnknownRecord;
      let createdFrom: 'uuid' | 'raw';

      if (request.sourceUuid) {
        const resolved = await this.resolveUuidDocument(request.sourceUuid);
        if (!resolved) {
          throw new Error(`Source item UUID could not be resolved: ${request.sourceUuid}`);
        }

        if (request.itemType && resolved.type !== request.itemType) {
          throw new Error(
            `Source item "${resolved.name ?? request.sourceUuid}" is type "${resolved.type ?? 'unknown'}", expected "${request.itemType}".`
          );
        }

        baseData = this.normalizeSourceData(resolved);
        createdFrom = 'uuid';
      } else if (request.itemData) {
        baseData = cloneRecord(request.itemData);
        deleteIdentityFields(baseData);
        createdFrom = 'raw';
      } else {
        throw new Error('createActorEmbeddedItem requires sourceUuid or itemData');
      }

      if (request.itemType) {
        const currentType = typeof baseData.type === 'string' ? baseData.type : undefined;
        if (currentType && currentType !== request.itemType) {
          throw new Error(
            `Prepared item data is type "${currentType}", expected "${request.itemType}".`
          );
        }
      }

      const itemData = request.overrides ? mergeRecords(baseData, request.overrides) : baseData;
      deleteIdentityFields(itemData);

      const createdRaw = await actor.createEmbeddedDocuments('Item', [itemData]);
      const createdItem = this.extractCreatedItem(createdRaw);

      const response: FoundryCreateActorEmbeddedItemResponse = {
        success: true,
        actorId: actor.id ?? '',
        actorName: actor.name ?? request.actorIdentifier,
        itemId: createdItem?.id ?? '',
        itemName:
          createdItem?.name ??
          (typeof itemData.name === 'string'
            ? itemData.name
            : (request.sourceUuid ?? 'Unknown Item')),
        itemType:
          createdItem?.type ??
          (typeof itemData.type === 'string' ? itemData.type : (request.itemType ?? 'unknown')),
        createdFrom,
        ...(request.sourceUuid ? { sourceUuid: request.sourceUuid } : {}),
        ...(request.overrides ? { appliedOverrides: request.overrides } : {}),
      };

      this.context.auditLog('createActorEmbeddedItem', request, 'success');
      return response;
    } catch (error) {
      this.context.auditLog(
        'createActorEmbeddedItem',
        request,
        'failure',
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw error;
    }
  }

  async deleteActorEmbeddedItem(
    request: FoundryDeleteActorEmbeddedItemRequest
  ): Promise<FoundryDeleteActorEmbeddedItemResponse> {
    this.context.validateFoundryState();

    const actor = this.context.findActorByIdentifier(request.actorIdentifier);
    if (!actor) {
      throw new Error(`Actor not found: ${request.actorIdentifier}`);
    }

    if (typeof actor.deleteEmbeddedDocuments !== 'function') {
      throw new Error(
        `Actor "${actor.name ?? request.actorIdentifier}" does not support deleteEmbeddedDocuments()`
      );
    }

    const item = this.findItemOnActor(actor, request.itemIdentifier, request.itemType);
    if (!item?.id) {
      throw new Error(
        `Item "${request.itemIdentifier}" was not found on actor "${actor.name ?? request.actorIdentifier}".`
      );
    }

    try {
      await actor.deleteEmbeddedDocuments('Item', [item.id]);

      const response: FoundryDeleteActorEmbeddedItemResponse = {
        success: true,
        actorId: actor.id ?? '',
        actorName: actor.name ?? request.actorIdentifier,
        itemId: item.id,
        itemName: item.name ?? request.itemIdentifier,
        itemType: item.type ?? request.itemType ?? 'unknown',
      };

      this.context.auditLog('deleteActorEmbeddedItem', request, 'success');
      return response;
    } catch (error) {
      this.context.auditLog(
        'deleteActorEmbeddedItem',
        request,
        'failure',
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw error;
    }
  }
}
