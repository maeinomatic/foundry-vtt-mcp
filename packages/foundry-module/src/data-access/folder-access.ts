export type FoundryFolderType = 'Actor' | 'JournalEntry';

interface FolderLike {
  id?: string;
  name?: string;
  type?: string;
}

export async function getOrCreateFolder(
  moduleId: string,
  folderName: string,
  type: FoundryFolderType
): Promise<string | null> {
  try {
    const foldersRaw = game.folders as unknown;
    const folders = Array.isArray(foldersRaw) ? foldersRaw : [];

    const existingFolder = folders.find(folder => {
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
          ? 'Creatures and monsters created via Foundry MCP Bridge'
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
        'foundry-mcp-bridge': {
          mcpGenerated: true,
          createdAt: new Date().toISOString(),
          questContext: type === 'JournalEntry' ? folderName : undefined,
        },
      },
    };

    const folderCtor = Folder as unknown as {
      create: (data: Record<string, unknown>) => Promise<FolderLike | null>;
    };
    const folder = await folderCtor.create(folderData);
    return folder?.id ?? null;
  } catch (error) {
    console.warn(`[${moduleId}] Failed to create folder "${folderName}":`, error);
    return null;
  }
}
