import Link from 'next/link';

import { Icon } from '../Icon';

/** Three concepts only — the intelligence layer is explained on /ai-intelligence. */
const CONCEPTS = [
  { name: 'Understand', line: 'Turn records into structured health information.' },
  { name: 'Compare', line: 'See meaningful changes across time.' },
  { name: 'Ask', line: 'Explore your history with answers grounded in your records.' },
];

export function IntelligencePreview() {
  return (
    <section id="intelligence" className="section intelp on-dark" aria-labelledby="intel-title">
      <div className="container">
        <p className="eyebrow">Intelligence</p>
        <h2 id="intel-title" className="h2 intelp__title">
          Intelligence that grows <span className="accent">with your history.</span>
        </h2>
        <ul className="intelp__list">
          {CONCEPTS.map((c) => (
            <li key={c.name} className="intelp__item">
              <span className="intelp__name">{c.name}</span>
              <span className="intelp__line">{c.line}</span>
            </li>
          ))}
        </ul>
        <Link href="/ai-intelligence" className="link-arrow intelp__link">
          Explore Intelligence <Icon name="arrow" size={16} />
        </Link>
      </div>
    </section>
  );
}
