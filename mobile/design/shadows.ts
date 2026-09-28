import { Platform } from 'react-native';

/**
 * Elevation tokens. Kept subtle by design — this product should never look
 * like a stack of heavy floating cards. Use `card` for the rare surfaces
 * that need to lift off the background (e.g. bottom sheets, modals), and
 * `none` for ordinary content cards which should rely on borders instead.
 */
function shadow(elevation: number, opacity: number) {
  return Platform.select({
    ios: {
      shadowColor: '#12203B',
      shadowOffset: { width: 0, height: elevation / 2 },
      shadowOpacity: opacity,
      shadowRadius: elevation,
    },
    android: {
      elevation,
    },
    default: {},
  });
}

export const shadows = {
  none: {},
  subtle: shadow(2, 0.06),
  card: shadow(6, 0.08),
  raised: shadow(12, 0.12),
} as const;

export type ShadowTokens = typeof shadows;
