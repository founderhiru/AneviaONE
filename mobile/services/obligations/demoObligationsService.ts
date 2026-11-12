/**
 * DEMO MODE ONLY. Loaded exclusively through services/demo/demoServices.ts, so
 * production builds never bundle these fictional reminders. Everything lives in
 * memory and resets when the app restarts.
 */
import { addDays, type Obligation } from './comingUp';
import type { NewObligation, ObligationsService } from './obligationsService';

const DEMO_SUBJECT = 'demo-person';
let counter = 0;
const nextId = () => `demo-obligation-${(counter += 1)}`;

function seed(): Obligation[] {
  const today = new Date();
  const make = (kind: Obligation['kind'], title: string, days: number): Obligation => ({
    id: nextId(),
    subjectId: DEMO_SUBJECT,
    kind,
    title,
    dueOn: addDays(today, days),
    source: 'user',
    state: 'open',
    snoozedUntil: null,
    sourcePage: null,
  });
  return [
    make('followup', 'Repeat thyroid test', -2),
    make('refill', 'Blood pressure medicine refill', 4),
    make('renewal', 'Renew family health insurance', 12),
    make('followup', 'Follow-up visit with Doctor', 26),
  ];
}

let items: Obligation[] = seed();

export const demoObligationsService: ObligationsService = {
  list: async () => items.filter((o) => o.state === 'open'),
  add: async (input: NewObligation) => {
    const created: Obligation = {
      id: nextId(),
      subjectId: input.subjectId,
      kind: input.kind,
      title: input.title,
      dueOn: input.dueOn,
      source: 'user',
      state: 'open',
      snoozedUntil: null,
      sourcePage: null,
    };
    items = [...items, created];
    return created;
  },
  markDone: async (id) => {
    items = items.map((o) => (o.id === id ? { ...o, state: 'done' } : o));
  },
  snooze: async (id, until) => {
    items = items.map((o) => (o.id === id ? { ...o, snoozedUntil: until } : o));
  },
  dismiss: async (id) => {
    items = items.map((o) => (o.id === id ? { ...o, state: 'dismissed' } : o));
  },
};

/** Test helper: back to the starting reminders. */
export function resetDemoObligations() {
  items = seed();
}

