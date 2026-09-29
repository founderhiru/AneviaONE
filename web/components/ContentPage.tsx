import Link from 'next/link';

import { ChangeCard } from './ChangeCard';
import { Icon } from './Icon';
import { PatternCard } from './PatternCard';
import { Reveal } from './Reveal';
import { StoreButtons } from './StoreButtons';
import { TrendCard } from './TrendCard';
import { LINKS } from '@/lib/config';
import type { Block, Item, PageDef } from '@/lib/pages';

export function PageHero({
  eyebrow,
  headline,
  accent,
  lede,
}: {
  eyebrow: string;
  headline: string;
  accent?: string;
  lede: string;
}) {
  return (
    <section className="page-hero" aria-labelledby="page-title">
      <div className="hero__glow hero__glow--a" aria-hidden="true" />
      <div className="hero__glow hero__glow--b" aria-hidden="true" />
      <div className="container page-hero__inner">
        <Reveal>
          <p className="eyebrow">{eyebrow}</p>
          <h1 id="page-title" className="h1 page-hero__title">
            {headline} {accent ? <span className="accent">{accent}</span> : null}
          </h1>
          <p className="lede">{lede}</p>
        </Reveal>
      </div>
    </section>
  );
}

function CardGrid({ items, columns = 3 }: { items: Item[]; columns?: 2 | 3 | 4 }) {
  return (
    <div className={`pgrid pgrid--${columns}`}>
      {items.map((it, i) => (
        <Reveal key={it.title} delay={i * 60} className={`pcard hover-lift tone-${it.tone}`}>
          <span className="icon-tile icon-tile--lg">
            <Icon name={it.icon} size={26} />
          </span>
          <h3 className="pcard__title">{it.title}</h3>
          <p>{it.text}</p>
        </Reveal>
      ))}
    </div>
  );
}

function SplitCard({ card }: { card?: 'trend' | 'change' | 'pattern' | 'ask' }) {
  if (card === 'trend') return <TrendCard />;
  if (card === 'change') return <ChangeCard />;
  if (card === 'pattern') return <PatternCard />;
  return null;
}

function BlockView({ block }: { block: Block }) {
  switch (block.type) {
    case 'cards':
      return (
        <section id={block.id} className="section page-section">
          <div className="container">
            <Reveal className="section-head">
              {block.eyebrow ? <p className="eyebrow">{block.eyebrow}</p> : null}
              <h2 className="h2">{block.title}</h2>
              {block.intro ? <p className="lede">{block.intro}</p> : null}
            </Reveal>
            <CardGrid items={block.items} columns={block.columns} />
          </div>
        </section>
      );

    case 'split':
      return (
        <section id={block.id} className="section page-section page-split">
          <div className={`container split${block.reverse ? ' split--reverse' : ''}`}>
            <Reveal className="split__copy">
              {block.eyebrow ? <p className="eyebrow">{block.eyebrow}</p> : null}
              <h2 className="h2">{block.title}</h2>
              {block.paragraphs.map((p) => (
                <p key={p} className="lede">
                  {p}
                </p>
              ))}
              {block.points ? (
                <ul className="checklist">
                  {block.points.map((pt) => (
                    <li key={pt}>
                      <Icon name="check" size={18} /> {pt}
                    </li>
                  ))}
                </ul>
              ) : null}
            </Reveal>
            <Reveal className="split__visual on-dark" delay={100}>
              <div className="dark-panel">
                <SplitCard card={block.card} />
              </div>
            </Reveal>
          </div>
        </section>
      );

    case 'steps':
      return (
        <section className="section page-section">
          <div className="container">
            <ol className="hsteps">
              {block.items.map((s, i) => (
                <Reveal as="li" key={s.id} id={s.id} delay={i * 40} className={`hstep tone-${s.tone}`}>
                  <span className="hstep__marker">
                    <Icon name={s.icon} size={26} />
                  </span>
                  <div className="hstep__card card">
                    <span className="hstep__num">{s.n}</span>
                    <h2 className="h3 hstep__title">{s.title}</h2>
                    <p className="hstep__text">{s.text}</p>
                    <ul className="checklist">
                      {s.points.map((pt) => (
                        <li key={pt}>
                          <Icon name="check" size={18} /> {pt}
                        </li>
                      ))}
                    </ul>
                  </div>
                </Reveal>
              ))}
            </ol>
          </div>
        </section>
      );

    case 'prose':
      return (
        <section id={block.id} className="section page-section">
          <div className="container prose">
            <Reveal>
              {block.eyebrow ? <p className="eyebrow">{block.eyebrow}</p> : null}
              <h2 className="h2">{block.title}</h2>
              {block.paragraphs.map((p) => (
                <p key={p} className="prose__p">
                  {p}
                </p>
              ))}
              {block.bullets ? (
                <ul className="checklist">
                  {block.bullets.map((b) => (
                    <li key={b}>
                      <Icon name="check" size={18} /> {b}
                    </li>
                  ))}
                </ul>
              ) : null}
            </Reveal>
          </div>
        </section>
      );

    case 'notice':
      return (
        <section className="page-notice">
          <div className="container">
            <Reveal className={`notice notice--${block.tone}`} >
              <span className="icon-tile">
                <Icon name={block.tone === 'draft' ? 'clock' : 'shield'} size={22} />
              </span>
              <div>
                <p className="notice__title">{block.title}</p>
                <p>{block.text}</p>
              </div>
            </Reveal>
          </div>
        </section>
      );

    case 'contact':
      return (
        <section className="section page-section">
          <div className="container prose">
            <Reveal className="contact card">
              <span className="icon-tile icon-tile--lg tone-blue">
                <Icon name="mail" size={26} />
              </span>
              <h2 className="h3">Email us</h2>
              {LINKS.contactEmail ? (
                <a className="contact__mail" href={`mailto:${LINKS.contactEmail}`}>
                  {LINKS.contactEmail}
                </a>
              ) : (
                // TODO(launch): set NEXT_PUBLIC_CONTACT_EMAIL to a monitored inbox.
                <p className="contact__soon">Contact details will be published here at launch.</p>
              )}
              <p className="fine">AneviaOne is a product of MedhaIQ Systems.</p>
            </Reveal>
          </div>
        </section>
      );
  }
}

export function ClosingCta({ kind }: { kind: 'download' | 'contact' | 'none' }) {
  if (kind === 'none') return null;
  return (
    <section className="page-cta">
      <div className="container">
        <Reveal className="page-cta__card on-dark">
          {kind === 'download' ? (
            <>
              <h2 className="h2">Your health story, for life.</h2>
              <p className="lede">Start building your intelligent health history with AneviaOne.</p>
              <StoreButtons tone="light" className="page-cta__stores" />
              {!LINKS.appStore && !LINKS.googlePlay ? <p className="fine">App store links will appear here at launch.</p> : null}
            </>
          ) : (
            <>
              <h2 className="h2">Questions? Let’s talk.</h2>
              <p className="lede">We’d like to hear from you.</p>
              <Link href="/contact" className="btn btn--light">
                Contact us
              </Link>
            </>
          )}
        </Reveal>
      </div>
    </section>
  );
}

export function ContentPage({ page }: { page: PageDef }) {
  return (
    <>
      <PageHero eyebrow={page.eyebrow} headline={page.headline} accent={page.accent} lede={page.lede} />
      {page.blocks.map((b, i) => (
        <BlockView key={i} block={b} />
      ))}
      <ClosingCta kind={page.closing ?? 'download'} />
    </>
  );
}
