import Link from 'next/link';

import { Icon } from './Icon';
import { RecordScatter } from './RecordScatter';
import { StoreButtons } from './StoreButtons';
import { BRAND, DOWNLOAD_ANCHOR, LINKS } from '@/lib/config';

/** Split a run of short sentences so the last one can be set on its own line. */
function splitLast(text: string) {
  const parts = text.split(/(?<=\.)\s+/);
  return { lead: parts.slice(0, -1).join(' '), last: parts[parts.length - 1] };
}

/**
 * First viewport. Rendered on the server with no entrance animation, so the
 * headline and phone paint immediately (nothing waits on JS or a timer).
 *
 * Layout: three grid areas — main (headline + CTAs), visual (phone) and aside
 * (store buttons + tagline). Desktop puts the visual beside main/aside; mobile
 * stacks main → visual → aside so the phone lands right under the CTAs.
 */
export function Hero() {
  // The 1-minute walkthrough doesn't exist yet. Until NEXT_PUBLIC_DEMO_VIDEO_URL
  // is set, the secondary CTA scrolls to the written walkthrough instead of
  // promising a video that isn't there.
  const hasVideo = Boolean(LINKS.demoVideo);
  const secondary = hasVideo
    ? { href: LINKS.demoVideo as string, label: 'Watch how it works (1 min)', external: true }
    : { href: '/#how', label: 'See how it works', external: false };

  const promise = splitLast(BRAND.promise);
  const tagline = splitLast(BRAND.tagline);

  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="container hero__grid">
        <div className="hero__main">
          <p className="eyebrow hero__eyebrow">{BRAND.category}</p>
          <h1 id="hero-title" className="h1 hero__title">
            <span className="hero__line">{promise.lead}</span>{' '}
            <span className="hero__line accent">{promise.last}</span>
          </h1>
          <p className="lede hero__lede">
            {BRAND.name} brings your health records, reports, medications and changes together into one intelligent
            health history — so you can understand your health across time.
          </p>
          <div className="hero__ctas">
            <Link href={DOWNLOAD_ANCHOR} className="btn btn--primary btn--lg">
              Download App
            </Link>
            {secondary.external ? (
              <a href={secondary.href} className="btn btn--ghost btn--lg" target="_blank" rel="noopener noreferrer">
                <Icon name="play" size={16} /> {secondary.label}
              </a>
            ) : (
              <Link href={secondary.href} className="btn btn--ghost btn--lg">
                <Icon name="play" size={16} /> {secondary.label}
              </Link>
            )}
          </div>
        </div>

        <div className="hero__visual">
          <RecordScatter />
          <p className="hero__caption">
            <span>Different records.</span> <span className="accent">One connected story.</span>
          </p>
        </div>

        <div className="hero__aside">
          <StoreButtons className="hero__stores" />
          <p className="hero__tagline">
            <span>{tagline.lead}</span> <span>{tagline.last}</span>
          </p>
        </div>
      </div>
    </section>
  );
}
