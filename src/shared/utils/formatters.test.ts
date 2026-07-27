import { describe, expect, it } from 'vitest';
import {
  formatDate,
  formatDateTime,
  formatNumber,
  formatRelativeTime,
} from './formatters';

describe('locale formatters', () => {
  it('formats relative past and future values with Intl semantics', () => {
    const now = new Date('2026-07-27T10:00:00.000Z');

    expect(formatRelativeTime('2026-07-27T09:59:00.000Z', now, 'en')).toBe('1 minute ago');
    expect(formatRelativeTime('2026-07-28T10:00:00.000Z', now, 'en')).toBe('tomorrow');
  });

  it('formats dates with the requested locale and returns an empty string for invalid values', () => {
    expect(formatDate('2026-07-27T10:00:00.000Z', 'en-US')).toBe('Jul 27, 2026');
    expect(formatDate('not-a-date', 'en-US')).toBe('');
  });

  it('formats date-time values through the shared Intl owner', () => {
    expect(formatDateTime('2026-07-27T10:00:00.000Z', 'en-US', 'UTC'))
      .toBe('Jul 27, 2026, 10:00 AM');
    expect(formatDateTime('not-a-date', 'en-US', 'UTC')).toBe('');
  });

  it('formats numeric UI counts through Intl.NumberFormat', () => {
    expect(formatNumber(12345, 'en-US')).toBe('12,345');
    expect(formatNumber(Number.NaN, 'en-US')).toBe('');
  });
});
