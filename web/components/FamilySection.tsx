import { Icon } from './Icon';
import { Reveal } from './Reveal';

/**
 * Family Health is a placeholder screen in the app today, so it is shown as
 * "Coming soon" — not as a live feature.
 */
export function FamilySection() {
  return (
    <section id="family" className="section--tight family" aria-labelledby="family-title">
      <div className="container">
        <Reveal className="family__card tone-lavender">
          <div className="family__avatars" aria-hidden="true">
            <span>
              <Icon name="users" size={26} />
            </span>
          </div>
          <div className="family__copy">
            <p className="eyebrow">Family</p>
            <h2 id="family-title" className="h2">
              For you. And your family.
            </h2>
            <p className="lede">Keep track of your family&rsquo;s health history too — parents, children and dependents.</p>
          </div>
          <span className="btn btn--ghost family__soon" aria-disabled="true">
            Coming soon
          </span>
        </Reveal>
      </div>
    </section>
  );
}
