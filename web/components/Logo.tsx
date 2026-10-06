import Link from 'next/link';

import { BrandMark } from './BrandMark';
import { BRAND, WORDMARK } from '@/lib/config';

/**
 * The canonical AneviaONE lockup: the mark + the two-tone wordmark, set as
 * text exactly as the mobile app does (there is no separate wordmark asset).
 *
 * `animate` plays the one-time entrance (see `.logo--animate` in header.css).
 * Only the header — which lives in the root layout and so is never remounted
 * by client-side navigation — turns it on; it is pure CSS, skipped under
 * prefers-reduced-motion, and never changes layout.
 */
export function Logo({
  tone = 'light',
  animate = false,
  size = 38,
}: {
  tone?: 'light' | 'dark';
  animate?: boolean;
  size?: number;
}) {
  return (
    <Link
      href="/"
      className={`logo logo--${tone}${animate ? ' logo--animate' : ''}`}
      aria-label={`${BRAND.name} — home`}
    >
      <BrandMark size={size} className="logo__mark" />
      <span className="logo__name" aria-hidden="true">
        {WORDMARK.lead}
        <span className="logo__one">{WORDMARK.accent}</span>
      </span>
    </Link>
  );
}
