/**
 * Site navigation. The header dropdowns, the mobile drawer and the footer are
 * all rendered from these structures.
 *
 * Primary nav: Product ▾ · Intelligence ▾ · How It Works · About · FAQ.
 * Trust and legal pages (Privacy, Security, Data & AI Principles, Terms) live
 * in the footer and the homepage Trust section, not the primary nav.
 */

export type NavItem = { title: string; description: string; href: string };

export type NavGroup = {
  id: string;
  label: string;
  /** Overview page for the group ("Explore … →"). */
  href: string;
  items: NavItem[];
};

export type NavLink = { id: string; label: string; href: string };

export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'product',
    label: 'Product',
    href: '/product',
    items: [
      { title: 'Health Memory', description: 'Your longitudinal health history.', href: '/product#memory' },
      { title: 'Timeline', description: 'Your health journey over time.', href: '/product#timeline' },
      { title: 'What Changed', description: 'Meaningful changes across records.', href: '/product#changes' },
      { title: 'Ask My Health', description: 'Questions grounded in your history.', href: '/product#ask' },
    ],
  },
  {
    id: 'intelligence',
    label: 'Intelligence',
    href: '/ai-intelligence',
    items: [
      { title: 'Understand', description: 'Turn records into structured health information.', href: '/ai-intelligence#evidence' },
      { title: 'Remember', description: 'Build a longitudinal health history.', href: '/ai-intelligence#memory' },
      { title: 'Compare', description: 'See meaningful changes over time.', href: '/ai-intelligence#time' },
      { title: 'Ask', description: 'Explore your health history conversationally.', href: '/ai-intelligence#ask' },
    ],
  },
];

export const NAV_LINKS: NavLink[] = [
  { id: 'how', label: 'How It Works', href: '/how-it-works' },
  { id: 'about', label: 'About', href: '/about' },
  { id: 'faq', label: 'FAQ', href: '/faq' },
];

export type FooterColumn = { title: string; links: { label: string; href: string }[] };

export const FOOTER_COLUMNS: FooterColumn[] = [
  {
    title: 'Product',
    links: [
      { label: 'Health Memory', href: '/product#memory' },
      { label: 'Timeline', href: '/product#timeline' },
      { label: 'What Changed', href: '/product#changes' },
      { label: 'Ask My Health', href: '/product#ask' },
    ],
  },
  {
    title: 'Intelligence',
    links: [
      { label: 'Understand', href: '/ai-intelligence#evidence' },
      { label: 'Compare', href: '/ai-intelligence#time' },
      { label: 'Ask', href: '/ai-intelligence#ask' },
      { label: 'How It Works', href: '/how-it-works' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About', href: '/about' },
      { label: 'FAQ', href: '/faq' },
      { label: 'Contact', href: '/contact' },
    ],
  },
  {
    title: 'Trust',
    links: [
      { label: 'Privacy', href: '/privacy' },
      { label: 'Security', href: '/security' },
      { label: 'Data & AI Principles', href: '/data-ai-principles' },
      { label: 'Terms', href: '/terms' },
    ],
  },
];
