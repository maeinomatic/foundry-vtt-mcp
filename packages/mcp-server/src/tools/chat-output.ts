import { z } from 'zod';

import { FoundryClient } from '../foundry-client.js';
import { Logger } from '../logger.js';

interface ChatOutputToolsOptions {
  foundryClient: FoundryClient;
  logger: Logger;
}

interface PostChatMessageResponse {
  success?: boolean;
  messageId?: string;
  content?: string;
  visibility?: 'public' | 'gm-only' | 'recipients';
  recipientUserIds?: string[];
  recipientUserNames?: string[];
  speaker?: Record<string, unknown>;
  error?: string;
}

export class ChatOutputTools {
  private foundryClient: FoundryClient;
  private logger: Logger;

  constructor(options: ChatOutputToolsOptions) {
    this.foundryClient = options.foundryClient;
    this.logger = options.logger;
  }

  getToolDefinitions(): Array<Record<string, unknown>> {
    return [
      {
        name: 'post-chat-message',
        description:
          'Post a guarded plain-text chat message into Foundry with explicit visibility controls. If visibility is not specified by the user, clarify whether the message should be public, gm-only, or sent to selected recipients before calling this tool.',
        inputSchema: {
          type: 'object',
          properties: {
            content: {
              type: 'string',
              description: 'Plain-text content to post into the Foundry chat log.',
            },
            visibility: {
              type: 'string',
              enum: ['public', 'gm-only', 'recipients'],
              description:
                'Visibility mode for the message. Use recipients only when the user has explicitly named the allowed recipients.',
            },
            recipientUsers: {
              type: 'array',
              description:
                'Required only when visibility is recipients. Each entry must be a Foundry user name or ID.',
              items: {
                type: 'string',
              },
            },
            speakerActorIdentifier: {
              type: 'string',
              description: 'Optional actor ID or actor name to use as the message speaker context.',
            },
            speakerAlias: {
              type: 'string',
              description: 'Optional display alias to use for the speaker in chat.',
            },
          },
          required: ['content', 'visibility'],
        },
      },
    ];
  }

  async handlePostChatMessage(args: unknown): Promise<PostChatMessageResponse> {
    const schema = z
      .object({
        content: z.string().trim().min(1),
        visibility: z.enum(['public', 'gm-only', 'recipients']),
        recipientUsers: z.array(z.string().trim().min(1)).optional(),
        speakerActorIdentifier: z.string().trim().min(1).optional(),
        speakerAlias: z.string().trim().min(1).optional(),
      })
      .superRefine((value, context) => {
        if (
          value.visibility === 'recipients' &&
          (!value.recipientUsers || value.recipientUsers.length === 0)
        ) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'recipientUsers are required when visibility is recipients',
            path: ['recipientUsers'],
          });
        }

        if (
          value.visibility !== 'recipients' &&
          value.recipientUsers &&
          value.recipientUsers.length > 0
        ) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'recipientUsers can only be provided when visibility is recipients',
            path: ['recipientUsers'],
          });
        }
      });

    try {
      const params = schema.parse(args);
      const response = await this.foundryClient.query<PostChatMessageResponse>(
        'maeinomatic-foundry-mcp.post-chat-message',
        params
      );

      if (!response.success) {
        throw new Error(response.error ?? 'Failed to post chat message');
      }

      return response;
    } catch (error) {
      this.logger.error('Error posting chat message', error);

      if (error instanceof z.ZodError) {
        throw new Error(
          `Invalid chat message parameters: ${error.errors.map(issue => issue.message).join(', ')}`
        );
      }

      throw error;
    }
  }
}
