import { z } from 'zod';
import { FoundryClient } from '../foundry-client.js';
import type {
  FoundryApplyCharacterAdvancementChoiceRequest,
  FoundryApplyCharacterAdvancementChoiceResponse,
  FoundryActorDocumentBase,
  FoundryActorSystemBase,
  FoundryBatchUpdateActorEmbeddedItemsRequest,
  FoundryBatchUpdateActorEmbeddedItemsResponse,
  FoundryCharacterEffect,
  FoundryCharacterInfo,
  FoundryCreateActorEmbeddedItemRequest,
  FoundryCreateActorEmbeddedItemResponse,
  FoundryDeleteActorEmbeddedItemRequest,
  FoundryDeleteActorEmbeddedItemResponse,
  FoundryGetCharacterAdvancementOptionsRequest,
  FoundryGetCharacterAdvancementOptionsResponse,
  FoundryItemDocumentBase,
  FoundryItemSystemBase,
  FoundryProgressionPreviewStep,
  FoundryPreviewCharacterProgressionRequest,
  FoundryPreviewCharacterProgressionResponse,
  FoundrySearchCharacterItemsResponse,
  FoundryUpdateActorEmbeddedItemRequest,
  FoundryUpdateActorEmbeddedItemResponse,
  FoundryUpdateActorRequest,
  FoundryUpdateActorResponse,
  UnknownRecord,
} from '../foundry-types.js';
import { Logger } from '../logger.js';
import { SystemRegistry } from '../systems/system-registry.js';
import type {
  CharacterProgressionUpdateRequest,
  PreparedCharacterProgressionUpdate,
  SystemAdapter,
  SystemCharacterAction,
  SystemSpellcastingEntry,
} from '../systems/types.js';
import { detectGameSystem, type GameSystem } from '../utils/system-detection.js';

export interface CharacterToolsOptions {
  foundryClient: FoundryClient;
  logger: Logger;
  systemRegistry?: SystemRegistry;
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

interface UseItemResponse extends UnknownRecord {
  actorName: string;
  itemName: string;
  targets?: string[];
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

  private toRecord(value: unknown): UnknownRecord | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }

    return value as UnknownRecord;
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

  private getDnD5eSpellcastingClassSummaries(characterData: CharacterInfoResponse): Array<{
    id: string;
    name: string;
    spellcastingType?: string;
    spellcastingProgression?: string;
  }> {
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
  ): { id: string; name: string; spellcastingType?: string; spellcastingProgression?: string } {
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
          'DnD5e only: inspect a character spellbook for multiclass source-class mismatches and other organizational issues.',
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
              type: 'array',
              description:
                'Optional progression choices to auto-apply during the level-up flow when they match the actual pending advancement steps.',
              items: {
                type: 'object',
                properties: {
                  stepId: {
                    type: 'string',
                    description:
                      'Preferred exact pending-step ID from preview-character-progression',
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
            },
          },
          required: ['characterIdentifier'],
        },
      },
    ];
  }

  async handleGetCharacter(args: unknown): Promise<UnknownRecord> {
    const schema = z.object({
      identifier: z.string().min(1, 'Character identifier cannot be empty'),
    });

    const { identifier } = schema.parse(args);

    this.logger.info('Getting character information', { identifier });

    try {
      const characterData = await this.foundryClient.query<CharacterInfoResponse>(
        'foundry-mcp-bridge.getCharacterInfo',
        {
          identifier,
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

  async handleGetCharacterEntity(args: unknown): Promise<UnknownRecord> {
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
          identifier: characterIdentifier,
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

  async handleListCharacters(args: unknown): Promise<UnknownRecord> {
    const schema = z.object({
      type: z.string().optional(),
    });

    const { type } = schema.parse(args);

    this.logger.info('Listing characters', { type });

    try {
      const actors = await this.foundryClient.query<ActorListEntry[]>(
        'foundry-mcp-bridge.listActors',
        {
          type,
        }
      );

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
      const result = await this.foundryClient.query('foundry-mcp-bridge.searchCharacterItems', {
        ...request,
      });

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
      'foundry-mcp-bridge.createActorEmbeddedItem',
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
      'foundry-mcp-bridge.updateActorEmbeddedItem',
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
      'foundry-mcp-bridge.deleteActorEmbeddedItem',
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
            'foundry-mcp-bridge.getCharacterInfo',
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
      'foundry-mcp-bridge.createActorEmbeddedItem',
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
      'foundry-mcp-bridge.updateActorEmbeddedItem',
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
      'foundry-mcp-bridge.deleteActorEmbeddedItem',
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
      'foundry-mcp-bridge.updateActor',
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
      'foundry-mcp-bridge.getCharacterInfo',
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
      'foundry-mcp-bridge.updateActorEmbeddedItem',
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
    const gameSystem = await this.getGameSystem();
    if (gameSystem !== 'dnd5e') {
      throw new Error(
        'UNSUPPORTED_CAPABILITY: validate-dnd5e-spellbook is only available when the active system is dnd5e.'
      );
    }

    const characterData = await this.foundryClient.query<CharacterInfoResponse>(
      'foundry-mcp-bridge.getCharacterInfo',
      {
        identifier: parsed.actorIdentifier,
      }
    );

    const classes = this.getDnD5eSpellcastingClassSummaries(characterData);
    const classById = new Map(classes.map(item => [item.id, item]));
    const classByName = new Map(classes.map(item => [item.name.toLowerCase(), item]));
    const spellItems = (characterData.items ?? []).filter(item => item.type === 'spell');

    const issues: Array<Record<string, unknown>> = [];
    const sourceClassCounts: Record<string, number> = {};
    let preparedSpellCount = 0;

    for (const spell of spellItems) {
      const sourceClass = this.getDnD5eSpellSourceValue(spell);
      const prepared = this.getDnD5eSpellPreparedValue(spell);
      if (prepared) {
        preparedSpellCount += 1;
      }

      if (sourceClass) {
        sourceClassCounts[sourceClass] = (sourceClassCounts[sourceClass] ?? 0) + 1;
      }

      if (!sourceClass) {
        if (classes.length > 1) {
          issues.push({
            severity: 'warning',
            code: 'missing-source-class',
            spellId: spell.id,
            spellName: spell.name,
            message: 'This spell has no assigned source class on a multiclass spellcaster.',
          });
        }
        continue;
      }

      const matchedClass = classById.get(sourceClass) ?? classByName.get(sourceClass.toLowerCase());
      if (!matchedClass) {
        issues.push({
          severity: 'warning',
          code: 'unknown-source-class',
          spellId: spell.id,
          spellName: spell.name,
          sourceClass,
          message: `This spell references an unknown source class "${sourceClass}".`,
        });
      }
    }

    if (spellItems.length > 0 && classes.length === 0) {
      issues.push({
        severity: 'warning',
        code: 'no-spellcasting-class',
        message: 'This actor has spells but no spellcasting class items were detected.',
      });
    }

    const recommendations: string[] = [];
    if (classes.length > 1 && issues.some(issue => issue.code === 'missing-source-class')) {
      recommendations.push(
        'Use reassign-dnd5e-spell-source-class to assign each multiclass spell to the correct spellcasting class.'
      );
    }
    if (issues.some(issue => issue.code === 'unknown-source-class')) {
      recommendations.push(
        'Review spells with unknown source classes and reassign them to a current spellcasting class item.'
      );
    }

    return {
      success: true,
      character: {
        id: characterData.id,
        name: characterData.name,
        type: characterData.type,
      },
      summary: {
        spellCount: spellItems.length,
        preparedSpellCount,
        spellcastingClassCount: classes.length,
        multiclassSpellcaster: classes.length > 1,
        issueCount: issues.length,
        sourceClassCounts,
      },
      classes,
      issues,
      ...(recommendations.length > 0 ? { recommendations } : {}),
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
      'foundry-mcp-bridge.getCharacterInfo',
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
      'foundry-mcp-bridge.batchUpdateActorEmbeddedItems',
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
      'foundry-mcp-bridge.getCharacterInfo',
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
      'foundry-mcp-bridge.batchUpdateActorEmbeddedItems',
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

  async handlePreviewCharacterProgression(args: unknown): Promise<UnknownRecord> {
    const parsed = this.parseProgressionArgs(args);

    this.logger.info('Previewing character progression', parsed);

    const previewResult = await this.buildProgressionPreviewResult(parsed);

    return {
      success: true,
      safeToApplyDirectly: previewResult.preview?.safeToApplyDirectly ?? true,
      character: previewResult.character,
      progression: previewResult.prepared.summary,
      target: previewResult.prepared.target,
      proposedUpdates: previewResult.prepared.updates,
      pendingAdvancements: previewResult.preview?.pendingSteps ?? [],
      ...(previewResult.warnings.length > 0 ? { warnings: previewResult.warnings } : {}),
    };
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

    const request: FoundryGetCharacterAdvancementOptionsRequest = {
      actorIdentifier: parsed.characterIdentifier,
      targetLevel: parsed.targetLevel,
      stepId: parsed.stepId,
      ...(parsed.classIdentifier !== undefined ? { classIdentifier: parsed.classIdentifier } : {}),
      ...(parsed.query !== undefined ? { query: parsed.query } : {}),
      ...(parsed.limit !== undefined ? { limit: parsed.limit } : {}),
    };

    const result = await this.foundryClient.query<FoundryGetCharacterAdvancementOptionsResponse>(
      'foundry-mcp-bridge.getCharacterAdvancementOptions',
      request
    );

    return {
      success: true,
      character: {
        id: result.actorId,
        name: result.actorName,
        type: result.actorType,
      },
      step: {
        id: result.stepId,
        type: result.stepType,
        title: result.stepTitle,
        ...(result.choiceDetails ? { choiceDetails: result.choiceDetails } : {}),
      },
      options: result.options,
      totalOptions: result.totalOptions,
      ...(result.classId ? { classId: result.classId } : {}),
      ...(result.className ? { className: result.className } : {}),
      ...(result.warnings ? { warnings: result.warnings } : {}),
    };
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

    const request: FoundryApplyCharacterAdvancementChoiceRequest = {
      actorIdentifier: parsed.characterIdentifier,
      targetLevel: parsed.targetLevel,
      stepId: parsed.stepId,
      ...(parsed.classIdentifier !== undefined ? { classIdentifier: parsed.classIdentifier } : {}),
      choice,
    };

    const result = await this.foundryClient.query<FoundryApplyCharacterAdvancementChoiceResponse>(
      'foundry-mcp-bridge.applyCharacterAdvancementChoice',
      request
    );

    let preview: FoundryPreviewCharacterProgressionResponse | null = null;
    try {
      preview = await this.previewCharacterProgression({
        actorIdentifier: parsed.characterIdentifier,
        targetLevel: parsed.targetLevel,
        ...(parsed.classIdentifier !== undefined
          ? { classIdentifier: parsed.classIdentifier }
          : {}),
      });
    } catch (error) {
      this.logger.warn('Failed to refresh character progression preview after applying choice', {
        error,
      });
    }

    const warnings = this.mergeWarnings(result.warnings, preview?.warnings);

    return {
      success: result.success,
      character: {
        id: result.actorId,
        name: result.actorName,
        type: result.actorType,
      },
      step: {
        id: result.stepId,
        type: result.stepType,
        title: result.stepTitle,
      },
      choice: result.choice,
      ...(result.classId ? { classId: result.classId } : {}),
      ...(result.className ? { className: result.className } : {}),
      ...(result.createdItemIds ? { createdItemIds: result.createdItemIds } : {}),
      ...(preview
        ? {
            safeToApplyDirectly: preview.safeToApplyDirectly,
            remainingPendingAdvancements: preview.pendingSteps,
            nextStep: preview.safeToApplyDirectly
              ? 'Run update-character-progression to finalize the class level change.'
              : 'Continue applying the remaining advancement choices before finalizing the level change.',
          }
        : {}),
      ...(warnings.length > 0 ? { warnings } : {}),
    };
  }

  async handleUpdateCharacterProgression(args: unknown): Promise<UnknownRecord> {
    const parsed = this.parseProgressionArgs(args);

    this.logger.info('Updating character progression', parsed);

    let previewResult = await this.buildProgressionPreviewResult(parsed);
    const autoAppliedAdvancements =
      previewResult.preview && parsed.targetLevel !== undefined
        ? await this.autoApplySafeAdvancements(parsed, previewResult.preview)
        : [];

    if (autoAppliedAdvancements.length > 0) {
      previewResult = await this.buildProgressionPreviewResult(parsed);
    }

    if (previewResult.preview && !previewResult.preview.safeToApplyDirectly) {
      return {
        success: false,
        requiresChoices: true,
        character: previewResult.character,
        progression: previewResult.prepared.summary,
        pendingAdvancements: previewResult.preview.pendingSteps,
        ...(autoAppliedAdvancements.length > 0 ? { autoAppliedAdvancements } : {}),
        nextStep:
          'Review the pending DnD5e advancement steps and complete the required choices through a dedicated advancement flow before applying the level change.',
        ...(previewResult.warnings.length > 0 ? { warnings: previewResult.warnings } : {}),
      };
    }

    const result = await this.applyProgressionUpdate(
      parsed.characterIdentifier,
      previewResult.prepared
    );

    return {
      success: result.success,
      character:
        'actorType' in result
          ? {
              id: result.actorId,
              name: result.actorName,
              type: result.actorType,
            }
          : {
              id: result.actorId,
              name: result.actorName,
            },
      progression: previewResult.prepared.summary,
      appliedUpdates: result.appliedUpdates,
      updatedFields: result.updatedFields,
      ...(autoAppliedAdvancements.length > 0 ? { autoAppliedAdvancements } : {}),
      ...(previewResult.warnings.length > 0 ? { warnings: previewResult.warnings } : {}),
      ...(previewResult.preview && previewResult.preview.pendingSteps.length > 0
        ? { pendingAdvancements: previewResult.preview.pendingSteps }
        : {}),
    };
  }

  private async previewCharacterProgression(
    request: FoundryPreviewCharacterProgressionRequest
  ): Promise<FoundryPreviewCharacterProgressionResponse> {
    return this.foundryClient.query<FoundryPreviewCharacterProgressionResponse>(
      'foundry-mcp-bridge.previewCharacterProgression',
      request
    );
  }

  private async autoApplySafeAdvancements(
    parsed: {
      characterIdentifier: string;
      targetLevel?: number;
      classIdentifier?: string;
      experiencePoints?: number;
      experienceSpent?: number;
      advancementSelections?: AdvancementSelectionInput[];
    },
    initialPreview: FoundryPreviewCharacterProgressionResponse
  ): Promise<
    Array<{
      stepId: string;
      stepType: string;
      stepTitle: string;
      choice: FoundryApplyCharacterAdvancementChoiceResponse['choice'];
      createdItemIds?: string[];
    }>
  > {
    if (parsed.targetLevel === undefined) {
      return [];
    }

    const applied: Array<{
      stepId: string;
      stepType: string;
      stepTitle: string;
      choice: FoundryApplyCharacterAdvancementChoiceResponse['choice'];
      createdItemIds?: string[];
    }> = [];
    const remainingSelections = [...(parsed.advancementSelections ?? [])];

    let preview = initialPreview;
    for (let iteration = 0; iteration < 10; iteration += 1) {
      const matchedSelection = this.findMatchingAdvancementSelection(
        preview.pendingSteps,
        remainingSelections
      );
      if (matchedSelection && matchedSelection.kind === 'ambiguous') {
        throw new Error(
          `The provided advancement selection for "${matchedSelection.selection.stepType ?? matchedSelection.selection.stepId ?? 'unknown'}" matched multiple pending steps. Include stepId or more source-item context to disambiguate it.`
        );
      }

      const nextSafeStep = preview.pendingSteps.find(step => step.autoApplySafe === true);
      const nextAction =
        matchedSelection && matchedSelection.kind === 'match'
          ? {
              step: matchedSelection.step,
              choice: matchedSelection.selection.choice,
              selectionIndex: matchedSelection.selectionIndex,
            }
          : nextSafeStep
            ? {
                step: nextSafeStep,
                choice: this.buildAutoAdvancementChoice(nextSafeStep),
                selectionIndex: undefined,
              }
            : null;

      if (!nextAction?.choice) {
        break;
      }

      const request: FoundryApplyCharacterAdvancementChoiceRequest = {
        actorIdentifier: parsed.characterIdentifier,
        targetLevel: parsed.targetLevel,
        stepId: nextAction.step.id,
        ...(parsed.classIdentifier !== undefined
          ? { classIdentifier: parsed.classIdentifier }
          : {}),
        choice: nextAction.choice,
      };

      const result = await this.foundryClient.query<FoundryApplyCharacterAdvancementChoiceResponse>(
        'foundry-mcp-bridge.applyCharacterAdvancementChoice',
        request
      );

      applied.push({
        stepId: result.stepId,
        stepType: result.stepType,
        stepTitle: result.stepTitle,
        choice: result.choice,
        ...(result.createdItemIds ? { createdItemIds: result.createdItemIds } : {}),
      });

      if (nextAction.selectionIndex !== undefined) {
        remainingSelections.splice(nextAction.selectionIndex, 1);
      }

      preview = await this.previewCharacterProgression({
        actorIdentifier: parsed.characterIdentifier,
        targetLevel: parsed.targetLevel,
        ...(parsed.classIdentifier !== undefined
          ? { classIdentifier: parsed.classIdentifier }
          : {}),
      });
    }

    const unresolvedSelections = this.findUnmatchedAdvancementSelections(
      preview.pendingSteps,
      remainingSelections
    );
    if (unresolvedSelections.length > 0) {
      const labels = unresolvedSelections.map(
        selection =>
          selection.stepId ??
          `${selection.stepType ?? selection.choice.type}${
            selection.sourceItemName ? ` (${selection.sourceItemName})` : ''
          }`
      );
      throw new Error(
        `The provided advancement selections did not match the actual pending steps for this level-up: ${labels.join(', ')}.`
      );
    }

    return applied;
  }

  private buildAutoAdvancementChoice(
    step: FoundryProgressionPreviewStep
  ): FoundryApplyCharacterAdvancementChoiceRequest['choice'] | null {
    const lowerType = step.type.toLowerCase();
    const choiceDetails = step.choiceDetails;

    if (lowerType === 'itemgrant') {
      const defaultOptionUuids =
        choiceDetails?.options
          ?.filter(option => {
            const optionRecord = option as Record<string, unknown>;
            return optionRecord.selectedByDefault === true && typeof option.uuid === 'string';
          })
          .map(option => option.uuid as string) ?? [];

      return {
        type: 'item-grant',
        ...(defaultOptionUuids.length > 0 ? { itemUuids: defaultOptionUuids } : {}),
        ...(choiceDetails?.abilityOptions?.length === 1
          ? { ability: choiceDetails.abilityOptions[0] }
          : {}),
      };
    }

    if (lowerType === 'size') {
      const sizeOption = choiceDetails?.options?.[0];
      if (!sizeOption) {
        return null;
      }

      return {
        type: 'size',
        size: sizeOption.id,
      };
    }

    return null;
  }

  private findMatchingAdvancementSelection(
    pendingSteps: FoundryProgressionPreviewStep[],
    selections: AdvancementSelectionInput[]
  ):
    | {
        kind: 'match';
        selectionIndex: number;
        selection: AdvancementSelectionInput;
        step: FoundryProgressionPreviewStep;
      }
    | {
        kind: 'ambiguous';
        selectionIndex: number;
        selection: AdvancementSelectionInput;
      }
    | null {
    for (const [selectionIndex, selection] of selections.entries()) {
      if (selection.stepId !== undefined) {
        const step = pendingSteps.find(candidate => candidate.id === selection.stepId);
        if (step) {
          return { kind: 'match', selectionIndex, selection, step };
        }
        continue;
      }

      const candidates = pendingSteps.filter(candidate =>
        this.matchesSelection(candidate, selection)
      );

      if (candidates.length === 1) {
        return {
          kind: 'match',
          selectionIndex,
          selection,
          step: candidates[0],
        };
      }

      if (candidates.length > 1) {
        return {
          kind: 'ambiguous',
          selectionIndex,
          selection,
        };
      }
    }

    return null;
  }

  private findUnmatchedAdvancementSelections(
    pendingSteps: FoundryProgressionPreviewStep[],
    selections: AdvancementSelectionInput[]
  ): AdvancementSelectionInput[] {
    return selections.filter(selection => {
      if (selection.stepId !== undefined) {
        return !pendingSteps.some(candidate => candidate.id === selection.stepId);
      }

      return !pendingSteps.some(candidate => this.matchesSelection(candidate, selection));
    });
  }

  private matchesSelection(
    step: FoundryProgressionPreviewStep,
    selection: AdvancementSelectionInput
  ): boolean {
    if (
      selection.stepType !== undefined &&
      step.type.toLowerCase() !== selection.stepType.toLowerCase()
    ) {
      return false;
    }

    if (selection.sourceItemId !== undefined && step.sourceItemId !== selection.sourceItemId) {
      return false;
    }

    if (
      selection.sourceItemName !== undefined &&
      step.sourceItemName?.toLowerCase() !== selection.sourceItemName.toLowerCase()
    ) {
      return false;
    }

    return (
      selection.stepType !== undefined ||
      selection.sourceItemId !== undefined ||
      selection.sourceItemName !== undefined
    );
  }

  private parseProgressionArgs(args: unknown): {
    characterIdentifier: string;
    targetLevel?: number;
    classIdentifier?: string;
    experiencePoints?: number;
    experienceSpent?: number;
    advancementSelections?: AdvancementSelectionInput[];
  } {
    const advancementChoiceSchema = createAdvancementChoiceSchema();
    const schema = z
      .object({
        characterIdentifier: z.string().min(1, 'Character identifier cannot be empty'),
        targetLevel: z.number().int().positive().optional(),
        classIdentifier: z.string().min(1).optional(),
        experiencePoints: z.number().int().nonnegative().optional(),
        experienceSpent: z.number().int().nonnegative().optional(),
        advancementSelections: z
          .array(
            z
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
              )
          )
          .optional(),
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

  private async buildProgressionPreviewResult(parsed: {
    characterIdentifier: string;
    targetLevel?: number;
    classIdentifier?: string;
    experiencePoints?: number;
    experienceSpent?: number;
  }): Promise<{
    character: { id: string; name: string; type: string };
    prepared: PreparedCharacterProgressionUpdate;
    preview: FoundryPreviewCharacterProgressionResponse | null;
    warnings: string[];
  }> {
    const characterData = await this.foundryClient.query<CharacterInfoResponse>(
      'foundry-mcp-bridge.getCharacterInfo',
      {
        identifier: parsed.characterIdentifier,
      }
    );

    const progressionRequest: CharacterProgressionUpdateRequest = {
      ...(parsed.targetLevel !== undefined ? { targetLevel: parsed.targetLevel } : {}),
      ...(parsed.classIdentifier !== undefined ? { classIdentifier: parsed.classIdentifier } : {}),
      ...(parsed.experiencePoints !== undefined
        ? { experiencePoints: parsed.experiencePoints }
        : {}),
      ...(parsed.experienceSpent !== undefined ? { experienceSpent: parsed.experienceSpent } : {}),
    };

    const prepared = await this.prepareProgressionUpdate(characterData, progressionRequest);
    const gameSystem = await this.getGameSystem();
    const preview =
      gameSystem === 'dnd5e' &&
      parsed.targetLevel !== undefined &&
      prepared.target.kind === 'embedded-item'
        ? await this.previewCharacterProgression({
            actorIdentifier: parsed.characterIdentifier,
            targetLevel: parsed.targetLevel,
            ...(parsed.classIdentifier !== undefined
              ? { classIdentifier: parsed.classIdentifier }
              : {}),
          })
        : null;

    return {
      character: {
        id: characterData.id,
        name: characterData.name,
        type: characterData.type,
      },
      prepared,
      preview,
      warnings: this.mergeWarnings(prepared.warnings, preview?.warnings),
    };
  }

  private mergeWarnings(...warningSets: Array<string[] | undefined>): string[] {
    return Array.from(
      new Set(
        warningSets.flatMap(warnings => warnings ?? []).filter(warning => warning.trim().length > 0)
      )
    );
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
        'foundry-mcp-bridge.updateActor',
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
      'foundry-mcp-bridge.updateActorEmbeddedItem',
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
