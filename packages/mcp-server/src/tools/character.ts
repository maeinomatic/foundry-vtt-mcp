import { z } from 'zod';
import { FoundryClient } from '../foundry-client.js';
import type {
  FoundryActiveEffectDocumentBase,
  FoundryActorDocumentBase,
  FoundryActorSystemBase,
  FoundryItemDocumentBase,
  FoundryItemSystemBase,
  UnknownRecord,
} from '../foundry-types.js';
import { Logger } from '../logger.js';
import { SystemRegistry } from '../systems/system-registry.js';
import type { SystemAdapter } from '../systems/types.js';
import { detectGameSystem, type GameSystem } from '../utils/system-detection.js';

export interface CharacterToolsOptions {
  foundryClient: FoundryClient;
  logger: Logger;
  systemRegistry?: SystemRegistry;
}

type ActorListEntry = Pick<FoundryActorDocumentBase, 'id' | 'name' | 'type' | 'img'>;

type CharacterSystem = FoundryActorSystemBase;

type CharacterItemSystem = FoundryItemSystemBase;

interface CharacterItem extends FoundryItemDocumentBase<CharacterItemSystem> {}

interface CharacterAction {
  name: string;
  type?: string;
  itemId?: string;
  traits?: string[];
  variants?: unknown[];
  ready?: boolean;
  description?: string;
  actions?: number;
}

interface CharacterEffect extends FoundryActiveEffectDocumentBase {
  description?: string;
  traits?: string[];
  duration?: { type?: string; remaining?: number };
}

interface SpellData {
  id: string;
  name: string;
  level?: number;
  prepared?: boolean;
  expended?: boolean;
  traits?: string[];
  actionCost?: number | string;
  range?: string;
  target?: string;
  area?: string;
}

interface SpellcastingEntry {
  name: string;
  type?: string;
  tradition?: string;
  ability?: string;
  dc?: number;
  attack?: number;
  slots?: Record<string, unknown>;
  spells?: SpellData[];
}

interface CharacterInfoResponseCore
  extends FoundryActorDocumentBase<CharacterSystem, CharacterItemSystem> {
  items?: CharacterItem[];
  effects?: CharacterEffect[];
  actions?: CharacterAction[];
  spellcasting?: SpellcastingEntry[];
}

type CharacterInfoResponse = CharacterInfoResponseCore & {
  // Optional producer-specific extras. Keep MCP behavior bound to core fields.
  itemVariants?: unknown[];
  itemToggles?: unknown[];
} & UnknownRecord;

type EffectDuration = {
  type: string | undefined;
  remaining: number | undefined;
};

interface UseItemResponse {
  actorName: string;
  itemName: string;
  targets?: string[];
  [key: string]: unknown;
}

interface SearchCharacterItemsResponse {
  characterName: string;
  matches?: unknown[];
  [key: string]: unknown;
}

export class CharacterTools {
  private foundryClient: FoundryClient;
  private logger: Logger;
  private systemRegistry: SystemRegistry | null;
  private cachedGameSystem: GameSystem | null = null;

  constructor({ foundryClient, logger, systemRegistry }: CharacterToolsOptions) {
    this.foundryClient = foundryClient;
    this.logger = logger.child({ component: 'CharacterTools' });
    this.systemRegistry = systemRegistry ?? null;
  }

  /**
   * Get or detect the game system (cached)
   */
  private async getGameSystem(): Promise<GameSystem> {
    if (!this.cachedGameSystem) {
      this.cachedGameSystem = await detectGameSystem(this.foundryClient, this.logger);
    }
    return this.cachedGameSystem;
  }

  private async withSystemAdapter<T>(
    operation: string,
    onAdapter: (adapter: SystemAdapter, system: GameSystem) => T,
    onFallback: () => T
  ): Promise<T> {
    if (!this.systemRegistry) {
      return onFallback();
    }

    try {
      const gameSystem = await this.getGameSystem();
      const adapter = this.systemRegistry.getAdapter(gameSystem);
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
    ];
  }

  async handleGetCharacter(args: unknown): Promise<unknown> {
    const schema = z.object({
      identifier: z.string().min(1, 'Character identifier cannot be empty'),
    });

    const { identifier } = schema.parse(args);

    this.logger.info('Getting character information', { identifier });

    try {
      const characterData = await this.foundryClient.query<CharacterInfoResponse>(
        'foundry-mcp-bridge.getCharacterInfo',
        {
          characterName: identifier,
        }
      );

      this.logger.debug('Successfully retrieved character data', {
        characterId: characterData.id,
        characterName: characterData.name,
      });

      return this.formatCharacterResponse(characterData);
    } catch (error) {
      this.logger.error('Failed to get character information', error);
      throw new Error(
        `Failed to retrieve character "${identifier}": ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async handleGetCharacterEntity(args: unknown): Promise<unknown> {
    const schema = z.object({
      characterIdentifier: z.string().min(1, 'Character identifier cannot be empty'),
      entityIdentifier: z.string().min(1, 'Entity identifier cannot be empty'),
    });

    const { characterIdentifier, entityIdentifier } = schema.parse(args);

    this.logger.info('Getting character entity', { characterIdentifier, entityIdentifier });

    try {
      const characterData = await this.foundryClient.query<CharacterInfoResponse>(
        'foundry-mcp-bridge.getCharacterInfo',
        {
          characterName: characterIdentifier,
        }
      );
      const normalizedEntityIdentifier = entityIdentifier.toLowerCase();

      const itemEntity = characterData.items?.find(
        i => i.id === entityIdentifier || i.name.toLowerCase() === normalizedEntityIdentifier
      );
      if (itemEntity) {
        return {
          entityType: 'item',
          ...(await this.formatCharacterItemDetails(itemEntity)),
        };
      }

      const actionEntity = characterData.actions?.find(
        a => a.name.toLowerCase() === normalizedEntityIdentifier
      );
      if (actionEntity) {
        return {
          entityType: 'action',
          name: actionEntity.name,
          type: actionEntity.type,
          itemId: actionEntity.itemId,
          traits: actionEntity.traits ?? [],
          variants: actionEntity.variants ?? [],
          ready: actionEntity.ready,
          description: actionEntity.description ?? 'Action from character strikes/abilities',
        };
      }

      const effectEntity = characterData.effects?.find(
        e => e.name.toLowerCase() === normalizedEntityIdentifier
      );
      if (effectEntity) {
        return {
          ...effectEntity,
          entityType: 'effect',
          id: effectEntity.id,
          name: effectEntity.name,
          description: effectEntity.description ?? effectEntity.name,
          traits: effectEntity.traits ?? [],
          duration: effectEntity.duration,
        };
      }

      throw new Error(
        `Entity "${entityIdentifier}" not found on character "${characterIdentifier}". Tried items, actions, and effects.`
      );
    } catch (error) {
      this.logger.error('Failed to get character entity', error);
      throw new Error(
        `Failed to retrieve entity "${entityIdentifier}" from character "${characterIdentifier}": ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async handleListCharacters(args: unknown): Promise<unknown> {
    const schema = z.object({
      type: z.string().optional(),
    });

    const { type } = schema.parse(args);

    this.logger.info('Listing characters', { type });

    try {
      const actors = await this.foundryClient.query<ActorListEntry[]>('foundry-mcp-bridge.listActors', {
        type,
      });

      this.logger.debug('Successfully retrieved character list', { count: actors.length });

      // Format the response for Claude
      return {
        characters: actors.map(actor => ({
          id: actor.id,
          name: actor.name,
          type: actor.type,
          hasImage: !!actor.img,
        })),
        total: actors.length,
        filtered: type ? `Filtered by type: ${type}` : 'All characters',
      };
    } catch (error) {
      this.logger.error('Failed to list characters', error);
      throw new Error(
        `Failed to list characters: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async handleUseItem(args: unknown): Promise<unknown> {
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
      const result = await this.foundryClient.query<UseItemResponse>('foundry-mcp-bridge.useItem', {
        actorIdentifier,
        itemIdentifier,
        targets,
        options: {
          consume: consume ?? true,
          spellLevel,
          skipDialog: skipDialog ?? true, // Default to skipping dialogs for MCP automation
        },
      });

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

  async handleSearchCharacterItems(args: unknown): Promise<unknown> {
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
      const result = await this.foundryClient.query<SearchCharacterItemsResponse>(
        'foundry-mcp-bridge.searchCharacterItems',
        {
          characterIdentifier,
          query,
          type,
          category,
          limit: limit ?? 20,
        }
      );

      this.logger.debug('Successfully searched character items', {
        characterName: result.characterName,
        matchCount: result.matches?.length ?? 0,
      });

      return result;
    } catch (error) {
      this.logger.error('Failed to search character items', error);
      throw new Error(
        `Failed to search items for "${characterIdentifier}": ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private async formatCharacterResponse(characterData: CharacterInfoResponse): Promise<unknown> {
    const response: {
      id: string;
      name: string;
      type: string;
      basicInfo: unknown;
      stats: unknown;
      items: unknown[];
      effects: unknown[];
      hasImage: boolean;
      actions?: unknown[];
      spellcasting?: unknown[];
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

  private async formatSpellcasting(spellcastingEntries: SpellcastingEntry[]): Promise<unknown[]> {
    return this.withSystemAdapter<unknown[]>(
      'spellcasting formatting',
      (adapter: SystemAdapter): unknown[] =>
        spellcastingEntries.map(entry => adapter.formatSpellcastingEntryForList(entry)),
      () => spellcastingEntries.map(entry => this.formatSpellcastingLegacy(entry))
    );
  }

  private formatSpellcastingLegacy(entry: SpellcastingEntry): Record<string, unknown> {
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

  private async formatActions(actions: CharacterAction[]): Promise<unknown[]> {
    return this.withSystemAdapter<unknown[]>(
      'action formatting',
      (adapter: SystemAdapter): unknown[] =>
        actions.map(action => adapter.formatCharacterActionForList(action)),
      () => actions.map(action => this.formatActionLegacy(action))
    );
  }

  private formatActionLegacy(action: CharacterAction): Record<string, unknown> {
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

  private async extractBasicInfo(characterData: CharacterInfoResponse): Promise<unknown> {
    return this.withSystemAdapter<unknown>(
      'character basic info extraction',
      (adapter: SystemAdapter): unknown => adapter.formatCharacterBasicInfo(characterData),
      () => this.extractBasicInfoLegacy(characterData)
    );
  }

  private extractBasicInfoLegacy(characterData: CharacterInfoResponse): unknown {
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

  private async extractStats(characterData: CharacterInfoResponse): Promise<unknown> {
    return this.withSystemAdapter<unknown>(
      'character stats extraction',
      (adapter: SystemAdapter): unknown => adapter.extractCharacterStats(characterData),
      () => this.extractStatsLegacy(characterData)
    );
  }

  private async formatItems(items: CharacterItem[]): Promise<unknown[]> {
    return this.withSystemAdapter<unknown[]>(
      'item formatting',
      (adapter: SystemAdapter): unknown[] =>
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

  private formatEffects(effects: CharacterEffect[]): Array<{
    id: string;
    name: string;
    disabled: boolean;
    duration: EffectDuration | null;
    hasIcon: boolean;
  }> {
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
