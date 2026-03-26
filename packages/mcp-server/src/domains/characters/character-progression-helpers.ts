import type {
  FoundryApplyCharacterAdvancementChoiceRequest,
  FoundryApplyCharacterAdvancementChoiceResponse,
  FoundryProgressionPreviewStep,
  FoundryValidateCharacterBuildResponse,
  UnknownRecord,
} from '../../foundry-types.js';

import type {
  AdvancementSelectionInput,
  CompleteDnD5eLevelUpWorkflowArgs,
} from './character-progression-service.js';

export type AppliedAdvancementStep = {
  stepId: string;
  stepType: string;
  stepTitle: string;
  choice: FoundryApplyCharacterAdvancementChoiceResponse['choice'];
  appliedBy: 'selection' | 'auto-safe';
  createdItemIds?: string[];
};

export function buildAutoAdvancementChoice(
  step: FoundryProgressionPreviewStep
): FoundryApplyCharacterAdvancementChoiceRequest['choice'] | null {
  const lowerType = step.type.toLowerCase();
  const choiceDetails = step.choiceDetails;

  if (lowerType === 'itemgrant') {
    const defaultOptionUuids =
      choiceDetails?.options
        ?.filter(option => {
          const optionRecord = option as Record<string, unknown>;
          return optionRecord.selectedByDefault === true && typeof option.uuid === 'string';
        })
        .map(option => option.uuid as string) ?? [];

    return {
      type: 'item-grant',
      ...(defaultOptionUuids.length > 0 ? { itemUuids: defaultOptionUuids } : {}),
      ...(choiceDetails?.abilityOptions?.length === 1
        ? { ability: choiceDetails.abilityOptions[0] }
        : {}),
    };
  }

  if (lowerType === 'size') {
    const sizeOption = choiceDetails?.options?.[0];
    if (!sizeOption) {
      return null;
    }

    return {
      type: 'size',
      size: sizeOption.id,
    };
  }

  return null;
}

export function findMatchingAdvancementSelection(
  pendingSteps: FoundryProgressionPreviewStep[],
  selections: AdvancementSelectionInput[]
):
  | {
      kind: 'match';
      selectionIndex: number;
      selection: AdvancementSelectionInput;
      step: FoundryProgressionPreviewStep;
    }
  | {
      kind: 'ambiguous';
      selectionIndex: number;
      selection: AdvancementSelectionInput;
    }
  | null {
  for (const [selectionIndex, selection] of selections.entries()) {
    if (selection.stepId !== undefined) {
      const step = pendingSteps.find(candidate => candidate.id === selection.stepId);
      if (step) {
        return { kind: 'match', selectionIndex, selection, step };
      }
      continue;
    }

    const candidates = pendingSteps.filter(candidate => matchesSelection(candidate, selection));

    if (candidates.length === 1) {
      return {
        kind: 'match',
        selectionIndex,
        selection,
        step: candidates[0],
      };
    }

    if (candidates.length > 1) {
      return {
        kind: 'ambiguous',
        selectionIndex,
        selection,
      };
    }
  }

  return null;
}

export function findUnmatchedAdvancementSelections(
  pendingSteps: FoundryProgressionPreviewStep[],
  selections: AdvancementSelectionInput[]
): AdvancementSelectionInput[] {
  return selections.filter(selection => {
    if (selection.stepId !== undefined) {
      return !pendingSteps.some(candidate => candidate.id === selection.stepId);
    }

    return !pendingSteps.some(candidate => matchesSelection(candidate, selection));
  });
}

function matchesSelection(
  step: FoundryProgressionPreviewStep,
  selection: AdvancementSelectionInput
): boolean {
  if (
    selection.stepType !== undefined &&
    step.type.toLowerCase() !== selection.stepType.toLowerCase()
  ) {
    return false;
  }

  if (selection.sourceItemId !== undefined && step.sourceItemId !== selection.sourceItemId) {
    return false;
  }

  if (
    selection.sourceItemName !== undefined &&
    step.sourceItemName?.toLowerCase() !== selection.sourceItemName.toLowerCase()
  ) {
    return false;
  }

  return (
    selection.stepType !== undefined ||
    selection.sourceItemId !== undefined ||
    selection.sourceItemName !== undefined
  );
}

export function mergeWarnings(...warningSets: Array<string[] | undefined>): string[] {
  return Array.from(
    new Set(
      warningSets.flatMap(warnings => warnings ?? []).filter(warning => warning.trim().length > 0)
    )
  );
}

export function createDnD5eWorkflowMetadata(name: string): UnknownRecord {
  return {
    workflow: {
      name,
      system: 'dnd5e',
    },
  };
}

export function createCharacterBuildVerification(
  validation: FoundryValidateCharacterBuildResponse
): UnknownRecord {
  return {
    summary: validation.summary,
    issues: validation.issues,
    ...(validation.outstandingAdvancements
      ? { outstandingAdvancements: validation.outstandingAdvancements }
      : {}),
    ...(validation.recommendations ? { recommendations: validation.recommendations } : {}),
    verified:
      validation.summary.errorCount === 0 && validation.summary.outstandingAdvancementCount === 0,
  };
}

export async function collectPendingAdvancementOptions(params: {
  pendingSteps: FoundryProgressionPreviewStep[];
  parsed: CompleteDnD5eLevelUpWorkflowArgs;
  getOptions: (
    step: FoundryProgressionPreviewStep,
    parsed: CompleteDnD5eLevelUpWorkflowArgs
  ) => Promise<{
    stepId: string;
    stepType: string;
    stepTitle: string;
    choiceDetails?: UnknownRecord;
    options: unknown[];
    totalOptions: number;
    warnings?: string[];
  }>;
}): Promise<UnknownRecord[]> {
  const results: UnknownRecord[] = [];

  for (const step of params.pendingSteps) {
    if (step.choiceDetails?.options && step.choiceDetails.options.length > 0) {
      results.push({
        stepId: step.id,
        stepType: step.type,
        stepTitle: step.title,
        level: step.level,
        choiceDetails: step.choiceDetails,
        options: step.choiceDetails.options,
        totalOptions: step.choiceDetails.options.length,
        ...(step.sourceItemId ? { sourceItemId: step.sourceItemId } : {}),
        ...(step.sourceItemName ? { sourceItemName: step.sourceItemName } : {}),
        ...(step.sourceItemType ? { sourceItemType: step.sourceItemType } : {}),
      });
      continue;
    }

    try {
      const response = await params.getOptions(step, params.parsed);
      results.push({
        stepId: response.stepId,
        stepType: response.stepType,
        stepTitle: response.stepTitle,
        level: step.level,
        choiceDetails: response.choiceDetails ?? step.choiceDetails,
        options: response.options,
        totalOptions: response.totalOptions,
        ...(step.sourceItemId ? { sourceItemId: step.sourceItemId } : {}),
        ...(step.sourceItemName ? { sourceItemName: step.sourceItemName } : {}),
        ...(step.sourceItemType ? { sourceItemType: step.sourceItemType } : {}),
        ...(response.warnings ? { warnings: response.warnings } : {}),
      });
    } catch (error) {
      results.push({
        stepId: step.id,
        stepType: step.type,
        stepTitle: step.title,
        level: step.level,
        choiceDetails: step.choiceDetails,
        options: [],
        totalOptions: 0,
        ...(step.sourceItemId ? { sourceItemId: step.sourceItemId } : {}),
        ...(step.sourceItemName ? { sourceItemName: step.sourceItemName } : {}),
        ...(step.sourceItemType ? { sourceItemType: step.sourceItemType } : {}),
        warnings: [
          `Failed to derive concrete options for this advancement step: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`,
        ],
      });
    }
  }

  return results;
}
