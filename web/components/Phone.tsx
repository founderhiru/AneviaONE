import type { ReactNode } from 'react';

/**
 * Phone frame. Everything inside is sized in `em`, and the frame's font-size
 * is a container-query unit of its wrapper width — so a phone renders
 * identically at 200px or 420px wide with no JS and no transforms.
 */
export function Phone({ children, label, className = '' }: { children: ReactNode; label: string; className?: string }) {
  return (
    <div className={`phone-wrap ${className}`.trim()}>
      <div className="phone" role="img" aria-label={label}>
        <div className="phone__island" aria-hidden="true" />
        <div className="phone__screen" aria-hidden="true">
          <div className="statusbar">
            <span>9:41</span>
            <span className="statusbar__icons">
              <i />
              <i />
              <i className="statusbar__batt" />
            </span>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
