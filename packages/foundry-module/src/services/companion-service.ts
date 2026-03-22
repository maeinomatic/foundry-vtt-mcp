import { MODULE_ID } from '../constants.js';
import type {
  FoundryCharacterCompanionLink,
  FoundryCharacterCompanionSummary,
  FoundryCompanionRole,
  FoundryCreateCharacterCompanionRequest,
  FoundryCreateCharacterCompanionResponse,
  FoundryDismissCharacterCompanionRequest,
  FoundryDismissCharacterCompanionResponse,
  FoundryDismissedCompanionSummary,
  FoundryListCharacterCompanionsRequest,
  FoundryListCharacterCompanionsResponse,
  FoundrySummonCharacterCompanionRequest,
  FoundrySummonCharacterCompanionResponse,
  FoundryTokenPlacementCoordinate,
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
  ownership?: Record<string, unknown>;
  flags?: Record<string, unknown>;
  update?: (data: Record<string, unknown>) => Promise<unknown>;
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

  return {
    ownerActorId,
    ownerActorName,
    role,
    ...(typeof companionLink.notes === 'string' ? { notes: companionLink.notes } : {}),
    ...(typeof companionLink.sourceUuid === 'string'
      ? { sourceUuid: companionLink.sourceUuid }
      : {}),
    ...(typeof companionLink.linkedAt === 'string' ? { linkedAt: companionLink.linkedAt } : {}),
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

export class FoundryCompanionService {
  constructor(private readonly context: CompanionServiceContext) {}

  private async updateCompanionLink(
    owner: CompanionActorLike,
    companion: CompanionActorLike,
    request: Pick<
      FoundryCreateCharacterCompanionRequest,
      'notes' | 'role' | 'sourceUuid' | 'syncOwnership'
    >
  ): Promise<FoundryCharacterCompanionLink> {
    if (!companion.id || !companion.name || typeof companion.update !== 'function') {
      throw new Error('Selected companion actor cannot be updated.');
    }

    const existingLink = getCompanionLink(companion);
    if (existingLink && owner.id && existingLink.ownerActorId !== owner.id) {
      throw new Error(
        `Actor "${companion.name}" is already linked to "${existingLink.ownerActorName}".`
      );
    }

    const linkedAt = existingLink?.linkedAt ?? new Date().toISOString();
    const link: FoundryCharacterCompanionLink = {
      ownerActorId: owner.id ?? '',
      ownerActorName: owner.name ?? 'Unknown',
      role: request.role,
      linkedAt,
      ...(request.notes ? { notes: request.notes } : {}),
      ...(request.sourceUuid ? { sourceUuid: request.sourceUuid } : {}),
    };

    const updates: Record<string, unknown> = {
      [`flags.${MODULE_ID}.companionLink`]: link,
    };

    if (request.syncOwnership !== false && owner.ownership) {
      updates.ownership = owner.ownership;
    }

    await companion.update(updates);
    return link;
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

    const link = await this.updateCompanionLink(owner, companion, request);
    const warnings: string[] = [];
    let tokensPlaced = 0;
    let tokenIds: string[] = [];

    if (request.addToScene === true) {
      const summonResult = await this.summonCharacterCompanion({
        ownerActorIdentifier: owner.id ?? request.ownerActorIdentifier,
        companionIdentifier:
          companion.id ?? companion.name ?? request.existingActorIdentifier ?? '',
        placementType: request.placement?.type ?? 'near-owner',
        hidden: false,
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
      role: link.role,
      created,
      ...(link.linkedAt ? { linkedAt: link.linkedAt } : {}),
      ...(request.sourceUuid ? { sourceUuid: request.sourceUuid } : {}),
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
    const companions: FoundryCharacterCompanionSummary[] = this.findLinkedCompanions(
      owner,
      request.role
    ).map(entry => {
      const tokenIds = entry.actor.id ? getTokensForActor(scene, entry.actor.id) : [];
      return {
        actorId: entry.actor.id ?? '',
        actorName: entry.actor.name ?? 'Unknown',
        actorType: entry.actor.type ?? 'unknown',
        role: entry.link.role,
        ownerActorId: entry.link.ownerActorId,
        ownerActorName: entry.link.ownerActorName,
        ...(entry.link.notes ? { notes: entry.link.notes } : {}),
        ...(entry.link.sourceUuid ? { sourceUuid: entry.link.sourceUuid } : {}),
        ...(entry.link.linkedAt ? { linkedAt: entry.link.linkedAt } : {}),
        onScene: tokenIds.length > 0,
        tokenIds: tokenIds
          .map(token => token.id)
          .filter((id): id is string => typeof id === 'string' && id.length > 0),
      };
    });

    return Promise.resolve({
      ownerActorId: owner.id ?? '',
      ownerActorName: owner.name ?? request.ownerActorIdentifier,
      companions,
      totalCompanions: companions.length,
    });
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

    const existingTokens = getTokensForActor(scene, companion.id);
    if (request.reuseExisting !== false && existingTokens.length > 0) {
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
    let coordinates = request.coordinates;
    const warnings: string[] = [];
    if (request.placementType === 'near-owner' || request.placementType === undefined) {
      const ownerTokens = owner.id ? getTokensForActor(scene, owner.id) : [];
      if (ownerTokens.length > 0) {
        placement = 'coordinates';
        coordinates = calculateNearOwnerCoordinates(scene, ownerTokens[0], existingTokens.length);
      } else {
        placement = 'grid';
        warnings.push('Owner token was not found on the active scene, so grid placement was used.');
      }
    } else {
      placement = request.placementType;
    }

    const placementResult = await this.context.addActorsToScene({
      actorIds: [companion.id],
      placement,
      hidden: request.hidden ?? false,
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
}
