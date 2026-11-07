// Records an animated scene (problem.html by default, or solution.html) to a .webm at 1280x720.
// Usage: node record-problem.js <out dir> [file.html] [ms to record]
//   node record-problem.js out                       -> problem.html, 12.6 s
//   node record-problem.js out solution.html 18900   -> solution.html, 18.9 s
// Page load takes about 1.2 s; trim that from the start of the recording (the script prints it).
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const out = process.argv[2] || '.';
  const file = process.argv[3] || 'problem.html';
  const ms = Number(process.argv[4] || 12600);
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: out, size: { width: 1280, height: 720 } } });
  const p = await ctx.newPage();
  const t0 = Date.now();
  await p.goto('file://' + path.join(__dirname, file), { waitUntil: 'networkidle' });
  console.log('loaded after', (Date.now() - t0) / 1000, 's');
  await p.waitForTimeout(ms);
  await ctx.close(); await b.close();
})();
