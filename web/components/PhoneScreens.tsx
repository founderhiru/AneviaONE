import { Icon, type IconName } from './Icon';
import { ASK_SOURCES, CHANGES, DASHBOARD, DOCUMENTS, LDL_SERIES, TIMELINE_EVENTS } from '@/lib/sample';
import { WORDMARK } from '@/lib/config';

/**
 * Faithful HTML/CSS renderings of the app screens. They follow the
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

/* ---------------- Home dashboard (hero) ---------------- */
/** A small line with dots and a soft fill, as the app's What changed? sparkline. */
function DashSpark({ points }: { points: readonly number[] }) {
  const w = 100;
  const h = 30;
  const min = Math.min(...points);
  const span = Math.max(...points) - min || 1;
  const pts = points.map((v, i) => [4 + (i * (w - 8)) / (points.length - 1), 4 + (1 - (v - min) / span) * (h - 8)] as const);
  const line = pts.map(([x, y]) => `${x},${y}`).join(' ');
  const area = `M${pts[0][0]},${h} ${pts.map(([x, y]) => `L${x},${y}`).join(' ')} L${pts[pts.length - 1][0]},${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="dash__spark" preserveAspectRatio="none" aria-hidden="true">
      <path d={area} />
      <polyline points={line} vectorEffect="non-scaling-stroke" />
      {pts.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i === pts.length - 1 ? 2.6 : 2} />
      ))}
    </svg>
  );
}

/**
 * The app's Home dashboard, after mobile app/(tabs)/home.tsx and
 * components/home/WhatChangedUI.tsx: header with Add, "Your health, over
 * time.", summary tiles, What changed?, Latest health snapshot and Recent
 * documents. Drawn in the app's own colours, with sample data.
 */
export function DashboardScreen() {
  const d = DASHBOARD;
  return (
    <div className="app dash">
      <div className="app__body">
        <div className="dash__top">
          <span className="dash__brand">
            {WORDMARK.lead}
            <b>{WORDMARK.accent}</b>
          </span>
          <span className="dash__add">+ Add</span>
          <span className="dash__avatar">A</span>
        </div>
        <p className="dash__greet">Good morning</p>
        <h3 className="dash__title">Your health, over time.</h3>

        <div className="dash__tiles">
          {d.tiles.map((t) => (
            <span key={t.key} className={`dash__tile dash__tile--${t.tone}`}>
              <Icon name={t.icon} size={14} />
              <b>{t.value}</b>
              <small>{t.label}</small>
            </span>
          ))}
        </div>

        <div className="dash__changed">
          <div className="dash__changed-head">
            <span className="dash__changed-icon">
              <Icon name="trend" size={13} />
            </span>
            <span>
              <b>What changed?</b>
              <small>See how your key health results have changed across your reports and dates.</small>
            </span>
          </div>
          <div className="dash__preview">
            <div className="dash__preview-row">
              <span>
                <b>{d.change.name}</b>
                <span className="dash__preview-vals">
                  <i>{d.change.from}</i> → {d.change.to}
                </span>
              </span>
              <span className="dash__badge">↗ {d.change.badge}</span>
            </div>
            <DashSpark points={d.change.points} />
            <div className="dash__preview-dates">
              <span>{d.change.start}</span>
              <span>{d.change.end}</span>
            </div>
          </div>
        </div>

        <p className="dash__section">
          <b>Latest health snapshot</b>
          <span>View all</span>
        </p>
        <div className="dash__chips">
          {d.chips.map((c) => (
            <span key={c.label} className={`dash__chip${'on' in c ? ' is-on' : ''}`}>
              {c.label} ({c.count})
            </span>
          ))}
        </div>
        <ul className="dash__group">
          {d.results.map((r) => (
            <li key={r.name} className="dash__row">
              <span className={`dash__gicon dash__gicon--${r.group}`}>
                <Icon name={r.group === 'lab' ? 'flask' : 'scan'} size={12} />
              </span>
              <span className="dash__row-main">
                <b>{r.name}</b>
                <small>{r.meta}</small>
                {'finding' in r ? <span className="dash__finding">{r.finding}</span> : null}
              </span>
              {'value' in r ? (
                <span className="dash__row-val">
                  <b>{r.value}</b>
                  <small>{r.range}</small>
                  {'marker' in r ? <em>{r.marker}</em> : null}
                </span>
              ) : null}
            </li>
          ))}
        </ul>

        <p className="dash__section">
          <b>Recent documents</b>
          <span>View all</span>
        </p>
        <ul className="dash__group">
          {d.documents.map((doc) => (
            <li key={doc.name} className="dash__row">
              <span className="dash__doc">
                <Icon name="file" size={12} />
              </span>
              <span className="dash__row-main">
                <b>{doc.name}</b>
                <small>{doc.meta}</small>
              </span>
            </li>
          ))}
        </ul>
      </div>
      <TabBar active="home" />
    </div>
  );
}

/* ---------------- My documents (Health Memory — available today) ---------------- */
/** The app's My documents list (mobile app/documents, StoredDocumentCard). */
export function DocumentsScreen() {
  return (
    <div className="app dash">
      <div className="app__body">
        <h3 className="dash__screen-title">My documents</h3>
        <ul className="dash__docs">
          {DOCUMENTS.map((d) => (
            <li key={d.name} className="dash__card dash__docrow">
              <span className="dash__docicon">
                <Icon name={d.icon} size={14} />
              </span>
              <span className="dash__row-main">
                <b>{d.name}</b>
                <small>{d.meta}</small>
              </span>
              <span className="dash__chev">
                <Icon name="chevron" size={11} />
              </span>
            </li>
          ))}
        </ul>
      </div>
      <TabBar active="home" />
    </div>
  );
}

/* ---------------- Health Timeline ---------------- */
/** The app's Health Timeline tab: events grouped by year (mobile app/(tabs)/timeline). */
export function TimelineScreen() {
  return (
    <div className="app dash">
      <div className="app__body">
        <h3 className="dash__display">Health Timeline</h3>
        {TIMELINE_EVENTS.map((e) => (
          <div key={e.year + e.title} className="dash__year">
            <span className="dash__year-label">{e.year}</span>
            <span className="dash__card dash__event">
              <b>{e.title}</b>
              <small>{e.meta}</small>
            </span>
          </div>
        ))}
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

/* ---------------- What changed? ---------------- */
/** The app's What changed? screen: filter chips, then comparison cards (mobile app/changes). */
export function ChangesScreen() {
  return (
    <div className="app dash">
      <div className="app__body">
        <h3 className="dash__screen-title">What changed?</h3>
        <div className="dash__chips">
          <span className="dash__chip is-on">All</span>
          <span className="dash__chip">Lab</span>
          <span className="dash__chip">Imaging</span>
        </div>
        <p className="dash__section">
          <b>Key changes</b>
        </p>
        {CHANGES.slice(0, 2).map((c) => (
          <div key={c.metric} className="dash__card dash__cmp">
            <div className="dash__cmp-head">
              <span className="dash__gicon dash__gicon--lab">
                <Icon name="flask" size={12} />
              </span>
              <span className="dash__row-main">
                <b>{c.metric}</b>
                <small>{c.results} results · Lab test</small>
              </span>
              <span className="dash__cmp-badge">
                {c.direction === 'up' ? '↑' : '↓'} {c.percent}
              </span>
            </div>
            <div className="dash__cmp-vals">
              <span>
                <i>{c.from}</i>
                <small>{c.since}</small>
              </span>
              <span aria-hidden="true">→</span>
              <span>
                <b>{c.to}</b>
                <small>{c.latest}</small>
              </span>
            </div>
            <DashSpark points={c.points} />
            <small className="dash__cmp-note">{c.direction === 'up' ? 'Higher' : 'Lower'} than on {c.since}.</small>
          </div>
        ))}
      </div>
      <TabBar active="health" />
    </div>
  );
}

/* ---------------- Ask My Health ---------------- */
/** The app's Ask tab: answers only from your reports, with their sources (mobile app/(tabs)/ask). */
export function AskScreen() {
  return (
    <div className="app dash">
      <div className="app__body app__body--ask">
        <h3 className="dash__display">Ask My Health</h3>
        <p className="dash__sub">Answers come only from your reports — not diagnosis or treatment advice.</p>
        <div className="bubble bubble--user">How has my LDL cholesterol changed?</div>
        <div className="bubble bubble--ai">
          <span className="badge badge--brand">From your records</span>
          <p>Your LDL cholesterol rose from 112 mg/dL in Jan 2019 to 131 mg/dL in Mar 2024, and 146 mg/dL in Mar 2026.</p>
          <div className="srcs">
            <span className="srcs__label">Sources</span>
            {ASK_SOURCES.map((src) => (
              <span key={src} className="srcs__chip">
                {src}
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
