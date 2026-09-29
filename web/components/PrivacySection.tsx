import Link from 'next/link';

import { Icon, type IconName } from './Icon';
import { Reveal } from './Reveal';

const BLOCKS: { title: string; text: string; icon: IconName; tone: string }[] = [
  { title: 'Your Data, Your Control', text: 'You decide what to store, share or delete.', icon: 'sliders', tone: 'blue' },
  { title: 'Secure Storage', text: 'Your records are kept in private storage that only your account can access.', icon: 'lock', tone: 'teal' },
  { title: 'Transparent AI', text: 'See where information and insights come from.', icon: 'evidence', tone: 'lavender' },
  { title: 'Data Sharing', text: 'Share with your doctor when you choose.', icon: 'users', tone: 'cream' },
];

export function PrivacySection() {
  return (
    <section id="privacy" className="section privacy" aria-labelledby="privacy-title">
      <div className="container">
        <Reveal className="section-head section-head--center">
          <p className="eyebrow">Privacy</p>
          <h2 id="privacy-title" className="h2">
            Your health is yours.
          </h2>
          <p className="lede">Private by design. Transparent by default.</p>
        </Reveal>

        <div className="privacy__grid">
          {BLOCKS.map((b, i) => (
            <Reveal key={b.title} delay={i * 80} className={`pblock hover-lift tone-${b.tone}`}>
              <span className="icon-tile icon-tile--lg">
                <Icon name={b.icon} size={26} />
              </span>
              <h3 className="pblock__title">{b.title}</h3>
              <p>{b.text}</p>
            </Reveal>
          ))}
        </div>

        <Reveal className="privacy__compliance" delay={100}>
          <span className="icon-tile tone-mint">
            <Icon name="badge" size={20} />
          </span>
          <p>
            <b>Compliance.</b> We design with applicable privacy standards in mind, and we don&rsquo;t claim certifications
            we don&rsquo;t hold.
          </p>
          <Link href="/security#compliance" className="link-arrow">
            Read more <Icon name="arrow" size={16} />
          </Link>
        </Reveal>
      </div>
    </section>
  );
}
