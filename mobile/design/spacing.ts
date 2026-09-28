/**
 * Spacing scale (4px base unit). Use these instead of magic numbers so
 * rhythm stays consistent across screens and platforms.
 */
export const spacing = {
  none: 0,
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40,
  huge: 56,
} as const;

/** Minimum recommended touch target size (accessibility). */
export const minTouchTarget = 44;

export type SpacingTokens = typeof spacing;
