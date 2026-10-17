// 화면 점검: 실제 크롬으로 390×844 에서 오프닝(건너뛰기)→격납고→조립→작전 선택→전투→결과를 캡처하고 콘솔 오류를 센다.
//   (개발 서버가 5190 에서 돈다고 가정)  node scripts/shots.mjs [폭=390] [높이=844] [출력폴더=../00_PROJECT_CONTROL/shots]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const W = Number(process.argv[2] ?? 390), H = Number(process.argv[3] ?? 844);
const OUT = process.argv[4] ?? fileURLToPath(new URL('../../00_PROJECT_CONTROL/shots/', import.meta.url));
mkdirSync(OUT, { recursive: true });
const URL_ = 'http://localhost:5190/';

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('response', r => { if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url()}`); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
const shot = async (name) => { await page.screenshot({ path: `${OUT}/${W}x${H}_${name}.png` }); console.log('shot', name); };
const wait = ms => page.waitForTimeout(ms);

await page.goto(URL_, { waitUntil: 'networkidle' });
await page.waitForSelector('.screen.hangar:not([hidden])', { timeout: 20000 });
await wait(600);
await shot('1_hangar');

// 격납고 슬롯 바꿔 보기 → 조립
await page.click('.hg-slots .slot:nth-child(3)'); await wait(200);
await shot('2_hangar_slot3');
await page.click('#hgAssemble'); await page.waitForSelector('.screen.assembly:not([hidden])'); await wait(400);
await shot('3_assembly_legs');
await page.click('.as-tabs button[data-k="body"]'); await wait(200);
await page.click('.as-list .pchip:nth-child(1)'); await wait(300); // 정찰 팔형 → 무기 자동 맞춤
await shot('4_assembly_body_pick');
await page.click('.as-tabs button[data-k="legs"]'); await wait(200);
await page.click('.as-list .pchip:nth-child(1)'); await wait(300); // 경량 이족 + 탑형이면 하중 초과 가능
await shot('5_assembly_legs_pick');
await page.click('.as-tabs button[data-k="accessory"]'); await wait(200);
await shot('6_assembly_accessory');
await page.click('#asBack'); await page.waitForSelector('.screen.hangar:not([hidden])'); await wait(300);

// 작전 선택 시트
await page.click('#hgSortie'); await wait(400);
await shot('7_stage_sheet');
await page.click('.stage:not(.locked)'); await page.waitForSelector('.screen.battle:not([hidden])'); await wait(1500);
await shot('8_battle_start');

// 전투: 카드를 돌려 가며 길에 놓는다
const box = await page.locator('.bt-cards').boundingBox();
const cards = await page.locator('.card[data-i]').all();
let t0 = Date.now(), n = 0, shotMid = false;
const LIMIT = process.env.QUICK ? 9000 : 100000;
while (Date.now() - t0 < LIMIT) {
  if (await page.locator('.screen.result:not([hidden])').count()) break;
  const i = n % 3; n++;
  await cards[i].click().catch(() => {});
  const lane = n % 3;
  await page.mouse.click(((lane + 0.5) / 3) * W, H - 260);
  await wait(900);
  if (!shotMid && Date.now() - t0 > (process.env.QUICK ? 7000 : 12000)) { shotMid = true; await shot('9_battle_mid'); }
}
if (!process.env.QUICK) { await page.waitForSelector('.screen.result:not([hidden])', { timeout: 120000 }).catch(() => {}); await wait(500); await shot('10_result'); }

const overflow = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, sh: document.documentElement.scrollHeight, ch: document.documentElement.clientHeight }));
console.log('overflow', JSON.stringify(overflow), 'box', JSON.stringify(box));
console.log('console errors:', errors.length); errors.slice(0, 8).forEach(e => console.log(' -', e));
await browser.close();
process.exit(errors.length ? 1 : 0);
