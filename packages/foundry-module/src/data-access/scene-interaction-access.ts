import { ERROR_MESSAGES } from '../constants.js';
import { permissionManager } from '../permissions.js';
import {
  executeItemUse,
  type ItemUseActorLike,
  type ItemUseOptions,
  type UsableItemLike,
} from './item-use-handlers.js';
import {
  buildConditionEffectData,
  type SceneConditionLike as ConditionLike,
} from './scene-system-helpers/condition-effects.js';

interface SceneListItem {
  id?: string;
  name?: string;
  active?: boolean;
  dimensions?: { width?: number; height?: number };
  width?: number;
  height?: number;
  grid?: { size?: number };
  background?: { src?: string } | string;
  img?: string;
  walls?: { size?: number };
  tokens?: { size?: number };
  lights?: { size?: number };
  sounds?: { size?: number };
  navigation?: boolean;
}

interface SceneCollectionManagerLike {
  contents?: unknown[];
  current?: unknown;
  active?: unknown;
}

interface SceneActivatableLike extends SceneListItem {
  activate: () => Promise<unknown>;
}

interface SceneCanvasLike {
  scene?: unknown;
  screenDimensions?: [number, number];
  pan: (options: { x: number; y: number; scale: number }) => unknown;
}

interface ActorLookupLike extends ItemUseActorLike {
  type?: string;
  img?: string;
  system?: { actions?: unknown };
  items: unknown;
  effects?: unknown;
  createEmbeddedDocuments?: (
    embeddedName: string,
    docs: Array<Record<string, unknown>>
  ) => Promise<unknown>;
  deleteEmbeddedDocuments?: (embeddedName: string, ids: string[]) => Promise<unknown>;
}

interface SceneTokenTargetLike {
  id?: string;
  name?: string;
  actorId?: string;
  actor?: ActorLookupLike;
}

interface TokenLike extends SceneTokenTargetLike {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;
  texture?: { scaleX?: number; src?: string };
  alpha?: number;
  hidden?: boolean;
  disposition?: number;
  elevation?: number;
  lockRotation?: boolean;
  actorLink?: boolean;
  update?: (data: Record<string, unknown>, options?: Record<string, unknown>) => Promise<unknown>;
  delete?: () => Promise<unknown>;
}

interface SceneTokenCollectionLike {
  get?: (tokenId: string) => unknown;
  contents?: unknown[];
}

interface SceneDocumentWithTokensLike {
  tokens?: unknown;
}

interface ActiveEffectLike {
  id?: string;
  name?: string;
  label?: string;
  icon?: string;
  disabled?: boolean;
  duration?: unknown;
  changes?: unknown;
  statuses?: { has: (statusId: string) => boolean };
}

interface UserTargetingLike {
  updateTokenTargets: (tokenIds: string[]) => Promise<unknown>;
}

type AuditStatus = 'success' | 'failure';

export interface SceneInteractionContext {
  moduleId: string;
  validateFoundryState(): void;
  auditLog(action: string, data: unknown, status: AuditStatus, errorMessage?: string): void;
  findActorByIdentifier(identifier: string): ActorLookupLike | null;
}

function isActorLookupLike(actor: unknown): actor is ActorLookupLike {
  return Boolean(actor && typeof actor === 'object');
}

function getActorContents(): ActorLookupLike[] {
  const actorsRaw = (game as { actors?: { contents?: unknown } }).actors?.contents;
  return Array.isArray(actorsRaw) ? actorsRaw.filter(isActorLookupLike) : [];
}

function getSceneCollectionManager(): SceneCollectionManagerLike | null {
  const scenes = (game as { scenes?: unknown }).scenes;
  if (!scenes || typeof scenes !== 'object') {
    return null;
  }

  return scenes as SceneCollectionManagerLike;
}

function getSceneContents(): SceneListItem[] {
  const sceneCollection = getSceneCollectionManager();
  return Array.isArray(sceneCollection?.contents)
    ? sceneCollection.contents.filter((scene): scene is SceneListItem =>
        Boolean(scene && typeof scene === 'object')
      )
    : [];
}

function isSceneActivatableLike(scene: unknown): scene is SceneActivatableLike {
  return Boolean(
    scene &&
      typeof scene === 'object' &&
      typeof (scene as Partial<SceneActivatableLike>).activate === 'function'
  );
}

function getSceneCanvas(): SceneCanvasLike | null {
  if (typeof canvas === 'undefined' || !canvas || typeof canvas !== 'object') {
    return null;
  }

  const sceneCanvas = canvas as unknown as Partial<SceneCanvasLike>;
  return typeof sceneCanvas.pan === 'function' ? (canvas as unknown as SceneCanvasLike) : null;
}

function getCurrentSceneDocument(): SceneDocumentWithTokensLike | null {
  const sceneCollection = getSceneCollectionManager();
  const scene = sceneCollection?.current;
  return scene && typeof scene === 'object' ? (scene as SceneDocumentWithTokensLike) : null;
}

function getActiveSceneDocument(): SceneDocumentWithTokensLike | null {
  const sceneCollection = getSceneCollectionManager();
  const scene = sceneCollection?.active;
  return scene && typeof scene === 'object' ? (scene as SceneDocumentWithTokensLike) : null;
}

function getSceneTokenArray(tokensSource: unknown): SceneTokenTargetLike[] {
  if (Array.isArray(tokensSource)) {
    return tokensSource.filter((token): token is SceneTokenTargetLike =>
      Boolean(token && typeof token === 'object')
    );
  }

  if (!tokensSource || typeof tokensSource !== 'object') {
    return [];
  }

  if (Array.isArray((tokensSource as { contents?: unknown[] }).contents)) {
    return ((tokensSource as { contents?: unknown[] }).contents ?? []).filter(
      (token): token is SceneTokenTargetLike => Boolean(token && typeof token === 'object')
    );
  }

  if (Symbol.iterator in (tokensSource as Record<PropertyKey, unknown>)) {
    return Array.from(tokensSource as Iterable<unknown>).filter(
      (token): token is SceneTokenTargetLike => Boolean(token && typeof token === 'object')
    );
  }

  return [];
}

function getSceneTokenCollection(tokensSource: unknown): SceneTokenCollectionLike | null {
  return tokensSource && typeof tokensSource === 'object'
    ? (tokensSource as SceneTokenCollectionLike)
    : null;
}

function getActiveEffectArray(effectsSource: unknown): ActiveEffectLike[] {
  if (!effectsSource || typeof effectsSource !== 'object') {
    return [];
  }

  const contents = (effectsSource as { contents?: unknown }).contents;
  return Array.isArray(contents)
    ? contents.filter((effect): effect is ActiveEffectLike =>
        Boolean(effect && typeof effect === 'object')
      )
    : [];
}

function isMutableTokenLike(token: unknown): token is TokenLike {
  return Boolean(
    token &&
      typeof token === 'object' &&
      typeof (token as Partial<TokenLike>).update === 'function' &&
      typeof (token as Partial<TokenLike>).delete === 'function'
  );
}

function getMutableTokenById(
  scene: SceneDocumentWithTokensLike,
  tokenId: string
): TokenLike | null {
  const tokenCollection = getSceneTokenCollection(scene.tokens);
  if (!tokenCollection || typeof tokenCollection.get !== 'function') {
    return null;
  }

  const token = tokenCollection.get(tokenId);
  return isMutableTokenLike(token) ? token : null;
}

function getTargetingUser(): UserTargetingLike | null {
  const user = (game as { user?: unknown }).user;
  return user &&
    typeof user === 'object' &&
    typeof (user as Partial<UserTargetingLike>).updateTokenTargets === 'function'
    ? (user as UserTargetingLike)
    : null;
}

function getActorItems(actor: ActorLookupLike): UsableItemLike[] {
  const itemsSource = actor.items;
  if (Array.isArray(itemsSource)) {
    return itemsSource.filter((item): item is UsableItemLike =>
      Boolean(item && typeof item === 'object')
    );
  }

  if (
    itemsSource &&
    typeof itemsSource === 'object' &&
    Array.isArray((itemsSource as { contents?: unknown[] }).contents)
  ) {
    return ((itemsSource as { contents?: unknown[] }).contents ?? []).filter(
      (item): item is UsableItemLike => Boolean(item && typeof item === 'object')
    );
  }

  return [];
}

export class FoundrySceneInteractionAccess {
  constructor(private readonly context: SceneInteractionContext) {}

  listScenes(options: { filter?: string; include_active_only?: boolean } = {}): Promise<
    Array<{
      id: string;
      name: string;
      active: boolean;
      dimensions: { width: number; height: number };
      gridSize: number;
      background: string;
      walls: number;
      tokens: number;
      lighting: number;
      sounds: number;
      navigation: boolean;
    }>
  > {
    this.context.validateFoundryState();

    try {
      let scenes = getSceneContents();

      if (options.include_active_only) {
        scenes = scenes.filter(scene => scene.active === true);
      }

      if (options.filter) {
        const filterLower = options.filter.toLowerCase();
        scenes = scenes.filter(scene => scene.name?.toLowerCase().includes(filterLower) === true);
      }

      return Promise.resolve(
        scenes.map(scene => {
          const background =
            typeof scene.background === 'string'
              ? scene.background
              : (scene.background?.src ?? scene.img ?? '');

          return {
            id: scene.id ?? '',
            name: scene.name ?? '',
            active: scene.active === true,
            dimensions: {
              width: scene.dimensions?.width ?? scene.width ?? 0,
              height: scene.dimensions?.height ?? scene.height ?? 0,
            },
            gridSize: scene.grid?.size ?? 100,
            background,
            walls: scene.walls?.size ?? 0,
            tokens: scene.tokens?.size ?? 0,
            lighting: scene.lights?.size ?? 0,
            sounds: scene.sounds?.size ?? 0,
            navigation: scene.navigation ?? false,
          };
        })
      );
    } catch (error) {
      throw new Error(
        `Failed to list scenes: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async switchScene(options: { scene_identifier: string; optimize_view?: boolean }): Promise<{
    success: boolean;
    sceneId?: string;
    sceneName?: string;
    dimensions: { width: number; height: number };
  }> {
    this.context.validateFoundryState();

    try {
      const targetScene = getSceneContents().find(
        (scene): scene is SceneActivatableLike =>
          isSceneActivatableLike(scene) &&
          (scene.id === options.scene_identifier ||
            scene.name?.toLowerCase() === options.scene_identifier.toLowerCase())
      );

      if (!targetScene) {
        throw new Error(`Scene not found: "${options.scene_identifier}"`);
      }

      await targetScene.activate();

      const sceneCanvas = getSceneCanvas();
      if (options.optimize_view !== false && sceneCanvas?.scene) {
        const dimensions = targetScene.dimensions ?? {
          width: targetScene.width ?? 0,
          height: targetScene.height ?? 0,
        };
        const width = dimensions.width ?? 0;
        const height = dimensions.height ?? 0;

        if (width && height) {
          await sceneCanvas.pan({
            x: width / 2,
            y: height / 2,
            scale: Math.min(
              (sceneCanvas.screenDimensions?.[0] ?? 1) / width,
              (sceneCanvas.screenDimensions?.[1] ?? 1) / height,
              1
            ),
          });
        }
      }

      return {
        success: true,
        ...(targetScene.id ? { sceneId: targetScene.id } : {}),
        ...(targetScene.name ? { sceneName: targetScene.name } : {}),
        dimensions: {
          width: targetScene.dimensions?.width ?? targetScene.width ?? 0,
          height: targetScene.dimensions?.height ?? targetScene.height ?? 0,
        },
      };
    } catch (error) {
      throw new Error(
        `Failed to switch scene: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  getCharacterEntity(data: {
    characterIdentifier: string;
    entityIdentifier: string;
  }): Record<string, unknown> {
    this.context.validateFoundryState();

    try {
      const actors = getActorContents();
      const character = actors.find(actor => {
        return (
          actor.id === data.characterIdentifier ||
          actor.name?.toLowerCase() === data.characterIdentifier.toLowerCase()
        );
      });

      if (!character) {
        throw new Error(`Character not found: "${data.characterIdentifier}"`);
      }

      const items = getActorItems(character);
      const itemEntity = items.find(item => {
        return (
          item.id === data.entityIdentifier ||
          item.name?.toLowerCase() === data.entityIdentifier.toLowerCase()
        );
      });

      if (itemEntity) {
        const typedItemEntity = itemEntity as {
          id?: string;
          name?: string;
          type?: string;
          img?: string;
          system?: unknown;
        };

        const itemSystem = typedItemEntity.system as
          | { description?: { value?: string } | string }
          | undefined;

        return {
          success: true,
          entityType: 'item',
          entity: {
            id: typedItemEntity.id,
            name: typedItemEntity.name,
            type: typedItemEntity.type,
            img: typedItemEntity.img,
            description:
              itemSystem?.description && typeof itemSystem.description === 'object'
                ? (itemSystem.description.value ?? '')
                : (itemSystem?.description ?? ''),
            system: typedItemEntity.system,
          },
        };
      }

      const characterSystem = character.system;
      if (characterSystem?.actions) {
        const actions: unknown[] = Array.isArray(characterSystem.actions)
          ? characterSystem.actions
          : Object.values(
              typeof characterSystem.actions === 'object'
                ? (characterSystem.actions as Record<string, unknown>)
                : {}
            );

        const actionEntity = actions.find(action => {
          if (!action || typeof action !== 'object') {
            return false;
          }

          const candidate = action as { id?: string; name?: string };
          return (
            candidate.id === data.entityIdentifier ||
            candidate.name?.toLowerCase() === data.entityIdentifier.toLowerCase()
          );
        });

        if (actionEntity) {
          return {
            success: true,
            entityType: 'action',
            entity: actionEntity as Record<string, unknown>,
          };
        }
      }

      const effects = getActiveEffectArray(character.effects);
      const effectEntity = effects.find(effect => {
        if (!effect || typeof effect !== 'object') {
          return false;
        }

        const candidate = effect as { id?: string; name?: string };
        return (
          candidate.id === data.entityIdentifier ||
          candidate.name?.toLowerCase() === data.entityIdentifier.toLowerCase()
        );
      });

      if (effectEntity) {
        return {
          success: true,
          entityType: 'effect',
          entity: {
            id: effectEntity.id,
            name: effectEntity.name ?? effectEntity.label,
            icon: effectEntity.icon,
            disabled: effectEntity.disabled,
            duration: effectEntity.duration,
            changes: effectEntity.changes,
          },
        };
      }

      throw new Error(
        `Entity not found: "${data.entityIdentifier}" in character "${character.name ?? 'Unknown'}"`
      );
    } catch (error) {
      throw new Error(
        `Failed to get character entity: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async moveToken(data: { tokenId: string; x: number; y: number; animate?: boolean }): Promise<{
    success: boolean;
    tokenId?: string;
    tokenName?: string;
    newPosition: { x: number; y: number };
    animated: boolean;
  }> {
    this.context.validateFoundryState();

    const permissionCheck = permissionManager.checkWritePermission('modifyScene', {
      targetIds: [data.tokenId],
    });

    if (!permissionCheck.allowed) {
      throw new Error(`${ERROR_MESSAGES.ACCESS_DENIED}: ${permissionCheck.reason}`);
    }

    try {
      const scene = getCurrentSceneDocument();
      if (!scene) {
        throw new Error('No active scene found');
      }

      const token = getMutableTokenById(scene, data.tokenId);
      if (!token) {
        throw new Error(`Token ${data.tokenId} not found in current scene`);
      }

      await token.update?.(
        {
          x: data.x,
          y: data.y,
        },
        { animate: data.animate !== false }
      );

      this.context.auditLog('moveToken', data, 'success');

      return {
        success: true,
        ...(token.id ? { tokenId: token.id } : {}),
        ...(token.name ? { tokenName: token.name } : {}),
        newPosition: { x: data.x, y: data.y },
        animated: data.animate !== false,
      };
    } catch (error) {
      this.context.auditLog(
        'moveToken',
        data,
        'failure',
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw new Error(
        `Failed to move token: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async updateToken(data: { tokenId: string; updates: Record<string, unknown> }): Promise<{
    success: boolean;
    tokenId?: string;
    tokenName?: string;
    updatedProperties: string[];
  }> {
    this.context.validateFoundryState();

    const permissionCheck = permissionManager.checkWritePermission('modifyScene', {
      targetIds: [data.tokenId],
    });

    if (!permissionCheck.allowed) {
      throw new Error(`${ERROR_MESSAGES.ACCESS_DENIED}: ${permissionCheck.reason}`);
    }

    try {
      const scene = getCurrentSceneDocument();
      if (!scene) {
        throw new Error('No active scene found');
      }

      const token = getMutableTokenById(scene, data.tokenId);
      if (!token) {
        throw new Error(`Token ${data.tokenId} not found in current scene`);
      }

      const cleanUpdates = Object.fromEntries(
        Object.entries(data.updates).filter(([_, value]) => value !== undefined)
      );

      await token.update?.(cleanUpdates);

      this.context.auditLog(
        'updateToken',
        { tokenId: data.tokenId, updates: cleanUpdates },
        'success'
      );

      return {
        success: true,
        ...(token.id ? { tokenId: token.id } : {}),
        ...(token.name ? { tokenName: token.name } : {}),
        updatedProperties: Object.keys(cleanUpdates),
      };
    } catch (error) {
      this.context.auditLog(
        'updateToken',
        data,
        'failure',
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw new Error(
        `Failed to update token: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async deleteTokens(data: { tokenIds: string[] }): Promise<{
    success: boolean;
    deletedCount: number;
    deletedTokens: string[];
    failedTokens?: string[];
  }> {
    this.context.validateFoundryState();

    const permissionCheck = permissionManager.checkWritePermission('modifyScene', {
      targetIds: data.tokenIds,
    });

    if (!permissionCheck.allowed) {
      throw new Error(`${ERROR_MESSAGES.ACCESS_DENIED}: ${permissionCheck.reason}`);
    }

    try {
      const scene = getCurrentSceneDocument();
      if (!scene) {
        throw new Error('No active scene found');
      }

      const deletedTokens: string[] = [];
      const failedTokens: string[] = [];

      for (const tokenId of data.tokenIds) {
        try {
          const token = getMutableTokenById(scene, tokenId);
          if (token && typeof token.delete === 'function') {
            await token.delete();
            deletedTokens.push(tokenId);
          } else {
            failedTokens.push(tokenId);
          }
        } catch {
          failedTokens.push(tokenId);
        }
      }

      this.context.auditLog(
        'deleteTokens',
        { tokenIds: data.tokenIds, deletedCount: deletedTokens.length },
        'success'
      );

      return {
        success: true,
        deletedCount: deletedTokens.length,
        deletedTokens,
        ...(failedTokens.length > 0 ? { failedTokens } : {}),
      };
    } catch (error) {
      this.context.auditLog(
        'deleteTokens',
        data,
        'failure',
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw new Error(
        `Failed to delete tokens: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  getTokenDetails(data: { tokenId: string }): Record<string, unknown> {
    this.context.validateFoundryState();

    try {
      const scene = getCurrentSceneDocument();
      if (!scene) {
        throw new Error('No active scene found');
      }

      const token = getMutableTokenById(scene, data.tokenId);
      if (!token) {
        throw new Error(`Token ${data.tokenId} not found in current scene`);
      }

      return {
        success: true,
        id: token.id,
        name: token.name,
        x: token.x,
        y: token.y,
        width: token.width,
        height: token.height,
        rotation: token.rotation,
        scale: token.texture?.scaleX ?? 1,
        alpha: token.alpha,
        hidden: token.hidden,
        disposition: token.disposition,
        elevation: token.elevation,
        lockRotation: token.lockRotation,
        img: token.texture?.src,
        actorId: token.actor?.id,
        actorData: token.actor
          ? {
              name: token.actor.name,
              type: token.actor.type,
              img: token.actor.img,
            }
          : null,
        actorLink: token.actorLink,
      };
    } catch (error) {
      throw new Error(
        `Failed to get token details: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async toggleTokenCondition(data: {
    tokenId: string;
    conditionId: string;
    active: boolean;
  }): Promise<Record<string, unknown>> {
    this.context.validateFoundryState();

    const permissionCheck = permissionManager.checkWritePermission('modifyScene', {
      targetIds: [data.tokenId],
    });

    if (!permissionCheck.allowed) {
      throw new Error(`${ERROR_MESSAGES.ACCESS_DENIED}: ${permissionCheck.reason}`);
    }

    try {
      const scene = getCurrentSceneDocument();
      if (!scene) {
        throw new Error('No active scene found');
      }

      const token = getMutableTokenById(scene, data.tokenId);
      if (!token) {
        throw new Error(`Token ${data.tokenId} not found in current scene`);
      }

      const actor = token.actor;
      if (!actor) {
        throw new Error(`Token ${data.tokenId} has no associated actor`);
      }

      const configWithEffects = CONFIG as unknown as { statusEffects?: unknown };
      const conditions = Array.isArray(configWithEffects.statusEffects)
        ? (configWithEffects.statusEffects as unknown[])
        : [];
      const condition = conditions.find((candidate): candidate is ConditionLike => {
        if (!candidate || typeof candidate !== 'object') {
          return false;
        }

        const typedCondition = candidate as ConditionLike;
        return (
          typedCondition.id === data.conditionId ||
          typedCondition.name?.toLowerCase() === data.conditionId.toLowerCase()
        );
      });

      if (!condition) {
        throw new Error(`Condition not found: ${data.conditionId}`);
      }

      if (data.active) {
        const effectData = buildConditionEffectData({
          condition,
          systemId: (game.system as { id?: string }).id ?? '',
        });
        await actor.createEmbeddedDocuments?.('ActiveEffect', [effectData]);
      } else {
        const effects = getActiveEffectArray(actor.effects);
        const effectsToRemove = effects.filter(effect => {
          if (effect.statuses?.has(data.conditionId)) {
            return true;
          }
          if (effect.name?.toLowerCase() === data.conditionId.toLowerCase()) {
            return true;
          }
          return effect.label?.toLowerCase() === data.conditionId.toLowerCase();
        });

        if (effectsToRemove.length > 0) {
          const ids = effectsToRemove
            .map(effect => effect.id)
            .filter((id): id is string => typeof id === 'string' && id.length > 0);

          if (ids.length > 0) {
            await actor.deleteEmbeddedDocuments?.('ActiveEffect', ids);
          }
        }
      }

      this.context.auditLog('toggleTokenCondition', data, 'success');

      return {
        success: true,
        tokenId: token.id,
        tokenName: token.name,
        conditionId: data.conditionId,
        conditionName: condition.name ?? condition.label ?? condition.id,
        isActive: data.active,
        active: data.active,
        message: data.active
          ? `Applied ${data.conditionId} to ${token.name}`
          : `Removed ${data.conditionId} from ${token.name}`,
      };
    } catch (error) {
      this.context.auditLog(
        'toggleTokenCondition',
        data,
        'failure',
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw new Error(
        `Failed to toggle token condition: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  getAvailableConditions(): Record<string, unknown> {
    this.context.validateFoundryState();

    try {
      const configWithEffects = CONFIG as unknown as { statusEffects?: unknown };
      const conditions = Array.isArray(configWithEffects.statusEffects)
        ? (configWithEffects.statusEffects as unknown[])
        : [];

      return {
        success: true,
        gameSystem: game.system?.id,
        conditions: conditions
          .filter(
            (condition): condition is ConditionLike => !!condition && typeof condition === 'object'
          )
          .map(condition => ({
            id: condition.id,
            name: condition.name ?? condition.label ?? condition.id,
            icon: condition.icon ?? condition.img,
            description: condition.description ?? '',
          })),
      };
    } catch (error) {
      throw new Error(
        `Failed to get available conditions: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async useItem(params: {
    actorIdentifier: string;
    itemIdentifier: string;
    targets?: string[] | undefined;
    options?: ItemUseOptions | undefined;
  }): Promise<{
    success: boolean;
    status?: string;
    message: string;
    itemName?: string;
    actorName?: string;
    targets?: string[];
    requiresGMInteraction?: boolean;
  }> {
    this.context.validateFoundryState();

    const { actorIdentifier, itemIdentifier, targets, options = {} } = params;
    const actor = this.context.findActorByIdentifier(actorIdentifier);
    if (!actor) {
      throw new Error(`Actor not found: ${actorIdentifier}`);
    }

    const actorItems = getActorItems(actor);
    const item = actorItems.find(candidate => {
      return (
        candidate.id === itemIdentifier ||
        candidate.name?.toLowerCase() === itemIdentifier.toLowerCase()
      );
    });

    if (!item) {
      throw new Error(`Item "${itemIdentifier}" not found on actor "${actor.name ?? 'Unknown'}"`);
    }

    const systemId = (game.system as unknown as { id?: string }).id ?? '';
    const resolvedTargetNames: string[] = [];

    if (targets && targets.length > 0) {
      const scene = getActiveSceneDocument();
      if (!scene) {
        throw new Error('No active scene to find targets on');
      }

      const sceneTokens = getSceneTokenArray(scene.tokens);
      const tokenIds: string[] = [];

      for (const targetIdentifier of targets) {
        if (targetIdentifier.toLowerCase() === 'self') {
          const selfToken = sceneTokens.find(
            token => token.actor?.id === actor.id || token.actorId === actor.id
          );
          if (selfToken) {
            if (selfToken.id) {
              tokenIds.push(selfToken.id);
            }
            resolvedTargetNames.push(actor.name ?? 'Unknown');
          } else {
            console.warn(
              `[${this.context.moduleId}] No token found on scene for actor "${actor.name}" (self)`
            );
          }
          continue;
        }

        const targetToken = sceneTokens.find(
          token =>
            token.id === targetIdentifier ||
            token.name?.toLowerCase() === targetIdentifier.toLowerCase() ||
            token.actor?.name?.toLowerCase() === targetIdentifier.toLowerCase()
        );

        if (targetToken) {
          if (targetToken.id) {
            tokenIds.push(targetToken.id);
          }
          resolvedTargetNames.push(targetToken.name ?? targetToken.actor?.name ?? targetIdentifier);
        } else {
          console.warn(`[${this.context.moduleId}] Target not found: "${targetIdentifier}"`);
        }
      }

      const targetingUser = getTargetingUser();
      if (tokenIds.length > 0 && targetingUser) {
        await targetingUser.updateTokenTargets(tokenIds);
      }
    }

    try {
      executeItemUse({
        actor,
        item,
        systemId,
        options,
      });

      this.context.auditLog(
        'useItem',
        {
          actorId: actor.id,
          itemId: item.id,
          itemName: item.name,
          targets: resolvedTargetNames,
        },
        'success'
      );

      const targetInfo =
        resolvedTargetNames.length > 0 ? ` targeting ${resolvedTargetNames.join(', ')}` : '';
      const actorName = actor.name ?? 'Unknown';
      const itemName = item.name ?? 'Unknown Item';

      const result: {
        success: boolean;
        status?: string;
        message: string;
        itemName?: string;
        actorName?: string;
        targets?: string[];
        requiresGMInteraction?: boolean;
      } = {
        success: true,
        status: 'initiated',
        message: `Item use initiated for ${actorName} using ${itemName}${targetInfo}. If a dialog appeared in Foundry VTT, the GM should select options and confirm. The result will appear in chat.`,
        itemName,
        actorName,
        requiresGMInteraction: true,
      };

      if (resolvedTargetNames.length > 0) {
        result.targets = resolvedTargetNames;
      }

      return result;
    } catch (error) {
      this.context.auditLog(
        'useItem',
        {
          actorId: actor.id,
          itemId: item.id,
        },
        'failure',
        error instanceof Error ? error.message : 'Unknown error'
      );

      throw new Error(
        `Failed to use item "${item.name}": ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
