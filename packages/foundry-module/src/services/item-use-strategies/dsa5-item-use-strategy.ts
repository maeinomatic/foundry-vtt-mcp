import {
  createItemChatMessage,
  runItemAction,
  type ItemUseStrategy,
  type ItemUseStrategyParams,
} from './item-use-strategy-contract.js';

const dsa5SpellLikeItemTypes = new Set(['spell', 'liturgy', 'ceremony', 'ritual']);

export const dsa5ItemUseStrategy: ItemUseStrategy = {
  execute(params: ItemUseStrategyParams): boolean {
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
