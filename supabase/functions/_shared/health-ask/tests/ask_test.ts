import { assertEquals } from '@std/assert';

import { MemorySource, OTHER, USER } from '../../health-memory/tests/fixtures.ts';
import { answerQuestion, NO_RECORDS_MESSAGE, UNSUPPORTED_MESSAGE, type AskDeps } from '../ask.ts';
import { classifyQuestion, NOT_ENOUGH_INFORMATION, SAFETY_MESSAGES } from '../classify.ts';
import { createAskHandler } from '../handler.ts';
import type { AskModel } from '../model.ts';
import type { Citable } from '../retrieve.ts';
import { validateAnswer } from '../validate-answer.ts';

class FakeModel implements AskModel {
  readonly provider = 'fake';
  readonly model = 'fake-model';
  answered: { question: string; items: Citable[] }[] = [];
  classified: string[] = [];
  constructor(
    public reply: (items: Citable[]) => unknown = (items) => ({ status: 'answered', sentences: [{ text: 'Your records list these items.', citations: [items[0].id] }] }),
    public route: unknown = { intent: 'unsupported', term: null },
  ) {}
  classify(question: string) {
    this.classified.push(question);
    return Promise.resolve(this.route);
  }
  answer(question: string, items: Citable[]) {
    this.answered.push({ question, items });
    return Promise.resolve(this.reply(items));
  }
}

const logs: Record<string, unknown>[] = [];
function deps(over: Partial<AskDeps> & { user?: string } = {}): AskDeps & { source: MemorySource } {
  const source = MemorySource.seeded(over.user ?? USER);
  return { source, hasAiConsent: () => Promise.resolve(true), model: new FakeModel(), log: { info: (f) => logs.push(f), error: (f) => logs.push(f) }, ...over } as AskDeps & { source: MemorySource };
}

Deno.test('classifier: V1 questions map to the minimum intent', () => {
  const intent = (q: string) => {
    const c = classifyQuestion(q);
    return c.kind === 'intent' ? c.intent : c.kind;
  };
  assertEquals(intent('What medications have I taken?'), { type: 'medications', term: null });
  assertEquals(intent('When was my last blood test?'), { type: 'last_test', term: null });
  assertEquals(intent('How has my HbA1c changed?'), { type: 'trend', term: 'HbA1c' });
  assertEquals(intent('What changed between my two latest reports?'), { type: 'changes' });
  assertEquals(intent('When was hypertension first recorded?'), { type: 'condition_first', term: 'hypertension' });
  assertEquals(intent('When was this condition first recorded?'), { type: 'condition_first', term: null });
  assertEquals(intent('Which allergies are recorded?'), { type: 'allergies' });
  assertEquals(intent('Show my recent health history.'), { type: 'history' });
  assertEquals(intent('Which reports mention Metformin?'), { type: 'medication_mentions', term: 'Metformin' });
  assertEquals(intent('Which vaccinations have I had?'), { type: 'vaccinations' });
  assertEquals(intent('What is the capital of France?'), 'unknown');
});

Deno.test('safety: diagnosis, treatment and emergencies get a fixed limitation — no records, no AI', async () => {
  for (const [q, reason] of [
    ['Do I have diabetes?', 'diagnosis'],
    ['Is my HbA1c normal?', 'diagnosis'],
    ['Should I stop taking Metformin?', 'treatment'],
    ['Can I increase my dose of Atorvastatin?', 'treatment'],
    ['How do I lower my cholesterol?', 'treatment'],
    ['I have chest pain, what do I do?', 'emergency'],
  ] as const) {
    const d = deps();
    const r = await answerQuestion(q, d);
    assertEquals([r.status, r.answer], ['safety', SAFETY_MESSAGES[reason]], q);
    assertEquals(d.source.queries.length, 0, q);
    assertEquals((d.model as FakeModel).answered.length + (d.model as FakeModel).classified.length, 0, q);
  }
});

Deno.test('retrieval is minimal: a medication question reads only medications', async () => {
  const d = deps({ model: null });
  const r = await answerQuestion('What medications have I taken?', d);
  assertEquals(d.source.queries.map((q) => q.view), ['current_medications']);
  assertEquals(r.status, 'answered');
  assertEquals(r.generatedBy, 'records');
  assertEquals(r.sentences.map((s) => s.text), [
    'Medications recorded in your reports:',
    'Metformin 500 mg — 10 Jun 2026 to 15 Sep 2026.',
    'Telmisartan 40 mg — 15 Sep 2026.',
    'Atorvastatin 10 mg — 10 Jun 2026.',
  ]);
  assertEquals(r.sources.map((s) => [s.documentName, s.pageNumber]).sort(), [
    ['Report B.pdf', 2], ['Report B.pdf', 2], ['Report C.pdf', 2], ['Report C.pdf', 2],
  ]);
});

Deno.test('trend question: deterministic trend, cited records, filtered retrieval', async () => {
  const d = deps({ model: null });
  const r = await answerQuestion('How has my HbA1c changed?', d);
  assertEquals(d.source.queries, [{ view: 'current_observations', nameContains: 'HbA1c' }]);
  assertEquals(r.answer, 'HbA1c: The recorded values went up and down between 5.8% and 6.1% across 3 measurements (12 Mar 2026 to 15 Sep 2026); the latest was 5.9%.');
  assertEquals(r.sources.length, 3);
});

Deno.test('timeline, last test, changes, first-recorded and source questions', async () => {
  const d = () => deps({ model: null });
  assertEquals((await answerQuestion('When was my last blood test?', d())).sentences[0].text.startsWith('Your most recent recorded test results are from 15 Sep 2026 (Report C.pdf): '), true);
  assertEquals((await answerQuestion('Show my recent health history', d())).sentences[1].text, '15 Sep 2026 — Report C.pdf: 3 test results · 2 medications · 1 allergy · 1 procedure.');
  const changes = await answerQuestion('What changed between my two latest reports?', d());
  assertEquals(changes.sentences[1].text, 'Recorded HbA1c decreased from 6.1% (10 Jun 2026) to 5.9% (15 Sep 2026).');
  assertEquals((await answerQuestion('When was hypertension first recorded?', d())).answer, 'Hypertension was first recorded on 10 Jun 2026 (recorded as diagnosed, Report B.pdf, page 2).');
  const mentions = await answerQuestion('Which reports mention Metformin?', d());
  assertEquals(mentions.sentences.map((s) => s.text), ['“Metformin” appears in 2 reports:', 'Report C.pdf (15 Sep 2026), page 2.', 'Report B.pdf (10 Jun 2026), page 2.']);
  assertEquals(mentions.sources.every((s) => s.excerpt === 'Metformin'), true);
});

Deno.test('model answer: used only when every citation maps to retrieved records', async () => {
  const good = deps({ model: new FakeModel((items) => ({ status: 'answered', sentences: [{ text: 'Your HbA1c was recorded three times; the latest was 5.9%.', citations: [items[0].id] }] })) });
  const r = await answerQuestion('How has my HbA1c changed?', good);
  assertEquals([r.generatedBy, r.answer], ['ai', 'Your HbA1c was recorded three times; the latest was 5.9%.']);
  // The model saw names/values/dates — not quotes or file names.
  const sent = (good.model as FakeModel).answered[0].items.map((i) => i.text).join('\n');
  assertEquals(sent.includes('Report C.pdf'), false);
  assertEquals(sent.includes('HbA1c 5.9 %'), false); // the verbatim quote fixture
});

Deno.test('hallucinated citation / invented value / medical judgement → rejected, record-built answer instead', async () => {
  for (const reply of [
    { status: 'answered', sentences: [{ text: 'Your HbA1c was 5.9%.', citations: ['R99'] }] },
    { status: 'answered', sentences: [{ text: 'Your HbA1c was 7.2%.', citations: ['T1'] }] },
    { status: 'answered', sentences: [{ text: 'Your HbA1c was 5.9% in July 2026.', citations: ['T1'] }] },
    { status: 'answered', sentences: [{ text: 'Your HbA1c is improving, which is good.', citations: ['T1'] }] },
    { status: 'answered', sentences: [{ text: 'You likely have diabetes.', citations: ['T1'] }] },
    { status: 'answered', sentences: [{ text: 'Your HbA1c was 5.9%.', citations: [] }] },
    { nonsense: true },
  ]) {
    const d = deps({ model: new FakeModel(() => reply) });
    const r = await answerQuestion('How has my HbA1c changed?', d);
    assertEquals(r.generatedBy, 'records', JSON.stringify(reply));
    assertEquals(r.answer.startsWith('HbA1c: The recorded values went up and down'), true);
  }
});

Deno.test('validator details', () => {
  const items: Citable[] = [{ id: 'R1', text: 'Test result: HbA1c 5.8% ; 12 Mar 2026; report dated 12 Mar 2026, page 1', recordIds: ['x'], sources: [] }];
  assertEquals(validateAnswer({ status: 'answered', sentences: [{ text: 'HbA1c was 5.8% on 12 March 2026 (R1).', citations: ['R1'] }] }, items).ok, true);
  assertEquals(validateAnswer({ status: 'answered', sentences: [{ text: 'HbA1c decreased.', citations: ['R1'] }] }, items).ok, true); // "decreased" is not a month
  assertEquals(validateAnswer({ status: 'insufficient', sentences: [] }, items), { ok: true, status: 'insufficient' });
});

Deno.test('no consent → no AI call, record-built answer; unknown question → unsupported', async () => {
  const d = deps({ hasAiConsent: () => Promise.resolve(false) });
  const r = await answerQuestion('Which allergies are recorded?', d);
  assertEquals([r.generatedBy, r.answer], ['records', 'Allergies recorded in your reports: Penicillin — 15 Sep 2026.']);
  assertEquals((d.model as FakeModel).answered.length, 0);
  const u = await answerQuestion('What is the capital of France?', d);
  assertEquals([u.status, u.answer], ['unsupported', UNSUPPORTED_MESSAGE]);
  assertEquals((d.model as FakeModel).classified.length, 0); // no consent: question not sent either
});

Deno.test('unknown question with consent: model routes it (question only), output validated', async () => {
  const d = deps({ model: new FakeModel(undefined, { intent: 'allergies', term: null }) });
  const r = await answerQuestion('Am I sensitive to anything per my files?', d);
  assertEquals(r.intent, 'allergies');
  const bad = deps({ model: new FakeModel(undefined, { intent: 'delete_everything', term: null }) });
  assertEquals((await answerQuestion('Something odd?', bad)).status, 'unsupported');
});

Deno.test('not recorded vs empty account', async () => {
  const r = await answerQuestion('How has my ferritin changed?', deps());
  assertEquals([r.status, r.answer], ['insufficient', NOT_ENOUGH_INFORMATION]);
  const empty = deps({ user: '33333333-3333-4333-8333-333333333333' });
  const e = await answerQuestion('What medications have I taken?', empty);
  assertEquals([e.status, e.answer], ['no_data', NO_RECORDS_MESSAGE]);
});

Deno.test('cross-user: another person’s records are never retrieved or cited', async () => {
  const mine = await answerQuestion('What medications have I taken?', deps({ model: null }));
  assertEquals(mine.answer.includes('Insulin'), false);
  const theirs = await answerQuestion('What medications have I taken?', deps({ model: null, user: OTHER }));
  assertEquals(theirs.answer.includes('Metformin'), false);
  assertEquals(theirs.answer.includes('Insulin'), true);
});

Deno.test('handler: auth, validation, no question text in logs', async () => {
  logs.length = 0;
  const handler = createAskHandler({
    authenticate: (jwt) => Promise.resolve(jwt === 'jwt' ? USER : null),
    sourceFor: () => MemorySource.seeded(USER),
    hasAiConsentFor: () => Promise.resolve(false),
    model: null,
    log: { info: (f) => logs.push(f), error: (f) => logs.push(f) },
  });
  const call = (body: unknown, token: string | null = 'jwt') =>
    handler(new Request('http://x', { method: 'POST', headers: token ? { authorization: `Bearer ${token}` } : {}, body: JSON.stringify(body) }));
  assertEquals((await call({ question: 'x' }, null)).status, 401);
  assertEquals((await call({})).status, 400);
  const res = await call({ question: 'Which reports mention Metformin? My name is Asha Verma' });
  assertEquals(res.status, 200);
  assertEquals(JSON.stringify(logs).includes('Metformin') || JSON.stringify(logs).includes('Asha'), false);
});
