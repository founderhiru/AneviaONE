import Link from 'next/link';

import { Icon } from './Icon';

const EARLIER = [118, 121, 119, 123, 120];
const RECENT = [131, 134, 133, 137, 135];
const yv = (v: number) => 172 - ((v - 112) / 28) * 132;
const avg = (a: number[]) => a.reduce((s, n) => s + n, 0) / a.length;

/** "Understand patterns": recent readings sit consistently above earlier ones. */
export function PatternCard() {
  const ex = [34, 62, 90, 118, 146];
  const rx = [186, 214, 242, 270, 298];
  return (
    <article className="icard icard--pattern">
      <p className="icard__kicker">Understand patterns</p>
      <p className="icard__text">Find meaningful patterns across your health data.</p>

      <figure className="chart chart--pattern" aria-label="Sample blood pressure readings: recent records consistently higher than earlier records">
        <figcaption className="chart__head">
          <span>Blood pressure (systolic)</span>
          <span className="chart__unit">mmHg</span>
        </figcaption>
        <svg viewBox="0 0 332 226" className="chart__svg" role="img" aria-label="Earlier readings cluster lower than recent readings">
          <rect x="16" y="14" width="148" height="176" rx="14" fill="#fff" fillOpacity="0.04" />
          <rect x="172" y="14" width="148" height="176" rx="14" fill="#f0a25a" fillOpacity="0.09" />
          <line x1="24" x2="156" y1={yv(avg(EARLIER))} y2={yv(avg(EARLIER))} stroke="#5fd0e8" strokeDasharray="4 5" strokeOpacity="0.8" />
          <line x1="180" x2="312" y1={yv(avg(RECENT))} y2={yv(avg(RECENT))} stroke="#f0a25a" strokeDasharray="4 5" strokeOpacity="0.9" />
          {EARLIER.map((v, i) => (
            <circle key={`e${i}`} cx={ex[i]} cy={yv(v)} r="6.5" fill="#5fd0e8" />
          ))}
          {RECENT.map((v, i) => (
            <circle key={`r${i}`} cx={rx[i]} cy={yv(v)} r="6.5" fill="#f0a25a" />
          ))}
          <text x="90" y="214" textAnchor="middle" fontSize="12" fill="#9fb2cf" fontWeight="600">
            Earlier records
          </text>
          <text x="246" y="214" textAnchor="middle" fontSize="12" fill="#9fb2cf" fontWeight="600">
            Recent records
          </text>
        </svg>
      </figure>

      <p className="icard__detail">Based on 10 readings across 6 records.</p>
      <blockquote className="icard__quote">
        Your blood pressure readings have been consistently higher in your recent records compared to your earlier history.
      </blockquote>
      <Link href="/#ask" className="link-arrow">
        View supporting records <Icon name="arrow" size={16} />
      </Link>
      <p className="icard__note">Sample data for illustration.</p>
    </article>
  );
}
