import { ChangeCard } from './ChangeCard';
import { Icon } from './Icon';
import { PatternCard } from './PatternCard';
import { Reveal } from './Reveal';
import { TrendCard } from './TrendCard';
import { BRAND } from '@/lib/config';

/** The visual anchor of the site: history becomes trends, changes and patterns. */
export function IntelligenceSection() {
  return (
    <section id="intelligence" className="section intel on-dark" aria-labelledby="intel-title">
      <div className="intel__bg" aria-hidden="true" />
      <div className="container">
        <Reveal className="section-head section-head--split">
          <p className="eyebrow">The AI intelligence</p>
          <h2 id="intel-title" className="h2">
            Your health history
            <br />
            <span className="accent">becomes intelligence.</span>
          </h2>
          <p className="lede">
            {BRAND.name} analyzes your records over time to identify meaningful trends, changes and patterns — so you can
            understand what is happening, not just what happened in one report.
          </p>
        </Reveal>

        <div className="intel__grid">
          <Reveal>
            <TrendCard />
          </Reveal>
          <Reveal>
            <ChangeCard />
          </Reveal>
          <Reveal>
            <PatternCard />
          </Reveal>
        </div>

        <Reveal className="intel__strip">
          <span className="intel__strip-a">
            <Icon name="file" size={18} /> A locker <b>stores</b> information.
          </span>
          <span className="intel__strip-arrow" aria-hidden="true">
            <Icon name="arrow" size={20} />
          </span>
          <span className="intel__strip-b">
            <Icon name="pulse" size={18} /> {BRAND.name} <b>analyzes</b> it over time.
          </span>
        </Reveal>
      </div>
    </section>
  );
}
