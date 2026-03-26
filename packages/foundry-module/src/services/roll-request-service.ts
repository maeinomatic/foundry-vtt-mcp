type AuditStatus = 'success' | 'failure';

interface ActorLookupLike {
  id?: string;
  name?: string;
  type?: string;
  img?: string;
  system?: Record<string, unknown>;
  items: unknown;
  effects: unknown;
  hasPlayerOwner?: boolean;
  ownership?: Record<string, number>;
  update?: (data: Record<string, unknown>) => Promise<unknown>;
  testUserPermission?: (...args: unknown[]) => boolean;
  getRollData?: () => unknown;
}

interface UserLookupLike {
  id?: string;
  name?: string;
  isGM?: boolean;
  active?: boolean;
}

export interface RollButtonState {
  rolled?: boolean;
  rolledBy?: string;
  rolledByName?: string;
  timestamp?: number;
}

interface ChatMessageLike {
  flags?: Record<string, unknown>;
  getFlag: (scope: string, key: string) => unknown;
  canUserModify: (user: unknown, action: 'update') => boolean;
  update: (data: Record<string, unknown>) => Promise<unknown>;
}

interface CharacterRollData {
  abilities?: Record<string, { mod?: number; save?: number }>;
  skills?: Record<string, { total?: number }>;
  attributes?: { init?: { mod?: number } };
}

interface RollTargetResolution {
  found: boolean;
  user?: UserLookupLike;
  character?: ActorLookupLike;
  targetName: string;
  errorType?: 'PLAYER_OFFLINE' | 'PLAYER_NOT_FOUND' | 'CHARACTER_NOT_FOUND';
  errorMessage?: string;
}

interface UserCollectionLike {
  get?: (id: string) => unknown;
  find?: (predicate: (user: unknown) => boolean) => unknown;
  values?: () => Iterable<unknown>;
  [Symbol.iterator]?: () => Iterator<unknown>;
}

export interface RollRequestServiceContext {
  moduleId: string;
  validateFoundryState(): void;
  auditLog?(action: string, data: unknown, status: AuditStatus, errorMessage?: string): void;
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

function getActorArray(): ActorLookupLike[] {
  const actors = game.actors as unknown;
  if (!actors || typeof actors !== 'object' || !(Symbol.iterator in actors)) {
    return [];
  }

  return Array.from(actors as Iterable<unknown>).filter((candidate): candidate is ActorLookupLike =>
    Boolean(candidate && typeof candidate === 'object')
  );
}

export class FoundryRollRequestService {
  private readonly rollButtonProcessingStates = new Map<string, boolean>();

  constructor(private readonly context: RollRequestServiceContext) {}

  async requestPlayerRolls(data: {
    rollType: string;
    rollTarget: string;
    targetPlayer: string;
    isPublic: boolean;
    rollModifier: string;
    flavor: string;
  }): Promise<{ success: boolean; message: string; error?: string }> {
    this.context.validateFoundryState();

    try {
      const playerInfo = this.resolveTargetPlayer(data.targetPlayer);
      if (!playerInfo.found) {
        const errorMessage =
          playerInfo.errorMessage ?? `Could not find player or character: ${data.targetPlayer}`;

        return {
          success: false,
          message: '',
          error: errorMessage,
        };
      }

      const rollFormula = this.buildRollFormula(
        data.rollType,
        data.rollTarget,
        data.rollModifier,
        playerInfo.character
      );

      const randomIdFn = (foundry as unknown as { utils?: { randomID?: () => string } }).utils
        ?.randomID;
      const buttonId = typeof randomIdFn === 'function' ? randomIdFn() : crypto.randomUUID();
      const buttonLabel = this.buildRollButtonLabel(data.rollType, data.rollTarget, data.isPublic);

      const rollButtonHtml = `
        <div class="mcp-roll-request" style="margin: 12px 0; padding: 12px; border: 1px solid #ccc; border-radius: 8px; background: #f9f9f9;">
          <p><strong>Roll Request:</strong> ${buttonLabel}</p>
          <p><strong>Target:</strong> ${playerInfo.targetName} ${playerInfo.character ? `(${playerInfo.character.name})` : ''}</p>
          ${data.flavor ? `<p><strong>Context:</strong> ${data.flavor}</p>` : ''}

          <div style="text-align: center; margin-top: 8px;">
            <button class="mcp-roll-button mcp-button-active"
                    data-button-id="${buttonId}"
                    data-roll-formula="${rollFormula}"
                    data-roll-label="${buttonLabel}"
                    data-is-public="${data.isPublic}"
                    data-character-id="${playerInfo.character?.id ?? ''}"
                    data-target-user-id="${playerInfo.user?.id ?? ''}">
              ðŸŽ² ${buttonLabel}
            </button>
          </div>
        </div>
      `;

      const whisperTargets: string[] = [];
      if (!data.isPublic) {
        if (playerInfo.user?.id) {
          whisperTargets.push(playerInfo.user.id);
        }

        for (const gm of getUserArray().filter(
          user => user.isGM === true && user.active === true
        )) {
          if (gm.id && !whisperTargets.includes(gm.id)) {
            whisperTargets.push(gm.id);
          }
        }
      }

      const chatMessageApi = ChatMessage as unknown as {
        getSpeaker: (data: { actor?: unknown }) => unknown;
        create: (data: Record<string, unknown>) => Promise<unknown>;
      };
      const constStyles = CONST as unknown as {
        CHAT_MESSAGE_STYLES?: { OTHER?: number };
      };

      const messageData: Record<string, unknown> = {
        content: rollButtonHtml,
        speaker: chatMessageApi.getSpeaker({ actor: game.user }),
        style: constStyles.CHAT_MESSAGE_STYLES?.OTHER ?? 0,
        whisper: whisperTargets,
        flags: {
          [this.context.moduleId]: {
            rollButtons: {
              [buttonId]: {
                rolled: false,
                rollFormula,
                rollLabel: buttonLabel,
                isPublic: data.isPublic,
                characterId: playerInfo.character?.id ?? '',
                targetUserId: playerInfo.user?.id ?? '',
              },
            },
          },
        },
      };

      const chatMessageRaw = await chatMessageApi.create(messageData);
      const chatMessageId =
        chatMessageRaw && typeof chatMessageRaw === 'object' && 'id' in chatMessageRaw
          ? (chatMessageRaw as { id?: unknown }).id
          : null;

      if (typeof chatMessageId === 'string' && chatMessageId.length > 0) {
        this.saveRollButtonMessageId(buttonId, chatMessageId);
      }

      this.context.auditLog?.('requestPlayerRolls', data, 'success');
      return {
        success: true,
        message: `Roll request sent to ${playerInfo.targetName}. ${data.isPublic ? 'Public roll' : 'Private roll'} button created in chat.`,
      };
    } catch (error) {
      console.error(`[${this.context.moduleId}] Error creating roll request:`, error);
      this.context.auditLog?.(
        'requestPlayerRolls',
        data,
        'failure',
        error instanceof Error ? error.message : 'Unknown error creating roll request'
      );
      return {
        success: false,
        message: '',
        error: error instanceof Error ? error.message : 'Unknown error creating roll request',
      };
    }
  }

  attachRollButtonHandlers(html: JQuery): void {
    const currentUserId = game.user?.id;
    const isGM = game.user?.isGM;

    html.find('.mcp-roll-button').each((_index, element) => {
      const button = $(element);
      const targetUserIdRaw: unknown = button.data('target-user-id') as unknown;
      const targetUserId = typeof targetUserIdRaw === 'string' ? targetUserIdRaw : null;
      const isPublicRollRaw: unknown = button.data('is-public') as unknown;
      const isPublicRoll = isPublicRollRaw === true || isPublicRollRaw === 'true';
      const canClickButton = isGM || (targetUserId && targetUserId === currentUserId);

      if (isPublicRoll) {
        if (canClickButton) {
          button.css({
            background: '#4CAF50',
            cursor: 'pointer',
            opacity: '1',
          });
        } else {
          button.css({
            background: '#9E9E9E',
            cursor: 'not-allowed',
            opacity: '0.7',
          });
          button.prop('disabled', true);
        }
      } else if (canClickButton) {
        button.show();
      } else {
        button.hide();
      }
    });

    html.find('.mcp-roll-button').on('click', event => {
      void (async (): Promise<void> => {
        const button = $(event.currentTarget);

        if (button.prop('disabled')) {
          return;
        }

        button.prop('disabled', true);
        const originalText = button.text();
        button.text('ðŸŽ² Rolling...');

        const buttonIdRaw: unknown = button.data('button-id') as unknown;
        const buttonId = typeof buttonIdRaw === 'string' ? buttonIdRaw : null;
        if (buttonId && this.isRollButtonProcessing(buttonId)) {
          button.text('ðŸŽ² Processing...');
          return;
        }

        if (buttonId) {
          this.setRollButtonProcessing(buttonId, true);
        }

        if (!buttonId) {
          console.warn(`[${this.context.moduleId}] Button missing button-id data attribute`);
          button.prop('disabled', false);
          button.text(originalText);
          return;
        }

        const rollFormulaRaw: unknown = button.data('roll-formula') as unknown;
        const rollLabelRaw: unknown = button.data('roll-label') as unknown;
        const isPublicRaw: unknown = button.data('is-public') as unknown;
        const isPublic = isPublicRaw === true || isPublicRaw === 'true';
        const characterIdRaw: unknown = button.data('character-id') as unknown;
        const targetUserIdRaw: unknown = button.data('target-user-id') as unknown;
        const isGmRoll = game.user?.isGM ?? false;

        const rollFormula =
          typeof rollFormulaRaw === 'string' && rollFormulaRaw.trim().length > 0
            ? rollFormulaRaw
            : null;
        const rollLabel = typeof rollLabelRaw === 'string' ? rollLabelRaw : 'Roll';
        const characterId = typeof characterIdRaw === 'string' ? characterIdRaw : null;
        const targetUserId = typeof targetUserIdRaw === 'string' ? targetUserIdRaw : null;

        if (!rollFormula) {
          ui.notifications?.error('Invalid roll formula');
          button.prop('disabled', false);
          button.text(originalText);
          return;
        }

        const canExecuteRoll =
          (game.user?.isGM ?? false) || (targetUserId !== null && targetUserId === game.user?.id);

        if (!canExecuteRoll) {
          console.warn(`[${this.context.moduleId}] Permission denied for roll execution`);
          ui.notifications?.warn('You do not have permission to execute this roll');
          return;
        }

        try {
          const RollCtor = Roll as unknown as new (formula: string) => {
            evaluate: () => Promise<unknown>;
            toMessage: (
              message: Record<string, unknown>,
              options: { create: boolean; rollMode: string }
            ) => Promise<unknown>;
          };
          const roll = new RollCtor(rollFormula);
          await roll.evaluate();

          const actorsCollection = game.actors as
            | { get: (id: string) => unknown }
            | null
            | undefined;
          const character =
            characterId && actorsCollection ? actorsCollection.get(characterId) : null;

          const rollMode = isPublic ? 'publicroll' : 'whisper';
          const whisperTargets: string[] = [];

          if (!isPublic) {
            if (targetUserId) {
              whisperTargets.push(targetUserId);
            }

            for (const gm of getUserArray()) {
              if (
                gm.isGM === true &&
                gm.active === true &&
                gm.id &&
                !whisperTargets.includes(gm.id)
              ) {
                whisperTargets.push(gm.id);
              }
            }
          }

          const messageData: Record<string, unknown> = {
            speaker: (
              ChatMessage as unknown as { getSpeaker: (data: { actor: unknown }) => unknown }
            ).getSpeaker({ actor: character }),
            flavor: `${rollLabel} ${isGmRoll ? '(GM Override)' : ''}`,
            ...(whisperTargets.length > 0 ? { whisper: whisperTargets } : {}),
          };

          await roll.toMessage(messageData, {
            create: true,
            rollMode,
          });

          const currentButtonIdRaw: unknown = button.data('button-id') as unknown;
          const currentButtonId =
            typeof currentButtonIdRaw === 'string' ? currentButtonIdRaw : null;
          const currentUserId = typeof game.user?.id === 'string' ? game.user.id : null;
          if (currentButtonId && currentUserId) {
            try {
              await this.updateRollButtonMessage(currentButtonId, currentUserId, rollLabel);
            } catch (updateError) {
              console.error(
                `[${this.context.moduleId}] Failed to update chat message:`,
                updateError
              );
              console.error(
                `[${this.context.moduleId}] Error details:`,
                updateError instanceof Error ? updateError.stack : updateError
              );
              button.prop('disabled', true).text('âœ“ Rolled');
            }
          } else {
            console.warn(
              `[${this.context.moduleId}] Cannot update ChatMessage - missing buttonId or userId:`,
              {
                buttonId: currentButtonId,
                userId: currentUserId,
              }
            );
          }
        } catch (error) {
          console.error(`[${this.context.moduleId}] Error executing roll:`, error);
          ui.notifications?.error('Failed to execute roll');
          button.prop('disabled', false);
          button.text(originalText);
        } finally {
          if (buttonId) {
            this.setRollButtonProcessing(buttonId, false);
          }
        }
      })();
    });
  }

  async saveRollState(buttonId: string, userId: string): Promise<void> {
    try {
      await this.updateRollButtonMessage(buttonId, userId, 'Legacy Roll');
    } catch (error) {
      console.error(`[${this.context.moduleId}] Legacy saveRollState redirect failed:`, error);
    }
  }

  getRollState(buttonId: string): RollButtonState | null {
    this.context.validateFoundryState();

    try {
      const rollStatesRaw: unknown = game.settings.get(
        this.context.moduleId,
        'rollStates'
      ) as unknown;
      const rollStates =
        rollStatesRaw && typeof rollStatesRaw === 'object'
          ? (rollStatesRaw as Record<string, unknown>)
          : {};
      const state = rollStates[buttonId];
      return state && typeof state === 'object' ? (state as RollButtonState) : null;
    } catch (error) {
      console.error(`[${this.context.moduleId}] Error getting roll state:`, error);
      return null;
    }
  }

  saveRollButtonMessageId(buttonId: string, messageId: string): void {
    try {
      const buttonMessageMapRaw: unknown = game.settings.get(
        this.context.moduleId,
        'buttonMessageMap'
      ) as unknown;
      const buttonMessageMap =
        buttonMessageMapRaw && typeof buttonMessageMapRaw === 'object'
          ? (buttonMessageMapRaw as Record<string, unknown>)
          : {};
      buttonMessageMap[buttonId] = messageId;
      void game.settings.set(this.context.moduleId, 'buttonMessageMap', buttonMessageMap);
    } catch (error) {
      console.error(`[${this.context.moduleId}] Error saving button-message mapping:`, error);
    }
  }

  getRollButtonMessageId(buttonId: string): string | null {
    try {
      const buttonMessageMapRaw: unknown = game.settings.get(
        this.context.moduleId,
        'buttonMessageMap'
      ) as unknown;
      const buttonMessageMap =
        buttonMessageMapRaw && typeof buttonMessageMapRaw === 'object'
          ? (buttonMessageMapRaw as Record<string, unknown>)
          : {};

      const messageId = buttonMessageMap[buttonId];
      return typeof messageId === 'string' ? messageId : null;
    } catch (error) {
      console.error(`[${this.context.moduleId}] Error getting button-message mapping:`, error);
      return null;
    }
  }

  getRollStateFromMessage(chatMessage: unknown, buttonId: string): RollButtonState | null {
    try {
      if (!chatMessage || typeof chatMessage !== 'object') {
        return null;
      }

      const typedMessage = chatMessage as ChatMessageLike;
      const rollButtonsRaw = typedMessage.getFlag(this.context.moduleId, 'rollButtons');
      if (!rollButtonsRaw || typeof rollButtonsRaw !== 'object') {
        return null;
      }

      const state = (rollButtonsRaw as Record<string, unknown>)[buttonId];
      return state && typeof state === 'object' ? (state as RollButtonState) : null;
    } catch (error) {
      console.error(`[${this.context.moduleId}] Error getting roll state from message:`, error);
      return null;
    }
  }

  async updateRollButtonMessage(
    buttonId: string,
    userId: string,
    rollLabel: string
  ): Promise<void> {
    try {
      const messageId = this.getRollButtonMessageId(buttonId);
      if (!messageId) {
        throw new Error(`No message ID found for button ${buttonId}`);
      }

      const messagesCollection = game.messages as
        | { get: (id: string) => unknown }
        | null
        | undefined;
      const chatMessageRaw = messagesCollection ? messagesCollection.get(messageId) : null;
      const chatMessage =
        chatMessageRaw && typeof chatMessageRaw === 'object'
          ? (chatMessageRaw as ChatMessageLike)
          : null;
      if (!chatMessage) {
        throw new Error(`ChatMessage ${messageId} not found`);
      }

      const usersCollection = getUsersCollection();
      const rolledByUser = usersCollection?.get?.(userId) ?? null;
      const rolledByName =
        rolledByUser && typeof rolledByUser === 'object' && 'name' in rolledByUser
          ? ((rolledByUser as UserLookupLike).name ?? 'Unknown')
          : 'Unknown';
      const timestamp = new Date().toLocaleString();

      const canUpdate = chatMessage.canUserModify(game.user, 'update');

      if (!canUpdate && !game.user?.isGM) {
        const onlineGMRaw =
          usersCollection?.find?.(candidate => {
            if (!candidate || typeof candidate !== 'object') {
              return false;
            }

            const gmCandidate = candidate as UserLookupLike;
            return gmCandidate.isGM === true && gmCandidate.active === true;
          }) ?? null;
        const onlineGM =
          onlineGMRaw && typeof onlineGMRaw === 'object' ? (onlineGMRaw as UserLookupLike) : null;
        if (!onlineGM) {
          throw new Error('No Game Master is online to update the chat message');
        }

        if (game.socket) {
          game.socket.emit('module.maeinomatic-foundry-mcp', {
            type: 'requestMessageUpdate',
            buttonId,
            userId,
            rollLabel,
            messageId,
            fromUserId: game.user.id,
            targetGM: onlineGM.id,
          });
          return;
        }

        throw new Error('Socket not available for GM communication');
      }

      const currentFlags =
        chatMessage.flags && typeof chatMessage.flags === 'object'
          ? chatMessage.flags
          : ({} as Record<string, unknown>);
      const moduleFlagsRaw = currentFlags[this.context.moduleId];
      const moduleFlags =
        moduleFlagsRaw && typeof moduleFlagsRaw === 'object'
          ? (moduleFlagsRaw as Record<string, unknown>)
          : {};
      const rollButtonsRaw = moduleFlags.rollButtons;
      const rollButtons =
        rollButtonsRaw && typeof rollButtonsRaw === 'object'
          ? (rollButtonsRaw as Record<string, RollButtonState>)
          : {};

      rollButtons[buttonId] = {
        ...rollButtons[buttonId],
        rolled: true,
        rolledBy: userId,
        rolledByName,
        timestamp: Date.now(),
      };

      const rolledHtml = `
        <div class="mcp-roll-request" style="margin: 10px 0; padding: 10px; border: 1px solid #ccc; border-radius: 5px; background: #f9f9f9;">
          <p><strong>Roll Request:</strong> ${rollLabel}</p>
          <p><strong>Status:</strong> âœ… <strong>Completed by ${rolledByName}</strong> at ${timestamp}</p>
        </div>
      `;

      await chatMessage.update({
        content: rolledHtml,
        flags: {
          ...currentFlags,
          [this.context.moduleId]: {
            ...moduleFlags,
            rollButtons,
          },
        },
      });
    } catch (error) {
      console.error(`[${this.context.moduleId}] Error updating roll button message:`, error);
      console.error(
        `[${this.context.moduleId}] Error stack:`,
        error instanceof Error ? error.stack : error
      );
      throw error;
    }
  }

  requestRollStateSave(buttonId: string, userId: string): void {
    try {
      this.updateRollButtonMessage(buttonId, userId, 'Legacy Roll')
        .then(() => {})
        .catch(error => {
          console.error(
            `[${this.context.moduleId}] Legacy requestRollStateSave redirect failed:`,
            error
          );
        });
    } catch (error) {
      console.error(
        `[${this.context.moduleId}] Error in legacy requestRollStateSave redirect:`,
        error
      );
    }
  }

  broadcastRollState(_buttonId: string, _rollState: unknown): void {
    // ChatMessage.update broadcasts to all clients, so no additional sync layer is needed here.
  }

  async cleanOldRollStates(): Promise<number> {
    this.context.validateFoundryState();

    try {
      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const rollStatesRaw: unknown = game.settings.get(
        this.context.moduleId,
        'rollStates'
      ) as unknown;
      const rollStates =
        rollStatesRaw && typeof rollStatesRaw === 'object'
          ? (rollStatesRaw as Record<string, unknown>)
          : {};
      let cleanedCount = 0;

      for (const [buttonId, rollState] of Object.entries(rollStates)) {
        if (rollState && typeof rollState === 'object' && 'timestamp' in rollState) {
          const timestamp = (rollState as { timestamp?: unknown }).timestamp;
          if (typeof timestamp === 'number' && timestamp < thirtyDaysAgo) {
            delete rollStates[buttonId];
            cleanedCount++;
          }
        }
      }

      if (cleanedCount > 0) {
        await game.settings.set(this.context.moduleId, 'rollStates', rollStates);
      }

      return cleanedCount;
    } catch (error) {
      console.error(`[${this.context.moduleId}] Error cleaning old roll states:`, error);
      return 0;
    }
  }

  private resolveTargetPlayer(targetPlayer: string): RollTargetResolution {
    const searchTerm = targetPlayer.toLowerCase().trim();
    const allUsers = getUserArray();
    const actors = getActorArray();

    let user = allUsers.find(
      candidate => typeof candidate.name === 'string' && candidate.name.toLowerCase() === searchTerm
    );

    if (user) {
      if (!user.active) {
        return {
          found: false,
          user,
          targetName: user.name ?? 'Unknown Player',
          errorType: 'PLAYER_OFFLINE',
          errorMessage: `Player "${user.name}" is registered but not currently logged in. They need to be online to receive roll requests.`,
        };
      }

      const playerCharacter =
        actors.find(
          actor => user && actor.testUserPermission?.(user, 'OWNER') && user.isGM !== true
        ) ?? undefined;

      return {
        found: true,
        user,
        ...(playerCharacter ? { character: playerCharacter } : {}),
        targetName: user.name ?? 'Unknown Player',
      };
    }

    user = allUsers.find(candidate => {
      return typeof candidate.name === 'string'
        ? candidate.name.toLowerCase().includes(searchTerm)
        : false;
    });

    if (user) {
      if (!user.active) {
        return {
          found: false,
          user,
          targetName: user.name ?? 'Unknown Player',
          errorType: 'PLAYER_OFFLINE',
          errorMessage: `Player "${user.name}" is registered but not currently logged in. They need to be online to receive roll requests.`,
        };
      }

      const playerCharacter =
        actors.find(
          actor => user && actor.testUserPermission?.(user, 'OWNER') && user.isGM !== true
        ) ?? undefined;

      return {
        found: true,
        user,
        ...(playerCharacter ? { character: playerCharacter } : {}),
        targetName: user.name ?? 'Unknown Player',
      };
    }

    let character =
      actors.find(
        actor =>
          typeof actor.name === 'string' &&
          actor.name.toLowerCase() === searchTerm &&
          actor.hasPlayerOwner === true
      ) ?? undefined;

    if (!character) {
      character =
        actors.find(
          actor =>
            typeof actor.name === 'string' &&
            actor.name.toLowerCase().includes(searchTerm) &&
            actor.hasPlayerOwner === true
        ) ?? undefined;
    }

    if (character) {
      const ownerCharacter = character;
      const ownerUser =
        allUsers.find(
          candidate =>
            ownerCharacter.testUserPermission?.(candidate, 'OWNER') && candidate.isGM !== true
        ) ?? undefined;

      if (ownerUser) {
        if (!ownerUser.active) {
          return {
            found: false,
            user: ownerUser,
            character,
            targetName: ownerUser.name ?? 'Unknown Player',
            errorType: 'PLAYER_OFFLINE',
            errorMessage: `Player "${ownerUser.name}" (owner of character "${character.name}") is registered but not currently logged in. They need to be online to receive roll requests.`,
          };
        }

        return {
          found: true,
          user: ownerUser,
          character,
          targetName: ownerUser.name ?? 'Unknown Player',
        };
      }

      return {
        found: true,
        character,
        targetName: character.name ?? 'Unknown Character',
      };
    }

    const anyCharacter =
      actors.find(actor => {
        if (typeof actor.name !== 'string') {
          return false;
        }

        return (
          actor.name.toLowerCase() === searchTerm || actor.name.toLowerCase().includes(searchTerm)
        );
      }) ?? undefined;

    if (anyCharacter && !anyCharacter.hasPlayerOwner) {
      return {
        found: true,
        character: anyCharacter,
        targetName: anyCharacter.name ?? 'Unknown Character',
      };
    }

    return {
      found: false,
      targetName: targetPlayer,
      errorType: 'PLAYER_NOT_FOUND',
      errorMessage: `No player or character named "${targetPlayer}" found. Available players: ${
        allUsers
          .filter(userCandidate => userCandidate.isGM !== true)
          .map(userCandidate => userCandidate.name ?? 'Unknown Player')
          .join(', ') || 'none'
      }`,
    };
  }

  private buildRollFormula(
    rollType: string,
    rollTarget: string,
    rollModifier: string,
    character?: ActorLookupLike
  ): string {
    let baseFormula = '1d20';

    if (character) {
      const getRollDataFn = character.getRollData;
      const rollDataRaw = typeof getRollDataFn === 'function' ? getRollDataFn.call(character) : {};
      const rollData =
        rollDataRaw && typeof rollDataRaw === 'object'
          ? (rollDataRaw as CharacterRollData)
          : ({} as CharacterRollData);

      switch (rollType) {
        case 'ability': {
          const abilityMod = rollData.abilities?.[rollTarget]?.mod ?? 0;
          baseFormula = `1d20+${abilityMod}`;
          break;
        }
        case 'skill': {
          const skillCode = this.getSkillCode(rollTarget);
          const skillMod = rollData.skills?.[skillCode]?.total ?? 0;
          baseFormula = `1d20+${skillMod}`;
          break;
        }
        case 'save': {
          const saveMod =
            rollData.abilities?.[rollTarget]?.save ?? rollData.abilities?.[rollTarget]?.mod ?? 0;
          baseFormula = `1d20+${saveMod}`;
          break;
        }
        case 'initiative': {
          const initMod = rollData.attributes?.init?.mod ?? rollData.abilities?.dex?.mod ?? 0;
          baseFormula = `1d20+${initMod}`;
          break;
        }
        case 'custom':
          baseFormula = rollTarget;
          break;
        default:
          baseFormula = '1d20';
      }
    } else {
      console.warn(
        `[${this.context.moduleId}] No character provided for roll formula, using base 1d20`
      );
    }

    if (rollModifier?.trim()) {
      const modifier =
        rollModifier.startsWith('+') || rollModifier.startsWith('-')
          ? rollModifier
          : `+${rollModifier}`;
      baseFormula += modifier;
    }

    return baseFormula;
  }

  private getSkillCode(skillName: string): string {
    const skillMap: Record<string, string> = {
      acrobatics: 'acr',
      'animal handling': 'ani',
      animalhandling: 'ani',
      arcana: 'arc',
      athletics: 'ath',
      deception: 'dec',
      history: 'his',
      insight: 'ins',
      intimidation: 'itm',
      investigation: 'inv',
      medicine: 'med',
      nature: 'nat',
      perception: 'prc',
      performance: 'prf',
      persuasion: 'per',
      religion: 'rel',
      'sleight of hand': 'slt',
      sleightofhand: 'slt',
      stealth: 'ste',
      survival: 'sur',
    };

    const normalizedName = skillName.toLowerCase().replace(/\s+/g, '');
    return skillMap[normalizedName] || skillMap[skillName.toLowerCase()] || skillName.toLowerCase();
  }

  private buildRollButtonLabel(rollType: string, rollTarget: string, isPublic: boolean): string {
    const visibility = isPublic ? 'Public' : 'Private';

    switch (rollType) {
      case 'ability':
        return `${rollTarget.toUpperCase()} Ability Check (${visibility})`;
      case 'skill':
        return `${rollTarget.charAt(0).toUpperCase() + rollTarget.slice(1)} Skill Check (${visibility})`;
      case 'save':
        return `${rollTarget.toUpperCase()} Saving Throw (${visibility})`;
      case 'attack':
        return `${rollTarget} Attack (${visibility})`;
      case 'initiative':
        return `Initiative Roll (${visibility})`;
      case 'custom':
        return `Custom Roll (${visibility})`;
      default:
        return `Roll (${visibility})`;
    }
  }

  private isRollButtonProcessing(buttonId: string): boolean {
    return this.rollButtonProcessingStates.get(buttonId) ?? false;
  }

  private setRollButtonProcessing(buttonId: string, processing: boolean): void {
    if (processing) {
      this.rollButtonProcessingStates.set(buttonId, true);
      return;
    }

    this.rollButtonProcessingStates.delete(buttonId);
  }
}
