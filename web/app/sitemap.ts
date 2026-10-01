import type { MetadataRoute } from 'next';

import { SITE } from '@/lib/config';

const ROUTES = [
  '',
  '/product',
  '/how-it-works',
  '/ai-intelligence',
  '/privacy',
  '/security',
  '/about',
  '/faq',
  '/contact',
  '/terms',
  '/data-ai-principles',
];

export default function sitemap(): MetadataRoute.Sitemap {
  return ROUTES.map((path) => ({
    url: `${SITE.url}${path}`,
    changeFrequency: path === '' ? 'weekly' : 'monthly',
    priority: path === '' ? 1 : 0.7,
  }));
}
