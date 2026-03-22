import type {
  FoundryApplyCharacterAdvancementChoiceRequest,
  FoundryApplyCharacterAdvancementChoiceResponse,
  FoundryAdvancementChoiceDetails,
  FoundryAdvancementOption,
  FoundryGetCharacterAdvancementOptionsResponse,
  FoundryProgressionPreviewStep,
  FoundryPreviewCharacterProgressionResponse,
} from '@foundry-mcp/shared';
import {
  asRecord,
  getActorItems,
  toNumber,
  toStringValue,
  type ActorProgressionActorLike,
  type ActorProgressionItemLike,
  type ActorProgressionStrategy,
} from './actor-progression-strategy-contract.js';

interface CompendiumPackLike {
  metadata?: {
    id?: string;
    label?: string;
    type?: string;
  };
  documentName?: string;
  index?: {
    values: () => Iterable<unknown>;
  };
  getIndex?: () => Promise<unknown>;
  getDocument?: (id: string) => Promise<unknown>;
}

interface CompendiumDocumentLike {
  id?: string;
  name?: string;
  type?: string;
  toObject?: () => unknown;
}

interface AdvancementDescriptor {
  index: number;
  sourceItem: ActorProgressionItemLike;
  advancement: Record<string, unknown>;
  step: FoundryProgressionPreviewStep;
}

interface ItemGrantDefinition {
  uuid: string;
  optional: boolean;
}

interface ConfiguredGrantOption extends FoundryAdvancementOption {
  optional: boolean;
  selectedByDefault: boolean;
}

interface EvaluatedRollLike {
  total: unknown;
}

interface RollConstructorLike {
  new (formula: string): {
    evaluate(options: { async: boolean }): Promise<EvaluatedRollLike>;
  };
}

function getClassItem(
  actor: ActorProgressionActorLike,
  classIdentifier?: string
): ActorProgressionItemLike {
  const classItems = getActorItems(actor).filter(
    (item): item is ActorProgressionItemLike =>
      item.type === 'class' && typeof item.id === 'string' && typeof item.name === 'string'
  );

  if (classItems.length === 0) {
    throw new Error(
      'UNSUPPORTED_CAPABILITY: No DnD5e class item was found on this character, so class advancement cannot be previewed safely.'
    );
  }

  const requestedClass = classIdentifier?.toLowerCase();
  const classItem =
    requestedClass !== undefined
      ? classItems.find(
          item =>
            item.id?.toLowerCase() === requestedClass || item.name?.toLowerCase() === requestedClass
        )
      : classItems.length === 1
        ? classItems[0]
        : null;

  if (!classItem) {
    if (requestedClass) {
      throw new Error(
        `UNSUPPORTED_CAPABILITY: Class "${classIdentifier}" was not found on this DnD5e character.`
      );
    }

    throw new Error(
      'UNSUPPORTED_CAPABILITY: DnD5e multiclass characters require classIdentifier so the correct class item can be advanced.'
    );
  }

  return classItem;
}

function getAdvancementLevel(advancement: Record<string, unknown>): number | undefined {
  const directLevel = toNumber(advancement.level);
  if (directLevel !== undefined) {
    return directLevel;
  }

  const configuration = asRecord(advancement.configuration);
  return configuration ? toNumber(configuration.level) : undefined;
}

function getAdvancementTitle(advancement: Record<string, unknown>, type: string): string {
  const directTitle = toStringValue(advancement.title);
  if (directTitle) {
    return directTitle;
  }

  const configuration = asRecord(advancement.configuration);
  const configuredTitle = configuration ? toStringValue(configuration.title) : undefined;
  return configuredTitle ?? type;
}

function isOptionalAdvancement(advancement: Record<string, unknown>): boolean {
  if (advancement.optional === true) {
    return true;
  }

  const configuration = asRecord(advancement.configuration);
  return configuration?.optional === true;
}

function requiresChoices(
  type: string,
  advancement: Record<string, unknown>,
  optional: boolean
): boolean {
  const lowerType = type.toLowerCase();
  if (optional) {
    return true;
  }

  if (lowerType === 'itemgrant') {
    return requiresItemGrantChoices(advancement);
  }

  if (
    lowerType === 'hitpoints' ||
    lowerType === 'itemchoice' ||
    lowerType === 'trait' ||
    lowerType === 'subclass' ||
    lowerType.includes('abilityscore')
  ) {
    return true;
  }

  const configuration = asRecord(advancement.configuration);
  return Boolean(
    advancement.pool ||
      advancement.choices ||
      configuration?.pool ||
      configuration?.choices ||
      configuration?.allowDrops
  );
}

function buildHints(type: string, optional: boolean): string[] {
  const lowerType = type.toLowerCase();
  const hints: string[] = [];

  if (lowerType === 'hitpoints') {
    hints.push(
      'DnD5e hit point advancement is normally handled by the system workflow so the user can roll or take the configured average.'
    );
  }

  if (lowerType === 'itemchoice') {
    hints.push('This advancement requires selecting one or more items from a configured pool.');
  }

  if (lowerType === 'itemgrant') {
    hints.push(
      'This advancement grants one or more follow-up items in the DnD5e progression flow.'
    );
  }

  if (lowerType === 'subclass') {
    hints.push('This advancement requires selecting or confirming a subclass choice.');
  }

  if (lowerType.includes('abilityscore')) {
    hints.push(
      'This advancement requires choosing an ability score increase or an alternative such as a feat.'
    );
  }

  if (lowerType === 'trait') {
    hints.push('This advancement requires choosing from one or more trait options.');
  }

  if (optional) {
    hints.push(
      'This advancement is optional and normally appears as a confirmable choice in the DnD5e level-up workflow.'
    );
  }

  if (hints.length === 0) {
    hints.push(
      'This advancement is managed by the DnD5e system workflow and should not be assumed to be fully applied by changing class levels alone.'
    );
  }

  return hints;
}

function normalizeUuid(value: unknown): string | undefined {
  if (typeof value === 'string' && value.startsWith('Compendium.')) {
    return value;
  }

  const record = asRecord(value);
  return record ? normalizeUuid(record.uuid) : undefined;
}

function parseCompendiumUuid(uuid: string): { packId: string; documentId: string } | null {
  const parts = uuid.split('.');
  if (parts.length < 4 || parts[0] !== 'Compendium') {
    return null;
  }

  return {
    packId: `${parts[1]}.${parts[2]}`,
    documentId: parts[parts.length - 1],
  };
}

function hasMeaningfulValue(value: unknown): boolean {
  if (value === null || value === undefined) {
    return false;
  }

  if (Array.isArray(value)) {
    return value.some(entry => hasMeaningfulValue(entry));
  }

  if (typeof value === 'object') {
    return Object.values(value).some(entry => hasMeaningfulValue(entry));
  }

  return true;
}

function getLevelChoiceCount(
  advancement: Record<string, unknown>,
  level: number
): number | undefined {
  const configuration = asRecord(advancement.configuration) ?? {};
  const choicesByLevel = asRecord(configuration.choices);
  const levelChoice =
    choicesByLevel && level !== undefined ? asRecord(choicesByLevel[String(level)]) : undefined;
  return toNumber(levelChoice?.count);
}

function isAdvancementCompletedForLevel(
  advancement: Record<string, unknown>,
  type: string,
  level: number
): boolean {
  const value = asRecord(advancement.value);
  if (!value) {
    return false;
  }

  const lowerType = type.toLowerCase();

  if (lowerType === 'hitpoints') {
    return value[String(level)] !== undefined;
  }

  if (lowerType === 'itemchoice') {
    const addedByLevel = asRecord(value.added);
    const levelAdded = asRecord(addedByLevel?.[String(level)]);
    const choiceCount = getLevelChoiceCount(advancement, level) ?? 1;
    return Object.keys(levelAdded ?? {}).length >= choiceCount;
  }

  if (lowerType === 'subclass') {
    return Boolean(toStringValue(value.document) ?? toStringValue(value.uuid));
  }

  return hasMeaningfulValue(value);
}

function getCompendiumPacks(): CompendiumPackLike[] {
  const packsCollection = game.packs as unknown as
    | {
        values?: () => Iterable<unknown>;
      }
    | undefined;
  const values = packsCollection?.values?.();
  if (!values) {
    return [];
  }

  return Array.from(values).filter((pack): pack is CompendiumPackLike =>
    Boolean(pack && typeof pack === 'object')
  );
}

function matchesQuery(name: string, query: string | undefined): boolean {
  return !query || name.toLowerCase().includes(query.toLowerCase());
}

function toIndexOption(
  entry: unknown,
  packId: string,
  source: 'compendium' | 'configured' | 'synthetic'
): FoundryAdvancementOption | null {
  const record = asRecord(entry);
  const id = record ? (toStringValue(record._id) ?? toStringValue(record.id)) : undefined;
  const name = record ? toStringValue(record.name) : undefined;
  const type = record ? toStringValue(record.type) : undefined;

  if (!id || !name || !type) {
    return null;
  }

  return {
    id,
    name,
    type,
    source,
    packId,
    uuid: `Compendium.${packId}.Item.${id}`,
  };
}

async function ensurePackIndex(pack: CompendiumPackLike): Promise<Iterable<unknown>> {
  if (!pack.index && typeof pack.getIndex === 'function') {
    await pack.getIndex();
  }

  return pack.index?.values() ?? [];
}

async function resolveCompendiumUuidOption(
  uuid: string,
  source: 'configured' | 'compendium'
): Promise<FoundryAdvancementOption | null> {
  const parsed = parseCompendiumUuid(uuid);
  if (!parsed) {
    return null;
  }

  const pack = getCompendiumPacks().find(candidate => candidate.metadata?.id === parsed.packId);
  if (!pack) {
    return null;
  }

  for (const entry of await ensurePackIndex(pack)) {
    const option = toIndexOption(entry, parsed.packId, source);
    if (option?.id === parsed.documentId) {
      return option;
    }
  }

  return null;
}

async function resolveCompendiumUuidDocument(uuid: string): Promise<CompendiumDocumentLike | null> {
  const parsed = parseCompendiumUuid(uuid);
  if (!parsed) {
    return null;
  }

  const pack = getCompendiumPacks().find(candidate => candidate.metadata?.id === parsed.packId);
  if (!pack || typeof pack.getDocument !== 'function') {
    return null;
  }

  const document = await pack.getDocument(parsed.documentId);
  return document && typeof document === 'object' ? (document as CompendiumDocumentLike) : null;
}

async function searchItemCompendiumOptions(params: {
  itemType: string;
  query?: string;
  limit?: number;
}): Promise<{ options: FoundryAdvancementOption[]; totalOptions: number }> {
  const matches: FoundryAdvancementOption[] = [];

  for (const pack of getCompendiumPacks()) {
    const packId = pack.metadata?.id;
    const packType = pack.metadata?.type ?? pack.documentName;
    if (!packId || packType !== 'Item') {
      continue;
    }

    for (const entry of await ensurePackIndex(pack)) {
      const option = toIndexOption(entry, packId, 'compendium');
      if (!option || option.type !== params.itemType) {
        continue;
      }

      if (!matchesQuery(option.name, params.query)) {
        continue;
      }

      matches.push(option);
    }
  }

  matches.sort((left, right) => left.name.localeCompare(right.name));
  return {
    totalOptions: matches.length,
    options: matches.slice(0, params.limit ?? 50),
  };
}

function toNumericRecord(value: unknown): Record<string, number> | undefined {
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }

  const numericEntries = Object.entries(record)
    .map(([key, entryValue]) => [key, toNumber(entryValue)] as const)
    .filter((entry): entry is [string, number] => entry[1] !== undefined);

  return numericEntries.length > 0 ? Object.fromEntries(numericEntries) : undefined;
}

function toStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : undefined;
}

function getItemGrantDefinitions(advancement: Record<string, unknown>): ItemGrantDefinition[] {
  const configuration = asRecord(advancement.configuration) ?? {};
  const poolEntries = Array.isArray(configuration.pool)
    ? configuration.pool
    : Array.isArray(configuration.items)
      ? configuration.items
      : [];

  return poolEntries
    .map(entry => {
      const entryRecord = asRecord(entry);
      const uuid = normalizeUuid(entryRecord ?? entry);
      if (!uuid) {
        return null;
      }

      return {
        uuid,
        optional: entryRecord?.optional === true,
      };
    })
    .filter((entry): entry is ItemGrantDefinition => entry !== null);
}

function getItemGrantAbilityOptions(advancement: Record<string, unknown>): string[] {
  const configuration = asRecord(advancement.configuration) ?? {};
  const spellConfig = asRecord(configuration.spell);
  const abilityOptions = toStringArray(spellConfig?.ability ?? configuration.ability) ?? [];
  return Array.from(new Set(abilityOptions));
}

function getDefaultItemGrantUuids(advancement: Record<string, unknown>): string[] {
  return getItemGrantDefinitions(advancement)
    .filter(entry => !entry.optional)
    .map(entry => entry.uuid);
}

function requiresItemGrantChoices(advancement: Record<string, unknown>): boolean {
  if (isOptionalAdvancement(advancement)) {
    return true;
  }

  return (
    getItemGrantDefinitions(advancement).some(entry => entry.optional) ||
    getItemGrantAbilityOptions(advancement).length > 1
  );
}

function isAutoApplySafeAdvancement(type: string, advancement: Record<string, unknown>): boolean {
  return type.toLowerCase() === 'itemgrant' && !requiresItemGrantChoices(advancement);
}

async function getAsiChoiceDetails(
  advancement: Record<string, unknown>
): Promise<FoundryAdvancementChoiceDetails> {
  const configuration = asRecord(advancement.configuration) ?? {};
  const recommendationUuid = normalizeUuid(configuration.recommendation);
  const recommendation = recommendationUuid
    ? await resolveCompendiumUuidOption(recommendationUuid, 'configured')
    : null;
  const points = toNumber(configuration.points);
  const pointCap = toNumber(configuration.cap);
  const maxScore = toNumber(configuration.max);
  const fixed = toNumericRecord(configuration.fixed);
  const locked = toStringArray(configuration.locked);

  return {
    kind: 'ability-score-improvement',
    optionQuerySupported: true,
    featChoiceAvailable: true,
    ...(points !== undefined ? { points } : {}),
    ...(pointCap !== undefined ? { pointCap } : {}),
    ...(maxScore !== undefined ? { maxScore } : {}),
    ...(fixed ? { fixed } : {}),
    ...(locked ? { locked } : {}),
    ...(recommendation ? { recommendation } : {}),
  };
}

async function getConfiguredPoolOptions(
  advancement: Record<string, unknown>
): Promise<FoundryAdvancementOption[]> {
  const configuration = asRecord(advancement.configuration) ?? {};
  const poolEntries = Array.isArray(configuration.pool)
    ? configuration.pool
    : Array.isArray(configuration.items)
      ? configuration.items
      : [];

  const options = await Promise.all(
    poolEntries
      .map(entry => normalizeUuid(entry))
      .filter((uuid): uuid is string => uuid !== undefined)
      .map(uuid => resolveCompendiumUuidOption(uuid, 'configured'))
  );

  return options.filter((option): option is FoundryAdvancementOption => option !== null);
}

async function getChoiceDetails(
  advancement: Record<string, unknown>,
  type: string
): Promise<FoundryAdvancementChoiceDetails | undefined> {
  const lowerType = type.toLowerCase();
  const configuration = asRecord(advancement.configuration) ?? {};

  if (lowerType.includes('abilityscore')) {
    return getAsiChoiceDetails(advancement);
  }

  if (lowerType === 'itemchoice') {
    const choicesByLevel = asRecord(configuration.choices);
    const level = getAdvancementLevel(advancement);
    const levelChoice =
      choicesByLevel && level !== undefined ? asRecord(choicesByLevel[String(level)]) : undefined;

    const options = await getConfiguredPoolOptions(advancement);
    const chooseCount = toNumber(levelChoice?.count);
    return {
      kind: 'item-choice',
      optionQuerySupported: true,
      ...(chooseCount !== undefined ? { chooseCount } : {}),
      ...(levelChoice?.replacement === true ? { replacementAllowed: true } : {}),
      ...(options.length > 0 ? { options } : {}),
    };
  }

  if (lowerType === 'itemgrant') {
    const configuredOptions = await Promise.all(
      getItemGrantDefinitions(advancement).map(async definition => {
        const option = await resolveCompendiumUuidOption(definition.uuid, 'configured');
        if (!option) {
          return null;
        }

        return {
          ...option,
          optional: definition.optional,
          selectedByDefault: !definition.optional,
        } satisfies ConfiguredGrantOption;
      })
    );
    const options = configuredOptions.filter(
      (option): option is ConfiguredGrantOption => option !== null
    );
    const abilityOptions = getItemGrantAbilityOptions(advancement);
    const defaultSelectedOptionIds = options
      .filter(option => option.selectedByDefault === true)
      .map(option => option.id);

    return {
      kind: 'grant-items',
      optionQuerySupported: true,
      ...(abilityOptions.length > 0 ? { abilityOptions } : {}),
      ...(defaultSelectedOptionIds.length > 0 ? { defaultSelectedOptionIds } : {}),
      ...(options.length > 0 ? { options } : {}),
    };
  }

  if (lowerType === 'subclass') {
    return {
      kind: 'subclass',
      optionQuerySupported: true,
    };
  }

  if (lowerType === 'hitpoints') {
    return {
      kind: 'hit-points',
      optionQuerySupported: true,
      options: [
        {
          id: 'average',
          name: 'Take Average',
          type: 'hit-points',
          source: 'synthetic',
          hint: 'Use the class average for this level instead of rolling hit points.',
        },
        {
          id: 'roll',
          name: 'Roll Hit Points',
          type: 'hit-points',
          source: 'synthetic',
          hint: 'Roll the class hit die for this level in the DnD5e advancement workflow.',
        },
      ],
    };
  }

  return undefined;
}

async function buildAdvancementDescriptors(params: {
  sourceItems: ActorProgressionItemLike[];
  currentLevel: number;
  targetLevel: number;
}): Promise<AdvancementDescriptor[]> {
  const { sourceItems, currentLevel, targetLevel } = params;
  const descriptors: AdvancementDescriptor[] = [];

  for (const sourceItem of sourceItems) {
    const advancements = getItemAdvancements(sourceItem);

    for (const [index, advancement] of advancements.entries()) {
      const type = toStringValue(advancement.type) ?? 'Unknown';
      const level = getAdvancementLevel(advancement);
      if (
        level === undefined ||
        level <= currentLevel ||
        level > targetLevel ||
        isAdvancementCompletedForLevel(advancement, type, level)
      ) {
        continue;
      }

      const optional = isOptionalAdvancement(advancement);
      const choiceDetails = await getChoiceDetails(advancement, type);
      descriptors.push({
        index,
        sourceItem,
        advancement,
        step: {
          id:
            toStringValue(advancement._id) ??
            toStringValue(advancement.id) ??
            `${sourceItem.id ?? sourceItem.name ?? 'item'}:${type}:${level}:${index}`,
          level,
          type,
          title: getAdvancementTitle(advancement, type),
          required: !optional,
          choicesRequired: requiresChoices(type, advancement, optional),
          autoApplySafe: isAutoApplySafeAdvancement(type, advancement),
          hints: buildHints(type, optional),
          ...(choiceDetails ? { choiceDetails } : {}),
          ...(sourceItem.id ? { sourceItemId: sourceItem.id } : {}),
          ...(sourceItem.name ? { sourceItemName: sourceItem.name } : {}),
          ...(sourceItem.type ? { sourceItemType: sourceItem.type } : {}),
        },
      });
    }
  }

  return descriptors.sort((left, right) => {
    if (left.step.level !== right.step.level) {
      return left.step.level - right.step.level;
    }

    const leftSource = left.sourceItem.name ?? left.sourceItem.id ?? '';
    const rightSource = right.sourceItem.name ?? right.sourceItem.id ?? '';
    if (leftSource !== rightSource) {
      return leftSource.localeCompare(rightSource);
    }

    return left.index - right.index;
  });
}

async function getAdvancementContext(params: {
  actor: ActorProgressionActorLike;
  classIdentifier?: string;
  targetLevel: number;
}): Promise<{
  classItem: ActorProgressionItemLike;
  currentLevel: number;
  descriptors: AdvancementDescriptor[];
}> {
  const classItem = getClassItem(params.actor, params.classIdentifier);
  const classSystem = asRecord(classItem.system);
  const currentLevel = toNumber(classSystem?.levels) ?? 0;
  const sourceItems = collectAdvancementSourceItems(params.actor, classItem);
  const descriptors = await buildAdvancementDescriptors({
    sourceItems,
    currentLevel,
    targetLevel: params.targetLevel,
  });

  return { classItem, currentLevel, descriptors };
}

function dedupeOptions(options: FoundryAdvancementOption[]): FoundryAdvancementOption[] {
  const seen = new Set<string>();
  return options.filter(option => {
    const key = option.uuid ?? `${option.source}:${option.type}:${option.id}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

async function getStepOptions(params: {
  descriptor: AdvancementDescriptor;
  query?: string;
  limit?: number;
}): Promise<{ options: FoundryAdvancementOption[]; totalOptions: number }> {
  const { descriptor, query, limit } = params;
  const lowerType = descriptor.step.type.toLowerCase();
  const choiceDetails = descriptor.step.choiceDetails;

  if (lowerType.includes('abilityscore')) {
    const featSearch = await searchItemCompendiumOptions({
      itemType: 'feat',
      ...(query !== undefined ? { query } : {}),
      ...(limit !== undefined ? { limit } : {}),
    });

    const asiOption: FoundryAdvancementOption = {
      id: 'asi',
      name: 'Ability Score Improvement',
      type: 'ability-score-improvement',
      source: 'synthetic',
      hint: 'Assign the configured ability score points instead of selecting a feat.',
    };

    const recommendation = choiceDetails?.recommendation;
    const options = dedupeOptions([
      asiOption,
      ...(recommendation ? [recommendation] : []),
      ...featSearch.options,
    ]);

    return {
      options,
      totalOptions: options.length,
    };
  }

  if (lowerType === 'subclass') {
    return searchItemCompendiumOptions({
      itemType: 'subclass',
      ...(query !== undefined ? { query } : {}),
      ...(limit !== undefined ? { limit } : {}),
    });
  }

  if (choiceDetails?.options) {
    const filtered = choiceDetails.options.filter(option => matchesQuery(option.name, query));
    return {
      totalOptions: filtered.length,
      options: filtered.slice(0, limit ?? 50),
    };
  }

  return {
    totalOptions: 0,
    options: [],
  };
}

function getItemAdvancements(item: ActorProgressionItemLike): Record<string, unknown>[] {
  const system = asRecord(item.system);
  return Array.isArray(system?.advancement)
    ? system.advancement.filter((entry): entry is Record<string, unknown> =>
        Boolean(entry && typeof entry === 'object')
      )
    : [];
}

function getAdvancementLinkedItemIds(advancement: Record<string, unknown>): string[] {
  const value = asRecord(advancement.value);
  if (!value) {
    return [];
  }

  const linkedIds = new Set<string>();
  const addLocalId = (candidate: unknown): void => {
    if (
      typeof candidate === 'string' &&
      candidate.length > 0 &&
      !candidate.startsWith('Compendium.')
    ) {
      linkedIds.add(candidate);
    }
  };

  addLocalId(value.document);

  if (Array.isArray(value.documents)) {
    value.documents.forEach(addLocalId);
  }

  const addedByLevel = asRecord(value.added);
  for (const levelEntry of Object.values(addedByLevel ?? {})) {
    for (const itemId of Object.keys(asRecord(levelEntry) ?? {})) {
      addLocalId(itemId);
    }
  }

  const replacedByLevel = asRecord(value.replaced);
  for (const replacementEntry of Object.values(replacedByLevel ?? {})) {
    const replacementRecord = asRecord(replacementEntry);
    addLocalId(replacementRecord?.replacement);
  }

  for (const [key, entryValue] of Object.entries(value)) {
    if (
      key !== 'document' &&
      key !== 'uuid' &&
      key !== 'added' &&
      key !== 'replaced' &&
      typeof entryValue === 'string' &&
      entryValue.startsWith('Compendium.')
    ) {
      addLocalId(key);
    }
  }

  return Array.from(linkedIds);
}

function collectAdvancementSourceItems(
  actor: ActorProgressionActorLike,
  classItem: ActorProgressionItemLike
): ActorProgressionItemLike[] {
  const actorItems = getActorItems(actor);
  const itemsById = new Map(
    actorItems
      .filter(
        (item): item is ActorProgressionItemLike & { id: string } => typeof item.id === 'string'
      )
      .map(item => [item.id, item] as const)
  );
  const collected: ActorProgressionItemLike[] = [];
  const queue: ActorProgressionItemLike[] = [classItem];
  const visitedIds = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    if (current.id) {
      if (visitedIds.has(current.id)) {
        continue;
      }
      visitedIds.add(current.id);
    }

    collected.push(current);

    for (const advancement of getItemAdvancements(current)) {
      for (const linkedItemId of getAdvancementLinkedItemIds(advancement)) {
        const linkedItem = itemsById.get(linkedItemId);
        if (linkedItem) {
          queue.push(linkedItem);
        }
      }
    }
  }

  return collected;
}

function getAbilityScores(actor: ActorProgressionActorLike): Record<string, number> {
  const system = asRecord(actor.system);
  const abilities = asRecord(system?.abilities);
  if (!abilities) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(abilities)
      .map(([key, value]) => [key.toLowerCase(), toNumber(asRecord(value)?.value)] as const)
      .filter((entry): entry is [string, number] => entry[1] !== undefined)
  );
}

function toPositiveIntegerRecord(value: Record<string, number>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, entryValue]) => [key.toLowerCase(), toNumber(entryValue)] as const)
      .filter(
        (entry): entry is [string, number] =>
          entry[1] !== undefined && Number.isInteger(entry[1]) && entry[1] > 0
      )
  );
}

function sumValues(values: Record<string, number>): number {
  return Object.values(values).reduce((total, value) => total + value, 0);
}

function getAsiConfiguration(advancement: Record<string, unknown>): {
  points: number;
  pointCap?: number;
  maxScore?: number;
  fixed: Record<string, number>;
  locked: string[];
} {
  const configuration = asRecord(advancement.configuration) ?? {};
  const fixed = toNumericRecord(configuration.fixed) ?? {};
  const locked =
    toStringArray(configuration.locked)
      ?.map(entry => entry.toLowerCase())
      .filter(Boolean) ?? [];
  const pointCap = toNumber(configuration.cap);
  const maxScore = toNumber(configuration.max);

  return {
    points: toNumber(configuration.points) ?? 2,
    ...(pointCap !== undefined ? { pointCap } : {}),
    ...(maxScore !== undefined ? { maxScore } : {}),
    fixed,
    locked,
  };
}

function getConstitutionModifier(actor: ActorProgressionActorLike): number {
  const system = asRecord(actor.system);
  const abilities = asRecord(system?.abilities);
  const constitution = asRecord(abilities?.con);
  const explicitModifier = toNumber(constitution?.mod);
  if (explicitModifier !== undefined) {
    return explicitModifier;
  }

  const score = toNumber(constitution?.value);
  return score !== undefined ? Math.floor((score - 10) / 2) : 0;
}

function getHitPointState(actor: ActorProgressionActorLike): {
  current: number;
  max: number;
  temp?: number;
} {
  const system = asRecord(actor.system);
  const attributes = asRecord(system?.attributes);
  const hp = asRecord(attributes?.hp);
  const current = toNumber(hp?.value);
  const max = toNumber(hp?.max);

  if (current === undefined || max === undefined) {
    throw new Error(
      'UNSUPPORTED_CAPABILITY: This DnD5e actor does not expose hit points in a supported format.'
    );
  }

  const temp = toNumber(hp?.temp);
  return {
    current,
    max,
    ...(temp !== undefined ? { temp } : {}),
  };
}

function getClassHitDieFaces(classItem: ActorProgressionItemLike): number {
  const system = asRecord(classItem.system);
  const hd = asRecord(system?.hd);
  const denomination = toStringValue(hd?.denomination);
  if (denomination) {
    const parsed = Number(denomination.replace(/^d/i, ''));
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  const faces = toNumber(hd?.faces);
  if (faces !== undefined && faces > 0) {
    return faces;
  }

  const direct = toStringValue(system?.hitDie) ?? toStringValue(system?.hitDice);
  if (direct) {
    const parsed = Number(direct.replace(/^d/i, ''));
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  throw new Error(
    `UNSUPPORTED_CAPABILITY: Class "${classItem.name ?? classItem.id ?? 'unknown'}" does not expose a supported hit die field.`
  );
}

function buildSourceItemAdvancementValueUpdate(params: {
  sourceItem: ActorProgressionItemLike;
  descriptor: AdvancementDescriptor;
  value: Record<string, unknown>;
}): Record<string, unknown>[] {
  const advancements = getItemAdvancements(params.sourceItem);
  return advancements.map((advancement, index) =>
    index === params.descriptor.index ? { ...advancement, value: params.value } : advancement
  );
}

function buildHitPointsAdvancementValueUpdate(params: {
  sourceItem: ActorProgressionItemLike;
  descriptor: AdvancementDescriptor;
  value: 'avg' | 'max' | number;
}): Record<string, unknown>[] {
  const advancements = getItemAdvancements(params.sourceItem);
  const level = String(params.descriptor.step.level);
  return advancements.map((advancement, index) => {
    if (index !== params.descriptor.index) {
      return advancement;
    }

    const advancementValue = asRecord(advancement.value) ?? {};
    return {
      ...advancement,
      value: {
        ...advancementValue,
        [level]: params.value,
      },
    };
  });
}

function buildSubclassAdvancementValueUpdate(params: {
  sourceItem: ActorProgressionItemLike;
  descriptor: AdvancementDescriptor;
  subclassItemId: string;
  subclassUuid: string;
}): Record<string, unknown>[] {
  return buildSourceItemAdvancementValueUpdate({
    sourceItem: params.sourceItem,
    descriptor: params.descriptor,
    value: {
      document: params.subclassItemId,
      uuid: params.subclassUuid,
    },
  });
}

function buildItemChoiceAdvancementValueUpdate(params: {
  sourceItem: ActorProgressionItemLike;
  descriptor: AdvancementDescriptor;
  createdItems: Array<{ id: string; uuid: string }>;
  replacement?: {
    originalItemId: string;
    replacementItemId: string;
    level: number;
  };
}): Record<string, unknown>[] {
  const advancements = getItemAdvancements(params.sourceItem);
  const levelKey = String(params.descriptor.step.level);

  return advancements.map((advancement, index) => {
    if (index !== params.descriptor.index) {
      return advancement;
    }

    const advancementValue = asRecord(advancement.value) ?? {};
    const addedByLevel = asRecord(advancementValue.added) ?? {};
    const replacedByLevel = asRecord(advancementValue.replaced) ?? {};

    const updatedAddedByLevel = {
      ...addedByLevel,
      [levelKey]: Object.fromEntries(params.createdItems.map(item => [item.id, item.uuid])),
    };

    const updatedValue: Record<string, unknown> = {
      ...advancementValue,
      added: updatedAddedByLevel,
    };

    if (params.replacement) {
      updatedValue.replaced = {
        ...replacedByLevel,
        [levelKey]: {
          level: params.replacement.level,
          original: params.replacement.originalItemId,
          replacement: params.replacement.replacementItemId,
        },
      };
    } else if (Object.keys(replacedByLevel).length > 0) {
      updatedValue.replaced = replacedByLevel;
    }

    return {
      ...advancement,
      value: updatedValue,
    };
  });
}

function buildItemGrantAdvancementValueUpdate(params: {
  sourceItem: ActorProgressionItemLike;
  descriptor: AdvancementDescriptor;
  createdItems: Array<{ id: string; uuid: string }>;
  declined: boolean;
  ability?: string;
}): Record<string, unknown>[] {
  const advancements = getItemAdvancements(params.sourceItem);

  return advancements.map((advancement, index) => {
    if (index !== params.descriptor.index) {
      return advancement;
    }

    const advancementValue = asRecord(advancement.value) ?? {};
    const { declined: _existingDeclined, ...restValue } = advancementValue;
    const linkedItems = Object.fromEntries(params.createdItems.map(item => [item.id, item.uuid]));

    return {
      ...advancement,
      value: {
        ...restValue,
        ...(params.declined ? { declined: true } : linkedItems),
        ...(params.ability ? { ability: params.ability } : {}),
      },
    };
  });
}

function getAddedItemsByLevel(
  descriptor: AdvancementDescriptor
): Record<string, Record<string, string>> {
  const value = asRecord(descriptor.advancement.value);
  const addedByLevel = asRecord(value?.added);

  return Object.fromEntries(
    Object.entries(addedByLevel ?? {}).map(([level, entry]) => [
      level,
      Object.fromEntries(
        Object.entries(asRecord(entry) ?? {}).filter(
          (recordEntry): recordEntry is [string, string] => typeof recordEntry[1] === 'string'
        )
      ),
    ])
  );
}

function findReplacementSourceLevel(
  descriptor: AdvancementDescriptor,
  itemId: string
): number | undefined {
  const addedByLevel = getAddedItemsByLevel(descriptor);
  for (const [levelKey, items] of Object.entries(addedByLevel)) {
    if (itemId in items) {
      const parsed = Number(levelKey);
      return Number.isFinite(parsed) ? parsed : undefined;
    }
  }

  return undefined;
}

function resolveItemGrantSelection(params: {
  descriptor: AdvancementDescriptor;
  request: FoundryApplyCharacterAdvancementChoiceRequest;
}): { selectedUuids: string[]; ability?: string } {
  const { descriptor, request } = params;
  if (request.choice.type !== 'item-grant') {
    throw new Error(`Unsupported DnD5e item-grant choice type: ${request.choice.type}`);
  }

  const definitions = getItemGrantDefinitions(descriptor.advancement);
  const allowedUuids = new Set(definitions.map(entry => entry.uuid));
  const defaultSelectedUuids = getDefaultItemGrantUuids(descriptor.advancement);
  const globalOptional = isOptionalAdvancement(descriptor.advancement);
  const explicitSelection = request.choice.itemUuids;
  const selectedUuids = Array.from(new Set(explicitSelection ?? defaultSelectedUuids));

  for (const itemUuid of selectedUuids) {
    if (!allowedUuids.has(itemUuid)) {
      throw new Error(`Item "${itemUuid}" is not a valid option for this advancement step.`);
    }
  }

  const requiredUuids = definitions
    .filter(entry => !globalOptional && !entry.optional)
    .map(entry => entry.uuid);

  for (const requiredUuid of requiredUuids) {
    if (!selectedUuids.includes(requiredUuid)) {
      throw new Error(`This item-grant step requires granting "${requiredUuid}".`);
    }
  }

  const abilityOptions = getItemGrantAbilityOptions(descriptor.advancement);
  const ability =
    abilityOptions.length === 1 && !request.choice.ability
      ? abilityOptions[0]
      : request.choice.ability;

  if (selectedUuids.length > 0 && abilityOptions.length > 1 && !ability) {
    throw new Error(
      `This item-grant step requires choosing one of these abilities: ${abilityOptions.join(', ')}.`
    );
  }

  if (ability && abilityOptions.length > 0 && !abilityOptions.includes(ability)) {
    throw new Error(`Ability "${ability}" is not a valid option for this advancement step.`);
  }

  return {
    selectedUuids,
    ...(ability ? { ability } : {}),
  };
}

async function createItemsFromUuids(params: {
  actor: ActorProgressionActorLike;
  itemUuids: string[];
}): Promise<Array<{ id: string; uuid: string }>> {
  if (typeof params.actor.createEmbeddedDocuments !== 'function') {
    throw new Error(
      `Actor "${params.actor.name ?? params.actor.id ?? 'unknown'}" does not support createEmbeddedDocuments().`
    );
  }

  const documents = await Promise.all(
    params.itemUuids.map(async uuid => {
      const document = await resolveCompendiumUuidDocument(uuid);
      if (!document?.toObject) {
        throw new Error(`Compendium item "${uuid}" could not be resolved.`);
      }

      const itemDataRaw = document.toObject();
      if (!itemDataRaw || typeof itemDataRaw !== 'object') {
        throw new Error(`Compendium item "${uuid}" did not provide valid item data.`);
      }

      const itemData = { ...(itemDataRaw as Record<string, unknown>) };
      delete itemData._id;
      delete itemData.folder;
      delete itemData.sort;
      return itemData;
    })
  );

  const createdItemsRaw = await params.actor.createEmbeddedDocuments('Item', documents);
  const createdItems = Array.isArray(createdItemsRaw)
    ? createdItemsRaw.filter((entry): entry is { id?: string } =>
        Boolean(entry && typeof entry === 'object')
      )
    : [];

  return params.itemUuids.map((uuid, index) => {
    const id = createdItems[index]?.id;
    if (!id) {
      throw new Error(`The created item for "${uuid}" did not expose a stable ID.`);
    }

    return { id, uuid };
  });
}

async function rollbackCreatedItems(
  actor: ActorProgressionActorLike,
  itemIds: string[],
  warnings: string[]
): Promise<void> {
  if (itemIds.length === 0 || typeof actor.deleteEmbeddedDocuments !== 'function') {
    return;
  }

  try {
    await actor.deleteEmbeddedDocuments('Item', itemIds);
  } catch (rollbackError) {
    warnings.push(
      `Item rollback failed after the class advancement update error: ${
        rollbackError instanceof Error ? rollbackError.message : 'Unknown rollback error'
      }`
    );
  }
}

async function evaluateRollTotal(formula: string): Promise<number> {
  const RollClass = Roll as unknown as RollConstructorLike;
  const evaluated = await new RollClass(formula).evaluate({ async: true });
  const total = toNumber(evaluated.total);
  if (total === undefined) {
    throw new Error(`Roll "${formula}" did not produce a numeric total.`);
  }

  return total;
}

async function applyAbilityScoreImprovementChoice(params: {
  actor: ActorProgressionActorLike;
  classItem: ActorProgressionItemLike;
  descriptor: AdvancementDescriptor;
  request: FoundryApplyCharacterAdvancementChoiceRequest;
}): Promise<FoundryApplyCharacterAdvancementChoiceResponse> {
  const { actor, classItem, descriptor, request } = params;
  const choice = request.choice;
  const sourceItemId = descriptor.sourceItem.id;

  if (typeof actor.updateEmbeddedDocuments !== 'function') {
    throw new Error(
      `Actor "${actor.name ?? request.actorIdentifier}" does not support updateEmbeddedDocuments().`
    );
  }

  if (!sourceItemId) {
    throw new Error(
      `Advancement step "${descriptor.step.id}" is not attached to a stable owned item.`
    );
  }

  if (choice.type !== 'ability-score-improvement') {
    throw new Error(`Unsupported DnD5e advancement choice type: ${choice.type}`);
  }

  if (choice.mode === 'asi') {
    if (typeof actor.update !== 'function') {
      throw new Error(
        `Actor "${actor.name ?? request.actorIdentifier}" does not support update().`
      );
    }

    const availableScores = getAbilityScores(actor);
    if (Object.keys(availableScores).length === 0) {
      throw new Error(
        'UNSUPPORTED_CAPABILITY: This DnD5e actor does not expose ability scores in a supported format.'
      );
    }

    const configuration = getAsiConfiguration(descriptor.advancement);
    const assignments = toPositiveIntegerRecord(choice.assignments);
    const assignmentEntries = Object.entries(assignments);

    if (configuration.points > 0 && assignmentEntries.length === 0) {
      throw new Error('This ASI step requires at least one ability assignment.');
    }

    for (const [ability] of assignmentEntries) {
      if (!(ability in availableScores)) {
        throw new Error(`Ability "${ability}" is not available on this actor.`);
      }

      if (configuration.locked.includes(ability)) {
        throw new Error(`Ability "${ability}" is locked for this advancement step.`);
      }

      if (ability in configuration.fixed) {
        throw new Error(`Ability "${ability}" is already fixed by this advancement step.`);
      }
    }

    const assignedPoints = sumValues(assignments);
    if (assignedPoints !== configuration.points) {
      throw new Error(
        `This ASI step requires exactly ${configuration.points} assignable point(s), but ${assignedPoints} were provided.`
      );
    }

    const pointCap = configuration.pointCap;
    if (pointCap !== undefined && assignmentEntries.some(([, value]) => value > pointCap)) {
      throw new Error(
        `No more than ${pointCap} point(s) can be assigned to a single ability for this advancement step.`
      );
    }

    const totalAssignments = { ...configuration.fixed };
    for (const [ability, value] of assignmentEntries) {
      totalAssignments[ability] = (totalAssignments[ability] ?? 0) + value;
    }

    if (configuration.maxScore !== undefined) {
      for (const [ability, increase] of Object.entries(totalAssignments)) {
        const nextValue = (availableScores[ability] ?? 0) + increase;
        if (nextValue > configuration.maxScore) {
          throw new Error(
            `Applying this ASI would raise ${ability.toUpperCase()} above the configured maximum of ${configuration.maxScore}.`
          );
        }
      }
    }

    const actorUpdates = Object.fromEntries(
      Object.entries(totalAssignments).map(([ability, increase]) => [
        `system.abilities.${ability}.value`,
        (availableScores[ability] ?? 0) + increase,
      ])
    );
    const actorRollback = Object.fromEntries(
      Object.entries(totalAssignments).map(([ability]) => [
        `system.abilities.${ability}.value`,
        availableScores[ability] ?? 0,
      ])
    );
    const classItemUpdates = buildSourceItemAdvancementValueUpdate({
      sourceItem: descriptor.sourceItem,
      descriptor,
      value: {
        type: 'asi',
        assignments: totalAssignments,
      },
    });
    const warnings: string[] = [];

    await actor.update(actorUpdates);
    try {
      await actor.updateEmbeddedDocuments('Item', [
        {
          _id: sourceItemId,
          'system.advancement': classItemUpdates,
        },
      ]);
    } catch (error) {
      try {
        await actor.update(actorRollback);
      } catch (rollbackError) {
        warnings.push(
          `Actor rollback failed after the class advancement update error: ${
            rollbackError instanceof Error ? rollbackError.message : 'Unknown rollback error'
          }`
        );
      }
      throw error instanceof Error && warnings.length > 0
        ? new Error(`${error.message} ${warnings.join(' ')}`)
        : error;
    }

    return {
      success: true,
      system: 'dnd5e',
      actorId: actor.id ?? '',
      actorName: actor.name ?? request.actorIdentifier,
      actorType: actor.type ?? 'unknown',
      targetLevel: request.targetLevel,
      stepId: descriptor.step.id,
      stepType: descriptor.step.type,
      stepTitle: descriptor.step.title,
      choice: {
        type: 'ability-score-improvement',
        mode: 'asi',
        assignments,
      },
      ...(classItem.id ? { classId: classItem.id } : {}),
      ...(classItem.name ? { className: classItem.name } : {}),
      ...(warnings.length > 0 ? { warnings } : {}),
    };
  }

  if (typeof actor.createEmbeddedDocuments !== 'function') {
    throw new Error(
      `Actor "${actor.name ?? request.actorIdentifier}" does not support createEmbeddedDocuments().`
    );
  }

  const featDocument = await resolveCompendiumUuidDocument(choice.featUuid);
  if (!featDocument?.toObject) {
    throw new Error(`Feat "${choice.featUuid}" could not be resolved from a compendium.`);
  }

  if (featDocument.type !== 'feat') {
    throw new Error(`Compendium document "${choice.featUuid}" is not a DnD5e feat.`);
  }

  const featDataRaw = featDocument.toObject();
  if (!featDataRaw || typeof featDataRaw !== 'object') {
    throw new Error(`Feat "${choice.featUuid}" did not provide valid item data.`);
  }

  const featData = { ...(featDataRaw as Record<string, unknown>) };
  delete featData._id;
  delete featData.folder;
  delete featData.sort;

  const createdItemsRaw = await actor.createEmbeddedDocuments('Item', [featData]);
  const createdItems = Array.isArray(createdItemsRaw)
    ? createdItemsRaw.filter((entry): entry is { id?: string; name?: string } =>
        Boolean(entry && typeof entry === 'object')
      )
    : [];
  const createdItemId = createdItems[0]?.id;
  if (!createdItemId) {
    throw new Error('The selected feat item was created without a stable ID.');
  }

  const classItemUpdates = buildSourceItemAdvancementValueUpdate({
    sourceItem: descriptor.sourceItem,
    descriptor,
    value: {
      type: 'feat',
      assignments: {},
      feat: {
        [createdItemId]: choice.featUuid,
      },
    },
  });
  const warnings: string[] = [];

  try {
    await actor.updateEmbeddedDocuments('Item', [
      {
        _id: sourceItemId,
        'system.advancement': classItemUpdates,
      },
    ]);
  } catch (error) {
    if (typeof actor.deleteEmbeddedDocuments === 'function') {
      try {
        await actor.deleteEmbeddedDocuments('Item', [createdItemId]);
      } catch (rollbackError) {
        warnings.push(
          `Feat item rollback failed after the class advancement update error: ${
            rollbackError instanceof Error ? rollbackError.message : 'Unknown rollback error'
          }`
        );
      }
    }

    throw error instanceof Error && warnings.length > 0
      ? new Error(`${error.message} ${warnings.join(' ')}`)
      : error;
  }

  return {
    success: true,
    system: 'dnd5e',
    actorId: actor.id ?? '',
    actorName: actor.name ?? request.actorIdentifier,
    actorType: actor.type ?? 'unknown',
    targetLevel: request.targetLevel,
    stepId: descriptor.step.id,
    stepType: descriptor.step.type,
    stepTitle: descriptor.step.title,
    choice: {
      type: 'ability-score-improvement',
      mode: 'feat',
      featUuid: choice.featUuid,
    },
    ...(classItem.id ? { classId: classItem.id } : {}),
    ...(classItem.name ? { className: classItem.name } : {}),
    createdItemIds: [createdItemId],
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}

async function applySubclassChoice(params: {
  actor: ActorProgressionActorLike;
  classItem: ActorProgressionItemLike;
  descriptor: AdvancementDescriptor;
  request: FoundryApplyCharacterAdvancementChoiceRequest;
}): Promise<FoundryApplyCharacterAdvancementChoiceResponse> {
  const { actor, classItem, descriptor, request } = params;
  const sourceItemId = descriptor.sourceItem.id;

  if (request.choice.type !== 'subclass') {
    throw new Error(`Unsupported DnD5e subclass choice type: ${request.choice.type}`);
  }

  if (typeof actor.updateEmbeddedDocuments !== 'function') {
    throw new Error(
      `Actor "${actor.name ?? request.actorIdentifier}" does not support updateEmbeddedDocuments().`
    );
  }

  if (!sourceItemId) {
    throw new Error(
      `Advancement step "${descriptor.step.id}" is not attached to a stable owned item.`
    );
  }

  const createdItems = await createItemsFromUuids({
    actor,
    itemUuids: [request.choice.subclassUuid],
  });
  const subclassItem = createdItems[0];
  const classItemUpdates = buildSubclassAdvancementValueUpdate({
    sourceItem: descriptor.sourceItem,
    descriptor,
    subclassItemId: subclassItem.id,
    subclassUuid: request.choice.subclassUuid,
  });
  const warnings: string[] = [];

  try {
    await actor.updateEmbeddedDocuments('Item', [
      {
        _id: sourceItemId,
        'system.advancement': classItemUpdates,
      },
    ]);
  } catch (error) {
    await rollbackCreatedItems(
      actor,
      createdItems.map(item => item.id),
      warnings
    );
    throw error instanceof Error && warnings.length > 0
      ? new Error(`${error.message} ${warnings.join(' ')}`)
      : error;
  }

  return {
    success: true,
    system: 'dnd5e',
    actorId: actor.id ?? '',
    actorName: actor.name ?? request.actorIdentifier,
    actorType: actor.type ?? 'unknown',
    targetLevel: request.targetLevel,
    stepId: descriptor.step.id,
    stepType: descriptor.step.type,
    stepTitle: descriptor.step.title,
    choice: {
      type: 'subclass',
      subclassUuid: request.choice.subclassUuid,
    },
    ...(classItem.id ? { classId: classItem.id } : {}),
    ...(classItem.name ? { className: classItem.name } : {}),
    createdItemIds: [subclassItem.id],
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}

async function applyHitPointsChoice(params: {
  actor: ActorProgressionActorLike;
  classItem: ActorProgressionItemLike;
  descriptor: AdvancementDescriptor;
  request: FoundryApplyCharacterAdvancementChoiceRequest;
}): Promise<FoundryApplyCharacterAdvancementChoiceResponse> {
  const { actor, classItem, descriptor, request } = params;
  const sourceItemId = descriptor.sourceItem.id;

  if (request.choice.type !== 'hit-points') {
    throw new Error(`Unsupported DnD5e hit point choice type: ${request.choice.type}`);
  }

  if (typeof actor.update !== 'function' || typeof actor.updateEmbeddedDocuments !== 'function') {
    throw new Error(
      `Actor "${actor.name ?? request.actorIdentifier}" does not support the updates required for hit point advancement.`
    );
  }

  if (!sourceItemId) {
    throw new Error(
      `Advancement step "${descriptor.step.id}" is not attached to a stable owned item.`
    );
  }

  const hitPointState = getHitPointState(actor);
  const conModifier = getConstitutionModifier(actor);
  const hitDieFaces = getClassHitDieFaces(classItem);
  const rolledHitPoints =
    request.choice.mode === 'roll'
      ? await evaluateRollTotal(`1d${hitDieFaces}`)
      : Math.floor(hitDieFaces / 2) + 1;

  const hpGain = rolledHitPoints + conModifier;
  const updatedCurrent = hitPointState.current + hpGain;
  const updatedMax = hitPointState.max + hpGain;

  const actorUpdates = {
    'system.attributes.hp.value': updatedCurrent,
    'system.attributes.hp.max': updatedMax,
  };
  const actorRollback = {
    'system.attributes.hp.value': hitPointState.current,
    'system.attributes.hp.max': hitPointState.max,
  };
  const classItemUpdates = buildHitPointsAdvancementValueUpdate({
    sourceItem: descriptor.sourceItem,
    descriptor,
    value: request.choice.mode === 'roll' ? rolledHitPoints : 'avg',
  });
  const warnings: string[] = [];

  await actor.update(actorUpdates);
  try {
    await actor.updateEmbeddedDocuments('Item', [
      {
        _id: sourceItemId,
        'system.advancement': classItemUpdates,
      },
    ]);
  } catch (error) {
    try {
      await actor.update(actorRollback);
    } catch (rollbackError) {
      warnings.push(
        `Actor rollback failed after the hit point advancement update error: ${
          rollbackError instanceof Error ? rollbackError.message : 'Unknown rollback error'
        }`
      );
    }
    throw error instanceof Error && warnings.length > 0
      ? new Error(`${error.message} ${warnings.join(' ')}`)
      : error;
  }

  return {
    success: true,
    system: 'dnd5e',
    actorId: actor.id ?? '',
    actorName: actor.name ?? request.actorIdentifier,
    actorType: actor.type ?? 'unknown',
    targetLevel: request.targetLevel,
    stepId: descriptor.step.id,
    stepType: descriptor.step.type,
    stepTitle: descriptor.step.title,
    choice: {
      type: 'hit-points',
      mode: request.choice.mode,
      rolledHitPoints: request.choice.mode === 'roll' ? rolledHitPoints : undefined,
      totalHitPointGain: hpGain,
      constitutionModifier: conModifier,
    },
    ...(classItem.id ? { classId: classItem.id } : {}),
    ...(classItem.name ? { className: classItem.name } : {}),
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}

async function applyItemChoice(params: {
  actor: ActorProgressionActorLike;
  classItem: ActorProgressionItemLike;
  descriptor: AdvancementDescriptor;
  request: FoundryApplyCharacterAdvancementChoiceRequest;
}): Promise<FoundryApplyCharacterAdvancementChoiceResponse> {
  const { actor, classItem, descriptor, request } = params;
  const sourceItemId = descriptor.sourceItem.id;

  if (request.choice.type !== 'item-choice') {
    throw new Error(`Unsupported DnD5e item-choice type: ${request.choice.type}`);
  }

  if (typeof actor.updateEmbeddedDocuments !== 'function') {
    throw new Error(
      `Actor "${actor.name ?? request.actorIdentifier}" does not support updateEmbeddedDocuments().`
    );
  }

  if (!sourceItemId) {
    throw new Error(
      `Advancement step "${descriptor.step.id}" is not attached to a stable owned item.`
    );
  }

  const choiceDetails = descriptor.step.choiceDetails;
  const chooseCount = choiceDetails?.chooseCount ?? 1;
  if (request.choice.itemUuids.length !== chooseCount) {
    throw new Error(
      `This item-choice step requires exactly ${chooseCount} item selection(s), but ${request.choice.itemUuids.length} were provided.`
    );
  }

  if (choiceDetails?.options && choiceDetails.options.length > 0) {
    const allowedUuids = new Set(
      choiceDetails.options
        .map(option => option.uuid)
        .filter((uuid): uuid is string => Boolean(uuid))
    );
    for (const itemUuid of request.choice.itemUuids) {
      if (!allowedUuids.has(itemUuid)) {
        throw new Error(`Item "${itemUuid}" is not a valid option for this advancement step.`);
      }
    }
  }

  if (request.choice.replaceItemId && request.choice.itemUuids.length !== 1) {
    throw new Error(
      'Replacement item-choice steps currently support one selected replacement item.'
    );
  }

  const createdItems = await createItemsFromUuids({
    actor,
    itemUuids: request.choice.itemUuids,
  });
  const warnings: string[] = [];

  let replacement:
    | {
        originalItemId: string;
        replacementItemId: string;
        level: number;
      }
    | undefined;

  if (request.choice.replaceItemId) {
    const priorLevel = findReplacementSourceLevel(descriptor, request.choice.replaceItemId);
    if (priorLevel === undefined) {
      await rollbackCreatedItems(
        actor,
        createdItems.map(item => item.id),
        warnings
      );
      throw new Error(
        `Replacement source item "${request.choice.replaceItemId}" was not found in prior advancement choices for this step.`
      );
    }

    replacement = {
      originalItemId: request.choice.replaceItemId,
      replacementItemId: createdItems[0].id,
      level: priorLevel,
    };
  }

  const classItemUpdates = buildItemChoiceAdvancementValueUpdate({
    sourceItem: descriptor.sourceItem,
    descriptor,
    createdItems,
    ...(replacement ? { replacement } : {}),
  });

  try {
    await actor.updateEmbeddedDocuments('Item', [
      {
        _id: sourceItemId,
        'system.advancement': classItemUpdates,
      },
    ]);
  } catch (error) {
    await rollbackCreatedItems(
      actor,
      createdItems.map(item => item.id),
      warnings
    );
    throw error instanceof Error && warnings.length > 0
      ? new Error(`${error.message} ${warnings.join(' ')}`)
      : error;
  }

  if (replacement && typeof actor.deleteEmbeddedDocuments === 'function') {
    try {
      await actor.deleteEmbeddedDocuments('Item', [replacement.originalItemId]);
    } catch (error) {
      warnings.push(
        `Replacement cleanup failed for item "${replacement.originalItemId}": ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  return {
    success: true,
    system: 'dnd5e',
    actorId: actor.id ?? '',
    actorName: actor.name ?? request.actorIdentifier,
    actorType: actor.type ?? 'unknown',
    targetLevel: request.targetLevel,
    stepId: descriptor.step.id,
    stepType: descriptor.step.type,
    stepTitle: descriptor.step.title,
    choice: {
      type: 'item-choice',
      itemUuids: request.choice.itemUuids,
      ...(request.choice.replaceItemId ? { replaceItemId: request.choice.replaceItemId } : {}),
      ...(request.choice.ability ? { ability: request.choice.ability } : {}),
    },
    ...(classItem.id ? { classId: classItem.id } : {}),
    ...(classItem.name ? { className: classItem.name } : {}),
    createdItemIds: createdItems.map(item => item.id),
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}

async function applyItemGrantChoice(params: {
  actor: ActorProgressionActorLike;
  classItem: ActorProgressionItemLike;
  descriptor: AdvancementDescriptor;
  request: FoundryApplyCharacterAdvancementChoiceRequest;
}): Promise<FoundryApplyCharacterAdvancementChoiceResponse> {
  const { actor, classItem, descriptor, request } = params;
  const sourceItemId = descriptor.sourceItem.id;

  if (request.choice.type !== 'item-grant') {
    throw new Error(`Unsupported DnD5e item-grant choice type: ${request.choice.type}`);
  }

  if (typeof actor.updateEmbeddedDocuments !== 'function') {
    throw new Error(
      `Actor "${actor.name ?? request.actorIdentifier}" does not support updateEmbeddedDocuments().`
    );
  }

  if (!sourceItemId) {
    throw new Error(
      `Advancement step "${descriptor.step.id}" is not attached to a stable owned item.`
    );
  }

  const selection = resolveItemGrantSelection({ descriptor, request });
  const createdItems =
    selection.selectedUuids.length > 0
      ? await createItemsFromUuids({
          actor,
          itemUuids: selection.selectedUuids,
        })
      : [];
  const warnings: string[] = [];

  const sourceItemUpdates = buildItemGrantAdvancementValueUpdate({
    sourceItem: descriptor.sourceItem,
    descriptor,
    createdItems,
    declined: selection.selectedUuids.length === 0,
    ...(selection.ability ? { ability: selection.ability } : {}),
  });

  try {
    await actor.updateEmbeddedDocuments('Item', [
      {
        _id: sourceItemId,
        'system.advancement': sourceItemUpdates,
      },
    ]);
  } catch (error) {
    await rollbackCreatedItems(
      actor,
      createdItems.map(item => item.id),
      warnings
    );
    throw error instanceof Error && warnings.length > 0
      ? new Error(`${error.message} ${warnings.join(' ')}`)
      : error;
  }

  return {
    success: true,
    system: 'dnd5e',
    actorId: actor.id ?? '',
    actorName: actor.name ?? request.actorIdentifier,
    actorType: actor.type ?? 'unknown',
    targetLevel: request.targetLevel,
    stepId: descriptor.step.id,
    stepType: descriptor.step.type,
    stepTitle: descriptor.step.title,
    choice: {
      type: 'item-grant',
      itemUuids: selection.selectedUuids,
      ...(selection.ability ? { ability: selection.ability } : {}),
    },
    ...(classItem.id ? { classId: classItem.id } : {}),
    ...(classItem.name ? { className: classItem.name } : {}),
    ...(createdItems.length > 0 ? { createdItemIds: createdItems.map(item => item.id) } : {}),
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}

export const dnd5eActorProgressionStrategy: ActorProgressionStrategy = {
  systemId: 'dnd5e',
  async previewCharacterProgression({
    actor,
    request,
  }): Promise<FoundryPreviewCharacterProgressionResponse> {
    if (actor.type !== 'character') {
      throw new Error(
        'UNSUPPORTED_CAPABILITY: DnD5e progression preview is only supported for character actors.'
      );
    }

    const { classItem, currentLevel, descriptors } = await getAdvancementContext({
      actor,
      ...(request.classIdentifier !== undefined
        ? { classIdentifier: request.classIdentifier }
        : {}),
      targetLevel: request.targetLevel,
    });
    const pendingSteps = descriptors.map(descriptor => descriptor.step);

    const warnings =
      pendingSteps.length > 0
        ? [
            'DnD5e class advancement is system-managed. Changing class levels alone would bypass one or more advancement steps.',
            'Use the pending step summary to gather required choices before attempting a fully automated DnD5e progression flow.',
          ]
        : undefined;

    return {
      system: 'dnd5e',
      actorId: actor.id ?? '',
      actorName: actor.name ?? request.actorIdentifier,
      actorType: actor.type ?? 'unknown',
      ...(classItem.id ? { classId: classItem.id } : {}),
      ...(classItem.name ? { className: classItem.name } : {}),
      currentLevel,
      targetLevel: request.targetLevel,
      safeToApplyDirectly: pendingSteps.length === 0,
      pendingSteps,
      ...(warnings ? { warnings } : {}),
    };
  },

  async getCharacterAdvancementOptions({
    actor,
    request,
  }): Promise<FoundryGetCharacterAdvancementOptionsResponse> {
    if (actor.type !== 'character') {
      throw new Error(
        'UNSUPPORTED_CAPABILITY: DnD5e advancement options are only supported for character actors.'
      );
    }

    const { classItem, descriptors } = await getAdvancementContext({
      actor,
      ...(request.classIdentifier !== undefined
        ? { classIdentifier: request.classIdentifier }
        : {}),
      targetLevel: request.targetLevel,
    });
    const descriptor = descriptors.find(candidate => candidate.step.id === request.stepId);
    if (!descriptor) {
      throw new Error(
        `Advancement step "${request.stepId}" was not found for this preview context.`
      );
    }

    const result = await getStepOptions({
      descriptor,
      ...(request.query !== undefined ? { query: request.query } : {}),
      ...(request.limit !== undefined ? { limit: request.limit } : {}),
    });

    return {
      system: 'dnd5e',
      actorId: actor.id ?? '',
      actorName: actor.name ?? request.actorIdentifier,
      actorType: actor.type ?? 'unknown',
      targetLevel: request.targetLevel,
      stepId: descriptor.step.id,
      stepType: descriptor.step.type,
      stepTitle: descriptor.step.title,
      ...(descriptor.step.choiceDetails ? { choiceDetails: descriptor.step.choiceDetails } : {}),
      options: result.options,
      totalOptions: result.totalOptions,
      ...(classItem.id ? { classId: classItem.id } : {}),
      ...(classItem.name ? { className: classItem.name } : {}),
      ...(result.totalOptions === 0
        ? { warnings: ['No concrete options were derived for this advancement step.'] }
        : {}),
    };
  },

  async applyCharacterAdvancementChoice({
    actor,
    request,
  }): Promise<FoundryApplyCharacterAdvancementChoiceResponse> {
    if (actor.type !== 'character') {
      throw new Error(
        'UNSUPPORTED_CAPABILITY: DnD5e advancement choice application is only supported for character actors.'
      );
    }

    const { classItem, descriptors } = await getAdvancementContext({
      actor,
      ...(request.classIdentifier !== undefined
        ? { classIdentifier: request.classIdentifier }
        : {}),
      targetLevel: request.targetLevel,
    });
    const descriptor = descriptors.find(candidate => candidate.step.id === request.stepId);
    if (!descriptor) {
      throw new Error(
        `Advancement step "${request.stepId}" was not found for this preview context.`
      );
    }

    const lowerType = descriptor.step.type.toLowerCase();
    if (lowerType.includes('abilityscore')) {
      return applyAbilityScoreImprovementChoice({
        actor,
        classItem,
        descriptor,
        request,
      });
    }

    if (lowerType === 'subclass') {
      return applySubclassChoice({
        actor,
        classItem,
        descriptor,
        request,
      });
    }

    if (lowerType === 'hitpoints') {
      return applyHitPointsChoice({
        actor,
        classItem,
        descriptor,
        request,
      });
    }

    if (lowerType === 'itemchoice') {
      return applyItemChoice({
        actor,
        classItem,
        descriptor,
        request,
      });
    }

    if (lowerType === 'itemgrant') {
      return applyItemGrantChoice({
        actor,
        classItem,
        descriptor,
        request,
      });
    }

    throw new Error(
      `UNSUPPORTED_CAPABILITY: Applying "${descriptor.step.type}" advancement choices is not implemented yet.`
    );
  },
};
