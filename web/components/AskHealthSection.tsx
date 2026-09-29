import { Icon } from './Icon';
import { Reveal } from './Reveal';
import { ASK_SOURCES } from '@/lib/sample';

const POINTS = [
  { icon: 'evidence', title: 'Grounded in your records', text: 'Every answer points back to the documents it came from.' },
  { icon: 'sparkle', title: 'Facts and explanations, kept apart', text: 'What your records say is shown separately from AI explanation.' },
  { icon: 'shield', title: 'Not a diagnosis', text: 'AneviaOne helps you understand your records. It does not diagnose.' },
] as const;

export function AskHealthSection() {
  return (
    <section id="ask" className="section ask" aria-labelledby="ask-title">
      <div className="container ask__grid">
        <Reveal className="ask__copy">
          <p className="eyebrow">Ask AneviaOne</p>
          <h2 id="ask-title" className="h2">
            Ask your <span className="accent">health history.</span>
          </h2>
          <p className="lede">
            Ask a question in plain language and get an answer drawn from your own records — with the evidence right there.
          </p>
          <ul className="ask__points">
            {POINTS.map((p) => (
              <li key={p.title}>
                <span className="icon-tile tone-teal">
                  <Icon name={p.icon} size={20} />
                </span>
                <span>
                  <b>{p.title}</b>
                  <span>{p.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal className="ask__chat" delay={120}>
          <div className="chat card" role="group" aria-label="Example conversation">
            <div className="chat__msg chat__msg--user">
              <span className="chat__who">You</span>
              <p>How has my cholesterol changed over the last five years?</p>
            </div>
            <div className="chat__msg chat__msg--ai">
              <span className="chat__who">
                <span className="badge badge--brand">From your records</span>
              </span>
              <p>
                Your LDL cholesterol has increased from <b>118 mg/dL in 2022</b> to <b>146 mg/dL in 2026</b>. The largest
                increase occurred between 2024 and 2026.
              </p>
              <div className="chat__sources">
                <p className="chat__sources-h">Sources</p>
                <ul>
                  {ASK_SOURCES.map((s) => (
                    <li key={s}>
                      <Icon name="file" size={16} />
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
          <p className="fine ask__note">
            Illustrative example with sample data. AneviaOne explains what your records show — it doesn&rsquo;t diagnose or
            replace advice from your doctor.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
