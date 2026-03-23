import type {
  FoundryApplyCharacterAdvancementChoiceRequest,
  FoundryApplyCharacterAdvancementChoiceResponse,
  FoundryGetCharacterAdvancementOptionsRequest,
  FoundryGetCharacterAdvancementOptionsResponse,
  FoundryPreviewCharacterProgressionRequest,
  FoundryPreviewCharacterProgressionResponse,
} from '@maeinomatic/foundry-mcp-shared';

export interface ActorProgressionActorLike {
  id?: string;
  name?: string;
  type?: string;
  system?: unknown;
  items?: unknown;
  update?: (data: Record<string, unknown>) => Promise<unknown>;
  createEmbeddedDocuments?: (type: string, data: Record<string, unknown>[]) => Promise<unknown>;
  updateEmbeddedDocuments?: (type: string, updates: Record<string, unknown>[]) => Promise<unknown>;
  deleteEmbeddedDocuments?: (type: string, ids: string[]) => Promise<unknown>;
}

export interface ActorProgressionItemLike {
  id?: string;
  name?: string;
  type?: string;
  system?: unknown;
}

export interface ActorProgressionStrategy {
  systemId: string;
  previewCharacterProgression(params: {
    actor: ActorProgressionActorLike;
    request: FoundryPreviewCharacterProgressionRequest;
  }): Promise<FoundryPreviewCharacterProgressionResponse>;
  getCharacterAdvancementOptions(params: {
    actor: ActorProgressionActorLike;
    request: FoundryGetCharacterAdvancementOptionsRequest;
  }): Promise<FoundryGetCharacterAdvancementOptionsResponse>;
  applyCharacterAdvancementChoice(params: {
    actor: ActorProgressionActorLike;
    request: FoundryApplyCharacterAdvancementChoiceRequest;
  }): Promise<FoundryApplyCharacterAdvancementChoiceResponse>;
}

export function getActorItems(actor: ActorProgressionActorLike): ActorProgressionItemLike[] {
  if (Array.isArray(actor.items)) {
    return actor.items.filter((item): item is ActorProgressionItemLike =>
      Boolean(item && typeof item === 'object')
    );
  }

  if (
    actor.items &&
    typeof actor.items === 'object' &&
    Array.isArray((actor.items as { contents?: unknown[] }).contents)
  ) {
    return ((actor.items as { contents?: unknown[] }).contents ?? []).filter(
      (item): item is ActorProgressionItemLike => Boolean(item && typeof item === 'object')
    );
  }

  return [];
}

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

export function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

export function toStringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}
