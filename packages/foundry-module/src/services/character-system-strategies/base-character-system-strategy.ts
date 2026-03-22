import {
  getNumberFromValueField,
  type CharacterActorLike,
  type CharacterItemSearchMatch,
  type LooseCharacterActionLike,
  type ModuleSearchItemSystemData,
  type SpellSearchFlags,
  type SpellcastingEntry,
} from './character-system-contract.js';

export interface EnrichItemSearchMatchParams {
  itemType: string;
  itemSystem: ModuleSearchItemSystemData | undefined;
  result: CharacterItemSearchMatch;
}

export interface SpellSearchFlagParams {
  itemSystem: ModuleSearchItemSystemData | undefined;
  result: CharacterItemSearchMatch;
}

export interface EnrichLooseActionSearchMatchParams {
  action: LooseCharacterActionLike;
  result: CharacterItemSearchMatch;
}

export interface SpellcastingExtractionParams {
  actor: CharacterActorLike;
}

export interface CharacterSystemStrategy {
  enrichItemSearchMatch(params: EnrichItemSearchMatchParams): void;
  getSpellSearchFlags(params: SpellSearchFlagParams): SpellSearchFlags;
  enrichLooseActionSearchMatch(params: EnrichLooseActionSearchMatchParams): void;
  extractSpellcastingEntries(params: SpellcastingExtractionParams): SpellcastingEntry[];
}

export class BaseCharacterSystemStrategy implements CharacterSystemStrategy {
  enrichItemSearchMatch(params: EnrichItemSearchMatchParams): void {
    if (params.itemType !== 'spell') {
      return;
    }

    params.result.level = getNumberFromValueField(
      (params.itemSystem as { level?: number } | undefined)?.level
    );
    if (!params.result.level) {
      params.result.level = getNumberFromValueField(
        (params.itemSystem as { rank?: number } | undefined)?.rank
      );
    }
    params.result.prepared = true;
    params.result.expended = false;
  }

  getSpellSearchFlags(params: SpellSearchFlagParams): SpellSearchFlags {
    const level =
      typeof params.result.level === 'number'
        ? params.result.level
        : getNumberFromValueField((params.itemSystem as { level?: number } | undefined)?.level);

    return {
      isCantrip: level === 0,
      isPrepared: params.result.prepared !== false,
      isFocus: false,
    };
  }

  enrichLooseActionSearchMatch(_params: EnrichLooseActionSearchMatchParams): void {}

  extractSpellcastingEntries(_params: SpellcastingExtractionParams): SpellcastingEntry[] {
    return [];
  }
}

export const baseCharacterSystemStrategy = new BaseCharacterSystemStrategy();
