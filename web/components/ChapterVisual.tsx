import { EvidenceAnswer } from './EvidenceAnswer';
import { PatternCard } from './PatternCard';
import { TrendCard } from './TrendCard';
import { CHANGES, LDL_SERIES, RECORD_CHIPS, TIMELINE_EVENTS } from '@/lib/sample';

/**
 * One visual per editorial chapter (How It Works, Intelligence). Each chapter
 * gets its own picture so the two pages never repeat each other — or the
 * homepage's phones. All values come from lib/sample.ts (sample data).
 */
export type ChapterVisualKey =
  | 'capture'
  | 'understand'
  | 'remember'
  | 'compare'
  | 'ask'
  | 'memory'
  | 'evidence'
  | 'time'
  | 'context'
  | 'prompts';

export function ChapterVisual({ kind }: { kind: ChapterVisualKey }) {
  switch (kind) {
    case 'capture':
      return (
        <ul className="cv-stack" aria-label="Separate records from different years (sample)">
          {RECORD_CHIPS.slice(0, 5).map((r, i) => (
            <li key={`${r.year}-${r.label}`} className="cv-doc" style={{ marginLeft: `${(i % 3) * 7}%` }}>
              <span className="cv-doc__year">{r.year}</span>
              <span className="cv-doc__name">{r.label}</span>
              <span className="cv-doc__lines" aria-hidden="true" />
            </li>
          ))}
        </ul>
      );

    case 'understand':
      return (
        <div className="cv-extract" role="img" aria-label="A report turned into structured values (sample)">
          <div className="cv-extract__doc" aria-hidden="true">
            <span className="cv-extract__doc-h">Blood Test · Mar 2026</span>
            {[88, 72, 94, 60, 80, 66].map((w, i) => (
              <span key={i} className="cv-extract__line" style={{ width: `${w}%` }} />
            ))}
          </div>
          <span className="cv-extract__arrow" aria-hidden="true">→</span>
          <dl className="cv-extract__fields">
            {CHANGES.map((c) => (
              <div key={c.metric} className="cv-extract__field">
                <dt>{c.metric}</dt>
                <dd>{c.to}</dd>
              </div>
            ))}
          </dl>
        </div>
      );

    case 'remember':
      return (
        <ol className="cv-line" aria-label="Records placed on one timeline (sample)">
          {[...TIMELINE_EVENTS].reverse().map((e, i, all) => (
            <li key={e.year + e.title} className={`cv-line__stop${i === all.length - 1 ? ' is-now' : ''}`}>
              <span className="cv-line__year">{e.year}</span>
              <span className="cv-line__title">{e.title}</span>
            </li>
          ))}
        </ol>
      );

    case 'compare': {
      const c = CHANGES[0];
      return (
        <div className="cv-compare" role="img" aria-label={`${c.metric}: ${c.from} to ${c.to}, ${c.range} (sample)`}>
          <span className="cv-compare__metric">{c.metric}</span>
          <div className="cv-compare__row">
            <span className="cv-compare__val">
              <small>{c.range.split(' ')[0]}</small>
              {c.from}
            </span>
            <span className="cv-compare__arrow" aria-hidden="true">→</span>
            <span className="cv-compare__val is-now">
              <small>{c.range.split(' ').pop()}</small>
              {c.to}
            </span>
          </div>
          <span className="cv-compare__delta">
            {c.verb} {c.amount}
          </span>
        </div>
      );
    }

    case 'ask':
      return (
        <div className="cv-ask" aria-label="Asking a question in plain language (sample)">
          <p className="cv-ask__q">When was my last HbA1c test, and how did it compare?</p>
          <p className="cv-ask__a">
            <span className="badge badge--brand">Sample answer</span>
            Your most recent HbA1c was in 2026 — 0.6% lower than in 2025.
          </p>
        </div>
      );

    case 'memory':
      return (
        <table className="cv-ledger">
          <caption>LDL Cholesterol · mg/dL (sample)</caption>
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Value</th>
              <th scope="col">Source</th>
            </tr>
          </thead>
          <tbody>
            {[...LDL_SERIES].reverse().map((p) => (
              <tr key={p.label}>
                <td>{p.label}</td>
                <td className="cv-ledger__val">{p.value}</td>
                <td>Blood Test</td>
              </tr>
            ))}
          </tbody>
        </table>
      );

    case 'evidence':
      return <EvidenceAnswer />;

    case 'time':
      return (
        <div className="dark-panel on-dark">
          <TrendCard />
        </div>
      );

    case 'context':
      return (
        <div className="dark-panel on-dark">
          <PatternCard />
        </div>
      );

    case 'prompts':
      return (
        <ul className="cv-prompts" aria-label="Example questions (sample)">
          {[
            'How has my LDL changed since 2022?',
            'What changed in my latest blood test?',
            'Which records mention my vitamin D?',
          ].map((q) => (
            <li key={q}>{q}</li>
          ))}
        </ul>
      );
  }
}
