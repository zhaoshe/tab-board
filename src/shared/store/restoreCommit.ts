import type { TabBoardState } from '../model';

export type RestoreOutcome = 'proof-unavailable' | 'not-committed';
export function restoreOutcome(error: unknown): RestoreOutcome | undefined {
  const value = error && typeof error === 'object' && 'restoreOutcome' in error ? error.restoreOutcome : undefined;
  return value === 'proof-unavailable' || value === 'not-committed' ? value : undefined;
}
export function markRestoreOutcome(error: unknown, outcome: RestoreOutcome): unknown {
  // Keep the actual source/semantic cause and its code/message for the UI.
  return Object.assign(error && typeof error === 'object' ? error : new Error(String(error)), { restoreOutcome: outcome });
}

export interface OriginScope { mode: 'browser' | 'file'; scopeId: string }
export interface RestorePreview { expectedRevision: number; origin: OriginScope }
export interface RestoreRequest {
  requestId: string;
  origin: OriginScope;
  mutations: readonly unknown[];
  restoreAttempts: readonly { originalIndex: number; attemptId: string }[];
}
export interface RestoreReceipt {
  requestId: string;
  requestFingerprint: string;
  origin: OriginScope;
  restoreAttempts: RestoreRequest['restoreAttempts'];
  committedRevision: number;
  acceptedMutationIndexes: readonly number[];
  failure?: { code: string; message: string; invalidMutationIndexes: readonly number[] };
}
export interface RestoreMetadata { origin: OriginScope; receipts: readonly RestoreReceipt[] }
export interface BoundSnapshot { state: TabBoardState; metadata: RestoreMetadata }
export interface MutationCommitAck {
  state: TabBoardState;
  origin: OriginScope;
  confirmedByReceipt: boolean;
  acceptedMutationIndexes: readonly number[];
}
export const RESTORE_METADATA_KEY = 'tabboardRestoreMetadata';
export function sameOrigin(a: OriginScope | undefined, b: OriginScope | undefined): boolean {
  return !!a && !!b && a.mode === b.mode && a.scopeId === b.scopeId;
}
export function newOrigin(mode: OriginScope['mode']): OriginScope {
  return { mode, scopeId: crypto.randomUUID() };
}
export function restoreError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}
export function isOrigin(value: unknown): value is OriginScope {
  const v = value as Partial<OriginScope> | undefined;
  return !!v && (v.mode === 'browser' || v.mode === 'file') && typeof v.scopeId === 'string' && v.scopeId.length > 0;
}
function validIndexes(value: unknown): value is number[] {
  return Array.isArray(value) && value.every(i => Number.isSafeInteger(i) && i >= 0) && new Set(value).size === value.length;
}
function validReceipt(r: RestoreReceipt, mode: OriginScope['mode']): boolean {
  return !!r && typeof r.requestId === 'string' && !!r.requestId && /^[a-f0-9]{64}$/.test(r.requestFingerprint)
    && isOrigin(r.origin) && r.origin.mode === mode && Number.isSafeInteger(r.committedRevision) && r.committedRevision >= 0
    && validIndexes(r.acceptedMutationIndexes) && r.acceptedMutationIndexes.length > 0
    && Array.isArray(r.restoreAttempts) && r.restoreAttempts.length > 0
    && r.restoreAttempts.every(a => a && Number.isSafeInteger(a.originalIndex) && r.acceptedMutationIndexes.includes(a.originalIndex) && typeof a.attemptId === 'string' && !!a.attemptId)
    && new Set(r.restoreAttempts.map(a => a.attemptId)).size === r.restoreAttempts.length
    && new Set(r.restoreAttempts.map(a => a.originalIndex)).size === r.restoreAttempts.length
    && (!r.failure || (typeof r.failure.code === 'string' && typeof r.failure.message === 'string'
      && validIndexes(r.failure.invalidMutationIndexes) && r.failure.invalidMutationIndexes.every(i => !r.acceptedMutationIndexes.includes(i))));
}
export function readRestoreMetadata(value: unknown, mode: OriginScope['mode']): RestoreMetadata | undefined {
  if (value === undefined) return undefined;
  const v = value as RestoreMetadata;
  if (!v || !isOrigin(v.origin) || v.origin.mode !== mode || !Array.isArray(v.receipts)
    || v.receipts.some(r => !validReceipt(r, mode))
    || new Set(v.receipts.map(r => r.requestId)).size !== v.receipts.length) {
    throw restoreError('RESTORE_METADATA_INVALID', 'Restore commit metadata is inconsistent. Reconnect the selected storage source.');
  }
  return v;
}
function canonicalJson(value: unknown): string {
  const canonical = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(canonical);
    if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical((v as Record<string, unknown>)[k])]));
    return v;
  };
  return JSON.stringify(canonical(value));
}
export async function fingerprintRestoreRequest(request: RestoreRequest): Promise<string> {
  if (!request || typeof request.requestId !== 'string' || !request.requestId || !isOrigin(request.origin)
    || !Array.isArray(request.mutations) || !Array.isArray(request.restoreAttempts)) {
    throw restoreError('RESTORE_REQUEST_INVALID', 'The complete restore request is invalid.');
  }
  const indexes = request.mutations.flatMap((m, index) => m && typeof m === 'object' && 'type' in m && m.type === 'restore-backup' ? [index] : []);
  if (!indexes.length || indexes.length !== request.restoreAttempts.length
    || request.restoreAttempts.some((a, i) => a.originalIndex !== indexes[i] || typeof a.attemptId !== 'string' || !a.attemptId)
    || new Set(request.restoreAttempts.map(a => a.attemptId)).size !== indexes.length) {
    throw restoreError('RESTORE_REQUEST_INVALID', 'Complete restore attempt identities do not match the request.');
  }
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalJson(request)));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}
