import { briefDate, type BriefResult, type DoctorBrief } from './doctorBrief';

/** Everything that came from a report or the person goes through this. */
export const esc = (s: string | null | undefined): string =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const marker = (r: BriefResult) => (r.position === 'above' ? 'Above printed range' : r.position === 'below' ? 'Below printed range' : '');

const where = (r: BriefResult) => {
  const d = briefDate(r.date);
  return r.reportTitle.includes(d) || d === 'Date not clear' ? r.reportTitle : `${r.reportTitle} · ${d}`;
};

function resultRow(r: BriefResult): string {
  const flagged = r.position === 'above' || r.position === 'below';
  return `<tr${flagged ? ' class="flag"' : ''}><td>${esc(r.name)}</td><td class="v">${esc(r.value)}</td><td>${esc(r.range ?? '')}</td><td class="m">${esc(marker(r))}</td></tr>`;
}

function table(rows: string[]): string {
  return `<table><thead><tr><th>Test</th><th>Result</th><th>Printed range</th><th></th></tr></thead><tbody>${rows.join('')}</tbody></table>`;
}

/** A clean one-to-two page document for a visit. Text only; nothing is interpreted. */
export function doctorBriefHtml(b: DoctorBrief): string {
  const list = (title: string, items: string[]) =>
    items.length ? `<h2>${esc(title)}</h2><ul>${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>` : '';
  const outside = b.outsideRange.length
    ? `<h2>Outside the range printed on the report</h2>${table(b.outsideRange.map((r) => `<tr class="flag"><td>${esc(r.name)}<div class="s">${esc(where(r))}</div></td><td class="v">${esc(r.value)}</td><td>${esc(r.range ?? '')}</td><td class="m">${esc(marker(r))}</td></tr>`))}`
    : '<h2>Outside the range printed on the report</h2><p>No result is outside the range printed on its own report.</p>';
  const trends = b.trends.length
    ? `<h2>Changes over time</h2>${b.trends
        .map((t) => `<p class="t"><b>${esc(t.name)}</b><br>${t.points.map((p) => `${esc(p.value)}${t.unit ? ' ' + esc(t.unit) : ''} <span class="s">(${esc(briefDate(p.date))})</span>`).join(' &rarr; ')}</p>`)
        .join('')}`
    : '';
  const reports = b.reports
    .map((r) => `<h3>${esc(r.title)}</h3>${table(r.results.map(resultRow))}`)
    .join('');
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@page{margin:0}
body{font-family:-apple-system,Helvetica,Arial,sans-serif;color:#17231b;font-size:12px;margin:0;line-height:1.45}
.band{background:#0E2A1B;color:#F6F9EF;padding:26px 32px 20px}
.band .k{color:#F2D58A;font-size:9px;letter-spacing:.16em;text-transform:uppercase}
.band h1{font-family:Georgia,'Times New Roman',serif;font-weight:400;font-size:26px;margin:6px 0 2px}
.band .m{color:rgba(246,249,239,.78);font-size:11px}
.stats{display:flex;gap:28px;margin-top:14px}.stats div{font-size:10px;color:rgba(246,249,239,.7)}.stats b{display:block;font-family:Georgia,serif;font-weight:400;font-size:22px;color:#F6F9EF}
.page{padding:6px 32px 28px}
h2{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#2C5A36;margin:22px 0 6px;padding-bottom:4px;border-bottom:1px solid #d9e2d4;font-weight:700}
h3{font-family:Georgia,serif;font-size:13px;font-weight:400;margin:14px 0 4px}
table{width:100%;border-collapse:collapse}td,th{text-align:left;padding:5px 6px;border-bottom:1px solid #eaf0e6;vertical-align:top}
th{color:#6b7a70;font-weight:600;font-size:9px;letter-spacing:.08em;text-transform:uppercase}
td.v{font-family:Georgia,serif;font-size:13px;white-space:nowrap}td.m{color:#8a5a00;font-size:10px;white-space:nowrap}
tr.flag td{background:#fbf5e4}
.s{color:#6b7a70;font-size:10px}.t{margin:6px 0}ul{margin:4px 0;padding-left:18px}li{margin:2px 0}
.note{color:#6b7a70;font-size:10px;margin-top:22px;border-top:1px solid #d9e2d4;padding-top:8px}
</style></head><body>
<div class="band"><div class="k">Health summary &middot; Prepared ${esc(briefDate(b.preparedOn))}</div>
<h1>${esc(b.person.name ?? 'Name not provided')}</h1>
<div class="m">${b.person.dateOfBirth ? 'Born ' + esc(briefDate(b.person.dateOfBirth)) : ''}</div>
<div class="stats"><div><b>${b.reportCount}</b>${b.reportCount === 1 ? 'Report' : 'Reports'}</div><div><b>${b.resultCount}</b>${b.resultCount === 1 ? 'Result' : 'Results'}</div><div><b>${b.outsideRange.length}</b>To mention</div></div></div>
<div class="page">
${b.heldReports ? `<p class="s">${plural(b.heldReports, 'report')} with results not yet checked (not included).</p>` : ''}
${outside}${trends}
${list('Medications listed on reports', b.medications)}${list('Conditions stated on reports', b.conditions)}${list('Allergies stated on reports', b.allergies)}
<h2>Reports</h2>${reports}
<p class="note">Prepared from the person's own uploaded reports, as written on them. Ranges are the ones printed on each report. This is not a diagnosis and does not replace the original reports.</p>
</div></body></html>`;
}
