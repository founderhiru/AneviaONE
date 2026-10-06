/**
 * SYNTHETIC fixtures. Every name, date and number below is invented; none is
 * derived from a real person or a real report.
 */
import type { RawExtraction } from '../../../supabase/functions/_shared/schema.ts';
import type { PageText } from '../../../supabase/functions/_shared/types.ts';

export const SYNTH_PROFILE = { fullName: 'Asha Synthetic', dateOfBirth: '1985-04-12' };

export type Fixture = { id: string; pages: PageText[]; hba1c: string; ldl: string; date: string; lines: string[] };

export function labReport(opts: {
  id: string; date: string; hba1c: string; ldl: string; name?: string; dob?: string; dateLabel?: string;
}): Fixture {
  const name = opts.name ?? 'Asha Synthetic';
  const dob = opts.dob ?? '12 Apr 1985';
  const lines = [
    `HbA1c ${opts.hba1c} % 4.0 - 5.6`,
    `LDL Cholesterol ${opts.ldl} mg/dL < 100`,
  ];
  const text = [
    'SYNTHETIC DIAGNOSTICS LAB — TEST DATA ONLY',
    `Patient: ${name}`,
    `DOB: ${dob}`,
    `Collection date: ${opts.dateLabel ?? opts.date}`,
    'Test Result Unit Reference',
    ...lines,
  ].join('\n');
  return { id: opts.id, pages: [{ pageNumber: 1, text }], hba1c: opts.hba1c, ldl: opts.ldl, date: opts.date, lines };
}

export const REPORT_A = labReport({ id: 'A', date: '2026-01-15', dateLabel: '15 Jan 2026', hba1c: '5.8', ldl: '120' });
export const REPORT_B = labReport({ id: 'B', date: '2026-04-15', dateLabel: '15 Apr 2026', hba1c: '6.1', ldl: '135' });
export const REPORT_C = labReport({ id: 'C', date: '2026-07-15', dateLabel: '15 Jul 2026', hba1c: '5.9', ldl: '128' });
export const REPORT_WRONG_PATIENT = labReport({
  id: 'W', date: '2026-01-15', dateLabel: '15 Jan 2026', hba1c: '5.8', ldl: '120', name: 'Ravi Notyou', dob: '03 Nov 1971',
});

/** What a well-behaved extractor would return for a lab fixture. */
export function goodExtraction(f: Fixture, patient = { name: 'Asha Synthetic', dob: '12 Apr 1985' }, collection?: string): RawExtraction {
  const [hba1cLine, ldlLine] = f.lines;
  return {
    document: {
      title: 'SYNTHETIC DIAGNOSTICS LAB', document_type: 'blood_test', report_date_as_written: null,
      collection_date_as_written: collection ?? f.pages[0].text.match(/Collection date: (.*)/)![1],
      provider_name: null, patient_name_as_written: patient.name, patient_dob_as_written: patient.dob,
    },
    encounters: [],
    observations: [
      {
        page_number: 1, source_text: hba1cLine, confidence: 0.95, name_as_written: 'HbA1c', value_as_written: f.hba1c,
        unit_as_written: '%', reference_range_as_written: '4.0 - 5.6', abnormal_flag_as_written: null, date_as_written: null,
        specimen: null, category: 'laboratory', encounter_key: null,
      },
      {
        page_number: 1, source_text: ldlLine, confidence: 0.93, name_as_written: 'LDL Cholesterol', value_as_written: f.ldl,
        unit_as_written: 'mg/dL', reference_range_as_written: '< 100', abnormal_flag_as_written: null, date_as_written: null,
        specimen: null, category: 'laboratory', encounter_key: null,
      },
    ],
    medications: [], conditions: [], allergies: [], procedures: [],
  };
}

/** Image-only PDF: pages exist, but there is no text layer. */
export const SCANNED_PAGES: PageText[] = [
  { pageNumber: 1, text: '' },
  { pageNumber: 2, text: ' \n ' },
];

export const MISSING_VALUE_PAGES: PageText[] = [
  { pageNumber: 1, text: 'Patient: Asha Synthetic\nCollection date: 15 Jan 2026\nHbA1c  — %  4.0 - 5.6\n' },
];
