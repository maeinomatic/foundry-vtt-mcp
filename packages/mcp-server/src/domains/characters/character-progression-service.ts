import { FoundryClient } from '../../foundry-client.js';
import { Logger } from '../../logger.js';
import type {
  FoundryApplyCharacterAdvancementChoiceRequest,
  FoundryApplyCharacterAdvancementChoiceResponse,
  FoundryGetCharacterAdvancementOptionsRequest,
  FoundryGetCharacterAdvancementOptionsResponse,
  FoundryPreviewCharacterProgressionRequest,
  FoundryPreviewCharacterProgressionResponse,
  FoundryProgressionPreviewStep,
  FoundryUpdateActorEmbeddedItemResponse,
  FoundryUpdateActorResponse,
  FoundryValidateCharacterBuildRequest,
  FoundryValidateCharacterBuildResponse,
  UnknownRecord,
} from '../../foundry-types.js';
import type {
  CharacterProgressionUpdateRequest,
  PreparedCharacterProgressionUpdate,
} from '../../systems/types.js';
import type { GameSystem } from '../../utils/system-detection.js';
import {
  buildAutoAdvancementChoice,
  collectPendingAdvancementOptions,
  createCharacterBuildVerification,
  createDnD5eWorkflowMetadata,
  findMatchingAdvancementSelection,
  findUnmatchedAdvancementSelections,
  mergeWarnings,
  type AppliedAdvancementStep,
} from './character-progression-helpers.js';

export type AdvancementChoiceInput = FoundryApplyCharacterAdvancementChoiceRequest['choice'];

export interface AdvancementSelectionInput {
  stepId?: string;
  stepType?: string;
  sourceItemId?: string;
  sourceItemName?: string;
  choice: AdvancementChoiceInput;
}

type CharacterData = UnknownRecord & {
  id: string;
  name: string;
  type: string;
};

export interface ProgressionArgs {
  characterIdentifier: string;
  targetLevel?: number;
  classIdentifier?: string;
  experiencePoints?: number;
  experienceSpent?: number;
  advancementSelections?: AdvancementSelectionInput[];
}

export interface CompleteDnD5eLevelUpWorkflowArgs extends ProgressionArgs {
  targetLevel: number;
  optionQuery?: string;
  optionLimit: number;
}

export interface AdvancementOptionsArgs {
  characterIdentifier: string;
  targetLevel: number;
  stepId: string;
  classIdentifier?: string;
  query?: string;
  limit?: number;
}

export interface ApplyAdvancementChoiceArgs {
  characterIdentifier: string;
  targetLevel: number;
  stepId: string;
  classIdentifier?: string;
  choice: AdvancementChoiceInput;
}

export interface CharacterProgressionServiceOptions {
  foundryClient: FoundryClient;
  logger: Logger;
  getGameSystem: () => Promise<GameSystem>;
  getCharacterData: (identifier: string) => Promise<CharacterData>;
  prepareProgressionUpdate: (
    characterData: CharacterData,
    request: CharacterProgressionUpdateRequest
  ) => Promise<PreparedCharacterProgressionUpdate>;
  applyProgressionUpdate: (
    characterIdentifier: string,
    prepared: PreparedCharacterProgressionUpdate
  ) => Promise<FoundryUpdateActorResponse | FoundryUpdateActorEmbeddedItemResponse>;
}

export class CharacterProgressionService {
  private foundryClient: FoundryClient;
  private logger: Logger;
  private getGameSystem: () => Promise<GameSystem>;
  private getCharacterData: (identifier: string) => Promise<CharacterData>;
  private prepareProgressionUpdate: (
    characterData: CharacterData,
    request: CharacterProgressionUpdateRequest
  ) => Promise<PreparedCharacterProgressionUpdate>;
  private applyProgressionUpdate: (
    characterIdentifier: string,
    prepared: PreparedCharacterProgressionUpdate
  ) => Promise<FoundryUpdateActorResponse | FoundryUpdateActorEmbeddedItemResponse>;

  constructor(options: CharacterProgressionServiceOptions) {
    this.foundryClient = options.foundryClient;
    this.logger = options.logger.child({ component: 'CharacterProgressionService' });
    this.getGameSystem = options.getGameSystem;
    this.getCharacterData = options.getCharacterData;
    this.prepareProgressionUpdate = options.prepareProgressionUpdate;
    this.applyProgressionUpdate = options.applyProgressionUpdate;
  }

  async handlePreviewCharacterProgression(parsed: ProgressionArgs): Promise<UnknownRecord> {
    const previewResult = await this.buildProgressionPreviewResult(parsed);

    return {
      success: true,
      safeToApplyDirectly: previewResult.preview?.safeToApplyDirectly ?? true,
      character: previewResult.character,
      progression: previewResult.prepared.summary,
      target: previewResult.prepared.target,
      proposedUpdates: previewResult.prepared.updates,
      pendingAdvancements: previewResult.preview?.pendingSteps ?? [],
      ...(previewResult.warnings.length > 0 ? { warnings: previewResult.warnings } : {}),
    };
  }

  async handleGetCharacterAdvancementOptions(parsed: AdvancementOptionsArgs): Promise<UnknownRecord> {
    const request: FoundryGetCharacterAdvancementOptionsRequest = {
      actorIdentifier: parsed.characterIdentifier,
      targetLevel: parsed.targetLevel,
      stepId: parsed.stepId,
      ...(parsed.classIdentifier !== undefined ? { classIdentifier: parsed.classIdentifier } : {}),
      ...(parsed.query !== undefined ? { query: parsed.query } : {}),
      ...(parsed.limit !== undefined ? { limit: parsed.limit } : {}),
    };

    const result = await this.foundryClient.query<FoundryGetCharacterAdvancementOptionsResponse>(
      'maeinomatic-foundry-mcp.getCharacterAdvancementOptions',
      request
    );

    return {
      success: true,
      character: {
        id: result.actorId,
        name: result.actorName,
        type: result.actorType,
      },
      step: {
        id: result.stepId,
        type: result.stepType,
        title: result.stepTitle,
        ...(result.choiceDetails ? { choiceDetails: result.choiceDetails } : {}),
      },
      options: result.options,
      totalOptions: result.totalOptions,
      ...(result.classId ? { classId: result.classId } : {}),
      ...(result.className ? { className: result.className } : {}),
      ...(result.warnings ? { warnings: result.warnings } : {}),
    };
  }

  async handleApplyCharacterAdvancementChoice(
    parsed: ApplyAdvancementChoiceArgs
  ): Promise<UnknownRecord> {
    const request: FoundryApplyCharacterAdvancementChoiceRequest = {
      actorIdentifier: parsed.characterIdentifier,
      targetLevel: parsed.targetLevel,
      stepId: parsed.stepId,
      ...(parsed.classIdentifier !== undefined ? { classIdentifier: parsed.classIdentifier } : {}),
      choice: parsed.choice,
    };

    const result = await this.foundryClient.query<FoundryApplyCharacterAdvancementChoiceResponse>(
      'maeinomatic-foundry-mcp.applyCharacterAdvancementChoice',
      request
    );

    let preview: FoundryPreviewCharacterProgressionResponse | null = null;
    try {
      preview = await this.previewCharacterProgression({
        actorIdentifier: parsed.characterIdentifier,
        targetLevel: parsed.targetLevel,
        ...(parsed.classIdentifier !== undefined ? { classIdentifier: parsed.classIdentifier } : {}),
      });
    } catch (error) {
      this.logger.warn('Failed to refresh character progression preview after applying choice', {
        error,
      });
    }

    const warnings = mergeWarnings(result.warnings, preview?.warnings);

    return {
      success: result.success,
      character: {
        id: result.actorId,
        name: result.actorName,
        type: result.actorType,
      },
      step: {
        id: result.stepId,
        type: result.stepType,
        title: result.stepTitle,
      },
      choice: result.choice,
      ...(result.classId ? { classId: result.classId } : {}),
      ...(result.className ? { className: result.className } : {}),
      ...(result.createdItemIds ? { createdItemIds: result.createdItemIds } : {}),
      ...(preview
        ? {
            safeToApplyDirectly: preview.safeToApplyDirectly,
            remainingPendingAdvancements: preview.pendingSteps,
            nextStep: preview.safeToApplyDirectly
              ? 'Run update-character-progression to finalize the class level change.'
              : 'Continue applying the remaining advancement choices before finalizing the level change.',
          }
        : {}),
      ...(warnings.length > 0 ? { warnings } : {}),
    };
  }

  async handleUpdateCharacterProgression(parsed: ProgressionArgs): Promise<UnknownRecord> {
    let previewResult = await this.buildProgressionPreviewResult(parsed);
    const autoAppliedAdvancements =
      previewResult.preview && parsed.targetLevel !== undefined
        ? await this.autoApplySafeAdvancements(parsed, previewResult.preview)
        : [];

    if (autoAppliedAdvancements.length > 0) {
      previewResult = await this.buildProgressionPreviewResult(parsed);
    }

    if (previewResult.preview && !previewResult.preview.safeToApplyDirectly) {
      return {
        success: false,
        requiresChoices: true,
        character: previewResult.character,
        progression: previewResult.prepared.summary,
        pendingAdvancements: previewResult.preview.pendingSteps,
        ...(autoAppliedAdvancements.length > 0 ? { autoAppliedAdvancements } : {}),
        nextStep:
          'Review the pending DnD5e advancement steps and complete the required choices through a dedicated advancement flow before applying the level change.',
        ...(previewResult.warnings.length > 0 ? { warnings: previewResult.warnings } : {}),
      };
    }

    const result = await this.applyProgressionUpdate(parsed.characterIdentifier, previewResult.prepared);

    return {
      success: result.success,
      character:
        'actorType' in result
          ? {
              id: result.actorId,
              name: result.actorName,
              type: result.actorType,
            }
          : {
              id: result.actorId,
              name: result.actorName,
            },
      progression: previewResult.prepared.summary,
      appliedUpdates: result.appliedUpdates,
      updatedFields: result.updatedFields,
      ...(autoAppliedAdvancements.length > 0 ? { autoAppliedAdvancements } : {}),
      ...(previewResult.warnings.length > 0 ? { warnings: previewResult.warnings } : {}),
      ...(previewResult.preview && previewResult.preview.pendingSteps.length > 0
        ? { pendingAdvancements: previewResult.preview.pendingSteps }
        : {}),
    };
  }

  async handleCompleteDnD5eLevelUpWorkflow(
    parsed: CompleteDnD5eLevelUpWorkflowArgs
  ): Promise<UnknownRecord> {
    const gameSystem = await this.getGameSystem();
    if (gameSystem !== 'dnd5e') {
      throw new Error(
        'UNSUPPORTED_CAPABILITY: complete-dnd5e-level-up-workflow is only available when the active system is dnd5e.'
      );
    }

    const workflowMetadata = createDnD5eWorkflowMetadata('complete-dnd5e-level-up-workflow');
    let previewResult = await this.buildProgressionPreviewResult(parsed);
    let appliedAdvancements: AppliedAdvancementStep[] = [];

    try {
      appliedAdvancements =
        previewResult.preview && parsed.targetLevel !== undefined
          ? await this.autoApplySafeAdvancements(parsed, previewResult.preview)
          : [];
    } catch (error) {
      this.logger.warn('DnD5e level-up workflow stopped on an invalid advancement selection', {
        error,
        actorIdentifier: parsed.characterIdentifier,
        classIdentifier: parsed.classIdentifier,
        targetLevel: parsed.targetLevel,
      });

      previewResult = await this.buildProgressionPreviewResult(parsed);
      const pendingStepOptions =
        previewResult.preview && previewResult.preview.pendingSteps.length > 0
          ? await this.collectPendingAdvancementOptions(previewResult.preview.pendingSteps, parsed)
          : [];

      return {
        ...workflowMetadata,
        success: false,
        workflowStatus: 'invalid-selection',
        requiresChoices: true,
        character: previewResult.character,
        progression: previewResult.prepared.summary,
        message: error instanceof Error ? error.message : 'Invalid advancement selection.',
        ...(previewResult.preview ? { pendingAdvancements: previewResult.preview.pendingSteps } : {}),
        ...(pendingStepOptions.length > 0 ? { pendingAdvancementOptions: pendingStepOptions } : {}),
        ...(appliedAdvancements.length > 0 ? { appliedAdvancements } : {}),
        ...(appliedAdvancements.some(step => step.appliedBy === 'auto-safe')
          ? {
              autoApplied: {
                advancements: appliedAdvancements.filter(step => step.appliedBy === 'auto-safe'),
              },
            }
          : {}),
        unresolved: {
          kind: 'advancement',
          requiresChoices: true,
          ...(previewResult.preview ? { pendingAdvancements: previewResult.preview.pendingSteps } : {}),
          ...(pendingStepOptions.length > 0 ? { pendingAdvancementOptions: pendingStepOptions } : {}),
        },
        nextStep:
          'Correct the invalid advancement selection, then rerun complete-dnd5e-level-up-workflow with the remaining required choices.',
        ...(previewResult.warnings.length > 0 ? { warnings: previewResult.warnings } : {}),
      };
    }

    if (appliedAdvancements.length > 0) {
      previewResult = await this.buildProgressionPreviewResult(parsed);
    }

    if (previewResult.preview && !previewResult.preview.safeToApplyDirectly) {
      const pendingStepOptions = await this.collectPendingAdvancementOptions(
        previewResult.preview.pendingSteps,
        parsed
      );

      return {
        ...workflowMetadata,
        success: false,
        workflowStatus: 'needs-choices',
        requiresChoices: true,
        character: previewResult.character,
        progression: previewResult.prepared.summary,
        pendingAdvancements: previewResult.preview.pendingSteps,
        ...(pendingStepOptions.length > 0 ? { pendingAdvancementOptions: pendingStepOptions } : {}),
        ...(appliedAdvancements.length > 0 ? { appliedAdvancements } : {}),
        ...(appliedAdvancements.some(step => step.appliedBy === 'auto-safe')
          ? {
              autoApplied: {
                advancements: appliedAdvancements.filter(step => step.appliedBy === 'auto-safe'),
              },
            }
          : {}),
        unresolved: {
          kind: 'advancement',
          requiresChoices: true,
          pendingAdvancements: previewResult.preview.pendingSteps,
          ...(pendingStepOptions.length > 0 ? { pendingAdvancementOptions: pendingStepOptions } : {}),
        },
        nextStep:
          'Review the unresolved advancement steps, provide advancementSelections for the remaining required choices, and rerun complete-dnd5e-level-up-workflow.',
        ...(previewResult.warnings.length > 0 ? { warnings: previewResult.warnings } : {}),
      };
    }

    const result = await this.applyProgressionUpdate(parsed.characterIdentifier, previewResult.prepared);
    const validation = await this.foundryClient.query<FoundryValidateCharacterBuildResponse>(
      'maeinomatic-foundry-mcp.validateCharacterBuild',
      {
        actorIdentifier: parsed.characterIdentifier,
      } satisfies FoundryValidateCharacterBuildRequest
    );
    const verification = createCharacterBuildVerification(validation);

    return {
      ...workflowMetadata,
      success: result.success,
      workflowStatus: 'completed',
      completed: true,
      character:
        'actorType' in result
          ? {
              id: result.actorId,
              name: result.actorName,
              type: result.actorType,
            }
          : {
              id: result.actorId,
              name: result.actorName,
            },
      progression: previewResult.prepared.summary,
      appliedUpdates: result.appliedUpdates,
      updatedFields: result.updatedFields,
      ...(appliedAdvancements.length > 0 ? { appliedAdvancements } : {}),
      ...(appliedAdvancements.some(step => step.appliedBy === 'auto-safe')
        ? {
            autoApplied: {
              advancements: appliedAdvancements.filter(step => step.appliedBy === 'auto-safe'),
            },
          }
        : {}),
      verification,
      validation: verification,
      ...(previewResult.warnings.length > 0 ? { warnings: previewResult.warnings } : {}),
    };
  }

  private async previewCharacterProgression(
    request: FoundryPreviewCharacterProgressionRequest
  ): Promise<FoundryPreviewCharacterProgressionResponse> {
    return this.foundryClient.query<FoundryPreviewCharacterProgressionResponse>(
      'maeinomatic-foundry-mcp.previewCharacterProgression',
      request
    );
  }

  private async buildProgressionPreviewResult(parsed: ProgressionArgs): Promise<{
    character: { id: string; name: string; type: string };
    prepared: PreparedCharacterProgressionUpdate;
    preview: FoundryPreviewCharacterProgressionResponse | null;
    warnings: string[];
  }> {
    const characterData = await this.getCharacterData(parsed.characterIdentifier);

    const progressionRequest: CharacterProgressionUpdateRequest = {
      ...(parsed.targetLevel !== undefined ? { targetLevel: parsed.targetLevel } : {}),
      ...(parsed.classIdentifier !== undefined ? { classIdentifier: parsed.classIdentifier } : {}),
      ...(parsed.experiencePoints !== undefined ? { experiencePoints: parsed.experiencePoints } : {}),
      ...(parsed.experienceSpent !== undefined ? { experienceSpent: parsed.experienceSpent } : {}),
    };

    const prepared = await this.prepareProgressionUpdate(characterData, progressionRequest);
    const gameSystem = await this.getGameSystem();
    const preview =
      gameSystem === 'dnd5e' &&
      parsed.targetLevel !== undefined &&
      prepared.target.kind === 'embedded-item'
        ? await this.previewCharacterProgression({
            actorIdentifier: parsed.characterIdentifier,
            targetLevel: parsed.targetLevel,
            ...(parsed.classIdentifier !== undefined ? { classIdentifier: parsed.classIdentifier } : {}),
          })
        : null;

    return {
      character: {
        id: characterData.id,
        name: characterData.name,
        type: characterData.type,
      },
      prepared,
      preview,
      warnings: mergeWarnings(prepared.warnings, preview?.warnings),
    };
  }

  private async autoApplySafeAdvancements(
    parsed: ProgressionArgs,
    initialPreview: FoundryPreviewCharacterProgressionResponse
  ): Promise<AppliedAdvancementStep[]> {
    if (parsed.targetLevel === undefined) {
      return [];
    }

    const applied: AppliedAdvancementStep[] = [];
    const remainingSelections = [...(parsed.advancementSelections ?? [])];

    let preview = initialPreview;
    for (let iteration = 0; iteration < 10; iteration += 1) {
      const matchedSelection = findMatchingAdvancementSelection(
        preview.pendingSteps,
        remainingSelections
      );
      if (matchedSelection && matchedSelection.kind === 'ambiguous') {
        throw new Error(
          `The provided advancement selection for "${matchedSelection.selection.stepType ?? matchedSelection.selection.stepId ?? 'unknown'}" matched multiple pending steps. Include stepId or more source-item context to disambiguate it.`
        );
      }

      const nextSafeStep = preview.pendingSteps.find(step => step.autoApplySafe === true);
      const nextAction =
        matchedSelection && matchedSelection.kind === 'match'
          ? {
              step: matchedSelection.step,
              choice: matchedSelection.selection.choice,
              selectionIndex: matchedSelection.selectionIndex,
            }
          : nextSafeStep
            ? {
                step: nextSafeStep,
                choice: buildAutoAdvancementChoice(nextSafeStep),
                selectionIndex: undefined,
              }
            : null;

      if (!nextAction?.choice) {
        break;
      }

      const request: FoundryApplyCharacterAdvancementChoiceRequest = {
        actorIdentifier: parsed.characterIdentifier,
        targetLevel: parsed.targetLevel,
        stepId: nextAction.step.id,
        ...(parsed.classIdentifier !== undefined ? { classIdentifier: parsed.classIdentifier } : {}),
        choice: nextAction.choice,
      };

      const result = await this.foundryClient.query<FoundryApplyCharacterAdvancementChoiceResponse>(
        'maeinomatic-foundry-mcp.applyCharacterAdvancementChoice',
        request
      );

      applied.push({
        stepId: result.stepId,
        stepType: result.stepType,
        stepTitle: result.stepTitle,
        choice: result.choice,
        appliedBy: nextAction.selectionIndex !== undefined ? 'selection' : 'auto-safe',
        ...(result.createdItemIds ? { createdItemIds: result.createdItemIds } : {}),
      });

      if (nextAction.selectionIndex !== undefined) {
        remainingSelections.splice(nextAction.selectionIndex, 1);
      }

      preview = await this.previewCharacterProgression({
        actorIdentifier: parsed.characterIdentifier,
        targetLevel: parsed.targetLevel,
        ...(parsed.classIdentifier !== undefined ? { classIdentifier: parsed.classIdentifier } : {}),
      });
    }

    const unresolvedSelections = findUnmatchedAdvancementSelections(
      preview.pendingSteps,
      remainingSelections
    );
    if (unresolvedSelections.length > 0) {
      const labels = unresolvedSelections.map(
        selection =>
          selection.stepId ??
          `${selection.stepType ?? selection.choice.type}${
            selection.sourceItemName ? ` (${selection.sourceItemName})` : ''
          }`
      );
      throw new Error(
        `The provided advancement selections did not match the actual pending steps for this level-up: ${labels.join(', ')}.`
      );
    }

    return applied;
  }

  private buildAutoAdvancementChoice(
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

  private async collectPendingAdvancementOptions(
    pendingSteps: FoundryProgressionPreviewStep[],
    parsed: CompleteDnD5eLevelUpWorkflowArgs
  ): Promise<UnknownRecord[]> {
    return collectPendingAdvancementOptions({
      pendingSteps,
      parsed,
      getOptions: async (step, request) => {
        const response = await this.foundryClient.query<FoundryGetCharacterAdvancementOptionsResponse>(
          'maeinomatic-foundry-mcp.getCharacterAdvancementOptions',
          {
            actorIdentifier: request.characterIdentifier,
            targetLevel: request.targetLevel,
            stepId: step.id,
            ...(request.classIdentifier !== undefined ? { classIdentifier: request.classIdentifier } : {}),
            ...(request.optionQuery !== undefined ? { query: request.optionQuery } : {}),
            limit: request.optionLimit,
          } satisfies FoundryGetCharacterAdvancementOptionsRequest
        );

        return {
          stepId: response.stepId,
          stepType: response.stepType,
          stepTitle: response.stepTitle,
          ...(response.choiceDetails ? { choiceDetails: response.choiceDetails } : {}),
          options: response.options,
          totalOptions: response.totalOptions,
          ...(response.warnings ? { warnings: response.warnings } : {}),
        };
      },
    });
  }
}
