import type {
  FoundryApplyCharacterPatchTransactionRequest,
  FoundryApplyCharacterPatchTransactionResponse,
  FoundryCharacterPatchTransactionCreatedItem,
  FoundryCharacterPatchTransactionDeleteItemRequest,
  FoundryCharacterPatchTransactionUpdatedItem,
  UnknownRecord,
} from '@maeinomatic/foundry-mcp-shared';
import { transactionManager } from '../transaction-manager.js';

type AuditStatus = 'success' | 'failure';

interface CharacterPatchActorLike {
  id?: string;
  name?: string;
  type?: string;
  items?: unknown;
  update?: (data: Record<string, unknown>) => Promise<unknown>;
  toObject?: () => unknown;
  createEmbeddedDocuments?: (type: string, data: Record<string, unknown>[]) => Promise<unknown>;
  updateEmbeddedDocuments?: (type: string, updates: Record<string, unknown>[]) => Promise<unknown>;
  deleteEmbeddedDocuments?: (type: string, ids: string[]) => Promise<unknown>;
}

interface CharacterPatchItemLike {
  id?: string;
  name?: string;
  type?: string;
  toObject?: () => unknown;
}

interface UuidResolverDocumentLike extends CharacterPatchItemLike {
  system?: unknown;
  flags?: unknown;
  effects?: unknown;
}

type UuidResolver = (uuid: string) => Promise<unknown>;

type TransactionUpdateItemRequest = NonNullable<
  FoundryApplyCharacterPatchTransactionRequest['updateItems']
>[number];

export interface CharacterPatchTransactionServiceContext {
  auditLog(action: string, data: unknown, status: AuditStatus, errorMessage?: string): void;
  findActorByIdentifier(identifier: string): CharacterPatchActorLike | null;
  validateFoundryState(): void;
}

type PreparedUpdateItem = {
  item: CharacterPatchItemLike & { id: string };
  rollbackUpdates: UnknownRecord;
  request: TransactionUpdateItemRequest;
};

type PreparedDeleteItem = {
  item: CharacterPatchItemLike & { id: string };
  snapshot: UnknownRecord;
  request: FoundryCharacterPatchTransactionDeleteItemRequest;
};

function asRecord(value: unknown): UnknownRecord | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  return value as UnknownRecord;
}

function deepClone<T>(value: T): T {
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value)) as T;
}

function cloneRecord(value: UnknownRecord): UnknownRecord {
  return deepClone(value);
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

function getActorItems(actor: CharacterPatchActorLike): CharacterPatchItemLike[] {
  if (Array.isArray(actor.items)) {
    return actor.items.filter((item): item is CharacterPatchItemLike =>
      Boolean(item && typeof item === 'object')
    );
  }

  const itemCollection = asRecord(actor.items);
  if (itemCollection && Array.isArray(itemCollection.contents)) {
    return itemCollection.contents.filter((item): item is CharacterPatchItemLike =>
      Boolean(item && typeof item === 'object')
    );
  }

  return [];
}

function getSnapshot(
  value: { toObject?: () => unknown } | UnknownRecord | undefined
): UnknownRecord {
  const snapshotSource: unknown =
    value &&
    typeof value === 'object' &&
    'toObject' in value &&
    typeof value.toObject === 'function'
      ? value.toObject()
      : value;
  const snapshot = asRecord(snapshotSource);
  return snapshot ? cloneRecord(snapshot) : {};
}

function getPathValue(source: UnknownRecord, path: string): { exists: boolean; value: unknown } {
  const segments = path.split('.');
  let current: unknown = source;

  for (const segment of segments) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      return { exists: false, value: undefined };
    }

    if (!(segment in (current as Record<string, unknown>))) {
      return { exists: false, value: undefined };
    }

    current = (current as Record<string, unknown>)[segment];
  }

  return { exists: true, value: current };
}

export class FoundryCharacterPatchTransactionService {
  constructor(private readonly context: CharacterPatchTransactionServiceContext) {}

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

  private findItemOnActor(
    actor: CharacterPatchActorLike,
    identifier: string,
    itemType?: string
  ): (CharacterPatchItemLike & { id: string }) | null {
    const targetIdentifier = identifier.toLowerCase();

    return (
      getActorItems(actor).find(
        (candidate): candidate is CharacterPatchItemLike & { id: string } => {
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
        }
      ) ?? null
    );
  }

  private extractCreatedItem(result: unknown): CharacterPatchItemLike | null {
    if (Array.isArray(result)) {
      for (const candidate of result) {
        if (asRecord(candidate)) {
          return candidate as CharacterPatchItemLike;
        }
      }

      return null;
    }

    const record = asRecord(result);
    if (record && Array.isArray(record.contents)) {
      for (const candidate of record.contents) {
        if (asRecord(candidate)) {
          return candidate as CharacterPatchItemLike;
        }
      }

      return null;
    }

    return null;
  }

  private async prepareCreatedItemData(
    request: NonNullable<FoundryApplyCharacterPatchTransactionRequest['createItems']>[number]
  ): Promise<{ itemData: UnknownRecord; createdFrom: 'uuid' | 'raw'; sourceUuid?: string }> {
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

      baseData = getSnapshot(resolved);
      deleteIdentityFields(baseData);
      createdFrom = 'uuid';
    } else if (request.itemData) {
      const rawItemData = asRecord(request.itemData);
      if (!rawItemData) {
        throw new Error('Raw createItems.itemData must be an object.');
      }

      baseData = cloneRecord(rawItemData);
      deleteIdentityFields(baseData);
      createdFrom = 'raw';
    } else {
      throw new Error('Each createItems entry requires sourceUuid or itemData.');
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

    return {
      itemData,
      createdFrom,
      ...(request.sourceUuid ? { sourceUuid: request.sourceUuid } : {}),
    };
  }

  async applyCharacterPatchTransaction(
    request: FoundryApplyCharacterPatchTransactionRequest
  ): Promise<FoundryApplyCharacterPatchTransactionResponse> {
    this.context.validateFoundryState();

    const actor = this.context.findActorByIdentifier(request.actorIdentifier);
    if (!actor) {
      throw new Error(`Actor not found: ${request.actorIdentifier}`);
    }

    const actorId = actor.id ?? '';
    const actorName = actor.name ?? request.actorIdentifier;
    const actorType = actor.type ?? 'unknown';

    const actorUpdatePaths = Object.keys(request.actorUpdates ?? {});
    const createItems = request.createItems ?? [];
    const updateItems = request.updateItems ?? [];
    const deleteItems = request.deleteItems ?? [];

    if (
      actorUpdatePaths.length === 0 &&
      createItems.length === 0 &&
      updateItems.length === 0 &&
      deleteItems.length === 0
    ) {
      throw new Error('Provide at least one actor or owned-item mutation to apply.');
    }

    const plannedOperations = {
      actorUpdated: actorUpdatePaths.length > 0,
      createdItemCount: createItems.length,
      updatedItemCount: updateItems.length,
      deletedItemCount: deleteItems.length,
    };

    let actorRollbackUpdates: UnknownRecord | undefined;
    if (actorUpdatePaths.length > 0) {
      if (typeof actor.update !== 'function') {
        throw new Error(`Actor "${actorName}" does not support update().`);
      }

      const actorSnapshot = getSnapshot(actor);
      actorRollbackUpdates = {};

      for (const path of actorUpdatePaths) {
        const current = getPathValue(actorSnapshot, path);
        if (!current.exists) {
          throw new Error(
            `Actor update path "${path}" does not exist on "${actorName}". Transactional patches only support stable existing paths.`
          );
        }

        actorRollbackUpdates[path] = current.value;
      }
    }

    const preparedUpdateItems: PreparedUpdateItem[] = updateItems.map(entry => {
      if (typeof actor.updateEmbeddedDocuments !== 'function') {
        throw new Error(`Actor "${actorName}" does not support updateEmbeddedDocuments().`);
      }

      const item = this.findItemOnActor(actor, entry.itemIdentifier, entry.itemType);
      if (!item) {
        throw new Error(`Item "${entry.itemIdentifier}" was not found on actor "${actorName}".`);
      }

      const itemSnapshot = getSnapshot(item);
      const rollbackUpdates: UnknownRecord = {};
      for (const path of Object.keys(entry.updates)) {
        const current = getPathValue(itemSnapshot, path);
        if (!current.exists) {
          throw new Error(
            `Item update path "${path}" does not exist on "${item.name ?? entry.itemIdentifier}". Transactional patches only support stable existing paths.`
          );
        }

        rollbackUpdates[path] = current.value;
      }

      return {
        item,
        rollbackUpdates,
        request: entry,
      };
    });

    const preparedDeleteItems: PreparedDeleteItem[] = deleteItems.map(entry => {
      if (typeof actor.deleteEmbeddedDocuments !== 'function') {
        throw new Error(`Actor "${actorName}" does not support deleteEmbeddedDocuments().`);
      }

      const item = this.findItemOnActor(actor, entry.itemIdentifier, entry.itemType);
      if (!item) {
        throw new Error(`Item "${entry.itemIdentifier}" was not found on actor "${actorName}".`);
      }

      const snapshot = getSnapshot(item);
      deleteIdentityFields(snapshot);

      return {
        item,
        snapshot,
        request: entry,
      };
    });

    if (request.validateOnly === true) {
      const response: FoundryApplyCharacterPatchTransactionResponse = {
        success: true,
        transactionId: 'validate-only',
        actorId,
        actorName,
        actorType,
        validateOnly: true,
        plannedOperations,
      };

      this.context.auditLog('applyCharacterPatchTransaction', request, 'success');
      return response;
    }

    const transactionId = transactionManager.startTransaction(
      `Character patch transaction for ${actorName}`
    );
    const createdItemsSummary: FoundryCharacterPatchTransactionCreatedItem[] = [];
    const updatedItemsSummary: FoundryCharacterPatchTransactionUpdatedItem[] = [];
    const deletedItemsSummary: NonNullable<
      FoundryApplyCharacterPatchTransactionResponse['deletedItems']
    > = [];

    try {
      if (request.actorUpdates && actorRollbackUpdates && typeof actor.update === 'function') {
        transactionManager.addAction(transactionId, {
          type: 'update',
          entityType: 'Actor',
          entityId: actorId,
          originalData: actorRollbackUpdates,
          rollbackAction: async (): Promise<void> => {
            await actor.update?.(actorRollbackUpdates);
          },
        });
        await actor.update(request.actorUpdates);
      }

      for (const entry of createItems) {
        if (typeof actor.createEmbeddedDocuments !== 'function') {
          throw new Error(`Actor "${actorName}" does not support createEmbeddedDocuments().`);
        }

        const prepared = await this.prepareCreatedItemData(entry);
        const createdRaw = await actor.createEmbeddedDocuments('Item', [prepared.itemData]);
        const createdItem = this.extractCreatedItem(createdRaw);
        const createdItemId = createdItem?.id;
        if (!createdItemId) {
          throw new Error('Failed to determine the ID of the created embedded item.');
        }

        transactionManager.addAction(transactionId, {
          type: 'create',
          entityType: 'Item',
          entityId: createdItemId,
          rollbackAction: async (): Promise<void> => {
            await actor.deleteEmbeddedDocuments?.('Item', [createdItemId]);
          },
        });

        createdItemsSummary.push({
          itemId: createdItemId,
          itemName:
            createdItem?.name ??
            (typeof prepared.itemData.name === 'string' ? prepared.itemData.name : 'Unknown Item'),
          itemType:
            createdItem?.type ??
            (typeof prepared.itemData.type === 'string'
              ? prepared.itemData.type
              : (entry.itemType ?? 'unknown')),
          createdFrom: prepared.createdFrom,
          ...(prepared.sourceUuid ? { sourceUuid: prepared.sourceUuid } : {}),
        });
      }

      for (const entry of preparedUpdateItems) {
        transactionManager.addAction(transactionId, {
          type: 'update',
          entityType: 'Item',
          entityId: entry.item.id,
          originalData: entry.rollbackUpdates,
          rollbackAction: async (): Promise<void> => {
            await actor.updateEmbeddedDocuments?.('Item', [
              {
                _id: entry.item.id,
                ...entry.rollbackUpdates,
              },
            ]);
          },
        });

        await actor.updateEmbeddedDocuments?.('Item', [
          {
            _id: entry.item.id,
            ...entry.request.updates,
          },
        ]);

        updatedItemsSummary.push({
          itemId: entry.item.id,
          itemName: entry.item.name ?? entry.request.itemIdentifier,
          itemType: entry.item.type ?? entry.request.itemType ?? 'unknown',
          updatedFields: Object.keys(entry.request.updates),
        });
      }

      for (const entry of preparedDeleteItems) {
        transactionManager.addAction(transactionId, {
          type: 'delete',
          entityType: 'Item',
          entityId: entry.item.id,
          originalData: entry.snapshot,
          rollbackAction: async (): Promise<void> => {
            await actor.createEmbeddedDocuments?.('Item', [entry.snapshot]);
          },
        });

        await actor.deleteEmbeddedDocuments?.('Item', [entry.item.id]);
        deletedItemsSummary.push({
          itemId: entry.item.id,
          itemName: entry.item.name ?? entry.request.itemIdentifier,
          itemType: entry.item.type ?? entry.request.itemType ?? 'unknown',
        });
      }

      transactionManager.commitTransaction(transactionId);

      const response: FoundryApplyCharacterPatchTransactionResponse = {
        success: true,
        transactionId,
        actorId,
        actorName,
        actorType,
        validateOnly: false,
        plannedOperations,
        ...(request.actorUpdates ? { actorUpdatedFields: actorUpdatePaths } : {}),
        ...(createdItemsSummary.length > 0 ? { createdItems: createdItemsSummary } : {}),
        ...(updatedItemsSummary.length > 0 ? { updatedItems: updatedItemsSummary } : {}),
        ...(deletedItemsSummary.length > 0 ? { deletedItems: deletedItemsSummary } : {}),
      };

      this.context.auditLog('applyCharacterPatchTransaction', request, 'success');
      return response;
    } catch (error) {
      const rollbackResult = await transactionManager.rollbackTransaction(transactionId);
      const response: FoundryApplyCharacterPatchTransactionResponse = {
        success: false,
        transactionId,
        actorId,
        actorName,
        actorType,
        validateOnly: false,
        plannedOperations,
        rolledBack: rollbackResult.success,
        ...(rollbackResult.errors.length > 0 ? { rollbackErrors: rollbackResult.errors } : {}),
        warnings: [
          error instanceof Error ? error.message : 'Unknown transaction error',
          ...(rollbackResult.success
            ? ['All applied changes were rolled back.']
            : ['Rollback completed with errors. Review rollbackErrors before retrying.']),
        ],
      };

      this.context.auditLog(
        'applyCharacterPatchTransaction',
        request,
        'failure',
        error instanceof Error ? error.message : 'Unknown error'
      );
      return response;
    }
  }
}
