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
const NAME = 'AneviaOne';
const CATEGORY = 'Personal Health Intelligence';

export const BRAND = {
  name: NAME,
  category: CATEGORY,
  parent: 'MedhaIQ Systems',
  tagline: 'Every record. Every change. One intelligent health history.',
  promise: 'Your health has a history. Now it has intelligence.',
  description:
    `${NAME} brings your health records, reports, medications and changes together into one intelligent health history.`,
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
  // TODO(launch): set to a monitored inbox.
  contactEmail: clean(process.env.NEXT_PUBLIC_CONTACT_EMAIL),
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

/** Anchor on the home page where the download buttons live. */
export const DOWNLOAD_ANCHOR = '/#download';
