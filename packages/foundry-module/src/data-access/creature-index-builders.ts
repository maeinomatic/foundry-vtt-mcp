interface NotificationLike {
  remove: () => void;
}

interface CompendiumPackMetadataLike {
  id: string;
  label: string;
  type?: string;
  lastModified?: string | number | Date;
}

interface CompendiumPackIndexLike {
  size?: number;
}

export interface CompendiumPackLike {
  metadata: CompendiumPackMetadataLike;
  index?: CompendiumPackIndexLike;
  indexed?: boolean;
  getIndex: (options: Record<string, unknown>) => Promise<unknown>;
  getDocuments: () => Promise<unknown[]>;
}

interface CompendiumActorDocumentLike {
  _id: string;
  name: string;
  type: string;
  img?: string;
  system?: unknown;
}

export interface PackFingerprint {
  packId: string;
  packLabel: string;
  lastModified: number;
  documentCount: number;
  checksum: string;
}

export interface DnD5eCreatureIndex {
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

export interface PF2eCreatureIndex {
  id: string;
  name: string;
  type: string;
  pack: string;
  packLabel: string;
  level: number;
  traits: string[];
  creatureType: string;
  rarity: string;
  size: string;
  hitPoints: number;
  armorClass: number;
  hasSpells: boolean;
  alignment: string;
  description?: string;
  img?: string;
}

export type EnhancedCreatureIndex = DnD5eCreatureIndex | PF2eCreatureIndex;

export interface CreatureIndexBuildResult {
  creatures: EnhancedCreatureIndex[];
  packFingerprints: Map<string, PackFingerprint>;
  totalErrors: number;
  systemId: 'dnd5e' | 'pf2e';
}

function asNotification(value: unknown): NotificationLike | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Partial<NotificationLike>;
  return typeof candidate.remove === 'function' ? (candidate as NotificationLike) : null;
}

function isCompendiumActorDocumentLike(doc: unknown): doc is CompendiumActorDocumentLike {
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

function getPathValue(source: unknown, path: string[]): unknown {
  let current: unknown = source;

  for (const key of path) {
    if (!current || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }

  return current;
}

function firstDefined(values: unknown[], fallback: unknown): unknown {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }
  return fallback;
}

function toNumber(value: unknown, fallback: number): number {
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

function toStringValue(value: unknown, fallback: string): string {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  if (value === undefined || value === null) {
    return fallback;
  }
  return String(value);
}

function extractDnD5eCreatureData(
  moduleId: string,
  doc: CompendiumActorDocumentLike,
  pack: CompendiumPackLike
): { creature: DnD5eCreatureIndex; errors: number } {
  try {
    const system = doc.system ?? {};

    const challengeRating = toNumber(
      firstDefined(
        [
          getPathValue(system, ['details', 'cr']),
          getPathValue(system, ['details', 'cr', 'value']),
          getPathValue(system, ['cr', 'value']),
          getPathValue(system, ['cr']),
          getPathValue(system, ['attributes', 'cr', 'value']),
          getPathValue(system, ['attributes', 'cr']),
          getPathValue(system, ['challenge', 'rating']),
          getPathValue(system, ['challenge', 'cr']),
        ],
        0
      ),
      0
    );

    const creatureType = toStringValue(
      firstDefined(
        [
          getPathValue(system, ['details', 'type', 'value']),
          getPathValue(system, ['details', 'type']),
          getPathValue(system, ['type', 'value']),
          getPathValue(system, ['type']),
          getPathValue(system, ['race', 'value']),
          getPathValue(system, ['race']),
          getPathValue(system, ['details', 'race']),
        ],
        'unknown'
      ),
      'unknown'
    ).toLowerCase();

    const size = toStringValue(
      firstDefined(
        [
          getPathValue(system, ['traits', 'size', 'value']),
          getPathValue(system, ['traits', 'size']),
          getPathValue(system, ['size', 'value']),
          getPathValue(system, ['size']),
          getPathValue(system, ['details', 'size']),
        ],
        'medium'
      ),
      'medium'
    ).toLowerCase();

    const hitPoints = toNumber(
      firstDefined(
        [
          getPathValue(system, ['attributes', 'hp', 'max']),
          getPathValue(system, ['hp', 'max']),
          getPathValue(system, ['attributes', 'hp', 'value']),
          getPathValue(system, ['hp', 'value']),
          getPathValue(system, ['health', 'max']),
          getPathValue(system, ['health', 'value']),
        ],
        0
      ),
      0
    );

    const armorClass = toNumber(
      firstDefined(
        [
          getPathValue(system, ['attributes', 'ac', 'value']),
          getPathValue(system, ['ac', 'value']),
          getPathValue(system, ['attributes', 'ac']),
          getPathValue(system, ['ac']),
          getPathValue(system, ['armor', 'value']),
          getPathValue(system, ['armor']),
        ],
        10
      ),
      10
    );

    const alignment = toStringValue(
      firstDefined(
        [
          getPathValue(system, ['details', 'alignment', 'value']),
          getPathValue(system, ['details', 'alignment']),
          getPathValue(system, ['alignment', 'value']),
          getPathValue(system, ['alignment']),
        ],
        'unaligned'
      ),
      'unaligned'
    ).toLowerCase();

    const hasSpells =
      Boolean(getPathValue(system, ['spells'])) ||
      Boolean(getPathValue(system, ['attributes', 'spellcasting'])) ||
      toNumber(getPathValue(system, ['details', 'spellLevel']), 0) > 0 ||
      toNumber(getPathValue(system, ['resources', 'spell', 'max']), 0) > 0 ||
      Boolean(getPathValue(system, ['spellcasting'])) ||
      Boolean(getPathValue(system, ['traits', 'spellcasting'])) ||
      Boolean(getPathValue(system, ['details', 'spellcaster']));

    const hasLegendaryActions =
      Boolean(getPathValue(system, ['resources', 'legact'])) ||
      Boolean(getPathValue(system, ['legendary'])) ||
      toNumber(getPathValue(system, ['resources', 'legres', 'value']), 0) > 0 ||
      Boolean(getPathValue(system, ['details', 'legendary'])) ||
      Boolean(getPathValue(system, ['traits', 'legendary'])) ||
      toNumber(getPathValue(system, ['resources', 'legendary', 'max']), 0) > 0;

    return {
      creature: {
        id: doc._id,
        name: doc.name,
        type: doc.type,
        pack: pack.metadata.id,
        packLabel: pack.metadata.label,
        challengeRating,
        creatureType,
        size,
        hitPoints,
        armorClass,
        hasSpells,
        hasLegendaryActions,
        alignment,
        description: toStringValue(
          firstDefined(
            [getPathValue(system, ['details', 'biography']), getPathValue(system, ['description'])],
            ''
          ),
          ''
        ),
        ...(typeof doc.img === 'string' ? { img: doc.img } : {}),
      },
      errors: 0,
    };
  } catch (error) {
    console.warn(`[${moduleId}] Failed to extract enhanced data from ${doc.name}:`, error);
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

async function extractDnD5eDataFromPack(
  moduleId: string,
  pack: CompendiumPackLike
): Promise<{ creatures: DnD5eCreatureIndex[]; errors: number }> {
  const creatures: DnD5eCreatureIndex[] = [];
  let errors = 0;

  try {
    const documents = await pack.getDocuments();

    for (const doc of documents) {
      try {
        if (!isCompendiumActorDocumentLike(doc)) {
          continue;
        }

        if (doc.type !== 'npc' && doc.type !== 'character' && doc.type !== 'creature') {
          continue;
        }

        const result = extractDnD5eCreatureData(moduleId, doc, pack);
        creatures.push(result.creature);
        errors += result.errors;
      } catch (error) {
        console.warn(
          `[${moduleId}] Failed to extract data from ${doc && typeof doc === 'object' && 'name' in doc && typeof doc.name === 'string' ? doc.name : 'Unknown document'} in ${pack.metadata.label}:`,
          error
        );
        errors++;
      }
    }
  } catch (error) {
    console.warn(`[${moduleId}] Failed to load documents from ${pack.metadata.label}:`, error);
    errors++;
  }

  return { creatures, errors };
}

function extractPF2eCreatureData(
  moduleId: string,
  doc: CompendiumActorDocumentLike,
  pack: CompendiumPackLike
): { creature: PF2eCreatureIndex; errors: number } {
  try {
    const system = doc.system ?? {};
    const level = toNumber(getPathValue(system, ['details', 'level', 'value']), 0);
    const traitsValue = getPathValue(system, ['traits', 'value']);
    const traits = Array.isArray(traitsValue)
      ? traitsValue.filter((trait): trait is string => typeof trait === 'string')
      : [];

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
      traits.find(trait => creatureTraits.includes(trait.toLowerCase()))?.toLowerCase() ??
      'unknown';

    const rarity = toStringValue(getPathValue(system, ['traits', 'rarity']), 'common');
    const sizeCode = toStringValue(getPathValue(system, ['traits', 'size', 'value']), 'med');
    const sizeMap: Record<string, string> = {
      tiny: 'tiny',
      sm: 'small',
      med: 'medium',
      lg: 'large',
      huge: 'huge',
      grg: 'gargantuan',
    };
    const size = sizeMap[sizeCode.toLowerCase()] ?? 'medium';
    const hitPoints = toNumber(getPathValue(system, ['attributes', 'hp', 'max']), 0);
    const armorClass = toNumber(getPathValue(system, ['attributes', 'ac', 'value']), 10);
    const spellcasting = getPathValue(system, ['spellcasting']);
    const hasSpells =
      spellcasting && typeof spellcasting === 'object'
        ? Object.keys(spellcasting).length > 0
        : false;
    const alignment = toStringValue(getPathValue(system, ['details', 'alignment', 'value']), 'N');

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
        description: toStringValue(
          firstDefined(
            [
              getPathValue(system, ['details', 'publicNotes']),
              getPathValue(system, ['details', 'biography']),
            ],
            ''
          ),
          ''
        ),
        ...(typeof doc.img === 'string' ? { img: doc.img } : {}),
      },
      errors: 0,
    };
  } catch (error) {
    console.warn(`[${moduleId}] Failed to extract PF2e data from ${doc.name}:`, error);
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

async function extractPF2eDataFromPack(
  moduleId: string,
  pack: CompendiumPackLike
): Promise<{ creatures: PF2eCreatureIndex[]; errors: number }> {
  const creatures: PF2eCreatureIndex[] = [];
  let errors = 0;

  try {
    const documents = await pack.getDocuments();

    for (const doc of documents) {
      try {
        if (!isCompendiumActorDocumentLike(doc)) {
          continue;
        }

        if (doc.type !== 'npc' && doc.type !== 'character' && doc.type !== 'creature') {
          continue;
        }

        const result = extractPF2eCreatureData(moduleId, doc, pack);
        creatures.push(result.creature);
        errors += result.errors;
      } catch (error) {
        console.warn(
          `[${moduleId}] Failed to extract PF2e data from ${doc && typeof doc === 'object' && 'name' in doc && typeof doc.name === 'string' ? doc.name : 'Unknown document'} in ${pack.metadata.label}:`,
          error
        );
        errors++;
      }
    }
  } catch (error) {
    console.warn(`[${moduleId}] Failed to load documents from ${pack.metadata.label}:`, error);
    errors++;
  }

  return { creatures, errors };
}

export async function buildDnD5eCreatureIndex(
  moduleId: string,
  actorPacks: CompendiumPackLike[],
  generatePackFingerprint: (pack: CompendiumPackLike) => PackFingerprint
): Promise<CreatureIndexBuildResult> {
  let progressNotification: NotificationLike | null = null;
  let totalErrors = 0;
  const creatures: DnD5eCreatureIndex[] = [];
  const packFingerprints = new Map<string, PackFingerprint>();

  try {
    progressNotification = asNotification(
      ui.notifications?.info(
        `Starting enhanced creature index build from ${actorPacks.length} packs...`
      )
    );

    for (let i = 0; i < actorPacks.length; i++) {
      const pack = actorPacks[i];
      const progressPercent = Math.round((i / actorPacks.length) * 100);

      if (i % 3 === 0 || pack.metadata.label.toLowerCase().includes('monster')) {
        progressNotification?.remove();
        progressNotification = asNotification(
          ui.notifications?.info(
            `Building creature index... ${progressPercent}% (${i + 1}/${actorPacks.length}) Processing: ${pack.metadata.label}`
          )
        );
      }

      try {
        if (!pack.indexed) {
          await pack.getIndex({});
        }

        packFingerprints.set(pack.metadata.id, generatePackFingerprint(pack));

        if ((pack.index?.size ?? 0) > 50) {
          progressNotification?.remove();
          progressNotification = asNotification(
            ui.notifications?.info(
              `Processing large pack: ${pack.metadata.label} (${pack.index?.size ?? 0} documents)...`
            )
          );
        }

        const packResult = await extractDnD5eDataFromPack(moduleId, pack);
        creatures.push(...packResult.creatures);
        totalErrors += packResult.errors;

        if (i === 0 || (i + 1) % 5 === 0 || i === actorPacks.length - 1) {
          progressNotification?.remove();
          progressNotification = asNotification(
            ui.notifications?.info(
              `Index Progress: ${i + 1}/${actorPacks.length} packs complete, ${creatures.length} creatures indexed`
            )
          );
        }
      } catch (error) {
        console.warn(`[${moduleId}] Failed to process pack ${pack.metadata.label}:`, error);
        ui.notifications?.warn(
          `Warning: Failed to index pack "${pack.metadata.label}" - continuing with other packs`
        );
      }
    }

    return { creatures, packFingerprints, totalErrors, systemId: 'dnd5e' };
  } finally {
    progressNotification?.remove();
  }
}

export async function buildPF2eCreatureIndex(
  moduleId: string,
  actorPacks: CompendiumPackLike[],
  generatePackFingerprint: (pack: CompendiumPackLike) => PackFingerprint
): Promise<CreatureIndexBuildResult> {
  let progressNotification: NotificationLike | null = null;
  let totalErrors = 0;
  const creatures: PF2eCreatureIndex[] = [];
  const packFingerprints = new Map<string, PackFingerprint>();

  try {
    progressNotification = asNotification(
      ui.notifications?.info(
        `Starting PF2e creature index build from ${actorPacks.length} packs...`
      )
    );

    let currentPack = 0;
    for (const pack of actorPacks) {
      currentPack++;

      progressNotification?.remove();
      progressNotification = asNotification(
        ui.notifications?.info(
          `Building PF2e index: Pack ${currentPack}/${actorPacks.length} (${pack.metadata.label})...`
        )
      );

      packFingerprints.set(pack.metadata.id, generatePackFingerprint(pack));

      const packResult = await extractPF2eDataFromPack(moduleId, pack);
      creatures.push(...packResult.creatures);
      totalErrors += packResult.errors;
    }

    return { creatures, packFingerprints, totalErrors, systemId: 'pf2e' };
  } finally {
    progressNotification?.remove();
  }
}
