import { Icon } from './Icon';
import { RESULT_SOURCES } from '@/lib/sample';

/** A result shown with the reports it came from (sample data). */
export function EvidenceAnswer() {
  return (
    <div className="chat" role="group" aria-label="Example result with its source reports (sample data)">
      <div className="chat__msg chat__msg--user">
        <span className="chat__who">Result</span>
        <p>LDL Cholesterol</p>
      </div>
      <div className="chat__msg chat__msg--ai">
        <span className="chat__who">
          <span className="badge badge--brand">Sample data</span>
        </span>
        <p>
          <b>112 mg/dL in 2019</b>, <b>131 mg/dL in 2024</b>, <b>146 mg/dL in 2026</b>. Each value links to the report
          it was read from.
        </p>
        <div className="chat__sources">
          <p className="chat__sources-h">Sources</p>
          <ul>
            {RESULT_SOURCES.map((s) => (
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
