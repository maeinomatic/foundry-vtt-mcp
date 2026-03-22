import { ERROR_MESSAGES } from '../constants.js';
import type {
  FoundryCharacterAction,
  FoundryCharacterEffect,
  FoundryCharacterInfo,
  FoundryCharacterItemSearchMatch,
  FoundrySearchCharacterItemsRequest,
  FoundrySearchCharacterItemsResponse,
  UnknownRecord,
} from '@foundry-mcp/shared';
import { getCharacterSystemStrategy } from './character-system-strategies/character-system-strategy-registry.js';
import {
  getActorItems,
  getDescriptionText,
  type CharacterActorLike,
  type ModuleCharacterSystemData,
  type ModuleRuleElement,
  type ModuleSearchItemDocument,
  type SpellcastingEntry,
} from './character-system-strategies/character-system-contract.js';

type CharacterInfo = FoundryCharacterInfo<UnknownRecord, UnknownRecord, UnknownRecord>;
type CharacterEffect = FoundryCharacterEffect<UnknownRecord>;
type AuditStatus = 'success' | 'failure';

export interface CharacterServiceContext {
  auditLog(action: string, data: unknown, status: AuditStatus, errorMessage?: string): void;
  findActorByIdentifier(identifier: string): CharacterActorLike | null;
  sanitizeData(data: unknown): unknown;
  validateFoundryState(): void;
}

export class FoundryCharacterService {
  constructor(private readonly context: CharacterServiceContext) {}

  private createCharacterEffect(data: {
    id: string;
    name: string;
    icon?: string;
    disabled: boolean;
    duration?: { type: string; duration?: number; remaining?: number };
  }): CharacterEffect {
    return {
      id: data.id,
      name: data.name,
      type: 'ActiveEffect',
      disabled: data.disabled,
      ...(data.icon ? { icon: data.icon } : {}),
      ...(data.duration ? { duration: data.duration } : {}),
    };
  }

  private createCharacterAction(data: {
    name: string;
    type?: string;
    itemId?: string;
    variants?: Array<{ label?: string; traits?: unknown[] }>;
    ready?: boolean;
  }): FoundryCharacterAction {
    return {
      name: data.name,
      ...(data.type !== undefined ? { type: data.type } : {}),
      ...(data.itemId ? { itemId: data.itemId } : {}),
      ...(data.variants ? { variants: data.variants } : {}),
      ...(data.ready !== undefined ? { ready: data.ready } : {}),
    };
  }

  getCharacterInfo(identifier: string): Promise<CharacterInfo> {
    const actor = this.context.findActorByIdentifier(identifier);
    if (!actor) {
      throw new Error(`${ERROR_MESSAGES.CHARACTER_NOT_FOUND}: ${identifier}`);
    }

    const actorItems = Array.isArray(actor.items)
      ? actor.items
      : actor.items &&
          typeof actor.items === 'object' &&
          Array.isArray((actor.items as { contents?: unknown[] }).contents)
        ? ((actor.items as { contents?: unknown[] }).contents ?? [])
        : [];

    const actorEffects = Array.isArray(actor.effects)
      ? actor.effects
      : actor.effects &&
          typeof actor.effects === 'object' &&
          Array.isArray((actor.effects as { contents?: unknown[] }).contents)
        ? ((actor.effects as { contents?: unknown[] }).contents ?? [])
        : [];

    const characterData: CharacterInfo = {
      id: actor.id ?? '',
      name: actor.name ?? '',
      type: actor.type ?? '',
      ...(actor.img ? { img: actor.img } : {}),
      system: this.context.sanitizeData(actor.system ?? {}) as Record<string, unknown>,
      items: actorItems.flatMap(item => {
        if (!item || typeof item !== 'object') {
          return [];
        }

        const typedItem = item as {
          id?: string;
          name?: string;
          type?: string;
          img?: string;
          system?: unknown;
        };

        if (!typedItem.id || !typedItem.name || !typedItem.type) {
          return [];
        }

        return {
          id: typedItem.id,
          name: typedItem.name,
          type: typedItem.type,
          ...(typedItem.img ? { img: typedItem.img } : {}),
          system: this.context.sanitizeData(typedItem.system ?? {}) as Record<string, unknown>,
        };
      }),
      effects: actorEffects.flatMap(effect => {
        if (!effect || typeof effect !== 'object') {
          return [];
        }

        const typedEffect = effect as {
          id?: string;
          name?: string;
          label?: string;
          icon?: string;
          disabled?: boolean;
          duration?: { type?: string; duration?: number; remaining?: number };
        };

        if (!typedEffect.id) {
          return [];
        }

        return this.createCharacterEffect({
          id: typedEffect.id,
          name: typedEffect.name ?? typedEffect.label ?? 'Unknown Effect',
          ...(typedEffect.icon ? { icon: typedEffect.icon } : {}),
          disabled: Boolean(typedEffect.disabled),
          ...(typedEffect.duration
            ? {
                duration: {
                  type: typedEffect.duration.type ?? 'none',
                  ...(typedEffect.duration.duration !== undefined
                    ? { duration: typedEffect.duration.duration }
                    : {}),
                  ...(typedEffect.duration.remaining !== undefined
                    ? { remaining: typedEffect.duration.remaining }
                    : {}),
                },
              }
            : {}),
        });
      }),
    };

    const actorSystem = actor.system as ModuleCharacterSystemData | undefined;

    if (actorSystem?.actions) {
      characterData.actions = actorSystem.actions.flatMap(action => {
        if (!action || typeof action !== 'object') {
          return [];
        }

        const actionName = action.label ?? action.name;
        if (!actionName) {
          return [];
        }

        return [
          this.createCharacterAction({
            name: actionName,
            ...(action.type !== undefined ? { type: action.type } : {}),
            ...(action.item?.id ? { itemId: action.item.id } : {}),
            ...(action.variants
              ? {
                  variants: action.variants.map(variant => ({
                    ...(variant.label !== undefined ? { label: variant.label } : {}),
                    ...(variant.traits ? { traits: variant.traits } : {}),
                  })),
                }
              : {}),
            ...(action.ready !== undefined ? { ready: action.ready } : {}),
          }),
        ];
      });
    }

    const itemVariants: Array<Record<string, unknown>> = [];
    const itemToggles: Array<Record<string, unknown>> = [];

    actorItems.forEach(item => {
      if (!item || typeof item !== 'object') {
        return;
      }

      const itemAny = item as ModuleSearchItemDocument;
      if (!itemAny.id || !itemAny.name) {
        return;
      }

      if (Array.isArray(itemAny.system?.rules)) {
        itemAny.system.rules.forEach((rule, ruleIndex: number) => {
          const typedRule = rule as ModuleRuleElement;

          if (
            typedRule.key === 'ChoiceSet' ||
            (typedRule.key === 'RollOption' && typedRule.choices)
          ) {
            itemVariants.push({
              itemId: itemAny.id,
              itemName: itemAny.name,
              ruleIndex,
              ruleKey: typedRule.key,
              label: typedRule.label ?? typedRule.prompt,
              ...(typedRule.selection ? { selected: typedRule.selection } : {}),
              ...(typedRule.choices ? { choices: typedRule.choices } : {}),
            });
          }

          if (
            (typedRule.key === 'RollOption' && typedRule.toggleable) ||
            typedRule.key === 'ToggleProperty'
          ) {
            itemToggles.push({
              itemId: itemAny.id,
              itemName: itemAny.name,
              ruleIndex,
              ruleKey: typedRule.key,
              label: typedRule.label,
              option: typedRule.option,
              ...(typedRule.value !== undefined ? { enabled: typedRule.value } : {}),
              ...(typedRule.toggleable !== undefined ? { toggleable: typedRule.toggleable } : {}),
            });
          }
        });
      }

      if (itemAny.system?.equipped !== undefined) {
        itemToggles.push({
          itemId: itemAny.id,
          itemName: itemAny.name,
          type: 'equipped',
          enabled: itemAny.system.equipped,
        });
      }
    });

    if (itemVariants.length > 0) {
      characterData.itemVariants = itemVariants;
    }

    if (itemToggles.length > 0) {
      characterData.itemToggles = itemToggles;
    }

    const spellcastingEntries = this.extractSpellcastingData(actor);
    if (spellcastingEntries.length > 0) {
      characterData.spellcasting = spellcastingEntries;
    }

    return Promise.resolve(characterData);
  }

  searchCharacterItems(
    params: FoundrySearchCharacterItemsRequest
  ): Promise<FoundrySearchCharacterItemsResponse> {
    this.context.validateFoundryState();

    const { characterIdentifier, query, type, category, limit = 20 } = params;
    const actor = this.context.findActorByIdentifier(characterIdentifier);
    if (!actor) {
      throw new Error(`Character not found: ${characterIdentifier}`);
    }

    const actorSystem = actor.system as ModuleCharacterSystemData | UnknownRecord | undefined;
    const systemId = (game as { system?: { id?: string } }).system?.id ?? '';
    const systemStrategy = getCharacterSystemStrategy(systemId);
    const matches: FoundryCharacterItemSearchMatch[] = [];

    const actorItems = getActorItems(actor);

    const actorEffects = Array.isArray(actor.effects)
      ? actor.effects
      : actor.effects &&
          typeof actor.effects === 'object' &&
          Array.isArray((actor.effects as { contents?: unknown[] }).contents)
        ? ((actor.effects as { contents?: unknown[] }).contents ?? [])
        : [];

    const searchQuery = query?.toLowerCase().trim();
    const searchType = type?.toLowerCase().trim();
    const searchCategory = category?.toLowerCase().trim();

    const matchesQuery = (text: unknown): boolean => {
      if (!searchQuery) return true;
      if (typeof text !== 'string') return false;
      return text.toLowerCase().includes(searchQuery);
    };

    const matchesType = (itemType: string): boolean => {
      if (!searchType) return true;
      return itemType.toLowerCase() === searchType;
    };

    const asNumber = (value: unknown, fallback = 0): number => {
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
      }

      if (typeof value === 'string') {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
      }

      return fallback;
    };

    const asBoolean = (value: unknown, fallback = false): boolean => {
      if (typeof value === 'boolean') {
        return value;
      }

      return fallback;
    };

    for (const item of actorItems) {
      if (!item || typeof item !== 'object') continue;

      const itemAny = item as ModuleSearchItemDocument;
      if (!itemAny.type || !itemAny.name || !itemAny.id) continue;

      const itemSystem = itemAny.system;

      if (!matchesType(itemAny.type)) continue;

      const description = getDescriptionText(itemSystem?.description);
      if (!matchesQuery(itemAny.name) && !matchesQuery(description)) continue;

      const result: FoundryCharacterItemSearchMatch = {
        id: itemAny.id,
        name: itemAny.name,
        type: itemAny.type,
      };

      if (description) {
        const plainText = description.replace(/<[^>]*>/g, '').trim();
        result.description =
          plainText.length > 300 ? `${plainText.substring(0, 300)}...` : plainText;
      }

      systemStrategy.enrichItemSearchMatch({
        itemType: itemAny.type,
        itemSystem,
        result,
      });

      if (itemAny.type === 'spell') {
        if (searchCategory) {
          const spellSearchFlags = systemStrategy.getSpellSearchFlags({ itemSystem, result });
          if (searchCategory === 'cantrip' && !spellSearchFlags.isCantrip) continue;
          if (searchCategory === 'prepared' && !spellSearchFlags.isPrepared) continue;
          if (searchCategory === 'focus' && !spellSearchFlags.isFocus) continue;
        }
      }

      if (
        ['weapon', 'armor', 'equipment', 'consumable', 'backpack', 'loot'].includes(itemAny.type)
      ) {
        result.quantity = asNumber(itemSystem?.quantity, 1);
        const equippedValue = itemSystem?.equipped;
        result.equipped =
          typeof equippedValue === 'boolean'
            ? equippedValue
            : asBoolean((equippedValue as { invested?: unknown } | undefined)?.invested, false);
        const investedValue =
          typeof equippedValue === 'object' && equippedValue !== null
            ? equippedValue.invested
            : itemSystem?.invested;
        if (typeof investedValue === 'boolean') {
          result.invested = investedValue;
        }

        if (searchCategory) {
          if (searchCategory === 'equipped' && !result.equipped) continue;
          if (searchCategory === 'invested' && !result.invested) continue;
        }
      }

      matches.push(result);

      if (matches.length >= limit) break;
    }

    if (!searchType || searchType === 'action') {
      const actionsFromSystem =
        actorSystem &&
        typeof actorSystem === 'object' &&
        Array.isArray((actorSystem as ModuleCharacterSystemData).actions)
          ? ((actorSystem as ModuleCharacterSystemData).actions ?? [])
          : [];
      const actionsFromItems = actorItems.filter(
        item => item && typeof item === 'object' && (item as { type?: unknown }).type === 'action'
      );
      const actions = actionsFromSystem.length > 0 ? actionsFromSystem : actionsFromItems;

      for (const action of actions) {
        if (matches.length >= limit) break;
        if (!action || typeof action !== 'object') continue;

        const actionAny = action as {
          id?: string;
          slug?: string;
          name?: string;
          label?: string;
          type?: string;
          actionType?: string;
          traits?: string[];
          actionCost?: { value?: string };
          actions?: string;
        };

        const actionName = actionAny.name ?? actionAny.label ?? '';
        if (!matchesQuery(actionName)) continue;

        const result: FoundryCharacterItemSearchMatch = {
          id: actionAny.id ?? actionAny.slug ?? actionName,
          name: actionName,
          type: 'action',
          actionType: actionAny.type ?? actionAny.actionType ?? 'action',
        };

        systemStrategy.enrichLooseActionSearchMatch({ action: actionAny, result });

        matches.push(result);
      }
    }

    if (!searchType || searchType === 'effect') {
      for (const effect of actorEffects) {
        if (matches.length >= limit) break;
        if (!effect || typeof effect !== 'object') continue;

        const effectAny = effect as {
          id?: string;
          name?: string;
          label?: string;
          description?: string;
        };
        if (!matchesQuery(effectAny.name ?? effectAny.label)) continue;

        matches.push({
          type: 'effect',
          ...(effectAny.id ? { id: effectAny.id } : {}),
          ...((effectAny.name ?? effectAny.label)
            ? { name: effectAny.name ?? effectAny.label }
            : {}),
          ...(effectAny.description ? { description: effectAny.description } : {}),
        });
      }
    }

    this.context.auditLog(
      'searchCharacterItems',
      {
        characterId: actor.id,
        query,
        type,
        category,
        matchCount: matches.length,
      },
      'success'
    );

    const result: FoundrySearchCharacterItemsResponse = {
      characterId: actor.id ?? '',
      characterName: actor.name ?? '',
      matches,
      totalMatches: matches.length,
    };

    if (query) result.query = query;
    if (type) result.type = type;
    if (category) result.category = category;

    return Promise.resolve(result);
  }

  private extractSpellcastingData(actor: CharacterActorLike): SpellcastingEntry[] {
    const systemId = (game as { system?: { id?: string } }).system?.id ?? '';
    return getCharacterSystemStrategy(systemId).extractSpellcastingEntries({ actor });
  }
}
