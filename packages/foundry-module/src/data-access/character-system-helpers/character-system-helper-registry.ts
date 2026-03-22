import {
  baseCharacterSystemHelper,
  type CharacterSystemHelper,
} from './base-character-system-helper.js';
import { dnd5eCharacterSystemHelper } from './dnd5e-character-system-helper.js';
import { dsa5CharacterSystemHelper } from './dsa5-character-system-helper.js';
import { pf2eCharacterSystemHelper } from './pf2e-character-system-helper.js';

const characterSystemHelpers: Record<string, CharacterSystemHelper> = {
  pf2e: pf2eCharacterSystemHelper,
  dnd5e: dnd5eCharacterSystemHelper,
  dsa5: dsa5CharacterSystemHelper,
};

export function getCharacterSystemHelper(systemId: string): CharacterSystemHelper {
  return characterSystemHelpers[systemId] ?? baseCharacterSystemHelper;
}
