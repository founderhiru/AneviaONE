import { Reveal } from './Reveal';
import { StoreButtons } from './StoreButtons';
import { BRAND, LINKS } from '@/lib/config';

export function FinalCTA() {
  const configured = Boolean(LINKS.appStore || LINKS.googlePlay);
  return (
    <section id="download" className="cta on-dark" aria-labelledby="cta-title">
      <svg className="cta__scene" viewBox="0 0 1440 520" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">
        <defs>
          <radialGradient id="cta-sun" cx="0.5" cy="1" r="0.75">
            <stop offset="0" stopColor="#34bfdc" stopOpacity="0.5" />
            <stop offset="0.5" stopColor="#2e6db4" stopOpacity="0.18" />
            <stop offset="1" stopColor="#082b57" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="hill-a" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#123a6d" />
            <stop offset="1" stopColor="#0a2a52" />
          </linearGradient>
          <linearGradient id="hill-b" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#0d3160" />
            <stop offset="1" stopColor="#071f42" />
          </linearGradient>
        </defs>
        <rect width="1440" height="520" fill="url(#cta-sun)" />
        {[
          [180, 70],
          [420, 120],
          [760, 50],
          [1010, 110],
          [1260, 64],
          [1340, 150],
          [90, 160],
          [610, 170],
        ].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={i % 3 === 0 ? 2 : 1.4} fill="#cfe9f4" opacity={0.5} />
        ))}
        <path d="M0 400 C 200 330, 360 350, 560 390 S 960 440, 1180 370 S 1380 340, 1440 360 L1440 520 L0 520 Z" fill="url(#hill-a)" opacity="0.9" />
        <path d="M0 450 C 240 400, 420 430, 700 455 S 1120 480, 1440 420 L1440 520 L0 520 Z" fill="url(#hill-b)" />
      </svg>

      <div className="container cta__inner">
        <Reveal>
          <h2 id="cta-title" className="h2 cta__title">
            Your health story, for life.
          </h2>
          <p className="lede cta__lede">Start building your intelligent health history with {BRAND.name}.</p>
        </Reveal>
        <Reveal className="cta__actions">
          <p className="cta__label">Download {BRAND.name}</p>
          <StoreButtons tone="light" className="cta__stores" />
          {!configured ? <p className="fine cta__note">App store links will appear here at launch.</p> : null}
        </Reveal>
      </div>
    </section>
  );
}
