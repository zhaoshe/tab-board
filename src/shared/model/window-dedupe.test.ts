import { describe, expect, it } from 'vitest';
import { classifyWindowDuplicates } from './window-dedupe';

interface Candidate {
  id: number;
  url: string;
  pinned: boolean;
  active: boolean;
  lastAccessed: number;
  index: number;
}

function candidate(
  id: number,
  updates: Partial<Candidate> = {},
): Candidate {
  return {
    id,
    url: 'https://same.example/',
    pinned: false,
    active: false,
    lastAccessed: id,
    index: id - 1,
    ...updates,
  };
}

describe('classifyWindowDuplicates', () => {
  it('keeps the active or most recent regular copy and marks the rest removable', () => {
    const older = candidate(1, { lastAccessed: 10 });
    const active = candidate(2, { active: true, lastAccessed: 1 });
    const recent = candidate(3, { lastAccessed: 20 });

    const result = classifyWindowDuplicates([older, active, recent]);

    expect(result.removable.map(({ id }) => id)).toEqual([3, 1]);
    expect(result.protectedPinnedCount).toBe(0);
  });

  it('protects every pinned copy and makes only regular matches removable', () => {
    const pinned = candidate(1, { pinned: true });
    const regular = candidate(2, { active: true });

    const result = classifyWindowDuplicates([pinned, regular]);

    expect(result.removable.map(({ id }) => id)).toEqual([2]);
    expect(result.protectedPinnedCount).toBe(1);
  });

  it('reports all-pinned duplicate groups without producing a removal', () => {
    const result = classifyWindowDuplicates([
      candidate(1, { pinned: true }),
      candidate(2, { pinned: true }),
    ]);

    expect(result.removable).toEqual([]);
    expect(result.protectedPinnedCount).toBe(2);
  });

  it('keeps distinct URLs and does not mutate the input order', () => {
    const input = [
      candidate(1, { url: 'https://one.example/' }),
      candidate(2, { url: 'https://two.example/' }),
      candidate(3, { url: 'https://one.example/', active: true }),
    ];
    const before = [...input];

    const result = classifyWindowDuplicates(input);

    expect(result.removable.map(({ id }) => id)).toEqual([1]);
    expect(input).toEqual(before);
  });
});
