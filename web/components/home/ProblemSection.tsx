import { Icon, type IconName } from '../Icon';
import { BrandMark } from '../BrandMark';
import { Reveal } from '../Reveal';
import { WORDMARK } from '@/lib/config';

const SOURCES: { label: string; icon: IconName; tone: string }[] = [
  { label: 'Hospital portals', icon: 'building', tone: 'blue' },
  { label: 'PDF reports', icon: 'file', tone: 'cream' },
  { label: 'Paper records', icon: 'layers', tone: 'mint' },
  { label: 'Lab reports', icon: 'flask', tone: 'teal' },
  { label: 'Prescriptions', icon: 'pill', tone: 'lavender' },
  { label: 'Emails', icon: 'mail', tone: 'blue' },
  { label: 'Scans', icon: 'image', tone: 'cream' },
  { label: 'Consultations', icon: 'consult', tone: 'mint' },
];

export function ProblemSection() {
  return (
    <section id="problem" className="section problem" aria-labelledby="problem-title">
      <div className="container">
        <Reveal className="section-head section-head--center">
          <p className="eyebrow">The problem</p>
          <h2 id="problem-title" className="h2">
            Your health is scattered across years.
          </h2>
          <p className="lede">
            Reports in different hospital portals, PDFs, paper files, prescriptions, emails and memories live in different
            places. It&rsquo;s hard to see the complete picture.
          </p>
        </Reveal>

        <div className="converge">
          <ul className="converge__chips" aria-label="Places your health information lives today">
            {SOURCES.map((s, i) => (
              <li key={s.label} className={`converge__chip tone-${s.tone}`} style={{ '--i': i } as React.CSSProperties}>
                <Reveal>
                  <span className="schip">
                    <span className="icon-tile">
                      <Icon name={s.icon} size={20} />
                    </span>
                    <span>{s.label}</span>
                  </span>
                </Reveal>
              </li>
            ))}
          </ul>

          <Reveal className="converge__funnel">
            <svg viewBox="0 0 800 130" preserveAspectRatio="none" focusable="false" aria-hidden="true">
              {SOURCES.map((_, i) => {
                const x = 50 + i * 100;
                return (
                  <path
                    key={i}
                    d={`M${x} 0 C ${x} 62, 400 56, 400 128`}
                    pathLength={1}
                    className="draw-line"
                    fill="none"
                    stroke="url(#funnel-grad)"
                  />
                );
              })}
              <defs>
                <linearGradient id="funnel-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#9db8d6" />
                  <stop offset="1" stopColor="#11a8c8" />
                </linearGradient>
              </defs>
            </svg>
          </Reveal>

          <Reveal className="converge__core">
            <div className="core card">
              <BrandMark size={52} />
              <div>
                <p className="core__name">
                  {WORDMARK.lead}
                  <span className="accent">{WORDMARK.accent}</span>
                </p>
                <p className="core__line">One connected health history — what we are building.</p>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
