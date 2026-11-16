import { FILE_PING_KEY, STORAGE_FALLBACK_KEY } from '../model/constants';

const EXPLICIT_FILE_REREAD_EVENT_ID_PATTERN = /^file-reread_[a-z0-9]+_[a-z0-9]+$/i;
const EXPLICIT_FILE_REREAD_EVENT_ID_MAX_LENGTH = 64;

export interface FilePing {
  mutationRevision: number;
  updatedAt: string;
  kind?: 'ordinary' | 'explicit-reread';
  eventId?: string;
}

export interface StorageFallbackEvent {
  eventId: string;
  reason: string;
  occurredAt: string;
}

function subscribeStorageValue<T>(
  key: string,
  parse: (value: unknown) => T | null,
  callback: (value: T) => void,
): () => void {
  const onChanged = chrome.storage.onChanged;
  const listener = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: string,
  ) => {
    if (area !== 'local' || !changes[key]) return;
    const value = parse(changes[key].newValue);
    if (value) callback(value);
  };
  onChanged.addListener(listener);
  return () => onChanged.removeListener(listener);
}

function parseFilePing(value: unknown): FilePing | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<FilePing>;
  if (!Number.isSafeInteger(candidate.mutationRevision)
    || typeof candidate.updatedAt !== 'string'
    || !candidate.updatedAt) {
    return null;
  }
  if (candidate.kind !== undefined
    && candidate.kind !== 'ordinary'
    && candidate.kind !== 'explicit-reread') {
    return null;
  }
  if (candidate.eventId !== undefined
    && (typeof candidate.eventId !== 'string'
      || candidate.eventId.length > EXPLICIT_FILE_REREAD_EVENT_ID_MAX_LENGTH
      || !EXPLICIT_FILE_REREAD_EVENT_ID_PATTERN.test(candidate.eventId))) {
    return null;
  }
  if (candidate.kind === 'explicit-reread' && !candidate.eventId) return null;
  if (candidate.eventId && candidate.kind !== 'explicit-reread') return null;
  return {
    mutationRevision: candidate.mutationRevision as number,
    updatedAt: candidate.updatedAt,
    ...(candidate.kind ? { kind: candidate.kind } : {}),
    ...(candidate.eventId ? { eventId: candidate.eventId } : {}),
  };
}

function parseStorageFallback(value: unknown): StorageFallbackEvent | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<StorageFallbackEvent>;
  if (typeof candidate.eventId !== 'string' || !candidate.eventId
    || typeof candidate.reason !== 'string' || !candidate.reason
    || typeof candidate.occurredAt !== 'string' || !candidate.occurredAt) {
    return null;
  }
  return {
    eventId: candidate.eventId,
    reason: candidate.reason,
    occurredAt: candidate.occurredAt,
  };
}

export async function writeFilePing(
  mutationRevision: number,
  updatedAt: string,
  options: Pick<FilePing, 'kind' | 'eventId'> = {},
): Promise<void> {
  await chrome.storage.local.set({
    [FILE_PING_KEY]: {
      mutationRevision,
      updatedAt,
      ...(options.kind ? { kind: options.kind } : {}),
      ...(options.eventId ? { eventId: options.eventId } : {}),
    } satisfies FilePing,
  });
}

export function subscribeFilePing(callback: (ping: FilePing) => void): () => void {
  return subscribeStorageValue(FILE_PING_KEY, parseFilePing, callback);
}

export async function writeStorageFallback(event: StorageFallbackEvent): Promise<void> {
  await chrome.storage.local.set({
    [STORAGE_FALLBACK_KEY]: event,
  });
}

export function subscribeStorageFallback(
  callback: (event: StorageFallbackEvent) => void,
): () => void {
  return subscribeStorageValue(STORAGE_FALLBACK_KEY, parseStorageFallback, callback);
}
