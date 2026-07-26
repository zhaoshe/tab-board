import {
  isDropIntentShape,
  isDropPayloadWithinLimits,
  isOpenTabInfoShape,
} from '../model/drop-validation';
export {
  isDropIntentShape,
  isDropPayloadWithinLimits,
  isOpenTabInfoShape,
} from '../model/drop-validation';
export {
  canonicalJson,
  canonicalize,
  isBoundedString,
  isCanonicalDigestWithinLimit,
  isDenseArray,
  isEntityId,
  isOperationId,
  isTimestamp,
  MAX_CANONICAL_DIGEST_BYTES,
  MAX_ENTITY_ID_BYTES,
  MAX_FAVICON_URL_BYTES,
  MAX_LIVE_RECORDS,
  MAX_MUTATIONS,
  MAX_OPERATION_ID_BYTES,
  MAX_REFS,
  MAX_TIMESTAMP_BYTES,
  MAX_TITLE_BYTES,
  MAX_URL_BYTES,
  utf8ByteLength,
} from '../validation';

export function isDropMutationCandidate(value: unknown): boolean {
  return Boolean(value)
    && typeof value === 'object'
    && !Array.isArray(value)
    && (value as Record<string, unknown>).type === 'drop-intent';
}
