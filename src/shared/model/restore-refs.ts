import {
  isDenseArray,
  isEntityId,
  MAX_REFS,
} from '../validation';

export interface RestoreRef {
  source: 'group';
  groupId: string;
  tabId: string;
}

export type RestoreRefError =
  | 'missing'
  | 'not-restorable'
  | 'create-failed';

export type RestoreRefOutcome =
  | {
      key: string;
      groupId: string;
      tabId: string;
      status: 'restored';
    }
  | {
      key: string;
      groupId: string;
      tabId: string;
      status: 'failed';
      error: RestoreRefError;
    };

export interface RestoreRefsResult {
  restoredTabs: number;
  outcomes: RestoreRefOutcome[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const allowed = new Set(keys);
  return Reflect.ownKeys(value).every((key) =>
    typeof key === 'string' && allowed.has(key));
}

export function restoreRefKey(
  ref: Pick<RestoreRef, 'groupId' | 'tabId'>,
): string {
  return JSON.stringify([ref.groupId, ref.tabId]);
}

export function parseRestoreRefs(value: unknown): RestoreRef[] {
  if (!Array.isArray(value)
    || !isDenseArray(value)
    || value.length === 0
    || value.length > MAX_REFS) {
    throw new Error('A non-empty valid restore refs array is required.');
  }
  const refs = value.map((item) => {
    if (!isRecord(item)
      || !hasOnlyKeys(item, ['source', 'groupId', 'tabId'])
      || item.source !== 'group'
      || !isEntityId(item.groupId)
      || !isEntityId(item.tabId)) {
      throw new Error('Every restore ref must be a valid saved group item.');
    }
    return {
      source: 'group' as const,
      groupId: item.groupId,
      tabId: item.tabId,
    };
  });
  const keys = refs.map(restoreRefKey);
  if (new Set(keys).size !== keys.length) {
    throw new Error('Restore refs must be unique.');
  }
  return refs;
}

export function restoredRefOutcome(ref: RestoreRef): RestoreRefOutcome {
  return {
    key: restoreRefKey(ref),
    groupId: ref.groupId,
    tabId: ref.tabId,
    status: 'restored',
  };
}

export function failedRefOutcome(
  ref: RestoreRef,
  error: RestoreRefError,
): RestoreRefOutcome {
  return {
    key: restoreRefKey(ref),
    groupId: ref.groupId,
    tabId: ref.tabId,
    status: 'failed',
    error,
  };
}

export function parseRestoreRefsResult(
  value: unknown,
  requestedRefs: readonly RestoreRef[],
): RestoreRefsResult {
  if (!isRecord(value)
    || !hasOnlyKeys(value, ['restoredTabs', 'outcomes'])
    || !Number.isSafeInteger(value.restoredTabs)
    || (value.restoredTabs as number) < 0
    || !Array.isArray(value.outcomes)
    || !isDenseArray(value.outcomes)
    || value.outcomes.length !== requestedRefs.length) {
    throw new Error('Restore service returned invalid per-item outcomes.');
  }
  const outcomes = value.outcomes.map((outcome, index) => {
    const requested = requestedRefs[index]!;
    if (!isRecord(outcome)
      || outcome.key !== restoreRefKey(requested)
      || outcome.groupId !== requested.groupId
      || outcome.tabId !== requested.tabId) {
      throw new Error('Restore service returned mismatched per-item outcomes.');
    }
    if (outcome.status === 'restored'
      && hasOnlyKeys(outcome, ['key', 'groupId', 'tabId', 'status'])) {
      return restoredRefOutcome(requested);
    }
    if (outcome.status === 'failed'
      && hasOnlyKeys(
        outcome,
        ['key', 'groupId', 'tabId', 'status', 'error'],
      )
      && (
        outcome.error === 'missing'
        || outcome.error === 'not-restorable'
        || outcome.error === 'create-failed'
      )) {
      return failedRefOutcome(requested, outcome.error);
    }
    throw new Error('Restore service returned invalid per-item outcomes.');
  });
  const restoredTabs = outcomes.filter(({ status }) =>
    status === 'restored').length;
  if (value.restoredTabs !== restoredTabs) {
    throw new Error('Restore service returned an inconsistent success count.');
  }
  return { restoredTabs, outcomes };
}
