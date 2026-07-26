import { describe, expect, it } from 'vitest';
import {
  canonicalJson,
  isCanonicalDigestWithinLimit,
  isDenseArray,
  isEntityId,
  isOperationId,
  isTimestamp,
  MAX_CANONICAL_DIGEST_BYTES,
  utf8ByteLength,
} from './validation';

describe('shared primitive validation', () => {
  it('validates operation IDs, entity IDs, and timestamps at the shared boundary', () => {
    expect(isOperationId('drop.operation-1')).toBe(true);
    expect(isOperationId('')).toBe(false);
    expect(isOperationId('drop operation')).toBe(false);
    expect(isEntityId('group-1')).toBe(true);
    expect(isEntityId('')).toBe(false);
    expect(isTimestamp('2026-01-01T00:00:00.000Z')).toBe(true);
    expect(isTimestamp('')).toBe(false);
  });

  it('rejects sparse arrays', () => {
    const sparse: unknown[] = [];
    sparse[1] = 'value';

    expect(isDenseArray([1, 2])).toBe(true);
    expect(isDenseArray(sparse)).toBe(false);
  });

  it('canonicalizes nested object keys without reordering arrays', () => {
    expect(canonicalJson({
      b: 2,
      a: { d: 4, c: 3 },
      list: [{ b: 2, a: 1 }, 'value'],
    })).toBe('{"a":{"c":3,"d":4},"b":2,"list":[{"a":1,"b":2},"value"]}');
  });

  it('measures UTF-8 bytes and enforces the canonical digest limit', () => {
    expect(utf8ByteLength('中')).toBe(3);
    expect(isCanonicalDigestWithinLimit({ value: 'a' })).toBe(true);
    expect(isCanonicalDigestWithinLimit({
      value: 'x'.repeat(MAX_CANONICAL_DIGEST_BYTES),
    })).toBe(false);
  });
});
