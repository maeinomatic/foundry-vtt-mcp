import { ERROR_MESSAGES } from '../constants.js';
import { permissionManager } from '../permissions.js';
import { transactionManager } from '../transaction-manager.js';
import { getOrCreateFolder } from './folder-service.js';
import type {
  FoundryActorCreationResult,
  FoundryCreateActorFromCompendiumRequest,
  FoundryCompendiumSearchResult,
  FoundryCompendiumEntryFull,
  FoundryCreatedActorInfo,
  FoundryTokenPlacementOptions,
} from '@foundry-mcp/shared';

type AuditStatus = 'success' | 'failure';

export interface ActorCreationRequest {
  creatureType: string;
  customNames?: string[] | undefined;
  packPreference?: string | undefined;
  quantity?: number | undefined;
  addToScene?: boolean | undefined;
}

export interface CompendiumEntryActorCreationRequest
  extends FoundryCreateActorFromCompendiumRequest {
  customNames: string[];
}

export type ActorCreationResult = FoundryActorCreationResult;

type CreatedActorInfo = FoundryCreatedActorInfo;

type CompendiumEntryFull = FoundryCompendiumEntryFull<
  Record<string, unknown>,
  Record<string, unknown>,
  Record<string, unknown>
>;

type CompendiumSearchResult = FoundryCompendiumSearchResult<Record<string, unknown>>;

export interface SceneTokenPlacement {
  actorIds: string[];
  placement: 'random' | 'grid' | 'center' | 'coordinates';
  hidden: boolean;
  coordinates?: FoundryTokenPlacementOptions['coordinates'];
}

export interface TokenPlacementResult {
  success: boolean;
  tokensCreated: number;
  tokenIds: string[];
  errors?: string[] | undefined;
}

interface SceneListItem {
  id?: string;
  name?: string;
  width?: number;
  height?: number;
  grid?: { size?: number };
}

interface ScenePlacementLike extends SceneListItem {
  createEmbeddedDocuments: (type: string, data: Record<string, unknown>[]) => Promise<unknown>;
}

interface ActorCreationLookupLike {
  id?: string;
  name?: string;
  type?: string;
  img?: string;
  prototypeToken?: { toObject?: () => unknown };
}

interface CompendiumDocumentLike {
  id?: string;
  name?: string;
  type?: string;
  documentName?: string;
  toObject: () => unknown;
}

interface CompendiumPackLookupLike {
  metadata?: { label?: string };
  getDocument: (id: string) => Promise<unknown>;
}

interface ActorCollectionLike {
  get: (id: string) => unknown;
}

interface MutableActorData extends Record<string, unknown> {
  _id?: string;
  folder?: string | null;
  sort?: number;
  name?: string;
  type?: string;
  img?: string;
  system?: unknown;
  data?: unknown;
  items?: unknown[];
  effects?: unknown[];
  prototypeToken?: { texture?: { src?: string | null } };
}

interface TokenDocumentLike extends Record<string, unknown> {
  texture?: { src?: string | null };
}

export interface ActorCreationServiceContext {
  moduleId: string;
  validateFoundryState(): void;
  auditLog(action: string, data: unknown, status: AuditStatus, errorMessage?: string): void;
  getCompendiumDocumentFull(packId: string, documentId: string): Promise<CompendiumEntryFull>;
  searchCompendium(query: string, packType?: string): Promise<CompendiumSearchResult[]>;
}

function createCreatedActorInfo(data: {
  id: string;
  name: string;
  originalName: string;
  type: string;
  sourcePackId: string;
  sourcePackLabel: string;
  img?: string;
}): CreatedActorInfo {
  return {
    id: data.id,
    name: data.name,
    originalName: data.originalName,
    type: data.type,
    sourcePackId: data.sourcePackId,
    sourcePackLabel: data.sourcePackLabel,
    ...(data.img ? { img: data.img } : {}),
  };
}

function getCurrentScene(): ScenePlacementLike | null {
  const sceneRaw = (game as { scenes?: { current?: unknown } }).scenes?.current;
  return sceneRaw && typeof sceneRaw === 'object' ? (sceneRaw as ScenePlacementLike) : null;
}

function getActorsCollection(): ActorCollectionLike | null {
  const actors = (game as { actors?: unknown }).actors;
  return actors && typeof actors === 'object' ? (actors as ActorCollectionLike) : null;
}

function getCompendiumPack(packId: string): CompendiumPackLookupLike | null {
  const packs = (game as { packs?: { get?: (id: string) => unknown } }).packs;
  if (!packs || typeof packs.get !== 'function') {
    return null;
  }

  const pack = packs.get(packId);
  return pack && typeof pack === 'object' ? (pack as CompendiumPackLookupLike) : null;
}

function calculateTokenPosition(
  placement: SceneTokenPlacement['placement'],
  scene: SceneListItem,
  index: number,
  coordinates?: { x: number; y: number }[]
): { x: number; y: number } {
  const gridSize = scene.grid?.size ?? 100;
  const sceneWidth = scene.width ?? 0;
  const sceneHeight = scene.height ?? 0;

  switch (placement) {
    case 'coordinates':
      if (coordinates?.[index]) {
        return coordinates[index];
      }
      {
        const fallbackCols = Math.ceil(Math.sqrt(index + 1));
        const fallbackRow = Math.floor(index / fallbackCols);
        const fallbackCol = index % fallbackCols;
        return {
          x: gridSize + fallbackCol * gridSize * 2,
          y: gridSize + fallbackRow * gridSize * 2,
        };
      }

    case 'center':
      return {
        x: sceneWidth / 2 + index * gridSize,
        y: sceneHeight / 2,
      };

    case 'grid': {
      const cols = Math.ceil(Math.sqrt(index + 1));
      const row = Math.floor(index / cols);
      const col = index % cols;
      return {
        x: gridSize + col * gridSize * 2,
        y: gridSize + row * gridSize * 2,
      };
    }

    case 'random':
    default:
      return {
        x: Math.random() * Math.max(sceneWidth - gridSize, 0),
        y: Math.random() * Math.max(sceneHeight - gridSize, 0),
      };
  }
}

export class FoundryActorCreationService {
  constructor(private readonly context: ActorCreationServiceContext) {}

  async createActorFromCompendium(request: ActorCreationRequest): Promise<ActorCreationResult> {
    this.context.validateFoundryState();

    const permissionCheck = permissionManager.checkWritePermission('createActor', {
      quantity: request.quantity ?? 1,
    });

    if (!permissionCheck.allowed) {
      throw new Error(`${ERROR_MESSAGES.ACCESS_DENIED}: ${permissionCheck.reason}`);
    }

    permissionManager.auditPermissionCheck(
      'createActor',
      permissionCheck,
      request as unknown as Record<string, unknown>
    );

    const maxActors = game.settings.get(this.context.moduleId, 'maxActorsPerRequest') as number;
    const quantity = Math.min(request.quantity ?? 1, maxActors);
    const transactionId = transactionManager.startTransaction(
      `Create ${quantity} actor(s) from compendium: ${request.creatureType}`
    );

    try {
      const compendiumEntry = await this.findBestCompendiumMatch(
        request.creatureType,
        request.packPreference
      );
      if (!compendiumEntry) {
        throw new Error(`No compendium entry found for "${request.creatureType}"`);
      }

      const sourceDoc = await this.context.getCompendiumDocumentFull(
        compendiumEntry.pack,
        compendiumEntry.id
      );

      const createdActors: CreatedActorInfo[] = [];
      const errors: string[] = [];

      for (let i = 0; i < quantity; i++) {
        try {
          const customName =
            request.customNames?.[i] ??
            (quantity > 1 ? `${sourceDoc.name} ${i + 1}` : sourceDoc.name);

          const newActor = await this.createActorFromSource(sourceDoc, customName);
          const actorId = newActor.id ?? '';

          transactionManager.addAction(
            transactionId,
            transactionManager.createActorCreationAction(actorId)
          );

          createdActors.push(
            createCreatedActorInfo({
              id: actorId,
              name: newActor.name ?? customName,
              originalName: sourceDoc.name,
              type: newActor.type ?? 'unknown',
              sourcePackId: compendiumEntry.pack,
              sourcePackLabel: compendiumEntry.packLabel,
              ...(typeof newActor.img === 'string' ? { img: newActor.img } : {}),
            })
          );
        } catch (error) {
          errors.push(
            `Failed to create actor ${i + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        }
      }

      let tokensPlaced = 0;

      if (request.addToScene && createdActors.length > 0) {
        try {
          const scenePermissionCheck = permissionManager.checkWritePermission('modifyScene', {
            targetIds: createdActors.map(actor => actor.id),
          });

          if (!scenePermissionCheck.allowed) {
            errors.push(`Cannot add to scene: ${scenePermissionCheck.reason}`);
          } else {
            const tokenResult = await this.addActorsToScene(
              {
                actorIds: createdActors.map(actor => actor.id),
                placement: 'random',
                hidden: false,
              },
              transactionId
            );
            tokensPlaced = tokenResult.tokensCreated;
          }
        } catch (error) {
          errors.push(
            `Failed to add actors to scene: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        }
      }

      if (
        errors.length > 0 &&
        createdActors.length < quantity &&
        createdActors.length < quantity / 2
      ) {
        console.warn(
          `[${this.context.moduleId}] Rolling back due to significant failures (${createdActors.length}/${quantity} created)`
        );
        await transactionManager.rollbackTransaction(transactionId);
        throw new Error(`Actor creation failed: ${errors.join(', ')}`);
      }

      transactionManager.commitTransaction(transactionId);

      const result: ActorCreationResult = {
        success: createdActors.length > 0,
        actors: createdActors,
        ...(errors.length > 0 ? { errors } : {}),
        tokensPlaced,
        totalRequested: quantity,
        totalCreated: createdActors.length,
      };

      this.context.auditLog('createActorFromCompendium', request, 'success');
      return result;
    } catch (error) {
      try {
        await transactionManager.rollbackTransaction(transactionId);
      } catch (rollbackError) {
        console.error(`[${this.context.moduleId}] Failed to rollback transaction:`, rollbackError);
      }

      this.context.auditLog(
        'createActorFromCompendium',
        request,
        'failure',
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw error;
    }
  }

  async createActorFromCompendiumEntry(
    request: CompendiumEntryActorCreationRequest
  ): Promise<ActorCreationResult> {
    this.context.validateFoundryState();

    try {
      const { packId, itemId, customNames, quantity = 1, addToScene = false, placement } = request;

      if (!packId || !itemId) {
        throw new Error('Both packId and itemId are required');
      }

      const pack = getCompendiumPack(packId);
      if (!pack) {
        throw new Error(`Compendium pack "${packId}" not found`);
      }

      const sourceDocumentRaw = await pack.getDocument(itemId);
      const sourceDocument =
        sourceDocumentRaw && typeof sourceDocumentRaw === 'object'
          ? (sourceDocumentRaw as CompendiumDocumentLike)
          : null;
      if (!sourceDocument) {
        throw new Error(`Document "${itemId}" not found in pack "${packId}"`);
      }

      if (sourceDocument.documentName !== 'Actor') {
        throw new Error(
          `Document "${itemId}" is not an Actor (documentName: ${sourceDocument.documentName}, type: ${sourceDocument.type})`
        );
      }

      const validActorTypes = ['character', 'npc', 'creature'];
      const sourceDocumentType = sourceDocument.type ?? 'unknown';
      if (!validActorTypes.includes(sourceDocumentType)) {
        throw new Error(
          `Document "${itemId}" has unsupported actor type: ${sourceDocument.type}. Supported types: ${validActorTypes.join(', ')}`
        );
      }

      const sourceActorName = sourceDocument.name ?? 'Unknown Actor';
      const names = customNames.length > 0 ? customNames : [`${sourceActorName} Copy`];
      const finalQuantity = Math.min(quantity, names.length);

      const createdActors: CreatedActorInfo[] = [];
      const errors: string[] = [];

      for (let i = 0; i < finalQuantity; i++) {
        try {
          const customName = names[i] ?? `${sourceActorName} ${i + 1}`;
          const sourceDataRaw = sourceDocument.toObject();
          const sourceData: MutableActorData =
            sourceDataRaw && typeof sourceDataRaw === 'object'
              ? (sourceDataRaw as MutableActorData)
              : {};
          const actorData: MutableActorData = {
            name: customName,
            ...(typeof sourceData.type === 'string' ? { type: sourceData.type } : {}),
            ...(typeof sourceData.img === 'string' ? { img: sourceData.img } : {}),
            system: sourceData.system ?? sourceData.data ?? {},
            items: sourceData.items ?? [],
            effects: sourceData.effects ?? [],
            folder: null,
            ...(sourceData.prototypeToken ? { prototypeToken: sourceData.prototypeToken } : {}),
          };

          if (actorData.prototypeToken?.texture?.src?.startsWith('http')) {
            actorData.prototypeToken.texture.src = null;
          }

          const folderId = await getOrCreateFolder(
            this.context.moduleId,
            'Foundry MCP Creatures',
            'Actor'
          );
          if (folderId) {
            actorData.folder = folderId;
          }

          const actorApi = Actor as unknown as {
            create: (data: Record<string, unknown>) => Promise<unknown>;
          };
          const newActorRaw = await actorApi.create(actorData as Record<string, unknown>);
          const newActor =
            newActorRaw && typeof newActorRaw === 'object'
              ? (newActorRaw as { id?: string; name?: string })
              : null;
          if (!newActor) {
            throw new Error(`Failed to create actor "${customName}"`);
          }

          createdActors.push(
            createCreatedActorInfo({
              id: newActor.id ?? '',
              name: newActor.name ?? customName,
              originalName: sourceActorName,
              type: sourceDocument.type ?? 'unknown',
              sourcePackId: packId,
              sourcePackLabel: pack.metadata?.label ?? '',
            })
          );
        } catch (error) {
          const errorMessage = `Failed to create actor ${i + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          errors.push(errorMessage);
          console.error(`[${this.context.moduleId}] ${errorMessage}`, error);
        }
      }

      let tokensPlaced = 0;
      if (addToScene && createdActors.length > 0) {
        try {
          const sceneResult = await this.addActorsToScene({
            actorIds: createdActors.map(actor => actor.id),
            placement: placement?.type ?? 'grid',
            hidden: false,
            ...(placement?.coordinates ? { coordinates: placement.coordinates } : {}),
          });
          tokensPlaced = sceneResult.success ? sceneResult.tokensCreated : 0;
        } catch (error) {
          errors.push(
            `Failed to add actors to scene: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        }
      }

      const result: ActorCreationResult = {
        success: createdActors.length > 0,
        totalCreated: createdActors.length,
        totalRequested: finalQuantity,
        actors: createdActors,
        tokensPlaced,
        ...(errors.length > 0 ? { errors } : {}),
      };

      this.context.auditLog('createActorFromCompendiumEntry', request, 'success');
      return result;
    } catch (error) {
      console.error(
        `[${this.context.moduleId}] Failed to create actor from compendium entry`,
        error
      );
      this.context.auditLog(
        'createActorFromCompendiumEntry',
        request,
        'failure',
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw error;
    }
  }

  async addActorsToScene(
    placement: SceneTokenPlacement,
    transactionId?: string
  ): Promise<TokenPlacementResult> {
    this.context.validateFoundryState();

    const permissionCheck = permissionManager.checkWritePermission('modifyScene', {
      targetIds: placement.actorIds,
    });

    if (!permissionCheck.allowed) {
      throw new Error(`${ERROR_MESSAGES.ACCESS_DENIED}: ${permissionCheck.reason}`);
    }

    permissionManager.auditPermissionCheck(
      'modifyScene',
      permissionCheck,
      placement as unknown as Record<string, unknown>
    );

    const scene = getCurrentScene();
    if (!scene) {
      throw new Error('No active scene found');
    }

    try {
      const tokenData: Record<string, unknown>[] = [];
      const errors: string[] = [];
      const actors = getActorsCollection();

      for (const actorId of placement.actorIds) {
        try {
          const actorRaw = actors ? actors.get(actorId) : null;
          const actor =
            actorRaw && typeof actorRaw === 'object' ? (actorRaw as ActorCreationLookupLike) : null;
          if (!actor) {
            errors.push(`Actor ${actorId} not found`);
            continue;
          }

          const tokenDocRaw = actor.prototypeToken?.toObject?.();
          const tokenDoc: TokenDocumentLike =
            tokenDocRaw && typeof tokenDocRaw === 'object'
              ? (tokenDocRaw as TokenDocumentLike)
              : {};
          const position = calculateTokenPosition(
            placement.placement,
            scene,
            tokenData.length,
            placement.coordinates
          );

          if (tokenDoc.texture?.src?.startsWith('http')) {
            console.error(
              `[${this.context.moduleId}] Token texture still has remote URL, clearing: ${tokenDoc.texture.src}`
            );
            tokenDoc.texture.src = null;
          }

          tokenData.push({
            ...tokenDoc,
            x: position.x,
            y: position.y,
            actorId,
            hidden: placement.hidden,
          });
        } catch (error) {
          errors.push(
            `Failed to prepare token for actor ${actorId}: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        }
      }

      const createdTokensRaw = await scene.createEmbeddedDocuments('Token', tokenData);
      const createdTokens = Array.isArray(createdTokensRaw)
        ? createdTokensRaw.filter((token): token is { id?: string } =>
            Boolean(token && typeof token === 'object')
          )
        : [];

      if (transactionId && createdTokens.length > 0) {
        for (const token of createdTokens) {
          if (token.id) {
            transactionManager.addAction(
              transactionId,
              transactionManager.createTokenCreationAction(token.id)
            );
          }
        }
      }

      const result: TokenPlacementResult = {
        success: createdTokens.length > 0,
        tokensCreated: createdTokens.length,
        tokenIds: createdTokens
          .map(token => token.id)
          .filter((id): id is string => typeof id === 'string' && id.length > 0),
        ...(errors.length > 0 ? { errors } : {}),
      };

      this.context.auditLog('addActorsToScene', placement, 'success');
      return result;
    } catch (error) {
      this.context.auditLog(
        'addActorsToScene',
        placement,
        'failure',
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw error;
    }
  }

  private async findBestCompendiumMatch(
    creatureType: string,
    packPreference?: string
  ): Promise<CompendiumSearchResult | null> {
    const exactResults = await this.context.searchCompendium(creatureType, 'Actor');
    const exactMatch = exactResults.find(
      result => result.name.toLowerCase() === creatureType.toLowerCase()
    );
    if (exactMatch) {
      return exactMatch;
    }

    if (packPreference) {
      const packMatch = exactResults.find(result => result.pack === packPreference);
      if (packMatch) {
        return packMatch;
      }
    }

    return exactResults.length > 0 ? exactResults[0] : null;
  }

  private async createActorFromSource(
    sourceDoc: CompendiumEntryFull,
    customName: string
  ): Promise<ActorCreationLookupLike> {
    try {
      const deepCloneFn = (
        foundry as unknown as { utils?: { deepClone?: (value: unknown) => unknown } }
      ).utils?.deepClone;
      const actorDataRaw =
        typeof deepCloneFn === 'function' ? deepCloneFn(sourceDoc.fullData) : sourceDoc.fullData;
      const actorData: MutableActorData =
        actorDataRaw && typeof actorDataRaw === 'object' ? (actorDataRaw as MutableActorData) : {};

      actorData.name = customName;

      if (actorData.prototypeToken?.texture?.src?.startsWith('http')) {
        console.error(
          `[${this.context.moduleId}] Removing remote token texture URL: ${actorData.prototypeToken.texture.src}`
        );
        actorData.prototypeToken.texture.src = null;
      }

      delete actorData._id;
      delete actorData.folder;
      delete actorData.sort;

      if (!actorData.name) {
        actorData.name = customName;
      }
      if (!actorData.type) {
        actorData.type = sourceDoc.type ?? 'npc';
      }

      const folderId = await getOrCreateFolder(
        this.context.moduleId,
        'Foundry MCP Creatures',
        'Actor'
      );
      if (folderId) {
        actorData.folder = folderId;
      }

      const actorApi = Actor as unknown as {
        createDocuments: (docs: Array<Record<string, unknown>>) => Promise<unknown>;
      };
      const createdDocsRaw = await actorApi.createDocuments([actorData as Record<string, unknown>]);
      const createdDocs = Array.isArray(createdDocsRaw)
        ? createdDocsRaw.filter((candidate): candidate is ActorCreationLookupLike =>
            Boolean(candidate && typeof candidate === 'object')
          )
        : [];
      if (createdDocs.length === 0) {
        throw new Error('Failed to create actor document');
      }

      return createdDocs[0];
    } catch (error) {
      console.error(`[${this.context.moduleId}] Actor creation failed:`, error);
      throw error;
    }
  }
}
