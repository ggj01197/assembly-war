// 움직임 수치 점검: 한 유닛의 화면 위치·좌우 뒤집힘·다리 칸 바뀜·튐을 60프레임 단위로 재서 이상한 점을 숫자로 본다 (개발 서버 5190 필요)
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
await page.goto('http://localhost:5190/', { waitUntil: 'networkidle' });
await page.waitForSelector('.screen.hangar:not([hidden])');
await page.locator('#hgRun').click(); await page.waitForSelector('.screen.run:not([hidden])');
await page.locator('#rnAuto').click(); await page.locator('#rnGo').click();
await page.waitForSelector('.screen.battle.run-hud:not([hidden])');
await page.waitForTimeout(500);
const out = await page.evaluate(async () => {
  const sc = window.__aw.game.scene.getScene('battle');
  const rows = [];
  const t0 = performance.now();
  await new Promise(res => { const tick = () => {
    const t = performance.now() - t0;
    for (const [id, v] of sc.views) rows.push({ t: Math.round(t), id, team: v.unit.team, x: +v.c.x.toFixed(1), y: +v.c.y.toFixed(1), sx: +v.rig.scaleX.toFixed(2), sy: +v.rig.scaleY.toFixed(2), rot: +(v.rig.rotation + v.upper.rotation).toFixed(3), lf: v.legF, wf: v.wpnF, flip: +v.flip.toFixed(2), mv: +v.mv.toFixed(2), moving: v.unit.moving, face: +v.unit.face.toFixed(2), kind: v.kind });
    if (t < 6000) requestAnimationFrame(tick); else res(null); }; requestAnimationFrame(tick); });
  return rows;
});
const byId = new Map(); for (const r of out) { if (!byId.has(r.id)) byId.set(r.id, []); byId.get(r.id).push(r); }
for (const [id, rs] of byId) {
  let flips = 0, frameChanges = 0, maxJump = 0, mirrorSign = 0, lastSign = Math.sign(rs[0].sx), minSx = 9, movingFrames = 0;
  for (let i = 1; i < rs.length; i++) {
    if (rs[i].lf !== rs[i - 1].lf) frameChanges++;
    const j = Math.hypot(rs[i].x - rs[i - 1].x, rs[i].y - rs[i - 1].y); if (j > maxJump) maxJump = j;
    if (Math.sign(rs[i].sx) !== lastSign) { mirrorSign++; lastSign = Math.sign(rs[i].sx); }
    minSx = Math.min(minSx, Math.abs(rs[i].sx)); if (rs[i].moving) movingFrames++;
  }
  console.log(`유닛${id} 팀${rs[0].team} ${rs[0].kind}: 표본 ${rs.length}, 이동중 ${movingFrames}, 다리칸 바뀜 ${frameChanges}회, 좌우뒤집힘 ${mirrorSign}회, |scaleX| 최소 ${minSx}, 최대 한 프레임 이동 ${maxJump.toFixed(1)}px, 마지막 x,y ${rs.at(-1).x},${rs.at(-1).y}`);
}
await browser.close();
