// 기기 폭·글꼴 배율 점검 (DEVICE_SIZE_QA 기준, 개발 서버 5190 필요)
//   node scripts/device-qa.mjs [빠르게=0|1] [캡처폴더]
// 폭 목록(320~430·폴드·태블릿·가로) × 글꼴 1.0/1.3 으로 주요 화면을 열어 넘침·화면 밖·글자 잘림·작은 터치 영역을 센다.
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
const FAST = process.argv[2] === '1';
const OUT = process.argv[3] ?? process.env.TEMP + '/aw-qa';
mkdirSync(OUT, { recursive: true });
const CONFIGS = [
  [320, 568, 1], [360, 640, 1], [360, 780, 1], [375, 667, 1], [393, 852, 1], [412, 915, 1], [430, 932, 1],
  [344, 882, 1], [673, 841, 1], [768, 1024, 1], [844, 390, 1], [667, 375, 1],
  [360, 780, 1.3], [320, 568, 1.3], [412, 915, 1.3],
].filter((_, i) => !FAST || [0, 2, 6, 10, 12, 13].includes(i));

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const rows = [];

/** 페이지 안에서 실행: 글꼴 배율 적용 + 문제 수집 */
const scanFn = ({ k, battle }) => {
  const doc = document, W = innerWidth, H = innerHeight;
  if (k !== 1) for (const el of doc.body.querySelectorAll('*')) {
    if (el.dataset.qaScaled || ![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
    el.style.fontSize = parseFloat(getComputedStyle(el).fontSize) * k + 'px'; el.dataset.qaScaled = '1';
  }
  const issues = [], seen = new Set();
  const add = (type, el, extra = '') => {
    const label = (el.className && String(el.className).split(' ')[0]) || el.tagName.toLowerCase();
    const text = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 18);
    const key = type + label + text; if (seen.has(key)) return; seen.add(key);
    issues.push(`${type}:${label}${text ? '「' + text + '」' : ''}${extra}`);
  };
  const inScroll = el => { for (let p = el.parentElement; p && p !== doc.body; p = p.parentElement) { const o = getComputedStyle(p); if (/(auto|scroll)/.test(o.overflowX) ) return true; } return false; };
  if (doc.documentElement.scrollWidth > W + 1) issues.push(`가로넘침 ${doc.documentElement.scrollWidth}>${W}`);
  for (const el of doc.querySelectorAll('#ui *')) {
    const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) continue;
    const r = el.getBoundingClientRect(); if (r.width === 0 || r.height === 0) continue;
    if (el.closest('[hidden]')) continue;
    if ((r.right > W + 2 || r.left < -2) && !inScroll(el) && !el.closest('.bt-boss, .bt-combo, .bt-toast, .cs-img')) add('화면밖', el, ` ${Math.round(r.left)}~${Math.round(r.right)}/${W}`);
    if (el.tagName === 'BUTTON' && (r.height < 30 || r.width < 30) && !el.closest('.at-grid')) add('작은버튼', el, ` ${Math.round(r.width)}×${Math.round(r.height)}`);
    if ((cs.overflowX === 'hidden' || cs.textOverflow === 'ellipsis') && el.scrollWidth > el.clientWidth + 2 && [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) add('글자잘림', el);
  }
  // 겹침: 전투 화면의 카드 줄
  if (battle) {
    const cards = [...doc.querySelectorAll('.bt-cards > *')].map(e => e.getBoundingClientRect());
    for (let i = 1; i < cards.length; i++) if (cards[i].left < cards[i - 1].right - 1) issues.push('카드겹침');
    const tray = doc.querySelector('.bt-tray')?.getBoundingClientRect(); if (tray && tray.bottom > H + 2) issues.push(`트레이 아래로 ${Math.round(tray.bottom - H)}`);
  }
  return issues;
};

for (const [W, H, k] of CONFIGS) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.clock.install({ time: new Date(2026, 10, 10, 12, 0, 0) });   // 시즌 이벤트가 열려 있는 날짜로 고정
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto('http://localhost:5190/?cuts=1', { waitUntil: 'networkidle' });
  await page.waitForSelector('.screen.hangar:not([hidden])', { timeout: 20000 });
  // 메뉴를 다 열어 두고(1~3장·2장 클리어) 시작
  await page.evaluate(() => { const s = window.__aw.store.getState().save; for (const id of ['c1-7', 'c2-7']) s.stages[id] = { clears: 1, bestBaseHp: 500 }; s.ore = 99999; s.tickets = 5; s.story = ['c1-1', 'c1-2', 'c1-3', 'c2-6', 'c3-7']; window.__aw.show('hangar'); });
  const tag = `${W}×${H}${k !== 1 ? ` ×${k}` : ''}`;
  const rec = async (screen, battle = false) => {
    await page.waitForTimeout(250);
    const issues = await page.evaluate(scanFn, { k, battle });
    rows.push({ tag, screen, issues });
    if (!FAST || screen === '전투+모듈') await page.screenshot({ path: `${OUT}/${W}x${H}_${k}_${screen.replace(/[^가-힣a-z0-9]/gi, '')}.png` });
  };
  const open = async (sel, name) => { await page.evaluate(() => window.__aw.show('hangar')); await page.waitForTimeout(150); await page.click(sel).catch(() => {}); await rec(name); };
  await rec('격납고');
  await page.click('#hgSortie').catch(() => {}); await rec('작전 선택');
  await page.click('.ch-tab[data-ch="ch"]').catch(() => {}); await rec('도전 탭');
  await page.click('#openSeason').catch(() => {}); await rec('시즌 이벤트');
  await page.evaluate(() => window.__aw.show('hangar')); await page.click('#hgSortie').catch(() => {});
  await open('#nvMissions', '임무 일일');
  for (const [tab, name] of [['weekly', '임무 주간'], ['ach', '임무 업적']]) { await page.click(`.ms-tab[data-k="${tab}"]`).catch(() => {}); await rec(name); }
  await open('#hgStory', '이야기 기록'); await open('#nvAttend', '출석'); await open('#nvSupply', '보급'); await open('#nvUpgrade', '강화'); await open('#nvShop', '상점'); await open('#hgGear', '장비');
  await page.evaluate(() => window.__aw.show('hangar'));
  // 컷신 (1장 첫 작전 전)
  try { await page.evaluate(() => { window.__aw.store.getState().save.cuts = []; void window.__aw.startBattle('c1-1'); }); await page.waitForSelector('.cutscene', { timeout: 8000 }); await page.waitForTimeout(700); await rec('컷신'); await page.click('.cs-skip'); await page.waitForSelector('.screen.battle:not([hidden])', { timeout: 8000 }); await page.evaluate(() => window.__aw.show('hangar')); } catch (e) { rows.push({ tag, screen: '컷신 실패', issues: [String(e.message).slice(0, 80)] }); }
  // 전투 + 지휘 모듈 + 결과
  try {
  await page.evaluate(() => window.__aw.startBattle('c2-3')); await page.waitForSelector('.screen.battle:not([hidden])', { timeout: 15000 }); await page.waitForTimeout(500);
  await rec('전투', true);
  await page.evaluate(() => { const b = window.__aw.battle; while (b.tick < 44.9 * 20 && b.step()) { /* */ } }); await page.waitForSelector('.bt-offer', { timeout: 5000 }).catch(() => {});
  await rec('전투+모듈', true);
  await page.locator('.of-card').first().click().catch(() => {});
  await page.evaluate(() => { const b = window.__aw.battle; b.baseHp[1] = 0; b.step(); }); await page.waitForSelector('.screen.result:not([hidden])', { timeout: 8000 }).catch(() => {});
  await rec('결과');
  } catch (e) { rows.push({ tag, screen: '전투 시작 실패', issues: [String(e.message).slice(0, 80)] }); }
  if (errs.length) rows.push({ tag, screen: '콘솔', issues: errs.slice(0, 3) });
  await ctx.close();
}
await browser.close();
const bad = rows.filter(r => r.issues.length);
writeFileSync(`${OUT}/qa.json`, JSON.stringify(rows, null, 1));
console.log(`점검 ${rows.length}곳 · 문제 있는 곳 ${bad.length}`);
for (const r of bad) console.log(`- ${r.tag} | ${r.screen}: ${r.issues.slice(0, 6).join(' ; ')}`);
