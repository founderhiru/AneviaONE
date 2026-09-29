'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { Icon } from './Icon';
import { DOWNLOAD_ANCHOR, LINKS } from '@/lib/config';
import { NAV_GROUPS, NAV_LINKS } from '@/lib/nav';

type Props = { open: boolean; onClose: () => void };

/** Full-screen mobile drawer. Each top-level item expands/collapses. */
export function MobileNav({ open, onClose }: Props) {
  const [expanded, setExpanded] = useState<string | null>('product');
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Lock page scroll and move focus into the drawer while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const first = panelRef.current?.querySelector<HTMLElement>('button, a');
    first?.focus({ preventScroll: true });
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
          {NAV_GROUPS.map((group) => {
            const isOpen = expanded === group.id;
            return (
              <li key={group.id} className="drawer__group">
                <button
                  type="button"
                  className="drawer__toggle"
                  aria-expanded={isOpen}
                  aria-controls={`drawer-${group.id}`}
                  onClick={() => setExpanded(isOpen ? null : group.id)}
                >
                  <span>{group.label}</span>
                  <Icon name="chevron" size={22} className="drawer__chev" />
                </button>
                <div id={`drawer-${group.id}`} className={`drawer__sub${isOpen ? ' is-open' : ''}`} inert={!isOpen}>
                  <ul>
                    {group.items.map((item, i) => (
                      <li key={item.title}>
                        <Link href={item.href} className={`drawer__link tone-${item.tone}`} onClick={onClose}>
                          {group.variant === 'steps' ? (
                            <span className="drawer__num">{String(i + 1).padStart(2, '0')}</span>
                          ) : (
                            <span className="icon-tile">
                              <Icon name={item.icon} size={20} />
                            </span>
                          )}
                          <span className="drawer__text">
                            <span className="drawer__title">{item.title}</span>
                            <span className="drawer__desc">{item.description}</span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              </li>
            );
          })}
          {NAV_LINKS.map((l) => (
            <li key={l.id} className="drawer__group">
              <Link href={l.href} className="drawer__toggle drawer__toggle--link" onClick={onClose}>
                <span>{l.label}</span>
                <Icon name="arrow" size={20} />
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div className="drawer__cta">
        <Link href={DOWNLOAD_ANCHOR} className="btn btn--primary" onClick={onClose}>
          Download App
        </Link>
        {LINKS.signIn ? (
          <a href={LINKS.signIn} className="btn btn--ghost">
            Sign In
          </a>
        ) : (
          <span className="btn btn--ghost" aria-disabled="true" title="Sign in opens with the app launch">
            Sign In · soon
          </span>
        )}
      </div>
    </div>
  );
}
