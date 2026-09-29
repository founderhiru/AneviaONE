import { Icon, type IconName } from './Icon';
import { Reveal } from './Reveal';

const SOURCES: { label: string; icon: IconName; tone: string }[] = [
  { label: 'Hospital portals', icon: 'building', tone: 'blue' },
  { label: 'PDF reports', icon: 'file', tone: 'cream' },
  { label: 'WhatsApp', icon: 'whatsapp', tone: 'mint' },
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
            Reports in different hospital portals, PDFs, WhatsApp, prescriptions, emails and memories live in different
            places. It&rsquo;s hard to see the complete picture.
          </p>
        </Reveal>

        <div className="converge">
          <ul className="converge__chips" aria-label="Places your health information lives today">
            {SOURCES.map((s, i) => (
              <li key={s.label} className={`converge__chip tone-${s.tone}`} style={{ '--i': i } as React.CSSProperties}>
                <Reveal delay={i * 60}>
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

          <Reveal className="converge__funnel" aria-hidden="true">
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

          <Reveal className="converge__core" delay={200}>
            <div className="core card">
              <svg width="46" height="46" viewBox="0 0 34 34" aria-hidden="true" focusable="false">
                <rect width="34" height="34" rx="11" fill="#082b57" />
                <path d="M7.5 22.5l5.2-6.2 4.6 3.6 8.2-9.4" fill="none" stroke="#5fd0e8" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="7.5" cy="22.5" r="2.1" fill="#fff" />
                <circle cx="12.7" cy="16.3" r="1.7" fill="#fff" />
                <circle cx="25.5" cy="10.5" r="2.5" fill="#5fd0e8" />
              </svg>
              <div>
                <p className="core__name">
                  Anevia<span className="accent">One</span>
                </p>
                <p className="core__line">One connected health history.</p>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
