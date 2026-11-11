/**
 * "Coming up" rules: dates are calendar days, snoozed and finished reminders stay
 * hidden, wording is plain, and nothing here invents a due date.
 */
import {
  addDays,
  addMonths,
  cleanTitle,
  dateFromChoice,
  daysUntil,
  dueLabel,
  parseDay,
  shortDay,
  summarise,
  toIsoDay,
  visibleOpen,
  TITLE_MAX,
  type Obligation,
} from '../services/obligations/comingUp';

const TODAY = new Date(2026, 10, 11, 20, 30); // 11 Nov 2026, evening

function ob(id: string, dueOn: string, extra: Partial<Obligation> = {}): Obligation {
  return { id, subjectId: 's1', kind: 'renewal', title: `Reminder ${id}`, dueOn, source: 'user', state: 'open', snoozedUntil: null, sourcePage: null, ...extra };
}

describe('calendar days', () => {
  it('parses only real YYYY-MM-DD days', () => {
    expect(parseDay('2026-11-11')).not.toBeNull();
    expect(parseDay('2026-02-30')).toBeNull();
    expect(parseDay('2026-13-01')).toBeNull();
    expect(parseDay('11/11/2026')).toBeNull();
    expect(parseDay('')).toBeNull();
  });

  it('counts whole days regardless of the time of day', () => {
    expect(daysUntil('2026-11-11', TODAY)).toBe(0);
    expect(daysUntil('2026-11-12', new Date(2026, 10, 11, 0, 5))).toBe(1);
    expect(daysUntil('2026-11-12', new Date(2026, 10, 11, 23, 59))).toBe(1);
    expect(daysUntil('2026-11-09', TODAY)).toBe(-2);
    expect(daysUntil('not a day', TODAY)).toBeNaN();
  });

  it('adds days and months, clamping to the end of a short month', () => {
    expect(addDays(TODAY, 7)).toBe('2026-11-18');
    expect(addDays(new Date(2026, 11, 28), 7)).toBe('2027-01-04');
    expect(addMonths(TODAY, 1)).toBe('2026-12-11');
    expect(addMonths(new Date(2027, 0, 31), 1)).toBe('2027-02-28');
    expect(addMonths(new Date(2027, 11, 15), 3)).toBe('2028-03-15');
    expect(addMonths(TODAY, 12)).toBe('2027-11-11');
  });

  it('turns a quick choice into a date, and refuses an unknown choice', () => {
    expect(dateFromChoice('week', TODAY)).toBe('2026-11-18');
    expect(dateFromChoice('quarter', TODAY)).toBe('2027-02-11');
    expect(dateFromChoice('nope', TODAY)).toBeNull();
  });

  it('formats a day for people', () => {
    expect(shortDay('2026-11-11')).toBe('11 Nov 2026');
    expect(toIsoDay(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('plain wording', () => {
  it.each([
    ['2026-11-09', 'Overdue by 2 days'],
    ['2026-11-10', 'Overdue by 1 day'],
    ['2026-11-11', 'Today'],
    ['2026-11-12', 'Tomorrow'],
    ['2026-11-16', 'In 5 days'],
    ['2026-11-25', 'In 14 days'],
    ['2026-11-30', 'In 3 weeks'],
    ['2027-03-01', 'On 1 Mar 2027'],
  ])('%s → %s', (day, label) => {
    expect(dueLabel(day, TODAY)).toBe(label);
  });
});

describe('what shows today', () => {
  it('shows open reminders soonest first and hides finished, dismissed and proposed ones', () => {
    const list = [
      ob('later', '2027-01-01'),
      ob('soon', '2026-11-14'),
      ob('done', '2026-11-12', { state: 'done' }),
      ob('gone', '2026-11-12', { state: 'dismissed' }),
      ob('proposed', '2026-11-12', { state: 'proposed', source: 'extracted' }),
      ob('late', '2026-11-01'),
    ];
    expect(visibleOpen(list, TODAY).map((o) => o.id)).toEqual(['late', 'soon', 'later']);
  });

  it('hides a snoozed reminder until its snooze day, then shows it again', () => {
    const list = [ob('a', '2026-11-12', { snoozedUntil: '2026-11-18' })];
    expect(visibleOpen(list, TODAY)).toHaveLength(0);
    expect(visibleOpen(list, new Date(2026, 10, 18))).toHaveLength(1);
    expect(visibleOpen(list, new Date(2026, 10, 19))).toHaveLength(1);
  });

  it('ignores a reminder whose date cannot be read instead of crashing', () => {
    expect(visibleOpen([ob('bad', 'soon-ish')], TODAY)).toEqual([]);
  });

  it('breaks ties by title so the order never jumps', () => {
    const list = [ob('b', '2026-11-20', { title: 'B' }), ob('a', '2026-11-20', { title: 'A' })];
    expect(visibleOpen(list, TODAY).map((o) => o.title)).toEqual(['A', 'B']);
  });

  it('summarises overdue, due within 30 days, and the total', () => {
    const list = [ob('1', '2026-11-01'), ob('2', '2026-11-11'), ob('3', '2026-12-11'), ob('4', '2026-12-12'), ob('5', '2026-11-20', { snoozedUntil: '2027-01-01' })];
    expect(summarise(list, TODAY)).toEqual({ overdue: 1, soon: 2, total: 4 });
  });
});

describe('titles', () => {
  it('trims and collapses spaces, and refuses empty or over-long titles', () => {
    expect(cleanTitle('  Renew   health   insurance ')).toBe('Renew health insurance');
    expect(cleanTitle('   ')).toBeNull();
    expect(cleanTitle('x'.repeat(TITLE_MAX))).not.toBeNull();
    expect(cleanTitle('x'.repeat(TITLE_MAX + 1))).toBeNull();
  });
});
