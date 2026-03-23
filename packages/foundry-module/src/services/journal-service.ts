import { permissionManager } from '../permissions.js';
import type { FoundryJournalEntryResponse, FoundryJournalSummary } from '@maeinomatic/foundry-mcp-shared';
import { getOrCreateFolder } from './folder-service.js';

type AuditStatus = 'success' | 'failure';

interface JournalPageLike {
  type?: string;
  text?: { content?: string };
  update?: (data: Record<string, unknown>) => Promise<unknown>;
}

interface JournalEntryLike {
  id?: string;
  name?: string;
  pages?: { find: (predicate: (page: unknown) => boolean) => unknown };
  createEmbeddedDocuments?: (
    type: string,
    data: Array<Record<string, unknown>>
  ) => Promise<unknown>;
}

interface JournalCollectionLike {
  get?: (id: string) => unknown;
  [Symbol.iterator]?: () => Iterator<unknown>;
}

export interface JournalServiceContext {
  moduleId: string;
  validateFoundryState(): void;
  auditLog(action: string, data: unknown, status: AuditStatus, errorMessage?: string): void;
}

function getJournalCollection(): JournalCollectionLike | null {
  const collection = game.journal as unknown;
  return collection && typeof collection === 'object'
    ? (collection as JournalCollectionLike)
    : null;
}

function getJournalArray(): JournalEntryLike[] {
  const collection = getJournalCollection();
  return collection && Symbol.iterator in collection
    ? Array.from(collection as Iterable<unknown>).filter((journal): journal is JournalEntryLike =>
        Boolean(journal && typeof journal === 'object')
      )
    : [];
}

function findTextPage(journal: JournalEntryLike | null): JournalPageLike | null {
  const textPageRaw = journal?.pages?.find(page => {
    if (!page || typeof page !== 'object') {
      return false;
    }

    return (page as JournalPageLike).type === 'text';
  });

  return textPageRaw && typeof textPageRaw === 'object' ? (textPageRaw as JournalPageLike) : null;
}

export class FoundryJournalService {
  constructor(private readonly context: JournalServiceContext) {}

  async createJournalEntry(request: {
    name: string;
    content: string;
    folderName?: string;
  }): Promise<FoundryJournalEntryResponse> {
    this.context.validateFoundryState();

    const permissionCheck = permissionManager.checkWritePermission('createActor', {
      quantity: 1,
    });

    if (!permissionCheck.allowed) {
      throw new Error(`Journal creation denied: ${permissionCheck.reason}`);
    }

    try {
      const journalData = {
        name: request.name,
        pages: [
          {
            type: 'text',
            name: 'Quest Details',
            text: {
              content: request.content,
            },
          },
        ],
        ownership: { default: 0 },
        folder: await getOrCreateFolder(
          this.context.moduleId,
          request.folderName ?? request.name,
          'JournalEntry'
        ),
      };

      const journalApi = JournalEntry as unknown as {
        create: (data: Record<string, unknown>) => Promise<unknown>;
      };
      const journalRaw = await journalApi.create(journalData as Record<string, unknown>);
      const journal =
        journalRaw && typeof journalRaw === 'object' ? (journalRaw as JournalEntryLike) : null;

      if (!journal) {
        throw new Error('Failed to create journal entry');
      }

      const result = {
        id: journal.id ?? '',
        name: journal.name ?? request.name,
      };

      this.context.auditLog('createJournalEntry', request, 'success');
      return result;
    } catch (error) {
      this.context.auditLog(
        'createJournalEntry',
        request,
        'failure',
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw error;
    }
  }

  listJournals(): Promise<FoundryJournalSummary[]> {
    this.context.validateFoundryState();

    return Promise.resolve(
      getJournalArray().map(journal => ({
        id: journal.id ?? '',
        name: journal.name ?? '',
        type: 'JournalEntry',
      }))
    );
  }

  getJournalContent(journalId: string): Promise<FoundryJournalEntryResponse | null> {
    this.context.validateFoundryState();

    const journalRaw = getJournalCollection()?.get?.(journalId) ?? null;
    const journal =
      journalRaw && typeof journalRaw === 'object' ? (journalRaw as JournalEntryLike) : null;
    if (!journal) {
      return Promise.resolve(null);
    }

    const firstPage = findTextPage(journal);
    if (!firstPage) {
      return Promise.resolve({ content: '' });
    }

    return Promise.resolve({
      content: firstPage.text?.content ?? '',
    });
  }

  async updateJournalContent(request: {
    journalId: string;
    content: string;
  }): Promise<{ success: boolean }> {
    this.context.validateFoundryState();

    const permissionCheck = permissionManager.checkWritePermission('createActor', {
      quantity: 1,
    });

    if (!permissionCheck.allowed) {
      throw new Error(`Journal update denied: ${permissionCheck.reason}`);
    }

    try {
      const journalRaw = getJournalCollection()?.get?.(request.journalId) ?? null;
      const journal =
        journalRaw && typeof journalRaw === 'object' ? (journalRaw as JournalEntryLike) : null;
      if (!journal) {
        throw new Error('Journal entry not found');
      }

      const firstPage = findTextPage(journal);
      if (firstPage?.update) {
        await firstPage.update({
          'text.content': request.content,
        });
      } else if (journal.createEmbeddedDocuments) {
        await journal.createEmbeddedDocuments('JournalEntryPage', [
          {
            type: 'text',
            name: 'Quest Details',
            text: {
              content: request.content,
            },
          },
        ]);
      } else {
        throw new Error('Journal entry does not support embedded page creation');
      }

      this.context.auditLog('updateJournalContent', request, 'success');
      return { success: true };
    } catch (error) {
      this.context.auditLog(
        'updateJournalContent',
        request,
        'failure',
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw error;
    }
  }
}
