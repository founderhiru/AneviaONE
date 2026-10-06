import Link from 'next/link';

import { Icon } from '../Icon';
import { Reveal } from '../Reveal';
import { homeFaq } from '@/lib/faq';

/**
 * The questions people ask first, as a native <details> accordion (works
 * without JavaScript, keyboard- and screen-reader-operable). The entries come
 * from the shared FAQ, so /faq and this section can never disagree.
 */
export function FaqSection() {
  const entries = homeFaq();
  return (
    <section id="faq" className="section hfaq" aria-labelledby="hfaq-title">
      <div className="container hfaq__grid">
        <Reveal className="hfaq__head">
          <p className="eyebrow">Questions</p>
          <h2 id="hfaq-title" className="h2">
            Straight answers.
          </h2>
          <p className="lede">What it does today, what is coming next, and what it doesn’t do.</p>
          <Link href="/faq" className="link-arrow hfaq__all">
            All questions <Icon name="arrow" size={16} />
          </Link>
        </Reveal>

        <div className="faq hfaq__list">
          {entries.map((e) => (
            <details key={e.id} className="faq__item">
              <summary className="faq__q">
                <span className="faq__q-text">
                  <span>{e.question}</span>
                  {e.statusLabel ? <span className={`faqx__status faqx__status--${e.status}`}>{e.statusLabel}</span> : null}
                </span>
                <Icon name="chevron" size={22} className="faq__chev" />
              </summary>
              <div className="faq__a">
                {e.answer.map((p) => (
                  <p key={p}>{p}</p>
                ))}
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
