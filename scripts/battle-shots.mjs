// 전장 연출 점검: 전투를 직접 시작해 카드를 놓고 몇 시점을 캡처한다 (개발 서버 5190 필요)
//   node scripts/battle-shots.mjs [폭=390] [높이=844] [출력폴더=../00_PROJECT_CONTROL/shots]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const W = Number(process.argv[2] ?? 390), H = Number(process.argv[3] ?? 844);
const OUT = process.argv[4] ?? fileURLToPath(new URL('../../00_PROJECT_CONTROL/shots/', import.meta.url));
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('response', r => { if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url()}`); });
await page.goto('http://localhost:5190/', { waitUntil: 'networkidle' });
await page.waitForSelector('.screen.hangar:not([hidden])', { timeout: 20000 });
await page.evaluate(id => window.__aw.startBattle(id), process.env.STAGE ?? 'c1-3');
await page.waitForSelector('.screen.battle:not([hidden])');
const shot = async n => { await page.screenshot({ path: `${OUT}/${W}x${H}_b_${n}.png` }); console.log('shot', n); };
await page.waitForTimeout(900); await shot('0_intro');
const cards = await page.locator('.card[data-i]').all();
let n = 0;
const place = async (ci, lane) => { await cards[ci].click().catch(() => {}); await page.mouse.click(((lane + 0.5) / 3) * W * 0.9 + W * 0.05, H - 280); };
await place(0, 1); await page.waitForTimeout(120); await shot('1_spawn_a'); await page.waitForTimeout(250); await shot('2_spawn_b');
for (const t of [4000, 4000, 5000, 6000]) {
  await place(n % 3, n % 3); n++;
  await page.waitForTimeout(t); await shot('3_' + n);
  if (await page.locator('.screen.result:not([hidden])').count()) break;
}
console.log('errors', errors.length, errors.slice(0, 5));
await browser.close();
