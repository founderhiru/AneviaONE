import Link from 'next/link';

import { Icon } from './Icon';
import { Logo } from './Logo';
import { BRAND, DOWNLOAD_ANCHOR, STORES_LIVE } from '@/lib/config';
import { FOOTER_LINKS } from '@/lib/nav';

/** Splits the two-sentence positioning so each sentence sits on its own line. */
function sentences(text: string) {
  return text.split(/(?<=\.)\s+/);
}

/**
 * A quiet brand signature, not a sitemap: the mark, the positioning line, the
 * brand signature, five existing pages and one way to get the app.
 */
export function Footer() {
  return (
    <footer className="footer on-dark">
      <div className="container">
        <div className="footer__main">
          <div className="footer__brand">
            <Logo tone="dark" size={44} />
            <p className="footer__promise">
              {sentences(BRAND.promise).map((s) => (
                <span key={s}>{s}</span>
              ))}
            </p>
            <p className="footer__signature">{BRAND.signature}</p>
          </div>

          <div className="footer__aside">
            <nav aria-label="Footer">
              <ul className="footer__links">
                {FOOTER_LINKS.map((l) => (
                  <li key={l.id}>
                    <Link href={l.href}>{l.label}</Link>
                  </li>
                ))}
              </ul>
            </nav>
            <Link href={DOWNLOAD_ANCHOR} className="footer__download">
              {STORES_LIVE ? 'Download the App' : 'Get Started'} <Icon name="arrow" size={18} />
            </Link>
          </div>
        </div>

        <div className="footer__legal">
          <p>© 2026 {BRAND.name}</p>
          <p className="footer__disclaimer">
            {BRAND.name} is a consumer health-information product. It helps you keep your own records together and is
            being built to help you understand them; it does not diagnose, treat or replace professional medical advice.
          </p>
        </div>
      </div>
    </footer>
  );
}
