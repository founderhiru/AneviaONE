import { LINKS } from '@/lib/config';

/**
 * App Store / Google Play buttons.
 *
 * URLs are configurable (NEXT_PUBLIC_APP_STORE_URL / NEXT_PUBLIC_GOOGLE_PLAY_URL).
 * Until they are set, the buttons render as clearly-labelled "Coming soon"
 * placeholders rather than links to nowhere.
 * TODO(launch): replace these generic buttons with the official store badge
 * artwork and set the real URLs.
 */

function AppleGlyph() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M16.37 12.6c-.03-2.6 2.12-3.85 2.22-3.91-1.21-1.77-3.09-2.01-3.76-2.04-1.6-.16-3.12.94-3.93.94-.81 0-2.06-.92-3.39-.89-1.74.03-3.35 1.01-4.25 2.57-1.81 3.14-.46 7.78 1.3 10.33.86 1.25 1.89 2.65 3.24 2.6 1.3-.05 1.79-.84 3.36-.84 1.57 0 2.01.84 3.39.81 1.4-.02 2.29-1.27 3.14-2.52.99-1.45 1.4-2.85 1.42-2.92-.03-.01-2.72-1.04-2.75-4.13zM13.8 4.9c.72-.87 1.2-2.08 1.07-3.28-1.03.04-2.28.69-3.02 1.55-.66.77-1.24 2-1.09 3.18 1.15.09 2.32-.58 3.04-1.45z" />
    </svg>
  );
}

function PlayGlyph() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4.2 2.7v18.6c0 .4.4.6.7.4l8.4-9.3L4.9 2.3c-.3-.2-.7 0-.7.4z" fill="#34bfdc" />
      <path d="M13.3 12.4l3-3.3L6.5 3.4c-.6-.3-1.2-.2-1.6 0l8.4 9z" fill="#7bd88f" />
      <path d="M13.3 12.4l-8.4 9c.4.2 1 .3 1.6 0l9.8-5.7-3-3.3z" fill="#ef6a5b" />
      <path d="M16.3 15.7l3.4-2c.7-.4.7-1.3 0-1.7l-3.4-2-3 3.3 3 2.4z" fill="#f6c343" />
    </svg>
  );
}

type Store = { id: 'app-store' | 'google-play'; small: string; big: string; href?: string; glyph: React.ReactNode };

const STORES: Store[] = [
  { id: 'app-store', small: 'Download on the', big: 'App Store', href: LINKS.appStore, glyph: <AppleGlyph /> },
  { id: 'google-play', small: 'Get it on', big: 'Google Play', href: LINKS.googlePlay, glyph: <PlayGlyph /> },
];

export function StoreButtons({ tone = 'dark', className = '' }: { tone?: 'dark' | 'light'; className?: string }) {
  return (
    <div className={`stores stores--${tone} ${className}`.trim()}>
      {STORES.map((s) =>
        s.href ? (
          <a key={s.id} className="store" href={s.href} target="_blank" rel="noopener noreferrer">
            <span className="store__glyph">{s.glyph}</span>
            <span className="store__text">
              <span className="store__small">{s.small}</span>
              <span className="store__big">{s.big}</span>
            </span>
          </a>
        ) : (
          <span
            key={s.id}
            className="store store--soon"
            role="img"
            aria-label={`${s.big} — coming soon`}
            title="Store link not published yet"
          >
            <span className="store__glyph">{s.glyph}</span>
            <span className="store__text">
              <span className="store__small">{s.small}</span>
              <span className="store__big">{s.big}</span>
            </span>
            <span className="store__soon">Soon</span>
          </span>
        ),
      )}
    </div>
  );
}
