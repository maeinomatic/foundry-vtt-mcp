import { MODULE_ID } from '../constants.js';
import type {
  FoundryCharacterCompanionLink,
  FoundryCharacterCompanionSummary,
  FoundryCharacterCompanionSummonDefaults,
  FoundryCharacterCompanionSyncSettings,
  FoundryCompanionRole,
  FoundryConfigureCharacterCompanionSummonRequest,
  FoundryConfigureCharacterCompanionSummonResponse,
  FoundryCreateCharacterCompanionRequest,
  FoundryCreateCharacterCompanionResponse,
  FoundryDeleteCharacterCompanionRequest,
  FoundryDeleteCharacterCompanionResponse,
  FoundryDismissCharacterCompanionRequest,
  FoundryDismissCharacterCompanionResponse,
  FoundryDismissedCompanionSummary,
  FoundryListCharacterCompanionsRequest,
  FoundryListCharacterCompanionsResponse,
  FoundrySummonCharacterCompanionRequest,
  FoundrySummonCharacterCompanionResponse,
  FoundrySyncCharacterCompanionProgressionRequest,
  FoundrySyncCharacterCompanionProgressionResponse,
  FoundryTokenPlacementCoordinate,
  FoundryUnlinkCharacterCompanionRequest,
  FoundryUnlinkCharacterCompanionResponse,
  FoundryUpdateCharacterCompanionLinkRequest,
  FoundryUpdateCharacterCompanionLinkResponse,
} from '@foundry-mcp/shared';
import type {
  CompendiumEntryActorCreationRequest,
  TokenPlacementResult,
} from './actor-creation-service.js';

type AuditStatus = 'success' | 'failure';

interface CompanionActorLike {
  id?: string;
  name?: string;
  type?: string;
  img?: string;
  system?: Record<string, unknown>;
  ownership?: Record<string, unknown>;
  flags?: Record<string, unknown>;
  update?: (data: Record<string, unknown>) => Promise<unknown>;
  delete?: () => Promise<unknown>;
  toObject?: () => unknown;
}

interface SceneTokenLike {
  id?: string;
  x?: number;
  y?: number;
  actorId?: string;
  actor?: { id?: string; name?: string };
}

interface SceneLike {
  grid?: { size?: number };
  tokens?: unknown;
}

export interface CompanionServiceContext {
  auditLog(action: string, data: unknown, status: AuditStatus, errorMessage?: string): void;
  findActorByIdentifier(identifier: string): CompanionActorLike | null;
  validateFoundryState(): void;
  createActorFromCompendiumEntry(request: CompendiumEntryActorCreationRequest): Promise<{
    actors?: Array<{ id: string; name: string; type: string }>;
  }>;
  addActorsToScene(placement: {
    actorIds: string[];
    placement: 'random' | 'grid' | 'center' | 'coordinates';
    hidden: boolean;
    coordinates?: FoundryTokenPlacementCoordinate[];
  }): Promise<TokenPlacementResult>;
  deleteTokens(data: { tokenIds: string[] }): Promise<{
    success: boolean;
    deletedCount: number;
    deletedTokens: string[];
  }>;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
}

function cloneValue<T>(value: T): T {
  if (Array.isArray(value)) {
    const arrayValue = value as unknown[];
    const clonedArray = arrayValue.map((entry: unknown) => cloneValue(entry));
    return clonedArray as unknown as T;
  }

  if (value && typeof value === 'object') {
    const clonedRecord = Object.entries(value as Record<string, unknown>).reduce<
      Record<string, unknown>
    >((result, [key, entry]) => {
      result[key] = cloneValue(entry);
      return result;
    }, {});
    return clonedRecord as unknown as T;
  }

  return value;
}

function normalizeOptionalText(value: string | undefined): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function getActorsArray(): CompanionActorLike[] {
  const actors = (game as { actors?: unknown }).actors;
  if (Array.isArray(actors)) {
    return actors.filter((actor): actor is CompanionActorLike => Boolean(asRecord(actor)));
  }

  const actorCollection = asRecord(actors);
  if (actorCollection && Array.isArray(actorCollection.contents)) {
    return actorCollection.contents.filter((actor): actor is CompanionActorLike =>
      Boolean(asRecord(actor))
    );
  }

  return [];
}

function getCurrentScene(): SceneLike | null {
  const sceneRaw = (game as { scenes?: { current?: unknown } }).scenes?.current;
  return sceneRaw && typeof sceneRaw === 'object' ? (sceneRaw as SceneLike) : null;
}

function getSceneTokens(scene: SceneLike | null): SceneTokenLike[] {
  if (!scene) {
    return [];
  }

  if (Array.isArray(scene.tokens)) {
    return scene.tokens.filter((token): token is SceneTokenLike => Boolean(asRecord(token)));
  }

  const tokenCollection = asRecord(scene.tokens);
  if (tokenCollection && Array.isArray(tokenCollection.contents)) {
    return tokenCollection.contents.filter((token): token is SceneTokenLike =>
      Boolean(asRecord(token))
    );
  }

  return [];
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

function sanitizeSummonDefaults(
  value: FoundryCharacterCompanionSummonDefaults | undefined
): FoundryCharacterCompanionSummonDefaults | undefined {
  if (!value) {
    return undefined;
  }

  const coordinates =
    Array.isArray(value.coordinates) && value.coordinates.length > 0
      ? value.coordinates.map(entry => ({ x: entry.x, y: entry.y }))
      : undefined;

  const sanitized: FoundryCharacterCompanionSummonDefaults = {
    ...(value.placementType !== undefined ? { placementType: value.placementType } : {}),
    ...(coordinates ? { coordinates } : {}),
    ...(typeof value.hidden === 'boolean' ? { hidden: value.hidden } : {}),
    ...(typeof value.reuseExisting === 'boolean' ? { reuseExisting: value.reuseExisting } : {}),
  };

  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

function sanitizeSyncSettings(
  value: FoundryCharacterCompanionSyncSettings | undefined
): FoundryCharacterCompanionSyncSettings | undefined {
  if (!value) {
    return undefined;
  }

  const sanitized: FoundryCharacterCompanionSyncSettings = {
    ...(typeof value.syncOwnership === 'boolean' ? { syncOwnership: value.syncOwnership } : {}),
    ...(typeof value.refreshFromSource === 'boolean'
      ? { refreshFromSource: value.refreshFromSource }
      : {}),
    ...(typeof value.matchOwnerLevel === 'boolean'
      ? { matchOwnerLevel: value.matchOwnerLevel }
      : {}),
    ...(typeof value.levelOffset === 'number' ? { levelOffset: value.levelOffset } : {}),
  };

  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

function mergeSummonDefaults(
  existing: FoundryCharacterCompanionSummonDefaults | undefined,
  overrides: FoundryCharacterCompanionSummonDefaults | undefined
): FoundryCharacterCompanionSummonDefaults | undefined {
  return sanitizeSummonDefaults({
    ...(existing ?? {}),
    ...(overrides ?? {}),
  });
}

function mergeSyncSettings(
  existing: FoundryCharacterCompanionSyncSettings | undefined,
  overrides: FoundryCharacterCompanionSyncSettings | undefined
): FoundryCharacterCompanionSyncSettings | undefined {
  return sanitizeSyncSettings({
    ...(existing ?? {}),
    ...(overrides ?? {}),
  });
}

function getCompanionLink(actor: CompanionActorLike): FoundryCharacterCompanionLink | null {
  const flags = asRecord(actor.flags);
  const moduleFlags = asRecord(flags?.[MODULE_ID]);
  const companionLink = asRecord(moduleFlags?.companionLink);
  if (!companionLink) {
    return null;
  }

  const ownerActorId =
    typeof companionLink.ownerActorId === 'string' ? companionLink.ownerActorId : null;
  const ownerActorName =
    typeof companionLink.ownerActorName === 'string' ? companionLink.ownerActorName : null;
  const role = companionLink.role;

  if (!ownerActorId || !ownerActorName || (role !== 'companion' && role !== 'familiar')) {
    return null;
  }

  const summonDefaults = sanitizeSummonDefaults(
    asRecord(companionLink.summonDefaults) as FoundryCharacterCompanionSummonDefaults | undefined
  );
  const syncSettings = sanitizeSyncSettings(
    asRecord(companionLink.syncSettings) as FoundryCharacterCompanionSyncSettings | undefined
  );

  return {
    ownerActorId,
    ownerActorName,
    role,
    ...(typeof companionLink.notes === 'string' ? { notes: companionLink.notes } : {}),
    ...(typeof companionLink.sourceUuid === 'string'
      ? { sourceUuid: companionLink.sourceUuid }
      : {}),
    ...(typeof companionLink.linkedAt === 'string' ? { linkedAt: companionLink.linkedAt } : {}),
    ...(summonDefaults ? { summonDefaults } : {}),
    ...(syncSettings ? { syncSettings } : {}),
  };
}

function getTokensForActor(scene: SceneLike | null, actorId: string): SceneTokenLike[] {
  return getSceneTokens(scene).filter(
    token => token.actorId === actorId || token.actor?.id === actorId
  );
}

function calculateNearOwnerCoordinates(
  scene: SceneLike,
  ownerToken: SceneTokenLike,
  existingCount: number
): FoundryTokenPlacementCoordinate[] {
  const gridSize = scene.grid?.size ?? 100;
  const baseX = ownerToken.x ?? 0;
  const baseY = ownerToken.y ?? 0;
  return [
    {
      x: baseX + gridSize * (1 + existingCount),
      y: baseY,
    },
  ];
}

function extractActorLevel(actor: CompanionActorLike): number | null {
  const system = asRecord(actor.system);
  if (!system) {
    return null;
  }

  if (typeof system.level === 'number') {
    return system.level;
  }

  const details = asRecord(system.details);
  const detailsLevel = details?.level;
  if (typeof detailsLevel === 'number') {
    return detailsLevel;
  }

  const detailsLevelRecord = asRecord(detailsLevel);
  if (typeof detailsLevelRecord?.value === 'number') {
    return detailsLevelRecord.value;
  }

  return null;
}

function buildActorLevelUpdate(
  actor: CompanionActorLike,
  targetLevel: number
): Record<string, unknown> | null {
  const system = asRecord(actor.system);
  if (!system) {
    return null;
  }

  const details = asRecord(system.details);
  const detailsLevel = details?.level;

  if (typeof detailsLevel === 'number') {
    return {
      'system.details.level': targetLevel,
    };
  }

  const detailsLevelRecord = asRecord(detailsLevel);
  if (detailsLevelRecord) {
    return {
      'system.details.level.value': targetLevel,
    };
  }

  if (typeof system.level === 'number') {
    return {
      'system.level': targetLevel,
    };
  }

  return null;
}

function getDeleteActorImplementation(): ((ids: string[]) => Promise<unknown>) | null {
  const root = globalThis as {
    Actor?: {
      implementation?: {
        deleteDocuments?: (ids: string[]) => Promise<unknown>;
      };
      deleteDocuments?: (ids: string[]) => Promise<unknown>;
    };
  };

  if (typeof root.Actor?.implementation?.deleteDocuments === 'function') {
    return (ids: string[]): Promise<unknown> => root.Actor!.implementation!.deleteDocuments!(ids);
  }

  if (typeof root.Actor?.deleteDocuments === 'function') {
    return (ids: string[]): Promise<unknown> => root.Actor!.deleteDocuments!(ids);
  }

  return null;
}

type LinkMutationInput = {
  role?: FoundryCompanionRole;
  notes?: string;
  sourceUuid?: string;
  summonDefaults?: FoundryCharacterCompanionSummonDefaults;
  syncSettings?: FoundryCharacterCompanionSyncSettings;
};

export class FoundryCompanionService {
  constructor(private readonly context: CompanionServiceContext) {}

  private async resolveSourceDocument(uuid: string): Promise<Record<string, unknown> | null> {
    const root = globalThis as {
      fromUuid?: (sourceUuid: string) => Promise<unknown>;
    };

    if (typeof root.fromUuid !== 'function') {
      throw new Error('Foundry fromUuid() API is unavailable');
    }

    const resolved = await root.fromUuid(uuid);
    if (!resolved || typeof resolved !== 'object') {
      return null;
    }

    return asRecord((resolved as { toObject?: () => unknown }).toObject?.() ?? resolved) ?? null;
  }

  private async clearCompanionLink(companion: CompanionActorLike): Promise<void> {
    if (typeof companion.update !== 'function') {
      throw new Error('Selected companion actor cannot be updated.');
    }

    await companion.update({
      [`flags.${MODULE_ID}.companionLink`]: null,
    });
  }

  private buildLinkMutation(
    owner: CompanionActorLike,
    companion: CompanionActorLike,
    input: LinkMutationInput
  ): { link: FoundryCharacterCompanionLink; updatedFields: string[]; ownershipSync: boolean } {
    const existingLink = getCompanionLink(companion);
    if (existingLink && owner.id && existingLink.ownerActorId !== owner.id) {
      throw new Error(
        `Actor "${companion.name}" is already linked to "${existingLink.ownerActorName}".`
      );
    }

    const updatedFields: string[] = [];
    const role = input.role ?? existingLink?.role;
    if (!role) {
      throw new Error('Companion role is required.');
    }

    if (input.role !== undefined && input.role !== existingLink?.role) {
      updatedFields.push('role');
    }

    const notesDefined = 'notes' in input;
    const normalizedNotes = notesDefined ? normalizeOptionalText(input.notes) : existingLink?.notes;
    if (notesDefined) {
      updatedFields.push('notes');
    }

    const sourceDefined = 'sourceUuid' in input;
    const normalizedSourceUuid = sourceDefined
      ? normalizeOptionalText(input.sourceUuid)
      : existingLink?.sourceUuid;
    if (sourceDefined) {
      updatedFields.push('sourceUuid');
    }

    const summonDefaults =
      input.summonDefaults !== undefined
        ? mergeSummonDefaults(existingLink?.summonDefaults, input.summonDefaults)
        : existingLink?.summonDefaults;
    if (input.summonDefaults !== undefined) {
      updatedFields.push('summonDefaults');
    }

    const syncSettings =
      input.syncSettings !== undefined
        ? mergeSyncSettings(existingLink?.syncSettings, input.syncSettings)
        : existingLink?.syncSettings;
    if (input.syncSettings !== undefined) {
      updatedFields.push('syncSettings');
    }

    const link: FoundryCharacterCompanionLink = {
      ownerActorId: owner.id ?? '',
      ownerActorName: owner.name ?? 'Unknown',
      role,
      linkedAt: existingLink?.linkedAt ?? new Date().toISOString(),
      ...(normalizedNotes ? { notes: normalizedNotes } : {}),
      ...(normalizedSourceUuid ? { sourceUuid: normalizedSourceUuid } : {}),
      ...(summonDefaults ? { summonDefaults } : {}),
      ...(syncSettings ? { syncSettings } : {}),
    };

    return {
      link,
      updatedFields: Array.from(new Set(updatedFields)),
      ownershipSync: syncSettings?.syncOwnership === true,
    };
  }

  private async writeCompanionLink(
    owner: CompanionActorLike,
    companion: CompanionActorLike,
    input: LinkMutationInput
  ): Promise<{
    link: FoundryCharacterCompanionLink;
    updatedFields: string[];
  }> {
    if (!companion.id || !companion.name || typeof companion.update !== 'function') {
      throw new Error('Selected companion actor cannot be updated.');
    }

    const mutation = this.buildLinkMutation(owner, companion, input);
    const updates: Record<string, unknown> = {
      [`flags.${MODULE_ID}.companionLink`]: mutation.link,
    };

    if (mutation.ownershipSync && owner.ownership) {
      updates.ownership = owner.ownership;
      mutation.updatedFields.push('ownership');
    }

    await companion.update(updates);

    return {
      link: mutation.link,
      updatedFields: Array.from(new Set(mutation.updatedFields)),
    };
  }

  private findLinkedCompanions(
    owner: CompanionActorLike,
    role?: FoundryCompanionRole
  ): Array<{ actor: CompanionActorLike; link: FoundryCharacterCompanionLink }> {
    if (!owner.id) {
      return [];
    }

    return getActorsArray()
      .map(actor => ({ actor, link: getCompanionLink(actor) }))
      .filter(
        (entry): entry is { actor: CompanionActorLike; link: FoundryCharacterCompanionLink } =>
          entry.link !== null &&
          entry.link.ownerActorId === owner.id &&
          (role === undefined || entry.link.role === role)
      );
  }

  private resolveLinkedCompanion(
    owner: CompanionActorLike,
    companionIdentifier: string
  ): { actor: CompanionActorLike; link: FoundryCharacterCompanionLink } {
    const target = companionIdentifier.toLowerCase();
    const linkedCompanions = this.findLinkedCompanions(owner);
    const match = linkedCompanions.find(
      entry =>
        entry.actor.id?.toLowerCase() === target || entry.actor.name?.toLowerCase() === target
    );

    if (!match) {
      throw new Error(
        `No linked companion matching "${companionIdentifier}" was found for "${owner.name ?? owner.id ?? 'unknown'}".`
      );
    }

    return match;
  }

  private summarizeCompanion(
    actor: CompanionActorLike,
    link: FoundryCharacterCompanionLink,
    scene: SceneLike | null
  ): FoundryCharacterCompanionSummary {
    const tokenIds = actor.id
      ? getTokensForActor(scene, actor.id)
          .map(token => token.id)
          .filter((id): id is string => typeof id === 'string' && id.length > 0)
      : [];

    return {
      actorId: actor.id ?? '',
      actorName: actor.name ?? 'Unknown',
      actorType: actor.type ?? 'unknown',
      role: link.role,
      ownerActorId: link.ownerActorId,
      ownerActorName: link.ownerActorName,
      ...(link.notes ? { notes: link.notes } : {}),
      ...(link.sourceUuid ? { sourceUuid: link.sourceUuid } : {}),
      ...(link.linkedAt ? { linkedAt: link.linkedAt } : {}),
      ...(link.summonDefaults ? { summonDefaults: link.summonDefaults } : {}),
      ...(link.syncSettings ? { syncSettings: link.syncSettings } : {}),
      onScene: tokenIds.length > 0,
      tokenIds,
    };
  }

  async createCharacterCompanion(
    request: FoundryCreateCharacterCompanionRequest
  ): Promise<FoundryCreateCharacterCompanionResponse> {
    this.context.validateFoundryState();

    const owner = this.context.findActorByIdentifier(request.ownerActorIdentifier);
    if (!owner) {
      throw new Error(`Owner actor not found: ${request.ownerActorIdentifier}`);
    }

    if (owner.type !== 'character') {
      throw new Error('Character companions can only be linked to character actors.');
    }

    let companion: CompanionActorLike | null = null;
    let created = false;

    if (request.sourceUuid) {
      const parsedUuid = parseCompendiumUuid(request.sourceUuid);
      if (!parsedUuid) {
        throw new Error(
          'create-character-companion currently requires a compendium Actor UUID when sourceUuid is used.'
        );
      }

      const creationResult = await this.context.createActorFromCompendiumEntry({
        packId: parsedUuid.packId,
        itemId: parsedUuid.documentId,
        customNames: [request.customName ?? 'Companion'],
        quantity: 1,
        addToScene: false,
      });
      const createdActor = creationResult.actors?.[0];
      companion = createdActor ? this.context.findActorByIdentifier(createdActor.id) : null;
      created = true;
    } else if (request.existingActorIdentifier) {
      companion = this.context.findActorByIdentifier(request.existingActorIdentifier);
    } else {
      throw new Error('Provide sourceUuid or existingActorIdentifier.');
    }

    if (!companion) {
      throw new Error('Companion actor could not be resolved.');
    }

    if (owner.id && companion.id && owner.id === companion.id) {
      throw new Error('An actor cannot be linked as its own companion.');
    }

    const summonDefaults = sanitizeSummonDefaults({
      ...(request.placement?.type !== undefined ? { placementType: request.placement.type } : {}),
      ...(request.placement?.coordinates !== undefined
        ? { coordinates: request.placement.coordinates }
        : {}),
    });
    const syncSettings = sanitizeSyncSettings({
      syncOwnership: request.syncOwnership ?? true,
    });
    const linkResult = await this.writeCompanionLink(owner, companion, {
      role: request.role,
      ...(request.notes !== undefined ? { notes: request.notes } : {}),
      ...(request.sourceUuid !== undefined ? { sourceUuid: request.sourceUuid } : {}),
      ...(summonDefaults ? { summonDefaults } : {}),
      ...(syncSettings ? { syncSettings } : {}),
    });

    const warnings: string[] = [];
    let tokensPlaced = 0;
    let tokenIds: string[] = [];

    if (request.addToScene === true) {
      const summonResult = await this.summonCharacterCompanion({
        ownerActorIdentifier: owner.id ?? request.ownerActorIdentifier,
        companionIdentifier:
          companion.id ?? companion.name ?? request.existingActorIdentifier ?? '',
        placementType: request.placement?.type ?? 'near-owner',
        reuseExisting: true,
        ...(request.placement?.coordinates ? { coordinates: request.placement.coordinates } : {}),
      });

      tokensPlaced = summonResult.tokensPlaced;
      tokenIds = summonResult.tokenIds;
      if (summonResult.warnings?.length) {
        warnings.push(...summonResult.warnings);
      }
    }

    const response: FoundryCreateCharacterCompanionResponse = {
      success: true,
      ownerActorId: owner.id ?? '',
      ownerActorName: owner.name ?? request.ownerActorIdentifier,
      companionActorId: companion.id ?? '',
      companionActorName: companion.name ?? request.existingActorIdentifier ?? 'Unknown',
      companionActorType: companion.type ?? 'unknown',
      role: linkResult.link.role,
      created,
      ...(linkResult.link.sourceUuid ? { sourceUuid: linkResult.link.sourceUuid } : {}),
      ...(linkResult.link.linkedAt ? { linkedAt: linkResult.link.linkedAt } : {}),
      ...(linkResult.link.summonDefaults ? { summonDefaults: linkResult.link.summonDefaults } : {}),
      ...(linkResult.link.syncSettings ? { syncSettings: linkResult.link.syncSettings } : {}),
      ...(tokensPlaced > 0 ? { tokensPlaced } : {}),
      ...(tokenIds.length > 0 ? { tokenIds } : {}),
      ...(warnings.length > 0 ? { warnings } : {}),
    };

    this.context.auditLog('createCharacterCompanion', request, 'success');
    return response;
  }

  listCharacterCompanions(
    request: FoundryListCharacterCompanionsRequest
  ): Promise<FoundryListCharacterCompanionsResponse> {
    this.context.validateFoundryState();

    const owner = this.context.findActorByIdentifier(request.ownerActorIdentifier);
    if (!owner) {
      throw new Error(`Owner actor not found: ${request.ownerActorIdentifier}`);
    }

    const scene = getCurrentScene();
    const companions = this.findLinkedCompanions(owner, request.role).map(entry =>
      this.summarizeCompanion(entry.actor, entry.link, scene)
    );

    return Promise.resolve({
      ownerActorId: owner.id ?? '',
      ownerActorName: owner.name ?? request.ownerActorIdentifier,
      companions,
      totalCompanions: companions.length,
    });
  }

  async updateCharacterCompanionLink(
    request: FoundryUpdateCharacterCompanionLinkRequest
  ): Promise<FoundryUpdateCharacterCompanionLinkResponse> {
    this.context.validateFoundryState();

    const owner = this.context.findActorByIdentifier(request.ownerActorIdentifier);
    if (!owner) {
      throw new Error(`Owner actor not found: ${request.ownerActorIdentifier}`);
    }

    const { actor: companion } = this.resolveLinkedCompanion(owner, request.companionIdentifier);
    const linkResult = await this.writeCompanionLink(owner, companion, {
      ...(request.role !== undefined ? { role: request.role } : {}),
      ...(request.notes !== undefined ? { notes: request.notes } : {}),
      ...(request.sourceUuid !== undefined ? { sourceUuid: request.sourceUuid } : {}),
      ...(request.syncSettings !== undefined ? { syncSettings: request.syncSettings } : {}),
    });

    this.context.auditLog('updateCharacterCompanionLink', request, 'success');

    return {
      success: true,
      ownerActorId: owner.id ?? '',
      ownerActorName: owner.name ?? request.ownerActorIdentifier,
      companionActorId: companion.id ?? '',
      companionActorName: companion.name ?? request.companionIdentifier,
      companionActorType: companion.type ?? 'unknown',
      role: linkResult.link.role,
      ...(linkResult.link.linkedAt ? { linkedAt: linkResult.link.linkedAt } : {}),
      ...(linkResult.link.sourceUuid ? { sourceUuid: linkResult.link.sourceUuid } : {}),
      ...(linkResult.link.notes ? { notes: linkResult.link.notes } : {}),
      ...(linkResult.link.summonDefaults ? { summonDefaults: linkResult.link.summonDefaults } : {}),
      ...(linkResult.link.syncSettings ? { syncSettings: linkResult.link.syncSettings } : {}),
      updatedFields: linkResult.updatedFields,
    };
  }

  async configureCharacterCompanionSummon(
    request: FoundryConfigureCharacterCompanionSummonRequest
  ): Promise<FoundryConfigureCharacterCompanionSummonResponse> {
    this.context.validateFoundryState();

    const owner = this.context.findActorByIdentifier(request.ownerActorIdentifier);
    if (!owner) {
      throw new Error(`Owner actor not found: ${request.ownerActorIdentifier}`);
    }

    const { actor: companion } = this.resolveLinkedCompanion(owner, request.companionIdentifier);
    const summonDefaults = sanitizeSummonDefaults({
      ...(request.placementType !== undefined ? { placementType: request.placementType } : {}),
      ...(request.coordinates !== undefined ? { coordinates: request.coordinates } : {}),
      ...(request.hidden !== undefined ? { hidden: request.hidden } : {}),
      ...(request.reuseExisting !== undefined ? { reuseExisting: request.reuseExisting } : {}),
    });

    if (!summonDefaults) {
      throw new Error('Provide at least one summon configuration field to update.');
    }

    const linkResult = await this.writeCompanionLink(owner, companion, {
      summonDefaults,
    });

    this.context.auditLog('configureCharacterCompanionSummon', request, 'success');

    return {
      success: true,
      ownerActorId: owner.id ?? '',
      ownerActorName: owner.name ?? request.ownerActorIdentifier,
      companionActorId: companion.id ?? '',
      companionActorName: companion.name ?? request.companionIdentifier,
      role: linkResult.link.role,
      summonDefaults: linkResult.link.summonDefaults ?? {},
      updatedFields: linkResult.updatedFields,
    };
  }

  async summonCharacterCompanion(
    request: FoundrySummonCharacterCompanionRequest
  ): Promise<FoundrySummonCharacterCompanionResponse> {
    this.context.validateFoundryState();

    const owner = this.context.findActorByIdentifier(request.ownerActorIdentifier);
    if (!owner) {
      throw new Error(`Owner actor not found: ${request.ownerActorIdentifier}`);
    }

    const { actor: companion, link } = this.resolveLinkedCompanion(
      owner,
      request.companionIdentifier
    );
    if (!companion.id) {
      throw new Error('Linked companion actor is missing an ID.');
    }

    const scene = getCurrentScene();
    if (!scene) {
      throw new Error('No active scene found.');
    }

    const effectivePlacementType = request.placementType ?? link.summonDefaults?.placementType;
    const effectiveCoordinates = request.coordinates ?? link.summonDefaults?.coordinates;
    const effectiveHidden = request.hidden ?? link.summonDefaults?.hidden ?? false;
    const effectiveReuseExisting =
      request.reuseExisting ?? link.summonDefaults?.reuseExisting ?? true;
    const existingTokens = getTokensForActor(scene, companion.id);

    if (effectiveReuseExisting && existingTokens.length > 0) {
      return {
        success: true,
        ownerActorId: owner.id ?? '',
        ownerActorName: owner.name ?? request.ownerActorIdentifier,
        companionActorId: companion.id,
        companionActorName: companion.name ?? request.companionIdentifier,
        role: link.role,
        tokensPlaced: 0,
        tokenIds: existingTokens
          .map(token => token.id)
          .filter((id): id is string => typeof id === 'string' && id.length > 0),
        reusedExisting: true,
      };
    }

    let placement: 'random' | 'grid' | 'center' | 'coordinates' = 'grid';
    let coordinates = effectiveCoordinates;
    const warnings: string[] = [];

    if (effectivePlacementType === undefined || effectivePlacementType === 'near-owner') {
      const ownerTokens = owner.id ? getTokensForActor(scene, owner.id) : [];
      if (ownerTokens.length > 0) {
        placement = 'coordinates';
        coordinates = calculateNearOwnerCoordinates(scene, ownerTokens[0], existingTokens.length);
      } else {
        placement = 'grid';
        warnings.push('Owner token was not found on the active scene, so grid placement was used.');
      }
    } else if (effectivePlacementType === 'coordinates') {
      if (!coordinates || coordinates.length === 0) {
        throw new Error('Coordinates are required when placementType is coordinates.');
      }
      placement = 'coordinates';
    } else {
      placement = effectivePlacementType;
    }

    const placementResult = await this.context.addActorsToScene({
      actorIds: [companion.id],
      placement,
      hidden: effectiveHidden,
      ...(coordinates ? { coordinates } : {}),
    });

    return {
      success: placementResult.success,
      ownerActorId: owner.id ?? '',
      ownerActorName: owner.name ?? request.ownerActorIdentifier,
      companionActorId: companion.id,
      companionActorName: companion.name ?? request.companionIdentifier,
      role: link.role,
      tokensPlaced: placementResult.tokensCreated,
      tokenIds: placementResult.tokenIds,
      ...(warnings.length > 0 ? { warnings } : {}),
    };
  }

  async dismissCharacterCompanion(
    request: FoundryDismissCharacterCompanionRequest
  ): Promise<FoundryDismissCharacterCompanionResponse> {
    this.context.validateFoundryState();

    const owner = this.context.findActorByIdentifier(request.ownerActorIdentifier);
    if (!owner) {
      throw new Error(`Owner actor not found: ${request.ownerActorIdentifier}`);
    }

    const scene = getCurrentScene();
    if (!scene) {
      throw new Error('No active scene found.');
    }

    const linkedCompanions =
      request.companionIdentifier !== undefined
        ? [this.resolveLinkedCompanion(owner, request.companionIdentifier)]
        : this.findLinkedCompanions(owner, request.role);

    if (linkedCompanions.length === 0) {
      return {
        success: true,
        ownerActorId: owner.id ?? '',
        ownerActorName: owner.name ?? request.ownerActorIdentifier,
        dismissedCompanions: [],
        dismissedTokenCount: 0,
      };
    }

    if (
      !request.dismissAll &&
      request.companionIdentifier === undefined &&
      linkedCompanions.length > 1
    ) {
      throw new Error(
        'Multiple linked companions were found. Provide companionIdentifier or set dismissAll to true.'
      );
    }

    const dismissedCompanions: FoundryDismissedCompanionSummary[] = [];
    let dismissedTokenCount = 0;

    for (const entry of linkedCompanions) {
      const tokenIds = entry.actor.id
        ? getTokensForActor(scene, entry.actor.id)
            .map(token => token.id)
            .filter((id): id is string => typeof id === 'string' && id.length > 0)
        : [];

      if (tokenIds.length > 0) {
        await this.context.deleteTokens({ tokenIds });
      }

      dismissedTokenCount += tokenIds.length;
      dismissedCompanions.push({
        actorId: entry.actor.id ?? '',
        actorName: entry.actor.name ?? 'Unknown',
        role: entry.link.role,
        tokenIds,
      });
    }

    return {
      success: true,
      ownerActorId: owner.id ?? '',
      ownerActorName: owner.name ?? request.ownerActorIdentifier,
      dismissedCompanions,
      dismissedTokenCount,
    };
  }

  async unlinkCharacterCompanion(
    request: FoundryUnlinkCharacterCompanionRequest
  ): Promise<FoundryUnlinkCharacterCompanionResponse> {
    this.context.validateFoundryState();

    const owner = this.context.findActorByIdentifier(request.ownerActorIdentifier);
    if (!owner) {
      throw new Error(`Owner actor not found: ${request.ownerActorIdentifier}`);
    }

    const { actor: companion, link } = this.resolveLinkedCompanion(
      owner,
      request.companionIdentifier
    );
    await this.clearCompanionLink(companion);

    this.context.auditLog('unlinkCharacterCompanion', request, 'success');

    return {
      success: true,
      ownerActorId: owner.id ?? '',
      ownerActorName: owner.name ?? request.ownerActorIdentifier,
      companionActorId: companion.id ?? '',
      companionActorName: companion.name ?? request.companionIdentifier,
      role: link.role,
      unlinked: true,
    };
  }

  async deleteCharacterCompanion(
    request: FoundryDeleteCharacterCompanionRequest
  ): Promise<FoundryDeleteCharacterCompanionResponse> {
    this.context.validateFoundryState();

    const owner = this.context.findActorByIdentifier(request.ownerActorIdentifier);
    if (!owner) {
      throw new Error(`Owner actor not found: ${request.ownerActorIdentifier}`);
    }

    const { actor: companion, link } = this.resolveLinkedCompanion(
      owner,
      request.companionIdentifier
    );
    if (!companion.id) {
      throw new Error('Linked companion actor is missing an ID.');
    }

    const warnings: string[] = [];
    let dismissedTokenIds: string[] = [];
    let dismissedTokenCount = 0;

    if (request.dismissSceneTokens !== false) {
      const scene = getCurrentScene();
      dismissedTokenIds = scene
        ? getTokensForActor(scene, companion.id)
            .map(token => token.id)
            .filter((id): id is string => typeof id === 'string' && id.length > 0)
        : [];

      if (dismissedTokenIds.length > 0) {
        await this.context.deleteTokens({ tokenIds: dismissedTokenIds });
      }

      dismissedTokenCount = dismissedTokenIds.length;
    }

    if (typeof companion.delete === 'function') {
      await companion.delete();
    } else {
      const deleteDocuments = getDeleteActorImplementation();
      if (!deleteDocuments) {
        throw new Error('Foundry actor deletion API is unavailable.');
      }
      await deleteDocuments([companion.id]);
    }

    this.context.auditLog('deleteCharacterCompanion', request, 'success');

    return {
      success: true,
      ownerActorId: owner.id ?? '',
      ownerActorName: owner.name ?? request.ownerActorIdentifier,
      companionActorId: companion.id,
      companionActorName: companion.name ?? request.companionIdentifier,
      role: link.role,
      actorDeleted: true,
      dismissedTokenCount,
      ...(dismissedTokenIds.length > 0 ? { dismissedTokenIds } : {}),
      ...(warnings.length > 0 ? { warnings } : {}),
    };
  }

  async syncCharacterCompanionProgression(
    request: FoundrySyncCharacterCompanionProgressionRequest
  ): Promise<FoundrySyncCharacterCompanionProgressionResponse> {
    this.context.validateFoundryState();

    const owner = this.context.findActorByIdentifier(request.ownerActorIdentifier);
    if (!owner) {
      throw new Error(`Owner actor not found: ${request.ownerActorIdentifier}`);
    }

    const { actor: companion, link } = this.resolveLinkedCompanion(
      owner,
      request.companionIdentifier
    );
    if (typeof companion.update !== 'function') {
      throw new Error('Selected companion actor cannot be updated.');
    }

    const effectiveSync = mergeSyncSettings(link.syncSettings, {
      ...(request.syncOwnership !== undefined ? { syncOwnership: request.syncOwnership } : {}),
      ...(request.refreshFromSource !== undefined
        ? { refreshFromSource: request.refreshFromSource }
        : {}),
      ...(request.matchOwnerLevel !== undefined
        ? { matchOwnerLevel: request.matchOwnerLevel }
        : {}),
      ...(request.levelOffset !== undefined ? { levelOffset: request.levelOffset } : {}),
    });

    if (!effectiveSync) {
      throw new Error('No sync operations were requested or configured for this companion link.');
    }

    const appliedOperations: string[] = [];
    const updatedFields: string[] = [];
    const warnings: string[] = [];

    if (effectiveSync.refreshFromSource) {
      if (!link.sourceUuid) {
        warnings.push(
          'No sourceUuid is stored on this companion link, so source refresh was skipped.'
        );
      } else {
        const sourceDocument = await this.resolveSourceDocument(link.sourceUuid);
        if (!sourceDocument) {
          warnings.push(`Source UUID could not be resolved: ${link.sourceUuid}`);
        } else {
          const sourceUpdates: Record<string, unknown> = {};
          if (typeof sourceDocument.img === 'string') {
            sourceUpdates.img = sourceDocument.img;
            updatedFields.push('img');
          }

          const sourceSystem = asRecord(sourceDocument.system);
          if (sourceSystem) {
            sourceUpdates.system = cloneValue(sourceSystem);
            updatedFields.push('system');
          }

          const sourcePrototypeToken = asRecord(sourceDocument.prototypeToken);
          if (sourcePrototypeToken) {
            sourceUpdates.prototypeToken = cloneValue(sourcePrototypeToken);
            updatedFields.push('prototypeToken');
          }

          if (Object.keys(sourceUpdates).length > 0) {
            await companion.update(sourceUpdates);
            appliedOperations.push('refreshFromSource');
          } else {
            warnings.push('Source refresh did not provide any updatable companion fields.');
          }
        }
      }
    }

    const secondaryUpdates: Record<string, unknown> = {};

    if (effectiveSync.syncOwnership) {
      if (owner.ownership) {
        secondaryUpdates.ownership = owner.ownership;
        updatedFields.push('ownership');
        appliedOperations.push('syncOwnership');
      } else {
        warnings.push('Owner actor has no ownership data to copy.');
      }
    }

    if (effectiveSync.matchOwnerLevel) {
      const ownerLevel = extractActorLevel(owner);
      if (ownerLevel === null) {
        warnings.push('Owner actor does not expose a recognized level field.');
      } else {
        const targetLevel = ownerLevel + (effectiveSync.levelOffset ?? 0);
        const levelUpdate = buildActorLevelUpdate(companion, targetLevel);
        if (levelUpdate) {
          Object.assign(secondaryUpdates, levelUpdate);
          updatedFields.push(...Object.keys(levelUpdate));
          appliedOperations.push('matchOwnerLevel');
        } else {
          warnings.push('Companion actor does not expose a recognized level field.');
        }
      }
    }

    if (Object.keys(secondaryUpdates).length > 0) {
      await companion.update(secondaryUpdates);
    }

    if (appliedOperations.length === 0) {
      warnings.push('No companion sync operations were applied.');
    }

    this.context.auditLog('syncCharacterCompanionProgression', request, 'success');

    return {
      success: true,
      ownerActorId: owner.id ?? '',
      ownerActorName: owner.name ?? request.ownerActorIdentifier,
      companionActorId: companion.id ?? '',
      companionActorName: companion.name ?? request.companionIdentifier,
      role: link.role,
      appliedOperations,
      updatedFields: Array.from(new Set(updatedFields)),
      ...(warnings.length > 0 ? { warnings } : {}),
    };
  }
}
