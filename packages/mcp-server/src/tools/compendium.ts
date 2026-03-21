import { z } from 'zod';
import { FoundryClient } from '../foundry-client.js';
import { Logger } from '../logger.js';
import { SystemRegistry } from '../systems/system-registry.js';
import {
  detectGameSystem,
  getCreatureLevel,
  getCreatureType,
  hasSpellcasting,
  type GameSystem,
} from '../utils/system-detection.js';
import { GenericFiltersSchema, describeFilters } from '../utils/compendium-filters.js';

export interface CompendiumToolsOptions {
  foundryClient: FoundryClient;
  logger: Logger;
  systemRegistry?: SystemRegistry;
}

type UnknownRecord = Record<string, unknown>;

interface CompendiumPack {
  id: string;
  label: string;
  type: string;
  system?: string;
  private?: boolean;
}

interface CompendiumEntitySystem {
  attributes?: {
    ac?: { value?: number };
    hp?: { value?: number; max?: number };
    movement?: { walk?: number; fly?: number; swim?: number };
    spellcasting?: unknown;
  };
  details?: {
    cr?: number;
    type?: { value?: string };
    alignment?: string | { value?: string };
    spellLevel?: number;
    description?: string;
  };
  description?: string | { value?: string; content?: string };
  traits?: { size?: string | { value?: string }; rarity?: string };
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
  price?: unknown;
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

interface CompendiumEntity {
  id?: string;
  name?: string;
  type?: string;
  pack?: string;
  packLabel?: string;
  img?: string;
  system?: CompendiumEntitySystem;
  items?: unknown[];
  effects?: unknown[];
  fullData?: unknown;
  challengeRating?: number;
  creatureType?: string;
  size?: string;
  hasSpells?: boolean;
  hasLegendaryActions?: boolean;
  response?: {
    creatures?: CompendiumEntity[];
    searchSummary?: {
      packsSearched?: number;
      topPacks?: unknown[];
      totalCreaturesFound?: number;
    };
  };
}

type CriteriaParams = {
  challengeRating?: number | { min?: number; max?: number } | undefined;
  level?: number | { min?: number; max?: number } | undefined;
  creatureType?: string | undefined;
  size?: string | undefined;
  traits?: string[] | undefined;
  rarity?: 'common' | 'uncommon' | 'rare' | 'unique' | undefined;
  hasSpells?: boolean | undefined;
  hasLegendaryActions?: boolean | undefined;
  limit?: number | undefined;
};

const toRecord = (value: unknown): UnknownRecord =>
  value !== null && typeof value === 'object' ? (value as UnknownRecord) : {};

export class CompendiumTools {
  private foundryClient: FoundryClient;
  private logger: Logger;
  private systemRegistry: SystemRegistry | null;
  private gameSystem: GameSystem | null = null;

  constructor({ foundryClient, logger, systemRegistry }: CompendiumToolsOptions) {
    this.foundryClient = foundryClient;
    this.logger = logger.child({ component: 'CompendiumTools' });
    this.systemRegistry = systemRegistry ?? null;
  }

  /**
   * Get or detect the game system (cached)
   */
  private async getGameSystem(): Promise<GameSystem> {
    if (!this.gameSystem) {
      this.gameSystem = await detectGameSystem(this.foundryClient, this.logger);
    }
    return this.gameSystem;
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
          'Search through compendium packs by name. IMPORTANT LIMITATIONS: (1) Text search only matches entity NAMES - descriptions and traits are NOT searchable. (2) Filters use name heuristics only (not actual system data) and only work on Actor packs - challengeRating and creatureType filters search for keywords like "ancient", "legendary", "humanoid", etc. in entity names. For accurate filtering by level/CR, traits, or rarity, use list-creatures-by-criteria instead. For best results, use broad name-based searches (e.g., "dragon", "knight") and inspect individual items with get-compendium-item.',
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
                'LIMITED FUNCTIONALITY: Only works on Actor packs using name-based heuristics. challengeRating searches for keywords like "ancient" (CR 15+), "adult" (CR 10+), "captain" (CR 5+). creatureType searches for type keywords in names. Does NOT check actual system data. For accurate filtering, use list-creatures-by-criteria instead.',
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
                  description: 'Filter for creatures that can cast spells (D&D 5e)',
                },
                // Pathfinder 2e specific filters
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
                  description: 'Creature level (Pathfinder 2e, -1 to 25+)',
                },
                traits: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Creature traits to filter by (Pathfinder 2e)',
                },
                rarity: {
                  type: 'string',
                  enum: ['common', 'uncommon', 'rare', 'unique'],
                  description: 'Creature rarity (Pathfinder 2e)',
                },
                hasSpells: {
                  type: 'boolean',
                  description: 'Filter for spellcasting creatures (Pathfinder 2e)',
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
          'MULTI-SYSTEM CREATURE DISCOVERY: Get a comprehensive list of creatures matching specific criteria. Supports D&D 5e (Challenge Rating) and Pathfinder 2e (Level) with automatic system detection. Perfect for encounter building - returns minimal data so Claude can use built-in monster knowledge to identify suitable creatures by name, then pull full details only for final selections. Features intelligent pack prioritization and high result limits for complete surveys.',
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
                'Filter by Challenge Rating - accepts number, string, or range object. Use ranges for broader discovery (e.g., {"min": 10, "max": 15}) or exact values (12 or "12")',
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
              description: 'Filter for creatures with legendary actions (D&D 5e)',
            },
            // Pathfinder 2e specific filters
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
              description: 'Filter by creature level (Pathfinder 2e, -1 to 25+)',
            },
            traits: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by creature traits (Pathfinder 2e)',
            },
            rarity: {
              type: 'string',
              enum: ['common', 'uncommon', 'rare', 'unique'],
              description: 'Filter by rarity (Pathfinder 2e)',
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
    ];
  }

  async handleSearchCompendium(args: unknown): Promise<unknown> {
    // Detect game system for appropriate filtering
    const gameSystem = await this.getGameSystem();

    const schema = z.object({
      query: z.string().min(2, 'Search query must be at least 2 characters'),
      packType: z.string().optional(),
      filters: GenericFiltersSchema.optional(),
      limit: z.number().min(1).max(50).default(50),
    });

    // Add defensive parsing for MCP argument structure inconsistencies
    let parsedArgs: z.infer<typeof schema>;
    try {
      parsedArgs = schema.parse(args);
    } catch (zodError) {
      // Try alternative argument structures that MCP might send
      if (typeof args === 'string') {
        parsedArgs = schema.parse({ query: args });
      } else if (args && typeof args === 'object') {
        // Handle case where arguments might be nested differently
        const argsRecord = args as UnknownRecord;
        if (typeof argsRecord.query === 'undefined') {
          const firstKey = Object.keys(argsRecord)[0];
          const firstValue = firstKey ? argsRecord[firstKey] : undefined;
          if (firstKey && typeof firstValue === 'string') {
            parsedArgs = schema.parse({ query: firstValue });
          } else {
            throw zodError;
          }
        } else {
          parsedArgs = schema.parse(argsRecord);
        }
      } else {
        // Log the problematic args for debugging
        this.logger.debug('Failed to parse search args, using fallback', {
          args: typeof args === 'object' ? JSON.stringify(args) : args,
          error: zodError instanceof Error ? zodError.message : 'Unknown parsing error',
        });
        throw zodError;
      }
    }

    const { query, packType, filters, limit } = parsedArgs;

    // Log system detection and filters
    this.logger.info('Compendium search with system detection', {
      gameSystem,
      query,
      filters: filters ? describeFilters(filters, gameSystem) : 'none',
    });

    try {
      const rawResults = (await this.foundryClient.query('foundry-mcp-bridge.searchCompendium', {
        query,
        packType,
        filters,
      })) as CompendiumEntity[];

      const results = Array.isArray(rawResults) ? rawResults : [];

      // Limit results
      const limitedResults = results.slice(0, limit);

      this.logger.debug('Compendium search completed', {
        query,
        gameSystem,
        totalFound: results.length,
        returned: limitedResults.length,
      });

      return {
        query,
        gameSystem, // Include detected system in response
        filterDescription: filters ? describeFilters(filters, gameSystem) : 'no filters',
        results: limitedResults.map(item => this.formatCompendiumItem(item, gameSystem)),
        totalFound: results.length,
        showing: limitedResults.length,
        hasMore: results.length > limit,
      };
    } catch (error) {
      this.logger.error('Failed to search compendium', error);
      throw new Error(
        `Failed to search compendium: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async handleGetCompendiumItem(args: unknown): Promise<unknown> {
    const schema = z.object({
      packId: z.string().min(1, 'Pack ID cannot be empty'),
      itemId: z.string().min(1, 'Item ID cannot be empty'),
      compact: z.boolean().default(false),
    });

    const { packId, itemId, compact } = schema.parse(args);

    try {
      // Use the proper document retrieval method that already exists in actor creation
      const item = (await this.foundryClient.query('foundry-mcp-bridge.getCompendiumDocumentFull', {
        packId,
        documentId: itemId,
      })) as CompendiumEntity | null;

      if (!item) {
        throw new Error(`Item ${itemId} not found in pack ${packId}`);
      }

      // Format the response using the detailed item data
      const baseResponse = {
        id: item.id,
        name: item.name,
        type: item.type,
        pack: {
          id: item.pack,
          label: item.packLabel,
        },
        description: this.extractDescription(item),
        hasImage: !!item.img,
        imageUrl: item.img,
      };

      if (compact) {
        // Compact response for UI performance
        const compactStats = this.extractCompactStats(item);
        return {
          ...baseResponse,
          stats: compactStats,
          properties: this.extractItemProperties(item),
          items: (item.items ?? []).slice(0, 5), // Limit items to prevent bloat
          mode: 'compact',
        };
      } else {
        // Full response
        return {
          ...baseResponse,
          fullDescription: this.extractFullDescription(item),
          system: this.sanitizeSystemData(item.system ?? {}),
          properties: this.extractItemProperties(item),
          items: item.items ?? [],
          effects: item.effects ?? [],
          fullData: item.fullData,
          mode: 'full',
        };
      }
    } catch (error) {
      this.logger.error('Failed to get compendium item', error);
      throw new Error(
        `Failed to retrieve item: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
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

    // Use generic filters schema to support both systems
    const schema = z.object({
      // D&D 5e: challengeRating
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

      // Pathfinder 2e: level
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

      // Pathfinder 2e specific
      traits: z.array(z.string()).optional(),
      rarity: z.enum(['common', 'uncommon', 'rare', 'unique']).optional(),

      // Spellcasting flags (different names per system)
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
    const criteriaDescription = this.describeCriteria(params, gameSystem);
    this.logger.info('Creature criteria search with system detection', {
      gameSystem,
      criteria: criteriaDescription,
    });

    try {
      const results = (await this.foundryClient.query(
        'foundry-mcp-bridge.listCreaturesByCriteria',
        params
      )) as CompendiumEntity | CompendiumEntity[];

      this.logger.debug('Creature criteria search completed', {
        gameSystem,
        criteriaCount: Object.keys(params).length,
        totalFound: Array.isArray(results)
          ? results.length
          : (results.response?.creatures?.length ?? 0),
        limit: params.limit,
        packsSearched: Array.isArray(results)
          ? 0
          : (results.response?.searchSummary?.packsSearched ?? 0),
      });

      // Extract search summary for transparency
      const responsePayload = Array.isArray(results) ? undefined : results.response;
      const resultCreatures = Array.isArray(results) ? results : (responsePayload?.creatures ?? []);

      const searchSummary = responsePayload?.searchSummary ?? {
        packsSearched: 0,
        topPacks: [],
        totalCreaturesFound: resultCreatures.length,
      };

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
          searchStrategy: `Prioritized pack search - ${gameSystem === 'pf2e' ? 'PF2e' : 'D&D 5e'} content first, then modules, then campaign-specific`,
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
    const schema = z.object({
      type: z.string().optional(),
    });

    const { type } = schema.parse(args);

    this.logger.info('Listing compendium packs', { type });

    try {
      const packs = (await this.foundryClient.query(
        'foundry-mcp-bridge.getAvailablePacks'
      )) as CompendiumPack[];

      // Filter by type if specified
      const filteredPacks = type ? packs.filter(pack => pack.type === type) : packs;

      this.logger.debug('Successfully retrieved compendium packs', {
        total: packs.length,
        filtered: filteredPacks.length,
        type,
      });

      return {
        packs: filteredPacks.map(pack => ({
          id: pack.id,
          label: pack.label,
          type: pack.type,
          system: pack.system,
          private: pack.private,
        })),
        total: filteredPacks.length,
        availableTypes: [...new Set(packs.map(pack => pack.type))],
      };
    } catch (error) {
      this.logger.error('Failed to list compendium packs', error);
      throw new Error(
        `Failed to list compendium packs: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private formatCompendiumItem(
    item: CompendiumEntity,
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
      const stats: Record<string, unknown> = {};

      // Use system detection utilities for accurate stat extraction
      if (gameSystem) {
        // Level/CR (system-specific)
        const level = getCreatureLevel(item, gameSystem);
        if (level !== undefined) {
          if (gameSystem === 'dnd5e') {
            stats.challengeRating = level;
          } else if (gameSystem === 'pf2e') {
            stats.level = level;
          }
        }

        // Creature type/traits
        const creatureType = getCreatureType(item, gameSystem);
        if (creatureType) {
          if (gameSystem === 'pf2e' && Array.isArray(creatureType)) {
            stats.traits = creatureType;
            // Also extract primary creature type from traits if available
            const creatureTraits = [
              'aberration',
              'animal',
              'beast',
              'celestial',
              'construct',
              'dragon',
              'elemental',
              'fey',
              'fiend',
              'fungus',
              'humanoid',
              'monitor',
              'ooze',
              'plant',
              'undead',
            ];
            const primaryType = creatureType.find((t: string) =>
              creatureTraits.includes(t.toLowerCase())
            );
            if (primaryType) stats.creatureType = primaryType;
          } else {
            stats.creatureType = creatureType;
          }
        }

        // System-agnostic stats (similar paths in both systems)
        const system = item.system ?? {};

        // Hit Points
        const hp = system.attributes?.hp?.value;
        const maxHp = system.attributes?.hp?.max;
        if (hp !== undefined || maxHp !== undefined) {
          stats.hitPoints = { current: hp, max: maxHp };
        }

        // Armor Class
        const ac = system.attributes?.ac?.value;
        if (ac !== undefined) stats.armorClass = ac;

        // Size (similar in both systems)
        const sizeTrait = system.traits?.size;
        const size = (typeof sizeTrait === 'string' ? sizeTrait : sizeTrait?.value) ?? system.size;
        if (size) stats.size = size;

        // Alignment (different paths but similar concept)
        const detailAlignment = system.details?.alignment;
        const alignment =
          (typeof detailAlignment === 'string' ? detailAlignment : detailAlignment?.value) ??
          system.alignment;
        if (alignment) stats.alignment = alignment;

        // PF2e specific: Rarity
        if (gameSystem === 'pf2e') {
          const rarity = system.traits?.rarity;
          if (rarity) stats.rarity = rarity;
        }
      } else {
        // Fallback: Legacy D&D 5e extraction
        const system = item.system ?? {};
        const cr = system.details?.cr ?? system.cr;
        if (cr !== undefined) stats.challengeRating = cr;

        const hp = system.attributes?.hp?.value ?? system.hp?.value;
        const maxHp = system.attributes?.hp?.max ?? system.hp?.max;
        if (hp !== undefined || maxHp !== undefined) {
          stats.hitPoints = { current: hp, max: maxHp };
        }

        const ac = system.attributes?.ac?.value ?? system.ac?.value;
        if (ac !== undefined) stats.armorClass = ac;

        const creatureType = system.details?.type?.value ?? system.type?.value;
        if (creatureType) stats.creatureType = creatureType;

        const size = system.traits?.size ?? system.size;
        if (size) stats.size = size;

        const alignment = system.details?.alignment ?? system.alignment;
        if (alignment) stats.alignment = alignment;
      }

      if (Object.keys(stats).length > 0) {
        formatted.stats = stats;
      }
    }

    return formatted;
  }

  private formatDetailedCompendiumItem(item: CompendiumEntity): Record<string, unknown> {
    const formatted = this.formatCompendiumItem(item);

    // Add more detailed information
    formatted.system = this.sanitizeSystemData(item.system ?? {});
    formatted.fullDescription = this.extractFullDescription(item);
    formatted.properties = this.extractItemProperties(item);

    return formatted;
  }

  private extractDescription(item: CompendiumEntity): string {
    const system = item.system ?? {};

    const description = this.getSystemDescription(system);

    return this.truncateText(this.stripHtml(description), 200);
  }

  private extractFullDescription(item: CompendiumEntity): string {
    const system = item.system ?? {};

    const description = this.getSystemDescription(system);

    return this.stripHtml(description);
  }

  private createItemSummary(item: CompendiumEntity): string {
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
    creature: CompendiumEntity,
    gameSystem?: GameSystem
  ): Record<string, unknown> {
    const system = creature.system ?? {};
    const formatted: Record<string, unknown> = {
      name: creature.name,
      id: creature.id,
      pack: { id: creature.pack, label: creature.packLabel },
    };

    if (gameSystem) {
      // System-specific extraction using detection utilities
      const level = getCreatureLevel(creature, gameSystem);
      if (level !== undefined) {
        if (gameSystem === 'dnd5e') {
          formatted.challengeRating = level;
        } else if (gameSystem === 'pf2e') {
          formatted.level = level;
        }
      }

      const creatureType = getCreatureType(creature, gameSystem);
      if (creatureType) {
        if (gameSystem === 'pf2e' && Array.isArray(creatureType)) {
          formatted.traits = creatureType;
          // Extract primary type from traits
          const creatureTraits = [
            'aberration',
            'animal',
            'beast',
            'celestial',
            'construct',
            'dragon',
            'elemental',
            'fey',
            'fiend',
            'fungus',
            'humanoid',
            'monitor',
            'ooze',
            'plant',
            'undead',
          ];
          const primaryType = creatureType.find((t: string) =>
            creatureTraits.includes(t.toLowerCase())
          );
          if (primaryType) formatted.creatureType = primaryType;
        } else {
          formatted.creatureType = creatureType;
        }
      }

      const sizeTrait = system.traits?.size;
      const size =
        (typeof sizeTrait === 'string' ? sizeTrait : sizeTrait?.value) ?? system.size ?? 'medium';
      formatted.size = size;

      // PF2e specific: rarity
      if (gameSystem === 'pf2e') {
        const rarity = system.traits?.rarity;
        if (rarity) formatted.rarity = rarity;
      }

      // Feature flags
      const hasSpells = hasSpellcasting(creature, gameSystem);
      const flags: {
        spellcaster: boolean;
        legendary?: boolean;
        undead?: boolean;
        dragon?: boolean;
        fiend?: boolean;
      } = {
        spellcaster: hasSpells,
      };

      // D&D 5e specific flags
      if (gameSystem === 'dnd5e') {
        const hasLegendary = !!(
          system.resources?.legact ||
          system.legendary ||
          (system.resources?.legres?.value ?? 0) > 0
        );
        flags.legendary = hasLegendary;

        const typeStr = typeof creatureType === 'string' ? creatureType.toLowerCase() : '';
        flags.undead = typeStr === 'undead';
        flags.dragon = typeStr === 'dragon';
        flags.fiend = typeStr === 'fiend';
      }

      formatted.flags = flags;
    } else {
      // Legacy fallback (D&D 5e assumptions)
      const challengeRating = creature.challengeRating ?? system.details?.cr ?? system.cr ?? 0;
      const creatureType =
        creature.creatureType ?? system.details?.type?.value ?? system.type?.value ?? 'unknown';
      const sizeTrait = system.traits?.size;
      const size =
        creature.size ??
        (typeof sizeTrait === 'string' ? sizeTrait : sizeTrait?.value) ??
        system.size ??
        'medium';

      const hasSpells =
        creature.hasSpells ??
        !!(
          system.spells ||
          system.attributes?.spellcasting ||
          (system.details?.spellLevel && system.details.spellLevel > 0)
        );
      const hasLegendary =
        creature.hasLegendaryActions ??
        !!(
          system.resources?.legact ||
          system.legendary ||
          (system.resources?.legres?.value ?? 0) > 0
        );

      formatted.challengeRating = challengeRating;
      formatted.creatureType = creatureType;
      formatted.size = size;
      formatted.flags = {
        spellcaster: hasSpells,
        legendary: hasLegendary,
        undead: creatureType.toLowerCase() === 'undead',
        dragon: creatureType.toLowerCase() === 'dragon',
        fiend: creatureType.toLowerCase() === 'fiend',
      };
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

  /**
   * Helper method to describe criteria in human-readable format
   */
  private describeCriteria(params: CriteriaParams, gameSystem: GameSystem): string {
    const parts: string[] = [];

    if (gameSystem === 'dnd5e') {
      if (params.challengeRating !== undefined) {
        if (typeof params.challengeRating === 'number') {
          parts.push(`CR ${params.challengeRating}`);
        } else if (typeof params.challengeRating === 'object') {
          const min = params.challengeRating.min ?? 0;
          const max = params.challengeRating.max ?? 30;
          parts.push(`CR ${min}-${max}`);
        }
      }
    } else if (gameSystem === 'pf2e') {
      if (params.level !== undefined) {
        if (typeof params.level === 'number') {
          parts.push(`Level ${params.level}`);
        } else if (typeof params.level === 'object') {
          const min = params.level.min ?? -1;
          const max = params.level.max ?? 25;
          parts.push(`Level ${min}-${max}`);
        }
      }
    }

    if (params.creatureType) parts.push(params.creatureType);
    if (params.size) parts.push(params.size);
    if (params.rarity) parts.push(params.rarity);
    if (params.traits && params.traits.length > 0) {
      parts.push(`traits: ${params.traits.join(', ')}`);
    }
    if (params.hasSpells) parts.push('spellcaster');
    if (params.hasLegendaryActions) parts.push('legendary');

    return parts.length > 0 ? parts.join(', ') : 'no criteria';
  }

  private extractCompactStats(item: CompendiumEntity): Record<string, unknown> {
    const system = item.system ?? {};
    const stats: Record<string, unknown> = {};

    // Core combat stats
    if (system.attributes?.ac?.value) stats.armorClass = system.attributes.ac.value;
    if (system.attributes?.hp?.max) stats.hitPoints = system.attributes.hp.max;
    if (system.details?.cr !== undefined) stats.challengeRating = system.details.cr;

    // Basic info
    if (system.details?.type?.value) stats.creatureType = system.details.type.value;
    if (system.traits?.size) stats.size = system.traits.size;
    if (system.details?.alignment) stats.alignment = system.details.alignment;

    // Key abilities (only show notable ones)
    if (system.abilities) {
      const abilities: Record<string, unknown> = {};
      for (const [key, ability] of Object.entries(system.abilities)) {
        const abil = ability as { value?: number };
        if (abil.value !== undefined) {
          const mod = Math.floor((abil.value - 10) / 2);
          if (Math.abs(mod) >= 2) {
            // Only show significant modifiers
            abilities[key.toUpperCase()] = { value: abil.value, modifier: mod };
          }
        }
      }
      if (Object.keys(abilities).length > 0) stats.abilities = abilities;
    }

    // Speed
    if (system.attributes?.movement) {
      const movement = system.attributes.movement;
      const speeds: string[] = [];
      if (movement.walk) speeds.push(`${movement.walk} ft`);
      if (movement.fly) speeds.push(`fly ${movement.fly} ft`);
      if (movement.swim) speeds.push(`swim ${movement.swim} ft`);
      if (speeds.length > 0) stats.speed = speeds.join(', ');
    }

    return stats;
  }

  private extractItemProperties(item: CompendiumEntity): Record<string, unknown> {
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
