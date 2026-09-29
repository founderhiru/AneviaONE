import { Icon, type IconName } from './Icon';
import { Reveal } from './Reveal';

const CARDS: { key: string; title: string; text: string; icon: IconName; tone: string; visual: 'line' | 'rows' | 'bars' }[] = [
  { key: 'remember', title: 'Remember', text: 'Your health history stays connected across years.', icon: 'layers', tone: 'blue', visual: 'line' },
  { key: 'understand', title: 'Understand', text: 'AI helps make complex records easier to understand.', icon: 'scan', tone: 'mint', visual: 'rows' },
  { key: 'compare', title: 'Compare', text: 'See meaningful changes over time, not just isolated results.', icon: 'compare', tone: 'lavender', visual: 'bars' },
];

function MiniVisual({ kind }: { kind: 'line' | 'rows' | 'bars' }) {
  if (kind === 'line') {
    return (
      <svg viewBox="0 0 200 54" className="mv" aria-hidden="true" focusable="false">
        <line x1="14" y1="30" x2="186" y2="30" stroke="currentColor" strokeOpacity=".35" />
        {[14, 72, 128, 186].map((x, i) => (
          <circle key={x} cx={x} cy="30" r={i === 3 ? 7 : 5} fill={i === 3 ? 'currentColor' : '#fff'} stroke="currentColor" strokeWidth="2.2" />
        ))}
        {['2019', '2021', '2023', '2026'].map((y, i) => (
          <text key={y} x={[14, 72, 128, 186][i]} y="52" textAnchor="middle" fontSize="10" fill="currentColor" fontWeight="600">
            {y}
          </text>
        ))}
      </svg>
    );
  }
  if (kind === 'rows') {
    return (
      <svg viewBox="0 0 200 54" className="mv" aria-hidden="true" focusable="false">
        <rect x="6" y="6" width="34" height="42" rx="7" fill="#fff" stroke="currentColor" strokeOpacity=".5" />
        <path d="M13 18h20M13 25h20M13 32h13" stroke="currentColor" strokeOpacity=".45" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M52 27h22M68 21l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        {[10, 26, 42].map((y, i) => (
          <g key={y}>
            <rect x="88" y={y - 4} width="106" height="12" rx="6" fill="#fff" />
            <rect x="94" y={y - 0.5} width={[44, 60, 34][i]} height="5" rx="2.5" fill="currentColor" fillOpacity=".55" />
            <circle cx="184" cy={y + 2} r="2.6" fill="currentColor" />
          </g>
        ))}
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 200 54" className="mv" aria-hidden="true" focusable="false">
      {[
        [16, 26],
        [46, 30],
        [76, 22],
        [124, 36],
        [154, 40],
        [184, 46],
      ].map(([x, h], i) => (
        <rect key={i} x={x - 9} y={50 - h} width="18" height={h} rx="5" fill="currentColor" fillOpacity={i > 2 ? 0.85 : 0.35} />
      ))}
      <path d="M98 30h14M106 25l6 5-6 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function HealthMemorySection() {
  return (
    <section id="memory" className="section memory" aria-labelledby="memory-title">
      <div className="container">
        <Reveal className="section-head">
          <p className="eyebrow">Health memory</p>
          <h2 id="memory-title" className="h2">
            Not a health locker.
            <br />
            <span className="accent">A health memory.</span>
          </h2>
          <p className="lede">
            Storing your reports is only the beginning. AneviaOne turns your records into structured health history —
            helping you see what changed, what stayed consistent, and how your health has evolved over time.
          </p>
        </Reveal>

        <div className="memory__grid">
          {CARDS.map((c, i) => (
            <Reveal key={c.key} delay={i * 90} className={`mcard hover-lift tone-${c.tone}`}>
              <div className="mcard__top">
                <span className="icon-tile icon-tile--lg">
                  <Icon name={c.icon} size={26} />
                </span>
                <span className="mcard__kicker">{c.title.toUpperCase()}</span>
              </div>
              <p className="mcard__text">{c.text}</p>
              <MiniVisual kind={c.visual} />
            </Reveal>
          ))}
        </div>

        <Reveal className="versus" delay={120}>
          <div className="versus__old">
            <span className="versus__tag">A locker</span>
            <p>Store your medical records.</p>
          </div>
          <span className="versus__arrow" aria-hidden="true">
            <Icon name="arrow" size={22} />
          </span>
          <div className="versus__new">
            <span className="versus__tag">AneviaOne</span>
            <ul>
              {['Remember your health history', 'Understand it', 'Compare it', 'Find trends', 'See what changed', 'Ask questions about it'].map((t) => (
                <li key={t}>
                  <Icon name="check" size={16} /> {t}
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
