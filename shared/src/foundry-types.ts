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

export interface FoundryWorldUser {
  id: string;
  name: string;
  active: boolean;
  isGM: boolean;
}

export interface FoundryWorldDetails {
  id: string;
  title: string;
  system: string;
  systemVersion: string;
  foundryVersion: string;
  users: FoundryWorldUser[];
}

export interface FoundryCharacterAction extends UnknownRecord {
  name: string;
  type?: string;
  itemId?: string;
  traits?: string[];
  variants?: unknown[];
  ready?: boolean;
  description?: string;
  actions?: number;
}

export interface FoundrySpellInfo extends UnknownRecord {
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
}

export interface FoundrySpellcastingEntry extends UnknownRecord {
  id: string;
  name: string;
  tradition?: string;
  type: string;
  ability?: string;
  dc?: number;
  attack?: number;
  slots?: Record<string, { value: number; max: number }>;
  spells: FoundrySpellInfo[];
}

export interface FoundryCharacterEffect<SystemData extends UnknownRecord = UnknownRecord>
  extends FoundryActiveEffectDocumentBase<SystemData> {
  duration?: {
    type: string;
    duration?: number;
    remaining?: number;
  };
}

export interface FoundryCharacterInfo<
  SystemData extends UnknownRecord = UnknownRecord,
  ItemSystemData extends UnknownRecord = UnknownRecord,
  EffectSystemData extends UnknownRecord = UnknownRecord,
> extends FoundryActorDocumentBase<SystemData, ItemSystemData, EffectSystemData> {
  system: SystemData;
  items: Array<FoundryItemDocumentBase<ItemSystemData>>;
  effects: Array<FoundryCharacterEffect<EffectSystemData>>;
  actions?: FoundryCharacterAction[];
  itemVariants?: unknown[];
  itemToggles?: unknown[];
  spellcasting?: FoundrySpellcastingEntry[];
}

export type FoundryConnectionType = 'websocket' | 'webrtc' | null;

export interface FoundryConnectionInfo {
  started: boolean;
  connected: boolean;
  connectionType: FoundryConnectionType;
  readyState: number | 'CLOSED';
  config: { port: number; namespace?: string };
}

export interface FoundryBridgeQueryRequest<TData = unknown> {
  method: string;
  data?: TData;
}

export interface FoundryBridgeResponseEnvelope<TData = unknown> {
  success: boolean;
  data?: TData;
  error?: string;
}

export interface FoundryBridgeMessage<TData = unknown> extends UnknownRecord {
  type: string;
  id?: string;
  requestId?: string;
  offer?: RTCSessionDescriptionInit;
  answer?: RTCSessionDescriptionInit;
  data?: TData;
  error?: string;
}

export interface FoundryBackendComfyUIHandlers {
  handleMessage?: (message: FoundryBridgeMessage | UnknownRecord) => Promise<UnknownRecord | void>;
}

export interface FoundryRpcMessage {
  id?: string;
  method?: string;
  params?: UnknownRecord;
}

export interface FoundryMcpTextContent {
  type: 'text';
  text: string;
}

export interface FoundryMcpToolResult extends UnknownRecord {
  content: FoundryMcpTextContent[];
  isError?: boolean;
}

export interface FoundryCreatedActorInfo {
  id: string;
  name: string;
  originalName: string;
  type: string;
  sourcePackId: string;
  sourcePackLabel: string;
  img?: string;
}

export interface FoundryActorCreationResult {
  success: boolean;
  actors: FoundryCreatedActorInfo[];
  errors?: string[];
  tokensPlaced?: number;
  totalRequested: number;
  totalCreated: number;
}

export interface FoundryCompendiumEntryFull<
  SystemData extends UnknownRecord = UnknownRecord,
  ItemSystemData extends UnknownRecord = UnknownRecord,
  EffectSystemData extends UnknownRecord = UnknownRecord,
> extends Omit<
    FoundryCompendiumDocumentBase<SystemData, ItemSystemData, EffectSystemData>,
    'pack' | 'packLabel' | 'system' | 'fullData'
  > {
  pack: string;
  packLabel: string;
  system: SystemData;
  fullData: UnknownRecord;
}

export interface FoundryJournalEntryResponse {
  id?: string;
  name?: string;
  content?: string;
  success?: boolean;
  error?: string;
}

export interface FoundryJournalSummary {
  id: string;
  name: string;
  type?: string;
  contentPreview?: string;
}
