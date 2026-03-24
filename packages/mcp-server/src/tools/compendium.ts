import { z } from 'zod';
import { CompendiumReadService } from '../domains/compendium/compendium-read-service.js';
import { FoundryClient } from '../foundry-client.js';
import type {
  FoundryActorSystemBase,
  FoundryCreateCompendiumItemRequest,
  FoundryCreateCompendiumItemResponse,
  FoundryCreateWorldItemRequest,
  FoundryCreateWorldItemResponse,
  FoundryCompendiumEntryFull,
  FoundryCompendiumPackSummary,
  FoundryCompendiumSearchResult,
  FoundryCreatureSearchCriteria,
  FoundryCreatureSearchResult,
  FoundryDescriptionField,
  FoundryImportItemToCompendiumRequest,
  FoundryImportItemToCompendiumResponse,
  FoundryPriceData,
  FoundryTraitsData,
  FoundryUpdateWorldItemRequest,
  FoundryUpdateWorldItemResponse,
  UnknownRecord,
} from '../foundry-types.js';
import { Logger } from '../logger.js';
import { SystemContextService } from '../systems/system-context-service.js';
import { SystemRegistry } from '../systems/system-registry.js';
import type { SystemAdapter } from '../systems/types.js';
import type { GameSystem } from '../utils/system-detection.js';

export interface CompendiumToolsOptions {
  foundryClient: FoundryClient;
  logger: Logger;
  systemRegistry?: SystemRegistry;
  systemContextService?: SystemContextService;
}

type CompendiumPack = FoundryCompendiumPackSummary;

interface CompendiumEntitySystem extends FoundryActorSystemBase {
  description?: string | FoundryDescriptionField;
  traits?: FoundryTraitsData;
  size?: string;
  alignment?: string;
  cr?: number;
  level?: number;
  school?: string;
  components?: unknown;
  duration?: unknown;
  range?: unknown;
  damage?: { parts?: Array<[string, string]> };
  armor?: { value?: number };
  weaponType?: string;
  properties?: unknown;
  stealth?: unknown;
  rarity?: unknown;
  price?: FoundryPriceData;
  weight?: unknown;
  quantity?: number;
  abilities?: Record<string, { value?: number }>;
  resources?: { legact?: unknown; legres?: { value?: number } };
  legendary?: unknown;
  spells?: unknown;
  type?: { value?: string };
  hp?: { value?: number; max?: number };
  ac?: { value?: number };
}

type CompendiumSearchEntity = FoundryCompendiumSearchResult<CompendiumEntitySystem>;
type CompendiumFullEntity = FoundryCompendiumEntryFull<
  CompendiumEntitySystem,
  UnknownRecord,
  UnknownRecord
>;
type CreatureSearchEntity = FoundryCreatureSearchResult<CompendiumEntitySystem>;
type CriteriaParams = FoundryCreatureSearchCriteria;

const toRecord = (value: unknown): UnknownRecord =>
  value !== null && typeof value === 'object' ? (value as UnknownRecord) : {};

const isCompendiumSearchEntity = (value: unknown): value is CompendiumSearchEntity => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    typeof record.id === 'string' &&
    typeof record.name === 'string' &&
    typeof record.type === 'string' &&
    typeof record.pack === 'string' &&
    typeof record.packLabel === 'string'
  );
};

export class CompendiumTools {
  private foundryClient: FoundryClient;
  private logger: Logger;
  private systemRegistry: SystemRegistry | null;
  private systemContextService: SystemContextService;
  private readService: CompendiumReadService;

  constructor({ foundryClient, logger, systemRegistry, systemContextService }: CompendiumToolsOptions) {
    this.foundryClient = foundryClient;
    this.logger = logger.child({ component: 'CompendiumTools' });
    this.systemRegistry = systemRegistry ?? null;
    this.systemContextService =
      systemContextService ??
      new SystemContextService({
        foundryClient,
        logger: this.logger,
        systemRegistry: this.systemRegistry,
      });
    this.readService = new CompendiumReadService({
      foundryClient,
      logger: this.logger,
      getGameSystem: () => this.getGameSystem(),
      getSystemAdapter: gameSystem => this.getSystemAdapter(gameSystem),
      requireSystemAdapter: (gameSystem, capability) =>
        this.requireSystemAdapter(gameSystem, capability),
      describeFilterSet: (filters, gameSystem) => this.describeFilterSet(filters, gameSystem),
      formatCompendiumItem: (item, gameSystem) => this.formatCompendiumItem(item, gameSystem),
      isCreatureEntity: item => this.isCreatureEntity(item),
      formatWithAdapter: (adapter, entity, mode) => this.formatWithAdapter(adapter, entity, mode),
      extractDescription: item => this.extractDescription(item),
      extractFullDescription: item => this.extractFullDescription(item),
      sanitizeSystemData: systemData => this.sanitizeSystemData(systemData),
      extractItemProperties: item => this.extractItemProperties(item),
    });
  }

  invalidateSystemCache(): void {
    this.systemContextService.invalidateCache();
  }

  private async getGameSystem(): Promise<GameSystem> {
    return this.systemContextService.getGameSystem();
  }

  private getSystemAdapter(gameSystem: GameSystem): SystemAdapter | null {
    return this.systemRegistry?.getAdapter(gameSystem) ?? null;
  }

  private requireSystemAdapter(gameSystem: GameSystem, capability: string): SystemAdapter {
    const adapter = this.getSystemAdapter(gameSystem);
    if (adapter) {
      return adapter;
    }

    throw new Error(
      `UNSUPPORTED_CAPABILITY: ${capability} is not supported for system "${gameSystem}" because no system adapter is registered`
    );
  }

  private getSystemDisplayName(gameSystem: GameSystem): string {
    const adapter = this.getSystemAdapter(gameSystem);
    return adapter?.getMetadata().displayName ?? gameSystem;
  }

  private formatWithAdapter(
    adapter: SystemAdapter,
    entity: CompendiumSearchEntity | CompendiumFullEntity | CreatureSearchEntity,
    mode: 'search' | 'criteria' | 'compact' | 'details'
  ): Record<string, unknown> {
    return adapter.formatRawCompendiumCreature(entity, mode);
  }

  private isCreatureEntity(item: { type: string }): boolean {
    return item.type === 'npc' || item.type === 'character';
  }

  private describeFilterSet(filters: Record<string, unknown>, gameSystem: GameSystem): string {
    const adapter = this.getSystemAdapter(gameSystem);
    if (adapter) {
      return adapter.describeFilters(filters);
    }

    const keys = Object.keys(filters);
    return keys.length > 0 ? `filters: ${keys.join(', ')}` : 'no filters';
  }

  /**
   * Tool definitions for compendium operations
   */
  getToolDefinitions(): Array<{
    name: string;
    description: string;
    inputSchema: UnknownRecord;
  }> {
    return [
      {
        name: 'search-compendium',
        description:
          'Search through compendium packs by name. IMPORTANT LIMITATIONS: (1) Text search only matches entity names. Descriptions and traits are not searched. (2) Optional filters here use lightweight name heuristics for Actor packs rather than adapter-backed system data. For accurate creature discovery by system-aware criteria, use list-creatures-by-criteria instead.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description:
                'Search query to find items in compendiums by name only. Use broad, simple terms (e.g., "dragon", "sword", "feat"). Descriptions and traits are NOT searchable.',
            },
            packType: {
              type: 'string',
              description: 'Optional filter by pack type (e.g., "Item", "Actor", "JournalEntry")',
            },
            filters: {
              type: 'object',
              description:
                'Limited functionality: only works on Actor packs using name-based heuristics. These filters do not inspect adapter-backed creature data. For accurate system-aware filtering, use list-creatures-by-criteria instead.',
              properties: {
                challengeRating: {
                  oneOf: [
                    { type: 'number', description: 'Exact CR value (e.g., 12)' },
                    {
                      type: 'object',
                      properties: {
                        min: { type: 'number', description: 'Minimum CR' },
                        max: { type: 'number', description: 'Maximum CR' },
                      },
                    },
                  ],
                },
                creatureType: {
                  type: 'string',
                  description:
                    'Creature type (e.g., "humanoid", "dragon", "beast", "undead", "fey", "fiend", "celestial", "construct", "elemental", "giant", "monstrosity", "ooze", "plant")',
                  enum: [
                    'humanoid',
                    'dragon',
                    'beast',
                    'undead',
                    'fey',
                    'fiend',
                    'celestial',
                    'construct',
                    'elemental',
                    'giant',
                    'monstrosity',
                    'ooze',
                    'plant',
                    'aberration',
                  ],
                },
                size: {
                  type: 'string',
                  description: 'Creature size (e.g., "medium", "large", "huge")',
                  enum: ['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan'],
                },
                alignment: {
                  type: 'string',
                  description:
                    'Creature alignment (e.g., "lawful good", "chaotic evil", "neutral")',
                },
                hasLegendaryActions: {
                  type: 'boolean',
                  description: 'Filter for creatures with legendary actions',
                },
                spellcaster: {
                  type: 'boolean',
                  description: 'Filter for creatures that can cast spells based on name heuristics',
                },
                level: {
                  oneOf: [
                    { type: 'number', description: 'Exact level value (e.g., 12)' },
                    {
                      type: 'object',
                      properties: {
                        min: { type: 'number', description: 'Minimum level' },
                        max: { type: 'number', description: 'Maximum level' },
                      },
                    },
                  ],
                  description: 'Creature level where supported by the active system',
                },
                traits: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Creature traits where supported by the active system',
                },
                rarity: {
                  type: 'string',
                  enum: ['common', 'uncommon', 'rare', 'unique'],
                  description: 'Creature rarity where supported by the active system',
                },
                hasSpells: {
                  type: 'boolean',
                  description:
                    'Filter for spellcasting creatures where supported by the active system',
                },
              },
            },
            limit: {
              type: 'number',
              description:
                'Maximum number of results to return (default: 50 for discovery searches, max: 50)',
              minimum: 1,
              maximum: 50,
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'get-compendium-item',
        description:
          'Retrieve detailed information about a specific compendium item. Use compact mode for UI performance when full details are not needed.',
        inputSchema: {
          type: 'object',
          properties: {
            packId: {
              type: 'string',
              description: 'ID of the compendium pack containing the item',
            },
            itemId: {
              type: 'string',
              description: 'ID of the specific item to retrieve',
            },
            compact: {
              type: 'boolean',
              description:
                'Return condensed stat block (recommended for UI performance). Includes key stats, abilities, and actions but omits lengthy descriptions and technical data.',
              default: false,
            },
          },
          required: ['packId', 'itemId'],
        },
      },
      {
        name: 'list-creatures-by-criteria',
        description:
          'Multi-system creature discovery using adapter-backed criteria. Returns minimal creature data for broad surveys so clients can identify promising matches first and fetch full details only for final selections.',
        inputSchema: {
          type: 'object',
          properties: {
            challengeRating: {
              oneOf: [
                { type: 'number', description: 'Exact CR value (e.g., 12)' },
                { type: 'string', description: 'Exact CR value as string (e.g., "12")' },
                {
                  type: 'object',
                  properties: {
                    min: { type: 'number', description: 'Minimum CR (default: 0)' },
                    max: { type: 'number', description: 'Maximum CR (default: 30)' },
                  },
                  description: 'CR range object (e.g., {"min": 10, "max": 15})',
                },
              ],
              description:
                'Filter by challenge rating where supported. Accepts a number, string, or range object.',
            },
            creatureType: {
              type: 'string',
              description: 'Filter by creature type',
              enum: [
                'humanoid',
                'dragon',
                'beast',
                'undead',
                'fey',
                'fiend',
                'celestial',
                'construct',
                'elemental',
                'giant',
                'monstrosity',
                'ooze',
                'plant',
                'aberration',
              ],
            },
            size: {
              type: 'string',
              description: 'Filter by creature size',
              enum: ['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan'],
            },
            hasSpells: {
              type: 'boolean',
              description: 'Filter for spellcasting creatures',
            },
            hasLegendaryActions: {
              type: 'boolean',
              description: 'Filter for creatures with legendary actions where supported',
            },
            level: {
              oneOf: [
                { type: 'number', description: 'Exact level value (e.g., 12)' },
                { type: 'string', description: 'Exact level value as string (e.g., "12")' },
                {
                  type: 'object',
                  properties: {
                    min: { type: 'number', description: 'Minimum level (default: -1)' },
                    max: { type: 'number', description: 'Maximum level (default: 25)' },
                  },
                  description: 'Level range object (e.g., {"min": 10, "max": 15})',
                },
              ],
              description: 'Filter by creature level where supported',
            },
            traits: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by creature traits where supported',
            },
            rarity: {
              type: 'string',
              enum: ['common', 'uncommon', 'rare', 'unique'],
              description: 'Filter by rarity where supported',
            },
            limit: {
              type: 'number',
              description:
                'Maximum results to return (default: 500 for comprehensive surveys, max: 1000)',
              minimum: 1,
              maximum: 1000,
              default: 500,
            },
          },
          required: [],
        },
      },
      {
        name: 'list-compendium-packs',
        description: 'List all available compendium packs',
        inputSchema: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              description: 'Optional filter by pack type',
            },
          },
        },
      },
      {
        name: 'create-world-item',
        description:
          'Create a world item from raw item data or by cloning an existing item UUID with optional overrides. Uses the public Foundry world-item creation path.',
        inputSchema: {
          type: 'object',
          properties: {
            sourceUuid: {
              type: 'string',
              description: 'Optional world or compendium Item UUID to clone',
            },
            itemData: {
              type: 'object',
              description: 'Raw item data with at least name and type',
            },
            overrides: {
              type: 'object',
              description: 'Optional deep overrides merged onto the source data',
            },
            folderId: {
              type: 'string',
              description: 'Optional world folder ID for the created item',
            },
            reason: {
              type: 'string',
              description: 'Optional audit reason for the change',
            },
          },
        },
      },
      {
        name: 'update-world-item',
        description:
          'Update an existing world item by name or ID using a Document.update-compatible patch payload.',
        inputSchema: {
          type: 'object',
          properties: {
            itemIdentifier: {
              type: 'string',
              description: 'World item name or ID',
            },
            updates: {
              type: 'object',
              description: 'Differential item update payload',
            },
            reason: {
              type: 'string',
              description: 'Optional audit reason for the change',
            },
          },
          required: ['itemIdentifier', 'updates'],
        },
      },
      {
        name: 'create-compendium-item',
        description:
          'Create an item directly inside an unlocked Item compendium pack from raw data or by cloning an item UUID with optional overrides.',
        inputSchema: {
          type: 'object',
          properties: {
            packId: {
              type: 'string',
              description: 'Target Item compendium pack ID',
            },
            sourceUuid: {
              type: 'string',
              description: 'Optional world or compendium Item UUID to clone',
            },
            itemData: {
              type: 'object',
              description: 'Raw item data with at least name and type',
            },
            overrides: {
              type: 'object',
              description: 'Optional deep overrides merged onto the source data',
            },
            folderId: {
              type: 'string',
              description: 'Optional compendium folder ID for the created item',
            },
            reason: {
              type: 'string',
              description: 'Optional audit reason for the change',
            },
          },
          required: ['packId'],
        },
      },
      {
        name: 'import-item-to-compendium',
        description:
          'Copy a world item into an unlocked Item compendium pack using the official compendium import flow.',
        inputSchema: {
          type: 'object',
          properties: {
            itemIdentifier: {
              type: 'string',
              description: 'Existing world item name or ID',
            },
            packId: {
              type: 'string',
              description: 'Target Item compendium pack ID',
            },
            folderId: {
              type: 'string',
              description: 'Optional destination compendium folder ID',
            },
            reason: {
              type: 'string',
              description: 'Optional audit reason for the change',
            },
          },
          required: ['itemIdentifier', 'packId'],
        },
      },
    ];
  }

  async handleSearchCompendium(args: unknown): Promise<unknown> {
    return this.readService.handleSearchCompendium(args);
  }

  async handleGetCompendiumItem(args: unknown): Promise<unknown> {
    return this.readService.handleGetCompendiumItem(args);
  }

  async handleListCreaturesByCriteria(args: unknown): Promise<unknown> {
    // Detect game system for appropriate filtering
    const gameSystem = await this.getGameSystem();

    const parseNumericRange = (
      value: string,
      defaults: { min: number; max: number }
    ): { min: number; max: number } | null => {
      try {
        const parsedRecord = toRecord(JSON.parse(value));
        const hasMin = typeof parsedRecord.min === 'number';
        const hasMax = typeof parsedRecord.max === 'number';
        if (!hasMin && !hasMax) {
          return null;
        }

        return {
          min: hasMin ? (parsedRecord.min as number) : defaults.min,
          max: hasMax ? (parsedRecord.max as number) : defaults.max,
        };
      } catch {
        return null;
      }
    };

    // Keep the core schema broad and let adapters enforce system-specific meaning.
    const schema = z.object({
      challengeRating: z
        .union([
          z.object({
            min: z.number().optional().default(0),
            max: z.number().optional().default(30),
          }),
          z
            .string()
            .refine(
              val => {
                return parseNumericRange(val, { min: 0, max: 30 }) !== null;
              },
              {
                message: 'Challenge rating range must be valid JSON object with min/max numbers',
              }
            )
            .transform(val => {
              return parseNumericRange(val, { min: 0, max: 30 }) ?? { min: 0, max: 30 };
            }),
          z.number(),
          z
            .string()
            .refine(val => !isNaN(parseFloat(val)), {
              message: 'Challenge rating must be a valid number',
            })
            .transform(val => parseFloat(val)),
        ])
        .optional(),

      level: z
        .union([
          z.object({
            min: z.number().optional().default(-1),
            max: z.number().optional().default(25),
          }),
          z
            .string()
            .refine(val => {
              return parseNumericRange(val, { min: -1, max: 25 }) !== null;
            })
            .transform(val => {
              return parseNumericRange(val, { min: -1, max: 25 }) ?? { min: -1, max: 25 };
            }),
          z.number(),
          z
            .string()
            .refine(val => !isNaN(parseFloat(val)))
            .transform(val => parseFloat(val)),
        ])
        .optional(),

      // Common filters
      creatureType: z.string().optional(), // Accept any string, validate per system
      size: z.enum(['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan']).optional(),

      traits: z.array(z.string()).optional(),
      rarity: z.enum(['common', 'uncommon', 'rare', 'unique']).optional(),

      // Spellcasting-related flags may map differently per adapter.
      hasSpells: z
        .union([
          z.boolean(),
          z
            .string()
            .refine(val => ['true', 'false'].includes(val.toLowerCase()))
            .transform(val => val.toLowerCase() === 'true'),
        ])
        .optional(),
      hasLegendaryActions: z
        .union([
          z.boolean(),
          z
            .string()
            .refine(val => ['true', 'false'].includes(val.toLowerCase()))
            .transform(val => val.toLowerCase() === 'true'),
        ])
        .optional(),

      limit: z
        .union([
          z.number().min(1).max(1000),
          z
            .string()
            .refine(val => {
              const num = parseInt(val, 10);
              return !isNaN(num) && num >= 1 && num <= 1000;
            })
            .transform(val => parseInt(val, 10)),
        ])
        .optional()
        .default(100),
    });

    let params: CriteriaParams;
    try {
      params = schema.parse(args) as CriteriaParams;
      this.logger.debug('Parsed creature criteria parameters successfully', params);
    } catch (parseError) {
      this.logger.error('Failed to parse creature criteria parameters', { args, parseError });
      if (parseError instanceof z.ZodError) {
        const errorDetails = parseError.errors
          .map(err => `${err.path.join('.')}: ${err.message}`)
          .join('; ');
        throw new Error(
          `Parameter validation failed: ${errorDetails}. Received args: ${JSON.stringify(args)}`
        );
      }
      throw parseError;
    }

    // Log system detection and criteria
    const adapter = this.requireSystemAdapter(gameSystem, 'list-creatures-by-criteria');
    const { limit: _limit, ...criteriaFilters } = params;
    const validation = adapter.getFilterSchema().safeParse(criteriaFilters);
    if (!validation.success) {
      const details = validation.error.errors
        .map(err => `${err.path.join('.')}: ${err.message}`)
        .join('; ');
      throw new Error(`INVALID_FILTER_FOR_SYSTEM: ${details}`);
    }

    const criteriaDescription = adapter.describeFilters(criteriaFilters);
    this.logger.info('Creature criteria search with system detection', {
      gameSystem,
      criteria: criteriaDescription,
    });

    try {
      const results = await this.foundryClient.query(
        'maeinomatic-foundry-mcp.listCreaturesByCriteria',
        params
      );

      this.logger.debug('Creature criteria search completed', {
        gameSystem,
        criteriaCount: Object.keys(params).length,
        totalFound: results.response.creatures.length,
        limit: params.limit,
        packsSearched: results.response.searchSummary.packsSearched,
      });

      // Extract search summary for transparency
      const responsePayload = results.response;
      const resultCreatures = responsePayload.creatures;
      const searchSummary = responsePayload.searchSummary;

      return {
        gameSystem, // Include detected system
        criteriaDescription, // Human-readable criteria
        creatures: resultCreatures.map(creature =>
          this.formatCreatureListItem(creature, gameSystem)
        ),
        totalFound: resultCreatures.length,
        criteria: params,
        searchSummary: {
          ...searchSummary,
          searchStrategy: `Prioritized pack search - ${this.getSystemDisplayName(gameSystem)} content first, then modules, then campaign-specific`,
          note: 'Packs searched in priority order to find most relevant creatures first',
        },
        optimizationNote:
          'Use creature names to identify suitable options, then call get-compendium-item for final details only',
      };
    } catch (error) {
      this.logger.error('Failed to list creatures by criteria', error);
      throw new Error(
        `Failed to list creatures: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async handleListCompendiumPacks(args: unknown): Promise<unknown> {
    return this.readService.handleListCompendiumPacks(args);
  }

  async handleCreateWorldItem(args: unknown): Promise<unknown> {
    const itemDataSchema = z.object({
      name: z.string().min(1, 'Item name cannot be empty'),
      type: z.string().min(1, 'Item type cannot be empty'),
      img: z.string().optional(),
      system: z.record(z.unknown()).optional(),
      flags: z.record(z.unknown()).optional(),
      effects: z.array(z.unknown()).optional(),
    });

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
    const itemDataSchema = z.object({
      name: z.string().min(1, 'Item name cannot be empty'),
      type: z.string().min(1, 'Item type cannot be empty'),
      img: z.string().optional(),
      system: z.record(z.unknown()).optional(),
      flags: z.record(z.unknown()).optional(),
      effects: z.array(z.unknown()).optional(),
    });

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

  private formatCompendiumItem(
    item: CompendiumSearchEntity,
    gameSystem?: GameSystem
  ): Record<string, unknown> {
    const formatted: Record<string, unknown> = {
      id: item.id,
      name: item.name,
      type: item.type,
      pack: {
        id: item.pack,
        label: item.packLabel,
      },
      description: this.extractDescription(item),
      hasImage: !!item.img,
      summary: this.createItemSummary(item),
    };

    // Add key stats for actors/creatures to reduce need for detail calls
    if (item.type === 'npc' || item.type === 'character') {
      if (gameSystem) {
        const adapter = this.getSystemAdapter(gameSystem);
        if (adapter) {
          const adapterFormatted = this.formatWithAdapter(adapter, item, 'search');
          Object.assign(formatted, adapterFormatted);
        }
      }
    }

    return formatted;
  }

  private extractDescription(item: CompendiumSearchEntity | CompendiumFullEntity): string {
    if (
      'description' in item &&
      typeof item.description === 'string' &&
      item.description.trim().length > 0
    ) {
      return this.truncateText(this.stripHtml(item.description), 200);
    }

    const system = item.system ?? {};

    const description = this.getSystemDescription(system);

    return this.truncateText(this.stripHtml(description), 200);
  }

  private extractFullDescription(item: CompendiumFullEntity): string {
    const system = item.system ?? {};

    const description = this.getSystemDescription(system);

    return this.stripHtml(description);
  }

  private createItemSummary(item: CompendiumSearchEntity | CompendiumFullEntity): string {
    if ('summary' in item && typeof item.summary === 'string' && item.summary.trim().length > 0) {
      return item.summary;
    }

    const parts = [];

    parts.push(`${item.type ?? 'unknown'} from ${item.packLabel ?? 'unknown pack'}`);

    const system = item.system ?? {};

    // Add relevant summary information based on item type
    switch ((item.type ?? '').toLowerCase()) {
      case 'spell':
        if (system.level) parts.push(`Level ${system.level}`);
        if (system.school) parts.push(system.school);
        break;
      case 'weapon':
        if (system.damage?.parts?.length) {
          const damage = system.damage.parts[0];
          parts.push(`${damage[0]} ${damage[1]} damage`);
        }
        break;
      case 'armor':
        if (system.armor?.value) parts.push(`AC ${system.armor.value}`);
        break;
      case 'equipment':
      case 'item':
        if (system.rarity) parts.push(system.rarity);
        if (typeof system.price === 'object' && system.price !== null) {
          const price = system.price as { value?: number | string; denomination?: string };
          if (price.value !== undefined) {
            parts.push(`${price.value} ${price.denomination ?? 'gp'}`);
          }
        }
        break;
    }

    return parts.join(' • ');
  }

  private formatCreatureListItem(
    creature: CreatureSearchEntity,
    gameSystem?: GameSystem
  ): Record<string, unknown> {
    const formatted: Record<string, unknown> = {
      name: creature.name,
      id: creature.id,
      pack: { id: creature.pack, label: creature.packLabel },
    };

    if (gameSystem) {
      const adapter = this.getSystemAdapter(gameSystem);
      if (adapter) {
        const adapterFormatted = this.formatWithAdapter(adapter, creature, 'criteria');
        Object.assign(formatted, adapterFormatted);
      }
    }

    return formatted;
  }

  private getSystemDescription(system: CompendiumEntitySystem): string {
    const description = system.description;
    if (typeof description === 'string') {
      return description;
    }
    if (description && typeof description === 'object') {
      return description.value ?? description.content ?? '';
    }
    return system.details?.description ?? '';
  }

  private extractItemProperties(item: CompendiumFullEntity): Record<string, unknown> {
    const system = item.system ?? {};
    const properties: Record<string, unknown> = {};

    // Common properties across different item types
    if (system.rarity) properties.rarity = system.rarity;
    if (system.price) properties.price = system.price;
    if (system.weight) properties.weight = system.weight;
    if (system.quantity) properties.quantity = system.quantity;

    // Spell-specific properties
    if ((item.type ?? '').toLowerCase() === 'spell') {
      if (system.level !== undefined) properties.spellLevel = system.level;
      if (system.school) properties.school = system.school;
      if (system.components) properties.components = system.components;
      if (system.duration) properties.duration = system.duration;
      if (system.range) properties.range = system.range;
    }

    // Weapon-specific properties
    if ((item.type ?? '').toLowerCase() === 'weapon') {
      if (system.damage) properties.damage = system.damage;
      if (system.weaponType) properties.weaponType = system.weaponType;
      if (system.properties) properties.weaponProperties = system.properties;
    }

    // Armor-specific properties
    if ((item.type ?? '').toLowerCase() === 'armor') {
      if (system.armor) properties.armorClass = system.armor;
      if (system.stealth) properties.stealthDisadvantage = system.stealth;
    }

    return properties;
  }

  private sanitizeSystemData(systemData: unknown): UnknownRecord {
    // Remove potentially large or unnecessary fields
    const sanitized = { ...toRecord(systemData) };

    // Remove large description fields (already handled separately)
    delete sanitized.description;
    delete sanitized.details;

    // Remove internal/technical fields
    delete sanitized._id;
    delete sanitized.folder;
    delete sanitized.sort;
    delete sanitized.ownership;

    return sanitized;
  }

  private stripHtml(text: unknown): string {
    if (!text) return '';

    let normalized: string;

    if (Array.isArray(text)) {
      return text.map(item => this.stripHtml(item)).join(' ');
    }

    // Handle objects with value property (e.g., {value: "text"})
    if (typeof text === 'object' && text !== null) {
      const record = text as UnknownRecord;
      if (typeof record.value === 'string') {
        normalized = record.value;
      } else if (typeof record.content === 'string') {
        normalized = record.content;
      } else {
        // For other objects, try to stringify or return empty
        try {
          normalized = JSON.stringify(text);
        } catch {
          return '';
        }
      }
    } else {
      normalized = String(text);
    }

    if (!normalized || normalized === '[object Object]') {
      return '';
    }

    return normalized.replace(/<[^>]*>/g, '').trim();
  }

  private truncateText(text: string, maxLength: number): string {
    if (!text || text.length <= maxLength) {
      return text;
    }
    return `${text.substring(0, maxLength - 3)}...`;
  }
}
