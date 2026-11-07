// Records the Presafe demo on the live site with Playwright (captions burned in).
// Usage: set OB / DEFAULT_AFTER_MS to a fresh 3-minute obligation (scripts/testnet/seed.mjs --minutes 3 --grace-minutes 1), then `node record.js`.
// Cut the wait with ffmpeg using the printed waitStart / waitEnd marks.
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = 'https://presafe.ahmardchain.workers.dev';
const OB = '11';
const DEFAULT_AFTER_MS = Number(1794016851389000000n / 1000000n);

const CARD = (title, sub, small) => `<!doctype html><html><head><meta charset="utf-8"><style>
@import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist:wght@400;600&family=Geist+Mono&display=swap');
html,body{margin:0;height:100%;background:#0e0f11;color:#f4f1ea;font-family:Geist,system-ui,sans-serif}
.w{height:100%;display:flex;flex-direction:column;justify-content:center;padding:0 110px;box-sizing:border-box}
h1{font-family:'Instrument Serif',Georgia,serif;font-weight:400;font-size:76px;line-height:1.02;margin:0;letter-spacing:-.01em}
h1 em{color:#2fa784}
p{font-size:26px;color:#c9c5bc;margin:26px 0 0;max-width:30em;line-height:1.4}
.s{font-family:'Geist Mono',monospace;font-size:15px;letter-spacing:.12em;text-transform:uppercase;color:#8c8a85;margin-top:40px}
</style></head><body><div class="w"><h1>${title}</h1>${sub ? `<p>${sub}</p>` : ''}${small ? `<div class="s">${small}</div>` : ''}</div></body></html>`;

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: '.', size: { width: 1280, height: 720 } } });
  const p = await ctx.newPage();
  const t0 = Date.now(); const marks = {};
  const mark = (k) => { marks[k] = (Date.now() - t0) / 1000; console.log(k, marks[k].toFixed(1)); };
  const wait = (s) => p.waitForTimeout(s * 1000);
  const caption = async (text) => {
    await p.evaluate((t) => {
      let el = document.getElementById('__cap');
      if (!el) {
        el = document.createElement('div'); el.id = '__cap';
        el.style.cssText = 'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:99999;max-width:1040px;padding:14px 22px;border-radius:10px;background:rgba(14,15,17,.92);color:#f4f1ea;font:500 22px/1.35 Geist,system-ui,sans-serif;text-align:center;box-shadow:0 10px 30px rgba(0,0,0,.25);transition:opacity .25s';
        document.body.appendChild(el);
      }
      el.style.opacity = t ? '1' : '0'; el.textContent = t || '';
    }, text);
  };
  const go = async (path) => {
    await p.goto(BASE + path, { waitUntil: 'networkidle' });
    await p.addStyleTag({ content: 'nextjs-portal{display:none!important} html{scroll-behavior:smooth}' });
  };
  const scroll = (y) => p.evaluate((y) => window.scrollTo({ top: y, behavior: 'smooth' }), y);

  // 1. Problem
  await p.setContent(CARD('Paid upfront.<br>Left with nothing.', 'Festivals, tours and custom orders take your money first. When they fail to deliver, customers are unsecured creditors.', '11 of 521 ticket buyers refunded · Evolutions Festival, NY · FingerLakes1, Sep 2026'));
  await wait(6);
  // 2. Landing
  await go('/'); await caption('Presafe: a business posts a USDC bond on NEAR. Customers are protected; the business keeps the cash.'); await wait(6);
  await scroll(1650); await caption('A bond, not escrow: payments go straight to the business. Only the bond waits.'); await wait(5);
  // 3. Badge
  await go('/b/lagos-sound-fest.testnet'); await caption('A public badge, read live from the contract. No wallet needed to check it.'); await wait(6);
  await scroll(520); await wait(3);
  // 4. Pay
  await go(`/pay/${OB}`); await caption('A customer buys a $2 ticket. They see what they can claim back before paying.'); await wait(5);
  await caption('One tap. Signed in the browser and relayed: no wallet, no gas.');
  await p.getByRole('button', { name: /^Pay 2\.00/ }).click();
  await p.getByText("You're covered.").waitFor({ timeout: 90000 }); await wait(4);
  await scroll(900); await caption('Customers can also pay from Base, Arbitrum, Ethereum or Solana through NEAR Intents 1Click (verified on mainnet).'); await wait(7);
  // 5. Badge after payment
  await go('/b/lagos-sound-fest.testnet'); await scroll(520); await caption('Lagos Sound Fest already has the $2. Nothing is locked except the bond.'); await wait(5);
  mark('waitStart');
  await p.setContent(CARD('Waiting for the deadline…', '', 'this part is cut from the video'));
  const until = DEFAULT_AFTER_MS + 8000 - Date.now(); console.log('waiting ms', until);
  if (until > 0) await p.waitForTimeout(until);
  mark('waitEnd');
  // 6. Deadline card
  await p.setContent(CARD('The deadline passes.<br><em>No show.</em>', 'Lagos Sound Fest never confirms delivery.'));
  await wait(4);
  // 7. Claims
  await go('/claims'); await caption('Once the deadline and grace period pass, anyone can open claims.'); await wait(4);
  await p.getByRole('button', { name: /open claims/ }).first().click();
  await p.getByRole('button', { name: /^Claim / }).first().waitFor({ timeout: 90000 });
  await caption('The customer claims their share of the bond. No gas, no wallet popup.'); await wait(3);
  await p.getByRole('button', { name: /^Claim / }).first().click();
  await p.getByText(/Paid back/).first().waitFor({ timeout: 90000 }); await wait(4);
  // 8. Badge after claim
  await go('/b/lagos-sound-fest.testnet'); await caption('The badge shows the claim paid. Every number is on chain.'); await wait(6);
  // 9. End card
  await p.setContent(CARD('Paid upfront.<br><em>Protected</em> anyway.', 'presafe.ahmardchain.workers.dev · github.com/ahmardchain/presafe', 'USDC on NEAR · NEAR Intents 1Click · meta transactions · built at NEAR HACKATHON'));
  await wait(6);
  mark('end');
  fs.writeFileSync('marks.json', JSON.stringify(marks));
  await ctx.close(); await b.close();
  console.log('video', fs.readdirSync('.').filter(f => f.endsWith('.webm')));
})().catch(e => { console.log('FAILED', e.message.split('\n')[0]); process.exit(1); });
