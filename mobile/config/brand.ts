/**
 * BRAND CONFIGURATION — single source of truth for product naming.
 *
 * The product name below is a WORKING name (not final or registered). Every
 * screen, component and test must read product naming from `BRAND` — never a
 * literal string, in any spelling or capitalisation — so the app can be
 * re-branded by changing only this file.
 *
 * Native limitation: app.json can't import TypeScript, so the home-screen
 * display name (`expo.name`) must be kept in sync by hand. It is the only
 * other place the name appears; permission prompts there are written without
 * the product name (iOS/Android already show the app name in the dialog).
 *
 * Branding is presentation only: database tables, storage buckets, bundle
 * identifiers and URL schemes stay product-neutral and must not change with
 * the brand.
 *
 * Do not import competitor names, logos, or wording anywhere in the app.
 * Do not add a logo asset yet — `BRAND.logo` intentionally stays null and
 * screens render the product name as a text wordmark instead.
 */

const PRODUCT_NAME = 'AneviaOne';
/** Display form of the name for the brand wordmark (launch sequence). */
const PRODUCT_WORDMARK = 'AneviaONE';

export const BRAND = {
  /** Working product name, shown on splash/welcome/marketing-style moments. */
  productName: PRODUCT_NAME,
  /** Compact name for tab bars, headers, and tight spaces (same for now). */
  productShortName: PRODUCT_NAME,
  /** Product category. */
  category: 'Personal Health Intelligence',
  /** Core product promise, used on Welcome and the launch sequence. */
  tagline: 'Every record. Every change. One intelligent health history.',
  /** The name as set in the brand wordmark (launch sequence only). */
  wordmark: PRODUCT_WORDMARK,
  /** Brand tagline under the wordmark — launch sequence and Welcome
   * (shown upper-case: HEALTHIER GENERATIONS / BRIGHTER LIVES). */
  launchTagline: 'Healthier generations. Brighter lives.',
  /** Short supporting line about the product (no longer on Welcome, which
   * now repeats the launch sequence's tagline). */
  welcomeTagline: 'Your health. Connected over time.',
  /** No logo asset yet — render a text wordmark using the product name. */
  logo: null as null,
  /** Core product loop, used in a few explanatory/empty-state contexts. */
  loop: ['Capture', 'Remember', 'Understand', 'Compare', 'Ask'] as const,
} as const;

/**
 * The tagline as two display lines: every sentence but the last, then the
 * last ("Every record. Every change." / "One intelligent health history.").
 */
export function taglineLines(tagline: string = BRAND.tagline): [string, string] {
  const parts = tagline.split(/(?<=\.)\s+/);
  if (parts.length < 2) return [tagline, ''];
  return [parts.slice(0, -1).join(' '), parts[parts.length - 1]];
}

/**
 * The wordmark in two parts: everything before its final capitalised word,
 * then that word ("Anevia" / "ONE"), so the second part can take an accent
 * colour. Falls back to the whole name with no accent.
 */
export function wordmarkParts(name: string = BRAND.wordmark): [string, string] {
  const match = /^(.*[a-z])([A-Z][A-Za-z]*)$/.exec(name);
  return match ? [match[1], match[2]] : [name, ''];
}

/**
 * Names for the recurring product concepts. Prefer these terms everywhere in
 * the UI instead of ad-hoc phrasing.
 */
export const PRODUCT_TERMS = {
  healthMemory: 'Health Memory',
  askMyHealth: 'Ask My Health',
  whatChanged: 'What Changed',
  healthTimeline: 'Health Timeline',
  healthTrends: 'Health Trends',
  doctorBrief: 'Doctor Brief',
  familyHealth: 'Family Health',
} as const;

export type BrandConfig = typeof BRAND;
