/* AneviaONE demo tour: one deterministic timeline. window.seek(t) draws the frame at t seconds.
   Every element's look is a pure function of t, so frames can be rendered in any order. */
(() => {
const DURATION = 110;
const $ = (s, r = document) => r.querySelector(s);
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const eio = (x) => (x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const D = { o: 1, x: 0, y: 0, s: 1, r: 0 };
const cache = new WeakMap();
const norm = (keys) => {
  if (cache.has(keys)) return cache.get(keys);
  let cur = D; const out = keys.map(([t, p]) => { cur = Object.assign({}, cur, p); return [t, cur]; });
  cache.set(keys, out); return out;
};
function val(t, keys) {
  const k = norm(keys); if (t <= k[0][0]) return k[0][1]; const last = k[k.length - 1]; if (t >= last[0]) return last[1];
  for (let i = 0; i < k.length - 1; i++) if (t >= k[i][0] && t < k[i + 1][0]) {
    const p = eio((t - k[i][0]) / (k[i + 1][0] - k[i][0])), A = k[i][1], B = k[i + 1][1], v = {};
    for (const n in D) v[n] = A[n] + (B[n] - A[n]) * p; return v;
  }
}
function kf(el, t, keys, dx = 0, dy = 0) {
  const v = val(t, keys);
  el.style.opacity = v.o; el.style.visibility = v.o > .003 ? 'visible' : 'hidden';
  el.style.transform = `translate(${v.x + dx}px,${v.y + dy}px) scale(${v.s}) rotate(${v.r}deg)`;
}
const win = (a, b, d = .5, dy = 0) => [[a, { o: 0, y: dy }], [a + d, { o: 1, y: 0 }], [b - d, { o: 1, y: 0 }], [b, { o: 0, y: -dy / 2 }]];
const inK = (a, d = .5, dy = 0) => [[a, { o: 0, y: dy }], [a + d, { o: 1, y: 0 }]];
const prog = (t, a, b) => eio(clamp((t - a) / (b - a)));
const el = (html, parent, cls = '', style = '') => { const d = document.createElement('div'); d.className = cls; d.style.cssText = style; d.innerHTML = html; parent.appendChild(d); return d; };
const ABS = 'position:absolute;';

/* ---------- marks ---------- */
const mark = (ring = '#a9cf86', a = '#f2d58a', leaf = '#8fcf9a', bg = '#0e2a1b', size = 200) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 64 64"><circle cx="32" cy="32" r="31" fill="${bg}"/><circle cx="32" cy="32" r="27" fill="none" stroke="${ring}" stroke-width="2.2"/><path d="M20 46 L32 16 L44 46" fill="none" stroke="${a}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M25 37 H39" stroke="${a}" stroke-width="3.4" stroke-linecap="round"/><path d="M17 44 C14 36 18 30 25 29 C25 36 22 41 17 44Z" fill="${leaf}"/></svg>`;

/* ---------- scene 1 ---------- */
const s1 = $('#s1');
const hA = el('Your health has a <span style="color:var(--teal)">history.</span>', s1, '', ABS + 'left:0;right:0;top:250px;text-align:center;font-size:118px;font-weight:800;letter-spacing:-.04em;color:var(--navy)');
const lines = ['Reports in a drawer.', 'Results in an inbox.', 'Prescriptions in a photo roll.'].map((t, i) => el(t, s1, '', ABS + `left:0;right:0;top:${470 + i * 74}px;text-align:center;font-size:54px;font-weight:600;color:#3b4f6e`));
const docsData = [['2019', 'Lipid Panel', 150, 110, -8], ['2024', 'Heart Panel', 560, 40, 6], ['', 'Prescription', 1010, 90, -5], ['2025', 'Chest X-Ray', 1470, 70, 9], ['2021', 'Thyroid Test', 1620, 400, -6], ['2023', 'Ultrasound', 1530, 690, 7], ['', 'Discharge note', 1100, 770, -9], ['2026', 'Full Checkup', 640, 790, 5], ['', 'Lab invoice', 200, 690, -7], ['', 'Old results', 60, 400, 8]];
const docs = docsData.map(([y, tt, x, yy, r], i) => ({ i, x, yy, r, e: el(`<div class="yy">${y || 'SCAN'}</div><div class="tt">${tt}</div><div class="bar" style="width:90%"></div><div class="bar" style="width:70%"></div><div class="bar" style="width:82%"></div><div class="bar" style="width:55%"></div>`, s1, 'doc', `left:${x}px;top:${yy}px;`) }));
[hA, ...lines].forEach(e => e.style.zIndex = 5);
const wa = el('<b></b>WhatsApp', s1, 'chip', 'left:330px;top:300px'), gm = el('<b style="background:#e0705a"></b>Inbox', s1, 'chip', 'left:1330px;top:560px'), ph = el('<b style="background:#d79a2b"></b>Photo roll', s1, 'chip', 'left:1180px;top:880px');
const mk1 = el(mark('#a9cf86', '#f2d58a', '#8fcf9a', '#0e2a1b', 190), s1, '', ABS + 'left:865px;top:270px');
const wm1 = el('<span style="color:#14341f">Anevia</span><span style="color:#2e7d4f">ONE</span>', s1, 'word', ABS + 'left:0;right:0;top:490px;text-align:center;font-size:110px');
const tg1 = el('brings it together.', s1, '', ABS + 'left:0;right:0;top:640px;text-align:center;font-size:56px;font-weight:600;color:#3b4f6e');

/* ---------- left copy ---------- */
const COPY = [
  [12, 26, '01 · Capture', 'Bring every <em>record</em> in.', 'Upload, photograph or share. Nothing to retype.'],
  [26, 42, '02 · Understand', 'Clear results, with the <em>source.</em>', 'Read only with your permission. Anything uncertain waits for you.'],
  [42, 54, '03 · Remember', 'One history that <em>grows.</em>', 'Every report, placed on your timeline.'],
  [54, 64, '04 · Compare', 'See what <em>changed.</em>', 'The same test, connected across years.'],
  [64, 76, '05 · Share', 'Ready for your <em>Doctor.</em>', 'A clear one-page summary of your history.'],
  [76, 92, 'Family', 'Care together, <em>with consent.</em>', 'Manage a parent’s or child’s records. Adults approve every request.'],
  [92, 102, 'Privacy', 'Yours to keep <em>or delete.</em>', 'Delete a report or your whole account, any time.'],
];
const copyEls = COPY.map(([a, b, e, h, s]) => ({ a, b, e: el(`<div class="eyebrow">${e}</div><div class="h">${h}</div><div class="sub">${s}</div>`, $('#copy'), 'blk') }));

/* ---------- phone screens ---------- */
const scr = $('#screen');
const status = '<div class="status"><span>9:41</span><span>●●● ▮</span></div>';
const tabs = (on) => `<div class="tabs">${['Home', 'Timeline', 'Health', 'For Doctor', 'Me'].map((n) => `<div class="${n === on ? 'on' : ''} ${n === 'For Doctor' ? 'doc' : ''}"><i></i>${n}</div>`).join('')}</div>`;
const mkScr = (html) => el(status + html, scr, 'scr');
const icn = (c = '#e5f4f9', g = '#11a8c8') => `<div class="ic" style="background:${c}"><div style="position:absolute;left:15px;top:13px;width:22px;height:26px;border-radius:6px;border:3px solid ${g}"></div></div>`;

/* A · add record */
const addOpts = [['Upload a PDF', 'From Files or another app'], ['Take a photo', 'Camera, saved as a PDF'], ['Choose photos', 'From your library'], ['Scan a paper report', 'Several pages, one PDF']];
const scA = mkScr(`<div class="hdr">Add Health Record</div><div class="hsub">Stored privately in your Health Memory.</div>
 ${addOpts.map((o, i) => `<div class="card aopt" style="top:${190 + i * 120}px;height:100px"><div class="row">${icn()}<div><div class="t1">${o[0]}</div><div class="t2">${o[1]}</div></div></div></div>`).join('')}
 <div class="card" id="aDone" style="top:300px;height:230px;border-color:#9fdcc0;background:#f1fbf6"><div style="width:62px;height:62px;border-radius:50%;background:var(--good);color:#fff;font-size:38px;font-weight:800;text-align:center;line-height:62px">✓</div><div class="t1" style="margin-top:18px;font-size:25px">Full_Checkup_Mar_2026.pdf</div><div class="t2" style="font-size:19px">Saved. Your original is kept.</div></div>`);
const aOpts = [...scA.querySelectorAll('.aopt')], aDone = $('#aDone', scA);
const sideA = $('#side');
const chipDefs = [['PDF', 'left:130px;top:820px', 'var(--teal)', 15.6], ['Camera', 'left:330px;top:820px', '#6a7fd1', 16.6], ['WhatsApp', 'left:590px;top:820px', '#2ea66a', 18.0], ['Gmail', 'left:870px;top:820px', '#e0705a', 19.2]];
const aChips = chipDefs.map(([n, st, c, t0]) => ({ t0, e: el(`<b style="background:${c}"></b>${n}`, sideA, 'chip', st) }));
const kept = el('<b style="background:var(--good)"></b>Original kept · private storage', sideA, 'chip', 'left:130px;top:820px');

/* B · understand */
const scB = mkScr(`<div class="hdr">Full Checkup</div><div class="hsub">Mar 2026 · 4 pages</div>
 <div class="card" id="bPage" style="top:170px;height:520px;padding:26px">
  ${[['LDL Cholesterol', '146 mg/dL', '<100'], ['HbA1c', '5.9 %', '<5.7'], ['TSH', '3.1 mIU/L', '0.4–4.0'], ['Haemoglobin', '13.8 g/dL', '12–16']].map((r, i) => `<div class="bl" style="position:relative;margin-bottom:22px;padding:14px 12px;border-radius:12px;font-size:21px;display:flex;justify-content:space-between"><span class="hl" style="position:absolute;inset:0;border-radius:12px;background:rgba(52,191,220,.28)"></span><b style="position:relative">${r[0]}</b><span style="position:relative">${r[1]} <i style="color:#8796ad;font-style:normal;font-size:16px">(${r[2]})</i></span></div>`).join('')}
  <div style="height:12px;border-radius:6px;background:#e4ebf4;margin:10px 0;width:80%"></div><div style="height:12px;border-radius:6px;background:#e4ebf4;margin:10px 0;width:64%"></div>
  <div id="scan" style="position:absolute;left:0;right:0;height:5px;background:linear-gradient(90deg,transparent,#34bfdc,transparent);top:0"></div></div>
 <div class="card" id="bRead" style="top:716px;height:120px"><div class="row"><div style="width:44px;height:44px;border-radius:50%;border:5px solid #d7eef5;border-top-color:var(--teal)" id="spin"></div><div><div class="t1">Reading your report…</div><div class="t2">Dates, results, units and ranges</div></div></div></div>`);
const bPage = $('#bPage', scB), bRead = $('#bRead', scB), bHls = [...scB.querySelectorAll('.hl')], scan = $('#scan', scB), spin = $('#spin', scB);
const scB2 = mkScr(`<div class="hdr">Results</div><div class="hsub">Full Checkup · 4 results</div>
 <div class="card" id="r1" style="top:176px;height:150px"><div class="t2" style="font-size:18px">LDL Cholesterol</div><div style="font-size:44px;font-weight:800;color:var(--navy)">146 <span style="font-size:22px;color:var(--mute);font-weight:600">mg/dL</span></div><div class="pill" style="background:#e5f4f9;color:var(--teal);font-size:16px;margin-top:6px">Source: Full Checkup · page 2</div></div>
 <div class="card" id="r2" style="top:344px;height:160px;border-color:#f1d9a6"><div class="t2" style="font-size:18px">HbA1c</div><div style="font-size:44px;font-weight:800;color:var(--navy)">5.9 <span style="font-size:22px;color:var(--mute);font-weight:600">%</span></div><div style="margin-top:6px"><span class="pill" id="r2p" style="background:#fdf0d4;color:#9a6b12;font-size:16px">Review</span> <span class="pill" id="r2b" style="background:var(--navy2);color:#fff;font-size:16px;margin-left:8px">Confirm</span></div></div>
 <div class="card" id="thumb" style="top:540px;height:250px;border-color:#bfe3ee;background:#f4fbfd"><div class="t2" style="font-size:16px;margin-bottom:10px">Page 2 · the wording it came from</div><div style="height:12px;border-radius:6px;background:#e4ebf4;width:84%;margin:9px 0"></div><div id="thl" style="padding:10px 12px;border-radius:10px;background:rgba(52,191,220,.28);font-size:20px;font-weight:700;display:flex;justify-content:space-between;margin:12px 0"><span>LDL Cholesterol</span><span>146 mg/dL</span></div><div style="height:12px;border-radius:6px;background:#e4ebf4;width:70%;margin:9px 0"></div></div>${tabs('Health')}`);
const r1 = $('#r1', scB2), r2 = $('#r2', scB2), r2p = $('#r2p', scB2), r2b = $('#r2b', scB2), thumb = $('#thumb', scB2), thl = $('#thl', scB2);

/* C · timeline */
const TL = [['2026', 'Full Checkup', 'Mar 2026 · 18 results added'], ['2025', 'Chest X-Ray', 'Jun 2025 · Imaging report'], ['2024', 'Heart Panel', 'Mar 2024 · 6 results'], ['2023', 'Ultrasound', 'Aug 2023 · Imaging report'], ['2021', 'Thyroid Test', 'Aug 2021 · 3 results'], ['2019', 'Lipid Panel', 'Jan 2019 · 4 results']];
const scC = mkScr(`<div class="hdr">Timeline</div><div class="hsub">Your health, in order</div><div style="position:absolute;left:58px;top:190px;bottom:110px;width:3px;background:#d5e3ee"></div>
 ${TL.map((e, i) => `<div class="card tl" style="top:${180 + i * 112}px;height:98px;left:78px;padding:14px 18px"><div class="pill" style="background:#e5f4f9;color:var(--teal);font-size:14px;padding:2px 10px">${e[0]}</div><div class="t1" style="margin-top:4px">${e[1]}</div><div class="t2" style="font-size:15px">${e[2]}</div><span class="dot" style="position:absolute;left:-26px;top:38px;width:15px;height:15px;border-radius:50%;background:#9bb3cc;border:3px solid #fff"></span></div>`).join('')}
 <div class="pill" id="ldlpill" style="position:absolute;right:26px;top:96px;background:var(--navy2);color:#fff;font-size:18px;z-index:12;box-shadow:0 8px 24px rgba(6,31,68,.3)">LDL 112 → 131 → 146</div>${tabs('Timeline')}`);
const tls = [...scC.querySelectorAll('.tl')], ldlpill = $('#ldlpill', scC);

/* D · compare */
const spark = (pts, color, id) => { const w = 150, h = 50, mn = Math.min(...pts), mx = Math.max(...pts), c = pts.map((p, i) => [8 + i * (w - 16) / (pts.length - 1), h - 6 - (p - mn) / ((mx - mn) || 1) * (h - 14)]); return `<svg width="${w}" height="${h}"><path class="${id}" d="${c.map((p, i) => (i ? 'L' : 'M') + p[0] + ' ' + p[1]).join(' ')}" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/><circle cx="${c[c.length - 1][0]}" cy="${c[c.length - 1][1]}" r="6" fill="${color}"/></svg>`; };
const CH = [['LDL Cholesterol', 'Increased by 15 mg/dL', '131 → 146 mg/dL', '+11%', 'var(--alert)', [112, 131, 146]], ['HbA1c', 'Improved by 0.3%', '6.2% → 5.9%', '−5%', 'var(--good)', [6.2, 5.9]], ['TSH', 'Increased by 0.7 mIU/L', '2.4 → 3.1 mIU/L', '+29%', 'var(--watch)', [2.4, 3.1]]];
const scD = mkScr(`<div class="hdr" id="dh">What changed?</div><div class="hsub" id="dhs">Latest report compared with the one before</div>
 ${CH.map((c, i) => `<div class="card chg" style="top:${176 + i * 190}px;height:170px"><div class="row" style="justify-content:space-between"><div><div class="t1">${c[0]}</div><div style="font-size:22px;font-weight:700;color:${c[4]};margin-top:4px">${c[1]}</div><div class="t2">${c[2]}</div></div><div class="pill" style="background:#f2f5f9;color:${c[4]};font-size:22px">${c[3]}</div></div><div style="margin-top:8px">${spark(c[5], c[4].replace('var(--alert)', '#c4543b').replace('var(--good)', '#2e9e6b').replace('var(--watch)', '#d79a2b'), 'sp' + i)}</div></div>`).join('')}${tabs('Health')}`);
const chgs = [...scD.querySelectorAll('.chg')], sps = [0, 1, 2].map((i) => $('.sp' + i, scD));
const TR = [['LDL Cholesterol', '146 mg/dL', 'Up', '#c4543b', [112, 131, 146]], ['HbA1c', '5.9 %', 'Improving', '#2e9e6b', [6.4, 6.2, 5.9]], ['Vitamin D', '24 ng/mL', 'Lower', '#d79a2b', [34, 29, 24]]];
const scD2 = mkScr(`<div class="hdr">Trends</div><div class="hsub">Longitudinal view of key measures</div>
 ${TR.map((c, i) => `<div class="card trd" style="top:${176 + i * 220}px;height:200px"><div class="row" style="justify-content:space-between"><div class="t1">${c[0]}</div><span class="pill" style="background:#f2f5f9;color:${c[3]};font-size:15px">${c[2]}</span></div><div style="font-size:34px;font-weight:800;color:var(--navy);margin-top:2px">${c[1]}</div><svg width="384" height="76" style="margin-top:4px"><path class="tp${i}" d="${c[4].map((p, j) => { const mn = Math.min(...c[4]), mx = Math.max(...c[4]); return (j ? 'L' : 'M') + (8 + j * (368) / (c[4].length - 1)) + ' ' + (66 - (p - mn) / ((mx - mn) || 1) * 56); }).join(' ')}" fill="none" stroke="${c[3]}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/></svg></div>`).join('')}${tabs('Health')}`);
const trds = [...scD2.querySelectorAll('.trd')], tps = [0, 1, 2].map((i) => $('.tp' + i, scD2));

/* E · for doctor */
const scE = mkScr(`<div class="hdr">For Doctor</div><div class="hsub">One page, ready to share</div>
 <div class="card" id="e0" style="top:176px;height:96px"><div class="t1">Sample patient</div><div class="t2">Summary of 6 reports · 2019–2026</div></div>
 <div class="card" id="e1" style="top:288px;height:190px"><div class="t2" style="letter-spacing:.12em;font-weight:700">KEY RESULTS</div>${[['LDL Cholesterol', '146 mg/dL'], ['HbA1c', '5.9 %'], ['TSH', '3.1 mIU/L']].map((r) => `<div class="row" style="justify-content:space-between;margin-top:10px;font-size:20px"><b>${r[0]}</b><span>${r[1]}</span></div>`).join('')}</div>
 <div class="card" id="e2" style="top:494px;height:150px"><div class="t2" style="letter-spacing:.12em;font-weight:700">WHAT CHANGED</div><div style="font-size:20px;margin-top:10px">LDL up 15 mg/dL since 2024</div><div style="font-size:20px;margin-top:6px">HbA1c improved by 0.3%</div></div>
 <div class="card" id="e3" style="top:660px;height:96px"><div class="t2" style="letter-spacing:.12em;font-weight:700">MEDICATIONS · ALLERGIES</div><div style="font-size:19px;margin-top:6px">Metformin 500 mg · Penicillin (rash)</div></div>
 <div class="btn" id="eShare" style="position:absolute;left:24px;right:24px;top:772px;background:var(--navy2);color:#fff;text-align:center">Share summary</div>${tabs('For Doctor')}`);
const eCards = ['e0', 'e1', 'e2', 'e3'].map((i) => $('#' + i, scE)), eShare = $('#eShare', scE);

/* F · family */
const scF = mkScr(`<div class="hdr">Home</div>
 <div class="pill" id="pbar" style="position:absolute;left:28px;top:126px;background:#e5f4f9;color:var(--navy2);font-size:19px">Me ▾</div>
 <div class="card" id="banner" style="top:176px;height:84px;border-color:#e6c36e;background:#fffaf0"><div class="t1" style="font-size:20px">Viewing Dad’s records</div><div class="t2" style="font-size:15px;color:var(--navy2);font-weight:700">Back to my records</div></div>
 <div class="card" style="top:280px;height:150px"><div class="t2">Latest · Dad</div><div class="t1" style="font-size:26px;margin-top:6px">Heart Panel</div><div class="t2">6 results</div></div>
 <div class="card" style="top:446px;height:150px"><div class="t2">Needs review</div><div class="t1" style="font-size:26px;margin-top:6px">2 results</div></div>
 <div class="scrim" id="fScrim"></div>
 <div class="sheet" id="fSheet"><div class="t1" style="font-size:26px;margin-bottom:16px">Whose records?</div>
  ${[['Me', 'Your own records'], ['Dad', 'You manage this record'], ['Meera', 'Shared with you · view only']].map((p, i) => `<div class="card prow" style="position:relative;left:0;right:0;margin-bottom:12px;padding:14px 18px"><div class="t1">${p[0]}</div><div class="t2">${p[1]}</div></div>`).join('')}</div>${tabs('Home')}`);
const pbar = $('#pbar', scF), banner = $('#banner', scF), fScrim = $('#fScrim', scF), fSheet = $('#fSheet', scF), prows = [...scF.querySelectorAll('.prow')];
const scF2 = mkScr(`<div class="hdr">Family</div><div class="hsub">People whose records you can see</div>
 <div class="card" id="fm1" style="top:176px;height:100px"><div class="t1">Dad</div><div class="t2">Father · you manage this record</div></div>
 <div class="card" id="fm2" style="top:296px;height:210px"><div class="t1">Invite an adult relative</div><div class="t2">They keep control of their own records.</div><div id="code" style="font-size:29px;font-weight:800;letter-spacing:.05em;color:var(--navy);margin-top:18px;background:#f2f6fb;border-radius:14px;padding:12px 16px;text-align:center">7K2M-4QXA-9D3P</div><div class="t2" style="margin-top:8px">Valid for 7 days · works once</div></div>
 <div class="card" id="fm3" style="top:526px;height:230px;border-color:#bfe3ee"><div class="t2" style="letter-spacing:.12em;font-weight:700">REQUEST TO APPROVE</div><div class="t1" style="margin-top:8px">Meera asked to view your records</div><div style="margin-top:20px"><span class="btn" id="apr" style="background:var(--navy2);color:#fff;padding:13px 24px;font-size:18px">Approve</span> <span class="btn" id="rev" style="border:2px solid #e3b5ab;color:var(--alert);padding:11px 22px;font-size:18px;margin-left:10px;opacity:0">Remove access</span></div><div class="t2" id="fnote" style="margin-top:16px;font-size:17px"></div></div>${tabs('Me')}`);
const fms = ['fm1', 'fm2', 'fm3'].map((i) => $('#' + i, scF2)), apr = $('#apr', scF2), rev = $('#rev', scF2), fnote = $('#fnote', scF2);

/* G · privacy */
const DOCS = ['Full_Checkup_Mar_2026.pdf', 'Chest_XRay_Jun_2025.pdf', 'Heart_Panel_Mar_2024.pdf', 'Ultrasound_Aug_2023.pdf', 'Thyroid_Test_Aug_2021.pdf', 'Lipid_Panel_Jan_2019.pdf'];
const scG = mkScr(`<div class="hdr">My documents</div><div class="hsub">6 reports</div>
 ${DOCS.map((d, i) => `<div class="card drow" style="top:${176 + i * 108}px;height:94px;padding:16px 18px"><div class="row">${icn()}<div><div class="t1" style="font-size:19px">${d}</div><div class="t2" style="font-size:15px">Original kept · private</div></div></div></div>`).join('')}
 <div class="scrim" id="gScrim"></div><div class="sheet" id="gSheet"><div class="t1" style="font-size:26px">Delete this report?</div><div class="t2" style="font-size:18px;margin:10px 0 22px">Its original file and the results read from it are removed from your Health Memory.</div><div class="btn" id="gDel" style="background:var(--alert);color:#fff;display:block;text-align:center">Delete report</div></div>
 <div class="pill" id="gToast" style="position:absolute;left:90px;right:90px;bottom:120px;background:var(--navy);color:#fff;text-align:center;font-size:19px;z-index:30">Report deleted</div>${tabs('Me')}`);
const drows = [...scG.querySelectorAll('.drow')], gScrim = $('#gScrim', scG), gSheet = $('#gSheet', scG), gDel = $('#gDel', scG), gToast = $('#gToast', scG);
const scG2 = mkScr(`<div class="hdr">Privacy &amp; Security</div><div class="hsub">You are in control</div>
 <div class="card" style="top:176px;height:110px"><div class="t1">Delete a report</div><div class="t2">Open a report in My documents and delete it.</div></div>
 <div class="card" id="gAcc" style="top:306px;height:120px;border-color:#e8b9af;background:#fff7f5"><div class="t1" style="color:var(--alert)">Delete account</div><div class="t2">Permanently delete your account and everything in it.</div></div>
 <div class="card" style="top:446px;height:110px"><div class="t1">Not shared</div><div class="t2">Reading uses an AI service, only with your permission.</div></div>${tabs('Me')}`);
const gAcc = $('#gAcc', scG2);

/* ---------- end card ---------- */
const s9 = $('#s9');
const mk9 = el(mark('#a9cf86', '#f2d58a', '#8fcf9a', 'rgba(255,255,255,0)', 230), s9, '', ABS + 'left:845px;top:70px');
const wm9 = el('<span style="color:#f6f9ef">Anevia</span><span style="color:#f2d58a">ONE</span>', s9, 'word', ABS + 'left:0;right:0;top:310px;text-align:center;font-size:128px');
const tg9 = ['Every record.', 'Every change.', 'One intelligent health history.'].map((t, i) => el(t, s9, 'tag', ABS + `left:0;right:0;top:${490 + i * 66}px;text-align:center;color:${i === 2 ? '#f2d58a' : 'rgba(246,249,239,.85)'};font-size:${i === 2 ? 40 : 36}px`));
const cta9 = el('Download App', s9, '', ABS + 'left:760px;top:710px;width:400px;height:88px;border-radius:44px;background:#f6f9ef;color:#0e2a1b;font-size:36px;font-weight:800;text-align:center;line-height:88px');
const dis9 = el('Sample data. AneviaONE organises your records. It does not diagnose or give treatment advice.', s9, '', ABS + 'left:0;right:0;top:820px;text-align:center;font-size:22px;color:rgba(246,249,239,.6)');

/* ---------- captions ---------- */
const CAPS = [[.6, 3.3, 'Your health has a history.'], [3.5, 5.6, 'But today it lives in pieces:'], [5.6, 8.4, 'reports in a drawer, results in an inbox,'], [8.4, 10.1, 'prescriptions in a photo roll.'], [10.3, 12.2, 'AneviaONE brings it together.'],
  [12.5, 15.3, 'Start with a report you already have.'], [15.5, 18, 'Upload a PDF, take a photo,'], [18.1, 21.8, 'or share it straight from WhatsApp or Gmail.'], [22.4, 25.6, 'Your original is always kept.'],
  [26.4, 29.6, 'With your permission, AneviaONE reads it,'], [29.7, 34.5, 'and turns dates, results and units into clear, organised information.'], [34.9, 38.5, 'Every result links back to the page it came from.'], [38.7, 41.9, 'Anything uncertain is held for you to confirm.'],
  [42.4, 45.3, 'Each report joins one timeline.'], [45.6, 50.1, 'The same test is connected across documents and years,'], [50.3, 53.6, 'so your history grows with you.'],
  [54.4, 58.2, 'See what changed since your last report,'], [58.5, 63.6, 'and how each measure is moving over time.'],
  [64.4, 68.5, 'Before an appointment, open For Doctor.'], [68.9, 75.5, 'A clear one-page summary of your history, ready to share.'],
  [76.4, 78.8, 'And you’re not alone in this.'], [79, 82.9, 'Keep records for a parent or a child you care for.'], [83.1, 86.6, 'Or invite an adult relative to share theirs.'], [86.9, 91.6, 'They approve every request, and can withdraw access at any time.'],
  [92.4, 95.5, 'Your health information belongs to you.'], [95.8, 101.4, 'Delete a report, or your entire account, whenever you choose.'],
  [102.6, 106, 'AneviaONE. Every record. Every change.'], [106.2, 109.6, 'One intelligent health history.']];
window.CAPS = CAPS;
const capEl = $('#caps'), capT = $('#capt');
let capShown = '';

/* ---------- master draw ---------- */
function draw(t) {
  // backgrounds
  const g = clamp((t - 101.4) / 1.2);
  $('#bgG').style.opacity = eio(g); $('#bgA').style.opacity = 1 - eio(g); $('#dots').style.opacity = .45 * (1 - eio(g));
  // scene 1
  kf(hA, t, [[.3, { o: 0, y: 30 }], [1.1, { o: 1, y: 0 }], [3.2, { o: 1 }], [4.0, { o: .0, y: -20 }], [9.6, { o: 0 }]]);
  lines.forEach((l, i) => kf(l, t, [[3.6 + i * 2.1, { o: 0, y: 24 }], [4.3 + i * 2.1, { o: 1, y: 0 }], [9.2, { o: 1 }], [9.8, { o: 0 }]]));
  docs.forEach((d) => {
    const fl = Math.sin(t * .8 + d.i * 1.7) * 10, fx = Math.cos(t * .6 + d.i) * 8;
    const cx = 960 - 105 - d.x, cy = 540 - 135 - d.yy;
    kf(d.e, t, [[0, { o: 0, s: .7, r: d.r }], [.5 + d.i * .12, { o: 0, s: .7, r: d.r }], [1.3 + d.i * .12, { o: 1, s: 1, r: d.r }], [8.2, { o: 1, s: 1, r: d.r }], [9.7, { o: 0, x: cx, y: cy, s: .15, r: 0 }]], fx, fl);
  });
  [[wa, 1.8, 330], [gm, 2.4, 1330], [ph, 3.0, 1180]].forEach(([e, a], i) => kf(e, t, [[a, { o: 0, y: 20 }], [a + .6, { o: 1, y: 0 }], [8.2, { o: 1 }], [9.4, { o: 0, y: -10 }]], 0, Math.sin(t + i) * 6));
  kf(mk1, t, [[9.8, { o: 0, s: .5 }], [10.9, { o: 1, s: 1 }], [11.6, { o: 1, s: 1 }], [12.3, { o: 0, s: 1.1, y: -60 }]]);
  kf(wm1, t, [[10.2, { o: 0, y: 20 }], [11, { o: 1, y: 0 }], [11.6, { o: 1 }], [12.3, { o: 0, y: -40 }]]);
  kf(tg1, t, [[10.6, { o: 0, y: 20 }], [11.3, { o: 1, y: 0 }], [11.7, { o: 1 }], [12.3, { o: 0 }]]);
  // copy column
  copyEls.forEach((c) => kf(c.e, t, win(c.a + .2, c.b - .1, .55, 26)));
  // phone
  kf($('#phone'), t, [[11.8, { o: 0, x: 220 }], [12.9, { o: 1, x: 0 }], [101.4, { o: 1, x: 0 }], [102.4, { o: 0, x: 160 }]]);
  // phone screens windows
  const W = (e, a, b, d = .45) => kf(e, t, win(a, b, d, 0));
  W(scA, 12.6, 26.3); W(scB, 26.2, 33.6); W(scB2, 33.3, 42.2); W(scC, 42.1, 54.2); W(scD, 54.1, 58.9); W(scD2, 58.8, 64.2); W(scE, 64.1, 76.2); W(scF, 76.1, 82.6); W(scF2, 82.4, 92.2); W(scG, 92.1, 97.6); W(scG2, 97.4, 102);
  scB.style.visibility = t >= 26.2 && t < 33.8 ? 'visible' : 'hidden';
  // A
  aOpts.forEach((o, i) => kf(o, t, [[12.9 + i * .22, { o: 0, y: 24 }], [13.5 + i * .22, { o: 1, y: 0 }], [20.9, { o: 1, y: 0 }], [21.8, { o: 0, y: -30 }]]));
  kf(aOpts[0], t, [[12.9, { o: 0, y: 24 }], [13.5, { o: 1, y: 0 }], [15.6, { s: 1 }], [16, { s: 1.04 }], [16.6, { s: 1 }], [20.9, { o: 1 }], [21.8, { o: 0, y: -30 }]]);
  kf(aDone, t, [[21.3, { o: 0, y: 40, s: .96 }], [22.2, { o: 1, y: 0, s: 1 }], [25.8, { o: 1 }], [26.3, { o: 0 }]]);
  aChips.forEach((c, i) => kf(c.e, t, [[c.t0, { o: 0, y: 24 }], [c.t0 + .6, { o: 1, y: 0 }], [20.2, { o: 1, x: 0, y: 0, s: 1 }], [21.4, { o: 0, x: 1060 - parseInt(chipDefs[i][1].match(/left:(\d+)/)[1]), y: -420, s: .3 }]]));
  kf(kept, t, [[22.4, { o: 0, y: 24 }], [23.1, { o: 1, y: 0 }], [25.6, { o: 1 }], [26.2, { o: 0 }]]);
  // B
  kf(bPage, t, [[26.5, { o: 0 }], [26.9, { o: 1 }], [33, { o: 1 }], [33.4, { o: 0 }]]);
  kf(bRead, t, [[29.6, { o: 0, y: 20 }], [30.1, { o: 1, y: 0 }], [33, { o: 1 }], [33.4, { o: 0 }]]);
  spin.style.transform = `rotate(${t * 360}deg)`;
  bHls.forEach((h, i) => { const p = prog(t, 30.2 + i * .9, 30.9 + i * .9); h.style.opacity = p; h.style.transformOrigin = 'left'; h.style.transform = `scaleX(${p})`; });
  kf(scan, t, [[29.7, { o: 0, y: 0 }], [30, { o: 1, y: 0 }], [34, { o: 1, y: 440 }]]);
  // consent sheet (on top of B)
  kf(consentScrim, t, [[26.3, { o: 0 }], [26.8, { o: 1 }], [28.8, { o: 1 }], [29.3, { o: 0 }]]);
  kf(consentSheet, t, [[26.4, { o: 1, y: 420 }], [27.2, { o: 1, y: 0 }], [28.9, { o: 1, y: 0 }], [29.5, { o: 1, y: 420 }]]);
  kf(allowBtn, t, [[28.2, { s: 1 }], [28.5, { s: .94 }], [28.8, { s: 1 }]]);
  // B2
  kf(r1, t, [[33.6, { o: 0, y: 30 }], [34.3, { o: 1, y: 0 }], [41.8, { o: 1 }], [42.2, { o: 0 }]]);
  kf(r2, t, [[34.2, { o: 0, y: 30 }], [34.9, { o: 1, y: 0 }], [41.8, { o: 1 }], [42.2, { o: 0 }]]);
  kf(thumb, t, [[35.6, { o: 0, y: 40 }], [36.4, { o: 1, y: 0 }], [41.8, { o: 1 }], [42.2, { o: 0 }]]);
  thl.style.background = `rgba(52,191,220,${.12 + .22 * prog(t, 36.5, 37.4)})`;
  const conf = prog(t, 39.6, 40.2);
  r2p.textContent = conf > .5 ? 'Confirmed ✓' : 'Review'; r2p.style.background = conf > .5 ? '#dcf3e7' : '#fdf0d4'; r2p.style.color = conf > .5 ? '#1f7a50' : '#9a6b12'; r2b.style.opacity = 1 - conf; r2b.style.transform = `scale(${t > 39.5 && t < 39.8 ? .92 : 1})`;
  // C
  tls.forEach((c, i) => {
    kf(c, t, [[43 + i * .8, { o: 0, y: 40 }], [43.7 + i * .8, { o: 1, y: 0 }], [53.8, { o: 1 }]]);
    const hit = [0, 2, 5].includes(i), p = hit ? prog(t, 48.6 + [0, 2, 5].indexOf(i) * .4, 49.2 + [0, 2, 5].indexOf(i) * .4) : 0;
    c.style.borderColor = p > .5 ? '#11a8c8' : '#e3e9f1'; c.style.boxShadow = p > .5 ? '0 0 0 3px rgba(17,168,200,.22)' : '0 6px 18px rgba(6,31,68,.06)';
    c.style.opacity = (hit || t < 48.4) ? c.style.opacity : (t > 48.4 ? Math.max(.35, parseFloat(c.style.opacity) * (1 - .65 * prog(t, 48.4, 49))) : c.style.opacity);
  });
  kf(ldlpill, t, [[48.4, { o: 0, y: -12 }], [49, { o: 1, y: 0 }], [53.8, { o: 1 }]]);
  // D
  chgs.forEach((c, i) => kf(c, t, [[54.6 + i * .5, { o: 0, y: 36 }], [55.3 + i * .5, { o: 1, y: 0 }], [58.6, { o: 1 }]]));
  sps.forEach((p, i) => p.setAttribute('stroke-dashoffset', 1 - prog(t, 55.6 + i * .5, 57.2 + i * .5)));
  trds.forEach((c, i) => kf(c, t, [[59.2 + i * .5, { o: 0, y: 36 }], [59.9 + i * .5, { o: 1, y: 0 }], [63.8, { o: 1 }]]));
  tps.forEach((p, i) => p.setAttribute('stroke-dashoffset', 1 - prog(t, 60 + i * .6, 62 + i * .6)));
  // E
  eCards.forEach((c, i) => kf(c, t, [[64.8 + i * 1.3, { o: 0, y: 36 }], [65.6 + i * 1.3, { o: 1, y: 0 }], [75.8, { o: 1 }]]));
  kf(eShare, t, [[70, { o: 0, y: 20 }], [70.7, { o: 1, y: 0 }], [72.6, { s: 1 }], [73.2, { s: 1.05 }], [73.8, { s: 1 }], [74.4, { s: 1.05 }], [75, { s: 1 }]]);
  // F
  kf(pbar, t, [[76.6, { o: 0, y: -10 }], [77.2, { o: 1, y: 0 }], [78.4, { s: 1 }], [78.8, { s: .94 }], [79.2, { s: 1 }]]);
  kf(fScrim, t, [[78.8, { o: 0 }], [79.3, { o: 1 }], [81.3, { o: 1 }], [81.8, { o: 0 }]]);
  kf(fSheet, t, [[78.8, { y: 520 }], [79.7, { y: 0 }], [81.3, { y: 0 }], [82.1, { y: 520 }]]);
  prows.forEach((r, i) => { const hl = i === 1 ? prog(t, 80.4, 80.9) : 0; r.style.borderColor = hl > .5 ? '#11a8c8' : '#e3e9f1'; r.style.background = hl > .5 ? '#eaf7fb' : '#fff'; });
  pbar.textContent = t > 81.6 ? 'Dad ▾' : 'Me ▾';
  kf(banner, t, [[81.8, { o: 0, y: -14 }], [82.4, { o: 1, y: 0 }]]);
  fms.forEach((c, i) => kf(c, t, [[83.1 + i * .9, { o: 0, y: 34 }], [83.8 + i * .9, { o: 1, y: 0 }], [91.8, { o: 1 }]]));
  const ap = prog(t, 88.5, 89);
  apr.textContent = ap > .5 ? 'Approved · view only' : 'Approve'; apr.style.background = ap > .5 ? '#dcf3e7' : 'var(--navy2)'; apr.style.color = ap > .5 ? '#1f7a50' : '#fff';
  kf(rev, t, [[89.6, { o: 0 }], [90.1, { o: 1 }]]);
  const rv = prog(t, 90.6, 91);
  fnote.textContent = rv > .5 ? 'Access removed. It ends immediately.' : (ap > .5 ? 'Meera can view. You can remove access at any time.' : '');
  // G
  drows.forEach((r, i) => {
    if (i === 1) kf(r, t, [[92.6, { o: 0, y: 24 }], [93.2, { o: 1, x: 0 }], [94.2, { x: 0 }], [94.8, { x: -70 }], [96.2, { x: -70 }], [96.8, { o: 0, x: -460 }]]);
    else kf(r, t, [[92.6 + i * .15, { o: 0, y: 24 }], [93.2 + i * .15, { o: 1, y: 0 }], [96.4, { y: 0 }], [97, { y: i > 1 ? -108 : 0 }]]);
  });
  kf(gScrim, t, [[95, { o: 0 }], [95.4, { o: 1 }], [96.3, { o: 1 }], [96.7, { o: 0 }]]);
  kf(gSheet, t, [[95, { y: 460 }], [95.7, { y: 0 }], [96.3, { y: 0 }], [96.9, { y: 460 }]]);
  kf(gDel, t, [[95.8, { s: 1 }], [96, { s: .95 }], [96.3, { s: 1 }]]);
  kf(gToast, t, [[96.9, { o: 0, y: 20 }], [97.3, { o: 1, y: 0 }], [97.6, { o: 0 }]]);
  kf(gAcc, t, [[98.4, { o: 0, y: 30 }], [99.1, { o: 1, y: 0 }], [100, { s: 1 }], [100.5, { s: 1.03 }], [101, { s: 1 }]]);
  gAcc.style.boxShadow = t > 100.3 ? '0 0 0 3px rgba(196,84,59,.2)' : '';
  // end card
  kf(mk9, t, [[102.4, { o: 0, s: .6, y: 20 }], [103.4, { o: 1, s: 1, y: 0 }]]);
  kf(wm9, t, [[102.9, { o: 0, y: 20 }], [103.7, { o: 1, y: 0 }]]);
  tg9.forEach((e, i) => kf(e, t, [[103.6 + i * .9, { o: 0, y: 20 }], [104.3 + i * .9, { o: 1, y: 0 }]]));
  kf(cta9, t, [[106.6, { o: 0, y: 20 }], [107.3, { o: 1, y: 0 }], [108.6, { s: 1 }], [109, { s: 1.04 }], [109.5, { s: 1 }]]);
  kf(dis9, t, [[107.4, { o: 0 }], [108, { o: 1 }]]);
  kf($('#samp'), t, [[1, { o: 0 }], [1.6, { o: 1 }], [100.6, { o: 1 }], [101.4, { o: 0 }]]);
  $('#s1').style.visibility = t < 12.4 ? 'visible' : 'hidden';
  $('#side').style.visibility = t >= 15 && t < 26.4 ? 'visible' : 'hidden';
  // captions
  const c = CAPS.find((x) => t >= x[0] && t < x[1]);
  const txt = c ? c[2] : '';
  if (txt !== capShown) { capShown = txt; capT.textContent = txt; }
  const wide = t < 12.4 || t >= 101.4;
  capEl.style.left = wide ? '360px' : '130px'; capEl.style.width = wide ? '1200px' : '900px'; capEl.style.top = wide ? '884px' : '800px';
  const ci = c ? Math.min((t - c[0]) / .3, (c[1] - t) / .25, 1) : 0, cp = clamp(ci);
  capEl.style.opacity = cp; capEl.style.visibility = c ? 'visible' : 'hidden'; capEl.style.transform = `translateY(${(1 - cp) * 14}px)`;
  $('#capdot').style.opacity = .5 + .5 * Math.sin(t * 6);
}
/* consent sheet built last so it sits above scene B */
const consentScrim = el('', scB, 'scrim', '');
const consentSheet = el(`<div class="t1" style="font-size:26px">Read this report?</div><div class="t2" style="font-size:18px;margin:10px 0 22px">AneviaONE will use an AI service to read it. This only happens with your permission.</div><div class="btn" id="allow" style="background:var(--teal);color:#fff;display:block;text-align:center;margin-bottom:12px">Allow</div><div class="btn" style="background:#eef3f8;color:var(--navy);display:block;text-align:center">Not now</div>`, scB, 'sheet', '');
const allowBtn = $('#allow', scB);

window.seek = (t) => { draw(t); };
window.DURATION = DURATION;
/* fit to window, and play when not rendering */
function fit() { const s = Math.min(innerWidth / 1920, innerHeight / 1080); const st = $('#stage'); st.style.transform = `scale(${s})`; st.style.left = (innerWidth - 1920 * s) / 2 + 'px'; st.style.top = (innerHeight - 1080 * s) / 2 + 'px'; }
const q = new URLSearchParams(location.search);
if (!q.has('render')) { fit(); addEventListener('resize', fit); let t0 = performance.now() - (parseFloat(q.get('t') || 0) * 1000); const loop = (n) => { draw(((n - t0) / 1000) % DURATION); requestAnimationFrame(loop); }; requestAnimationFrame(loop); }
else draw(0);
})();
