'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Icon } from './Icon';
import { Logo } from './Logo';
import { MobileNav } from './MobileNav';
import { PRIMARY_CTA } from '@/lib/config';
import { NAV_LINKS } from '@/lib/nav';

/**
 * Logo left · four links · one call to action. The header lives in the root
 * layout, so it is mounted once per page load: the logo's entrance animation
 * plays then, and not on route changes or re-renders.
 */
export function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const rootRef = useRef<HTMLElement | null>(null);

  const close = useCallback(() => setMobileOpen(false), []);

  // While the drawer is open: Escape closes it (and returns focus); a press
  // outside the header closes it.
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      close();
      document.getElementById('mobile-toggle')?.focus();
    };
    const onPointer = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [mobileOpen, close]);

  return (
    <header ref={rootRef} className={`header${mobileOpen ? ' is-drawer' : ''}`}>
      <div className="container header__inner">
        <Logo animate />

        <nav className="header__nav" aria-label="Primary">
          <ul className="header__list">
            {NAV_LINKS.map((l) => (
              <li key={l.id}>
                <Link href={l.href} className="header__link">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="header__actions">
          <Link href={PRIMARY_CTA.href} className="btn btn--primary btn--sm header__cta">
            {PRIMARY_CTA.label}
          </Link>
          <button
            id="mobile-toggle"
            type="button"
            className="header__burger"
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav"
            onClick={() => setMobileOpen((v) => !v)}
          >
            <Icon name={mobileOpen ? 'close' : 'menu'} size={24} />
          </button>
        </div>
      </div>

      <MobileNav open={mobileOpen} onClose={close} />
    </header>
  );
}
