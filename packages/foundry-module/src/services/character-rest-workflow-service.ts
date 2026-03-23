import type {
  FoundryCharacterRestClassHitDieChange,
  FoundryCharacterRestClassHitDieState,
  FoundryCharacterRestDeathSaveState,
  FoundryCharacterRestHitPointState,
  FoundryCharacterRestSpellSlotChange,
  FoundryCharacterRestSpellSlotState,
  FoundryCharacterRestState,
  FoundryRunCharacterRestWorkflowRequest,
  FoundryRunCharacterRestWorkflowResponse,
  UnknownRecord,
} from '@maeinomatic/foundry-mcp-shared';

type AuditStatus = 'success' | 'failure';

interface RestWorkflowActorLike {
  id?: string;
  name?: string;
  type?: string;
  system?: unknown;
  items?: unknown;
  shortRest?: (config?: UnknownRecord) => unknown;
  longRest?: (config?: UnknownRecord) => unknown;
}

interface RestWorkflowItemLike {
  id?: string;
  name?: string;
  type?: string;
  system?: unknown;
}

export interface CharacterRestWorkflowServiceContext {
  auditLog(action: string, data: unknown, status: AuditStatus, errorMessage?: string): void;
  findActorByIdentifier(identifier: string): RestWorkflowActorLike | null;
  validateFoundryState(): void;
  getSystemId(): string;
}

function asRecord(value: unknown): UnknownRecord | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  return value as UnknownRecord;
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function toBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function toStringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function getActorItems(actor: RestWorkflowActorLike): RestWorkflowItemLike[] {
  if (Array.isArray(actor.items)) {
    return actor.items.filter((item): item is RestWorkflowItemLike =>
      Boolean(item && typeof item === 'object')
    );
  }

  const itemCollection = asRecord(actor.items);
  if (itemCollection && Array.isArray(itemCollection.contents)) {
    return itemCollection.contents.filter((item): item is RestWorkflowItemLike =>
      Boolean(item && typeof item === 'object')
    );
  }

  return [];
}

function extractHitPoints(
  system: UnknownRecord | undefined
): FoundryCharacterRestHitPointState | undefined {
  const attributes = asRecord(system?.attributes);
  const hp = asRecord(attributes?.hp);
  if (!hp) {
    return undefined;
  }

  const current = toNumber(hp.value);
  const max = toNumber(hp.max);
  const temp = toNumber(hp.temp);

  return {
    ...(current !== undefined ? { current } : {}),
    ...(max !== undefined ? { max } : {}),
    ...(temp !== undefined ? { temp } : {}),
  };
}

function extractDeathSaves(
  system: UnknownRecord | undefined
): FoundryCharacterRestDeathSaveState | undefined {
  const attributes = asRecord(system?.attributes);
  const death = asRecord(attributes?.death);
  if (!death) {
    return undefined;
  }

  const success = toNumber(death.success);
  const failure = toNumber(death.failure);

  return {
    ...(success !== undefined ? { success } : {}),
    ...(failure !== undefined ? { failure } : {}),
  };
}

function extractSpellSlots(
  system: UnknownRecord | undefined
): FoundryCharacterRestSpellSlotState[] | undefined {
  const spells = asRecord(system?.spells);
  if (!spells) {
    return undefined;
  }

  const slots = Object.entries(spells)
    .map(([key, value]) => {
      const slot = asRecord(value);
      if (!slot) {
        return null;
      }

      const valueNumber = toNumber(slot.value);
      const maxNumber = toNumber(slot.max);
      const overrideNumber = toNumber(slot.override);
      if (valueNumber === undefined && maxNumber === undefined && overrideNumber === undefined) {
        return null;
      }

      return {
        key,
        ...(valueNumber !== undefined ? { value: valueNumber } : {}),
        ...(maxNumber !== undefined ? { max: maxNumber } : {}),
        ...(overrideNumber !== undefined ? { override: overrideNumber } : {}),
      } satisfies FoundryCharacterRestSpellSlotState;
    })
    .filter((slot): slot is FoundryCharacterRestSpellSlotState => slot !== null)
    .sort((left, right) => left.key.localeCompare(right.key));

  return slots.length > 0 ? slots : undefined;
}

function extractClassHitDice(
  actor: RestWorkflowActorLike
): FoundryCharacterRestClassHitDieState[] | undefined {
  const classStates = getActorItems(actor)
    .filter(
      (item): item is RestWorkflowItemLike & { id: string; name: string } =>
        item.type === 'class' && typeof item.id === 'string' && typeof item.name === 'string'
    )
    .map(item => {
      const system = asRecord(item.system);
      const levels = toNumber(system?.levels);
      const hd = asRecord(system?.hd);
      const spent = toNumber(hd?.spent);
      const denomination = toStringValue(hd?.denomination) ?? toStringValue(hd?.denom);
      const available = levels !== undefined ? Math.max(levels - (spent ?? 0), 0) : undefined;

      return {
        classId: item.id,
        className: item.name,
        ...(levels !== undefined ? { levels } : {}),
        ...(spent !== undefined ? { spent } : {}),
        ...(available !== undefined ? { available } : {}),
        ...(denomination ? { denomination } : {}),
      } satisfies FoundryCharacterRestClassHitDieState;
    })
    .sort((left, right) => left.className.localeCompare(right.className));

  return classStates.length > 0 ? classStates : undefined;
}

function extractRestState(actor: RestWorkflowActorLike): FoundryCharacterRestState {
  const system = asRecord(actor.system);
  const attributes = asRecord(system?.attributes);
  const hitPoints = extractHitPoints(system);
  const inspiration = toBoolean(attributes?.inspiration);
  const exhaustion = toNumber(attributes?.exhaustion);
  const deathSaves = extractDeathSaves(system);
  const spellSlots = extractSpellSlots(system);
  const classHitDice = extractClassHitDice(actor);

  return {
    ...(hitPoints ? { hitPoints } : {}),
    ...(inspiration !== undefined ? { inspiration } : {}),
    ...(exhaustion !== undefined ? { exhaustion } : {}),
    ...(deathSaves ? { deathSaves } : {}),
    ...(spellSlots ? { spellSlots } : {}),
    ...(classHitDice ? { classHitDice } : {}),
  };
}

function hitPointsEqual(
  left: FoundryCharacterRestHitPointState | undefined,
  right: FoundryCharacterRestHitPointState | undefined
): boolean {
  return left?.current === right?.current && left?.max === right?.max && left?.temp === right?.temp;
}

function deathSavesEqual(
  left: FoundryCharacterRestDeathSaveState | undefined,
  right: FoundryCharacterRestDeathSaveState | undefined
): boolean {
  return left?.success === right?.success && left?.failure === right?.failure;
}

function buildSpellSlotChanges(
  before: FoundryCharacterRestSpellSlotState[] | undefined,
  after: FoundryCharacterRestSpellSlotState[] | undefined
): FoundryCharacterRestSpellSlotChange[] {
  const beforeMap = new Map((before ?? []).map(slot => [slot.key, slot]));
  const afterMap = new Map((after ?? []).map(slot => [slot.key, slot]));
  const keys = new Set([...beforeMap.keys(), ...afterMap.keys()]);

  return Array.from(keys)
    .map(key => {
      const beforeSlot = beforeMap.get(key);
      const afterSlot = afterMap.get(key);
      if (
        beforeSlot?.value === afterSlot?.value &&
        beforeSlot?.max === afterSlot?.max &&
        beforeSlot?.override === afterSlot?.override
      ) {
        return null;
      }

      return {
        key,
        ...(beforeSlot ? { before: beforeSlot } : {}),
        ...(afterSlot ? { after: afterSlot } : {}),
      } satisfies FoundryCharacterRestSpellSlotChange;
    })
    .filter((change): change is FoundryCharacterRestSpellSlotChange => change !== null)
    .sort((left, right) => left.key.localeCompare(right.key));
}

function buildClassHitDieChanges(
  before: FoundryCharacterRestClassHitDieState[] | undefined,
  after: FoundryCharacterRestClassHitDieState[] | undefined
): FoundryCharacterRestClassHitDieChange[] {
  const beforeMap = new Map((before ?? []).map(state => [state.classId, state]));
  const afterMap = new Map((after ?? []).map(state => [state.classId, state]));
  const keys = new Set([...beforeMap.keys(), ...afterMap.keys()]);

  return Array.from(keys)
    .map(key => {
      const beforeState = beforeMap.get(key);
      const afterState = afterMap.get(key);
      if (
        beforeState?.levels === afterState?.levels &&
        beforeState?.spent === afterState?.spent &&
        beforeState?.available === afterState?.available &&
        beforeState?.denomination === afterState?.denomination
      ) {
        return null;
      }

      return {
        classId: afterState?.classId ?? beforeState?.classId ?? key,
        className: afterState?.className ?? beforeState?.className ?? key,
        ...(beforeState ? { before: beforeState } : {}),
        ...(afterState ? { after: afterState } : {}),
      } satisfies FoundryCharacterRestClassHitDieChange;
    })
    .filter((change): change is FoundryCharacterRestClassHitDieChange => change !== null)
    .sort((left, right) => left.className.localeCompare(right.className));
}

export class FoundryCharacterRestWorkflowService {
  constructor(private readonly context: CharacterRestWorkflowServiceContext) {}

  async runCharacterRestWorkflow(
    request: FoundryRunCharacterRestWorkflowRequest
  ): Promise<FoundryRunCharacterRestWorkflowResponse> {
    this.context.validateFoundryState();

    const systemId = this.context.getSystemId();
    if (systemId !== 'dnd5e') {
      throw new Error(
        `UNSUPPORTED_CAPABILITY: Character rest workflow is not implemented for system "${systemId}".`
      );
    }

    const actor = this.context.findActorByIdentifier(request.actorIdentifier);
    if (!actor) {
      throw new Error(`Actor not found: ${request.actorIdentifier}`);
    }

    if (actor.type !== 'character') {
      throw new Error(
        'UNSUPPORTED_CAPABILITY: DnD5e rest workflow is only supported for character actors.'
      );
    }

    const restMethod = request.restType === 'short' ? actor.shortRest : actor.longRest;
    if (typeof restMethod !== 'function') {
      throw new Error(
        `UNSUPPORTED_CAPABILITY: The active DnD5e actor does not expose a ${request.restType}Rest workflow method.`
      );
    }

    const before = extractRestState(actor);
    const restConfig: UnknownRecord = {
      dialog: false,
      ...(request.suppressChat !== false
        ? {
            chat: false,
            chatMessage: false,
            createMessage: false,
          }
        : {}),
      ...(request.restType === 'long' && request.newDay !== undefined
        ? { newDay: request.newDay }
        : {}),
    };

    try {
      await Promise.resolve(restMethod.call(actor, restConfig));

      const refreshedActor =
        (actor.id ? this.context.findActorByIdentifier(actor.id) : null) ??
        this.context.findActorByIdentifier(request.actorIdentifier) ??
        actor;
      const after = extractRestState(refreshedActor);
      const changedSpellSlots = buildSpellSlotChanges(before.spellSlots, after.spellSlots);
      const changedClassHitDice = buildClassHitDieChanges(before.classHitDice, after.classHitDice);

      const response: FoundryRunCharacterRestWorkflowResponse = {
        success: true,
        system: systemId,
        actorId: refreshedActor.id ?? actor.id ?? '',
        actorName: refreshedActor.name ?? actor.name ?? request.actorIdentifier,
        actorType: refreshedActor.type ?? actor.type ?? 'character',
        restType: request.restType,
        before,
        after,
        changes: {
          hitPointsChanged: !hitPointsEqual(before.hitPoints, after.hitPoints),
          inspirationChanged: before.inspiration !== after.inspiration,
          exhaustionChanged: before.exhaustion !== after.exhaustion,
          deathSavesChanged: !deathSavesEqual(before.deathSaves, after.deathSaves),
          changedSpellSlots,
          changedClassHitDice,
        },
        warnings: [
          'The rest workflow delegates to the DnD5e actor rest API with dialogs suppressed. Review the character afterward if your table expects extra rest-time choices beyond what the system can apply headlessly.',
        ],
      };

      this.context.auditLog('runCharacterRestWorkflow', request, 'success');
      return response;
    } catch (error) {
      this.context.auditLog(
        'runCharacterRestWorkflow',
        request,
        'failure',
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw error;
    }
  }
}
