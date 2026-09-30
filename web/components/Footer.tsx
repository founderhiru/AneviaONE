import Link from 'next/link';

import { Logo } from './Logo';
import { BRAND } from '@/lib/config';
import { FOOTER_LEGAL_LINKS, FOOTER_PRODUCT_LINKS } from '@/lib/nav';

export function Footer() {
  return (
    <footer className="footer on-dark">
      <div className="container">
        <div className="footer__top">
          <div className="footer__brand">
            <Logo tone="dark" />
            <p className="footer__cat">{BRAND.category}</p>
            <p className="footer__tag">{BRAND.tagline}</p>
          </div>

          <nav className="footer__col" aria-label="Footer — explore">
            <h2 className="footer__h">Explore</h2>
            <ul>
              {FOOTER_PRODUCT_LINKS.map((l) => (
                <li key={l.href}>
                  <Link href={l.href}>{l.label}</Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav className="footer__col" aria-label="Footer — legal">
            <h2 className="footer__h">Legal</h2>
            <ul>
              {FOOTER_LEGAL_LINKS.map((l) => (
                <li key={l.href}>
                  <Link href={l.href}>{l.label}</Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="footer__bottom">
          <p>
            {BRAND.name} is a product of {BRAND.parent}.
          </p>
          <p>© 2026 {BRAND.parent}. All rights reserved.</p>
        </div>
        <p className="footer__disclaimer">
          {BRAND.name} is a consumer health-information product. It helps you organize and understand your own records; it
          does not diagnose, treat or replace professional medical advice.
        </p>
      </div>
    </footer>
  );
}
