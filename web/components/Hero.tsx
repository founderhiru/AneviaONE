import Link from 'next/link';

import { Icon } from './Icon';
import { RecordScatter } from './RecordScatter';
import { BRAND, LINKS, PRIMARY_CTA, SECONDARY_CTA } from '@/lib/config';

/** Split a run of short sentences so the last one can be set on its own line. */
function splitLast(text: string) {
  const parts = text.split(/(?<=\.)\s+/);
  return { lead: parts.slice(0, -1).join(' '), last: parts[parts.length - 1] };
}

/**
 * First viewport. Server-rendered and painted immediately; the only motion is
 * the CSS light-sweep reveal of the category line (see `.hero__category` in
 * home.css), which never hides the text from assistive tech, never blocks
 * interaction, and is skipped under prefers-reduced-motion.
 */
export function Hero() {
  // Until a 1-minute walkthrough exists (NEXT_PUBLIC_DEMO_VIDEO_URL), the
  // secondary CTA goes to the How It Works preview rather than a promised video.
  const video = LINKS.demoVideo;
  const promise = splitLast(BRAND.promise);

  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="container hero__grid">
        <div className="hero__main">
          <p className="eyebrow hero__eyebrow">
            <span className="hero__category">{BRAND.category}</span>
          </p>
          <h1 id="hero-title" className="h1 hero__title">
            <span className="hero__line">{promise.lead}</span>{' '}
            <span className="hero__line accent">{promise.last}</span>
          </h1>
          <p className="hero__support">{BRAND.tagline}</p>
          <div className="hero__ctas">
            <Link href={PRIMARY_CTA.href} className="btn btn--primary btn--lg">
              {PRIMARY_CTA.label}
            </Link>
            {video ? (
              <a href={video} className="btn btn--ghost btn--lg" target="_blank" rel="noopener noreferrer">
                <Icon name="play" size={16} /> Watch how it works (1 min)
              </a>
            ) : (
              <Link href={SECONDARY_CTA.href} className="btn btn--ghost btn--lg">
                {SECONDARY_CTA.label} <Icon name="arrowDown" size={16} />
              </Link>
            )}
          </div>
          <p className="fine hero__status">
            Today: add health reports and keep them together in private storage. Reading and comparing them, and
            answering questions, are being built.
          </p>
        </div>

        <div className="hero__visual">
          <RecordScatter />
          <p className="hero__caption">
            <span>Different records.</span> <span className="accent">One connected history.</span>
          </p>
        </div>
      </div>
    </section>
  );
}
