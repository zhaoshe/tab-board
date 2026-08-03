import { describe, expect, it } from 'vitest';
import {
  CATEGORY_COLOR_PALETTE,
  isLegacyCategoryColor,
  normalizeCategoryColor,
} from './category-colors';

describe('category color contract', () => {
  it('canonicalizes every shipped palette color', () => {
    expect(CATEGORY_COLOR_PALETTE).toHaveLength(10);
    for (const color of CATEGORY_COLOR_PALETTE) {
      expect(normalizeCategoryColor(color.toUpperCase())).toBe(color);
    }
  });

  it.each([
    'slate',
    'grey',
    'gray',
    'blue',
    'red',
    'yellow',
    'green',
    'pink',
    'purple',
    'cyan',
    'orange',
  ])('preserves the legacy named color %s', (color) => {
    expect(normalizeCategoryColor(` ${color.toUpperCase()} `)).toBe(color);
    expect(isLegacyCategoryColor(color)).toBe(true);
  });

  it.each([
    '',
    '   ',
    'transparent',
    'url(javascript:alert(1))',
    'var(--unsafe)',
    '#123456',
    'not-a-color',
  ])('rejects unsupported or unsafe color %j', (color) => {
    expect(normalizeCategoryColor(color)).toBeNull();
    expect(isLegacyCategoryColor(color)).toBe(false);
  });
});
