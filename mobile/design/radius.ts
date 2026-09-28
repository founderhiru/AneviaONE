/**
 * Corner radius scale. Calm, modern rounding — never fully "pill" everywhere
 * (that reads as gamified) and never sharp-edged (that reads clinical).
 */
export const radius = {
  none: 0,
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  pill: 999,
} as const;

export type RadiusTokens = typeof radius;
