/**
 * BRAND CONFIGURATION — single source of truth for product naming.
 *
 * The final brand/startup name has NOT been decided yet. Every screen and
 * component must read the product name from here rather than hard-coding it,
 * so the whole app can be re-branded later by changing only this file.
 *
 * Do not import competitor names, logos, or wording anywhere in the app.
 * Do not add a logo asset yet — `BRAND.logo` intentionally stays null and
 * screens should render `BRAND.name` as a text wordmark placeholder instead.
 */

export const BRAND = {
  /** Full product name shown on splash/onboarding/marketing-style moments. */
  name: 'Health Intelligence',
  /** Compact name for tab bars, headers, and tight spaces. */
  shortName: 'Health',
  /** Product category — safe to use even before a brand name is final. */
  category: 'Personal Health Intelligence',
  /** Primary tagline used on Welcome/Onboarding screen 1. */
  tagline: 'Your health has a history. Now it has intelligence.',
  /** No logo asset yet — render a text wordmark using `name`/`shortName`. */
  logo: null as null,
  /** Core product loop, used in a few explanatory/empty-state contexts. */
  loop: ['Capture', 'Remember', 'Compare', 'Understand', 'Ask', 'Share'] as const,
} as const;

/**
 * Brand-neutral copy for the recurring product concepts. Prefer these terms
 * everywhere in the UI instead of ad-hoc phrasing, and never repeat
 * `BRAND.name` so often that it starts reading as the final product name.
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
