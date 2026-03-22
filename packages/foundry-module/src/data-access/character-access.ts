import { ERROR_MESSAGES } from '../constants.js';
import type {
  FoundryCharacterAction,
  FoundryCharacterEffect,
  FoundryCharacterInfo,
  FoundryDescriptionField,
  FoundryItemDocumentBase,
  FoundryItemSystemBase,
  FoundrySpellInfo,
  FoundrySpellcastingEntry,
  FoundryValueField,
  UnknownRecord,
} from '@foundry-mcp/shared';

type CharacterInfo = FoundryCharacterInfo<UnknownRecord, UnknownRecord, UnknownRecord>;
type SpellcastingEntry = FoundrySpellcastingEntry;
type SpellInfo = FoundrySpellInfo;
type CharacterEffect = FoundryCharacterEffect<UnknownRecord>;
type AuditStatus = 'success' | 'failure';

interface ModuleRuleElement extends UnknownRecord {
  key?: string;
  choices?: unknown;
  label?: string;
  prompt?: string;
  selection?: unknown;
  toggleable?: unknown;
  option?: unknown;
  value?: unknown;
}

interface ModulePF2eActionData extends UnknownRecord {
  label?: string;
  name?: string;
  type?: string;
  item?: { id?: string };
  variants?: Array<{ label?: string; traits?: unknown[] }>;
  ready?: boolean;
}

interface ModuleCharacterSystemData extends UnknownRecord {
  actions?: ModulePF2eActionData[];
}

interface ModuleBaseItemSystemData extends UnknownRecord {
  description?: FoundryDescriptionField | string;
  quantity?: number;
  equipped?: boolean | { invested?: boolean };
  invested?: boolean;
  rules?: ModuleRuleElement[];
  actionType?: string | FoundryValueField<string>;
  actions?: number | FoundryValueField<number>;
}

interface ModulePF2eItemSystemData extends ModuleBaseItemSystemData {
  level?: number | FoundryValueField<number>;
  rank?: number;
  location?: string | { value?: string; prepared?: boolean; expended?: boolean };
  traits?: { value?: string[] };
  time?: { value?: string | number };
  category?: { value?: string };
  range?: { value?: string | number };
  target?: { value?: string };
  area?: { type?: string; value?: string | number };
}

interface ModuleDnD5eItemSystemData extends ModuleBaseItemSystemData {
  level?: number;
  preparation?: { prepared?: boolean };
  activation?: { type?: string };
  sourceClass?: string;
  range?: { value?: string | number; units?: string; special?: string };
  target?: {
    type?: string;
    value?: number;
    template?: { type?: string; size?: number | string; units?: string };
  };
}

interface ModuleDSA5ItemSystemData extends ModuleBaseItemSystemData {
  level?: number | FoundryValueField<number>;
  effect?: { attributes?: string[] };
  castingTime?: { value?: string };
  range?: { value?: string };
  targetCategory?: { value?: string };
  effectRadius?: { value?: string };
  Reichweite?: string;
  Zielkategorie?: string;
  Wirkungsbereich?: string;
}

type ModuleSearchItemSystemData =
  | ModulePF2eItemSystemData
  | ModuleDnD5eItemSystemData
  | ModuleDSA5ItemSystemData
  | (FoundryItemSystemBase & UnknownRecord);

type ModuleSearchItemDocument = FoundryItemDocumentBase<ModuleSearchItemSystemData>;

interface ModulePF2eSpellcastingSystemData extends UnknownRecord {
  tradition?: string | FoundryValueField<string>;
  prepared?: string | FoundryValueField<string>;
  ability?: string | FoundryValueField<string>;
  spelldc?: { dc?: number; value?: number };
  dc?: { value?: number };
  attack?: { value?: number };
  slots?: Record<string, { value?: number; max?: number }>;
  [slotKey: string]: unknown;
}

interface ModulePF2eSpellReference {
  id?: string;
  prepared?: boolean;
  expended?: boolean;
}

type ModulePF2eSpellCollectionValue =
  | ModulePF2eSpellReference[]
  | { value?: ModulePF2eSpellReference[] };

interface ModulePF2eSpellcastingEntryDocument
  extends FoundryItemDocumentBase<ModulePF2eSpellcastingSystemData> {
  spells?: Record<string, ModulePF2eSpellCollectionValue>;
}

interface ModuleDnD5eClassItemSystemData extends ModuleDnD5eItemSystemData {
  spellcasting?: {
    progression?: string;
    type?: string;
    ability?: string;
  };
}

type ModuleDnD5eClassItemDocument = FoundryItemDocumentBase<ModuleDnD5eClassItemSystemData>;

interface ModuleDnD5eActorSystemData extends UnknownRecord {
  spells?: Record<string, { value?: number; max?: number }>;
}

interface ModuleDSA5ActorSystemData extends UnknownRecord {
  status?: {
    astralenergy?: { value?: number; max?: number };
    karmaenergy?: { value?: number; max?: number };
  };
  astralenergy?: { value?: number; max?: number };
  karmaenergy?: { value?: number; max?: number };
}

interface CharacterActorLike {
  id?: string;
  name?: string;
  type?: string;
  img?: string;
  system?: unknown;
  items?: unknown;
  effects?: unknown;
}

export interface CharacterAccessContext {
  auditLog(action: string, data: unknown, status: AuditStatus, errorMessage?: string): void;
  findActorByIdentifier(identifier: string): CharacterActorLike | null;
  sanitizeData(data: unknown): unknown;
  validateFoundryState(): void;
}

function getNumberFromValueField(value: number | FoundryValueField<number> | undefined): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (value && typeof value === 'object' && typeof value.value === 'number') {
    return value.value;
  }

  return 0;
}

function getStringFromValueField(value: string | FoundryValueField<string> | undefined): string {
  if (typeof value === 'string') {
    return value;
  }

  if (value && typeof value === 'object' && typeof value.value === 'string') {
    return value.value;
  }

  return '';
}

function getDescriptionText(description: FoundryDescriptionField | string | undefined): string {
  if (typeof description === 'string') {
    return description;
  }

  if (description?.value && typeof description.value === 'string') {
    return description.value;
  }

  if (description?.content && typeof description.content === 'string') {
    return description.content;
  }

  return '';
}

function getPF2eLocationData(location: ModulePF2eItemSystemData['location']): {
  value?: string;
  prepared?: boolean;
  expended?: boolean;
} {
  if (location && typeof location === 'object') {
    return location;
  }

  if (typeof location === 'string') {
    return { value: location };
  }

  return {};
}

export class FoundryCharacterAccess {
  constructor(private readonly context: CharacterAccessContext) {}

  private toStringArray(value: unknown): string[] {
    return Array.isArray(value)
      ? value.filter((entry): entry is string => typeof entry === 'string')
      : [];
  }

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

  private createSpellInfo(data: {
    id: string;
    name: string;
    level: number;
    prepared?: boolean;
    expended?: boolean;
    traits?: string[];
    actionCost?: number | string;
    range?: string;
    target?: string;
    area?: string;
  }): SpellInfo {
    return {
      id: data.id,
      name: data.name,
      level: data.level,
      ...(data.prepared !== undefined ? { prepared: data.prepared } : {}),
      ...(data.expended !== undefined ? { expended: data.expended } : {}),
      ...(data.traits !== undefined ? { traits: data.traits } : {}),
      ...(data.actionCost !== undefined ? { actionCost: data.actionCost } : {}),
      ...(data.range !== undefined ? { range: data.range } : {}),
      ...(data.target !== undefined ? { target: data.target } : {}),
      ...(data.area !== undefined ? { area: data.area } : {}),
    };
  }

  private createSpellcastingEntry(data: {
    id: string;
    name: string;
    type: string;
    spells: SpellInfo[];
    tradition?: string;
    ability?: string;
    dc?: number;
    attack?: number;
    slots?: Record<string, { value: number; max: number }>;
  }): SpellcastingEntry {
    return {
      id: data.id,
      name: data.name,
      type: data.type,
      spells: data.spells,
      ...(data.tradition !== undefined ? { tradition: data.tradition } : {}),
      ...(data.ability !== undefined ? { ability: data.ability } : {}),
      ...(data.dc !== undefined ? { dc: data.dc } : {}),
      ...(data.attack !== undefined ? { attack: data.attack } : {}),
      ...(data.slots !== undefined ? { slots: data.slots } : {}),
    };
  }

  private getActorSystem<TSystem extends UnknownRecord>(
    actor: CharacterActorLike
  ): TSystem | undefined {
    const actorSystem = actor.system;
    return actorSystem && typeof actorSystem === 'object' ? (actorSystem as TSystem) : undefined;
  }

  private getActorItems(actor: CharacterActorLike): unknown[] {
    const actorItems = actor.items;

    if (Array.isArray(actorItems)) {
      return actorItems;
    }

    if (actorItems && typeof actorItems === 'object') {
      const collectionItems = actorItems as { contents?: unknown[] };
      if (Array.isArray(collectionItems.contents)) {
        return collectionItems.contents;
      }

      if (Symbol.iterator in (actorItems as Record<PropertyKey, unknown>)) {
        return Array.from(actorItems as Iterable<unknown>);
      }
    }

    return [];
  }

  private isModuleSearchItemDocument(item: unknown): item is ModuleSearchItemDocument {
    if (!item || typeof item !== 'object') {
      return false;
    }

    const itemRecord = item as Record<string, unknown>;
    return (
      typeof itemRecord.id === 'string' &&
      typeof itemRecord.name === 'string' &&
      typeof itemRecord.type === 'string'
    );
  }

  private isPF2eSpellcastingEntryDocument(
    item: unknown
  ): item is ModulePF2eSpellcastingEntryDocument {
    return this.isModuleSearchItemDocument(item) && item.type === 'spellcastingEntry';
  }

  private isDnD5eClassItemDocument(item: unknown): item is ModuleDnD5eClassItemDocument {
    return this.isModuleSearchItemDocument(item) && item.type === 'class';
  }

  private getActorItemById(
    actor: CharacterActorLike,
    itemId: string
  ): ModuleSearchItemDocument | undefined {
    const actorItems = actor.items;
    if (actorItems && typeof actorItems === 'object') {
      const itemCollection = actorItems as { get?: (id: string) => unknown };
      if (typeof itemCollection.get === 'function') {
        const item = itemCollection.get(itemId);
        return this.isModuleSearchItemDocument(item) ? item : undefined;
      }
    }

    return this.getActorItems(actor).find(item => {
      return this.isModuleSearchItemDocument(item) && item.id === itemId;
    }) as ModuleSearchItemDocument | undefined;
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

  searchCharacterItems(params: {
    characterIdentifier: string;
    query?: string | undefined;
    type?: string | undefined;
    category?: string | undefined;
    limit?: number | undefined;
  }): Promise<{
    characterId: string;
    characterName: string;
    query?: string;
    type?: string;
    category?: string;
    matches: Array<Record<string, unknown>>;
    totalMatches: number;
  }> {
    this.context.validateFoundryState();

    const { characterIdentifier, query, type, category, limit = 20 } = params;
    const actor = this.context.findActorByIdentifier(characterIdentifier);
    if (!actor) {
      throw new Error(`Character not found: ${characterIdentifier}`);
    }

    const actorSystem = actor.system as ModuleCharacterSystemData | UnknownRecord | undefined;
    const systemId = (game as { system?: { id?: string } }).system?.id ?? '';
    const matches: Array<Record<string, unknown>> = [];

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

    const firstDefined = (values: unknown[], fallback: unknown): unknown => {
      for (const value of values) {
        if (value !== undefined && value !== null) {
          return value;
        }
      }

      return fallback;
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

      const result: Record<string, unknown> = {
        id: itemAny.id,
        name: itemAny.name,
        type: itemAny.type,
      };

      if (description) {
        const plainText = description.replace(/<[^>]*>/g, '').trim();
        result.description =
          plainText.length > 300 ? `${plainText.substring(0, 300)}...` : plainText;
      }

      if (itemAny.type === 'spell') {
        if (systemId === 'pf2e') {
          const pf2eSystem = itemSystem as ModulePF2eItemSystemData | undefined;
          const location = getPF2eLocationData(pf2eSystem?.location);
          result.level = getNumberFromValueField(pf2eSystem?.level) || (pf2eSystem?.rank ?? 0);
          result.prepared = location.prepared ?? true;
          result.expended = location.expended ?? false;

          const targeting = this.extractPF2eSpellTargeting(pf2eSystem ?? {});
          if (targeting.range) result.range = targeting.range;
          if (targeting.target) result.target = targeting.target;
          if (targeting.area) result.area = targeting.area;
          result.actionCost = this.formatPF2eActionCost(pf2eSystem?.time?.value);
          result.traits = Array.isArray(pf2eSystem?.traits?.value) ? pf2eSystem.traits.value : [];
        } else if (systemId === 'dnd5e') {
          const dnd5eSystem = itemSystem as ModuleDnD5eItemSystemData | undefined;
          result.level = dnd5eSystem?.level ?? 0;
          result.prepared = dnd5eSystem?.preparation?.prepared ?? true;
          result.expended = false;

          const targeting = this.extractDnD5eSpellTargeting(dnd5eSystem ?? {});
          if (targeting.range) result.range = targeting.range;
          if (targeting.target) result.target = targeting.target;
          if (targeting.area) result.area = targeting.area;
          result.actionCost = dnd5eSystem?.activation?.type ?? '';
        } else if (systemId === 'dsa5') {
          const dsa5System = itemSystem as ModuleDSA5ItemSystemData | undefined;
          result.level = getNumberFromValueField(dsa5System?.level);
          result.prepared = true;
          result.expended = false;

          const targeting = this.extractDSA5SpellTargeting(dsa5System ?? {});
          if (targeting.range) result.range = targeting.range;
          if (targeting.target) result.target = targeting.target;
          if (targeting.area) result.area = targeting.area;
          result.actionCost = dsa5System?.castingTime?.value ?? '';
          result.traits = Array.isArray(dsa5System?.effect?.attributes)
            ? dsa5System.effect.attributes
            : [];
        } else {
          result.level = asNumber(
            firstDefined(
              [
                (itemSystem as UnknownRecord | undefined)?.level,
                (itemSystem as UnknownRecord | undefined)?.rank,
              ],
              0
            ),
            0
          );
          result.prepared = true;
          result.expended = false;
        }

        if (searchCategory) {
          const spellLevel = asNumber(result.level, 0);
          const isPrepared = result.prepared !== false;
          const isCantrip = spellLevel === 0;
          const pf2eSystem = itemSystem as ModulePF2eItemSystemData | undefined;
          const isFocus =
            (pf2eSystem?.traits?.value?.includes('focus') ?? false) ||
            pf2eSystem?.category?.value === 'focus';

          if (searchCategory === 'cantrip' && !isCantrip) continue;
          if (searchCategory === 'prepared' && !isPrepared) continue;
          if (searchCategory === 'focus' && !isFocus) continue;
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

      if (
        ['feat', 'feature', 'class', 'ancestry', 'heritage', 'background'].includes(itemAny.type)
      ) {
        if (systemId === 'pf2e') {
          const pf2eSystem = itemSystem as ModulePF2eItemSystemData | undefined;
          result.traits = Array.isArray(pf2eSystem?.traits?.value) ? pf2eSystem.traits.value : [];
          const levelValue = pf2eSystem?.level;
          if (levelValue !== undefined && levelValue !== null) {
            result.level = getNumberFromValueField(levelValue);
          }
          result.actionCost = this.formatPF2eActionCost(
            getStringFromValueField(pf2eSystem?.actionType)
          );
        }
      }

      if (itemAny.type === 'action') {
        if (systemId === 'pf2e') {
          const pf2eSystem = itemSystem as ModulePF2eItemSystemData | undefined;
          result.traits = Array.isArray(pf2eSystem?.traits?.value) ? pf2eSystem.traits.value : [];
          result.actionCost = this.formatPF2eActionCost(
            firstDefined(
              [
                getStringFromValueField(pf2eSystem?.actionType),
                typeof pf2eSystem?.actions === 'object' &&
                pf2eSystem.actions !== null &&
                'value' in pf2eSystem.actions
                  ? pf2eSystem.actions.value
                  : pf2eSystem?.actions,
              ],
              undefined
            )
          );
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

        const result: Record<string, unknown> = {
          id: actionAny.id ?? actionAny.slug ?? actionName,
          name: actionName,
          type: 'action',
          actionType: actionAny.type ?? actionAny.actionType ?? 'action',
        };

        if (systemId === 'pf2e') {
          result.traits = actionAny.traits ?? [];
          result.actionCost = this.formatPF2eActionCost(
            actionAny.actionCost?.value ?? actionAny.actions
          );
        }

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
          id: effectAny.id,
          name: effectAny.name ?? effectAny.label,
          type: 'effect',
          description: effectAny.description ?? undefined,
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

    const result: {
      characterId: string;
      characterName: string;
      query?: string;
      type?: string;
      category?: string;
      matches: Array<Record<string, unknown>>;
      totalMatches: number;
    } = {
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
    const entries: SpellcastingEntry[] = [];
    const actorSystem =
      this.getActorSystem<ModuleDnD5eActorSystemData & ModuleDSA5ActorSystemData>(actor) ?? {};
    const systemId = game.system.id;
    const actorItems = this.getActorItems(actor);

    const spellItems = actorItems.filter((item): item is ModuleSearchItemDocument => {
      return this.isModuleSearchItemDocument(item) && item.type === 'spell';
    });

    if (systemId === 'pf2e') {
      const spellcastingEntries = actorItems.filter(
        (item): item is ModulePF2eSpellcastingEntryDocument => {
          return this.isPF2eSpellcastingEntryDocument(item);
        }
      );

      for (const entry of spellcastingEntries) {
        const entryData: ModulePF2eSpellcastingSystemData | undefined = entry.system;
        const entrySpells: SpellInfo[] = [];
        const entryId = entry.id;

        const associatedSpells = spellItems.filter(spell => {
          const spellSystem = spell.system as ModulePF2eItemSystemData | undefined;
          return getPF2eLocationData(spellSystem?.location).value === entryId;
        });

        for (const spell of associatedSpells) {
          const spellSystem = spell.system as ModulePF2eItemSystemData | undefined;
          const location = getPF2eLocationData(spellSystem?.location);
          const targeting = this.extractPF2eSpellTargeting(spellSystem);
          const actionCost = this.formatPF2eActionCost(spellSystem?.time?.value);

          entrySpells.push(
            this.createSpellInfo({
              id: spell.id,
              name: spell.name,
              level: getNumberFromValueField(spellSystem?.level) || (spellSystem?.rank ?? 0),
              prepared: location.prepared ?? true,
              expended: location.expended ?? false,
              traits: this.toStringArray(spellSystem?.traits?.value),
              ...(actionCost !== undefined ? { actionCost } : {}),
              ...(targeting.range !== undefined ? { range: targeting.range } : {}),
              ...(targeting.target !== undefined ? { target: targeting.target } : {}),
              ...(targeting.area !== undefined ? { area: targeting.area } : {}),
            })
          );
        }

        if (entry.spells) {
          for (const [levelKey, levelData] of Object.entries(entry.spells)) {
            const spellsAtLevel = Array.isArray(levelData)
              ? levelData
              : Array.isArray(levelData?.value)
                ? levelData.value
                : [];

            for (const spellRef of spellsAtLevel) {
              if (!spellRef.id || entrySpells.some(spell => spell.id === spellRef.id)) {
                continue;
              }

              const spellItem = this.getActorItemById(actor, spellRef.id);
              if (!spellItem) {
                continue;
              }

              const spellSystem = spellItem.system as ModulePF2eItemSystemData | undefined;
              const targeting = this.extractPF2eSpellTargeting(spellSystem);
              const actionCost = this.formatPF2eActionCost(spellSystem?.time?.value);

              entrySpells.push(
                this.createSpellInfo({
                  id: spellItem.id,
                  name: spellItem.name,
                  level:
                    parseInt(levelKey.replace('spell', ''), 10) ||
                    getNumberFromValueField(spellSystem?.level),
                  prepared: spellRef.prepared ?? true,
                  expended: spellRef.expended ?? false,
                  traits: this.toStringArray(spellSystem?.traits?.value),
                  ...(actionCost !== undefined ? { actionCost } : {}),
                  ...(targeting.range !== undefined ? { range: targeting.range } : {}),
                  ...(targeting.target !== undefined ? { target: targeting.target } : {}),
                  ...(targeting.area !== undefined ? { area: targeting.area } : {}),
                })
              );
            }
          }
        }

        const tradition = getStringFromValueField(entryData?.tradition);
        const ability = getStringFromValueField(entryData?.ability);
        const dc = entryData?.spelldc?.dc ?? entryData?.dc?.value;
        const attack = entryData?.spelldc?.value ?? entryData?.attack?.value;
        const slots = this.extractPF2eSpellSlots(entryData);

        entries.push(
          this.createSpellcastingEntry({
            id: entry.id,
            name: entry.name,
            type: getStringFromValueField(entryData?.prepared) || 'prepared',
            ...(tradition ? { tradition } : {}),
            ...(ability ? { ability } : {}),
            ...(dc !== undefined ? { dc } : {}),
            ...(attack !== undefined ? { attack } : {}),
            ...(slots !== undefined ? { slots } : {}),
            spells: entrySpells.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name)),
          })
        );
      }

      const focusSpells = spellItems.filter(spell => {
        const spellSystem = spell.system as ModulePF2eItemSystemData | undefined;
        return (
          spellSystem?.traits?.value?.includes('focus') === true ||
          spellSystem?.category?.value === 'focus'
        );
      });

      if (focusSpells.length > 0 && !entries.some(entry => entry.type === 'focus')) {
        entries.push(
          this.createSpellcastingEntry({
            id: 'focus-spells',
            name: 'Focus Spells',
            type: 'focus',
            spells: focusSpells.map(spell => {
              const spellSystem = spell.system as ModulePF2eItemSystemData | undefined;
              const targeting = this.extractPF2eSpellTargeting(spellSystem);
              const actionCost = this.formatPF2eActionCost(spellSystem?.time?.value);

              return this.createSpellInfo({
                id: spell.id,
                name: spell.name,
                level: getNumberFromValueField(spellSystem?.level),
                traits: this.toStringArray(spellSystem?.traits?.value),
                ...(actionCost !== undefined ? { actionCost } : {}),
                ...(targeting.range !== undefined ? { range: targeting.range } : {}),
                ...(targeting.target !== undefined ? { target: targeting.target } : {}),
                ...(targeting.area !== undefined ? { area: targeting.area } : {}),
              });
            }),
          })
        );
      }
    } else if (systemId === 'dnd5e') {
      const classes = actorItems.filter((item): item is ModuleDnD5eClassItemDocument => {
        return this.isDnD5eClassItemDocument(item);
      });
      const spellSlots: Record<string, { value?: number; max?: number }> = actorSystem.spells ?? {};
      const spellsByClass: Record<string, SpellInfo[]> = {};

      for (const spell of spellItems) {
        const spellSystem = spell.system as ModuleDnD5eItemSystemData | undefined;
        const sourceClass = spellSystem?.sourceClass ?? 'general';

        if (!spellsByClass[sourceClass]) {
          spellsByClass[sourceClass] = [];
        }

        const targeting = this.extractDnD5eSpellTargeting(spellSystem);
        spellsByClass[sourceClass].push(
          this.createSpellInfo({
            id: spell.id,
            name: spell.name,
            level: spellSystem?.level ?? 0,
            prepared: spellSystem?.preparation?.prepared ?? true,
            traits: [],
            ...(spellSystem?.activation?.type ? { actionCost: spellSystem.activation.type } : {}),
            ...(targeting.range !== undefined ? { range: targeting.range } : {}),
            ...(targeting.target !== undefined ? { target: targeting.target } : {}),
            ...(targeting.area !== undefined ? { area: targeting.area } : {}),
          })
        );
      }

      for (const classItem of classes) {
        const classSystem: ModuleDnD5eClassItemSystemData | undefined = classItem.system;
        if (
          classSystem?.spellcasting?.progression &&
          classSystem.spellcasting.progression !== 'none'
        ) {
          const classSpells =
            spellsByClass[classItem.id] || spellsByClass[classItem.name.toLowerCase()] || [];
          const slots = this.extractDnD5eSpellSlots(spellSlots);

          entries.push(
            this.createSpellcastingEntry({
              id: classItem.id,
              name: `${classItem.name} Spellcasting`,
              type: classSystem.spellcasting.type ?? 'prepared',
              ...(classSystem.spellcasting.ability
                ? { ability: classSystem.spellcasting.ability }
                : {}),
              ...(slots !== undefined ? { slots } : {}),
              spells: classSpells.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name)),
            })
          );
        }
      }

      if (entries.length === 0 && spellItems.length > 0) {
        const allSpells = spellItems.map(spell => {
          const spellSystem = spell.system as ModuleDnD5eItemSystemData | undefined;
          const targeting = this.extractDnD5eSpellTargeting(spellSystem);

          return this.createSpellInfo({
            id: spell.id,
            name: spell.name,
            level: spellSystem?.level ?? 0,
            prepared: spellSystem?.preparation?.prepared ?? true,
            ...(spellSystem?.activation?.type ? { actionCost: spellSystem.activation.type } : {}),
            ...(targeting.range !== undefined ? { range: targeting.range } : {}),
            ...(targeting.target !== undefined ? { target: targeting.target } : {}),
            ...(targeting.area !== undefined ? { area: targeting.area } : {}),
          });
        });

        const slots = this.extractDnD5eSpellSlots(spellSlots);
        entries.push(
          this.createSpellcastingEntry({
            id: 'spellcasting',
            name: 'Spellcasting',
            type: 'prepared',
            ...(slots !== undefined ? { slots } : {}),
            spells: allSpells.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name)),
          })
        );
      }
    } else if (systemId === 'dsa5') {
      const astralSpells = actorItems.filter((item): item is ModuleSearchItemDocument => {
        return this.isModuleSearchItemDocument(item) && item.type === 'spell';
      });
      const karmaSpells = actorItems.filter((item): item is ModuleSearchItemDocument => {
        return this.isModuleSearchItemDocument(item) && ['liturgy', 'ceremony'].includes(item.type);
      });
      const rituals = actorItems.filter((item): item is ModuleSearchItemDocument => {
        return this.isModuleSearchItemDocument(item) && item.type === 'ritual';
      });
      const asp =
        ('status' in actorSystem ? actorSystem.status?.astralenergy : undefined) ??
        actorSystem.astralenergy;
      const kap =
        ('status' in actorSystem ? actorSystem.status?.karmaenergy : undefined) ??
        actorSystem.karmaenergy;

      if (astralSpells.length > 0) {
        entries.push(
          this.createSpellcastingEntry({
            id: 'zauber',
            name: 'Zauber (Spells)',
            type: 'arcane',
            ...(asp
              ? {
                  slots: {
                    asp: { value: asp.value ?? 0, max: asp.max ?? 0 },
                  },
                }
              : {}),
            spells: astralSpells
              .map(spell => {
                const spellSystem = spell.system as ModuleDSA5ItemSystemData | undefined;
                const targeting = this.extractDSA5SpellTargeting(spellSystem);

                return this.createSpellInfo({
                  id: spell.id,
                  name: spell.name,
                  level: getNumberFromValueField(spellSystem?.level),
                  traits: this.toStringArray(spellSystem?.effect?.attributes),
                  ...(spellSystem?.castingTime?.value
                    ? { actionCost: spellSystem.castingTime.value }
                    : {}),
                  ...(targeting.range !== undefined ? { range: targeting.range } : {}),
                  ...(targeting.target !== undefined ? { target: targeting.target } : {}),
                  ...(targeting.area !== undefined ? { area: targeting.area } : {}),
                });
              })
              .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name)),
          })
        );
      }

      if (karmaSpells.length > 0) {
        entries.push(
          this.createSpellcastingEntry({
            id: 'liturgien',
            name: 'Liturgien & Zeremonien (Liturgies)',
            type: 'divine',
            ...(kap
              ? {
                  slots: {
                    kap: { value: kap.value ?? 0, max: kap.max ?? 0 },
                  },
                }
              : {}),
            spells: karmaSpells
              .map(spell => {
                const spellSystem = spell.system as ModuleDSA5ItemSystemData | undefined;
                const targeting = this.extractDSA5SpellTargeting(spellSystem);

                return this.createSpellInfo({
                  id: spell.id,
                  name: spell.name,
                  level: getNumberFromValueField(spellSystem?.level),
                  traits: this.toStringArray(spellSystem?.effect?.attributes),
                  ...(spellSystem?.castingTime?.value
                    ? { actionCost: spellSystem.castingTime.value }
                    : {}),
                  ...(targeting.range !== undefined ? { range: targeting.range } : {}),
                  ...(targeting.target !== undefined ? { target: targeting.target } : {}),
                  ...(targeting.area !== undefined ? { area: targeting.area } : {}),
                });
              })
              .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name)),
          })
        );
      }

      if (rituals.length > 0) {
        entries.push(
          this.createSpellcastingEntry({
            id: 'rituale',
            name: 'Rituale (Rituals)',
            type: 'ritual',
            spells: rituals
              .map(spell => {
                const spellSystem = spell.system as ModuleDSA5ItemSystemData | undefined;
                const targeting = this.extractDSA5SpellTargeting(spellSystem);

                return this.createSpellInfo({
                  id: spell.id,
                  name: spell.name,
                  level: getNumberFromValueField(spellSystem?.level),
                  traits: this.toStringArray(spellSystem?.effect?.attributes),
                  ...(spellSystem?.castingTime?.value
                    ? { actionCost: spellSystem.castingTime.value }
                    : {}),
                  ...(targeting.range !== undefined ? { range: targeting.range } : {}),
                  ...(targeting.target !== undefined ? { target: targeting.target } : {}),
                  ...(targeting.area !== undefined ? { area: targeting.area } : {}),
                });
              })
              .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name)),
          })
        );
      }
    }

    return entries;
  }

  private formatPF2eActionCost(actionValue: unknown): string | undefined {
    if (!actionValue) return undefined;
    if (typeof actionValue === 'number') {
      return actionValue === 1 ? '1 action' : `${actionValue} actions`;
    }
    if (actionValue === 'reaction') return 'reaction';
    if (actionValue === 'free') return 'free action';
    return String(actionValue);
  }

  private extractPF2eSpellSlots(
    entryData: ModulePF2eSpellcastingSystemData | undefined
  ): Record<string, { value: number; max: number }> | undefined {
    const slots: Record<string, { value: number; max: number }> = {};

    for (let rank = 1; rank <= 10; rank++) {
      const slotKey = `slot${rank}`;
      const entrySlotData =
        typeof entryData?.[slotKey] === 'object' && entryData[slotKey] !== null
          ? (entryData[slotKey] as { value?: number; max?: number })
          : undefined;
      const slotData = entryData?.slots?.[slotKey] ?? entrySlotData;
      if (slotData && ((slotData.max ?? 0) > 0 || (slotData.value ?? 0) > 0)) {
        slots[`rank${rank}`] = {
          value: slotData.value ?? 0,
          max: slotData.max ?? 0,
        };
      }
    }

    return Object.keys(slots).length > 0 ? slots : undefined;
  }

  private extractDnD5eSpellSlots(
    spellsData: Record<string, { value?: number; max?: number }>
  ): Record<string, { value: number; max: number }> | undefined {
    const slots: Record<string, { value: number; max: number }> = {};

    for (let level = 1; level <= 9; level++) {
      const slotKey = `spell${level}`;
      const slotData = spellsData?.[slotKey];
      if (slotData && ((slotData.max ?? 0) > 0 || (slotData.value ?? 0) > 0)) {
        slots[`level${level}`] = {
          value: slotData.value ?? 0,
          max: slotData.max ?? 0,
        };
      }
    }

    const pactSlot = spellsData?.pact;
    if (pactSlot && ((pactSlot.max ?? 0) > 0 || (pactSlot.value ?? 0) > 0)) {
      slots.pact = {
        value: pactSlot.value ?? 0,
        max: pactSlot.max ?? 0,
      };
    }

    return Object.keys(slots).length > 0 ? slots : undefined;
  }

  private extractDnD5eSpellTargeting(spellSystem: ModuleDnD5eItemSystemData | undefined): {
    range?: string;
    target?: string;
    area?: string;
  } {
    const result: { range?: string; target?: string; area?: string } = {};

    const rangeValue = spellSystem?.range?.value;
    const rangeUnits = spellSystem?.range?.units;
    if (rangeUnits === 'self') {
      result.range = 'Self';
    } else if (rangeUnits === 'touch') {
      result.range = 'Touch';
    } else if (rangeUnits === 'spec') {
      result.range = spellSystem?.range?.special ?? 'Special';
    } else if (rangeValue && rangeUnits) {
      result.range = `${rangeValue} ${rangeUnits}`;
    }

    const targetType = spellSystem?.target?.type;
    const targetValue = spellSystem?.target?.value;
    if (targetType === 'self') {
      result.target = 'self';
    } else if (targetType === 'creature' || targetType === 'ally' || targetType === 'enemy') {
      result.target = targetValue
        ? `${targetValue} ${targetType}${targetValue > 1 ? 's' : ''}`
        : targetType;
    } else if (targetType === 'object') {
      result.target = targetValue ? `${targetValue} object${targetValue > 1 ? 's' : ''}` : 'object';
    } else if (targetType === 'space' || targetType === 'point') {
      result.target = 'point';
    } else if (targetType) {
      result.target = targetType;
    }

    const areaType = spellSystem?.target?.template?.type;
    const areaSize = spellSystem?.target?.template?.size;
    const areaUnits = spellSystem?.target?.template?.units ?? 'ft';
    if (areaType && areaSize) {
      result.area = `${areaSize}-${areaUnits} ${areaType}`;
      if (!result.target || result.target === 'point') {
        result.target = 'area';
      }
    }

    return result;
  }

  private extractPF2eSpellTargeting(spellSystem: ModulePF2eItemSystemData | undefined): {
    range?: string;
    target?: string;
    area?: string;
  } {
    const result: { range?: string; target?: string; area?: string } = {};

    const rangeValue = spellSystem?.range?.value;
    if (rangeValue) {
      result.range = String(rangeValue);
    }

    const targetValue = spellSystem?.target?.value;
    if (targetValue) {
      result.target = String(targetValue);
    }

    const areaType = spellSystem?.area?.type;
    const areaValue = spellSystem?.area?.value;
    if (areaType) {
      result.area = areaValue ? `${areaValue}-foot ${areaType}` : areaType;
      if (!result.target) {
        result.target = 'area';
      }
    }

    return result;
  }

  private extractDSA5SpellTargeting(spellSystem: ModuleDSA5ItemSystemData | undefined): {
    range?: string;
    target?: string;
    area?: string;
  } {
    const result: { range?: string; target?: string; area?: string } = {};

    const rangeValue = spellSystem?.range?.value ?? spellSystem?.Reichweite;
    if (rangeValue) {
      result.range = String(rangeValue);
    }

    const targetCategory = spellSystem?.targetCategory?.value ?? spellSystem?.Zielkategorie;
    if (targetCategory) {
      result.target = String(targetCategory);
    }

    const areaValue = spellSystem?.effectRadius?.value ?? spellSystem?.Wirkungsbereich;
    if (areaValue) {
      result.area = String(areaValue);
    }

    return result;
  }
}
