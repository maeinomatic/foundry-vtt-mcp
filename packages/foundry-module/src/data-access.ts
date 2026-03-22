import { MODULE_ID, ERROR_MESSAGES, TOKEN_DISPOSITIONS } from './constants.js';
import { permissionManager } from './permissions.js';
import { transactionManager } from './transaction-manager.js';
import { FoundryActorDirectoryAccess } from './data-access/actor-directory-access.js';
import { FoundryCharacterAccess } from './data-access/character-access.js';
import { getOrCreateFolder } from './data-access/folder-access.js';
import { FoundryJournalAccess } from './data-access/journal-access.js';
import { FoundrySceneInteractionAccess } from './data-access/scene-interaction-access.js';
import type {
  FoundryActorCreationResult,
  FoundryActiveEffectDocumentBase,
  FoundryCharacterInfo,
  FoundryCompendiumEntryFull,
  FoundryCreatedActorInfo,
  FoundryItemDocumentBase,
  FoundryJournalEntryResponse,
  FoundryJournalSummary,
  FoundryWorldDetails,
  UnknownRecord,
} from '@foundry-mcp/shared';

type CharacterInfo = FoundryCharacterInfo<UnknownRecord, UnknownRecord, UnknownRecord>;

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

interface CompendiumIndexEntry {
  _id?: string;
  name?: string;
  type?: string;
  img?: string;
  description?: string;
  system?: UnknownRecord;
}

type CompendiumSearchFilters = {
  challengeRating?: number | { min?: number; max?: number };
  creatureType?: string;
  size?: string;
  alignment?: string;
  hasLegendaryActions?: boolean;
  spellcaster?: boolean;
};

type IndexTextSearchCriteria = {
  searchTerms?: string[];
  excludeTerms?: string[];
  size?: string;
  hasSpells?: boolean;
  hasLegendaryActions?: boolean;
};

type CreatureSearchCriteria = CompendiumSearchFilters & {
  level?: number | { min?: number; max?: number };
  traits?: string[];
  rarity?: string;
  hasSpells?: boolean;
  limit?: number;
};

type CreatureSearchResult = CompendiumSearchResult &
  Partial<{
    level: number;
    traits: string[];
    rarity: string;
    challengeRating: number;
    hasLegendaryActions: boolean;
    creatureType: string;
    size: string;
    hitPoints: number;
    armorClass: number;
    hasSpells: boolean;
    alignment: string;
  }>;

type CreatureSearchSummary = {
  packsSearched: number;
  topPacks: Array<{ id: string; label: string; priority: number }>;
  totalCreaturesFound: number;
  resultsByPack: Record<string, number>;
  criteria: CreatureSearchCriteria;
  searchMethod: 'enhanced_persistent_index' | 'basic_fallback';
  fallback?: boolean;
  indexMetadata?: {
    totalIndexedCreatures: number;
    searchMethod: 'enhanced_persistent_index';
  };
};

type CreatureSearchResponse = {
  creatures: CreatureSearchResult[];
  searchSummary: CreatureSearchSummary;
};

type CreatureSystemLike = {
  details?: {
    cr?: { value?: number | string } | number | string;
    type?: { value?: string } | string;
    alignment?: string;
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
  alignment?: string;
};

function toCompendiumIndexEntry(entry: unknown): CompendiumIndexEntry | null {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    return null;
  }

  const record = entry as UnknownRecord;
  const system = record.system;

  return {
    ...(typeof record._id === 'string' ? { _id: record._id } : {}),
    ...(typeof record.name === 'string' ? { name: record.name } : {}),
    ...(typeof record.type === 'string' ? { type: record.type } : {}),
    ...(typeof record.img === 'string' ? { img: record.img } : {}),
    ...(typeof record.description === 'string' ? { description: record.description } : {}),
    ...(system && typeof system === 'object' && !Array.isArray(system)
      ? { system: system as UnknownRecord }
      : {}),
  };
}

function toCreatureSystemLike(system: UnknownRecord | undefined): CreatureSystemLike {
  return (system ?? {}) as CreatureSystemLike;
}

function getCreatureChallengeRating(system: CreatureSystemLike): number {
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
  const challengeRating = detailsCr ?? systemCr ?? 0;

  if (typeof challengeRating === 'number') {
    return challengeRating;
  }

  if (typeof challengeRating === 'string') {
    if (challengeRating === '1/8') return 0.125;
    if (challengeRating === '1/4') return 0.25;
    if (challengeRating === '1/2') return 0.5;

    const parsed = parseFloat(challengeRating);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function getCreatureType(system: CreatureSystemLike): string {
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

  const creatureType = detailsType ?? systemType;
  return typeof creatureType === 'string' ? creatureType : '';
}

function hasCompendiumFilters(
  filters: CompendiumSearchFilters | undefined
): filters is CompendiumSearchFilters {
  return (
    filters !== undefined &&
    [
      filters.challengeRating,
      filters.creatureType,
      filters.size,
      filters.alignment,
      filters.hasLegendaryActions,
      filters.spellcaster,
    ].some(value => value !== undefined)
  );
}

function buildIndexTextSearchCriteria(filters: CompendiumSearchFilters): IndexTextSearchCriteria {
  const searchTerms: string[] = [];

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

  if (filters.creatureType) {
    searchTerms.push(filters.creatureType);

    if (filters.creatureType.toLowerCase() === 'humanoid') {
      searchTerms.push('human', 'elf', 'dwarf', 'orc', 'goblin');
    }
  }

  return searchTerms.length > 0 ? { searchTerms } : {};
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

function isPF2eCreatureIndex(creature: EnhancedCreatureIndex): creature is PF2eCreatureIndex {
  return 'level' in creature;
}

function toCreatureSearchResult(creature: EnhancedCreatureIndex): CreatureSearchResult {
  if (isPF2eCreatureIndex(creature)) {
    return {
      id: creature.id,
      name: creature.name,
      type: creature.type,
      pack: creature.pack,
      packLabel: creature.packLabel,
      description: creature.description ?? '',
      hasImage: Boolean(creature.img),
      summary: `Level ${creature.level} ${creature.creatureType} (${creature.rarity}) from ${creature.packLabel}`,
      level: creature.level,
      traits: creature.traits,
      rarity: creature.rarity,
      creatureType: creature.creatureType,
      size: creature.size,
      hitPoints: creature.hitPoints,
      armorClass: creature.armorClass,
      hasSpells: creature.hasSpells,
      alignment: creature.alignment,
    };
  }

  return {
    id: creature.id,
    name: creature.name,
    type: creature.type,
    pack: creature.pack,
    packLabel: creature.packLabel,
    description: creature.description ?? '',
    hasImage: Boolean(creature.img),
    summary: `CR ${creature.challengeRating} ${creature.creatureType} from ${creature.packLabel}`,
    challengeRating: creature.challengeRating,
    creatureType: creature.creatureType,
    size: creature.size,
    hitPoints: creature.hitPoints,
    armorClass: creature.armorClass,
    hasSpells: creature.hasSpells,
    alignment: creature.alignment,
    hasLegendaryActions: creature.hasLegendaryActions,
  };
}

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

interface CompendiumPackIndexLike {
  size?: number;
  values: () => Iterable<unknown>;
}

interface CompendiumPackLike {
  metadata: CompendiumPackMetadataLike;
  index?: CompendiumPackIndexLike;
  indexed?: boolean;
  getIndex: (options: Record<string, unknown>) => Promise<unknown>;
  getDocuments: () => Promise<unknown[]>;
}

interface PackCollectionLike {
  values: () => Iterable<unknown>;
  get: (id: string) => unknown;
}

function isCompendiumPackLike(pack: unknown): pack is CompendiumPackLike {
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

// Phase 2: Write Operation Interfaces
interface ActorCreationRequest {
  creatureType: string;
  customNames?: string[] | undefined;
  packPreference?: string | undefined;
  quantity?: number | undefined;
  addToScene?: boolean | undefined;
}

type ActorCreationResult = FoundryActorCreationResult;

type CreatedActorInfo = FoundryCreatedActorInfo;

type CompendiumEntryFull = FoundryCompendiumEntryFull<
  Record<string, unknown>,
  Record<string, unknown>,
  Record<string, unknown>
>;

type CompendiumItem = FoundryItemDocumentBase<Record<string, unknown>>;

type CompendiumEffect = FoundryActiveEffectDocumentBase<Record<string, unknown>>;

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
    return isCompendiumPackLike(pack);
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
  private actorDirectoryAccess: FoundryActorDirectoryAccess;
  private characterAccess: FoundryCharacterAccess;
  private journalAccess: FoundryJournalAccess;
  private sceneInteractionAccess: FoundrySceneInteractionAccess;

  constructor() {
    this.actorDirectoryAccess = new FoundryActorDirectoryAccess({
      validateFoundryState: (): void => this.validateFoundryState(),
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

  private createCreatedActorInfo(data: {
    id: string;
    name: string;
    originalName: string;
    type: string;
    sourcePackId: string;
    sourcePackLabel: string;
    img?: string;
  }): CreatedActorInfo {
    return {
      id: data.id,
      name: data.name,
      originalName: data.originalName,
      type: data.type,
      sourcePackId: data.sourcePackId,
      sourcePackLabel: data.sourcePackLabel,
      ...(data.img ? { img: data.img } : {}),
    };
  }

  private createCompendiumEffect(data: {
    id: string;
    name: string;
    disabled: boolean;
    duration?: Record<string, unknown>;
    icon?: string;
  }): CompendiumEffect {
    return {
      id: data.id,
      name: data.name,
      type: 'ActiveEffect',
      disabled: data.disabled,
      ...(data.duration ? { duration: data.duration } : {}),
      ...(data.icon ? { icon: data.icon } : {}),
    };
  }

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
    if (!query || typeof query !== 'string' || query.trim().length < 2) {
      throw new Error('Search query must be a string with at least 2 characters');
    }

    const cleanQuery = query.toLowerCase().trim();
    const searchTerms = cleanQuery.split(' ').filter(term => term.length > 0);

    if (searchTerms.length === 0) {
      throw new Error('Search query must contain valid search terms');
    }

    if (
      hasCompendiumFilters(filters) &&
      packType === 'Actor' &&
      [
        filters.challengeRating,
        filters.creatureType,
        filters.size,
        filters.hasLegendaryActions,
        filters.spellcaster,
      ].some(value => value !== undefined)
    ) {
      const enhancedIndexEnabled =
        game.settings.get(this.moduleId, 'enableEnhancedCreatureIndex') === true;

      if (enhancedIndexEnabled) {
        try {
          const criteria: CreatureSearchCriteria = {
            limit: 100,
            ...(filters.challengeRating !== undefined
              ? { challengeRating: filters.challengeRating }
              : {}),
            ...(filters.creatureType ? { creatureType: filters.creatureType } : {}),
            ...(filters.size ? { size: filters.size } : {}),
            ...(filters.hasLegendaryActions !== undefined
              ? { hasLegendaryActions: filters.hasLegendaryActions }
              : {}),
            ...(filters.spellcaster !== undefined ? { hasSpells: filters.spellcaster } : {}),
          };

          const enhancedResult = await this.listCreaturesByCriteria(criteria);

          return enhancedResult.creatures
            .filter(creature => this.matchesSearchCriteria(creature, { searchTerms }))
            .slice(0, 50);
        } catch (error) {
          console.warn(
            `[${this.moduleId}] Enhanced search failed, falling back to basic search:`,
            error
          );
        }
      }
    }

    const results: CompendiumSearchResult[] = [];
    const packsSource = (game as { packs?: unknown }).packs;
    const packCollection =
      packsSource &&
      typeof packsSource === 'object' &&
      typeof (packsSource as Partial<PackCollectionLike>).values === 'function' &&
      typeof (packsSource as Partial<PackCollectionLike>).get === 'function'
        ? (packsSource as PackCollectionLike)
        : null;

    if (!packCollection) {
      return results;
    }

    const packEntries = Array.from(packCollection.values());
    const packs = packEntries.filter((pack): pack is CompendiumPackLike => {
      if (!isCompendiumPackLike(pack)) {
        return false;
      }
      if (packType && pack.metadata.type !== packType) {
        return false;
      }
      return pack.metadata.type !== 'Scene';
    });

    for (const pack of packs) {
      try {
        if (!pack.indexed) {
          await pack.getIndex({});
        }

        const packIndex = pack.index;
        if (!packIndex || typeof packIndex.values !== 'function') {
          continue;
        }

        const entriesToSearch = Array.from(packIndex.values());

        for (const entry of entriesToSearch) {
          try {
            const typedEntry = toCompendiumIndexEntry(entry);
            if (!typedEntry?.name?.trim()) {
              continue;
            }

            const entryNameLower = typedEntry.name.toLowerCase();
            const nameMatch = searchTerms.every(term => entryNameLower.includes(term));

            if (nameMatch) {
              if (
                hasCompendiumFilters(filters) &&
                this.shouldApplyFilters(typedEntry, filters) &&
                pack.metadata.type === 'Actor'
              ) {
                const searchCriteria = buildIndexTextSearchCriteria(filters);
                if (!this.matchesSearchCriteria(typedEntry, searchCriteria)) {
                  continue;
                }
              }

              results.push({
                id: typedEntry._id ?? '',
                name: typedEntry.name,
                type: typedEntry.type ?? 'unknown',
                ...(typedEntry.img ? { img: typedEntry.img } : {}),
                pack: pack.metadata.id,
                packLabel: pack.metadata.label,
                ...(typedEntry.system ? { system: typedEntry.system } : {}),
                description: typedEntry.description ?? '',
                hasImage: Boolean(typedEntry.img),
                summary: `${typedEntry.type ?? 'unknown'} from ${pack.metadata.label}`,
              });
            }
          } catch (entryError) {
            console.warn(
              `[${this.moduleId}] Error processing entry in pack ${pack.metadata.id}:`,
              entryError
            );
            continue;
          }

          if (results.length >= 100) {
            break;
          }
        }
      } catch (error) {
        console.warn(`[${this.moduleId}] Failed to search pack ${pack.metadata.id}:`, error);
      }

      if (results.length >= 100) {
        break;
      }
    }

    results.sort((a, b) => {
      const aExact = a.name.toLowerCase() === cleanQuery;
      const bExact = b.name.toLowerCase() === cleanQuery;
      if (aExact && !bExact) {
        return -1;
      }
      if (!aExact && bExact) {
        return 1;
      }

      if (hasCompendiumFilters(filters)) {
        const aScore = this.calculateRelevanceScore(a, filters, query);
        const bScore = this.calculateRelevanceScore(b, filters, query);
        if (aScore !== bScore) {
          return bScore - aScore;
        }
      }

      return a.name.localeCompare(b.name);
    });

    return results.slice(0, 50);
  }

  /**
   * Check if filters should be applied to this entry
   */
  private shouldApplyFilters(
    entry: CompendiumIndexEntry,
    filters: CompendiumSearchFilters
  ): boolean {
    if (!['npc', 'character', 'creature'].includes(entry.type ?? '')) {
      return false;
    }

    return hasCompendiumFilters(filters);
  }

  /**
   * Calculate relevance score for search result ranking
   */
  private calculateRelevanceScore(
    entry: CompendiumSearchResult,
    filters: CompendiumSearchFilters,
    query: string
  ): number {
    let score = 0;
    const system = toCreatureSystemLike(entry.system);

    if (filters.creatureType) {
      const entryType = getCreatureType(system);
      if (entryType.toLowerCase() === filters.creatureType.toLowerCase()) {
        score += 20;
      }
    }

    if (filters.challengeRating !== undefined) {
      const entryCR = getCreatureChallengeRating(system);
      if (typeof filters.challengeRating === 'number') {
        if (entryCR === filters.challengeRating) {
          score += 15;
        }
      } else if (typeof filters.challengeRating === 'object') {
        const { min, max } = filters.challengeRating;
        if (min !== undefined && max !== undefined) {
          if (entryCR >= min && entryCR <= max) {
            score += 10;
            const rangeMid = (min + max) / 2;
            const distFromMid = Math.abs(entryCR - rangeMid);
            score += Math.max(0, 5 - distFromMid);
          }
        }
      }
    }

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
  async listCreaturesByCriteria(criteria: CreatureSearchCriteria): Promise<CreatureSearchResponse> {
    const limit = criteria.limit ?? 500;

    const enhancedIndexEnabled =
      game.settings.get(this.moduleId, 'enableEnhancedCreatureIndex') === true;

    if (!enhancedIndexEnabled) {
      return this.fallbackBasicCreatureSearch(criteria, limit);
    }

    try {
      const enhancedCreatures = await this.persistentIndex.getEnhancedIndex();
      let filteredCreatures = enhancedCreatures.filter(creature =>
        this.passesEnhancedCriteria(creature, criteria)
      );

      filteredCreatures.sort((a, b) => {
        const powerA = isPF2eCreatureIndex(a) ? a.level : a.challengeRating;
        const powerB = isPF2eCreatureIndex(b) ? b.level : b.challengeRating;

        if (powerA !== powerB) {
          return powerA - powerB;
        }
        return a.name.localeCompare(b.name);
      });

      if (filteredCreatures.length > limit) {
        filteredCreatures = filteredCreatures.slice(0, limit);
      }

      const results = filteredCreatures.map(toCreatureSearchResult);
      const packResults = new Map<string, number>();
      results.forEach(creature => {
        const count = packResults.get(creature.packLabel) ?? 0;
        packResults.set(creature.packLabel, count + 1);
      });

      const uniquePacks = Array.from(new Set(enhancedCreatures.map(creature => creature.pack)));
      const topPacks = uniquePacks.slice(0, 5).map(packId => {
        const sampleCreature = enhancedCreatures.find(c => c.pack === packId);
        return {
          id: packId,
          label: sampleCreature?.packLabel ?? 'Unknown Pack',
          priority: 100,
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
          searchMethod: 'enhanced_persistent_index',
          indexMetadata: {
            totalIndexedCreatures: enhancedCreatures.length,
            searchMethod: 'enhanced_persistent_index',
          },
        },
      };
    } catch (error) {
      console.error(`[${this.moduleId}] Enhanced creature search failed:`, error);
      return this.fallbackBasicCreatureSearch(criteria, limit);
    }
  }

  /**
   * Check if enhanced creature passes all specified criteria (system-aware routing)
   */
  private passesEnhancedCriteria(
    creature: EnhancedCreatureIndex,
    criteria: CreatureSearchCriteria
  ): boolean {
    if (isPF2eCreatureIndex(creature)) {
      return this.passesPF2eCriteria(creature, criteria);
    }

    return this.passesDnD5eCriteria(creature, criteria);
  }

  /**
   * Check if D&D 5e creature passes all specified criteria
   */
  private passesDnD5eCriteria(
    creature: DnD5eCreatureIndex,
    criteria: CreatureSearchCriteria
  ): boolean {
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

    if (criteria.creatureType) {
      if (creature.creatureType.toLowerCase() !== criteria.creatureType.toLowerCase()) {
        return false;
      }
    }

    if (criteria.size) {
      if (creature.size.toLowerCase() !== criteria.size.toLowerCase()) {
        return false;
      }
    }

    if (criteria.hasSpells !== undefined) {
      if (creature.hasSpells !== criteria.hasSpells) {
        return false;
      }
    }

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
    criteria: CreatureSearchCriteria
  ): boolean {
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

    if (criteria.traits && criteria.traits.length > 0) {
      const hasAllTraits = criteria.traits.every(requiredTrait =>
        creature.traits.some(t => t.toLowerCase() === requiredTrait.toLowerCase())
      );
      if (!hasAllTraits) {
        return false;
      }
    }

    if (criteria.rarity && creature.rarity !== criteria.rarity) {
      return false;
    }

    if (
      criteria.creatureType &&
      creature.creatureType.toLowerCase() !== criteria.creatureType.toLowerCase()
    ) {
      return false;
    }

    if (criteria.size && creature.size.toLowerCase() !== criteria.size.toLowerCase()) {
      return false;
    }

    if (criteria.hasSpells !== undefined && creature.hasSpells !== criteria.hasSpells) {
      return false;
    }

    return true;
  }

  /**
   * Fallback to basic creature search if enhanced index fails
   */
  private async fallbackBasicCreatureSearch(
    criteria: CreatureSearchCriteria,
    limit: number
  ): Promise<CreatureSearchResponse> {
    console.warn(`[${this.moduleId}] Falling back to basic search due to enhanced index failure`);

    const searchTerms: string[] = [];

    if (criteria.creatureType) {
      searchTerms.push(criteria.creatureType);
    }

    if (criteria.challengeRating) {
      if (typeof criteria.challengeRating === 'number') {
        if (criteria.challengeRating >= 15) {
          searchTerms.push('ancient', 'legendary');
        } else if (criteria.challengeRating >= 10) {
          searchTerms.push('adult', 'champion');
        } else if (criteria.challengeRating >= 5) {
          searchTerms.push('captain', 'knight');
        }
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
   * Simple name/description-based matching for creatures using index data only
   */
  private matchesSearchCriteria(entry: unknown, criteria: IndexTextSearchCriteria): boolean {
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

          createdActors.push(
            this.createCreatedActorInfo({
              id: actorId,
              name: newActor.name ?? customName,
              originalName: sourceDoc.name,
              type: newActor.type ?? 'unknown',
              sourcePackId: compendiumEntry.pack,
              sourcePackLabel: compendiumEntry.packLabel,
              ...(typeof (newActor as { img?: unknown }).img === 'string'
                ? { img: (newActor as { img: string }).img }
                : {}),
            })
          );
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
          const folderId = await getOrCreateFolder(this.moduleId, 'Foundry MCP Creatures', 'Actor');
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

          createdActors.push(
            this.createCreatedActorInfo({
              id: newActor.id ?? '',
              name: newActor.name ?? customName,
              originalName: sourceActorName,
              type: sourceDocument.type ?? 'unknown',
              sourcePackId: packId,
              sourcePackLabel: typedPack.metadata?.label ?? '',
            })
          );
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
        ...(errors.length > 0 ? { errors } : {}),
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
          return this.createCompendiumEffect({
            id: effect.id ?? '',
            name: effect.name ?? effect.label ?? 'Unknown Effect',
            disabled: effect.disabled ?? false,
            duration: this.sanitizeData(
              effect.duration && typeof effect.duration === 'object' ? effect.duration : {}
            ) as Record<string, unknown>,
            ...(effect.icon ? { icon: effect.icon } : {}),
          });
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
      const folderId = await getOrCreateFolder(this.moduleId, 'Foundry MCP Creatures', 'Actor');
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
