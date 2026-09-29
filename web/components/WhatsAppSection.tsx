import Link from 'next/link';

import { Icon } from './Icon';
import { Reveal } from './Reveal';

export function WhatsAppSection() {
  return (
    <section id="whatsapp" className="section wa" aria-labelledby="wa-title">
      <div className="container wa__grid">
        <Reveal className="wa__copy">
          <p className="eyebrow">WhatsApp capture</p>
          <h2 id="wa-title" className="h2">
            Start anywhere with WhatsApp.
          </h2>
          <p className="lede">Send a report through WhatsApp and continue your health journey in AneviaOne.</p>
          <p className="wa__pill">
            <span className="pill tone-mint">Rolling out</span>
          </p>
          <p className="fine wa__note">
            WhatsApp is just a way to send reports in. Your health history lives in AneviaOne, not in WhatsApp — and
            messages sent back to you stay generic.
          </p>
          <Link href="/how-it-works#capture" className="link-arrow wa__link">
            Learn how <Icon name="arrow" size={16} />
          </Link>
        </Reveal>

        <Reveal className="wa__seq" delay={120}>
          <ol className="seq" aria-label="What happens when you send a report">
            <li className="seq__card seq__card--chat">
              <div className="seq__head">
                <span className="seq__wa">
                  <Icon name="whatsapp" size={18} />
                </span>
                <b>WhatsApp</b>
              </div>
              <div className="seq__bubble">
                <span className="seq__file">
                  <Icon name="file" size={22} />
                </span>
                <span className="seq__meta">
                  <b>BloodTest.pdf</b>
                  <small>2.4 MB</small>
                </span>
              </div>
            </li>
            <li className="seq__arrow" aria-hidden="true">
              <Icon name="arrowDown" size={20} />
            </li>
            <li className="seq__card seq__card--proc">
              <span className="seq__dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <span>Processing your report...</span>
            </li>
            <li className="seq__arrow" aria-hidden="true">
              <Icon name="arrowDown" size={20} />
            </li>
            <li className="seq__card seq__card--done">
              <span className="seq__check">
                <Icon name="check" size={18} />
              </span>
              <span>Added to your health history.</span>
            </li>
          </ol>
        </Reveal>
      </div>
    </section>
  );
}
