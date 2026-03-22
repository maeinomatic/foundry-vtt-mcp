import type {
  FoundryPreviewCharacterProgressionRequest,
  FoundryPreviewCharacterProgressionResponse,
} from '@foundry-mcp/shared';

export interface ActorProgressionActorLike {
  id?: string;
  name?: string;
  type?: string;
  items?: unknown;
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
  }): FoundryPreviewCharacterProgressionResponse;
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
