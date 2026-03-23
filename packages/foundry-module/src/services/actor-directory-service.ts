import { MODULE_ID, TOKEN_DISPOSITIONS } from '../constants.js';

interface ActorDirectoryActorLike {
  id?: string;
  name?: string;
  type?: string;
  img?: string;
  hasPlayerOwner?: boolean;
  ownership?: Record<string, number>;
  update?: (data: Record<string, unknown>) => Promise<unknown>;
  testUserPermission?: (user: ActorDirectoryUserLike, permission: string) => boolean;
}

interface ActorDirectoryUserLike {
  id?: string;
  name?: string;
  active?: boolean;
  isGM?: boolean;
}

interface ActorDirectoryTokenLike {
  id?: string;
  name?: string;
  actor?: ActorDirectoryActorLike;
  disposition?: number;
}

interface ActorCollectionLike {
  contents?: unknown[];
  get?: (id: string) => unknown;
  getName?: (name: string) => unknown;
  [Symbol.iterator]?: () => Iterator<unknown>;
}

interface UserCollectionLike {
  get?: (id: string) => unknown;
  getName?: (name: string) => unknown;
  [Symbol.iterator]?: () => Iterator<unknown>;
}

interface SceneCollectionLike {
  find?: (predicate: (scene: unknown) => boolean) => unknown;
}

type OwnershipRecord = {
  id: string;
  name: string;
  type: string;
  ownership: Array<{
    userId: string;
    userName: string;
    permission: string;
    numericPermission: number;
  }>;
};

export interface ActorDirectoryServiceContext {
  validateFoundryState(): void;
}

function getActorsCollection(): ActorCollectionLike | null {
  const collection = game.actors as unknown;
  return collection && typeof collection === 'object' ? (collection as ActorCollectionLike) : null;
}

function getUsersCollection(): UserCollectionLike | null {
  const collection = game.users as unknown;
  return collection && typeof collection === 'object' ? (collection as UserCollectionLike) : null;
}

function toArray(collection: { [Symbol.iterator]?: () => Iterator<unknown> } | null): unknown[] {
  return collection && typeof collection[Symbol.iterator] === 'function'
    ? Array.from(collection as Iterable<unknown>)
    : [];
}

function isActorLike(actor: unknown): actor is ActorDirectoryActorLike {
  return Boolean(actor && typeof actor === 'object');
}

function isUserLike(user: unknown): user is ActorDirectoryUserLike {
  return Boolean(user && typeof user === 'object');
}

function getActorArray(): ActorDirectoryActorLike[] {
  const collection = getActorsCollection();
  if (Array.isArray(collection?.contents)) {
    return collection.contents.filter(isActorLike);
  }

  return toArray(collection).filter(isActorLike);
}

function getUserArray(): ActorDirectoryUserLike[] {
  return toArray(getUsersCollection()).filter(isUserLike);
}

function getActiveSceneTokens(): ActorDirectoryTokenLike[] {
  const scenes = game.scenes as unknown;
  const sceneCollection =
    scenes && typeof scenes === 'object' ? (scenes as SceneCollectionLike) : null;
  const sceneRaw = sceneCollection?.find?.(candidate => {
    if (!candidate || typeof candidate !== 'object') {
      return false;
    }

    return (candidate as { active?: boolean }).active === true;
  });

  if (!sceneRaw || typeof sceneRaw !== 'object') {
    return [];
  }

  const tokensSource = (sceneRaw as { tokens?: unknown }).tokens;
  const tokens = Array.isArray(tokensSource)
    ? tokensSource
    : tokensSource && typeof tokensSource === 'object' && 'contents' in tokensSource
      ? ((tokensSource as { contents?: unknown[] }).contents ?? [])
      : [];

  return tokens.filter((token): token is ActorDirectoryTokenLike =>
    Boolean(token && typeof token === 'object')
  );
}

export class FoundryActorDirectoryService {
  constructor(private readonly context: ActorDirectoryServiceContext) {}

  async setActorOwnership(data: {
    actorId: string;
    userId: string;
    permission: number;
  }): Promise<{ success: boolean; message: string; error?: string }> {
    this.context.validateFoundryState();

    try {
      const actorRaw = getActorsCollection()?.get?.(data.actorId) ?? null;
      const actor = isActorLike(actorRaw) ? actorRaw : null;
      if (!actor) {
        return { success: false, error: `Actor not found: ${data.actorId}`, message: '' };
      }

      const userRaw = getUsersCollection()?.get?.(data.userId) ?? null;
      const user = isUserLike(userRaw) ? userRaw : null;
      if (!user) {
        return { success: false, error: `User not found: ${data.userId}`, message: '' };
      }

      const currentOwnership = actor.ownership ?? {};
      const newOwnership = { ...currentOwnership, [data.userId]: data.permission };
      await actor.update?.({ ownership: newOwnership });

      const permissionNames = { 0: 'NONE', 1: 'LIMITED', 2: 'OBSERVER', 3: 'OWNER' };
      const permissionName =
        permissionNames[data.permission as keyof typeof permissionNames] ??
        data.permission.toString();

      return {
        success: true,
        message: `Set ${actor.name ?? 'Actor'} ownership to ${permissionName} for ${user.name ?? 'User'}`,
      };
    } catch (error) {
      console.error(`[${MODULE_ID}] Error setting actor ownership:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        message: '',
      };
    }
  }

  findActorByIdentifier(identifier: string): ActorDirectoryActorLike | null {
    const actorsCollection = getActorsCollection();

    const byId = actorsCollection?.get?.(identifier);
    if (isActorLike(byId)) {
      return byId;
    }

    const byName = actorsCollection?.getName?.(identifier);
    if (isActorLike(byName)) {
      return byName;
    }

    const searchTerm = identifier.toLowerCase();
    return (
      getActorArray().find(actor => actor.name?.toLowerCase().includes(searchTerm) === true) ?? null
    );
  }

  getActorOwnership(data: {
    actorIdentifier?: string;
    playerIdentifier?: string;
  }): Promise<OwnershipRecord[]> {
    this.context.validateFoundryState();

    try {
      const usersCollection = getUsersCollection();
      const actors = data.actorIdentifier
        ? data.actorIdentifier === 'all'
          ? getActorArray()
          : [this.findActorByIdentifier(data.actorIdentifier)].filter(isActorLike)
        : getActorArray();

      const users = data.playerIdentifier
        ? [
            usersCollection?.getName?.(data.playerIdentifier),
            usersCollection?.get?.(data.playerIdentifier),
          ].filter(isUserLike)
        : getUserArray();

      const ownershipInfo: OwnershipRecord[] = [];
      const permissionNames = { 0: 'NONE', 1: 'LIMITED', 2: 'OBSERVER', 3: 'OWNER' };

      for (const actor of actors) {
        if (!actor.id || !actor.name) {
          continue;
        }

        const actorInfo: OwnershipRecord = {
          id: actor.id,
          name: actor.name,
          type: actor.type ?? 'unknown',
          ownership: [],
        };

        for (const user of users) {
          if (user.isGM) {
            continue;
          }

          const permission = actor.testUserPermission?.(user, 'OWNER')
            ? 3
            : actor.testUserPermission?.(user, 'OBSERVER')
              ? 2
              : actor.testUserPermission?.(user, 'LIMITED')
                ? 1
                : 0;

          actorInfo.ownership.push({
            userId: user.id ?? '',
            userName: user.name ?? 'Unknown',
            permission: permissionNames[permission as keyof typeof permissionNames],
            numericPermission: permission,
          });
        }

        ownershipInfo.push(actorInfo);
      }

      return Promise.resolve(ownershipInfo);
    } catch (error) {
      console.error(`[${MODULE_ID}] Error getting actor ownership:`, error);
      throw error;
    }
  }

  getFriendlyNPCs(): Promise<Array<{ id: string; name: string }>> {
    this.context.validateFoundryState();

    try {
      return Promise.resolve(
        getActiveSceneTokens()
          .filter(token => token.disposition === TOKEN_DISPOSITIONS.FRIENDLY)
          .map(token => ({
            id: token.actor?.id ?? token.id ?? '',
            name: token.name ?? token.actor?.name ?? 'Unknown',
          }))
          .filter(token => token.id.length > 0)
      );
    } catch (error) {
      console.error(`[${MODULE_ID}] Error getting friendly NPCs:`, error);
      return Promise.resolve([]);
    }
  }

  getPartyCharacters(): Promise<Array<{ id: string; name: string }>> {
    this.context.validateFoundryState();

    try {
      return Promise.resolve(
        getActorArray()
          .filter(actor => actor.hasPlayerOwner === true && actor.type === 'character')
          .map(actor => ({
            id: actor.id ?? '',
            name: actor.name ?? 'Unknown',
          }))
          .filter(actor => actor.id.length > 0)
      );
    } catch (error) {
      console.error(`[${MODULE_ID}] Error getting party characters:`, error);
      return Promise.resolve([]);
    }
  }

  getConnectedPlayers(): Promise<Array<{ id: string; name: string }>> {
    this.context.validateFoundryState();

    try {
      return Promise.resolve(
        getUserArray()
          .filter(user => user.active === true && user.isGM !== true)
          .map(user => ({
            id: user.id ?? '',
            name: user.name ?? 'Unknown',
          }))
          .filter(user => user.id.length > 0)
      );
    } catch (error) {
      console.error(`[${MODULE_ID}] Error getting connected players:`, error);
      return Promise.resolve([]);
    }
  }

  findPlayers(data: {
    identifier: string;
    allowPartialMatch?: boolean;
    includeCharacterOwners?: boolean;
  }): Promise<Array<{ id: string; name: string }>> {
    this.context.validateFoundryState();

    try {
      const { identifier, allowPartialMatch = true, includeCharacterOwners = true } = data;
      const searchTerm = identifier.toLowerCase();
      const players: Array<{ id: string; name: string }> = [];
      const users = getUserArray();
      const actors = getActorArray();

      for (const user of users) {
        if (user.isGM) {
          continue;
        }

        const userName = user.name?.toLowerCase() ?? '';
        if (userName === searchTerm || (allowPartialMatch && userName.includes(searchTerm))) {
          players.push({ id: user.id ?? '', name: user.name ?? 'Unknown' });
        }
      }

      if (includeCharacterOwners && players.length === 0) {
        for (const actor of actors) {
          if (actor.type !== 'character') {
            continue;
          }

          const actorName = actor.name?.toLowerCase() ?? '';
          if (actorName !== searchTerm && (!allowPartialMatch || !actorName.includes(searchTerm))) {
            continue;
          }

          const owner =
            users.find(
              user => actor.testUserPermission?.(user, 'OWNER') === true && user.isGM !== true
            ) ?? null;

          if (owner && !players.some(player => player.id === owner.id)) {
            players.push({ id: owner.id ?? '', name: owner.name ?? 'Unknown' });
          }
        }
      }

      return Promise.resolve(players.filter(player => player.id.length > 0));
    } catch (error) {
      console.error(`[${MODULE_ID}] Error finding players:`, error);
      return Promise.resolve([]);
    }
  }

  findActor(data: { identifier: string }): Promise<{ id: string; name: string } | null> {
    this.context.validateFoundryState();

    try {
      const actor = this.findActorByIdentifier(data.identifier);
      return actor?.id && actor.name
        ? Promise.resolve({ id: actor.id, name: actor.name })
        : Promise.resolve(null);
    } catch (error) {
      console.error(`[${MODULE_ID}] Error finding actor:`, error);
      return Promise.resolve(null);
    }
  }
}
