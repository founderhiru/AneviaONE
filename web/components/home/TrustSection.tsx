import Link from 'next/link';

import { Icon } from '../Icon';

/** Principles only; the specifics live on /privacy and /security. */
const PRINCIPLES = [
  { title: 'Private by design', line: 'Your health information is personal. Your records are yours; nothing is shared today, and sharing will be your choice.' },
  { title: 'Evidence matters', line: 'When insights arrive, they will point back to your records, with the source one tap away.' },
  { title: 'AI should explain, not invent.', line: 'When AI explanations arrive, they will be labelled and kept apart from what your records say.' },
];

export function TrustSection() {
  return (
    <section id="trust" className="section trust" aria-labelledby="trust-title">
      <div className="container trust__grid">
        <div>
          <p className="eyebrow">Trust</p>
          <h2 id="trust-title" className="h2 trust__title">
            Your health history. <span className="accent">Your control.</span>
          </h2>
          <Link href="/privacy" className="link-arrow trust__link">
            Privacy &amp; Security <Icon name="arrow" size={16} />
          </Link>
        </div>
        <ul className="trust__list">
          {PRINCIPLES.map((p) => (
            <li key={p.title} className="trust__item">
              <h3 className="trust__item-title">{p.title}</h3>
              <p>{p.line}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
