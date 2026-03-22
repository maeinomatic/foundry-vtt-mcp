import {
  baseCharacterSystemStrategy,
  type CharacterSystemStrategy,
} from './base-character-system-strategy.js';
import { dnd5eCharacterSystemStrategy } from './dnd5e-character-system-strategy.js';
import { dsa5CharacterSystemStrategy } from './dsa5-character-system-strategy.js';
import { pf2eCharacterSystemStrategy } from './pf2e-character-system-strategy.js';

const characterSystemStrategies: Record<string, CharacterSystemStrategy> = {
  pf2e: pf2eCharacterSystemStrategy,
  dnd5e: dnd5eCharacterSystemStrategy,
  dsa5: dsa5CharacterSystemStrategy,
};

export function getCharacterSystemStrategy(systemId: string): CharacterSystemStrategy {
  return characterSystemStrategies[systemId] ?? baseCharacterSystemStrategy;
}
