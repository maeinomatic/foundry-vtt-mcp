import { z } from 'zod';
import { FoundryClient } from '../../foundry-client.js';
import type {
  FoundryCreateCompendiumItemRequest,
  FoundryCreateCompendiumItemResponse,
  FoundryCreateWorldItemRequest,
  FoundryCreateWorldItemResponse,
  FoundryImportItemToCompendiumRequest,
  FoundryImportItemToCompendiumResponse,
  FoundryUpdateWorldItemRequest,
  FoundryUpdateWorldItemResponse,
} from '../../foundry-types.js';
import { Logger } from '../../logger.js';

export interface CompendiumWriteServiceOptions {
  foundryClient: FoundryClient;
  logger: Logger;
}

const itemDataSchema = z.object({
  name: z.string().min(1, 'Item name cannot be empty'),
  type: z.string().min(1, 'Item type cannot be empty'),
  img: z.string().optional(),
  system: z.record(z.unknown()).optional(),
  flags: z.record(z.unknown()).optional(),
  effects: z.array(z.unknown()).optional(),
});

export class CompendiumWriteService {
  private foundryClient: FoundryClient;
  private logger: Logger;

  constructor(options: CompendiumWriteServiceOptions) {
    this.foundryClient = options.foundryClient;
    this.logger = options.logger.child({ component: 'CompendiumWriteService' });
  }

  async handleCreateWorldItem(args: unknown): Promise<unknown> {
    const schema = z
      .object({
        sourceUuid: z.string().min(1).optional(),
        itemData: itemDataSchema.optional(),
        overrides: z.record(z.unknown()).optional(),
        folderId: z.string().optional(),
        reason: z.string().optional(),
      })
      .refine(
        value => (value.sourceUuid !== undefined) !== (value.itemData !== undefined),
        'Provide exactly one of sourceUuid or itemData'
      );

    const parsed = schema.parse(args);
    const itemData =
      parsed.itemData !== undefined
        ? {
            name: parsed.itemData.name,
            type: parsed.itemData.type,
            ...(parsed.itemData.img !== undefined ? { img: parsed.itemData.img } : {}),
            ...(parsed.itemData.system !== undefined ? { system: parsed.itemData.system } : {}),
            ...(parsed.itemData.flags !== undefined ? { flags: parsed.itemData.flags } : {}),
            ...(parsed.itemData.effects !== undefined ? { effects: parsed.itemData.effects } : {}),
          }
        : undefined;

    const request: FoundryCreateWorldItemRequest = {
      ...(parsed.sourceUuid !== undefined ? { sourceUuid: parsed.sourceUuid } : {}),
      ...(itemData !== undefined ? { itemData } : {}),
      ...(parsed.overrides !== undefined ? { overrides: parsed.overrides } : {}),
      ...(parsed.folderId !== undefined ? { folderId: parsed.folderId } : {}),
      ...(parsed.reason !== undefined ? { reason: parsed.reason } : {}),
    };

    const result = await this.foundryClient.query<FoundryCreateWorldItemResponse>(
      'maeinomatic-foundry-mcp.createWorldItem',
      request
    );

    return {
      success: result.success,
      item: {
        id: result.itemId,
        name: result.itemName,
        type: result.itemType,
      },
      createdFrom: result.createdFrom,
      ...(result.sourceUuid ? { sourceUuid: result.sourceUuid } : {}),
      ...(result.folderId !== undefined ? { folderId: result.folderId } : {}),
      ...(result.appliedOverrides ? { appliedOverrides: result.appliedOverrides } : {}),
    };
  }

  async handleUpdateWorldItem(args: unknown): Promise<unknown> {
    const schema = z.object({
      itemIdentifier: z.string().min(1, 'Item identifier cannot be empty'),
      updates: z.record(z.unknown()),
      reason: z.string().optional(),
    });

    const parsed = schema.parse(args);
    const result = await this.foundryClient.query<FoundryUpdateWorldItemResponse>(
      'maeinomatic-foundry-mcp.updateWorldItem',
      {
        itemIdentifier: parsed.itemIdentifier,
        updates: parsed.updates,
        ...(parsed.reason !== undefined ? { reason: parsed.reason } : {}),
      } satisfies FoundryUpdateWorldItemRequest
    );

    return {
      success: result.success,
      item: {
        id: result.itemId,
        name: result.itemName,
        type: result.itemType,
      },
      appliedUpdates: result.appliedUpdates,
      updatedFields: result.updatedFields,
    };
  }

  async handleCreateCompendiumItem(args: unknown): Promise<unknown> {
    const schema = z
      .object({
        packId: z.string().min(1, 'packId cannot be empty'),
        sourceUuid: z.string().min(1).optional(),
        itemData: itemDataSchema.optional(),
        overrides: z.record(z.unknown()).optional(),
        folderId: z.string().optional(),
        reason: z.string().optional(),
      })
      .refine(
        value => (value.sourceUuid !== undefined) !== (value.itemData !== undefined),
        'Provide exactly one of sourceUuid or itemData'
      );

    const parsed = schema.parse(args);
    const itemData =
      parsed.itemData !== undefined
        ? {
            name: parsed.itemData.name,
            type: parsed.itemData.type,
            ...(parsed.itemData.img !== undefined ? { img: parsed.itemData.img } : {}),
            ...(parsed.itemData.system !== undefined ? { system: parsed.itemData.system } : {}),
            ...(parsed.itemData.flags !== undefined ? { flags: parsed.itemData.flags } : {}),
            ...(parsed.itemData.effects !== undefined ? { effects: parsed.itemData.effects } : {}),
          }
        : undefined;

    const result = await this.foundryClient.query<FoundryCreateCompendiumItemResponse>(
      'maeinomatic-foundry-mcp.createCompendiumItem',
      {
        packId: parsed.packId,
        ...(parsed.sourceUuid !== undefined ? { sourceUuid: parsed.sourceUuid } : {}),
        ...(itemData !== undefined ? { itemData } : {}),
        ...(parsed.overrides !== undefined ? { overrides: parsed.overrides } : {}),
        ...(parsed.folderId !== undefined ? { folderId: parsed.folderId } : {}),
        ...(parsed.reason !== undefined ? { reason: parsed.reason } : {}),
      } satisfies FoundryCreateCompendiumItemRequest
    );

    return {
      success: result.success,
      pack: {
        id: result.packId,
        ...(result.packLabel ? { label: result.packLabel } : {}),
      },
      item: {
        id: result.itemId,
        name: result.itemName,
        type: result.itemType,
      },
      createdFrom: result.createdFrom,
      ...(result.sourceUuid ? { sourceUuid: result.sourceUuid } : {}),
      ...(result.folderId !== undefined ? { folderId: result.folderId } : {}),
      ...(result.appliedOverrides ? { appliedOverrides: result.appliedOverrides } : {}),
    };
  }

  async handleImportItemToCompendium(args: unknown): Promise<unknown> {
    const schema = z.object({
      itemIdentifier: z.string().min(1, 'Item identifier cannot be empty'),
      packId: z.string().min(1, 'packId cannot be empty'),
      folderId: z.string().optional(),
      reason: z.string().optional(),
    });

    const parsed = schema.parse(args);
    const result = await this.foundryClient.query<FoundryImportItemToCompendiumResponse>(
      'maeinomatic-foundry-mcp.importItemToCompendium',
      {
        itemIdentifier: parsed.itemIdentifier,
        packId: parsed.packId,
        ...(parsed.folderId !== undefined ? { folderId: parsed.folderId } : {}),
        ...(parsed.reason !== undefined ? { reason: parsed.reason } : {}),
      } satisfies FoundryImportItemToCompendiumRequest
    );

    return {
      success: result.success,
      sourceItem: {
        id: result.sourceItemId,
        name: result.sourceItemName,
        type: result.sourceItemType,
      },
      pack: {
        id: result.packId,
        ...(result.packLabel ? { label: result.packLabel } : {}),
      },
      item: {
        id: result.itemId,
        name: result.itemName,
        type: result.itemType,
      },
      ...(result.folderId !== undefined ? { folderId: result.folderId } : {}),
    };
  }
}
