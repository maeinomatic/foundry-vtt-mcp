import type { ItemUseStrategy } from './item-use-strategy-contract.js';
import { dnd5eItemUseStrategy } from './dnd5e-item-use-strategy.js';
import { dsa5ItemUseStrategy } from './dsa5-item-use-strategy.js';

const itemUseStrategies: Record<string, ItemUseStrategy> = {
  dnd5e: dnd5eItemUseStrategy,
  dsa5: dsa5ItemUseStrategy,
};

export function getItemUseStrategy(systemId: string): ItemUseStrategy | null {
  return itemUseStrategies[systemId] ?? null;
}
