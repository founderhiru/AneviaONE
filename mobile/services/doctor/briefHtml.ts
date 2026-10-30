import { briefDate, type BriefResult, type DoctorBrief } from './doctorBrief';

/** Everything that came from a report or the person goes through this. */
export const esc = (s: string | null | undefined): string =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const marker = (r: BriefResult) => (r.position === 'above' ? 'Above printed range' : r.position === 'below' ? 'Below printed range' : '');

function resultRow(r: BriefResult): string {
  return `<tr><td>${esc(r.name)}</td><td><b>${esc(r.value)}</b></td><td>${esc(r.range ?? '')}</td><td>${esc(marker(r))}</td></tr>`;
}

function table(rows: string[]): string {
  return `<table><thead><tr><th>Test</th><th>Result</th><th>Printed range</th><th></th></tr></thead><tbody>${rows.join('')}</tbody></table>`;
}

/** A clean one-to-two page document for a visit. Text only; nothing is interpreted. */
export function doctorBriefHtml(b: DoctorBrief): string {
  const list = (title: string, items: string[]) =>
    items.length ? `<h2>${esc(title)}</h2><ul>${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>` : '';
  const outside = b.outsideRange.length
    ? `<h2>Outside the range printed on the report</h2>${table(b.outsideRange.map((r) => `<tr><td>${esc(r.name)}</td><td><b>${esc(r.value)}</b></td><td>${esc(r.range ?? '')}</td><td>${esc(marker(r))} · ${esc(briefDate(r.date))} · ${esc(r.reportTitle)}</td></tr>`))}`
    : '<h2>Outside the range printed on the report</h2><p>No result is outside the range printed on its own report.</p>';
  const trends = b.trends.length
    ? `<h2>Repeated tests</h2>${b.trends
        .map((t) => `<p><b>${esc(t.name)}</b> — ${t.points.map((p) => `${esc(briefDate(p.date))}: ${esc(p.value)}${t.unit ? ' ' + esc(t.unit) : ''}`).join(' → ')}</p>`)
        .join('')}`
    : '';
  const reports = b.reports
    .map((r) => `<h3>${esc(r.title)}</h3>${table(r.results.map(resultRow))}`)
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
body{font-family:-apple-system,Helvetica,Arial,sans-serif;color:#111;font-size:12px;margin:28px}
h1{font-size:20px;margin:0 0 4px}h2{font-size:14px;margin:18px 0 6px;border-bottom:1px solid #ccc;padding-bottom:3px}h3{font-size:12px;margin:12px 0 4px}
table{width:100%;border-collapse:collapse}td,th{text-align:left;padding:3px 6px;border-bottom:1px solid #eee;vertical-align:top}th{color:#555;font-weight:600}
.note{color:#555;font-size:10px;margin-top:18px}
</style></head><body>
<h1>Health summary</h1>
<p>${esc(b.person.name ?? 'Name not provided')}${b.person.dateOfBirth ? ' · Date of birth ' + esc(b.person.dateOfBirth) : ''} · Prepared ${esc(briefDate(b.preparedOn))}</p>
<p>${b.reportCount} report${b.reportCount === 1 ? '' : 's'} · ${b.resultCount} result${b.resultCount === 1 ? '' : 's'}${b.heldReports ? ` · ${b.heldReports} report${b.heldReports === 1 ? '' : 's'} with results not yet checked (not included)` : ''}</p>
${outside}${trends}
${list('Medications listed on reports', b.medications)}${list('Conditions stated on reports', b.conditions)}${list('Allergies stated on reports', b.allergies)}
<h2>Reports</h2>${reports}
<p class="note">Prepared from the person's own uploaded reports, as written on them. Ranges are the ones printed on each report. This is not a diagnosis and does not replace the original reports.</p>
</body></html>`;
}
