/**
 * Doctor: a one-page summary built only from trusted records. No AI, no
 * medical thresholds — "outside range" is against the range printed on the
 * report itself. Held results are never included.
 */
import React from 'react';
import { Share } from 'react-native';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as Print from 'expo-print';

import DoctorScreen from '../app/(tabs)/doctor';
import { buildDoctorBrief } from '../services/doctor/doctorBrief';
import { doctorBriefHtml, esc } from '../services/doctor/briefHtml';
import { healthService } from '../services/health/healthService';
import { documentsService } from '../services/documents/documentsService';
import { profileService } from '../services/profile/profileService';
import type { RecordedObservation, StoredDocument } from '../types';
import { renderWithAuth } from './testUtils';

jest.mock('expo-print', () => ({ printToFileAsync: jest.fn(async () => ({ uri: 'file:///cache/brief.pdf', numberOfPages: 1 })) }));

const obs = (o: Partial<RecordedObservation> & { id: string; name: string }): RecordedObservation => ({
  value: '1', unit: null, referenceRange: null, date: '2026-01-15', needsReview: false, category: 'blood',
  source: { documentId: 'd1', documentName: 'scan_0042.pdf', pageNumber: 1 }, ...o,
});

const RESULTS: RecordedObservation[] = [
  obs({ id: 'hb', name: 'Haemoglobin', value: '10.8', unit: 'g/dL', referenceRange: '12.0 - 15.5', valueNumeric: 10.8, referenceLow: 12, referenceHigh: 15.5 }),
  obs({ id: 'plt', name: 'Platelets', value: '245', unit: '10^3/uL', referenceRange: '150 - 400', valueNumeric: 245, referenceLow: 150, referenceHigh: 400 }),
  obs({ id: 'a1c-old', name: 'HbA1c', value: '5.6', unit: '%', referenceRange: '4.0 - 5.6', valueNumeric: 5.6, referenceLow: 4, referenceHigh: 5.6, date: '2025-07-01', source: { documentId: 'd0', documentName: 'old.pdf', pageNumber: 1 } }),
  obs({ id: 'a1c', name: 'HbA1c', value: '5.9', unit: '%', referenceRange: '4.0 - 5.6', valueNumeric: 5.9, referenceLow: 4, referenceHigh: 5.6 }),
  // Held for checking: must never appear.
  obs({ id: 'held', name: 'Secret held result', value: '99', needsReview: true }),
];

const doc = (id: string, over: Partial<StoredDocument> = {}): StoredDocument => ({
  id, userId: 'u1', source: 'upload', documentType: 'unclassified', originalFilename: `${id}.pdf`, mimeType: 'application/pdf', fileSizeBytes: 1000,
  storagePath: `u1/${id}.pdf`, status: 'completed', processingError: null, uploadedAt: '2026-01-15T00:00:00Z', createdAt: '2026-01-15T00:00:00Z', updatedAt: '2026-01-15T00:00:00Z', ...over,
});

const person = { name: 'Asha Testwell', dateOfBirth: '1985-03-14' };

describe('buildDoctorBrief', () => {
  const brief = buildDoctorBrief({ person, results: RESULTS, documents: [doc('d1'), doc('d0'), doc('held', { heldForReviewCount: 2 })], medications: [], conditions: [], allergies: [], now: new Date('2026-02-01T00:00:00Z') });

  it('lists only results outside the range printed on their own report', () => {
    expect(brief.outsideRange.map((r) => r.id).sort()).toEqual(['a1c', 'hb']);
    expect(brief.outsideRange.find((r) => r.id === 'hb')).toMatchObject({ value: '10.8 g/dL', range: '12.0 - 15.5', position: 'below' });
  });

  it('never includes a result that is held for review, but says that some are held', () => {
    expect(JSON.stringify(brief)).not.toContain('Secret held result');
    expect(brief.resultCount).toBe(4);
    expect(brief.heldReports).toBe(1);
  });

  it('shows repeated tests as values by date, oldest first, with no verdict', () => {
    expect(brief.trends).toHaveLength(1);
    expect(brief.trends[0].name).toBe('HbA1c');
    expect(brief.trends[0].points.map((p) => p.value)).toEqual(['5.6', '5.9']);
  });

  it('keeps medications as listed, drops past ones, and leaves out family-history mentions', () => {
    const b = buildDoctorBrief({
      person, results: [], documents: [],
      medications: [{ id: 'm1', name: 'Telmisartan', dosage: '40 mg', frequency: 'Once daily', status: 'active' }, { id: 'm2', name: 'Old drug', status: 'past' }],
      conditions: [{ id: 'c1', name: 'Hypertension', status: 'active', assertion: 'diagnosed' }, { id: 'c2', name: 'Father: diabetes', status: 'unknown', assertion: 'mentioned' }],
      allergies: [{ id: 'al1', substance: 'Penicillin', reaction: 'rash' }],
    });
    expect(b.medications).toEqual(['Telmisartan · 40 mg · Once daily']);
    expect(b.conditions).toEqual(['Hypertension']);
    expect(b.allergies).toEqual(['Penicillin (rash)']);
  });
});

describe('PDF html', () => {
  it('escapes every piece of text that came from a report', () => {
    expect(esc('<script>alert("x")</script> & \'q\'')).toBe('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;q&#39;');
    const html = doctorBriefHtml(buildDoctorBrief({ person: { name: '<b>Evil</b>', dateOfBirth: null }, results: [obs({ id: 'x', name: '<img src=x onerror=1>', value: '1' })], documents: [], medications: [], conditions: [], allergies: [] }));
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<b>Evil');
    expect(html).toContain('&lt;img src=x onerror=1&gt;');
  });

  it('states what it is and that it is not a diagnosis', () => {
    const html = doctorBriefHtml(buildDoctorBrief({ person, results: RESULTS, documents: [], medications: [], conditions: [], allergies: [] }));
    expect(html).toContain('not a diagnosis');
    expect(html).toContain('Haemoglobin');
    expect(html).not.toContain('Secret held result');
  });
});

describe('Doctor screen', () => {
  beforeEach(() => {
    jest.spyOn(healthService, 'getRecordedObservations').mockResolvedValue(RESULTS);
    jest.spyOn(healthService, 'getMedications').mockResolvedValue([]);
    jest.spyOn(healthService, 'getConditions').mockResolvedValue([]);
    jest.spyOn(healthService, 'getAllergies').mockResolvedValue([]);
    jest.spyOn(documentsService, 'listDocuments').mockResolvedValue([doc('d1'), doc('d0')]);
    jest.spyOn(profileService, 'getMyIdentity').mockResolvedValue({ fullName: 'Asha Testwell', dateOfBirth: '1985-03-14' });
  });

  it('shows the person, what is outside the printed range, and never a held result', async () => {
    await renderWithAuth(<DoctorScreen />);
    await waitFor(() => expect(screen.getByTestId('doctor-brief')).toBeTruthy());
    expect(screen.getByTestId('doctor-person').props.children.join('')).toContain('Asha Testwell');
    expect(screen.getByTestId('doctor-outside-hb')).toBeTruthy();
    expect(screen.queryByTestId('doctor-outside-plt')).toBeNull(); // within its printed range
    expect(screen.queryByText(/Secret held result/)).toBeNull();
  });

  it('hand-over view enlarges the page, hides actions, and Done returns', async () => {
    await renderWithAuth(<DoctorScreen />);
    await waitFor(() => expect(screen.getByTestId('doctor-handover')).toBeTruthy());
    await act(async () => { fireEvent.press(screen.getByTestId('doctor-handover')); });
    expect(screen.queryByTestId('doctor-share-pdf')).toBeNull();
    await act(async () => { fireEvent.press(screen.getByTestId('doctor-handover-done')); });
    expect(screen.getByTestId('doctor-share-pdf')).toBeTruthy();
  });

  it('Share as PDF builds the file and opens the share sheet', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as never);
    await renderWithAuth(<DoctorScreen />);
    await waitFor(() => expect(screen.getByTestId('doctor-share-pdf')).toBeTruthy());
    await act(async () => { fireEvent.press(screen.getByTestId('doctor-share-pdf')); });
    await waitFor(() => expect(share).toHaveBeenCalledWith(expect.objectContaining({ url: 'file:///cache/brief.pdf' })));
    expect((Print.printToFileAsync as jest.Mock).mock.calls[0][0].html).toContain('Health summary');
  });

  it('a failed PDF says so and the page keeps working', async () => {
    (Print.printToFileAsync as jest.Mock).mockRejectedValueOnce(new Error('no'));
    await renderWithAuth(<DoctorScreen />);
    await waitFor(() => expect(screen.getByTestId('doctor-share-pdf')).toBeTruthy());
    await act(async () => { fireEvent.press(screen.getByTestId('doctor-share-pdf')); });
    await waitFor(() => expect(screen.getByTestId('doctor-share-error')).toBeTruthy());
  });

  it('with no records, offers to add a report instead of an empty summary', async () => {
    jest.spyOn(healthService, 'getRecordedObservations').mockResolvedValue([]);
    await renderWithAuth(<DoctorScreen />);
    await waitFor(() => expect(screen.getByText('Nothing to show a doctor yet.')).toBeTruthy());
  });

  it('lists all results only after See all, and the hand-over view shows them', async () => {
    await renderWithAuth(<DoctorScreen />);
    await waitFor(() => expect(screen.getByTestId('doctor-see-all')).toBeTruthy());
    expect(screen.queryByTestId('doctor-report-plt')).toBeNull();
    await act(async () => { fireEvent.press(screen.getByTestId('doctor-see-all')); });
    expect(screen.getByTestId('doctor-report-plt')).toBeTruthy();
    await act(async () => { fireEvent.press(screen.getByTestId('doctor-see-all')); });
    expect(screen.queryByTestId('doctor-report-plt')).toBeNull();
    await act(async () => { fireEvent.press(screen.getByTestId('doctor-handover')); });
    expect(screen.getByTestId('doctor-report-plt')).toBeTruthy();
  });

  it('shows a Review link when reports are held', async () => {
    jest.spyOn(documentsService, 'listDocuments').mockResolvedValue([doc('d1'), doc('held', { heldForReviewCount: 2 })]);
    await renderWithAuth(<DoctorScreen />);
    await waitFor(() => expect(screen.getByTestId('doctor-review-link')).toBeTruthy());
  });
});
