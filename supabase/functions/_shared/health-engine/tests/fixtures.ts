/**
 * Synthetic test reports — NO real patient data. The identity "Asha Verma"
 * and every value below are fictional.
 *
 * buildTextPdf() writes a minimal, valid PDF with a real text layer (one
 * Helvetica text object per line), so text extraction is tested against an
 * actual PDF parser, not a stub. buildImageOnlyPdf() writes a page that is
 * only an image (no text) — a stand-in for a scanned report.
 */

const enc = new TextEncoder();

function pdfString(line: string): string {
  return '(' + line.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)') + ')';
}

function assemble(objects: string[]): Uint8Array {
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(enc.encode(out).length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = enc.encode(out).length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) out += `${String(off).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return enc.encode(out);
}

/** A text-layer PDF: one array of lines per page. */
export function buildTextPdf(pages: string[][]): Uint8Array {
  const objects: string[] = [];
  const pageIds: number[] = [];
  objects.push(''); // 1: catalog (filled below)
  objects.push(''); // 2: pages
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'); // 3: font
  for (const lines of pages) {
    const stream = 'BT /F1 11 Tf 14 TL 50 760 Td ' + lines.map((l) => `${pdfString(l)} Tj T*`).join(' ') + ' ET';
    objects.push(`<< /Length ${enc.encode(stream).length} >>\nstream\n${stream}\nendstream`);
    const contentId = objects.length;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`);
    pageIds.push(objects.length);
  }
  objects[0] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
  return assemble(objects);
}

/** A page containing only an image — no text layer (like a scanned report). */
export function buildImageOnlyPdf(): Uint8Array {
  const pixels = 'FF00'.repeat(32); // 8×8 grey checker, hex-encoded
  const image = `<< /Type /XObject /Subtype /Image /Width 8 /Height 8 /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /ASCIIHexDecode /Length ${pixels.length + 1} >>\nstream\n${pixels}>\nendstream`;
  const draw = 'q 500 0 0 700 50 50 cm /Im1 Do Q';
  return assemble([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [4 0 R] /Count 1 >>',
    image,
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /Im1 3 0 R >> >> /Contents 5 0 R >>',
    `<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`,
  ]);
}

/**
 * A scanned-style report: the lines are RASTERISED into a page image (a
 * 5×7 bitmap font, upper-case), so the PDF has no text layer at all — like
 * a phone photo or scan of a printed report — yet a person (or a vision
 * model) can read it. Synthetic content only.
 */
const GLYPHS: Record<string, string> = {
  'A': '.###. #...# #...# ##### #...# #...# #...#',
  'B': '####. #...# #...# ####. #...# #...# ####.',
  'C': '.###. #...# #.... #.... #.... #...# .###.',
  'D': '####. #...# #...# #...# #...# #...# ####.',
  'E': '##### #.... #.... ####. #.... #.... #####',
  'F': '##### #.... #.... ####. #.... #.... #....',
  'G': '.###. #...# #.... #.### #...# #...# .####',
  'H': '#...# #...# #...# ##### #...# #...# #...#',
  'I': '.###. ..#.. ..#.. ..#.. ..#.. ..#.. .###.',
  'J': '..### ...#. ...#. ...#. ...#. #..#. .##..',
  'K': '#...# #..#. #.#.. ##... #.#.. #..#. #...#',
  'L': '#.... #.... #.... #.... #.... #.... #####',
  'M': '#...# ##.## #.#.# #.#.# #...# #...# #...#',
  'N': '#...# #...# ##..# #.#.# #..## #...# #...#',
  'O': '.###. #...# #...# #...# #...# #...# .###.',
  'P': '####. #...# #...# ####. #.... #.... #....',
  'Q': '.###. #...# #...# #...# #.#.# #..#. .##.#',
  'R': '####. #...# #...# ####. #.#.. #..#. #...#',
  'S': '.#### #.... #.... .###. ....# ....# ####.',
  'T': '##### ..#.. ..#.. ..#.. ..#.. ..#.. ..#..',
  'U': '#...# #...# #...# #...# #...# #...# .###.',
  'V': '#...# #...# #...# #...# #...# .#.#. ..#..',
  'W': '#...# #...# #...# #.#.# #.#.# #.#.# .#.#.',
  'X': '#...# #...# .#.#. ..#.. .#.#. #...# #...#',
  'Y': '#...# #...# .#.#. ..#.. ..#.. ..#.. ..#..',
  'Z': '##### ....# ...#. ..#.. .#... #.... #####',
  '0': '.###. #...# #..## #.#.# ##..# #...# .###.',
  '1': '..#.. .##.. ..#.. ..#.. ..#.. ..#.. .###.',
  '2': '.###. #...# ....# ...#. ..#.. .#... #####',
  '3': '####. ....# ....# .###. ....# ....# ####.',
  '4': '...#. ..##. .#.#. #..#. ##### ...#. ...#.',
  '5': '##### #.... ####. ....# ....# #...# .###.',
  '6': '..##. .#... #.... ####. #...# #...# .###.',
  '7': '##### ....# ...#. ..#.. .#... .#... .#...',
  '8': '.###. #...# #...# .###. #...# #...# .###.',
  '9': '.###. #...# #...# .#### ....# ...#. .##..',
  ':': '..... ..#.. ..#.. ..... ..#.. ..#.. .....',
  '/': '....# ....# ...#. ..#.. .#... #.... #....',
  '-': '..... ..... ..... ##### ..... ..... .....',
  '.': '..... ..... ..... ..... ..... .##.. .##..',
  '%': '##..# ##..# ...#. ..#.. .#... #..## #..##',
  '<': '...#. ..#.. .#... #.... .#... ..#.. ...#.',
  ' ': '..... ..... ..... ..... ..... ..... .....',
};

export const SCANNED_REPORT_LINES = [
  'SUNRISE DIAGNOSTICS - LABORATORY REPORT',
  'PATIENT: ASHA VERMA   DOB: 14/08/1985',
  'REPORT DATE: 20/09/2026',
  'HBA1C 6.4 % 4.0 - 5.6',
  'LDL CHOLESTEROL 141 MG/DL < 100',
];

export function buildScannedTextPdf(lines: string[] = SCANNED_REPORT_LINES): Uint8Array {
  const scale = 4;
  const advance = 6 * scale;
  const lineHeight = 11 * scale;
  const margin = 10 * scale;
  const width = margin * 2 + Math.max(...lines.map((l) => l.length)) * advance;
  const height = margin * 2 + lines.length * lineHeight;
  const pixels = new Uint8Array(width * height).fill(0xff);
  lines.forEach((line, row) => {
    [...line.toUpperCase()].forEach((ch, col) => {
      const glyph = (GLYPHS[ch] ?? GLYPHS[' ']).split(' ');
      glyph.forEach((bits, gy) => {
        [...bits].forEach((bit, gx) => {
          if (bit !== '#') return;
          for (let dy = 0; dy < scale; dy += 1) {
            for (let dx = 0; dx < scale; dx += 1) {
              const x = margin + col * advance + gx * scale + dx;
              const y = margin + row * lineHeight + gy * scale + dy;
              pixels[y * width + x] = 0x00;
            }
          }
        });
      });
    });
  });
  const hex = Array.from(pixels, (b) => (b === 0 ? '00' : 'FF')).join('') + '>';
  const image = `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /ASCIIHexDecode /Length ${hex.length} >>\nstream\n${hex}\nendstream`;
  const drawW = 560;
  const drawH = Math.round((drawW * height) / width);
  const draw = `q ${drawW} 0 0 ${drawH} 26 ${792 - 40 - drawH} cm /Im1 Do Q`;
  return assemble([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [4 0 R] /Count 1 >>',
    image,
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /Im1 3 0 R >> >> /Contents 5 0 R >>',
    `<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`,
  ]);
}

export const MALFORMED_PDF = enc.encode('%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 9 0 R >>\n%%EOF-truncated');
export const NOT_A_PDF = enc.encode('<html>not a pdf</html>');

// ------------------------------------------------------- synthetic reports ---

export const SYNTHETIC_PATIENT = { name: 'Asha Verma', dateOfBirth: '1985-08-14', dobAsWritten: '14/08/1985' };

function labReport(opts: { date: string; hba1c: string; ldl: string; name?: string; dob?: string }): string[][] {
  return [[
    'Sunrise Diagnostics - Laboratory Report',
    `Patient: ${opts.name ?? SYNTHETIC_PATIENT.name}   DOB: ${opts.dob ?? SYNTHETIC_PATIENT.dobAsWritten}`,
    `Report Date: ${opts.date}`,
    'Test   Result   Unit   Reference Range',
    `HbA1c ${opts.hba1c} % 4.0 - 5.6`,
    `LDL Cholesterol ${opts.ldl} mg/dL < 100`,
  ]];
}

export const REPORT_A = labReport({ date: '12/03/2026', hba1c: '5.8', ldl: '120' });
export const REPORT_B = labReport({ date: '10/06/2026', hba1c: '6.1', ldl: '135' });
export const REPORT_C = labReport({ date: '15/09/2026', hba1c: '5.9', ldl: '128' });
/** HbA1c row printed without a value. */
export const REPORT_MISSING_VALUE = [[
  'Sunrise Diagnostics - Laboratory Report',
  `Patient: ${SYNTHETIC_PATIENT.name}   DOB: ${SYNTHETIC_PATIENT.dobAsWritten}`,
  'Report Date: 12/03/2026',
  'HbA1c  % 4.0 - 5.6',
  'LDL Cholesterol 120 mg/dL < 100',
]];
/** LDL printed with a decimal comma that could also be a thousands separator. */
export const REPORT_AMBIGUOUS_VALUE = [[
  'Sunrise Diagnostics - Laboratory Report',
  `Patient: ${SYNTHETIC_PATIENT.name}   DOB: ${SYNTHETIC_PATIENT.dobAsWritten}`,
  'Report Date: 12/03/2026',
  'HbA1c 5.8 % 4.0 - 5.6',
  'LDL Cholesterol 1,20 mg/dL < 100',
]];
/** Same layout, someone else's name and date of birth. */
export const REPORT_WRONG_PATIENT = labReport({ date: '12/03/2026', hba1c: '5.8', ldl: '120', name: 'Rahul Mehta', dob: '01/01/1970' });

/**
 * A scripted stand-in for the model: reads the synthetic report's lines and
 * returns the structured JSON an honest model would. It quotes real lines,
 * so the deterministic validator is exercised against real evidence.
 */
export function honestExtraction(pages: { page_number: number; text: string }[]) {
  const result = {
    patient_name: null as null | { value: string; page: number; source_text: string },
    patient_date_of_birth: null as null | { value: string; page: number; source_text: string },
    report_date: null as null | { value: string; page: number; source_text: string },
    observations: [] as Record<string, unknown>[],
    medications: [],
    conditions: [],
    allergies: [],
    procedures: [],
    encounters: [],
  };
  for (const page of pages) {
    const text = page.text.replace(/\s+/g, ' ');
    const patient = /Patient: ([A-Za-z]+ [A-Za-z]+)/.exec(text);
    if (patient) result.patient_name = { value: patient[1], page: page.page_number, source_text: `Patient: ${patient[1]}` };
    const dob = /DOB: (\d{2}\/\d{2}\/\d{4})/.exec(text);
    if (dob) result.patient_date_of_birth = { value: dob[1], page: page.page_number, source_text: `DOB: ${dob[1]}` };
    const date = /Report Date: (\d{2}\/\d{2}\/\d{4})/.exec(text);
    if (date) result.report_date = { value: date[1], page: page.page_number, source_text: `Report Date: ${date[1]}` };
    const hba1c = /HbA1c ([\d.,]+) % (4\.0 - 5\.6)/.exec(text);
    if (hba1c) {
      result.observations.push({
        test_name: 'HbA1c', raw_value: hba1c[1], raw_unit: '%', reference_range: hba1c[2], observation_date: null,
        category: 'laboratory', page: page.page_number, source_text: `HbA1c ${hba1c[1]} % 4.0 - 5.6`, confidence: 0.97,
      });
    }
    const ldl = /LDL Cholesterol ([\d.,]+) mg\/dL (< 100)/.exec(text);
    if (ldl) {
      result.observations.push({
        test_name: 'LDL Cholesterol', raw_value: ldl[1], raw_unit: 'mg/dL', reference_range: ldl[2], observation_date: null,
        category: 'laboratory', page: page.page_number, source_text: `LDL Cholesterol ${ldl[1]} mg/dL < 100`, confidence: 0.95,
      });
    }
  }
  return result;
}
