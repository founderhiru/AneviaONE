import { LDL_SERIES } from '@/lib/sample';

// Plot space
const W = 320;
const H = 252;
const X = [50, 172, 294];
const Y_MIN = 105;
const Y_MAX = 150;
const y = (v: number) => 200 - ((v - Y_MIN) / (Y_MAX - Y_MIN)) * 150;

/** "See trends": a longitudinal LDL chart with a restrained orange semantic indicator. */
export function TrendCard() {
  const pts = LDL_SERIES.map((p, i) => [X[i], y(p.value)] as const);
  const line = `M${pts[0][0]} ${pts[0][1]} C ${pts[0][0] + 50} ${pts[0][1] - 4}, ${pts[1][0] - 46} ${pts[1][1] + 8}, ${pts[1][0]} ${pts[1][1]} S ${pts[2][0] - 44} ${pts[2][1] + 4}, ${pts[2][0]} ${pts[2][1]}`;
  const area = `${line} L${pts[2][0]} 208 L${pts[0][0]} 208 Z`;

  return (
    <article className="icard icard--trend">
      <p className="icard__kicker">See trends</p>
      <p className="icard__text">Track how key health measures change over months and years.</p>

      <figure className="chart" aria-label="Sample LDL cholesterol readings: 118 in 2022, 131 in 2024, 146 in 2026">
        <figcaption className="chart__head">
          <span>LDL Cholesterol</span>
          <span className="chart__unit">mg/dL</span>
        </figcaption>
        <svg viewBox={`0 0 ${W} ${H}`} className="chart__svg" role="img" aria-label="Line chart trending upward from 118 to 146">
          <defs>
            <linearGradient id="trend-line" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0" stopColor="#5fd0e8" />
              <stop offset="0.6" stopColor="#7fc4d8" />
              <stop offset="1" stopColor="#f0a25a" />
            </linearGradient>
            <linearGradient id="trend-area" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#5fd0e8" stopOpacity="0.22" />
              <stop offset="1" stopColor="#5fd0e8" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[58, 108, 158, 208].map((gy) => (
            <line key={gy} x1="22" x2="306" y1={gy} y2={gy} stroke="#ffffff" strokeOpacity="0.07" />
          ))}
          <path d={area} fill="url(#trend-area)" />
          <path d={line} pathLength={1} className="draw-line" fill="none" stroke="url(#trend-line)" strokeWidth="3.4" strokeLinecap="round" />
          {pts.map(([px, py], i) => {
            const last = i === pts.length - 1;
            return (
              <g key={i}>
                {last ? <circle cx={px} cy={py} r="11" fill="#f0a25a" fillOpacity="0.2" /> : null}
                <circle cx={px} cy={py} r={last ? 6 : 5} fill="#082b57" stroke={last ? '#f0a25a' : '#5fd0e8'} strokeWidth="3" />
                <text x={px} y={py - 16} textAnchor="middle" fontSize="15" fontWeight="700" fill="#fff">
                  {LDL_SERIES[i].value}
                </text>
                <text x={px} y="238" textAnchor="middle" fontSize="12" fill="#9fb2cf" fontWeight="600">
                  {LDL_SERIES[i].year}
                </text>
              </g>
            );
          })}
        </svg>
      </figure>

      <p className="icard__flag icard__flag--alert">
        <span aria-hidden="true">▲</span> Trending upward over 4 years
      </p>
      <p className="icard__detail">Latest reading is 28 mg/dL above the earliest, across 3 records.</p>
      <p className="icard__note">Sample data for illustration.</p>
    </article>
  );
}
