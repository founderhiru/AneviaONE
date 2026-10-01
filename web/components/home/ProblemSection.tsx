import { WORDMARK } from '@/lib/config';

/** Why the product exists — nothing about AI or features here. */
const RECORDS = [
  { label: 'Lab reports', where: 'Lab portal', year: '2019' },
  { label: 'Hospital records', where: 'Hospital system', year: '2021' },
  { label: 'Prescriptions', where: 'Paper & photos', year: '2022' },
  { label: 'Scans', where: 'Imaging centre', year: '2023' },
  { label: 'Consultations', where: 'Clinic notes', year: '2025' },
];

export function ProblemSection() {
  return (
    <section id="problem" className="section problem" aria-labelledby="problem-title">
      <div className="container">
        <div className="problem__grid">
          <div className="problem__lead">
            <p className="eyebrow">Why it exists</p>
            <h2 id="problem-title" className="h2 problem__title">
              Your health is scattered.
            </h2>
            <p className="problem__diff">
              <span>Different places.</span>
              <span>Different dates.</span>
              <span>Different systems.</span>
            </p>
          </div>
          <ul className="problem__records" aria-label="Where health records usually live">
            {RECORDS.map((r) => (
              <li key={r.label} className="problem__record">
                <span className="problem__record-name">{r.label}</span>
                <span className="problem__record-meta">
                  {r.where} · {r.year}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="problem__resolve">
          <span className="problem__mark" aria-hidden="true">
            <svg width="40" height="40" viewBox="0 0 34 34" focusable="false">
              <rect width="34" height="34" rx="11" fill="#082b57" />
              <path d="M7.5 22.5l5.2-6.2 4.6 3.6 8.2-9.4" fill="none" stroke="#5fd0e8" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="25.5" cy="10.5" r="2.5" fill="#5fd0e8" />
            </svg>
          </span>
          <span>
            <span className="problem__brand">
              {WORDMARK.lead}
              <span className="accent">{WORDMARK.accent}</span>
            </span>{' '}
            brings the history together.
          </span>
        </p>
      </div>
    </section>
  );
}
