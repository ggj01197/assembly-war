// 조립 런 M2 점검: 보스 라운드 화면·전투, 유물 선택 (개발 서버 5190 필요)
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
const OUT = fileURLToPath(new URL('../../00_PROJECT_CONTROL/shots/', import.meta.url));
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto('http://localhost:5190/', { waitUntil: 'networkidle' });
await page.waitForSelector('.screen.hangar:not([hidden])', { timeout: 20000 });
const shot = async n => { await page.waitForTimeout(700); await page.screenshot({ path: `${OUT}/390x844_m2_${n}.png` }); console.log('shot', n); };
await page.locator('#hgRun').click(); await page.waitForSelector('.screen.run:not([hidden])');
// 라운드를 빨리 보기: 매 라운드 추천 조립 → 전투 → 건너뛰기 (이기든 지든 다음 라운드)
for (let r = 1; r <= 6; r++) {
  if (r === 3 || r === 2) await shot(`${r}_build`);
  await page.locator('#rnAuto').click();
  await page.locator('#rnGo').click();
  await page.waitForSelector('.screen.battle.run-hud:not([hidden])');
  if (r === 3) { await page.waitForTimeout(2500); await shot('3_boss_battle'); }
  await page.locator('.rb-speed button[data-s="skip"]').click();
  await page.waitForSelector('.rn-result', { timeout: 30000 });
  if (await page.locator('.rn-relic').count()) { await shot(`${r}_relic`); await page.locator('.rn-relic').first().click(); await page.waitForTimeout(300); }
  if (await page.locator('#rnNext').count()) await page.locator('#rnNext').click(); else break;
}
await shot('end');
console.log('errors', errors.length, errors.slice(0, 4));
await browser.close();
