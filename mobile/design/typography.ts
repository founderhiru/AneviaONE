import { Platform } from 'react-native';

/**
 * Typography tokens. Uses the system font (San Francisco / Roboto) for a
 * native, premium feel without bundling a custom font yet. Sizes support
 * Dynamic Type reasonably well since components should use these tokens
 * rather than fixed pixel values scattered through the app.
 */

const fontFamily = Platform.select({
  ios: 'System',
  android: 'sans-serif',
  default: 'System',
});

const fontFamilyMedium = Platform.select({
  ios: 'System',
  android: 'sans-serif-medium',
  default: 'System',
});

export const typography = {
  fontFamily,
  fontFamilyMedium,

  // Slightly negative letter-spacing on the large editorial sizes reads as
  // premium/considered rather than default-system-font-dense; kept subtle
  // so it never looks like a custom display font was intended.
  displayLarge: { fontSize: 32, lineHeight: 40, fontWeight: '700' as const, letterSpacing: -0.4 },
  displayMedium: { fontSize: 28, lineHeight: 36, fontWeight: '700' as const, letterSpacing: -0.3 },
  headingLarge: { fontSize: 24, lineHeight: 32, fontWeight: '700' as const, letterSpacing: -0.2 },
  headingMedium: { fontSize: 20, lineHeight: 28, fontWeight: '600' as const, letterSpacing: -0.1 },
  headingSmall: { fontSize: 17, lineHeight: 24, fontWeight: '600' as const },

  bodyLarge: { fontSize: 17, lineHeight: 25, fontWeight: '400' as const },
  bodyMedium: { fontSize: 15, lineHeight: 22, fontWeight: '400' as const },
  bodySmall: { fontSize: 13, lineHeight: 19, fontWeight: '400' as const },

  labelLarge: { fontSize: 15, lineHeight: 20, fontWeight: '600' as const },
  labelMedium: { fontSize: 13, lineHeight: 18, fontWeight: '600' as const },
  labelSmall: { fontSize: 11, lineHeight: 15, fontWeight: '600' as const },

  caption: { fontSize: 12, lineHeight: 16, fontWeight: '400' as const },
} as const;

export type TypographyTokens = typeof typography;
