/**
 * Color tokens — brand-neutral.
 *
 * Principles: premium, calm, trustworthy, private. A warm/light canvas with
 * deep navy as the anchor color. Avoids excessive red, heavy gradients, and
 * "medical dashboard" saturation. Every screen should consume these tokens
 * (directly or via `useTheme`) rather than inlining hex values, so the
 * palette can be swapped for a final brand palette in one place.
 */

const palette = {
  // Neutrals — warm, light canvas
  cream50: '#FBFAF7',
  cream100: '#F7F5F0',
  cream200: '#F0ECE3',
  sand300: '#E4DDCF',
  sand400: '#CFC5B2',

  // Anchor — deep navy
  navy900: '#12203B',
  navy800: '#1B2E4F',
  navy700: '#28406B',
  navy600: '#3A5686',
  navy500: '#5573A3',

  // Ink / text
  ink900: '#181B22',
  ink700: '#3B3F49',
  ink500: '#6B7080',
  ink300: '#9AA0AF',

  // Signal colors — muted, not alarming
  teal600: '#2E7D74',
  teal100: '#DCEEEC',
  amber600: '#B4791F',
  amber100: '#F5E7D0',
  rose600: '#B0483F',
  rose100: '#F3E0DD',

  white: '#FFFFFF',
  black: '#000000',
} as const;

export type ColorTokens = {
  background: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  borderStrong: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  textOnDark: string;
  textDisabled: string;
  brandPrimary: string;
  brandPrimaryPressed: string;
  brandSecondary: string;
  accent: string;
  accentSubtle: string;
  success: string;
  successSubtle: string;
  warning: string;
  warningSubtle: string;
  danger: string;
  dangerSubtle: string;
  /** Calm informational blue (e.g. a "Results" summary tile). */
  info: string;
  infoSubtle: string;
  trendUp: string;
  trendDown: string;
  trendFlat: string;
  focusRing: string;
  overlay: string;
  skeleton: string;
};

export const lightColors: ColorTokens = {
  background: palette.cream50,
  surface: palette.white,
  surfaceAlt: palette.cream100,
  border: palette.sand300,
  borderStrong: palette.sand400,

  textPrimary: palette.ink900,
  textSecondary: palette.ink700,
  textTertiary: palette.ink500,
  textOnDark: palette.white,
  textDisabled: palette.ink300,

  brandPrimary: palette.navy800,
  brandPrimaryPressed: palette.navy900,
  brandSecondary: palette.navy600,
  accent: palette.teal600,
  accentSubtle: palette.teal100,

  // Semantic
  success: palette.teal600,
  successSubtle: palette.teal100,
  warning: palette.amber600,
  warningSubtle: palette.amber100,
  danger: palette.rose600,
  dangerSubtle: palette.rose100,
  info: palette.navy600,
  infoSubtle: '#E4EBF6',

  // Trend-specific (neutral, not diagnostic)
  trendUp: palette.amber600,
  trendDown: palette.teal600,
  trendFlat: palette.ink500,

  focusRing: palette.navy600,
  overlay: 'rgba(18, 32, 59, 0.45)',
  skeleton: palette.cream200,
};

export const darkColors: ColorTokens = {
  background: palette.navy900,
  surface: palette.navy800,
  surfaceAlt: '#213353',
  border: '#33456A',
  borderStrong: '#425A88',

  textPrimary: palette.cream50,
  textSecondary: '#D6DAE4',
  textTertiary: '#9BA6BF',
  textOnDark: palette.white,
  textDisabled: '#5A6684',

  brandPrimary: palette.cream100,
  brandPrimaryPressed: palette.white,
  brandSecondary: palette.navy500,
  accent: '#5FC2B6',
  accentSubtle: '#1E3D3A',

  success: '#5FC2B6',
  successSubtle: '#1E3D3A',
  warning: '#E0A857',
  warningSubtle: '#3D3120',
  danger: '#E08277',
  dangerSubtle: '#3D2521',
  info: '#9DB4DD',
  infoSubtle: '#26395C',

  trendUp: '#E0A857',
  trendDown: '#5FC2B6',
  trendFlat: '#9BA6BF',

  focusRing: '#7FA1D6',
  overlay: 'rgba(8, 13, 24, 0.6)',
  skeleton: '#213353',
};

export { palette };
