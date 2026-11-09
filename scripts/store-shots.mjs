// 스토어 스크린샷 캡처 (개발 서버 5190 필요)
//   node scripts/store-shots.mjs ios   → 440x956 @3 = 1320x2868 (iPhone 6.9")
//   node scripts/store-shots.mjs play  → 360x640 @3 = 1080x1920 (Play 폰)
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const kind = process.argv[2] ?? 'ios';
const [W, H, DPR] = kind === 'play' ? [360, 640, 3] : [440, 956, 3];
const OUT = fileURLToPath(new URL(`../../00_PROJECT_CONTROL/store-assets/screenshots/${kind}/`, import.meta.url));
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto('http://localhost:5190/', { waitUntil: 'networkidle' });
await page.waitForSelector('.screen.hangar:not([hidden])', { timeout: 20000 });
// 보기 좋은 진행 상태: 광석·보급권을 넉넉히 (스크린샷 전용, 개발 서버의 디버그 훅)
await page.evaluate(() => { window.__aw.store.setState({ save: { ...window.__aw.store.getState().save, ore: 2400, tickets: 3 } }); });
const shot = async n => { await page.waitForTimeout(700); await page.evaluate(() => { document.querySelectorAll('.hg-tip, #hgRun').forEach(e => e.remove()); }); await page.screenshot({ path: `${OUT}/${n}.png` }); console.log('shot', n); };
await shot('1_hangar');
await page.evaluate(() => window.__aw.nav.openAssembly(0));
await page.waitForTimeout(500);
await page.locator('.bpcard').nth(3).click().catch(() => {});
await shot('2_assembly');
await page.evaluate(() => window.__aw.nav.goHangar(0));
await page.waitForSelector('.screen.hangar:not([hidden])');
await page.locator('#nvSupply').click().catch(() => {});
await shot('3_supply');
await page.evaluate(() => window.__aw.nav.goHangar(0));
await page.waitForSelector('.screen.hangar:not([hidden])');
await page.evaluate(() => window.__aw.startBattle('c1-3'));
await page.waitForSelector('.screen.battle:not([hidden])');
await page.waitForTimeout(900);
const cards = await page.locator('.card[data-i]').all();
const spots = [[4.5, 12], [13.5, 12], [9, 11], [4.5, 10], [13.5, 10], [9, 12.5]];
const place = async (ci, k) => { const [xt, yt] = spots[k % spots.length]; await cards[ci]?.click().catch(() => {}); await page.mouse.click(W * (0.05 + 0.9 * (xt / 18)), (H - 198) - (yt / 32) * (H - 198 - 114)); };
for (let k = 0; k < 4; k++) { await place(k % 3, k); await page.waitForTimeout(1300); }
await page.waitForTimeout(5000);
await shot('4_battle');
console.log('errors', errors.length, errors.slice(0, 5));
await browser.close();
