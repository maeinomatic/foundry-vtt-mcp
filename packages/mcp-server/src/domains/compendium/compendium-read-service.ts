import { z } from 'zod';
import { FoundryClient } from '../../foundry-client.js';
import { Logger } from '../../logger.js';
import type {
  FoundryActorSystemBase,
  FoundryCompendiumEntryFull,
  FoundryCompendiumPackSummary,
  FoundryCompendiumSearchResult,
  FoundryDescriptionField,
  FoundryPriceData,
  FoundryTraitsData,
  UnknownRecord,
} from '../../foundry-types.js';
import type { GameSystem } from '../../utils/system-detection.js';
import type { SystemAdapter } from '../../systems/types.js';

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

type CompendiumPack = FoundryCompendiumPackSummary;
type CompendiumSearchEntity = FoundryCompendiumSearchResult<CompendiumEntitySystem>;
type CompendiumFullEntity = FoundryCompendiumEntryFull<
  CompendiumEntitySystem,
  UnknownRecord,
  UnknownRecord
>;

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

export interface CompendiumReadServiceOptions {
  foundryClient: FoundryClient;
  logger: Logger;
  getGameSystem: () => Promise<GameSystem>;
  getSystemAdapter: (gameSystem: GameSystem) => SystemAdapter | null;
  requireSystemAdapter: (gameSystem: GameSystem, capability: string) => SystemAdapter;
  describeFilterSet: (filters: Record<string, unknown>, gameSystem: GameSystem) => string;
  formatCompendiumItem: (item: CompendiumSearchEntity, gameSystem: GameSystem) => Record<string, unknown>;
  isCreatureEntity: (item: { type: string }) => boolean;
  formatWithAdapter: (
    adapter: SystemAdapter,
    entity: CompendiumSearchEntity | CompendiumFullEntity,
    mode: 'search' | 'criteria' | 'compact' | 'details'
  ) => Record<string, unknown>;
  extractDescription: (item: CompendiumFullEntity) => string;
  extractFullDescription: (item: CompendiumFullEntity) => string;
  sanitizeSystemData: (systemData: UnknownRecord) => UnknownRecord;
  extractItemProperties: (item: CompendiumFullEntity) => unknown;
}

export class CompendiumReadService {
  private foundryClient: FoundryClient;
  private logger: Logger;
  private getGameSystem: () => Promise<GameSystem>;
  private getSystemAdapter: (gameSystem: GameSystem) => SystemAdapter | null;
  private requireSystemAdapter: (gameSystem: GameSystem, capability: string) => SystemAdapter;
  private describeFilterSet: (filters: Record<string, unknown>, gameSystem: GameSystem) => string;
  private formatCompendiumItem: (item: CompendiumSearchEntity, gameSystem: GameSystem) => Record<string, unknown>;
  private isCreatureEntity: (item: { type: string }) => boolean;
  private formatWithAdapter: (
    adapter: SystemAdapter,
    entity: CompendiumSearchEntity | CompendiumFullEntity,
    mode: 'search' | 'criteria' | 'compact' | 'details'
  ) => Record<string, unknown>;
  private extractDescription: (item: CompendiumFullEntity) => string;
  private extractFullDescription: (item: CompendiumFullEntity) => string;
  private sanitizeSystemData: (systemData: UnknownRecord) => UnknownRecord;
  private extractItemProperties: (item: CompendiumFullEntity) => unknown;

  constructor(options: CompendiumReadServiceOptions) {
    this.foundryClient = options.foundryClient;
    this.logger = options.logger.child({ component: 'CompendiumReadService' });
    this.getGameSystem = options.getGameSystem;
    this.getSystemAdapter = options.getSystemAdapter;
    this.requireSystemAdapter = options.requireSystemAdapter;
    this.describeFilterSet = options.describeFilterSet;
    this.formatCompendiumItem = options.formatCompendiumItem;
    this.isCreatureEntity = options.isCreatureEntity;
    this.formatWithAdapter = options.formatWithAdapter;
    this.extractDescription = options.extractDescription;
    this.extractFullDescription = options.extractFullDescription;
    this.sanitizeSystemData = options.sanitizeSystemData;
    this.extractItemProperties = options.extractItemProperties;
  }

  async handleSearchCompendium(args: unknown): Promise<unknown> {
    const gameSystem = await this.getGameSystem();

    const schema = z.object({
      query: z.string().min(2, 'Search query must be at least 2 characters'),
      packType: z.string().optional(),
      filters: z.record(z.unknown()).optional(),
      limit: z.number().min(1).max(50).default(50),
    });

    let parsedArgs: z.infer<typeof schema>;
    try {
      parsedArgs = schema.parse(args);
    } catch (zodError) {
      if (typeof args === 'string') {
        parsedArgs = schema.parse({ query: args });
      } else if (args && typeof args === 'object') {
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
        this.logger.debug('Failed to parse search args, using fallback', {
          args: typeof args === 'object' ? JSON.stringify(args) : args,
          error: zodError instanceof Error ? zodError.message : 'Unknown parsing error',
        });
        throw zodError;
      }
    }

    const { query, packType, filters, limit } = parsedArgs;

    if (filters) {
      const adapter = this.getSystemAdapter(gameSystem);
      if (adapter) {
        const schemaValidation = adapter.getFilterSchema().safeParse(filters);
        if (!schemaValidation.success) {
          const details = schemaValidation.error.errors
            .map(error => `${error.path.join('.')}: ${error.message}`)
            .join('; ');
          throw new Error(`Invalid filters for system ${gameSystem}: ${details}`);
        }
      }
    }

    this.logger.info('Compendium search with system detection', {
      gameSystem,
      query,
      filters: filters ? this.describeFilterSet(filters, gameSystem) : 'none',
    });

    try {
      const rawResults = await this.foundryClient.query(
        'maeinomatic-foundry-mcp.searchCompendium',
        {
          query,
          packType,
          filters,
        }
      );

      const results = Array.isArray(rawResults) ? rawResults.filter(isCompendiumSearchEntity) : [];
      const limitedResults = results.slice(0, limit);

      this.logger.debug('Compendium search completed', {
        query,
        gameSystem,
        totalFound: results.length,
        returned: limitedResults.length,
      });

      return {
        query,
        gameSystem,
        filterDescription: filters ? this.describeFilterSet(filters, gameSystem) : 'no filters',
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
      const gameSystem = await this.getGameSystem();
      const item = (await this.foundryClient.query('maeinomatic-foundry-mcp.getCompendiumDocumentFull', {
        packId,
        documentId: itemId,
      })) as CompendiumFullEntity | null;

      if (!item) {
        throw new Error(`Item ${itemId} not found in pack ${packId}`);
      }

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

      const adapterFormatted = this.isCreatureEntity(item)
        ? this.formatWithAdapter(
            this.requireSystemAdapter(gameSystem, 'get-compendium-item creature formatting'),
            item,
            compact ? 'compact' : 'details'
          )
        : {};

      if (compact) {
        const compactStats = this.isCreatureEntity(item)
          ? ((adapterFormatted.stats as Record<string, unknown> | undefined) ?? {})
          : {};
        return {
          ...baseResponse,
          stats: compactStats,
          properties: this.extractItemProperties(item),
          items: (item.items ?? []).slice(0, 5),
          mode: 'compact',
        };
      }

      return {
        ...baseResponse,
        ...adapterFormatted,
        fullDescription: this.extractFullDescription(item),
        system: this.sanitizeSystemData((item.system ?? {}) as UnknownRecord),
        properties: this.extractItemProperties(item),
        items: item.items ?? [],
        effects: item.effects ?? [],
        fullData: item.fullData,
        mode: 'full',
      };
    } catch (error) {
      this.logger.error('Failed to get compendium item', error);
      throw new Error(
        `Failed to retrieve item: ${error instanceof Error ? error.message : 'Unknown error'}`
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
      const packs = await this.foundryClient.query<CompendiumPack[]>(
        'maeinomatic-foundry-mcp.getAvailablePacks'
      );
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
}
