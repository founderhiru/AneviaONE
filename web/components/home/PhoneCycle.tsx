import { DashboardScreen, DoctorScreen, TimelineScreen, TrendsScreen } from '../PhoneScreens';
import { MotionGate } from '../MotionGate';

const SCREENS = [
  { id: 'home', label: 'Home', Screen: DashboardScreen },
  { id: 'timeline', label: 'Timeline', Screen: TimelineScreen },
  { id: 'health', label: 'Health', Screen: TrendsScreen },
  { id: 'doctor', label: 'For Doctor', Screen: DoctorScreen },
] as const;

/**
 * The hero phone, showing the app's four main screens in turn (sample data).
 * Pure CSS crossfade, 5 seconds each; the first screen is what everyone sees
 * with reduced motion on. Styles: `.cycle` in motion.css.
 */
export function PhoneCycle() {
  return (
    <MotionGate className="cycle">
      <div className="cycle__stack">
        {SCREENS.map(({ id, Screen }, i) => (
          <div key={id} className={`cycle__layer cycle__layer--${i}`}>
            <Screen />
          </div>
        ))}
      </div>
    </MotionGate>
  );
}

/** Progress dots shown under the phone (outside its frame); same 20-second clock as the screens. */
export function PhoneCycleDots() {
  return (
    <MotionGate className="cycle__dotsgate">
      <ol className="cycle__dots" aria-hidden="true">
        {SCREENS.map(({ id, label }, i) => (
          <li key={id} className={`cycle__dot cycle__dot--${i}`}>
            <span>{label}</span>
          </li>
        ))}
      </ol>
    </MotionGate>
  );
}
