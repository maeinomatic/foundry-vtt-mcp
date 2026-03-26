import { z } from 'zod';
import { FoundryClient } from '../../foundry-client.js';
import type {
  FoundryActorSystemBase,
  FoundryCreatureSearchCriteria,
  FoundryCreatureSearchResult,
  FoundryTraitsData,
  UnknownRecord,
} from '../../foundry-types.js';
import { Logger } from '../../logger.js';
import type { SystemAdapter } from '../../systems/types.js';
import type { GameSystem } from '../../utils/system-detection.js';

interface CompendiumEntitySystem extends FoundryActorSystemBase {
  traits?: FoundryTraitsData;
}

type CreatureSearchEntity = FoundryCreatureSearchResult<CompendiumEntitySystem>;
type CriteriaParams = FoundryCreatureSearchCriteria;

const toRecord = (value: unknown): UnknownRecord =>
  value !== null && typeof value === 'object' ? (value as UnknownRecord) : {};

export interface CompendiumCreatureSearchServiceOptions {
  foundryClient: FoundryClient;
  logger: Logger;
  getGameSystem: () => Promise<GameSystem>;
  requireSystemAdapter: (gameSystem: GameSystem, capability: string) => SystemAdapter;
  getSystemDisplayName: (gameSystem: GameSystem) => string;
  formatCreatureListItem: (
    creature: CreatureSearchEntity,
    gameSystem?: GameSystem
  ) => Record<string, unknown>;
}

interface CreatureSearchResponseEnvelope {
  response: {
    creatures: CreatureSearchEntity[];
    searchSummary: Record<string, unknown> & {
      packsSearched?: number;
    };
  };
}

export class CompendiumCreatureSearchService {
  private foundryClient: FoundryClient;
  private logger: Logger;
  private getGameSystem: () => Promise<GameSystem>;
  private requireSystemAdapter: (gameSystem: GameSystem, capability: string) => SystemAdapter;
  private getSystemDisplayName: (gameSystem: GameSystem) => string;
  private formatCreatureListItem: (
    creature: CreatureSearchEntity,
    gameSystem?: GameSystem
  ) => Record<string, unknown>;

  constructor(options: CompendiumCreatureSearchServiceOptions) {
    this.foundryClient = options.foundryClient;
    this.logger = options.logger.child({ component: 'CompendiumCreatureSearchService' });
    this.getGameSystem = options.getGameSystem;
    this.requireSystemAdapter = options.requireSystemAdapter;
    this.getSystemDisplayName = options.getSystemDisplayName;
    this.formatCreatureListItem = options.formatCreatureListItem;
  }

  async handleListCreaturesByCriteria(args: unknown): Promise<unknown> {
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

    const schema = z.object({
      challengeRating: z
        .union([
          z.object({
            min: z.number().optional().default(0),
            max: z.number().optional().default(30),
          }),
          z
            .string()
            .refine(val => parseNumericRange(val, { min: 0, max: 30 }) !== null, {
              message: 'Challenge rating range must be valid JSON object with min/max numbers',
            })
            .transform(val => parseNumericRange(val, { min: 0, max: 30 }) ?? { min: 0, max: 30 }),
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
            .refine(val => parseNumericRange(val, { min: -1, max: 25 }) !== null)
            .transform(val => parseNumericRange(val, { min: -1, max: 25 }) ?? { min: -1, max: 25 }),
          z.number(),
          z
            .string()
            .refine(val => !isNaN(parseFloat(val)))
            .transform(val => parseFloat(val)),
        ])
        .optional(),
      creatureType: z.string().optional(),
      size: z.enum(['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan']).optional(),
      traits: z.array(z.string()).optional(),
      rarity: z.enum(['common', 'uncommon', 'rare', 'unique']).optional(),
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
      const results = await this.foundryClient.query<CreatureSearchResponseEnvelope>(
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

      const responsePayload = results.response;
      const resultCreatures = responsePayload.creatures;
      const searchSummary = responsePayload.searchSummary;

      return {
        gameSystem,
        criteriaDescription,
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
}
