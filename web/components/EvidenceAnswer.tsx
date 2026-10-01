import { Icon } from './Icon';
import { ASK_SOURCES } from '@/lib/sample';

/** A question answered from the person's own records, with its sources (sample data). */
export function EvidenceAnswer() {
  return (
    <div className="chat" role="group" aria-label="Example answer with sources (sample data)">
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
  );
}
