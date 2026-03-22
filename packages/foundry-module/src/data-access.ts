import { MODULE_ID } from './constants.js';
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
import {
  FoundryRollRequestAccess,
  type RollButtonState,
} from './data-access/roll-request-access.js';
import { FoundrySceneInteractionAccess } from './data-access/scene-interaction-access.js';
import {
  FoundryWorldAccess,
  type AvailablePackSummary,
  type SceneInfo,
  type WorldInfo,
} from './data-access/world-access.js';
import type {
  FoundryCharacterInfo,
  FoundryCompendiumEntryFull,
  FoundryJournalEntryResponse,
  FoundryJournalSummary,
  UnknownRecord,
} from '@foundry-mcp/shared';

type CharacterInfo = FoundryCharacterInfo<UnknownRecord, UnknownRecord, UnknownRecord>;

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
  private rollRequestAccess: FoundryRollRequestAccess;
  private sceneInteractionAccess: FoundrySceneInteractionAccess;
  private worldAccess: FoundryWorldAccess;

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
    this.rollRequestAccess = new FoundryRollRequestAccess({
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
    this.worldAccess = new FoundryWorldAccess({
      validateFoundryState: (): void => this.validateFoundryState(),
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
    return this.worldAccess.listActors();
  }

  /**
   * Get active scene information
   */
  getActiveScene(): Promise<SceneInfo> {
    return this.worldAccess.getActiveScene();
  }

  /**
   * Get world information
   */
  getWorldInfo(): Promise<WorldInfo> {
    return this.worldAccess.getWorldInfo();
  }

  /**
   * Get available compendium packs
   */
  getAvailablePacks(): Promise<AvailablePackSummary[]> {
    return this.worldAccess.getAvailablePacks();
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
    return this.rollRequestAccess.requestPlayerRolls(data);
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
    this.rollRequestAccess.attachRollButtonHandlers(html);
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
    return this.rollRequestAccess.saveRollState(buttonId, userId);
  }

  /**
   * Get roll button state from persistent storage
   */
  getRollState(buttonId: string): RollButtonState | null {
    return this.rollRequestAccess.getRollState(buttonId);
  }

  /**
   * Save button ID to message ID mapping for ChatMessage updates
   */
  saveRollButtonMessageId(buttonId: string, messageId: string): void {
    this.rollRequestAccess.saveRollButtonMessageId(buttonId, messageId);
  }

  /**
   * Get message ID for a roll button
   */
  getRollButtonMessageId(buttonId: string): string | null {
    return this.rollRequestAccess.getRollButtonMessageId(buttonId);
  }

  /**
   * Get roll button state from ChatMessage flags
   */
  getRollStateFromMessage(chatMessage: unknown, buttonId: string): RollButtonState | null {
    return this.rollRequestAccess.getRollStateFromMessage(chatMessage, buttonId);
  }

  /**
   * Update the ChatMessage to replace button with rolled state
   */
  async updateRollButtonMessage(
    buttonId: string,
    userId: string,
    rollLabel: string
  ): Promise<void> {
    return this.rollRequestAccess.updateRollButtonMessage(buttonId, userId, rollLabel);
  }

  /**
   * Request GM to save roll state (for non-GM users who can't write to world settings)
   */
  requestRollStateSave(buttonId: string, userId: string): void {
    this.rollRequestAccess.requestRollStateSave(buttonId, userId);
  }

  /**
   * Broadcast roll state change to all connected users for real-time sync
   */
  broadcastRollState(buttonId: string, rollState: unknown): void {
    this.rollRequestAccess.broadcastRollState(buttonId, rollState);
  }

  /**
   * Clean up old roll states (optional maintenance)
   * Removes roll states older than 30 days to prevent storage bloat
   */
  async cleanOldRollStates(): Promise<number> {
    return this.rollRequestAccess.cleanOldRollStates();
  }

  /**
   * Set actor ownership permission for a user
   */
  async setActorOwnership(data: {
    actorId: string;
    userId: string;
    permission: number;
  }): Promise<{ success: boolean; message: string; error?: string }> {
    return this.actorDirectoryAccess.setActorOwnership(data);
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
