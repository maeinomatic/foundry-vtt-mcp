import {
  runItemAction,
  type ItemUseSystemHandler,
  type ItemUseSystemHandlerParams,
} from './item-use-system-shared.js';

export const dnd5eItemUseHandler: ItemUseSystemHandler = {
  execute(params: ItemUseSystemHandlerParams): boolean {
    if (typeof params.item.use !== 'function') {
      return false;
    }

    const useOptions: Record<string, unknown> = {
      createMessage: true,
      consumeResource: params.options.consume ?? true,
      consumeSpellSlot: params.options.consume ?? true,
      consumeUsage: params.options.consume ?? true,
      configureDialog: true,
    };

    if (params.options.spellLevel !== undefined) {
      useOptions.slotLevel = params.options.spellLevel;
      useOptions.level = params.options.spellLevel;
    }

    runItemAction(params.item.use(useOptions), params.item.name ?? 'Unknown Item');
    return true;
  },
};
