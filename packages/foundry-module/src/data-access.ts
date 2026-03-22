import { MODULE_ID, ERROR_MESSAGES, TOKEN_DISPOSITIONS } from './constants.js';
import { permissionManager } from './permissions.js';
import { FoundryActorDirectoryAccess } from './data-access/actor-directory-access.js';
import {
  FoundryActorCreationAccess,
  type ActorCreationRequest,
  type ActorCreationResult,
  type CompendiumEntryActorCreationRequest,
  type SceneTokenPlacement,
  type TokenPlacementResult,
} from './data-access/actor-creation-access.js';
import { FoundryCharacterAccess } from './data-access/character-access.js';
import {
  FoundryCompendiumAccess,
  type CompendiumSearchFilters,
  type CompendiumSearchResult,
  type CreatureSearchCriteria,
  type CreatureSearchResponse,
} from './data-access/compendium-access.js';
import { FoundryJournalAccess } from './data-access/journal-access.js';
import { FoundrySceneInteractionAccess } from './data-access/scene-interaction-access.js';
import type {
  FoundryCharacterInfo,
  FoundryCompendiumEntryFull,
  FoundryJournalEntryResponse,
  FoundryJournalSummary,
  FoundryWorldDetails,
  UnknownRecord,
} from '@foundry-mcp/shared';

type CharacterInfo = FoundryCharacterInfo<UnknownRecord, UnknownRecord, UnknownRecord>;

interface SceneInfo {
  id: string;
  name: string;
  img?: string;
  background?: string;
  width: number;
  height: number;
  padding: number;
  active: boolean;
  navigation: boolean;
  tokens: SceneToken[];
  walls: number;
  lights: number;
  sounds: number;
  notes: SceneNote[];
}

interface SceneToken {
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

interface SceneNote {
  id: string;
  text: string;
  x: number;
  y: number;
}

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

interface ActorLookupLike {
  id?: string;
  name?: string;
  type?: string;
  img?: string;
  system?: Record<string, unknown>;
  items: unknown;
  effects: unknown;
  hasPlayerOwner?: boolean;
  ownership?: Record<string, number>;
  update?: (data: Record<string, unknown>) => Promise<unknown>;
  testUserPermission?: (...args: unknown[]) => boolean;
  getRollData?: () => unknown;
}

interface UserLookupLike {
  id?: string;
  name?: string;
  isGM?: boolean;
  active?: boolean;
}

interface RollButtonState {
  rolled?: boolean;
  rolledBy?: string;
  rolledByName?: string;
  timestamp?: number;
}

interface ChatMessageLike {
  flags?: Record<string, unknown>;
  getFlag: (scope: string, key: string) => unknown;
  canUserModify: (user: unknown, action: 'update') => boolean;
  update: (data: Record<string, unknown>) => Promise<unknown>;
}

type WorldInfo = FoundryWorldDetails;

type CompendiumEntryFull = FoundryCompendiumEntryFull<
  Record<string, unknown>,
  Record<string, unknown>,
  Record<string, unknown>
>;

export class FoundryDataAccess {
  private moduleId: string = MODULE_ID;
  private actorDirectoryAccess: FoundryActorDirectoryAccess;
  private actorCreationAccess: FoundryActorCreationAccess;
  private characterAccess: FoundryCharacterAccess;
  private compendiumAccess: FoundryCompendiumAccess;
  private journalAccess: FoundryJournalAccess;
  private sceneInteractionAccess: FoundrySceneInteractionAccess;

  constructor() {
    this.actorDirectoryAccess = new FoundryActorDirectoryAccess({
      validateFoundryState: (): void => this.validateFoundryState(),
    });
    this.actorCreationAccess = new FoundryActorCreationAccess({
      moduleId: this.moduleId,
      validateFoundryState: (): void => this.validateFoundryState(),
      auditLog: (
        action: string,
        data: unknown,
        status: 'success' | 'failure',
        errorMessage?: string
      ): void => this.auditLog(action, data, status, errorMessage),
      getCompendiumDocumentFull: (
        packId: string,
        documentId: string
      ): Promise<CompendiumEntryFull> =>
        this.compendiumAccess.getCompendiumDocumentFull(packId, documentId),
      searchCompendium: (query: string, packType?: string): Promise<CompendiumSearchResult[]> =>
        this.compendiumAccess.searchCompendium(query, packType),
    });
    this.characterAccess = new FoundryCharacterAccess({
      auditLog: (
        action: string,
        data: unknown,
        status: 'success' | 'failure',
        errorMessage?: string
      ): void => this.auditLog(action, data, status, errorMessage),
      findActorByIdentifier: (identifier: string): ActorLookupLike | null =>
        this.findActorByIdentifier(identifier),
      sanitizeData: (data: unknown): unknown => this.sanitizeData(data),
      validateFoundryState: (): void => this.validateFoundryState(),
    });
    this.compendiumAccess = new FoundryCompendiumAccess({
      moduleId: this.moduleId,
      sanitizeData: (data: unknown): unknown => this.sanitizeData(data),
    });
    this.journalAccess = new FoundryJournalAccess({
      moduleId: this.moduleId,
      validateFoundryState: (): void => this.validateFoundryState(),
      auditLog: (
        action: string,
        data: unknown,
        status: 'success' | 'failure',
        errorMessage?: string
      ): void => this.auditLog(action, data, status, errorMessage),
    });
    this.sceneInteractionAccess = new FoundrySceneInteractionAccess({
      moduleId: this.moduleId,
      validateFoundryState: (): void => this.validateFoundryState(),
      auditLog: (
        action: string,
        data: unknown,
        status: 'success' | 'failure',
        errorMessage?: string
      ): void => this.auditLog(action, data, status, errorMessage),
      findActorByIdentifier: (identifier: string): ActorLookupLike | null =>
        this.findActorByIdentifier(identifier),
    });
  }

  /**
   * Force rebuild of enhanced creature index
   */
  async rebuildEnhancedCreatureIndex(): Promise<{
    success: boolean;
    totalCreatures: number;
    message: string;
  }> {
    return this.compendiumAccess.rebuildEnhancedCreatureIndex();
  }

  /**
   * Get character/actor information by name or ID
   */
  getCharacterInfo(identifier: string): Promise<CharacterInfo> {
    return this.characterAccess.getCharacterInfo(identifier);
  }

  /**
   * Search within a character's items, spells, actions, and effects
   * More token-efficient than getCharacterInfo when you need specific items
   */
  searchCharacterItems(params: {
    characterIdentifier: string;
    query?: string | undefined;
    type?: string | undefined;
    category?: string | undefined;
    limit?: number | undefined;
  }): Promise<{
    characterId: string;
    characterName: string;
    query?: string;
    type?: string;
    category?: string;
    matches: Array<Record<string, unknown>>;
    totalMatches: number;
  }> {
    return this.characterAccess.searchCharacterItems(params);
  }

  /**
   * Search compendium packs for items matching query with optional filters
   */
  async searchCompendium(
    query: string,
    packType?: string,
    filters?: CompendiumSearchFilters
  ): Promise<CompendiumSearchResult[]> {
    return this.compendiumAccess.searchCompendium(query, packType, filters);
  }

  /**
   * List creatures by criteria using enhanced persistent index - optimized for instant filtering
   */
  async listCreaturesByCriteria(criteria: CreatureSearchCriteria): Promise<CreatureSearchResponse> {
    return this.compendiumAccess.listCreaturesByCriteria(criteria);
  }

  /**
   * List all actors with basic information
   */
  listActors(): Promise<Array<{ id: string; name: string; type: string; img?: string }>> {
    const actorsSource: unknown = game.actors;
    const actors =
      actorsSource &&
      typeof actorsSource === 'object' &&
      Symbol.iterator in (actorsSource as Record<string, unknown>)
        ? Array.from(actorsSource as Iterable<unknown>).filter(
            (actor): actor is { id?: string; name?: string; type?: string; img?: string } =>
              Boolean(actor && typeof actor === 'object')
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

  /**
   * Get active scene information
   */
  getActiveScene(): Promise<SceneInfo> {
    type SceneWithCollections = SceneListItem & {
      id?: string;
      tokens?: Iterable<unknown>;
      notes?: Iterable<unknown>;
      padding?: number;
    };

    const sceneCollection = game.scenes as { current?: unknown } | null | undefined;
    const sceneRaw = sceneCollection?.current;
    const scene =
      sceneRaw && typeof sceneRaw === 'object' ? (sceneRaw as SceneWithCollections) : null;
    if (!scene) {
      throw new Error(ERROR_MESSAGES.SCENE_NOT_FOUND);
    }

    const tokens =
      scene.tokens &&
      typeof scene.tokens === 'object' &&
      Symbol.iterator in (scene.tokens as unknown as Record<string, unknown>)
        ? Array.from(scene.tokens as Iterable<unknown>).filter(
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

    const notes =
      scene.notes &&
      typeof scene.notes === 'object' &&
      Symbol.iterator in (scene.notes as unknown as Record<string, unknown>)
        ? Array.from(scene.notes).filter(
            (note): note is { id?: string; text?: string; x?: number; y?: number } =>
              Boolean(note && typeof note === 'object')
          )
        : [];

    const sceneBackgroundSrc =
      scene.background && typeof scene.background === 'object' ? scene.background.src : undefined;

    const sceneData: SceneInfo = {
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
        disposition: this.getTokenDisposition(token.disposition),
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
    };

    return Promise.resolve(sceneData);
  }

  /**
   * Get world information
   */
  getWorldInfo(): Promise<WorldInfo> {
    // World info doesn't require special permissions as it's basic metadata

    const usersSource: unknown = game.users;
    const users =
      usersSource &&
      typeof usersSource === 'object' &&
      Symbol.iterator in (usersSource as Record<string, unknown>)
        ? Array.from(usersSource as Iterable<unknown>).filter(
            (user): user is { id?: string; name?: string; active?: boolean; isGM?: boolean } =>
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

  /**
   * Get available compendium packs
   */
  getAvailablePacks(): Promise<
    Array<{
      id: string;
      label: string;
      type?: string;
      system?: string;
      private?: boolean;
    }>
  > {
    const packsSource: unknown = game.packs;
    const packs =
      packsSource &&
      typeof packsSource === 'object' &&
      Symbol.iterator in (packsSource as Record<string, unknown>)
        ? Array.from(packsSource as Iterable<unknown>).filter(
            (
              pack
            ): pack is {
              metadata?: {
                id?: string;
                label?: string;
                type?: string;
                system?: string;
                private?: boolean;
              };
            } => Boolean(pack && typeof pack === 'object')
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

  /**
   * Sanitize data to remove sensitive information and make it JSON-safe
   */
  private sanitizeData(data: unknown): unknown {
    if (data === null || data === undefined) {
      return data;
    }

    if (typeof data !== 'object') {
      return data;
    }

    try {
      // removeSensitiveFields now returns a sanitized copy
      const sanitized = this.removeSensitiveFields(data);

      // Use custom JSON serializer to avoid deprecated property warnings
      const jsonString = this.safeJSONStringify(sanitized);
      return JSON.parse(jsonString);
    } catch (error) {
      console.warn(`[${this.moduleId}] Failed to sanitize data:`, error);
      return {};
    }
  }

  /**
   * Remove sensitive fields from data object with circular reference protection
   * Returns a sanitized copy instead of modifying the original
   */
  private removeSensitiveFields(
    obj: unknown,
    visited: WeakSet<object> = new WeakSet(),
    depth: number = 0
  ): unknown {
    // Handle primitives
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    // Safety depth limit to prevent extremely deep recursion
    if (depth > 50) {
      console.warn(`[${this.moduleId}] Sanitization depth limit reached at depth ${depth}`);
      return '[Max depth reached]';
    }

    // Check for circular reference
    if (visited.has(obj)) {
      return '[Circular Reference]';
    }

    // Mark this object as visited
    visited.add(obj);

    try {
      // Handle arrays
      if (Array.isArray(obj)) {
        return obj.map(item => this.removeSensitiveFields(item, visited, depth + 1));
      }

      // Create a new sanitized object
      const sanitized: Record<string, unknown> = {};

      for (const [key, value] of Object.entries(obj)) {
        // Skip sensitive and problematic fields entirely
        if (this.isSensitiveOrProblematicField(key)) {
          continue;
        }

        // Skip most private properties except essential ones
        if (key.startsWith('_') && !['_id', '_stats', '_source'].includes(key)) {
          continue;
        }

        // Recursively sanitize the value
        sanitized[key] = this.removeSensitiveFields(value, visited, depth + 1);
      }

      return sanitized;
    } catch (error) {
      console.warn(`[${this.moduleId}] Error during sanitization at depth ${depth}:`, error);
      return '[Sanitization failed]';
    }
  }

  /**
   * Check if a field should be excluded from sanitized output
   */
  private isSensitiveOrProblematicField(key: string): boolean {
    const sensitiveKeys = [
      'password',
      'token',
      'secret',
      'key',
      'auth',
      'credential',
      'session',
      'cookie',
      'private',
    ];

    const problematicKeys = [
      'parent',
      '_parent',
      'collection',
      'apps',
      'document',
      '_document',
      'constructor',
      'prototype',
      '__proto__',
      'valueOf',
      'toString',
    ];

    // Skip deprecated ability save properties that trigger warnings
    const deprecatedKeys = [
      'save', // Skip the deprecated 'save' property on abilities
    ];

    return (
      sensitiveKeys.includes(key) || problematicKeys.includes(key) || deprecatedKeys.includes(key)
    );
  }

  /**
   * Custom JSON serializer that handles Foundry objects safely
   */
  private safeJSONStringify(obj: unknown): string {
    try {
      return JSON.stringify(obj, (key: string, value: unknown): unknown => {
        // Skip deprecated properties during JSON serialization
        if (key === 'save' && typeof value === 'object' && value !== null) {
          // If this looks like a deprecated ability save object, skip it
          return undefined;
        }
        return value;
      });
    } catch (error) {
      console.warn(`[${this.moduleId}] JSON stringify failed, using fallback:`, error);
      return '{}';
    }
  }

  /**
   * Get token disposition as number
   */
  private getTokenDisposition(disposition: unknown): number {
    if (typeof disposition === 'number') {
      return disposition;
    }

    // Default to neutral if unknown
    return TOKEN_DISPOSITIONS.NEUTRAL;
  }

  /**
   * Validate that Foundry is ready and world is active
   */
  validateFoundryState(): void {
    if (!game?.ready) {
      throw new Error('Foundry VTT is not ready');
    }

    if (!game.world) {
      throw new Error('No active world');
    }

    if (!game.user) {
      throw new Error('No active user');
    }
  }

  /**
   * Audit log for write operations
   */
  private auditLog(
    operation: string,
    data: unknown,
    result: 'success' | 'failure',
    error?: string
  ): void {
    // Always audit write operations (no setting required)
    const logEntry = {
      timestamp: new Date().toISOString(),
      operation,
      user: game.user?.name ?? 'Unknown',
      userId: game.user?.id ?? 'unknown',
      world: game.world?.id ?? 'unknown',
      data: this.sanitizeData(data),
      result,
      error,
    };

    // Store in flags for persistence (optional)
    const worldApi = game.world as
      | {
          getFlag?: (scope: string, key: string) => unknown;
          setFlag?: (scope: string, key: string, value: unknown) => Promise<unknown>;
        }
      | null
      | undefined;
    if (worldApi?.setFlag && worldApi.getFlag) {
      const auditLogsRaw = worldApi.getFlag(this.moduleId, 'auditLogs');
      const auditLogs = Array.isArray(auditLogsRaw) ? auditLogsRaw : [];
      auditLogs.push(logEntry);

      // Keep only last 100 entries to prevent bloat
      if (auditLogs.length > 100) {
        auditLogs.splice(0, auditLogs.length - 100);
      }

      void worldApi.setFlag(this.moduleId, 'auditLogs', auditLogs);
    }
  }

  // ===== PHASE 2 & 3: WRITE OPERATIONS =====

  /**
   * Create journal entry for quests
   */
  async createJournalEntry(request: {
    name: string;
    content: string;
    folderName?: string;
  }): Promise<FoundryJournalEntryResponse> {
    return this.journalAccess.createJournalEntry(request);
  }

  /**
   * List all journal entries
   */
  listJournals(): Promise<FoundryJournalSummary[]> {
    return this.journalAccess.listJournals();
  }

  /**
   * Get journal entry content
   */
  getJournalContent(journalId: string): Promise<FoundryJournalEntryResponse | null> {
    return this.journalAccess.getJournalContent(journalId);
  }

  /**
   * Update journal entry content
   */
  async updateJournalContent(request: {
    journalId: string;
    content: string;
  }): Promise<{ success: boolean }> {
    return this.journalAccess.updateJournalContent(request);
  }

  /**
   * Create actors from compendium entries with custom names
   */
  async createActorFromCompendium(request: ActorCreationRequest): Promise<ActorCreationResult> {
    return this.actorCreationAccess.createActorFromCompendium(request);
  }

  /**
   * Create actor from specific compendium entry using pack/item IDs
   */
  async createActorFromCompendiumEntry(
    request: CompendiumEntryActorCreationRequest
  ): Promise<ActorCreationResult> {
    return this.actorCreationAccess.createActorFromCompendiumEntry(request);
  }

  /**
   * Get full compendium document with all embedded data
   */
  async getCompendiumDocumentFull(
    packId: string,
    documentId: string
  ): Promise<CompendiumEntryFull> {
    return this.compendiumAccess.getCompendiumDocumentFull(packId, documentId);
  }

  /**
   * Add actors to the current scene as tokens
   */
  async addActorsToScene(
    placement: SceneTokenPlacement,
    transactionId?: string
  ): Promise<TokenPlacementResult> {
    return this.actorCreationAccess.addActorsToScene(placement, transactionId);
  }

  /**
   * Validate write operation permissions
   */
  validateWritePermissions(operation: 'createActor' | 'modifyScene'): Promise<{
    allowed: boolean;
    reason?: string;
    requiresConfirmation?: boolean;
    warnings?: string[];
  }> {
    this.validateFoundryState();

    const permissionCheck = permissionManager.checkWritePermission(operation);

    // Audit the permission check
    permissionManager.auditPermissionCheck(operation, permissionCheck);

    return Promise.resolve({
      allowed: permissionCheck.allowed,
      ...(permissionCheck.reason ? { reason: permissionCheck.reason } : {}),
      ...(permissionCheck.requiresConfirmation
        ? { requiresConfirmation: permissionCheck.requiresConfirmation }
        : {}),
      ...(permissionCheck.warnings ? { warnings: permissionCheck.warnings } : {}),
    });
  }

  /**
   * Request player rolls - creates interactive roll buttons in chat
   */
  async requestPlayerRolls(data: {
    rollType: string;
    rollTarget: string;
    targetPlayer: string;
    isPublic: boolean;
    rollModifier: string;
    flavor: string;
  }): Promise<{ success: boolean; message: string; error?: string }> {
    this.validateFoundryState();

    try {
      // Resolve target player from character name or player name with enhanced error handling
      const playerInfo = this.resolveTargetPlayer(data.targetPlayer);
      if (!playerInfo.found) {
        // Provide structured error message for MCP that Claude Desktop can understand
        const errorMessage =
          playerInfo.errorMessage ?? `Could not find player or character: ${data.targetPlayer}`;

        return {
          success: false,
          message: '',
          error: errorMessage,
        };
      }

      // Build roll formula based on type and target
      const rollFormula = this.buildRollFormula(
        data.rollType,
        data.rollTarget,
        data.rollModifier,
        playerInfo.character
      );

      // Generate roll button HTML
      const randomIdFn = (foundry as unknown as { utils?: { randomID?: () => string } }).utils
        ?.randomID;
      const buttonId = typeof randomIdFn === 'function' ? randomIdFn() : crypto.randomUUID();
      const buttonLabel = this.buildRollButtonLabel(data.rollType, data.rollTarget, data.isPublic);

      // Check if this type of roll was already performed (optional: could check for duplicate recent rolls)
      // For now, we'll just create the button and let the rendering logic handle the state restoration

      const rollButtonHtml = `
        <div class="mcp-roll-request" style="margin: 12px 0; padding: 12px; border: 1px solid #ccc; border-radius: 8px; background: #f9f9f9;">
          <p><strong>Roll Request:</strong> ${buttonLabel}</p>
          <p><strong>Target:</strong> ${playerInfo.targetName} ${playerInfo.character ? `(${playerInfo.character.name})` : ''}</p>
          ${data.flavor ? `<p><strong>Context:</strong> ${data.flavor}</p>` : ''}

          <div style="text-align: center; margin-top: 8px;">
            <!-- Single Roll Button (clickable by both character owner and GM) -->
            <button class="mcp-roll-button mcp-button-active"
                    data-button-id="${buttonId}"
                    data-roll-formula="${rollFormula}"
                    data-roll-label="${buttonLabel}"
                    data-is-public="${data.isPublic}"
                    data-character-id="${playerInfo.character?.id ?? ''}"
                    data-target-user-id="${playerInfo.user?.id ?? ''}">
              🎲 ${buttonLabel}
            </button>
          </div>
        </div>
      `;

      // Create chat message with roll button
      // For PUBLIC rolls: both roll request and results visible to all players
      // For PRIVATE rolls: both roll request and results visible to target player + GM only
      const whisperTargets: string[] = [];

      if (!data.isPublic) {
        // Private roll request: whisper to target player + GM only

        // Always whisper to the character owner if they exist
        if (playerInfo.user?.id) {
          whisperTargets.push(playerInfo.user.id);
        }

        // Also send to GM (GMs can see all whispered messages anyway, but this ensures they see it)
        const usersSource: unknown = game.users;
        const gmUsers =
          usersSource &&
          typeof usersSource === 'object' &&
          Symbol.iterator in (usersSource as Record<string, unknown>)
            ? Array.from(usersSource as Iterable<unknown>).filter(
                (candidate): candidate is UserLookupLike => {
                  if (!candidate || typeof candidate !== 'object') {
                    return false;
                  }

                  const userCandidate = candidate as UserLookupLike;
                  return userCandidate.isGM === true && userCandidate.active === true;
                }
              )
            : [];
        for (const gm of gmUsers) {
          if (gm.id && !whisperTargets.includes(gm.id)) {
            whisperTargets.push(gm.id);
          }
        }
      }

      const chatMessageApi = ChatMessage as unknown as {
        getSpeaker: (data: { actor?: unknown }) => unknown;
        create: (data: Record<string, unknown>) => Promise<unknown>;
      };
      const constStyles = CONST as unknown as {
        CHAT_MESSAGE_STYLES?: { OTHER?: number };
      };

      const messageData: Record<string, unknown> = {
        content: rollButtonHtml,
        speaker: chatMessageApi.getSpeaker({ actor: game.user }),
        style: constStyles.CHAT_MESSAGE_STYLES?.OTHER ?? 0, // Use style instead of deprecated type
        whisper: whisperTargets,
        flags: {
          [MODULE_ID]: {
            rollButtons: {
              [buttonId]: {
                rolled: false,
                rollFormula,
                rollLabel: buttonLabel,
                isPublic: data.isPublic,
                characterId: playerInfo.character?.id ?? '',
                targetUserId: playerInfo.user?.id ?? '',
              },
            },
          },
        },
      };

      const chatMessageRaw = await chatMessageApi.create(messageData);
      const chatMessageId =
        chatMessageRaw && typeof chatMessageRaw === 'object' && 'id' in chatMessageRaw
          ? (chatMessageRaw as { id?: unknown }).id
          : null;

      // Store message ID for later updates
      if (typeof chatMessageId === 'string' && chatMessageId.length > 0) {
        this.saveRollButtonMessageId(buttonId, chatMessageId);
      }

      // Note: Click handlers are attached globally via renderChatMessageHTML hook in main.ts
      // This ensures all users get the handlers when they see the message

      return {
        success: true,
        message: `Roll request sent to ${playerInfo.targetName}. ${data.isPublic ? 'Public roll' : 'Private roll'} button created in chat.`,
      };
    } catch (error) {
      console.error(`[${MODULE_ID}] Error creating roll request:`, error);
      return {
        success: false,
        message: '',
        error: error instanceof Error ? error.message : 'Unknown error creating roll request',
      };
    }
  }

  /**
   * Enhanced player resolution with offline/non-existent player detection
   * Supports partial matching and provides structured error messages for MCP
   */
  private resolveTargetPlayer(targetPlayer: string): {
    found: boolean;
    user?: UserLookupLike;
    character?: ActorLookupLike;
    targetName: string;
    errorType?: 'PLAYER_OFFLINE' | 'PLAYER_NOT_FOUND' | 'CHARACTER_NOT_FOUND';
    errorMessage?: string;
  } {
    const searchTerm = targetPlayer.toLowerCase().trim();

    // FIRST: Check all registered users (both active and inactive) for player name match
    const usersSource: unknown = game.users;
    const allUsers =
      usersSource &&
      typeof usersSource === 'object' &&
      'values' in usersSource &&
      typeof (usersSource as { values?: unknown }).values === 'function'
        ? Array.from((usersSource as { values: () => Iterable<unknown> }).values()).filter(
            (candidate): candidate is UserLookupLike =>
              Boolean(candidate && typeof candidate === 'object')
          )
        : [];

    const actorsSource: unknown = game.actors;
    const actors =
      actorsSource &&
      typeof actorsSource === 'object' &&
      Symbol.iterator in (actorsSource as Record<string, unknown>)
        ? Array.from(actorsSource as Iterable<unknown>).filter(
            (candidate): candidate is ActorLookupLike =>
              Boolean(candidate && typeof candidate === 'object')
          )
        : [];

    // Try exact player name match first (active and inactive users)
    let user = allUsers.find(
      u => typeof u.name === 'string' && u.name.toLowerCase() === searchTerm
    );

    if (user) {
      const isActive = user.active;

      if (!isActive) {
        // Player exists but is offline
        return {
          found: false,
          user,
          targetName: user.name ?? 'Unknown Player',
          errorType: 'PLAYER_OFFLINE',
          errorMessage: `Player "${user.name}" is registered but not currently logged in. They need to be online to receive roll requests.`,
        };
      }

      // Find the player's character for roll calculations
      const playerCharacter = actors.find(actor => {
        if (!user) return false;
        return Boolean(actor.testUserPermission?.(user, 'OWNER') && user.isGM !== true);
      });

      return {
        found: true,
        user,
        ...(playerCharacter && { character: playerCharacter }), // Include character only if found
        targetName: user.name ?? 'Unknown Player',
      };
    }

    // Try partial player name match (active and inactive users)
    if (!user) {
      user = allUsers.find(u => {
        return typeof u.name === 'string' ? u.name.toLowerCase().includes(searchTerm) : false;
      });

      if (user) {
        const isActive = user.active;

        if (!isActive) {
          // Player exists but is offline
          return {
            found: false,
            user,
            targetName: user.name ?? 'Unknown Player',
            errorType: 'PLAYER_OFFLINE',
            errorMessage: `Player "${user.name}" is registered but not currently logged in. They need to be online to receive roll requests.`,
          };
        }

        // Find the player's character for roll calculations
        const playerCharacter = actors.find(actor => {
          if (!user) return false;
          return Boolean(actor.testUserPermission?.(user, 'OWNER') && user.isGM !== true);
        });

        return {
          found: true,
          user,
          ...(playerCharacter && { character: playerCharacter }), // Include character only if found
          targetName: user.name ?? 'Unknown Player',
        };
      }
    }

    // SECOND: Try to find by character name (exact match, then partial match)
    let character = actors.find(
      actor =>
        typeof actor.name === 'string' &&
        actor.name.toLowerCase() === searchTerm &&
        actor.hasPlayerOwner === true
    );

    // If no exact character match, try partial match
    if (!character) {
      character = actors.find(actor => {
        return (
          typeof actor.name === 'string' &&
          actor.name.toLowerCase().includes(searchTerm) &&
          actor.hasPlayerOwner === true
        );
      });
    }

    if (character) {
      // Find the actual player owner (not GM) of this character
      const ownerUser = allUsers.find(
        u => character.testUserPermission?.(u, 'OWNER') && u.isGM !== true
      );

      if (ownerUser) {
        const isOwnerActive = ownerUser.active;

        if (!isOwnerActive) {
          // Character owner exists but is offline
          return {
            found: false,
            user: ownerUser,
            character,
            targetName: ownerUser.name ?? 'Unknown Player',
            errorType: 'PLAYER_OFFLINE',
            errorMessage: `Player "${ownerUser.name}" (owner of character "${character.name}") is registered but not currently logged in. They need to be online to receive roll requests.`,
          };
        }

        return {
          found: true,
          user: ownerUser,
          character,
          targetName: ownerUser.name ?? 'Unknown Player',
        };
      } else {
        // No player owner found - character is GM-only controlled
        // Still return found=true but without user, GM can still roll for it
        return {
          found: true,
          character,
          targetName: character.name ?? 'Unknown Character',
          // user is omitted (undefined) for GM-only characters
        };
      }
    }

    // THIRD: Check if the search term might be a character that exists but has no player owner
    const anyCharacter = actors.find(actor => {
      if (typeof actor.name !== 'string') {
        return false;
      }

      return (
        actor.name.toLowerCase() === searchTerm || actor.name.toLowerCase().includes(searchTerm)
      );
    });

    if (anyCharacter && !anyCharacter.hasPlayerOwner) {
      return {
        found: true,
        character: anyCharacter,
        targetName: anyCharacter.name ?? 'Unknown Character',
        // No user for GM-controlled characters
      };
    }

    // No player or character found at all

    return {
      found: false,
      targetName: targetPlayer,
      errorType: 'PLAYER_NOT_FOUND',
      errorMessage: `No player or character named "${targetPlayer}" found. Available players: ${
        allUsers
          .filter(u => u.isGM !== true)
          .map(u => u.name ?? 'Unknown Player')
          .join(', ') || 'none'
      }`,
    };
  }

  /**
   * Build roll formula based on roll type and target using Foundry's roll data system
   */
  private buildRollFormula(
    rollType: string,
    rollTarget: string,
    rollModifier: string,
    character?: ActorLookupLike
  ): string {
    type CharacterRollData = {
      abilities?: Record<string, { mod?: number; save?: number }>;
      skills?: Record<string, { total?: number }>;
      attributes?: { init?: { mod?: number } };
    };

    let baseFormula = '1d20';

    if (character) {
      // Use Foundry's getRollData() to get calculated modifiers including active effects
      const getRollDataFn = character.getRollData;
      const rollDataRaw = typeof getRollDataFn === 'function' ? getRollDataFn.call(character) : {};
      const rollData =
        rollDataRaw && typeof rollDataRaw === 'object'
          ? (rollDataRaw as CharacterRollData)
          : ({} as CharacterRollData);

      switch (rollType) {
        case 'ability': {
          // Use calculated ability modifier from roll data
          const abilityMod = rollData.abilities?.[rollTarget]?.mod ?? 0;
          baseFormula = `1d20+${abilityMod}`;
          break;
        }

        case 'skill': {
          // Map skill name to skill code (D&D 5e uses 3-letter codes)
          const skillCode = this.getSkillCode(rollTarget);
          // Use calculated skill total from roll data (includes ability mod + proficiency + bonuses)
          const skillMod = rollData.skills?.[skillCode]?.total ?? 0;
          baseFormula = `1d20+${skillMod}`;
          break;
        }

        case 'save': {
          // Use saving throw modifier from roll data
          const saveMod =
            rollData.abilities?.[rollTarget]?.save ?? rollData.abilities?.[rollTarget]?.mod ?? 0;
          baseFormula = `1d20+${saveMod}`;
          break;
        }

        case 'initiative': {
          // Use initiative modifier from attributes or dex mod
          const initMod = rollData.attributes?.init?.mod ?? rollData.abilities?.dex?.mod ?? 0;
          baseFormula = `1d20+${initMod}`;
          break;
        }

        case 'custom':
          baseFormula = rollTarget; // Use rollTarget as the formula directly
          break;

        default:
          baseFormula = '1d20';
      }
    } else {
      console.warn(`[${MODULE_ID}] No character provided for roll formula, using base 1d20`);
    }

    // Add modifier if provided
    if (rollModifier?.trim()) {
      const modifier =
        rollModifier.startsWith('+') || rollModifier.startsWith('-')
          ? rollModifier
          : `+${rollModifier}`;
      baseFormula += modifier;
    }

    return baseFormula;
  }

  /**
   * Map skill names to D&D 5e skill codes
   */
  private getSkillCode(skillName: string): string {
    const skillMap: { [key: string]: string } = {
      acrobatics: 'acr',
      'animal handling': 'ani',
      animalhandling: 'ani',
      arcana: 'arc',
      athletics: 'ath',
      deception: 'dec',
      history: 'his',
      insight: 'ins',
      intimidation: 'itm',
      investigation: 'inv',
      medicine: 'med',
      nature: 'nat',
      perception: 'prc',
      performance: 'prf',
      persuasion: 'per',
      religion: 'rel',
      'sleight of hand': 'slt',
      sleightofhand: 'slt',
      stealth: 'ste',
      survival: 'sur',
    };

    const normalizedName = skillName.toLowerCase().replace(/\s+/g, '');
    const skillCode =
      skillMap[normalizedName] || skillMap[skillName.toLowerCase()] || skillName.toLowerCase();

    return skillCode;
  }

  /**
   * Build roll button label
   */
  private buildRollButtonLabel(rollType: string, rollTarget: string, isPublic: boolean): string {
    const visibility = isPublic ? 'Public' : 'Private';

    switch (rollType) {
      case 'ability':
        return `${rollTarget.toUpperCase()} Ability Check (${visibility})`;
      case 'skill':
        return `${rollTarget.charAt(0).toUpperCase() + rollTarget.slice(1)} Skill Check (${visibility})`;
      case 'save':
        return `${rollTarget.toUpperCase()} Saving Throw (${visibility})`;
      case 'attack':
        return `${rollTarget} Attack (${visibility})`;
      case 'initiative':
        return `Initiative Roll (${visibility})`;
      case 'custom':
        return `Custom Roll (${visibility})`;
      default:
        return `Roll (${visibility})`;
    }
  }

  /**
   * Restore roll button states from persistent storage
   * Called when chat messages are rendered to maintain state across sessions
   */

  /**
   * Attach click handlers to roll buttons and handle visibility
   * Called by global renderChatMessageHTML hook in main.ts
   */
  public attachRollButtonHandlers(html: JQuery): void {
    const currentUserId = game.user?.id;
    const isGM = game.user?.isGM;

    // Note: Roll state restoration now handled by ChatMessage content, not DOM manipulation

    // Handle button visibility and styling based on permissions and public/private status
    // IMPORTANT: Skip styling for buttons that are already in rolled state
    html.find('.mcp-roll-button').each((_index, element) => {
      const button = $(element);
      const targetUserIdRaw: unknown = button.data('target-user-id') as unknown;
      const targetUserId = typeof targetUserIdRaw === 'string' ? targetUserIdRaw : null;
      const isPublicRollRaw: unknown = button.data('is-public') as unknown;
      const isPublicRoll = isPublicRollRaw === true || isPublicRollRaw === 'true';

      // Note: No need to check for rolled state - ChatMessage.update() replaces buttons with completion status

      // Determine if user can interact with this button
      const canClickButton = isGM || (targetUserId && targetUserId === currentUserId);

      if (isPublicRoll) {
        // Public roll: show to all players, but style differently for non-clickable users
        if (canClickButton) {
          // Can click: normal active button
          button.css({
            background: '#4CAF50',
            cursor: 'pointer',
            opacity: '1',
          });
        } else {
          // Cannot click: disabled/informational style
          button.css({
            background: '#9E9E9E',
            cursor: 'not-allowed',
            opacity: '0.7',
          });
          button.prop('disabled', true);
        }
      } else {
        // Private roll: only show to target user and GM
        if (canClickButton) {
          button.show();
        } else {
          button.hide();
        }
      }
    });

    // Attach click handlers to roll buttons
    html.find('.mcp-roll-button').on('click', event => {
      void (async (): Promise<void> => {
        const button = $(event.currentTarget);

        // Ignore clicks on disabled buttons
        if (button.prop('disabled')) {
          return;
        }

        // Prevent double-clicks by immediately disabling the button
        button.prop('disabled', true);
        const originalText = button.text();
        button.text('🎲 Rolling...');

        // Check if this button is already being processed by another user
        const buttonIdRaw: unknown = button.data('button-id') as unknown;
        const buttonId = typeof buttonIdRaw === 'string' ? buttonIdRaw : null;
        if (buttonId && this.isRollButtonProcessing(buttonId)) {
          button.text('🎲 Processing...');
          return;
        }

        // Mark this button as being processed
        if (buttonId) {
          this.setRollButtonProcessing(buttonId, true);
        }

        // Validate button has required data
        if (!buttonId) {
          console.warn(`[${MODULE_ID}] Button missing button-id data attribute`);
          button.prop('disabled', false);
          button.text(originalText);
          return;
        }

        const rollFormulaRaw: unknown = button.data('roll-formula') as unknown;
        const rollLabelRaw: unknown = button.data('roll-label') as unknown;
        const isPublicRaw: unknown = button.data('is-public') as unknown;
        const isPublic = isPublicRaw === true || isPublicRaw === 'true'; // Convert to proper boolean
        const characterIdRaw: unknown = button.data('character-id') as unknown;
        const targetUserIdRaw: unknown = button.data('target-user-id') as unknown;
        const isGmRoll = game.user?.isGM ?? false; // Determine if this is a GM executing the roll

        const rollFormula =
          typeof rollFormulaRaw === 'string' && rollFormulaRaw.trim().length > 0
            ? rollFormulaRaw
            : null;
        const rollLabel = typeof rollLabelRaw === 'string' ? rollLabelRaw : 'Roll';
        const characterId = typeof characterIdRaw === 'string' ? characterIdRaw : null;
        const targetUserId = typeof targetUserIdRaw === 'string' ? targetUserIdRaw : null;
        if (!rollFormula) {
          ui.notifications?.error('Invalid roll formula');
          button.prop('disabled', false);
          button.text(originalText);
          return;
        }

        // Check if user has permission to execute this roll
        // Allow GM to roll for any character, or allow character owner to roll for their character
        const canExecuteRoll =
          (game.user?.isGM ?? false) || (targetUserId !== null && targetUserId === game.user?.id);

        if (!canExecuteRoll) {
          console.warn(`[${MODULE_ID}] Permission denied for roll execution`);
          ui.notifications?.warn('You do not have permission to execute this roll');
          return;
        }

        try {
          // Create and evaluate the roll
          const RollCtor = Roll as unknown as new (formula: string) => {
            evaluate: () => Promise<unknown>;
            toMessage: (
              message: Record<string, unknown>,
              options: { create: boolean; rollMode: string }
            ) => Promise<unknown>;
          };
          const roll = new RollCtor(rollFormula);
          await roll.evaluate();

          // Get the character for speaker info
          const actorsCollection = game.actors as
            | { get: (id: string) => unknown }
            | null
            | undefined;
          const character =
            characterId && actorsCollection ? actorsCollection.get(characterId) : null;

          // Use the modern Foundry v13 approach with roll.toMessage()
          const rollMode = isPublic ? 'publicroll' : 'whisper';
          const whisperTargets: string[] = [];

          if (!isPublic) {
            // For private rolls: whisper to target + GM
            if (targetUserId) {
              whisperTargets.push(targetUserId);
            }
            // Add all active GMs
            const usersSource: unknown = game.users ?? [];
            const users =
              usersSource &&
              typeof usersSource === 'object' &&
              Symbol.iterator in (usersSource as Record<string, unknown>)
                ? Array.from(usersSource as Iterable<unknown>)
                : [];
            for (const gm of users) {
              if (!gm || typeof gm !== 'object') {
                continue;
              }

              const gmUser = gm as UserLookupLike;
              if (gmUser.isGM === true && gmUser.active === true && gmUser.id) {
                if (!whisperTargets.includes(gmUser.id)) {
                  whisperTargets.push(gmUser.id);
                }
              }
            }
          }

          const messageData: Record<string, unknown> = {
            speaker: (
              ChatMessage as unknown as { getSpeaker: (data: { actor: unknown }) => unknown }
            ).getSpeaker({ actor: character }),
            flavor: `${rollLabel} ${isGmRoll ? '(GM Override)' : ''}`,
            ...(whisperTargets.length > 0 ? { whisper: whisperTargets } : {}),
          };

          // Use roll.toMessage() with proper rollMode
          await roll.toMessage(messageData, {
            create: true,
            rollMode,
          });

          // Update the ChatMessage to reflect rolled state
          const currentButtonIdRaw: unknown = button.data('button-id') as unknown;
          const currentButtonId =
            typeof currentButtonIdRaw === 'string' ? currentButtonIdRaw : null;
          const currentUserId = typeof game.user?.id === 'string' ? game.user.id : null;
          if (currentButtonId && currentUserId) {
            try {
              await this.updateRollButtonMessage(currentButtonId, currentUserId, rollLabel);
            } catch (updateError) {
              console.error(`[${MODULE_ID}] Failed to update chat message:`, updateError);
              console.error(
                `[${MODULE_ID}] Error details:`,
                updateError instanceof Error ? updateError.stack : updateError
              );
              // Fall back to DOM manipulation if message update fails
              button.prop('disabled', true).text('✓ Rolled');
            }
          } else {
            console.warn(`[${MODULE_ID}] Cannot update ChatMessage - missing buttonId or userId:`, {
              buttonId: currentButtonId,
              userId: currentUserId,
            });
          }
        } catch (error) {
          console.error(`[${MODULE_ID}] Error executing roll:`, error);
          ui.notifications?.error('Failed to execute roll');

          // Re-enable button on error so user can try again
          button.prop('disabled', false);
          button.text(originalText);
        } finally {
          // Clear processing state
          if (buttonId) {
            this.setRollButtonProcessing(buttonId, false);
          }
        }
      })();
    });
  }

  /**
   * Get enhanced creature index for campaign analysis
   */
  async getEnhancedCreatureIndex(): Promise<Record<string, unknown>[]> {
    this.validateFoundryState();
    return this.compendiumAccess.getEnhancedCreatureIndex();
  }

  /**
   * Save roll button state to persistent storage
   */
  async saveRollState(buttonId: string, userId: string): Promise<void> {
    // LEGACY METHOD - Redirecting to new ChatMessage.update() system

    try {
      // Use the new ChatMessage.update() approach instead
      const rollLabel = 'Legacy Roll'; // We don't have the label here, use generic
      await this.updateRollButtonMessage(buttonId, userId, rollLabel);
    } catch (error) {
      console.error(`[${MODULE_ID}] Legacy saveRollState redirect failed:`, error);
      // Don't throw - we don't want to break the old system completely
    }
  }

  /**
   * Get roll button state from persistent storage
   */
  getRollState(
    buttonId: string
  ): { rolled: boolean; rolledBy?: string; rolledByName?: string; timestamp?: number } | null {
    this.validateFoundryState();

    try {
      const rollStatesRaw: unknown = game.settings.get(MODULE_ID, 'rollStates') as unknown;
      const rollStates =
        rollStatesRaw && typeof rollStatesRaw === 'object'
          ? (rollStatesRaw as Record<string, unknown>)
          : {};
      const state = rollStates[buttonId];
      return state && typeof state === 'object'
        ? (state as {
            rolled: boolean;
            rolledBy?: string;
            rolledByName?: string;
            timestamp?: number;
          })
        : null;
    } catch (error) {
      console.error(`[${MODULE_ID}] Error getting roll state:`, error);
      return null;
    }
  }

  /**
   * Save button ID to message ID mapping for ChatMessage updates
   */
  saveRollButtonMessageId(buttonId: string, messageId: string): void {
    try {
      const buttonMessageMapRaw: unknown = game.settings.get(
        MODULE_ID,
        'buttonMessageMap'
      ) as unknown;
      const buttonMessageMap =
        buttonMessageMapRaw && typeof buttonMessageMapRaw === 'object'
          ? (buttonMessageMapRaw as Record<string, unknown>)
          : {};
      buttonMessageMap[buttonId] = messageId;
      void game.settings.set(MODULE_ID, 'buttonMessageMap', buttonMessageMap);
    } catch (error) {
      console.error(`[${MODULE_ID}] Error saving button-message mapping:`, error);
    }
  }

  /**
   * Get message ID for a roll button
   */
  getRollButtonMessageId(buttonId: string): string | null {
    try {
      const buttonMessageMapRaw: unknown = game.settings.get(
        MODULE_ID,
        'buttonMessageMap'
      ) as unknown;
      const buttonMessageMap =
        buttonMessageMapRaw && typeof buttonMessageMapRaw === 'object'
          ? (buttonMessageMapRaw as Record<string, unknown>)
          : {};

      const messageId = buttonMessageMap[buttonId];
      return typeof messageId === 'string' ? messageId : null;
    } catch (error) {
      console.error(`[${MODULE_ID}] Error getting button-message mapping:`, error);
      return null;
    }
  }

  /**
   * Get roll button state from ChatMessage flags
   */
  getRollStateFromMessage(chatMessage: unknown, buttonId: string): RollButtonState | null {
    try {
      if (!chatMessage || typeof chatMessage !== 'object') {
        return null;
      }

      const typedMessage = chatMessage as ChatMessageLike;
      const rollButtonsRaw = typedMessage.getFlag(MODULE_ID, 'rollButtons');
      if (!rollButtonsRaw || typeof rollButtonsRaw !== 'object') {
        return null;
      }

      const state = (rollButtonsRaw as Record<string, unknown>)[buttonId];
      return state && typeof state === 'object' ? (state as RollButtonState) : null;
    } catch (error) {
      console.error(`[${MODULE_ID}] Error getting roll state from message:`, error);
      return null;
    }
  }

  /**
   * Update the ChatMessage to replace button with rolled state
   */
  async updateRollButtonMessage(
    buttonId: string,
    userId: string,
    rollLabel: string
  ): Promise<void> {
    try {
      // Get the message ID for this button
      const messageId = this.getRollButtonMessageId(buttonId);

      if (!messageId) {
        throw new Error(`No message ID found for button ${buttonId}`);
      }

      // Get the chat message
      const messagesCollection = game.messages as
        | { get: (id: string) => unknown }
        | null
        | undefined;
      const chatMessageRaw = messagesCollection ? messagesCollection.get(messageId) : null;
      const chatMessage =
        chatMessageRaw && typeof chatMessageRaw === 'object'
          ? (chatMessageRaw as ChatMessageLike)
          : null;

      if (!chatMessage) {
        throw new Error(`ChatMessage ${messageId} not found`);
      }

      const usersCollection = game.users as
        | { get: (id: string) => unknown; find: (predicate: (user: unknown) => boolean) => unknown }
        | null
        | undefined;
      const rolledByUser = usersCollection ? usersCollection.get(userId) : null;
      const rolledByName =
        rolledByUser && typeof rolledByUser === 'object' && 'name' in rolledByUser
          ? ((rolledByUser as UserLookupLike).name ?? 'Unknown')
          : 'Unknown';
      const timestamp = new Date().toLocaleString();

      // Check permissions before attempting update
      const canUpdate = chatMessage.canUserModify(game.user, 'update');

      if (!canUpdate && !game.user?.isGM) {
        // Non-GM user cannot update message - request GM to do it via socket

        // Find online GM
        const onlineGMRaw = usersCollection
          ? usersCollection.find(candidate => {
              if (!candidate || typeof candidate !== 'object') {
                return false;
              }

              const gmCandidate = candidate as UserLookupLike;
              return gmCandidate.isGM === true && gmCandidate.active === true;
            })
          : null;
        const onlineGM =
          onlineGMRaw && typeof onlineGMRaw === 'object' ? (onlineGMRaw as UserLookupLike) : null;
        if (!onlineGM) {
          throw new Error('No Game Master is online to update the chat message');
        }

        // Send socket request to GM
        if (game.socket) {
          game.socket.emit('module.foundry-mcp-bridge', {
            type: 'requestMessageUpdate',
            buttonId,
            userId,
            rollLabel,
            messageId,
            fromUserId: game.user.id,
            targetGM: onlineGM.id,
          });
          return; // Exit early - GM will handle the update
        } else {
          throw new Error('Socket not available for GM communication');
        }
      }

      // Update the message flags to mark button as rolled
      const currentFlags =
        chatMessage.flags && typeof chatMessage.flags === 'object'
          ? chatMessage.flags
          : ({} as Record<string, unknown>);
      const moduleFlagsRaw = currentFlags[MODULE_ID];
      const moduleFlags =
        moduleFlagsRaw && typeof moduleFlagsRaw === 'object'
          ? (moduleFlagsRaw as Record<string, unknown>)
          : {};
      const rollButtonsRaw = moduleFlags.rollButtons;
      const rollButtons =
        rollButtonsRaw && typeof rollButtonsRaw === 'object'
          ? (rollButtonsRaw as Record<string, RollButtonState>)
          : {};

      rollButtons[buttonId] = {
        ...rollButtons[buttonId],
        rolled: true,
        rolledBy: userId,
        rolledByName,
        timestamp: Date.now(),
      };

      // Create the rolled state HTML
      const rolledHtml = `
        <div class="mcp-roll-request" style="margin: 10px 0; padding: 10px; border: 1px solid #ccc; border-radius: 5px; background: #f9f9f9;">
          <p><strong>Roll Request:</strong> ${rollLabel}</p>
          <p><strong>Status:</strong> ✅ <strong>Completed by ${rolledByName}</strong> at ${timestamp}</p>
        </div>
      `;

      // Update the message content and flags
      await chatMessage.update({
        content: rolledHtml,
        flags: {
          ...currentFlags,
          [MODULE_ID]: {
            ...moduleFlags,
            rollButtons,
          },
        },
      });
    } catch (error) {
      console.error(`[${MODULE_ID}] Error updating roll button message:`, error);
      console.error(`[${MODULE_ID}] Error stack:`, error instanceof Error ? error.stack : error);
      throw error;
    }
  }

  /**
   * Request GM to save roll state (for non-GM users who can't write to world settings)
   */
  requestRollStateSave(buttonId: string, userId: string): void {
    // LEGACY METHOD - Redirecting to new ChatMessage.update() system

    try {
      // Use the new ChatMessage.update() approach instead
      const rollLabel = 'Legacy Roll'; // We don't have the label here, use generic
      this.updateRollButtonMessage(buttonId, userId, rollLabel)
        .then(() => {})
        .catch(error => {
          console.error(`[${MODULE_ID}] Legacy requestRollStateSave redirect failed:`, error);
          // If the new system fails, just log it - don't use the old socket system
        });
    } catch (error) {
      console.error(`[${MODULE_ID}] Error in legacy requestRollStateSave redirect:`, error);
    }
  }

  /**
   * Broadcast roll state change to all connected users for real-time sync
   */
  broadcastRollState(_buttonId: string, _rollState: unknown): void {
    // LEGACY METHOD - No longer needed with ChatMessage.update() system
    // ChatMessage.update() automatically broadcasts to all clients, so this method is no longer needed
  }

  /**
   * Clean up old roll states (optional maintenance)
   * Removes roll states older than 30 days to prevent storage bloat
   */
  async cleanOldRollStates(): Promise<number> {
    this.validateFoundryState();

    try {
      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const rollStatesRaw: unknown = game.settings.get(MODULE_ID, 'rollStates') as unknown;
      const rollStates: Record<string, unknown> =
        rollStatesRaw && typeof rollStatesRaw === 'object'
          ? (rollStatesRaw as Record<string, unknown>)
          : {};
      let cleanedCount = 0;

      // Remove old roll states
      for (const [buttonId, rollState] of Object.entries(rollStates)) {
        if (rollState && typeof rollState === 'object' && 'timestamp' in rollState) {
          const timestamp = (rollState as { timestamp?: unknown }).timestamp;
          if (typeof timestamp === 'number' && timestamp < thirtyDaysAgo) {
            delete rollStates[buttonId];
            cleanedCount++;
          }
        }
      }

      if (cleanedCount > 0) {
        await game.settings.set(MODULE_ID, 'rollStates', rollStates);
      }

      return cleanedCount;
    } catch (error) {
      console.error(`[${MODULE_ID}] Error cleaning old roll states:`, error);
      return 0;
    }
  }

  /**
   * Set actor ownership permission for a user
   */
  async setActorOwnership(data: {
    actorId: string;
    userId: string;
    permission: number;
  }): Promise<{ success: boolean; message: string; error?: string }> {
    this.validateFoundryState();

    try {
      const actorsCollection = game.actors as { get?: (id: string) => unknown } | undefined;
      const actorRaw = actorsCollection?.get?.(data.actorId);
      const actor = actorRaw && typeof actorRaw === 'object' ? (actorRaw as ActorLookupLike) : null;
      if (!actor) {
        return { success: false, error: `Actor not found: ${data.actorId}`, message: '' };
      }

      const usersCollection = game.users as { get?: (id: string) => unknown } | undefined;
      const userRaw = usersCollection?.get?.(data.userId);
      const user = userRaw && typeof userRaw === 'object' ? (userRaw as UserLookupLike) : null;
      if (!user) {
        return { success: false, error: `User not found: ${data.userId}`, message: '' };
      }

      // Get current ownership
      const typedActor = actor;
      const currentOwnership = typedActor.ownership ?? {};
      const newOwnership = { ...currentOwnership };

      // Set the new permission level
      newOwnership[data.userId] = data.permission;

      // Update the actor
      await typedActor.update?.({ ownership: newOwnership });

      const permissionNames = { 0: 'NONE', 1: 'LIMITED', 2: 'OBSERVER', 3: 'OWNER' };
      const permissionName =
        permissionNames[data.permission as keyof typeof permissionNames] ||
        data.permission.toString();

      return {
        success: true,
        message: `Set ${typedActor.name ?? 'Actor'} ownership to ${permissionName} for ${user.name ?? 'User'}`,
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

  /**
   * Get actor ownership information
   */
  getActorOwnership(data: { actorIdentifier?: string; playerIdentifier?: string }): Promise<
    Array<{
      id: string;
      name: string;
      type: string;
      ownership: Array<{
        userId: string;
        userName: string;
        permission: string;
        numericPermission: number;
      }>;
    }>
  > {
    return this.actorDirectoryAccess.getActorOwnership(data);
  }

  /**
   * Find actor by name or ID
   */
  private findActorByIdentifier(identifier: string): ActorLookupLike | null {
    return this.actorDirectoryAccess.findActorByIdentifier(identifier) as ActorLookupLike | null;
  }

  /**
   * Get friendly NPCs from current scene
   */
  getFriendlyNPCs(): Promise<Array<{ id: string; name: string }>> {
    return this.actorDirectoryAccess.getFriendlyNPCs();
  }

  /**
   * Get party characters (player-owned actors)
   */
  getPartyCharacters(): Promise<Array<{ id: string; name: string }>> {
    return this.actorDirectoryAccess.getPartyCharacters();
  }

  /**
   * Get connected players (excluding GM)
   */
  getConnectedPlayers(): Promise<Array<{ id: string; name: string }>> {
    return this.actorDirectoryAccess.getConnectedPlayers();
  }

  /**
   * Find players by identifier with partial matching
   */
  findPlayers(data: {
    identifier: string;
    allowPartialMatch?: boolean;
    includeCharacterOwners?: boolean;
  }): Promise<Array<{ id: string; name: string }>> {
    return this.actorDirectoryAccess.findPlayers(data);
  }

  /**
   * Find single actor by identifier
   */
  findActor(data: { identifier: string }): Promise<{ id: string; name: string } | null> {
    return this.actorDirectoryAccess.findActor(data);
  }

  // Private storage for tracking roll button processing states
  private rollButtonProcessingStates: Map<string, boolean> = new Map();

  /**
   * Check if a roll button is currently being processed
   */
  private isRollButtonProcessing(buttonId: string): boolean {
    return this.rollButtonProcessingStates.get(buttonId) ?? false;
  }

  /**
   * Set roll button processing state
   */
  private setRollButtonProcessing(buttonId: string, processing: boolean): void {
    if (processing) {
      this.rollButtonProcessingStates.set(buttonId, true);
    } else {
      this.rollButtonProcessingStates.delete(buttonId);
    }
  }

  /**
   * List all scenes with filtering options
   */
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
    return this.sceneInteractionAccess.listScenes(options);
  }

  /**
   * Switch to a different scene
   */
  async switchScene(options: { scene_identifier: string; optimize_view?: boolean }): Promise<{
    success: boolean;
    sceneId?: string;
    sceneName?: string;
    dimensions: { width: number; height: number };
  }> {
    return this.sceneInteractionAccess.switchScene(options);
  }

  // ===== PHASE 7: CHARACTER ENTITY AND TOKEN MANIPULATION METHODS =====

  /**
   * Get detailed information about a specific entity within a character (item, action, or effect)
   */
  getCharacterEntity(data: {
    characterIdentifier: string;
    entityIdentifier: string;
  }): Record<string, unknown> {
    return this.sceneInteractionAccess.getCharacterEntity(data);
  }

  /**
   * Move a token to a new position on the scene
   */
  async moveToken(data: { tokenId: string; x: number; y: number; animate?: boolean }): Promise<{
    success: boolean;
    tokenId?: string;
    tokenName?: string;
    newPosition: { x: number; y: number };
    animated: boolean;
  }> {
    return this.sceneInteractionAccess.moveToken(data);
  }

  /**
   * Update token properties
   */
  async updateToken(data: { tokenId: string; updates: Record<string, unknown> }): Promise<{
    success: boolean;
    tokenId?: string;
    tokenName?: string;
    updatedProperties: string[];
  }> {
    return this.sceneInteractionAccess.updateToken(data);
  }

  /**
   * Delete one or more tokens from the scene
   */
  async deleteTokens(data: { tokenIds: string[] }): Promise<{
    success: boolean;
    deletedCount: number;
    deletedTokens: string[];
    failedTokens?: string[];
  }> {
    return this.sceneInteractionAccess.deleteTokens(data);
  }

  /**
   * Get detailed information about a token
   */
  getTokenDetails(data: { tokenId: string }): Record<string, unknown> {
    return this.sceneInteractionAccess.getTokenDetails(data);
  }

  /**
   * Toggle a status condition on a token
   */
  async toggleTokenCondition(data: {
    tokenId: string;
    conditionId: string;
    active: boolean;
  }): Promise<Record<string, unknown>> {
    return this.sceneInteractionAccess.toggleTokenCondition(data);
  }

  /**
   * Get all available conditions for the current game system
   */
  getAvailableConditions(): Record<string, unknown> {
    return this.sceneInteractionAccess.getAvailableConditions();
  }

  /**
   * Move a token to a new position
   */

  /**
   * Use an item on a character (cast spell, use ability, consume item, etc.)
   * This triggers the item's default use behavior in Foundry VTT
   */
  async useItem(params: {
    actorIdentifier: string;
    itemIdentifier: string;
    targets?: string[] | undefined; // Target character/token names or IDs. "self" targets the caster.
    options?:
      | {
          consume?: boolean | undefined; // Whether to consume charges/uses
          configureDialog?: boolean | undefined; // Whether to show configuration dialog
          skipDialog?: boolean | undefined; // Skip confirmation dialogs (default: true for MCP)
          spellLevel?: number | undefined; // For spells: cast at higher level
          versatile?: boolean | undefined; // For versatile weapons: use versatile damage
        }
      | undefined;
  }): Promise<{
    success: boolean;
    status?: string;
    message: string;
    itemName?: string;
    actorName?: string;
    targets?: string[];
    requiresGMInteraction?: boolean;
  }> {
    return this.sceneInteractionAccess.useItem(params);
  }
}
