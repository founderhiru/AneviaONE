const { chromium } = require('playwright');
(async () => {
  const ts = process.argv.slice(2).map(Number);
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto('file://' + __dirname + '/index.html?render=1'); await p.waitForTimeout(500);
  for (const t of ts) { await p.evaluate(t => window.seek(t), t); await p.screenshot({ path: `/tmp/f_${t}.png` }); }
  console.log('errors:', errs); await b.close();
})();
