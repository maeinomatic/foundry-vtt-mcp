export type UnknownRecord = Record<string, unknown>;

export interface FoundryValueField<T = number | string> {
  value?: T;
}

export interface FoundryResourceField<T = number> extends FoundryValueField<T> {
  min?: T;
  max?: T;
  temp?: T;
}

export interface FoundryDescriptionField {
  value?: string;
  content?: string;
}

export interface FoundryMovementData extends UnknownRecord {
  walk?: number;
  fly?: number;
  swim?: number;
}

export interface FoundryTraitsData extends UnknownRecord {
  value?: string[];
  rarity?: string;
  size?: string | FoundryValueField<string>;
}

export interface FoundryPriceData extends UnknownRecord {
  value?: number | string;
  denomination?: string;
}

export interface FoundryActorAttributesBase extends UnknownRecord {
  hp?: FoundryResourceField<number>;
  ac?: FoundryValueField<number> | number;
  movement?: FoundryMovementData;
  spellcasting?: unknown;
}

export interface FoundryActorDetailsBase extends UnknownRecord {
  level?: FoundryValueField<number> | number;
  cr?: number;
  type?: FoundryValueField<string>;
  alignment?: string | FoundryValueField<string>;
  spellLevel?: number;
  description?: string;
}

export interface FoundryActorSystemBase extends UnknownRecord {
  attributes?: FoundryActorAttributesBase;
  details?: FoundryActorDetailsBase;
  level?: number;
}

export interface FoundryItemSystemBase extends UnknownRecord {
  description?: FoundryDescriptionField | string;
  quantity?: number;
  equipped?: boolean;
}

export interface FoundryDocumentBase<SystemData extends UnknownRecord = UnknownRecord> {
  id: string;
  name: string;
  type: string;
  img?: string;
  system?: SystemData;
  flags?: UnknownRecord;
  folder?: string | null;
  sort?: number;
  ownership?: UnknownRecord;
}

export interface FoundryItemDocumentBase<SystemData extends UnknownRecord = FoundryItemSystemBase>
  extends FoundryDocumentBase<SystemData> {}

export interface FoundryActiveEffectDocumentBase<SystemData extends UnknownRecord = UnknownRecord>
  extends FoundryDocumentBase<SystemData> {
  disabled?: boolean;
  icon?: string;
  description?: string;
  duration?: UnknownRecord;
}

export interface FoundryActorDocumentBase<
  SystemData extends UnknownRecord = FoundryActorSystemBase,
  ItemSystemData extends UnknownRecord = FoundryItemSystemBase,
  EffectSystemData extends UnknownRecord = UnknownRecord,
> extends FoundryDocumentBase<SystemData> {
  items?: Array<FoundryItemDocumentBase<ItemSystemData>>;
  effects?: Array<FoundryActiveEffectDocumentBase<EffectSystemData>>;
}

export interface FoundryCompendiumPackSummary {
  id: string;
  label: string;
  type: string;
  system?: string;
  private?: boolean;
}

export interface FoundryCompendiumDocumentBase<
  SystemData extends UnknownRecord = UnknownRecord,
  ItemSystemData extends UnknownRecord = UnknownRecord,
  EffectSystemData extends UnknownRecord = UnknownRecord,
> extends FoundryDocumentBase<SystemData> {
  pack?: string;
  packLabel?: string;
  items?: Array<FoundryItemDocumentBase<ItemSystemData>>;
  effects?: Array<FoundryActiveEffectDocumentBase<EffectSystemData>>;
  fullData?: unknown;
}

export interface FoundryWorldInfo extends UnknownRecord {
  system?: string;
  version?: string;
  release?: UnknownRecord;
}
