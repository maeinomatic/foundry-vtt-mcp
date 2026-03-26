import { z } from 'zod';
import { FoundryClient } from '../../foundry-client.js';
import { Logger } from '../../logger.js';
import type {
  FoundryActorDocumentBase,
  FoundryCharacterEffect,
  UnknownRecord,
} from '../../foundry-types.js';

type ActorListEntry = Pick<FoundryActorDocumentBase, 'id' | 'name' | 'type' | 'img'>;

type CharacterItem = {
  id: string;
  name: string;
  type: string;
};

type CharacterAction = {
  name: string;
  type?: string;
  itemId?: string;
  traits?: string[];
  variants?: unknown[];
  ready?: boolean;
  description?: string;
};

type CharacterEffect = FoundryCharacterEffect<UnknownRecord> & {
  description?: string;
  traits?: string[];
  duration?: { type?: string; remaining?: number };
};

type CharacterInfoResponse = UnknownRecord & {
  id: string;
  name: string;
  type: string;
  items?: CharacterItem[];
  actions?: CharacterAction[];
  effects?: CharacterEffect[];
};

export interface CharacterReadServiceOptions {
  foundryClient: FoundryClient;
  logger: Logger;
  formatCharacterResponse: (characterData: unknown) => Promise<UnknownRecord>;
  formatCharacterItemDetails: (item: CharacterItem) => Promise<UnknownRecord>;
}

export class CharacterReadService {
  private foundryClient: FoundryClient;
  private logger: Logger;
  private formatCharacterResponse: (characterData: unknown) => Promise<UnknownRecord>;
  private formatCharacterItemDetails: (item: CharacterItem) => Promise<UnknownRecord>;

  constructor(options: CharacterReadServiceOptions) {
    this.foundryClient = options.foundryClient;
    this.logger = options.logger.child({ component: 'CharacterReadService' });
    this.formatCharacterResponse = options.formatCharacterResponse;
    this.formatCharacterItemDetails = options.formatCharacterItemDetails;
  }

  async handleGetCharacter(args: unknown): Promise<UnknownRecord> {
    const schema = z.object({
      identifier: z.string().min(1, 'Character identifier cannot be empty'),
    });

    const { identifier } = schema.parse(args);

    this.logger.info('Getting character information', { identifier });

    try {
      const characterData = await this.foundryClient.query<CharacterInfoResponse>(
        'maeinomatic-foundry-mcp.getCharacterInfo',
        {
          identifier,
        }
      );

      this.logger.debug('Successfully retrieved character data', {
        characterId: characterData.id,
        characterName: characterData.name,
      });

      return await this.formatCharacterResponse(characterData);
    } catch (error) {
      this.logger.error('Failed to get character information', error);
      throw new Error(
        `Failed to retrieve character "${identifier}": ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async handleGetCharacterEntity(args: unknown): Promise<UnknownRecord> {
    const schema = z.object({
      characterIdentifier: z.string().min(1, 'Character identifier cannot be empty'),
      entityIdentifier: z.string().min(1, 'Entity identifier cannot be empty'),
    });

    const { characterIdentifier, entityIdentifier } = schema.parse(args);

    this.logger.info('Getting character entity', { characterIdentifier, entityIdentifier });

    try {
      const characterData = await this.foundryClient.query<CharacterInfoResponse>(
        'maeinomatic-foundry-mcp.getCharacterInfo',
        {
          identifier: characterIdentifier,
        }
      );
      const normalizedEntityIdentifier = entityIdentifier.toLowerCase();

      const itemEntity = characterData.items?.find(
        item =>
          item.id === entityIdentifier || item.name.toLowerCase() === normalizedEntityIdentifier
      );
      if (itemEntity) {
        return {
          entityType: 'item',
          ...(await this.formatCharacterItemDetails(itemEntity)),
        };
      }

      const actionEntity = characterData.actions?.find(
        action => action.name.toLowerCase() === normalizedEntityIdentifier
      );
      if (actionEntity) {
        return {
          entityType: 'action',
          name: actionEntity.name,
          type: actionEntity.type,
          itemId: actionEntity.itemId,
          traits: actionEntity.traits ?? [],
          variants: actionEntity.variants ?? [],
          ready: actionEntity.ready,
          description: actionEntity.description ?? 'Action from character strikes/abilities',
        };
      }

      const effectEntity = characterData.effects?.find(
        effect => effect.name.toLowerCase() === normalizedEntityIdentifier
      );
      if (effectEntity) {
        return {
          ...effectEntity,
          entityType: 'effect',
          id: effectEntity.id,
          name: effectEntity.name,
          description: effectEntity.description ?? effectEntity.name,
          traits: effectEntity.traits ?? [],
          duration: effectEntity.duration,
        };
      }

      throw new Error(
        `Entity "${entityIdentifier}" not found on character "${characterIdentifier}". Tried items, actions, and effects.`
      );
    } catch (error) {
      this.logger.error('Failed to get character entity', error);
      throw new Error(
        `Failed to retrieve entity "${entityIdentifier}" from character "${characterIdentifier}": ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async handleListCharacters(args: unknown): Promise<UnknownRecord> {
    const schema = z.object({
      type: z.string().optional(),
    });

    const { type } = schema.parse(args);

    this.logger.info('Listing characters', { type });

    try {
      const actors = await this.foundryClient.query<ActorListEntry[]>(
        'maeinomatic-foundry-mcp.listActors',
        {
          type,
        }
      );

      this.logger.debug('Successfully retrieved character list', { count: actors.length });

      return {
        characters: actors.map(actor => ({
          id: actor.id,
          name: actor.name,
          type: actor.type,
          hasImage: !!actor.img,
        })),
        total: actors.length,
        filtered: type ? `Filtered by type: ${type}` : 'All characters',
      };
    } catch (error) {
      this.logger.error('Failed to list characters', error);
      throw new Error(
        `Failed to list characters: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
