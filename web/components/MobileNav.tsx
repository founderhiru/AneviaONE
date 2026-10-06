'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';

import { Icon } from './Icon';
import { PRIMARY_CTA } from '@/lib/config';
import { NAV_LINKS } from '@/lib/nav';

type Props = { open: boolean; onClose: () => void };

/** Full-screen mobile drawer: the same four links and the one CTA. */
export function MobileNav({ open, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Lock page scroll and move focus into the drawer while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.querySelector<HTMLElement>('a')?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <div
      id="mobile-nav"
      ref={panelRef}
      className={`drawer${open ? ' is-open' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Site menu"
      inert={!open}
    >
      <nav aria-label="Mobile">
        <ul className="drawer__list">
          {NAV_LINKS.map((l) => (
            <li key={l.id} className="drawer__group">
              <Link href={l.href} className="drawer__toggle" onClick={onClose}>
                <span>{l.label}</span>
                <Icon name="arrow" size={20} />
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div className="drawer__cta">
        <Link href={PRIMARY_CTA.href} className="btn btn--primary" onClick={onClose}>
          {PRIMARY_CTA.label}
        </Link>
      </div>
    </div>
  );
}
