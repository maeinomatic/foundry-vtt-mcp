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
      }
    | {
        type: 'trait';
        selected: string[];
      }
    | {
        type: 'size';
        size: string;
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

export interface FoundryOutstandingAdvancementStep extends UnknownRecord {
  id: string;
  level: number;
  type: string;
  title: string;
  required: boolean;
  sourceItemId?: string;
  sourceItemName?: string;
  sourceItemType?: string;
}

export interface FoundryCharacterBuildValidationIssue extends UnknownRecord {
  severity: 'info' | 'warning' | 'error';
  code: string;
  message: string;
  category?: 'class-levels' | 'spellbook' | 'proficiencies' | 'advancement';
  classId?: string;
  className?: string;
  itemId?: string;
  itemName?: string;
  stepId?: string;
  stepType?: string;
  sourceItemId?: string;
  sourceItemName?: string;
}

export interface FoundryValidateCharacterBuildRequest {
  actorIdentifier: string;
}

export interface FoundryValidateCharacterBuildResponse extends UnknownRecord {
  system: string;
  actorId: string;
  actorName: string;
  actorType: string;
  summary: Record<string, unknown>;
  issues: FoundryCharacterBuildValidationIssue[];
  outstandingAdvancements?: FoundryOutstandingAdvancementStep[];
  recommendations?: string[];
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

export interface FoundryBatchUpdateActorEmbeddedItemsRequest {
  actorIdentifier: string;
  updates: Array<{
    itemIdentifier: string;
    itemType?: string;
    updates: UnknownRecord;
  }>;
  reason?: string;
}

export interface FoundryBatchUpdateActorEmbeddedItemsResponse extends UnknownRecord {
  success: boolean;
  actorId: string;
  actorName: string;
  updatedItems: Array<{
    itemId: string;
    itemName: string;
    itemType: string;
    appliedUpdates: UnknownRecord;
    updatedFields: string[];
  }>;
}

export interface FoundryCharacterPatchTransactionCreateItemRequest {
  sourceUuid?: string;
  itemData?: FoundryCreateActorEmbeddedItemData;
  overrides?: UnknownRecord;
  itemType?: string;
}

export interface FoundryCharacterPatchTransactionUpdateItemRequest {
  itemIdentifier: string;
  itemType?: string;
  updates: UnknownRecord;
}

export interface FoundryCharacterPatchTransactionDeleteItemRequest {
  itemIdentifier: string;
  itemType?: string;
}

export interface FoundryApplyCharacterPatchTransactionRequest {
  actorIdentifier: string;
  actorUpdates?: UnknownRecord;
  createItems?: FoundryCharacterPatchTransactionCreateItemRequest[];
  updateItems?: FoundryCharacterPatchTransactionUpdateItemRequest[];
  deleteItems?: FoundryCharacterPatchTransactionDeleteItemRequest[];
  validateOnly?: boolean;
  reason?: string;
}

export interface FoundryCharacterPatchTransactionCreatedItem extends UnknownRecord {
  itemId: string;
  itemName: string;
  itemType: string;
  createdFrom: 'uuid' | 'raw';
  sourceUuid?: string;
}

export interface FoundryCharacterPatchTransactionUpdatedItem extends UnknownRecord {
  itemId: string;
  itemName: string;
  itemType: string;
  updatedFields: string[];
}

export interface FoundryCharacterPatchTransactionDeletedItem extends UnknownRecord {
  itemId: string;
  itemName: string;
  itemType: string;
}

export interface FoundryApplyCharacterPatchTransactionResponse extends UnknownRecord {
  success: boolean;
  transactionId: string;
  actorId: string;
  actorName: string;
  actorType: string;
  validateOnly: boolean;
  plannedOperations: {
    actorUpdated: boolean;
    createdItemCount: number;
    updatedItemCount: number;
    deletedItemCount: number;
  };
  actorUpdatedFields?: string[];
  createdItems?: FoundryCharacterPatchTransactionCreatedItem[];
  updatedItems?: FoundryCharacterPatchTransactionUpdatedItem[];
  deletedItems?: FoundryCharacterPatchTransactionDeletedItem[];
  rolledBack?: boolean;
  rollbackErrors?: string[];
  warnings?: string[];
}

export interface FoundryCharacterRestHitPointState extends UnknownRecord {
  current?: number;
  max?: number;
  temp?: number;
}

export interface FoundryCharacterRestDeathSaveState extends UnknownRecord {
  success?: number;
  failure?: number;
}

export interface FoundryCharacterRestSpellSlotState extends UnknownRecord {
  key: string;
  value?: number;
  max?: number;
  override?: number;
}

export interface FoundryCharacterRestClassHitDieState extends UnknownRecord {
  classId: string;
  className: string;
  levels?: number;
  spent?: number;
  available?: number;
  denomination?: string;
}

export interface FoundryCharacterRestState extends UnknownRecord {
  hitPoints?: FoundryCharacterRestHitPointState;
  inspiration?: boolean;
  exhaustion?: number;
  deathSaves?: FoundryCharacterRestDeathSaveState;
  spellSlots?: FoundryCharacterRestSpellSlotState[];
  classHitDice?: FoundryCharacterRestClassHitDieState[];
}

export interface FoundryCharacterRestSpellSlotChange extends UnknownRecord {
  key: string;
  before?: FoundryCharacterRestSpellSlotState;
  after?: FoundryCharacterRestSpellSlotState;
}

export interface FoundryCharacterRestClassHitDieChange extends UnknownRecord {
  classId: string;
  className: string;
  before?: FoundryCharacterRestClassHitDieState;
  after?: FoundryCharacterRestClassHitDieState;
}

export interface FoundryRunCharacterRestWorkflowRequest {
  actorIdentifier: string;
  restType: 'short' | 'long';
  suppressChat?: boolean;
  newDay?: boolean;
  reason?: string;
}

export interface FoundryRunCharacterRestWorkflowResponse extends UnknownRecord {
  success: boolean;
  system: string;
  actorId: string;
  actorName: string;
  actorType: string;
  restType: 'short' | 'long';
  before: FoundryCharacterRestState;
  after: FoundryCharacterRestState;
  changes: {
    hitPointsChanged: boolean;
    inspirationChanged: boolean;
    exhaustionChanged: boolean;
    deathSavesChanged: boolean;
    changedSpellSlots: FoundryCharacterRestSpellSlotChange[];
    changedClassHitDice: FoundryCharacterRestClassHitDieChange[];
  };
  warnings?: string[];
}

export interface FoundryCreateActorEmbeddedItemData extends UnknownRecord {
  name: string;
  type: string;
  img?: string;
  system?: UnknownRecord;
  flags?: UnknownRecord;
  effects?: unknown[];
}

export interface FoundryCreateActorEmbeddedItemRequest {
  actorIdentifier: string;
  sourceUuid?: string;
  itemData?: FoundryCreateActorEmbeddedItemData;
  overrides?: UnknownRecord;
  itemType?: string;
  reason?: string;
}

export interface FoundryCreateActorEmbeddedItemResponse extends UnknownRecord {
  success: boolean;
  actorId: string;
  actorName: string;
  itemId: string;
  itemName: string;
  itemType: string;
  createdFrom: 'uuid' | 'raw';
  sourceUuid?: string;
  appliedOverrides?: UnknownRecord;
}

export interface FoundryDeleteActorEmbeddedItemRequest {
  actorIdentifier: string;
  itemIdentifier: string;
  itemType?: string;
  reason?: string;
}

export interface FoundryDeleteActorEmbeddedItemResponse extends UnknownRecord {
  success: boolean;
  actorId: string;
  actorName: string;
  itemId: string;
  itemName: string;
  itemType: string;
}

export interface FoundryCreateWorldItemData extends FoundryCreateActorEmbeddedItemData {}

export interface FoundryCreateWorldItemRequest {
  sourceUuid?: string;
  itemData?: FoundryCreateWorldItemData;
  overrides?: UnknownRecord;
  folderId?: string | null;
  reason?: string;
}

export interface FoundryCreateWorldItemResponse extends UnknownRecord {
  success: boolean;
  itemId: string;
  itemName: string;
  itemType: string;
  createdFrom: 'uuid' | 'raw';
  sourceUuid?: string;
  folderId?: string | null;
  appliedOverrides?: UnknownRecord;
}

export interface FoundryUpdateWorldItemRequest {
  itemIdentifier: string;
  updates: UnknownRecord;
  reason?: string;
}

export interface FoundryUpdateWorldItemResponse extends UnknownRecord {
  success: boolean;
  itemId: string;
  itemName: string;
  itemType: string;
  appliedUpdates: UnknownRecord;
  updatedFields: string[];
}

export interface FoundryCreateCompendiumItemRequest {
  packId: string;
  sourceUuid?: string;
  itemData?: FoundryCreateWorldItemData;
  overrides?: UnknownRecord;
  folderId?: string | null;
  reason?: string;
}

export interface FoundryCreateCompendiumItemResponse extends UnknownRecord {
  success: boolean;
  packId: string;
  packLabel?: string;
  itemId: string;
  itemName: string;
  itemType: string;
  createdFrom: 'uuid' | 'raw';
  sourceUuid?: string;
  folderId?: string | null;
  appliedOverrides?: UnknownRecord;
}

export interface FoundryImportItemToCompendiumRequest {
  itemIdentifier: string;
  packId: string;
  folderId?: string | null;
  reason?: string;
}

export interface FoundryImportItemToCompendiumResponse extends UnknownRecord {
  success: boolean;
  sourceItemId: string;
  sourceItemName: string;
  sourceItemType: string;
  packId: string;
  packLabel?: string;
  itemId: string;
  itemName: string;
  itemType: string;
  folderId?: string | null;
}

export type FoundryCompanionRole = 'companion' | 'familiar';

export interface FoundryCharacterCompanionSummonDefaults extends UnknownRecord {
  placementType?: FoundryTokenPlacementOptions['type'] | 'near-owner';
  coordinates?: FoundryTokenPlacementCoordinate[];
  hidden?: boolean;
  reuseExisting?: boolean;
}

export interface FoundryCharacterCompanionSyncSettings extends UnknownRecord {
  syncOwnership?: boolean;
  refreshFromSource?: boolean;
  matchOwnerLevel?: boolean;
  levelOffset?: number;
}

export interface FoundryCharacterCompanionLink extends UnknownRecord {
  ownerActorId: string;
  ownerActorName: string;
  role: FoundryCompanionRole;
  notes?: string;
  sourceUuid?: string;
  linkedAt?: string;
  summonDefaults?: FoundryCharacterCompanionSummonDefaults;
  syncSettings?: FoundryCharacterCompanionSyncSettings;
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

export interface FoundryDnD5eSummonActivitySummary extends UnknownRecord {
  id: string;
  name: string;
  type: string;
  itemId?: string;
  itemName?: string;
}

export interface FoundryDnD5eTransformActivitySummary extends UnknownRecord {
  id: string;
  name: string;
  type: string;
  itemId?: string;
  itemName?: string;
}

export interface FoundryDnD5eSummonProfileSummary extends UnknownRecord {
  id: string;
  name: string;
  uuid?: string;
  count?: number;
  creatureTypes?: string[];
  challengeRating?: number | string;
  hint?: string;
}

export interface FoundryRunDnD5eSummonActivityRequest {
  actorIdentifier: string;
  itemIdentifier: string;
  activityIdentifier?: string;
  profileId?: string;
  placementType?: FoundryTokenPlacementOptions['type'] | 'near-owner';
  coordinates?: FoundryTokenPlacementCoordinate[];
  hidden?: boolean;
  reason?: string;
}

export interface FoundryRunDnD5eSummonActivityResponse extends UnknownRecord {
  success: boolean;
  system: 'dnd5e';
  actorId: string;
  actorName: string;
  actorType: string;
  itemId: string;
  itemName: string;
  itemType: string;
  workflowStatus: 'completed' | 'needs-activity' | 'needs-profile';
  requiresChoices?: boolean;
  activityId?: string;
  activityName?: string;
  profileId?: string;
  profileName?: string;
  availableActivities?: FoundryDnD5eSummonActivitySummary[];
  availableProfiles?: FoundryDnD5eSummonProfileSummary[];
  tokensPlaced?: number;
  tokenIds?: string[];
  tokenNames?: string[];
  warnings?: string[];
  message?: string;
}

export interface FoundryRunDnD5eTransformActivityRequest {
  actorIdentifier: string;
  itemIdentifier: string;
  activityIdentifier?: string;
  reason?: string;
}

export interface FoundryRunDnD5eTransformActivityResponse extends UnknownRecord {
  success: boolean;
  system: 'dnd5e';
  actorId: string;
  actorName: string;
  actorType: string;
  itemId: string;
  itemName: string;
  itemType: string;
  workflowStatus: 'completed' | 'needs-activity';
  requiresChoices?: boolean;
  activityId?: string;
  activityName?: string;
  availableActivities?: FoundryDnD5eTransformActivitySummary[];
  sourceActorId?: string;
  sourceActorName?: string;
  sourceActorType?: string;
  transformedActorId?: string;
  transformedActorName?: string;
  transformedActorType?: string;
  tokenIds?: string[];
  tokenNames?: string[];
  warnings?: string[];
  message?: string;
}

export interface FoundryCreateActorFromCompendiumRequest {
  packId: string;
  itemId: string;
  customNames?: string[];
  quantity?: number;
  addToScene?: boolean;
  placement?: FoundryTokenPlacementOptions;
}

export interface FoundryCreateCharacterActorRequest {
  sourceUuid: string;
  name: string;
  addToScene?: boolean;
  placement?: FoundryTokenPlacementOptions;
}

export interface FoundryCreateCharacterActorResponse extends UnknownRecord {
  success: boolean;
  linked: false;
  actorId: string;
  actorName: string;
  actorType: string;
  sourceUuid: string;
  packId: string;
  itemId: string;
  tokensPlaced?: number;
  tokenIds?: string[];
  warnings?: string[];
}

export interface FoundryCreateDnD5eCharacterWorkflowRequest {
  sourceUuid: string;
  name: string;
  targetLevel: number;
  classIdentifier?: string;
  advancementSelections?: Array<FoundryApplyCharacterAdvancementChoiceRequest['choice']>;
  biography?: string;
  addToScene?: boolean;
  placement?: FoundryTokenPlacementOptions;
}

export interface FoundryCreateDnD5eCharacterWorkflowResponse extends UnknownRecord {
  success: boolean;
  workflowStatus: 'completed' | 'needs-choices' | 'failed';
  linked: false;
  actorId: string;
  actorName: string;
  actorType: string;
  sourceUuid: string;
  targetLevel: number;
  classIdentifier?: string;
  requiresChoices?: boolean;
  pendingAdvancements?: FoundryProgressionPreviewStep[];
  warnings?: string[];
  message?: string;
}

export interface FoundryCreateCharacterCompanionRequest {
  ownerActorIdentifier: string;
  role: FoundryCompanionRole;
  sourceUuid?: string;
  existingActorIdentifier?: string;
  customName?: string;
  addToScene?: boolean;
  placement?: {
    type?: FoundryTokenPlacementOptions['type'] | 'near-owner';
    coordinates?: FoundryTokenPlacementCoordinate[];
  };
  syncOwnership?: boolean;
  notes?: string;
}

export interface FoundryCreateCharacterCompanionResponse extends UnknownRecord {
  success: boolean;
  ownerActorId: string;
  ownerActorName: string;
  companionActorId: string;
  companionActorName: string;
  companionActorType: string;
  role: FoundryCompanionRole;
  created: boolean;
  sourceUuid?: string;
  linkedAt?: string;
  summonDefaults?: FoundryCharacterCompanionSummonDefaults;
  syncSettings?: FoundryCharacterCompanionSyncSettings;
  tokensPlaced?: number;
  tokenIds?: string[];
  warnings?: string[];
}

export interface FoundryUpdateCharacterCompanionLinkRequest {
  ownerActorIdentifier: string;
  companionIdentifier: string;
  role?: FoundryCompanionRole;
  notes?: string;
  sourceUuid?: string;
  syncSettings?: FoundryCharacterCompanionSyncSettings;
}

export interface FoundryUpdateCharacterCompanionLinkResponse extends UnknownRecord {
  success: boolean;
  ownerActorId: string;
  ownerActorName: string;
  companionActorId: string;
  companionActorName: string;
  companionActorType: string;
  role: FoundryCompanionRole;
  linkedAt?: string;
  sourceUuid?: string;
  notes?: string;
  summonDefaults?: FoundryCharacterCompanionSummonDefaults;
  syncSettings?: FoundryCharacterCompanionSyncSettings;
  updatedFields: string[];
  warnings?: string[];
}

export interface FoundryListCharacterCompanionsRequest {
  ownerActorIdentifier: string;
  role?: FoundryCompanionRole;
}

export interface FoundryCharacterCompanionSummary extends UnknownRecord {
  actorId: string;
  actorName: string;
  actorType: string;
  role: FoundryCompanionRole;
  ownerActorId: string;
  ownerActorName: string;
  notes?: string;
  sourceUuid?: string;
  linkedAt?: string;
  summonDefaults?: FoundryCharacterCompanionSummonDefaults;
  syncSettings?: FoundryCharacterCompanionSyncSettings;
  onScene: boolean;
  tokenIds: string[];
}

export interface FoundryListCharacterCompanionsResponse extends UnknownRecord {
  ownerActorId: string;
  ownerActorName: string;
  companions: FoundryCharacterCompanionSummary[];
  totalCompanions: number;
}

export interface FoundrySummonCharacterCompanionRequest {
  ownerActorIdentifier: string;
  companionIdentifier: string;
  placementType?: FoundryTokenPlacementOptions['type'] | 'near-owner';
  coordinates?: FoundryTokenPlacementCoordinate[];
  hidden?: boolean;
  reuseExisting?: boolean;
}

export interface FoundrySummonCharacterCompanionResponse extends UnknownRecord {
  success: boolean;
  ownerActorId: string;
  ownerActorName: string;
  companionActorId: string;
  companionActorName: string;
  role: FoundryCompanionRole;
  tokensPlaced: number;
  tokenIds: string[];
  reusedExisting?: boolean;
  warnings?: string[];
}

export interface FoundryConfigureCharacterCompanionSummonRequest {
  ownerActorIdentifier: string;
  companionIdentifier: string;
  placementType?: FoundryTokenPlacementOptions['type'] | 'near-owner';
  coordinates?: FoundryTokenPlacementCoordinate[];
  hidden?: boolean;
  reuseExisting?: boolean;
}

export interface FoundryConfigureCharacterCompanionSummonResponse extends UnknownRecord {
  success: boolean;
  ownerActorId: string;
  ownerActorName: string;
  companionActorId: string;
  companionActorName: string;
  role: FoundryCompanionRole;
  summonDefaults: FoundryCharacterCompanionSummonDefaults;
  updatedFields: string[];
}

export interface FoundryDismissCharacterCompanionRequest {
  ownerActorIdentifier: string;
  companionIdentifier?: string;
  role?: FoundryCompanionRole;
  dismissAll?: boolean;
}

export interface FoundryDismissedCompanionSummary extends UnknownRecord {
  actorId: string;
  actorName: string;
  role: FoundryCompanionRole;
  tokenIds: string[];
}

export interface FoundryDismissCharacterCompanionResponse extends UnknownRecord {
  success: boolean;
  ownerActorId: string;
  ownerActorName: string;
  dismissedCompanions: FoundryDismissedCompanionSummary[];
  dismissedTokenCount: number;
  warnings?: string[];
}

export interface FoundryUnlinkCharacterCompanionRequest {
  ownerActorIdentifier: string;
  companionIdentifier: string;
}

export interface FoundryUnlinkCharacterCompanionResponse extends UnknownRecord {
  success: boolean;
  ownerActorId: string;
  ownerActorName: string;
  companionActorId: string;
  companionActorName: string;
  role: FoundryCompanionRole;
  unlinked: boolean;
}

export interface FoundryDeleteCharacterCompanionRequest {
  ownerActorIdentifier: string;
  companionIdentifier: string;
  dismissSceneTokens?: boolean;
}

export interface FoundryDeleteCharacterCompanionResponse extends UnknownRecord {
  success: boolean;
  ownerActorId: string;
  ownerActorName: string;
  companionActorId: string;
  companionActorName: string;
  role: FoundryCompanionRole;
  actorDeleted: boolean;
  dismissedTokenCount: number;
  dismissedTokenIds?: string[];
  warnings?: string[];
}

export interface FoundrySyncCharacterCompanionProgressionRequest {
  ownerActorIdentifier: string;
  companionIdentifier: string;
  syncOwnership?: boolean;
  refreshFromSource?: boolean;
  matchOwnerLevel?: boolean;
  levelOffset?: number;
}

export interface FoundrySyncCharacterCompanionProgressionResponse extends UnknownRecord {
  success: boolean;
  ownerActorId: string;
  ownerActorName: string;
  companionActorId: string;
  companionActorName: string;
  role: FoundryCompanionRole;
  appliedOperations: string[];
  updatedFields: string[];
  warnings?: string[];
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
