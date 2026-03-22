import type { ItemUseSystemHandler } from './item-use-system-shared.js';
import { dnd5eItemUseHandler } from './dnd5e-item-use-handler.js';
import { dsa5ItemUseHandler } from './dsa5-item-use-handler.js';

const itemUseSystemHandlers: Record<string, ItemUseSystemHandler> = {
  dnd5e: dnd5eItemUseHandler,
  dsa5: dsa5ItemUseHandler,
};

export function getItemUseSystemHandler(systemId: string): ItemUseSystemHandler | null {
  return itemUseSystemHandlers[systemId] ?? null;
}
