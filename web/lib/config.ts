/**
 * Site configuration — single source of truth for brand copy and every
 * external destination.
 *
 * Nothing here pretends a destination exists. Store, sign-in, video and
 * contact URLs come from NEXT_PUBLIC_* env vars; when a value is empty the UI
 * shows an honest "Coming soon" state instead of a dead or fake link.
 * See web/.env.example.
 */

const clean = (value: string | undefined) => {
  const v = value?.trim();
  return v ? v : undefined;
};

// The product name is defined once; every other string derives from it.
const NAME = 'AneviaONE';
const CATEGORY = 'Personal Health Intelligence';

export const BRAND = {
  name: NAME,
  category: CATEGORY,
  tagline: 'Every record. Every change. One intelligent health history.',
  promise: 'Your health has a history. Now it has intelligence.',
  /** Brand signature (matches mobile `launchTagline`). Footer only. */
  signature: 'Healthier generations. Brighter lives.',
  description:
    `${NAME} is a Personal Health Intelligence app that brings your health records into one connected history, and into a one-page summary for your Doctor.`,
  title: `${NAME} | ${CATEGORY}`,
} as const;

export const SITE = {
  // TODO(launch): confirm the production domain and set NEXT_PUBLIC_SITE_URL.
  url: clean(process.env.NEXT_PUBLIC_SITE_URL) ?? 'https://aneviaone.com',
} as const;

export const LINKS = {
  // TODO(launch): set once the app is published to each store.
  appStore: clean(process.env.NEXT_PUBLIC_APP_STORE_URL),
  googlePlay: clean(process.env.NEXT_PUBLIC_GOOGLE_PLAY_URL),
  // TODO(launch): set once a web/app sign-in destination exists. No login flow
  // is built into this marketing site.
  signIn: clean(process.env.NEXT_PUBLIC_SIGN_IN_URL),
  // TODO(launch): set to the 1-minute product walkthrough when it is recorded.
  demoVideo: clean(process.env.NEXT_PUBLIC_DEMO_VIDEO_URL),
  // The help inbox. Override with NEXT_PUBLIC_CONTACT_EMAIL if it ever changes.
  contactEmail: clean(process.env.NEXT_PUBLIC_CONTACT_EMAIL) ?? 'help@aneviaone.com',
} as const;

/**
 * Two-tone wordmark derived from BRAND.name, so the logo, app-screen mockups
 * and OG image follow any change to the name or its capitalization.
 * "AneviaOne" / "AneviaONE" → ["Anevia", "One" | "ONE"].
 */
export const WORDMARK = (() => {
  const m = /^(.+?)(one)$/i.exec(BRAND.name);
  return m ? { lead: m[1], accent: m[2] } : { lead: BRAND.name, accent: '' };
})();

/** True once at least one store listing URL is configured. */
export const STORES_LIVE = Boolean(LINKS.appStore || LINKS.googlePlay);

/** The Download App page: store links when they are live, an honest status until then. */
export const DOWNLOAD_PATH = '/download';

/** Primary call to action — Download App, everywhere. Goes to /download. */
export const PRIMARY_CTA = { label: 'Download App', href: DOWNLOAD_PATH } as const;

/**
 * Sign In. Sign-in happens in the app; until NEXT_PUBLIC_SIGN_IN_URL names a
 * real web sign-in, the link goes to /download#sign-in, which explains how.
 */
export const SIGN_IN = {
  label: 'Sign In',
  href: LINKS.signIn ?? `${DOWNLOAD_PATH}#sign-in`,
  external: Boolean(LINKS.signIn),
} as const;

/** Secondary call to action, used alongside the primary one in the hero. */
export const SECONDARY_CTA = { label: 'See how it works', href: '/#how' } as const;
