import { StoreButtons } from '../StoreButtons';
import { BRAND } from '@/lib/config';

/**
 * Compact "get the app" strip between the hero and the problem section. Reuses
 * the store buttons, so it shows the same honest "Soon" state until store URLs
 * are configured (NEXT_PUBLIC_APP_STORE_URL / NEXT_PUBLIC_GOOGLE_PLAY_URL).
 */
export function AppBar() {
  return (
    <section className="appbar" aria-labelledby="appbar-title">
      <div className="container">
        <div className="appbar__inner">
          <div className="appbar__copy">
            <p className="eyebrow">Get the {BRAND.name} app</p>
            <h2 id="appbar-title" className="appbar__title">
              Your health history, always with you.
            </h2>
          </div>
          <StoreButtons className="appbar__stores" />
        </div>
      </div>
    </section>
  );
}
