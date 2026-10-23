// 걷기·공격 동작 점검: 한 유닛을 놓고 일정 간격으로 잘라 찍는다 (개발 서버 5190 필요)
//   node scripts/walk-shots.mjs [카드번호=0] [찍는횟수=8] [간격ms=110] [x타일=9] [y타일=12]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const W = 390, H = 844, CARD = Number(process.argv[2] ?? 0), N = Number(process.argv[3] ?? 8), GAP = Number(process.argv[4] ?? 110);
const XT = Number(process.argv[5] ?? 9), YT = Number(process.argv[6] ?? 12);
const OUT = fileURLToPath(new URL('../../00_PROJECT_CONTROL/shots/walk/', import.meta.url));
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
await page.goto('http://localhost:5190/', { waitUntil: 'networkidle' });
await page.waitForSelector('.screen.hangar:not([hidden])', { timeout: 20000 });
await page.evaluate(id => window.__aw.startBattle(id), process.env.STAGE ?? 'c1-1');
await page.waitForSelector('.screen.battle:not([hidden])');
await page.waitForTimeout(800);
const cards = await page.locator('.card[data-i]').all();
await cards[CARD].click();
await page.mouse.click(W * (0.05 + 0.9 * (XT / 18)), (H - 198) - (YT / 32) * (H - 198 - 114));
await page.waitForTimeout(Number(process.env.WAIT ?? 700));
for (let i = 0; i < N; i++) { await page.screenshot({ path: `${OUT}/f${i}.png`, clip: { x: 40, y: Number(process.env.CY ?? 250), width: 310, height: 330 } }); await page.waitForTimeout(GAP); }
await browser.close();
console.log('ok', OUT);
