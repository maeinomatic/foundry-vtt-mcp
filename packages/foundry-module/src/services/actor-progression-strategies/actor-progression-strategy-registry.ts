import type { ActorProgressionStrategy } from './actor-progression-strategy-contract.js';
import { dnd5eActorProgressionStrategy } from './dnd5e-actor-progression-strategy.js';

const actorProgressionStrategies: Record<string, ActorProgressionStrategy> = {
  dnd5e: dnd5eActorProgressionStrategy,
};

export function getActorProgressionStrategy(systemId: string): ActorProgressionStrategy | null {
  return actorProgressionStrategies[systemId] ?? null;
}
