'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';

import { Icon } from './Icon';
import { Logo } from './Logo';
import { MegaPanel } from './MegaMenu';
import { MobileNav } from './MobileNav';
import { DOWNLOAD_ANCHOR, LINKS } from '@/lib/config';
import { NAV_GROUPS, NAV_LINKS } from '@/lib/nav';

export function Header() {
  const [openId, setOpenId] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  const rootRef = useRef<HTMLElement | null>(null);
  const panelsRef = useRef<HTMLDivElement | null>(null);
  const triggers = useRef<Record<string, HTMLButtonElement | null>>({});
  const closeTimer = useRef<number | undefined>(undefined);

  const closeAll = useCallback(() => {
    window.clearTimeout(closeTimer.current);
    setOpenId(null);
    setMobileOpen(false);
  }, []);

  const cancelClose = () => window.clearTimeout(closeTimer.current);
  const scheduleClose = () => {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpenId(null), 180);
  };

  // Shadow once the page scrolls.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

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
    const onPointer = (e: PointerEvent) => {
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
        panelsRef.current?.querySelector<HTMLElement>(`#mega-${id} a`)?.focus();
      });
    }
  };

  return (
    <header ref={rootRef} className={`header${scrolled ? ' is-scrolled' : ''}${mobileOpen ? ' is-drawer' : ''}`} onBlur={onBlur}>
      <div className="container header__inner">
        <Logo />

        <nav className="header__nav" aria-label="Primary" onPointerLeave={scheduleClose} onPointerEnter={cancelClose}>
          <ul className="header__list">
            {NAV_GROUPS.map((g) => {
              const isOpen = openId === g.id;
              return (
                <li key={g.id}>
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
                      if (e.pointerType === 'mouse') {
                        cancelClose();
                        setOpenId(g.id);
                      }
                    }}
                    onKeyDown={(e) => onTriggerKey(e, g.id)}
                  >
                    {g.label}
                    <Icon name="chevron" size={16} className="header__chev" />
                  </button>
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

        <div className="header__actions">
          {LINKS.signIn ? (
            <a href={LINKS.signIn} className="header__signin">
              Sign In
            </a>
          ) : (
            <span className="header__signin header__signin--soon" aria-disabled="true" title="Sign in opens with the app launch">
              Sign In
            </span>
          )}
          <Link href={DOWNLOAD_ANCHOR} className="btn btn--primary btn--sm header__download">
            Download App
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

      {/* Desktop mega panels — absolutely positioned, so opening never shifts layout. */}
      <div
        ref={panelsRef}
        className="mega"
        onPointerEnter={cancelClose}
        onPointerLeave={scheduleClose}
      >
        <div className="container">
          <div className="mega__frame">
            {NAV_GROUPS.map((g) => (
              <MegaPanel key={g.id} group={g} open={openId === g.id} onNavigate={closeAll} />
            ))}
          </div>
        </div>
      </div>

      <MobileNav open={mobileOpen} onClose={closeAll} />
    </header>
  );
}
