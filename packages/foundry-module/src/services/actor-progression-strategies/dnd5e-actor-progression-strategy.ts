import type {
  FoundryPreviewCharacterProgressionResponse,
  FoundryProgressionPreviewStep,
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

function buildPendingSteps(params: {
  classItem: ActorProgressionItemLike;
  currentLevel: number;
  targetLevel: number;
}): FoundryProgressionPreviewStep[] {
  const { classItem, currentLevel, targetLevel } = params;
  const system = asRecord(classItem.system);
  const advancements = Array.isArray(system?.advancement)
    ? system.advancement.filter((entry): entry is Record<string, unknown> =>
        Boolean(entry && typeof entry === 'object')
      )
    : [];

  const pendingSteps: FoundryProgressionPreviewStep[] = [];

  advancements.forEach((advancement, index) => {
    const type = toStringValue(advancement.type) ?? 'Unknown';
    const level = getAdvancementLevel(advancement);
    if (level === undefined || level <= currentLevel || level > targetLevel) {
      return;
    }

    const optional = isOptionalAdvancement(advancement);
    pendingSteps.push({
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
    });
  });

  return pendingSteps.sort((left, right) => left.level - right.level);
}

export const dnd5eActorProgressionStrategy: ActorProgressionStrategy = {
  systemId: 'dnd5e',
  previewCharacterProgression({ actor, request }): FoundryPreviewCharacterProgressionResponse {
    if (actor.type !== 'character') {
      throw new Error(
        'UNSUPPORTED_CAPABILITY: DnD5e progression preview is only supported for character actors.'
      );
    }

    const classItem = getClassItem(actor, request.classIdentifier);
    const classSystem = asRecord(classItem.system);
    const currentLevel = toNumber(classSystem?.levels) ?? 0;
    const pendingSteps = buildPendingSteps({
      classItem,
      currentLevel,
      targetLevel: request.targetLevel,
    });

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
};
