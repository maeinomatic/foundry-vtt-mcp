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

export interface FoundryActorSummary {
  id: string;
  name: string;
  type: string;
  img?: string;
}

export interface FoundryListActorsRequest {
  type?: string;
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

export interface FoundryGetCharacterInfoRequest {
  identifier: string;
}

export interface FoundryCharacterItemSearchMatch extends UnknownRecord {
  id?: string;
  name?: string;
  type: string;
  description?: string;
  actionType?: string;
  actionCost?: number | string;
  level?: number;
  prepared?: boolean;
  expended?: boolean;
  traits?: string[];
  range?: string;
  target?: string;
  area?: string;
  quantity?: number;
  equipped?: boolean;
  invested?: boolean;
}

export interface FoundrySearchCharacterItemsRequest {
  characterIdentifier: string;
  query?: string;
  type?: string;
  category?: string;
  limit?: number;
}

export interface FoundrySearchCharacterItemsResponse extends UnknownRecord {
  characterId: string;
  characterName: string;
  query?: string;
  type?: string;
  category?: string;
  matches: FoundryCharacterItemSearchMatch[];
  totalMatches: number;
}

export interface FoundryProgressionPreviewStep extends UnknownRecord {
  id: string;
  level: number;
  type: string;
  title: string;
  required: boolean;
  choicesRequired: boolean;
  autoApplySafe: boolean;
  hints?: string[];
  choiceDetails?: FoundryAdvancementChoiceDetails;
  sourceItemId?: string;
  sourceItemName?: string;
  sourceItemType?: string;
}

export interface FoundryAdvancementOption extends UnknownRecord {
  id: string;
  name: string;
  type: string;
  source: 'compendium' | 'configured' | 'synthetic';
  uuid?: string;
  packId?: string;
  hint?: string;
}

export interface FoundryAdvancementChoiceDetails extends UnknownRecord {
  kind: string;
  optionQuerySupported?: boolean;
  chooseCount?: number;
  replacementAllowed?: boolean;
  featChoiceAvailable?: boolean;
  points?: number;
  pointCap?: number;
  maxScore?: number;
  fixed?: Record<string, number>;
  locked?: string[];
  abilityOptions?: string[];
  defaultSelectedOptionIds?: string[];
  recommendation?: FoundryAdvancementOption;
  options?: FoundryAdvancementOption[];
}

export interface FoundryPreviewCharacterProgressionRequest {
  actorIdentifier: string;
  targetLevel: number;
  classIdentifier?: string;
}

export interface FoundryGetCharacterAdvancementOptionsRequest {
  actorIdentifier: string;
  targetLevel: number;
  stepId: string;
  classIdentifier?: string;
  query?: string;
  limit?: number;
}

export interface FoundryGetCharacterAdvancementOptionsResponse extends UnknownRecord {
  system: string;
  actorId: string;
  actorName: string;
  actorType: string;
  targetLevel: number;
  stepId: string;
  stepType: string;
  stepTitle: string;
  choiceDetails?: FoundryAdvancementChoiceDetails;
  options: FoundryAdvancementOption[];
  totalOptions: number;
  classId?: string;
  className?: string;
  warnings?: string[];
}

export interface FoundryApplyCharacterAdvancementChoiceRequest {
  actorIdentifier: string;
  targetLevel: number;
  stepId: string;
  classIdentifier?: string;
  choice:
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
        replaceItemId?: string;
        ability?: string;
      }
    | {
        type: 'item-grant';
        itemUuids?: string[];
        ability?: string;
      };
}

export interface FoundryApplyCharacterAdvancementChoiceResponse extends UnknownRecord {
  success: boolean;
  system: string;
  actorId: string;
  actorName: string;
  actorType: string;
  targetLevel: number;
  stepId: string;
  stepType: string;
  stepTitle: string;
  choice: UnknownRecord;
  classId?: string;
  className?: string;
  createdItemIds?: string[];
  warnings?: string[];
}

export interface FoundryPreviewCharacterProgressionResponse extends UnknownRecord {
  system: string;
  actorId: string;
  actorName: string;
  actorType: string;
  targetLevel: number;
  currentLevel?: number;
  classId?: string;
  className?: string;
  safeToApplyDirectly: boolean;
  pendingSteps: FoundryProgressionPreviewStep[];
  warnings?: string[];
}

export interface FoundryUpdateActorRequest {
  identifier: string;
  updates: UnknownRecord;
  reason?: string;
}

export interface FoundryUpdateActorResponse extends UnknownRecord {
  success: boolean;
  actorId: string;
  actorName: string;
  actorType: string;
  appliedUpdates: UnknownRecord;
  updatedFields: string[];
}

export interface FoundryUpdateActorEmbeddedItemRequest {
  actorIdentifier: string;
  itemIdentifier: string;
  updates: UnknownRecord;
  itemType?: string;
  reason?: string;
}

export interface FoundryUpdateActorEmbeddedItemResponse extends UnknownRecord {
  success: boolean;
  actorId: string;
  actorName: string;
  itemId: string;
  itemName: string;
  itemType: string;
  appliedUpdates: UnknownRecord;
  updatedFields: string[];
}

export interface FoundryCompendiumSearchFilters {
  challengeRating?: number | { min?: number; max?: number };
  creatureType?: string;
  size?: string;
  alignment?: string;
  hasLegendaryActions?: boolean;
  spellcaster?: boolean;
}

export interface FoundryCreatureSearchCriteria extends FoundryCompendiumSearchFilters {
  level?: number | { min?: number; max?: number };
  traits?: string[];
  rarity?: string;
  hasSpells?: boolean;
  limit?: number;
}

export interface FoundryCompendiumSearchRequest {
  query: string;
  packType?: string;
  filters?: FoundryCompendiumSearchFilters;
}

export interface FoundryGetCompendiumDocumentRequest {
  packId: string;
  documentId: string;
}

export interface FoundryTokenPlacementCoordinate {
  x: number;
  y: number;
}

export interface FoundryTokenPlacementOptions {
  type: 'random' | 'grid' | 'center' | 'coordinates';
  coordinates?: FoundryTokenPlacementCoordinate[];
}

export interface FoundryCreateActorFromCompendiumRequest {
  packId: string;
  itemId: string;
  customNames?: string[];
  quantity?: number;
  addToScene?: boolean;
  placement?: FoundryTokenPlacementOptions;
}

export interface FoundryCompendiumSearchResult<SystemData extends UnknownRecord = UnknownRecord>
  extends UnknownRecord {
  id: string;
  name: string;
  type: string;
  img?: string;
  pack: string;
  packLabel: string;
  system?: SystemData;
  summary?: string;
  hasImage?: boolean;
  description?: string;
}

export interface FoundryCreatureSearchResult<SystemData extends UnknownRecord = UnknownRecord>
  extends FoundryCompendiumSearchResult<SystemData> {
  level?: number;
  traits?: string[];
  rarity?: string;
  challengeRating?: number;
  hasLegendaryActions?: boolean;
  creatureType?: string;
  size?: string;
  hitPoints?: number;
  armorClass?: number;
  hasSpells?: boolean;
  alignment?: string;
}

export interface FoundryCreatureSearchSummary {
  packsSearched: number;
  topPacks: Array<{ id: string; label: string; priority: number }>;
  totalCreaturesFound: number;
  resultsByPack: Record<string, number>;
  criteria: FoundryCreatureSearchCriteria;
  searchMethod: 'enhanced_persistent_index' | 'basic_fallback';
  fallback?: boolean;
  indexMetadata?: {
    totalIndexedCreatures: number;
    searchMethod: 'enhanced_persistent_index';
  };
}

export interface FoundryCreatureSearchResponse<SystemData extends UnknownRecord = UnknownRecord> {
  creatures: FoundryCreatureSearchResult<SystemData>[];
  searchSummary: FoundryCreatureSearchSummary;
}

export interface FoundryCreatureSearchEnvelope<SystemData extends UnknownRecord = UnknownRecord>
  extends UnknownRecord {
  response: FoundryCreatureSearchResponse<SystemData>;
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
