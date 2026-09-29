import Link from 'next/link';

import { Icon } from './Icon';
import { RecordScatter } from './RecordScatter';
import { Reveal } from './Reveal';
import { StoreButtons } from './StoreButtons';
import { BRAND, DOWNLOAD_ANCHOR, LINKS } from '@/lib/config';

export function Hero() {
  // The 1-minute walkthrough doesn't exist yet. Until NEXT_PUBLIC_DEMO_VIDEO_URL
  // is set, the secondary CTA scrolls to the written walkthrough instead of
  // promising a video that isn't there.
  const hasVideo = Boolean(LINKS.demoVideo);
  const secondary = hasVideo
    ? { href: LINKS.demoVideo as string, label: 'Watch how it works (1 min)', external: true }
    : { href: '/#how', label: 'See how it works', external: false };

  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero__glow hero__glow--a" aria-hidden="true" />
      <div className="hero__glow hero__glow--b" aria-hidden="true" />
      <div className="container hero__grid">
        <div className="hero__copy">
          <Reveal>
            <p className="eyebrow">{BRAND.category}</p>
          </Reveal>
          <Reveal delay={60}>
            <h1 id="hero-title" className="h1 hero__title">
              <span className="hero__line">Your health has a history.</span>
              <span className="hero__line accent">Now it has intelligence.</span>
            </h1>
          </Reveal>
          <Reveal delay={120}>
            <p className="lede hero__lede">
              AneviaOne brings your health records, reports, medications and changes together into one intelligent health
              history — so you can understand your health across time.
            </p>
          </Reveal>
          <Reveal delay={180} className="hero__ctas">
            <Link href={DOWNLOAD_ANCHOR} className="btn btn--primary">
              Download App
            </Link>
            {secondary.external ? (
              <a href={secondary.href} className="btn btn--ghost" target="_blank" rel="noopener noreferrer">
                <Icon name="play" size={16} /> {secondary.label}
              </a>
            ) : (
              <Link href={secondary.href} className="btn btn--ghost">
                <Icon name="play" size={16} /> {secondary.label}
              </Link>
            )}
          </Reveal>
          <Reveal delay={240}>
            <StoreButtons className="hero__stores" />
          </Reveal>
          <Reveal delay={300}>
            <p className="hero__tagline">
              <span>Every record. Every change.</span>
              <span>One intelligent health history.</span>
            </p>
          </Reveal>
        </div>

        <Reveal className="hero__visual" delay={140}>
          <RecordScatter />
          <p className="hero__caption">
            <span>Different records.</span> <span className="accent">One connected story.</span>
          </p>
        </Reveal>
      </div>
    </section>
  );
}
