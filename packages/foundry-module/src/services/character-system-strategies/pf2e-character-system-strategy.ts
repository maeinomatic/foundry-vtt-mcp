import {
  BaseCharacterSystemStrategy,
  type EnrichItemSearchMatchParams,
  type EnrichLooseActionSearchMatchParams,
  type SpellSearchFlagParams,
  type SpellcastingExtractionParams,
} from './base-character-system-strategy.js';
import {
  createSpellInfo,
  createSpellcastingEntry,
  getActorItemById,
  getActorItems,
  getNumberFromValueField,
  getPF2eLocationData,
  getStringFromValueField,
  isPF2eSpellcastingEntryDocument,
  isModuleSearchItemDocument,
  sortSpellInfo,
  toStringArray,
  type ModulePF2eActionData,
  type ModulePF2eItemSystemData,
  type ModulePF2eSpellCollectionValue,
  type ModulePF2eSpellcastingEntryDocument,
  type ModulePF2eSpellcastingSystemData,
  type ModuleSearchItemDocument,
  type SpellSearchFlags,
  type SpellInfo,
  type SpellTargetingData,
  type SpellcastingEntry,
} from './character-system-contract.js';

function formatPF2eActionCost(actionValue: unknown): string | undefined {
  if (!actionValue) return undefined;
  if (typeof actionValue === 'number') {
    return actionValue === 1 ? '1 action' : `${actionValue} actions`;
  }
  if (actionValue === 'reaction') return 'reaction';
  if (actionValue === 'free') return 'free action';
  return String(actionValue);
}

function extractPF2eSpellTargeting(
  spellSystem: ModulePF2eItemSystemData | undefined
): SpellTargetingData {
  const result: SpellTargetingData = {};

  const rangeValue = spellSystem?.range?.value;
  if (rangeValue) {
    result.range = String(rangeValue);
  }

  const targetValue = spellSystem?.target?.value;
  if (targetValue) {
    result.target = String(targetValue);
  }

  const areaType = spellSystem?.area?.type;
  const areaValue = spellSystem?.area?.value;
  if (areaType) {
    result.area = areaValue ? `${areaValue}-foot ${areaType}` : areaType;
    if (!result.target) {
      result.target = 'area';
    }
  }

  return result;
}

function extractPF2eSpellSlots(
  entryData: ModulePF2eSpellcastingSystemData | undefined
): Record<string, { value: number; max: number }> | undefined {
  const slots: Record<string, { value: number; max: number }> = {};

  for (let rank = 1; rank <= 10; rank++) {
    const slotKey = `slot${rank}`;
    const entrySlotData =
      typeof entryData?.[slotKey] === 'object' && entryData[slotKey] !== null
        ? (entryData[slotKey] as { value?: number; max?: number })
        : undefined;
    const slotData = entryData?.slots?.[slotKey] ?? entrySlotData;
    if (slotData && ((slotData.max ?? 0) > 0 || (slotData.value ?? 0) > 0)) {
      slots[`rank${rank}`] = {
        value: slotData.value ?? 0,
        max: slotData.max ?? 0,
      };
    }
  }

  return Object.keys(slots).length > 0 ? slots : undefined;
}

function getPF2eSpellReferences(
  value: ModulePF2eSpellCollectionValue
): Array<{ id?: string; prepared?: boolean; expended?: boolean }> {
  if (Array.isArray(value)) {
    return value;
  }

  return Array.isArray(value.value) ? value.value : [];
}

export class Pf2eCharacterSystemStrategy extends BaseCharacterSystemStrategy {
  override enrichItemSearchMatch(params: EnrichItemSearchMatchParams): void {
    const itemSystem = params.itemSystem as ModulePF2eItemSystemData | undefined;

    if (params.itemType === 'spell') {
      const location = getPF2eLocationData(itemSystem?.location);
      const targeting = extractPF2eSpellTargeting(itemSystem);
      const actionCost = formatPF2eActionCost(itemSystem?.time?.value);

      params.result.level = getNumberFromValueField(itemSystem?.level) || (itemSystem?.rank ?? 0);
      params.result.prepared = location.prepared ?? true;
      params.result.expended = location.expended ?? false;
      params.result.traits = Array.isArray(itemSystem?.traits?.value)
        ? itemSystem.traits.value
        : [];
      if (targeting.range) params.result.range = targeting.range;
      if (targeting.target) params.result.target = targeting.target;
      if (targeting.area) params.result.area = targeting.area;
      if (actionCost !== undefined) params.result.actionCost = actionCost;
      return;
    }

    if (
      ['feat', 'feature', 'class', 'ancestry', 'heritage', 'background'].includes(params.itemType)
    ) {
      params.result.traits = Array.isArray(itemSystem?.traits?.value)
        ? itemSystem.traits.value
        : [];
      const levelValue = itemSystem?.level;
      if (levelValue !== undefined && levelValue !== null) {
        params.result.level = getNumberFromValueField(levelValue);
      }
      const actionCost = formatPF2eActionCost(getStringFromValueField(itemSystem?.actionType));
      if (actionCost !== undefined) {
        params.result.actionCost = actionCost;
      }
      return;
    }

    if (params.itemType === 'action') {
      params.result.traits = Array.isArray(itemSystem?.traits?.value)
        ? itemSystem.traits.value
        : [];
      const actionCost = formatPF2eActionCost(
        getStringFromValueField(itemSystem?.actionType) ||
          (typeof itemSystem?.actions === 'object' &&
          itemSystem.actions !== null &&
          'value' in itemSystem.actions
            ? itemSystem.actions.value
            : itemSystem?.actions)
      );
      if (actionCost !== undefined) {
        params.result.actionCost = actionCost;
      }
    }
  }

  override getSpellSearchFlags(params: SpellSearchFlagParams): SpellSearchFlags {
    const itemSystem = params.itemSystem as ModulePF2eItemSystemData | undefined;
    const traits = Array.isArray(itemSystem?.traits?.value) ? itemSystem.traits.value : [];

    return {
      isCantrip: (typeof params.result.level === 'number' ? params.result.level : 0) === 0,
      isPrepared: params.result.prepared !== false,
      isFocus: traits.includes('focus') || itemSystem?.category?.value === 'focus',
    };
  }

  override enrichLooseActionSearchMatch(params: EnrichLooseActionSearchMatchParams): void {
    const action = params.action as ModulePF2eActionData;
    params.result.traits = Array.isArray(action.traits) ? action.traits : [];
    const actionCost = formatPF2eActionCost(action.actionCost?.value ?? action.actions);
    if (actionCost !== undefined) {
      params.result.actionCost = actionCost;
    }
  }

  override extractSpellcastingEntries(params: SpellcastingExtractionParams): SpellcastingEntry[] {
    const actorItems = getActorItems(params.actor);
    const spellItems = actorItems.flatMap((item): ModuleSearchItemDocument[] => {
      const spellItem = ensureSpellItem(item);
      return spellItem ? [spellItem] : [];
    });
    const spellcastingEntries = actorItems.reduce<ModulePF2eSpellcastingEntryDocument[]>(
      (entries, item) => {
        if (isPF2eSpellcastingEntryDocument(item)) {
          entries.push(item);
        }
        return entries;
      },
      []
    );
    const entries: SpellcastingEntry[] = [];

    for (const entry of spellcastingEntries) {
      const entryData = entry.system;
      const entrySpells: SpellInfo[] = [];
      const entryId = entry.id;

      const associatedSpells = spellItems.filter(spell => {
        return (
          getPF2eLocationData((spell.system as ModulePF2eItemSystemData | undefined)?.location)
            .value === entryId
        );
      });

      for (const spell of associatedSpells) {
        const spellSystem = spell.system as ModulePF2eItemSystemData | undefined;
        const location = getPF2eLocationData(spellSystem?.location);
        const targeting = extractPF2eSpellTargeting(spellSystem);
        const actionCost = formatPF2eActionCost(spellSystem?.time?.value);

        entrySpells.push(
          createSpellInfo({
            id: spell.id,
            name: spell.name,
            level: getNumberFromValueField(spellSystem?.level) || (spellSystem?.rank ?? 0),
            prepared: location.prepared ?? true,
            expended: location.expended ?? false,
            traits: toStringArray(spellSystem?.traits?.value),
            ...(actionCost !== undefined ? { actionCost } : {}),
            ...(targeting.range !== undefined ? { range: targeting.range } : {}),
            ...(targeting.target !== undefined ? { target: targeting.target } : {}),
            ...(targeting.area !== undefined ? { area: targeting.area } : {}),
          })
        );
      }

      if (entry.spells) {
        const spellCollections: Array<[string, ModulePF2eSpellCollectionValue]> = Object.entries(
          entry.spells
        );

        for (const [levelKey, levelData] of spellCollections) {
          const spellsAtLevel = getPF2eSpellReferences(levelData);

          for (const spellRef of spellsAtLevel) {
            if (!spellRef.id || entrySpells.some(spell => spell.id === spellRef.id)) {
              continue;
            }

            const spellItem = getActorItemById(params.actor, spellRef.id);
            if (!spellItem) {
              continue;
            }

            const spellSystem = spellItem.system as ModulePF2eItemSystemData | undefined;
            const targeting = extractPF2eSpellTargeting(spellSystem);
            const actionCost = formatPF2eActionCost(spellSystem?.time?.value);

            entrySpells.push(
              createSpellInfo({
                id: spellItem.id,
                name: spellItem.name,
                level:
                  parseInt(levelKey.replace('spell', ''), 10) ||
                  getNumberFromValueField(spellSystem?.level),
                prepared: spellRef.prepared ?? true,
                expended: spellRef.expended ?? false,
                traits: toStringArray(spellSystem?.traits?.value),
                ...(actionCost !== undefined ? { actionCost } : {}),
                ...(targeting.range !== undefined ? { range: targeting.range } : {}),
                ...(targeting.target !== undefined ? { target: targeting.target } : {}),
                ...(targeting.area !== undefined ? { area: targeting.area } : {}),
              })
            );
          }
        }
      }

      const tradition = getStringFromValueField(entryData?.tradition);
      const ability = getStringFromValueField(entryData?.ability);
      const dc = entryData?.spelldc?.dc ?? entryData?.dc?.value;
      const attack = entryData?.spelldc?.value ?? entryData?.attack?.value;
      const slots = extractPF2eSpellSlots(entryData);

      entries.push(
        createSpellcastingEntry({
          id: entry.id,
          name: entry.name,
          type: getStringFromValueField(entryData?.prepared) || 'prepared',
          ...(tradition ? { tradition } : {}),
          ...(ability ? { ability } : {}),
          ...(dc !== undefined ? { dc } : {}),
          ...(attack !== undefined ? { attack } : {}),
          ...(slots !== undefined ? { slots } : {}),
          spells: sortSpellInfo(entrySpells),
        })
      );
    }

    const focusSpells = spellItems.filter(spell => {
      const spellSystem = spell.system as ModulePF2eItemSystemData | undefined;
      return (
        spellSystem?.traits?.value?.includes('focus') === true ||
        spellSystem?.category?.value === 'focus'
      );
    });

    if (focusSpells.length > 0 && !entries.some(entry => entry.type === 'focus')) {
      entries.push(
        createSpellcastingEntry({
          id: 'focus-spells',
          name: 'Focus Spells',
          type: 'focus',
          spells: focusSpells.map(spell => {
            const spellSystem = spell.system as ModulePF2eItemSystemData | undefined;
            const targeting = extractPF2eSpellTargeting(spellSystem);
            const actionCost = formatPF2eActionCost(spellSystem?.time?.value);

            return createSpellInfo({
              id: spell.id,
              name: spell.name,
              level: getNumberFromValueField(spellSystem?.level),
              traits: toStringArray(spellSystem?.traits?.value),
              ...(actionCost !== undefined ? { actionCost } : {}),
              ...(targeting.range !== undefined ? { range: targeting.range } : {}),
              ...(targeting.target !== undefined ? { target: targeting.target } : {}),
              ...(targeting.area !== undefined ? { area: targeting.area } : {}),
            });
          }),
        })
      );
    }

    return entries;
  }
}

function ensureSpellItem(item: unknown): ModuleSearchItemDocument | undefined {
  return isModuleSearchItemDocument(item) && item.type === 'spell' ? item : undefined;
}

export const pf2eCharacterSystemStrategy = new Pf2eCharacterSystemStrategy();
