/**
 * Public legal pages, published on the marketing site. They're opened in the
 * in-app browser from sign-in, where the in-app Help pages (signed-in only)
 * aren't reachable. Add a link here only once its page exists on the site.
 */
export const LEGAL_LINKS = {
  terms: { label: 'Terms of Service', url: 'https://aneviaone.com/terms' },
  privacy: { label: 'Privacy Policy', url: 'https://aneviaone.com/privacy' },
} as const;
