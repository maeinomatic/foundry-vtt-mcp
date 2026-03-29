type AuditStatus = 'success' | 'failure';

type ChatVisibility = 'public' | 'gm-only' | 'recipients';

interface ActorLookupLike {
  id?: string;
  name?: string;
}

interface UserLookupLike {
  id?: string;
  name?: string;
  isGM?: boolean;
}

interface UserCollectionLike {
  get?: (id: string) => unknown;
  values?: () => Iterable<unknown>;
  [Symbol.iterator]?: () => Iterator<unknown>;
}

export interface PostChatMessageRequest {
  content: string;
  visibility: ChatVisibility;
  recipientUsers?: string[];
  speakerActorIdentifier?: string;
  speakerAlias?: string;
}

export interface PostChatMessageResponse {
  success: boolean;
  messageId?: string;
  content: string;
  visibility: ChatVisibility;
  recipientUserIds?: string[];
  recipientUserNames?: string[];
  speaker?: {
    actorId?: string;
    actorName?: string;
    alias?: string;
  };
  error?: string;
}

export interface ChatMessageServiceContext {
  moduleId: string;
  validateFoundryState(): void;
  auditLog?(action: string, data: unknown, status: AuditStatus, errorMessage?: string): void;
  findActorByIdentifier(identifier: string): ActorLookupLike | null;
}

function getUsersCollection(): UserCollectionLike | null {
  const users = game.users as unknown;
  return users && typeof users === 'object' ? (users as UserCollectionLike) : null;
}

function getUserArray(): UserLookupLike[] {
  const users = getUsersCollection();

  if (users && typeof users.values === 'function') {
    return Array.from(users.values()).filter((candidate): candidate is UserLookupLike =>
      Boolean(candidate && typeof candidate === 'object')
    );
  }

  if (users && typeof users[Symbol.iterator] === 'function') {
    return Array.from(users as Iterable<unknown>).filter((candidate): candidate is UserLookupLike =>
      Boolean(candidate && typeof candidate === 'object')
    );
  }

  return [];
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatPlainTextChatContent(content: string): string {
  return escapeHtml(content.trim()).replace(/\r?\n/g, '<br>');
}

function dedupeUsers(users: UserLookupLike[]): UserLookupLike[] {
  const seen = new Set<string>();

  return users.filter(user => {
    if (!user.id || seen.has(user.id)) {
      return false;
    }

    seen.add(user.id);
    return true;
  });
}

function resolveRecipientUser(identifier: string): UserLookupLike {
  const trimmedIdentifier = identifier.trim();
  const users = getUserArray();
  const byId = users.find(user => user.id === trimmedIdentifier);
  if (byId) {
    return byId;
  }

  const nameMatches = users.filter(
    user => user.name?.toLowerCase() === trimmedIdentifier.toLowerCase()
  );

  if (nameMatches.length === 1) {
    return nameMatches[0];
  }

  if (nameMatches.length > 1) {
    throw new Error(`Recipient user is ambiguous: ${identifier}`);
  }

  throw new Error(`Recipient user not found: ${identifier}`);
}

function getGmRecipients(): UserLookupLike[] {
  const gmUsers = dedupeUsers(getUserArray().filter(user => user.isGM === true));

  if (gmUsers.length === 0) {
    throw new Error('No GM recipients are available for gm-only visibility');
  }

  return gmUsers;
}

export class FoundryChatMessageService {
  constructor(private readonly context: ChatMessageServiceContext) {}

  async postChatMessage(data: PostChatMessageRequest): Promise<PostChatMessageResponse> {
    this.context.validateFoundryState();

    try {
      const trimmedContent = data.content.trim();
      if (!trimmedContent) {
        throw new Error('content is required');
      }

      if (data.visibility === 'public' && data.recipientUsers && data.recipientUsers.length > 0) {
        throw new Error('recipientUsers are only valid when visibility is "recipients"');
      }

      if (data.visibility === 'gm-only' && data.recipientUsers && data.recipientUsers.length > 0) {
        throw new Error('recipientUsers are only valid when visibility is "recipients"');
      }

      if (
        data.visibility === 'recipients' &&
        (!data.recipientUsers || data.recipientUsers.length === 0)
      ) {
        throw new Error('recipientUsers are required when visibility is "recipients"');
      }

      const speakerActor = data.speakerActorIdentifier
        ? this.context.findActorByIdentifier(data.speakerActorIdentifier)
        : null;
      if (data.speakerActorIdentifier && !speakerActor) {
        throw new Error(`Speaker actor not found: ${data.speakerActorIdentifier}`);
      }

      const recipientUsers =
        data.visibility === 'public'
          ? []
          : data.visibility === 'gm-only'
            ? getGmRecipients()
            : dedupeUsers((data.recipientUsers ?? []).map(resolveRecipientUser));

      const whisper = recipientUsers
        .map(user => user.id)
        .filter((userId): userId is string => typeof userId === 'string' && userId.length > 0);

      const chatMessageApi = ChatMessage as unknown as {
        getSpeaker: (data: { actor?: unknown; alias?: string }) => unknown;
        create: (data: Record<string, unknown>) => Promise<unknown>;
      };

      const messageData: Record<string, unknown> = {
        content: formatPlainTextChatContent(trimmedContent),
        speaker: chatMessageApi.getSpeaker({
          ...(speakerActor ? { actor: speakerActor } : {}),
          ...(data.speakerAlias ? { alias: data.speakerAlias } : {}),
        }),
        ...(whisper.length > 0 ? { whisper } : {}),
        flags: {
          [this.context.moduleId]: {
            visibility: data.visibility,
            source: 'post-chat-message',
          },
        },
      };

      const createdMessageRaw = await chatMessageApi.create(messageData);
      const createdMessage =
        createdMessageRaw && typeof createdMessageRaw === 'object'
          ? (createdMessageRaw as { id?: unknown })
          : null;

      const speaker =
        (speakerActor ?? data.speakerAlias)
          ? {
              ...(speakerActor?.id ? { actorId: speakerActor.id } : {}),
              ...(speakerActor?.name ? { actorName: speakerActor.name } : {}),
              ...(data.speakerAlias ? { alias: data.speakerAlias } : {}),
            }
          : null;

      const response: PostChatMessageResponse = {
        success: true,
        content: trimmedContent,
        visibility: data.visibility,
        ...(typeof createdMessage?.id === 'string' ? { messageId: createdMessage.id } : {}),
        ...(whisper.length > 0 ? { recipientUserIds: whisper } : {}),
        ...(recipientUsers.length > 0
          ? {
              recipientUserNames: recipientUsers.map(
                user => user.name ?? user.id ?? 'Unknown User'
              ),
            }
          : {}),
        ...(speaker ? { speaker } : {}),
      };

      this.context.auditLog?.('postChatMessage', data, 'success');
      return response;
    } catch (error) {
      this.context.auditLog?.(
        'postChatMessage',
        data,
        'failure',
        error instanceof Error ? error.message : 'Unknown error posting chat message'
      );

      return {
        success: false,
        content: data.content,
        visibility: data.visibility,
        error: error instanceof Error ? error.message : 'Unknown error posting chat message',
      };
    }
  }
}
