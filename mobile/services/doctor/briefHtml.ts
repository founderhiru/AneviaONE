import { briefDate, type BriefResult, type DoctorBrief } from './doctorBrief';

/** Everything that came from a report or the person goes through this. */
export const esc = (s: string | null | undefined): string =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const MAX_OUTSIDE = 8;
const MAX_REPORTS = 6;
const MAX_TRENDS = 5;

const marker = (r: BriefResult) => (r.position === 'above' ? 'Above printed range' : r.position === 'below' ? 'Below printed range' : '');

/** A date is added only when the report's own title doesn't already carry it. */
const where = (r: BriefResult) => {
  const d = briefDate(r.date);
  return r.reportTitle.includes(d) || d === 'Date not clear' ? r.reportTitle : `${r.reportTitle} · ${d}`;
};

/**
 * A one-page summary for a visit, not a record dump: what is outside the
 * printed range, the latest reports with their first few results, how repeated
 * tests moved, and what the reports state about medicines, conditions and
 * allergies. Text only, one plain system font; nothing is interpreted. The full
 * results stay in the app.
 */
export function doctorBriefHtml(b: DoctorBrief): string {
  const section = (title: string, body: string) => (body ? `<h2>${esc(title)}</h2>${body}` : '');
  const list = (items: string[]) => (items.length ? `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>` : '');

  const shownOutside = b.outsideRange.slice(0, MAX_OUTSIDE);
  const outside = b.outsideRange.length
    ? `<table>${shownOutside
        .map((r) => `<tr><td class="n">${esc(r.name)}<span class="s">${esc(where(r))}</span></td><td class="v">${esc(r.value)}</td><td class="m">${esc(marker(r))}${r.range ? `<span class="s">Printed range ${esc(r.range)}</span>` : ''}</td></tr>`)
        .join('')}</table>${b.outsideRange.length > MAX_OUTSIDE ? `<p class="s">and ${b.outsideRange.length - MAX_OUTSIDE} more in the app</p>` : ''}`
    : '<p>No result is outside the range printed on its own report.</p>';

  const shownReports = b.reports.slice(0, MAX_REPORTS);
  const reports = shownReports
    .map(
      (r) =>
        `<div class="rep"><div class="rt">${esc(r.title)}</div>${r.highlights
          .map((h) => `<div class="hl"><span>${esc(h.name)}</span><b>${esc(h.value)}</b></div>`)
          .join('')}${r.results.length > r.highlights.length ? `<div class="s">${r.results.length} results in this report</div>` : ''}</div>`,
    )
    .join('') + (b.reports.length > MAX_REPORTS ? `<p class="s">and ${b.reports.length - MAX_REPORTS} earlier reports in the app</p>` : '');

  const trends = b.trends
    .slice(0, MAX_TRENDS)
    .map((t) => `<p class="t"><b>${esc(t.name)}</b><span class="s">${t.points.map((p) => `${esc(p.value)}${t.unit ? ' ' + esc(t.unit) : ''} (${esc(briefDate(p.date))})`).join(' &rarr; ')}</span></p>`)
    .join('');

  const questions = b.questions.length ? `<ol class="q">${b.questions.map((q) => `<li>${esc(q)}</li>`).join('')}</ol>` : '';
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@page{margin:0}
body{font-family:-apple-system,'Helvetica Neue',Helvetica,Arial,sans-serif;color:#17231b;font-size:11px;margin:0;line-height:1.45}
.band{background:#0E2A1B;color:#F6F9EF;padding:22px 32px 16px}
.band .k{color:#F2D58A;font-size:8.5px;letter-spacing:.14em;text-transform:uppercase;font-weight:600}
.band h1{font-size:20px;font-weight:600;margin:5px 0 12px;letter-spacing:-.01em}
.kpi{display:flex;gap:0;border-top:1px solid rgba(246,249,239,.18);padding-top:10px}.kpi div{flex:1;font-size:8.5px;letter-spacing:.12em;text-transform:uppercase;color:rgba(246,249,239,.65)}.kpi b{display:block;font-size:18px;letter-spacing:0;font-weight:600;color:#F6F9EF;margin-bottom:1px}
.band .m{color:rgba(246,249,239,.8);font-size:11px}
.page{padding:4px 32px 28px}
h2{font-size:8.5px;letter-spacing:.16em;text-transform:uppercase;color:#2C5A36;margin:20px 0 6px;padding-bottom:4px;border-bottom:1px solid #d9e2d4;font-weight:700}
table{width:100%;border-collapse:collapse}td{padding:6px 6px 6px 0;border-bottom:1px solid #eaf0e6;vertical-align:top}
td.v{font-weight:700;white-space:nowrap;text-align:right;padding-right:14px;font-variant-numeric:tabular-nums}td.m{color:#8a5a00;font-size:10px;width:34%}
.s{display:block;color:#6b7a70;font-size:9.5px;font-weight:400}
.rep{margin:0 0 10px;break-inside:avoid}.rt{font-weight:600;margin-bottom:2px}
.hl{display:flex;justify-content:space-between;gap:12px;padding:2px 0;border-bottom:1px solid #eaf0e6}.hl b{font-weight:600;text-align:right}
.t{margin:6px 0}.t b{display:block;font-weight:600}
ul,ol{margin:4px 0;padding-left:20px}li{margin:3px 0}
.note{color:#6b7a70;font-size:9px;margin-top:22px;border-top:1px solid #d9e2d4;padding-top:8px}
</style></head><body>
<div class="band"><div class="k">Health summary &middot; Prepared ${esc(briefDate(b.preparedOn))}</div>
<h1>${esc(b.person.name ?? 'Name not provided')}</h1>
<div class="kpi"><div><b>${b.reportCount}</b>${b.reportCount === 1 ? 'Report' : 'Reports'}</div><div><b>${b.resultCount}</b>${b.resultCount === 1 ? 'Result' : 'Results'}</div><div><b>${b.outsideRange.length}</b>To mention</div></div></div>
<div class="page">
${b.heldReports ? `<p class="s">${plural(b.heldReports, 'report')} with results not yet checked (not included).</p>` : ''}
${section('Worth discussing: outside the range printed on the report', outside)}
${section('Questions to ask', questions)}
${section('Latest reports', reports)}
${section('Changes over time', trends)}
${section('Medications listed on reports', list(b.medications))}${section('Conditions stated on reports', list(b.conditions))}${section('Allergies stated on reports', list(b.allergies))}
<p class="note">Prepared from the person's own uploaded reports, as written on them. Ranges are the ones printed on each report. This is not a diagnosis and does not replace the original reports.</p>
</div></body></html>`;
}
