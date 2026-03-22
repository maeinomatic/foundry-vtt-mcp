export interface ItemUseActorLike {
  id?: string;
  name?: string;
}

export interface UsableItemLike {
  id?: string;
  name?: string;
  type?: string;
  use?: (options: Record<string, unknown>) => Promise<unknown>;
  toChat?: () => Promise<unknown>;
  toMessage?: (messageData?: unknown, options?: Record<string, unknown>) => Promise<unknown>;
  roll?: () => Promise<unknown>;
  postItem?: () => Promise<unknown>;
  setupEffect?: () => Promise<unknown>;
}

export interface ItemUseOptions {
  consume?: boolean | undefined;
  configureDialog?: boolean | undefined;
  skipDialog?: boolean | undefined;
  spellLevel?: number | undefined;
  versatile?: boolean | undefined;
}

interface ChatMessageApiLike {
  getSpeaker: (data: { actor?: unknown }) => unknown;
  create: (data: Record<string, unknown>) => unknown;
}

function getChatMessageApi(): ChatMessageApiLike | null {
  const chatMessageApi = ChatMessage as unknown;
  return chatMessageApi &&
    typeof chatMessageApi === 'object' &&
    typeof (chatMessageApi as Partial<ChatMessageApiLike>).getSpeaker === 'function' &&
    typeof (chatMessageApi as Partial<ChatMessageApiLike>).create === 'function'
    ? (chatMessageApi as ChatMessageApiLike)
    : null;
}

function runItemAction(promise: Promise<unknown>, itemName: string): void {
  void promise.catch((error: Error) => {
    console.error(`[foundry-mcp-bridge] Error using item ${itemName}:`, error);
  });
}

function createItemChatMessage(actor: ItemUseActorLike, item: UsableItemLike): void {
  const chatMessageApi = getChatMessageApi();
  if (!chatMessageApi) {
    return;
  }

  const chatData: Record<string, unknown> = {
    user: (game as { user?: { id?: string } }).user?.id,
    speaker: chatMessageApi.getSpeaker({ actor }),
    content: `<h3>${item.name ?? 'Unknown Item'}</h3><p>${actor.name ?? 'Unknown'} uses ${item.name ?? 'Unknown Item'}.</p>`,
  };

  chatMessageApi.create(chatData);
}

function handleDnd5eUse(item: UsableItemLike, options: ItemUseOptions): boolean {
  if (typeof item.use !== 'function') {
    return false;
  }

  const useOptions: Record<string, unknown> = {
    createMessage: true,
    consumeResource: options.consume ?? true,
    consumeSpellSlot: options.consume ?? true,
    consumeUsage: options.consume ?? true,
    configureDialog: true,
  };

  if (options.spellLevel !== undefined) {
    useOptions.slotLevel = options.spellLevel;
    useOptions.level = options.spellLevel;
  }

  runItemAction(item.use(useOptions), item.name ?? 'Unknown Item');
  return true;
}

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

function handleDsa5Use(actor: ItemUseActorLike, item: UsableItemLike): boolean {
  const isSpellLike =
    item.type === 'spell' ||
    item.type === 'liturgy' ||
    item.type === 'ceremony' ||
    item.type === 'ritual';

  if (isSpellLike) {
    if (typeof item.postItem === 'function') {
      runItemAction(item.postItem(), item.name ?? 'Unknown Item');
      return true;
    }

    if (typeof item.setupEffect === 'function') {
      runItemAction(item.setupEffect(), item.name ?? 'Unknown Item');
      return true;
    }

    createItemChatMessage(actor, item);
    return true;
  }

  if (typeof item.postItem === 'function') {
    runItemAction(item.postItem(), item.name ?? 'Unknown Item');
    return true;
  }

  return false;
}

export function executeItemUse(params: {
  actor: ItemUseActorLike;
  item: UsableItemLike;
  systemId: string;
  options: ItemUseOptions;
}): void {
  const { actor, item, systemId, options } = params;

  if (systemId === 'dnd5e' && handleDnd5eUse(item, options)) {
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

  if (systemId === 'dsa5' && handleDsa5Use(actor, item)) {
    return;
  }

  createItemChatMessage(actor, item);
}
