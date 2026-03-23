import { ERROR_MESSAGES } from '../constants.js';
import { permissionManager } from '../permissions.js';
import type {
  FoundryDnD5eTransformActivitySummary,
  FoundryRunDnD5eTransformActivityRequest,
  FoundryRunDnD5eTransformActivityResponse,
  UnknownRecord,
} from '@maeinomatic/foundry-mcp-shared';

type AuditStatus = 'success' | 'failure';

interface TransformWorkflowActorLike {
  id?: string;
  name?: string;
  type?: string;
  items?: unknown;
}

interface TransformWorkflowItemLike {
  id?: string;
  name?: string;
  type?: string;
  activities?: unknown;
  system?: UnknownRecord;
  actor?: TransformWorkflowActorLike;
  parent?: TransformWorkflowActorLike;
}

interface TransformWorkflowActivityLike {
  id?: string;
  name?: string;
  type?: string;
  use?: (...args: unknown[]) => unknown;
  item?: TransformWorkflowItemLike;
  parent?: TransformWorkflowItemLike;
}

interface TransformWorkflowTokenLike {
  id?: string;
  name?: string;
}

interface HookApiLike {
  on: (event: string, callback: (...args: unknown[]) => void) => number | string;
  off: (event: string, hookId: number | string) => void;
}

interface ActorSummaryLike {
  id: string;
  name: string;
  type: string;
}

export interface DnD5eTransformActivityWorkflowServiceContext {
  auditLog(action: string, data: unknown, status: AuditStatus, errorMessage?: string): void;
  findActorByIdentifier(identifier: string): TransformWorkflowActorLike | null;
  validateFoundryState(): void;
}

function asRecord(value: unknown): UnknownRecord | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : undefined;
}

function toStringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function normalizeCollection<T>(value: unknown): T[] {
  if (Array.isArray(value)) {
    return value as T[];
  }

  const record = asRecord(value);
  if (!record) {
    return [];
  }

  const contents = record.contents;
  if (Array.isArray(contents)) {
    return contents as T[];
  }

  const iterator = record[Symbol.iterator as unknown as keyof UnknownRecord];
  if (typeof iterator === 'function') {
    return Array.from(value as Iterable<T>);
  }

  return Object.values(record) as T[];
}

function getActorItems(actor: TransformWorkflowActorLike): TransformWorkflowItemLike[] {
  return normalizeCollection<TransformWorkflowItemLike>(actor.items).filter(
    (item): item is TransformWorkflowItemLike => Boolean(item && typeof item === 'object')
  );
}

function getItemActivities(item: TransformWorkflowItemLike): TransformWorkflowActivityLike[] {
  if (item.activities !== undefined) {
    return normalizeCollection<TransformWorkflowActivityLike>(item.activities).filter(
      (activity): activity is TransformWorkflowActivityLike =>
        Boolean(activity && typeof activity === 'object')
    );
  }

  const activitiesRecord = asRecord(item.system?.activities);
  if (!activitiesRecord) {
    return [];
  }

  return Object.values(activitiesRecord).filter(
    (activity): activity is TransformWorkflowActivityLike =>
      Boolean(activity && typeof activity === 'object')
  );
}

function getActivityItem(
  activity: TransformWorkflowActivityLike
): TransformWorkflowItemLike | null {
  const directItem = activity.item;
  if (directItem && typeof directItem === 'object') {
    return directItem;
  }

  const parentItem = activity.parent;
  return parentItem && typeof parentItem === 'object' ? parentItem : null;
}

function isTransformActivity(activity: TransformWorkflowActivityLike): boolean {
  const typeValue = toStringValue(activity.type)?.toLowerCase();
  if (typeValue === 'transform') {
    return true;
  }

  const activityRecord = asRecord(activity);
  const constructorName = toStringValue(asRecord(activityRecord?.constructor)?.name)?.toLowerCase();
  return constructorName?.includes('transform') ?? false;
}

function getHooksApi(): HookApiLike | null {
  const maybeHooks = (globalThis as { Hooks?: unknown }).Hooks;
  const hooksRecord = asRecord(maybeHooks);
  if (!hooksRecord) {
    return null;
  }

  const on = hooksRecord.on;
  const off = hooksRecord.off;
  if (typeof on !== 'function' || typeof off !== 'function') {
    return null;
  }

  return {
    on: on as HookApiLike['on'],
    off: off as HookApiLike['off'],
  };
}

function matchesActivity(
  candidate: unknown,
  selectedActivity: TransformWorkflowActivityLike,
  selectedItem: TransformWorkflowItemLike
): boolean {
  if (!candidate || typeof candidate !== 'object') {
    return false;
  }

  if (candidate === selectedActivity) {
    return true;
  }

  const candidateRecord = candidate as TransformWorkflowActivityLike;
  if (candidateRecord.id && selectedActivity.id && candidateRecord.id === selectedActivity.id) {
    const candidateItem = getActivityItem(candidateRecord);
    if (!candidateItem?.id || !selectedItem.id) {
      return true;
    }
    return candidateItem.id === selectedItem.id;
  }

  return false;
}

function matchesActor(candidate: unknown, expectedActor: TransformWorkflowActorLike): boolean {
  if (!candidate || typeof candidate !== 'object') {
    return false;
  }

  if (candidate === expectedActor) {
    return true;
  }

  const candidateRecord = candidate as TransformWorkflowActorLike;
  return Boolean(candidateRecord.id && expectedActor.id && candidateRecord.id === expectedActor.id);
}

function summarizeActor(candidate: unknown): ActorSummaryLike | null {
  const actorRecord =
    candidate && typeof candidate === 'object' ? (candidate as TransformWorkflowActorLike) : null;
  if (!actorRecord) {
    return null;
  }

  const id = toStringValue(actorRecord.id);
  const name = toStringValue(actorRecord.name);
  const type = toStringValue(actorRecord.type) ?? 'character';
  if (!id || !name) {
    return null;
  }

  return {
    id,
    name,
    type,
  };
}

function summarizeActivity(
  activity: TransformWorkflowActivityLike
): FoundryDnD5eTransformActivitySummary | null {
  const item = getActivityItem(activity);
  const id = toStringValue(activity.id);
  const name = toStringValue(activity.name) ?? id;
  const type = toStringValue(activity.type) ?? 'transform';
  const itemId = toStringValue(item?.id);
  const itemName = toStringValue(item?.name);

  if (!id || !name) {
    return null;
  }

  return {
    id,
    name,
    type,
    ...(itemId ? { itemId } : {}),
    ...(itemName ? { itemName } : {}),
  };
}

function summarizeTokens(value: unknown): TransformWorkflowTokenLike[] {
  return normalizeCollection<TransformWorkflowTokenLike>(value).filter(
    (token): token is TransformWorkflowTokenLike => Boolean(token && typeof token === 'object')
  );
}

function captureTransformationResult(
  value: unknown,
  current: {
    sourceActor: ActorSummaryLike | null;
    transformedActor: ActorSummaryLike | null;
    tokens: TransformWorkflowTokenLike[];
  }
): void {
  const record = asRecord(value);
  if (!record) {
    return;
  }

  if (!current.sourceActor) {
    current.sourceActor =
      summarizeActor(record.sourceActor) ??
      summarizeActor(record.source) ??
      summarizeActor(record.target) ??
      null;
  }

  if (!current.transformedActor) {
    current.transformedActor =
      summarizeActor(record.transformedActor) ??
      summarizeActor(record.actor) ??
      summarizeActor(record.createdActor) ??
      summarizeActor(record.host) ??
      null;
  }

  if (current.tokens.length === 0) {
    current.tokens =
      summarizeTokens(record.tokens) ??
      summarizeTokens(record.createdTokens) ??
      summarizeTokens(record.placedTokens);
  }
}

export class FoundryDnD5eTransformActivityWorkflowService {
  constructor(private readonly context: DnD5eTransformActivityWorkflowServiceContext) {}

  async runDnD5eTransformActivity(
    request: FoundryRunDnD5eTransformActivityRequest
  ): Promise<FoundryRunDnD5eTransformActivityResponse> {
    this.context.validateFoundryState();

    const systemId = (game.system as { id?: string }).id ?? 'unknown';
    if (systemId !== 'dnd5e') {
      throw new Error(
        'UNSUPPORTED_CAPABILITY: run-dnd5e-transform-activity-workflow is only available when the active system is dnd5e.'
      );
    }

    const permissionCheck = permissionManager.checkWritePermission('updateActor');
    if (!permissionCheck.allowed) {
      throw new Error(`${ERROR_MESSAGES.ACCESS_DENIED}: ${permissionCheck.reason}`);
    }

    const actor = this.context.findActorByIdentifier(request.actorIdentifier);
    if (!actor) {
      throw new Error(`Actor not found: ${request.actorIdentifier}`);
    }

    const items = getActorItems(actor);
    const item = items.find(candidate => {
      const id = toStringValue(candidate.id);
      const name = toStringValue(candidate.name)?.toLowerCase();
      return id === request.itemIdentifier || name === request.itemIdentifier.toLowerCase();
    });

    if (!item) {
      throw new Error(
        `Item "${request.itemIdentifier}" not found on actor "${actor.name ?? 'Unknown'}".`
      );
    }

    const transformActivities = getItemActivities(item).filter(isTransformActivity);
    if (transformActivities.length === 0) {
      throw new Error(
        `Item "${item.name ?? 'Unknown Item'}" does not expose a DnD5e transform activity.`
      );
    }

    const activitySummaries = transformActivities
      .map(summarizeActivity)
      .filter((summary): summary is FoundryDnD5eTransformActivitySummary => summary !== null);
    const normalizedRequestedActivity = request.activityIdentifier?.toLowerCase();

    const selectedActivity =
      request.activityIdentifier !== undefined
        ? (transformActivities.find(activity => {
            const id = toStringValue(activity.id);
            const name = toStringValue(activity.name)?.toLowerCase();
            return (
              id === request.activityIdentifier ||
              (normalizedRequestedActivity !== undefined && name === normalizedRequestedActivity)
            );
          }) ?? null)
        : transformActivities.length === 1
          ? transformActivities[0]
          : null;

    if (!selectedActivity) {
      const response: FoundryRunDnD5eTransformActivityResponse = {
        success: false,
        system: 'dnd5e',
        actorId: actor.id ?? '',
        actorName: actor.name ?? '',
        actorType: actor.type ?? 'character',
        itemId: item.id ?? '',
        itemName: item.name ?? '',
        itemType: item.type ?? 'item',
        workflowStatus: 'needs-activity',
        requiresChoices: true,
        availableActivities: activitySummaries,
        message:
          'This item exposes multiple transform activities. Provide activityIdentifier to select the one to run.',
      };
      this.context.auditLog('runDnD5eTransformActivity', request, 'success');
      return response;
    }

    if (typeof selectedActivity.use !== 'function') {
      throw new Error(
        `Transform activity "${selectedActivity.name ?? selectedActivity.id ?? 'unknown'}" is not executable through the public DnD5e activity API.`
      );
    }

    const dialogConfig: UnknownRecord = {
      configure: false,
    };
    const messageConfig: UnknownRecord = {
      create: true,
    };
    const warnings: string[] = [];
    const transformState: {
      sourceActor: ActorSummaryLike | null;
      transformedActor: ActorSummaryLike | null;
      tokens: TransformWorkflowTokenLike[];
    } = {
      sourceActor: null,
      transformedActor: null,
      tokens: [],
    };

    const hooksApi = getHooksApi();
    const registeredHooks: Array<{ event: string; hookId: number | string }> = [];
    if (hooksApi) {
      registeredHooks.push({
        event: 'dnd5e.transformActorV2',
        hookId: hooksApi.on('dnd5e.transformActorV2', (...hookArgs: unknown[]): void => {
          const [hostArg, sourceArg, dataArg] = hookArgs;
          if (!matchesActor(hostArg, actor)) {
            return;
          }

          if (!transformState.sourceActor) {
            transformState.sourceActor = summarizeActor(sourceArg);
          }
          if (!transformState.transformedActor) {
            transformState.transformedActor =
              summarizeActor(dataArg) ?? summarizeActor(hostArg) ?? summarizeActor(actor);
          }
        }),
      });
      registeredHooks.push({
        event: 'dnd5e.postUseActivity',
        hookId: hooksApi.on('dnd5e.postUseActivity', (...hookArgs: unknown[]): void => {
          const [activityArg, , resultsArg] = hookArgs;
          if (!matchesActivity(activityArg, selectedActivity, item)) {
            return;
          }

          captureTransformationResult(resultsArg, transformState);
        }),
      });
    } else {
      warnings.push(
        'Foundry Hooks API was unavailable, so transformation result capture relied on the activity return value only.'
      );
    }

    try {
      const useResult = await Promise.resolve(
        selectedActivity.use({}, dialogConfig, messageConfig)
      );
      captureTransformationResult(useResult, transformState);
    } catch (error) {
      this.context.auditLog(
        'runDnD5eTransformActivity',
        request,
        'failure',
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw error;
    } finally {
      if (hooksApi) {
        for (const { event, hookId } of registeredHooks) {
          hooksApi.off(event, hookId);
        }
      }
    }

    const selectedActivityId = toStringValue(selectedActivity.id);
    const selectedActivityName = toStringValue(selectedActivity.name);
    const transformedActor = transformState.transformedActor ?? summarizeActor(actor);
    const response: FoundryRunDnD5eTransformActivityResponse = {
      success: true,
      system: 'dnd5e',
      actorId: actor.id ?? '',
      actorName: actor.name ?? '',
      actorType: actor.type ?? 'character',
      itemId: item.id ?? '',
      itemName: item.name ?? '',
      itemType: item.type ?? 'item',
      workflowStatus: 'completed',
      ...(selectedActivityId ? { activityId: selectedActivityId } : {}),
      ...(selectedActivityName ? { activityName: selectedActivityName } : {}),
      ...(transformState.sourceActor
        ? {
            sourceActorId: transformState.sourceActor.id,
            sourceActorName: transformState.sourceActor.name,
            sourceActorType: transformState.sourceActor.type,
          }
        : {}),
      ...(transformedActor
        ? {
            transformedActorId: transformedActor.id,
            transformedActorName: transformedActor.name,
            transformedActorType: transformedActor.type,
          }
        : {}),
      ...(transformState.tokens.length > 0
        ? {
            tokenIds: transformState.tokens
              .map(token => token.id)
              .filter((id): id is string => typeof id === 'string' && id.length > 0),
            tokenNames: transformState.tokens
              .map(token => token.name)
              .filter((name): name is string => typeof name === 'string' && name.length > 0),
          }
        : {}),
      ...(warnings.length > 0 ? { warnings } : {}),
      message:
        transformState.sourceActor !== null
          ? `Transform activity "${selectedActivity.name ?? item.name ?? 'unknown'}" completed using ${transformState.sourceActor.name} as the transformation source.`
          : `Transform activity "${selectedActivity.name ?? item.name ?? 'unknown'}" completed.`,
    };

    this.context.auditLog('runDnD5eTransformActivity', request, 'success');
    return response;
  }
}
