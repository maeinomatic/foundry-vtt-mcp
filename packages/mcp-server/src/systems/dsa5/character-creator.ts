import { z } from 'zod';
import { FoundryClient } from '../../foundry-client.js';
import type {
  FoundryActorCreationResult,
  FoundryCompendiumDocumentBase,
  FoundryCompendiumEntryFull,
  FoundryCompendiumPackSummary,
  UnknownRecord,
} from '../../foundry-types.js';
import { Logger } from '../../logger.js';
import { ErrorHandler } from '../../utils/error-handler.js';
import type { DSA5ActorSystemData, DSA5ItemSystemData } from '../types.js';

export interface DSA5CharacterCreatorOptions {
  foundryClient: FoundryClient;
  logger: Logger;
}

interface Dsa5Customization {
  age?: number;
  biography?: string;
  gender?: 'male' | 'female' | 'diverse';
  eyeColor?: string;
  hairColor?: string;
  height?: number;
  weight?: number;
  species?: string;
  culture?: string;
  profession?: string;
}

type ArchetypeData = FoundryCompendiumEntryFull<DSA5ActorSystemData, DSA5ItemSystemData>;

type ArchetypeIndexEntry = FoundryCompendiumDocumentBase<DSA5ActorSystemData, DSA5ItemSystemData>;

type ActorCreationResponse = FoundryActorCreationResult;

type PackSummary = FoundryCompendiumPackSummary;

interface ArchetypeListItem {
  id: string;
  name: string;
  packId: string;
  packLabel: string;
  species: string;
  profession: string;
  img?: string;
}

/**
 * DSA5 Character Creator
 *
 * Handles creation of DSA5 characters from archetypes with customization options.
 * Supports archetype-based creation with name, age, biography, and other customizations.
 */
export class DSA5CharacterCreator {
  private foundryClient: FoundryClient;
  private logger: Logger;
  private errorHandler: ErrorHandler;

  constructor({ foundryClient, logger }: DSA5CharacterCreatorOptions) {
    this.foundryClient = foundryClient;
    this.logger = logger.child({ component: 'DSA5CharacterCreator' });
    this.errorHandler = new ErrorHandler(this.logger);
  }

  /**
   * Tool definitions for DSA5 character creation
   */
  getToolDefinitions(): UnknownRecord[] {
    return [
      {
        name: 'create-dsa5-character-from-archetype',
        description:
          'Create a DSA5 character from an archetype (e.g., Allacaya, Wulfgrimm). Allows customization of name, age, biography, and other details. Use search-compendium first to find available archetypes in DSA5 character packs.',
        inputSchema: {
          type: 'object',
          properties: {
            archetypePackId: {
              type: 'string',
              description:
                'ID of the compendium pack containing the archetype (e.g., "dsa5-core.corecharacters")',
            },
            archetypeId: {
              type: 'string',
              description:
                'ID of the archetype within the pack (get from search-compendium results)',
            },
            characterName: {
              type: 'string',
              description: 'Custom name for the character (e.g., "Ericsson", "Thorald")',
            },
            customization: {
              type: 'object',
              description: 'Optional customizations for the character',
              properties: {
                age: {
                  type: 'number',
                  description: 'Character age in years (e.g., 20, 35)',
                  minimum: 12,
                  maximum: 100,
                },
                biography: {
                  type: 'string',
                  description: 'Custom biography or background story',
                },
                gender: {
                  type: 'string',
                  description: 'Character gender (male, female, diverse)',
                  enum: ['male', 'female', 'diverse'],
                },
                eyeColor: {
                  type: 'string',
                  description: 'Eye color',
                },
                hairColor: {
                  type: 'string',
                  description: 'Hair color',
                },
                height: {
                  type: 'number',
                  description: 'Height in cm',
                },
                weight: {
                  type: 'number',
                  description: 'Weight in kg',
                },
                species: {
                  type: 'string',
                  description: 'Species/race (e.g., "Mensch", "Elf", "Zwerg")',
                },
                culture: {
                  type: 'string',
                  description: 'Culture (e.g., "Mittelreich", "Thorwal")',
                },
                profession: {
                  type: 'string',
                  description: 'Profession/career',
                },
              },
            },
            addToWorld: {
              type: 'boolean',
              description: 'Whether to add the character to the current world (default: true)',
              default: true,
            },
          },
          required: ['archetypePackId', 'archetypeId', 'characterName'],
        },
      },
      {
        name: 'list-dsa5-archetypes',
        description:
          'List available DSA5 character archetypes from compendium packs. Helps users discover available templates for character creation.',
        inputSchema: {
          type: 'object',
          properties: {
            packId: {
              type: 'string',
              description:
                'Optional: specific pack to search (e.g., "dsa5-core.corecharacters"). If not provided, searches all DSA5 character packs.',
            },
            filterBySpecies: {
              type: 'string',
              description: 'Optional: filter by species (e.g., "Mensch", "Elf")',
            },
            filterByProfession: {
              type: 'string',
              description: 'Optional: filter by profession type',
            },
          },
        },
      },
    ];
  }

  /**
   * Handle DSA5 character creation from archetype
   */
  async handleCreateCharacterFromArchetype(args: unknown): Promise<UnknownRecord> {
    const schema = z.object({
      archetypePackId: z.string().min(1, 'Archetype pack ID cannot be empty'),
      archetypeId: z.string().min(1, 'Archetype ID cannot be empty'),
      characterName: z.string().min(1, 'Character name cannot be empty'),
      customization: z
        .object({
          age: z.number().min(12).max(100).optional(),
          biography: z.string().optional(),
          gender: z.enum(['male', 'female', 'diverse']).optional(),
          eyeColor: z.string().optional(),
          hairColor: z.string().optional(),
          height: z.number().optional(),
          weight: z.number().optional(),
          species: z.string().optional(),
          culture: z.string().optional(),
          profession: z.string().optional(),
        })
        .optional(),
      addToWorld: z.boolean().default(true),
    });

    const {
      archetypePackId,
      archetypeId,
      characterName,
      customization,
      addToWorld: _addToWorld,
    } = schema.parse(args);

    this.logger.info('Creating DSA5 character from archetype', {
      archetypePackId,
      archetypeId,
      characterName,
      customization,
    });

    try {
      // First, get the full archetype data
      const archetypeData = await this.foundryClient.query<ArchetypeData | null>(
        'maeinomatic-foundry-mcp.getCompendiumDocumentFull',
        {
          packId: archetypePackId,
          documentId: archetypeId,
        }
      );

      if (!archetypeData) {
        throw new Error(`Archetype ${archetypeId} not found in pack ${archetypePackId}`);
      }

      // Prepare character data with customizations
      const sanitizedCustomization = this.sanitizeCustomization(customization);
      const characterData = this.prepareCharacterData(characterName, sanitizedCustomization);

      // Create the character actor in Foundry
      const result = await this.foundryClient.query<ActorCreationResponse>(
        'maeinomatic-foundry-mcp.createActorFromCompendium',
        {
          packId: archetypePackId,
          itemId: archetypeId,
          customNames: [characterName],
          quantity: 1,
          addToScene: false, // Characters aren't added to scenes by default
          customData: characterData, // Pass customizations
        }
      );

      this.logger.info('DSA5 character created successfully', {
        characterName,
        archetypeName: archetypeData.name ?? 'Unknown archetype',
        success: result.success ?? false,
      });

      return this.formatCharacterCreationResponse(
        result,
        archetypeData,
        characterName,
        sanitizedCustomization
      );
    } catch (error) {
      return this.errorHandler.handleToolError(
        error,
        'create-dsa5-character-from-archetype',
        'DSA5 character creation'
      );
    }
  }

  /**
   * Handle listing DSA5 archetypes
   */
  async handleListArchetypes(args: unknown): Promise<UnknownRecord> {
    const schema = z.object({
      packId: z.string().optional(),
      filterBySpecies: z.string().optional(),
      filterByProfession: z.string().optional(),
    });

    const { packId, filterBySpecies, filterByProfession } = schema.parse(args);

    this.logger.info('Listing DSA5 archetypes', { packId, filterBySpecies, filterByProfession });

    try {
      // Get all available packs or specific pack
      const packsResult = await this.foundryClient.query('maeinomatic-foundry-mcp.getAvailablePacks');
      const packs = Array.isArray(packsResult)
        ? packsResult.filter((pack): pack is PackSummary => this.isPackSummary(pack))
        : [];

      // Filter for DSA5 character packs
      const characterPacks = packs.filter(
        (pack: PackSummary) =>
          pack.type === 'Actor' && pack.system === 'dsa5' && (!packId || pack.id === packId)
      );

      const archetypes: ArchetypeListItem[] = [];

      // Get archetypes from each pack
      for (const pack of characterPacks) {
        try {
          const packIndexResult = await this.foundryClient.query<ArchetypeIndexEntry[]>(
            'maeinomatic-foundry-mcp.getPackIndex',
            {
              packId: pack.id,
            }
          );
          const packIndex = Array.isArray(packIndexResult) ? packIndexResult : [];

          // Filter archetypes
          const packArchetypes = packIndex
            .filter((entry: ArchetypeIndexEntry) => entry.type === 'character')
            .filter((entry: ArchetypeIndexEntry) => {
              const species = this.getSpeciesLabel(entry.system);
              const profession = this.getProfessionLabel(entry.system);

              if (filterBySpecies && species !== filterBySpecies) {
                return false;
              }
              if (filterByProfession && !profession.includes(filterByProfession)) {
                return false;
              }
              return true;
            })
            .map((entry: ArchetypeIndexEntry) => {
              return {
                id: entry.id,
                name: entry.name,
                packId: pack.id,
                packLabel: pack.label,
                species: this.getSpeciesLabel(entry.system),
                profession: this.getProfessionLabel(entry.system),
                ...(entry.img ? { img: entry.img } : {}),
              };
            })
            .filter((entry: ArchetypeListItem) => entry.id.length > 0);

          archetypes.push(...packArchetypes);
        } catch (packError) {
          this.logger.warn(`Failed to load archetypes from pack ${pack.id}`, { error: packError });
        }
      }

      this.logger.info('Retrieved DSA5 archetypes', { count: archetypes.length });

      return this.formatArchetypeListResponse(archetypes, filterBySpecies, filterByProfession);
    } catch (error) {
      return this.errorHandler.handleToolError(error, 'list-dsa5-archetypes', 'archetype listing');
    }
  }

  /**
   * Prepare character data with customizations
   */
  private prepareCharacterData(
    characterName: string,
    customization?: Dsa5Customization
  ): UnknownRecord {
    const data: UnknownRecord = {
      name: characterName,
    };

    if (!customization) {
      return data;
    }

    // Build system data updates
    const systemUpdates: UnknownRecord = {};

    if (customization.age !== undefined) {
      systemUpdates['details.age.value'] = customization.age;
    }

    if (customization.biography) {
      systemUpdates['details.biography.value'] = customization.biography;
    }

    if (customization.gender) {
      systemUpdates['details.gender.value'] = customization.gender;
    }

    if (customization.eyeColor) {
      systemUpdates['details.eyecolor.value'] = customization.eyeColor;
    }

    if (customization.hairColor) {
      systemUpdates['details.haircolor.value'] = customization.hairColor;
    }

    if (customization.height) {
      systemUpdates['details.height.value'] = customization.height;
    }

    if (customization.weight) {
      systemUpdates['details.weight.value'] = customization.weight;
    }

    if (customization.species) {
      systemUpdates['details.species.value'] = customization.species;
    }

    if (customization.culture) {
      systemUpdates['details.culture.value'] = customization.culture;
    }

    if (customization.profession) {
      systemUpdates['details.career.value'] = customization.profession;
    }

    if (Object.keys(systemUpdates).length > 0) {
      data.system = systemUpdates;
    }

    return data;
  }

  private sanitizeCustomization(customization: unknown): Dsa5Customization | undefined {
    if (!customization || typeof customization !== 'object') {
      return undefined;
    }

    const source = customization as UnknownRecord;
    const result: Dsa5Customization = {};

    if (typeof source.age === 'number') result.age = source.age;
    if (typeof source.biography === 'string') result.biography = source.biography;
    if (source.gender === 'male' || source.gender === 'female' || source.gender === 'diverse') {
      result.gender = source.gender;
    }
    if (typeof source.eyeColor === 'string') result.eyeColor = source.eyeColor;
    if (typeof source.hairColor === 'string') result.hairColor = source.hairColor;
    if (typeof source.height === 'number') result.height = source.height;
    if (typeof source.weight === 'number') result.weight = source.weight;
    if (typeof source.species === 'string') result.species = source.species;
    if (typeof source.culture === 'string') result.culture = source.culture;
    if (typeof source.profession === 'string') result.profession = source.profession;

    return Object.keys(result).length > 0 ? result : undefined;
  }

  /**
   * Format character creation response
   */
  private formatCharacterCreationResponse(
    result: ActorCreationResponse,
    archetypeData: ArchetypeData,
    characterName: string,
    customization?: Dsa5Customization
  ): UnknownRecord {
    const archetypeName = archetypeData.name ?? 'Unknown';
    const summary = `✅ DSA5 Character "${characterName}" created from archetype "${archetypeName}"`;

    const details = [
      `**Name:** ${characterName}`,
      `**Archetype:** ${archetypeName}`,
      `**Pack:** ${archetypeData.packLabel ?? 'Unknown'}`,
    ];

    if (customization) {
      if (customization.age) details.push(`**Age:** ${customization.age} years`);
      if (customization.species) details.push(`**Species:** ${customization.species}`);
      if (customization.culture) details.push(`**Culture:** ${customization.culture}`);
      if (customization.profession) details.push(`**Profession:** ${customization.profession}`);
      if (customization.biography)
        details.push(`**Biography:** ${customization.biography.substring(0, 100)}...`);
    }

    const errors = result.errors ?? [];
    const errorInfo = errors.length > 0 ? `\n⚠️ Issues: ${errors.join(', ')}` : '';

    return {
      summary,
      success: result.success,
      character: {
        name: characterName,
        id: result.actors?.[0]?.id,
        archetype: {
          name: archetypeName,
          packId: archetypeData.pack ?? 'unknown',
        },
        customizations: customization ?? {},
      },
      message: `${summary}\n\n${details.join('\n')}${errorInfo}`,
    };
  }

  /**
   * Format archetype list response
   */
  private formatArchetypeListResponse(
    archetypes: ArchetypeListItem[],
    filterBySpecies?: string,
    filterByProfession?: string
  ): UnknownRecord {
    const filterInfo = [
      filterBySpecies ? `Species: ${filterBySpecies}` : null,
      filterByProfession ? `Profession: ${filterByProfession}` : null,
    ]
      .filter(Boolean)
      .join(', ');

    const summary = `Found ${archetypes.length} DSA5 archetypes${filterInfo ? ` (${filterInfo})` : ''}`;

    const archetypeList = archetypes
      .map(
        (archetype: ArchetypeListItem) =>
          `• **${archetype.name}** (${archetype.species}, ${archetype.profession})\n  Pack: ${archetype.packLabel} | ID: ${archetype.id}`
      )
      .join('\n\n');

    return {
      summary,
      count: archetypes.length,
      filters: {
        species: filterBySpecies,
        profession: filterByProfession,
      },
      archetypes,
      message: `${summary}\n\n${archetypeList}`,
    };
  }

  private getSpeciesLabel(system?: DSA5ActorSystemData): string {
    return system?.details?.species?.value ?? 'Unknown';
  }

  private getProfessionLabel(system?: DSA5ActorSystemData): string {
    return system?.details?.career?.value ?? 'Unknown';
  }

  private isPackSummary(value: unknown): value is PackSummary {
    if (value === null || typeof value !== 'object') {
      return false;
    }
    const record = value as UnknownRecord;
    return typeof record.id === 'string' && typeof record.label === 'string';
  }
}
