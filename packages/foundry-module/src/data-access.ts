import { MODULE_ID, ERROR_MESSAGES, TOKEN_DISPOSITIONS } from './constants.js';
import { permissionManager } from './permissions.js';
import { transactionManager } from './transaction-manager.js';
// Local type definitions to avoid shared package import issues
interface CharacterInfo {
  id: string;
  name: string;
  type: string;
  img?: string;
  system: Record<string, unknown>;
  items: CharacterItem[];
  effects: CharacterEffect[];
  actions?: unknown[]; // PF2e actions (strikes, spells, etc.)
  itemVariants?: unknown[]; // Item rule element variants (ChoiceSet, etc.)
  itemToggles?: unknown[]; // Item rule element toggles (RollOption, ToggleProperty, equipped)
  spellcasting?: SpellcastingEntry[]; // PF2e/D&D 5e spellcasting entries
}

interface SpellcastingEntry {
  id: string;
  name: string;
  tradition?: string | undefined; // arcane, divine, primal, occult (PF2e)
  type: string; // prepared, spontaneous, innate, focus (PF2e) or class name (5e)
  ability?: string | undefined; // spellcasting ability (int, wis, cha)
  dc?: number | undefined;
  attack?: number | undefined;
  slots?: Record<string, { value: number; max: number }> | undefined; // spell slots per level/rank
  spells: SpellInfo[];
}

interface SpellInfo {
  id: string;
  name: string;
  level: number; // spell level/rank
  prepared?: boolean | undefined; // for prepared casters
  expended?: boolean | undefined; // has this spell slot been used
  traits?: string[] | undefined;
  actionCost?: string | undefined; // 1, 2, 3, reaction, free
  // Targeting info - helps Claude decide whether to specify targets
  range?: string | undefined; // "touch", "self", "60 feet", etc.
  target?: string | undefined; // "1 creature", "self", "area", etc.
  area?: string | undefined; // "20-foot radius", "30-foot cone", etc. (for template spells)
}

interface CharacterItem {
  id: string;
  name: string;
  type: string;
  img?: string;
  system: Record<string, unknown>;
}

interface CharacterEffect {
  id: string;
  name: string;
  icon?: string;
  disabled: boolean;
  duration?: {
    type: string;
    duration?: number;
    remaining?: number;
  };
}

interface CompendiumSearchResult {
  id: string;
  name: string;
  type: string;
  img?: string;
  pack: string;
  packLabel: string;
  system?: Record<string, unknown>;
  summary?: string;
  hasImage?: boolean;
  description?: string;
}

// D&D 5e Enhanced Creature Index
interface DnD5eCreatureIndex {
  id: string;
  name: string;
  type: string;
  pack: string;
  packLabel: string;
  challengeRating: number;
  creatureType: string;
  size: string;
  hitPoints: number;
  armorClass: number;
  hasSpells: boolean;
  hasLegendaryActions: boolean;
  alignment: string;
  description?: string;
  img?: string;
}

// Pathfinder 2e Enhanced Creature Index
interface PF2eCreatureIndex {
  id: string;
  name: string;
  type: string;
  pack: string;
  packLabel: string;
  level: number; // PF2e: -1 to 25+
  traits: string[]; // PF2e: ['dragon', 'fire', 'amphibious']
  creatureType: string; // Primary trait extracted from traits array
  rarity: string; // PF2e: 'common', 'uncommon', 'rare', 'unique'
  size: string;
  hitPoints: number;
  armorClass: number;
  hasSpells: boolean;
  alignment: string;
  description?: string;
  img?: string;
}

// Union type for both systems
type EnhancedCreatureIndex = DnD5eCreatureIndex | PF2eCreatureIndex;

interface PersistentIndexMetadata {
  version: string;
  timestamp: number;
  packFingerprints: Map<string, PackFingerprint>;
  totalCreatures: number;
  gameSystem: string; // 'dnd5e' or 'pf2e'
}

interface PackFingerprint {
  packId: string;
  packLabel: string;
  lastModified: number;
  documentCount: number;
  checksum: string;
}

interface PersistentEnhancedIndex {
  metadata: PersistentIndexMetadata;
  creatures: EnhancedCreatureIndex[];
}

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

interface FolderLike {
  id?: string;
  name?: string;
  type?: string;
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

interface CompendiumPackMetadataLike {
  id: string;
  label: string;
  type?: string;
  lastModified?: string | number | Date;
}

interface CompendiumPackLike {
  metadata: CompendiumPackMetadataLike;
  index?: { size?: number };
  indexed?: boolean;
  getIndex: (options: Record<string, unknown>) => Promise<unknown>;
  getDocuments: () => Promise<unknown[]>;
}

interface PackCollectionLike {
  values: () => Iterable<unknown>;
  get: (id: string) => unknown;
}

interface CompendiumActorDocumentLike {
  _id: string;
  name: string;
  type: string;
  img?: string;
  system?: unknown;
}

interface NotificationLike {
  remove: () => void;
}

interface UserLookupLike {
  id?: string;
  name?: string;
  isGM?: boolean;
  active?: boolean;
}

interface TokenDispositionLike {
  id?: string;
  name?: string;
  disposition?: number;
  actor?: { id?: string; name?: string };
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

interface ActiveEffectLike {
  id?: string;
  name?: string;
  label?: string;
  statuses?: { has: (statusId: string) => boolean };
}

interface ActorLike {
  id?: string;
  name?: string;
  type?: string;
  img?: string;
  effects?: { contents?: unknown[] };
  createEmbeddedDocuments: (
    embeddedName: string,
    docs: Array<Record<string, unknown>>
  ) => Promise<unknown>;
  deleteEmbeddedDocuments: (embeddedName: string, ids: string[]) => Promise<unknown>;
}

interface TokenLike {
  id?: string;
  name?: string;
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
  actor?: ActorLike;
}

interface SceneWithTokensLike {
  tokens: {
    get: (tokenId: string) => TokenLike | undefined;
  };
}

interface ConditionLike {
  id?: string;
  name?: string;
  label?: string;
  icon?: string;
  img?: string;
  description?: string;
  flags?: Record<string, unknown>;
  changes?: unknown[];
  duration?: Record<string, unknown>;
  origin?: string;
}

interface WorldInfo {
  id: string;
  title: string;
  system: string;
  systemVersion: string;
  foundryVersion: string;
  users: WorldUser[];
}

interface WorldUser {
  id: string;
  name: string;
  active: boolean;
  isGM: boolean;
}

// Phase 2: Write Operation Interfaces
interface ActorCreationRequest {
  creatureType: string;
  customNames?: string[] | undefined;
  packPreference?: string | undefined;
  quantity?: number | undefined;
  addToScene?: boolean | undefined;
}

interface ActorCreationResult {
  success: boolean;
  actors: CreatedActorInfo[];
  errors?: string[] | undefined;
  tokensPlaced?: number;
  totalRequested: number;
  totalCreated: number;
}

interface CreatedActorInfo {
  id: string;
  name: string;
  originalName: string;
  type: string;
  sourcePackId: string;
  sourcePackLabel: string;
  img?: string | undefined;
}

interface CompendiumEntryFull {
  id: string;
  name: string;
  type: string;
  img?: string | undefined;
  pack: string;
  packLabel: string;
  system: Record<string, unknown>;
  items?: CompendiumItem[];
  effects?: CompendiumEffect[];
  fullData: Record<string, unknown>;
}

interface CompendiumItem {
  id: string;
  name: string;
  type: string;
  img?: string | undefined;
  system: Record<string, unknown>;
}

interface CompendiumEffect {
  id: string;
  name: string;
  icon?: string | undefined;
  disabled: boolean;
  duration?: Record<string, unknown>;
}

interface SceneTokenPlacement {
  actorIds: string[];
  placement: 'random' | 'grid' | 'center' | 'coordinates';
  hidden: boolean;
  coordinates?: { x: number; y: number }[];
}

interface TokenPlacementResult {
  success: boolean;
  tokensCreated: number;
  tokenIds: string[];
  errors?: string[] | undefined;
}

/**
 * Persistent Enhanced Creature Index System
 * Stores pre-computed creature data in JSON file within Foundry world directory for instant filtering
 * Uses file-based storage following Foundry best practices for large data sets
 */
class PersistentCreatureIndex {
  private moduleId: string = MODULE_ID;
  private readonly INDEX_VERSION = '1.0.0';
  private readonly INDEX_FILENAME = 'enhanced-creature-index.json';
  private buildInProgress = false;
  private hooksRegistered = false;

  constructor() {
    this.registerFoundryHooks();
  }

  private isCompendiumPackLike(pack: unknown): pack is CompendiumPackLike {
    if (!pack || typeof pack !== 'object') {
      return false;
    }

    const typedPack = pack as Partial<CompendiumPackLike>;
    const metadata = typedPack.metadata;
    return Boolean(
      metadata &&
        typeof metadata.id === 'string' &&
        typeof metadata.label === 'string' &&
        typeof typedPack.getDocuments === 'function' &&
        typeof typedPack.getIndex === 'function'
    );
  }

  private getPackCollection(): PackCollectionLike | null {
    if (!game || typeof game !== 'object') {
      return null;
    }

    const maybeCollection = (game as { packs?: unknown }).packs;
    if (!maybeCollection || typeof maybeCollection !== 'object') {
      return null;
    }

    const collection = maybeCollection as Partial<PackCollectionLike>;
    if (typeof collection.values !== 'function' || typeof collection.get !== 'function') {
      return null;
    }

    return collection as PackCollectionLike;
  }

  private getActorPacks(): CompendiumPackLike[] {
    const packCollection = this.getPackCollection();
    if (!packCollection) {
      return [];
    }

    return Array.from(packCollection.values()).filter(
      (pack): pack is CompendiumPackLike =>
        this.isCompendiumPackLike(pack) && pack.metadata.type === 'Actor'
    );
  }

  private asNotification(value: unknown): NotificationLike | null {
    if (!value || typeof value !== 'object') {
      return null;
    }

    const candidate = value as Partial<NotificationLike>;
    return typeof candidate.remove === 'function' ? (candidate as NotificationLike) : null;
  }

  private isCompendiumActorDocumentLike(doc: unknown): doc is CompendiumActorDocumentLike {
    if (!doc || typeof doc !== 'object') {
      return false;
    }

    const typedDoc = doc as Partial<CompendiumActorDocumentLike>;
    return (
      typeof typedDoc._id === 'string' &&
      typeof typedDoc.name === 'string' &&
      typeof typedDoc.type === 'string'
    );
  }

  private getPathValue(source: unknown, path: string[]): unknown {
    let current: unknown = source;

    for (const key of path) {
      if (!current || typeof current !== 'object') {
        return undefined;
      }
      current = (current as Record<string, unknown>)[key];
    }

    return current;
  }

  private firstDefined(values: unknown[], fallback: unknown): unknown {
    for (const value of values) {
      if (value !== undefined && value !== null && value !== '') {
        return value;
      }
    }
    return fallback;
  }

  private toNumber(value: unknown, fallback: number): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string') {
      if (value === '1/8') return 0.125;
      if (value === '1/4') return 0.25;
      if (value === '1/2') return 0.5;

      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    }

    return fallback;
  }

  private toStringValue(value: unknown, fallback: string): string {
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
    if (value === undefined || value === null) {
      return fallback;
    }
    return String(value);
  }

  /**
   * Get the file path for the enhanced creature index
   */
  private getIndexFilePath(): string {
    // Store in world data directory using world ID
    return `worlds/${game.world.id}/${this.INDEX_FILENAME}`;
  }

  /**
   * Get or build the enhanced creature index
   */
  async getEnhancedIndex(): Promise<EnhancedCreatureIndex[]> {
    // Check if we have a valid persistent index
    const existingIndex = await this.loadPersistedIndex();

    if (existingIndex && this.isIndexValid(existingIndex)) {
      return existingIndex.creatures;
    }

    // Build new index if needed
    return await this.buildEnhancedIndex();
  }

  /**
   * Force rebuild of the enhanced index
   */
  async rebuildIndex(): Promise<EnhancedCreatureIndex[]> {
    return await this.buildEnhancedIndex(true);
  }

  /**
   * Load persisted index from JSON file
   */
  private async loadPersistedIndex(): Promise<PersistentEnhancedIndex | null> {
    try {
      const filePath = this.getIndexFilePath();
      const filePickerApi = foundry as unknown as {
        applications?: {
          apps?: {
            FilePicker?: {
              implementation?: {
                browse: (source: string, target: string) => Promise<unknown>;
                upload: (source: string, target: string, file: File) => Promise<unknown>;
              };
            };
          };
        };
      };

      // Check if file exists using Foundry's FilePicker
      let fileExists = false;
      try {
        const filePickerImplementation =
          filePickerApi.applications?.apps?.FilePicker?.implementation;
        const browseResultRaw = filePickerImplementation
          ? await filePickerImplementation.browse('data', `worlds/${game.world.id}`)
          : null;
        const browseResult =
          browseResultRaw && typeof browseResultRaw === 'object'
            ? (browseResultRaw as { files?: unknown[] })
            : {};
        fileExists = Array.isArray(browseResult.files)
          ? browseResult.files.some(
              file => typeof file === 'string' && file.endsWith(this.INDEX_FILENAME)
            )
          : false;
      } catch (error) {
        // Directory doesn't exist or other error, return null
        return null;
      }

      if (!fileExists) {
        return null;
      }

      // Load file content
      const response = await fetch(filePath);
      if (!response.ok) {
        console.warn(`[${this.moduleId}] Failed to load index file: ${response.status}`);
        return null;
      }

      const rawData = (await response.json()) as unknown;
      if (!rawData || typeof rawData !== 'object') {
        return null;
      }

      // Convert Map data back from JSON
      const metadata = (rawData as { metadata?: { packFingerprints?: unknown } }).metadata;
      if (metadata?.packFingerprints) {
        const fingerprintEntries = metadata.packFingerprints;
        metadata.packFingerprints = Array.isArray(fingerprintEntries)
          ? new Map(fingerprintEntries as Array<[string, PackFingerprint]>)
          : new Map<string, PackFingerprint>();
      }

      return rawData as PersistentEnhancedIndex;
    } catch (error) {
      console.warn(`[${this.moduleId}] Failed to load persisted index from file:`, error);
      return null;
    }
  }

  /**
   * Save enhanced index to JSON file
   */
  private async savePersistedIndex(index: PersistentEnhancedIndex): Promise<void> {
    try {
      const filePickerApi = foundry as unknown as {
        applications?: {
          apps?: {
            FilePicker?: {
              implementation?: {
                upload: (source: string, target: string, file: File) => Promise<unknown>;
              };
            };
          };
        };
      };

      // Convert Map to Array for JSON serialization
      const saveData = {
        ...index,
        metadata: {
          ...index.metadata,
          packFingerprints: Array.from(index.metadata.packFingerprints.entries()),
        },
      };

      const jsonContent = JSON.stringify(saveData, null, 2);

      // Create a File object and upload it using Foundry's file system
      const file = new File([jsonContent], this.INDEX_FILENAME, { type: 'application/json' });

      // Upload the file to the world directory
      const filePickerImplementation = filePickerApi.applications?.apps?.FilePicker?.implementation;
      const uploadResponse = filePickerImplementation
        ? await filePickerImplementation.upload('data', `worlds/${game.world.id}`, file)
        : null;

      if (!uploadResponse) {
        throw new Error('File upload failed');
      }
    } catch (error) {
      console.error(`[${this.moduleId}] Failed to save enhanced index to file:`, error);
      throw error;
    }
  }

  /**
   * Check if existing index is valid (all packs unchanged)
   */
  private isIndexValid(existingIndex: PersistentEnhancedIndex): boolean {
    // Check version
    if (existingIndex.metadata.version !== this.INDEX_VERSION) {
      return false;
    }

    // NEW: Check system compatibility
    const currentSystem = game.system.id;
    if (existingIndex.metadata.gameSystem !== currentSystem) {
      return false;
    }

    // Check each pack fingerprint
    const actorPacks = this.getActorPacks();

    for (const pack of actorPacks) {
      const currentFingerprint = this.generatePackFingerprint(pack);
      const savedFingerprint = existingIndex.metadata.packFingerprints.get(pack.metadata.id);

      if (!savedFingerprint) {
        return false;
      }

      if (!this.fingerprintsMatch(currentFingerprint, savedFingerprint)) {
        return false;
      }
    }

    // Check if any saved packs no longer exist
    const packCollection = this.getPackCollection();
    for (const [packId] of existingIndex.metadata.packFingerprints) {
      if (!packCollection?.get(packId)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Register Foundry hooks for real-time pack change detection
   */
  private registerFoundryHooks(): void {
    if (this.hooksRegistered) return;

    // Listen for compendium document changes
    const isActorCompendiumDocument = (document: unknown): boolean => {
      if (!document || typeof document !== 'object') {
        return false;
      }

      const typedDocument = document as { pack?: unknown; type?: unknown };
      return (
        Boolean(typedDocument.pack) &&
        (typedDocument.type === 'npc' ||
          typedDocument.type === 'character' ||
          typedDocument.type === 'creature')
      );
    };

    Hooks.on('createDocument', (document: unknown) => {
      if (isActorCompendiumDocument(document)) {
        void this.invalidateIndex();
      }
    });

    Hooks.on('updateDocument', (document: unknown) => {
      if (isActorCompendiumDocument(document)) {
        void this.invalidateIndex();
      }
    });

    Hooks.on('deleteDocument', (document: unknown) => {
      if (isActorCompendiumDocument(document)) {
        void this.invalidateIndex();
      }
    });

    Hooks.on('createCompendium', (pack: unknown) => {
      if (
        pack &&
        typeof pack === 'object' &&
        (pack as { metadata?: { type?: string } }).metadata?.type === 'Actor'
      ) {
        void this.invalidateIndex();
      }
    });

    Hooks.on('deleteCompendium', (pack: unknown) => {
      if (
        pack &&
        typeof pack === 'object' &&
        (pack as { metadata?: { type?: string } }).metadata?.type === 'Actor'
      ) {
        void this.invalidateIndex();
      }
    });

    this.hooksRegistered = true;
  }

  /**
   * Invalidate the current index (mark for rebuild on next access)
   */
  private async invalidateIndex(): Promise<void> {
    try {
      // Check if auto-rebuild is enabled
      const autoRebuild = Boolean(game.settings.get(this.moduleId, 'autoRebuildIndex'));

      if (!autoRebuild) {
        return;
      }

      // Delete the index file to force rebuild
      const filePath = this.getIndexFilePath();

      const filePickerApi = foundry as unknown as {
        applications?: {
          apps?: {
            FilePicker?: {
              implementation?: {
                browse: (source: string, target: string) => Promise<unknown>;
              };
            };
          };
        };
      };

      try {
        // Check if file exists first by trying to browse to the world directory
        const filePickerImplementation =
          filePickerApi.applications?.apps?.FilePicker?.implementation;
        const browseResultRaw = filePickerImplementation
          ? await filePickerImplementation.browse('data', `worlds/${game.world.id}`)
          : null;
        const browseResult =
          browseResultRaw && typeof browseResultRaw === 'object'
            ? (browseResultRaw as { files?: unknown[] })
            : {};
        const fileExists = Array.isArray(browseResult.files)
          ? browseResult.files.some(
              file => typeof file === 'string' && file.endsWith(this.INDEX_FILENAME)
            )
          : false;

        if (fileExists) {
          // File exists, delete it using fetch with DELETE method
          await fetch(filePath, { method: 'DELETE' });
          // File deletion completed (or failed silently)
        }
      } catch (error) {
        // File doesn't exist or deletion failed - that's okay
      }
    } catch (error) {
      console.warn(`[${this.moduleId}] Failed to invalidate index:`, error);
    }
  }

  /**
   * Generate fingerprint for pack change detection with improved accuracy
   */
  private generatePackFingerprint(pack: CompendiumPackLike): PackFingerprint {
    // Get actual modification time if available
    let lastModified = Date.now();
    if (pack.metadata.lastModified) {
      lastModified = new Date(pack.metadata.lastModified).getTime();
    }

    return {
      packId: pack.metadata.id,
      packLabel: pack.metadata.label,
      lastModified,
      documentCount: pack.index?.size ?? 0,
      checksum: this.generatePackChecksum(pack),
    };
  }

  /**
   * Generate checksum for pack contents
   */
  private generatePackChecksum(pack: CompendiumPackLike): string {
    // Simple checksum based on pack metadata and size
    const data = `${pack.metadata.id}-${pack.metadata.label}-${pack.index?.size ?? 0}`;
    return btoa(data).slice(0, 16); // Simple hash for demonstration
  }

  /**
   * Compare two pack fingerprints
   */
  private fingerprintsMatch(current: PackFingerprint, saved: PackFingerprint): boolean {
    return current.documentCount === saved.documentCount && current.checksum === saved.checksum;
  }

  /**
   * Build enhanced creature index from all Actor packs with detailed progress tracking
   */
  private async buildEnhancedIndex(force = false): Promise<EnhancedCreatureIndex[]> {
    if (this.buildInProgress && !force) {
      throw new Error('Index build already in progress');
    }

    // Detect game system ONCE at build time
    const gameSystem = (game as { system?: { id?: string } }).system?.id ?? '';

    // Route to system-specific builder
    if (gameSystem === 'pf2e') {
      return await this.buildPF2eIndex(force);
    } else if (gameSystem === 'dnd5e') {
      return await this.buildDnD5eIndex(force);
    } else {
      throw new Error(
        `Enhanced creature index not supported for system: ${gameSystem}. Only D&D 5e and Pathfinder 2e are currently supported.`
      );
    }
  }

  /**
   * Build D&D 5e enhanced creature index
   */
  private async buildDnD5eIndex(_force = false): Promise<DnD5eCreatureIndex[]> {
    this.buildInProgress = true;

    const startTime = Date.now();
    let progressNotification: NotificationLike | null = null;
    let totalErrors = 0; // Track extraction errors

    try {
      const actorPacks = this.getActorPacks();
      const enhancedCreatures: DnD5eCreatureIndex[] = [];
      const packFingerprints = new Map<string, PackFingerprint>();

      // Show initial progress notification
      progressNotification = this.asNotification(
        ui.notifications?.info(
          `Starting enhanced creature index build from ${actorPacks.length} packs...`
        )
      );

      for (let i = 0; i < actorPacks.length; i++) {
        const pack = actorPacks[i];
        const progressPercent = Math.round((i / actorPacks.length) * 100);

        // Update progress notification every few packs or for important packs
        if (i % 3 === 0 || pack.metadata.label.toLowerCase().includes('monster')) {
          if (progressNotification) {
            progressNotification.remove();
          }
          progressNotification = this.asNotification(
            ui.notifications?.info(
              `Building creature index... ${progressPercent}% (${i + 1}/${actorPacks.length}) Processing: ${pack.metadata.label}`
            )
          );
        }

        try {
          // Ensure pack index is loaded
          if (!pack.indexed) {
            await pack.getIndex({});
          }

          // Generate pack fingerprint for change detection
          packFingerprints.set(pack.metadata.id, this.generatePackFingerprint(pack));

          // Show pack processing details for large packs
          const packSize = pack.index?.size ?? 0;
          if (packSize > 50) {
            if (progressNotification) {
              progressNotification.remove();
            }
            progressNotification = this.asNotification(
              ui.notifications?.info(
                `Processing large pack: ${pack.metadata.label} (${packSize} documents)...`
              )
            );
          }

          // Process creatures in this pack
          const packResult = await this.extractDnD5eDataFromPack(pack);
          enhancedCreatures.push(...packResult.creatures);
          totalErrors += packResult.errors;

          // Pack processing completed: ${pack.metadata.label} - ${packResult.creatures.length} creatures extracted

          // Show milestone notifications for significant progress
          if (i === 0 || (i + 1) % 5 === 0 || i === actorPacks.length - 1) {
            const totalCreaturesSoFar = enhancedCreatures.length;
            if (progressNotification) {
              progressNotification.remove();
            }
            progressNotification = this.asNotification(
              ui.notifications?.info(
                `Index Progress: ${i + 1}/${actorPacks.length} packs complete, ${totalCreaturesSoFar} creatures indexed`
              )
            );
          }
        } catch (error) {
          console.warn(`[${this.moduleId}] Failed to process pack ${pack.metadata.label}:`, error);
          // Show error notification for pack failures
          ui.notifications?.warn(
            `Warning: Failed to index pack "${pack.metadata.label}" - continuing with other packs`
          );
        }
      }

      // Clear progress notification and show final processing step
      if (progressNotification) {
        progressNotification.remove();
      }
      ui.notifications?.info(
        `Saving enhanced index to world database... (${enhancedCreatures.length} creatures)`
      );

      // Create persistent index structure
      const persistentIndex: PersistentEnhancedIndex = {
        metadata: {
          version: this.INDEX_VERSION,
          timestamp: Date.now(),
          packFingerprints,
          totalCreatures: enhancedCreatures.length,
          gameSystem: 'dnd5e', // Mark as D&D 5e index
        },
        creatures: enhancedCreatures,
      };

      // Save to world flags
      await this.savePersistedIndex(persistentIndex);

      const buildTimeSeconds = Math.round((Date.now() - startTime) / 1000);
      const errorText = totalErrors > 0 ? ` (${totalErrors} extraction errors)` : '';
      const successMessage = `Enhanced creature index complete! ${enhancedCreatures.length} creatures indexed from ${actorPacks.length} packs in ${buildTimeSeconds}s${errorText}`;

      ui.notifications?.info(successMessage);

      return enhancedCreatures;
    } catch (error) {
      // Clear any progress notifications on error
      if (progressNotification) {
        progressNotification.remove();
      }

      const errorMessage = `Failed to build enhanced creature index: ${error instanceof Error ? error.message : 'Unknown error'}`;
      console.error(`[${this.moduleId}] ${errorMessage}`);
      ui.notifications?.error(errorMessage);

      throw error;
    } finally {
      this.buildInProgress = false;

      // Ensure progress notification is cleared
      if (progressNotification) {
        progressNotification.remove();
      }
    }
  }

  /**
   * Extract D&D 5e data from all documents in a pack
   */
  private async extractDnD5eDataFromPack(
    pack: CompendiumPackLike
  ): Promise<{ creatures: DnD5eCreatureIndex[]; errors: number }> {
    const creatures: DnD5eCreatureIndex[] = [];
    let errors = 0;

    try {
      // Load all documents from pack
      const documents = await pack.getDocuments();

      for (const doc of documents) {
        try {
          if (!this.isCompendiumActorDocumentLike(doc)) {
            continue;
          }

          // Only process NPCs, characters, and creatures
          if (doc.type !== 'npc' && doc.type !== 'character' && doc.type !== 'creature') {
            continue;
          }

          const result = this.extractDnD5eCreatureData(doc, pack);
          if (result) {
            creatures.push(result.creature);
            errors += result.errors;
          }
        } catch (error) {
          const docName =
            doc && typeof doc === 'object' && 'name' in doc && typeof doc.name === 'string'
              ? doc.name
              : 'Unknown document';
          console.warn(
            `[${this.moduleId}] Failed to extract data from ${docName} in ${pack.metadata.label}:`,
            error
          );
          errors++;
        }
      }
    } catch (error) {
      console.warn(
        `[${this.moduleId}] Failed to load documents from ${pack.metadata.label}:`,
        error
      );
      errors++;
    }

    return { creatures, errors };
  }

  /**
   * Extract D&D 5e creature data from a single document
   */
  private extractDnD5eCreatureData(
    doc: CompendiumActorDocumentLike,
    pack: CompendiumPackLike
  ): { creature: DnD5eCreatureIndex; errors: number } | null {
    try {
      const system = doc.system ?? {};

      const challengeRatingRaw = this.firstDefined(
        [
          this.getPathValue(system, ['details', 'cr']),
          this.getPathValue(system, ['details', 'cr', 'value']),
          this.getPathValue(system, ['cr', 'value']),
          this.getPathValue(system, ['cr']),
          this.getPathValue(system, ['attributes', 'cr', 'value']),
          this.getPathValue(system, ['attributes', 'cr']),
          this.getPathValue(system, ['challenge', 'rating']),
          this.getPathValue(system, ['challenge', 'cr']),
        ],
        0
      );
      const challengeRating = this.toNumber(challengeRatingRaw, 0);

      const creatureType = this.toStringValue(
        this.firstDefined(
          [
            this.getPathValue(system, ['details', 'type', 'value']),
            this.getPathValue(system, ['details', 'type']),
            this.getPathValue(system, ['type', 'value']),
            this.getPathValue(system, ['type']),
            this.getPathValue(system, ['race', 'value']),
            this.getPathValue(system, ['race']),
            this.getPathValue(system, ['details', 'race']),
          ],
          'unknown'
        ),
        'unknown'
      ).toLowerCase();

      const size = this.toStringValue(
        this.firstDefined(
          [
            this.getPathValue(system, ['traits', 'size', 'value']),
            this.getPathValue(system, ['traits', 'size']),
            this.getPathValue(system, ['size', 'value']),
            this.getPathValue(system, ['size']),
            this.getPathValue(system, ['details', 'size']),
          ],
          'medium'
        ),
        'medium'
      ).toLowerCase();

      const hitPoints = this.toNumber(
        this.firstDefined(
          [
            this.getPathValue(system, ['attributes', 'hp', 'max']),
            this.getPathValue(system, ['hp', 'max']),
            this.getPathValue(system, ['attributes', 'hp', 'value']),
            this.getPathValue(system, ['hp', 'value']),
            this.getPathValue(system, ['health', 'max']),
            this.getPathValue(system, ['health', 'value']),
          ],
          0
        ),
        0
      );

      const armorClass = this.toNumber(
        this.firstDefined(
          [
            this.getPathValue(system, ['attributes', 'ac', 'value']),
            this.getPathValue(system, ['ac', 'value']),
            this.getPathValue(system, ['attributes', 'ac']),
            this.getPathValue(system, ['ac']),
            this.getPathValue(system, ['armor', 'value']),
            this.getPathValue(system, ['armor']),
          ],
          10
        ),
        10
      );

      const alignment = this.toStringValue(
        this.firstDefined(
          [
            this.getPathValue(system, ['details', 'alignment', 'value']),
            this.getPathValue(system, ['details', 'alignment']),
            this.getPathValue(system, ['alignment', 'value']),
            this.getPathValue(system, ['alignment']),
          ],
          'unaligned'
        ),
        'unaligned'
      ).toLowerCase();

      const hasSpells =
        Boolean(this.getPathValue(system, ['spells'])) ||
        Boolean(this.getPathValue(system, ['attributes', 'spellcasting'])) ||
        this.toNumber(this.getPathValue(system, ['details', 'spellLevel']), 0) > 0 ||
        this.toNumber(this.getPathValue(system, ['resources', 'spell', 'max']), 0) > 0 ||
        Boolean(this.getPathValue(system, ['spellcasting'])) ||
        Boolean(this.getPathValue(system, ['traits', 'spellcasting'])) ||
        Boolean(this.getPathValue(system, ['details', 'spellcaster']));

      const hasLegendaryActions =
        Boolean(this.getPathValue(system, ['resources', 'legact'])) ||
        Boolean(this.getPathValue(system, ['legendary'])) ||
        this.toNumber(this.getPathValue(system, ['resources', 'legres', 'value']), 0) > 0 ||
        Boolean(this.getPathValue(system, ['details', 'legendary'])) ||
        Boolean(this.getPathValue(system, ['traits', 'legendary'])) ||
        this.toNumber(this.getPathValue(system, ['resources', 'legendary', 'max']), 0) > 0;

      const biography = this.getPathValue(system, ['details', 'biography']);
      const description = this.getPathValue(system, ['description']);

      // Successful extraction
      return {
        creature: {
          id: doc._id,
          name: doc.name,
          type: doc.type,
          pack: pack.metadata.id,
          packLabel: pack.metadata.label,
          challengeRating,
          creatureType: creatureType.toLowerCase(),
          size: size.toLowerCase(),
          hitPoints,
          armorClass,
          hasSpells,
          hasLegendaryActions,
          alignment,
          description: this.toStringValue(this.firstDefined([biography, description], ''), ''),
          ...(typeof doc.img === 'string' ? { img: doc.img } : {}),
        },
        errors: 0,
      };
    } catch (error) {
      console.warn(`[${this.moduleId}] Failed to extract enhanced data from ${doc.name}:`, error);

      // Return a basic fallback record with error count instead of null to avoid losing creatures
      return {
        creature: {
          id: doc._id,
          name: doc.name,
          type: doc.type,
          pack: pack.metadata.id,
          packLabel: pack.metadata.label,
          challengeRating: 0,
          creatureType: 'unknown',
          size: 'medium',
          hitPoints: 1,
          armorClass: 10,
          hasSpells: false,
          hasLegendaryActions: false,
          alignment: 'unaligned',
          description: 'Data extraction failed',
          img: doc.img ?? '',
        },
        errors: 1,
      };
    }
  }

  /**
   * Build Pathfinder 2e enhanced creature index
   */
  private async buildPF2eIndex(_force = false): Promise<PF2eCreatureIndex[]> {
    this.buildInProgress = true;

    const startTime = Date.now();
    let progressNotification: NotificationLike | null = null;
    let totalErrors = 0;

    try {
      const actorPacks = this.getActorPacks();
      const enhancedCreatures: PF2eCreatureIndex[] = [];
      const packFingerprints = new Map<string, PackFingerprint>();

      progressNotification = this.asNotification(
        ui.notifications?.info(
          `Starting PF2e creature index build from ${actorPacks.length} packs...`
        )
      );

      let currentPack = 0;
      for (const pack of actorPacks) {
        currentPack++;

        if (progressNotification) {
          progressNotification.remove();
        }
        progressNotification = this.asNotification(
          ui.notifications?.info(
            `Building PF2e index: Pack ${currentPack}/${actorPacks.length} (${pack.metadata.label})...`
          )
        );

        const fingerprint = this.generatePackFingerprint(pack);
        packFingerprints.set(pack.metadata.id, fingerprint);

        const result = await this.extractPF2eDataFromPack(pack);
        enhancedCreatures.push(...result.creatures);
        totalErrors += result.errors;
      }

      if (progressNotification) {
        progressNotification.remove();
      }
      ui.notifications?.info(
        `Saving PF2e index to world database... (${enhancedCreatures.length} creatures)`
      );

      const persistentIndex: PersistentEnhancedIndex = {
        metadata: {
          version: this.INDEX_VERSION,
          timestamp: Date.now(),
          packFingerprints,
          totalCreatures: enhancedCreatures.length,
          gameSystem: 'pf2e', // Mark as PF2e index
        },
        creatures: enhancedCreatures,
      };

      await this.savePersistedIndex(persistentIndex);

      const buildTimeSeconds = Math.round((Date.now() - startTime) / 1000);
      const errorText = totalErrors > 0 ? ` (${totalErrors} extraction errors)` : '';
      const successMessage = `PF2e creature index complete! ${enhancedCreatures.length} creatures indexed from ${actorPacks.length} packs in ${buildTimeSeconds}s${errorText}`;

      ui.notifications?.info(successMessage);

      return enhancedCreatures;
    } catch (error) {
      if (progressNotification) {
        progressNotification.remove();
      }

      const errorMessage = `Failed to build PF2e creature index: ${error instanceof Error ? error.message : 'Unknown error'}`;
      console.error(`[${this.moduleId}] ${errorMessage}`);
      ui.notifications?.error(errorMessage);

      throw error;
    } finally {
      this.buildInProgress = false;

      if (progressNotification) {
        progressNotification.remove();
      }
    }
  }

  /**
   * Extract PF2e creature data from all documents in a pack
   */
  private async extractPF2eDataFromPack(
    pack: CompendiumPackLike
  ): Promise<{ creatures: PF2eCreatureIndex[]; errors: number }> {
    const creatures: PF2eCreatureIndex[] = [];
    let errors = 0;

    try {
      const documents = await pack.getDocuments();

      for (const doc of documents) {
        try {
          if (!this.isCompendiumActorDocumentLike(doc)) {
            continue;
          }

          // Support NPCs, characters, and creatures
          if (doc.type !== 'npc' && doc.type !== 'character' && doc.type !== 'creature') {
            continue;
          }

          const result = this.extractPF2eCreatureData(doc, pack);
          if (result) {
            creatures.push(result.creature);
            errors += result.errors;
          }
        } catch (error) {
          const docName =
            doc && typeof doc === 'object' && 'name' in doc && typeof doc.name === 'string'
              ? doc.name
              : 'Unknown document';
          console.warn(
            `[${this.moduleId}] Failed to extract PF2e data from ${docName} in ${pack.metadata.label}:`,
            error
          );
          errors++;
        }
      }
    } catch (error) {
      console.warn(
        `[${this.moduleId}] Failed to load documents from ${pack.metadata.label}:`,
        error
      );
      errors++;
    }

    return { creatures, errors };
  }

  /**
   * Extract Pathfinder 2e creature data from a single document
   */
  private extractPF2eCreatureData(
    doc: CompendiumActorDocumentLike,
    pack: CompendiumPackLike
  ): { creature: PF2eCreatureIndex; errors: number } | null {
    try {
      const system = doc.system ?? {};

      const level = this.toNumber(this.getPathValue(system, ['details', 'level', 'value']), 0);

      const traitsValue = this.getPathValue(system, ['traits', 'value']);
      const traits = Array.isArray(traitsValue)
        ? traitsValue.filter((trait): trait is string => typeof trait === 'string')
        : [];

      // Extract primary creature type from traits
      const creatureTraits = [
        'aberration',
        'animal',
        'beast',
        'celestial',
        'construct',
        'dragon',
        'elemental',
        'fey',
        'fiend',
        'fungus',
        'humanoid',
        'monitor',
        'ooze',
        'plant',
        'undead',
      ];
      const creatureType =
        traits
          .find((trait: string) => creatureTraits.includes(trait.toLowerCase()))
          ?.toLowerCase() ?? 'unknown';

      // Rarity extraction (PF2e specific)
      const rarity = this.toStringValue(this.getPathValue(system, ['traits', 'rarity']), 'common');

      // Size extraction
      const sizeCode = this.toStringValue(
        this.getPathValue(system, ['traits', 'size', 'value']),
        'med'
      );
      // Normalize PF2e size values (tiny, sm, med, lg, huge, grg)
      const sizeMap: Record<string, string> = {
        tiny: 'tiny',
        sm: 'small',
        med: 'medium',
        lg: 'large',
        huge: 'huge',
        grg: 'gargantuan',
      };
      const size = sizeMap[sizeCode.toLowerCase()] ?? 'medium';

      // Hit Points
      const hitPoints = this.toNumber(this.getPathValue(system, ['attributes', 'hp', 'max']), 0);

      // Armor Class
      const armorClass = this.toNumber(
        this.getPathValue(system, ['attributes', 'ac', 'value']),
        10
      );

      // Spellcasting detection (PF2e uses spellcasting entries)
      const spellcasting = this.getPathValue(system, ['spellcasting']);
      const hasSpells =
        spellcasting && typeof spellcasting === 'object'
          ? Object.keys(spellcasting).length > 0
          : false;

      // Alignment
      const alignment = this.toStringValue(
        this.getPathValue(system, ['details', 'alignment', 'value']),
        'N'
      );

      const publicNotes = this.getPathValue(system, ['details', 'publicNotes']);
      const biography = this.getPathValue(system, ['details', 'biography']);

      return {
        creature: {
          id: doc._id,
          name: doc.name,
          type: doc.type,
          pack: pack.metadata.id,
          packLabel: pack.metadata.label,
          level,
          traits,
          creatureType,
          rarity,
          size,
          hitPoints,
          armorClass,
          hasSpells,
          alignment: alignment.toUpperCase(),
          description: this.toStringValue(this.firstDefined([publicNotes, biography], ''), ''),
          ...(typeof doc.img === 'string' ? { img: doc.img } : {}),
        },
        errors: 0,
      };
    } catch (error) {
      console.warn(`[${this.moduleId}] Failed to extract PF2e data from ${doc.name}:`, error);

      // Fallback with error count
      return {
        creature: {
          id: doc._id,
          name: doc.name,
          type: doc.type,
          pack: pack.metadata.id,
          packLabel: pack.metadata.label,
          level: 0,
          traits: [],
          creatureType: 'unknown',
          rarity: 'common',
          size: 'medium',
          hitPoints: 1,
          armorClass: 10,
          hasSpells: false,
          alignment: 'N',
          description: 'Data extraction failed',
          img: doc.img ?? '',
        },
        errors: 1,
      };
    }
  }
}

export class FoundryDataAccess {
  private moduleId: string = MODULE_ID;
  private persistentIndex: PersistentCreatureIndex = new PersistentCreatureIndex();

  constructor() {}

  /**
   * Force rebuild of enhanced creature index
   */
  async rebuildEnhancedCreatureIndex(): Promise<{
    success: boolean;
    totalCreatures: number;
    message: string;
  }> {
    try {
      const creatures = await this.persistentIndex.rebuildIndex();
      return {
        success: true,
        totalCreatures: creatures.length,
        message: `Enhanced creature index rebuilt: ${creatures.length} creatures indexed from all packs`,
      };
    } catch (error) {
      console.error(`[${this.moduleId}] Failed to rebuild enhanced creature index:`, error);
      return {
        success: false,
        totalCreatures: 0,
        message: `Failed to rebuild index: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Get character/actor information by name or ID
   */
  getCharacterInfo(identifier: string): Promise<CharacterInfo> {
    const actor = this.findActorByIdentifier(identifier);
    if (!actor) {
      throw new Error(`${ERROR_MESSAGES.CHARACTER_NOT_FOUND}: ${identifier}`);
    }

    const actorItems = Array.isArray(actor.items)
      ? actor.items
      : actor.items &&
          typeof actor.items === 'object' &&
          Array.isArray((actor.items as { contents?: unknown[] }).contents)
        ? ((actor.items as { contents?: unknown[] }).contents ?? [])
        : [];

    const actorEffects = Array.isArray(actor.effects)
      ? actor.effects
      : actor.effects &&
          typeof actor.effects === 'object' &&
          Array.isArray((actor.effects as { contents?: unknown[] }).contents)
        ? ((actor.effects as { contents?: unknown[] }).contents ?? [])
        : [];

    // Build character data structure
    const characterData: CharacterInfo = {
      id: actor.id ?? '',
      name: actor.name ?? '',
      type: actor.type ?? '',
      ...(actor.img ? { img: actor.img } : {}),
      system: this.sanitizeData(actor.system ?? {}) as Record<string, unknown>,
      items: actorItems.flatMap(item => {
        if (!item || typeof item !== 'object') {
          return [];
        }
        const typedItem = item as {
          id?: string;
          name?: string;
          type?: string;
          img?: string;
          system?: unknown;
        };
        if (!typedItem.id || !typedItem.name || !typedItem.type) {
          return [];
        }
        return {
          id: typedItem.id,
          name: typedItem.name,
          type: typedItem.type,
          ...(typedItem.img ? { img: typedItem.img } : {}),
          system: this.sanitizeData(typedItem.system ?? {}) as Record<string, unknown>,
        };
      }),
      effects: actorEffects.flatMap(effect => {
        if (!effect || typeof effect !== 'object') {
          return [];
        }
        const typedEffect = effect as {
          id?: string;
          name?: string;
          label?: string;
          icon?: string;
          disabled?: boolean;
          duration?: { type?: string; duration?: number; remaining?: number };
        };
        if (!typedEffect.id) {
          return [];
        }

        return {
          id: typedEffect.id,
          name: typedEffect.name ?? typedEffect.label ?? 'Unknown Effect',
          ...(typedEffect.icon ? { icon: typedEffect.icon } : {}),
          disabled: Boolean(typedEffect.disabled),
          ...(typedEffect.duration
            ? {
                duration: {
                  type: typedEffect.duration.type ?? 'none',
                  ...(typedEffect.duration.duration !== undefined
                    ? { duration: typedEffect.duration.duration }
                    : {}),
                  ...(typedEffect.duration.remaining !== undefined
                    ? { remaining: typedEffect.duration.remaining }
                    : {}),
                },
              }
            : {}),
        };
      }),
    };

    // Add PF2e-specific data if available
    const actorAny = actor as {
      system?: { actions?: unknown[] };
    };

    // Include actions (PF2e strikes, spells, etc.)
    if (actorAny.system?.actions) {
      characterData.actions = actorAny.system.actions
        .filter(action => action && typeof action === 'object')
        .map(action => {
          const typedAction = action as {
            label?: string;
            name?: string;
            type?: string;
            item?: { id?: string };
            variants?: Array<{ label?: string; traits?: unknown[] }>;
            ready?: boolean;
          };

          return {
            name: typedAction.label ?? typedAction.name,
            type: typedAction.type,
            ...(typedAction.item?.id ? { itemId: typedAction.item.id } : {}),
            ...(typedAction.variants
              ? {
                  variants: typedAction.variants.map(v => ({
                    label: v.label,
                    ...(v.traits ? { traits: v.traits } : {}),
                  })),
                }
              : {}),
            ...(typedAction.ready !== undefined ? { ready: typedAction.ready } : {}),
          };
        });
    }

    // Include item variants and toggles
    const itemVariants: Array<Record<string, unknown>> = [];
    const itemToggles: Array<Record<string, unknown>> = [];

    actorItems.forEach(item => {
      if (!item || typeof item !== 'object') {
        return;
      }
      const itemAny = item as {
        id?: string;
        name?: string;
        system?: {
          rules?: Array<Record<string, unknown>>;
          equipped?: unknown;
        };
      };
      if (!itemAny.id || !itemAny.name) {
        return;
      }

      // Extract rule element variants (e.g., weapon variants, stance toggles)
      if (Array.isArray(itemAny.system?.rules)) {
        itemAny.system.rules.forEach((rule, ruleIndex: number) => {
          const typedRule = rule as {
            key?: string;
            choices?: unknown;
            label?: string;
            prompt?: string;
            selection?: unknown;
            toggleable?: unknown;
            option?: unknown;
            value?: unknown;
          };
          // Variants (ChoiceSet, RollOption with choices)
          if (
            typedRule.key === 'ChoiceSet' ||
            (typedRule.key === 'RollOption' && typedRule.choices)
          ) {
            itemVariants.push({
              itemId: itemAny.id,
              itemName: itemAny.name,
              ruleIndex,
              ruleKey: typedRule.key,
              label: typedRule.label ?? typedRule.prompt,
              ...(typedRule.selection ? { selected: typedRule.selection } : {}),
              ...(typedRule.choices ? { choices: typedRule.choices } : {}),
            });
          }

          // Toggles (RollOption toggleable, ToggleProperty)
          if (
            (typedRule.key === 'RollOption' && typedRule.toggleable) ||
            typedRule.key === 'ToggleProperty'
          ) {
            itemToggles.push({
              itemId: itemAny.id,
              itemName: itemAny.name,
              ruleIndex,
              ruleKey: typedRule.key,
              label: typedRule.label,
              option: typedRule.option,
              ...(typedRule.value !== undefined ? { enabled: typedRule.value } : {}),
              ...(typedRule.toggleable !== undefined ? { toggleable: typedRule.toggleable } : {}),
            });
          }
        });
      }

      // Also check for item-level toggles (e.g., equipped, identified)
      if (itemAny.system?.equipped !== undefined) {
        itemToggles.push({
          itemId: itemAny.id,
          itemName: itemAny.name,
          type: 'equipped',
          enabled: itemAny.system.equipped,
        });
      }
    });

    // Add to character data if any found
    if (itemVariants.length > 0) {
      characterData.itemVariants = itemVariants;
    }
    if (itemToggles.length > 0) {
      characterData.itemToggles = itemToggles;
    }

    // Extract spellcasting data (PF2e and D&D 5e)
    const spellcastingEntries = this.extractSpellcastingData(actor as unknown as Actor);
    if (spellcastingEntries.length > 0) {
      characterData.spellcasting = spellcastingEntries;
    }

    return Promise.resolve(characterData);
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
    this.validateFoundryState();

    const { characterIdentifier, query, type, category, limit = 20 } = params;

    // Find the actor
    const actor = this.findActorByIdentifier(characterIdentifier);
    if (!actor) {
      throw new Error(`Character not found: ${characterIdentifier}`);
    }

    const actorAny = actor as {
      system?: Record<string, unknown>;
      items?: unknown;
      effects?: unknown;
    };
    const systemId = (game as { system?: { id?: string } }).system?.id ?? '';
    const matches: Array<Record<string, unknown>> = [];

    const actorItems = Array.isArray(actor.items)
      ? actor.items
      : actor.items &&
          typeof actor.items === 'object' &&
          Array.isArray((actor.items as { contents?: unknown[] }).contents)
        ? ((actor.items as { contents?: unknown[] }).contents ?? [])
        : [];

    const actorEffects = Array.isArray(actor.effects)
      ? actor.effects
      : actor.effects &&
          typeof actor.effects === 'object' &&
          Array.isArray((actor.effects as { contents?: unknown[] }).contents)
        ? ((actor.effects as { contents?: unknown[] }).contents ?? [])
        : [];

    // Normalize search query
    const searchQuery = query?.toLowerCase().trim();
    const searchType = type?.toLowerCase().trim();
    const searchCategory = category?.toLowerCase().trim();

    // Helper to check if text matches query (safely handles non-strings)
    const matchesQuery = (text: unknown): boolean => {
      if (!searchQuery) return true;
      if (typeof text !== 'string') return false;
      return text.toLowerCase().includes(searchQuery);
    };

    // Helper to check if item matches type filter
    const matchesType = (itemType: string): boolean => {
      if (!searchType) return true;
      return itemType.toLowerCase() === searchType;
    };

    const getPathValue = (source: unknown, path: string[]): unknown => {
      let current: unknown = source;
      for (const key of path) {
        if (!current || typeof current !== 'object') {
          return undefined;
        }
        current = (current as Record<string, unknown>)[key];
      }
      return current;
    };

    const firstDefined = (values: unknown[], fallback: unknown): unknown => {
      for (const value of values) {
        if (value !== undefined && value !== null) {
          return value;
        }
      }
      return fallback;
    };

    const asString = (value: unknown, fallback = ''): string => {
      if (typeof value === 'string') {
        return value;
      }
      if (value === undefined || value === null) {
        return fallback;
      }
      return String(value);
    };

    const asNumber = (value: unknown, fallback = 0): number => {
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
      }
      if (typeof value === 'string') {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
      }
      return fallback;
    };

    const asBoolean = (value: unknown, fallback = false): boolean => {
      if (typeof value === 'boolean') {
        return value;
      }
      return fallback;
    };

    const asStringArray = (value: unknown): string[] => {
      return Array.isArray(value)
        ? value.filter((item): item is string => typeof item === 'string')
        : [];
    };

    // Search items
    for (const item of actorItems) {
      if (!item || typeof item !== 'object') continue;

      const itemAny = item as {
        id?: string;
        name?: string;
        type?: string;
        system?: unknown;
      };
      if (!itemAny.type || !itemAny.name || !itemAny.id) continue;

      const itemSystem = itemAny.system ?? {};

      // Check type filter
      if (!matchesType(itemAny.type)) continue;

      // Check query filter (name or description)
      // Ensure description is a string (could be an object in some systems)
      const descriptionRaw = firstDefined(
        [
          getPathValue(itemSystem, ['description', 'value']),
          getPathValue(itemSystem, ['description']),
        ],
        ''
      );
      const description = asString(descriptionRaw, '');
      if (!matchesQuery(itemAny.name) && !matchesQuery(description)) continue;

      // Build result based on item type
      const result: Record<string, unknown> = {
        id: itemAny.id,
        name: itemAny.name,
        type: itemAny.type,
      };

      // Add description (truncated for token efficiency)
      if (description) {
        // Strip HTML and truncate
        const plainText = description.replace(/<[^>]*>/g, '').trim();
        result.description =
          plainText.length > 300 ? `${plainText.substring(0, 300)}...` : plainText;
      }

      // Spell-specific fields
      if (itemAny.type === 'spell') {
        result.level = asNumber(
          firstDefined(
            [
              getPathValue(itemSystem, ['level', 'value']),
              getPathValue(itemSystem, ['level']),
              getPathValue(itemSystem, ['rank']),
            ],
            0
          ),
          0
        );
        result.prepared = asBoolean(
          firstDefined(
            [
              getPathValue(itemSystem, ['preparation', 'prepared']),
              getPathValue(itemSystem, ['location', 'prepared']),
            ],
            true
          ),
          true
        );
        result.expended = asBoolean(getPathValue(itemSystem, ['location', 'expended']), false);

        // Get targeting info
        if (systemId === 'pf2e') {
          const targeting = this.extractPF2eSpellTargeting(itemSystem);
          if (targeting.range) result.range = targeting.range;
          if (targeting.target) result.target = targeting.target;
          if (targeting.area) result.area = targeting.area;
          result.actionCost = this.formatPF2eActionCost(
            getPathValue(itemSystem, ['time', 'value'])
          );
          result.traits = asStringArray(getPathValue(itemSystem, ['traits', 'value']));
        } else if (systemId === 'dnd5e') {
          const targeting = this.extractDnD5eSpellTargeting(itemSystem);
          if (targeting.range) result.range = targeting.range;
          if (targeting.target) result.target = targeting.target;
          if (targeting.area) result.area = targeting.area;
          result.actionCost = asString(getPathValue(itemSystem, ['activation', 'type']), '');
        } else if (systemId === 'dsa5') {
          const targeting = this.extractDSA5SpellTargeting(itemSystem);
          if (targeting.range) result.range = targeting.range;
          if (targeting.target) result.target = targeting.target;
          if (targeting.area) result.area = targeting.area;
          result.actionCost = asString(getPathValue(itemSystem, ['castingTime', 'value']), '');
        }

        // Category filter for spells
        if (searchCategory) {
          const spellLevel = asNumber(result.level, 0);
          const isPrepared = result.prepared !== false;
          const isCantrip = spellLevel === 0;
          const isFocus =
            asStringArray(getPathValue(itemSystem, ['traits', 'value'])).includes('focus') ||
            asString(getPathValue(itemSystem, ['category', 'value']), '') === 'focus';

          if (searchCategory === 'cantrip' && !isCantrip) continue;
          if (searchCategory === 'prepared' && !isPrepared) continue;
          if (searchCategory === 'focus' && !isFocus) continue;
        }
      }

      // Equipment-specific fields
      if (
        ['weapon', 'armor', 'equipment', 'consumable', 'backpack', 'loot'].includes(itemAny.type)
      ) {
        result.quantity = asNumber(getPathValue(itemSystem, ['quantity']), 1);
        result.equipped = asBoolean(getPathValue(itemSystem, ['equipped']), false);
        const investedValue = firstDefined(
          [
            getPathValue(itemSystem, ['equipped', 'invested']),
            getPathValue(itemSystem, ['invested']),
          ],
          undefined
        );
        if (typeof investedValue === 'boolean') {
          result.invested = investedValue;
        }

        // Category filter for equipment
        if (searchCategory) {
          if (searchCategory === 'equipped' && !result.equipped) continue;
          if (searchCategory === 'invested' && !result.invested) continue;
        }
      }

      // Feat/feature fields
      if (
        ['feat', 'feature', 'class', 'ancestry', 'heritage', 'background'].includes(itemAny.type)
      ) {
        if (systemId === 'pf2e') {
          result.traits = asStringArray(getPathValue(itemSystem, ['traits', 'value']));
          const levelValue = getPathValue(itemSystem, ['level', 'value']);
          if (levelValue !== undefined && levelValue !== null) {
            result.level = asNumber(levelValue, 0);
          }
          result.actionCost = this.formatPF2eActionCost(
            getPathValue(itemSystem, ['actionType', 'value'])
          );
        }
      }

      // Action fields
      if (itemAny.type === 'action') {
        if (systemId === 'pf2e') {
          result.traits = asStringArray(getPathValue(itemSystem, ['traits', 'value']));
          result.actionCost = this.formatPF2eActionCost(
            firstDefined(
              [
                getPathValue(itemSystem, ['actionType', 'value']),
                getPathValue(itemSystem, ['actions', 'value']),
              ],
              undefined
            )
          );
        }
      }

      matches.push(result);

      // Stop if we've reached the limit
      if (matches.length >= limit) break;
    }

    // Also search actions if type filter includes 'action' or is empty
    if (!searchType || searchType === 'action') {
      const actionsFromSystem =
        actorAny.system &&
        typeof actorAny.system === 'object' &&
        Array.isArray((actorAny.system as { actions?: unknown[] }).actions)
          ? ((actorAny.system as { actions?: unknown[] }).actions ?? [])
          : [];
      const actionsFromItems = actorItems.filter(
        i => i && typeof i === 'object' && (i as { type?: unknown }).type === 'action'
      );
      const actions = actionsFromSystem.length > 0 ? actionsFromSystem : actionsFromItems;
      for (const action of actions) {
        if (matches.length >= limit) break;

        if (!action || typeof action !== 'object') continue;
        const actionAny = action as {
          id?: string;
          slug?: string;
          name?: string;
          label?: string;
          type?: string;
          actionType?: string;
          traits?: string[];
          actionCost?: { value?: string };
          actions?: string;
        };

        const actionName = actionAny.name ?? actionAny.label ?? '';
        if (!matchesQuery(actionName)) continue;

        const result: Record<string, unknown> = {
          id: actionAny.id ?? actionAny.slug ?? actionName,
          name: actionName,
          type: 'action',
          actionType: actionAny.type ?? actionAny.actionType ?? 'action',
        };

        if (systemId === 'pf2e') {
          result.traits = actionAny.traits ?? [];
          result.actionCost = this.formatPF2eActionCost(
            actionAny.actionCost?.value ?? actionAny.actions
          );
        }

        matches.push(result);
      }
    }

    // Search effects if type filter includes 'effect' or is empty
    if (!searchType || searchType === 'effect') {
      for (const effect of actorEffects) {
        if (matches.length >= limit) break;

        if (!effect || typeof effect !== 'object') continue;

        const effectAny = effect as {
          id?: string;
          name?: string;
          label?: string;
          description?: string;
        };
        if (!matchesQuery(effectAny.name ?? effectAny.label)) continue;

        matches.push({
          id: effectAny.id,
          name: effectAny.name ?? effectAny.label,
          type: 'effect',
          description: effectAny.description ?? undefined,
        });
      }
    }

    this.auditLog(
      'searchCharacterItems',
      {
        characterId: actor.id,
        query,
        type,
        category,
        matchCount: matches.length,
      },
      'success'
    );

    const result: {
      characterId: string;
      characterName: string;
      query?: string;
      type?: string;
      category?: string;
      matches: Array<Record<string, unknown>>;
      totalMatches: number;
    } = {
      characterId: actor.id ?? '',
      characterName: actor.name ?? '',
      matches,
      totalMatches: matches.length,
    };

    if (query) result.query = query;
    if (type) result.type = type;
    if (category) result.category = category;

    return Promise.resolve(result);
  }

  /**
   * Extract spellcasting data from an actor (supports PF2e and D&D 5e)
   */
  /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return */
  private extractSpellcastingData(actor: Actor): SpellcastingEntry[] {
    const entries: SpellcastingEntry[] = [];
    const actorAny = actor as any;
    const systemId = (game.system as any).id;

    // Get all spell items from the actor
    const spellItems = actor.items.filter(item => item.type === 'spell');

    if (systemId === 'pf2e') {
      // PF2e: Extract from spellcastingEntries
      const spellcastingEntries =
        actorAny.spellcasting?.contents ||
        actorAny.items?.filter((i: any) => i.type === 'spellcastingEntry') ||
        [];

      for (const entry of spellcastingEntries) {
        const entryData = entry.system || entry;
        const entrySpells: SpellInfo[] = [];

        // Get spells associated with this entry
        // In PF2e, spells have a location property pointing to their spellcasting entry
        const entryId = entry.id;
        const associatedSpells = spellItems.filter((spell: any) => {
          const spellSystem = spell.system;
          return spellSystem?.location?.value === entryId || spellSystem?.location === entryId;
        });

        for (const spell of associatedSpells) {
          const spellSystem = spell.system as any;
          const targeting = this.extractPF2eSpellTargeting(spellSystem);
          entrySpells.push({
            id: spell.id || '',
            name: spell.name || '',
            level: spellSystem?.level?.value ?? spellSystem?.level ?? spellSystem?.rank ?? 0,
            prepared: spellSystem?.location?.prepared ?? true,
            expended: spellSystem?.location?.expended ?? false,
            traits: spellSystem?.traits?.value || [],
            actionCost: this.formatPF2eActionCost(spellSystem?.time?.value),
            range: targeting.range,
            target: targeting.target,
            area: targeting.area,
          });
        }

        // Also check for spells in the entry's spell collection
        if (entry.spells) {
          for (const [levelKey, levelData] of Object.entries(entry.spells as Record<string, any>)) {
            const spellsAtLevel = levelData?.value || levelData || [];
            if (Array.isArray(spellsAtLevel)) {
              for (const spellRef of spellsAtLevel) {
                // Skip if we already have this spell
                if (entrySpells.some(s => s.id === spellRef.id)) continue;

                const spellItem = actor.items.get(spellRef.id || spellRef);
                if (spellItem) {
                  const spellSystem = spellItem.system as any;
                  const targeting = this.extractPF2eSpellTargeting(spellSystem);
                  entrySpells.push({
                    id: spellItem.id || '',
                    name: spellItem.name || '',
                    level:
                      parseInt(levelKey.replace('spell', '')) || spellSystem?.level?.value || 0,
                    prepared: spellRef.prepared ?? true,
                    expended: spellRef.expended ?? false,
                    traits: spellSystem?.traits?.value || [],
                    actionCost: this.formatPF2eActionCost(spellSystem?.time?.value),
                    range: targeting.range,
                    target: targeting.target,
                    area: targeting.area,
                  });
                }
              }
            }
          }
        }

        entries.push({
          id: entry.id || '',
          name: entry.name || 'Spellcasting',
          tradition: entryData?.tradition?.value || entryData?.tradition || undefined,
          type: entryData?.prepared?.value || entryData?.prepared || 'prepared',
          ability: entryData?.ability?.value || entryData?.ability || undefined,
          dc: entryData?.spelldc?.dc || entryData?.dc?.value || undefined,
          attack: entryData?.spelldc?.value || entryData?.attack?.value || undefined,
          slots: this.extractPF2eSpellSlots(entryData),
          spells: entrySpells.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name)),
        });
      }

      // Also capture focus spells and innate spells that might not be in entries
      const focusSpells = spellItems.filter((spell: any) => {
        const spellSystem = spell.system;
        return (
          spellSystem?.traits?.value?.includes('focus') || spellSystem?.category?.value === 'focus'
        );
      });

      if (focusSpells.length > 0 && !entries.some(e => e.type === 'focus')) {
        entries.push({
          id: 'focus-spells',
          name: 'Focus Spells',
          type: 'focus',
          spells: focusSpells.map((spell: any) => {
            const spellSystem = spell.system;
            const targeting = this.extractPF2eSpellTargeting(spellSystem);
            return {
              id: spell.id || '',
              name: spell.name || '',
              level: spellSystem?.level?.value || 0,
              traits: spellSystem?.traits?.value || [],
              actionCost: this.formatPF2eActionCost(spellSystem?.time?.value),
              range: targeting.range,
              target: targeting.target,
              area: targeting.area,
            };
          }),
        });
      }
    } else if (systemId === 'dnd5e') {
      // D&D 5e: Extract from classes with spellcasting
      const classes = actor.items.filter(item => item.type === 'class');
      const spellSlots = actorAny.system?.spells || {};

      // Group spells by their source class or create a general entry
      const spellsByClass: Record<string, SpellInfo[]> = {};

      for (const spell of spellItems) {
        const spellSystem = spell.system as any;
        const sourceClass = spellSystem?.sourceClass || 'general';

        if (!spellsByClass[sourceClass]) {
          spellsByClass[sourceClass] = [];
        }

        const targeting = this.extractDnD5eSpellTargeting(spellSystem);
        spellsByClass[sourceClass].push({
          id: spell.id || '',
          name: spell.name || '',
          level: spellSystem?.level || 0,
          prepared: spellSystem?.preparation?.prepared ?? true,
          traits: [], // D&D 5e doesn't use traits the same way
          actionCost: spellSystem?.activation?.type || undefined,
          range: targeting.range,
          target: targeting.target,
          area: targeting.area,
        });
      }

      // Create entries for each spellcasting class
      for (const classItem of classes) {
        const classSystem = classItem.system as any;
        if (
          classSystem?.spellcasting?.progression &&
          classSystem.spellcasting.progression !== 'none'
        ) {
          const className = classItem.name || 'Unknown';
          const classSpells =
            spellsByClass[classItem.id || ''] || spellsByClass[className.toLowerCase()] || [];

          entries.push({
            id: classItem.id || '',
            name: `${className} Spellcasting`,
            type: classSystem?.spellcasting?.type || 'prepared',
            ability: classSystem?.spellcasting?.ability || undefined,
            slots: this.extractDnD5eSpellSlots(spellSlots),
            spells: classSpells.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name)),
          });
        }
      }

      // If no class-based entries found but we have spells, create a general entry
      if (entries.length === 0 && spellItems.length > 0) {
        const allSpells: SpellInfo[] = [];
        for (const spell of spellItems) {
          const spellSystem = spell.system as any;
          const targeting = this.extractDnD5eSpellTargeting(spellSystem);
          allSpells.push({
            id: spell.id || '',
            name: spell.name || '',
            level: spellSystem?.level || 0,
            prepared: spellSystem?.preparation?.prepared ?? true,
            actionCost: spellSystem?.activation?.type || undefined,
            range: targeting.range,
            target: targeting.target,
            area: targeting.area,
          });
        }

        entries.push({
          id: 'spellcasting',
          name: 'Spellcasting',
          type: 'prepared',
          slots: this.extractDnD5eSpellSlots(spellSlots),
          spells: allSpells.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name)),
        });
      }
    } else if (systemId === 'dsa5') {
      // DSA5: Extract Zauber (spells), Liturgien (liturgies), Zeremonien (ceremonies), Rituale (rituals)
      const astralSpells = actor.items.filter(item => item.type === 'spell');
      const karmaSpells = actor.items.filter(item => ['liturgy', 'ceremony'].includes(item.type));
      const rituals = actor.items.filter(item => item.type === 'ritual');

      // Get AsP and KaP from actor
      const asp = actorAny.system?.status?.astralenergy || actorAny.system?.astralenergy;
      const kap = actorAny.system?.status?.karmaenergy || actorAny.system?.karmaenergy;

      // Zauber (Arcane spells using AsP)
      if (astralSpells.length > 0) {
        entries.push({
          id: 'zauber',
          name: 'Zauber (Spells)',
          type: 'arcane',
          slots: asp
            ? {
                asp: { value: asp.value ?? 0, max: asp.max ?? 0 },
              }
            : undefined,
          spells: astralSpells
            .map((spell: any) => {
              const spellSystem = spell.system;
              const targeting = this.extractDSA5SpellTargeting(spellSystem);
              return {
                id: spell.id || '',
                name: spell.name || '',
                level: spellSystem?.level?.value ?? spellSystem?.level ?? 0,
                traits: spellSystem?.effect?.attributes || [],
                actionCost: spellSystem?.castingTime?.value || undefined,
                range: targeting.range,
                target: targeting.target,
                area: targeting.area,
              };
            })
            .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name)),
        });
      }

      // Liturgien & Zeremonien (Divine spells using KaP)
      if (karmaSpells.length > 0) {
        entries.push({
          id: 'liturgien',
          name: 'Liturgien & Zeremonien (Liturgies)',
          type: 'divine',
          slots: kap
            ? {
                kap: { value: kap.value ?? 0, max: kap.max ?? 0 },
              }
            : undefined,
          spells: karmaSpells
            .map((spell: any) => {
              const spellSystem = spell.system;
              const targeting = this.extractDSA5SpellTargeting(spellSystem);
              return {
                id: spell.id || '',
                name: spell.name || '',
                level: spellSystem?.level?.value ?? spellSystem?.level ?? 0,
                traits: spellSystem?.effect?.attributes || [],
                actionCost: spellSystem?.castingTime?.value || undefined,
                range: targeting.range,
                target: targeting.target,
                area: targeting.area,
              };
            })
            .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name)),
        });
      }

      // Rituale (Rituals - can use either AsP or KaP depending on tradition)
      if (rituals.length > 0) {
        entries.push({
          id: 'rituale',
          name: 'Rituale (Rituals)',
          type: 'ritual',
          spells: rituals
            .map((spell: any) => {
              const spellSystem = spell.system;
              const targeting = this.extractDSA5SpellTargeting(spellSystem);
              return {
                id: spell.id || '',
                name: spell.name || '',
                level: spellSystem?.level?.value ?? spellSystem?.level ?? 0,
                traits: spellSystem?.effect?.attributes || [],
                actionCost: spellSystem?.castingTime?.value || undefined,
                range: targeting.range,
                target: targeting.target,
                area: targeting.area,
              };
            })
            .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name)),
        });
      }
    }

    return entries;
  }
  /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return */

  /**
   * Format PF2e action cost to human-readable string
   */
  /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/prefer-nullish-coalescing */
  private formatPF2eActionCost(actionValue: any): string | undefined {
    if (!actionValue) return undefined;
    if (typeof actionValue === 'number') {
      return actionValue === 1 ? '1 action' : `${actionValue} actions`;
    }
    if (actionValue === 'reaction') return 'reaction';
    if (actionValue === 'free') return 'free action';
    return String(actionValue);
  }

  /**
   * Extract PF2e spell slots from spellcasting entry data
   */
  private extractPF2eSpellSlots(
    entryData: any
  ): Record<string, { value: number; max: number }> | undefined {
    const slots: Record<string, { value: number; max: number }> = {};

    // PF2e stores slots per rank
    for (let rank = 1; rank <= 10; rank++) {
      const slotKey = `slot${rank}`;
      const slotData = entryData?.slots?.[slotKey] || entryData?.[slotKey];
      if (slotData && (slotData.max > 0 || slotData.value > 0)) {
        slots[`rank${rank}`] = {
          value: slotData.value ?? 0,
          max: slotData.max ?? 0,
        };
      }
    }

    return Object.keys(slots).length > 0 ? slots : undefined;
  }

  /**
   * Extract D&D 5e spell slots from actor system data
   */
  private extractDnD5eSpellSlots(
    spellsData: any
  ): Record<string, { value: number; max: number }> | undefined {
    const slots: Record<string, { value: number; max: number }> = {};

    // D&D 5e stores slots as spell1, spell2, etc.
    for (let level = 1; level <= 9; level++) {
      const slotKey = `spell${level}`;
      const slotData = spellsData?.[slotKey];
      if (slotData && (slotData.max > 0 || slotData.value > 0)) {
        slots[`level${level}`] = {
          value: slotData.value ?? 0,
          max: slotData.max ?? 0,
        };
      }
    }

    // Also check for pact slots (warlock)
    const pactSlot = spellsData?.pact;
    if (pactSlot && (pactSlot.max > 0 || pactSlot.value > 0)) {
      slots['pact'] = {
        value: pactSlot.value ?? 0,
        max: pactSlot.max ?? 0,
      };
    }

    return Object.keys(slots).length > 0 ? slots : undefined;
  }

  /**
   * Extract spell targeting info for D&D 5e
   * D&D 5e spells have: target.type ("self", "creature", "point", etc.), range.value, range.units
   */
  private extractDnD5eSpellTargeting(spellSystem: any): {
    range?: string;
    target?: string;
    area?: string;
  } {
    const result: { range?: string; target?: string; area?: string } = {};

    // Range (e.g., "60 feet", "Self", "Touch")
    const rangeValue = spellSystem?.range?.value;
    const rangeUnits = spellSystem?.range?.units;
    if (rangeUnits === 'self') {
      result.range = 'Self';
    } else if (rangeUnits === 'touch') {
      result.range = 'Touch';
    } else if (rangeUnits === 'spec') {
      result.range = spellSystem?.range?.special || 'Special';
    } else if (rangeValue && rangeUnits) {
      result.range = `${rangeValue} ${rangeUnits}`;
    }

    // Target type (e.g., "1 creature", "self", "area")
    const targetType = spellSystem?.target?.type;
    const targetValue = spellSystem?.target?.value;
    if (targetType === 'self') {
      result.target = 'self';
    } else if (targetType === 'creature' || targetType === 'ally' || targetType === 'enemy') {
      result.target = targetValue
        ? `${targetValue} ${targetType}${targetValue > 1 ? 's' : ''}`
        : targetType;
    } else if (targetType === 'object') {
      result.target = targetValue ? `${targetValue} object${targetValue > 1 ? 's' : ''}` : 'object';
    } else if (targetType === 'space' || targetType === 'point') {
      result.target = 'point';
    } else if (targetType) {
      result.target = targetType;
    }

    // Area (for AoE spells - e.g., "20-foot radius", "30-foot cone")
    const areaType = spellSystem?.target?.template?.type;
    const areaSize = spellSystem?.target?.template?.size;
    const areaUnits = spellSystem?.target?.template?.units || 'ft';
    if (areaType && areaSize) {
      result.area = `${areaSize}-${areaUnits} ${areaType}`;
      // If spell has area, target is usually "area"
      if (!result.target || result.target === 'point') {
        result.target = 'area';
      }
    }

    return result;
  }

  /**
   * Extract spell targeting info for PF2e
   * PF2e spells have: target (string), range.value, area.type, area.value
   */
  private extractPF2eSpellTargeting(spellSystem: any): {
    range?: string;
    target?: string;
    area?: string;
  } {
    const result: { range?: string; target?: string; area?: string } = {};

    // Range (e.g., "30 feet", "touch")
    const rangeValue = spellSystem?.range?.value;
    if (rangeValue) {
      result.range = String(rangeValue);
    }

    // Target (PF2e has a descriptive target string)
    const targetValue = spellSystem?.target?.value;
    if (targetValue) {
      result.target = String(targetValue);
    }

    // Area (e.g., "15-foot emanation", "30-foot cone")
    const areaType = spellSystem?.area?.type;
    const areaValue = spellSystem?.area?.value;
    if (areaType) {
      if (areaValue) {
        result.area = `${areaValue}-foot ${areaType}`;
      } else {
        result.area = areaType;
      }
      // If has area but no explicit target, it's an area spell
      if (!result.target) {
        result.target = 'area';
      }
    }

    return result;
  }

  /**
   * Extract spell targeting info for DSA5
   * DSA5 spells have: targetCategory, range, etc.
   */
  private extractDSA5SpellTargeting(spellSystem: any): {
    range?: string;
    target?: string;
    area?: string;
  } {
    const result: { range?: string; target?: string; area?: string } = {};

    // Range
    const rangeValue = spellSystem?.range?.value || spellSystem?.Reichweite;
    if (rangeValue) {
      result.range = String(rangeValue);
    }

    // Target category
    const targetCategory = spellSystem?.targetCategory?.value || spellSystem?.Zielkategorie;
    if (targetCategory) {
      result.target = String(targetCategory);
    }

    // Area (Wirkungsbereich)
    const areaValue = spellSystem?.effectRadius?.value || spellSystem?.Wirkungsbereich;
    if (areaValue) {
      result.area = String(areaValue);
    }

    return result;
  }
  /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/prefer-nullish-coalescing */

  /**
   * Search compendium packs for items matching query with optional filters
   */
  /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/prefer-nullish-coalescing */
  async searchCompendium(
    query: string,
    packType?: string,
    filters?: {
      challengeRating?: number | { min?: number; max?: number };
      creatureType?: string;
      size?: string;
      alignment?: string;
      hasLegendaryActions?: boolean;
      spellcaster?: boolean;
    }
  ): Promise<CompendiumSearchResult[]> {
    // Add defensive checks for query parameter
    if (!query || typeof query !== 'string' || query.trim().length < 2) {
      throw new Error('Search query must be a string with at least 2 characters');
    }

    // ENHANCED SEARCH: If we have creature-specific filters and Actor packType, use enhanced index
    if (
      filters &&
      packType === 'Actor' &&
      (filters.challengeRating || filters.creatureType || filters.hasLegendaryActions)
    ) {
      // Check if enhanced creature index is enabled
      const enhancedIndexEnabled = game.settings.get(this.moduleId, 'enableEnhancedCreatureIndex');

      if (enhancedIndexEnabled) {
        try {
          // Convert search criteria and use enhanced search
          const criteria: any = { limit: 100 }; // Default limit for search

          if (filters.challengeRating) criteria.challengeRating = filters.challengeRating;
          if (filters.creatureType) criteria.creatureType = filters.creatureType;
          if (filters.size) criteria.size = filters.size;
          if (filters.hasLegendaryActions)
            criteria.hasLegendaryActions = filters.hasLegendaryActions;

          const enhancedResult = await this.listCreaturesByCriteria(criteria);

          // No name filtering needed - trust the enhanced creature index!
          const filteredResults = enhancedResult.creatures;

          // Convert to CompendiumSearchResult format
          return filteredResults.map(
            creature =>
              ({
                id: creature.id || creature.name,
                name: creature.name,
                type: creature.type || 'npc',
                pack: creature.pack,
                packLabel: creature.packLabel || creature.pack,
                description: creature.description || '',
                hasImage: creature.hasImage || !!creature.img,
                summary: `CR ${creature.challengeRating} ${creature.creatureType} from ${creature.packLabel}`,
                // Enhanced data (not part of interface but will be included)
                challengeRating: creature.challengeRating,
                creatureType: creature.creatureType,
                size: creature.size,
                hasLegendaryActions: creature.hasLegendaryActions,
              }) as CompendiumSearchResult & {
                challengeRating: number;
                creatureType: string;
                size: string;
                hasLegendaryActions: boolean;
              }
          );
        } catch (error) {
          console.warn(
            `[${this.moduleId}] Enhanced search failed, falling back to basic search:`,
            error
          );
          // Continue to basic search below
        }
      }
    }

    const results: CompendiumSearchResult[] = [];
    const cleanQuery = query.toLowerCase().trim();
    const searchTerms = cleanQuery
      .split(' ')
      .filter(term => term && typeof term === 'string' && term.length > 0);

    if (searchTerms.length === 0) {
      throw new Error('Search query must contain valid search terms');
    }

    // Filter packs by type if specified
    const packs = Array.from(game.packs.values()).filter(pack => {
      if (packType && pack.metadata.type !== packType) {
        return false;
      }
      return pack.metadata.type !== 'Scene'; // Exclude scene packs for safety
    });

    for (const pack of packs) {
      try {
        // Ensure pack index is loaded
        if (!pack.indexed) {
          await pack.getIndex({});
        }

        // Use basic compendium index for all searches
        const entriesToSearch = Array.from(pack.index.values());

        for (const entry of entriesToSearch) {
          try {
            // Type assertion and comprehensive safety checks for entry properties
            const typedEntry = entry as any;
            if (
              !typedEntry?.name ||
              typeof typedEntry.name !== 'string' ||
              typedEntry.name.trim().length === 0
            ) {
              continue;
            }

            // Ensure searchTerms are valid before using them
            if (!searchTerms || !Array.isArray(searchTerms) || searchTerms.length === 0) {
              continue;
            }

            // Use already created typedEntry

            const entryNameLower = typedEntry.name.toLowerCase();
            const nameMatch = searchTerms.every(term => {
              if (!term || typeof term !== 'string') {
                return false;
              }
              return entryNameLower.includes(term);
            });

            if (nameMatch) {
              // For Actor packs with filters, use simple name/description matching
              if (
                filters &&
                this.shouldApplyFilters(entry, filters) &&
                pack.metadata.type === 'Actor'
              ) {
                // Convert filters to search criteria for compatibility
                const searchCriteria: any = {};

                if (filters.challengeRating) {
                  const searchTerms = [];
                  if (typeof filters.challengeRating === 'number') {
                    if (filters.challengeRating >= 15) {
                      searchTerms.push('ancient', 'legendary', 'elder', 'greater');
                    } else if (filters.challengeRating >= 10) {
                      searchTerms.push('adult', 'warlord', 'champion', 'master');
                    } else if (filters.challengeRating >= 5) {
                      searchTerms.push('captain', 'knight', 'priest', 'mage');
                    } else {
                      searchTerms.push('guard', 'soldier', 'warrior', 'scout');
                    }
                  }
                  searchCriteria.searchTerms = searchTerms;
                }

                if (filters.creatureType) {
                  const typeTerms = [filters.creatureType];
                  if (filters.creatureType.toLowerCase() === 'humanoid') {
                    typeTerms.push('human', 'elf', 'dwarf', 'orc', 'goblin');
                  }
                  searchCriteria.searchTerms = [
                    ...(searchCriteria.searchTerms || []),
                    ...typeTerms,
                  ];
                }

                if (!this.matchesSearchCriteria(typedEntry, searchCriteria)) {
                  continue;
                }
              }

              // Standard index entry result
              results.push({
                id: typedEntry._id || '',
                name: typedEntry.name,
                type: typedEntry.type || 'unknown',
                img: typedEntry.img || undefined,
                pack: pack.metadata.id,
                packLabel: pack.metadata.label,
                description: typedEntry.description || '',
                hasImage: !!typedEntry.img,
                summary: `${typedEntry.type} from ${pack.metadata.label}`,
              });
            }
          } catch (entryError) {
            // Log individual entry errors but continue processing
            console.warn(
              `[${this.moduleId}] Error processing entry in pack ${pack.metadata.id}:`,
              entryError
            );
            continue;
          }

          // Limit results per pack to prevent overwhelming responses
          if (results.length >= 100) break;
        }
      } catch (error) {
        console.warn(`[${this.moduleId}] Failed to search pack ${pack.metadata.id}:`, error);
      }

      // Global limit to prevent memory issues
      if (results.length >= 100) break;
    }

    // Sort results by relevance with enhanced ranking for filtered searches
    results.sort((a, b) => {
      // Exact name matches first
      const aExact = a.name.toLowerCase() === query.toLowerCase();
      const bExact = b.name.toLowerCase() === query.toLowerCase();
      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;

      // If filters are used, prioritize by filter match quality
      if (filters) {
        const aScore = this.calculateRelevanceScore(a, filters, query);
        const bScore = this.calculateRelevanceScore(b, filters, query);
        if (aScore !== bScore) return bScore - aScore; // Higher score first
      }

      // Fallback to alphabetical
      return a.name.localeCompare(b.name);
    });

    return results.slice(0, 50); // Final limit
  }

  /**
   * Check if filters should be applied to this entry
   */
  private shouldApplyFilters(entry: any, filters: any): boolean {
    // Only apply filters to Actor entries (which includes NPCs/monsters/creatures)
    if (entry.type !== 'npc' && entry.type !== 'character' && entry.type !== 'creature') {
      return false;
    }

    // Check if any filters are actually specified
    return Object.keys(filters).some(key => filters[key] !== undefined);
  }

  /**
   * Check if entry passes all specified filters
   * @unused - Replaced with simple index-only approach
   */
  // @ts-expect-error - Unused method kept for compatibility
  private passesFilters(
    entry: any,
    filters: {
      challengeRating?: number | { min?: number; max?: number };
      creatureType?: string;
      size?: string;
      alignment?: string;
      hasLegendaryActions?: boolean;
      spellcaster?: boolean;
    }
  ): boolean {
    const system = entry.system || {};

    // Challenge Rating filter
    if (filters.challengeRating !== undefined) {
      // Try multiple possible CR locations in D&D 5e data structure
      let entryCR =
        system.details?.cr?.value || system.details?.cr || system.cr?.value || system.cr || 0;

      // Handle fractional CRs (common in D&D 5e)
      if (typeof entryCR === 'string') {
        if (entryCR === '1/8') entryCR = 0.125;
        else if (entryCR === '1/4') entryCR = 0.25;
        else if (entryCR === '1/2') entryCR = 0.5;
        else entryCR = parseFloat(entryCR) || 0;
      }

      if (typeof filters.challengeRating === 'number') {
        // Exact CR match
        if (entryCR !== filters.challengeRating) {
          return false;
        }
      } else if (typeof filters.challengeRating === 'object') {
        // CR range
        const { min, max } = filters.challengeRating;
        if (min !== undefined && entryCR < min) {
          return false;
        }
        if (max !== undefined && entryCR > max) {
          return false;
        }
      }
    }

    // Creature Type filter
    if (filters.creatureType) {
      const entryType = system.details?.type?.value || system.type?.value || '';
      if (entryType.toLowerCase() !== filters.creatureType.toLowerCase()) {
        return false;
      }
    }

    // Size filter
    if (filters.size) {
      const entrySize = system.traits?.size || system.size || '';
      if (entrySize.toLowerCase() !== filters.size.toLowerCase()) {
        return false;
      }
    }

    // Alignment filter
    if (filters.alignment) {
      const entryAlignment = system.details?.alignment || system.alignment || '';
      if (!entryAlignment.toLowerCase().includes(filters.alignment.toLowerCase())) {
        return false;
      }
    }

    // Legendary Actions filter
    if (filters.hasLegendaryActions !== undefined) {
      const hasLegendary = !!(
        system.resources?.legact ||
        system.legendary ||
        (system.resources?.legres && system.resources.legres.value > 0)
      );
      if (hasLegendary !== filters.hasLegendaryActions) {
        return false;
      }
    }

    // Spellcaster filter
    if (filters.spellcaster !== undefined) {
      const isSpellcaster = !!(
        system.spells ||
        system.attributes?.spellcasting ||
        (system.details?.spellLevel && system.details.spellLevel > 0)
      );
      if (isSpellcaster !== filters.spellcaster) {
        return false;
      }
    }

    return true;
  }

  /**
   * Calculate relevance score for search result ranking
   */
  private calculateRelevanceScore(entry: any, filters: any, query: string): number {
    let score = 0;
    const system = entry.system || {};

    // Bonus for creature type match (high importance for encounter building)
    if (filters.creatureType) {
      const entryType = system.details?.type?.value || system.type?.value || '';
      if (entryType.toLowerCase() === filters.creatureType.toLowerCase()) {
        score += 20;
      }
    }

    // Bonus for CR match (exact match gets higher score than range)
    if (filters.challengeRating !== undefined) {
      const entryCR = system.details?.cr || system.cr || 0;
      if (typeof filters.challengeRating === 'number') {
        if (entryCR === filters.challengeRating) score += 15;
      } else if (typeof filters.challengeRating === 'object') {
        const { min, max } = filters.challengeRating;
        if (min !== undefined && max !== undefined) {
          // Bonus for being in range, extra for being in middle of range
          if (entryCR >= min && entryCR <= max) {
            score += 10;
            const rangeMid = (min + max) / 2;
            const distFromMid = Math.abs(entryCR - rangeMid);
            score += Math.max(0, 5 - distFromMid); // Up to 5 bonus for being near middle
          }
        }
      }
    }

    // Bonus for common creature names (better for encounters)
    const commonNames = [
      'knight',
      'warrior',
      'guard',
      'soldier',
      'mage',
      'priest',
      'bandit',
      'orc',
      'goblin',
      'dragon',
    ];
    const lowerName = entry.name.toLowerCase();
    if (commonNames.some(name => lowerName.includes(name))) {
      score += 5;
    }

    // Bonus for query term matches in name
    const queryTerms = query.toLowerCase().split(' ');
    for (const term of queryTerms) {
      if (term.length > 2 && lowerName.includes(term)) {
        score += 3;
      }
    }

    return score;
  }

  /**
   * List creatures by criteria using enhanced persistent index - optimized for instant filtering
   */
  async listCreaturesByCriteria(criteria: {
    challengeRating?: number | { min?: number; max?: number };
    creatureType?: string;
    size?: string;
    hasSpells?: boolean;
    hasLegendaryActions?: boolean;
    limit?: number;
  }): Promise<{ creatures: any[]; searchSummary: any }> {
    const limit = criteria.limit || 500;

    // Check if enhanced creature index is enabled
    const enhancedIndexEnabled = game.settings.get(this.moduleId, 'enableEnhancedCreatureIndex');

    if (!enhancedIndexEnabled) {
      return this.fallbackBasicCreatureSearch(criteria, limit);
    }

    try {
      // Get enhanced creature index (builds if needed)
      const enhancedCreatures = await this.persistentIndex.getEnhancedIndex();

      // Apply filters to enhanced data
      let filteredCreatures = enhancedCreatures.filter(creature =>
        this.passesEnhancedCriteria(creature, criteria)
      );

      // Sort by Level/CR then name for consistent ordering (system-aware)
      filteredCreatures.sort((a, b) => {
        // Get power level (CR for D&D 5e, Level for PF2e)
        const powerA = 'level' in a ? a.level : a.challengeRating;
        const powerB = 'level' in b ? b.level : b.challengeRating;

        if (powerA !== powerB) {
          return powerA - powerB; // Lower power first
        }
        return a.name.localeCompare(b.name);
      });

      // Apply limit
      if (filteredCreatures.length > limit) {
        filteredCreatures = filteredCreatures.slice(0, limit);
      }

      // Convert enhanced creatures to result format (system-aware)
      const results = filteredCreatures.map(creature => {
        // Type guard for result formatting
        const isPF2e = 'level' in creature;

        return {
          id: creature.id,
          name: creature.name,
          type: creature.type,
          pack: creature.pack,
          packLabel: creature.packLabel,
          description: creature.description || '',
          hasImage: !!creature.img,

          // System-aware summary
          summary: isPF2e
            ? `Level ${creature.level} ${creature.creatureType} (${creature.rarity}) from ${creature.packLabel}`
            : `CR ${creature.challengeRating} ${creature.creatureType} from ${creature.packLabel}`,

          // Include all creature data (conditional based on system)
          ...(isPF2e
            ? {
                level: creature.level,
                traits: creature.traits,
                rarity: creature.rarity,
              }
            : {
                challengeRating: creature.challengeRating,
                hasLegendaryActions: creature.hasLegendaryActions,
              }),

          creatureType: creature.creatureType,
          size: creature.size,
          hitPoints: creature.hitPoints,
          armorClass: creature.armorClass,
          hasSpells: creature.hasSpells,
          alignment: creature.alignment,
        };
      });

      // Calculate pack distribution for summary
      const packResults = new Map();
      results.forEach(creature => {
        const count = packResults.get(creature.packLabel) || 0;
        packResults.set(creature.packLabel, count + 1);
      });

      // Get unique pack information
      const uniquePacks = Array.from(new Set(enhancedCreatures.map(c => c.pack)));
      const topPacks = uniquePacks.slice(0, 5).map(packId => {
        const sampleCreature = enhancedCreatures.find(c => c.pack === packId);
        return {
          id: packId,
          label: sampleCreature?.packLabel || 'Unknown Pack',
          priority: 100, // All packs are prioritized equally in enhanced index
        };
      });

      return {
        creatures: results,
        searchSummary: {
          packsSearched: uniquePacks.length,
          topPacks,
          totalCreaturesFound: results.length,
          resultsByPack: Object.fromEntries(packResults),
          criteria,
          indexMetadata: {
            totalIndexedCreatures: enhancedCreatures.length,
            searchMethod: 'enhanced_persistent_index',
          },
        },
      };
    } catch (error) {
      console.error(`[${this.moduleId}] Enhanced creature search failed:`, error);
      // Fallback to basic search if enhanced index fails
      return this.fallbackBasicCreatureSearch(criteria, limit);
    }
  }

  /**
   * Check if enhanced creature passes all specified criteria (system-aware routing)
   */
  private passesEnhancedCriteria(creature: EnhancedCreatureIndex, criteria: any): boolean {
    // Type guard for PF2e creatures - check for level property
    if ('level' in creature) {
      return this.passesPF2eCriteria(creature, criteria);
    } else {
      return this.passesDnD5eCriteria(creature, criteria);
    }
  }

  /**
   * Check if D&D 5e creature passes all specified criteria
   */
  private passesDnD5eCriteria(
    creature: DnD5eCreatureIndex,
    criteria: {
      challengeRating?: number | { min?: number; max?: number };
      creatureType?: string;
      size?: string;
      hasSpells?: boolean;
      hasLegendaryActions?: boolean;
    }
  ): boolean {
    // Challenge Rating filter
    if (criteria.challengeRating !== undefined) {
      if (typeof criteria.challengeRating === 'number') {
        if (creature.challengeRating !== criteria.challengeRating) {
          return false;
        }
      } else if (typeof criteria.challengeRating === 'object') {
        const { min, max } = criteria.challengeRating;
        if (min !== undefined && creature.challengeRating < min) {
          return false;
        }
        if (max !== undefined && creature.challengeRating > max) {
          return false;
        }
      }
    }

    // Creature Type filter
    if (criteria.creatureType) {
      if (creature.creatureType.toLowerCase() !== criteria.creatureType.toLowerCase()) {
        return false;
      }
    }

    // Size filter
    if (criteria.size) {
      if (creature.size.toLowerCase() !== criteria.size.toLowerCase()) {
        return false;
      }
    }

    // Spellcaster filter
    if (criteria.hasSpells !== undefined) {
      if (creature.hasSpells !== criteria.hasSpells) {
        return false;
      }
    }

    // Legendary Actions filter
    if (criteria.hasLegendaryActions !== undefined) {
      if (creature.hasLegendaryActions !== criteria.hasLegendaryActions) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check if PF2e creature passes all specified criteria
   */
  private passesPF2eCriteria(
    creature: PF2eCreatureIndex,
    criteria: {
      level?: number | { min?: number; max?: number };
      traits?: string[];
      rarity?: string;
      creatureType?: string;
      size?: string;
      hasSpells?: boolean;
    }
  ): boolean {
    // Level filter
    if (criteria.level !== undefined) {
      if (typeof criteria.level === 'number') {
        if (creature.level !== criteria.level) {
          return false;
        }
      } else if (typeof criteria.level === 'object') {
        const { min = -1, max = 25 } = criteria.level;
        if (creature.level < min || creature.level > max) {
          return false;
        }
      }
    }

    // Traits filter (creature must have ALL specified traits)
    if (criteria.traits && criteria.traits.length > 0) {
      const hasAllTraits = criteria.traits.every(requiredTrait =>
        creature.traits.some(t => t.toLowerCase() === requiredTrait.toLowerCase())
      );
      if (!hasAllTraits) {
        return false;
      }
    }

    // Rarity filter
    if (criteria.rarity && creature.rarity !== criteria.rarity) {
      return false;
    }

    // Creature type filter
    if (
      criteria.creatureType &&
      creature.creatureType.toLowerCase() !== criteria.creatureType.toLowerCase()
    ) {
      return false;
    }

    // Size filter
    if (criteria.size && creature.size.toLowerCase() !== criteria.size.toLowerCase()) {
      return false;
    }

    // Spellcasting filter
    if (criteria.hasSpells !== undefined && creature.hasSpells !== criteria.hasSpells) {
      return false;
    }

    return true;
  }

  /**
   * Fallback to basic creature search if enhanced index fails
   */
  private async fallbackBasicCreatureSearch(
    criteria: any,
    limit: number
  ): Promise<{ creatures: any[]; searchSummary: any }> {
    console.warn(`[${this.moduleId}] Falling back to basic search due to enhanced index failure`);

    // Use a simple text-based search as fallback
    const searchTerms: string[] = [];

    if (criteria.creatureType) {
      searchTerms.push(criteria.creatureType);
    }

    if (criteria.challengeRating) {
      if (typeof criteria.challengeRating === 'number') {
        // Add CR-based name patterns as fallback
        if (criteria.challengeRating >= 15) searchTerms.push('ancient', 'legendary');
        else if (criteria.challengeRating >= 10) searchTerms.push('adult', 'champion');
        else if (criteria.challengeRating >= 5) searchTerms.push('captain', 'knight');
      }
    }

    const searchQuery = searchTerms.join(' ') || 'monster';
    const basicResults = await this.searchCompendium(searchQuery, 'Actor');

    return {
      creatures: basicResults.slice(0, limit),
      searchSummary: {
        packsSearched: 0,
        topPacks: [],
        totalCreaturesFound: basicResults.length,
        resultsByPack: {},
        criteria,
        fallback: true,
        searchMethod: 'basic_fallback',
      },
    };
  }

  /**
   * Prioritize compendium packs by likelihood of containing relevant creatures
   * @unused - Replaced by enhanced persistent index system
   */
  // @ts-expect-error - Unused method kept for compatibility
  private prioritizePacksForCreatures(packs: any[]): any[] {
    const priorityOrder = [
      // Tier 1: Core D&D 5e content (highest priority)
      { pattern: /^dnd5e\.monsters/, priority: 100 }, // Core D&D 5e monsters
      { pattern: /^dnd5e\.actors/, priority: 95 }, // Core D&D 5e actors
      { pattern: /ddb.*monsters/i, priority: 90 }, // D&D Beyond monsters

      // Tier 2: Official modules and supplements
      { pattern: /^world\..*ddb.*monsters/i, priority: 85 }, // World-specific DDB monsters
      { pattern: /monsters/i, priority: 80 }, // Any pack with "monsters"

      // Tier 3: Campaign and adventure content
      { pattern: /^world\.(?!.*summon|.*hero)/i, priority: 70 }, // World packs (not summons/heroes)

      // Tier 4: Specialized content
      { pattern: /summon|familiar/i, priority: 40 }, // Summons and familiars

      // Tier 5: Unlikely to contain monsters (lowest priority)
      { pattern: /hero|player|pc/i, priority: 10 }, // Player characters
    ];

    return packs.sort((a, b) => {
      const aScore = this.getPackPriority(a.metadata.id, a.metadata.label, priorityOrder);
      const bScore = this.getPackPriority(b.metadata.id, b.metadata.label, priorityOrder);

      if (aScore !== bScore) {
        return bScore - aScore; // Higher score first
      }

      // Secondary sort by pack label alphabetically
      return a.metadata.label.localeCompare(b.metadata.label);
    });
  }

  /**
   * Get priority score for a pack based on ID and label
   */
  private getPackPriority(
    packId: string,
    packLabel: string,
    priorityOrder: { pattern: RegExp; priority: number }[]
  ): number {
    for (const rule of priorityOrder) {
      if (rule.pattern.test(packId) || rule.pattern.test(packLabel)) {
        return rule.priority;
      }
    }
    // Default priority for unmatched packs
    return 50;
  }

  /**
   * Check if creature entry passes the given criteria
   * @unused - Legacy method replaced by passesEnhancedCriteria
   */
  // @ts-expect-error - Legacy method kept for compatibility
  private passesCriteria(
    entry: unknown,
    criteria: {
      challengeRating?: number | { min?: number; max?: number };
      creatureType?: string;
      size?: string;
      hasSpells?: boolean;
      hasLegendaryActions?: boolean;
    }
  ): boolean {
    type CreatureSystemLike = {
      details?: {
        cr?: { value?: number | string } | number | string;
        type?: { value?: string } | string;
        spellLevel?: number;
      };
      cr?: { value?: number | string } | number | string;
      type?: { value?: string } | string;
      traits?: { size?: string };
      size?: string;
      spells?: unknown;
      attributes?: { spellcasting?: unknown };
      resources?: { legact?: unknown; legres?: { value?: number } };
      legendary?: unknown;
    };

    const entryRecord =
      entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : {};
    const systemRaw = entryRecord.system;
    const system: CreatureSystemLike =
      systemRaw && typeof systemRaw === 'object' ? (systemRaw as CreatureSystemLike) : {};

    // Challenge Rating filter - enhanced extraction
    if (criteria.challengeRating !== undefined) {
      // Try multiple possible CR locations in D&D 5e data structure
      const detailsCrRaw = system.details?.cr;
      const detailsCr =
        detailsCrRaw && typeof detailsCrRaw === 'object' && 'value' in detailsCrRaw
          ? (detailsCrRaw as { value?: number | string }).value
          : detailsCrRaw;
      const systemCrRaw = system.cr;
      const systemCr =
        systemCrRaw && typeof systemCrRaw === 'object' && 'value' in systemCrRaw
          ? (systemCrRaw as { value?: number | string }).value
          : systemCrRaw;
      const entryCRRaw = detailsCr ?? systemCr ?? 0;
      let entryCR = typeof entryCRRaw === 'number' ? entryCRRaw : 0;

      // Handle fractional CRs (common in D&D 5e)
      if (typeof entryCRRaw === 'string') {
        if (entryCRRaw === '1/8') entryCR = 0.125;
        else if (entryCRRaw === '1/4') entryCR = 0.25;
        else if (entryCRRaw === '1/2') entryCR = 0.5;
        else entryCR = parseFloat(entryCRRaw) || 0;
      } else if (typeof entryCRRaw === 'number') {
        entryCR = entryCRRaw;
      }

      if (typeof criteria.challengeRating === 'number') {
        if (entryCR !== criteria.challengeRating) {
          return false;
        }
      } else if (typeof criteria.challengeRating === 'object') {
        const { min = 0, max = 30 } = criteria.challengeRating;
        if (entryCR < min || entryCR > max) {
          return false;
        }
      }
    }

    // Creature Type filter - enhanced extraction
    if (criteria.creatureType) {
      // Try multiple possible type locations in D&D 5e data structure
      const detailsTypeRaw = system.details?.type;
      const detailsType =
        detailsTypeRaw && typeof detailsTypeRaw === 'object' && 'value' in detailsTypeRaw
          ? (detailsTypeRaw as { value?: string }).value
          : detailsTypeRaw;
      const systemTypeRaw = system.type;
      const systemType =
        systemTypeRaw && typeof systemTypeRaw === 'object' && 'value' in systemTypeRaw
          ? (systemTypeRaw as { value?: string }).value
          : systemTypeRaw;
      const entryType = (detailsType ?? systemType ?? '') as string;
      if (entryType.toLowerCase() !== criteria.creatureType.toLowerCase()) {
        return false;
      }
    }

    // Size filter
    if (criteria.size) {
      const entrySize = system.traits?.size ?? system.size ?? '';
      if (entrySize.toLowerCase() !== criteria.size.toLowerCase()) return false;
    }

    // Spellcaster filter
    if (criteria.hasSpells !== undefined) {
      const isSpellcaster = !!(
        system.spells ||
        system.attributes?.spellcasting ||
        (system.details?.spellLevel && system.details.spellLevel > 0)
      );
      if (isSpellcaster !== criteria.hasSpells) return false;
    }

    // Legendary Actions filter
    if (criteria.hasLegendaryActions !== undefined) {
      const hasLegendary = !!(
        system.resources?.legact ||
        system.legendary ||
        (system.resources?.legres && (system.resources.legres.value ?? 0) > 0)
      );
      if (hasLegendary !== criteria.hasLegendaryActions) return false;
    }

    return true;
  }

  /**
   * Simple name/description-based matching for creatures using index data only
   */
  private matchesSearchCriteria(
    entry: unknown,
    criteria: {
      searchTerms?: string[];
      excludeTerms?: string[];
      size?: string;
      hasSpells?: boolean;
      hasLegendaryActions?: boolean;
    }
  ): boolean {
    const entryRecord =
      entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : {};
    const name = typeof entryRecord.name === 'string' ? entryRecord.name.toLowerCase() : '';
    const description =
      typeof entryRecord.description === 'string' ? entryRecord.description.toLowerCase() : '';
    const searchText = `${name} ${description}`;

    // Include terms - at least one must match
    if (criteria.searchTerms && criteria.searchTerms.length > 0) {
      const hasMatch = criteria.searchTerms.some(term => searchText.includes(term.toLowerCase()));
      if (!hasMatch) {
        return false;
      }
    }

    // Exclude terms - none should match
    if (criteria.excludeTerms && criteria.excludeTerms.length > 0) {
      const hasExcluded = criteria.excludeTerms.some(term =>
        searchText.includes(term.toLowerCase())
      );
      if (hasExcluded) {
        return false;
      }
    }

    return true;
  }
  /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/prefer-nullish-coalescing */

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
  }): Promise<{ id: string; name: string }> {
    this.validateFoundryState();

    // Use permission system for journal creation
    const permissionCheck = permissionManager.checkWritePermission('createActor', {
      quantity: 1, // Treat journal creation similar to actor creation for permissions
    });

    if (!permissionCheck.allowed) {
      throw new Error(`Journal creation denied: ${permissionCheck.reason}`);
    }

    try {
      // Create journal entry with proper Foundry v13 structure
      const journalData = {
        name: request.name,
        pages: [
          {
            type: 'text',
            name: 'Quest Details', // Use generic page name to avoid title repetition
            text: {
              content: request.content,
            },
          },
        ],
        ownership: { default: 0 }, // GM only by default
        folder: await this.getOrCreateFolder(request.folderName ?? request.name, 'JournalEntry'),
      };

      const journalApi = JournalEntry as unknown as {
        create: (data: Record<string, unknown>) => Promise<unknown>;
      };
      const journalRaw = await journalApi.create(journalData as Record<string, unknown>);
      const journal =
        journalRaw && typeof journalRaw === 'object'
          ? (journalRaw as { id?: string; name?: string })
          : null;

      if (!journal) {
        throw new Error('Failed to create journal entry');
      }

      const result = {
        id: journal.id ?? '',
        name: journal.name ?? request.name,
      };

      this.auditLog('createJournalEntry', request, 'success');
      return result;
    } catch (error) {
      this.auditLog(
        'createJournalEntry',
        request,
        'failure',
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw error;
    }
  }

  /**
   * List all journal entries
   */
  listJournals(): Promise<Array<{ id: string; name: string; type: string }>> {
    this.validateFoundryState();

    const journalsSource: unknown = game.journal;
    const journals =
      journalsSource &&
      typeof journalsSource === 'object' &&
      Symbol.iterator in (journalsSource as Record<string, unknown>)
        ? Array.from(journalsSource as Iterable<unknown>).filter(
            (journal): journal is { id?: string; name?: string } =>
              Boolean(journal && typeof journal === 'object')
          )
        : [];

    return Promise.resolve(
      journals.map(journal => ({
        id: journal.id ?? '',
        name: journal.name ?? '',
        type: 'JournalEntry',
      }))
    );
  }

  /**
   * Get journal entry content
   */
  getJournalContent(journalId: string): Promise<{ content: string } | null> {
    this.validateFoundryState();

    const journalCollection = game.journal as { get: (id: string) => unknown } | null | undefined;
    const journalRaw = journalCollection ? journalCollection.get(journalId) : null;
    const journal =
      journalRaw && typeof journalRaw === 'object'
        ? (journalRaw as { pages?: { find: (predicate: (page: unknown) => boolean) => unknown } })
        : null;
    if (!journal) {
      return Promise.resolve(null);
    }

    // Get first text page content
    const firstPageRaw = journal.pages?.find(page => {
      if (!page || typeof page !== 'object') {
        return false;
      }

      return (page as { type?: string }).type === 'text';
    });
    const firstPage =
      firstPageRaw && typeof firstPageRaw === 'object'
        ? (firstPageRaw as { text?: { content?: string } })
        : null;
    if (!firstPage) {
      return Promise.resolve({ content: '' });
    }

    return Promise.resolve({
      content: firstPage.text?.content ?? '',
    });
  }

  /**
   * Update journal entry content
   */
  async updateJournalContent(request: {
    journalId: string;
    content: string;
  }): Promise<{ success: boolean }> {
    this.validateFoundryState();

    // Use permission system for journal updates - treating as createActor permission level
    const permissionCheck = permissionManager.checkWritePermission('createActor', {
      quantity: 1, // Treat journal updates similar to actor creation for permissions
    });

    if (!permissionCheck.allowed) {
      throw new Error(`Journal update denied: ${permissionCheck.reason}`);
    }

    try {
      const journalCollection = game.journal as { get: (id: string) => unknown } | null | undefined;
      const journalRaw = journalCollection ? journalCollection.get(request.journalId) : null;
      const journal =
        journalRaw && typeof journalRaw === 'object'
          ? (journalRaw as {
              pages?: { find: (predicate: (page: unknown) => boolean) => unknown };
              createEmbeddedDocuments: (
                type: string,
                data: Record<string, unknown>[]
              ) => Promise<unknown>;
            })
          : null;
      if (!journal) {
        throw new Error('Journal entry not found');
      }

      // Update first text page or create one if none exists
      const firstPageRaw = journal.pages?.find(page => {
        if (!page || typeof page !== 'object') {
          return false;
        }

        return (page as { type?: string }).type === 'text';
      });
      const firstPage =
        firstPageRaw && typeof firstPageRaw === 'object'
          ? (firstPageRaw as { update?: (data: Record<string, unknown>) => Promise<unknown> })
          : null;

      if (firstPage?.update) {
        // Update existing page
        await firstPage.update({
          'text.content': request.content,
        });
      } else {
        // Create new text page
        await journal.createEmbeddedDocuments('JournalEntryPage', [
          {
            type: 'text',
            name: 'Quest Details', // Use generic page name to avoid title repetition
            text: {
              content: request.content,
            },
          },
        ]);
      }

      this.auditLog('updateJournalContent', request, 'success');
      return { success: true };
    } catch (error) {
      this.auditLog(
        'updateJournalContent',
        request,
        'failure',
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw error;
    }
  }

  /**
   * Create actors from compendium entries with custom names
   */
  async createActorFromCompendium(request: ActorCreationRequest): Promise<ActorCreationResult> {
    this.validateFoundryState();

    // Use new permission system
    const permissionCheck = permissionManager.checkWritePermission('createActor', {
      quantity: request.quantity ?? 1,
    });

    if (!permissionCheck.allowed) {
      throw new Error(`${ERROR_MESSAGES.ACCESS_DENIED}: ${permissionCheck.reason}`);
    }

    // Audit the permission check
    permissionManager.auditPermissionCheck(
      'createActor',
      permissionCheck,
      request as unknown as Record<string, unknown>
    );

    const maxActors = game.settings.get(this.moduleId, 'maxActorsPerRequest') as number;
    const quantity = Math.min(request.quantity ?? 1, maxActors);

    // Start transaction for rollback capability
    const transactionId = transactionManager.startTransaction(
      `Create ${quantity} actor(s) from compendium: ${request.creatureType}`
    );

    try {
      // Find matching compendium entry
      const compendiumEntry = await this.findBestCompendiumMatch(
        request.creatureType,
        request.packPreference
      );
      if (!compendiumEntry) {
        throw new Error(`No compendium entry found for "${request.creatureType}"`);
      }

      // Get full compendium document
      const sourceDoc = await this.getCompendiumDocumentFull(
        compendiumEntry.pack,
        compendiumEntry.id
      );

      const createdActors: CreatedActorInfo[] = [];
      const errors: string[] = [];

      // Create actors with custom names
      for (let i = 0; i < quantity; i++) {
        try {
          const customName =
            request.customNames?.[i] ??
            (quantity > 1 ? `${sourceDoc.name} ${i + 1}` : sourceDoc.name);

          const newActorRaw = await this.createActorFromSource(sourceDoc, customName);
          const newActor = newActorRaw as unknown as ActorLookupLike;
          const actorId = newActor.id ?? '';

          // Track actor creation for rollback
          transactionManager.addAction(
            transactionId,
            transactionManager.createActorCreationAction(actorId)
          );

          createdActors.push({
            id: actorId,
            name: newActor.name ?? customName,
            originalName: sourceDoc.name,
            type: newActor.type ?? 'unknown',
            sourcePackId: compendiumEntry.pack,
            sourcePackLabel: compendiumEntry.packLabel,
            img:
              typeof (newActor as { img?: unknown }).img === 'string'
                ? (newActor as { img: string }).img
                : undefined,
          });
        } catch (error) {
          errors.push(
            `Failed to create actor ${i + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        }
      }

      let tokensPlaced = 0;

      // Add to scene if requested and permission allows
      if (request.addToScene && createdActors.length > 0) {
        try {
          const scenePermissionCheck = permissionManager.checkWritePermission('modifyScene', {
            targetIds: createdActors.map(a => a.id),
          });

          if (!scenePermissionCheck.allowed) {
            errors.push(`Cannot add to scene: ${scenePermissionCheck.reason}`);
          } else {
            const tokenResult = await this.addActorsToScene(
              {
                actorIds: createdActors.map(a => a.id),
                placement: 'random',
                hidden: false,
              },
              transactionId
            );
            tokensPlaced = tokenResult.tokensCreated;
          }
        } catch (error) {
          errors.push(
            `Failed to add actors to scene: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        }
      }

      // If we had partial failure, decide whether to rollback
      if (errors.length > 0 && createdActors.length < quantity) {
        // Rollback if we failed to create more than half the requested actors
        if (createdActors.length < quantity / 2) {
          console.warn(
            `[${this.moduleId}] Rolling back due to significant failures (${createdActors.length}/${quantity} created)`
          );
          await transactionManager.rollbackTransaction(transactionId);
          throw new Error(`Actor creation failed: ${errors.join(', ')}`);
        }
      }

      // Commit transaction
      transactionManager.commitTransaction(transactionId);

      const result: ActorCreationResult = {
        success: createdActors.length > 0,
        actors: createdActors,
        ...(errors.length > 0 ? { errors } : {}),
        tokensPlaced,
        totalRequested: quantity,
        totalCreated: createdActors.length,
      };

      this.auditLog('createActorFromCompendium', request, 'success');
      return result;
    } catch (error) {
      // Rollback on complete failure
      try {
        await transactionManager.rollbackTransaction(transactionId);
      } catch (rollbackError) {
        console.error(`[${this.moduleId}] Failed to rollback transaction:`, rollbackError);
      }

      this.auditLog(
        'createActorFromCompendium',
        request,
        'failure',
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw error;
    }
  }

  /**
   * Create actor from specific compendium entry using pack/item IDs
   */
  async createActorFromCompendiumEntry(request: {
    packId: string;
    itemId: string;
    customNames: string[];
    quantity?: number;
    addToScene?: boolean;
    placement?: {
      type: 'random' | 'grid' | 'center' | 'coordinates';
      coordinates?: { x: number; y: number }[];
    };
  }): Promise<ActorCreationResult> {
    this.validateFoundryState();

    try {
      type CompendiumDocumentLike = {
        id?: string;
        name?: string;
        type?: string;
        documentName?: string;
        toObject: () => unknown;
      };
      type ActorCreateApi = {
        create: (data: Record<string, unknown>) => Promise<unknown>;
      };
      type MutableActorData = Record<string, unknown> & {
        name?: string;
        type?: string;
        img?: string;
        system?: unknown;
        data?: unknown;
        items?: unknown[];
        effects?: unknown[];
        folder?: string | null;
        prototypeToken?: { texture?: { src?: string | null } };
      };

      const { packId, itemId, customNames, quantity = 1, addToScene = false, placement } = request;

      // Validate inputs
      if (!packId || !itemId) {
        throw new Error('Both packId and itemId are required');
      }

      // Get the pack
      const packCollection = game.packs as { get: (id: string) => unknown } | null | undefined;
      const pack = packCollection ? packCollection.get(packId) : null;
      if (!pack) {
        throw new Error(`Compendium pack "${packId}" not found`);
      }

      const typedPack = pack as {
        metadata?: { label?: string };
        getDocument: (id: string) => Promise<unknown>;
      };

      // Get the specific document
      const sourceDocumentRaw = await typedPack.getDocument(itemId);
      const sourceDocument =
        sourceDocumentRaw && typeof sourceDocumentRaw === 'object'
          ? (sourceDocumentRaw as CompendiumDocumentLike)
          : null;
      if (!sourceDocument) {
        throw new Error(`Document "${itemId}" not found in pack "${packId}"`);
      }

      // Validate that the document is an Actor (supports character, npc, creature, etc.)
      if (sourceDocument.documentName !== 'Actor') {
        throw new Error(
          `Document "${itemId}" is not an Actor (documentName: ${sourceDocument.documentName}, type: ${sourceDocument.type})`
        );
      }

      // Validate actor type - support all common actor types including DSA5 creatures
      const validActorTypes = ['character', 'npc', 'creature'];
      const sourceDocumentType = sourceDocument.type ?? 'unknown';
      if (!validActorTypes.includes(sourceDocumentType)) {
        throw new Error(
          `Document "${itemId}" has unsupported actor type: ${sourceDocument.type}. Supported types: ${validActorTypes.join(', ')}`
        );
      }

      const sourceActorName = sourceDocument.name ?? 'Unknown Actor';

      // Prepare custom names
      const names = customNames.length > 0 ? customNames : [`${sourceActorName} Copy`];
      const finalQuantity = Math.min(quantity, names.length);

      const createdActors: CreatedActorInfo[] = [];
      const errors: string[] = [];

      // Create actors
      for (let i = 0; i < finalQuantity; i++) {
        try {
          const customName = names[i] ?? `${sourceActorName} ${i + 1}`;

          // Create actor data with full system, items, and effects
          const sourceDataRaw = sourceDocument.toObject();
          const sourceData: MutableActorData =
            sourceDataRaw && typeof sourceDataRaw === 'object'
              ? (sourceDataRaw as MutableActorData)
              : {};
          const actorData: MutableActorData = {
            name: customName,
            ...(typeof sourceData.type === 'string' ? { type: sourceData.type } : {}),
            ...(typeof sourceData.img === 'string' ? { img: sourceData.img } : {}),
            system: sourceData.system ?? sourceData.data ?? {},
            items: sourceData.items ?? [],
            effects: sourceData.effects ?? [],
            folder: null as string | null, // Don't inherit folder
            ...(sourceData.prototypeToken ? { prototypeToken: sourceData.prototypeToken } : {}), // Include prototype token
          };

          // Fix remote image URLs - normalize to local paths
          if (actorData.prototypeToken?.texture?.src?.startsWith('http')) {
            actorData.prototypeToken.texture.src = null; // Clear remote URL
          }

          // Organize created actors in a folder - use "Foundry MCP Creatures" for generic monsters
          const folderId = await this.getOrCreateFolder('Foundry MCP Creatures', 'Actor');
          if (folderId) {
            actorData.folder = folderId;
          }

          // Create the actor
          const actorApi = Actor as unknown as ActorCreateApi;
          const newActorRaw = await actorApi.create(actorData as Record<string, unknown>);
          const newActor =
            newActorRaw && typeof newActorRaw === 'object'
              ? (newActorRaw as { id?: string; name?: string })
              : null;
          if (!newActor) {
            throw new Error(`Failed to create actor "${customName}"`);
          }

          createdActors.push({
            id: newActor.id ?? '',
            name: newActor.name ?? customName,
            originalName: sourceActorName,
            type: sourceDocument.type ?? 'unknown',
            sourcePackId: packId,
            sourcePackLabel: typedPack.metadata?.label ?? '',
          });
        } catch (error) {
          const errorMsg = `Failed to create actor ${i + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          errors.push(errorMsg);
          console.error(`[${MODULE_ID}] ${errorMsg}`, error);
        }
      }

      // Add to scene if requested
      let tokensPlaced = 0;
      if (addToScene && createdActors.length > 0) {
        try {
          const sceneResult = await this.addActorsToScene({
            actorIds: createdActors.map(a => a.id),
            placement: placement?.type ?? 'grid',
            hidden: false,
            ...(placement?.coordinates && { coordinates: placement.coordinates }),
          });
          tokensPlaced = sceneResult.success ? sceneResult.tokensCreated : 0;
        } catch (error) {
          errors.push(
            `Failed to add actors to scene: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        }
      }

      const result: ActorCreationResult = {
        success: createdActors.length > 0,
        totalCreated: createdActors.length,
        totalRequested: finalQuantity,
        actors: createdActors,
        tokensPlaced,
        errors: errors.length > 0 ? errors : undefined,
      };

      this.auditLog('createActorFromCompendiumEntry', request, 'success');
      return result;
    } catch (error) {
      console.error(`[${MODULE_ID}] Failed to create actor from compendium entry`, error);
      this.auditLog(
        'createActorFromCompendiumEntry',
        request,
        'failure',
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw error;
    }
  }

  /**
   * Get full compendium document with all embedded data
   */
  async getCompendiumDocumentFull(
    packId: string,
    documentId: string
  ): Promise<CompendiumEntryFull> {
    const packCollection = game.packs as { get: (id: string) => unknown } | null | undefined;
    const pack = packCollection ? packCollection.get(packId) : null;
    if (!pack) {
      throw new Error(`Compendium pack ${packId} not found`);
    }

    type CompendiumPackLike = {
      metadata?: { label?: string };
      getDocument: (id: string) => Promise<unknown>;
    };
    const typedPack = pack as CompendiumPackLike;

    const document = await typedPack.getDocument(documentId);
    if (!document) {
      throw new Error(`Document ${documentId} not found in pack ${packId}`);
    }

    type EmbeddedItemLike = {
      id?: string;
      name?: string;
      type?: string;
      img?: string;
      system?: unknown;
    };
    type EmbeddedEffectLike = {
      id?: string;
      name?: string;
      label?: string;
      icon?: string;
      disabled?: boolean;
      duration?: unknown;
    };
    type CompendiumDocumentLike = {
      id?: string;
      name?: string;
      type?: string;
      img?: string;
      system?: unknown;
      toObject: () => Record<string, unknown>;
      items?: Iterable<unknown>;
      effects?: Iterable<unknown>;
    };
    const typedDocument = document as CompendiumDocumentLike;

    // Build comprehensive data structure
    const fullEntry: CompendiumEntryFull = {
      id: typedDocument.id ?? '',
      name: typedDocument.name ?? '',
      type: typedDocument.type ?? 'unknown',
      ...(typedDocument.img ? { img: typedDocument.img } : {}),
      pack: packId,
      packLabel: typedPack.metadata?.label ?? '',
      system: this.sanitizeData(
        typedDocument.system && typeof typedDocument.system === 'object' ? typedDocument.system : {}
      ) as Record<string, unknown>,
      fullData: this.sanitizeData(typedDocument.toObject()) as Record<string, unknown>,
    };

    // Add items if the actor has them
    if (typedDocument.items) {
      const items = Array.from(typedDocument.items)
        .filter((item): item is EmbeddedItemLike => Boolean(item && typeof item === 'object'))
        .map(item => {
          const mappedItem: CompendiumItem = {
            id: item.id ?? '',
            name: item.name ?? '',
            type: item.type ?? 'unknown',
            system: this.sanitizeData(
              item.system && typeof item.system === 'object' ? item.system : {}
            ) as Record<string, unknown>,
          };

          if (item.img) {
            mappedItem.img = item.img;
          }

          return mappedItem;
        });
      fullEntry.items = items;
    }

    // Add effects if the actor has them
    if (typedDocument.effects) {
      const effects = Array.from(typedDocument.effects)
        .filter((effect): effect is EmbeddedEffectLike =>
          Boolean(effect && typeof effect === 'object')
        )
        .map(effect => {
          const mappedEffect: CompendiumEffect = {
            id: effect.id ?? '',
            name: effect.name ?? effect.label ?? 'Unknown Effect',
            disabled: effect.disabled ?? false,
            duration: this.sanitizeData(
              effect.duration && typeof effect.duration === 'object' ? effect.duration : {}
            ) as Record<string, unknown>,
          };

          if (effect.icon) {
            mappedEffect.icon = effect.icon;
          }

          return mappedEffect;
        });
      fullEntry.effects = effects;
    }

    return fullEntry;
  }

  /**
   * Add actors to the current scene as tokens
   */
  async addActorsToScene(
    placement: SceneTokenPlacement,
    transactionId?: string
  ): Promise<TokenPlacementResult> {
    this.validateFoundryState();

    // Use new permission system
    const permissionCheck = permissionManager.checkWritePermission('modifyScene', {
      targetIds: placement.actorIds,
    });

    if (!permissionCheck.allowed) {
      throw new Error(`${ERROR_MESSAGES.ACCESS_DENIED}: ${permissionCheck.reason}`);
    }

    // Audit the permission check
    permissionManager.auditPermissionCheck(
      'modifyScene',
      permissionCheck,
      placement as unknown as Record<string, unknown>
    );

    const sceneCollection = game.scenes as { current?: unknown } | null | undefined;
    const sceneRaw = sceneCollection?.current;
    const scene =
      sceneRaw && typeof sceneRaw === 'object'
        ? (sceneRaw as SceneListItem & {
            createEmbeddedDocuments: (
              type: string,
              data: Record<string, unknown>[]
            ) => Promise<unknown>;
          })
        : null;
    if (!scene) {
      throw new Error('No active scene found');
    }

    this.auditLog('addActorsToScene', placement, 'success');

    try {
      type TokenDocumentLike = Record<string, unknown> & {
        texture?: { src?: string | null };
      };

      const tokenData: Record<string, unknown>[] = [];
      const errors: string[] = [];

      const actorsCollection = game.actors as { get: (id: string) => unknown } | null | undefined;

      for (const actorId of placement.actorIds) {
        try {
          const actorRaw = actorsCollection ? actorsCollection.get(actorId) : null;
          const actor =
            actorRaw && typeof actorRaw === 'object'
              ? (actorRaw as { prototypeToken?: { toObject?: () => unknown } })
              : null;
          if (!actor) {
            errors.push(`Actor ${actorId} not found`);
            continue;
          }

          const tokenDocRaw = actor.prototypeToken?.toObject?.();
          const tokenDoc: TokenDocumentLike =
            tokenDocRaw && typeof tokenDocRaw === 'object'
              ? (tokenDocRaw as TokenDocumentLike)
              : {};
          const position = this.calculateTokenPosition(
            placement.placement,
            scene,
            tokenData.length,
            placement.coordinates
          );

          // Fix token texture if it's still a remote URL (Foundry may have overridden our actor creation fix)
          if (tokenDoc.texture?.src?.startsWith('http')) {
            console.error(
              `[${this.moduleId}] Token texture still has remote URL, clearing: ${tokenDoc.texture.src}`
            );
            tokenDoc.texture.src = null; // Use Foundry's fallback
          }

          tokenData.push({
            ...tokenDoc,
            x: position.x,
            y: position.y,
            actorId,
            hidden: placement.hidden,
          });
        } catch (error) {
          errors.push(
            `Failed to prepare token for actor ${actorId}: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        }
      }

      const createdTokensRaw = await scene.createEmbeddedDocuments('Token', tokenData);
      const createdTokens = Array.isArray(createdTokensRaw)
        ? createdTokensRaw.filter((token): token is { id?: string } =>
            Boolean(token && typeof token === 'object')
          )
        : [];

      // Track token creation for rollback if transaction is active
      if (transactionId && createdTokens.length > 0) {
        for (const token of createdTokens) {
          if (token.id) {
            transactionManager.addAction(
              transactionId,
              transactionManager.createTokenCreationAction(token.id)
            );
          }
        }
      }

      const result: TokenPlacementResult = {
        success: createdTokens.length > 0,
        tokensCreated: createdTokens.length,
        tokenIds: createdTokens
          .map(token => token.id)
          .filter((id): id is string => typeof id === 'string' && id.length > 0),
        ...(errors.length > 0 ? { errors } : {}),
      };

      this.auditLog('addActorsToScene', placement, 'success');
      return result;
    } catch (error) {
      this.auditLog(
        'addActorsToScene',
        placement,
        'failure',
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw error;
    }
  }

  /**
   * Find best matching compendium entry for creature type
   */
  private async findBestCompendiumMatch(
    creatureType: string,
    packPreference?: string
  ): Promise<CompendiumSearchResult | null> {
    // First try exact search
    const exactResults = await this.searchCompendium(creatureType, 'Actor');

    // Look for exact name match first
    const exactMatch = exactResults.find(
      result => result.name.toLowerCase() === creatureType.toLowerCase()
    );
    if (exactMatch) return exactMatch;

    // Look for partial matches, preferring specified pack
    if (packPreference) {
      const packMatch = exactResults.find(result => result.pack === packPreference);
      if (packMatch) return packMatch;
    }

    // Return best fuzzy match
    return exactResults.length > 0 ? exactResults[0] : null;
  }

  /**
   * Create actor from source document with custom name
   */
  private async createActorFromSource(
    sourceDoc: CompendiumEntryFull,
    customName: string
  ): Promise<ActorLookupLike> {
    try {
      type MutableActorData = {
        _id?: string;
        folder?: string;
        sort?: number;
        name?: string;
        type?: string;
        prototypeToken?: { texture?: { src?: string | null } };
        [key: string]: unknown;
      };

      // Clone the source data
      const deepCloneFn = (
        foundry as unknown as { utils?: { deepClone?: (value: unknown) => unknown } }
      ).utils?.deepClone;
      const actorDataRaw =
        typeof deepCloneFn === 'function' ? deepCloneFn(sourceDoc.fullData) : sourceDoc.fullData;
      const actorData: MutableActorData =
        actorDataRaw && typeof actorDataRaw === 'object' ? (actorDataRaw as MutableActorData) : {};

      // Apply customizations
      actorData.name = customName;

      // Fix only token texture - leave portrait (actor.img) alone
      if (actorData.prototypeToken?.texture?.src?.startsWith('http')) {
        console.error(
          `[${this.moduleId}] Removing remote token texture URL: ${actorData.prototypeToken.texture.src}`
        );
        actorData.prototypeToken.texture.src = null; // Let Foundry use fallback
      }

      // Remove source-specific identifiers
      delete actorData._id;
      delete actorData.folder;
      delete actorData.sort;

      // Ensure required fields are present
      if (!actorData.name) actorData.name = customName;
      if (!actorData.type) actorData.type = sourceDoc.type ?? 'npc';

      // Organize created actors in a folder - use "Foundry MCP Creatures" for generic monsters
      const folderId = await this.getOrCreateFolder('Foundry MCP Creatures', 'Actor');
      if (folderId) {
        actorData.folder = folderId;
      }

      // Create the new actor
      const actorApi = Actor as unknown as {
        createDocuments: (docs: Array<Record<string, unknown>>) => Promise<unknown>;
      };
      const createdDocsRaw = await actorApi.createDocuments([actorData as Record<string, unknown>]);
      const createdDocs = Array.isArray(createdDocsRaw)
        ? createdDocsRaw.filter((candidate): candidate is ActorLookupLike =>
            Boolean(candidate && typeof candidate === 'object')
          )
        : [];
      if (createdDocs.length === 0) {
        throw new Error('Failed to create actor document');
      }

      return createdDocs[0];
    } catch (error) {
      console.error(`[${this.moduleId}] Actor creation failed:`, error);
      throw error;
    }
  }

  /**
   * Calculate token position based on placement strategy
   */
  private calculateTokenPosition(
    placement: 'random' | 'grid' | 'center' | 'coordinates',
    scene: SceneListItem,
    index: number,
    coordinates?: { x: number; y: number }[]
  ): { x: number; y: number } {
    const gridSize = scene.grid?.size ?? 100;
    const sceneWidth = scene.width ?? 0;
    const sceneHeight = scene.height ?? 0;

    switch (placement) {
      case 'coordinates':
        if (coordinates?.[index]) {
          return coordinates[index];
        }
        // Fallback to grid if coordinates not provided or insufficient
        {
          const fallbackCols = Math.ceil(Math.sqrt(index + 1));
          const fallbackRow = Math.floor(index / fallbackCols);
          const fallbackCol = index % fallbackCols;
          return {
            x: gridSize + fallbackCol * gridSize * 2,
            y: gridSize + fallbackRow * gridSize * 2,
          };
        }

      case 'center':
        return {
          x: sceneWidth / 2 + index * gridSize,
          y: sceneHeight / 2,
        };

      case 'grid': {
        const cols = Math.ceil(Math.sqrt(index + 1));
        const row = Math.floor(index / cols);
        const col = index % cols;
        return {
          x: gridSize + col * gridSize * 2,
          y: gridSize + row * gridSize * 2,
        };
      }

      case 'random':
      default:
        return {
          x: Math.random() * (sceneWidth - gridSize),
          y: Math.random() * (sceneHeight - gridSize),
        };
    }
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

    // Get the enhanced creature index (builds if needed)
    const enhancedCreatures = (await this.persistentIndex.getEnhancedIndex()) as unknown;

    return Array.isArray(enhancedCreatures) ? (enhancedCreatures as Record<string, unknown>[]) : [];
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
    this.validateFoundryState();

    try {
      const actorsCollection = game.actors as
        | {
            get?: (id: string) => unknown;
            getName?: (name: string) => unknown;
            [Symbol.iterator]?: () => Iterator<unknown>;
          }
        | undefined;

      const usersCollection = game.users as
        | {
            get?: (id: string) => unknown;
            getName?: (name: string) => unknown;
            [Symbol.iterator]?: () => Iterator<unknown>;
          }
        | undefined;

      const actorsIterable =
        actorsCollection && typeof actorsCollection[Symbol.iterator] === 'function'
          ? (actorsCollection as unknown as Iterable<unknown>)
          : [];
      const usersIterable =
        usersCollection && typeof usersCollection[Symbol.iterator] === 'function'
          ? (usersCollection as unknown as Iterable<unknown>)
          : [];

      const actors = data.actorIdentifier
        ? data.actorIdentifier === 'all'
          ? Array.from(actorsIterable)
          : [this.findActorByIdentifier(data.actorIdentifier)].filter(
              (actor): actor is ActorLookupLike => !!actor
            )
        : Array.from(actorsIterable);

      const users = data.playerIdentifier
        ? [
            usersCollection?.getName?.(data.playerIdentifier) ??
              usersCollection?.get?.(data.playerIdentifier),
          ].filter((user): user is unknown => !!user)
        : Array.from(usersIterable);

      const ownershipInfo: Array<{
        id: string;
        name: string;
        type: string;
        ownership: Array<{
          userId: string;
          userName: string;
          permission: string;
          numericPermission: number;
        }>;
      }> = [];
      const permissionNames = { 0: 'NONE', 1: 'LIMITED', 2: 'OBSERVER', 3: 'OWNER' };

      for (const actor of actors) {
        if (!actor || typeof actor !== 'object') {
          continue;
        }

        const typedActor = actor as ActorLookupLike;
        if (!typedActor.id || !typedActor.name) {
          continue;
        }

        const actorInfo: {
          id: string;
          name: string;
          type: string;
          ownership: Array<{
            userId: string;
            userName: string;
            permission: string;
            numericPermission: number;
          }>;
        } = {
          id: typedActor.id,
          name: typedActor.name,
          type: typedActor.type ?? 'unknown',
          ownership: [],
        };

        for (const user of users) {
          if (!user || typeof user !== 'object') {
            continue;
          }

          const typedUser = user as UserLookupLike;
          if (typedUser.isGM) {
            continue;
          }

          const permission = typedActor.testUserPermission?.(typedUser, 'OWNER')
            ? 3
            : typedActor.testUserPermission?.(typedUser, 'OBSERVER')
              ? 2
              : typedActor.testUserPermission?.(typedUser, 'LIMITED')
                ? 1
                : 0;

          actorInfo.ownership.push({
            userId: typedUser.id ?? '',
            userName: typedUser.name ?? 'Unknown',
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

  /**
   * Find actor by name or ID
   */
  private findActorByIdentifier(identifier: string): ActorLookupLike | null {
    const actorsCollection = game.actors as
      | {
          get?: (id: string) => unknown;
          getName?: (name: string) => unknown;
          [Symbol.iterator]?: () => Iterator<unknown>;
        }
      | undefined;

    const byId = actorsCollection?.get?.(identifier);
    if (byId && typeof byId === 'object') {
      return byId as ActorLookupLike;
    }

    const byName = actorsCollection?.getName?.(identifier);
    if (byName && typeof byName === 'object') {
      return byName as ActorLookupLike;
    }

    const searchTerm = identifier.toLowerCase();
    const actors =
      actorsCollection && typeof actorsCollection[Symbol.iterator] === 'function'
        ? Array.from(actorsCollection as unknown as Iterable<unknown>)
        : [];
    const fuzzy = actors.find(actor => {
      if (!actor || typeof actor !== 'object') {
        return false;
      }
      const candidate = actor as ActorLookupLike;
      return candidate.name?.toLowerCase().includes(searchTerm) === true;
    });

    return fuzzy && typeof fuzzy === 'object' ? (fuzzy as ActorLookupLike) : null;
  }

  /**
   * Get friendly NPCs from current scene
   */
  getFriendlyNPCs(): Promise<Array<{ id: string; name: string }>> {
    this.validateFoundryState();

    try {
      const scenes = game.scenes as
        | {
            find?: (predicate: (scene: unknown) => boolean) => unknown;
          }
        | undefined;
      const scene = scenes?.find?.(candidate => {
        if (!candidate || typeof candidate !== 'object') {
          return false;
        }

        return (candidate as { active?: boolean }).active === true;
      }) as { tokens?: unknown } | undefined;

      if (!scene) {
        return Promise.resolve([]);
      }

      const tokensRaw = scene.tokens;
      const tokens = Array.isArray(tokensRaw)
        ? tokensRaw
        : tokensRaw && typeof tokensRaw === 'object' && 'contents' in tokensRaw
          ? ((tokensRaw as { contents?: unknown[] }).contents ?? [])
          : [];

      const friendlyTokens = tokens.filter(token => {
        if (!token || typeof token !== 'object') {
          return false;
        }

        return (token as TokenDispositionLike).disposition === TOKEN_DISPOSITIONS.FRIENDLY;
      });

      return Promise.resolve(
        friendlyTokens
          .map(token => {
            const t = token as TokenDispositionLike;
            return {
              id: t.actor?.id ?? t.id ?? '',
              name: t.name ?? t.actor?.name ?? 'Unknown',
            };
          })
          .filter(t => t.id)
      );
    } catch (error) {
      console.error(`[${MODULE_ID}] Error getting friendly NPCs:`, error);
      return Promise.resolve([]);
    }
  }

  /**
   * Get party characters (player-owned actors)
   */
  getPartyCharacters(): Promise<Array<{ id: string; name: string }>> {
    this.validateFoundryState();

    try {
      const actorsSource = game.actors as
        | { contents?: unknown[]; [Symbol.iterator]?: () => Iterator<unknown> }
        | null
        | undefined;
      const actors = Array.isArray(actorsSource?.contents)
        ? actorsSource.contents
        : actorsSource && typeof actorsSource[Symbol.iterator] === 'function'
          ? Array.from(actorsSource as Iterable<unknown>)
          : [];
      const partyCharacters = actors.filter(actor => {
        if (!actor || typeof actor !== 'object') {
          return false;
        }

        const candidate = actor as ActorLookupLike;
        return candidate.hasPlayerOwner === true && candidate.type === 'character';
      });

      return Promise.resolve(
        partyCharacters
          .map(actor => ({
            id: (actor as ActorLookupLike).id ?? '',
            name: (actor as ActorLookupLike).name ?? 'Unknown',
          }))
          .filter(c => c.id)
      );
    } catch (error) {
      console.error(`[${MODULE_ID}] Error getting party characters:`, error);
      return Promise.resolve([]);
    }
  }

  /**
   * Get connected players (excluding GM)
   */
  getConnectedPlayers(): Promise<Array<{ id: string; name: string }>> {
    this.validateFoundryState();

    try {
      const usersCollection = game.users as
        | {
            [Symbol.iterator]?: () => Iterator<unknown>;
          }
        | undefined;
      const users =
        usersCollection && typeof usersCollection[Symbol.iterator] === 'function'
          ? Array.from(usersCollection as unknown as Iterable<unknown>)
          : [];

      const connectedPlayers = users.filter(user => {
        if (!user || typeof user !== 'object') {
          return false;
        }
        const typedUser = user as UserLookupLike;
        return typedUser.active === true && typedUser.isGM !== true;
      });

      return Promise.resolve(
        connectedPlayers
          .map(user => ({
            id: (user as UserLookupLike).id ?? '',
            name: (user as UserLookupLike).name ?? 'Unknown',
          }))
          .filter(u => u.id)
      );
    } catch (error) {
      console.error(`[${MODULE_ID}] Error getting connected players:`, error);
      return Promise.resolve([]);
    }
  }

  /**
   * Find players by identifier with partial matching
   */
  findPlayers(data: {
    identifier: string;
    allowPartialMatch?: boolean;
    includeCharacterOwners?: boolean;
  }): Promise<Array<{ id: string; name: string }>> {
    this.validateFoundryState();

    try {
      const { identifier, allowPartialMatch = true, includeCharacterOwners = true } = data;
      const searchTerm = identifier.toLowerCase();
      const players: Array<{ id: string; name: string }> = [];

      const usersCollection = game.users as
        | {
            [Symbol.iterator]?: () => Iterator<unknown>;
            find?: (predicate: (user: unknown) => boolean) => unknown;
          }
        | undefined;
      const users =
        usersCollection && typeof usersCollection[Symbol.iterator] === 'function'
          ? Array.from(usersCollection as unknown as Iterable<unknown>)
          : [];

      const actorsCollection = game.actors as
        | {
            [Symbol.iterator]?: () => Iterator<unknown>;
          }
        | undefined;
      const actors =
        actorsCollection && typeof actorsCollection[Symbol.iterator] === 'function'
          ? Array.from(actorsCollection as unknown as Iterable<unknown>)
          : [];

      // Direct user name matching
      for (const user of users) {
        if (!user || typeof user !== 'object') {
          continue;
        }

        const typedUser = user as UserLookupLike;
        if (typedUser.isGM) continue;

        const userName = typedUser.name?.toLowerCase() ?? '';
        if (userName === searchTerm || (allowPartialMatch && userName.includes(searchTerm))) {
          players.push({ id: typedUser.id ?? '', name: typedUser.name ?? 'Unknown' });
        }
      }

      // Character name matching (find owner of character)
      if (includeCharacterOwners && players.length === 0) {
        for (const actor of actors) {
          if (!actor || typeof actor !== 'object') {
            continue;
          }
          const typedActor = actor as ActorLookupLike;
          if (typedActor.type !== 'character') continue;

          const actorName = typedActor.name?.toLowerCase() ?? '';
          if (actorName === searchTerm || (allowPartialMatch && actorName.includes(searchTerm))) {
            // Find the player owner of this character
            const ownerRaw = usersCollection?.find?.(candidate => {
              if (!candidate || typeof candidate !== 'object') {
                return false;
              }

              const typedCandidate = candidate as UserLookupLike;
              return (
                typedActor.testUserPermission?.(typedCandidate, 'OWNER') === true &&
                typedCandidate.isGM !== true
              );
            });
            const owner =
              ownerRaw && typeof ownerRaw === 'object' ? (ownerRaw as UserLookupLike) : null;

            if (owner && !players.some(p => p.id === owner.id)) {
              players.push({ id: owner.id ?? '', name: owner.name ?? 'Unknown' });
            }
          }
        }
      }

      return Promise.resolve(players.filter(p => p.id));
    } catch (error) {
      console.error(`[${MODULE_ID}] Error finding players:`, error);
      return Promise.resolve([]);
    }
  }

  /**
   * Find single actor by identifier
   */
  findActor(data: { identifier: string }): Promise<{ id: string; name: string } | null> {
    this.validateFoundryState();

    try {
      const actor = this.findActorByIdentifier(data.identifier);
      if (!actor || typeof actor !== 'object') {
        return Promise.resolve(null);
      }

      const typedActor = actor as { id?: string; name?: string };
      if (!typedActor.id || !typedActor.name) {
        return Promise.resolve(null);
      }

      return Promise.resolve({ id: typedActor.id, name: typedActor.name });
    } catch (error) {
      console.error(`[${MODULE_ID}] Error finding actor:`, error);
      return Promise.resolve(null);
    }
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
   * Get or create a folder for organizing MCP-generated content
   */
  private async getOrCreateFolder(
    folderName: string,
    type: 'Actor' | 'JournalEntry'
  ): Promise<string | null> {
    try {
      const foldersRaw = game.folders as unknown;
      const folders = Array.isArray(foldersRaw) ? foldersRaw : [];

      // Look for existing folder
      const existingFolder = folders.find(folder => {
        if (!folder || typeof folder !== 'object') {
          return false;
        }

        const f = folder as FolderLike;
        return f.name === folderName && f.type === type;
      }) as FolderLike | undefined;

      if (existingFolder) {
        return existingFolder.id ?? null;
      }

      // Create appropriate descriptions
      let description = '';
      if (type === 'Actor') {
        if (folderName === 'Foundry MCP Creatures') {
          description = 'Creatures and monsters created via Foundry MCP Bridge';
        } else {
          description = `NPCs and creatures related to: ${folderName}`;
        }
      } else {
        description = `Quest and content for: ${folderName}`;
      }

      // Create new folder
      const folderData = {
        name: folderName,
        type,
        description,
        color: type === 'Actor' ? '#4a90e2' : '#f39c12', // Blue for actors, orange for journals
        sort: 0,
        parent: null,
        flags: {
          'foundry-mcp-bridge': {
            mcpGenerated: true,
            createdAt: new Date().toISOString(),
            questContext: type === 'JournalEntry' ? folderName : undefined,
          },
        },
      };

      const folderCtor = Folder as unknown as {
        create: (data: Record<string, unknown>) => Promise<FolderLike | null>;
      };
      const folder = await folderCtor.create(folderData);
      return folder?.id ?? null;
    } catch (error) {
      console.warn(`[${this.moduleId}] Failed to create folder "${folderName}":`, error);
      // Return null so items are created without folders rather than failing
      return null;
    }
  }

  /**
   * List all scenes with filtering options
   */
  /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await, @typescript-eslint/prefer-nullish-coalescing */
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
    this.validateFoundryState();

    try {
      const scenesRaw = game.scenes?.contents;
      let scenes = (Array.isArray(scenesRaw) ? scenesRaw : []) as SceneListItem[];

      // Filter by active only if requested
      if (options.include_active_only) {
        scenes = scenes.filter(scene => scene.active === true);
      }

      // Filter by name if provided
      if (options.filter) {
        const filterLower = options.filter.toLowerCase();
        scenes = scenes.filter(scene => scene.name?.toLowerCase().includes(filterLower) === true);
      }

      // Map to consistent format
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

  /**
   * Switch to a different scene
   */
  async switchScene(options: { scene_identifier: string; optimize_view?: boolean }): Promise<any> {
    this.validateFoundryState();

    try {
      // Find the target scene by ID or name
      const scenesRaw = game.scenes?.contents;
      const scenes = Array.isArray(scenesRaw) ? scenesRaw : [];
      const targetScene = scenes.find(scene => {
        if (!scene || typeof scene !== 'object') {
          return false;
        }

        const candidate = scene as {
          id?: string;
          name?: string;
        };

        return (
          candidate.id === options.scene_identifier ||
          candidate.name?.toLowerCase() === options.scene_identifier.toLowerCase()
        );
      });

      if (!targetScene) {
        throw new Error(`Scene not found: "${options.scene_identifier}"`);
      }

      const sceneDoc = targetScene as {
        id?: string;
        name?: string;
        activate: () => Promise<unknown>;
        dimensions?: { width?: number; height?: number };
        width?: number;
        height?: number;
      };

      // Activate the scene
      await sceneDoc.activate();

      // Optimize view if requested (default true)
      if (options.optimize_view !== false && typeof canvas !== 'undefined' && canvas?.scene) {
        const sceneWithDimensions = sceneDoc as {
          dimensions?: { width?: number; height?: number };
          width?: number;
          height?: number;
        };
        const dimensions = sceneWithDimensions.dimensions ?? {
          width: sceneWithDimensions.width ?? 0,
          height: sceneWithDimensions.height ?? 0,
        };
        const width = dimensions.width ?? 0;
        const height = dimensions.height ?? 0;

        const sceneCanvas = canvas as unknown as {
          screenDimensions?: [number, number];
          pan: (options: { x: number; y: number; scale: number }) => Promise<unknown>;
        };

        if (width && height) {
          // Center the view on the scene
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
        sceneId: sceneDoc.id,
        sceneName: sceneDoc.name,
        dimensions: {
          width: sceneDoc.dimensions?.width ?? sceneDoc.width ?? 0,
          height: sceneDoc.dimensions?.height ?? sceneDoc.height ?? 0,
        },
      };
    } catch (error) {
      throw new Error(
        `Failed to switch scene: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  // ===== PHASE 7: CHARACTER ENTITY AND TOKEN MANIPULATION METHODS =====

  /**
   * Get detailed information about a specific entity within a character (item, action, or effect)
   */
  getCharacterEntity(data: {
    characterIdentifier: string;
    entityIdentifier: string;
  }): Record<string, unknown> {
    this.validateFoundryState();

    try {
      // Find the character first
      const actorsRaw = game.actors?.contents;
      const actors = Array.isArray(actorsRaw) ? actorsRaw : [];
      const character = actors.find(actor => {
        if (!actor || typeof actor !== 'object') {
          return false;
        }

        const candidate = actor as { id?: string; name?: string };
        return (
          candidate.id === data.characterIdentifier ||
          candidate.name?.toLowerCase() === data.characterIdentifier.toLowerCase()
        );
      });

      if (!character) {
        throw new Error(`Character not found: "${data.characterIdentifier}"`);
      }

      // Search in items first (by ID or name)
      const itemsRaw = (character as { items?: { contents?: unknown[] } }).items?.contents;
      const items = Array.isArray(itemsRaw) ? itemsRaw : [];
      let entity = items.find(item => {
        if (!item || typeof item !== 'object') {
          return false;
        }

        const candidate = item as { id?: string; name?: string };
        return (
          candidate.id === data.entityIdentifier ||
          candidate.name?.toLowerCase() === data.entityIdentifier.toLowerCase()
        );
      });

      if (entity) {
        const itemEntity = entity as {
          id?: string;
          name?: string;
          type?: string;
          img?: string;
          system?: unknown;
        };

        const itemSystem = itemEntity.system as
          | { description?: { value?: string } | string }
          | undefined;

        return {
          success: true,
          entityType: 'item',
          entity: {
            id: itemEntity.id,
            name: itemEntity.name,
            type: itemEntity.type,
            img: itemEntity.img,
            description:
              itemSystem?.description && typeof itemSystem.description === 'object'
                ? (itemSystem.description.value ?? '')
                : (itemSystem?.description ?? ''),
            system: itemEntity.system,
          },
        };
      }

      // Search in actions (for systems that have actions as separate entities)
      const characterSystem = (character as { system?: { actions?: unknown } }).system;
      if (characterSystem?.actions) {
        const actions = Array.isArray(characterSystem.actions)
          ? characterSystem.actions
          : Object.values(
              typeof characterSystem.actions === 'object' ? characterSystem.actions : {}
            );

        entity = actions.find(action => {
          if (!action || typeof action !== 'object') {
            return false;
          }

          const candidate = action as { id?: string; name?: string };
          return (
            candidate.id === data.entityIdentifier ||
            candidate.name?.toLowerCase() === data.entityIdentifier.toLowerCase()
          );
        });

        if (entity) {
          return {
            success: true,
            entityType: 'action',
            entity: entity as Record<string, unknown>,
          };
        }
      }

      // Search in effects
      const effectsRaw = (character as { effects?: { contents?: unknown[] } }).effects?.contents;
      const effects = Array.isArray(effectsRaw) ? effectsRaw : [];
      entity = effects.find(effect => {
        if (!effect || typeof effect !== 'object') {
          return false;
        }

        const candidate = effect as { id?: string; name?: string };
        return (
          candidate.id === data.entityIdentifier ||
          candidate.name?.toLowerCase() === data.entityIdentifier.toLowerCase()
        );
      });

      if (entity) {
        const effectEntity = entity as {
          id?: string;
          name?: string;
          label?: string;
          icon?: string;
          disabled?: boolean;
          duration?: unknown;
          changes?: unknown;
        };

        return {
          success: true,
          entityType: 'effect',
          entity: {
            id: effectEntity.id,
            name: effectEntity.name || effectEntity.label,
            icon: effectEntity.icon,
            disabled: effectEntity.disabled,
            duration: effectEntity.duration,
            changes: effectEntity.changes,
          },
        };
      }

      throw new Error(
        `Entity not found: "${data.entityIdentifier}" in character "${character.name}"`
      );
    } catch (error) {
      throw new Error(
        `Failed to get character entity: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Move a token to a new position on the scene
   */
  async moveToken(data: {
    tokenId: string;
    x: number;
    y: number;
    animate?: boolean;
  }): Promise<any> {
    this.validateFoundryState();

    // Use permission system
    const permissionCheck = permissionManager.checkWritePermission('modifyScene', {
      targetIds: [data.tokenId],
    });

    if (!permissionCheck.allowed) {
      throw new Error(`${ERROR_MESSAGES.ACCESS_DENIED}: ${permissionCheck.reason}`);
    }

    try {
      const scene = (game.scenes as any).current;
      if (!scene) {
        throw new Error('No active scene found');
      }

      const token = scene.tokens.get(data.tokenId);
      if (!token) {
        throw new Error(`Token ${data.tokenId} not found in current scene`);
      }

      // Update token position
      await token.update(
        {
          x: data.x,
          y: data.y,
        },
        { animate: data.animate !== false }
      );

      this.auditLog('moveToken', data, 'success');

      return {
        success: true,
        tokenId: token.id,
        tokenName: token.name,
        newPosition: { x: data.x, y: data.y },
        animated: data.animate !== false,
      };
    } catch (error) {
      this.auditLog(
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

  /**
   * Update token properties
   */
  async updateToken(data: { tokenId: string; updates: Record<string, any> }): Promise<any> {
    this.validateFoundryState();

    // Use permission system
    const permissionCheck = permissionManager.checkWritePermission('modifyScene', {
      targetIds: [data.tokenId],
    });

    if (!permissionCheck.allowed) {
      throw new Error(`${ERROR_MESSAGES.ACCESS_DENIED}: ${permissionCheck.reason}`);
    }

    try {
      const scene = (game.scenes as any).current;
      if (!scene) {
        throw new Error('No active scene found');
      }

      const token = scene.tokens.get(data.tokenId);
      if (!token) {
        throw new Error(`Token ${data.tokenId} not found in current scene`);
      }

      // Filter out undefined values
      const cleanUpdates = Object.fromEntries(
        Object.entries(data.updates).filter(([_, v]) => v !== undefined)
      );

      // Apply updates
      await token.update(cleanUpdates);

      this.auditLog('updateToken', { tokenId: data.tokenId, updates: cleanUpdates }, 'success');

      return {
        success: true,
        tokenId: token.id,
        tokenName: token.name,
        updatedProperties: Object.keys(cleanUpdates),
      };
    } catch (error) {
      this.auditLog(
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

  /**
   * Delete one or more tokens from the scene
   */
  async deleteTokens(data: { tokenIds: string[] }): Promise<any> {
    this.validateFoundryState();

    // Use permission system
    const permissionCheck = permissionManager.checkWritePermission('modifyScene', {
      targetIds: data.tokenIds,
    });

    if (!permissionCheck.allowed) {
      throw new Error(`${ERROR_MESSAGES.ACCESS_DENIED}: ${permissionCheck.reason}`);
    }

    try {
      const scene = (game.scenes as any).current;
      if (!scene) {
        throw new Error('No active scene found');
      }

      const deletedTokens: string[] = [];
      const failedTokens: string[] = [];

      for (const tokenId of data.tokenIds) {
        try {
          const token = scene.tokens.get(tokenId);
          if (token) {
            await token.delete();
            deletedTokens.push(tokenId);
          } else {
            failedTokens.push(tokenId);
          }
        } catch (error) {
          failedTokens.push(tokenId);
        }
      }

      this.auditLog(
        'deleteTokens',
        { tokenIds: data.tokenIds, deletedCount: deletedTokens.length },
        'success'
      );

      return {
        success: true,
        deletedCount: deletedTokens.length,
        deletedTokens,
        failedTokens: failedTokens.length > 0 ? failedTokens : undefined,
      };
    } catch (error) {
      this.auditLog(
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

  /**
   * Get detailed information about a token
   */
  async getTokenDetails(data: { tokenId: string }): Promise<Record<string, unknown>> {
    this.validateFoundryState();

    try {
      const scenes = game.scenes as unknown as { current?: SceneWithTokensLike };
      const scene = scenes.current;
      if (!scene) {
        throw new Error('No active scene found');
      }

      const token = scene.tokens.get(data.tokenId);
      if (!token) {
        throw new Error(`Token ${data.tokenId} not found in current scene`);
      }

      // Return flat structure that matches MCP server expectations
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

  /**
   * Toggle a status condition on a token
   */
  async toggleTokenCondition(data: {
    tokenId: string;
    conditionId: string;
    active: boolean;
  }): Promise<Record<string, unknown>> {
    this.validateFoundryState();

    // Use permission system
    const permissionCheck = permissionManager.checkWritePermission('modifyScene', {
      targetIds: [data.tokenId],
    });

    if (!permissionCheck.allowed) {
      throw new Error(`${ERROR_MESSAGES.ACCESS_DENIED}: ${permissionCheck.reason}`);
    }

    try {
      const scenes = game.scenes as unknown as { current?: SceneWithTokensLike };
      const scene = scenes.current;
      if (!scene) {
        throw new Error('No active scene found');
      }

      const token = scene.tokens.get(data.tokenId);
      if (!token) {
        throw new Error(`Token ${data.tokenId} not found in current scene`);
      }

      const actor = token.actor;
      if (!actor) {
        throw new Error(`Token ${data.tokenId} has no associated actor`);
      }

      // Get the condition configuration for the game system
      const configWithEffects = CONFIG as unknown as { statusEffects?: unknown };
      const conditions = Array.isArray(configWithEffects.statusEffects)
        ? (configWithEffects.statusEffects as unknown[])
        : [];
      const condition = conditions.find((c): c is ConditionLike => {
        if (!c || typeof c !== 'object') {
          return false;
        }

        const candidate = c as ConditionLike;
        const conditionId = candidate.id;
        const conditionName = candidate.name;
        return (
          conditionId === data.conditionId ||
          conditionName?.toLowerCase() === data.conditionId.toLowerCase()
        );
      });

      if (!condition) {
        throw new Error(`Condition not found: ${data.conditionId}`);
      }

      if (data.active) {
        // Add the condition - handle DSA5 and other systems
        const effectData: Record<string, unknown> = {
          name: condition.name || condition.label || condition.id,
          icon: condition.icon || condition.img,
        };

        // Add statuses for systems that support it (D&D5e, PF2e)
        if (condition.id) {
          effectData.statuses = [condition.id];
        }

        // DSA5-specific: Copy all properties from the condition
        // DSA5 conditions have different structure than D&D5e/PF2e
        const gameSystem = game.system as unknown as { id?: string };
        if (gameSystem.id === 'dsa5') {
          // For DSA5, use the condition's full data structure
          Object.assign(effectData, {
            flags: condition.flags || {},
            changes: condition.changes || [],
            duration: condition.duration || {},
            origin: condition.origin,
          });
        }

        await actor.createEmbeddedDocuments('ActiveEffect', [effectData]);
      } else {
        // Remove the condition
        const effectsRaw = actor.effects?.contents;
        const effects = Array.isArray(effectsRaw) ? effectsRaw : [];
        const effectsToRemove = effects.filter(effect => {
          if (!effect || typeof effect !== 'object') {
            return false;
          }

          const activeEffect = effect as ActiveEffectLike;
          // Check by status (D&D5e, PF2e)
          if (activeEffect.statuses?.has(data.conditionId)) {
            return true;
          }
          // Check by name (fallback for all systems including DSA5)
          if (activeEffect.name?.toLowerCase() === data.conditionId.toLowerCase()) {
            return true;
          }
          // Check by label (some systems use label instead of name)
          if (activeEffect.label?.toLowerCase() === data.conditionId.toLowerCase()) {
            return true;
          }
          return false;
        });

        if (effectsToRemove.length > 0) {
          const ids = effectsToRemove
            .map(effect => (effect as ActiveEffectLike).id)
            .filter((id): id is string => typeof id === 'string' && id.length > 0);

          if (ids.length > 0) {
            await actor.deleteEmbeddedDocuments('ActiveEffect', ids);
          }
        }
      }

      this.auditLog('toggleTokenCondition', data, 'success');

      return {
        success: true,
        tokenId: token.id,
        tokenName: token.name,
        conditionId: data.conditionId,
        conditionName: condition.name || condition.label || condition.id,
        isActive: data.active,
        active: data.active,
        message: data.active
          ? `Applied ${data.conditionId} to ${token.name}`
          : `Removed ${data.conditionId} from ${token.name}`,
      };
    } catch (error) {
      this.auditLog(
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

  /**
   * Get all available conditions for the current game system
   */
  async getAvailableConditions(): Promise<Record<string, unknown>> {
    this.validateFoundryState();

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
            name: condition.name || condition.label || condition.id,
            icon: condition.icon || condition.img,
            description: condition.description || '',
          })),
      };
    } catch (error) {
      throw new Error(
        `Failed to get available conditions: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
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
    this.validateFoundryState();

    const { actorIdentifier, itemIdentifier, targets, options = {} } = params;

    // Find the actor
    const actor = this.findActorByIdentifier(actorIdentifier);
    if (!actor) {
      throw new Error(`Actor not found: ${actorIdentifier}`);
    }

    // Find the item on the actor
    const actorItems = Array.isArray(actor.items)
      ? actor.items
      : actor.items &&
          typeof actor.items === 'object' &&
          Array.isArray((actor.items as { contents?: unknown[] }).contents)
        ? ((actor.items as { contents?: unknown[] }).contents ?? [])
        : [];

    const item = actorItems.find(i => {
      if (!i || typeof i !== 'object') return false;
      const candidate = i as { id?: string; name?: string };
      return (
        candidate.id === itemIdentifier ||
        (typeof candidate.name === 'string' &&
          candidate.name.toLowerCase() === itemIdentifier.toLowerCase())
      );
    });

    if (!item) {
      throw new Error(`Item "${itemIdentifier}" not found on actor "${actor.name}"`);
    }

    const itemAny = item;
    const systemId = (game.system as any).id;

    // Handle targeting if targets are specified
    const resolvedTargetNames: string[] = [];
    if (targets && targets.length > 0) {
      // Get all tokens on the current scene
      const scene = (game.scenes as any)?.active;
      if (!scene) {
        throw new Error('No active scene to find targets on');
      }

      const sceneTokens = scene.tokens;
      const tokenIds: string[] = [];

      for (const targetIdentifier of targets) {
        // Handle "self" - target the caster's token
        if (targetIdentifier.toLowerCase() === 'self') {
          // Find token for the caster actor
          const selfToken = sceneTokens.find(
            (t: any) => t.actor?.id === actor.id || t.actorId === actor.id
          );
          if (selfToken) {
            tokenIds.push(selfToken.id);
            resolvedTargetNames.push(actor.name ?? 'Unknown');
          } else {
            console.warn(
              `[foundry-mcp-bridge] No token found on scene for actor "${actor.name}" (self)`
            );
          }
          continue;
        }

        // Find token by name or ID
        const targetToken = sceneTokens.find(
          (t: any) =>
            t.id === targetIdentifier ||
            t.name?.toLowerCase() === targetIdentifier.toLowerCase() ||
            t.actor?.name?.toLowerCase() === targetIdentifier.toLowerCase()
        );

        if (targetToken) {
          tokenIds.push(targetToken.id);
          resolvedTargetNames.push(targetToken.name || targetToken.actor?.name || targetIdentifier);
        } else {
          console.warn(`[foundry-mcp-bridge] Target not found: "${targetIdentifier}"`);
        }
      }

      // Set targets using Foundry's targeting system
      if (tokenIds.length > 0 && game.user) {
        await (game.user as any).updateTokenTargets(tokenIds);
      }
    }

    try {
      // For items that may show dialogs (spells with choices, etc.),
      // we fire-and-forget to avoid timeout issues. The GM will interact
      // with the dialog in Foundry, and the result appears in chat.

      // Check if item has a use() method (common in D&D 5e, PF2e)
      if (typeof itemAny.use === 'function') {
        // D&D 5e and similar systems
        // Only pass options that D&D 5e's item.use() expects
        const useOptions: Record<string, any> = {
          createMessage: true,
        };

        // D&D 5e specific options
        if (systemId === 'dnd5e') {
          useOptions.consumeResource = options.consume ?? true;
          useOptions.consumeSpellSlot = options.consume ?? true;
          useOptions.consumeUsage = options.consume ?? true;
          // Always show dialog so GM can make choices
          useOptions.configureDialog = true;
        }

        // Spell level for upcasting
        if (options.spellLevel !== undefined) {
          useOptions.slotLevel = options.spellLevel; // D&D 5e
          useOptions.level = options.spellLevel; // generic
        }

        // Fire and forget - don't await, as dialogs block the promise
        itemAny.use(useOptions).catch((err: Error) => {
          console.error(`[foundry-mcp-bridge] Error using item ${item.name}:`, err);
        });
      } else if (typeof itemAny.toChat === 'function') {
        // PF2e and some other systems use toChat
        if (typeof itemAny.toMessage === 'function') {
          itemAny.toMessage(undefined, { create: true }).catch((err: Error) => {
            console.error(`[foundry-mcp-bridge] Error using item ${item.name}:`, err);
          });
        } else {
          itemAny.toChat().catch((err: Error) => {
            console.error(`[foundry-mcp-bridge] Error using item ${item.name}:`, err);
          });
        }
      } else if (typeof itemAny.roll === 'function') {
        // Some items have a roll method
        itemAny.roll().catch((err: Error) => {
          console.error(`[foundry-mcp-bridge] Error using item ${item.name}:`, err);
        });
      } else if (systemId === 'dsa5') {
        // DSA5 specific handling
        if (
          item.type === 'spell' ||
          item.type === 'liturgy' ||
          item.type === 'ceremony' ||
          item.type === 'ritual'
        ) {
          if (typeof itemAny.postItem === 'function') {
            itemAny.postItem().catch((err: Error) => {
              console.error(`[foundry-mcp-bridge] Error using item ${item.name}:`, err);
            });
          } else if (typeof itemAny.setupEffect === 'function') {
            itemAny.setupEffect().catch((err: Error) => {
              console.error(`[foundry-mcp-bridge] Error using item ${item.name}:`, err);
            });
          } else {
            // Fallback: create a chat message describing the item
            const chatData = {
              user: game.user?.id,
              speaker: ChatMessage.getSpeaker({ actor }),
              content: `<h3>${item.name}</h3><p>${actor.name} uses ${item.name}.</p>`,
            };
            ChatMessage.create(chatData);
          }
        } else {
          if (typeof itemAny.postItem === 'function') {
            itemAny.postItem().catch((err: Error) => {
              console.error(`[foundry-mcp-bridge] Error using item ${item.name}:`, err);
            });
          }
        }
      } else {
        // Generic fallback: create a chat message
        const chatData = {
          user: game.user?.id,
          speaker: ChatMessage.getSpeaker({ actor }),
          content: `<h3>${item.name}</h3><p>${actor.name} uses ${item.name}.</p>`,
        };
        ChatMessage.create(chatData);
      }

      this.auditLog(
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
      this.auditLog(
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
  /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await, @typescript-eslint/prefer-nullish-coalescing */
}
