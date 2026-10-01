import { ClosingCta, PageHero } from '@/components/ContentPage';
import { Icon } from '@/components/Icon';
import { webFaqGroups } from '@/lib/faq';
import { pageMetadata } from '@/lib/metadata';
import { PAGES } from '@/lib/pages';

export const metadata = pageMetadata('faq');

/**
 * FAQ — content comes from shared/faq.ts (shared with the mobile app's
 * Help & FAQ screen). Rendered entirely on the server: the accordion is native
 * <details>/<summary>, so it works without JavaScript, is keyboard operable
 * (Tab to a question, Enter/Space to toggle) and exposes its expanded state to
 * assistive technology natively. The open/close animation is CSS-only and
 * switches off under prefers-reduced-motion.
 */
export default function FaqPage() {
  const page = PAGES.faq;
  const groups = webFaqGroups();

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: groups.flatMap((g) =>
      g.entries.map((e) => ({
        '@type': 'Question',
        name: e.question,
        acceptedAnswer: { '@type': 'Answer', text: e.answer.join(' ') },
      })),
    ),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />
      <PageHero eyebrow={page.eyebrow} headline={page.headline} accent={page.accent} lede={page.lede} />

      <section className="faqx" aria-label="Frequently asked questions">
        <div className="container faqx__layout">
          <nav className="faqx__nav" aria-label="FAQ topics">
            <p className="faqx__nav-h">Topics</p>
            <ul className="faqx__topics">
              {groups.map((g) => (
                <li key={g.id}>
                  <a href={`#${g.id}`} className="faqx__topic">
                    <span>{g.label}</span>
                    <span className="faqx__count" aria-label={`${g.entries.length} questions`}>
                      {g.entries.length}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="faqx__main">
            <p className="faqx__legend">
              <span className="faqx__legend-text">
                Unlabelled answers describe what the product does today. Labels mark what isn&rsquo;t fully available
                yet:
              </span>
              <span className="faqx__legend-pills">
                <span className="faqx__status faqx__status--planned">Not yet available</span>
                <span className="faqx__status faqx__status--partial">Partly available</span>
                <span className="faqx__status faqx__status--preview">Preview only</span>
              </span>
            </p>

            {groups.map((g) => (
              <section key={g.id} id={g.id} className="faqx__group" aria-labelledby={`${g.id}-title`}>
                <h2 id={`${g.id}-title`} className="faqx__group-title">
                  {g.label}
                </h2>
                <div className="faq">
                  {g.entries.map((e) => (
                    <details key={e.id} id={`q-${e.id}`} className="faq__item">
                      <summary className="faq__q">
                        <span className="faq__q-text">
                          <span>{e.question}</span>
                          {e.statusLabel ? (
                            <span className={`faqx__status faqx__status--${e.status}`}>{e.statusLabel}</span>
                          ) : null}
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
              </section>
            ))}
          </div>
        </div>
      </section>

      <ClosingCta kind="contact" />
    </>
  );
}
