import type {
  FoundryActorSystemBase,
  FoundryCompendiumEntryFull,
  FoundryCompendiumSearchResult,
  FoundryCreatureSearchResult,
  FoundryDescriptionField,
  FoundryPriceData,
  FoundryTraitsData,
  UnknownRecord,
} from '../../foundry-types.js';
import { Logger } from '../../logger.js';
import type { SystemAdapter } from '../../systems/types.js';
import type { GameSystem } from '../../utils/system-detection.js';

interface CompendiumEntitySystem extends FoundryActorSystemBase {
  description?: string | FoundryDescriptionField;
  traits?: FoundryTraitsData;
  size?: string;
  alignment?: string;
  cr?: number;
  level?: number;
  school?: string;
  components?: unknown;
  duration?: unknown;
  range?: unknown;
  damage?: { parts?: Array<[string, string]> };
  armor?: { value?: number };
  weaponType?: string;
  properties?: unknown;
  stealth?: unknown;
  rarity?: unknown;
  price?: FoundryPriceData;
  weight?: unknown;
  quantity?: number;
  abilities?: Record<string, { value?: number }>;
  resources?: { legact?: unknown; legres?: { value?: number } };
  legendary?: unknown;
  spells?: unknown;
  type?: { value?: string };
  hp?: { value?: number; max?: number };
  ac?: { value?: number };
}

type CompendiumSearchEntity = FoundryCompendiumSearchResult<CompendiumEntitySystem>;
type CompendiumFullEntity = FoundryCompendiumEntryFull<
  CompendiumEntitySystem,
  UnknownRecord,
  UnknownRecord
>;
type CreatureSearchEntity = FoundryCreatureSearchResult<CompendiumEntitySystem>;

const toRecord = (value: unknown): UnknownRecord =>
  value !== null && typeof value === 'object' ? (value as UnknownRecord) : {};

export interface CompendiumFormattingServiceOptions {
  logger: Logger;
  getSystemAdapter: (gameSystem: GameSystem) => SystemAdapter | null;
}

export class CompendiumFormattingService {
  private logger: Logger;
  private getSystemAdapter: (gameSystem: GameSystem) => SystemAdapter | null;

  constructor(options: CompendiumFormattingServiceOptions) {
    this.logger = options.logger.child({ component: 'CompendiumFormattingService' });
    this.getSystemAdapter = options.getSystemAdapter;
  }

  formatWithAdapter(
    adapter: SystemAdapter,
    entity: CompendiumSearchEntity | CompendiumFullEntity | CreatureSearchEntity,
    mode: 'search' | 'criteria' | 'compact' | 'details'
  ): Record<string, unknown> {
    this.logger.debug('Formatting compendium entity with system adapter', { mode });
    return adapter.formatRawCompendiumCreature(entity, mode);
  }

  formatCompendiumItem(
    item: CompendiumSearchEntity,
    gameSystem?: GameSystem
  ): Record<string, unknown> {
    const formatted: Record<string, unknown> = {
      id: item.id,
      name: item.name,
      type: item.type,
      pack: {
        id: item.pack,
        label: item.packLabel,
      },
      description: this.extractDescription(item),
      hasImage: !!item.img,
      summary: this.createItemSummary(item),
    };

    if ((item.type === 'npc' || item.type === 'character') && gameSystem) {
      const adapter = this.getSystemAdapter(gameSystem);
      if (adapter) {
        Object.assign(formatted, this.formatWithAdapter(adapter, item, 'search'));
      }
    }

    return formatted;
  }

  extractDescription(item: CompendiumSearchEntity | CompendiumFullEntity): string {
    if (
      'description' in item &&
      typeof item.description === 'string' &&
      item.description.trim().length > 0
    ) {
      return this.truncateText(this.stripHtml(item.description), 200);
    }

    const system = item.system ?? {};
    const description = this.getSystemDescription(system);
    return this.truncateText(this.stripHtml(description), 200);
  }

  extractFullDescription(item: CompendiumFullEntity): string {
    const system = item.system ?? {};
    const description = this.getSystemDescription(system);
    return this.stripHtml(description);
  }

  formatCreatureListItem(
    creature: CreatureSearchEntity,
    gameSystem?: GameSystem
  ): Record<string, unknown> {
    const formatted: Record<string, unknown> = {
      name: creature.name,
      id: creature.id,
      pack: { id: creature.pack, label: creature.packLabel },
    };

    if (gameSystem) {
      const adapter = this.getSystemAdapter(gameSystem);
      if (adapter) {
        Object.assign(formatted, this.formatWithAdapter(adapter, creature, 'criteria'));
      }
    }

    return formatted;
  }

  extractItemProperties(item: CompendiumFullEntity): Record<string, unknown> {
    const system = item.system ?? {};
    const properties: Record<string, unknown> = {};

    if (system.rarity) properties.rarity = system.rarity;
    if (system.price) properties.price = system.price;
    if (system.weight) properties.weight = system.weight;
    if (system.quantity) properties.quantity = system.quantity;

    if ((item.type ?? '').toLowerCase() === 'spell') {
      if (system.level !== undefined) properties.spellLevel = system.level;
      if (system.school) properties.school = system.school;
      if (system.components) properties.components = system.components;
      if (system.duration) properties.duration = system.duration;
      if (system.range) properties.range = system.range;
    }

    if ((item.type ?? '').toLowerCase() === 'weapon') {
      if (system.damage) properties.damage = system.damage;
      if (system.weaponType) properties.weaponType = system.weaponType;
      if (system.properties) properties.weaponProperties = system.properties;
    }

    if ((item.type ?? '').toLowerCase() === 'armor') {
      if (system.armor) properties.armorClass = system.armor;
      if (system.stealth) properties.stealthDisadvantage = system.stealth;
    }

    return properties;
  }

  sanitizeSystemData(systemData: unknown): UnknownRecord {
    const sanitized = { ...toRecord(systemData) };

    delete sanitized.description;
    delete sanitized.details;
    delete sanitized._id;
    delete sanitized.folder;
    delete sanitized.sort;
    delete sanitized.ownership;

    return sanitized;
  }

  private createItemSummary(item: CompendiumSearchEntity | CompendiumFullEntity): string {
    if ('summary' in item && typeof item.summary === 'string' && item.summary.trim().length > 0) {
      return item.summary;
    }

    const parts = [];
    parts.push(`${item.type ?? 'unknown'} from ${item.packLabel ?? 'unknown pack'}`);

    const system = item.system ?? {};
    switch ((item.type ?? '').toLowerCase()) {
      case 'spell':
        if (system.level) parts.push(`Level ${system.level}`);
        if (system.school) parts.push(system.school);
        break;
      case 'weapon':
        if (system.damage?.parts?.length) {
          const damage = system.damage.parts[0];
          parts.push(`${damage[0]} ${damage[1]} damage`);
        }
        break;
      case 'armor':
        if (system.armor?.value) parts.push(`AC ${system.armor.value}`);
        break;
      case 'equipment':
      case 'item':
        if (system.rarity) parts.push(system.rarity);
        if (typeof system.price === 'object' && system.price !== null) {
          const price = system.price as { value?: number | string; denomination?: string };
          if (price.value !== undefined) {
            parts.push(`${price.value} ${price.denomination ?? 'gp'}`);
          }
        }
        break;
    }

    return parts.join(' • ');
  }

  private getSystemDescription(system: CompendiumEntitySystem): string {
    const description = system.description;
    if (typeof description === 'string') {
      return description;
    }
    if (description && typeof description === 'object') {
      return description.value ?? description.content ?? '';
    }
    return system.details?.description ?? '';
  }

  private stripHtml(text: unknown): string {
    if (!text) return '';

    let normalized: string;

    if (Array.isArray(text)) {
      return text.map(item => this.stripHtml(item)).join(' ');
    }

    if (typeof text === 'object' && text !== null) {
      const record = text as UnknownRecord;
      if (typeof record.value === 'string') {
        normalized = record.value;
      } else if (typeof record.content === 'string') {
        normalized = record.content;
      } else {
        try {
          normalized = JSON.stringify(text);
        } catch {
          return '';
        }
      }
    } else {
      normalized = String(text);
    }

    if (!normalized || normalized === '[object Object]') {
      return '';
    }

    return normalized.replace(/<[^>]*>/g, '').trim();
  }

  private truncateText(text: string, maxLength: number): string {
    if (!text || text.length <= maxLength) {
      return text;
    }

    return `${text.substring(0, maxLength - 3)}...`;
  }
}
