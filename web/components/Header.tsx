'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

import { Icon } from './Icon';
import { Logo } from './Logo';
import { MegaPanel } from './MegaMenu';
import { MobileNav } from './MobileNav';
import { LINKS, PRIMARY_CTA } from '@/lib/config';
import { NAV_GROUPS, NAV_LINKS } from '@/lib/nav';

export function Header() {
  const [openId, setOpenId] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  const rootRef = useRef<HTMLElement | null>(null);
  const triggers = useRef<Record<string, HTMLButtonElement | null>>({});

  const closeAll = useCallback(() => {
    setOpenId(null);
    setMobileOpen(false);
  }, []);

  // No hover-intent timers: a panel opens the moment a trigger is hovered and
  // closes the moment the pointer leaves the header (panels are inside it, and
  // a CSS bridge covers the gap). The scrolled shadow is scroll-driven CSS.
  const onHeaderPointerLeave = (e: PointerEvent<HTMLElement>) => {
    if (e.pointerType === 'mouse') setOpenId(null);
  };

  // While a menu is open: Escape closes (and returns focus), outside press closes.
  useEffect(() => {
    if (!openId && !mobileOpen) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const id = openId;
      closeAll();
      if (id) triggers.current[id]?.focus();
      else document.getElementById('mobile-toggle')?.focus();
    };
    const onPointer = (e: globalThis.PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) closeAll();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [openId, mobileOpen, closeAll]);

  // Close the mega menu when keyboard focus leaves the header entirely.
  const onBlur = (e: React.FocusEvent) => {
    if (openId && rootRef.current && !rootRef.current.contains(e.relatedTarget as Node | null)) {
      setOpenId(null);
    }
  };

  const onTriggerKey = (e: KeyboardEvent<HTMLButtonElement>, id: string) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpenId(id);
      window.requestAnimationFrame(() => {
        rootRef.current?.querySelector<HTMLElement>(`#mega-${id} a`)?.focus();
      });
    }
  };

  return (
    <header
      ref={rootRef}
      className={`header${mobileOpen ? ' is-drawer' : ''}`}
      onBlur={onBlur}
      onPointerLeave={onHeaderPointerLeave}
    >
      <div className="container header__inner">
        <Logo animate />

        <nav className="header__nav" aria-label="Primary">
          <ul className="header__list">
            {NAV_GROUPS.map((g) => {
              const isOpen = openId === g.id;
              return (
                <li key={g.id} className="header__item">
                  <button
                    type="button"
                    ref={(el) => {
                      triggers.current[g.id] = el;
                    }}
                    className={`header__trigger${isOpen ? ' is-open' : ''}`}
                    aria-expanded={isOpen}
                    aria-controls={`mega-${g.id}`}
                    onClick={() => setOpenId(isOpen ? null : g.id)}
                    onPointerEnter={(e) => {
                      if (e.pointerType === 'mouse') setOpenId(g.id);
                    }}
                    onKeyDown={(e) => onTriggerKey(e, g.id)}
                  >
                    {g.label}
                    <Icon name="chevron" size={16} className="header__chev" />
                  </button>
                  {/* Dropdown sits under its own trigger; absolutely positioned, so it never shifts layout. */}
                  <MegaPanel group={g} open={isOpen} onNavigate={closeAll} />
                </li>
              );
            })}
            {NAV_LINKS.map((l) => (
              <li key={l.id}>
                <Link href={l.href} className="header__trigger header__trigger--link" onPointerEnter={() => setOpenId(null)}>
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div
          className="header__actions"
          onPointerEnter={(e) => {
            if (e.pointerType === 'mouse') setOpenId(null);
          }}
        >
          {LINKS.signIn ? (
            <a href={LINKS.signIn} className="header__signin">
              Sign In
            </a>
          ) : (
            <span className="header__signin header__signin--soon" aria-disabled="true" title="Sign in opens with the app launch">
              Sign In
            </span>
          )}
          <Link href={PRIMARY_CTA.href} className="btn btn--primary btn--sm header__download">
            {PRIMARY_CTA.label}
          </Link>
          <button
            id="mobile-toggle"
            type="button"
            className="header__burger"
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav"
            onClick={() => {
              setOpenId(null);
              setMobileOpen((v) => !v);
            }}
          >
            <Icon name={mobileOpen ? 'close' : 'menu'} size={24} />
          </button>
        </div>
      </div>

      <MobileNav open={mobileOpen} onClose={closeAll} />
    </header>
  );
}
