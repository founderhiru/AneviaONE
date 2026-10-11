import { Icon } from './Icon';
import { ASK_SOURCES } from '@/lib/sample';

/** A question answered from the person's own records, with its sources (sample data). */
export function EvidenceAnswer() {
  return (
    <div className="chat" role="group" aria-label="Example answer with sources (sample data)">
      <div className="chat__msg chat__msg--user">
        <span className="chat__who">You</span>
        <p>How has my cholesterol changed over time?</p>
      </div>
      <div className="chat__msg chat__msg--ai">
        <span className="chat__who">
          <span className="badge badge--brand">Sample answer</span>
        </span>
        <p>
          Your LDL cholesterol has increased from <b>112 mg/dL in 2019</b> to <b>146 mg/dL in 2026</b>. It rose to 131
          mg/dL by 2024, then by 15 mg/dL more over the next two years.
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
  );
}
