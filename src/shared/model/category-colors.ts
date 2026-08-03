export const CATEGORY_COLOR_PALETTE = [
  '#228be6',
  '#40c057',
  '#fab005',
  '#fa5252',
  '#be4bdb',
  '#7950f2',
  '#15aabf',
  '#fd7e14',
  '#868e96',
  '#e64980',
] as const;

export const LEGACY_CATEGORY_COLORS = [
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
] as const;

export type CategoryPaletteColor = (typeof CATEGORY_COLOR_PALETTE)[number];
export type LegacyCategoryColor = (typeof LEGACY_CATEGORY_COLORS)[number];
export type CategoryColor = CategoryPaletteColor | LegacyCategoryColor;

const paletteColors = new Set<string>(CATEGORY_COLOR_PALETTE);
const legacyColors = new Set<string>(LEGACY_CATEGORY_COLORS);
const legacyColorCssValues: Record<LegacyCategoryColor, string> = {
  slate: '#868e96',
  grey: '#868e96',
  gray: '#868e96',
  blue: '#228be6',
  red: '#fa5252',
  yellow: '#fab005',
  green: '#40c057',
  pink: '#e64980',
  purple: '#7950f2',
  cyan: '#15aabf',
  orange: '#fd7e14',
};

export function normalizeCategoryColor(value: unknown): CategoryColor | null {
  if (typeof value !== 'string') return null;
  const normalized = value.normalize('NFC').trim().toLocaleLowerCase('en-US');
  if (paletteColors.has(normalized) || legacyColors.has(normalized)) {
    return normalized as CategoryColor;
  }
  return null;
}

export function isLegacyCategoryColor(
  value: unknown,
): value is LegacyCategoryColor {
  return typeof value === 'string'
    && legacyColors.has(value.normalize('NFC').trim().toLocaleLowerCase('en-US'));
}

export function categoryColorCssValue(value: unknown): string {
  const normalized = normalizeCategoryColor(value);
  return normalized && isLegacyCategoryColor(normalized)
    ? legacyColorCssValues[normalized]
    : normalized ?? legacyColorCssValues.slate;
}
