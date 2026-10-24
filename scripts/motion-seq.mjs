// 움직임 점검: 조립 런 전투를 일정 간격으로 찍어 한 장에 이어 붙일 조각을 만든다 (개발 서버 5190 필요)
//   node scripts/motion-seq.mjs [장수=24] [간격ms=110] [시작대기ms=800]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const N = Number(process.argv[2] ?? 24), GAP = Number(process.argv[3] ?? 110), WAIT = Number(process.argv[4] ?? 800);
const OUT = fileURLToPath(new URL('../../00_PROJECT_CONTROL/shots/motion/', import.meta.url));
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1.5, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
await page.goto('http://localhost:5190/', { waitUntil: 'networkidle' });
await page.waitForSelector('.screen.hangar:not([hidden])');
await page.locator('#hgRun').click(); await page.waitForSelector('.screen.run:not([hidden])');
await page.locator('#rnAuto').click(); await page.locator('#rnGo').click();
await page.waitForSelector('.screen.battle.run-hud:not([hidden])');
await page.waitForTimeout(WAIT);
for (let i = 0; i < N; i++) { await page.screenshot({ path: `${OUT}/s${String(i).padStart(2, '0')}.png`, clip: { x: Number(process.env.CX ?? 40), y: Number(process.env.CY ?? 150), width: Number(process.env.CW ?? 310), height: Number(process.env.CH ?? 560) } }); await page.waitForTimeout(GAP); }
await browser.close();
console.log('ok', N);
