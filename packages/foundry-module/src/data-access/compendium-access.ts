import {
  type CompendiumPackLike as BuilderCompendiumPackLike,
  type EnhancedCreatureIndex,
  getCreatureIndexBuilder,
  type PackFingerprint,
  type PF2eCreatureIndex,
} from './creature-index-builders.js';
import type {
  FoundryActiveEffectDocumentBase,
  FoundryCompendiumEntryFull,
  FoundryItemDocumentBase,
  UnknownRecord,
} from '@foundry-mcp/shared';

export interface CompendiumSearchResult {
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

export type CompendiumSearchFilters = {
  challengeRating?: number | { min?: number; max?: number };
  creatureType?: string;
  size?: string;
  alignment?: string;
  hasLegendaryActions?: boolean;
  spellcaster?: boolean;
};

interface IndexTextSearchCriteria {
  searchTerms?: string[];
  excludeTerms?: string[];
  size?: string;
  hasSpells?: boolean;
  hasLegendaryActions?: boolean;
}

export type CreatureSearchCriteria = CompendiumSearchFilters & {
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

export type CreatureSearchResponse = {
  creatures: CreatureSearchResult[];
  searchSummary: CreatureSearchSummary;
};

interface SearchableCompendiumPackIndexLike {
  size?: number;
  values: () => Iterable<unknown>;
}

interface SearchableCompendiumPackLike extends BuilderCompendiumPackLike {
  metadata: BuilderCompendiumPackLike['metadata'] & { type?: string };
  index?: SearchableCompendiumPackIndexLike;
  getDocument?: (id: string) => Promise<unknown>;
}

interface PackCollectionLike {
  values: () => Iterable<unknown>;
  get: (id: string) => unknown;
}

interface PersistentIndexMetadata {
  version: string;
  timestamp: number;
  packFingerprints: Map<string, PackFingerprint>;
  totalCreatures: number;
  gameSystem: string;
}

interface PersistentEnhancedIndex {
  metadata: PersistentIndexMetadata;
  creatures: EnhancedCreatureIndex[];
}

type CreatureSystemLike = {
  details?: {
    cr?: { value?: number | string } | number | string;
    type?: { value?: string } | string;
    alignment?: string;
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

type CompendiumEntryFull = FoundryCompendiumEntryFull<
  Record<string, unknown>,
  Record<string, unknown>,
  Record<string, unknown>
>;

type CompendiumItem = FoundryItemDocumentBase<Record<string, unknown>>;
type CompendiumEffect = FoundryActiveEffectDocumentBase<Record<string, unknown>>;

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

  const dndCreature = creature;
  return {
    id: dndCreature.id,
    name: dndCreature.name,
    type: dndCreature.type,
    pack: dndCreature.pack,
    packLabel: dndCreature.packLabel,
    description: dndCreature.description ?? '',
    hasImage: Boolean(dndCreature.img),
    summary: `CR ${dndCreature.challengeRating} ${dndCreature.creatureType} from ${dndCreature.packLabel}`,
    challengeRating: dndCreature.challengeRating,
    creatureType: dndCreature.creatureType,
    size: dndCreature.size,
    hitPoints: dndCreature.hitPoints,
    armorClass: dndCreature.armorClass,
    hasSpells: dndCreature.hasSpells,
    alignment: dndCreature.alignment,
    hasLegendaryActions: dndCreature.hasLegendaryActions,
  };
}

function isCompendiumPackLike(pack: unknown): pack is SearchableCompendiumPackLike {
  if (!pack || typeof pack !== 'object') {
    return false;
  }

  const typedPack = pack as Partial<SearchableCompendiumPackLike>;
  const metadata = typedPack.metadata;
  return Boolean(
    metadata &&
      typeof metadata.id === 'string' &&
      typeof metadata.label === 'string' &&
      typeof typedPack.getDocuments === 'function' &&
      typeof typedPack.getIndex === 'function'
  );
}

function createCompendiumEffect(data: {
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

class PersistentCreatureIndex {
  private readonly INDEX_VERSION = '1.0.0';
  private readonly INDEX_FILENAME = 'enhanced-creature-index.json';
  private buildInProgress = false;
  private hooksRegistered = false;

  constructor(private readonly moduleId: string) {
    this.registerFoundryHooks();
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

  private getActorPacks(): SearchableCompendiumPackLike[] {
    const packCollection = this.getPackCollection();
    if (!packCollection) {
      return [];
    }

    return Array.from(packCollection.values()).filter(
      (pack): pack is SearchableCompendiumPackLike =>
        isCompendiumPackLike(pack) && pack.metadata.type === 'Actor'
    );
  }

  private getIndexFilePath(): string {
    return `worlds/${game.world.id}/${this.INDEX_FILENAME}`;
  }

  async getEnhancedIndex(): Promise<EnhancedCreatureIndex[]> {
    const existingIndex = await this.loadPersistedIndex();

    if (existingIndex && this.isIndexValid(existingIndex)) {
      return existingIndex.creatures;
    }

    return this.buildEnhancedIndex();
  }

  async rebuildIndex(): Promise<EnhancedCreatureIndex[]> {
    return this.buildEnhancedIndex(true);
  }

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
      } catch {
        return null;
      }

      if (!fileExists) {
        return null;
      }

      const response = await fetch(filePath);
      if (!response.ok) {
        console.warn(`[${this.moduleId}] Failed to load index file: ${response.status}`);
        return null;
      }

      const rawData = (await response.json()) as unknown;
      if (!rawData || typeof rawData !== 'object') {
        return null;
      }

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

      const saveData = {
        ...index,
        metadata: {
          ...index.metadata,
          packFingerprints: Array.from(index.metadata.packFingerprints.entries()),
        },
      };

      const jsonContent = JSON.stringify(saveData, null, 2);
      const file = new File([jsonContent], this.INDEX_FILENAME, { type: 'application/json' });
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

  private isIndexValid(existingIndex: PersistentEnhancedIndex): boolean {
    if (existingIndex.metadata.version !== this.INDEX_VERSION) {
      return false;
    }

    if (existingIndex.metadata.gameSystem !== game.system.id) {
      return false;
    }

    const actorPacks = this.getActorPacks();
    for (const pack of actorPacks) {
      const currentFingerprint = this.generatePackFingerprint(pack);
      const savedFingerprint = existingIndex.metadata.packFingerprints.get(pack.metadata.id);

      if (!savedFingerprint || !this.fingerprintsMatch(currentFingerprint, savedFingerprint)) {
        return false;
      }
    }

    const packCollection = this.getPackCollection();
    for (const [packId] of existingIndex.metadata.packFingerprints) {
      if (!packCollection?.get(packId)) {
        return false;
      }
    }

    return true;
  }

  private registerFoundryHooks(): void {
    if (this.hooksRegistered) {
      return;
    }

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

  private async invalidateIndex(): Promise<void> {
    try {
      const autoRebuild = Boolean(game.settings.get(this.moduleId, 'autoRebuildIndex'));
      if (!autoRebuild) {
        return;
      }

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
          await fetch(filePath, { method: 'DELETE' });
        }
      } catch {
        return;
      }
    } catch (error) {
      console.warn(`[${this.moduleId}] Failed to invalidate index:`, error);
    }
  }

  private generatePackFingerprint(pack: BuilderCompendiumPackLike): PackFingerprint {
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

  private generatePackChecksum(pack: BuilderCompendiumPackLike): string {
    const data = `${pack.metadata.id}-${pack.metadata.label}-${pack.index?.size ?? 0}`;
    return btoa(data).slice(0, 16);
  }

  private fingerprintsMatch(current: PackFingerprint, saved: PackFingerprint): boolean {
    return current.documentCount === saved.documentCount && current.checksum === saved.checksum;
  }

  private async buildEnhancedIndex(force = false): Promise<EnhancedCreatureIndex[]> {
    if (this.buildInProgress && !force) {
      throw new Error('Index build already in progress');
    }

    const gameSystem = (game as { system?: { id?: string } }).system?.id ?? '';
    this.buildInProgress = true;

    try {
      const actorPacks = this.getActorPacks();
      const startTime = Date.now();
      const buildCreatureIndex = getCreatureIndexBuilder(gameSystem);
      const buildResult = buildCreatureIndex
        ? await buildCreatureIndex(this.moduleId, actorPacks, pack =>
            this.generatePackFingerprint(pack)
          )
        : null;

      if (!buildResult) {
        throw new Error(
          `Enhanced creature index not supported for system: ${gameSystem}. Only D&D 5e and Pathfinder 2e are currently supported.`
        );
      }

      ui.notifications?.info(
        `Saving ${buildResult.systemId.toUpperCase()} index to world database... (${buildResult.creatures.length} creatures)`
      );

      await this.savePersistedIndex({
        metadata: {
          version: this.INDEX_VERSION,
          timestamp: Date.now(),
          packFingerprints: buildResult.packFingerprints,
          totalCreatures: buildResult.creatures.length,
          gameSystem: buildResult.systemId,
        },
        creatures: buildResult.creatures,
      });

      const buildTimeSeconds = Math.round((Date.now() - startTime) / 1000);
      const errorText =
        buildResult.totalErrors > 0 ? ` (${buildResult.totalErrors} extraction errors)` : '';
      ui.notifications?.info(
        `${buildResult.systemId.toUpperCase()} creature index complete! ${buildResult.creatures.length} creatures indexed from ${actorPacks.length} packs in ${buildTimeSeconds}s${errorText}`
      );

      return buildResult.creatures;
    } finally {
      this.buildInProgress = false;
    }
  }
}

export interface CompendiumAccessContext {
  moduleId: string;
  sanitizeData(data: unknown): unknown;
}

export class FoundryCompendiumAccess {
  private readonly persistentIndex: PersistentCreatureIndex;

  constructor(private readonly context: CompendiumAccessContext) {
    this.persistentIndex = new PersistentCreatureIndex(context.moduleId);
  }

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
      console.error(`[${this.context.moduleId}] Failed to rebuild enhanced creature index:`, error);
      return {
        success: false,
        totalCreatures: 0,
        message: `Failed to rebuild index: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  async getEnhancedCreatureIndex(): Promise<Record<string, unknown>[]> {
    const enhancedCreatures = await this.persistentIndex.getEnhancedIndex();
    return Array.isArray(enhancedCreatures)
      ? (enhancedCreatures as unknown as Record<string, unknown>[])
      : [];
  }

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
        game.settings.get(this.context.moduleId, 'enableEnhancedCreatureIndex') === true;

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
            `[${this.context.moduleId}] Enhanced search failed, falling back to basic search:`,
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

    const packs = Array.from(packCollection.values()).filter(
      (pack): pack is SearchableCompendiumPackLike => {
        if (!isCompendiumPackLike(pack)) {
          return false;
        }
        if (packType && pack.metadata.type !== packType) {
          return false;
        }
        return pack.metadata.type !== 'Scene';
      }
    );

    for (const pack of packs) {
      try {
        if (!pack.indexed) {
          await pack.getIndex({});
        }

        const entriesToSearch =
          pack.index && typeof pack.index.values === 'function'
            ? Array.from(pack.index.values())
            : [];

        for (const entry of entriesToSearch) {
          try {
            const typedEntry = toCompendiumIndexEntry(entry);
            if (!typedEntry?.name?.trim()) {
              continue;
            }

            const entryNameLower = typedEntry.name.toLowerCase();
            if (!searchTerms.every(term => entryNameLower.includes(term))) {
              continue;
            }

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
          } catch (entryError) {
            console.warn(
              `[${this.context.moduleId}] Error processing entry in pack ${pack.metadata.id}:`,
              entryError
            );
          }

          if (results.length >= 100) {
            break;
          }
        }
      } catch (error) {
        console.warn(
          `[${this.context.moduleId}] Failed to search pack ${pack.metadata.id}:`,
          error
        );
      }

      if (results.length >= 100) {
        break;
      }
    }

    results.sort((a, b) => {
      const aExact = a.name.toLowerCase() === cleanQuery;
      const bExact = b.name.toLowerCase() === cleanQuery;
      if (aExact !== bExact) {
        return aExact ? -1 : 1;
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

  async listCreaturesByCriteria(criteria: CreatureSearchCriteria): Promise<CreatureSearchResponse> {
    const limit = criteria.limit ?? 500;
    const enhancedIndexEnabled =
      game.settings.get(this.context.moduleId, 'enableEnhancedCreatureIndex') === true;

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
        return powerA !== powerB ? powerA - powerB : a.name.localeCompare(b.name);
      });

      if (filteredCreatures.length > limit) {
        filteredCreatures = filteredCreatures.slice(0, limit);
      }

      const results = filteredCreatures.map(toCreatureSearchResult);
      const packResults = new Map<string, number>();
      results.forEach(creature => {
        packResults.set(creature.packLabel, (packResults.get(creature.packLabel) ?? 0) + 1);
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
      console.error(`[${this.context.moduleId}] Enhanced creature search failed:`, error);
      return this.fallbackBasicCreatureSearch(criteria, limit);
    }
  }

  async getCompendiumDocumentFull(
    packId: string,
    documentId: string
  ): Promise<CompendiumEntryFull> {
    const packCollection = game.packs as { get: (id: string) => unknown } | null | undefined;
    const pack = packCollection ? packCollection.get(packId) : null;
    if (!pack) {
      throw new Error(`Compendium pack ${packId} not found`);
    }

    const typedPack = pack as {
      metadata?: { label?: string };
      getDocument: (id: string) => Promise<unknown>;
    };

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

    const fullEntry: CompendiumEntryFull = {
      id: typedDocument.id ?? '',
      name: typedDocument.name ?? '',
      type: typedDocument.type ?? 'unknown',
      ...(typedDocument.img ? { img: typedDocument.img } : {}),
      pack: packId,
      packLabel: typedPack.metadata?.label ?? '',
      system: this.context.sanitizeData(
        typedDocument.system && typeof typedDocument.system === 'object' ? typedDocument.system : {}
      ) as Record<string, unknown>,
      fullData: this.context.sanitizeData(typedDocument.toObject()) as Record<string, unknown>,
    };

    if (typedDocument.items) {
      const items = Array.from(typedDocument.items)
        .filter((item): item is EmbeddedItemLike => Boolean(item && typeof item === 'object'))
        .map(item => {
          const mappedItem: CompendiumItem = {
            id: item.id ?? '',
            name: item.name ?? '',
            type: item.type ?? 'unknown',
            system: this.context.sanitizeData(
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

    if (typedDocument.effects) {
      fullEntry.effects = Array.from(typedDocument.effects)
        .filter((effect): effect is EmbeddedEffectLike =>
          Boolean(effect && typeof effect === 'object')
        )
        .map(effect =>
          createCompendiumEffect({
            id: effect.id ?? '',
            name: effect.name ?? effect.label ?? 'Unknown Effect',
            disabled: effect.disabled ?? false,
            duration: this.context.sanitizeData(
              effect.duration && typeof effect.duration === 'object' ? effect.duration : {}
            ) as Record<string, unknown>,
            ...(effect.icon ? { icon: effect.icon } : {}),
          })
        );
    }

    return fullEntry;
  }

  private shouldApplyFilters(
    entry: CompendiumIndexEntry,
    filters: CompendiumSearchFilters
  ): boolean {
    if (!['npc', 'character', 'creature'].includes(entry.type ?? '')) {
      return false;
    }

    return hasCompendiumFilters(filters);
  }

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
        if (min !== undefined && max !== undefined && entryCR >= min && entryCR <= max) {
          score += 10;
          const rangeMid = (min + max) / 2;
          const distFromMid = Math.abs(entryCR - rangeMid);
          score += Math.max(0, 5 - distFromMid);
        }
      }
    }

    const lowerName = entry.name.toLowerCase();
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
    if (commonNames.some(name => lowerName.includes(name))) {
      score += 5;
    }

    for (const term of query.toLowerCase().split(' ')) {
      if (term.length > 2 && lowerName.includes(term)) {
        score += 3;
      }
    }

    return score;
  }

  private passesEnhancedCriteria(
    creature: EnhancedCreatureIndex,
    criteria: CreatureSearchCriteria
  ): boolean {
    return isPF2eCreatureIndex(creature)
      ? this.passesPF2eCriteria(creature, criteria)
      : this.passesDnD5eCriteria(creature, criteria);
  }

  private passesDnD5eCriteria(
    creature: Exclude<EnhancedCreatureIndex, PF2eCreatureIndex>,
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
    if (
      criteria.hasLegendaryActions !== undefined &&
      creature.hasLegendaryActions !== criteria.hasLegendaryActions
    ) {
      return false;
    }

    return true;
  }

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

  private async fallbackBasicCreatureSearch(
    criteria: CreatureSearchCriteria,
    limit: number
  ): Promise<CreatureSearchResponse> {
    console.warn(
      `[${this.context.moduleId}] Falling back to basic search due to enhanced index failure`
    );

    const searchTerms: string[] = [];
    if (criteria.creatureType) {
      searchTerms.push(criteria.creatureType);
    }

    if (typeof criteria.challengeRating === 'number') {
      if (criteria.challengeRating >= 15) {
        searchTerms.push('ancient', 'legendary');
      } else if (criteria.challengeRating >= 10) {
        searchTerms.push('adult', 'champion');
      } else if (criteria.challengeRating >= 5) {
        searchTerms.push('captain', 'knight');
      }
    }

    const basicResults = await this.searchCompendium(searchTerms.join(' ') || 'monster', 'Actor');
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

  private matchesSearchCriteria(entry: unknown, criteria: IndexTextSearchCriteria): boolean {
    const entryRecord =
      entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : {};
    const name = typeof entryRecord.name === 'string' ? entryRecord.name.toLowerCase() : '';
    const description =
      typeof entryRecord.description === 'string' ? entryRecord.description.toLowerCase() : '';
    const searchText = `${name} ${description}`;

    if (criteria.searchTerms && criteria.searchTerms.length > 0) {
      const hasMatch = criteria.searchTerms.some(term => searchText.includes(term.toLowerCase()));
      if (!hasMatch) {
        return false;
      }
    }

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
}
