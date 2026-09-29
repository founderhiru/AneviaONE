import type { ReactNode } from 'react';

import { Phone } from './Phone';
import { AskScreen, ChangesScreen, HomeScreen, TimelineScreen, TrendsScreen } from './PhoneScreens';
import { Reveal } from './Reveal';

const SCREENS: { id: string; label: string; caption: string; node: ReactNode; alt: string }[] = [
  { id: 'home', label: 'Home', caption: 'Your health at a glance', node: <HomeScreen />, alt: 'Home screen with health timeline and snapshot' },
  { id: 'timeline', label: 'Timeline', caption: 'Your health story over time', node: <TimelineScreen />, alt: 'Timeline screen listing records from 2019 to 2026' },
  { id: 'trends', label: 'Trends', caption: 'Longitudinal view of key measures', node: <TrendsScreen />, alt: 'Trends screen with LDL cholesterol, HbA1c and vitamin D' },
  { id: 'changes', label: 'What Changed', caption: 'See meaningful changes', node: <ChangesScreen />, alt: 'What Changed screen comparing current values with past history' },
  { id: 'ask', label: 'Ask AneviaOne', caption: 'Answers grounded in your records', node: <AskScreen />, alt: 'Ask AneviaOne screen with an answer and its sources' },
];

export function ProductShowcase() {
  return (
    <section id="screens" className="section screens" aria-labelledby="screens-title">
      <div className="container">
        <Reveal className="section-head section-head--center">
          <p className="eyebrow">Inside the app</p>
          <h2 id="screens-title" className="h2">
            Your health story, at a glance.
          </h2>
        </Reveal>
      </div>

      <div className="screens__rail" tabIndex={0} role="group" aria-label="App screens — scroll horizontally">
        <ul className="screens__list">
          {SCREENS.map((s, i) => (
            <li key={s.id} className="screens__item">
              <Reveal delay={i * 80}>
                <Phone label={s.alt}>{s.node}</Phone>
                <p className="screens__label">{s.label}</p>
                <p className="screens__caption">{s.caption}</p>
              </Reveal>
            </li>
          ))}
        </ul>
      </div>
      <p className="container fine screens__note">Screens shown with sample data.</p>
    </section>
  );
}
