import type { Metadata } from 'next';

import { BRAND } from '@/lib/config';
import { PAGES } from '@/lib/pages';

/** Per-page title, description, canonical URL and Open Graph metadata. */
export function pageMetadata(slug: string): Metadata {
  const page = PAGES[slug];
  const url = `/${slug}`;
  return {
    title: page.title,
    description: page.description,
    alternates: { canonical: url },
    openGraph: { title: `${page.title} | ${BRAND.name}`, description: page.description, url, type: 'website' },
    twitter: { card: 'summary_large_image', title: `${page.title} | ${BRAND.name}`, description: page.description },
  };
}
