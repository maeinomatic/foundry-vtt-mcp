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
  getNumberFromValueField,
  isModuleSearchItemDocument,
  sortSpellInfo,
  toStringArray,
  type ModuleDSA5ActorSystemData,
  type ModuleDSA5ItemSystemData,
  type ModuleSearchItemDocument,
  type SpellInfo,
  type SpellTargetingData,
  type SpellcastingEntry,
} from './character-system-types.js';

function extractDSA5SpellTargeting(
  spellSystem: ModuleDSA5ItemSystemData | undefined
): SpellTargetingData {
  const result: SpellTargetingData = {};

  const rangeValue = spellSystem?.range?.value ?? spellSystem?.Reichweite;
  if (rangeValue) {
    result.range = String(rangeValue);
  }

  const targetCategory = spellSystem?.targetCategory?.value ?? spellSystem?.Zielkategorie;
  if (targetCategory) {
    result.target = String(targetCategory);
  }

  const areaValue = spellSystem?.effectRadius?.value ?? spellSystem?.Wirkungsbereich;
  if (areaValue) {
    result.area = String(areaValue);
  }

  return result;
}

function createDsa5SpellInfo(spell: ModuleSearchItemDocument): SpellInfo {
  const spellSystem = spell.system as ModuleDSA5ItemSystemData | undefined;
  const targeting = extractDSA5SpellTargeting(spellSystem);

  return createSpellInfo({
    id: spell.id,
    name: spell.name,
    level: getNumberFromValueField(spellSystem?.level),
    traits: toStringArray(spellSystem?.effect?.attributes),
    ...(spellSystem?.castingTime?.value ? { actionCost: spellSystem.castingTime.value } : {}),
    ...(targeting.range !== undefined ? { range: targeting.range } : {}),
    ...(targeting.target !== undefined ? { target: targeting.target } : {}),
    ...(targeting.area !== undefined ? { area: targeting.area } : {}),
  });
}

export class Dsa5CharacterSystemHelper extends BaseCharacterSystemHelper {
  override enrichItemSearchMatch(params: EnrichItemSearchMatchParams): void {
    if (params.itemType !== 'spell') {
      return;
    }

    const itemSystem = params.itemSystem as ModuleDSA5ItemSystemData | undefined;
    const targeting = extractDSA5SpellTargeting(itemSystem);

    params.result.level = getNumberFromValueField(itemSystem?.level);
    params.result.prepared = true;
    params.result.expended = false;
    params.result.traits = toStringArray(itemSystem?.effect?.attributes);
    if (targeting.range) params.result.range = targeting.range;
    if (targeting.target) params.result.target = targeting.target;
    if (targeting.area) params.result.area = targeting.area;
    if (itemSystem?.castingTime?.value) {
      params.result.actionCost = itemSystem.castingTime.value;
    }
  }

  override extractSpellcastingEntries(params: SpellcastingExtractionParams): SpellcastingEntry[] {
    const actorItems = getActorItems(params.actor);
    const actorSystem = getActorSystem<ModuleDSA5ActorSystemData>(params.actor) ?? {};
    const astralSpells = actorItems.flatMap((item): ModuleSearchItemDocument[] => {
      const spellItem = ensureSpellLikeItem(item, ['spell']);
      return spellItem ? [spellItem] : [];
    });
    const karmaSpells = actorItems.flatMap((item): ModuleSearchItemDocument[] => {
      const spellItem = ensureSpellLikeItem(item, ['liturgy', 'ceremony']);
      return spellItem ? [spellItem] : [];
    });
    const rituals = actorItems.flatMap((item): ModuleSearchItemDocument[] => {
      const spellItem = ensureSpellLikeItem(item, ['ritual']);
      return spellItem ? [spellItem] : [];
    });
    const asp = actorSystem.status?.astralenergy ?? actorSystem.astralenergy;
    const kap = actorSystem.status?.karmaenergy ?? actorSystem.karmaenergy;
    const entries: SpellcastingEntry[] = [];

    if (astralSpells.length > 0) {
      entries.push(
        createSpellcastingEntry({
          id: 'zauber',
          name: 'Zauber (Spells)',
          type: 'arcane',
          ...(asp ? { slots: { asp: { value: asp.value ?? 0, max: asp.max ?? 0 } } } : {}),
          spells: sortSpellInfo(astralSpells.map(spell => createDsa5SpellInfo(spell))),
        })
      );
    }

    if (karmaSpells.length > 0) {
      entries.push(
        createSpellcastingEntry({
          id: 'liturgien',
          name: 'Liturgien & Zeremonien (Liturgies)',
          type: 'divine',
          ...(kap ? { slots: { kap: { value: kap.value ?? 0, max: kap.max ?? 0 } } } : {}),
          spells: sortSpellInfo(karmaSpells.map(spell => createDsa5SpellInfo(spell))),
        })
      );
    }

    if (rituals.length > 0) {
      entries.push(
        createSpellcastingEntry({
          id: 'rituale',
          name: 'Rituale (Rituals)',
          type: 'ritual',
          spells: sortSpellInfo(rituals.map(spell => createDsa5SpellInfo(spell))),
        })
      );
    }

    return entries;
  }
}

function ensureSpellLikeItem(
  item: unknown,
  itemTypes: string[] = ['spell']
): ModuleSearchItemDocument | undefined {
  return isModuleSearchItemDocument(item) && itemTypes.includes(item.type) ? item : undefined;
}

export const dsa5CharacterSystemHelper = new Dsa5CharacterSystemHelper();
