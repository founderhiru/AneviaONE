import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import { Footer } from '@/components/Footer';
import { Header } from '@/components/Header';
import { BRAND, SITE } from '@/lib/config';

import './styles/base.css';
import './styles/phone.css';
import './styles/header.css';
import './styles/footer.css';
import './styles/home.css';
import './styles/pages.css';

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: BRAND.title, template: `%s | ${BRAND.name}` },
  description: BRAND.description,
  applicationName: BRAND.name,
  alternates: { canonical: '/' },
  robots: { index: true, follow: true },
  openGraph: {
    type: 'website',
    siteName: BRAND.name,
    title: BRAND.title,
    description: BRAND.description,
    url: '/',
    locale: 'en_IN',
  },
  twitter: {
    card: 'summary_large_image',
    title: BRAND.title,
    description: BRAND.description,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#082B57',
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${SITE.url}/#org`,
      name: BRAND.parent,
      url: SITE.url,
      brand: { '@type': 'Brand', name: BRAND.name },
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE.url}/#site`,
      url: SITE.url,
      name: BRAND.name,
      description: BRAND.description,
      publisher: { '@id': `${SITE.url}/#org` },
    },
    {
      // No price, rating or availability claims — none are verified yet.
      '@type': 'SoftwareApplication',
      name: BRAND.name,
      applicationCategory: 'HealthApplication',
      operatingSystem: 'iOS, Android',
      description: BRAND.description,
      publisher: { '@id': `${SITE.url}/#org` },
    },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // data-scroll-behavior lets Next.js turn smooth scrolling off during route
    // transitions, so page changes land instantly at the top.
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
        />
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <Header />
        <main id="main">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
