import { describe, expect, it } from 'vitest';
import { getHorizontalAutoScroll } from './dndAutoScroll';

describe('getHorizontalAutoScroll', () => {
  it('stays idle in the center and outside both edge zones', () => {
    expect(getHorizontalAutoScroll({
      pointerX: 300,
      viewportLeft: 100,
      viewportRight: 500,
    })).toEqual({ direction: 0, speed: 0, depth: 0 });

    expect(getHorizontalAutoScroll({
      pointerX: 148,
      viewportLeft: 100,
      viewportRight: 500,
    })).toEqual({ direction: 0, speed: 0, depth: 0 });

    expect(getHorizontalAutoScroll({
      pointerX: 452,
      viewportLeft: 100,
      viewportRight: 500,
    })).toEqual({ direction: 0, speed: 0, depth: 0 });
  });

  it('increases right-edge speed linearly with pointer depth', () => {
    expect(getHorizontalAutoScroll({
      pointerX: 468,
      viewportLeft: 100,
      viewportRight: 500,
    })).toEqual({ direction: 1, speed: 6, depth: 1 / 3 });

    expect(getHorizontalAutoScroll({
      pointerX: 492,
      viewportLeft: 100,
      viewportRight: 500,
    })).toEqual({ direction: 1, speed: 10.5, depth: 5 / 6 });
  });

  it('mirrors the speed policy at the left edge', () => {
    expect(getHorizontalAutoScroll({
      pointerX: 132,
      viewportLeft: 100,
      viewportRight: 500,
    })).toEqual({ direction: -1, speed: 6, depth: 1 / 3 });

    expect(getHorizontalAutoScroll({
      pointerX: 108,
      viewportLeft: 100,
      viewportRight: 500,
    })).toEqual({ direction: -1, speed: 10.5, depth: 5 / 6 });
  });

  it('clamps pointers at or beyond either viewport edge', () => {
    expect(getHorizontalAutoScroll({
      pointerX: 520,
      viewportLeft: 100,
      viewportRight: 500,
    })).toEqual({ direction: 1, speed: 12, depth: 1 });

    expect(getHorizontalAutoScroll({
      pointerX: 80,
      viewportLeft: 100,
      viewportRight: 500,
    })).toEqual({ direction: -1, speed: 12, depth: 1 });
  });

  it('supports finite custom zones and speed bounds', () => {
    expect(getHorizontalAutoScroll({
      pointerX: 185,
      viewportLeft: 100,
      viewportRight: 200,
      zoneWidth: 30,
      minSpeed: 2,
      maxSpeed: 8,
    })).toEqual({ direction: 1, speed: 5, depth: 0.5 });
  });

  it.each([
    { pointerX: Number.NaN, viewportLeft: 0, viewportRight: 100 },
    { pointerX: 50, viewportLeft: Number.NEGATIVE_INFINITY, viewportRight: 100 },
    { pointerX: 50, viewportLeft: 100, viewportRight: 100 },
    { pointerX: 50, viewportLeft: 101, viewportRight: 100 },
    { pointerX: 50, viewportLeft: 0, viewportRight: 100, zoneWidth: 0 },
    { pointerX: 50, viewportLeft: 0, viewportRight: 100, zoneWidth: Number.NaN },
    { pointerX: 50, viewportLeft: 0, viewportRight: 100, minSpeed: -1 },
    { pointerX: 50, viewportLeft: 0, viewportRight: 100, maxSpeed: Number.POSITIVE_INFINITY },
    { pointerX: 50, viewportLeft: 0, viewportRight: 100, minSpeed: 13, maxSpeed: 12 },
  ])('returns a finite idle result for malformed input %#', (input) => {
    const result = getHorizontalAutoScroll(input);
    expect(result).toEqual({ direction: 0, speed: 0, depth: 0 });
    expect(Number.isFinite(result.speed)).toBe(true);
    expect(Number.isFinite(result.depth)).toBe(true);
  });

  it('clamps an oversized zone to avoid overlapping edge directions', () => {
    expect(getHorizontalAutoScroll({
      pointerX: 150,
      viewportLeft: 100,
      viewportRight: 200,
      zoneWidth: 500,
    })).toEqual({ direction: 0, speed: 0, depth: 0 });
  });
});
