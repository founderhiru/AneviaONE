import { Icon, type IconName } from './Icon';
import { Reveal } from './Reveal';

const STEPS: { n: string; title: string; text: string; icon: IconName; tone: string }[] = [
  { n: '01', title: 'Capture', text: 'Upload a report, scan a document or send through WhatsApp.', icon: 'upload', tone: 'blue' },
  { n: '02', title: 'Understand', text: 'AneviaOne extracts relevant information and organizes it.', icon: 'scan', tone: 'teal' },
  { n: '03', title: 'Remember', text: 'Your information becomes part of your longitudinal health history.', icon: 'layers', tone: 'lavender' },
  { n: '04', title: 'Compare', text: 'See meaningful changes, trends and patterns across months and years.', icon: 'compare', tone: 'mint' },
  { n: '05', title: 'Ask', text: 'Ask questions about your health history and get evidence-based answers.', icon: 'chat', tone: 'cream' },
];

export function HowItWorks() {
  return (
    <section id="how" className="section how" aria-labelledby="how-title">
      <div className="container">
        <Reveal className="section-head section-head--center">
          <p className="eyebrow">How AneviaOne works</p>
          <h2 id="how-title" className="h2">
            From records to understanding.
          </h2>
        </Reveal>

        <ol className="flow">
          {STEPS.map((s, i) => (
            <Reveal as="li" key={s.n} delay={i * 90} className={`flow__step tone-${s.tone}`}>
              <span className="flow__marker">
                <Icon name={s.icon} size={26} />
              </span>
              <span className="flow__connector" aria-hidden="true">
                <Icon name="arrow" size={14} />
              </span>
              <div className="flow__body">
                <span className="flow__num">{s.n}</span>
                <h3 className="flow__title">{s.title}</h3>
                <p className="flow__text">{s.text}</p>
              </div>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}
