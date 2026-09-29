import type { Metadata } from 'next';

import { PAGES } from '@/lib/pages';

/** Per-page title, description, canonical URL and Open Graph metadata. */
export function pageMetadata(slug: string): Metadata {
  const page = PAGES[slug];
  const url = `/${slug}`;
  return {
    title: page.title,
    description: page.description,
    alternates: { canonical: url },
    openGraph: { title: `${page.title} | AneviaOne`, description: page.description, url, type: 'website' },
    twitter: { card: 'summary_large_image', title: `${page.title} | AneviaOne`, description: page.description },
  };
}
