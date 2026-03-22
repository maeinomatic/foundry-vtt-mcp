import {
  BaseCharacterSystemHelper,
  type EnrichItemSearchMatchParams,
  type SpellcastingExtractionParams,
} from './base-character-system-helper.js';
import {
  createSpellInfo,
  createSpellcastingEntry,
  getActorItems,
  getActorSystem,
  isDnD5eClassItemDocument,
  isModuleSearchItemDocument,
  sortSpellInfo,
  type ModuleDnD5eActorSystemData,
  type ModuleDnD5eClassItemDocument,
  type ModuleDnD5eClassItemSystemData,
  type ModuleDnD5eItemSystemData,
  type ModuleSearchItemDocument,
  type SpellInfo,
  type SpellTargetingData,
  type SpellcastingEntry,
} from './character-system-types.js';

function extractDnD5eSpellSlots(
  spellsData: Record<string, { value?: number; max?: number }>
): Record<string, { value: number; max: number }> | undefined {
  const slots: Record<string, { value: number; max: number }> = {};

  for (let level = 1; level <= 9; level++) {
    const slotKey = `spell${level}`;
    const slotData = spellsData?.[slotKey];
    if (slotData && ((slotData.max ?? 0) > 0 || (slotData.value ?? 0) > 0)) {
      slots[`level${level}`] = {
        value: slotData.value ?? 0,
        max: slotData.max ?? 0,
      };
    }
  }

  const pactSlot = spellsData?.pact;
  if (pactSlot && ((pactSlot.max ?? 0) > 0 || (pactSlot.value ?? 0) > 0)) {
    slots.pact = {
      value: pactSlot.value ?? 0,
      max: pactSlot.max ?? 0,
    };
  }

  return Object.keys(slots).length > 0 ? slots : undefined;
}

function extractDnD5eSpellTargeting(
  spellSystem: ModuleDnD5eItemSystemData | undefined
): SpellTargetingData {
  const result: SpellTargetingData = {};

  const rangeValue = spellSystem?.range?.value;
  const rangeUnits = spellSystem?.range?.units;
  if (rangeUnits === 'self') {
    result.range = 'Self';
  } else if (rangeUnits === 'touch') {
    result.range = 'Touch';
  } else if (rangeUnits === 'spec') {
    result.range = spellSystem?.range?.special ?? 'Special';
  } else if (rangeValue && rangeUnits) {
    result.range = `${rangeValue} ${rangeUnits}`;
  }

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

  const areaType = spellSystem?.target?.template?.type;
  const areaSize = spellSystem?.target?.template?.size;
  const areaUnits = spellSystem?.target?.template?.units ?? 'ft';
  if (areaType && areaSize) {
    result.area = `${areaSize}-${areaUnits} ${areaType}`;
    if (!result.target || result.target === 'point') {
      result.target = 'area';
    }
  }

  return result;
}

export class Dnd5eCharacterSystemHelper extends BaseCharacterSystemHelper {
  override enrichItemSearchMatch(params: EnrichItemSearchMatchParams): void {
    if (params.itemType !== 'spell') {
      return;
    }

    const itemSystem = params.itemSystem as ModuleDnD5eItemSystemData | undefined;
    const targeting = extractDnD5eSpellTargeting(itemSystem);

    params.result.level = itemSystem?.level ?? 0;
    params.result.prepared = itemSystem?.preparation?.prepared ?? true;
    params.result.expended = false;
    if (targeting.range) params.result.range = targeting.range;
    if (targeting.target) params.result.target = targeting.target;
    if (targeting.area) params.result.area = targeting.area;
    if (itemSystem?.activation?.type) {
      params.result.actionCost = itemSystem.activation.type;
    }
  }

  override extractSpellcastingEntries(params: SpellcastingExtractionParams): SpellcastingEntry[] {
    const actorItems = getActorItems(params.actor);
    const actorSystem = getActorSystem<ModuleDnD5eActorSystemData>(params.actor) ?? {};
    const spellItems = actorItems.flatMap((item): ModuleSearchItemDocument[] => {
      const spellItem = ensureSpellItem(item);
      return spellItem ? [spellItem] : [];
    });
    const classes = actorItems.filter((item): item is ModuleDnD5eClassItemDocument =>
      isDnD5eClassItemDocument(item)
    );
    const spellSlots = actorSystem.spells ?? {};
    const spellsByClass: Record<string, SpellInfo[]> = {};
    const entries: SpellcastingEntry[] = [];

    for (const spell of spellItems) {
      const spellSystem = spell.system as ModuleDnD5eItemSystemData | undefined;
      const sourceClass = spellSystem?.sourceClass ?? 'general';

      if (!spellsByClass[sourceClass]) {
        spellsByClass[sourceClass] = [];
      }

      const targeting = extractDnD5eSpellTargeting(spellSystem);
      spellsByClass[sourceClass].push(
        createSpellInfo({
          id: spell.id,
          name: spell.name,
          level: spellSystem?.level ?? 0,
          prepared: spellSystem?.preparation?.prepared ?? true,
          traits: [],
          ...(spellSystem?.activation?.type ? { actionCost: spellSystem.activation.type } : {}),
          ...(targeting.range !== undefined ? { range: targeting.range } : {}),
          ...(targeting.target !== undefined ? { target: targeting.target } : {}),
          ...(targeting.area !== undefined ? { area: targeting.area } : {}),
        })
      );
    }

    for (const classItem of classes) {
      const classSystem = classItem.system as ModuleDnD5eClassItemSystemData | undefined;
      if (
        classSystem?.spellcasting?.progression &&
        classSystem.spellcasting.progression !== 'none'
      ) {
        const classSpells =
          spellsByClass[classItem.id] || spellsByClass[classItem.name.toLowerCase()] || [];
        const slots = extractDnD5eSpellSlots(spellSlots);

        entries.push(
          createSpellcastingEntry({
            id: classItem.id,
            name: `${classItem.name} Spellcasting`,
            type: classSystem.spellcasting.type ?? 'prepared',
            ...(classSystem.spellcasting.ability
              ? { ability: classSystem.spellcasting.ability }
              : {}),
            ...(slots !== undefined ? { slots } : {}),
            spells: sortSpellInfo(classSpells),
          })
        );
      }
    }

    if (entries.length === 0 && spellItems.length > 0) {
      const allSpells = spellItems.map(spell => {
        const spellSystem = spell.system as ModuleDnD5eItemSystemData | undefined;
        const targeting = extractDnD5eSpellTargeting(spellSystem);

        return createSpellInfo({
          id: spell.id,
          name: spell.name,
          level: spellSystem?.level ?? 0,
          prepared: spellSystem?.preparation?.prepared ?? true,
          ...(spellSystem?.activation?.type ? { actionCost: spellSystem.activation.type } : {}),
          ...(targeting.range !== undefined ? { range: targeting.range } : {}),
          ...(targeting.target !== undefined ? { target: targeting.target } : {}),
          ...(targeting.area !== undefined ? { area: targeting.area } : {}),
        });
      });

      const slots = extractDnD5eSpellSlots(spellSlots);
      entries.push(
        createSpellcastingEntry({
          id: 'spellcasting',
          name: 'Spellcasting',
          type: 'prepared',
          ...(slots !== undefined ? { slots } : {}),
          spells: sortSpellInfo(allSpells),
        })
      );
    }

    return entries;
  }
}

function ensureSpellItem(item: unknown): ModuleSearchItemDocument | undefined {
  return isModuleSearchItemDocument(item) && item.type === 'spell' ? item : undefined;
}

export const dnd5eCharacterSystemHelper = new Dnd5eCharacterSystemHelper();
