import type { TextStyle } from 'react-native';

/**
 * The AneviaONE brand surface: the deep forest green of the launch
 * storyboard, lit with restrained gold/champagne and set in ivory. Shared by
 * the launch splash, Welcome and every sign-in screen so they read as one
 * continuous moment — keep colours for those surfaces here rather than
 * redefining them per screen. The mark's own artwork colours live with the
 * artwork (components/BrandMarkArt.tsx).
 */
export const FOREST = {
  /** Matches the native launch screen background in app.json. */
  field: '#0E2A1B',
  /** Radial field, lit from above: centre → edge. */
  fieldStops: ['#2C5A36', '#22492C', '#183A23', '#11301D', '#0A2215'] as const,
  vignette: '#04110A',
  gold: '#F2D58A',
  champagne: '#F1E3B0',
  ivory: '#F6F9EF',
  warmIvory: '#FBF8EF',
  sage: '#BFE0B5',
  limeGold: '#C9DC86',
  ringGreen: '#A9CF86',
  /** Text on the green field. */
  text: '#F6F9EF',
  textMuted: 'rgba(246, 249, 239, 0.78)',
  textFaint: 'rgba(246, 249, 239, 0.5)',
  /** Outlines and input borders on the green field. */
  hairline: 'rgba(246, 249, 239, 0.38)',
  inputFill: 'rgba(246, 249, 239, 0.06)',
  /** Errors on the green field (a light coral that stays legible on dark). */
  danger: '#FFB4A8',
  /** Ink for the warm-ivory primary button. */
  ink: '#0E2A1B',
} as const;

/**
 * The white sign-in sheet that rises over the forest field on Welcome:
 * forest ink on white, with one deep-emerald primary action.
 */
export const SHEET = {
  surface: '#FFFFFF',
  ink: '#0E2A1B',
  textMuted: 'rgba(14, 42, 27, 0.66)',
  textFaint: 'rgba(14, 42, 27, 0.5)',
  hairline: 'rgba(14, 42, 27, 0.14)',
  /** Primary action on the sheet. */
  emerald: '#17492E',
  link: '#1C5C3A',
  radius: 28,
} as const;

/**
 * Type for the brand surface. The wordmark and tagline match the settled
 * splash frame exactly, so Welcome continues it without a jump; every
 * sign-in button shares one label style.
 */
export const BRAND_TYPE = {
  wordmark: { fontSize: 34, lineHeight: 42, fontWeight: '500', letterSpacing: 0.2, textAlign: 'center' },
  wordmarkAccent: { fontWeight: '600' },
  tagline: {
    fontSize: 12.5,
    lineHeight: 19,
    fontWeight: '600',
    letterSpacing: 2.8,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  title: { fontSize: 28, lineHeight: 34, fontWeight: '600', letterSpacing: -0.2 },
  body: { fontSize: 16, lineHeight: 23, fontWeight: '400' },
  /** One label style for Mobile, Google, Apple and every sign-in action. */
  button: { fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: 0.1 },
  fine: { fontSize: 13, lineHeight: 19, fontWeight: '400' },
} satisfies Record<string, TextStyle>;

/** Height and corner radius shared by every sign-in button. */
export const AUTH_BUTTON = { height: 56, radius: 16, iconSize: 20 } as const;
