import type {
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
}

interface AdvancementDescriptor {
  advancement: Record<string, unknown>;
  step: FoundryProgressionPreviewStep;
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
  if (optional) {
    return true;
  }

  const lowerType = type.toLowerCase();
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
    const options = await getConfiguredPoolOptions(advancement);
    return {
      kind: 'grant-items',
      optionQuerySupported: true,
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
  classItem: ActorProgressionItemLike;
  currentLevel: number;
  targetLevel: number;
}): Promise<AdvancementDescriptor[]> {
  const { classItem, currentLevel, targetLevel } = params;
  const system = asRecord(classItem.system);
  const advancements = Array.isArray(system?.advancement)
    ? system.advancement.filter((entry): entry is Record<string, unknown> =>
        Boolean(entry && typeof entry === 'object')
      )
    : [];

  const descriptors: AdvancementDescriptor[] = [];

  for (const [index, advancement] of advancements.entries()) {
    const type = toStringValue(advancement.type) ?? 'Unknown';
    const level = getAdvancementLevel(advancement);
    if (level === undefined || level <= currentLevel || level > targetLevel) {
      continue;
    }

    const optional = isOptionalAdvancement(advancement);
    const choiceDetails = await getChoiceDetails(advancement, type);
    descriptors.push({
      advancement,
      step: {
        id:
          toStringValue(advancement._id) ??
          toStringValue(advancement.id) ??
          `${classItem.id ?? 'class'}:${type}:${level}:${index}`,
        level,
        type,
        title: getAdvancementTitle(advancement, type),
        required: !optional,
        choicesRequired: requiresChoices(type, advancement, optional),
        autoApplySafe: false,
        hints: buildHints(type, optional),
        ...(choiceDetails ? { choiceDetails } : {}),
      },
    });
  }

  return descriptors.sort((left, right) => left.step.level - right.step.level);
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
  const descriptors = await buildAdvancementDescriptors({
    classItem,
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
};
