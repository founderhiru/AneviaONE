/**
 * Phase 2 · M1 — inspecting and correcting a result.
 *
 *  - checkCorrection: the on-screen checks mirror the server's rules, and
 *    only changed fields are sent;
 *  - productionFactService: reads evidence and history through RLS, corrects
 *    only through public.correct_fact, confirms only a current result, maps
 *    refusals to plain language and never shows raw database messages;
 *  - the Result screen: shows the source, says plainly what saving does before
 *    it happens, refuses invalid input, and offers no actions on a replaced
 *    version;
 *  - the report page links each result to it, and shows the saved
 *    correction after it is made (F3);
 *  - the screen only reports what the saved state shows: a stale refusal
 *    reloads (F1); a lost response is checked before another attempt (F2);
 *    a result held because its report isn't confirmed as the person's can't
 *    be confirmed or corrected (F4).
 *
 * Database-level integrity (ownership, supersession, fingerprints, reread)
 * is tested for real in supabase/tests/fact_corrections_test.sql.
 */
import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';

import FactScreen from '../app/facts/[id]';
import DocumentViewerScreen from '../app/documents/[id]';
import { documentsService } from '../services/documents/documentsService';
import { checkCorrection, correctionMatches, draftFrom, type CorrectableResult } from '../services/health/factCorrection';
import { factService, isStaleRefusal, OutcomeUnknownError, productionFactService, type FactDetail } from '../services/health/factService';
import { onHealthMemoryChanged } from '../services/health/healthMemoryApi';
import { healthService } from '../services/health/healthService';
import { ServiceError } from '../services/serviceError';
import { getSupabaseClient } from '../services/supabaseClient';
import { createFakeSupabase, documentRow } from '../test-support/fakeSupabase';
import { renderWithAuth } from './testUtils';

jest.mock('../services/supabaseClient', () => ({ getSupabaseClient: jest.fn(() => null), isSupabaseConfigured: false }));

const TODAY = new Date(2026, 9, 12);
const HBA1C: CorrectableResult = { name: 'HbA1c', value: '5.8', unit: '%', referenceRange: '4.0-5.6', date: '2026-03-12' };

beforeEach(() => {
  jest.restoreAllMocks();
  (router.push as jest.Mock).mockClear();
  (router.replace as jest.Mock).mockClear();
  (useLocalSearchParams as jest.Mock).mockReturnValue({ id: 'f1' });
});

// ------------------------------------------------------------ checks ------

describe('checkCorrection — mirrors the server, sends only what changed', () => {
  it('a changed value is the only field sent; the reason is optional and trimmed', () => {
    const draft = { ...draftFrom(HBA1C), value: ' 6.8 ', reason: '  misread ' };
    expect(checkCorrection(HBA1C, draft, TODAY)).toEqual({ ok: true, fields: { value: '6.8' }, reason: 'misread' });
    expect(checkCorrection(HBA1C, { ...draftFrom(HBA1C), value: '6.8' }, TODAY)).toEqual({ ok: true, fields: { value: '6.8' }, reason: null });
  });

  it('clearing unit, range or date means "not on the report" (sent as null)', () => {
    const draft = { ...draftFrom(HBA1C), unit: ' ', referenceRange: '', day: '', month: '', year: '' };
    expect(checkCorrection(HBA1C, draft, TODAY)).toEqual({
      ok: true,
      fields: { unit: null, reference_range: null, effective_date: null },
      reason: null,
    });
  });

  it('a full date is sent as YYYY-MM-DD', () => {
    const draft = { ...draftFrom(HBA1C), day: '7', month: '3', year: '2026' };
    expect(checkCorrection(HBA1C, draft, TODAY)).toEqual({ ok: true, fields: { effective_date: '2026-03-07' }, reason: null });
  });

  it.each([
    ['an empty test name', { name: '  ' }, 'name'],
    ['an empty value', { value: '' }, 'value'],
    ['an over-long value', { value: '9'.repeat(301) }, 'value'],
    ['an over-long reason', { value: '6.8', reason: 'x'.repeat(501) }, 'reason'],
    ['control characters', { name: 'Hb\u0007' }, 'name'],
    ['a partial date', { day: '12', month: '', year: '2026' }, 'date'],
    ['an impossible date', { day: '30', month: '2', year: '2026' }, 'date'],
    ['a two-digit year', { day: '1', month: '2', year: '26' }, 'date'],
    ['a future date', { day: '1', month: '1', year: '2027' }, 'date'],
  ])('%s is refused with a message on that field', (_label, change, field) => {
    const check = checkCorrection(HBA1C, { ...draftFrom(HBA1C), ...change }, TODAY);
    expect(check.ok).toBe(false);
    expect(!check.ok && check.errors[field as keyof typeof check.errors]).toEqual(expect.any(String));
  });

  it('nothing changed is refused, so no empty correction is ever saved', () => {
    const check = checkCorrection(HBA1C, { ...draftFrom(HBA1C), reason: 'just checking' }, TODAY);
    expect(check).toEqual({ ok: false, errors: {}, summary: expect.stringMatching(/Nothing has changed/) });
  });
});

describe('correctionMatches — evidence that a lost save went through', () => {
  it('true only when the saved version holds exactly what was sent', () => {
    expect(correctionMatches({ ...HBA1C, value: '6.8' }, { value: '6.8' })).toBe(true);
    expect(correctionMatches({ ...HBA1C, value: '6.9' }, { value: '6.8' })).toBe(false);
    expect(correctionMatches({ ...HBA1C, unit: null, date: null }, { unit: null, effective_date: null })).toBe(true);
    expect(correctionMatches({ ...HBA1C, unit: '%' }, { unit: null })).toBe(false);
  });
});

// ------------------------------------------------------------ service -----

const row = (over: Record<string, unknown> = {}) => ({
  id: 'f1',
  name_as_written: 'HbA1c',
  value_as_written: '5.8',
  unit_as_written: '%',
  reference_range_as_written: '4.0-5.6',
  effective_date: '2026-03-12',
  origin: 'extracted',
  review_status: 'unreviewed',
  confidence_gate: 'passed',
  confidence: '0.950',
  source_text: 'HbA1c 5.8 % (4.0-5.6)',
  document_id: 'd1',
  document_page_id: 'p1',
  supersedes_id: null,
  superseded_at: null,
  correction_reason: null,
  created_at: '2026-10-01T10:00:00Z',
  ...over,
});

function fakeWithRpc(rpcResponse: { data: unknown; error: unknown }) {
  const fake = createFakeSupabase();
  const rpc = jest.fn(async () => rpcResponse);
  (getSupabaseClient as jest.Mock).mockReturnValue({ ...fake, rpc, from: fake.from.bind(fake) });
  return { fake, rpc };
}

describe('productionFactService', () => {
  it('reads a result with its report, page, quote and stored confidence', async () => {
    const fake = createFakeSupabase();
    (getSupabaseClient as jest.Mock).mockReturnValue(fake);
    fake.respond('select', { data: row(), error: null });
    fake.respond('select', { data: { id: 'd1', original_filename: 'Sunrise lab.pdf' }, error: null });
    fake.respond('select', { data: { page_number: 2 }, error: null });
    const fact = await productionFactService.getFact('f1');
    expect(fact).toMatchObject({
      id: 'f1', value: '5.8', confidence: 0.95, heldForReview: false, trusted: true, sourceText: 'HbA1c 5.8 % (4.0-5.6)',
      document: { id: 'd1', name: 'Sunrise lab.pdf' }, pageNumber: 2, correctedById: null, history: [],
    });
    expect(fake.calls.map((c) => c.table)).toEqual(['observations', 'documents', 'document_pages']);
  });

  it('follows a correction back to every earlier version, newest first', async () => {
    const fake = createFakeSupabase();
    (getSupabaseClient as jest.Mock).mockReturnValue(fake);
    fake.respond('select', { data: row({ id: 'c2', value_as_written: '6.9', origin: 'user_corrected', review_status: 'confirmed', confidence: null, supersedes_id: 'c1', correction_reason: 'typo' }), error: null });
    fake.respond('select', { data: row({ id: 'c1', value_as_written: '6.8', origin: 'user_corrected', confidence: null, supersedes_id: 'f1', superseded_at: '2026-10-02T00:00:00Z' }), error: null });
    fake.respond('select', { data: row({ superseded_at: '2026-10-01T12:00:00Z' }), error: null });
    const fact = await productionFactService.getFact('c2');
    expect(fact?.confidence).toBeNull();
    expect(fact?.correctionReason).toBe('typo');
    expect(fact?.history.map((v) => [v.id, v.value, v.origin])).toEqual([
      ['c1', '6.8', 'user_corrected'],
      ['f1', '5.8', 'extracted'],
    ]);
  });

  it('a held result is not trusted; a replaced version points to its correction', async () => {
    let fake = createFakeSupabase();
    (getSupabaseClient as jest.Mock).mockReturnValue(fake);
    fake.respond('select', { data: row({ confidence_gate: 'needs_review', confidence: '0.6' }), error: null });
    expect(await productionFactService.getFact('f1')).toMatchObject({ heldForReview: true, trusted: false });

    fake = createFakeSupabase();
    (getSupabaseClient as jest.Mock).mockReturnValue(fake);
    fake.respond('select', { data: row({ superseded_at: '2026-10-02T00:00:00Z' }), error: null });
    fake.respond('select', { data: { id: 'c1' }, error: null });
    expect(await productionFactService.getFact('f1')).toMatchObject({ trusted: false, correctedById: 'c1' });
  });

  it('another person’s (or a missing) result reads as not found', async () => {
    const fake = createFakeSupabase();
    (getSupabaseClient as jest.Mock).mockReturnValue(fake);
    fake.respond('select', { data: null, error: null });
    expect(await productionFactService.getFact('someone-elses')).toBeNull();
  });

  it('corrects only through correct_fact, then refreshes Health Memory', async () => {
    const { rpc } = fakeWithRpc({ data: 'c1', error: null });
    const changed = jest.fn();
    const unsubscribe = onHealthMemoryChanged(changed);
    await expect(productionFactService.correct('f1', { value: '6.8' }, 'misread')).resolves.toBe('c1');
    expect(rpc).toHaveBeenCalledWith('correct_fact', { p_table: 'observations', p_fact_id: 'f1', p_fields: { value: '6.8' }, p_reason: 'misread' });
    expect(changed).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('a refusal from the server is shown in plain language; unknown errors never leak database text', async () => {
    fakeWithRpc({ data: null, error: { message: 'correct_fact: the date is not valid', code: '22023' } });
    await expect(productionFactService.correct('f1', { effective_date: '2999-01-01' }, null)).rejects.toMatchObject({
      code: 'invalid_input',
      userMessage: 'Check the date: it must be a real date, not in the future.',
    });
    fakeWithRpc({ data: null, error: { message: 'correct_fact: that report has not been confirmed as yours', code: '22023' } });
    await expect(productionFactService.correct('f1', { value: '6.8' }, null)).rejects.toMatchObject({
      code: 'invalid_input',
      userMessage: 'This report hasn’t been confirmed as yours, so its results can’t be corrected yet.',
    });
    fakeWithRpc({ data: null, error: { message: 'duplicate key value violates unique constraint "observations_fingerprint_live_idx"', code: '23505' } });
    const error = await productionFactService.correct('f1', { value: '6.8' }, null).catch((e: ServiceError) => e);
    expect(error).toBeInstanceOf(ServiceError);
    expect((error as ServiceError).userMessage).not.toMatch(/duplicate|constraint|observations/);
  });

  it('F1: "already corrected" (and other changed-elsewhere refusals) are stale, so the screen reloads', async () => {
    fakeWithRpc({ data: null, error: { message: 'correct_fact: that result has already been corrected — correct the newer version instead', code: '22023' } });
    const stale = await productionFactService.correct('f1', { value: '6.8' }, null).catch((e) => e);
    expect(stale).toMatchObject({ code: 'not_available', userMessage: 'This result has already been corrected. The latest version is shown below.' });
    expect(isStaleRefusal(stale)).toBe(true);
    fakeWithRpc({ data: null, error: { message: 'correct_fact: that report is being deleted', code: '22023' } });
    expect(isStaleRefusal(await productionFactService.correct('f1', { value: '6.8' }, null).catch((e) => e))).toBe(true);
    fakeWithRpc({ data: null, error: { message: 'correct_fact: the value is required', code: '22023' } });
    expect(isStaleRefusal(await productionFactService.correct('f1', { value: '' }, null).catch((e) => e))).toBe(false);
  });

  it('F2: a dropped connection, or success with no new id, is an unknown outcome — not a failure, and no refresh', async () => {
    const changed = jest.fn();
    const unsubscribe = onHealthMemoryChanged(changed);
    fakeWithRpc({ data: null, error: { message: 'TypeError: Network request failed' } });
    await expect(productionFactService.correct('f1', { value: '6.8' }, null)).rejects.toBeInstanceOf(OutcomeUnknownError);
    fakeWithRpc({ data: null, error: null });
    await expect(productionFactService.correct('f1', { value: '6.8' }, null)).rejects.toBeInstanceOf(OutcomeUnknownError);
    expect(changed).not.toHaveBeenCalled();
    unsubscribe();

    const fake = createFakeSupabase();
    (getSupabaseClient as jest.Mock).mockReturnValue(fake);
    fake.respond('update', { data: null, error: { message: 'Failed to fetch' } });
    await expect(productionFactService.confirm('f1')).rejects.toBeInstanceOf(OutcomeUnknownError);
  });

  it('F4: a held result from a report not matched to the person is marked identity-unconfirmed', async () => {
    for (const [identity, held, expected] of [
      ['unverifiable', true, true],
      ['no_identifiers', true, true],
      ['consistent', true, false],
      ['unverifiable', false, false],
    ] as const) {
      const fake = createFakeSupabase();
      (getSupabaseClient as jest.Mock).mockReturnValue(fake);
      fake.respond('select', { data: row(held ? { confidence_gate: 'needs_review' } : {}), error: null });
      fake.respond('select', { data: { id: 'd1', original_filename: 'r.pdf', identity_check: identity }, error: null });
      fake.respond('select', { data: { page_number: 1 }, error: null });
      expect((await productionFactService.getFact('f1'))?.identityUnconfirmed).toBe(expected);
    }
  });

  it('confirming updates only the review status of the current version', async () => {
    const fake = createFakeSupabase();
    (getSupabaseClient as jest.Mock).mockReturnValue(fake);
    fake.respond('update', { data: [{ id: 'f1' }], error: null });
    await productionFactService.confirm('f1');
    expect(fake.calls[0]).toMatchObject({
      table: 'observations', op: 'update', payload: { review_status: 'confirmed' },
      filters: [['eq', 'id', 'f1'], ['is', 'superseded_at', null]],
    });

    fake.respond('update', { data: [], error: null }); // superseded meanwhile
    await expect(productionFactService.confirm('f1')).rejects.toMatchObject({ code: 'not_found' });

    // The database refuses to confirm a result whose report isn't confirmed as the person's.
    fake.respond('update', { data: null, error: { message: 'observations: this report has not been confirmed as yours', code: '22023' } });
    await expect(productionFactService.confirm('f1')).rejects.toMatchObject({
      code: 'invalid_input',
      userMessage: 'This report hasn’t been confirmed as yours, so its results can’t be confirmed yet.',
    });
  });
});

// ------------------------------------------------------------- screen ------

const detail = (over: Partial<FactDetail> = {}): FactDetail => ({
  id: 'f1', name: 'HbA1c', value: '5.8', unit: '%', referenceRange: '4.0-5.6', date: '2026-03-12',
  origin: 'extracted', reviewStatus: 'unreviewed', recordedAt: '2026-10-01T10:00:00Z', correctionReason: null, supersededAt: null,
  confidence: 0.95, heldForReview: false, identityUnconfirmed: false, trusted: true, sourceText: 'HbA1c 5.8 % (4.0-5.6)',
  document: { id: 'd1', name: 'Sunrise lab.pdf' }, pageNumber: 2, correctedById: null, history: [],
  ...over,
});

async function openFact(fact: FactDetail | null) {
  jest.spyOn(factService, 'getFact').mockResolvedValue(fact);
  await renderWithAuth(<FactScreen />);
  await waitFor(() => expect(screen.queryByText('Loading result…')).toBeNull());
}

describe('Result screen', () => {
  it('shows where the result comes from: report, page, the text on the page, and how confidently it was read', async () => {
    await openFact(detail());
    const evidence = screen.getByTestId('fact-evidence');
    expect(within(evidence).getByText('Sunrise lab.pdf')).toBeTruthy();
    expect(within(evidence).getByText('Page 2')).toBeTruthy();
    expect(screen.getByTestId('fact-quote')).toHaveTextContent('“HbA1c 5.8 % (4.0-5.6)”');
    expect(screen.getByTestId('fact-confidence')).toHaveTextContent(/95% — how sure the reader was .* not a medical measure/);
    expect(within(screen.getByTestId('fact-status')).getByText('In your Health Memory')).toBeTruthy();
    await act(async () => {
      fireEvent.press(within(evidence).getByText('Sunrise lab.pdf'));
    });
    expect(router.push).toHaveBeenCalledWith('/documents/d1');
  });

  it('a reading with no stored confidence says so — nothing is estimated', async () => {
    await openFact(detail({ confidence: null }));
    expect(screen.getByTestId('fact-confidence')).toHaveTextContent('Reading confidence: not available.');
  });

  it('correcting: the form says what saving does before it happens, and saves only the change', async () => {
    const correct = jest.spyOn(factService, 'correct').mockResolvedValue('c1');
    await openFact(detail());
    await act(async () => {
      fireEvent.press(screen.getByTestId('fact-correct'));
    });
    expect(screen.getByTestId('correct-trust-notice')).toHaveTextContent(
      /your corrected version replaces this result in your Health Memory as a result you have checked\. The original reading stays in this result’s history, and your report itself is not changed\./,
    );
    expect(screen.getByTestId('correct-value').props.value).toBe('5.8');
    await fireEvent.changeText(screen.getByTestId('correct-value'), '6.8');
    await fireEvent.changeText(screen.getByTestId('correct-reason'), 'Misread');
    await act(async () => {
      fireEvent.press(screen.getByTestId('correct-save'));
    });
    expect(correct).toHaveBeenCalledWith('f1', { value: '6.8' }, 'Misread');
    expect(router.replace).toHaveBeenCalledWith({ pathname: '/facts/[id]', params: { id: 'c1', saved: 'corrected' } });
  });

  it('invalid input is explained on the field and nothing is sent', async () => {
    const correct = jest.spyOn(factService, 'correct');
    await openFact(detail());
    await act(async () => {
      fireEvent.press(screen.getByTestId('fact-correct'));
    });
    await fireEvent.changeText(screen.getByTestId('correct-value'), '  ');
    await fireEvent.changeText(screen.getByTestId('correct-day'), '31');
    await fireEvent.changeText(screen.getByTestId('correct-month'), '2');
    await act(async () => {
      fireEvent.press(screen.getByTestId('correct-save'));
    });
    expect(screen.getByText('Enter the value as printed on the report.')).toBeTruthy();
    expect(screen.getByTestId('correct-date-error')).toHaveTextContent('That date doesn’t exist.');
    expect(correct).not.toHaveBeenCalled();
  });

  it('a refusal from the server is shown and the form stays open', async () => {
    jest.spyOn(factService, 'correct').mockRejectedValue(new ServiceError('invalid_input', 'This report is being deleted, so its results can’t be changed.'));
    await openFact(detail());
    await act(async () => {
      fireEvent.press(screen.getByTestId('fact-correct'));
    });
    await fireEvent.changeText(screen.getByTestId('correct-value'), '6.8');
    await act(async () => {
      fireEvent.press(screen.getByTestId('correct-save'));
    });
    expect(screen.getByTestId('correct-summary')).toHaveTextContent('This report is being deleted, so its results can’t be changed.');
    expect(screen.getByTestId('fact-correction-form')).toBeTruthy();
    expect(router.replace).not.toHaveBeenCalled();
  });

  async function submitValue(value: string) {
    await act(async () => {
      fireEvent.press(screen.getByTestId('fact-correct'));
    });
    await fireEvent.changeText(screen.getByTestId('correct-value'), value);
    await act(async () => {
      fireEvent.press(screen.getByTestId('correct-save'));
    });
  }

  it('F1: changed elsewhere → the form closes, the saved state is reloaded, and the latest version is linked', async () => {
    const getFact = jest.spyOn(factService, 'getFact')
      .mockResolvedValueOnce(detail())
      .mockResolvedValueOnce(detail({ supersededAt: '2026-10-12T09:00:00Z', trusted: false, correctedById: 'c9' }));
    jest.spyOn(factService, 'correct').mockRejectedValue(new ServiceError('not_available', 'This result has already been corrected. The latest version is shown below.'));
    await renderWithAuth(<FactScreen />);
    await screen.findByTestId('fact-correct');
    await submitValue('6.8');
    await waitFor(() => expect(within(screen.getByTestId('fact-status')).getByText('Replaced by a correction')).toBeTruthy());
    expect(getFact).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId('fact-correction-form')).toBeNull();
    expect(screen.queryByText('In your Health Memory')).toBeNull();
    expect(screen.getByTestId('fact-notice')).toHaveTextContent('This result has already been corrected. The latest version is shown below.');
    expect(screen.getByLabelText('Open the latest version')).toBeTruthy();
  });

  it('F2: lost response, and the saved newer version matches what was sent → shown as saved (with evidence)', async () => {
    const getFact = jest.spyOn(factService, 'getFact')
      .mockResolvedValueOnce(detail())
      .mockResolvedValueOnce(detail({ supersededAt: '2026-10-12T09:00:00Z', trusted: false, correctedById: 'c1' }))
      .mockResolvedValueOnce(detail({ id: 'c1', value: '6.8', origin: 'user_corrected', reviewStatus: 'confirmed', confidence: null }));
    const correct = jest.spyOn(factService, 'correct').mockRejectedValue(new OutcomeUnknownError());
    await renderWithAuth(<FactScreen />);
    await screen.findByTestId('fact-correct');
    await submitValue('6.8');
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith({ pathname: '/facts/[id]', params: { id: 'c1', saved: 'corrected' } }));
    expect(getFact).toHaveBeenNthCalledWith(3, 'c1');
    expect(correct).toHaveBeenCalledTimes(1); // never retried on its own
  });

  it('F2: lost response, and a newer version that does not match → not claimed as saved; the saved state is shown', async () => {
    jest.spyOn(factService, 'getFact')
      .mockResolvedValueOnce(detail())
      .mockResolvedValueOnce(detail({ supersededAt: '2026-10-12T09:00:00Z', trusted: false, correctedById: 'c1' }))
      .mockResolvedValueOnce(detail({ id: 'c1', value: '7.4', origin: 'user_corrected', reviewStatus: 'confirmed' }))
      .mockResolvedValue(detail({ supersededAt: '2026-10-12T09:00:00Z', trusted: false, correctedById: 'c1' }));
    jest.spyOn(factService, 'correct').mockRejectedValue(new OutcomeUnknownError());
    await renderWithAuth(<FactScreen />);
    await screen.findByTestId('fact-correct');
    await submitValue('6.8');
    await waitFor(() => expect(screen.getByTestId('fact-notice')).toHaveTextContent(/newer saved version that isn’t the same as what you entered/));
    expect(router.replace).not.toHaveBeenCalled();
    expect(within(screen.getByTestId('fact-status')).getByText('Replaced by a correction')).toBeTruthy();
  });

  it('F2: lost response, original still current → "wasn’t saved", and the person may try again (no automatic retry)', async () => {
    jest.spyOn(factService, 'getFact').mockResolvedValue(detail());
    const correct = jest.spyOn(factService, 'correct').mockRejectedValue(new OutcomeUnknownError());
    await renderWithAuth(<FactScreen />);
    await screen.findByTestId('fact-correct');
    await submitValue('6.8');
    await waitFor(() => expect(screen.getByTestId('correct-summary')).toHaveTextContent('Your correction wasn’t saved. You can try again.'));
    expect(correct).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('correct-save')).toBeTruthy();
  });

  it('F2: lost response and the check also fails → no claim either way; saving is blocked until "Check again" succeeds', async () => {
    const getFact = jest.spyOn(factService, 'getFact')
      .mockResolvedValueOnce(detail())
      .mockRejectedValueOnce(new ServiceError('network', 'offline'))
      .mockResolvedValue(detail());
    const correct = jest.spyOn(factService, 'correct').mockRejectedValue(new OutcomeUnknownError());
    await renderWithAuth(<FactScreen />);
    await screen.findByTestId('fact-correct');
    await submitValue('6.8');
    await waitFor(() => expect(screen.getByTestId('correct-summary')).toHaveTextContent(/couldn’t check whether your correction was saved/));
    expect(screen.queryByTestId('correct-save')).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByTestId('correct-check'));
    });
    await waitFor(() => expect(screen.getByTestId('correct-summary')).toHaveTextContent('Your correction wasn’t saved. You can try again.'));
    expect(getFact).toHaveBeenCalledTimes(3);
    expect(correct).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('correct-save')).toBeTruthy();
  });

  it('F2: confirming with a lost response checks the saved state before saying "confirmed"', async () => {
    jest.spyOn(factService, 'getFact')
      .mockResolvedValueOnce(detail({ heldForReview: true, trusted: false }))
      .mockResolvedValue(detail({ reviewStatus: 'confirmed' }));
    jest.spyOn(factService, 'confirm').mockRejectedValue(new OutcomeUnknownError());
    const alert = jest.spyOn(Alert, 'alert');
    await renderWithAuth(<FactScreen />);
    await act(async () => {
      fireEvent.press(await screen.findByTestId('fact-confirm'));
    });
    const buttons = alert.mock.calls[0][2] as { text: string; onPress?: () => Promise<void> }[];
    await act(async () => {
      await buttons.find((b) => b.text === 'Confirm')!.onPress!();
    });
    await waitFor(() => expect(screen.getByTestId('fact-notice')).toHaveTextContent('Confirmed. This result is now in your Health Memory.'));
  });

  it('F4: a result held because its report is not confirmed as yours explains why and offers no confirm or correct', async () => {
    await openFact(detail({ heldForReview: true, identityUnconfirmed: true, trusted: false }));
    expect(screen.getByTestId('fact-identity-held')).toHaveTextContent(/isn’t confirmed as yours yet/);
    expect(screen.getByTestId('fact-identity-held')).toHaveTextContent(/can’t be confirmed or corrected here, because that would treat the report as yours/);
    expect(screen.queryByTestId('fact-confirm')).toBeNull();
    expect(screen.queryByTestId('fact-correct')).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByTestId('fact-identity-add'));
    });
    expect(router.push).toHaveBeenCalledWith('/profile/identity');
  });

  it('a held result can be confirmed as read, after a confirmation step', async () => {
    const confirm = jest.spyOn(factService, 'confirm').mockResolvedValue();
    const alert = jest.spyOn(Alert, 'alert');
    await openFact(detail({ heldForReview: true, trusted: false, confidence: 0.6 }));
    expect(within(screen.getByTestId('fact-status')).getByText('Not yet checked')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByTestId('fact-confirm'));
    });
    expect(confirm).not.toHaveBeenCalled();
    const buttons = alert.mock.calls[0][2] as { text: string; onPress?: () => Promise<void> }[];
    await act(async () => {
      await buttons.find((b) => b.text === 'Confirm')!.onPress!();
    });
    expect(confirm).toHaveBeenCalledWith('f1');
  });

  it('a trusted result offers correction but no confirm button', async () => {
    await openFact(detail());
    expect(screen.queryByTestId('fact-confirm')).toBeNull();
    expect(screen.getByTestId('fact-correct')).toBeTruthy();
  });

  it('a replaced version offers no actions, points to the latest, and keeps its history', async () => {
    await openFact(
      detail({
        supersededAt: '2026-10-02T00:00:00Z', trusted: false, correctedById: 'c2',
        history: [{ id: 'f0', name: 'HbA1c', value: '5.6', unit: '%', referenceRange: null, date: '2026-03-12', origin: 'extracted', reviewStatus: 'unreviewed', recordedAt: '2026-09-01T00:00:00Z', correctionReason: null, supersededAt: '2026-10-01T00:00:00Z' }],
      }),
    );
    expect(within(screen.getByTestId('fact-status')).getByText('Replaced by a correction')).toBeTruthy();
    expect(screen.queryByTestId('fact-actions')).toBeNull();
    expect(within(screen.getByTestId('fact-history')).getByText('5.6 % · HbA1c')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Open the latest version'));
    });
    expect(router.replace).toHaveBeenCalledWith('/facts/c2');
  });

  it('a correction shows who made it and why, and that confidence does not apply', async () => {
    await openFact(detail({ origin: 'user_corrected', reviewStatus: 'confirmed', confidence: null, correctionReason: 'Misread', recordedAt: '2026-10-05T09:00:00Z' }));
    expect(screen.getByText('Corrected by you on 05 Oct 2026.')).toBeTruthy();
    expect(screen.getByText('Your reason: Misread')).toBeTruthy();
    expect(screen.getByTestId('fact-confidence')).toHaveTextContent(/not applicable — you entered this value/);
  });

  it('a result that is not found (or another person’s) shows not found and offers nothing', async () => {
    await openFact(null);
    expect(screen.getByText('Result not found.')).toBeTruthy();
    expect(screen.queryByTestId('fact-correct')).toBeNull();
  });
});

// ------------------------------------------------------- report page -------

describe('Report page → result', () => {
  it('each result opens its details; a corrected one is labelled', async () => {
    const DOC = '22222222-2222-4222-8222-222222222222';
    (useLocalSearchParams as jest.Mock).mockReturnValue({ id: DOC });
    jest.spyOn(documentsService, 'getDocument').mockResolvedValue({ ...documentRowAsStored(DOC) });
    jest.spyOn(healthService, 'getDocumentObservations').mockResolvedValue([
      { id: 'o1', name: 'HbA1c', value: '6.8', unit: '%', referenceRange: null, date: '2026-03-12', needsReview: false, corrected: true, source: { documentId: DOC, documentName: 'r.pdf', pageNumber: 1 } },
      { id: 'o2', name: 'LDL', value: '120', unit: 'mg/dL', referenceRange: null, date: '2026-03-12', needsReview: true, source: { documentId: DOC, documentName: 'r.pdf', pageNumber: 1 } },
    ]);
    await renderWithAuth(<DocumentViewerScreen />);
    const results = await screen.findByTestId('document-results');
    expect(within(results).getByText('Corrected by you')).toBeTruthy();
    expect(within(results).getByText('Not yet checked')).toBeTruthy();
    await act(async () => {
      fireEvent.press(within(results).getByLabelText('HbA1c, 6.8 %. Open details'));
    });
    expect(router.push).toHaveBeenCalledWith('/facts/o1');
  });
});

describe('Report page refresh (F3)', () => {
  it('after a successful correction, the report page reloads and shows the saved, corrected result', async () => {
    const DOC = '33333333-3333-4333-8333-333333333333';
    (useLocalSearchParams as jest.Mock).mockReturnValue({ id: DOC });
    jest.spyOn(documentsService, 'getDocument').mockResolvedValue(documentRowAsStored(DOC));
    const source = { documentId: DOC, documentName: 'r.pdf', pageNumber: 1 };
    const observations = jest.spyOn(healthService, 'getDocumentObservations')
      .mockResolvedValueOnce([{ id: 'o1', name: 'HbA1c', value: '5.8', unit: '%', referenceRange: null, date: '2026-03-12', needsReview: false, source }])
      .mockResolvedValue([{ id: 'c1', name: 'HbA1c', value: '6.8', unit: '%', referenceRange: null, date: '2026-03-12', needsReview: false, corrected: true, source }]);
    await renderWithAuth(<DocumentViewerScreen />);
    const before = await screen.findByTestId('document-results');
    expect(within(before).getByText('5.8 %')).toBeTruthy();

    // The real save path: correct_fact succeeds, then Health Memory is refreshed.
    fakeWithRpc({ data: 'c1', error: null });
    await act(async () => {
      await productionFactService.correct('o1', { value: '6.8' }, null);
    });

    await waitFor(() => expect(within(screen.getByTestId('document-results')).getByText('6.8 %')).toBeTruthy());
    expect(within(screen.getByTestId('document-results')).queryByText('5.8 %')).toBeNull();
    expect(within(screen.getByTestId('document-results')).getByText('Corrected by you')).toBeTruthy();
    expect(observations.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});

function documentRowAsStored(id: string) {
  const r = documentRow({ id, status: 'completed' }) as Record<string, unknown>;
  return {
    id,
    userId: r.user_id as string,
    source: 'upload' as const,
    documentType: 'blood_test' as const,
    originalFilename: 'r.pdf',
    mimeType: 'application/pdf' as const,
    fileSizeBytes: 1000,
    storagePath: 'u/r.pdf',
    status: 'completed' as const,
    processingError: null,
    healthInfoCount: 2,
    heldForReviewCount: 1,
    uploadedAt: '2026-10-01T00:00:00Z',
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
  };
}
