import type {
  FoundryCreateCompendiumItemRequest,
  FoundryCreateCompendiumItemResponse,
  FoundryCreateWorldItemRequest,
  FoundryCreateWorldItemResponse,
  FoundryImportItemToCompendiumRequest,
  FoundryImportItemToCompendiumResponse,
  FoundryUpdateWorldItemRequest,
  FoundryUpdateWorldItemResponse,
  UnknownRecord,
} from '@foundry-mcp/shared';

type AuditStatus = 'success' | 'failure';

interface WorldItemLike {
  id?: string;
  name?: string;
  type?: string;
  folder?: string | null;
  toObject?: () => unknown;
  update?: (data: Record<string, unknown>) => Promise<unknown>;
}

interface UuidResolverDocumentLike extends WorldItemLike {
  img?: string;
  system?: unknown;
  flags?: unknown;
  effects?: unknown;
  documentName?: string;
}

interface CompendiumPackLike {
  collection?: string;
  documentName?: string;
  locked?: boolean;
  title?: string;
  metadata?: {
    id?: string;
    label?: string;
    type?: string;
  };
  importDocument?: (document: unknown, options?: Record<string, unknown>) => Promise<unknown>;
}

interface CreatedItemLike {
  id?: string;
  name?: string;
  type?: string;
  folder?: string | null;
}

export interface ItemAuthoringServiceContext {
  auditLog(action: string, data: unknown, status: AuditStatus, errorMessage?: string): void;
  validateFoundryState(): void;
}

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
      const clonedEntries = arrayEntries.map((arrayEntry: unknown) => {
        const arrayRecord = asRecord(arrayEntry);
        return arrayRecord ? cloneRecord(arrayRecord) : arrayEntry;
      });
      result[key] = clonedEntries;
      return result;
    }

    const entryRecord = asRecord(entry);
    result[key] = entryRecord ? cloneRecord(entryRecord) : entry;
    return result;
  }, {});
}

function mergeRecords(base: UnknownRecord, overrides: UnknownRecord): UnknownRecord {
  const merged = cloneRecord(base);

  for (const [key, value] of Object.entries(overrides)) {
    const existing = asRecord(merged[key]);
    const overrideRecord = asRecord(value);
    if (existing && overrideRecord) {
      merged[key] = mergeRecords(existing, overrideRecord);
      continue;
    }

    merged[key] = value;
  }

  return merged;
}

function deleteIdentityFields(record: UnknownRecord): void {
  delete record._id;
  delete record.id;
}

function getWorldItemsArray(): WorldItemLike[] {
  const items = (game as { items?: unknown }).items;
  if (Array.isArray(items)) {
    return items.filter((item): item is WorldItemLike => Boolean(asRecord(item)));
  }

  const itemCollection = asRecord(items);
  if (itemCollection && Array.isArray(itemCollection.contents)) {
    return itemCollection.contents.filter((item): item is WorldItemLike => Boolean(asRecord(item)));
  }

  return [];
}

function getPackById(packId: string): CompendiumPackLike | null {
  const packs = (game as { packs?: unknown }).packs;
  const packCollection = asRecord(packs);
  if (!packCollection) {
    return null;
  }

  const get = packCollection.get as ((id: string) => unknown) | undefined;
  if (typeof get === 'function') {
    const found = get.call(packs, packId);
    return found && typeof found === 'object' ? (found as CompendiumPackLike) : null;
  }

  const contents: unknown[] = Array.isArray(packCollection.contents)
    ? (packCollection.contents as unknown[])
    : [];
  const match = contents.find(entry => {
    const record = asRecord(entry);
    const metadata = asRecord(record?.metadata);
    return record?.collection === packId || metadata?.id === packId;
  });
  return match ? (match as CompendiumPackLike) : null;
}

function getPackLabel(pack: CompendiumPackLike | null, packId: string): string | undefined {
  if (!pack) {
    return undefined;
  }

  return pack.title ?? pack.metadata?.label ?? pack.collection ?? packId;
}

function extractCreatedItem(result: unknown): CreatedItemLike | null {
  if (Array.isArray(result)) {
    const resultEntries = result as unknown[];
    const first = resultEntries.find(candidate => Boolean(asRecord(candidate)));
    return first ? (first as CreatedItemLike) : null;
  }

  const record = asRecord(result);
  if (record && Array.isArray(record.contents)) {
    const contentEntries = record.contents as unknown[];
    const first = contentEntries.find(candidate => Boolean(asRecord(candidate)));
    return first ? (first as CreatedItemLike) : null;
  }

  return record ? (record as CreatedItemLike) : null;
}

export class FoundryItemAuthoringService {
  constructor(private readonly context: ItemAuthoringServiceContext) {}

  private findWorldItemByIdentifier(identifier: string): WorldItemLike | null {
    const target = identifier.toLowerCase();
    return (
      getWorldItemsArray().find(
        item => item.id?.toLowerCase() === target || item.name?.toLowerCase() === target
      ) ?? null
    );
  }

  private async resolveUuidDocument(uuid: string): Promise<UuidResolverDocumentLike | null> {
    const root = globalThis as {
      fromUuid?: (sourceUuid: string) => Promise<unknown>;
    };

    if (typeof root.fromUuid !== 'function') {
      throw new Error('Foundry fromUuid() API is unavailable');
    }

    const resolved = await root.fromUuid(uuid);
    if (!resolved || typeof resolved !== 'object') {
      return null;
    }

    return resolved as UuidResolverDocumentLike;
  }

  private normalizeSourceData(source: UuidResolverDocumentLike): UnknownRecord {
    if (typeof source.documentName === 'string' && source.documentName !== 'Item') {
      throw new Error(
        `Source UUID must resolve to an Item document, received ${source.documentName}.`
      );
    }

    const sourceRecord = asRecord(source.toObject?.() ?? source);
    if (!sourceRecord) {
      throw new Error('Resolved source item could not be serialized.');
    }

    const normalized = cloneRecord(sourceRecord);
    deleteIdentityFields(normalized);
    return normalized;
  }

  private getItemImplementation(): {
    createDocuments?: (
      data: Record<string, unknown>[],
      operation?: Record<string, unknown>
    ) => Promise<unknown>;
  } {
    const root = globalThis as {
      Item?: {
        implementation?: {
          createDocuments?: (
            data: Record<string, unknown>[],
            operation?: Record<string, unknown>
          ) => Promise<unknown>;
        };
      };
    };

    const implementation = root.Item?.implementation;
    if (!implementation?.createDocuments) {
      throw new Error('Foundry Item creation API is unavailable.');
    }

    return implementation;
  }

  private prepareItemData(params: {
    sourceUuid?: string;
    itemData?: UnknownRecord;
    overrides?: UnknownRecord;
    folderId?: string | null;
  }): Promise<{ itemData: UnknownRecord; createdFrom: 'uuid' | 'raw' }> {
    const build = async (): Promise<{ itemData: UnknownRecord; createdFrom: 'uuid' | 'raw' }> => {
      let baseData: UnknownRecord;
      let createdFrom: 'uuid' | 'raw';

      if (params.sourceUuid) {
        const resolved = await this.resolveUuidDocument(params.sourceUuid);
        if (!resolved) {
          throw new Error(`Source item UUID could not be resolved: ${params.sourceUuid}`);
        }

        baseData = this.normalizeSourceData(resolved);
        createdFrom = 'uuid';
      } else if (params.itemData) {
        baseData = cloneRecord(params.itemData);
        deleteIdentityFields(baseData);
        createdFrom = 'raw';
      } else {
        throw new Error('Provide sourceUuid or itemData.');
      }

      const itemData = params.overrides ? mergeRecords(baseData, params.overrides) : baseData;
      deleteIdentityFields(itemData);

      if (params.folderId !== undefined) {
        itemData.folder = params.folderId;
      }

      if (typeof itemData.name !== 'string' || typeof itemData.type !== 'string') {
        throw new Error('Prepared item data must include string name and type fields.');
      }

      return {
        itemData,
        createdFrom,
      };
    };

    return build();
  }

  async createWorldItem(
    request: FoundryCreateWorldItemRequest
  ): Promise<FoundryCreateWorldItemResponse> {
    this.context.validateFoundryState();

    try {
      const prepared = await this.prepareItemData({
        ...(request.sourceUuid !== undefined ? { sourceUuid: request.sourceUuid } : {}),
        ...(request.itemData !== undefined ? { itemData: request.itemData } : {}),
        ...(request.overrides !== undefined ? { overrides: request.overrides } : {}),
        ...(request.folderId !== undefined ? { folderId: request.folderId } : {}),
      });

      const createdRaw = await this.getItemImplementation().createDocuments!([prepared.itemData]);
      const createdItem = extractCreatedItem(createdRaw);

      const response: FoundryCreateWorldItemResponse = {
        success: true,
        itemId: createdItem?.id ?? '',
        itemName: createdItem?.name ?? (prepared.itemData.name as string),
        itemType: createdItem?.type ?? (prepared.itemData.type as string),
        createdFrom: prepared.createdFrom,
        ...(request.sourceUuid ? { sourceUuid: request.sourceUuid } : {}),
        ...(request.folderId !== undefined ? { folderId: request.folderId } : {}),
        ...(request.overrides ? { appliedOverrides: request.overrides } : {}),
      };

      this.context.auditLog('createWorldItem', request, 'success');
      return response;
    } catch (error) {
      this.context.auditLog(
        'createWorldItem',
        request,
        'failure',
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw error;
    }
  }

  async updateWorldItem(
    request: FoundryUpdateWorldItemRequest
  ): Promise<FoundryUpdateWorldItemResponse> {
    this.context.validateFoundryState();

    const item = this.findWorldItemByIdentifier(request.itemIdentifier);
    if (!item) {
      throw new Error(`World item not found: ${request.itemIdentifier}`);
    }

    if (typeof item.update !== 'function') {
      throw new Error(`World item "${item.name ?? request.itemIdentifier}" cannot be updated.`);
    }

    try {
      await item.update(request.updates);
      const updatedFields = Object.keys(request.updates).sort();

      const response: FoundryUpdateWorldItemResponse = {
        success: true,
        itemId: item.id ?? '',
        itemName: item.name ?? request.itemIdentifier,
        itemType: item.type ?? 'unknown',
        appliedUpdates: request.updates,
        updatedFields,
      };

      this.context.auditLog('updateWorldItem', request, 'success');
      return response;
    } catch (error) {
      this.context.auditLog(
        'updateWorldItem',
        request,
        'failure',
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw error;
    }
  }

  async createCompendiumItem(
    request: FoundryCreateCompendiumItemRequest
  ): Promise<FoundryCreateCompendiumItemResponse> {
    this.context.validateFoundryState();

    const pack = getPackById(request.packId);
    if (!pack) {
      throw new Error(`Compendium pack not found: ${request.packId}`);
    }
    if (pack.documentName !== 'Item') {
      throw new Error(`Compendium pack "${request.packId}" is not an Item pack.`);
    }
    if (pack.locked) {
      throw new Error(`Compendium pack "${request.packId}" is locked for editing.`);
    }

    try {
      const prepared = await this.prepareItemData({
        ...(request.sourceUuid !== undefined ? { sourceUuid: request.sourceUuid } : {}),
        ...(request.itemData !== undefined ? { itemData: request.itemData } : {}),
        ...(request.overrides !== undefined ? { overrides: request.overrides } : {}),
        ...(request.folderId !== undefined ? { folderId: request.folderId } : {}),
      });
      const packLabel = getPackLabel(pack, request.packId);

      const createdRaw = await this.getItemImplementation().createDocuments!([prepared.itemData], {
        pack: request.packId,
      });
      const createdItem = extractCreatedItem(createdRaw);

      const response: FoundryCreateCompendiumItemResponse = {
        success: true,
        packId: request.packId,
        ...(packLabel ? { packLabel } : {}),
        itemId: createdItem?.id ?? '',
        itemName: createdItem?.name ?? (prepared.itemData.name as string),
        itemType: createdItem?.type ?? (prepared.itemData.type as string),
        createdFrom: prepared.createdFrom,
        ...(request.sourceUuid ? { sourceUuid: request.sourceUuid } : {}),
        ...(request.folderId !== undefined ? { folderId: request.folderId } : {}),
        ...(request.overrides ? { appliedOverrides: request.overrides } : {}),
      };

      this.context.auditLog('createCompendiumItem', request, 'success');
      return response;
    } catch (error) {
      this.context.auditLog(
        'createCompendiumItem',
        request,
        'failure',
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw error;
    }
  }

  async importItemToCompendium(
    request: FoundryImportItemToCompendiumRequest
  ): Promise<FoundryImportItemToCompendiumResponse> {
    this.context.validateFoundryState();

    const item = this.findWorldItemByIdentifier(request.itemIdentifier);
    if (!item) {
      throw new Error(`World item not found: ${request.itemIdentifier}`);
    }

    const pack = getPackById(request.packId);
    if (!pack) {
      throw new Error(`Compendium pack not found: ${request.packId}`);
    }
    if (pack.documentName !== 'Item') {
      throw new Error(`Compendium pack "${request.packId}" is not an Item pack.`);
    }
    if (pack.locked) {
      throw new Error(`Compendium pack "${request.packId}" is locked for editing.`);
    }

    try {
      const packLabel = getPackLabel(pack, request.packId);
      let importedRaw: unknown;
      if (typeof pack.importDocument === 'function') {
        importedRaw = await pack.importDocument(item, {
          ...(request.folderId !== undefined ? { folder: request.folderId } : {}),
        });
      } else {
        const sourceRecord = asRecord(item.toObject?.() ?? item);
        if (!sourceRecord) {
          throw new Error('World item could not be serialized for compendium import.');
        }

        const prepared = cloneRecord(sourceRecord);
        deleteIdentityFields(prepared);
        if (request.folderId !== undefined) {
          prepared.folder = request.folderId;
        }
        importedRaw = await this.getItemImplementation().createDocuments!([prepared], {
          pack: request.packId,
        });
      }

      const importedItem = extractCreatedItem(importedRaw);

      const response: FoundryImportItemToCompendiumResponse = {
        success: true,
        sourceItemId: item.id ?? '',
        sourceItemName: item.name ?? request.itemIdentifier,
        sourceItemType: item.type ?? 'unknown',
        packId: request.packId,
        ...(packLabel ? { packLabel } : {}),
        itemId: importedItem?.id ?? '',
        itemName: importedItem?.name ?? item.name ?? request.itemIdentifier,
        itemType: importedItem?.type ?? item.type ?? 'unknown',
        ...(request.folderId !== undefined ? { folderId: request.folderId } : {}),
      };

      this.context.auditLog('importItemToCompendium', request, 'success');
      return response;
    } catch (error) {
      this.context.auditLog(
        'importItemToCompendium',
        request,
        'failure',
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw error;
    }
  }
}
