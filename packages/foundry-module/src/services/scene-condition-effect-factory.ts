export interface SceneConditionLike {
  id?: string;
  name?: string;
  label?: string;
  icon?: string;
  img?: string;
  description?: string;
  flags?: Record<string, unknown>;
  changes?: unknown[];
  duration?: Record<string, unknown>;
  origin?: string;
}

export function buildConditionEffectData(params: {
  condition: SceneConditionLike;
  systemId: string;
}): Record<string, unknown> {
  const effectData: Record<string, unknown> = {
    name: params.condition.name ?? params.condition.label ?? params.condition.id,
    icon: params.condition.icon ?? params.condition.img,
  };

  if (params.condition.id) {
    effectData.statuses = [params.condition.id];
  }

  if (params.systemId === 'dsa5') {
    Object.assign(effectData, {
      flags: params.condition.flags ?? {},
      changes: params.condition.changes ?? [],
      duration: params.condition.duration ?? {},
      origin: params.condition.origin,
    });
  }

  return effectData;
}
