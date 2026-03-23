import type {
  FoundryCharacterBuildValidationIssue,
  FoundryOutstandingAdvancementStep,
  FoundryValidateCharacterBuildRequest,
  FoundryValidateCharacterBuildResponse,
} from '@maeinomatic/foundry-mcp-shared';
import {
  asRecord,
  getActorItems,
  toNumber,
  toStringValue,
  type ActorProgressionActorLike,
  type ActorProgressionItemLike,
} from './actor-progression-strategies/actor-progression-strategy-contract.js';

function toNumberField(value: unknown): number | undefined {
  const record = asRecord(value);
  if (record && 'value' in record) {
    return toNumber(record.value);
  }

  return toNumber(value);
}

function getItemAdvancements(item: ActorProgressionItemLike): Record<string, unknown>[] {
  const system = asRecord(item.system);
  return Array.isArray(system?.advancement)
    ? system.advancement.filter((entry): entry is Record<string, unknown> =>
        Boolean(entry && typeof entry === 'object')
      )
    : [];
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
  return (configuration && toStringValue(configuration.title)) ?? type;
}

function isOptionalAdvancement(advancement: Record<string, unknown>): boolean {
  if (advancement.optional === true) {
    return true;
  }

  const configuration = asRecord(advancement.configuration);
  return configuration?.optional === true;
}

function getLevelChoiceCount(
  advancement: Record<string, unknown>,
  level: number
): number | undefined {
  const configuration = asRecord(advancement.configuration);
  if (!configuration) {
    return undefined;
  }

  const choicesByLevel = asRecord(configuration.choices);
  const levelChoice = choicesByLevel ? asRecord(choicesByLevel[String(level)]) : undefined;
  return toNumber(levelChoice?.count);
}

function hasMeaningfulValue(value: Record<string, unknown>): boolean {
  for (const entry of Object.values(value)) {
    if (entry === undefined || entry === null) {
      continue;
    }

    if (typeof entry === 'string' && entry.length === 0) {
      continue;
    }

    if (Array.isArray(entry) && entry.length === 0) {
      continue;
    }

    if (typeof entry === 'object' && !Array.isArray(entry) && Object.keys(entry).length === 0) {
      continue;
    }

    return true;
  }

  return false;
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

function buildOutstandingAdvancements(
  actor: ActorProgressionActorLike,
  classItem: ActorProgressionItemLike,
  currentLevel: number
): FoundryOutstandingAdvancementStep[] {
  const sourceItems = collectAdvancementSourceItems(actor, classItem);
  const outstanding: FoundryOutstandingAdvancementStep[] = [];

  for (const sourceItem of sourceItems) {
    for (const [index, advancement] of getItemAdvancements(sourceItem).entries()) {
      const type = toStringValue(advancement.type) ?? 'Unknown';
      const lowerType = type.toLowerCase();
      const level = getAdvancementLevel(advancement);

      if (level === undefined || level > currentLevel) {
        continue;
      }

      if (lowerType === 'scalevalue' && !isOptionalAdvancement(advancement)) {
        continue;
      }

      if (isAdvancementCompletedForLevel(advancement, type, level)) {
        continue;
      }

      outstanding.push({
        id:
          toStringValue(advancement._id) ??
          toStringValue(advancement.id) ??
          `${sourceItem.id ?? sourceItem.name ?? 'item'}:${type}:${level}:${index}`,
        level,
        type,
        title: getAdvancementTitle(advancement, type),
        required: !isOptionalAdvancement(advancement),
        ...(sourceItem.id ? { sourceItemId: sourceItem.id } : {}),
        ...(sourceItem.name ? { sourceItemName: sourceItem.name } : {}),
        ...(sourceItem.type ? { sourceItemType: sourceItem.type } : {}),
      });
    }
  }

  return outstanding.sort((left, right) => {
    if (left.level !== right.level) {
      return left.level - right.level;
    }

    const leftSource = left.sourceItemName ?? left.sourceItemId ?? '';
    const rightSource = right.sourceItemName ?? right.sourceItemId ?? '';
    if (leftSource !== rightSource) {
      return leftSource.localeCompare(rightSource);
    }

    return left.title.localeCompare(right.title);
  });
}

function dedupeRecommendations(values: string[]): string[] {
  return Array.from(new Set(values.filter(value => value.trim().length > 0)));
}

export function validateDnD5eCharacterBuild(params: {
  actor: ActorProgressionActorLike;
  request: FoundryValidateCharacterBuildRequest;
}): FoundryValidateCharacterBuildResponse {
  const { actor, request } = params;
  if (actor.type !== 'character') {
    throw new Error(
      'UNSUPPORTED_CAPABILITY: DnD5e build validation is only supported for character actors.'
    );
  }

  const system = asRecord(actor.system);
  const items = getActorItems(actor);
  const classItems = items.filter(
    (item): item is ActorProgressionItemLike & { id: string; name: string } =>
      item.type === 'class' && typeof item.id === 'string' && typeof item.name === 'string'
  );
  const spellItems = items.filter(
    (item): item is ActorProgressionItemLike & { id: string; name: string } =>
      item.type === 'spell' && typeof item.id === 'string' && typeof item.name === 'string'
  );
  const issues: FoundryCharacterBuildValidationIssue[] = [];
  const recommendations: string[] = [];

  const duplicateClassNames = new Set<string>();
  const classNameCounts = new Map<string, number>();
  let totalClassLevels = 0;
  let invalidClassLevelCount = 0;

  for (const classItem of classItems) {
    const normalized = classItem.name.toLowerCase();
    classNameCounts.set(normalized, (classNameCounts.get(normalized) ?? 0) + 1);

    const classSystem = asRecord(classItem.system);
    const levels = toNumber(classSystem?.levels);
    if (levels === undefined || !Number.isInteger(levels) || levels < 1) {
      invalidClassLevelCount += 1;
      issues.push({
        severity: 'error',
        code: 'invalid-class-level',
        category: 'class-levels',
        classId: classItem.id,
        className: classItem.name,
        itemId: classItem.id,
        itemName: classItem.name,
        message: `Class "${classItem.name}" has an invalid level value "${String(classSystem?.levels ?? levels)}".`,
      });
      continue;
    }

    totalClassLevels += levels;
  }

  for (const [name, count] of classNameCounts.entries()) {
    if (count > 1) {
      duplicateClassNames.add(name);
    }
  }

  for (const duplicateName of duplicateClassNames) {
    const duplicateClasses = classItems.filter(item => item.name.toLowerCase() === duplicateName);
    issues.push({
      severity: 'warning',
      code: 'duplicate-class-items',
      category: 'class-levels',
      className: duplicateClasses[0]?.name,
      message: `Multiple class items named "${duplicateClasses[0]?.name ?? duplicateName}" were found on this character.`,
    });
  }

  if (classItems.length === 0) {
    issues.push({
      severity: 'error',
      code: 'no-class-items',
      category: 'class-levels',
      message: 'No DnD5e class items were found on this character.',
    });
    recommendations.push(
      'Add at least one DnD5e class item before using progression or spellbook workflows.'
    );
  }

  const actorLevel =
    toNumberField(system?.details && asRecord(system.details)?.level) ??
    toNumberField(system?.level);
  if (
    actorLevel !== undefined &&
    classItems.length > 0 &&
    invalidClassLevelCount === 0 &&
    actorLevel !== totalClassLevels
  ) {
    issues.push({
      severity: 'warning',
      code: 'actor-level-mismatch',
      category: 'class-levels',
      message: `The actor level field (${actorLevel}) does not match the sum of owned class levels (${totalClassLevels}).`,
    });
    recommendations.push(
      'Review owned DnD5e class item levels and actor level display fields so they stay in sync.'
    );
  }

  const spellcastingClasses = classItems
    .map(item => {
      const classSystem = asRecord(item.system);
      const spellcasting = asRecord(classSystem?.spellcasting);
      return {
        id: item.id,
        name: item.name,
        spellcastingType: toStringValue(spellcasting?.type),
        spellcastingProgression: toStringValue(spellcasting?.progression),
      };
    })
    .filter(
      item => item.spellcastingProgression !== undefined && item.spellcastingProgression !== 'none'
    );

  const spellcastingClassById = new Map(spellcastingClasses.map(item => [item.id, item]));
  const spellcastingClassByName = new Map(
    spellcastingClasses.map(item => [item.name.toLowerCase(), item])
  );
  const allClassesById = new Map(classItems.map(item => [item.id, item]));

  for (const spell of spellItems) {
    const spellSystem = asRecord(spell.system);
    const preparation = asRecord(spellSystem?.preparation);
    const sourceClass =
      toStringValue(spellSystem?.spellSource) ?? toStringValue(spellSystem?.sourceClass);
    const preparationMode =
      toStringValue(preparation?.mode) ??
      (typeof preparation?.prepared === 'boolean' ? 'prepared' : 'unknown');

    if (!sourceClass) {
      if (spellcastingClasses.length > 1 && preparationMode === 'prepared') {
        issues.push({
          severity: 'warning',
          code: 'missing-source-class',
          category: 'spellbook',
          itemId: spell.id,
          itemName: spell.name,
          message:
            'This prepared-mode spell has no assigned source class on a multiclass spellcaster.',
        });
      }
      continue;
    }

    const matchedSpellcastingClass =
      spellcastingClassById.get(sourceClass) ??
      spellcastingClassByName.get(sourceClass.toLowerCase());

    if (matchedSpellcastingClass) {
      if (
        preparationMode === 'prepared' &&
        matchedSpellcastingClass.spellcastingType !== undefined &&
        matchedSpellcastingClass.spellcastingType !== 'prepared'
      ) {
        issues.push({
          severity: 'warning',
          code: 'preparation-mode-mismatch',
          category: 'spellbook',
          itemId: spell.id,
          itemName: spell.name,
          classId: matchedSpellcastingClass.id,
          className: matchedSpellcastingClass.name,
          message: `This spell is marked as prepared, but its source class "${matchedSpellcastingClass.name}" uses spellcasting type "${matchedSpellcastingClass.spellcastingType}".`,
        });
      }
      continue;
    }

    const matchedNonSpellcastingClass =
      allClassesById.get(sourceClass) ??
      classItems.find(item => item.name.toLowerCase() === sourceClass.toLowerCase());

    if (matchedNonSpellcastingClass) {
      issues.push({
        severity: 'warning',
        code: 'non-spellcasting-source-class',
        category: 'spellbook',
        itemId: spell.id,
        itemName: spell.name,
        classId: matchedNonSpellcastingClass.id,
        className: matchedNonSpellcastingClass.name,
        message: `This spell references class "${matchedNonSpellcastingClass.name}", which is not configured as a spellcasting class item.`,
      });
      continue;
    }

    issues.push({
      severity: 'warning',
      code: 'unknown-source-class',
      category: 'spellbook',
      itemId: spell.id,
      itemName: spell.name,
      message: `This spell references an unknown source class "${sourceClass}".`,
    });
  }

  if (spellItems.length > 0 && spellcastingClasses.length === 0) {
    issues.push({
      severity: 'warning',
      code: 'no-spellcasting-class',
      category: 'spellbook',
      message: 'This actor has owned spells but no spellcasting class items were detected.',
    });
  }

  const skills = asRecord(system?.skills);
  for (const [skillKey, skillValue] of Object.entries(skills ?? {})) {
    const proficiency = toNumber(asRecord(skillValue)?.value);
    if (proficiency !== undefined && ![0, 0.5, 1, 2].includes(proficiency)) {
      issues.push({
        severity: 'error',
        code: 'invalid-skill-proficiency',
        category: 'proficiencies',
        itemName: skillKey,
        message: `Skill "${skillKey}" has invalid DnD5e proficiency value "${proficiency}".`,
      });
    }
  }

  const tools = asRecord(system?.tools);
  for (const [toolKey, toolValue] of Object.entries(tools ?? {})) {
    const proficiency = toNumber(asRecord(toolValue)?.value);
    if (proficiency !== undefined && ![0, 0.5, 1, 2].includes(proficiency)) {
      issues.push({
        severity: 'error',
        code: 'invalid-tool-proficiency',
        category: 'proficiencies',
        itemName: toolKey,
        message: `Tool "${toolKey}" has invalid DnD5e proficiency value "${proficiency}".`,
      });
    }
  }

  const abilities = asRecord(system?.abilities);
  for (const [abilityKey, abilityValue] of Object.entries(abilities ?? {})) {
    const proficient = toNumber(asRecord(abilityValue)?.proficient);
    if (proficient !== undefined && ![0, 1].includes(proficient)) {
      issues.push({
        severity: 'error',
        code: 'invalid-saving-throw-proficiency',
        category: 'proficiencies',
        itemName: abilityKey,
        message: `Saving throw proficiency for "${abilityKey}" must be 0 or 1, but found "${proficient}".`,
      });
    }
  }

  const outstandingAdvancements = classItems.flatMap(classItem => {
    const classSystem = asRecord(classItem.system);
    const levels = toNumber(classSystem?.levels);
    return levels !== undefined && levels > 0
      ? buildOutstandingAdvancements(actor, classItem, levels).map(step => ({
          ...step,
          ...(classItem.id ? { classId: classItem.id } : {}),
          ...(classItem.name ? { className: classItem.name } : {}),
        }))
      : [];
  });

  for (const step of outstandingAdvancements) {
    issues.push({
      severity: step.required ? 'error' : 'info',
      code: 'outstanding-advancement',
      category: 'advancement',
      stepId: step.id,
      stepType: step.type,
      ...(typeof step.classId === 'string' ? { classId: step.classId } : {}),
      ...(typeof step.className === 'string' ? { className: step.className } : {}),
      ...(step.sourceItemId ? { sourceItemId: step.sourceItemId } : {}),
      ...(step.sourceItemName ? { sourceItemName: step.sourceItemName } : {}),
      message: `${step.required ? 'Required' : 'Optional'} advancement "${step.title}" at level ${step.level} is still unresolved.`,
    });
  }

  if (issues.some(issue => issue.code === 'missing-source-class')) {
    recommendations.push(
      'Use reassign-dnd5e-spell-source-class or bulk-reassign-dnd5e-spell-source-class to organize multiclass spell ownership.'
    );
  }
  if (
    issues.some(
      issue =>
        issue.code === 'unknown-source-class' || issue.code === 'non-spellcasting-source-class'
    )
  ) {
    recommendations.push(
      'Review spell source-class assignments so each owned spell points to a current spellcasting class item.'
    );
  }
  if (issues.some(issue => issue.code === 'preparation-mode-mismatch')) {
    recommendations.push(
      'Check whether each spell preparation mode still matches the spellcasting type of its assigned class.'
    );
  }
  if (issues.some(issue => issue.code === 'outstanding-advancement')) {
    recommendations.push(
      'Use preview-character-progression, get-character-advancement-options, apply-character-advancement-choice, and update-character-progression to finish unresolved DnD5e advancement steps.'
    );
  }
  if (
    issues.some(
      issue =>
        issue.code === 'invalid-skill-proficiency' ||
        issue.code === 'invalid-tool-proficiency' ||
        issue.code === 'invalid-saving-throw-proficiency'
    )
  ) {
    recommendations.push(
      'Use the typed proficiency update tools to restore DnD5e proficiency values to their supported ranges.'
    );
  }

  const errorCount = issues.filter(issue => issue.severity === 'error').length;
  const warningCount = issues.filter(issue => issue.severity === 'warning').length;
  const infoCount = issues.filter(issue => issue.severity === 'info').length;

  return {
    system: 'dnd5e',
    actorId: actor.id ?? '',
    actorName: actor.name ?? request.actorIdentifier,
    actorType: actor.type ?? 'unknown',
    summary: {
      classCount: classItems.length,
      spellCount: spellItems.length,
      spellcastingClassCount: spellcastingClasses.length,
      totalClassLevels,
      ...(actorLevel !== undefined ? { actorLevel } : {}),
      outstandingAdvancementCount: outstandingAdvancements.length,
      issueCount: issues.length,
      errorCount,
      warningCount,
      infoCount,
    },
    issues,
    ...(outstandingAdvancements.length > 0 ? { outstandingAdvancements } : {}),
    ...(recommendations.length > 0
      ? { recommendations: dedupeRecommendations(recommendations) }
      : {}),
  };
}
