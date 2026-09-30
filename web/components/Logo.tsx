import Link from 'next/link';

import { BRAND, WORDMARK } from '@/lib/config';

/** Text wordmark with a small "connected history" mark (no logo asset exists yet). */
export function Logo({ tone = 'light', tagline = false }: { tone?: 'light' | 'dark'; tagline?: boolean }) {
  return (
    <Link href="/" className={`logo logo--${tone}`} aria-label={`${BRAND.name} — home`}>
      <svg className="logo__mark" width="34" height="34" viewBox="0 0 34 34" aria-hidden="true" focusable="false">
        <rect width="34" height="34" rx="11" className="logo__tile" />
        <path d="M7.5 22.5l5.2-6.2 4.6 3.6 8.2-9.4" className="logo__line" fill="none" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="7.5" cy="22.5" r="2.1" className="logo__dot" />
        <circle cx="12.7" cy="16.3" r="1.7" className="logo__dot" />
        <circle cx="25.5" cy="10.5" r="2.5" className="logo__dot logo__dot--lead" />
      </svg>
      <span className="logo__text">
        <span className="logo__name">
          {WORDMARK.lead}
          <span className="logo__one">{WORDMARK.accent}</span>
        </span>
        {tagline ? <span className="logo__tag">{BRAND.category}</span> : null}
      </span>
    </Link>
  );
}
