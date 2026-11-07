// Records problem.html (the animated opener) to problem.webm at 1280x720.
// Usage: node record-problem.js <out dir>
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const out = process.argv[2] || '.';
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: out, size: { width: 1280, height: 720 } } });
  const p = await ctx.newPage();
  const t0 = Date.now();
  await p.goto('file://' + path.join(__dirname, 'problem.html'), { waitUntil: 'networkidle' });
  console.log('loaded after', (Date.now() - t0) / 1000, 's');
  await p.waitForTimeout(12600);
  await ctx.close(); await b.close();
})();
