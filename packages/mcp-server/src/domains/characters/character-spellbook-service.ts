import { FoundryClient } from '../../foundry-client.js';
import type {
  FoundryBatchUpdateActorEmbeddedItemsRequest,
  FoundryBatchUpdateActorEmbeddedItemsResponse,
  FoundryCharacterInfo,
  UnknownRecord,
} from '../../foundry-types.js';
import { Logger } from '../../logger.js';
import type { SystemAdapter, SystemSpellbookValidationIssue } from '../../systems/types.js';
import type { GameSystem } from '../../utils/system-detection.js';

export type DnD5eSpellcastingClassSummary = {
  id: string;
  name: string;
  spellcastingType?: string;
  spellcastingProgression?: string;
};

type CharacterInfoLike = FoundryCharacterInfo & {
  id: string;
  name: string;
  type: string;
};

export type SpellbookWorkflowValidationState = {
  character: {
    id: string;
    name: string;
    type: string;
  };
  characterData: CharacterInfoLike;
  classes: DnD5eSpellcastingClassSummary[];
  summary: Record<string, unknown>;
  issues: SystemSpellbookValidationIssue[];
  recommendations?: string[];
};

export type SpellbookSourceClassWorkflowUpdate = {
  spellId: string;
  spellName: string;
  classId: string;
  className: string;
  appliedBy: 'explicit' | 'auto';
};

export type SpellbookPreparedFlagWorkflowUpdate = {
  spellId: string;
  spellName: string;
  prepared: boolean;
  appliedBy: 'explicit-plan' | 'auto';
};

export interface OrganizeDnD5eSpellbookWorkflowArgs {
  actorIdentifier: string;
  sourceClassAssignments?: Array<{
    spellIdentifier: string;
    classIdentifier: string;
  }>;
  spellPreparationPlans?: Array<{
    mode: 'replace' | 'prepare' | 'unprepare';
    spellIdentifiers: string[];
    sourceClass?: string;
    reason?: string;
  }>;
  autoFixSourceClasses: boolean;
  autoFixPreparationMismatches: boolean;
  reason?: string;
}

interface SpellLike {
  id: string;
  name: string;
}

interface ClassLike {
  id: string;
  name: string;
}

export interface CharacterSpellbookServiceOptions {
  foundryClient: FoundryClient;
  logger: Logger;
  getGameSystem: () => Promise<GameSystem>;
  getRequiredSystemAdapter: (
    operation: string
  ) => Promise<{ adapter: SystemAdapter; system: GameSystem }>;
  getCharacterData: (identifier: string) => Promise<CharacterInfoLike>;
  getDnD5eSpellcastingClassSummaries: (
    characterData: CharacterInfoLike
  ) => DnD5eSpellcastingClassSummary[];
  resolveDnD5eSpellcastingClass: (
    characterData: CharacterInfoLike,
    classIdentifier: string
  ) => ClassLike;
  findDnD5eSpellItem: (characterData: CharacterInfoLike, spellIdentifier: string) => SpellLike;
  handleSetDnD5ePreparedSpells: (args: unknown) => Promise<UnknownRecord>;
  toRecord: (value: unknown) => UnknownRecord | undefined;
}

export class CharacterSpellbookService {
  private foundryClient: FoundryClient;
  private logger: Logger;
  private getGameSystem: () => Promise<GameSystem>;
  private getRequiredSystemAdapter: (
    operation: string
  ) => Promise<{ adapter: SystemAdapter; system: GameSystem }>;
  private getCharacterData: (identifier: string) => Promise<CharacterInfoLike>;
  private getDnD5eSpellcastingClassSummaries: (
    characterData: CharacterInfoLike
  ) => DnD5eSpellcastingClassSummary[];
  private resolveDnD5eSpellcastingClass: (
    characterData: CharacterInfoLike,
    classIdentifier: string
  ) => ClassLike;
  private findDnD5eSpellItem: (
    characterData: CharacterInfoLike,
    spellIdentifier: string
  ) => SpellLike;
  private handleSetDnD5ePreparedSpells: (args: unknown) => Promise<UnknownRecord>;
  private toRecord: (value: unknown) => UnknownRecord | undefined;

  constructor(options: CharacterSpellbookServiceOptions) {
    this.foundryClient = options.foundryClient;
    this.logger = options.logger.child({ component: 'CharacterSpellbookService' });
    this.getGameSystem = options.getGameSystem;
    this.getRequiredSystemAdapter = options.getRequiredSystemAdapter;
    this.getCharacterData = options.getCharacterData;
    this.getDnD5eSpellcastingClassSummaries = options.getDnD5eSpellcastingClassSummaries;
    this.resolveDnD5eSpellcastingClass = options.resolveDnD5eSpellcastingClass;
    this.findDnD5eSpellItem = options.findDnD5eSpellItem;
    this.handleSetDnD5ePreparedSpells = options.handleSetDnD5ePreparedSpells;
    this.toRecord = options.toRecord;
  }

  async validateDnD5eSpellbookState(
    actorIdentifier: string
  ): Promise<SpellbookWorkflowValidationState> {
    const { adapter, system } = await this.getRequiredSystemAdapter('DnD5e spellbook validation');
    if (system !== 'dnd5e') {
      throw new Error(
        'UNSUPPORTED_CAPABILITY: DnD5e spellbook workflows are only available when the active system is dnd5e.'
      );
    }

    if (!adapter.validateSpellbook) {
      throw new Error(
        'UNSUPPORTED_CAPABILITY: The active system adapter does not support DnD5e spellbook validation.'
      );
    }

    const characterData = await this.getCharacterData(actorIdentifier);
    const classes = this.getDnD5eSpellcastingClassSummaries(characterData);
    const validation = adapter.validateSpellbook(characterData);

    return {
      character: {
        id: characterData.id,
        name: characterData.name,
        type: characterData.type,
      },
      characterData,
      classes,
      summary: validation.summary,
      issues: validation.issues,
      ...(validation.recommendations ? { recommendations: validation.recommendations } : {}),
    };
  }

  async handleOrganizeDnD5eSpellbookWorkflow(
    parsed: OrganizeDnD5eSpellbookWorkflowArgs
  ): Promise<UnknownRecord> {
    this.logger.info('Running DnD5e spellbook organization workflow', parsed);

    const gameSystem = await this.getGameSystem();
    if (gameSystem !== 'dnd5e') {
      throw new Error(
        'UNSUPPORTED_CAPABILITY: organize-dnd5e-spellbook-workflow is only available when the active system is dnd5e.'
      );
    }

    const workflowMetadata = {
      workflow: {
        name: 'organize-dnd5e-spellbook-workflow',
        system: 'dnd5e',
      },
    };
    const workflowReason = parsed.reason ?? 'dnd5e spellbook organization workflow';
    const initialState = await this.validateDnD5eSpellbookState(parsed.actorIdentifier);
    let currentState = initialState;

    const appliedSourceClassAssignments: SpellbookSourceClassWorkflowUpdate[] = [];
    const appliedPreparationUpdates: SpellbookPreparedFlagWorkflowUpdate[] = [];
    const spellPreparationPlanResults: UnknownRecord[] = [];

    try {
      if ((parsed.sourceClassAssignments?.length ?? 0) > 0) {
        const seenSpellIds = new Set<string>();
        const explicitAssignments = parsed.sourceClassAssignments!.map(assignment => {
          const spell = this.findDnD5eSpellItem(
            currentState.characterData,
            assignment.spellIdentifier
          );
          if (seenSpellIds.has(spell.id)) {
            throw new Error(
              `Spell "${spell.name}" was assigned more than once in sourceClassAssignments.`
            );
          }
          seenSpellIds.add(spell.id);

          const targetClass = this.resolveDnD5eSpellcastingClass(
            currentState.characterData,
            assignment.classIdentifier
          );

          return {
            spellId: spell.id,
            spellName: spell.name,
            classId: targetClass.id,
            className: targetClass.name,
            appliedBy: 'explicit' as const,
          };
        });

        appliedSourceClassAssignments.push(
          ...(await this.applyDnD5eSpellbookSourceAssignments({
            actorIdentifier: parsed.actorIdentifier,
            assignments: explicitAssignments,
            reason: workflowReason,
          }))
        );
        currentState = await this.validateDnD5eSpellbookState(parsed.actorIdentifier);
      }

      if (parsed.autoFixSourceClasses) {
        const autoAssignments = this.buildAutoDnD5eSpellbookSourceAssignments(
          currentState,
          new Set(appliedSourceClassAssignments.map(assignment => assignment.spellId))
        );

        if (autoAssignments.length > 0) {
          appliedSourceClassAssignments.push(
            ...(await this.applyDnD5eSpellbookSourceAssignments({
              actorIdentifier: parsed.actorIdentifier,
              assignments: autoAssignments,
              reason: workflowReason,
            }))
          );
          currentState = await this.validateDnD5eSpellbookState(parsed.actorIdentifier);
        }
      }

      for (const plan of parsed.spellPreparationPlans ?? []) {
        const preparationResult = await this.handleSetDnD5ePreparedSpells({
          actorIdentifier: parsed.actorIdentifier,
          mode: plan.mode,
          spellIdentifiers: plan.spellIdentifiers,
          ...(plan.sourceClass !== undefined ? { sourceClass: plan.sourceClass } : {}),
          reason: plan.reason ?? workflowReason,
        });

        spellPreparationPlanResults.push(preparationResult);
        appliedPreparationUpdates.push(
          ...this.collectDnD5ePreparedSpellWorkflowUpdates(preparationResult)
        );
      }

      if (spellPreparationPlanResults.length > 0) {
        currentState = await this.validateDnD5eSpellbookState(parsed.actorIdentifier);
      }

      if (parsed.autoFixPreparationMismatches) {
        const autoPreparedUpdates = this.buildAutoDnD5eSpellbookPreparedUpdates(
          currentState.issues,
          new Set(appliedPreparationUpdates.map(update => update.spellId))
        );

        if (autoPreparedUpdates.length > 0) {
          appliedPreparationUpdates.push(
            ...(await this.applyDnD5eSpellbookPreparedUpdates({
              actorIdentifier: parsed.actorIdentifier,
              updates: autoPreparedUpdates,
              reason: workflowReason,
            }))
          );
          currentState = await this.validateDnD5eSpellbookState(parsed.actorIdentifier);
        }
      }
    } catch (error) {
      currentState = await this.validateDnD5eSpellbookState(parsed.actorIdentifier);

      const autoApplied = {
        sourceClassAssignments: appliedSourceClassAssignments.filter(
          assignment => assignment.appliedBy === 'auto'
        ),
        preparationUpdates: appliedPreparationUpdates.filter(update => update.appliedBy === 'auto'),
      };

      return {
        ...workflowMetadata,
        success: false,
        partialSuccess:
          appliedSourceClassAssignments.length > 0 ||
          appliedPreparationUpdates.length > 0 ||
          spellPreparationPlanResults.length > 0,
        workflowStatus: 'partial-failure',
        character: currentState.character,
        classes: currentState.classes,
        initialValidation: {
          summary: initialState.summary,
          issues: initialState.issues,
          ...(initialState.recommendations
            ? { recommendations: initialState.recommendations }
            : {}),
        },
        finalValidation: {
          summary: currentState.summary,
          issues: currentState.issues,
          ...(currentState.recommendations
            ? { recommendations: currentState.recommendations }
            : {}),
        },
        verification: {
          verified: false,
          initial: {
            summary: initialState.summary,
            issues: initialState.issues,
            ...(initialState.recommendations
              ? { recommendations: initialState.recommendations }
              : {}),
          },
          final: {
            summary: currentState.summary,
            issues: currentState.issues,
            ...(currentState.recommendations
              ? { recommendations: currentState.recommendations }
              : {}),
          },
        },
        ...(appliedSourceClassAssignments.length > 0 ? { appliedSourceClassAssignments } : {}),
        ...(appliedPreparationUpdates.length > 0 ? { appliedPreparationUpdates } : {}),
        ...(spellPreparationPlanResults.length > 0
          ? { spellPreparationPlans: spellPreparationPlanResults }
          : {}),
        ...(autoApplied.sourceClassAssignments.length > 0 ||
        autoApplied.preparationUpdates.length > 0
          ? {
              autoApplied: {
                ...(autoApplied.sourceClassAssignments.length > 0
                  ? { sourceClassAssignments: autoApplied.sourceClassAssignments }
                  : {}),
                ...(autoApplied.preparationUpdates.length > 0
                  ? { preparationUpdates: autoApplied.preparationUpdates }
                  : {}),
              },
            }
          : {}),
        unresolved: {
          kind: 'spellbook-review',
          reviewRequired: true,
          issues: currentState.issues,
          ...(currentState.recommendations
            ? { recommendations: currentState.recommendations }
            : {}),
        },
        message: error instanceof Error ? error.message : 'Unknown spellbook workflow error.',
      };
    }

    const remainingIssues = currentState.issues;
    const workflowCompleted = remainingIssues.length === 0;
    const autoApplied = {
      sourceClassAssignments: appliedSourceClassAssignments.filter(
        assignment => assignment.appliedBy === 'auto'
      ),
      preparationUpdates: appliedPreparationUpdates.filter(update => update.appliedBy === 'auto'),
    };

    return {
      ...workflowMetadata,
      success: workflowCompleted,
      partialSuccess:
        !workflowCompleted &&
        (appliedSourceClassAssignments.length > 0 ||
          appliedPreparationUpdates.length > 0 ||
          spellPreparationPlanResults.length > 0),
      workflowStatus: workflowCompleted ? 'completed' : 'needs-review',
      ...(workflowCompleted ? { completed: true } : { reviewRequired: true }),
      character: currentState.character,
      classes: currentState.classes,
      initialValidation: {
        summary: initialState.summary,
        issues: initialState.issues,
        ...(initialState.recommendations ? { recommendations: initialState.recommendations } : {}),
      },
      finalValidation: {
        summary: currentState.summary,
        issues: currentState.issues,
        ...(currentState.recommendations ? { recommendations: currentState.recommendations } : {}),
      },
      verification: {
        verified: workflowCompleted,
        initial: {
          summary: initialState.summary,
          issues: initialState.issues,
          ...(initialState.recommendations
            ? { recommendations: initialState.recommendations }
            : {}),
        },
        final: {
          summary: currentState.summary,
          issues: currentState.issues,
          ...(currentState.recommendations
            ? { recommendations: currentState.recommendations }
            : {}),
        },
      },
      fixes: {
        sourceClassAssignmentsApplied: appliedSourceClassAssignments.length,
        preparationUpdatesApplied: appliedPreparationUpdates.length,
        spellPreparationPlansApplied: spellPreparationPlanResults.length,
      },
      ...(appliedSourceClassAssignments.length > 0 ? { appliedSourceClassAssignments } : {}),
      ...(appliedPreparationUpdates.length > 0 ? { appliedPreparationUpdates } : {}),
      ...(spellPreparationPlanResults.length > 0
        ? { spellPreparationPlans: spellPreparationPlanResults }
        : {}),
      ...(autoApplied.sourceClassAssignments.length > 0 || autoApplied.preparationUpdates.length > 0
        ? {
            autoApplied: {
              ...(autoApplied.sourceClassAssignments.length > 0
                ? { sourceClassAssignments: autoApplied.sourceClassAssignments }
                : {}),
              ...(autoApplied.preparationUpdates.length > 0
                ? { preparationUpdates: autoApplied.preparationUpdates }
                : {}),
            },
          }
        : {}),
      ...(!workflowCompleted
        ? {
            unresolved: {
              kind: 'spellbook-review',
              reviewRequired: true,
              issues: currentState.issues,
              ...(currentState.recommendations
                ? { recommendations: currentState.recommendations }
                : {}),
            },
            nextStep:
              'Review the remaining spellbook issues and either provide explicit sourceClassAssignments or spellPreparationPlans, or use the lower-level DnD5e spellbook tools for the remaining ambiguous cases.',
          }
        : {}),
    };
  }

  private buildAutoDnD5eSpellbookSourceAssignments(
    state: SpellbookWorkflowValidationState,
    excludedSpellIds: Set<string>
  ): SpellbookSourceClassWorkflowUpdate[] {
    const assignments: SpellbookSourceClassWorkflowUpdate[] = [];
    const assignedSpellIds = new Set(excludedSpellIds);
    const soleSpellcastingClass = state.classes.length === 1 ? state.classes[0] : null;
    const preparedSpellcastingClasses = state.classes.filter(
      classSummary => classSummary.spellcastingType === 'prepared'
    );
    const solePreparedSpellcastingClass =
      preparedSpellcastingClasses.length === 1 ? preparedSpellcastingClasses[0] : null;

    for (const issue of state.issues) {
      const issueRecord = this.toRecord(issue);
      if (!issueRecord) {
        continue;
      }

      const code = typeof issueRecord.code === 'string' ? issueRecord.code : undefined;
      const spellId =
        typeof issueRecord.spellId === 'string'
          ? issueRecord.spellId
          : typeof issueRecord.itemId === 'string'
            ? issueRecord.itemId
            : undefined;
      const spellName =
        typeof issueRecord.spellName === 'string'
          ? issueRecord.spellName
          : typeof issueRecord.itemName === 'string'
            ? issueRecord.itemName
            : undefined;

      if (!code || !spellId || !spellName || assignedSpellIds.has(spellId)) {
        continue;
      }

      let targetClass: DnD5eSpellcastingClassSummary | null = null;
      if (
        (code === 'unknown-source-class' || code === 'non-spellcasting-source-class') &&
        soleSpellcastingClass
      ) {
        targetClass = soleSpellcastingClass;
      } else if (code === 'missing-source-class' && solePreparedSpellcastingClass) {
        targetClass = solePreparedSpellcastingClass;
      }

      if (!targetClass) {
        continue;
      }

      assignments.push({
        spellId,
        spellName,
        classId: targetClass.id,
        className: targetClass.name,
        appliedBy: 'auto',
      });
      assignedSpellIds.add(spellId);
    }

    return assignments;
  }

  private buildAutoDnD5eSpellbookPreparedUpdates(
    issues: SystemSpellbookValidationIssue[],
    excludedSpellIds: Set<string>
  ): SpellbookPreparedFlagWorkflowUpdate[] {
    const updates: SpellbookPreparedFlagWorkflowUpdate[] = [];
    const updatedSpellIds = new Set(excludedSpellIds);

    for (const issue of issues) {
      const issueRecord = this.toRecord(issue);
      if (!issueRecord) {
        continue;
      }

      const code = typeof issueRecord.code === 'string' ? issueRecord.code : undefined;
      const spellId =
        typeof issueRecord.spellId === 'string'
          ? issueRecord.spellId
          : typeof issueRecord.itemId === 'string'
            ? issueRecord.itemId
            : undefined;
      const spellName =
        typeof issueRecord.spellName === 'string'
          ? issueRecord.spellName
          : typeof issueRecord.itemName === 'string'
            ? issueRecord.itemName
            : undefined;

      if (
        code !== 'preparation-mode-mismatch' ||
        !spellId ||
        !spellName ||
        updatedSpellIds.has(spellId)
      ) {
        continue;
      }

      updates.push({
        spellId,
        spellName,
        prepared: false,
        appliedBy: 'auto',
      });
      updatedSpellIds.add(spellId);
    }

    return updates;
  }

  private async applyDnD5eSpellbookSourceAssignments(params: {
    actorIdentifier: string;
    assignments: SpellbookSourceClassWorkflowUpdate[];
    reason?: string;
  }): Promise<SpellbookSourceClassWorkflowUpdate[]> {
    if (params.assignments.length === 0) {
      return [];
    }

    await this.foundryClient.query<FoundryBatchUpdateActorEmbeddedItemsResponse>(
      'maeinomatic-foundry-mcp.batchUpdateActorEmbeddedItems',
      {
        actorIdentifier: params.actorIdentifier,
        updates: params.assignments.map(assignment => ({
          itemIdentifier: assignment.spellId,
          itemType: 'spell',
          updates: {
            'system.sourceClass': assignment.classId,
          },
        })),
        ...(params.reason !== undefined ? { reason: params.reason } : {}),
      } satisfies FoundryBatchUpdateActorEmbeddedItemsRequest
    );

    return params.assignments;
  }

  private async applyDnD5eSpellbookPreparedUpdates(params: {
    actorIdentifier: string;
    updates: SpellbookPreparedFlagWorkflowUpdate[];
    reason?: string;
  }): Promise<SpellbookPreparedFlagWorkflowUpdate[]> {
    if (params.updates.length === 0) {
      return [];
    }

    await this.foundryClient.query<FoundryBatchUpdateActorEmbeddedItemsResponse>(
      'maeinomatic-foundry-mcp.batchUpdateActorEmbeddedItems',
      {
        actorIdentifier: params.actorIdentifier,
        updates: params.updates.map(update => ({
          itemIdentifier: update.spellId,
          itemType: 'spell',
          updates: {
            'system.preparation.prepared': update.prepared,
          },
        })),
        ...(params.reason !== undefined ? { reason: params.reason } : {}),
      } satisfies FoundryBatchUpdateActorEmbeddedItemsRequest
    );

    return params.updates;
  }

  private collectDnD5ePreparedSpellWorkflowUpdates(
    result: UnknownRecord
  ): SpellbookPreparedFlagWorkflowUpdate[] {
    const updatedSpells = Array.isArray(result.updatedSpells) ? result.updatedSpells : [];
    const updates: SpellbookPreparedFlagWorkflowUpdate[] = [];

    for (const entry of updatedSpells) {
      const record = this.toRecord(entry);
      if (
        !record ||
        typeof record.id !== 'string' ||
        typeof record.name !== 'string' ||
        typeof record.prepared !== 'boolean'
      ) {
        continue;
      }

      updates.push({
        spellId: record.id,
        spellName: record.name,
        prepared: record.prepared,
        appliedBy: 'explicit-plan',
      });
    }

    return updates;
  }
}
