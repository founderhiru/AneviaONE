import type { IconName } from '@/components/Icon';
import { BRAND } from '@/lib/config';

export type Tone = 'blue' | 'teal' | 'lavender' | 'cream' | 'mint';

export type NavItem = {
  title: string;
  description: string;
  href: string;
  icon: IconName;
  tone: Tone;
};

export type NavGroup = {
  id: string;
  label: string;
  /** Top-level destination (the group's overview page). */
  href: string;
  /** Menu layout: plain grid or the numbered five-step progression. */
  variant: 'grid' | 'steps' | 'intelligence';
  items: NavItem[];
};

export type NavLink = { id: string; label: string; href: string };

/**
 * Header navigation. Desktop mega panels, the mobile drawer and the footer are
 * all rendered from this one structure.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'product',
    label: 'Product',
    href: '/product',
    variant: 'grid',
    items: [
      { title: 'Overview', description: `See what ${BRAND.name} does`, href: '/product', icon: 'overview', tone: 'blue' },
      { title: 'App Features', description: 'Explore key features', href: '/product#features', icon: 'sparkle', tone: 'teal' },
      { title: 'Use Cases', description: 'For individuals & families', href: '/product#use-cases', icon: 'users', tone: 'lavender' },
      { title: 'App Screens', description: 'Take a visual tour', href: '/#screens', icon: 'phone', tone: 'cream' },
    ],
  },
  {
    id: 'how',
    label: 'How It Works',
    href: '/how-it-works',
    variant: 'steps',
    items: [
      { title: 'Capture', description: 'Upload or send via WhatsApp', href: '/how-it-works#capture', icon: 'upload', tone: 'blue' },
      { title: 'Understand', description: 'AI extracts and organizes relevant information', href: '/how-it-works#understand', icon: 'scan', tone: 'teal' },
      { title: 'Remember', description: 'Build your longitudinal health history', href: '/how-it-works#remember', icon: 'layers', tone: 'lavender' },
      { title: 'Compare', description: 'Find trends and meaningful changes', href: '/how-it-works#compare', icon: 'compare', tone: 'mint' },
      { title: 'Ask', description: 'Get answers from your own health records', href: '/how-it-works#ask', icon: 'chat', tone: 'cream' },
    ],
  },
  {
    id: 'ai',
    label: 'AI Intelligence',
    href: '/ai-intelligence',
    variant: 'intelligence',
    items: [
      { title: 'Trends & Insights', description: 'See how your health changes', href: '/ai-intelligence#trends', icon: 'trend', tone: 'teal' },
      { title: 'What Changed', description: 'Compare across time', href: '/ai-intelligence#changes', icon: 'compare', tone: 'blue' },
      { title: 'Pattern Detection', description: 'Find meaningful patterns', href: '/ai-intelligence#patterns', icon: 'pattern', tone: 'lavender' },
      { title: 'AI Explanations', description: 'Easy-to-understand insights', href: '/ai-intelligence#explanations', icon: 'lightbulb', tone: 'cream' },
      { title: 'Accuracy & Sources', description: 'Always grounded in your records', href: '/ai-intelligence#sources', icon: 'evidence', tone: 'mint' },
    ],
  },
  {
    id: 'privacy',
    label: 'Privacy',
    href: '/privacy',
    variant: 'grid',
    items: [
      { title: 'Our Approach', description: 'Privacy by design', href: '/privacy', icon: 'shield', tone: 'blue' },
      { title: 'Data Security', description: 'How your data is protected', href: '/security', icon: 'lock', tone: 'teal' },
      { title: 'Your Control', description: 'Access, share, delete', href: '/privacy#control', icon: 'sliders', tone: 'lavender' },
      { title: 'Compliance', description: 'Standards & regulations', href: '/security#compliance', icon: 'badge', tone: 'cream' },
    ],
  },
  {
    id: 'about',
    label: 'About',
    href: '/about',
    variant: 'grid',
    items: [
      { title: 'Our Mission', description: `Why we built ${BRAND.name}`, href: '/about#mission', icon: 'compass', tone: 'blue' },
      { title: 'Our Team', description: 'People behind the product', href: '/about#team', icon: 'users', tone: 'teal' },
      { title: 'Careers', description: 'Join us', href: '/about#careers', icon: 'briefcase', tone: 'lavender' },
      { title: 'Contact', description: 'Get in touch', href: '/contact', icon: 'mail', tone: 'cream' },
    ],
  },
];

export const NAV_LINKS: NavLink[] = [{ id: 'faq', label: 'FAQ', href: '/faq' }];

export const FOOTER_PRODUCT_LINKS = [
  { label: 'Product', href: '/product' },
  { label: 'How It Works', href: '/how-it-works' },
  { label: 'AI Intelligence', href: '/ai-intelligence' },
  { label: 'Privacy', href: '/privacy' },
  { label: 'FAQ', href: '/faq' },
  { label: 'About', href: '/about' },
  { label: 'Contact', href: '/contact' },
];

export const FOOTER_LEGAL_LINKS = [
  { label: 'Privacy Policy', href: '/privacy' },
  { label: 'Terms of Service', href: '/terms' },
  { label: 'Security', href: '/security' },
  { label: 'Data & AI Principles', href: '/data-ai-principles' },
];
