/**
 * Site navigation — deliberately small. The header carries four pages and one
 * call to action; the footer is a quiet signature with only the trust and
 * company pages, not a second copy of the header.
 *
 * Product, FAQ and Data & AI Principles remain real routes (linked from the
 * homepage and from each other) but are intentionally not in the chrome.
 */

export type NavLink = { id: string; label: string; href: string };

export const NAV_LINKS: NavLink[] = [
  { id: 'how', label: 'How It Works', href: '/how-it-works' },
  { id: 'intelligence', label: 'Intelligence', href: '/ai-intelligence' },
  { id: 'security', label: 'Security', href: '/security' },
  { id: 'about', label: 'About', href: '/about' },
];

/** Footer links — every one is an existing route. */
export const FOOTER_LINKS: NavLink[] = [
  { id: 'about', label: 'About', href: '/about' },
  { id: 'security', label: 'Security', href: '/security' },
  { id: 'privacy', label: 'Privacy', href: '/privacy' },
  { id: 'terms', label: 'Terms', href: '/terms' },
  { id: 'contact', label: 'Contact', href: '/contact' },
];
