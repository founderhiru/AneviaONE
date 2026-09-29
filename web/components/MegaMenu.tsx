import Link from 'next/link';

import { Icon } from './Icon';
import type { NavGroup } from '@/lib/nav';

type Props = {
  group: NavGroup;
  open: boolean;
  onNavigate: () => void;
};

/** One desktop mega panel. All panels are rendered from `NAV_GROUPS`. */
export function MegaPanel({ group, open, onNavigate }: Props) {
  return (
    <div
      id={`mega-${group.id}`}
      className={`mega__panel mega__panel--${group.variant}${open ? ' is-open' : ''}`}
      role="region"
      aria-label={`${group.label} menu`}
      inert={!open}
    >
      {group.variant === 'steps' ? (
        <>
          <ol className="mega-steps">
            {group.items.map((item, i) => (
              <li key={item.title} className="mega-steps__li">
                <Link href={item.href} className={`mega-step tone-${item.tone}`} onClick={onNavigate}>
                  <span className="mega-step__num">{String(i + 1).padStart(2, '0')}</span>
                  <span className="icon-tile">
                    <Icon name={item.icon} size={22} />
                  </span>
                  <span className="mega-step__title">{item.title}</span>
                  <span className="mega-step__desc">{item.description}</span>
                </Link>
                {i < group.items.length - 1 ? (
                  <span className="mega-steps__arrow" aria-hidden="true">
                    <Icon name="arrow" size={18} />
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
          <PanelFooter group={group} onNavigate={onNavigate} note="From scattered records to answers you can trace." />
        </>
      ) : group.variant === 'intelligence' ? (
        <div className="mega-intel">
          <div className="mega-intel__main">
            <ul className="mega-grid mega-grid--two">
              {group.items.map((item) => (
                <MegaItem key={item.title} item={item} onNavigate={onNavigate} />
              ))}
            </ul>
            <PanelFooter group={group} onNavigate={onNavigate} />
          </div>
          <aside className="mega-intel__aside" aria-label="Example insight">
            <span className="mega-intel__label">Sample insight</span>
            <span className="mega-intel__metric">LDL Cholesterol</span>
            <svg viewBox="0 0 220 70" className="mega-intel__chart" aria-hidden="true" focusable="false">
              <path d="M6 54 C 50 50, 78 40, 112 34 S 180 14, 214 10" fill="none" stroke="#5fd0e8" strokeWidth="3" strokeLinecap="round" />
              <circle cx="6" cy="54" r="4" fill="#5fd0e8" />
              <circle cx="112" cy="34" r="4" fill="#5fd0e8" />
              <circle cx="214" cy="10" r="5.5" fill="#f0a25a" />
            </svg>
            <span className="mega-intel__line">
              <b>118 → 146</b> mg/dL
            </span>
            <span className="mega-intel__sub">Trending upward over 4 years · from your records</span>
          </aside>
        </div>
      ) : (
        <>
          <ul className="mega-grid">
            {group.items.map((item) => (
              <MegaItem key={item.title} item={item} onNavigate={onNavigate} />
            ))}
          </ul>
          <PanelFooter group={group} onNavigate={onNavigate} />
        </>
      )}
    </div>
  );
}

function MegaItem({ item, onNavigate }: { item: NavGroup['items'][number]; onNavigate: () => void }) {
  return (
    <li>
      <Link href={item.href} className={`mega-item tone-${item.tone}`} onClick={onNavigate}>
        <span className="icon-tile">
          <Icon name={item.icon} size={22} />
        </span>
        <span className="mega-item__text">
          <span className="mega-item__title">{item.title}</span>
          <span className="mega-item__desc">{item.description}</span>
        </span>
      </Link>
    </li>
  );
}

function PanelFooter({ group, onNavigate, note }: { group: NavGroup; onNavigate: () => void; note?: string }) {
  return (
    <div className="mega__footer">
      <span className="mega__note">{note ?? ''}</span>
      <Link href={group.href} className="link-arrow" onClick={onNavigate}>
        Explore {group.label} <Icon name="arrow" size={16} />
      </Link>
    </div>
  );
}
