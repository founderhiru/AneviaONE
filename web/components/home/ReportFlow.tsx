import { MotionGate } from '../MotionGate';
import { Reveal } from '../Reveal';
import { BRAND } from '@/lib/config';

/** Sample HbA1c readings, one from each of four reports. Values are illustrative. */
const POINTS = [
  { value: '5.6', date: 'Dec 2025', x: 9.5, y: 29, tilt: -6 },
  { value: '5.7', date: 'Mar 2026', x: 20.5, y: 27.2, tilt: 5 },
  { value: '5.8', date: 'Jun 2026', x: 32.5, y: 25.4, tilt: -4 },
  { value: '5.9', date: 'Sep 2026', x: 44.5, y: 22.6, tilt: 6 },
] as const;

const STEPS = [
  { title: 'Add a report', text: 'Upload a PDF, scan a page, or share a report from another app.' },
  { title: 'Every number keeps its source', text: 'Each result is stored with the page and line it was read from.' },
  { title: 'One timeline for your Doctor', text: 'Results from different labs and years line up in one place, with changes shown plainly.' },
];

/**
 * "Each report adds one more point to your story": four report pages arrive, one
 * result is picked out of each, and each lands on a single timeline. CSS only
 * (see `.flow` in motion.css); with reduced motion the finished timeline is shown.
 */
export function ReportFlow() {
  return (
    <section id="report-flow" className="section flow" aria-labelledby="flow-title">
      <div className="container flow__grid">
        <Reveal className="flow__copy">
          <p className="eyebrow">From report to history</p>
          <h2 id="flow-title" className="h2">
            Each report adds one more point to your story.
          </h2>
          <p className="lede">
            {BRAND.name} picks out each result, keeps the page and line it came from, and places it on one timeline.
            Anything it isn&rsquo;t sure about is held for you to check first.
          </p>
          <ol className="flow__steps">
            {STEPS.map((s, i) => (
              <li key={s.title}>
                <span className="flow__num" aria-hidden="true">{i + 1}</span>
                <span>
                  <b>{s.title}</b>
                  <span>{s.text}</span>
                </span>
              </li>
            ))}
          </ol>
        </Reveal>

        <MotionGate className="flow__stagebox">
          <div
            className="flow__stage"
            role="img"
            aria-label="Animation with sample data: four lab reports each contribute one HbA1c result, and each lands as a point on a single timeline rising from 5.6 to 5.9 percent."
          >
            <div className="flow__canvas" aria-hidden="true">
              <div className="flow__rail" />
              <svg className="flow__lines" viewBox="0 0 56 40" preserveAspectRatio="none" focusable="false">
                <defs>
                  <linearGradient id="flow-grad" x1="0" x2="1" y1="0" y2="0">
                    <stop offset="0" stopColor="#11a8c8" />
                    <stop offset="1" stopColor="#2e6db4" />
                  </linearGradient>
                </defs>
                {POINTS.slice(1).map((p, i) => (
                  <path key={p.date} className={`flow__seg flow__seg--${i + 1}`} d={`M${POINTS[i].x} ${POINTS[i].y} L${p.x} ${p.y}`} pathLength={1} />
                ))}
              </svg>
              {POINTS.map((p) => (
                <div key={`g${p.date}`} className="flow__page" style={{ left: `${p.x - 5.2}em` }}>
                  <b>Lab report</b>
                  <i />
                  <i className="s" />
                  <p>
                    <span>HbA1c</span>
                    <em>{p.value} %</em>
                  </p>
                  <i className="s" />
                  <small>{p.date}</small>
                </div>
              ))}
              {POINTS.map((p, i) => (
                <div key={`s${p.date}`} className={`flow__sheet flow__sheet--${i}`} style={{ left: `${p.x - 5.2}em` }}>
                  <b>Lab report</b>
                  <i />
                  <i className="s" />
                  <p>
                    <span>HbA1c</span>
                    <em>{p.value} %</em>
                    <span className="rg">Range 4.0 - 5.6</span>
                    <u className={`flow__ring flow__ring--${i}`} />
                  </p>
                  <i className="s" />
                  <i />
                </div>
              ))}
              {POINTS.map((p, i) => (
                <div key={`d${p.date}`}>
                  <div className={`flow__dot flow__dot--${i}`} style={{ left: `${p.x}em`, top: `${p.y}em` }} />
                  <div className={`flow__label flow__label--${i}`} style={{ left: `${p.x}em`, top: `${p.y + 1.7}em` }}>
                    <b>{p.value} %</b>
                    <span>{p.date}</span>
                  </div>
                </div>
              ))}
              <p className="flow__caption">HbA1c over time · sample data</p>
            </div>
          </div>
        </MotionGate>
      </div>
    </section>
  );
}
