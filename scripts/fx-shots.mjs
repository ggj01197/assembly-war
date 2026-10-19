// 공격 연출 연속 캡처: 카드를 놓고 일정 간격으로 찍어 한 장(몽타주)으로 만든다. node scripts/fx-shots.mjs [stage=c1-3] [장수=12] [간격ms=330]
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
const ID = process.argv[2] ?? 'c1-3', N = Number(process.argv[3] ?? 12), GAP = Number(process.argv[4] ?? 330), W = 390, H = 844;
const OUT = fileURLToPath(new URL('../../00_PROJECT_CONTROL/shots/', import.meta.url));
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
const page = await ctx.newPage(); const errs = [];
page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto('http://localhost:5190/', { waitUntil: 'networkidle' });
await page.waitForSelector('.screen.hangar:not([hidden])');
await page.evaluate(id => window.__aw.startBattle(id), ID);
await page.waitForSelector('.screen.battle:not([hidden])');
const cards = await page.locator('.card[data-i]').all();
const lane = async (l, y = H - 300) => page.mouse.click(((l + 0.5) / 3) * W * 0.9 + W * 0.05, y);
// 처음 14초: 카드를 계속 놓아 전선을 만든다
for (let i = 0; i < 9; i++) { await cards[i % 6].click().catch(() => {}); await lane(i % 3); await page.waitForTimeout(1500); }
for (let i = 0; i < N; i++) { await page.screenshot({ path: `${OUT}/_fx_${String(i).padStart(2, '0')}.png` }); await page.waitForTimeout(GAP); }
console.log('errors', errs.slice(0, 4));
await browser.close();
