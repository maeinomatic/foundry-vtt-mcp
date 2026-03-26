import type {
  FoundryJournalEntryResponse,
  FoundryJournalSummary,
} from '@maeinomatic/foundry-mcp-shared';

import type { FoundryModuleFacade } from '../foundry-module-facade.js';

export type QueryErrorResult = { error: string; success: false; status?: string };

type CreateJournalEntryRequest = {
  name: string;
  content: string;
};

type GetJournalContentRequest = {
  journalId: string;
};

type UpdateJournalContentRequest = {
  journalId: string;
  content: string;
};

export interface JournalQueryHandlersOptions {
  dataAccess: FoundryModuleFacade;
}

export class JournalQueryHandlers {
  private dataAccess: FoundryModuleFacade;

  constructor(options: JournalQueryHandlersOptions) {
    this.dataAccess = options.dataAccess;
  }

  private validateGMAccess(): { allowed: boolean } {
    if (!game.user?.isGM) {
      return { allowed: false };
    }

    return { allowed: true };
  }

  async handleCreateJournalEntry(
    data: CreateJournalEntryRequest
  ): Promise<FoundryJournalEntryResponse | QueryErrorResult> {
    try {
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      if (!data.name) {
        throw new Error('name is required');
      }
      if (!data.content) {
        throw new Error('content is required');
      }

      return await this.dataAccess.createJournalEntry({
        name: data.name,
        content: data.content,
      });
    } catch (error) {
      throw new Error(
        `Failed to create journal entry: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async handleListJournals(): Promise<FoundryJournalSummary[] | QueryErrorResult> {
    try {
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();
      return await this.dataAccess.listJournals();
    } catch (error) {
      throw new Error(
        `Failed to list journals: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async handleGetJournalContent(
    data: GetJournalContentRequest
  ): Promise<FoundryJournalEntryResponse | QueryErrorResult> {
    try {
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      if (!data.journalId) {
        throw new Error('journalId is required');
      }

      const journalContent = await this.dataAccess.getJournalContent(data.journalId);
      if (!journalContent) {
        return { error: 'Journal entry not found', success: false };
      }

      return journalContent;
    } catch (error) {
      throw new Error(
        `Failed to get journal content: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async handleUpdateJournalContent(data: UpdateJournalContentRequest): Promise<unknown> {
    try {
      const gmCheck = this.validateGMAccess();
      if (!gmCheck.allowed) {
        return { error: 'Access denied', success: false };
      }

      this.dataAccess.validateFoundryState();

      if (!data.journalId) {
        throw new Error('journalId is required');
      }
      if (!data.content) {
        throw new Error('content is required');
      }

      return await this.dataAccess.updateJournalContent({
        journalId: data.journalId,
        content: data.content,
      });
    } catch (error) {
      throw new Error(
        `Failed to update journal content: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
