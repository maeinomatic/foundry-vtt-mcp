export type FoundryFolderType = 'Actor' | 'JournalEntry';

interface FolderLike {
  id?: string;
  name?: string;
  type?: string;
}

interface FolderCollectionLike {
  contents?: unknown[];
  toArray?: () => unknown[];
}

const pendingFolderResolutions = new Map<string, Promise<string | null>>();

function listFolders(): unknown[] {
  const foldersRaw = game.folders as unknown;
  if (Array.isArray(foldersRaw)) {
    return foldersRaw;
  }

  if (foldersRaw && typeof foldersRaw === 'object') {
    const typedFolders = foldersRaw as FolderCollectionLike;
    if (Array.isArray(typedFolders.contents)) {
      return typedFolders.contents;
    }

    if (typeof typedFolders.toArray === 'function') {
      return typedFolders.toArray();
    }
  }

  return [];
}

export async function getOrCreateFolder(
  moduleId: string,
  folderName: string,
  type: FoundryFolderType
): Promise<string | null> {
  const key = `${moduleId}:${type}:${folderName.toLowerCase()}`;
  const existingResolution = pendingFolderResolutions.get(key);
  if (existingResolution) {
    return existingResolution;
  }

  const resolveFolderPromise = (async (): Promise<string | null> => {
    try {
      const existingFolder = listFolders().find(folder => {
        if (!folder || typeof folder !== 'object') {
          return false;
        }

        const typedFolder = folder as FolderLike;
        return typedFolder.name === folderName && typedFolder.type === type;
      }) as FolderLike | undefined;

      if (existingFolder) {
        return existingFolder.id ?? null;
      }

      const description =
        type === 'Actor'
          ? folderName === 'Foundry MCP Creatures'
            ? 'Creatures and monsters created via Maeinomatic Foundry MCP Bridge'
            : `NPCs and creatures related to: ${folderName}`
          : `Quest and content for: ${folderName}`;

      const folderData = {
        name: folderName,
        type,
        description,
        color: type === 'Actor' ? '#4a90e2' : '#f39c12',
        sort: 0,
        parent: null,
        flags: {
          'maeinomatic-foundry-mcp': {
            mcpGenerated: true,
            createdAt: new Date().toISOString(),
            questContext: type === 'JournalEntry' ? folderName : undefined,
          },
        },
      };

      const folderCtor = Folder as unknown as {
        create: (data: Record<string, unknown>) => Promise<FolderLike | null>;
      };
      const createdFolder = await folderCtor.create(folderData);
      if (createdFolder?.id) {
        return createdFolder.id;
      }

      const fallbackExistingFolder = listFolders().find(folder => {
        if (!folder || typeof folder !== 'object') {
          return false;
        }

        const typedFolder = folder as FolderLike;
        return typedFolder.name === folderName && typedFolder.type === type;
      }) as FolderLike | undefined;

      return fallbackExistingFolder?.id ?? null;
    } catch (error) {
      console.warn(`[${moduleId}] Failed to create folder "${folderName}":`, error);
      return null;
    }
  })();

  pendingFolderResolutions.set(key, resolveFolderPromise);
  try {
    return await resolveFolderPromise;
  } finally {
    pendingFolderResolutions.delete(key);
  }
}
