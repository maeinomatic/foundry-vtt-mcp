import { z } from 'zod';
import { FoundryClient } from '../foundry-client.js';
import { CharacterProgressionService } from '../domains/characters/character-progression-service.js';
import { CharacterReadService } from '../domains/characters/character-read-service.js';
import {
  CharacterSpellbookService,
  type DnD5eSpellcastingClassSummary,
} from '../domains/characters/character-spellbook-service.js';
import type {
  FoundryApplyCharacterAdvancementChoiceRequest,
  FoundryApplyCharacterPatchTransactionRequest,
  FoundryApplyCharacterPatchTransactionResponse,
  FoundryActorDocumentBase,
  FoundryActorCreationResult,
  FoundryActorSystemBase,
  FoundryBatchUpdateActorEmbeddedItemsRequest,
  FoundryBatchUpdateActorEmbeddedItemsResponse,
  FoundryCharacterEffect,
  FoundryCharacterInfo,
  FoundryCreateActorEmbeddedItemData,
  FoundryCreateActorEmbeddedItemRequest,
  FoundryCreateActorEmbeddedItemResponse,
  FoundryCreateCharacterCompanionRequest,
  FoundryCreateCharacterCompanionResponse,
  FoundryDeleteCharacterCompanionRequest,
  FoundryDeleteCharacterCompanionResponse,
  FoundryDismissCharacterCompanionRequest,
  FoundryDismissCharacterCompanionResponse,
  FoundryConfigureCharacterCompanionSummonRequest,
  FoundryConfigureCharacterCompanionSummonResponse,
  FoundryDeleteActorEmbeddedItemRequest,
  FoundryDeleteActorEmbeddedItemResponse,
  FoundryGetCompendiumDocumentRequest,
  FoundryItemDocumentBase,
  FoundryItemSystemBase,
  FoundryListCharacterCompanionsRequest,
  FoundryListCharacterCompanionsResponse,
  FoundryRunDnD5eSummonActivityRequest,
  FoundryRunDnD5eSummonActivityResponse,
  FoundryRunDnD5eTransformActivityRequest,
  FoundryRunDnD5eTransformActivityResponse,
  FoundrySearchCharacterItemsResponse,
  FoundrySummonCharacterCompanionRequest,
  FoundrySummonCharacterCompanionResponse,
  FoundryRunCharacterRestWorkflowRequest,
  FoundryRunCharacterRestWorkflowResponse,
  FoundrySyncCharacterCompanionProgressionRequest,
  FoundrySyncCharacterCompanionProgressionResponse,
  FoundryUnlinkCharacterCompanionRequest,
  FoundryUnlinkCharacterCompanionResponse,
  FoundryUpdateActorEmbeddedItemRequest,
  FoundryUpdateActorEmbeddedItemResponse,
  FoundryUpdateActorRequest,
  FoundryUpdateActorResponse,
  FoundryUpdateCharacterCompanionLinkRequest,
  FoundryUpdateCharacterCompanionLinkResponse,
  FoundryValidateCharacterBuildRequest,
  FoundryValidateCharacterBuildResponse,
  UnknownRecord,
} from '../foundry-types.js';
import { Logger } from '../logger.js';
import { SystemContextService } from '../systems/system-context-service.js';
import { SystemRegistry } from '../systems/system-registry.js';
import type {
  CharacterAbilityScoreUpdateRequest,
  CharacterResourceUpdateRequest,
  CharacterSkillProficiencyUpdateRequest,
  CharacterSystemProficiencyUpdateRequest,
  CharacterProgressionUpdateRequest,
  PreparedCharacterWriteMutation,
  PreparedCharacterProgressionUpdate,
  SystemAdapter,
  SystemCharacterAction,
  SystemSpellcastingEntry,
} from '../systems/types.js';
import type { GameSystem } from '../utils/system-detection.js';

export interface CharacterToolsOptions {
  foundryClient: FoundryClient;
  logger: Logger;
  systemRegistry?: SystemRegistry;
  systemContextService?: SystemContextService;
}

type ActorListEntry = Pick<FoundryActorDocumentBase, 'id' | 'name' | 'type' | 'img'>;

type CharacterSystem = FoundryActorSystemBase;

type CharacterItemSystem = FoundryItemSystemBase;

type CharacterItem = FoundryItemDocumentBase<CharacterItemSystem>;

type CharacterEffect = FoundryCharacterEffect<UnknownRecord> & {
  description?: string;
  traits?: string[];
  duration?: { type?: string; remaining?: number };
};

type CharacterInfoResponse = Omit<
  FoundryCharacterInfo<CharacterSystem, CharacterItemSystem, UnknownRecord>,
  'items' | 'effects' | 'actions' | 'spellcasting'
> & {
  items: CharacterItem[];
  effects: CharacterEffect[];
  actions?: SystemCharacterAction[];
  spellcasting?: SystemSpellcastingEntry[];
  // Optional producer-specific extras. Keep MCP behavior bound to core fields.
  itemVariants?: unknown[];
  itemToggles?: unknown[];
} & UnknownRecord;

type EffectDuration = {
  type: string | undefined;
  remaining: number | undefined;
};

type CharacterEffectSummary = {
  id: string;
  name: string;
  disabled: boolean;
  duration: EffectDuration | null;
  hasIcon: boolean;
};

type AdvancementChoiceInput = FoundryApplyCharacterAdvancementChoiceRequest['choice'];

type AdvancementChoiceSchemaInput =
  | {
      type: 'ability-score-improvement';
      mode: 'asi';
      assignments: Record<string, number>;
    }
  | {
      type: 'ability-score-improvement';
      mode: 'feat';
      featUuid: string;
    }
  | {
      type: 'subclass';
      subclassUuid: string;
    }
  | {
      type: 'hit-points';
      mode: 'average' | 'roll';
    }
  | {
      type: 'item-choice';
      itemUuids: string[];
      replaceItemId?: string | undefined;
      ability?: string | undefined;
    }
  | {
      type: 'item-grant';
      itemUuids?: string[] | undefined;
      ability?: string | undefined;
    }
  | {
      type: 'trait';
      selected: string[];
    }
  | {
      type: 'size';
      size: string;
    };

type AdvancementSelectionInput = {
  stepId?: string;
  stepType?: string;
  sourceItemId?: string;
  sourceItemName?: string;
  choice: AdvancementChoiceInput;
};

type AdvancementSelectionSchemaInput = {
  stepId?: string | undefined;
  stepType?: string | undefined;
  sourceItemId?: string | undefined;
  sourceItemName?: string | undefined;
  choice: AdvancementChoiceSchemaInput;
};

function createAdvancementChoiceSchema(): z.ZodType<AdvancementChoiceSchemaInput> {
  const choiceSchema = z.discriminatedUnion('mode', [
    z.object({
      type: z.literal('ability-score-improvement'),
      mode: z.literal('asi'),
      assignments: z.record(z.string(), z.number().int().positive()),
    }),
    z.object({
      type: z.literal('ability-score-improvement'),
      mode: z.literal('feat'),
      featUuid: z.string().min(1, 'featUuid cannot be empty'),
    }),
    z.object({
      type: z.literal('hit-points'),
      mode: z.enum(['average', 'roll']),
    }),
  ]);

  return z.union([
    choiceSchema,
    z.object({
      type: z.literal('subclass'),
      subclassUuid: z.string().min(1, 'subclassUuid cannot be empty'),
    }),
    z.object({
      type: z.literal('item-choice'),
      itemUuids: z.array(z.string().min(1, 'itemUuids entries cannot be empty')).min(1),
      replaceItemId: z.string().min(1).optional(),
      ability: z.string().min(1).optional(),
    }),
    z.object({
      type: z.literal('item-grant'),
      itemUuids: z.array(z.string().min(1, 'itemUuids entries cannot be empty')).optional(),
      ability: z.string().min(1).optional(),
    }),
    z.object({
      type: z.literal('trait'),
      selected: z.array(z.string().min(1, 'selected entries cannot be empty')).min(1),
    }),
    z.object({
      type: z.literal('size'),
      size: z.string().min(1, 'size cannot be empty'),
    }),
  ]);
}

function createAdvancementSelectionSchema(): z.ZodType<AdvancementSelectionSchemaInput> {
  const advancementChoiceSchema = createAdvancementChoiceSchema();
  return z
    .object({
      stepId: z.string().min(1).optional(),
      stepType: z.string().min(1).optional(),
      sourceItemId: z.string().min(1).optional(),
      sourceItemName: z.string().min(1).optional(),
      choice: advancementChoiceSchema,
    })
    .refine(
      value => value.stepId !== undefined || value.stepType !== undefined,
      'Each advancement selection requires stepId or stepType'
    );
}

function normalizeAdvancementChoice(choice: AdvancementChoiceSchemaInput): AdvancementChoiceInput {
  if (choice.type === 'item-choice') {
    return {
      type: 'item-choice',
      itemUuids: choice.itemUuids,
      ...(choice.replaceItemId !== undefined ? { replaceItemId: choice.replaceItemId } : {}),
      ...(choice.ability !== undefined ? { ability: choice.ability } : {}),
    };
  }

  if (choice.type === 'item-grant') {
    return {
      type: 'item-grant',
      ...(choice.itemUuids !== undefined ? { itemUuids: choice.itemUuids } : {}),
      ...(choice.ability !== undefined ? { ability: choice.ability } : {}),
    };
  }

  if (choice.type === 'trait') {
    return {
      type: 'trait',
      selected: choice.selected,
    };
  }

  if (choice.type === 'size') {
    return {
      type: 'size',
      size: choice.size,
    };
  }

  return choice;
}

function createAdvancementSelectionsInputSchema(description: string): Record<string, unknown> {
  return {
    type: 'array',
    description,
    items: {
      type: 'object',
      properties: {
        stepId: {
          type: 'string',
          description: 'Preferred exact pending-step ID from preview-character-progression',
        },
        stepType: {
          type: 'string',
          description: 'Fallback pending-step type when stepId is not provided',
        },
        sourceItemId: {
          type: 'string',
          description: 'Optional source owned item ID to disambiguate same-type steps',
        },
        sourceItemName: {
          type: 'string',
          description: 'Optional source owned item name to disambiguate same-type steps',
        },
        choice: {
          anyOf: [
            {
              type: 'object',
              properties: {
                type: { const: 'ability-score-improvement' },
                mode: { const: 'asi' },
                assignments: {
                  type: 'object',
                  additionalProperties: { type: 'number' },
                },
              },
              required: ['type', 'mode', 'assignments'],
            },
            {
              type: 'object',
              properties: {
                type: { const: 'ability-score-improvement' },
                mode: { const: 'feat' },
                featUuid: { type: 'string' },
              },
              required: ['type', 'mode', 'featUuid'],
            },
            {
              type: 'object',
              properties: {
                type: { const: 'subclass' },
                subclassUuid: { type: 'string' },
              },
              required: ['type', 'subclassUuid'],
            },
            {
              type: 'object',
              properties: {
                type: { const: 'hit-points' },
                mode: { enum: ['average', 'roll'] },
              },
              required: ['type', 'mode'],
            },
            {
              type: 'object',
              properties: {
                type: { const: 'item-choice' },
                itemUuids: {
                  type: 'array',
                  items: { type: 'string' },
                },
                replaceItemId: { type: 'string' },
                ability: { type: 'string' },
              },
              required: ['type', 'itemUuids'],
            },
            {
              type: 'object',
              properties: {
                type: { const: 'item-grant' },
                itemUuids: {
                  type: 'array',
                  items: { type: 'string' },
                },
                ability: { type: 'string' },
              },
              required: ['type'],
            },
            {
              type: 'object',
              properties: {
                type: { const: 'trait' },
                selected: {
                  type: 'array',
                  items: { type: 'string' },
                },
              },
              required: ['type', 'selected'],
            },
            {
              type: 'object',
              properties: {
                type: { const: 'size' },
                size: {
                  type: 'string',
                },
              },
              required: ['type', 'size'],
            },
          ],
        },
      },
      required: ['choice'],
    },
  };
}

function createSpellPreparationPlanSchema(): z.ZodEffects<
  z.ZodObject<{
    mode: z.ZodEnum<['replace', 'prepare', 'unprepare']>;
    spellIdentifiers: z.ZodDefault<z.ZodArray<z.ZodString, 'many'>>;
    sourceClass: z.ZodOptional<z.ZodString>;
    reason: z.ZodOptional<z.ZodString>;
  }>
> {
  return z
    .object({
      mode: z.enum(['replace', 'prepare', 'unprepare']),
      spellIdentifiers: z.array(z.string().min(1)).default([]),
      sourceClass: z.string().min(1).optional(),
      reason: z.string().min(1).optional(),
    })
    .superRefine((value, ctx) => {
      if (value.mode !== 'replace' && value.spellIdentifiers.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'spellIdentifiers must contain at least one spell for prepare or unprepare mode',
          path: ['spellIdentifiers'],
        });
      }
    });
}

function createSpellPreparationPlansInputSchema(description: string): Record<string, unknown> {
  return {
    type: 'array',
    description,
    items: {
      type: 'object',
      properties: {
        mode: {
          type: 'string',
          enum: ['replace', 'prepare', 'unprepare'],
          description:
            'replace resets prepared flags within the scoped spellbook, while prepare/unprepare only patch the listed spells',
        },
        spellIdentifiers: {
          type: 'array',
          items: { type: 'string' },
          description: 'Owned spell names or IDs affected by the preparation operation',
        },
        sourceClass: {
          type: 'string',
          description:
            'Optional source class name or ID to scope the spellbook, strongly recommended for multiclass prepared casters',
        },
        reason: {
          type: 'string',
          description: 'Optional audit reason for this specific spell preparation operation',
        },
      },
      required: ['mode', 'spellIdentifiers'],
    },
  };
}

function parseCompendiumDocumentUuid(uuid: string): { packId: string; documentId: string } | null {
  const parts = uuid.split('.');
  if (parts.length < 4 || parts[0] !== 'Compendium') {
    return null;
  }

  return {
    packId: `${parts[1]}.${parts[2]}`,
    documentId: parts[parts.length - 1],
  };
}

function parseCompendiumActorSourceUuid(
  uuid: string
): { packId: string; documentId: string } | null {
  const parts = uuid.split('.');
  if (parts.length < 5 || parts[0] !== 'Compendium' || parts[3] !== 'Actor') {
    return null;
  }

  return {
    packId: `${parts[1]}.${parts[2]}`,
    documentId: parts[parts.length - 1],
  };
}

interface UseItemResponse extends UnknownRecord {
  actorName: string;
  itemName: string;
  targets?: string[];
}

export class CharacterTools {
  private foundryClient: FoundryClient;
  private logger: Logger;
  private systemContextService: SystemContextService;
  private readService: CharacterReadService;
  private progressionService: CharacterProgressionService;
  private spellbookService: CharacterSpellbookService;

  constructor({
    foundryClient,
    logger,
    systemRegistry,
    systemContextService,
  }: CharacterToolsOptions) {
    this.foundryClient = foundryClient;
    this.logger = logger.child({ component: 'CharacterTools' });
    this.systemContextService =
      systemContextService ??
      new SystemContextService({
        foundryClient,
        logger: this.logger,
        systemRegistry: systemRegistry ?? null,
      });
    this.readService = new CharacterReadService({
      foundryClient,
      logger: this.logger,
      formatCharacterResponse: async (characterData): Promise<UnknownRecord> =>
        this.formatCharacterResponse(characterData as CharacterInfoResponse),
      formatCharacterItemDetails: async (item): Promise<UnknownRecord> =>
        this.formatCharacterItemDetails(item as CharacterItem),
    });
    this.progressionService = new CharacterProgressionService({
      foundryClient,
      logger: this.logger,
      getGameSystem: (): Promise<GameSystem> => this.getGameSystem(),
      getCharacterData: (identifier): Promise<CharacterInfoResponse> =>
        this.getCharacterData(identifier),
      prepareProgressionUpdate: (
        characterData,
        request
      ): Promise<PreparedCharacterProgressionUpdate> =>
        this.prepareProgressionUpdate(characterData as CharacterInfoResponse, request),
      applyProgressionUpdate: (
        characterIdentifier,
        prepared
      ): Promise<FoundryUpdateActorResponse | FoundryUpdateActorEmbeddedItemResponse> =>
        this.applyProgressionUpdate(characterIdentifier, prepared),
    });
    this.spellbookService = new CharacterSpellbookService({
      foundryClient,
      logger: this.logger,
      getGameSystem: (): Promise<GameSystem> => this.getGameSystem(),
      getRequiredSystemAdapter: (
        operation
      ): Promise<{ adapter: SystemAdapter; system: GameSystem }> =>
        this.getRequiredSystemAdapter(operation),
      getCharacterData: (identifier): Promise<CharacterInfoResponse> =>
        this.getCharacterData(identifier),
      getDnD5eSpellcastingClassSummaries: (characterData): DnD5eSpellcastingClassSummary[] =>
        this.getDnD5eSpellcastingClassSummaries(characterData as CharacterInfoResponse),
      resolveDnD5eSpellcastingClass: (
        characterData,
        classIdentifier
      ): DnD5eSpellcastingClassSummary =>
        this.resolveDnD5eSpellcastingClass(characterData as CharacterInfoResponse, classIdentifier),
      findDnD5eSpellItem: (characterData, spellIdentifier): CharacterItem =>
        this.findDnD5eSpellItem(characterData as CharacterInfoResponse, spellIdentifier),
      handleSetDnD5ePreparedSpells: (args): Promise<UnknownRecord> =>
        this.handleSetDnD5ePreparedSpells(args),
      toRecord: (value): UnknownRecord | undefined => this.toRecord(value),
    });
  }

  private async getGameSystem(): Promise<GameSystem> {
    return this.systemContextService.getGameSystem();
  }

  invalidateSystemCache(): void {
    this.systemContextService.invalidateCache();
  }

  private async withSystemAdapter<T>(
    operation: string,
    onAdapter: (adapter: SystemAdapter, system: GameSystem) => T,
    onFallback: () => T
  ): Promise<T> {
    try {
      const { system: gameSystem, adapter } = await this.systemContextService.resolve();
      if (adapter) {
        this.logger.debug(`Using system adapter for ${operation}`, {
          system: gameSystem,
        });
        return onAdapter(adapter, gameSystem);
      }
    } catch (error) {
      this.logger.warn(`Failed to use system adapter for ${operation}, falling back`, {
        error,
      });
    }

    return onFallback();
  }

  private async getRequiredSystemAdapter(
    capability: string
  ): Promise<{ adapter: SystemAdapter; system: GameSystem }> {
    return this.systemContextService.requireAdapter(capability);
  }

  private async getCharacterData(identifier: string): Promise<CharacterInfoResponse> {
    return this.foundryClient.query<CharacterInfoResponse>(
      'maeinomatic-foundry-mcp.getCharacterInfo',
      {
        identifier,
      }
    );
  }

  private async createDnD5eClassItemOnCharacter(params: {
    characterIdentifier: string;
    classUuid: string;
    reason?: string;
  }): Promise<FoundryCreateActorEmbeddedItemResponse> {
    const characterData = await this.getCharacterData(params.characterIdentifier);
    if (characterData.type !== 'character') {
      throw new Error(
        'UNSUPPORTED_CAPABILITY: DnD5e class addition is only supported for character actors.'
      );
    }

    const parsedClassUuid = parseCompendiumDocumentUuid(params.classUuid);
    if (parsedClassUuid) {
      const classDocument = await this.foundryClient.query<FoundryItemDocumentBase | null>(
        'maeinomatic-foundry-mcp.getCompendiumDocumentFull',
        {
          packId: parsedClassUuid.packId,
          documentId: parsedClassUuid.documentId,
        } satisfies FoundryGetCompendiumDocumentRequest
      );

      const className = classDocument?.name?.toLowerCase();
      if (
        className &&
        (characterData.items ?? []).some(
          item => item.type === 'class' && item.name.toLowerCase() === className
        )
      ) {
        throw new Error(
          `This character already has the class "${classDocument?.name ?? params.classUuid}". Use update-character-progression to level the existing class instead of adding a duplicate class item.`
        );
      }
    }

    return this.foundryClient.query<FoundryCreateActorEmbeddedItemResponse>(
      'maeinomatic-foundry-mcp.createActorEmbeddedItem',
      {
        actorIdentifier: params.characterIdentifier,
        sourceUuid: params.classUuid,
        itemType: 'class',
        ...(params.reason !== undefined ? { reason: params.reason } : {}),
      }
    );
  }

  private async resolveDnD5eOwnedClassSummary(
    characterIdentifier: string,
    classIdentifier: string
  ): Promise<{ id: string; name: string; type: string }> {
    const characterData = await this.getCharacterData(characterIdentifier);
    if (characterData.type !== 'character') {
      throw new Error(
        'UNSUPPORTED_CAPABILITY: DnD5e multiclass entry is only supported for character actors.'
      );
    }

    const normalizedClassIdentifier = classIdentifier.toLowerCase();
    const classItem = (characterData.items ?? []).find(
      item =>
        item.type === 'class' &&
        (item.id.toLowerCase() === normalizedClassIdentifier ||
          item.name.toLowerCase() === normalizedClassIdentifier)
    );

    if (!classItem) {
      throw new Error(
        `UNSUPPORTED_CAPABILITY: Class "${classIdentifier}" was not found on this DnD5e character.`
      );
    }

    return {
      id: classItem.id,
      name: classItem.name,
      type: classItem.type,
    };
  }

  private async applyPreparedWriteMutation(params: {
    actorIdentifier: string;
    mutation: PreparedCharacterWriteMutation;
    reason?: string;
  }): Promise<{
    actorResult: FoundryUpdateActorResponse | null;
    itemResult: FoundryBatchUpdateActorEmbeddedItemsResponse | null;
    warnings: string[];
  }> {
    const { actorIdentifier, mutation, reason } = params;
    const warnings = [...(mutation.warnings ?? [])];

    const actorResult =
      mutation.actorUpdates && Object.keys(mutation.actorUpdates).length > 0
        ? await this.foundryClient.query<FoundryUpdateActorResponse>(
            'maeinomatic-foundry-mcp.updateActor',
            {
              identifier: actorIdentifier,
              updates: mutation.actorUpdates,
              ...(reason !== undefined ? { reason } : {}),
            }
          )
        : null;

    const itemResult =
      mutation.embeddedItemUpdates && mutation.embeddedItemUpdates.length > 0
        ? await this.foundryClient.query<FoundryBatchUpdateActorEmbeddedItemsResponse>(
            'maeinomatic-foundry-mcp.batchUpdateActorEmbeddedItems',
            {
              actorIdentifier,
              updates: mutation.embeddedItemUpdates,
              ...(reason !== undefined ? { reason } : {}),
            }
          )
        : null;

    return {
      actorResult,
      itemResult,
      warnings,
    };
  }

  private toRecord(value: unknown): UnknownRecord | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }

    return value as UnknownRecord;
  }

  private toNumber(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string' && value.trim().length > 0) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    }

    return undefined;
  }

  private getNestedValue(root: unknown, path: string[]): unknown {
    let current: unknown = root;
    for (const segment of path) {
      const record = this.toRecord(current);
      if (!record) {
        return undefined;
      }
      current = record[segment];
    }
    return current;
  }

  private getDnD5eExperienceState(characterData: CharacterInfoResponse): {
    current: number;
    max?: number;
    updatePath: string;
  } | null {
    const candidates = [
      {
        basePath: 'system.details.xp',
        value: this.getNestedValue(characterData, ['system', 'details', 'xp']),
      },
      {
        basePath: 'system.attributes.xp',
        value: this.getNestedValue(characterData, ['system', 'attributes', 'xp']),
      },
      {
        basePath: 'system.xp',
        value: this.getNestedValue(characterData, ['system', 'xp']),
      },
    ];

    for (const candidate of candidates) {
      const record = this.toRecord(candidate.value);
      if (record) {
        const current = this.toNumber(record.value);
        if (current !== undefined) {
          const max = this.toNumber(record.max);
          return {
            current,
            ...(max !== undefined ? { max } : {}),
            updatePath: `${candidate.basePath}.value`,
          };
        }
      }

      const direct = this.toNumber(candidate.value);
      if (direct !== undefined) {
        return {
          current: direct,
          updatePath: candidate.basePath,
        };
      }
    }

    return null;
  }

  private getDnD5eCurrencyState(
    characterData: CharacterInfoResponse,
    denomination: string
  ): { current: number; updatePath: string } {
    const basePath = `system.currency.${denomination}`;
    const value = this.getNestedValue(characterData, ['system', 'currency', denomination]);
    const record = this.toRecord(value);
    if (record) {
      const current = this.toNumber(record.value);
      if (current !== undefined) {
        return {
          current,
          updatePath: `${basePath}.value`,
        };
      }
    }

    const direct = this.toNumber(value);
    return {
      current: direct ?? 0,
      updatePath: basePath,
    };
  }

  private normalizeNamedEntities(value: unknown): Array<{ id: string; name: string }> {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map(entry => {
        const record = this.toRecord(entry);
        const id = typeof record?.id === 'string' ? record.id : '';
        const name = typeof record?.name === 'string' ? record.name : '';
        return { id, name };
      })
      .filter(entry => entry.id.length > 0);
  }

  private distributeAwardAmount(
    amount: number,
    recipientCount: number,
    mode: 'split' | 'each'
  ): { perRecipient: number; remainder: number } {
    if (mode === 'each') {
      return { perRecipient: amount, remainder: 0 };
    }

    if (recipientCount <= 0) {
      return { perRecipient: 0, remainder: amount };
    }

    if (!Number.isInteger(amount)) {
      return {
        perRecipient: amount / recipientCount,
        remainder: 0,
      };
    }

    const perRecipient = Math.floor(amount / recipientCount);
    return {
      perRecipient,
      remainder: amount - perRecipient * recipientCount,
    };
  }

  private distributeStagedAwardAmount(params: {
    requestedAmount: number;
    availableAmount: number;
    recipientCount: number;
    mode: 'split' | 'each';
  }): {
    requestedTotal: number;
    perRecipient: number;
    actualDistributed: number;
    unavailable: number;
    availableAfter: number;
  } {
    const { requestedAmount, availableAmount, recipientCount, mode } = params;

    if (recipientCount <= 0) {
      return {
        requestedTotal: mode === 'each' ? requestedAmount : requestedAmount,
        perRecipient: 0,
        actualDistributed: 0,
        unavailable: mode === 'each' ? requestedAmount : requestedAmount,
        availableAfter: availableAmount,
      };
    }

    if (mode === 'split') {
      const cappedTotal = Math.min(requestedAmount, availableAmount);
      const distribution = this.distributeAwardAmount(cappedTotal, recipientCount, 'split');
      const actualDistributed =
        Number.isInteger(cappedTotal) && Number.isInteger(distribution.perRecipient)
          ? distribution.perRecipient * recipientCount
          : cappedTotal;

      return {
        requestedTotal: requestedAmount,
        perRecipient: distribution.perRecipient,
        actualDistributed,
        unavailable: Math.max(0, requestedAmount - cappedTotal),
        availableAfter: Math.max(0, availableAmount - actualDistributed),
      };
    }

    const perRecipient =
      Number.isInteger(requestedAmount) && Number.isInteger(availableAmount)
        ? Math.min(requestedAmount, Math.floor(availableAmount / recipientCount))
        : Math.min(requestedAmount, availableAmount / recipientCount);
    const requestedTotal = requestedAmount * recipientCount;
    const actualDistributed = perRecipient * recipientCount;

    return {
      requestedTotal,
      perRecipient,
      actualDistributed,
      unavailable: Math.max(0, requestedTotal - actualDistributed),
      availableAfter: Math.max(0, availableAmount - actualDistributed),
    };
  }

  private buildDnD5eAwardUpdates(params: {
    actorData: CharacterInfoResponse;
    experiencePoints?: number;
    currency?: Record<string, number>;
  }): {
    updates: Record<string, unknown>;
    experienceSummary?:
      | {
          before: number;
          after: number;
          awarded: number;
          nextLevelAt?: number;
          levelUpReady?: boolean;
        }
      | undefined;
    awardedCurrency: Record<string, number>;
  } {
    const updates: Record<string, unknown> = {};
    let experienceSummary:
      | {
          before: number;
          after: number;
          awarded: number;
          nextLevelAt?: number;
          levelUpReady?: boolean;
        }
      | undefined;

    if (params.experiencePoints !== undefined && params.experiencePoints > 0) {
      const xpState = this.getDnD5eExperienceState(params.actorData);
      if (!xpState) {
        throw new Error(
          `Actor "${params.actorData.name}" does not expose a supported DnD5e experience field for awards.`
        );
      }

      const nextExperience = xpState.current + params.experiencePoints;
      updates[xpState.updatePath] = nextExperience;
      experienceSummary = {
        before: xpState.current,
        after: nextExperience,
        awarded: params.experiencePoints,
        ...(xpState.max !== undefined ? { nextLevelAt: xpState.max } : {}),
        ...(xpState.max !== undefined ? { levelUpReady: nextExperience >= xpState.max } : {}),
      };
    }

    const awardedCurrency: Record<string, number> = {};
    for (const [denomination, amount] of Object.entries(params.currency ?? {})) {
      if (amount <= 0) {
        continue;
      }

      const currencyState = this.getDnD5eCurrencyState(params.actorData, denomination);
      updates[currencyState.updatePath] = currencyState.current + amount;
      awardedCurrency[denomination] = amount;
    }

    return {
      updates,
      ...(experienceSummary ? { experienceSummary } : {}),
      awardedCurrency,
    };
  }

  private getRollbackUpdates(
    actorData: CharacterInfoResponse,
    updates: Record<string, unknown>
  ): Record<string, unknown> {
    return Object.fromEntries(
      Object.keys(updates).map(path => [path, this.getNestedValue(actorData, path.split('.'))])
    );
  }

  private async rollbackAwardActorUpdates(params: {
    rollbacks: Array<{
      identifier: string;
      actorName: string;
      updates: Record<string, unknown>;
    }>;
    reason: string;
  }): Promise<string[]> {
    const errors: string[] = [];

    for (const rollback of [...params.rollbacks].reverse()) {
      if (Object.keys(rollback.updates).length === 0) {
        continue;
      }

      try {
        await this.foundryClient.query<FoundryUpdateActorResponse>(
          'maeinomatic-foundry-mcp.updateActor',
          {
            identifier: rollback.identifier,
            updates: rollback.updates,
            reason: params.reason,
          } satisfies FoundryUpdateActorRequest
        );
      } catch (error) {
        errors.push(
          `Failed to roll back award updates for "${rollback.actorName}": ${
            error instanceof Error ? error.message : 'Unknown error'
          }`
        );
      }
    }

    return errors;
  }

  private async resolvePrimaryPartyGroup(params?: {
    partyIdentifier?: string;
  }): Promise<{ id: string; name: string }> {
    if (params?.partyIdentifier) {
      const actorData = await this.getCharacterData(params.partyIdentifier);
      if (actorData.type !== 'group') {
        throw new Error(
          `Actor "${actorData.name}" is type "${actorData.type}", not group. Provide a DnD5e party group actor when using staged awards.`
        );
      }

      return {
        id: actorData.id,
        name: actorData.name,
      };
    }

    const groups = await this.foundryClient.query<ActorListEntry[]>(
      'maeinomatic-foundry-mcp.listActors',
      {
        type: 'group',
      }
    );
    const normalizedGroups = Array.isArray(groups)
      ? groups.filter(
          (group): group is ActorListEntry =>
            typeof group?.id === 'string' && group.id.length > 0 && group.type === 'group'
        )
      : [];

    if (normalizedGroups.length === 0) {
      throw new Error(
        'No DnD5e group actors were found. Provide partyIdentifier or create a party group actor before using staged awards.'
      );
    }

    if (normalizedGroups.length > 1) {
      const groupNames = normalizedGroups.map(group => group.name ?? group.id).join(', ');
      throw new Error(
        `Multiple DnD5e group actors were found (${groupNames}). Provide partyIdentifier to select which party group should stage or distribute awards.`
      );
    }

    return {
      id: normalizedGroups[0].id,
      name: normalizedGroups[0].name ?? normalizedGroups[0].id,
    };
  }

  private getDnD5eSpellSourceValue(item: CharacterItem): string | undefined {
    const system = this.toRecord(item.system);
    const spellSource = system?.spellSource;
    if (typeof spellSource === 'string' && spellSource.trim().length > 0) {
      return spellSource;
    }

    const sourceClass = system?.sourceClass;
    if (typeof sourceClass === 'string' && sourceClass.trim().length > 0) {
      return sourceClass;
    }

    return undefined;
  }

  private getDnD5eSpellPreparedValue(item: CharacterItem): boolean {
    const system = this.toRecord(item.system);
    const preparation = this.toRecord(system?.preparation);
    return typeof preparation?.prepared === 'boolean' ? preparation.prepared : true;
  }

  private getDnD5eSpellcastingClassSummaries(
    characterData: CharacterInfoResponse
  ): DnD5eSpellcastingClassSummary[] {
    return (characterData.items ?? [])
      .filter(item => item.type === 'class')
      .map(item => {
        const system = this.toRecord(item.system);
        const spellcasting = this.toRecord(system?.spellcasting);
        return {
          id: item.id,
          name: item.name,
          ...(typeof spellcasting?.type === 'string'
            ? { spellcastingType: spellcasting.type }
            : {}),
          ...(typeof spellcasting?.progression === 'string'
            ? { spellcastingProgression: spellcasting.progression }
            : {}),
        };
      })
      .filter(
        item =>
          item.spellcastingProgression !== undefined && item.spellcastingProgression !== 'none'
      );
  }

  private resolveDnD5eSpellcastingClass(
    characterData: CharacterInfoResponse,
    classIdentifier: string
  ): DnD5eSpellcastingClassSummary {
    const classes = this.getDnD5eSpellcastingClassSummaries(characterData);
    const target = classIdentifier.toLowerCase();
    const match = classes.find(
      item => item.id.toLowerCase() === target || item.name.toLowerCase() === target
    );

    if (!match) {
      throw new Error(
        `No spellcasting class matching "${classIdentifier}" was found on this actor.`
      );
    }

    return match;
  }

  private findDnD5eSpellItem(
    characterData: CharacterInfoResponse,
    spellIdentifier: string
  ): CharacterItem {
    const target = spellIdentifier.toLowerCase();
    const match = (characterData.items ?? []).find(
      item =>
        item.type === 'spell' &&
        (item.id.toLowerCase() === target || item.name.toLowerCase() === target)
    );

    if (!match) {
      throw new Error(`No owned spell matching "${spellIdentifier}" was found on this actor.`);
    }

    return match;
  }

  private spellMatchesSourceClass(
    spell: CharacterItem,
    sourceClass: { id: string; name: string }
  ): boolean {
    const currentSource = this.getDnD5eSpellSourceValue(spell);
    if (!currentSource) {
      return false;
    }

    const normalized = currentSource.toLowerCase();
    return (
      normalized === sourceClass.id.toLowerCase() || normalized === sourceClass.name.toLowerCase()
    );
  }

  private async validateDnD5eSpellbookState(
    actorIdentifier: string
  ): ReturnType<CharacterSpellbookService['validateDnD5eSpellbookState']> {
    return this.spellbookService.validateDnD5eSpellbookState(actorIdentifier);
  }

  /**
   * Tool: get-character
   * Retrieve detailed information about a specific character
   */
  getToolDefinitions(): Array<{
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
  }> {
    return [
      {
        name: 'get-character',
        description:
          'Retrieve character information optimized for minimal token usage. Returns compact character stats, action names, active effects/conditions, and all items with minimal metadata but without descriptions. System adapters may include additional system-specific fields such as traits, rarity, levels, action costs, or attunement when supported. Use get-character-entity to fetch full details for specific items, actions, spells, or effects.',
        inputSchema: {
          type: 'object',
          properties: {
            identifier: {
              type: 'string',
              description: 'Character name or ID to look up',
            },
          },
          required: ['identifier'],
        },
      },
      {
        name: 'get-character-entity',
        description:
          'Retrieve full details for a specific entity from a character. Works for items, actions, or effects. Returns complete description and system data.',
        inputSchema: {
          type: 'object',
          properties: {
            characterIdentifier: {
              type: 'string',
              description: 'Character name or ID',
            },
            entityIdentifier: {
              type: 'string',
              description: 'Entity name or ID',
            },
          },
          required: ['characterIdentifier', 'entityIdentifier'],
        },
      },
      {
        name: 'list-characters',
        description: 'List all available characters with basic information',
        inputSchema: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              description: 'Optional filter by character type (e.g., "character", "npc")',
            },
          },
        },
      },
      {
        name: 'use-item',
        description:
          'Use an item on a character. Optionally specify targets. Returns immediately with initiated status.',
        inputSchema: {
          type: 'object',
          properties: {
            actorIdentifier: {
              type: 'string',
              description: 'Character using the item (name or ID)',
            },
            itemIdentifier: {
              type: 'string',
              description: 'Item name or ID',
            },
            targets: {
              type: 'array',
              items: { type: 'string' },
              description: 'Optional target names or IDs',
            },
            consume: {
              type: 'boolean',
              description: 'Whether to consume charges/uses',
            },
            spellLevel: {
              type: 'number',
              description: 'For spells: cast at a higher level',
            },
          },
          required: ['actorIdentifier', 'itemIdentifier'],
        },
      },
      {
        name: 'search-character-items',
        description:
          "Search within a character's items, spells, actions, and effects with optional text and type filters.",
        inputSchema: {
          type: 'object',
          properties: {
            characterIdentifier: {
              type: 'string',
              description: 'Character name or ID to search within',
            },
            query: {
              type: 'string',
              description: 'Text to search for in item names and descriptions',
            },
            type: {
              type: 'string',
              description: 'Optional item type filter',
            },
            category: {
              type: 'string',
              description: 'Optional category filter',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of results to return (default: 20)',
            },
          },
          required: ['characterIdentifier'],
        },
      },
      {
        name: 'update-character',
        description:
          'Apply a direct audited actor update payload to a character. Use this for stable actor fields like name, biography, notes, profile data, and other public Document.update-compatible changes.',
        inputSchema: {
          type: 'object',
          properties: {
            actorIdentifier: {
              type: 'string',
              description: 'Character name or ID to update',
            },
            updates: {
              type: 'object',
              description: 'Differential actor update payload passed to Document.update',
            },
            reason: {
              type: 'string',
              description: 'Optional audit reason for the change',
            },
          },
          required: ['actorIdentifier', 'updates'],
        },
      },
      {
        name: 'update-character-resources',
        description:
          'Update common character resources using a safer typed surface. Supports hit points generically, plus DnD5e-specific resources like inspiration, exhaustion, death saves, currency, and class hit dice.',
        inputSchema: {
          type: 'object',
          properties: {
            actorIdentifier: {
              type: 'string',
              description: 'Character name or ID',
            },
            hitPoints: {
              type: 'object',
              properties: {
                current: { type: 'number' },
                max: { type: 'number' },
                temp: { type: 'number' },
              },
              description: 'Optional hit point updates',
            },
            inspiration: {
              type: 'boolean',
              description: 'DnD5e only: whether the actor currently has inspiration',
            },
            exhaustion: {
              type: 'number',
              description: 'DnD5e only: exhaustion level',
            },
            deathSaves: {
              type: 'object',
              properties: {
                success: { type: 'number' },
                failure: { type: 'number' },
              },
              description: 'DnD5e only: death save success and failure counters',
            },
            currency: {
              type: 'object',
              description:
                'DnD5e only: currency updates keyed by denomination, for example { gp: 120, sp: 5 }',
            },
            hitDice: {
              type: 'array',
              description:
                'DnD5e only: optional per-class hit dice usage updates, keyed by owned class item name or ID',
              items: {
                type: 'object',
                properties: {
                  classIdentifier: { type: 'string' },
                  used: { type: 'number' },
                },
                required: ['classIdentifier', 'used'],
              },
            },
            reason: {
              type: 'string',
              description: 'Optional audit reason for the change',
            },
          },
          required: ['actorIdentifier'],
        },
      },
      {
        name: 'set-character-ability-scores',
        description:
          'Set base character ability scores using system-aware actor paths. Currently supports DnD5e and PF2e directly.',
        inputSchema: {
          type: 'object',
          properties: {
            actorIdentifier: {
              type: 'string',
              description: 'Character name or ID',
            },
            scores: {
              type: 'object',
              description:
                'Ability score assignments keyed by ability slug, for example { str: 18, dex: 14 }',
            },
            reason: {
              type: 'string',
              description: 'Optional audit reason for the change',
            },
          },
          required: ['actorIdentifier', 'scores'],
        },
      },
      {
        name: 'set-character-skill-proficiencies',
        description:
          'Set character skill proficiency values using system-aware actor paths. DnD5e uses the standard proficiency multiplier field, while PF2e uses rank values.',
        inputSchema: {
          type: 'object',
          properties: {
            actorIdentifier: {
              type: 'string',
              description: 'Character name or ID',
            },
            skills: {
              type: 'array',
              description:
                'Skill proficiency updates, for example [{ skill: "acr", proficiency: 1 }] or PF2e ranks [{ skill: "acrobatics", proficiency: 2 }]',
              items: {
                type: 'object',
                properties: {
                  skill: { type: 'string' },
                  proficiency: { type: 'number' },
                },
                required: ['skill', 'proficiency'],
              },
            },
            reason: {
              type: 'string',
              description: 'Optional audit reason for the change',
            },
          },
          required: ['actorIdentifier', 'skills'],
        },
      },
      {
        name: 'batch-update-character-items',
        description:
          'Apply multiple owned item updates to a character in one audited batch. Useful when a rebuild or rest workflow needs to touch several embedded items together.',
        inputSchema: {
          type: 'object',
          properties: {
            actorIdentifier: {
              type: 'string',
              description: 'Character name or ID',
            },
            updates: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  itemIdentifier: { type: 'string' },
                  itemType: { type: 'string' },
                  updates: { type: 'object' },
                },
                required: ['itemIdentifier', 'updates'],
              },
              description: 'Owned item updates to apply in one batch',
            },
            reason: {
              type: 'string',
              description: 'Optional audit reason for the change',
            },
          },
          required: ['actorIdentifier', 'updates'],
        },
      },
      {
        name: 'apply-character-patch-transaction',
        description:
          'Apply a transactional character patch across actor fields and owned item changes with automatic rollback if a later step fails. Supports validation-only mode before making changes.',
        inputSchema: {
          type: 'object',
          properties: {
            actorIdentifier: {
              type: 'string',
              description: 'Character name or ID',
            },
            actorUpdates: {
              type: 'object',
              description:
                'Optional differential actor update payload. Transactional patches only support stable existing paths so rollback can restore the original values.',
            },
            createItems: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  sourceUuid: { type: 'string' },
                  itemData: { type: 'object' },
                  overrides: { type: 'object' },
                  itemType: { type: 'string' },
                },
              },
              description:
                'Optional owned items to create from a source UUID or raw itemData payload during the same transaction.',
            },
            updateItems: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  itemIdentifier: { type: 'string' },
                  itemType: { type: 'string' },
                  updates: { type: 'object' },
                },
                required: ['itemIdentifier', 'updates'],
              },
              description: 'Optional owned item updates to apply transactionally.',
            },
            deleteItems: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  itemIdentifier: { type: 'string' },
                  itemType: { type: 'string' },
                },
                required: ['itemIdentifier'],
              },
              description: 'Optional owned items to delete transactionally.',
            },
            validateOnly: {
              type: 'boolean',
              description:
                'When true, validate all requested operations and return the planned mutation summary without applying any changes.',
            },
            reason: {
              type: 'string',
              description: 'Optional audit reason for the transaction',
            },
          },
          required: ['actorIdentifier'],
        },
      },
      {
        name: 'add-character-item',
        description:
          'Add an owned item to a character from a source UUID or raw item data. Useful for gear, feats, spells, features, and other embedded items.',
        inputSchema: {
          type: 'object',
          properties: {
            actorIdentifier: {
              type: 'string',
              description: 'Character name or ID to receive the item',
            },
            sourceUuid: {
              type: 'string',
              description: 'Compendium or world UUID of the source item to clone',
            },
            itemData: {
              type: 'object',
              description: 'Raw item data to create when no source UUID is available',
            },
            overrides: {
              type: 'object',
              description: 'Optional overrides merged into the item before creation',
            },
            itemType: {
              type: 'string',
              description: 'Optional expected item type validation, for example spell or feat',
            },
            reason: {
              type: 'string',
              description: 'Optional audit reason for the change',
            },
          },
          required: ['actorIdentifier'],
        },
      },
      {
        name: 'add-dnd5e-class-to-character',
        description:
          'DnD5e only: add a new class item to a character for multiclassing, then run the initial level-up flow for that class using explicit advancementSelections and safe automatic follow-up steps when available.',
        inputSchema: {
          type: 'object',
          properties: {
            characterIdentifier: {
              type: 'string',
              description: 'Character name or ID to receive the new class',
            },
            classUuid: {
              type: 'string',
              description: 'Compendium or world UUID of the DnD5e class item to add',
            },
            targetLevel: {
              type: 'number',
              description:
                'Target level for the newly added class. Defaults to 1 for the initial multiclass add workflow.',
            },
            advancementSelections: {
              type: 'array',
              description:
                'Optional progression choices to apply during the initial class advancement flow, using the same structure as update-character-progression.',
              items: {
                type: 'object',
                properties: {
                  stepId: { type: 'string' },
                  stepType: { type: 'string' },
                  sourceItemId: { type: 'string' },
                  sourceItemName: { type: 'string' },
                  choice: { type: 'object' },
                },
                required: ['choice'],
              },
            },
            reason: {
              type: 'string',
              description: 'Optional audit reason for the change',
            },
          },
          required: ['characterIdentifier', 'classUuid'],
        },
      },
      {
        name: 'complete-dnd5e-multiclass-entry-workflow',
        description:
          'DnD5e only: add or resume a multiclass entry workflow, complete the initial class advancement flow, reconcile multiclass spellbook state, and validate the final build with one workflow contract.',
        inputSchema: {
          type: 'object',
          properties: {
            characterIdentifier: {
              type: 'string',
              description: 'Character name or ID that is entering a new DnD5e class',
            },
            classUuid: {
              type: 'string',
              description:
                'Compendium or world UUID of the DnD5e class item to add on the first run. Provide exactly one of classUuid or classIdentifier.',
            },
            classIdentifier: {
              type: 'string',
              description:
                'Existing owned DnD5e class item name or ID to resume a previously started multiclass entry workflow. Provide exactly one of classUuid or classIdentifier.',
            },
            targetLevel: {
              type: 'number',
              description:
                'Target level for the newly added class. Defaults to 1 for the initial multiclass entry workflow.',
            },
            advancementSelections: createAdvancementSelectionsInputSchema(
              'Optional progression choices to apply during the class-entry advancement flow.'
            ),
            sourceClassAssignments: {
              type: 'array',
              description:
                'Optional explicit spell-to-class assignments to apply if the new multiclass entry creates multiclass spellbook ambiguity.',
              items: {
                type: 'object',
                properties: {
                  spellIdentifier: { type: 'string' },
                  classIdentifier: { type: 'string' },
                },
                required: ['spellIdentifier', 'classIdentifier'],
              },
            },
            spellPreparationPlans: createSpellPreparationPlansInputSchema(
              'Optional spell preparation plans to apply after the class entry progression completes.'
            ),
            autoFixSourceClasses: {
              type: 'boolean',
              description:
                'When true, safely auto-assign source classes during the spellbook reconciliation phase.',
            },
            autoFixPreparationMismatches: {
              type: 'boolean',
              description:
                'When true, safely auto-fix preparation mismatches during the spellbook reconciliation phase.',
            },
            optionQuery: {
              type: 'string',
              description:
                'Optional filter text when collecting pending advancement options for unresolved multiclass entry steps.',
            },
            optionLimit: {
              type: 'number',
              description:
                'Maximum number of pending advancement options to fetch per unresolved step.',
            },
            reason: {
              type: 'string',
              description: 'Optional audit reason for the multiclass entry workflow',
            },
          },
          required: ['characterIdentifier'],
        },
      },
      {
        name: 'update-character-item',
        description:
          'Update an owned character item by name or ID. Useful for quantity, equipped state, prepared state, and other item-level fields.',
        inputSchema: {
          type: 'object',
          properties: {
            actorIdentifier: {
              type: 'string',
              description: 'Character name or ID',
            },
            itemIdentifier: {
              type: 'string',
              description: 'Owned item name or ID',
            },
            itemType: {
              type: 'string',
              description: 'Optional item type filter, for example spell or weapon',
            },
            updates: {
              type: 'object',
              description: 'Update payload applied to the owned item document',
            },
            reason: {
              type: 'string',
              description: 'Optional audit reason for the change',
            },
          },
          required: ['actorIdentifier', 'itemIdentifier', 'updates'],
        },
      },
      {
        name: 'remove-character-item',
        description: 'Remove an owned item from a character by name or ID.',
        inputSchema: {
          type: 'object',
          properties: {
            actorIdentifier: {
              type: 'string',
              description: 'Character name or ID',
            },
            itemIdentifier: {
              type: 'string',
              description: 'Owned item name or ID',
            },
            itemType: {
              type: 'string',
              description: 'Optional item type filter, for example spell or feat',
            },
            reason: {
              type: 'string',
              description: 'Optional audit reason for the change',
            },
          },
          required: ['actorIdentifier', 'itemIdentifier'],
        },
      },
      {
        name: 'learn-dnd5e-spell',
        description:
          'DnD5e only: add a spell to a character from a spell UUID and optionally set whether it starts prepared or which class spell list it belongs to.',
        inputSchema: {
          type: 'object',
          properties: {
            actorIdentifier: {
              type: 'string',
              description: 'Character name or ID',
            },
            spellUuid: {
              type: 'string',
              description: 'Compendium or world UUID of the spell to add',
            },
            prepared: {
              type: 'boolean',
              description: 'Whether the new spell should start prepared',
            },
            sourceClass: {
              type: 'string',
              description: 'Optional source class identifier or name for multiclass spellbooks',
            },
            reason: {
              type: 'string',
              description: 'Optional audit reason for the change',
            },
          },
          required: ['actorIdentifier', 'spellUuid'],
        },
      },
      {
        name: 'prepare-dnd5e-spell',
        description: 'DnD5e only: prepare or unprepare a spell on a character.',
        inputSchema: {
          type: 'object',
          properties: {
            actorIdentifier: {
              type: 'string',
              description: 'Character name or ID',
            },
            spellIdentifier: {
              type: 'string',
              description: 'Owned spell name or ID',
            },
            prepared: {
              type: 'boolean',
              description: 'True to prepare the spell, false to unprepare it',
            },
            reason: {
              type: 'string',
              description: 'Optional audit reason for the change',
            },
          },
          required: ['actorIdentifier', 'spellIdentifier', 'prepared'],
        },
      },
      {
        name: 'forget-dnd5e-spell',
        description: 'DnD5e only: remove a spell from a character by name or ID.',
        inputSchema: {
          type: 'object',
          properties: {
            actorIdentifier: {
              type: 'string',
              description: 'Character name or ID',
            },
            spellIdentifier: {
              type: 'string',
              description: 'Owned spell name or ID',
            },
            reason: {
              type: 'string',
              description: 'Optional audit reason for the change',
            },
          },
          required: ['actorIdentifier', 'spellIdentifier'],
        },
      },
      {
        name: 'set-dnd5e-spell-slots',
        description:
          'DnD5e only: update current spell slot counts and optional slot overrides for a character.',
        inputSchema: {
          type: 'object',
          properties: {
            actorIdentifier: {
              type: 'string',
              description: 'Character name or ID',
            },
            slot: {
              type: 'string',
              enum: [
                'level1',
                'level2',
                'level3',
                'level4',
                'level5',
                'level6',
                'level7',
                'level8',
                'level9',
                'pact',
              ],
              description: 'The DnD5e spell slot track to update',
            },
            value: {
              type: 'number',
              description: 'Optional current remaining slot count',
            },
            override: {
              type: ['number', 'null'],
              description: 'Optional explicit slot max override, or null to clear it',
            },
            reason: {
              type: 'string',
              description: 'Optional audit reason for the change',
            },
          },
          required: ['actorIdentifier', 'slot'],
        },
      },
      {
        name: 'set-dnd5e-proficiencies',
        description:
          'DnD5e only: set actor proficiency collections such as languages, weapon proficiencies, armor proficiencies, tool proficiencies, and saving throw proficiencies.',
        inputSchema: {
          type: 'object',
          properties: {
            actorIdentifier: {
              type: 'string',
              description: 'Character name or ID',
            },
            languages: {
              type: 'object',
              properties: {
                values: {
                  type: 'array',
                  items: { type: 'string' },
                },
                custom: {
                  type: 'string',
                },
              },
              description: 'Replacement language proficiency values and optional custom text',
            },
            weaponProficiencies: {
              type: 'object',
              properties: {
                values: {
                  type: 'array',
                  items: { type: 'string' },
                },
                custom: {
                  type: 'string',
                },
              },
              description: 'Replacement weapon proficiency values and optional custom text',
            },
            armorProficiencies: {
              type: 'object',
              properties: {
                values: {
                  type: 'array',
                  items: { type: 'string' },
                },
                custom: {
                  type: 'string',
                },
              },
              description: 'Replacement armor proficiency values and optional custom text',
            },
            toolProficiencies: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  tool: { type: 'string' },
                  proficiency: { type: 'number' },
                },
                required: ['tool', 'proficiency'],
              },
              description:
                'Per-tool proficiency updates keyed by DnD5e tool IDs, using proficiency values such as 0, 0.5, 1, or 2',
            },
            savingThrowProficiencies: {
              type: 'array',
              items: { type: 'string' },
              description:
                'Ability slugs with saving throw proficiency, for example ["wis", "cha"]',
            },
            reason: {
              type: 'string',
              description: 'Optional audit reason for the change',
            },
          },
          required: ['actorIdentifier'],
        },
      },
      {
        name: 'reassign-dnd5e-spell-source-class',
        description:
          'DnD5e only: reassign a spell on a character to a specific spellcasting class for multiclass spellbook organization.',
        inputSchema: {
          type: 'object',
          properties: {
            actorIdentifier: {
              type: 'string',
              description: 'Character name or ID',
            },
            spellIdentifier: {
              type: 'string',
              description: 'Owned spell name or ID',
            },
            classIdentifier: {
              type: 'string',
              description: 'Owned class item name or ID to assign as the spell source',
            },
            reason: {
              type: 'string',
              description: 'Optional audit reason for the change',
            },
          },
          required: ['actorIdentifier', 'spellIdentifier', 'classIdentifier'],
        },
      },
      {
        name: 'validate-dnd5e-spellbook',
        description:
          'DnD5e only: inspect a character spellbook for source-class mismatches, preparation-mode issues, and other spell state or organizational problems.',
        inputSchema: {
          type: 'object',
          properties: {
            actorIdentifier: {
              type: 'string',
              description: 'Character name or ID',
            },
          },
          required: ['actorIdentifier'],
        },
      },
      {
        name: 'validate-dnd5e-character-build',
        description:
          'DnD5e only: validate a character build for class-level issues, spellbook problems, invalid proficiency values, and unresolved advancement steps at the current build state.',
        inputSchema: {
          type: 'object',
          properties: {
            actorIdentifier: {
              type: 'string',
              description: 'Character name or ID',
            },
          },
          required: ['actorIdentifier'],
        },
      },
      {
        name: 'bulk-reassign-dnd5e-spell-source-class',
        description:
          'DnD5e only: reassign multiple spells to concrete spellcasting classes in one audited batch operation.',
        inputSchema: {
          type: 'object',
          properties: {
            actorIdentifier: {
              type: 'string',
              description: 'Character name or ID',
            },
            assignments: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  spellIdentifier: {
                    type: 'string',
                    description: 'Owned spell name or ID',
                  },
                  classIdentifier: {
                    type: 'string',
                    description: 'Owned class item name or ID to assign as the spell source',
                  },
                },
                required: ['spellIdentifier', 'classIdentifier'],
              },
              description: 'Spell-to-class assignments to apply as one batch update',
            },
            reason: {
              type: 'string',
              description: 'Optional audit reason for the change',
            },
          },
          required: ['actorIdentifier', 'assignments'],
        },
      },
      {
        name: 'set-dnd5e-prepared-spells',
        description:
          'DnD5e only: bulk manage prepared spells. Use replace mode to set the prepared spell list after a rest, or prepare/unprepare modes for patch-style updates.',
        inputSchema: {
          type: 'object',
          properties: {
            actorIdentifier: {
              type: 'string',
              description: 'Character name or ID',
            },
            mode: {
              type: 'string',
              enum: ['replace', 'prepare', 'unprepare'],
              description:
                'replace resets prepared flags within the target spellbook scope, while prepare/unprepare only patch the listed spells',
            },
            spellIdentifiers: {
              type: 'array',
              items: { type: 'string' },
              description: 'Owned spell names or IDs affected by the operation',
            },
            sourceClass: {
              type: 'string',
              description:
                'Optional source class name or ID to scope the spellbook, strongly recommended for multiclass prepared casters',
            },
            reason: {
              type: 'string',
              description: 'Optional audit reason for the change',
            },
          },
          required: ['actorIdentifier', 'mode', 'spellIdentifiers'],
        },
      },
      {
        name: 'run-dnd5e-rest-workflow',
        description:
          'DnD5e only: run a short-rest or long-rest workflow through the system rest API, then optionally apply post-rest spell preparation plans for prepared casters in the same MCP call.',
        inputSchema: {
          type: 'object',
          properties: {
            actorIdentifier: {
              type: 'string',
              description: 'Character name or ID',
            },
            restType: {
              type: 'string',
              enum: ['short', 'long'],
              description: 'Which DnD5e rest workflow to run',
            },
            suppressChat: {
              type: 'boolean',
              description:
                'Suppress chat output where the underlying rest workflow supports it. Defaults to true for MCP.',
            },
            newDay: {
              type: 'boolean',
              description:
                'Optional DnD5e long-rest flag for advancing to a new day when the system rest API supports it.',
            },
            spellPreparationPlans: {
              ...createSpellPreparationPlansInputSchema(
                'Optional post-rest spell preparation operations to apply after the rest succeeds.'
              ),
            },
            reason: {
              type: 'string',
              description: 'Optional audit reason for the rest workflow',
            },
          },
          required: ['actorIdentifier', 'restType'],
        },
      },
      {
        name: 'run-dnd5e-group-rest-workflow',
        description:
          'DnD5e only: orchestrate short or long rests across a party or explicit character list, then optionally apply per-actor post-rest spell preparation plans and return a structured group summary.',
        inputSchema: {
          type: 'object',
          properties: {
            restTarget: {
              type: 'string',
              enum: ['party-characters', 'explicit-characters'],
              description:
                'party-characters rests the current player-owned party roster. explicit-characters only rests the listed characterIdentifiers.',
            },
            groupIdentifier: {
              type: 'string',
              description: 'Optional DnD5e group actor name or ID for workflow reporting context.',
            },
            characterIdentifiers: {
              type: 'array',
              items: { type: 'string' },
              description:
                'Required when restTarget is explicit-characters. Character names or IDs to include in the group rest.',
            },
            restType: {
              type: 'string',
              enum: ['short', 'long'],
              description: 'Which DnD5e rest workflow to run for each targeted character',
            },
            suppressChat: {
              type: 'boolean',
              description:
                'Suppress chat output where the underlying rest workflow supports it. Defaults to true for MCP.',
            },
            newDay: {
              type: 'boolean',
              description:
                'Optional DnD5e long-rest flag for advancing to a new day when the system rest API supports it.',
            },
            spellPreparationPlansByActor: {
              type: 'array',
              description:
                'Optional per-actor post-rest spell preparation plans keyed by actor name or ID.',
              items: {
                type: 'object',
                properties: {
                  actorIdentifier: {
                    type: 'string',
                    description: 'Character name or ID that should receive the preparation plans',
                  },
                  spellPreparationPlans: createSpellPreparationPlansInputSchema(
                    'Post-rest spell preparation plans for this actor.'
                  ),
                },
                required: ['actorIdentifier', 'spellPreparationPlans'],
              },
            },
            continueOnError: {
              type: 'boolean',
              description:
                'When true, continue attempting rests for the remaining characters even if one actor workflow fails. Defaults to true.',
            },
            reason: {
              type: 'string',
              description: 'Optional audit reason for the group rest workflow',
            },
          },
          required: ['restType'],
        },
      },
      {
        name: 'create-character-companion',
        description:
          'Link a persistent companion or familiar actor to an owner character. Supports cloning a compendium actor or linking an existing world actor, and can optionally place the companion on the current scene. This is not for standalone character or NPC creation.',
        inputSchema: {
          type: 'object',
          properties: {
            ownerActorIdentifier: {
              type: 'string',
              description: 'Character name or ID that owns the companion',
            },
            role: {
              type: 'string',
              enum: ['companion', 'familiar'],
              description: 'Relationship role for the linked actor',
            },
            sourceUuid: {
              type: 'string',
              description: 'Compendium Actor UUID to clone into the world as the companion',
            },
            existingActorIdentifier: {
              type: 'string',
              description: 'Existing world actor name or ID to link instead of cloning a new one',
            },
            customName: {
              type: 'string',
              description: 'Optional custom actor name when cloning from a source UUID',
            },
            addToScene: {
              type: 'boolean',
              description: 'Whether to place the linked companion on the current scene immediately',
            },
            placement: {
              type: 'object',
              properties: {
                type: {
                  type: 'string',
                  enum: ['near-owner', 'random', 'grid', 'center', 'coordinates'],
                },
                coordinates: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      x: { type: 'number' },
                      y: { type: 'number' },
                    },
                    required: ['x', 'y'],
                  },
                },
              },
            },
            syncOwnership: {
              type: 'boolean',
              description:
                'Whether to copy the owner character ownership settings onto the companion actor',
            },
            notes: {
              type: 'string',
              description: 'Optional notes stored with the companion link metadata',
            },
          },
          required: ['ownerActorIdentifier', 'role'],
        },
      },
      {
        name: 'list-character-companions',
        description:
          'List persistent companions and familiars linked to a character, including whether they currently have tokens on the active scene.',
        inputSchema: {
          type: 'object',
          properties: {
            ownerActorIdentifier: {
              type: 'string',
              description: 'Character name or ID',
            },
            role: {
              type: 'string',
              enum: ['companion', 'familiar'],
              description: 'Optional role filter',
            },
          },
          required: ['ownerActorIdentifier'],
        },
      },
      {
        name: 'summon-character-companion',
        description:
          'Place a linked companion or familiar on the active scene. By default it reuses existing tokens and prefers near-owner placement.',
        inputSchema: {
          type: 'object',
          properties: {
            ownerActorIdentifier: {
              type: 'string',
              description: 'Character name or ID that owns the companion',
            },
            companionIdentifier: {
              type: 'string',
              description: 'Linked companion actor name or ID',
            },
            placementType: {
              type: 'string',
              enum: ['near-owner', 'random', 'grid', 'center', 'coordinates'],
              description: 'Placement strategy for the summoned companion token',
            },
            coordinates: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  x: { type: 'number' },
                  y: { type: 'number' },
                },
                required: ['x', 'y'],
              },
            },
            hidden: {
              type: 'boolean',
              description: 'Whether the created token should be hidden',
            },
            reuseExisting: {
              type: 'boolean',
              description: 'Return existing scene tokens instead of placing another token',
            },
          },
          required: ['ownerActorIdentifier', 'companionIdentifier'],
        },
      },
      {
        name: 'dismiss-character-companion',
        description:
          'Remove linked companion or familiar tokens from the active scene. By default this targets one linked companion, or dismissAll can remove every linked companion token for the character.',
        inputSchema: {
          type: 'object',
          properties: {
            ownerActorIdentifier: {
              type: 'string',
              description: 'Character name or ID',
            },
            companionIdentifier: {
              type: 'string',
              description: 'Optional linked companion actor name or ID',
            },
            role: {
              type: 'string',
              enum: ['companion', 'familiar'],
              description: 'Optional role filter when dismissing multiple linked companions',
            },
            dismissAll: {
              type: 'boolean',
              description: 'Dismiss all linked companion tokens for the owner on the active scene',
            },
          },
          required: ['ownerActorIdentifier'],
        },
      },
      {
        name: 'update-character-companion-link',
        description:
          'Update persistent companion or familiar link metadata such as role, notes, source UUID, and sync settings.',
        inputSchema: {
          type: 'object',
          properties: {
            ownerActorIdentifier: {
              type: 'string',
              description: 'Character name or ID',
            },
            companionIdentifier: {
              type: 'string',
              description: 'Linked companion actor name or ID',
            },
            role: {
              type: 'string',
              enum: ['companion', 'familiar'],
            },
            notes: {
              type: 'string',
              description: 'Optional notes for the link. Empty string clears notes.',
            },
            sourceUuid: {
              type: 'string',
              description:
                'Optional source Actor UUID used for future refresh/sync operations. Empty string clears the stored source UUID.',
            },
            syncSettings: {
              type: 'object',
              properties: {
                syncOwnership: { type: 'boolean' },
                refreshFromSource: { type: 'boolean' },
                matchOwnerLevel: { type: 'boolean' },
                levelOffset: { type: 'number' },
              },
            },
          },
          required: ['ownerActorIdentifier', 'companionIdentifier'],
        },
      },
      {
        name: 'configure-character-companion-summon',
        description:
          'Save default summon behavior for a linked companion or familiar, including placement, hidden state, and token reuse.',
        inputSchema: {
          type: 'object',
          properties: {
            ownerActorIdentifier: {
              type: 'string',
              description: 'Character name or ID',
            },
            companionIdentifier: {
              type: 'string',
              description: 'Linked companion actor name or ID',
            },
            placementType: {
              type: 'string',
              enum: ['near-owner', 'random', 'grid', 'center', 'coordinates'],
            },
            coordinates: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  x: { type: 'number' },
                  y: { type: 'number' },
                },
                required: ['x', 'y'],
              },
            },
            hidden: {
              type: 'boolean',
            },
            reuseExisting: {
              type: 'boolean',
            },
          },
          required: ['ownerActorIdentifier', 'companionIdentifier'],
        },
      },
      {
        name: 'unlink-character-companion',
        description:
          'Remove a persistent companion or familiar link from a character without deleting the linked actor.',
        inputSchema: {
          type: 'object',
          properties: {
            ownerActorIdentifier: {
              type: 'string',
              description: 'Character name or ID',
            },
            companionIdentifier: {
              type: 'string',
              description: 'Linked companion actor name or ID',
            },
          },
          required: ['ownerActorIdentifier', 'companionIdentifier'],
        },
      },
      {
        name: 'delete-character-companion',
        description:
          'Delete a linked companion or familiar actor and optionally dismiss its scene tokens as part of the same audited workflow.',
        inputSchema: {
          type: 'object',
          properties: {
            ownerActorIdentifier: {
              type: 'string',
              description: 'Character name or ID',
            },
            companionIdentifier: {
              type: 'string',
              description: 'Linked companion actor name or ID',
            },
            dismissSceneTokens: {
              type: 'boolean',
              description:
                'Dismiss active scene tokens before deleting the actor. Defaults to true.',
            },
          },
          required: ['ownerActorIdentifier', 'companionIdentifier'],
        },
      },
      {
        name: 'sync-character-companion-progression',
        description:
          'Run configured companion sync operations such as ownership sync, source refresh, or matching the owner level on systems that expose a stable level field.',
        inputSchema: {
          type: 'object',
          properties: {
            ownerActorIdentifier: {
              type: 'string',
              description: 'Character name or ID',
            },
            companionIdentifier: {
              type: 'string',
              description: 'Linked companion actor name or ID',
            },
            syncOwnership: {
              type: 'boolean',
            },
            refreshFromSource: {
              type: 'boolean',
            },
            matchOwnerLevel: {
              type: 'boolean',
            },
            levelOffset: {
              type: 'number',
              description: 'Optional level offset when matchOwnerLevel is used',
            },
          },
          required: ['ownerActorIdentifier', 'companionIdentifier'],
        },
      },
      {
        name: 'preview-character-progression',
        description:
          'Preview a progression update before applying it. For DnD5e this returns pending advancement steps, source items, and required choices when the class level change is managed by the system workflow.',
        inputSchema: {
          type: 'object',
          properties: {
            characterIdentifier: {
              type: 'string',
              description: 'Character name or ID to preview',
            },
            targetLevel: {
              type: 'number',
              description: 'Target level when the active system supports direct level updates',
            },
            classIdentifier: {
              type: 'string',
              description:
                'DnD5e only: class item name or ID. Required for multiclass characters and recommended for explicit class targeting.',
            },
            experiencePoints: {
              type: 'number',
              description: 'Direct experience/AP total for systems that use it',
            },
            experienceSpent: {
              type: 'number',
              description: 'Optional spent experience/AP value for systems that track it',
            },
          },
          required: ['characterIdentifier'],
        },
      },
      {
        name: 'get-character-advancement-options',
        description:
          'Get concrete options for a specific pending advancement step. For DnD5e this can return ASI/feat candidates, subclass options, item-choice pools, item-grant defaults, hit point mode choices, trait options, or size choices when the active step exposes them.',
        inputSchema: {
          type: 'object',
          properties: {
            characterIdentifier: {
              type: 'string',
              description: 'Character name or ID to inspect',
            },
            targetLevel: {
              type: 'number',
              description: 'The level-up target used for the preview context',
            },
            stepId: {
              type: 'string',
              description:
                'The pending advancement step ID returned by preview-character-progression',
            },
            classIdentifier: {
              type: 'string',
              description: 'DnD5e only: class item name or ID for multiclass targeting',
            },
            query: {
              type: 'string',
              description: 'Optional text filter for large option sets such as feats or subclasses',
            },
            limit: {
              type: 'number',
              description: 'Optional maximum number of options to return',
            },
          },
          required: ['characterIdentifier', 'targetLevel', 'stepId'],
        },
      },
      {
        name: 'apply-character-advancement-choice',
        description:
          'Apply a specific character advancement choice. For DnD5e this supports ability-score improvements, feat selections, subclass choices, hit point mode, item-choice/item-grant steps, supported trait selections, and supported size selections.',
        inputSchema: {
          type: 'object',
          properties: {
            characterIdentifier: {
              type: 'string',
              description: 'Character name or ID to update',
            },
            targetLevel: {
              type: 'number',
              description: 'The level-up target used for the preview context',
            },
            stepId: {
              type: 'string',
              description:
                'The pending advancement step ID returned by preview-character-progression',
            },
            classIdentifier: {
              type: 'string',
              description: 'DnD5e only: class item name or ID for multiclass targeting',
            },
            choice: {
              oneOf: [
                {
                  type: 'object',
                  properties: {
                    type: { const: 'ability-score-improvement' },
                    mode: { const: 'asi' },
                    assignments: {
                      type: 'object',
                      additionalProperties: { type: 'number' },
                      description:
                        'Ability score increases keyed by ability slug such as str or int',
                    },
                  },
                  required: ['type', 'mode', 'assignments'],
                },
                {
                  type: 'object',
                  properties: {
                    type: { const: 'ability-score-improvement' },
                    mode: { const: 'feat' },
                    featUuid: {
                      type: 'string',
                      description: 'Compendium UUID of the selected feat',
                    },
                  },
                  required: ['type', 'mode', 'featUuid'],
                },
                {
                  type: 'object',
                  properties: {
                    type: { const: 'subclass' },
                    subclassUuid: {
                      type: 'string',
                      description: 'Compendium UUID of the selected subclass',
                    },
                  },
                  required: ['type', 'subclassUuid'],
                },
                {
                  type: 'object',
                  properties: {
                    type: { const: 'hit-points' },
                    mode: {
                      enum: ['average', 'roll'],
                      description:
                        'Use the class average or roll the class hit die in the DnD5e advancement workflow',
                    },
                  },
                  required: ['type', 'mode'],
                },
                {
                  type: 'object',
                  properties: {
                    type: { const: 'item-choice' },
                    itemUuids: {
                      type: 'array',
                      items: { type: 'string' },
                      description: 'Compendium UUIDs of the selected items',
                    },
                    replaceItemId: {
                      type: 'string',
                      description: 'Optional existing actor item ID to replace',
                    },
                    ability: {
                      type: 'string',
                      description:
                        'Optional spellcasting ability override when supported by the step',
                    },
                  },
                  required: ['type', 'itemUuids'],
                },
                {
                  type: 'object',
                  properties: {
                    type: { const: 'item-grant' },
                    itemUuids: {
                      type: 'array',
                      items: { type: 'string' },
                      description:
                        'Optional explicit grant item UUIDs when the step allows selecting from multiple grants',
                    },
                    ability: {
                      type: 'string',
                      description:
                        'Optional spellcasting ability override when supported by the granted item step',
                    },
                  },
                  required: ['type'],
                },
                {
                  type: 'object',
                  properties: {
                    type: { const: 'trait' },
                    selected: {
                      type: 'array',
                      items: { type: 'string' },
                      description:
                        'Selected trait option identifiers returned by get-character-advancement-options',
                    },
                  },
                  required: ['type', 'selected'],
                },
                {
                  type: 'object',
                  properties: {
                    type: { const: 'size' },
                    size: {
                      type: 'string',
                      description:
                        'Selected size option identifier returned by get-character-advancement-options',
                    },
                  },
                  required: ['type', 'size'],
                },
              ],
            },
          },
          required: ['characterIdentifier', 'targetLevel', 'stepId', 'choice'],
        },
      },
      {
        name: 'update-character-progression',
        description:
          'Update character progression using system-aware adapter logic. Supports PF2e level updates, DSA5 AP/Erfahrungsgrad updates, and DnD5e class-level updates through owned class items, including explicit advancementSelections and safe automatic follow-up steps where supported.',
        inputSchema: {
          type: 'object',
          properties: {
            characterIdentifier: {
              type: 'string',
              description: 'Character name or ID to update',
            },
            targetLevel: {
              type: 'number',
              description: 'Target level when the active system supports direct level updates',
            },
            classIdentifier: {
              type: 'string',
              description:
                'DnD5e only: class item name or ID. Required for multiclass characters and recommended for explicit class targeting.',
            },
            experiencePoints: {
              type: 'number',
              description: 'Direct experience/AP total for systems that use it',
            },
            experienceSpent: {
              type: 'number',
              description: 'Optional spent experience/AP value for systems that track it',
            },
            advancementSelections: {
              ...createAdvancementSelectionsInputSchema(
                'Optional progression choices to auto-apply during the level-up flow when they match the actual pending advancement steps.'
              ),
            },
          },
          required: ['characterIdentifier'],
        },
      },
      {
        name: 'complete-dnd5e-level-up-workflow',
        description:
          'DnD5e only: run the full class level-up workflow by applying provided advancement selections, auto-running safe follow-up steps, returning enriched pending-step guidance when choices are still needed, and validating the finished build.',
        inputSchema: {
          type: 'object',
          properties: {
            characterIdentifier: {
              type: 'string',
              description: 'Character name or ID to level up',
            },
            targetLevel: {
              type: 'number',
              description: 'Target level for the chosen DnD5e class progression flow',
            },
            classIdentifier: {
              type: 'string',
              description:
                'Owned DnD5e class item name or ID. Required for multiclass characters and recommended for explicit class targeting.',
            },
            advancementSelections: {
              ...createAdvancementSelectionsInputSchema(
                'Optional progression choices to apply during the workflow. Matching selections are applied automatically before the final class-level update.'
              ),
            },
            optionQuery: {
              type: 'string',
              description:
                'Optional search query used when unresolved advancement steps support searchable option lists, such as feat selection.',
            },
            optionLimit: {
              type: 'number',
              description:
                'Maximum number of options to derive per unresolved advancement step when the workflow returns guided next-step data. Defaults to 25.',
            },
          },
          required: ['characterIdentifier', 'targetLevel'],
        },
      },
      {
        name: 'create-dnd5e-character-workflow',
        description:
          'DnD5e only: create a standalone player character or NPC from a compendium Actor UUID, then run DnD5e class progression to the requested target level, including subclass and spell choices when needed. Use this for requests like "create a level 3 sorcerer" or other DnD5e character builds. Do not use campaign or journal tools for character creation.',
        inputSchema: {
          type: 'object',
          properties: {
            sourceUuid: {
              type: 'string',
              description:
                'Compendium Actor UUID used as creation template, for example Compendium.dnd5e.heroes.Actor.2Pdtnswo8Nj2nafY. For a sorcerer workflow, pass a sorcerer actor template from a DnD5e Actor compendium.',
            },
            name: {
              type: 'string',
              description: 'Name for the created DnD5e actor',
            },
            targetLevel: {
              type: 'number',
              description: 'Target DnD5e class level to reach using the guided progression workflow',
            },
            classIdentifier: {
              type: 'string',
              description:
                'Optional class item name or ID for explicit class targeting. Recommended for multiclass characters and acceptable for single-class requests such as Sorcerer.',
            },
            advancementSelections: {
              ...createAdvancementSelectionsInputSchema(
                'Optional progression choices to apply during the level-up workflow, such as subclass picks, spell selections, and other required DnD5e advancement decisions.'
              ),
            },
            biography: {
              type: 'string',
              description: 'Optional biography text to write to system.details.biography.value',
            },
            addToScene: {
              type: 'boolean',
              description: 'Whether to place the actor on the current scene when created',
            },
            placement: {
              type: 'object',
              properties: {
                type: {
                  type: 'string',
                  enum: ['random', 'grid', 'center', 'coordinates'],
                },
                coordinates: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      x: { type: 'number' },
                      y: { type: 'number' },
                    },
                    required: ['x', 'y'],
                  },
                },
              },
            },
          },
          required: ['sourceUuid', 'name', 'targetLevel'],
        },
      },
      {
        name: 'award-dnd5e-party-resources',
        description:
          'DnD5e only: award XP and currency directly to characters, stage them on a primary party group actor for later distribution, or distribute staged party awards using the same split-versus-each semantics documented by the DnD5e award workflow.',
        inputSchema: {
          type: 'object',
          properties: {
            awardTarget: {
              type: 'string',
              enum: ['party-characters', 'explicit-characters', 'primary-party-group'],
              description:
                'party-characters awards all current player-owned character actors. explicit-characters awards only the listed characterIdentifiers. primary-party-group stages the award on a DnD5e group actor instead of distributing it to characters immediately.',
            },
            awardSource: {
              type: 'string',
              enum: ['new-award', 'staged-party-group'],
              description:
                'new-award uses the provided XP/currency totals as a fresh award. staged-party-group distributes from a staged party group balance and caps the grant by what the group actor currently has.',
            },
            partyIdentifier: {
              type: 'string',
              description:
                'Optional DnD5e group actor name or ID used for staged awards. Recommended when more than one group actor exists.',
            },
            characterIdentifiers: {
              type: 'array',
              items: { type: 'string' },
              description:
                'Required when awardTarget is explicit-characters. Each entry may be a character name or ID.',
            },
            distributionMode: {
              type: 'string',
              enum: ['split', 'each'],
              description:
                'split divides the total award across all destinations. each grants the full award to every destination, or caps each recipient proportionally when distributing from staged party resources.',
            },
            experiencePoints: {
              type: 'number',
              description: 'Optional XP total to distribute or stage.',
            },
            currency: {
              type: 'object',
              additionalProperties: { type: 'number' },
              description:
                'Optional currency totals keyed by DnD5e denomination, for example { gp: 500, sp: 25 }.',
            },
            validateCharacterBuilds: {
              type: 'boolean',
              description:
                'When true, validate each updated DnD5e character build after a character-facing award workflow completes. Defaults to true.',
            },
            reason: {
              type: 'string',
              description: 'Optional audit reason for the award workflow',
            },
          },
        },
      },
      {
        name: 'run-dnd5e-summon-activity',
        description:
          'DnD5e only: run a summon activity from an owned item using the system activity workflow, surface unresolved activity/profile choices when needed, and report the summoned tokens.',
        inputSchema: {
          type: 'object',
          properties: {
            actorIdentifier: {
              type: 'string',
              description: 'Character or actor name/ID that owns the summon-capable item.',
            },
            itemIdentifier: {
              type: 'string',
              description: 'Owned item name or ID that contains the DnD5e summon activity.',
            },
            activityIdentifier: {
              type: 'string',
              description:
                'Optional summon activity name or ID when the item exposes more than one summon activity.',
            },
            profileId: {
              type: 'string',
              description:
                'Optional summon profile name or ID when the selected summon activity exposes multiple profiles.',
            },
            placementType: {
              type: 'string',
              enum: ['near-owner', 'random', 'grid', 'center', 'coordinates'],
              description: 'Optional placement preference for the summoned tokens.',
            },
            coordinates: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  x: { type: 'number' },
                  y: { type: 'number' },
                },
                required: ['x', 'y'],
              },
              description:
                'Optional coordinates used when placementType is coordinates, or as a preferred placement hint for the summon workflow.',
            },
            hidden: {
              type: 'boolean',
              description: 'Whether the summoned tokens should be created hidden when supported.',
            },
            reason: {
              type: 'string',
              description: 'Optional audit reason for the summon workflow.',
            },
          },
          required: ['actorIdentifier', 'itemIdentifier'],
        },
      },
      {
        name: 'run-dnd5e-transform-activity-workflow',
        description:
          'DnD5e only: run a transform activity from an owned item using the system activity workflow, surface unresolved activity choices when needed, and report the transformation outcome.',
        inputSchema: {
          type: 'object',
          properties: {
            actorIdentifier: {
              type: 'string',
              description: 'Character or actor name/ID that owns the transform-capable item.',
            },
            itemIdentifier: {
              type: 'string',
              description: 'Owned item name or ID that contains the DnD5e transform activity.',
            },
            activityIdentifier: {
              type: 'string',
              description:
                'Optional transform activity name or ID when the item exposes more than one transform activity.',
            },
            reason: {
              type: 'string',
              description: 'Optional audit reason for the transform workflow.',
            },
          },
          required: ['actorIdentifier', 'itemIdentifier'],
        },
      },
      {
        name: 'organize-dnd5e-spellbook-workflow',
        description:
          'DnD5e only: validate and organize a character spellbook by applying explicit source-class or preparation fixes, auto-fixing only safe unambiguous source-class and preparation mismatches, then reporting any remaining issues.',
        inputSchema: {
          type: 'object',
          properties: {
            actorIdentifier: {
              type: 'string',
              description: 'Character name or ID whose spellbook should be organized.',
            },
            sourceClassAssignments: {
              type: 'array',
              description:
                'Optional explicit spell-to-class assignments to apply before the workflow attempts any safe automatic cleanup.',
              items: {
                type: 'object',
                properties: {
                  spellIdentifier: {
                    type: 'string',
                    description: 'Owned spell name or ID to reassign.',
                  },
                  classIdentifier: {
                    type: 'string',
                    description:
                      'Owned spellcasting class name or ID to assign as the spell source.',
                  },
                },
                required: ['spellIdentifier', 'classIdentifier'],
              },
            },
            spellPreparationPlans: {
              ...createSpellPreparationPlansInputSchema(
                'Optional prepared-spell cleanup operations to run after source-class fixes and before final validation.'
              ),
            },
            autoFixSourceClasses: {
              type: 'boolean',
              description:
                'When true, auto-assign source classes only for spells where the correct target is unambiguous. Defaults to true.',
            },
            autoFixPreparationMismatches: {
              type: 'boolean',
              description:
                'When true, auto-clear prepared flags for spells assigned to non-prepared spellcasting classes. Defaults to true.',
            },
            reason: {
              type: 'string',
              description: 'Optional audit reason for the spellbook organization workflow.',
            },
          },
          required: ['actorIdentifier'],
        },
      },
    ];
  }

  async handleGetCharacter(args: unknown): Promise<UnknownRecord> {
    return this.readService.handleGetCharacter(args);
  }

  async handleGetCharacterEntity(args: unknown): Promise<UnknownRecord> {
    return this.readService.handleGetCharacterEntity(args);
  }

  async handleListCharacters(args: unknown): Promise<UnknownRecord> {
    return this.readService.handleListCharacters(args);
  }

  async handleUseItem(args: unknown): Promise<UseItemResponse> {
    const schema = z.object({
      actorIdentifier: z.string().min(1, 'Actor identifier cannot be empty'),
      itemIdentifier: z.string().min(1, 'Item identifier cannot be empty'),
      targets: z.array(z.string()).optional(),
      consume: z.boolean().optional(),
      spellLevel: z.number().optional(),
      skipDialog: z.boolean().optional(),
    });

    const { actorIdentifier, itemIdentifier, targets, consume, spellLevel, skipDialog } =
      schema.parse(args);

    this.logger.info('Using item', {
      actorIdentifier,
      itemIdentifier,
      targets,
      consume,
      spellLevel,
      skipDialog,
    });

    try {
      const result = await this.foundryClient.query<UseItemResponse>(
        'maeinomatic-foundry-mcp.useItem',
        {
          actorIdentifier,
          itemIdentifier,
          targets,
          options: {
            consume: consume ?? true,
            spellLevel,
            skipDialog: skipDialog ?? true, // Default to skipping dialogs for MCP automation
          },
        }
      );

      this.logger.debug('Successfully used item', {
        actorName: result.actorName,
        itemName: result.itemName,
        targets: result.targets,
      });

      return result;
    } catch (error) {
      this.logger.error('Failed to use item', error);
      throw new Error(
        `Failed to use item "${itemIdentifier}": ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async handleSearchCharacterItems(args: unknown): Promise<FoundrySearchCharacterItemsResponse> {
    const schema = z.object({
      characterIdentifier: z.string().min(1, 'Character identifier cannot be empty'),
      query: z.string().optional(),
      type: z.string().optional(),
      category: z.string().optional(),
      limit: z.number().optional(),
    });

    const { characterIdentifier, query, type, category, limit } = schema.parse(args);

    this.logger.info('Searching character items', {
      characterIdentifier,
      query,
      type,
      category,
      limit,
    });

    try {
      const request = {
        characterIdentifier,
        ...(query !== undefined ? { query } : {}),
        ...(type !== undefined ? { type } : {}),
        ...(category !== undefined ? { category } : {}),
        limit: limit ?? 20,
      };
      const result = await this.foundryClient.query(
        'maeinomatic-foundry-mcp.searchCharacterItems',
        {
          ...request,
        }
      );

      this.logger.debug('Successfully searched character items', {
        characterName: result.characterName,
        matchCount: result.matches.length,
      });

      return result;
    } catch (error) {
      this.logger.error('Failed to search character items', error);
      throw new Error(
        `Failed to search items for "${characterIdentifier}": ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async handleUpdateCharacter(args: unknown): Promise<UnknownRecord> {
    const schema = z.object({
      actorIdentifier: z.string().min(1, 'Actor identifier cannot be empty'),
      updates: z.record(z.string(), z.unknown()),
      reason: z.string().min(1).optional(),
    });

    const parsed = schema.parse(args);

    this.logger.info('Updating character actor document', {
      actorIdentifier: parsed.actorIdentifier,
      fieldCount: Object.keys(parsed.updates).length,
    });

    const result = await this.foundryClient.query<FoundryUpdateActorResponse>(
      'maeinomatic-foundry-mcp.updateActor',
      {
        identifier: parsed.actorIdentifier,
        updates: parsed.updates,
        ...(parsed.reason !== undefined ? { reason: parsed.reason } : {}),
      }
    );

    return {
      success: true,
      actor: {
        id: result.actorId,
        name: result.actorName,
        type: result.actorType,
      },
      appliedUpdates: result.appliedUpdates,
      updatedFields: result.updatedFields,
    };
  }

  async handleUpdateCharacterResources(args: unknown): Promise<UnknownRecord> {
    const schema = z
      .object({
        actorIdentifier: z.string().min(1, 'Actor identifier cannot be empty'),
        hitPoints: z
          .object({
            current: z.number().optional(),
            max: z.number().optional(),
            temp: z.number().optional(),
          })
          .optional(),
        inspiration: z.boolean().optional(),
        exhaustion: z.number().int().nonnegative().optional(),
        deathSaves: z
          .object({
            success: z.number().int().nonnegative().optional(),
            failure: z.number().int().nonnegative().optional(),
          })
          .optional(),
        currency: z.record(z.string(), z.number()).optional(),
        hitDice: z
          .array(
            z.object({
              classIdentifier: z.string().min(1, 'classIdentifier cannot be empty'),
              used: z.number().int().nonnegative(),
            })
          )
          .optional(),
        reason: z.string().min(1).optional(),
      })
      .refine(
        value =>
          value.hitPoints !== undefined ||
          value.inspiration !== undefined ||
          value.exhaustion !== undefined ||
          value.deathSaves !== undefined ||
          value.currency !== undefined ||
          value.hitDice !== undefined,
        'Provide at least one resource update'
      );

    const parsed = schema.parse(args);
    const { adapter } = await this.getRequiredSystemAdapter('resource updates');
    const characterData = await this.getCharacterData(parsed.actorIdentifier);

    if (!adapter.prepareResourceUpdates) {
      throw new Error(
        'UNSUPPORTED_CAPABILITY: The active system adapter does not support typed resource updates.'
      );
    }

    const resourceRequest: CharacterResourceUpdateRequest = {};
    if (parsed.hitPoints !== undefined) {
      const hitPoints: CharacterResourceUpdateRequest['hitPoints'] = {};
      if (parsed.hitPoints.current !== undefined) {
        hitPoints.current = parsed.hitPoints.current;
      }
      if (parsed.hitPoints.max !== undefined) {
        hitPoints.max = parsed.hitPoints.max;
      }
      if (parsed.hitPoints.temp !== undefined) {
        hitPoints.temp = parsed.hitPoints.temp;
      }
      resourceRequest.hitPoints = hitPoints;
    }
    if (parsed.inspiration !== undefined) {
      resourceRequest.inspiration = parsed.inspiration;
    }
    if (parsed.exhaustion !== undefined) {
      resourceRequest.exhaustion = parsed.exhaustion;
    }
    if (parsed.deathSaves !== undefined) {
      const deathSaves: NonNullable<CharacterResourceUpdateRequest['deathSaves']> = {};
      if (parsed.deathSaves.success !== undefined) {
        deathSaves.success = parsed.deathSaves.success;
      }
      if (parsed.deathSaves.failure !== undefined) {
        deathSaves.failure = parsed.deathSaves.failure;
      }
      resourceRequest.deathSaves = deathSaves;
    }
    if (parsed.currency !== undefined) {
      resourceRequest.currency = parsed.currency;
    }
    if (parsed.hitDice !== undefined) {
      resourceRequest.hitDice = parsed.hitDice;
    }

    const mutation = adapter.prepareResourceUpdates(characterData, resourceRequest);

    const { actorResult, itemResult, warnings } = await this.applyPreparedWriteMutation({
      actorIdentifier: parsed.actorIdentifier,
      mutation,
      ...(parsed.reason !== undefined ? { reason: parsed.reason } : {}),
    });

    return {
      success: true,
      actor: {
        id: actorResult?.actorId ?? characterData.id,
        name: actorResult?.actorName ?? characterData.name,
        type: actorResult?.actorType ?? characterData.type,
      },
      ...(mutation.summary ? { resources: mutation.summary } : {}),
      ...(actorResult ? { updatedFields: actorResult.updatedFields } : {}),
      ...(itemResult
        ? {
            updatedItems: itemResult.updatedItems.map(item => ({
              id: item.itemId,
              name: item.itemName,
              type: item.itemType,
              updatedFields: item.updatedFields,
            })),
          }
        : {}),
      ...(warnings.length > 0 ? { warnings } : {}),
    };
  }

  async handleSetCharacterAbilityScores(args: unknown): Promise<UnknownRecord> {
    const schema = z.object({
      actorIdentifier: z.string().min(1, 'Actor identifier cannot be empty'),
      scores: z.record(z.string(), z.number().int().nonnegative()),
      reason: z.string().min(1).optional(),
    });

    const parsed = schema.parse(args);
    const { adapter } = await this.getRequiredSystemAdapter('ability score updates');
    const characterData = await this.getCharacterData(parsed.actorIdentifier);

    if (!adapter.prepareAbilityScoreUpdates) {
      throw new Error(
        'UNSUPPORTED_CAPABILITY: The active system adapter does not support direct ability score updates.'
      );
    }

    const mutation = adapter.prepareAbilityScoreUpdates(characterData, {
      scores: parsed.scores,
    } satisfies CharacterAbilityScoreUpdateRequest);

    const { actorResult, warnings } = await this.applyPreparedWriteMutation({
      actorIdentifier: parsed.actorIdentifier,
      mutation,
      ...(parsed.reason !== undefined ? { reason: parsed.reason } : {}),
    });

    return {
      success: true,
      actor: {
        id: actorResult?.actorId ?? characterData.id,
        name: actorResult?.actorName ?? characterData.name,
        type: actorResult?.actorType ?? characterData.type,
      },
      scores: parsed.scores,
      updatedFields: actorResult?.updatedFields ?? [],
      ...(warnings.length > 0 ? { warnings } : {}),
    };
  }

  async handleSetCharacterSkillProficiencies(args: unknown): Promise<UnknownRecord> {
    const schema = z.object({
      actorIdentifier: z.string().min(1, 'Actor identifier cannot be empty'),
      skills: z
        .array(
          z.object({
            skill: z.string().min(1, 'skill cannot be empty'),
            proficiency: z.number(),
          })
        )
        .min(1, 'Provide at least one skill proficiency update'),
      reason: z.string().min(1).optional(),
    });

    const parsed = schema.parse(args);
    const { adapter } = await this.getRequiredSystemAdapter('skill proficiency updates');
    const characterData = await this.getCharacterData(parsed.actorIdentifier);

    if (!adapter.prepareSkillProficiencyUpdates) {
      throw new Error(
        'UNSUPPORTED_CAPABILITY: The active system adapter does not support direct skill proficiency updates.'
      );
    }

    const mutation = adapter.prepareSkillProficiencyUpdates(characterData, {
      skills: parsed.skills,
    } satisfies CharacterSkillProficiencyUpdateRequest);

    const { actorResult, warnings } = await this.applyPreparedWriteMutation({
      actorIdentifier: parsed.actorIdentifier,
      mutation,
      ...(parsed.reason !== undefined ? { reason: parsed.reason } : {}),
    });

    return {
      success: true,
      actor: {
        id: actorResult?.actorId ?? characterData.id,
        name: actorResult?.actorName ?? characterData.name,
        type: actorResult?.actorType ?? characterData.type,
      },
      skills: parsed.skills,
      updatedFields: actorResult?.updatedFields ?? [],
      ...(warnings.length > 0 ? { warnings } : {}),
    };
  }

  async handleBatchUpdateCharacterItems(args: unknown): Promise<UnknownRecord> {
    const schema = z.object({
      actorIdentifier: z.string().min(1, 'Actor identifier cannot be empty'),
      updates: z
        .array(
          z.object({
            itemIdentifier: z.string().min(1, 'itemIdentifier cannot be empty'),
            itemType: z.string().min(1).optional(),
            updates: z.record(z.string(), z.unknown()),
          })
        )
        .min(1, 'Provide at least one item update'),
      reason: z.string().min(1).optional(),
    });

    const parsed = schema.parse(args);

    const request: FoundryBatchUpdateActorEmbeddedItemsRequest = {
      actorIdentifier: parsed.actorIdentifier,
      updates: parsed.updates.map(entry => ({
        itemIdentifier: entry.itemIdentifier,
        ...(entry.itemType !== undefined ? { itemType: entry.itemType } : {}),
        updates: entry.updates,
      })),
      ...(parsed.reason !== undefined ? { reason: parsed.reason } : {}),
    };

    const result = await this.foundryClient.query<FoundryBatchUpdateActorEmbeddedItemsResponse>(
      'maeinomatic-foundry-mcp.batchUpdateActorEmbeddedItems',
      request
    );

    return {
      success: true,
      actor: {
        id: result.actorId,
        name: result.actorName,
      },
      updatedCount: result.updatedItems.length,
      updatedItems: result.updatedItems.map(item => ({
        id: item.itemId,
        name: item.itemName,
        type: item.itemType,
        updatedFields: item.updatedFields,
      })),
    };
  }

  async handleApplyCharacterPatchTransaction(args: unknown): Promise<UnknownRecord> {
    const itemDataSchema = z
      .object({
        name: z.string().min(1, 'itemData.name cannot be empty'),
        type: z.string().min(1, 'itemData.type cannot be empty'),
        img: z.string().min(1).optional(),
        system: z.record(z.string(), z.unknown()).optional(),
        flags: z.record(z.string(), z.unknown()).optional(),
        effects: z.array(z.unknown()).optional(),
      })
      .passthrough();

    const schema = z
      .object({
        actorIdentifier: z.string().min(1, 'Actor identifier cannot be empty'),
        actorUpdates: z.record(z.string(), z.unknown()).optional(),
        createItems: z
          .array(
            z
              .object({
                sourceUuid: z.string().min(1).optional(),
                itemData: itemDataSchema.optional(),
                overrides: z.record(z.string(), z.unknown()).optional(),
                itemType: z.string().min(1).optional(),
              })
              .refine(
                value => (value.sourceUuid !== undefined) !== (value.itemData !== undefined),
                'Each createItems entry must provide exactly one of sourceUuid or itemData'
              )
          )
          .optional(),
        updateItems: z
          .array(
            z.object({
              itemIdentifier: z.string().min(1, 'itemIdentifier cannot be empty'),
              itemType: z.string().min(1).optional(),
              updates: z.record(z.string(), z.unknown()),
            })
          )
          .optional(),
        deleteItems: z
          .array(
            z.object({
              itemIdentifier: z.string().min(1, 'itemIdentifier cannot be empty'),
              itemType: z.string().min(1).optional(),
            })
          )
          .optional(),
        validateOnly: z.boolean().optional(),
        reason: z.string().min(1).optional(),
      })
      .refine(
        value =>
          value.actorUpdates !== undefined ||
          value.createItems !== undefined ||
          value.updateItems !== undefined ||
          value.deleteItems !== undefined,
        'Provide at least one actor or owned-item mutation'
      );

    const parsed = schema.parse(args);
    const normalizedCreateItems =
      parsed.createItems?.map(entry => ({
        ...(entry.sourceUuid !== undefined ? { sourceUuid: entry.sourceUuid } : {}),
        ...(entry.itemData !== undefined
          ? {
              itemData: Object.fromEntries(
                Object.entries(entry.itemData).filter(([, value]) => value !== undefined)
              ) as FoundryCreateActorEmbeddedItemData,
            }
          : {}),
        ...(entry.overrides !== undefined ? { overrides: entry.overrides } : {}),
        ...(entry.itemType !== undefined ? { itemType: entry.itemType } : {}),
      })) ?? undefined;

    const request: FoundryApplyCharacterPatchTransactionRequest = {
      actorIdentifier: parsed.actorIdentifier,
      ...(parsed.actorUpdates !== undefined ? { actorUpdates: parsed.actorUpdates } : {}),
      ...(normalizedCreateItems !== undefined ? { createItems: normalizedCreateItems } : {}),
      ...(parsed.updateItems !== undefined
        ? {
            updateItems: parsed.updateItems.map(entry => ({
              itemIdentifier: entry.itemIdentifier,
              ...(entry.itemType !== undefined ? { itemType: entry.itemType } : {}),
              updates: entry.updates,
            })),
          }
        : {}),
      ...(parsed.deleteItems !== undefined
        ? {
            deleteItems: parsed.deleteItems.map(entry => ({
              itemIdentifier: entry.itemIdentifier,
              ...(entry.itemType !== undefined ? { itemType: entry.itemType } : {}),
            })),
          }
        : {}),
      ...(parsed.validateOnly !== undefined ? { validateOnly: parsed.validateOnly } : {}),
      ...(parsed.reason !== undefined ? { reason: parsed.reason } : {}),
    };

    const result = await this.foundryClient.query<FoundryApplyCharacterPatchTransactionResponse>(
      'maeinomatic-foundry-mcp.applyCharacterPatchTransaction',
      request
    );

    return {
      success: result.success,
      transactionId: result.transactionId,
      actor: {
        id: result.actorId,
        name: result.actorName,
        type: result.actorType,
      },
      validateOnly: result.validateOnly,
      plannedOperations: result.plannedOperations,
      ...(result.actorUpdatedFields ? { actorUpdatedFields: result.actorUpdatedFields } : {}),
      ...(result.createdItems
        ? {
            createdItems: result.createdItems.map(item => ({
              id: item.itemId,
              name: item.itemName,
              type: item.itemType,
              createdFrom: item.createdFrom,
              ...(item.sourceUuid ? { sourceUuid: item.sourceUuid } : {}),
            })),
          }
        : {}),
      ...(result.updatedItems
        ? {
            updatedItems: result.updatedItems.map(item => ({
              id: item.itemId,
              name: item.itemName,
              type: item.itemType,
              updatedFields: item.updatedFields,
            })),
          }
        : {}),
      ...(result.deletedItems
        ? {
            deletedItems: result.deletedItems.map(item => ({
              id: item.itemId,
              name: item.itemName,
              type: item.itemType,
            })),
          }
        : {}),
      ...(result.rolledBack !== undefined ? { rolledBack: result.rolledBack } : {}),
      ...(result.rollbackErrors ? { rollbackErrors: result.rollbackErrors } : {}),
      ...(result.warnings ? { warnings: result.warnings } : {}),
    };
  }

  async handleSetDnD5eProficiencies(args: unknown): Promise<UnknownRecord> {
    const schema = z.object({
      actorIdentifier: z.string().min(1, 'Actor identifier cannot be empty'),
      languages: z
        .object({
          values: z.array(z.string().min(1)).optional(),
          custom: z.string().optional(),
        })
        .optional(),
      weaponProficiencies: z
        .object({
          values: z.array(z.string().min(1)).optional(),
          custom: z.string().optional(),
        })
        .optional(),
      armorProficiencies: z
        .object({
          values: z.array(z.string().min(1)).optional(),
          custom: z.string().optional(),
        })
        .optional(),
      toolProficiencies: z
        .array(
          z.object({
            tool: z.string().min(1, 'tool cannot be empty'),
            proficiency: z.number(),
          })
        )
        .optional(),
      savingThrowProficiencies: z.array(z.string().min(1)).optional(),
      reason: z.string().min(1).optional(),
    });

    const parsed = schema.parse(args);
    const gameSystem = await this.getGameSystem();
    if (gameSystem !== 'dnd5e') {
      throw new Error(
        'UNSUPPORTED_CAPABILITY: set-dnd5e-proficiencies is only available when the active system is dnd5e.'
      );
    }

    const { adapter } = await this.getRequiredSystemAdapter('DnD5e proficiency updates');
    const characterData = await this.getCharacterData(parsed.actorIdentifier);

    if (!adapter.prepareSystemProficiencyUpdates) {
      throw new Error(
        'UNSUPPORTED_CAPABILITY: The active system adapter does not support direct proficiency updates.'
      );
    }

    const proficiencyRequest: CharacterSystemProficiencyUpdateRequest = {};
    if (parsed.languages !== undefined) {
      const languages: NonNullable<CharacterSystemProficiencyUpdateRequest['languages']> = {};
      if (parsed.languages.values !== undefined) {
        languages.values = parsed.languages.values;
      }
      if (parsed.languages.custom !== undefined) {
        languages.custom = parsed.languages.custom;
      }
      proficiencyRequest.languages = languages;
    }
    if (parsed.weaponProficiencies !== undefined) {
      const weaponProficiencies: NonNullable<
        CharacterSystemProficiencyUpdateRequest['weaponProficiencies']
      > = {};
      if (parsed.weaponProficiencies.values !== undefined) {
        weaponProficiencies.values = parsed.weaponProficiencies.values;
      }
      if (parsed.weaponProficiencies.custom !== undefined) {
        weaponProficiencies.custom = parsed.weaponProficiencies.custom;
      }
      proficiencyRequest.weaponProficiencies = weaponProficiencies;
    }
    if (parsed.armorProficiencies !== undefined) {
      const armorProficiencies: NonNullable<
        CharacterSystemProficiencyUpdateRequest['armorProficiencies']
      > = {};
      if (parsed.armorProficiencies.values !== undefined) {
        armorProficiencies.values = parsed.armorProficiencies.values;
      }
      if (parsed.armorProficiencies.custom !== undefined) {
        armorProficiencies.custom = parsed.armorProficiencies.custom;
      }
      proficiencyRequest.armorProficiencies = armorProficiencies;
    }
    if (parsed.toolProficiencies !== undefined) {
      proficiencyRequest.toolProficiencies = parsed.toolProficiencies;
    }
    if (parsed.savingThrowProficiencies !== undefined) {
      proficiencyRequest.savingThrowProficiencies = parsed.savingThrowProficiencies;
    }

    const mutation = adapter.prepareSystemProficiencyUpdates(characterData, proficiencyRequest);

    const { actorResult, warnings } = await this.applyPreparedWriteMutation({
      actorIdentifier: parsed.actorIdentifier,
      mutation,
      ...(parsed.reason !== undefined ? { reason: parsed.reason } : {}),
    });

    return {
      success: true,
      actor: {
        id: actorResult?.actorId ?? characterData.id,
        name: actorResult?.actorName ?? characterData.name,
        type: actorResult?.actorType ?? characterData.type,
      },
      ...(mutation.summary ? { proficiencies: mutation.summary } : {}),
      updatedFields: actorResult?.updatedFields ?? [],
      ...(warnings.length > 0 ? { warnings } : {}),
    };
  }

  async handleAddCharacterItem(args: unknown): Promise<UnknownRecord> {
    const itemDataSchema = z
      .object({
        name: z.string().min(1, 'itemData.name cannot be empty'),
        type: z.string().min(1, 'itemData.type cannot be empty'),
        img: z.string().min(1).optional(),
        system: z.record(z.string(), z.unknown()).optional(),
        flags: z.record(z.string(), z.unknown()).optional(),
        effects: z.array(z.unknown()).optional(),
      })
      .passthrough();

    const schema = z
      .object({
        actorIdentifier: z.string().min(1, 'Actor identifier cannot be empty'),
        sourceUuid: z.string().min(1).optional(),
        itemData: itemDataSchema.optional(),
        overrides: z.record(z.string(), z.unknown()).optional(),
        itemType: z.string().min(1).optional(),
        reason: z.string().min(1).optional(),
      })
      .refine(
        value => (value.sourceUuid !== undefined) !== (value.itemData !== undefined),
        'Provide exactly one of sourceUuid or itemData'
      );

    const parsed = schema.parse(args);

    this.logger.info('Adding character item', {
      actorIdentifier: parsed.actorIdentifier,
      sourceUuid: parsed.sourceUuid,
      itemType: parsed.itemType,
    });

    const normalizedItemData =
      parsed.itemData !== undefined
        ? (Object.fromEntries(
            Object.entries(parsed.itemData).filter(([, value]) => value !== undefined)
          ) as FoundryCreateActorEmbeddedItemRequest['itemData'])
        : undefined;

    const request: FoundryCreateActorEmbeddedItemRequest = {
      actorIdentifier: parsed.actorIdentifier,
      ...(parsed.sourceUuid !== undefined ? { sourceUuid: parsed.sourceUuid } : {}),
      ...(normalizedItemData !== undefined ? { itemData: normalizedItemData } : {}),
      ...(parsed.overrides !== undefined ? { overrides: parsed.overrides } : {}),
      ...(parsed.itemType !== undefined ? { itemType: parsed.itemType } : {}),
      ...(parsed.reason !== undefined ? { reason: parsed.reason } : {}),
    };

    const result = await this.foundryClient.query<FoundryCreateActorEmbeddedItemResponse>(
      'maeinomatic-foundry-mcp.createActorEmbeddedItem',
      request
    );

    return {
      success: true,
      actor: {
        id: result.actorId,
        name: result.actorName,
      },
      item: {
        id: result.itemId,
        name: result.itemName,
        type: result.itemType,
      },
      createdFrom: result.createdFrom,
      ...(result.sourceUuid ? { sourceUuid: result.sourceUuid } : {}),
      ...(result.appliedOverrides ? { appliedOverrides: result.appliedOverrides } : {}),
    };
  }

  async handleAddDnD5eClassToCharacter(args: unknown): Promise<UnknownRecord> {
    const baseSchema = z.object({
      characterIdentifier: z.string().min(1, 'Character identifier cannot be empty'),
      classUuid: z.string().min(1, 'classUuid cannot be empty'),
      targetLevel: z.number().int().positive().default(1),
      advancementSelections: z.unknown().optional(),
      reason: z.string().min(1).optional(),
    });

    const baseParsed = baseSchema.parse(args);
    const progressionParsed = this.parseProgressionArgs({
      characterIdentifier: baseParsed.characterIdentifier,
      targetLevel: baseParsed.targetLevel,
      ...(baseParsed.advancementSelections !== undefined
        ? { advancementSelections: baseParsed.advancementSelections }
        : {}),
    });

    const gameSystem = await this.getGameSystem();
    if (gameSystem !== 'dnd5e') {
      throw new Error(
        'UNSUPPORTED_CAPABILITY: add-dnd5e-class-to-character is only available when the active system is dnd5e.'
      );
    }

    const createResult = await this.createDnD5eClassItemOnCharacter({
      characterIdentifier: baseParsed.characterIdentifier,
      classUuid: baseParsed.classUuid,
      ...(baseParsed.reason !== undefined ? { reason: baseParsed.reason } : {}),
    });

    const progressionResult = await this.runProgressionUpdateFlow({
      ...progressionParsed,
      classIdentifier: createResult.itemId,
    });

    const progressionComplete =
      progressionResult.success === true &&
      !('requiresChoices' in progressionResult && progressionResult.requiresChoices === true);

    return {
      ...progressionResult,
      success: true,
      classCreated: true,
      progressionComplete,
      class: {
        id: createResult.itemId,
        name: createResult.itemName,
        type: createResult.itemType,
      },
      sourceUuid: baseParsed.classUuid,
    };
  }

  async handleCompleteDnD5eMulticlassEntryWorkflow(args: unknown): Promise<UnknownRecord> {
    const advancementSelectionSchema = createAdvancementSelectionSchema();
    const schema = z
      .object({
        characterIdentifier: z.string().min(1, 'Character identifier cannot be empty'),
        classUuid: z.string().min(1).optional(),
        classIdentifier: z.string().min(1).optional(),
        targetLevel: z.number().int().positive().default(1),
        advancementSelections: z.array(advancementSelectionSchema).optional(),
        sourceClassAssignments: z
          .array(
            z.object({
              spellIdentifier: z.string().min(1, 'Spell identifier cannot be empty'),
              classIdentifier: z.string().min(1, 'Class identifier cannot be empty'),
            })
          )
          .optional(),
        spellPreparationPlans: z.array(createSpellPreparationPlanSchema()).optional(),
        autoFixSourceClasses: z.boolean().default(true),
        autoFixPreparationMismatches: z.boolean().default(true),
        optionQuery: z.string().min(1).optional(),
        optionLimit: z.number().int().positive().max(50).default(25),
        reason: z.string().min(1).optional(),
      })
      .refine(
        value => (value.classUuid !== undefined) !== (value.classIdentifier !== undefined),
        'Provide exactly one of classUuid or classIdentifier'
      );

    const parsed = schema.parse(args);

    this.logger.info('Running complete DnD5e multiclass entry workflow', parsed);

    const gameSystem = await this.getGameSystem();
    if (gameSystem !== 'dnd5e') {
      throw new Error(
        'UNSUPPORTED_CAPABILITY: complete-dnd5e-multiclass-entry-workflow is only available when the active system is dnd5e.'
      );
    }

    const workflowMetadata = this.createDnD5eWorkflowMetadata(
      'complete-dnd5e-multiclass-entry-workflow'
    );

    let classSummary: { id: string; name: string; type: string };
    let sourceUuid: string | undefined;
    let classCreated = false;

    if (parsed.classUuid !== undefined) {
      const createResult = await this.createDnD5eClassItemOnCharacter({
        characterIdentifier: parsed.characterIdentifier,
        classUuid: parsed.classUuid,
        ...(parsed.reason !== undefined ? { reason: parsed.reason } : {}),
      });
      classSummary = {
        id: createResult.itemId,
        name: createResult.itemName,
        type: createResult.itemType,
      };
      classCreated = true;
      sourceUuid = parsed.classUuid;
    } else {
      classSummary = await this.resolveDnD5eOwnedClassSummary(
        parsed.characterIdentifier,
        parsed.classIdentifier!
      );
    }

    const levelUpResult = await this.handleCompleteDnD5eLevelUpWorkflow({
      characterIdentifier: parsed.characterIdentifier,
      classIdentifier: classSummary.id,
      targetLevel: parsed.targetLevel,
      ...(parsed.advancementSelections !== undefined
        ? { advancementSelections: parsed.advancementSelections }
        : {}),
      ...(parsed.optionQuery !== undefined ? { optionQuery: parsed.optionQuery } : {}),
      optionLimit: parsed.optionLimit,
    });
    const levelUpRecord = this.toRecord(levelUpResult) ?? {};
    const levelUpWarnings = Array.isArray(levelUpRecord.warnings)
      ? levelUpRecord.warnings.filter((warning): warning is string => typeof warning === 'string')
      : [];
    const levelUpCompleted =
      levelUpRecord.success === true && levelUpRecord.workflowStatus === 'completed';

    if (!levelUpCompleted) {
      return {
        ...workflowMetadata,
        success: false,
        partialSuccess: true,
        workflowStatus:
          typeof levelUpRecord.workflowStatus === 'string'
            ? levelUpRecord.workflowStatus
            : 'needs-choices',
        classCreated,
        progressionComplete: false,
        spellbookOrganized: false,
        class: classSummary,
        ...(sourceUuid !== undefined ? { sourceUuid } : {}),
        levelUp: levelUpResult,
        ...(levelUpRecord.autoApplied
          ? { autoApplied: { levelUp: levelUpRecord.autoApplied } }
          : {}),
        unresolved: {
          phase: 'level-up',
          ...(this.toRecord(levelUpRecord.unresolved) ?? {}),
        },
        nextStep:
          'Provide the remaining advancementSelections and rerun complete-dnd5e-multiclass-entry-workflow with classIdentifier to resume this class entry workflow.',
        ...(levelUpWarnings.length > 0 ? { warnings: levelUpWarnings } : {}),
      };
    }

    const spellbookResult = await this.handleOrganizeDnD5eSpellbookWorkflow({
      actorIdentifier: parsed.characterIdentifier,
      ...(parsed.sourceClassAssignments !== undefined
        ? { sourceClassAssignments: parsed.sourceClassAssignments }
        : {}),
      ...(parsed.spellPreparationPlans !== undefined
        ? { spellPreparationPlans: parsed.spellPreparationPlans }
        : {}),
      autoFixSourceClasses: parsed.autoFixSourceClasses,
      autoFixPreparationMismatches: parsed.autoFixPreparationMismatches,
      ...(parsed.reason !== undefined ? { reason: parsed.reason } : {}),
    });
    const spellbookRecord = this.toRecord(spellbookResult) ?? {};
    const spellbookWarnings = Array.isArray(spellbookRecord.warnings)
      ? spellbookRecord.warnings.filter((warning): warning is string => typeof warning === 'string')
      : [];
    const spellbookCompleted =
      spellbookRecord.success === true && spellbookRecord.workflowStatus === 'completed';

    const buildValidation = await this.foundryClient.query<FoundryValidateCharacterBuildResponse>(
      'maeinomatic-foundry-mcp.validateCharacterBuild',
      {
        actorIdentifier: parsed.characterIdentifier,
      } satisfies FoundryValidateCharacterBuildRequest
    );
    const verification = {
      verified:
        spellbookCompleted &&
        buildValidation.summary.errorCount === 0 &&
        buildValidation.summary.outstandingAdvancementCount === 0,
      build: this.createCharacterBuildVerification(buildValidation),
      ...(spellbookRecord.verification
        ? { spellbook: spellbookRecord.verification }
        : {
            spellbook: {
              verified: spellbookCompleted,
            },
          }),
    };

    const warnings = this.mergeWarnings(levelUpWarnings, spellbookWarnings);

    if (!spellbookCompleted) {
      return {
        ...workflowMetadata,
        success: false,
        partialSuccess: true,
        workflowStatus:
          typeof spellbookRecord.workflowStatus === 'string'
            ? spellbookRecord.workflowStatus
            : 'needs-review',
        classCreated,
        progressionComplete: true,
        spellbookOrganized: false,
        class: classSummary,
        ...(sourceUuid !== undefined ? { sourceUuid } : {}),
        levelUp: levelUpResult,
        spellbook: spellbookResult,
        ...(levelUpRecord.autoApplied || spellbookRecord.autoApplied
          ? {
              autoApplied: {
                ...(levelUpRecord.autoApplied ? { levelUp: levelUpRecord.autoApplied } : {}),
                ...(spellbookRecord.autoApplied ? { spellbook: spellbookRecord.autoApplied } : {}),
              },
            }
          : {}),
        unresolved: {
          phase: 'spellbook',
          ...(this.toRecord(spellbookRecord.unresolved) ?? {}),
        },
        verification,
        nextStep:
          'Review the remaining multiclass spellbook issues and rerun complete-dnd5e-multiclass-entry-workflow with classIdentifier, or use the lower-level DnD5e spellbook tools for the ambiguous cases.',
        ...(warnings.length > 0 ? { warnings } : {}),
      };
    }

    return {
      ...workflowMetadata,
      success: true,
      workflowStatus: 'completed',
      completed: true,
      classCreated,
      progressionComplete: true,
      spellbookOrganized: true,
      class: classSummary,
      ...(sourceUuid !== undefined ? { sourceUuid } : {}),
      levelUp: levelUpResult,
      spellbook: spellbookResult,
      ...(levelUpRecord.autoApplied || spellbookRecord.autoApplied
        ? {
            autoApplied: {
              ...(levelUpRecord.autoApplied ? { levelUp: levelUpRecord.autoApplied } : {}),
              ...(spellbookRecord.autoApplied ? { spellbook: spellbookRecord.autoApplied } : {}),
            },
          }
        : {}),
      verification,
      ...(warnings.length > 0 ? { warnings } : {}),
    };
  }

  async handleUpdateCharacterItem(args: unknown): Promise<UnknownRecord> {
    const schema = z.object({
      actorIdentifier: z.string().min(1, 'Actor identifier cannot be empty'),
      itemIdentifier: z.string().min(1, 'Item identifier cannot be empty'),
      itemType: z.string().min(1).optional(),
      updates: z.record(z.string(), z.unknown()),
      reason: z.string().min(1).optional(),
    });

    const parsed = schema.parse(args);

    this.logger.info('Updating character item', {
      actorIdentifier: parsed.actorIdentifier,
      itemIdentifier: parsed.itemIdentifier,
      itemType: parsed.itemType,
    });

    const request: FoundryUpdateActorEmbeddedItemRequest = {
      actorIdentifier: parsed.actorIdentifier,
      itemIdentifier: parsed.itemIdentifier,
      updates: parsed.updates,
      ...(parsed.itemType !== undefined ? { itemType: parsed.itemType } : {}),
      ...(parsed.reason !== undefined ? { reason: parsed.reason } : {}),
    };

    const result = await this.foundryClient.query<FoundryUpdateActorEmbeddedItemResponse>(
      'maeinomatic-foundry-mcp.updateActorEmbeddedItem',
      request
    );

    return {
      success: true,
      actor: {
        id: result.actorId,
        name: result.actorName,
      },
      item: {
        id: result.itemId,
        name: result.itemName,
        type: result.itemType,
      },
      updatedFields: result.updatedFields,
      appliedUpdates: result.appliedUpdates,
    };
  }

  async handleRemoveCharacterItem(args: unknown): Promise<UnknownRecord> {
    const schema = z.object({
      actorIdentifier: z.string().min(1, 'Actor identifier cannot be empty'),
      itemIdentifier: z.string().min(1, 'Item identifier cannot be empty'),
      itemType: z.string().min(1).optional(),
      reason: z.string().min(1).optional(),
    });

    const parsed = schema.parse(args);

    this.logger.info('Removing character item', {
      actorIdentifier: parsed.actorIdentifier,
      itemIdentifier: parsed.itemIdentifier,
      itemType: parsed.itemType,
    });

    const request: FoundryDeleteActorEmbeddedItemRequest = {
      actorIdentifier: parsed.actorIdentifier,
      itemIdentifier: parsed.itemIdentifier,
      ...(parsed.itemType !== undefined ? { itemType: parsed.itemType } : {}),
      ...(parsed.reason !== undefined ? { reason: parsed.reason } : {}),
    };

    const result = await this.foundryClient.query<FoundryDeleteActorEmbeddedItemResponse>(
      'maeinomatic-foundry-mcp.deleteActorEmbeddedItem',
      request
    );

    return {
      success: true,
      actor: {
        id: result.actorId,
        name: result.actorName,
      },
      item: {
        id: result.itemId,
        name: result.itemName,
        type: result.itemType,
      },
      removed: true,
    };
  }

  async handleLearnDnD5eSpell(args: unknown): Promise<UnknownRecord> {
    const schema = z.object({
      actorIdentifier: z.string().min(1, 'Actor identifier cannot be empty'),
      spellUuid: z.string().min(1, 'spellUuid cannot be empty'),
      prepared: z.boolean().default(true),
      sourceClass: z.string().min(1).optional(),
      reason: z.string().min(1).optional(),
    });

    const parsed = schema.parse(args);
    const gameSystem = await this.getGameSystem();
    if (gameSystem !== 'dnd5e') {
      throw new Error(
        'UNSUPPORTED_CAPABILITY: learn-dnd5e-spell is only available when the active system is dnd5e.'
      );
    }

    const characterData =
      parsed.sourceClass !== undefined
        ? await this.foundryClient.query<CharacterInfoResponse>(
            'maeinomatic-foundry-mcp.getCharacterInfo',
            {
              identifier: parsed.actorIdentifier,
            }
          )
        : null;
    const resolvedSourceClass =
      parsed.sourceClass !== undefined && characterData
        ? this.resolveDnD5eSpellcastingClass(characterData, parsed.sourceClass)
        : null;

    const request: FoundryCreateActorEmbeddedItemRequest = {
      actorIdentifier: parsed.actorIdentifier,
      sourceUuid: parsed.spellUuid,
      itemType: 'spell',
      overrides: {
        system: {
          preparation: {
            prepared: parsed.prepared,
          },
          ...(resolvedSourceClass ? { sourceClass: resolvedSourceClass.id } : {}),
        },
      },
      ...(parsed.reason !== undefined ? { reason: parsed.reason } : {}),
    };

    const result = await this.foundryClient.query<FoundryCreateActorEmbeddedItemResponse>(
      'maeinomatic-foundry-mcp.createActorEmbeddedItem',
      request
    );

    return {
      success: true,
      actor: {
        id: result.actorId,
        name: result.actorName,
      },
      spell: {
        id: result.itemId,
        name: result.itemName,
      },
      prepared: parsed.prepared,
      ...(resolvedSourceClass
        ? {
            sourceClass: {
              id: resolvedSourceClass.id,
              name: resolvedSourceClass.name,
            },
          }
        : {}),
    };
  }

  async handlePrepareDnD5eSpell(args: unknown): Promise<UnknownRecord> {
    const schema = z.object({
      actorIdentifier: z.string().min(1, 'Actor identifier cannot be empty'),
      spellIdentifier: z.string().min(1, 'Spell identifier cannot be empty'),
      prepared: z.boolean(),
      reason: z.string().min(1).optional(),
    });

    const parsed = schema.parse(args);
    const gameSystem = await this.getGameSystem();
    if (gameSystem !== 'dnd5e') {
      throw new Error(
        'UNSUPPORTED_CAPABILITY: prepare-dnd5e-spell is only available when the active system is dnd5e.'
      );
    }

    const request: FoundryUpdateActorEmbeddedItemRequest = {
      actorIdentifier: parsed.actorIdentifier,
      itemIdentifier: parsed.spellIdentifier,
      itemType: 'spell',
      updates: {
        'system.preparation.prepared': parsed.prepared,
      },
      ...(parsed.reason !== undefined ? { reason: parsed.reason } : {}),
    };

    const result = await this.foundryClient.query<FoundryUpdateActorEmbeddedItemResponse>(
      'maeinomatic-foundry-mcp.updateActorEmbeddedItem',
      request
    );

    return {
      success: true,
      actor: {
        id: result.actorId,
        name: result.actorName,
      },
      spell: {
        id: result.itemId,
        name: result.itemName,
      },
      prepared: parsed.prepared,
      updatedFields: result.updatedFields,
    };
  }

  async handleForgetDnD5eSpell(args: unknown): Promise<UnknownRecord> {
    const schema = z.object({
      actorIdentifier: z.string().min(1, 'Actor identifier cannot be empty'),
      spellIdentifier: z.string().min(1, 'Spell identifier cannot be empty'),
      reason: z.string().min(1).optional(),
    });

    const parsed = schema.parse(args);
    const gameSystem = await this.getGameSystem();
    if (gameSystem !== 'dnd5e') {
      throw new Error(
        'UNSUPPORTED_CAPABILITY: forget-dnd5e-spell is only available when the active system is dnd5e.'
      );
    }

    const request: FoundryDeleteActorEmbeddedItemRequest = {
      actorIdentifier: parsed.actorIdentifier,
      itemIdentifier: parsed.spellIdentifier,
      itemType: 'spell',
      ...(parsed.reason !== undefined ? { reason: parsed.reason } : {}),
    };

    const result = await this.foundryClient.query<FoundryDeleteActorEmbeddedItemResponse>(
      'maeinomatic-foundry-mcp.deleteActorEmbeddedItem',
      request
    );

    return {
      success: true,
      actor: {
        id: result.actorId,
        name: result.actorName,
      },
      spell: {
        id: result.itemId,
        name: result.itemName,
      },
      removed: true,
    };
  }

  async handleSetDnD5eSpellSlots(args: unknown): Promise<UnknownRecord> {
    const schema = z
      .object({
        actorIdentifier: z.string().min(1, 'Actor identifier cannot be empty'),
        slot: z.enum([
          'level1',
          'level2',
          'level3',
          'level4',
          'level5',
          'level6',
          'level7',
          'level8',
          'level9',
          'pact',
        ]),
        value: z.number().int().nonnegative().optional(),
        override: z.number().int().nonnegative().nullable().optional(),
        reason: z.string().min(1).optional(),
      })
      .refine(
        value => value.value !== undefined || value.override !== undefined,
        'Provide value or override'
      );

    const parsed = schema.parse(args);
    const gameSystem = await this.getGameSystem();
    if (gameSystem !== 'dnd5e') {
      throw new Error(
        'UNSUPPORTED_CAPABILITY: set-dnd5e-spell-slots is only available when the active system is dnd5e.'
      );
    }

    const slotKey = parsed.slot === 'pact' ? 'pact' : `spell${parsed.slot.replace('level', '')}`;
    const updates: Record<string, unknown> = {
      ...(parsed.value !== undefined ? { [`system.spells.${slotKey}.value`]: parsed.value } : {}),
      ...(parsed.override !== undefined
        ? { [`system.spells.${slotKey}.override`]: parsed.override }
        : {}),
    };

    const request: FoundryUpdateActorRequest = {
      identifier: parsed.actorIdentifier,
      updates,
      ...(parsed.reason !== undefined ? { reason: parsed.reason } : {}),
    };

    const result = await this.foundryClient.query<FoundryUpdateActorResponse>(
      'maeinomatic-foundry-mcp.updateActor',
      request
    );

    return {
      success: true,
      actor: {
        id: result.actorId,
        name: result.actorName,
        type: result.actorType,
      },
      slot: parsed.slot,
      ...(parsed.value !== undefined ? { value: parsed.value } : {}),
      ...(parsed.override !== undefined ? { override: parsed.override } : {}),
      updatedFields: result.updatedFields,
    };
  }

  async handleReassignDnD5eSpellSourceClass(args: unknown): Promise<UnknownRecord> {
    const schema = z.object({
      actorIdentifier: z.string().min(1, 'Actor identifier cannot be empty'),
      spellIdentifier: z.string().min(1, 'Spell identifier cannot be empty'),
      classIdentifier: z.string().min(1, 'Class identifier cannot be empty'),
      reason: z.string().min(1).optional(),
    });

    const parsed = schema.parse(args);
    const gameSystem = await this.getGameSystem();
    if (gameSystem !== 'dnd5e') {
      throw new Error(
        'UNSUPPORTED_CAPABILITY: reassign-dnd5e-spell-source-class is only available when the active system is dnd5e.'
      );
    }

    const characterData = await this.foundryClient.query<CharacterInfoResponse>(
      'maeinomatic-foundry-mcp.getCharacterInfo',
      {
        identifier: parsed.actorIdentifier,
      }
    );
    const resolvedClass = this.resolveDnD5eSpellcastingClass(characterData, parsed.classIdentifier);

    const request: FoundryUpdateActorEmbeddedItemRequest = {
      actorIdentifier: parsed.actorIdentifier,
      itemIdentifier: parsed.spellIdentifier,
      itemType: 'spell',
      updates: {
        'system.sourceClass': resolvedClass.id,
      },
      ...(parsed.reason !== undefined ? { reason: parsed.reason } : {}),
    };

    const result = await this.foundryClient.query<FoundryUpdateActorEmbeddedItemResponse>(
      'maeinomatic-foundry-mcp.updateActorEmbeddedItem',
      request
    );

    return {
      success: true,
      actor: {
        id: result.actorId,
        name: result.actorName,
      },
      spell: {
        id: result.itemId,
        name: result.itemName,
      },
      sourceClass: {
        id: resolvedClass.id,
        name: resolvedClass.name,
      },
      updatedFields: result.updatedFields,
    };
  }

  async handleValidateDnD5eSpellbook(args: unknown): Promise<UnknownRecord> {
    const schema = z.object({
      actorIdentifier: z.string().min(1, 'Actor identifier cannot be empty'),
    });

    const parsed = schema.parse(args);
    const { adapter, system } = await this.getRequiredSystemAdapter('DnD5e spellbook validation');
    if (system !== 'dnd5e') {
      throw new Error(
        'UNSUPPORTED_CAPABILITY: validate-dnd5e-spellbook is only available when the active system is dnd5e.'
      );
    }

    const characterData = await this.getCharacterData(parsed.actorIdentifier);
    const classes = this.getDnD5eSpellcastingClassSummaries(characterData);

    if (!adapter.validateSpellbook) {
      throw new Error(
        'UNSUPPORTED_CAPABILITY: The active system adapter does not support spellbook validation.'
      );
    }

    const validation = adapter.validateSpellbook(characterData);

    return {
      success: true,
      character: {
        id: characterData.id,
        name: characterData.name,
        type: characterData.type,
      },
      summary: validation.summary,
      classes,
      issues: validation.issues,
      ...(validation.recommendations ? { recommendations: validation.recommendations } : {}),
    };
  }

  async handleValidateDnD5eCharacterBuild(args: unknown): Promise<UnknownRecord> {
    const schema = z.object({
      actorIdentifier: z.string().min(1, 'Actor identifier cannot be empty'),
    });

    const parsed = schema.parse(args);
    const gameSystem = await this.getGameSystem();
    if (gameSystem !== 'dnd5e') {
      throw new Error(
        'UNSUPPORTED_CAPABILITY: validate-dnd5e-character-build is only available when the active system is dnd5e.'
      );
    }

    const result = await this.foundryClient.query<FoundryValidateCharacterBuildResponse>(
      'maeinomatic-foundry-mcp.validateCharacterBuild',
      {
        actorIdentifier: parsed.actorIdentifier,
      } satisfies FoundryValidateCharacterBuildRequest
    );

    return {
      success: true,
      character: {
        id: result.actorId,
        name: result.actorName,
        type: result.actorType,
      },
      summary: result.summary,
      issues: result.issues,
      ...(result.outstandingAdvancements
        ? { outstandingAdvancements: result.outstandingAdvancements }
        : {}),
      ...(result.recommendations ? { recommendations: result.recommendations } : {}),
    };
  }

  async handleBulkReassignDnD5eSpellSourceClass(args: unknown): Promise<UnknownRecord> {
    const schema = z.object({
      actorIdentifier: z.string().min(1, 'Actor identifier cannot be empty'),
      assignments: z
        .array(
          z.object({
            spellIdentifier: z.string().min(1, 'Spell identifier cannot be empty'),
            classIdentifier: z.string().min(1, 'Class identifier cannot be empty'),
          })
        )
        .min(1, 'assignments must contain at least one spell'),
      reason: z.string().min(1).optional(),
    });

    const parsed = schema.parse(args);
    const gameSystem = await this.getGameSystem();
    if (gameSystem !== 'dnd5e') {
      throw new Error(
        'UNSUPPORTED_CAPABILITY: bulk-reassign-dnd5e-spell-source-class is only available when the active system is dnd5e.'
      );
    }

    const characterData = await this.foundryClient.query<CharacterInfoResponse>(
      'maeinomatic-foundry-mcp.getCharacterInfo',
      {
        identifier: parsed.actorIdentifier,
      }
    );

    const batchRequest: FoundryBatchUpdateActorEmbeddedItemsRequest = {
      actorIdentifier: parsed.actorIdentifier,
      updates: parsed.assignments.map(assignment => {
        const spell = this.findDnD5eSpellItem(characterData, assignment.spellIdentifier);
        const sourceClass = this.resolveDnD5eSpellcastingClass(
          characterData,
          assignment.classIdentifier
        );

        return {
          itemIdentifier: spell.id,
          itemType: 'spell',
          updates: {
            'system.sourceClass': sourceClass.id,
          },
        };
      }),
      ...(parsed.reason !== undefined ? { reason: parsed.reason } : {}),
    };

    const result = await this.foundryClient.query<FoundryBatchUpdateActorEmbeddedItemsResponse>(
      'maeinomatic-foundry-mcp.batchUpdateActorEmbeddedItems',
      batchRequest
    );

    return {
      success: true,
      actor: {
        id: result.actorId,
        name: result.actorName,
      },
      updatedCount: result.updatedItems.length,
      updatedSpells: result.updatedItems.map(item => ({
        id: item.itemId,
        name: item.itemName,
        type: item.itemType,
      })),
    };
  }

  async handleSetDnD5ePreparedSpells(args: unknown): Promise<UnknownRecord> {
    const schema = z
      .object({
        actorIdentifier: z.string().min(1, 'Actor identifier cannot be empty'),
        mode: z.enum(['replace', 'prepare', 'unprepare']),
        spellIdentifiers: z.array(z.string().min(1)).default([]),
        sourceClass: z.string().min(1).optional(),
        reason: z.string().min(1).optional(),
      })
      .superRefine((value, ctx) => {
        if (value.mode !== 'replace' && value.spellIdentifiers.length === 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message:
              'spellIdentifiers must contain at least one spell for prepare or unprepare mode',
            path: ['spellIdentifiers'],
          });
        }
      });

    const parsed = schema.parse(args);
    const gameSystem = await this.getGameSystem();
    if (gameSystem !== 'dnd5e') {
      throw new Error(
        'UNSUPPORTED_CAPABILITY: set-dnd5e-prepared-spells is only available when the active system is dnd5e.'
      );
    }

    const characterData = await this.foundryClient.query<CharacterInfoResponse>(
      'maeinomatic-foundry-mcp.getCharacterInfo',
      {
        identifier: parsed.actorIdentifier,
      }
    );

    const classes = this.getDnD5eSpellcastingClassSummaries(characterData);
    const resolvedSourceClass =
      parsed.sourceClass !== undefined
        ? this.resolveDnD5eSpellcastingClass(characterData, parsed.sourceClass)
        : undefined;

    if (parsed.mode === 'replace' && resolvedSourceClass === undefined && classes.length > 1) {
      throw new Error(
        'A sourceClass is required for replace mode on multiclass DnD5e spellcasters.'
      );
    }

    const selectedSpellMap = new Map(
      parsed.spellIdentifiers.map(spellIdentifier => {
        const spell = this.findDnD5eSpellItem(characterData, spellIdentifier);
        return [spell.id, spell];
      })
    );

    if (resolvedSourceClass) {
      for (const spell of selectedSpellMap.values()) {
        if (!this.spellMatchesSourceClass(spell, resolvedSourceClass)) {
          throw new Error(
            `Spell "${spell.name}" is not currently assigned to source class "${resolvedSourceClass.name}". Reassign it first or choose a matching source class.`
          );
        }
      }
    }

    const targetSpellScope = (characterData.items ?? []).filter(item => {
      if (item.type !== 'spell') {
        return false;
      }

      if (!resolvedSourceClass) {
        return true;
      }

      return this.spellMatchesSourceClass(item, resolvedSourceClass);
    });

    if (parsed.mode === 'replace' && resolvedSourceClass && targetSpellScope.length === 0) {
      throw new Error(
        `No owned spells are currently assigned to source class "${resolvedSourceClass.name}".`
      );
    }

    const updates =
      parsed.mode === 'replace'
        ? targetSpellScope.map(spell => ({
            itemIdentifier: spell.id,
            itemType: 'spell',
            updates: {
              'system.preparation.prepared': selectedSpellMap.has(spell.id),
            },
          }))
        : Array.from(selectedSpellMap.values()).map(spell => ({
            itemIdentifier: spell.id,
            itemType: 'spell',
            updates: {
              'system.preparation.prepared': parsed.mode === 'prepare',
            },
          }));

    const batchRequest: FoundryBatchUpdateActorEmbeddedItemsRequest = {
      actorIdentifier: parsed.actorIdentifier,
      updates,
      ...(parsed.reason !== undefined ? { reason: parsed.reason } : {}),
    };

    const result = await this.foundryClient.query<FoundryBatchUpdateActorEmbeddedItemsResponse>(
      'maeinomatic-foundry-mcp.batchUpdateActorEmbeddedItems',
      batchRequest
    );

    return {
      success: true,
      actor: {
        id: result.actorId,
        name: result.actorName,
      },
      mode: parsed.mode,
      updatedCount: result.updatedItems.length,
      ...(resolvedSourceClass
        ? {
            sourceClass: {
              id: resolvedSourceClass.id,
              name: resolvedSourceClass.name,
            },
          }
        : {}),
      updatedSpells: result.updatedItems.map(item => ({
        id: item.itemId,
        name: item.itemName,
        prepared:
          item.appliedUpdates['system.preparation.prepared'] === true
            ? true
            : item.appliedUpdates['system.preparation.prepared'] === false
              ? false
              : undefined,
      })),
    };
  }

  async handleRunDnD5eRestWorkflow(args: unknown): Promise<UnknownRecord> {
    const spellPreparationPlanSchema = z
      .object({
        mode: z.enum(['replace', 'prepare', 'unprepare']),
        spellIdentifiers: z.array(z.string().min(1)).default([]),
        sourceClass: z.string().min(1).optional(),
        reason: z.string().min(1).optional(),
      })
      .superRefine((value, ctx) => {
        if (value.mode !== 'replace' && value.spellIdentifiers.length === 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message:
              'spellIdentifiers must contain at least one spell for prepare or unprepare mode',
            path: ['spellIdentifiers'],
          });
        }
      });

    const schema = z.object({
      actorIdentifier: z.string().min(1, 'Actor identifier cannot be empty'),
      restType: z.enum(['short', 'long']),
      suppressChat: z.boolean().default(true),
      newDay: z.boolean().optional(),
      spellPreparationPlans: z.array(spellPreparationPlanSchema).optional(),
      reason: z.string().min(1).optional(),
    });

    const parsed = schema.parse(args);
    const gameSystem = await this.getGameSystem();
    if (gameSystem !== 'dnd5e') {
      throw new Error(
        'UNSUPPORTED_CAPABILITY: run-dnd5e-rest-workflow is only available when the active system is dnd5e.'
      );
    }

    const workflowMetadata = this.createDnD5eWorkflowMetadata('run-dnd5e-rest-workflow');

    const restResult = await this.foundryClient.query<FoundryRunCharacterRestWorkflowResponse>(
      'maeinomatic-foundry-mcp.runCharacterRestWorkflow',
      {
        actorIdentifier: parsed.actorIdentifier,
        restType: parsed.restType,
        suppressChat: parsed.suppressChat,
        ...(parsed.newDay !== undefined ? { newDay: parsed.newDay } : {}),
        ...(parsed.reason !== undefined ? { reason: parsed.reason } : {}),
      } satisfies FoundryRunCharacterRestWorkflowRequest
    );

    const spellPreparationUpdates: UnknownRecord[] = [];
    const warnings = [...(restResult.warnings ?? [])];

    for (const plan of parsed.spellPreparationPlans ?? []) {
      try {
        const preparationResult = await this.handleSetDnD5ePreparedSpells({
          actorIdentifier: parsed.actorIdentifier,
          mode: plan.mode,
          spellIdentifiers: plan.spellIdentifiers,
          ...(plan.sourceClass !== undefined ? { sourceClass: plan.sourceClass } : {}),
          reason: plan.reason ?? parsed.reason ?? `Post-${parsed.restType}-rest spell preparation`,
        });

        spellPreparationUpdates.push(preparationResult);
      } catch (error) {
        warnings.push(
          `The ${parsed.restType}-rest completed, but a post-rest spell preparation step failed: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`
        );

        return {
          ...workflowMetadata,
          success: false,
          partialSuccess: true,
          workflowStatus: 'partial-failure',
          restCompleted: true,
          character: {
            id: restResult.actorId,
            name: restResult.actorName,
            type: restResult.actorType,
          },
          rest: {
            type: restResult.restType,
            before: restResult.before,
            after: restResult.after,
            changes: restResult.changes,
          },
          ...(spellPreparationUpdates.length > 0 ? { spellPreparationUpdates } : {}),
          verification: {
            verified: false,
            restCompleted: true,
            postRestPreparationPlansApplied: spellPreparationUpdates.length,
          },
          warnings,
        };
      }
    }

    return {
      ...workflowMetadata,
      success: true,
      workflowStatus: 'completed',
      restCompleted: true,
      character: {
        id: restResult.actorId,
        name: restResult.actorName,
        type: restResult.actorType,
      },
      rest: {
        type: restResult.restType,
        before: restResult.before,
        after: restResult.after,
        changes: restResult.changes,
      },
      ...(spellPreparationUpdates.length > 0 ? { spellPreparationUpdates } : {}),
      verification: {
        verified: true,
        restCompleted: true,
        postRestPreparationPlansApplied: spellPreparationUpdates.length,
      },
      ...(warnings.length > 0 ? { warnings } : {}),
    };
  }

  async handleRunDnD5eGroupRestWorkflow(args: unknown): Promise<UnknownRecord> {
    const spellPreparationPlanSchema = createSpellPreparationPlanSchema();
    const schema = z
      .object({
        restTarget: z.enum(['party-characters', 'explicit-characters']).default('party-characters'),
        groupIdentifier: z.string().min(1).optional(),
        characterIdentifiers: z.array(z.string().min(1)).optional(),
        restType: z.enum(['short', 'long']),
        suppressChat: z.boolean().default(true),
        newDay: z.boolean().optional(),
        spellPreparationPlansByActor: z
          .array(
            z.object({
              actorIdentifier: z.string().min(1, 'Actor identifier cannot be empty'),
              spellPreparationPlans: z.array(spellPreparationPlanSchema).default([]),
            })
          )
          .optional(),
        continueOnError: z.boolean().default(true),
        reason: z.string().min(1).optional(),
      })
      .superRefine((value, ctx) => {
        if (
          value.restTarget === 'explicit-characters' &&
          (!value.characterIdentifiers || value.characterIdentifiers.length === 0)
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message:
              'characterIdentifiers must contain at least one target when restTarget is explicit-characters.',
            path: ['characterIdentifiers'],
          });
        }
      });

    const parsed = schema.parse(args);

    this.logger.info('Running DnD5e group rest workflow', parsed);

    const gameSystem = await this.getGameSystem();
    if (gameSystem !== 'dnd5e') {
      throw new Error(
        'UNSUPPORTED_CAPABILITY: run-dnd5e-group-rest-workflow is only available when the active system is dnd5e.'
      );
    }

    const workflowMetadata = this.createDnD5eWorkflowMetadata('run-dnd5e-group-rest-workflow');
    const groupSummary = parsed.groupIdentifier
      ? await this.resolvePrimaryPartyGroup({ partyIdentifier: parsed.groupIdentifier })
      : null;
    const recipients =
      parsed.restTarget === 'party-characters'
        ? this.normalizeNamedEntities(
            await this.foundryClient.query<unknown[]>(
              'maeinomatic-foundry-mcp.getPartyCharacters',
              {}
            )
          )
        : parsed.characterIdentifiers!.map(identifier => ({
            id: identifier,
            name: identifier,
          }));

    if (recipients.length === 0) {
      throw new Error(
        parsed.restTarget === 'party-characters'
          ? 'No party characters were found to receive the DnD5e group rest workflow.'
          : 'No explicit character targets were provided for the DnD5e group rest workflow.'
      );
    }

    const plansByActorId = new Map<
      string,
      Array<{
        mode: 'replace' | 'prepare' | 'unprepare';
        spellIdentifiers: string[];
        sourceClass?: string | undefined;
        reason?: string | undefined;
      }>
    >();
    for (const actorPlan of parsed.spellPreparationPlansByActor ?? []) {
      const normalizedActorIdentifier = actorPlan.actorIdentifier.toLowerCase();
      const recipient = recipients.find(
        candidate =>
          candidate.id.toLowerCase() === normalizedActorIdentifier ||
          candidate.name.toLowerCase() === normalizedActorIdentifier
      );
      if (!recipient) {
        throw new Error(
          `Spell preparation plans were provided for "${actorPlan.actorIdentifier}", but that actor is not part of this group rest target.`
        );
      }
      if (plansByActorId.has(recipient.id)) {
        throw new Error(
          `Spell preparation plans were provided more than once for "${recipient.name}".`
        );
      }

      plansByActorId.set(recipient.id, actorPlan.spellPreparationPlans);
    }

    const actorResults: UnknownRecord[] = [];
    const failedActors: UnknownRecord[] = [];
    const warnings: string[] = [];

    for (const recipient of recipients) {
      try {
        const actorResult = await this.handleRunDnD5eRestWorkflow({
          actorIdentifier: recipient.id,
          restType: parsed.restType,
          suppressChat: parsed.suppressChat,
          ...(parsed.newDay !== undefined ? { newDay: parsed.newDay } : {}),
          ...(plansByActorId.has(recipient.id)
            ? { spellPreparationPlans: plansByActorId.get(recipient.id) }
            : {}),
          ...(parsed.reason !== undefined ? { reason: parsed.reason } : {}),
        });
        const actorRecord = this.toRecord(actorResult) ?? {};
        const actorWarnings = Array.isArray(actorRecord.warnings)
          ? actorRecord.warnings.filter((warning): warning is string => typeof warning === 'string')
          : [];
        warnings.push(...actorWarnings);

        const actorWorkflowResult = {
          actor: this.toRecord(actorRecord.character) ?? {
            id: recipient.id,
            name: recipient.name,
            type: 'character',
          },
          success: actorRecord.success === true,
          workflowStatus:
            typeof actorRecord.workflowStatus === 'string'
              ? actorRecord.workflowStatus
              : actorRecord.success === true
                ? 'completed'
                : 'failed',
          restCompleted: actorRecord.restCompleted === true,
          ...(actorRecord.rest ? { rest: actorRecord.rest } : {}),
          ...(actorRecord.spellPreparationUpdates
            ? { spellPreparationUpdates: actorRecord.spellPreparationUpdates }
            : {}),
          ...(actorRecord.verification ? { verification: actorRecord.verification } : {}),
          ...(actorWarnings.length > 0 ? { warnings: actorWarnings } : {}),
        } satisfies UnknownRecord;

        actorResults.push(actorWorkflowResult);
        if (actorRecord.success !== true) {
          failedActors.push(actorWorkflowResult);
          if (!parsed.continueOnError) {
            break;
          }
        }
      } catch (error) {
        const failure = {
          actor: {
            id: recipient.id,
            name: recipient.name,
            type: 'character',
          },
          success: false,
          workflowStatus: 'failed',
          message: error instanceof Error ? error.message : 'Unknown error',
        } satisfies UnknownRecord;
        actorResults.push(failure);
        failedActors.push(failure);
        if (!parsed.continueOnError) {
          break;
        }
      }
    }

    const restCompletedCount = actorResults.filter(result => {
      const record = this.toRecord(result);
      return record?.restCompleted === true;
    }).length;
    const partialFailureCount = actorResults.filter(result => {
      const record = this.toRecord(result);
      return record?.success !== true && record?.restCompleted === true;
    }).length;
    const hitPointChangeCount = actorResults.filter(result => {
      const rest = this.toRecord(this.toRecord(result)?.rest);
      const changes = this.toRecord(rest?.changes);
      return changes?.hitPointsChanged === true;
    }).length;
    const spellPreparationPlanCount = actorResults.reduce((count, result) => {
      const record = this.toRecord(result);
      const updates = Array.isArray(record?.spellPreparationUpdates)
        ? record.spellPreparationUpdates
        : [];
      return count + updates.length;
    }, 0);
    const success = failedActors.length === 0;
    const verification = {
      verified: success,
      targetedActorCount: recipients.length,
      attemptedActorCount: actorResults.length,
      failedActorCount: failedActors.length,
      restCompletedActorCount: restCompletedCount,
    };

    return {
      ...workflowMetadata,
      success,
      partialSuccess: !success && actorResults.length > 0,
      workflowStatus: success
        ? 'completed'
        : actorResults.length > failedActors.length
          ? 'partial-failure'
          : 'failed',
      ...(success ? { completed: true } : {}),
      restTarget: parsed.restTarget,
      restType: parsed.restType,
      actorCount: recipients.length,
      ...(groupSummary
        ? {
            group: {
              id: groupSummary.id,
              name: groupSummary.name,
              type: 'group',
            },
          }
        : {}),
      summary: {
        completedActorCount: actorResults.length - failedActors.length,
        failedActorCount: failedActors.length,
        restCompletedActorCount: restCompletedCount,
        partialFailureActorCount: partialFailureCount,
        hitPointsChangedActorCount: hitPointChangeCount,
        spellPreparationPlanCount,
      },
      actors: actorResults,
      ...(failedActors.length > 0 ? { failedActors } : {}),
      verification,
      ...(!success
        ? {
            nextStep:
              'Review the failed actor rest results, then rerun run-dnd5e-group-rest-workflow for the remaining characters or resolve the actor-specific issues individually.',
          }
        : {}),
      ...(warnings.length > 0 ? { warnings: this.mergeWarnings(warnings) } : {}),
    };
  }

  async handleAwardDnD5ePartyResources(args: unknown): Promise<UnknownRecord> {
    const schema = z
      .object({
        awardTarget: z
          .enum(['party-characters', 'explicit-characters', 'primary-party-group'])
          .default('party-characters'),
        awardSource: z.enum(['new-award', 'staged-party-group']).default('new-award'),
        partyIdentifier: z.string().min(1).optional(),
        characterIdentifiers: z.array(z.string().min(1)).optional(),
        distributionMode: z.enum(['split', 'each']).default('split'),
        experiencePoints: z.number().nonnegative().optional(),
        currency: z.record(z.string(), z.number().nonnegative()).optional(),
        validateCharacterBuilds: z.boolean().default(true),
        reason: z.string().min(1).optional(),
      })
      .superRefine((value, ctx) => {
        if (value.experiencePoints === undefined && value.currency === undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Provide experiencePoints or currency to award.',
          });
        }

        if (
          value.awardTarget === 'explicit-characters' &&
          (!value.characterIdentifiers || value.characterIdentifiers.length === 0)
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message:
              'characterIdentifiers must contain at least one target when awardTarget is explicit-characters.',
            path: ['characterIdentifiers'],
          });
        }

        if (
          value.awardTarget === 'primary-party-group' &&
          value.awardSource === 'staged-party-group'
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message:
              'awardTarget primary-party-group stages fresh awards. Use awardSource staged-party-group with a character-facing awardTarget when distributing staged party awards later.',
            path: ['awardSource'],
          });
        }
      });

    const parsed = schema.parse(args);
    const gameSystem = await this.getGameSystem();
    if (gameSystem !== 'dnd5e') {
      throw new Error(
        'UNSUPPORTED_CAPABILITY: award-dnd5e-party-resources is only available when the active system is dnd5e.'
      );
    }

    const workflowMetadata = this.createDnD5eWorkflowMetadata('award-dnd5e-party-resources');
    const warnings: string[] = [];
    const workflowReason = parsed.reason ?? 'dnd5e party resource award workflow';

    if (parsed.awardTarget === 'primary-party-group') {
      const partyGroup = await this.resolvePrimaryPartyGroup({
        ...(parsed.partyIdentifier !== undefined
          ? { partyIdentifier: parsed.partyIdentifier }
          : {}),
      });
      const partyGroupData = await this.getCharacterData(partyGroup.id);
      const stagedMutation = this.buildDnD5eAwardUpdates({
        actorData: partyGroupData,
        ...(parsed.experiencePoints !== undefined
          ? { experiencePoints: parsed.experiencePoints }
          : {}),
        ...(parsed.currency !== undefined ? { currency: parsed.currency } : {}),
      });

      let updateResult: FoundryUpdateActorResponse | null = null;
      if (Object.keys(stagedMutation.updates).length > 0) {
        updateResult = await this.foundryClient.query<FoundryUpdateActorResponse>(
          'maeinomatic-foundry-mcp.updateActor',
          {
            identifier: partyGroup.id,
            updates: stagedMutation.updates,
            reason: workflowReason,
          } satisfies FoundryUpdateActorRequest
        );
      }

      const stagedBeforeCurrency = Object.fromEntries(
        Object.keys(stagedMutation.awardedCurrency).map(denomination => [
          denomination,
          this.getDnD5eCurrencyState(partyGroupData, denomination).current,
        ])
      );
      const stagedAfterCurrency = Object.fromEntries(
        Object.entries(stagedBeforeCurrency).map(([denomination, current]) => [
          denomination,
          current + (stagedMutation.awardedCurrency[denomination] ?? 0),
        ])
      );

      return {
        ...workflowMetadata,
        success: true,
        workflowStatus: 'staged',
        awardSource: parsed.awardSource,
        awardTarget: parsed.awardTarget,
        partyGroup: {
          id: partyGroupData.id,
          name: partyGroupData.name,
          type: partyGroupData.type,
        },
        stagedAward: {
          ...(stagedMutation.experienceSummary
            ? { experiencePoints: stagedMutation.experienceSummary.awarded }
            : {}),
          ...(Object.keys(stagedMutation.awardedCurrency).length > 0
            ? { currency: stagedMutation.awardedCurrency }
            : {}),
        },
        stagedBefore: {
          ...(stagedMutation.experienceSummary
            ? { experiencePoints: stagedMutation.experienceSummary.before }
            : {}),
          ...(Object.keys(stagedBeforeCurrency).length > 0
            ? { currency: stagedBeforeCurrency }
            : {}),
        },
        stagedAfter: {
          ...(stagedMutation.experienceSummary
            ? { experiencePoints: stagedMutation.experienceSummary.after }
            : {}),
          ...(Object.keys(stagedAfterCurrency).length > 0 ? { currency: stagedAfterCurrency } : {}),
        },
        ...(updateResult ? { updatedFields: updateResult.updatedFields } : {}),
      };
    }

    const recipients =
      parsed.awardTarget === 'party-characters'
        ? this.normalizeNamedEntities(
            await this.foundryClient.query<unknown[]>(
              'maeinomatic-foundry-mcp.getPartyCharacters',
              {}
            )
          )
        : parsed.characterIdentifiers!.map(identifier => ({
            id: identifier,
            name: identifier,
          }));

    if (recipients.length === 0) {
      throw new Error(
        parsed.awardTarget === 'party-characters'
          ? 'No party characters were found to receive the DnD5e award.'
          : 'No explicit character targets were provided for the DnD5e award.'
      );
    }

    let partyGroupData: CharacterInfoResponse | null = null;
    let partyGroupSummary: {
      id: string;
      name: string;
      type: string;
    } | null = null;
    const partyGroupUpdates: Record<string, unknown> = {};

    const stagedBefore: Record<string, unknown> = {};
    const stagedAfter: Record<string, unknown> = {};
    const stagedConsumed: Record<string, unknown> = {};
    const requestedButUnavailable: Record<string, unknown> = {};

    let xpPerRecipient = 0;
    let xpUndistributed = 0;
    let xpActualDistributed = 0;

    if (parsed.experiencePoints !== undefined) {
      if (parsed.awardSource === 'staged-party-group') {
        const partyGroup = await this.resolvePrimaryPartyGroup({
          ...(parsed.partyIdentifier !== undefined
            ? { partyIdentifier: parsed.partyIdentifier }
            : {}),
        });
        partyGroupData = await this.getCharacterData(partyGroup.id);
        partyGroupSummary = {
          id: partyGroupData.id,
          name: partyGroupData.name,
          type: partyGroupData.type,
        };

        const xpState = this.getDnD5eExperienceState(partyGroupData);
        if (!xpState) {
          throw new Error(
            `Party group "${partyGroupData.name}" does not expose a supported DnD5e experience field for staged awards.`
          );
        }

        const stagedDistribution = this.distributeStagedAwardAmount({
          requestedAmount: parsed.experiencePoints,
          availableAmount: xpState.current,
          recipientCount: recipients.length,
          mode: parsed.distributionMode,
        });

        xpPerRecipient = stagedDistribution.perRecipient;
        xpActualDistributed = stagedDistribution.actualDistributed;
        xpUndistributed = Math.max(
          0,
          Math.min(stagedDistribution.requestedTotal, xpState.current) -
            stagedDistribution.actualDistributed
        );

        stagedBefore.experiencePoints = xpState.current;
        stagedAfter.experiencePoints = stagedDistribution.availableAfter;
        if (stagedDistribution.actualDistributed > 0) {
          stagedConsumed.experiencePoints = stagedDistribution.actualDistributed;
          partyGroupUpdates[xpState.updatePath] = stagedDistribution.availableAfter;
        }
        if (stagedDistribution.unavailable > 0) {
          requestedButUnavailable.experiencePoints = stagedDistribution.unavailable;
          warnings.push(
            `The staged party award only had ${xpState.current} XP available, so ${stagedDistribution.actualDistributed} XP was distributed and ${stagedDistribution.unavailable} requested XP could not be granted.`
          );
        }
        if (xpUndistributed > 0) {
          warnings.push(
            `The staged party award retained ${xpUndistributed} XP on the party group actor because the distribution could not divide it evenly across ${recipients.length} recipients.`
          );
        }
      } else {
        const distribution = this.distributeAwardAmount(
          parsed.experiencePoints,
          recipients.length,
          parsed.distributionMode
        );
        xpPerRecipient = distribution.perRecipient;
        xpUndistributed = distribution.remainder;
        xpActualDistributed =
          parsed.distributionMode === 'split' && Number.isInteger(parsed.experiencePoints)
            ? distribution.perRecipient * recipients.length
            : distribution.perRecipient * recipients.length;

        if (parsed.distributionMode === 'split' && distribution.remainder > 0) {
          warnings.push(
            `The DnD5e award workflow left ${distribution.remainder} XP undistributed after splitting directly across character actors. Stage the award on a primary party group actor first if you want to preserve split remainders for later distribution.`
          );
        }
      }
    }

    const currencyPerRecipient: Record<string, number> = {};
    const undistributedCurrency: Record<string, number> = {};
    const actualDistributedCurrency: Record<string, number> = {};

    for (const [denomination, amount] of Object.entries(parsed.currency ?? {})) {
      if (parsed.awardSource === 'staged-party-group') {
        if (!partyGroupData) {
          const partyGroup = await this.resolvePrimaryPartyGroup({
            ...(parsed.partyIdentifier !== undefined
              ? { partyIdentifier: parsed.partyIdentifier }
              : {}),
          });
          partyGroupData = await this.getCharacterData(partyGroup.id);
          partyGroupSummary = {
            id: partyGroupData.id,
            name: partyGroupData.name,
            type: partyGroupData.type,
          };
        }

        const currencyState = this.getDnD5eCurrencyState(partyGroupData, denomination);
        const stagedDistribution = this.distributeStagedAwardAmount({
          requestedAmount: amount,
          availableAmount: currencyState.current,
          recipientCount: recipients.length,
          mode: parsed.distributionMode,
        });

        currencyPerRecipient[denomination] = stagedDistribution.perRecipient;
        actualDistributedCurrency[denomination] = stagedDistribution.actualDistributed;

        const retainedRemainder = Math.max(
          0,
          Math.min(stagedDistribution.requestedTotal, currencyState.current) -
            stagedDistribution.actualDistributed
        );
        if (retainedRemainder > 0) {
          undistributedCurrency[denomination] = retainedRemainder;
          warnings.push(
            `The staged party award retained ${retainedRemainder} ${denomination} on the party group actor because the distribution could not divide it evenly across ${recipients.length} recipients.`
          );
        }
        if (stagedDistribution.unavailable > 0) {
          requestedButUnavailable.currency = {
            ...(this.toRecord(requestedButUnavailable.currency) ?? {}),
            [denomination]: stagedDistribution.unavailable,
          };
          warnings.push(
            `The staged party award only had ${currencyState.current} ${denomination} available, so ${stagedDistribution.actualDistributed} ${denomination} was distributed and ${stagedDistribution.unavailable} requested ${denomination} could not be granted.`
          );
        }

        stagedBefore.currency = {
          ...(this.toRecord(stagedBefore.currency) ?? {}),
          [denomination]: currencyState.current,
        };
        stagedAfter.currency = {
          ...(this.toRecord(stagedAfter.currency) ?? {}),
          [denomination]: stagedDistribution.availableAfter,
        };
        if (stagedDistribution.actualDistributed > 0) {
          stagedConsumed.currency = {
            ...(this.toRecord(stagedConsumed.currency) ?? {}),
            [denomination]: stagedDistribution.actualDistributed,
          };
          partyGroupUpdates[currencyState.updatePath] = stagedDistribution.availableAfter;
        }
      } else {
        const distribution = this.distributeAwardAmount(
          amount,
          recipients.length,
          parsed.distributionMode
        );
        currencyPerRecipient[denomination] = distribution.perRecipient;
        actualDistributedCurrency[denomination] = distribution.perRecipient * recipients.length;

        if (distribution.remainder > 0) {
          undistributedCurrency[denomination] = distribution.remainder;
        }
      }
    }

    if (parsed.awardSource === 'new-award' && Object.keys(undistributedCurrency).length > 0) {
      warnings.push(
        `The DnD5e award workflow left split currency undistributed after direct character updates (${Object.entries(
          undistributedCurrency
        )
          .map(([denomination, amount]) => `${amount} ${denomination}`)
          .join(
            ', '
          )}). Stage the award on a primary party group actor first if you want to preserve those remainders for later distribution.`
      );
    }

    if (
      parsed.awardSource === 'staged-party-group' &&
      xpActualDistributed === 0 &&
      Object.values(actualDistributedCurrency).every(amount => amount === 0)
    ) {
      return {
        ...workflowMetadata,
        success: false,
        workflowStatus: 'nothing-to-distribute',
        awardSource: parsed.awardSource,
        awardTarget: parsed.awardTarget,
        distributionMode: parsed.distributionMode,
        recipientCount: recipients.length,
        ...(partyGroupSummary ? { partyGroup: partyGroupSummary } : {}),
        ...(Object.keys(stagedBefore).length > 0 ? { stagedBefore } : {}),
        ...(Object.keys(requestedButUnavailable).length > 0 ? { requestedButUnavailable } : {}),
        warnings:
          warnings.length > 0
            ? warnings
            : ['No staged party resources were available to distribute.'],
      };
    }

    const recipientAwardCurrency = Object.fromEntries(
      Object.entries(currencyPerRecipient).filter(([, amount]) => amount > 0)
    );
    const awardedRecipients: UnknownRecord[] = [];
    const appliedRecipientRollbacks: Array<{
      identifier: string;
      actorName: string;
      updates: Record<string, unknown>;
    }> = [];

    for (const recipient of recipients) {
      try {
        const characterData = await this.getCharacterData(recipient.id);
        if (characterData.type !== 'character') {
          throw new Error(
            `Actor "${characterData.name}" is type "${characterData.type}", not character.`
          );
        }

        const recipientMutation = this.buildDnD5eAwardUpdates({
          actorData: characterData,
          ...(xpPerRecipient > 0 ? { experiencePoints: xpPerRecipient } : {}),
          ...(Object.keys(recipientAwardCurrency).length > 0
            ? { currency: recipientAwardCurrency }
            : {}),
        });

        let updateResult: FoundryUpdateActorResponse | null = null;
        if (Object.keys(recipientMutation.updates).length > 0) {
          updateResult = await this.foundryClient.query<FoundryUpdateActorResponse>(
            'maeinomatic-foundry-mcp.updateActor',
            {
              identifier: recipient.id,
              updates: recipientMutation.updates,
              reason: workflowReason,
            } satisfies FoundryUpdateActorRequest
          );

          if (parsed.awardSource === 'staged-party-group') {
            appliedRecipientRollbacks.push({
              identifier: recipient.id,
              actorName: characterData.name,
              updates: this.getRollbackUpdates(characterData, recipientMutation.updates),
            });
          }
        }

        const validation =
          parsed.validateCharacterBuilds && recipientMutation.experienceSummary
            ? await this.foundryClient.query<FoundryValidateCharacterBuildResponse>(
                'maeinomatic-foundry-mcp.validateCharacterBuild',
                {
                  actorIdentifier: recipient.id,
                } satisfies FoundryValidateCharacterBuildRequest
              )
            : null;

        awardedRecipients.push({
          actor: {
            id: characterData.id,
            name: characterData.name,
            type: characterData.type,
          },
          awarded: {
            ...(recipientMutation.experienceSummary
              ? { experiencePoints: recipientMutation.experienceSummary.awarded }
              : {}),
            ...(Object.keys(recipientMutation.awardedCurrency).length > 0
              ? { currency: recipientMutation.awardedCurrency }
              : {}),
          },
          ...(recipientMutation.experienceSummary
            ? { experience: recipientMutation.experienceSummary }
            : {}),
          ...(updateResult ? { updatedFields: updateResult.updatedFields } : {}),
          ...(validation
            ? {
                validation: {
                  summary: validation.summary,
                  issues: validation.issues,
                  ...(validation.recommendations
                    ? { recommendations: validation.recommendations }
                    : {}),
                  ...(validation.outstandingAdvancements
                    ? { outstandingAdvancements: validation.outstandingAdvancements }
                    : {}),
                },
              }
            : {}),
        });
      } catch (error) {
        const rollbackErrors =
          parsed.awardSource === 'staged-party-group'
            ? await this.rollbackAwardActorUpdates({
                rollbacks: appliedRecipientRollbacks,
                reason: `${workflowReason} rollback`,
              })
            : [];

        return {
          ...workflowMetadata,
          success: false,
          partialSuccess:
            parsed.awardSource === 'staged-party-group'
              ? awardedRecipients.length > 0 && rollbackErrors.length > 0
              : awardedRecipients.length > 0,
          workflowStatus:
            parsed.awardSource === 'staged-party-group' ? 'rolled-back' : 'partial-failure',
          awardSource: parsed.awardSource,
          awardTarget: parsed.awardTarget,
          distributionMode: parsed.distributionMode,
          recipientCount: recipients.length,
          completedRecipients: awardedRecipients,
          failedRecipient: {
            id: recipient.id,
            name: recipient.name,
            error: error instanceof Error ? error.message : 'Unknown error',
          },
          ...(partyGroupSummary ? { partyGroup: partyGroupSummary } : {}),
          ...(rollbackErrors.length > 0 ? { rollbackErrors } : {}),
          ...(warnings.length > 0 ? { warnings } : {}),
        };
      }
    }

    let partyGroupUpdateResult: FoundryUpdateActorResponse | null = null;
    if (
      parsed.awardSource === 'staged-party-group' &&
      partyGroupSummary &&
      Object.keys(partyGroupUpdates).length > 0
    ) {
      try {
        partyGroupUpdateResult = await this.foundryClient.query<FoundryUpdateActorResponse>(
          'maeinomatic-foundry-mcp.updateActor',
          {
            identifier: partyGroupSummary.id,
            updates: partyGroupUpdates,
            reason: `${workflowReason} staged-distribution deduction`,
          } satisfies FoundryUpdateActorRequest
        );
      } catch (error) {
        const rollbackErrors = await this.rollbackAwardActorUpdates({
          rollbacks: appliedRecipientRollbacks,
          reason: `${workflowReason} rollback`,
        });

        return {
          ...workflowMetadata,
          success: false,
          partialSuccess: false,
          workflowStatus: 'rolled-back',
          awardSource: parsed.awardSource,
          awardTarget: parsed.awardTarget,
          distributionMode: parsed.distributionMode,
          recipientCount: recipients.length,
          partyGroup: partyGroupSummary,
          completedRecipients: awardedRecipients,
          failedRecipient: {
            id: partyGroupSummary.id,
            name: partyGroupSummary.name,
            error:
              error instanceof Error
                ? `Failed to deduct staged party resources: ${error.message}`
                : 'Failed to deduct staged party resources',
          },
          ...(Object.keys(stagedBefore).length > 0 ? { stagedBefore } : {}),
          ...(rollbackErrors.length > 0 ? { rollbackErrors } : {}),
          ...(warnings.length > 0 ? { warnings } : {}),
        };
      }
    }

    const verification = this.createAwardWorkflowVerification(awardedRecipients);

    return {
      ...workflowMetadata,
      success: true,
      workflowStatus: 'completed',
      awardSource: parsed.awardSource,
      awardTarget: parsed.awardTarget,
      distributionMode: parsed.distributionMode,
      recipientCount: recipients.length,
      totalAwarded: {
        ...(parsed.awardSource === 'staged-party-group'
          ? xpActualDistributed > 0
            ? { experiencePoints: xpActualDistributed }
            : {}
          : parsed.experiencePoints !== undefined
            ? { experiencePoints: parsed.experiencePoints }
            : {}),
        ...(parsed.awardSource === 'staged-party-group'
          ? Object.values(actualDistributedCurrency).some(amount => amount > 0)
            ? { currency: actualDistributedCurrency }
            : {}
          : parsed.currency !== undefined
            ? { currency: parsed.currency }
            : {}),
      },
      perRecipientAward: {
        ...(xpPerRecipient > 0 ? { experiencePoints: xpPerRecipient } : {}),
        ...(Object.keys(currencyPerRecipient).some(
          denomination => currencyPerRecipient[denomination] > 0
        )
          ? {
              currency: Object.fromEntries(
                Object.entries(currencyPerRecipient).filter(([, amount]) => amount > 0)
              ),
            }
          : {}),
      },
      ...(xpUndistributed > 0 ? { undistributedExperiencePoints: xpUndistributed } : {}),
      ...(Object.keys(undistributedCurrency).length > 0 ? { undistributedCurrency } : {}),
      ...(Object.keys(requestedButUnavailable).length > 0 ? { requestedButUnavailable } : {}),
      ...(partyGroupSummary ? { partyGroup: partyGroupSummary } : {}),
      ...(Object.keys(stagedBefore).length > 0 ? { stagedBefore } : {}),
      ...(Object.keys(stagedConsumed).length > 0 ? { stagedConsumed } : {}),
      ...(Object.keys(stagedAfter).length > 0 ? { stagedAfter } : {}),
      ...(partyGroupUpdateResult
        ? { partyGroupUpdatedFields: partyGroupUpdateResult.updatedFields }
        : {}),
      recipients: awardedRecipients,
      ...(verification ? { verification } : {}),
      ...(warnings.length > 0 ? { warnings } : {}),
    };
  }

  async handleRunDnD5eSummonActivity(args: unknown): Promise<UnknownRecord> {
    const schema = z.object({
      actorIdentifier: z.string().min(1, 'Actor identifier cannot be empty'),
      itemIdentifier: z.string().min(1, 'Item identifier cannot be empty'),
      activityIdentifier: z.string().min(1).optional(),
      profileId: z.string().min(1).optional(),
      placementType: z.enum(['near-owner', 'random', 'grid', 'center', 'coordinates']).optional(),
      coordinates: z
        .array(
          z.object({
            x: z.number(),
            y: z.number(),
          })
        )
        .optional(),
      hidden: z.boolean().optional(),
      reason: z.string().min(1).optional(),
    });

    const parsed = schema.parse(args);

    this.logger.info('Running DnD5e summon activity workflow', parsed);

    const gameSystem = await this.getGameSystem();
    if (gameSystem !== 'dnd5e') {
      throw new Error(
        'UNSUPPORTED_CAPABILITY: run-dnd5e-summon-activity is only available when the active system is dnd5e.'
      );
    }

    const workflowMetadata = this.createDnD5eWorkflowMetadata('run-dnd5e-summon-activity');

    const result = await this.foundryClient.query<FoundryRunDnD5eSummonActivityResponse>(
      'maeinomatic-foundry-mcp.runDnD5eSummonActivity',
      {
        actorIdentifier: parsed.actorIdentifier,
        itemIdentifier: parsed.itemIdentifier,
        ...(parsed.activityIdentifier !== undefined
          ? { activityIdentifier: parsed.activityIdentifier }
          : {}),
        ...(parsed.profileId !== undefined ? { profileId: parsed.profileId } : {}),
        ...(parsed.placementType !== undefined ? { placementType: parsed.placementType } : {}),
        ...(parsed.coordinates !== undefined ? { coordinates: parsed.coordinates } : {}),
        ...(parsed.hidden !== undefined ? { hidden: parsed.hidden } : {}),
        ...(parsed.reason !== undefined ? { reason: parsed.reason } : {}),
      } satisfies FoundryRunDnD5eSummonActivityRequest
    );

    const hasActivityDetails = (result.activityId ?? result.activityName) !== undefined;
    const hasProfileDetails = (result.profileId ?? result.profileName) !== undefined;

    if (result.workflowStatus !== 'completed') {
      return {
        ...workflowMetadata,
        success: false,
        workflowStatus: result.workflowStatus,
        requiresChoices: result.requiresChoices ?? true,
        actor: {
          id: result.actorId,
          name: result.actorName,
          type: result.actorType,
        },
        item: {
          id: result.itemId,
          name: result.itemName,
          type: result.itemType,
        },
        ...(hasActivityDetails
          ? {
              activity: {
                ...(result.activityId ? { id: result.activityId } : {}),
                ...(result.activityName ? { name: result.activityName } : {}),
              },
            }
          : {}),
        ...(result.availableActivities ? { availableActivities: result.availableActivities } : {}),
        ...(result.availableProfiles ? { availableProfiles: result.availableProfiles } : {}),
        unresolved: {
          kind: result.availableProfiles
            ? 'summon-profile'
            : result.availableActivities
              ? 'summon-activity'
              : 'summon-choice',
          requiresChoices: result.requiresChoices ?? true,
          ...(result.availableActivities
            ? { availableActivities: result.availableActivities }
            : {}),
          ...(result.availableProfiles ? { availableProfiles: result.availableProfiles } : {}),
          ...(result.message ? { message: result.message } : {}),
        },
        ...(result.message ? { message: result.message } : {}),
        ...(result.warnings ? { warnings: result.warnings } : {}),
      };
    }

    return {
      ...workflowMetadata,
      success: true,
      workflowStatus: result.workflowStatus,
      actor: {
        id: result.actorId,
        name: result.actorName,
        type: result.actorType,
      },
      item: {
        id: result.itemId,
        name: result.itemName,
        type: result.itemType,
      },
      ...(hasActivityDetails
        ? {
            activity: {
              ...(result.activityId ? { id: result.activityId } : {}),
              ...(result.activityName ? { name: result.activityName } : {}),
            },
          }
        : {}),
      ...(hasProfileDetails
        ? {
            profile: {
              ...(result.profileId ? { id: result.profileId } : {}),
              ...(result.profileName ? { name: result.profileName } : {}),
            },
          }
        : {}),
      tokensPlaced: result.tokensPlaced ?? 0,
      tokenIds: result.tokenIds ?? [],
      ...(result.tokenNames ? { tokenNames: result.tokenNames } : {}),
      ...(result.message ? { message: result.message } : {}),
      ...(result.warnings ? { warnings: result.warnings } : {}),
    };
  }

  async handleRunDnD5eTransformActivityWorkflow(args: unknown): Promise<UnknownRecord> {
    const schema = z.object({
      actorIdentifier: z.string().min(1, 'Actor identifier cannot be empty'),
      itemIdentifier: z.string().min(1, 'Item identifier cannot be empty'),
      activityIdentifier: z.string().min(1).optional(),
      reason: z.string().min(1).optional(),
    });

    const parsed = schema.parse(args);

    this.logger.info('Running DnD5e transform activity workflow', parsed);

    const gameSystem = await this.getGameSystem();
    if (gameSystem !== 'dnd5e') {
      throw new Error(
        'UNSUPPORTED_CAPABILITY: run-dnd5e-transform-activity-workflow is only available when the active system is dnd5e.'
      );
    }

    const workflowMetadata = this.createDnD5eWorkflowMetadata(
      'run-dnd5e-transform-activity-workflow'
    );

    const result = await this.foundryClient.query<FoundryRunDnD5eTransformActivityResponse>(
      'maeinomatic-foundry-mcp.runDnD5eTransformActivity',
      {
        actorIdentifier: parsed.actorIdentifier,
        itemIdentifier: parsed.itemIdentifier,
        ...(parsed.activityIdentifier !== undefined
          ? { activityIdentifier: parsed.activityIdentifier }
          : {}),
        ...(parsed.reason !== undefined ? { reason: parsed.reason } : {}),
      } satisfies FoundryRunDnD5eTransformActivityRequest
    );

    const hasActivityDetails = (result.activityId ?? result.activityName) !== undefined;

    if (result.workflowStatus !== 'completed') {
      return {
        ...workflowMetadata,
        success: false,
        workflowStatus: result.workflowStatus,
        requiresChoices: result.requiresChoices ?? true,
        actor: {
          id: result.actorId,
          name: result.actorName,
          type: result.actorType,
        },
        item: {
          id: result.itemId,
          name: result.itemName,
          type: result.itemType,
        },
        ...(hasActivityDetails
          ? {
              activity: {
                ...(result.activityId ? { id: result.activityId } : {}),
                ...(result.activityName ? { name: result.activityName } : {}),
              },
            }
          : {}),
        ...(result.availableActivities ? { availableActivities: result.availableActivities } : {}),
        unresolved: {
          kind: result.availableActivities ? 'transform-activity' : 'transform-choice',
          requiresChoices: result.requiresChoices ?? true,
          ...(result.availableActivities
            ? { availableActivities: result.availableActivities }
            : {}),
          ...(result.message ? { message: result.message } : {}),
        },
        ...(result.message ? { message: result.message } : {}),
        ...(result.warnings ? { warnings: result.warnings } : {}),
      };
    }

    return {
      ...workflowMetadata,
      success: true,
      workflowStatus: result.workflowStatus,
      actor: {
        id: result.actorId,
        name: result.actorName,
        type: result.actorType,
      },
      item: {
        id: result.itemId,
        name: result.itemName,
        type: result.itemType,
      },
      ...(hasActivityDetails
        ? {
            activity: {
              ...(result.activityId ? { id: result.activityId } : {}),
              ...(result.activityName ? { name: result.activityName } : {}),
            },
          }
        : {}),
      ...((result.sourceActorId ?? result.sourceActorName)
        ? {
            sourceActor: {
              ...(result.sourceActorId ? { id: result.sourceActorId } : {}),
              ...(result.sourceActorName ? { name: result.sourceActorName } : {}),
              ...(result.sourceActorType ? { type: result.sourceActorType } : {}),
            },
          }
        : {}),
      ...((result.transformedActorId ?? result.transformedActorName)
        ? {
            transformedActor: {
              ...(result.transformedActorId ? { id: result.transformedActorId } : {}),
              ...(result.transformedActorName ? { name: result.transformedActorName } : {}),
              ...(result.transformedActorType ? { type: result.transformedActorType } : {}),
            },
          }
        : {}),
      ...(result.tokenIds ? { tokenIds: result.tokenIds } : {}),
      ...(result.tokenNames ? { tokenNames: result.tokenNames } : {}),
      ...(result.message ? { message: result.message } : {}),
      ...(result.warnings ? { warnings: result.warnings } : {}),
    };
  }

  async handleOrganizeDnD5eSpellbookWorkflow(args: unknown): Promise<UnknownRecord> {
    const schema = z.object({
      actorIdentifier: z.string().min(1, 'Actor identifier cannot be empty'),
      sourceClassAssignments: z
        .array(
          z.object({
            spellIdentifier: z.string().min(1, 'Spell identifier cannot be empty'),
            classIdentifier: z.string().min(1, 'Class identifier cannot be empty'),
          })
        )
        .optional(),
      spellPreparationPlans: z.array(createSpellPreparationPlanSchema()).optional(),
      autoFixSourceClasses: z.boolean().default(true),
      autoFixPreparationMismatches: z.boolean().default(true),
      reason: z.string().min(1).optional(),
    });

    const parsed = schema.parse(args);

    return this.spellbookService.handleOrganizeDnD5eSpellbookWorkflow({
      actorIdentifier: parsed.actorIdentifier,
      ...(parsed.sourceClassAssignments !== undefined
        ? { sourceClassAssignments: parsed.sourceClassAssignments }
        : {}),
      ...(parsed.spellPreparationPlans !== undefined
        ? {
            spellPreparationPlans: parsed.spellPreparationPlans.map(plan => ({
              mode: plan.mode,
              spellIdentifiers: plan.spellIdentifiers,
              ...(plan.sourceClass !== undefined ? { sourceClass: plan.sourceClass } : {}),
              ...(plan.reason !== undefined ? { reason: plan.reason } : {}),
            })),
          }
        : {}),
      autoFixSourceClasses: parsed.autoFixSourceClasses,
      autoFixPreparationMismatches: parsed.autoFixPreparationMismatches,
      ...(parsed.reason !== undefined ? { reason: parsed.reason } : {}),
    });
  }

  async handleCreateCharacterCompanion(args: unknown): Promise<UnknownRecord> {
    const schema = z
      .object({
        ownerActorIdentifier: z.string().min(1, 'Owner actor identifier cannot be empty'),
        role: z.enum(['companion', 'familiar']),
        sourceUuid: z.string().min(1).optional(),
        existingActorIdentifier: z.string().min(1).optional(),
        customName: z.string().min(1).optional(),
        addToScene: z.boolean().default(false),
        placement: z
          .object({
            type: z.enum(['near-owner', 'random', 'grid', 'center', 'coordinates']).optional(),
            coordinates: z
              .array(
                z.object({
                  x: z.number(),
                  y: z.number(),
                })
              )
              .optional(),
          })
          .optional(),
        syncOwnership: z.boolean().optional(),
        notes: z.string().min(1).optional(),
      })
      .refine(
        value => (value.sourceUuid !== undefined) !== (value.existingActorIdentifier !== undefined),
        'Provide exactly one of sourceUuid or existingActorIdentifier'
      );

    const parsed = schema.parse(args);
    const normalizedPlacement =
      parsed.placement !== undefined
        ? {
            ...(parsed.placement.type !== undefined ? { type: parsed.placement.type } : {}),
            ...(parsed.placement.coordinates !== undefined
              ? { coordinates: parsed.placement.coordinates }
              : {}),
          }
        : undefined;
    const result = await this.foundryClient.query<FoundryCreateCharacterCompanionResponse>(
      'maeinomatic-foundry-mcp.createCharacterCompanion',
      {
        ownerActorIdentifier: parsed.ownerActorIdentifier,
        role: parsed.role,
        ...(parsed.sourceUuid !== undefined ? { sourceUuid: parsed.sourceUuid } : {}),
        ...(parsed.existingActorIdentifier !== undefined
          ? { existingActorIdentifier: parsed.existingActorIdentifier }
          : {}),
        ...(parsed.customName !== undefined ? { customName: parsed.customName } : {}),
        addToScene: parsed.addToScene,
        ...(normalizedPlacement !== undefined ? { placement: normalizedPlacement } : {}),
        ...(parsed.syncOwnership !== undefined ? { syncOwnership: parsed.syncOwnership } : {}),
        ...(parsed.notes !== undefined ? { notes: parsed.notes } : {}),
      } satisfies FoundryCreateCharacterCompanionRequest
    );

    return {
      success: result.success,
      owner: {
        id: result.ownerActorId,
        name: result.ownerActorName,
      },
      companion: {
        id: result.companionActorId,
        name: result.companionActorName,
        type: result.companionActorType,
        role: result.role,
      },
      created: result.created,
      ...(result.sourceUuid ? { sourceUuid: result.sourceUuid } : {}),
      ...(result.linkedAt ? { linkedAt: result.linkedAt } : {}),
      ...(result.tokensPlaced !== undefined ? { tokensPlaced: result.tokensPlaced } : {}),
      ...(result.tokenIds ? { tokenIds: result.tokenIds } : {}),
      ...(result.warnings ? { warnings: result.warnings } : {}),
    };
  }

  async handleListCharacterCompanions(args: unknown): Promise<UnknownRecord> {
    const schema = z.object({
      ownerActorIdentifier: z.string().min(1, 'Owner actor identifier cannot be empty'),
      role: z.enum(['companion', 'familiar']).optional(),
    });

    const parsed = schema.parse(args);
    const result = await this.foundryClient.query<FoundryListCharacterCompanionsResponse>(
      'maeinomatic-foundry-mcp.listCharacterCompanions',
      {
        ownerActorIdentifier: parsed.ownerActorIdentifier,
        ...(parsed.role !== undefined ? { role: parsed.role } : {}),
      } satisfies FoundryListCharacterCompanionsRequest
    );

    return {
      success: true,
      owner: {
        id: result.ownerActorId,
        name: result.ownerActorName,
      },
      companions: result.companions,
      totalCompanions: result.totalCompanions,
    };
  }

  async handleSummonCharacterCompanion(args: unknown): Promise<UnknownRecord> {
    const schema = z.object({
      ownerActorIdentifier: z.string().min(1, 'Owner actor identifier cannot be empty'),
      companionIdentifier: z.string().min(1, 'Companion identifier cannot be empty'),
      placementType: z.enum(['near-owner', 'random', 'grid', 'center', 'coordinates']).optional(),
      coordinates: z
        .array(
          z.object({
            x: z.number(),
            y: z.number(),
          })
        )
        .optional(),
      hidden: z.boolean().optional(),
      reuseExisting: z.boolean().optional(),
    });

    const parsed = schema.parse(args);
    const result = await this.foundryClient.query<FoundrySummonCharacterCompanionResponse>(
      'maeinomatic-foundry-mcp.summonCharacterCompanion',
      {
        ownerActorIdentifier: parsed.ownerActorIdentifier,
        companionIdentifier: parsed.companionIdentifier,
        ...(parsed.placementType !== undefined ? { placementType: parsed.placementType } : {}),
        ...(parsed.coordinates !== undefined ? { coordinates: parsed.coordinates } : {}),
        ...(parsed.hidden !== undefined ? { hidden: parsed.hidden } : {}),
        ...(parsed.reuseExisting !== undefined ? { reuseExisting: parsed.reuseExisting } : {}),
      } satisfies FoundrySummonCharacterCompanionRequest
    );

    return {
      success: result.success,
      owner: {
        id: result.ownerActorId,
        name: result.ownerActorName,
      },
      companion: {
        id: result.companionActorId,
        name: result.companionActorName,
        role: result.role,
      },
      tokensPlaced: result.tokensPlaced,
      tokenIds: result.tokenIds,
      ...(result.reusedExisting !== undefined ? { reusedExisting: result.reusedExisting } : {}),
      ...(result.warnings ? { warnings: result.warnings } : {}),
    };
  }

  async handleDismissCharacterCompanion(args: unknown): Promise<UnknownRecord> {
    const schema = z.object({
      ownerActorIdentifier: z.string().min(1, 'Owner actor identifier cannot be empty'),
      companionIdentifier: z.string().min(1).optional(),
      role: z.enum(['companion', 'familiar']).optional(),
      dismissAll: z.boolean().optional(),
    });

    const parsed = schema.parse(args);
    const result = await this.foundryClient.query<FoundryDismissCharacterCompanionResponse>(
      'maeinomatic-foundry-mcp.dismissCharacterCompanion',
      {
        ownerActorIdentifier: parsed.ownerActorIdentifier,
        ...(parsed.companionIdentifier !== undefined
          ? { companionIdentifier: parsed.companionIdentifier }
          : {}),
        ...(parsed.role !== undefined ? { role: parsed.role } : {}),
        ...(parsed.dismissAll !== undefined ? { dismissAll: parsed.dismissAll } : {}),
      } satisfies FoundryDismissCharacterCompanionRequest
    );

    return {
      success: result.success,
      owner: {
        id: result.ownerActorId,
        name: result.ownerActorName,
      },
      dismissedCompanions: result.dismissedCompanions,
      dismissedTokenCount: result.dismissedTokenCount,
      ...(result.warnings ? { warnings: result.warnings } : {}),
    };
  }

  async handleUpdateCharacterCompanionLink(args: unknown): Promise<UnknownRecord> {
    const schema = z.object({
      ownerActorIdentifier: z.string().min(1, 'Owner actor identifier cannot be empty'),
      companionIdentifier: z.string().min(1, 'Companion identifier cannot be empty'),
      role: z.enum(['companion', 'familiar']).optional(),
      notes: z.string().optional(),
      sourceUuid: z.string().optional(),
      syncSettings: z
        .object({
          syncOwnership: z.boolean().optional(),
          refreshFromSource: z.boolean().optional(),
          matchOwnerLevel: z.boolean().optional(),
          levelOffset: z.number().optional(),
        })
        .optional(),
    });

    const parsed = schema.parse(args);
    const syncSettings =
      parsed.syncSettings !== undefined
        ? {
            ...(parsed.syncSettings.syncOwnership !== undefined
              ? { syncOwnership: parsed.syncSettings.syncOwnership }
              : {}),
            ...(parsed.syncSettings.refreshFromSource !== undefined
              ? { refreshFromSource: parsed.syncSettings.refreshFromSource }
              : {}),
            ...(parsed.syncSettings.matchOwnerLevel !== undefined
              ? { matchOwnerLevel: parsed.syncSettings.matchOwnerLevel }
              : {}),
            ...(parsed.syncSettings.levelOffset !== undefined
              ? { levelOffset: parsed.syncSettings.levelOffset }
              : {}),
          }
        : undefined;
    const result = await this.foundryClient.query<FoundryUpdateCharacterCompanionLinkResponse>(
      'maeinomatic-foundry-mcp.updateCharacterCompanionLink',
      {
        ownerActorIdentifier: parsed.ownerActorIdentifier,
        companionIdentifier: parsed.companionIdentifier,
        ...(parsed.role !== undefined ? { role: parsed.role } : {}),
        ...(parsed.notes !== undefined ? { notes: parsed.notes } : {}),
        ...(parsed.sourceUuid !== undefined ? { sourceUuid: parsed.sourceUuid } : {}),
        ...(syncSettings && Object.keys(syncSettings).length > 0 ? { syncSettings } : {}),
      } satisfies FoundryUpdateCharacterCompanionLinkRequest
    );

    return {
      success: result.success,
      owner: {
        id: result.ownerActorId,
        name: result.ownerActorName,
      },
      companion: {
        id: result.companionActorId,
        name: result.companionActorName,
        type: result.companionActorType,
        role: result.role,
      },
      updatedFields: result.updatedFields,
      ...(result.notes !== undefined ? { notes: result.notes } : {}),
      ...(result.sourceUuid ? { sourceUuid: result.sourceUuid } : {}),
      ...(result.linkedAt ? { linkedAt: result.linkedAt } : {}),
      ...(result.summonDefaults ? { summonDefaults: result.summonDefaults } : {}),
      ...(result.syncSettings ? { syncSettings: result.syncSettings } : {}),
      ...(result.warnings ? { warnings: result.warnings } : {}),
    };
  }

  async handleConfigureCharacterCompanionSummon(args: unknown): Promise<UnknownRecord> {
    const schema = z.object({
      ownerActorIdentifier: z.string().min(1, 'Owner actor identifier cannot be empty'),
      companionIdentifier: z.string().min(1, 'Companion identifier cannot be empty'),
      placementType: z.enum(['near-owner', 'random', 'grid', 'center', 'coordinates']).optional(),
      coordinates: z
        .array(
          z.object({
            x: z.number(),
            y: z.number(),
          })
        )
        .optional(),
      hidden: z.boolean().optional(),
      reuseExisting: z.boolean().optional(),
    });

    const parsed = schema.parse(args);
    const result = await this.foundryClient.query<FoundryConfigureCharacterCompanionSummonResponse>(
      'maeinomatic-foundry-mcp.configureCharacterCompanionSummon',
      {
        ownerActorIdentifier: parsed.ownerActorIdentifier,
        companionIdentifier: parsed.companionIdentifier,
        ...(parsed.placementType !== undefined ? { placementType: parsed.placementType } : {}),
        ...(parsed.coordinates !== undefined ? { coordinates: parsed.coordinates } : {}),
        ...(parsed.hidden !== undefined ? { hidden: parsed.hidden } : {}),
        ...(parsed.reuseExisting !== undefined ? { reuseExisting: parsed.reuseExisting } : {}),
      } satisfies FoundryConfigureCharacterCompanionSummonRequest
    );

    return {
      success: result.success,
      owner: {
        id: result.ownerActorId,
        name: result.ownerActorName,
      },
      companion: {
        id: result.companionActorId,
        name: result.companionActorName,
        role: result.role,
      },
      summonDefaults: result.summonDefaults,
      updatedFields: result.updatedFields,
    };
  }

  async handleUnlinkCharacterCompanion(args: unknown): Promise<UnknownRecord> {
    const schema = z.object({
      ownerActorIdentifier: z.string().min(1, 'Owner actor identifier cannot be empty'),
      companionIdentifier: z.string().min(1, 'Companion identifier cannot be empty'),
    });

    const parsed = schema.parse(args);
    const result = await this.foundryClient.query<FoundryUnlinkCharacterCompanionResponse>(
      'maeinomatic-foundry-mcp.unlinkCharacterCompanion',
      {
        ownerActorIdentifier: parsed.ownerActorIdentifier,
        companionIdentifier: parsed.companionIdentifier,
      } satisfies FoundryUnlinkCharacterCompanionRequest
    );

    return {
      success: result.success,
      owner: {
        id: result.ownerActorId,
        name: result.ownerActorName,
      },
      companion: {
        id: result.companionActorId,
        name: result.companionActorName,
        role: result.role,
      },
      unlinked: result.unlinked,
    };
  }

  async handleDeleteCharacterCompanion(args: unknown): Promise<UnknownRecord> {
    const schema = z.object({
      ownerActorIdentifier: z.string().min(1, 'Owner actor identifier cannot be empty'),
      companionIdentifier: z.string().min(1, 'Companion identifier cannot be empty'),
      dismissSceneTokens: z.boolean().optional(),
    });

    const parsed = schema.parse(args);
    const result = await this.foundryClient.query<FoundryDeleteCharacterCompanionResponse>(
      'maeinomatic-foundry-mcp.deleteCharacterCompanion',
      {
        ownerActorIdentifier: parsed.ownerActorIdentifier,
        companionIdentifier: parsed.companionIdentifier,
        ...(parsed.dismissSceneTokens !== undefined
          ? { dismissSceneTokens: parsed.dismissSceneTokens }
          : {}),
      } satisfies FoundryDeleteCharacterCompanionRequest
    );

    return {
      success: result.success,
      owner: {
        id: result.ownerActorId,
        name: result.ownerActorName,
      },
      companion: {
        id: result.companionActorId,
        name: result.companionActorName,
        role: result.role,
      },
      actorDeleted: result.actorDeleted,
      dismissedTokenCount: result.dismissedTokenCount,
      ...(result.dismissedTokenIds ? { dismissedTokenIds: result.dismissedTokenIds } : {}),
      ...(result.warnings ? { warnings: result.warnings } : {}),
    };
  }

  async handleSyncCharacterCompanionProgression(args: unknown): Promise<UnknownRecord> {
    const schema = z.object({
      ownerActorIdentifier: z.string().min(1, 'Owner actor identifier cannot be empty'),
      companionIdentifier: z.string().min(1, 'Companion identifier cannot be empty'),
      syncOwnership: z.boolean().optional(),
      refreshFromSource: z.boolean().optional(),
      matchOwnerLevel: z.boolean().optional(),
      levelOffset: z.number().optional(),
    });

    const parsed = schema.parse(args);
    const result = await this.foundryClient.query<FoundrySyncCharacterCompanionProgressionResponse>(
      'maeinomatic-foundry-mcp.syncCharacterCompanionProgression',
      {
        ownerActorIdentifier: parsed.ownerActorIdentifier,
        companionIdentifier: parsed.companionIdentifier,
        ...(parsed.syncOwnership !== undefined ? { syncOwnership: parsed.syncOwnership } : {}),
        ...(parsed.refreshFromSource !== undefined
          ? { refreshFromSource: parsed.refreshFromSource }
          : {}),
        ...(parsed.matchOwnerLevel !== undefined
          ? { matchOwnerLevel: parsed.matchOwnerLevel }
          : {}),
        ...(parsed.levelOffset !== undefined ? { levelOffset: parsed.levelOffset } : {}),
      } satisfies FoundrySyncCharacterCompanionProgressionRequest
    );

    return {
      success: result.success,
      owner: {
        id: result.ownerActorId,
        name: result.ownerActorName,
      },
      companion: {
        id: result.companionActorId,
        name: result.companionActorName,
        role: result.role,
      },
      appliedOperations: result.appliedOperations,
      updatedFields: result.updatedFields,
      ...(result.warnings ? { warnings: result.warnings } : {}),
    };
  }

  async handlePreviewCharacterProgression(args: unknown): Promise<UnknownRecord> {
    const parsed = this.parseProgressionArgs(args);

    this.logger.info('Previewing character progression', parsed);

    return this.progressionService.handlePreviewCharacterProgression(parsed);
  }

  async handleGetCharacterAdvancementOptions(args: unknown): Promise<UnknownRecord> {
    const schema = z.object({
      characterIdentifier: z.string().min(1, 'Character identifier cannot be empty'),
      targetLevel: z.number().int().positive(),
      stepId: z.string().min(1, 'stepId cannot be empty'),
      classIdentifier: z.string().min(1).optional(),
      query: z.string().min(1).optional(),
      limit: z.number().int().positive().optional(),
    });

    const parsed = schema.parse(args);

    this.logger.info('Getting character advancement options', parsed);

    return this.progressionService.handleGetCharacterAdvancementOptions({
      characterIdentifier: parsed.characterIdentifier,
      targetLevel: parsed.targetLevel,
      stepId: parsed.stepId,
      ...(parsed.classIdentifier !== undefined ? { classIdentifier: parsed.classIdentifier } : {}),
      ...(parsed.query !== undefined ? { query: parsed.query } : {}),
      ...(parsed.limit !== undefined ? { limit: parsed.limit } : {}),
    });
  }

  async handleApplyCharacterAdvancementChoice(args: unknown): Promise<UnknownRecord> {
    const advancementChoiceSchema = createAdvancementChoiceSchema();

    const schema = z.object({
      characterIdentifier: z.string().min(1, 'Character identifier cannot be empty'),
      targetLevel: z.number().int().positive(),
      stepId: z.string().min(1, 'stepId cannot be empty'),
      classIdentifier: z.string().min(1).optional(),
      choice: advancementChoiceSchema,
    });

    const parsed = schema.parse(args);

    this.logger.info('Applying character advancement choice', parsed);

    const choice = normalizeAdvancementChoice(parsed.choice);

    return this.progressionService.handleApplyCharacterAdvancementChoice({
      characterIdentifier: parsed.characterIdentifier,
      targetLevel: parsed.targetLevel,
      stepId: parsed.stepId,
      ...(parsed.classIdentifier !== undefined ? { classIdentifier: parsed.classIdentifier } : {}),
      choice,
    });
  }

  async handleUpdateCharacterProgression(args: unknown): Promise<UnknownRecord> {
    const parsed = this.parseProgressionArgs(args);

    this.logger.info('Updating character progression', parsed);

    return this.progressionService.handleUpdateCharacterProgression(parsed);
  }

  async handleCompleteDnD5eLevelUpWorkflow(args: unknown): Promise<UnknownRecord> {
    const parsed = this.parseCompleteDnD5eLevelUpWorkflowArgs(args);

    this.logger.info('Running complete DnD5e level-up workflow', parsed);

    return this.progressionService.handleCompleteDnD5eLevelUpWorkflow(parsed);
  }

  async handleCreateDnD5eCharacterWorkflow(args: unknown): Promise<UnknownRecord> {
    const advancementSelectionSchema = createAdvancementSelectionSchema();
    const schema = z
      .object({
        sourceUuid: z.string().min(1, 'sourceUuid cannot be empty'),
        name: z.string().min(1, 'name cannot be empty'),
        targetLevel: z.number().int().positive(),
        classIdentifier: z.string().min(1).optional(),
        advancementSelections: z.array(advancementSelectionSchema).optional(),
        biography: z.string().min(1).optional(),
        addToScene: z.boolean().default(false),
        placement: z
          .object({
            type: z.enum(['random', 'grid', 'center', 'coordinates']).default('grid'),
            coordinates: z
              .array(
                z.object({
                  x: z.number(),
                  y: z.number(),
                })
              )
              .optional(),
          })
          .optional(),
      })
      .strict();

    const parsed = schema.parse(args);
    const gameSystem = await this.getGameSystem();
    if (gameSystem !== 'dnd5e') {
      throw new Error(
        'UNSUPPORTED_CAPABILITY: create-dnd5e-character-workflow is only available when the active system is dnd5e.'
      );
    }

    const source = parseCompendiumActorSourceUuid(parsed.sourceUuid);
    if (!source) {
      throw new Error(
        'sourceUuid must be a Compendium Actor UUID in the format Compendium.<pack>.<collection>.Actor.<id>'
      );
    }

    const creationResult = await this.foundryClient.query<FoundryActorCreationResult>(
      'maeinomatic-foundry-mcp.createActorFromCompendium',
      {
        packId: source.packId,
        itemId: source.documentId,
        customNames: [parsed.name],
        quantity: 1,
        addToScene: parsed.addToScene,
        ...(parsed.placement !== undefined ? { placement: parsed.placement } : {}),
      }
    );

    const actor = creationResult.actors?.[0];
    if (!actor?.id) {
      throw new Error('Failed to create actor from source UUID.');
    }

    if (parsed.biography !== undefined) {
      await this.foundryClient.query<FoundryUpdateActorResponse>(
        'maeinomatic-foundry-mcp.updateActor',
        {
          identifier: actor.id,
          updates: {
            'system.details.biography.value': parsed.biography,
          },
          reason: 'create-dnd5e-character-workflow biography update',
        }
      );
    }

    const workflowResult = await this.handleCompleteDnD5eLevelUpWorkflow({
      characterIdentifier: actor.id,
      targetLevel: parsed.targetLevel,
      ...(parsed.classIdentifier !== undefined ? { classIdentifier: parsed.classIdentifier } : {}),
      ...(parsed.advancementSelections !== undefined
        ? { advancementSelections: parsed.advancementSelections }
        : {}),
    });

    return {
      success:
        workflowResult &&
        typeof workflowResult === 'object' &&
        (workflowResult as Record<string, unknown>).success === true,
      linked: false,
      source: {
        sourceUuid: parsed.sourceUuid,
        packId: source.packId,
        itemId: source.documentId,
      },
      actor: {
        id: actor.id,
        name: actor.name,
        type: actor.type,
      },
      created: {
        addToScene: parsed.addToScene,
        ...(creationResult.tokensPlaced !== undefined
          ? { tokensPlaced: creationResult.tokensPlaced }
          : {}),
      },
      progression: workflowResult,
    };
  }

  private parseProgressionArgs(args: unknown): {
    characterIdentifier: string;
    targetLevel?: number;
    classIdentifier?: string;
    experiencePoints?: number;
    experienceSpent?: number;
    advancementSelections?: AdvancementSelectionInput[];
  } {
    const advancementSelectionSchema = createAdvancementSelectionSchema();
    const schema = z
      .object({
        characterIdentifier: z.string().min(1, 'Character identifier cannot be empty'),
        targetLevel: z.number().int().positive().optional(),
        classIdentifier: z.string().min(1).optional(),
        experiencePoints: z.number().int().nonnegative().optional(),
        experienceSpent: z.number().int().nonnegative().optional(),
        advancementSelections: z.array(advancementSelectionSchema).optional(),
      })
      .refine(
        value => value.targetLevel !== undefined || value.experiencePoints !== undefined,
        'Provide targetLevel or experiencePoints'
      );

    const parsed = schema.parse(args);
    return {
      characterIdentifier: parsed.characterIdentifier,
      ...(parsed.targetLevel !== undefined ? { targetLevel: parsed.targetLevel } : {}),
      ...(parsed.classIdentifier !== undefined ? { classIdentifier: parsed.classIdentifier } : {}),
      ...(parsed.experiencePoints !== undefined
        ? { experiencePoints: parsed.experiencePoints }
        : {}),
      ...(parsed.experienceSpent !== undefined ? { experienceSpent: parsed.experienceSpent } : {}),
      ...(parsed.advancementSelections !== undefined
        ? {
            advancementSelections: parsed.advancementSelections.map(selection => ({
              ...(selection.stepId !== undefined ? { stepId: selection.stepId } : {}),
              ...(selection.stepType !== undefined ? { stepType: selection.stepType } : {}),
              ...(selection.sourceItemId !== undefined
                ? { sourceItemId: selection.sourceItemId }
                : {}),
              ...(selection.sourceItemName !== undefined
                ? { sourceItemName: selection.sourceItemName }
                : {}),
              choice: normalizeAdvancementChoice(selection.choice),
            })),
          }
        : {}),
    };
  }

  private async runProgressionUpdateFlow(args: {
    characterIdentifier: string;
    targetLevel?: number;
    classIdentifier?: string;
    experiencePoints?: number;
    experienceSpent?: number;
    advancementSelections?: AdvancementSelectionInput[];
  }): Promise<UnknownRecord> {
    return this.progressionService.handleUpdateCharacterProgression(args);
  }

  private parseCompleteDnD5eLevelUpWorkflowArgs(args: unknown): {
    characterIdentifier: string;
    targetLevel: number;
    classIdentifier?: string;
    advancementSelections?: AdvancementSelectionInput[];
    optionQuery?: string;
    optionLimit: number;
  } {
    const advancementSelectionSchema = createAdvancementSelectionSchema();
    const schema = z.object({
      characterIdentifier: z.string().min(1, 'Character identifier cannot be empty'),
      targetLevel: z.number().int().positive(),
      classIdentifier: z.string().min(1).optional(),
      advancementSelections: z.array(advancementSelectionSchema).optional(),
      optionQuery: z.string().min(1).optional(),
      optionLimit: z.number().int().positive().max(50).default(25),
    });

    const parsed = schema.parse(args);
    return {
      characterIdentifier: parsed.characterIdentifier,
      targetLevel: parsed.targetLevel,
      ...(parsed.classIdentifier !== undefined ? { classIdentifier: parsed.classIdentifier } : {}),
      ...(parsed.advancementSelections !== undefined
        ? {
            advancementSelections: parsed.advancementSelections.map(selection => ({
              ...(selection.stepId !== undefined ? { stepId: selection.stepId } : {}),
              ...(selection.stepType !== undefined ? { stepType: selection.stepType } : {}),
              ...(selection.sourceItemId !== undefined
                ? { sourceItemId: selection.sourceItemId }
                : {}),
              ...(selection.sourceItemName !== undefined
                ? { sourceItemName: selection.sourceItemName }
                : {}),
              choice: normalizeAdvancementChoice(selection.choice),
            })),
          }
        : {}),
      ...(parsed.optionQuery !== undefined ? { optionQuery: parsed.optionQuery } : {}),
      optionLimit: parsed.optionLimit,
    };
  }

  private mergeWarnings(...warningSets: Array<string[] | undefined>): string[] {
    return Array.from(
      new Set(
        warningSets.flatMap(warnings => warnings ?? []).filter(warning => warning.trim().length > 0)
      )
    );
  }

  private createDnD5eWorkflowMetadata(name: string): UnknownRecord {
    return {
      workflow: {
        name,
        system: 'dnd5e',
      },
    };
  }

  private createCharacterBuildVerification(
    validation: FoundryValidateCharacterBuildResponse
  ): UnknownRecord {
    return {
      summary: validation.summary,
      issues: validation.issues,
      ...(validation.outstandingAdvancements
        ? { outstandingAdvancements: validation.outstandingAdvancements }
        : {}),
      ...(validation.recommendations ? { recommendations: validation.recommendations } : {}),
      verified:
        validation.summary.errorCount === 0 && validation.summary.outstandingAdvancementCount === 0,
    };
  }

  private createAwardWorkflowVerification(recipients: UnknownRecord[]): UnknownRecord | undefined {
    type AwardVerificationRecipient = {
      actor: UnknownRecord;
      summary: UnknownRecord;
      issues: unknown[];
      verified: boolean;
      outstandingAdvancements?: unknown[];
      recommendations?: unknown[];
    };

    const verifiedRecipients = recipients
      .map(recipient => {
        const record = this.toRecord(recipient);
        const actor = this.toRecord(record?.actor);
        const validation = this.toRecord(record?.validation);
        const summary = this.toRecord(validation?.summary);
        const issues = Array.isArray(validation?.issues) ? validation.issues : undefined;
        if (!actor || !validation || !summary || !issues) {
          return null;
        }

        const outstandingAdvancements = Array.isArray(validation.outstandingAdvancements)
          ? validation.outstandingAdvancements
          : undefined;
        const recommendations = Array.isArray(validation.recommendations)
          ? validation.recommendations
          : undefined;
        const errorCount = typeof summary.errorCount === 'number' ? summary.errorCount : Number.NaN;
        const outstandingCount =
          typeof summary.outstandingAdvancementCount === 'number'
            ? summary.outstandingAdvancementCount
            : Number.NaN;

        const verificationRecipient: AwardVerificationRecipient = {
          actor,
          summary,
          issues,
          ...(outstandingAdvancements ? { outstandingAdvancements } : {}),
          ...(recommendations ? { recommendations } : {}),
          verified:
            Number.isFinite(errorCount) &&
            Number.isFinite(outstandingCount) &&
            errorCount === 0 &&
            outstandingCount === 0,
        };

        return verificationRecipient;
      })
      .filter((recipient): recipient is AwardVerificationRecipient => recipient !== null);

    if (verifiedRecipients.length === 0) {
      return undefined;
    }

    return {
      verified: verifiedRecipients.every(recipient => recipient.verified === true),
      validatedRecipientCount: verifiedRecipients.length,
      recipients: verifiedRecipients,
    };
  }

  private async prepareProgressionUpdate(
    characterData: CharacterInfoResponse,
    request: CharacterProgressionUpdateRequest
  ): Promise<PreparedCharacterProgressionUpdate> {
    return this.withSystemAdapter<PreparedCharacterProgressionUpdate>(
      'character progression update preparation',
      (adapter: SystemAdapter): PreparedCharacterProgressionUpdate =>
        adapter.prepareCharacterProgressionUpdate(characterData, request),
      () => {
        throw new Error(
          'UNSUPPORTED_CAPABILITY: No system adapter is available for progression updates in this world.'
        );
      }
    );
  }

  private async applyProgressionUpdate(
    characterIdentifier: string,
    prepared: PreparedCharacterProgressionUpdate
  ): Promise<FoundryUpdateActorResponse | FoundryUpdateActorEmbeddedItemResponse> {
    if (prepared.target.kind === 'actor') {
      const request: FoundryUpdateActorRequest = {
        identifier: characterIdentifier,
        updates: prepared.updates,
        reason: 'character progression update',
      };

      return this.foundryClient.query<FoundryUpdateActorResponse>(
        'maeinomatic-foundry-mcp.updateActor',
        request
      );
    }

    const request: FoundryUpdateActorEmbeddedItemRequest = {
      actorIdentifier: characterIdentifier,
      itemIdentifier: prepared.target.itemIdentifier,
      updates: prepared.updates,
      ...(prepared.target.itemType ? { itemType: prepared.target.itemType } : {}),
      reason: 'character progression update',
    };

    return this.foundryClient.query<FoundryUpdateActorEmbeddedItemResponse>(
      'maeinomatic-foundry-mcp.updateActorEmbeddedItem',
      request
    );
  }

  private async formatCharacterResponse(
    characterData: CharacterInfoResponse
  ): Promise<UnknownRecord> {
    const response: {
      id: string;
      name: string;
      type: string;
      basicInfo: UnknownRecord;
      stats: UnknownRecord;
      items: UnknownRecord[];
      effects: CharacterEffectSummary[];
      hasImage: boolean;
      actions?: UnknownRecord[];
      spellcasting?: UnknownRecord[];
    } = {
      id: characterData.id,
      name: characterData.name,
      type: characterData.type,
      basicInfo: await this.extractBasicInfo(characterData),
      stats: await this.extractStats(characterData),
      items: await this.formatItems(characterData.items ?? []),
      effects: this.formatEffects(characterData.effects ?? []),
      hasImage: !!characterData.img,
    };

    // Add actions with minimal data (name, traits, action cost only - no variants)
    if (characterData.actions?.length) {
      response.actions = await this.formatActions(characterData.actions);
    }

    // Add spellcasting data with spell lists
    if (characterData.spellcasting?.length) {
      response.spellcasting = await this.formatSpellcasting(characterData.spellcasting);
    }

    // Exclude itemVariants and itemToggles - these are verbose and can be fetched via get-character-entity if needed

    return response;
  }

  private async formatSpellcasting(
    spellcastingEntries: SystemSpellcastingEntry[]
  ): Promise<UnknownRecord[]> {
    return this.withSystemAdapter<UnknownRecord[]>(
      'spellcasting formatting',
      (adapter: SystemAdapter): UnknownRecord[] =>
        spellcastingEntries.map(entry => adapter.formatSpellcastingEntryForList(entry)),
      () => spellcastingEntries.map(entry => this.formatSpellcastingLegacy(entry))
    );
  }

  private formatSpellcastingLegacy(entry: SystemSpellcastingEntry): Record<string, unknown> {
    const formatted: Record<string, unknown> = {
      name: entry.name,
      type: entry.type,
    };

    if (entry.tradition) {
      formatted.tradition = entry.tradition;
    }

    if (entry.ability) {
      formatted.ability = entry.ability;
    }

    if (entry.dc) {
      formatted.dc = entry.dc;
    }
    if (entry.attack) {
      formatted.attack = entry.attack;
    }

    if (entry.slots && Object.keys(entry.slots).length > 0) {
      formatted.slots = entry.slots;
    }

    if (entry.spells && entry.spells.length > 0) {
      formatted.spells = entry.spells.map(spell => {
        const spellData: Record<string, unknown> = {
          id: spell.id,
          name: spell.name,
          level: spell.level,
        };

        if (spell.prepared === false) {
          spellData.prepared = false;
        }

        if (spell.expended) {
          spellData.expended = true;
        }

        if (spell.traits && spell.traits.length > 0) {
          spellData.traits = spell.traits;
        }

        if (spell.actionCost) {
          spellData.actionCost = spell.actionCost;
        }

        if (spell.range) {
          spellData.range = spell.range;
        }
        if (spell.target) {
          spellData.target = spell.target;
        }
        if (spell.area) {
          spellData.area = spell.area;
        }

        return spellData;
      });

      formatted.spellCount = entry.spells.length;
    }

    return formatted;
  }

  private async formatActions(actions: SystemCharacterAction[]): Promise<UnknownRecord[]> {
    return this.withSystemAdapter<UnknownRecord[]>(
      'action formatting',
      (adapter: SystemAdapter): UnknownRecord[] =>
        actions.map(action => adapter.formatCharacterActionForList(action)),
      () => actions.map(action => this.formatActionLegacy(action))
    );
  }

  private formatActionLegacy(action: SystemCharacterAction): Record<string, unknown> {
    const formatted: Record<string, unknown> = {
      name: action.name,
      type: action.type,
    };

    if (action.traits && action.traits.length > 0) {
      formatted.traits = action.traits;
    }

    if (action.actions !== undefined) {
      formatted.actionCost = action.actions;
    }

    if (action.itemId) {
      formatted.itemId = action.itemId;
    }

    return formatted;
  }

  private async extractBasicInfo(characterData: CharacterInfoResponse): Promise<UnknownRecord> {
    return this.withSystemAdapter<UnknownRecord>(
      'character basic info extraction',
      (adapter: SystemAdapter): UnknownRecord => adapter.formatCharacterBasicInfo(characterData),
      () => this.extractBasicInfoLegacy(characterData)
    );
  }

  private extractBasicInfoLegacy(characterData: CharacterInfoResponse): UnknownRecord {
    const system = characterData.system ?? {};
    const basicInfo: Record<string, unknown> = {};

    if (system.attributes) {
      if (system.attributes.hp) {
        basicInfo.hitPoints = {
          current: system.attributes.hp.value,
          max: system.attributes.hp.max,
          temp: system.attributes.hp.temp ?? 0,
        };
      }
      if (system.attributes.ac) {
        basicInfo.armorClass =
          typeof system.attributes.ac === 'number'
            ? system.attributes.ac
            : system.attributes.ac.value;
      }
    }

    if (
      system.details?.level &&
      typeof system.details.level === 'object' &&
      system.details.level.value !== undefined
    ) {
      basicInfo.level = system.details.level.value;
    } else if (system.level !== undefined) {
      basicInfo.level = system.level;
    }

    return basicInfo;
  }

  private async extractStats(characterData: CharacterInfoResponse): Promise<UnknownRecord> {
    return this.withSystemAdapter<UnknownRecord>(
      'character stats extraction',
      (adapter: SystemAdapter): UnknownRecord => adapter.extractCharacterStats(characterData),
      () => this.extractStatsLegacy(characterData)
    );
  }

  private async formatItems(items: CharacterItem[]): Promise<UnknownRecord[]> {
    return this.withSystemAdapter<UnknownRecord[]>(
      'item formatting',
      (adapter: SystemAdapter): UnknownRecord[] =>
        items.map(item => adapter.formatCharacterItemForList(item)),
      () => items.map(item => this.formatCharacterItemLegacy(item))
    );
  }

  private async formatCharacterItemDetails(item: CharacterItem): Promise<Record<string, unknown>> {
    return this.withSystemAdapter<Record<string, unknown>>(
      'item detail formatting',
      (adapter: SystemAdapter): Record<string, unknown> =>
        adapter.formatCharacterItemForDetails(item),
      () => this.formatCharacterItemDetailsLegacy(item)
    );
  }

  private extractStatsLegacy(characterData: CharacterInfoResponse): Record<string, unknown> {
    void characterData;
    return {};
  }

  private formatCharacterItemLegacy(item: CharacterItem): Record<string, unknown> {
    const formattedItem: Record<string, unknown> = {
      id: item.id,
      name: item.name,
      type: item.type,
    };

    if (item.system?.quantity !== undefined && item.system.quantity !== 1) {
      formattedItem.quantity = item.system.quantity;
    }

    if (item.system?.equipped !== undefined) {
      formattedItem.equipped = item.system.equipped;
    }

    return formattedItem;
  }

  private formatCharacterItemDetailsLegacy(item: CharacterItem): Record<string, unknown> {
    return {
      ...this.formatCharacterItemLegacy(item),
      description:
        (typeof item.system?.description === 'string'
          ? item.system.description
          : item.system?.description?.value) ?? '',
      hasImage: !!item.img,
      system: item.system,
    };
  }

  private formatEffects(effects: CharacterEffect[]): CharacterEffectSummary[] {
    return effects.map(effect => ({
      id: effect.id,
      name: effect.name,
      disabled: !!effect.disabled,
      duration: effect.duration
        ? {
            type: effect.duration.type,
            remaining: effect.duration.remaining,
          }
        : null,
      hasIcon: !!effect.icon,
    }));
  }
}
