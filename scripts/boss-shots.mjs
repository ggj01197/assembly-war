// 보스·5분 버티기 화면 점검 (개발 서버 5190 필요): node scripts/boss-shots.mjs [stage=c2-4] [대기초=55] [폭=390] [높이=844]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const ID = process.argv[2] ?? 'c2-4', WAIT = Number(process.argv[3] ?? 55), W = Number(process.argv[4] ?? 390), H = Number(process.argv[5] ?? 844);
const OUT = fileURLToPath(new URL('../../00_PROJECT_CONTROL/shots/', import.meta.url));
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto('http://localhost:5190/', { waitUntil: 'networkidle' });
await page.waitForSelector('.screen.hangar:not([hidden])', { timeout: 20000 });
await page.evaluate(() => window.__aw.store.setState(s => ({ save: { ...s.save, commanderExp: 4000 } })));
await page.evaluate(id => window.__aw.startBattle(id), ID);
await page.waitForSelector('.screen.battle:not([hidden])');
const cards = await page.locator('.card[data-i]').all();
const lane = async (l, y = H - 280) => page.mouse.click(((l + 0.5) / 3) * W * 0.9 + W * 0.05, y);
const t0 = Date.now(); let n = 0, shots = 0;
while ((Date.now() - t0) / 1000 < WAIT) {
  await cards[n % 6].click().catch(() => {}); await lane(n % 3); n++;
  await page.waitForTimeout(1500);
  if (await page.locator('.screen.result:not([hidden])').count()) break;
}
await page.screenshot({ path: `${OUT}/${W}x${H}_boss_${ID}_a.png` });
await page.waitForTimeout(6000);
await page.screenshot({ path: `${OUT}/${W}x${H}_boss_${ID}_b.png` });
console.log('errors', errors.length, errors.slice(0, 5), 'units placed', n);
await browser.close();
