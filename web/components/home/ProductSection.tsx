import Link from 'next/link';
import type { ReactNode } from 'react';

import { Icon } from '../Icon';
import { Phone } from '../Phone';
import { AskScreen, ChangesScreen, HomeScreen, TimelineScreen } from '../PhoneScreens';
import { BRAND } from '@/lib/config';

/** What you actually get: four product surfaces, shown, not described at length. */
const SURFACES: { id: string; title: string; line: string; alt: string; screen: ReactNode }[] = [
  { id: 'memory', title: 'Health Memory', line: 'Your records organized over time.', alt: 'Home screen with health timeline and snapshot', screen: <HomeScreen /> },
  { id: 'timeline', title: 'Timeline', line: 'Your health journey in one place.', alt: 'Timeline screen listing records from 2019 to 2026', screen: <TimelineScreen /> },
  { id: 'changes', title: 'What Changed', line: 'Meaningful changes across your history.', alt: 'What Changed screen comparing current values with past history', screen: <ChangesScreen /> },
  { id: 'ask', title: 'Ask My Health', line: 'Questions grounded in your records.', alt: 'Ask screen with an answer and its sources', screen: <AskScreen /> },
];

export function ProductSection() {
  return (
    <section id="product" className="section product-sec on-dark" aria-labelledby="product-title">
      <span id="screens" aria-hidden="true" />
      <div className="container product-sec__head">
        <p className="eyebrow">The product</p>
        <h2 id="product-title" className="h2">
          One app. <span className="accent">Your whole health history.</span>
        </h2>
        <Link href="/product" className="link-arrow product-sec__link">
          Explore Product <Icon name="arrow" size={16} />
        </Link>
      </div>

      <div className="product-sec__rail" tabIndex={0} role="group" aria-label={`${BRAND.name} screens — scroll horizontally`}>
        <ul className="product-sec__list">
          {SURFACES.map((s) => (
            <li key={s.id} className="product-sec__item">
              <Phone label={`${BRAND.name} ${s.alt}`}>{s.screen}</Phone>
              <h3 className="product-sec__title">{s.title}</h3>
              <p className="product-sec__line">{s.line}</p>
            </li>
          ))}
        </ul>
      </div>
      <p className="container fine product-sec__note">Screens shown with sample data.</p>
    </section>
  );
}
