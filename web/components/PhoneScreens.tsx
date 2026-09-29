import { Icon, type IconName } from './Icon';
import { ASK_SOURCES, CHANGES, LDL_SERIES, TIMELINE_EVENTS } from '@/lib/sample';

/**
 * Faithful HTML/CSS renderings of the AneviaOne app screens. They follow the
 * real app's structure (tabs: Home · Timeline · Health · Ask · Me; "From your
 * records" evidence badge; the Health History Line motif) using sample data.
 */

const TABS: { id: string; label: string; icon: IconName }[] = [
  { id: 'home', label: 'Home', icon: 'overview' },
  { id: 'timeline', label: 'Timeline', icon: 'clock' },
  { id: 'health', label: 'Health', icon: 'pulse' },
  { id: 'ask', label: 'Ask', icon: 'chat' },
  { id: 'me', label: 'Me', icon: 'users' },
];

function TabBar({ active }: { active: string }) {
  return (
    <div className="tabbar">
      {TABS.map((t) => (
        <span key={t.id} className={`tabbar__item${t.id === active ? ' is-active' : ''}`}>
          <Icon name={t.icon} size={18} />
          <span>{t.label}</span>
        </span>
      ))}
    </div>
  );
}

function HistoryLine({ compact = false }: { compact?: boolean }) {
  const years = ['2019', '2021', '2023', '2026'];
  return (
    <div className={`hline${compact ? ' hline--compact' : ''}`}>
      {years.map((y, i) => (
        <span key={y} className="hline__stop">
          <span className={`hline__dot${i === years.length - 1 ? ' is-now' : ''}`} />
          <span className="hline__year">{y}</span>
        </span>
      ))}
    </div>
  );
}

/* ---------------- Home ---------------- */
export function HomeScreen() {
  return (
    <div className="app">
      <div className="app__body">
        <div className="app__top">
          <span className="app__brand">
            Anevia<b>One</b>
          </span>
          <span className="app__avatar">A</span>
        </div>
        <p className="app__greet">Good morning,</p>
        <h3 className="app__title">Your health story continues.</h3>

        <p className="app__label">Health timeline</p>
        <HistoryLine />

        <p className="app__label">Health snapshot</p>
        <div className="snap">
          {(
            [
              ['file', 'All Records', '14 documents', 'blue'],
              ['trend', 'Trends', '6 measures', 'teal'],
              ['pill', 'Medications', '3 active', 'lavender'],
              ['calendar', 'Next Checkup', 'Mar 2027', 'cream'],
            ] as [IconName, string, string, string][]
          ).map(([icon, title, sub, tone]) => (
            <div key={title} className={`snap__tile tone-${tone}`}>
              <span className="snap__icon">
                <Icon name={icon} size={16} />
              </span>
              <span className="snap__title">{title}</span>
              <span className="snap__sub">{sub}</span>
            </div>
          ))}
        </div>

        <div className="wchg">
          <span className="wchg__text">
            <small>What changed</small>
            <b>LDL Cholesterol</b>
          </span>
          <span className="badge badge--alert">▲ 15 points</span>
        </div>

        <div className="askpill">
          <Icon name="sparkle" size={15} />
          <span>Ask about your health...</span>
        </div>
      </div>
      <TabBar active="home" />
    </div>
  );
}

/* ---------------- Timeline ---------------- */
export function TimelineScreen() {
  return (
    <div className="app">
      <div className="app__body">
        <h3 className="app__h">Timeline</h3>
        <p className="app__sub">Your health story over time</p>
        <ol className="rail">
          {TIMELINE_EVENTS.map((e, i) => (
            <li key={e.year + e.title} className={`rail__item${i === 0 ? ' is-now' : ''}`}>
              <span className="rail__year">{e.year}</span>
              <span className="rail__dot" />
              <span className="rail__card">
                <b>{e.title}</b>
                <small>{e.meta}</small>
              </span>
            </li>
          ))}
        </ol>
      </div>
      <TabBar active="timeline" />
    </div>
  );
}

/* ---------------- Trends ---------------- */
function Spark({ points, tone }: { points: number[]; tone: 'watch' | 'good' | 'alert' }) {
  const w = 100;
  const h = 34;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const step = w / (points.length - 1);
  const coords = points.map((p, i) => [i * step, h - 4 - ((p - min) / span) * (h - 10)] as const);
  const d = coords.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const [lx, ly] = coords[coords.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={`spark spark--${tone}`} preserveAspectRatio="none" aria-hidden="true">
      <path d={d} fill="none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={lx} cy={ly} r="2.6" />
    </svg>
  );
}

export function TrendsScreen() {
  const ldl = LDL_SERIES.map((p) => p.value);
  return (
    <div className="app">
      <div className="app__body">
        <h3 className="app__h">Trends</h3>
        <p className="app__sub">Longitudinal view of key measures</p>
        <div className="tcard">
          <div className="tcard__row">
            <b>LDL Cholesterol</b>
            <span className="badge badge--alert">▲ Up</span>
          </div>
          <div className="tcard__big">
            146 <small>mg/dL</small>
          </div>
          <Spark points={ldl} tone="alert" />
          <div className="tcard__axis">
            <span>2022</span>
            <span>2024</span>
            <span>2026</span>
          </div>
        </div>
        <div className="tcard">
          <div className="tcard__row">
            <b>HbA1c</b>
            <span className="badge badge--good">▼ Improving</span>
          </div>
          <Spark points={[7.1, 6.7, 6.1]} tone="good" />
        </div>
        <div className="tcard">
          <div className="tcard__row">
            <b>Vitamin D</b>
            <span className="badge badge--watch">▼ Lower</span>
          </div>
          <Spark points={[34, 31, 26]} tone="watch" />
        </div>
      </div>
      <TabBar active="health" />
    </div>
  );
}

/* ---------------- What changed ---------------- */
export function ChangesScreen() {
  return (
    <div className="app">
      <div className="app__body">
        <h3 className="app__h">What Changed</h3>
        <p className="app__sub">Compared with your history</p>
        {CHANGES.map((c) => (
          <div key={c.metric} className="ccard">
            <div className="ccard__row">
              <b>{c.metric}</b>
              <span className={`badge badge--${c.tone}`}>{c.direction === 'up' ? '▲' : '▼'}</span>
            </div>
            <p className={`ccard__delta ccard__delta--${c.tone}`}>
              {c.verb} {c.amount}
            </p>
            <small>{c.range}</small>
          </div>
        ))}
        <div className="app__link">View supporting records →</div>
      </div>
      <TabBar active="health" />
    </div>
  );
}

/* ---------------- Ask ---------------- */
export function AskScreen() {
  return (
    <div className="app">
      <div className="app__body app__body--ask">
        <h3 className="app__h">Ask AneviaOne</h3>
        <p className="app__sub">Answers grounded in your records</p>
        <div className="bubble bubble--user">How has my cholesterol changed over the last five years?</div>
        <div className="bubble bubble--ai">
          <span className="badge badge--brand">From your records</span>
          <p>Your LDL cholesterol has increased from 118 mg/dL in 2022 to 146 mg/dL in 2026.</p>
          <div className="srcs">
            <span className="srcs__label">Sources</span>
            {ASK_SOURCES.map((s) => (
              <span key={s} className="srcs__chip">
                {s}
              </span>
            ))}
          </div>
        </div>
        <div className="askpill askpill--input">
          <span>Ask about your health...</span>
          <span className="askpill__send">
            <Icon name="arrow" size={13} />
          </span>
        </div>
      </div>
      <TabBar active="ask" />
    </div>
  );
}
