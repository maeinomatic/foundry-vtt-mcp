import { getItemUseSystemHandler } from './item-use-system-handlers/item-use-handler-registry.js';
import {
  createItemChatMessage,
  runItemAction,
  type ItemUseActorLike,
  type ItemUseOptions,
  type UsableItemLike,
} from './item-use-system-handlers/item-use-system-shared.js';

export type { ItemUseActorLike, ItemUseOptions, UsableItemLike };

function handleMessagingUse(item: UsableItemLike): boolean {
  if (typeof item.toChat !== 'function') {
    return false;
  }

  if (typeof item.toMessage === 'function') {
    runItemAction(item.toMessage(undefined, { create: true }), item.name ?? 'Unknown Item');
  } else {
    runItemAction(item.toChat(), item.name ?? 'Unknown Item');
  }

  return true;
}

function handleRollUse(item: UsableItemLike): boolean {
  if (typeof item.roll !== 'function') {
    return false;
  }

  runItemAction(item.roll(), item.name ?? 'Unknown Item');
  return true;
}

export function executeItemUse(params: {
  actor: ItemUseActorLike;
  item: UsableItemLike;
  systemId: string;
  options: ItemUseOptions;
}): void {
  const { actor, item, systemId, options } = params;
  const systemHandler = getItemUseSystemHandler(systemId);

  if (systemHandler?.execute({ actor, item, options })) {
    return;
  }

  if (typeof item.use === 'function') {
    const useOptions: Record<string, unknown> = {
      createMessage: true,
    };

    if (options.spellLevel !== undefined) {
      useOptions.slotLevel = options.spellLevel;
      useOptions.level = options.spellLevel;
    }

    runItemAction(item.use(useOptions), item.name ?? 'Unknown Item');
    return;
  }

  if (handleMessagingUse(item) || handleRollUse(item)) {
    return;
  }

  createItemChatMessage(actor, item);
}
