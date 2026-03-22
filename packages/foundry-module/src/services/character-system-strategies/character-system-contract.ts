import type {
  FoundryCharacterItemSearchMatch,
  FoundryDescriptionField,
  FoundryItemDocumentBase,
  FoundryItemSystemBase,
  FoundrySpellInfo,
  FoundrySpellcastingEntry,
  FoundryValueField,
  UnknownRecord,
} from '@foundry-mcp/shared';

export type SpellcastingEntry = FoundrySpellcastingEntry;
export type SpellInfo = FoundrySpellInfo;
export type CharacterItemSearchMatch = FoundryCharacterItemSearchMatch;

export interface ModuleRuleElement extends UnknownRecord {
  key?: string;
  choices?: unknown;
  label?: string;
  prompt?: string;
  selection?: unknown;
  toggleable?: unknown;
  option?: unknown;
  value?: unknown;
}

export interface ModulePF2eActionData extends UnknownRecord {
  label?: string;
  name?: string;
  type?: string;
  item?: { id?: string };
  variants?: Array<{ label?: string; traits?: unknown[] }>;
  ready?: boolean;
  traits?: string[];
  actionCost?: { value?: string | number };
  actions?: string | number;
}

export interface ModuleCharacterSystemData extends UnknownRecord {
  actions?: ModulePF2eActionData[];
}

export interface ModuleBaseItemSystemData extends UnknownRecord {
  description?: FoundryDescriptionField | string;
  quantity?: number;
  equipped?: boolean | { invested?: boolean };
  invested?: boolean;
  rules?: ModuleRuleElement[];
  actionType?: string | FoundryValueField<string>;
  actions?: number | FoundryValueField<number>;
}

export interface ModulePF2eItemSystemData extends ModuleBaseItemSystemData {
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

export interface ModuleDnD5eItemSystemData extends ModuleBaseItemSystemData {
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

export interface ModuleDSA5ItemSystemData extends ModuleBaseItemSystemData {
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

export type ModuleSearchItemSystemData =
  | ModulePF2eItemSystemData
  | ModuleDnD5eItemSystemData
  | ModuleDSA5ItemSystemData
  | (FoundryItemSystemBase & UnknownRecord);

export type ModuleSearchItemDocument = FoundryItemDocumentBase<ModuleSearchItemSystemData>;

export interface ModulePF2eSpellcastingSystemData extends UnknownRecord {
  tradition?: string | FoundryValueField<string>;
  prepared?: string | FoundryValueField<string>;
  ability?: string | FoundryValueField<string>;
  spelldc?: { dc?: number; value?: number };
  dc?: { value?: number };
  attack?: { value?: number };
  slots?: Record<string, { value?: number; max?: number }>;
  [slotKey: string]: unknown;
}

export interface ModulePF2eSpellReference {
  id?: string;
  prepared?: boolean;
  expended?: boolean;
}

export type ModulePF2eSpellCollectionValue =
  | ModulePF2eSpellReference[]
  | { value?: ModulePF2eSpellReference[] };

export interface ModulePF2eSpellcastingEntryDocument
  extends FoundryItemDocumentBase<ModulePF2eSpellcastingSystemData> {
  spells?: Record<string, ModulePF2eSpellCollectionValue>;
}

export interface ModuleDnD5eClassItemSystemData extends ModuleDnD5eItemSystemData {
  spellcasting?: {
    progression?: string;
    type?: string;
    ability?: string;
  };
}

export type ModuleDnD5eClassItemDocument = FoundryItemDocumentBase<ModuleDnD5eClassItemSystemData>;

export interface ModuleDnD5eActorSystemData extends UnknownRecord {
  spells?: Record<string, { value?: number; max?: number }>;
}

export interface ModuleDSA5ActorSystemData extends UnknownRecord {
  status?: {
    astralenergy?: { value?: number; max?: number };
    karmaenergy?: { value?: number; max?: number };
  };
  astralenergy?: { value?: number; max?: number };
  karmaenergy?: { value?: number; max?: number };
}

export interface CharacterActorLike {
  id?: string;
  name?: string;
  type?: string;
  img?: string;
  system?: unknown;
  items?: unknown;
  effects?: unknown;
}

export interface LooseCharacterActionLike extends UnknownRecord {
  id?: string;
  slug?: string;
  name?: string;
  label?: string;
  type?: string;
  actionType?: string;
  traits?: string[];
  actionCost?: { value?: string };
  actions?: string | number;
}

export interface SpellTargetingData {
  range?: string;
  target?: string;
  area?: string;
}

export interface SpellSearchFlags {
  isCantrip: boolean;
  isPrepared: boolean;
  isFocus: boolean;
}

export function getNumberFromValueField(
  value: number | FoundryValueField<number> | undefined
): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (value && typeof value === 'object' && typeof value.value === 'number') {
    return value.value;
  }

  return 0;
}

export function getStringFromValueField(
  value: string | FoundryValueField<string> | undefined
): string {
  if (typeof value === 'string') {
    return value;
  }

  if (value && typeof value === 'object' && typeof value.value === 'string') {
    return value.value;
  }

  return '';
}

export function getDescriptionText(
  description: FoundryDescriptionField | string | undefined
): string {
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

export function getPF2eLocationData(location: ModulePF2eItemSystemData['location']): {
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

export function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

export function getActorSystem<TSystem extends UnknownRecord>(
  actor: CharacterActorLike
): TSystem | undefined {
  const actorSystem = actor.system;
  return actorSystem && typeof actorSystem === 'object' ? (actorSystem as TSystem) : undefined;
}

export function getActorItems(actor: CharacterActorLike): unknown[] {
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

export function isModuleSearchItemDocument(item: unknown): item is ModuleSearchItemDocument {
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

export function isPF2eSpellcastingEntryDocument(
  item: unknown
): item is ModulePF2eSpellcastingEntryDocument {
  return isModuleSearchItemDocument(item) && item.type === 'spellcastingEntry';
}

export function isDnD5eClassItemDocument(item: unknown): item is ModuleDnD5eClassItemDocument {
  return isModuleSearchItemDocument(item) && item.type === 'class';
}

export function getActorItemById(
  actor: CharacterActorLike,
  itemId: string
): ModuleSearchItemDocument | undefined {
  const actorItems = actor.items;
  if (actorItems && typeof actorItems === 'object') {
    const itemCollection = actorItems as { get?: (id: string) => unknown };
    if (typeof itemCollection.get === 'function') {
      const item = itemCollection.get(itemId);
      return isModuleSearchItemDocument(item) ? item : undefined;
    }
  }

  return getActorItems(actor).find(item => {
    return isModuleSearchItemDocument(item) && item.id === itemId;
  }) as ModuleSearchItemDocument | undefined;
}

export function createSpellInfo(data: {
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

export function createSpellcastingEntry(data: {
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

export function sortSpellInfo(spells: SpellInfo[]): SpellInfo[] {
  return [...spells].sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
}
