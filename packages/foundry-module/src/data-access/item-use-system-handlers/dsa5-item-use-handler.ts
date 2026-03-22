import {
  createItemChatMessage,
  runItemAction,
  type ItemUseSystemHandler,
  type ItemUseSystemHandlerParams,
} from './item-use-system-shared.js';

const dsa5SpellLikeItemTypes = new Set(['spell', 'liturgy', 'ceremony', 'ritual']);

export const dsa5ItemUseHandler: ItemUseSystemHandler = {
  execute(params: ItemUseSystemHandlerParams): boolean {
    const isSpellLike = Boolean(params.item.type && dsa5SpellLikeItemTypes.has(params.item.type));

    if (isSpellLike) {
      if (typeof params.item.postItem === 'function') {
        runItemAction(params.item.postItem(), params.item.name ?? 'Unknown Item');
        return true;
      }

      if (typeof params.item.setupEffect === 'function') {
        runItemAction(params.item.setupEffect(), params.item.name ?? 'Unknown Item');
        return true;
      }

      createItemChatMessage(params.actor, params.item);
      return true;
    }

    if (typeof params.item.postItem === 'function') {
      runItemAction(params.item.postItem(), params.item.name ?? 'Unknown Item');
      return true;
    }

    return false;
  },
};
