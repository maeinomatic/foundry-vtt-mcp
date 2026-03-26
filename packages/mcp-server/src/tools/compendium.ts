import { CompendiumCreatureSearchService } from '../domains/compendium/compendium-creature-search-service.js';
import { CompendiumFormattingService } from '../domains/compendium/compendium-formatting-service.js';
import { CompendiumReadService } from '../domains/compendium/compendium-read-service.js';
import { CompendiumWriteService } from '../domains/compendium/compendium-write-service.js';
import { FoundryClient } from '../foundry-client.js';
import type { FoundryCompendiumPackSummary, UnknownRecord } from '../foundry-types.js';
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

export class CompendiumTools {
  private logger: Logger;
  private systemRegistry: SystemRegistry | null;
  private systemContextService: SystemContextService;
  private formattingService: CompendiumFormattingService;
  private creatureSearchService: CompendiumCreatureSearchService;
  private readService: CompendiumReadService;
  private writeService: CompendiumWriteService;

  constructor({
    foundryClient,
    logger,
    systemRegistry,
    systemContextService,
  }: CompendiumToolsOptions) {
    this.logger = logger.child({ component: 'CompendiumTools' });
    this.systemRegistry = systemRegistry ?? null;
    this.systemContextService =
      systemContextService ??
      new SystemContextService({
        foundryClient,
        logger: this.logger,
        systemRegistry: this.systemRegistry,
      });
    this.formattingService = new CompendiumFormattingService({
      logger: this.logger,
      getSystemAdapter: gameSystem => this.getSystemAdapter(gameSystem),
    });
    this.readService = new CompendiumReadService({
      foundryClient,
      logger: this.logger,
      getGameSystem: () => this.getGameSystem(),
      getSystemAdapter: gameSystem => this.getSystemAdapter(gameSystem),
      requireSystemAdapter: (gameSystem, capability) =>
        this.requireSystemAdapter(gameSystem, capability),
      describeFilterSet: (filters, gameSystem) => this.describeFilterSet(filters, gameSystem),
      formatCompendiumItem: (item, gameSystem) =>
        this.formattingService.formatCompendiumItem(item, gameSystem),
      isCreatureEntity: item => this.isCreatureEntity(item),
      formatWithAdapter: (adapter, entity, mode) =>
        this.formattingService.formatWithAdapter(adapter, entity, mode),
      extractDescription: item => this.formattingService.extractDescription(item),
      extractFullDescription: item => this.formattingService.extractFullDescription(item),
      sanitizeSystemData: systemData => this.formattingService.sanitizeSystemData(systemData),
      extractItemProperties: item => this.formattingService.extractItemProperties(item),
    });
    this.creatureSearchService = new CompendiumCreatureSearchService({
      foundryClient,
      logger: this.logger,
      getGameSystem: () => this.getGameSystem(),
      requireSystemAdapter: (gameSystem, capability) =>
        this.requireSystemAdapter(gameSystem, capability),
      getSystemDisplayName: gameSystem => this.getSystemDisplayName(gameSystem),
      formatCreatureListItem: (creature, gameSystem) =>
        this.formattingService.formatCreatureListItem(creature, gameSystem),
    });
    this.writeService = new CompendiumWriteService({
      foundryClient,
      logger: this.logger,
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
    return this.creatureSearchService.handleListCreaturesByCriteria(args);
  }

  async handleListCompendiumPacks(args: unknown): Promise<unknown> {
    return this.readService.handleListCompendiumPacks(args);
  }

  async handleCreateWorldItem(args: unknown): Promise<unknown> {
    return this.writeService.handleCreateWorldItem(args);
  }

  async handleUpdateWorldItem(args: unknown): Promise<unknown> {
    return this.writeService.handleUpdateWorldItem(args);
  }

  async handleCreateCompendiumItem(args: unknown): Promise<unknown> {
    return this.writeService.handleCreateCompendiumItem(args);
  }

  async handleImportItemToCompendium(args: unknown): Promise<unknown> {
    return this.writeService.handleImportItemToCompendium(args);
  }
}
