import type { CSSProperties } from 'react';

import { HomeScreen } from './PhoneScreens';
import { Phone } from './Phone';
import { Icon } from './Icon';
import { RECORD_CHIPS } from '@/lib/sample';
import { BRAND } from '@/lib/config';

/**
 * Hero visual: six different records around one phone, tied to it by thin
 * teal/blue lines — "Different records. One connected story."
 * Coordinates are in a 100 × 106 space so lines and chips stay aligned at any size.
 * Static by design: no float/bob loops, so the hero never repaints on idle.
 */
const H = 106;
// [centre x, centre y, phone-edge y] for each chip in RECORD_CHIPS order.
// The phone spans x 26–74 (see .scatter__phone); chips are 22 wide.
const LAYOUT: [number, number, number][] = [
  [12, 16, 24],
  [12, 50, 48],
  [12, 84, 74],
  [88, 24, 30],
  [88, 58, 56],
  [88, 90, 80],
];
const CHIP_HALF = 11;
const EDGE_L = 26;
const EDGE_R = 74;

export function RecordScatter() {
  return (
    <div className="scatter" role="group" aria-label="Six different health records connected to one health history">
      <svg className="scatter__lines" viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id="scatter-grad" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="#11a8c8" />
            <stop offset="1" stopColor="#2e6db4" />
          </linearGradient>
        </defs>
        {LAYOUT.map(([cx, cy, ey], i) => {
          const left = cx < 50;
          const sx = left ? cx + CHIP_HALF : cx - CHIP_HALF;
          const ex = left ? EDGE_L : EDGE_R;
          const dx = (ex - sx) * 0.55;
          const d = `M${sx} ${cy} C ${sx + (left ? dx : -dx)} ${cy}, ${ex - (left ? dx : -dx)} ${ey}, ${ex} ${ey}`;
          return (
            <g key={i}>
              <path d={d} pathLength={1} className="draw-line scatter__path" stroke="url(#scatter-grad)" fill="none" />
              <circle cx={ex} cy={ey} r="0.9" className="scatter__end" />
            </g>
          );
        })}
      </svg>

      <div className="scatter__phone">
        <Phone label={`${BRAND.name} Home screen showing a health timeline from 2019 to 2026 and a health snapshot`}>
          <HomeScreen />
        </Phone>
      </div>

      {RECORD_CHIPS.map((c, i) => {
        const [cx, cy] = LAYOUT[i];
        return (
          <div
            key={`${c.year}-${c.label}`}
            className={`rchip rchip--${cx < 50 ? 'l' : 'r'} tone-${c.tone}`}
            style={{ '--x': `${cx}%`, top: `${(cy / H) * 100}%` } as CSSProperties}
          >
            <span className="rchip__icon">
              <Icon name={c.icon} size={18} />
            </span>
            <span className="rchip__text">
              <span className="rchip__year">{c.year}</span>
              <span className="rchip__label">{c.label}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
