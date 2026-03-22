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

export interface ItemUseSystemHandlerParams {
  actor: ItemUseActorLike;
  item: UsableItemLike;
  options: ItemUseOptions;
}

export interface ItemUseSystemHandler {
  execute(params: ItemUseSystemHandlerParams): boolean;
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

export function runItemAction(promise: Promise<unknown>, itemName: string): void {
  void promise.catch((error: Error) => {
    console.error(`[foundry-mcp-bridge] Error using item ${itemName}:`, error);
  });
}

export function createItemChatMessage(actor: ItemUseActorLike, item: UsableItemLike): void {
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
