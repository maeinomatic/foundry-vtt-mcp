import { ERROR_MESSAGES, TOKEN_DISPOSITIONS } from '../constants.js';
import type { FoundryWorldDetails } from '@foundry-mcp/shared';

export interface SceneTokenSummary {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  actorId?: string | undefined;
  img: string;
  hidden: boolean;
  disposition: number;
}

export interface SceneNoteSummary {
  id: string;
  text: string;
  x: number;
  y: number;
}

export interface SceneInfo {
  id: string;
  name: string;
  img?: string;
  background?: string;
  width: number;
  height: number;
  padding: number;
  active: boolean;
  navigation: boolean;
  tokens: SceneTokenSummary[];
  walls: number;
  lights: number;
  sounds: number;
  notes: SceneNoteSummary[];
}

export type WorldInfo = FoundryWorldDetails;

export interface AvailablePackSummary {
  id: string;
  label: string;
  type?: string;
  system?: string;
  private?: boolean;
}

interface SceneWithCollections {
  id?: string;
  name?: string;
  img?: string;
  background?: { src?: string } | string;
  width?: number;
  height?: number;
  active?: boolean;
  navigation?: boolean;
  walls?: { size?: number };
  lights?: { size?: number };
  sounds?: { size?: number };
  tokens?: Iterable<unknown>;
  notes?: Iterable<unknown>;
  padding?: number;
}

interface WorldUserSummary {
  id?: string;
  name?: string;
  active?: boolean;
  isGM?: boolean;
}

interface PackSummaryLike {
  metadata?: {
    id?: string;
    label?: string;
    type?: string;
    system?: string;
    private?: boolean;
  };
}

export interface WorldAccessContext {
  validateFoundryState(): void;
}

function isIterable(value: unknown): value is Iterable<unknown> {
  return Boolean(value && typeof value === 'object' && Symbol.iterator in value);
}

function getTokenDisposition(disposition: unknown): number {
  return typeof disposition === 'number' ? disposition : TOKEN_DISPOSITIONS.NEUTRAL;
}

export class FoundryWorldAccess {
  constructor(private readonly context: WorldAccessContext) {}

  listActors(): Promise<Array<{ id: string; name: string; type: string; img?: string }>> {
    const actorsSource: unknown = game.actors;
    const actors =
      actorsSource &&
      typeof actorsSource === 'object' &&
      Symbol.iterator in (actorsSource as Record<string, unknown>)
        ? Array.from(actorsSource as Iterable<unknown>).filter(
            (
              actor
            ): actor is {
              id?: string;
              name?: string;
              type?: string;
              img?: string;
            } => Boolean(actor && typeof actor === 'object')
          )
        : [];

    return Promise.resolve(
      actors.map(actor => ({
        id: actor.id ?? '',
        name: actor.name ?? '',
        type: actor.type ?? 'unknown',
        ...(actor.img ? { img: actor.img } : {}),
      }))
    );
  }

  getActiveScene(): Promise<SceneInfo> {
    const sceneCollection = game.scenes as { current?: unknown } | null | undefined;
    const sceneRaw = sceneCollection?.current;
    const scene =
      sceneRaw && typeof sceneRaw === 'object' ? (sceneRaw as SceneWithCollections) : null;
    if (!scene) {
      throw new Error(ERROR_MESSAGES.SCENE_NOT_FOUND);
    }

    const tokens = isIterable(scene.tokens)
      ? Array.from(scene.tokens).filter(
          (
            token
          ): token is {
            id?: string;
            name?: string;
            x?: number;
            y?: number;
            width?: number;
            height?: number;
            actorId?: string;
            texture?: { src?: string };
            hidden?: boolean;
            disposition?: unknown;
          } => Boolean(token && typeof token === 'object')
        )
      : [];

    const notes = isIterable(scene.notes)
      ? Array.from(scene.notes).filter(
          (note): note is { id?: string; text?: string; x?: number; y?: number } =>
            Boolean(note && typeof note === 'object')
        )
      : [];

    const sceneBackgroundSrc =
      scene.background && typeof scene.background === 'object' ? scene.background.src : undefined;

    return Promise.resolve({
      id: scene.id ?? '',
      name: scene.name ?? '',
      ...(scene.img ? { img: scene.img } : {}),
      ...(sceneBackgroundSrc ? { background: sceneBackgroundSrc } : {}),
      width: scene.width ?? 0,
      height: scene.height ?? 0,
      padding: scene.padding ?? 0,
      active: scene.active ?? false,
      navigation: scene.navigation ?? false,
      tokens: tokens.map(token => ({
        id: token.id ?? '',
        name: token.name ?? '',
        x: token.x ?? 0,
        y: token.y ?? 0,
        width: token.width ?? 1,
        height: token.height ?? 1,
        ...(token.actorId ? { actorId: token.actorId } : {}),
        img: token.texture?.src ?? '',
        hidden: token.hidden ?? false,
        disposition: getTokenDisposition(token.disposition),
      })),
      walls: scene.walls?.size ?? 0,
      lights: scene.lights?.size ?? 0,
      sounds: scene.sounds?.size ?? 0,
      notes: notes.map(note => ({
        id: note.id ?? '',
        text: note.text ?? '',
        x: note.x ?? 0,
        y: note.y ?? 0,
      })),
    });
  }

  getWorldInfo(): Promise<WorldInfo> {
    const usersSource: unknown = game.users;
    const users =
      usersSource &&
      typeof usersSource === 'object' &&
      Symbol.iterator in (usersSource as Record<string, unknown>)
        ? Array.from(usersSource as Iterable<unknown>).filter((user): user is WorldUserSummary =>
            Boolean(user && typeof user === 'object')
          )
        : [];

    return Promise.resolve({
      id: game.world.id,
      title: game.world.title,
      system: game.system.id,
      systemVersion: game.system.version,
      foundryVersion: game.version,
      users: users.map(user => ({
        id: user.id ?? '',
        name: user.name ?? '',
        active: user.active ?? false,
        isGM: user.isGM ?? false,
      })),
    });
  }

  getAvailablePacks(): Promise<AvailablePackSummary[]> {
    this.context.validateFoundryState();

    const packsSource: unknown = game.packs;
    const packs =
      packsSource &&
      typeof packsSource === 'object' &&
      Symbol.iterator in (packsSource as Record<string, unknown>)
        ? Array.from(packsSource as Iterable<unknown>).filter((pack): pack is PackSummaryLike =>
            Boolean(pack && typeof pack === 'object')
          )
        : [];

    return Promise.resolve(
      packs.map(pack => ({
        id: pack.metadata?.id ?? '',
        label: pack.metadata?.label ?? '',
        ...(pack.metadata?.type ? { type: pack.metadata.type } : {}),
        ...(pack.metadata?.system ? { system: pack.metadata.system } : {}),
        ...(pack.metadata?.private !== undefined ? { private: pack.metadata.private } : {}),
      }))
    );
  }
}
