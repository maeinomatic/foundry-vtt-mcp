import type {
  FoundryValidateCharacterBuildRequest,
  FoundryValidateCharacterBuildResponse,
} from '@maeinomatic/foundry-mcp-shared';
import { validateDnD5eCharacterBuild } from './dnd5e-character-build-validator.js';

type AuditStatus = 'success' | 'failure';

interface CharacterBuildValidationActorLike {
  id?: string;
  name?: string;
  type?: string;
  system?: unknown;
  items?: unknown;
}

export interface CharacterBuildValidationServiceContext {
  auditLog(action: string, data: unknown, status: AuditStatus, errorMessage?: string): void;
  findActorByIdentifier(identifier: string): CharacterBuildValidationActorLike | null;
  validateFoundryState(): void;
  getSystemId(): string;
}

export class FoundryCharacterBuildValidationService {
  constructor(private readonly context: CharacterBuildValidationServiceContext) {}

  validateCharacterBuild(
    request: FoundryValidateCharacterBuildRequest
  ): Promise<FoundryValidateCharacterBuildResponse> {
    this.context.validateFoundryState();

    const actor = this.context.findActorByIdentifier(request.actorIdentifier);
    if (!actor) {
      throw new Error(`Actor not found: ${request.actorIdentifier}`);
    }

    try {
      const systemId = this.context.getSystemId();
      switch (systemId) {
        case 'dnd5e': {
          const response = validateDnD5eCharacterBuild({ actor, request });
          this.context.auditLog('validateCharacterBuild', request, 'success');
          return Promise.resolve(response);
        }

        default:
          throw new Error(
            `UNSUPPORTED_CAPABILITY: Character build validation is not implemented for system "${systemId}".`
          );
      }
    } catch (error) {
      this.context.auditLog(
        'validateCharacterBuild',
        request,
        'failure',
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw error;
    }
  }
}
