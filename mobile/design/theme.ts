import { useColorScheme } from 'react-native';

import { darkColors, lightColors, type ColorTokens } from './colors';
import { radius, type RadiusTokens } from './radius';
import { shadows, type ShadowTokens } from './shadows';
import { spacing, minTouchTarget, type SpacingTokens } from './spacing';
import { typography, type TypographyTokens } from './typography';

export type Theme = {
  scheme: 'light' | 'dark';
  colors: ColorTokens;
  spacing: SpacingTokens;
  radius: RadiusTokens;
  shadows: ShadowTokens;
  typography: TypographyTokens;
  minTouchTarget: number;
};

export function getTheme(scheme: string | null | undefined): Theme {
  const resolved = scheme === 'dark' ? 'dark' : 'light';
  return {
    scheme: resolved,
    colors: resolved === 'dark' ? darkColors : lightColors,
    spacing,
    radius,
    shadows,
    typography,
    minTouchTarget,
  };
}

/** Reads the OS color scheme and returns the matching design theme. */
export function useTheme(): Theme {
  const scheme = useColorScheme();
  return getTheme(scheme);
}
