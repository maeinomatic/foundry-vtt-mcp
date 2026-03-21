import { z } from 'zod';
import { FoundryClient } from '../foundry-client.js';
import { Logger } from '../logger.js';
import { SystemRegistry } from '../systems/system-registry.js';
import { detectGameSystem, type GameSystem } from '../utils/system-detection.js';

export interface CharacterToolsOptions {
  foundryClient: FoundryClient;
  logger: Logger;
  systemRegistry?: SystemRegistry;
}

interface ActorListEntry {
  id: string;
  name: string;
  type: string;
  img?: string;
}

interface CharacterAbilityData {
  value?: number;
  mod?: number;
  proficient?: boolean;
}

interface CharacterSkillData {
  value?: number;
  proficient?: boolean;
  ability?: string;
}

interface CharacterSaveData {
  value?: number;
  proficient?: boolean;
}

type UnknownRecord = Record<string, unknown>;

interface CharacterSystemCore {
  attributes?: {
    hp?: { value?: number; max?: number; temp?: number };
    ac?: { value?: number };
  };
  details?: {
    level?: { value?: number };
    class?: string;
    race?: string;
    ancestry?: string;
  };
  level?: number;
  abilities?: Record<string, CharacterAbilityData>;
  skills?: Record<string, CharacterSkillData>;
  saves?: Record<string, CharacterSaveData>;
}

type CharacterSystem = CharacterSystemCore & UnknownRecord;

interface CharacterItemSystemCore {
  description?: { value?: string } | string;
  traits?: { value?: string[]; rarity?: string };
  level?: { value?: number } | number;
  actionType?: { value?: string };
  actions?: { value?: number };
  quantity?: number;
  equipped?: boolean;
  attunement?: number | string;
}

type CharacterItemSystem = CharacterItemSystemCore & UnknownRecord;

interface CharacterItem {
  id: string;
  name: string;
  type: string;
  img?: string;
  system?: CharacterItemSystem;
}

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

interface CharacterEffect {
  id: string;
  name: string;
  disabled?: boolean;
  icon?: string;
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

interface CharacterInfoResponseCore {
  id: string;
  name: string;
  type: string;
  img?: string;
  system?: CharacterSystem;
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

const getLeveledValue = (level: CharacterItemSystem['level']): number | undefined => {
  if (typeof level === 'number') {
    return level;
  }
  return level?.value;
};

const asUnknown = (value: unknown): unknown => value;

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
          'Retrieve character information optimized for minimal token usage. Returns: full stats (abilities, skills, saves, AC, HP), action names, active effects/conditions (name only), and ALL items with minimal metadata (name, type, equipped status) without descriptions. PF2e-specific: includes traits arrays for items/actions, action costs, rarity, and level. D&D 5e-specific: includes attunement status. Perfect for filtering and checking equipment. Use get-character-entity to fetch full details for specific items, actions, spells, or effects.',
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
      const characterData = (await this.foundryClient.query('foundry-mcp-bridge.getCharacterInfo', {
        characterName: identifier,
      })) as CharacterInfoResponse;

      this.logger.debug('Successfully retrieved character data', {
        characterId: characterData.id,
        characterName: characterData.name,
      });

      return await this.formatCharacterResponse(characterData);
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
      const characterData = (await this.foundryClient.query('foundry-mcp-bridge.getCharacterInfo', {
        characterName: characterIdentifier,
      })) as CharacterInfoResponse;

      const itemEntity = characterData.items?.find(
        i => i.id === entityIdentifier || i.name.toLowerCase() === entityIdentifier.toLowerCase()
      );
      if (itemEntity) {
        return {
          entityType: 'item',
          id: itemEntity.id,
          name: itemEntity.name,
          type: itemEntity.type,
          description:
            (typeof itemEntity.system?.description === 'string'
              ? itemEntity.system.description
              : itemEntity.system?.description?.value) ?? '',
          traits: itemEntity.system?.traits?.value ?? [],
          rarity: itemEntity.system?.traits?.rarity ?? 'common',
          level: getLeveledValue(itemEntity.system?.level),
          actionType: itemEntity.system?.actionType?.value,
          actions: itemEntity.system?.actions?.value,
          quantity: itemEntity.system?.quantity ?? 1,
          equipped: itemEntity.system?.equipped,
          attunement: itemEntity.system?.attunement,
          hasImage: !!itemEntity.img,
          system: itemEntity.system,
        };
      }

      const actionEntity = characterData.actions?.find(
        a => a.name.toLowerCase() === entityIdentifier.toLowerCase()
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
        e => e.name.toLowerCase() === entityIdentifier.toLowerCase()
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
      const actors = (await this.foundryClient.query('foundry-mcp-bridge.listActors', {
        type,
      })) as ActorListEntry[];

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
      const result = (await this.foundryClient.query('foundry-mcp-bridge.useItem', {
        actorIdentifier,
        itemIdentifier,
        targets,
        options: {
          consume: consume ?? true,
          spellLevel,
          skipDialog: skipDialog ?? true, // Default to skipping dialogs for MCP automation
        },
      })) as UseItemResponse;

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
      const result = (await this.foundryClient.query('foundry-mcp-bridge.searchCharacterItems', {
        characterIdentifier,
        query,
        type,
        category,
        limit: limit ?? 20,
      })) as SearchCharacterItemsResponse;

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
      basicInfo: this.extractBasicInfo(characterData),
      stats: await this.extractStats(characterData),
      items: this.formatItems(characterData.items ?? []),
      effects: this.formatEffects(characterData.effects ?? []),
      hasImage: !!characterData.img,
    };

    // Add actions with minimal data (name, traits, action cost only - no variants)
    if (characterData.actions && characterData.actions.length > 0) {
      response.actions = this.formatActions(characterData.actions);
    }

    // Add spellcasting data with spell lists
    if (characterData.spellcasting && characterData.spellcasting.length > 0) {
      response.spellcasting = this.formatSpellcasting(characterData.spellcasting);
    }

    // Exclude itemVariants and itemToggles - these are verbose and can be fetched via get-character-entity if needed

    return response;
  }

  private formatSpellcasting(spellcastingEntries: SpellcastingEntry[]): unknown[] {
    return spellcastingEntries.map(entry => {
      const formatted: Record<string, unknown> = {
        name: entry.name,
        type: entry.type,
      };

      // Include tradition for PF2e (arcane, divine, primal, occult)
      if (entry.tradition) {
        formatted.tradition = entry.tradition;
      }

      // Include spellcasting ability
      if (entry.ability) {
        formatted.ability = entry.ability;
      }

      // Include DC and attack bonus
      if (entry.dc) {
        formatted.dc = entry.dc;
      }
      if (entry.attack) {
        formatted.attack = entry.attack;
      }

      // Include spell slots if available
      if (entry.slots && Object.keys(entry.slots).length > 0) {
        formatted.slots = entry.slots;
      }

      // Format spells - minimal data for browsing, use get-character-entity for full details
      if (entry.spells && entry.spells.length > 0) {
        formatted.spells = entry.spells.map(spell => {
          const spellData: Record<string, unknown> = {
            id: spell.id,
            name: spell.name,
            level: spell.level,
          };

          // Only include prepared status if it's false (assumed prepared by default)
          if (spell.prepared === false) {
            spellData.prepared = false;
          }

          // Include expended status if spell slot has been used
          if (spell.expended) {
            spellData.expended = true;
          }

          // Include traits for PF2e spells (for filtering by damage type, etc.)
          if (spell.traits && spell.traits.length > 0) {
            spellData.traits = spell.traits;
          }

          // Include action cost
          if (spell.actionCost) {
            spellData.actionCost = spell.actionCost;
          }

          // Include targeting info - helps Claude decide whether to specify targets
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
    });
  }

  private formatActions(actions: CharacterAction[]): unknown[] {
    // Return minimal action data - just enough to identify and filter
    return actions.map(action => {
      const formatted: Record<string, unknown> = {
        name: action.name,
        type: action.type,
      };

      // Include traits if present (for filtering, e.g., "fire" attacks, "concentrate" actions)
      if (action.traits && action.traits.length > 0) {
        formatted.traits = action.traits;
      }

      // Include action cost (e.g., 1, 2, 3 actions, reaction, free)
      if (action.actions !== undefined) {
        formatted.actionCost = action.actions;
      }

      // Include itemId for cross-referencing with items
      if (action.itemId) {
        formatted.itemId = action.itemId;
      }

      return formatted;
    });
  }

  private extractBasicInfo(characterData: CharacterInfoResponse): unknown {
    const system = characterData.system ?? {};

    // Extract common fields that exist across different game systems
    const basicInfo: Record<string, unknown> = {};

    // D&D 5e / PF2e common fields
    if (system.attributes) {
      if (system.attributes.hp) {
        basicInfo.hitPoints = {
          current: system.attributes.hp.value,
          max: system.attributes.hp.max,
          temp: system.attributes.hp.temp ?? 0,
        };
      }
      if (system.attributes.ac) {
        basicInfo.armorClass = system.attributes.ac.value;
      }
    }

    // Level information
    if (system.details?.level?.value) {
      basicInfo.level = system.details.level.value;
    } else if (system.level) {
      basicInfo.level = system.level;
    }

    // Class information
    if (system.details?.class) {
      basicInfo.class = system.details.class;
    }

    // Race/ancestry information
    if (system.details?.race) {
      basicInfo.race = system.details.race;
    } else if (system.details?.ancestry) {
      basicInfo.ancestry = system.details.ancestry;
    }

    return basicInfo;
  }

  private async extractStats(characterData: CharacterInfoResponse): Promise<unknown> {
    // Try using system adapter if available
    if (this.systemRegistry) {
      try {
        const gameSystem = await this.getGameSystem();
        const adapter = this.systemRegistry.getAdapter(gameSystem);

        if (adapter) {
          this.logger.debug('Using system adapter for character stats extraction', {
            system: gameSystem,
          });
          return asUnknown(adapter.extractCharacterStats(characterData));
        }
      } catch (error) {
        this.logger.warn('Failed to use system adapter, falling back to legacy extraction', {
          error,
        });
      }
    }

    // Legacy extraction (backwards compatibility)
    const system = characterData.system ?? {};
    const stats: Record<string, unknown> = {};

    // Ability scores (D&D 5e style)
    if (system.abilities) {
      const abilities: Record<string, { score: number; modifier: number }> = {};
      for (const [key, ability] of Object.entries(system.abilities)) {
        abilities[key] = {
          score: ability.value ?? 10,
          modifier: ability.mod ?? 0,
        };
      }
      stats.abilities = abilities;
    }

    // Skills
    if (system.skills) {
      const skills: Record<string, { value: number; proficient: boolean; ability: string }> = {};
      for (const [key, skill] of Object.entries(system.skills)) {
        skills[key] = {
          value: skill.value ?? 0,
          proficient: skill.proficient ?? false,
          ability: skill.ability ?? '',
        };
      }
      stats.skills = skills;
    }

    // Saves
    if (system.saves) {
      const saves: Record<string, { value: number; proficient: boolean }> = {};
      for (const [key, save] of Object.entries(system.saves)) {
        saves[key] = {
          value: save.value ?? 0,
          proficient: save.proficient ?? false,
        };
      }
      stats.saves = saves;
    }

    return stats;
  }

  private formatItems(items: CharacterItem[]): unknown[] {
    // Return ALL items with minimal data
    return items.map(item => {
      // Return minimal data - just enough to identify and filter items
      const formattedItem: Record<string, unknown> = {
        id: item.id,
        name: item.name,
        type: item.type,
      };

      // Include quantity if present
      if (item.system?.quantity !== undefined && item.system.quantity !== 1) {
        formattedItem.quantity = item.system.quantity;
      }

      // Include traits for PF2e items (feats, equipment, spells, etc.)
      if (item.system?.traits?.value) {
        formattedItem.traits = Array.isArray(item.system.traits.value)
          ? item.system.traits.value
          : [];
      }

      // Include rarity for PF2e items
      if (item.system?.traits?.rarity) {
        formattedItem.rarity = item.system.traits.rarity;
      }

      // Include level for PF2e items (feats, spells, etc.)
      const itemLevel = getLeveledValue(item.system?.level);
      if (itemLevel !== undefined) {
        formattedItem.level = itemLevel;
      }

      // Include action cost for PF2e feats/actions
      if (item.system?.actionType?.value) {
        formattedItem.actionType = item.system.actionType.value;
      }

      // Include equipped status for equippable items
      if (item.system?.equipped !== undefined) {
        formattedItem.equipped = item.system.equipped;
      }

      // Include attuned status for D&D 5e magic items
      if (item.system?.attunement !== undefined) {
        formattedItem.attunement = item.system.attunement;
      }

      return formattedItem;
    });
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

  private truncateText(text: string, maxLength: number): string {
    if (!text || text.length <= maxLength) {
      return text;
    }
    return `${text.substring(0, maxLength - 3)}...`;
  }
}
