import Link from 'next/link';

import { Icon } from '../Icon';
import { BRAND } from '@/lib/config';

/** The five-stage concept only. The explanation lives on /how-it-works. */
export const STAGES = ['Capture', 'Understand', 'Remember', 'Compare', 'Share'] as const;

export function HowPreview() {
  return (
    <section id="how" className="section howp" aria-labelledby="how-title">
      <div className="container">
        <div className="howp__head">
          <p className="eyebrow">How it works</p>
          <h2 id="how-title" className="h2">
            From records to understanding.
          </h2>
          <p className="lede howp__lede">
            {BRAND.name} turns a first report into years of connected health history, and into a summary your Doctor can use.
          </p>
        </div>
        <ol className="howp__flow">
          {STAGES.map((stage, i) => (
            <li key={stage} className="howp__stage">
              <span className="howp__num">{String(i + 1).padStart(2, '0')}</span>
              <span className="howp__name">{stage}</span>
            </li>
          ))}
        </ol>
        <Link href="/how-it-works" className="link-arrow howp__link">
          Explore How It Works <Icon name="arrow" size={16} />
        </Link>
      </div>
    </section>
  );
}
