export const MAX_OPERATION_ID_BYTES = 128;
export const MAX_ENTITY_ID_BYTES = 128;
export const MAX_REFS = 128;
export const MAX_LIVE_RECORDS = 128;
export const MAX_MUTATIONS = 128;
export const MAX_URL_BYTES = 4096;
export const MAX_TITLE_BYTES = 512;
export const MAX_FAVICON_URL_BYTES = 4096;
export const MAX_TIMESTAMP_BYTES = 64;
export const MAX_CANONICAL_DIGEST_BYTES = 16 * 1024;

const OPERATION_ID_PATTERN = /^[A-Za-z0-9._-]+$/;
const encoder = new TextEncoder();

export function utf8ByteLength(value: string): number {
  return encoder.encode(value).byteLength;
}

export function isBoundedString(
  value: unknown,
  maxBytes: number,
): value is string {
  return typeof value === 'string' && utf8ByteLength(value) <= maxBytes;
}

export function isEntityId(value: unknown): value is string {
  return isBoundedString(value, MAX_ENTITY_ID_BYTES) && value.length > 0;
}

export function isOperationId(value: unknown): value is string {
  return isBoundedString(value, MAX_OPERATION_ID_BYTES)
    && OPERATION_ID_PATTERN.test(value);
}

export function isTimestamp(value: unknown): value is string {
  return isBoundedString(value, MAX_TIMESTAMP_BYTES) && value.length > 0;
}

export function isDenseArray(value: readonly unknown[]): boolean {
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) return false;
  }
  return true;
}

export function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonicalize(item)]),
  );
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function isCanonicalDigestWithinLimit(value: unknown): boolean {
  try {
    return utf8ByteLength(canonicalJson(value))
      <= MAX_CANONICAL_DIGEST_BYTES;
  } catch {
    return false;
  }
}
