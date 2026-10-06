import { StoreButtons } from './StoreButtons';
import { PRIMARY_CTA, STORES_LIVE } from '@/lib/config';

/**
 * Closing call to action and the target of every "Get Started" link
 * (DOWNLOAD_ANCHOR → #get-started). The store buttons are the action itself;
 * until store URLs are configured they show an honest "Soon" state.
 */
export function FinalCTA() {
  return (
    <section id="get-started" className="cta on-dark" aria-labelledby="cta-title">
      {/* Keeps older /#download links working. */}
      <span id="download" aria-hidden="true" />
      <div className="container cta__inner">
        <h2 id="cta-title" className="h2 cta__title">
          <span>Your health has a history.</span> <span className="accent">Start keeping it together.</span>
        </h2>
        <p className="cta__label">{PRIMARY_CTA.label}</p>
        <StoreButtons tone="light" className="cta__stores" />
        {!STORES_LIVE ? <p className="fine cta__note">App store links will appear here at launch.</p> : null}
      </div>
    </section>
  );
}
