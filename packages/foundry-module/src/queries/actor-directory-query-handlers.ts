import type { FoundryModuleFacade } from '../foundry-module-facade.js';

export type QueryErrorResult = { error: string; success: false; status?: string };

type FindPlayersRequest = {
  identifier: string;
  allowPartialMatch?: boolean;
  includeCharacterOwners?: boolean;
};

type FindActorRequest = { identifier: string };

type SetActorOwnershipRequest = {
  actorId: string;
  userId: string;
  permission: number;
};

type GetActorOwnershipRequest = {
  actorIdentifier?: string;
  playerIdentifier?: string;
};

export interface ActorDirectoryQueryHandlersOptions {
  dataAccess: FoundryModuleFacade;
}

export class ActorDirectoryQueryHandlers {
  private dataAccess: FoundryModuleFacade;

  constructor(options: ActorDirectoryQueryHandlersOptions) {
    this.dataAccess = options.dataAccess;
  }

  private validateGMAccess(): { allowed: boolean } {
    if (!game.user?.isGM) {
      return { allowed: false };
    }

    return { allowed: true };
  }

  async handleSetActorOwnership(data: SetActorOwnershipRequest): Promise<unknown> {
    try {
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      if (!data.actorId || !data.userId || data.permission === undefined) {
        throw new Error('actorId, userId, and permission are required');
      }

      return await this.dataAccess.setActorOwnership(data);
    } catch (error) {
      throw new Error(
        `Failed to set actor ownership: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async handleGetActorOwnership(data: GetActorOwnershipRequest): Promise<unknown> {
    try {
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      const actorOwnership = (await this.dataAccess.getActorOwnership(data)) as unknown;
      return actorOwnership;
    } catch (error) {
      throw new Error(
        `Failed to get actor ownership: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async handleGetFriendlyNPCs(): Promise<unknown> {
    try {
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      return this.dataAccess.getFriendlyNPCs();
    } catch (error) {
      throw new Error(
        `Failed to get friendly NPCs: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async handleGetPartyCharacters(): Promise<unknown> {
    try {
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      return this.dataAccess.getPartyCharacters();
    } catch (error) {
      throw new Error(
        `Failed to get party characters: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async handleGetConnectedPlayers(): Promise<unknown> {
    try {
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      return await this.dataAccess.getConnectedPlayers();
    } catch (error) {
      throw new Error(
        `Failed to get connected players: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async handleFindPlayers(
    data: FindPlayersRequest
  ): Promise<Array<{ id: string; name: string }> | QueryErrorResult> {
    try {
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      if (!data.identifier) {
        throw new Error('identifier is required');
      }

      return await this.dataAccess.findPlayers(data);
    } catch (error) {
      throw new Error(
        `Failed to find players: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async handleFindActor(
    data: FindActorRequest
  ): Promise<{ id: string; name: string } | null | QueryErrorResult> {
    try {
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      if (!data.identifier) {
        throw new Error('identifier is required');
      }

      return await this.dataAccess.findActor(data);
    } catch (error) {
      throw new Error(
        `Failed to find actor: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
