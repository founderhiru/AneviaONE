import { displayName, reportKind, reportName, reportNames } from '../services/documents/reportName';
import type { RecordedObservation } from '../types';

const obs = (o: Partial<RecordedObservation> & { id: string }): RecordedObservation => ({
  name: 'Haemoglobin', value: '13', unit: null, referenceRange: null, date: '2026-01-15', needsReview: false,
  category: 'blood', source: { documentId: 'd1', documentName: 'scan_0042.pdf', pageNumber: 1 }, ...o,
});

describe('report names', () => {
  it('names a blood report with its date', () => {
    expect(reportName([obs({ id: 'a' }), obs({ id: 'b', date: '2026-01-10' })])).toBe('Blood test · 15 Jan 2026');
  });
  it('uses the imaging modality when the result names it', () => {
    expect(reportKind([obs({ id: 'a', category: 'imaging', name: 'Chest X-ray' })])).toBe('X-ray');
    expect(reportKind([obs({ id: 'a', category: 'imaging', name: 'Impression' })])).toBe('Imaging report');
  });
  it('calls mixed lab results a lab report, and unrelated mixes a health report', () => {
    expect(reportKind([obs({ id: 'a' }), obs({ id: 'b', category: 'urine' })])).toBe('Lab report');
    expect(reportKind([obs({ id: 'a' }), obs({ id: 'b', category: 'imaging' })])).toBe('Health report');
  });
  it('never guesses: unknown category falls back to the file name', () => {
    const results = [obs({ id: 'a', category: null })];
    expect(reportName(results)).toBeNull();
    expect(displayName({ id: 'd1', originalFilename: 'scan_0042.pdf' }, reportNames(results))).toBe('scan_0042.pdf');
  });
  it('omits the date when none was clear', () => {
    expect(reportName([obs({ id: 'a', date: null })])).toBe('Blood test');
  });

  it('names the scan, not just "Imaging report": echo from its findings, ultrasound/X-ray from the file name', () => {
    const echo = ['Aortic Valve', 'Tricuspid Valve', 'Impression'].map((name, n) => obs({ id: `e${n}`, category: 'imaging', name, value: 'NORMAL' }));
    expect(reportKind(echo)).toBe('Echocardiogram'); // a generic "Impression" does not turn it into a mixed report
    expect(reportName(echo)).toBe('Echocardiogram · 15 Jan 2026');
    const usg = ['Liver', 'Impression'].map((name, n) => obs({ id: `u${n}`, category: 'imaging', name, source: { documentId: 'd2', documentName: 'Abdominal Ultrasound.pdf', pageNumber: 1 } }));
    expect(reportKind(usg)).toBe('Ultrasound');
    const xr = [obs({ id: 'x', category: 'imaging', name: 'Lung Fields', source: { documentId: 'd3', documentName: 'Chest X-ray Report.pdf', pageNumber: 1 } })];
    expect(reportKind(xr)).toBe('X-ray');
    expect(reportKind([obs({ id: 'g', category: 'imaging', name: 'Impression' })])).toBe('Imaging report'); // nothing says which
  });
  it('names an ECG from its measurements, and a bone-density scan from its file name', () => {
    expect(reportKind([obs({ id: 'q', category: 'other', name: 'QRS', value: '90', unit: 'ms' })])).toBe('ECG');
    expect(reportKind([obs({ id: 'b', category: 'imaging', name: 'Hip T-score', source: { documentId: 'd4', documentName: 'Bone Density (DEXA) Report.pdf', pageNumber: 1 } })])).toBe('Bone density scan');
    expect(reportKind([obs({ id: 'o', category: 'other', name: 'Something else' })])).toBeNull();
  });
});
