import { ERROR_MESSAGES } from '../constants.js';
import { permissionManager } from '../permissions.js';
import type {
  FoundryDnD5eSummonActivitySummary,
  FoundryDnD5eSummonProfileSummary,
  FoundryRunDnD5eSummonActivityRequest,
  FoundryRunDnD5eSummonActivityResponse,
  FoundryTokenPlacementCoordinate,
  FoundryTokenPlacementOptions,
  UnknownRecord,
} from '@maeinomatic/foundry-mcp-shared';

type AuditStatus = 'success' | 'failure';

interface SummonWorkflowActorLike {
  id?: string;
  name?: string;
  type?: string;
  items?: unknown;
}

interface SummonWorkflowItemLike {
  id?: string;
  name?: string;
  type?: string;
  activities?: unknown;
  system?: UnknownRecord;
  actor?: SummonWorkflowActorLike;
  parent?: SummonWorkflowActorLike;
}

interface SummonWorkflowActivityLike {
  id?: string;
  name?: string;
  type?: string;
  use?: (...args: unknown[]) => unknown;
  item?: SummonWorkflowItemLike;
  parent?: SummonWorkflowItemLike;
  profiles?: unknown;
  summons?: { profiles?: unknown };
}

interface SummonWorkflowProfileLike {
  id?: string;
  name?: string;
  label?: string;
  uuid?: string;
  count?: unknown;
  quantity?: unknown;
  challengeRating?: unknown;
  cr?: unknown;
  hint?: string;
  creatureTypes?: unknown;
  types?: unknown;
}

interface SummonedTokenLike {
  id?: string;
  name?: string;
}

interface HookApiLike {
  on: (event: string, callback: (...args: unknown[]) => void) => number | string;
  off: (event: string, hookId: number | string) => void;
}

export interface DnD5eSummonActivityWorkflowServiceContext {
  auditLog(action: string, data: unknown, status: AuditStatus, errorMessage?: string): void;
  findActorByIdentifier(identifier: string): SummonWorkflowActorLike | null;
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

function toNumberValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
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

function getActorItems(actor: SummonWorkflowActorLike): SummonWorkflowItemLike[] {
  return normalizeCollection<SummonWorkflowItemLike>(actor.items).filter(
    (item): item is SummonWorkflowItemLike => Boolean(item && typeof item === 'object')
  );
}

function getItemActivities(item: SummonWorkflowItemLike): SummonWorkflowActivityLike[] {
  if (item.activities !== undefined) {
    return normalizeCollection<SummonWorkflowActivityLike>(item.activities).filter(
      (activity): activity is SummonWorkflowActivityLike =>
        Boolean(activity && typeof activity === 'object')
    );
  }

  const activitiesRecord = asRecord(item.system?.activities);
  if (!activitiesRecord) {
    return [];
  }

  return Object.values(activitiesRecord).filter(
    (activity): activity is SummonWorkflowActivityLike =>
      Boolean(activity && typeof activity === 'object')
  );
}

function getActivityProfiles(activity: SummonWorkflowActivityLike): SummonWorkflowProfileLike[] {
  if (activity.profiles !== undefined) {
    return normalizeCollection<SummonWorkflowProfileLike>(activity.profiles).filter(
      (profile): profile is SummonWorkflowProfileLike =>
        Boolean(profile && typeof profile === 'object')
    );
  }

  if (activity.summons?.profiles !== undefined) {
    return normalizeCollection<SummonWorkflowProfileLike>(activity.summons.profiles).filter(
      (profile): profile is SummonWorkflowProfileLike =>
        Boolean(profile && typeof profile === 'object')
    );
  }

  return [];
}

function getActivityItem(activity: SummonWorkflowActivityLike): SummonWorkflowItemLike | null {
  const directItem = activity.item;
  if (directItem && typeof directItem === 'object') {
    return directItem;
  }

  const parentItem = activity.parent;
  return parentItem && typeof parentItem === 'object' ? parentItem : null;
}

function isSummonActivity(activity: SummonWorkflowActivityLike): boolean {
  const typeValue = toStringValue(activity.type)?.toLowerCase();
  if (typeValue === 'summon') {
    return true;
  }

  const activityRecord = asRecord(activity);
  const constructorName = toStringValue(asRecord(activityRecord?.constructor)?.name)?.toLowerCase();
  if (constructorName?.includes('summon')) {
    return true;
  }

  return false;
}

function createPlacementConfiguration(data: {
  placementType?: FoundryTokenPlacementOptions['type'] | 'near-owner';
  coordinates?: FoundryTokenPlacementCoordinate[];
  hidden?: boolean;
}): UnknownRecord {
  const placementType = data.placementType ?? 'near-owner';
  const mappedPlacementType: FoundryTokenPlacementOptions['type'] =
    placementType === 'near-owner' ? 'center' : placementType;

  const placement: UnknownRecord = {
    placementType,
    hidden: data.hidden ?? false,
    placement: {
      type: mappedPlacementType,
      ...(data.coordinates !== undefined ? { coordinates: data.coordinates } : {}),
    },
    summon: {
      placementType,
      hidden: data.hidden ?? false,
      placement: {
        type: mappedPlacementType,
        ...(data.coordinates !== undefined ? { coordinates: data.coordinates } : {}),
      },
    },
  };

  if (data.coordinates !== undefined) {
    placement.coordinates = data.coordinates;
    (placement.summon as UnknownRecord).coordinates = data.coordinates;
  }

  return placement;
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

function getActiveScenePresent(): boolean {
  const canvasRecord = asRecord((globalThis as { canvas?: unknown }).canvas);
  if (canvasRecord?.scene) {
    return true;
  }

  const gameRecord = asRecord((globalThis as { game?: unknown }).game);
  const scenes = asRecord(gameRecord?.scenes);
  return Boolean(scenes?.current ?? scenes?.active);
}

function matchesActivity(
  candidate: unknown,
  selectedActivity: SummonWorkflowActivityLike,
  selectedItem: SummonWorkflowItemLike
): boolean {
  if (!candidate || typeof candidate !== 'object') {
    return false;
  }

  if (candidate === selectedActivity) {
    return true;
  }

  const candidateRecord = candidate as SummonWorkflowActivityLike;
  if (candidateRecord.id && selectedActivity.id && candidateRecord.id === selectedActivity.id) {
    const candidateItem = getActivityItem(candidateRecord);
    if (!candidateItem?.id || !selectedItem.id) {
      return true;
    }
    return candidateItem.id === selectedItem.id;
  }

  return false;
}

function summarizeActivity(
  activity: SummonWorkflowActivityLike
): FoundryDnD5eSummonActivitySummary | null {
  const item = getActivityItem(activity);
  const id = toStringValue(activity.id);
  const name = toStringValue(activity.name) ?? id;
  const type = toStringValue(activity.type) ?? 'summon';
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

function summarizeProfile(
  profile: SummonWorkflowProfileLike
): FoundryDnD5eSummonProfileSummary | null {
  const id = toStringValue(profile.id);
  const name = toStringValue(profile.name) ?? toStringValue(profile.label) ?? id;
  if (!id || !name) {
    return null;
  }

  const creatureTypesRaw = Array.isArray(profile.creatureTypes)
    ? profile.creatureTypes
    : Array.isArray(profile.types)
      ? profile.types
      : [];
  const creatureTypes = creatureTypesRaw.filter(
    (value): value is string => typeof value === 'string' && value.trim().length > 0
  );
  const count = toNumberValue(profile.count) ?? toNumberValue(profile.quantity);
  const challengeRating =
    toNumberValue(profile.challengeRating) ??
    toNumberValue(profile.cr) ??
    toStringValue(profile.challengeRating) ??
    toStringValue(profile.cr);
  const uuid = toStringValue(profile.uuid);
  const hint = toStringValue(profile.hint);

  return {
    id,
    name,
    ...(uuid ? { uuid } : {}),
    ...(count !== undefined ? { count } : {}),
    ...(creatureTypes.length > 0 ? { creatureTypes } : {}),
    ...(challengeRating !== undefined ? { challengeRating } : {}),
    ...(hint ? { hint } : {}),
  };
}

export class FoundryDnD5eSummonActivityWorkflowService {
  constructor(private readonly context: DnD5eSummonActivityWorkflowServiceContext) {}

  async runDnD5eSummonActivity(
    request: FoundryRunDnD5eSummonActivityRequest
  ): Promise<FoundryRunDnD5eSummonActivityResponse> {
    this.context.validateFoundryState();

    const systemId = (game.system as { id?: string }).id ?? 'unknown';
    if (systemId !== 'dnd5e') {
      throw new Error(
        'UNSUPPORTED_CAPABILITY: run-dnd5e-summon-activity is only available when the active system is dnd5e.'
      );
    }

    const permissionCheck = permissionManager.checkWritePermission('modifyScene');
    if (!permissionCheck.allowed) {
      throw new Error(`${ERROR_MESSAGES.ACCESS_DENIED}: ${permissionCheck.reason}`);
    }

    if (!getActiveScenePresent()) {
      throw new Error('No active scene found for DnD5e summon activity placement.');
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

    const summonActivities = getItemActivities(item).filter(isSummonActivity);
    if (summonActivities.length === 0) {
      throw new Error(
        `Item "${item.name ?? 'Unknown Item'}" does not expose a DnD5e summon activity.`
      );
    }

    const activitySummaries = summonActivities
      .map(summarizeActivity)
      .filter((summary): summary is FoundryDnD5eSummonActivitySummary => summary !== null);
    const normalizedRequestedActivity = request.activityIdentifier?.toLowerCase();

    const selectedActivity =
      request.activityIdentifier !== undefined
        ? (summonActivities.find(activity => {
            const id = toStringValue(activity.id);
            const name = toStringValue(activity.name)?.toLowerCase();
            return (
              id === request.activityIdentifier ||
              (normalizedRequestedActivity !== undefined && name === normalizedRequestedActivity)
            );
          }) ?? null)
        : summonActivities.length === 1
          ? summonActivities[0]
          : null;

    if (!selectedActivity) {
      const response: FoundryRunDnD5eSummonActivityResponse = {
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
          'This item exposes multiple summon activities. Provide activityIdentifier to select the one to run.',
      };
      this.context.auditLog('runDnD5eSummonActivity', request, 'success');
      return response;
    }

    const profiles = getActivityProfiles(selectedActivity);
    const profileSummaries = profiles
      .map(summarizeProfile)
      .filter((summary): summary is FoundryDnD5eSummonProfileSummary => summary !== null);
    const normalizedRequestedProfile = request.profileId?.toLowerCase();
    const selectedProfile =
      request.profileId !== undefined
        ? (profiles.find(profile => {
            const id = toStringValue(profile.id);
            const name = toStringValue(profile.name ?? profile.label)?.toLowerCase();
            return (
              id === request.profileId ||
              (normalizedRequestedProfile !== undefined && name === normalizedRequestedProfile)
            );
          }) ?? null)
        : profiles.length === 1
          ? profiles[0]
          : null;

    if (profiles.length > 1 && !selectedProfile) {
      const selectedActivityId = toStringValue(selectedActivity.id);
      const selectedActivityName = toStringValue(selectedActivity.name);
      const response: FoundryRunDnD5eSummonActivityResponse = {
        success: false,
        system: 'dnd5e',
        actorId: actor.id ?? '',
        actorName: actor.name ?? '',
        actorType: actor.type ?? 'character',
        itemId: item.id ?? '',
        itemName: item.name ?? '',
        itemType: item.type ?? 'item',
        workflowStatus: 'needs-profile',
        requiresChoices: true,
        ...(selectedActivityId ? { activityId: selectedActivityId } : {}),
        ...(selectedActivityName ? { activityName: selectedActivityName } : {}),
        availableProfiles: profileSummaries,
        message:
          'This summon activity exposes multiple summon profiles. Provide profileId to choose which summon profile to run.',
      };
      this.context.auditLog('runDnD5eSummonActivity', request, 'success');
      return response;
    }

    if (typeof selectedActivity.use !== 'function') {
      throw new Error(
        `Summon activity "${selectedActivity.name ?? selectedActivity.id ?? 'unknown'}" is not executable through the public DnD5e activity API.`
      );
    }

    const placementConfiguration = createPlacementConfiguration({
      ...(request.placementType !== undefined ? { placementType: request.placementType } : {}),
      ...(request.coordinates !== undefined ? { coordinates: request.coordinates } : {}),
      ...(request.hidden !== undefined ? { hidden: request.hidden } : {}),
    });

    const usageConfig: UnknownRecord = {
      ...placementConfiguration,
    };

    if (selectedProfile) {
      usageConfig.profileId = selectedProfile.id;
      usageConfig.profile = selectedProfile;
      const summonConfig = asRecord(usageConfig.summon) ?? {};
      summonConfig.profileId = selectedProfile.id;
      summonConfig.profile = selectedProfile;
      usageConfig.summon = summonConfig;
    }

    const dialogConfig: UnknownRecord = {
      configure: false,
    };
    const messageConfig: UnknownRecord = {
      create: true,
    };

    const warnings: string[] = [];
    let summonedTokens: SummonedTokenLike[] = [];
    let resolvedProfile: SummonWorkflowProfileLike | null = selectedProfile;

    const hooksApi = getHooksApi();
    const registeredHooks: Array<{ event: string; hookId: number | string }> = [];
    if (hooksApi) {
      registeredHooks.push({
        event: 'dnd5e.preSummon',
        hookId: hooksApi.on('dnd5e.preSummon', (...hookArgs: unknown[]): void => {
          const [activityArg, profileArg, optionsArg] = hookArgs;
          if (!matchesActivity(activityArg, selectedActivity, item)) {
            return;
          }

          if (!resolvedProfile && profileArg && typeof profileArg === 'object') {
            resolvedProfile = profileArg as SummonWorkflowProfileLike;
          }

          const optionsRecord = asRecord(optionsArg);
          if (!optionsRecord) {
            return;
          }

          optionsRecord.hidden = request.hidden ?? false;
          optionsRecord.placementType = request.placementType ?? 'near-owner';
          optionsRecord.coordinates = request.coordinates;
          optionsRecord.placement = {
            type:
              request.placementType === 'near-owner'
                ? 'center'
                : (request.placementType ?? 'center'),
            ...(request.coordinates !== undefined ? { coordinates: request.coordinates } : {}),
          };
        }),
      });
      registeredHooks.push({
        event: 'dnd5e.postSummon',
        hookId: hooksApi.on('dnd5e.postSummon', (...hookArgs: unknown[]): void => {
          const [activityArg, profileArg, tokensArg] = hookArgs;
          if (!matchesActivity(activityArg, selectedActivity, item)) {
            return;
          }

          if (!resolvedProfile && profileArg && typeof profileArg === 'object') {
            resolvedProfile = profileArg as SummonWorkflowProfileLike;
          }

          summonedTokens = normalizeCollection<SummonedTokenLike>(tokensArg).filter(
            (token): token is SummonedTokenLike => Boolean(token && typeof token === 'object')
          );
        }),
      });
    } else {
      warnings.push(
        'Foundry Hooks API was unavailable, so summon result capture relied on the activity return value only.'
      );
    }

    try {
      const useResult = await Promise.resolve(
        selectedActivity.use(usageConfig, dialogConfig, messageConfig)
      );
      if (summonedTokens.length === 0) {
        const resultRecord = asRecord(useResult);
        const resultTokens = resultRecord?.tokens ?? resultRecord?.summonedTokens;
        summonedTokens = normalizeCollection<SummonedTokenLike>(resultTokens).filter(
          (token): token is SummonedTokenLike => Boolean(token && typeof token === 'object')
        );
      }
    } catch (error) {
      this.context.auditLog(
        'runDnD5eSummonActivity',
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
    const resolvedProfileId = toStringValue(resolvedProfile?.id);
    const resolvedProfileName = toStringValue(resolvedProfile?.name ?? resolvedProfile?.label);

    const response: FoundryRunDnD5eSummonActivityResponse = {
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
      ...(resolvedProfileId ? { profileId: resolvedProfileId } : {}),
      ...(resolvedProfileName ? { profileName: resolvedProfileName } : {}),
      tokensPlaced: summonedTokens.length,
      tokenIds: summonedTokens
        .map(token => token.id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
      tokenNames: summonedTokens
        .map(token => token.name)
        .filter((name): name is string => typeof name === 'string' && name.length > 0),
      ...(warnings.length > 0 ? { warnings } : {}),
      message:
        summonedTokens.length > 0
          ? `Summoned ${summonedTokens.length} token${summonedTokens.length === 1 ? '' : 's'} from ${
              selectedActivity.name ?? item.name ?? 'the selected summon activity'
            }.`
          : `Summon activity "${selectedActivity.name ?? item.name ?? 'unknown'}" completed, but no tokens were reported back through the DnD5e summon hooks.`,
    };

    this.context.auditLog('runDnD5eSummonActivity', request, 'success');
    return response;
  }
}
