import { ClosingCta, PageHero } from '@/components/ContentPage';
import { Icon } from '@/components/Icon';
import { Reveal } from '@/components/Reveal';
import { FAQS } from '@/lib/pages';
import { pageMetadata } from '@/lib/metadata';
import { BRAND } from '@/lib/config';

export const metadata = pageMetadata('faq');

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQS.map((f) => ({
    '@type': 'Question',
    name: f.q,
    acceptedAnswer: { '@type': 'Answer', text: f.a },
  })),
};

export default function FaqPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />
      <PageHero
        eyebrow="FAQ"
        headline="Questions,"
        accent="answered."
        lede={`Straight answers about what ${BRAND.name} does, and what it doesn’t.`}
      />
      <section className="section page-section">
        <div className="container prose">
          <div className="faq">
            {FAQS.map((f) => (
              <Reveal key={f.q}>
                <details className="faq__item">
                  <summary className="faq__q">
                    <span>{f.q}</span>
                    <Icon name="chevron" size={22} className="faq__chev" />
                  </summary>
                  <p className="faq__a">{f.a}</p>
                </details>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
      <ClosingCta kind="contact" />
    </>
  );
}

