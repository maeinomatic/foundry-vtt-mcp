import type { FoundryModuleFacade } from '../foundry-module-facade.js';

export type QueryErrorResult = { error: string; success: false; status?: string };

type RequestPlayerRollsRequest = {
  rollType: string;
  rollTarget: string;
  targetPlayer: string;
  isPublic: boolean;
  rollModifier: string;
  flavor: string;
};

type UpdateCampaignProgressRequest = {
  campaignId: string;
  partId: string;
  newStatus: string;
};

export interface UtilityQueryHandlersOptions {
  dataAccess: FoundryModuleFacade;
}

export class UtilityQueryHandlers {
  private dataAccess: FoundryModuleFacade;

  constructor(options: UtilityQueryHandlersOptions) {
    this.dataAccess = options.dataAccess;
  }

  private validateGMAccess(): { allowed: boolean } {
    if (!game.user?.isGM) {
      return { allowed: false };
    }

    return { allowed: true };
  }

  async handleRequestPlayerRolls(data: RequestPlayerRollsRequest): Promise<unknown> {
    try {
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      if (!data.rollType || !data.rollTarget || !data.targetPlayer) {
        throw new Error('rollType, rollTarget, and targetPlayer are required');
      }

      return await this.dataAccess.requestPlayerRolls(data);
    } catch (error) {
      throw new Error(
        `Failed to request player rolls: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async handleGetEnhancedCreatureIndex(): Promise<unknown> {
    try {
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();
      return (await this.dataAccess.getEnhancedCreatureIndex()) as unknown;
    } catch (error) {
      throw new Error(
        `Failed to get enhanced creature index: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  handleUpdateCampaignProgress(data: UpdateCampaignProgressRequest): unknown {
    try {
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      return {
        success: true,
        message: `Campaign progress updated: ${data.partId} is now ${data.newStatus}`,
        campaignId: data.campaignId,
        partId: data.partId,
        newStatus: data.newStatus,
      };
    } catch (error) {
      throw new Error(
        `Failed to update campaign progress: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
