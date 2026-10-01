import Link from 'next/link';

import { Icon } from './Icon';
import type { NavGroup } from '@/lib/nav';

type Props = {
  group: NavGroup;
  open: boolean;
  onNavigate: () => void;
};

/**
 * Compact dropdown for one nav group, anchored under its trigger. Editorial,
 * not a sitemap: a small caps label, four title + one-line entries and a single
 * "Explore …" link. Server-renderable; open state comes from the Header.
 */
export function MegaPanel({ group, open, onNavigate }: Props) {
  return (
    <div
      id={`mega-${group.id}`}
      className={`dropdown${open ? ' is-open' : ''}`}
      role="region"
      aria-label={`${group.label} menu`}
      inert={!open}
    >
      <p className="dropdown__label">{group.label}</p>
      <ul className="dropdown__list">
        {group.items.map((item) => (
          <li key={item.title}>
            <Link href={item.href} className="dropdown__item" onClick={onNavigate}>
              <span className="dropdown__title">{item.title}</span>
              <span className="dropdown__desc">{item.description}</span>
            </Link>
          </li>
        ))}
      </ul>
      <Link href={group.href} className="dropdown__explore" onClick={onNavigate}>
        Explore {group.label} <Icon name="arrow" size={16} />
      </Link>
    </div>
  );
}
