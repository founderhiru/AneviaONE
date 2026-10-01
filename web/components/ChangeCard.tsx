import { Icon } from './Icon';
import { CHANGES } from '@/lib/sample';
import { BRAND } from '@/lib/config';

/** "Spot what changed": current information compared with past history. */
export function ChangeCard() {
  return (
    <article className="icard icard--change">
      <p className="icard__kicker">Spot what changed</p>
      <p className="icard__text">{BRAND.name} compares your current information with your past history.</p>

      <ul className="changes">
        {CHANGES.map((c) => (
          <li key={c.metric} className="change">
            <div className="change__main">
              <span className="change__metric">{c.metric}</span>
              <span className="change__range">{c.range}</span>
              <span className="change__vals">
                {c.from} <Icon name="arrow" size={12} /> {c.to}
              </span>
            </div>
            <span className={`change__delta change__delta--${c.tone}`}>
              <span aria-hidden="true">{c.direction === 'up' ? '▲' : '▼'}</span>
              <span>
                {c.verb} <b>{c.amount}</b>
              </span>
            </span>
          </li>
        ))}
      </ul>
      <p className="icard__note">Sample data for illustration.</p>
    </article>
  );
}
