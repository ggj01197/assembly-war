import { PARTS } from '../data/parts';
import { assemble } from '../domain/assemble';
import { levelMultiplier } from '../domain/upgrade';
import { unitFit, esc } from './unitView';
import { spriteUrl, accIconUrl } from '../game/unitLayout';
import { play } from '../native/audio';
import {
  newRun, buy, reroll, sell, sellValue, equip, unequip, autoBuild, readyMechs, mechBuild, mechStatus, mechMult, battlePlan, settle, nextRound,
  RUN_ROUNDS, RUN_HEARTS, REROLL_COST, BENCH_MAX, SLOT_KINDS, kindOf, enemyFor, chooseRelic, relicInfo, type RunState, type SlotKind, type PartInst, type BattlePlan,
} from '../domain/run/run';
import { bossById } from '../data/bosses';
import type { Nav, Screen } from './app';

const KIND_LABEL: Record<SlotKind, string> = { legs: '다리', body: '몸통', weapon: '무기', accessory: '장식' };
const nameOf = (id: string) => PARTS.find(p => p.id === id)?.name ?? id;
const imgOf = (id: string) => (kindOf(id) === 'accessory' ? accIconUrl(id) : spriteUrl(id));
const stars = (n: number) => (n > 1 ? '★'.repeat(n - 1) : '');

/**
 * 조립 런 화면 (M1 프로토타입, REDESIGN_PLAN_v0 안 1): 상점 → 작업대(메카 4대) → 벤치 → 전투 시작.
 * 부품을 벤치에서 고른 뒤 메카를 눌러 끼운다. 「추천 조립」은 가진 부품으로 가장 센 메카를 자동으로 만든다.
 */
export function mountRun(root: HTMLElement, nav: Nav): Screen {
  const el = document.createElement('div');
  el.className = 'screen run'; el.hidden = true;
  root.appendChild(el);
  let rs: RunState = newRun(Date.now() & 0x7fffffff);
  let sel: number | null = null;     // 고른 벤치 부품 uid
  let msg = '부품을 사서 메카를 만들어 보세요. 같은 부품 3개는 ★로 합쳐져요.';
  let lastWin: boolean | null = null;

  const say = (m: string) => { msg = m; };

  /** 이번 라운드 적 미리보기(+ 보스 표시)와 가진 유물 */
  function enemyPreview(): string {
    const en = enemyFor(rs.round, rs.seed), bd = en.boss ? bossById(en.boss) : null;
    const relics = rs.relics.length ? `<span class="rn-relicrow" aria-label="가진 유물">${rs.relics.map(id => { const r = relicInfo(id); return `<i title="${esc(r.name)}: ${esc(r.desc)}">${r.icon}</i>`; }).join('')}</span>` : '';
    return `<section class="rn-sec rn-enemy"><div class="rn-h"><b>이번 적 ${bd ? `<em class="boss">보스: ${esc(bd.name)}</em>` : ''}</b>${relics}</div>
      <div class="rn-foes">${en.builds.map(b => `<span class="rf">${unitFit(b, 44, 46)}</span>`).join('')}${bd ? `<span class="rf boss" aria-label="보스 ${esc(bd.name)}">${unitFit(bd.build, 48, 50)}<u aria-hidden="true">👑</u></span>` : ''}</div></section>`;
  }

  function mechCard(i: number): string {
    const m = rs.mechs[i], b = mechBuild(m), st = mechStatus(m);
    const stats = b && st.ready ? assemble(b, PARTS).stats : null, mult = mechMult(m), lm = levelMultiplier(1);
    const chips = SLOT_KINDS.map(k => {
      const p = m[k];
      return p ? `<button class="rm-chip" data-un="${i}:${k}" type="button" aria-label="${KIND_LABEL[k]} ${esc(nameOf(p.id))} 빼기"><img src="${imgOf(p.id)}" alt="" draggable="false"><i>${stars(p.star)}</i></button>`
        : `<span class="rm-chip empty" aria-hidden="true">${KIND_LABEL[k]}</span>`;
    }).join('');
    const body = b && st.ready ? `<span class="rm-img">${unitFit(b, 74, 78)}</span>` : `<span class="rm-img ph">${b ? '조립 불가' : '조립 중'}</span>`;
    const info = stats ? `<small class="rm-st">체력 ${Math.round(stats.hp * mult)} · 공격 ${(stats.dmg * stats.rate * mult * lm).toFixed(0)}${mult > 1 ? ` · ★×${mult.toFixed(2)}` : ''}</small>`
      : `<small class="rm-st bad">${esc(st.reasons[0] ?? '')}</small>`;
    return `<div class="rm ${st.ready ? 'ready' : ''} ${sel !== null ? 'target' : ''}" data-m="${i}">${body}<span class="rm-chips">${chips}</span>${info}</div>`;
  }

  function benchChip(p: PartInst): string {
    return `<button class="rb-chip ${sel === p.uid ? 'on' : ''}" data-b="${p.uid}" type="button" aria-label="${esc(nameOf(p.id))}"><img src="${imgOf(p.id)}" alt="" draggable="false"><b>${esc(nameOf(p.id))}</b><i>${stars(p.star)}</i></button>`;
  }

  function relicPanel(): string {
    if (!rs.relicOffer) return '';
    return `<div class="sheet-dim"></div><div class="rn-result relic" role="dialog" aria-label="유물 선택"><b>🎁 유물을 하나 고르세요</b><p>런이 끝날 때까지 이어지는 강화예요.</p>
      <div class="rn-relics">${rs.relicOffer.map(id => { const r = relicInfo(id); return `<button class="rn-relic" data-r="${id}" type="button"><i>${r.icon}</i><b>${esc(r.name)}</b><small>${esc(r.desc)}</small></button>`; }).join('')}</div></div>`;
  }

  function resultPanel(): string {
    const p = rs.phase;
    if (p === 'build') return '';
    if (rs.relicOffer) return relicPanel();
    const title = p === 'cleared' ? '🏆 런 클리어!' : p === 'over' ? '💥 런 종료' : lastWin ? '✅ 승리!' : '❌ 패배';
    const sub = p === 'cleared' ? `${RUN_ROUNDS}라운드를 모두 이겼어요. 보스까지 쓰러뜨렸어요!` : p === 'over' ? (rs.hearts <= 0 ? '하트를 모두 잃었어요.' : '마지막 라운드에서 졌어요.') : lastWin ? `코인을 받았어요. 다음 라운드를 준비하세요 (코인 ${rs.coins}).` : `하트 −1 (남은 하트 ${rs.hearts}). 코인 ${rs.coins}.`;
    const btn = p === 'won' || p === 'lost' ? '<button class="btn primary big" id="rnNext" type="button">다음 라운드 ▶</button>' : '<button class="btn primary big" id="rnAgain" type="button">새 런</button><button class="btn" id="rnExit" type="button">격납고로</button>';
    return `<div class="sheet-dim"></div><div class="rn-result" role="dialog"><b>${title}</b><p>${esc(sub)}</p><div class="rn-btns">${btn}</div></div>`;
  }

  function render() {
    const ready = readyMechs(rs).length;
    const selP = sel !== null ? rs.bench.find(p => p.uid === sel) : null;
    el.innerHTML = `
      <div class="bg"></div>
      <header class="rn-top">
        <button class="back" id="rnBack" type="button" aria-label="격납고로">←</button>
        <b>조립 런 <em>베타</em></b>
        <span class="rn-info">${rs.round}/${RUN_ROUNDS}R · ${'❤'.repeat(Math.max(0, rs.hearts))}${'♡'.repeat(Math.max(0, RUN_HEARTS - rs.hearts))} · 🪙${rs.coins}</span>
      </header>
      <div class="rn-body">
        ${enemyPreview()}
        <section class="rn-sec">
          <div class="rn-h"><b>상점</b><button class="rn-reroll" id="rnReroll" type="button" ${rs.coins < REROLL_COST ? 'disabled' : ''}>🔄 리롤 🪙${REROLL_COST}</button></div>
          <div class="rn-shop">${rs.shop.map((o, i) => o
            ? `<button class="rs-card ${rs.coins < o.cost ? 'short' : ''}" data-s="${i}" type="button" aria-label="${esc(nameOf(o.id))} ${o.cost} 코인"><img src="${imgOf(o.id)}" alt="" draggable="false"><b>${esc(nameOf(o.id))}</b><i>${KIND_LABEL[kindOf(o.id)]} · 🪙${o.cost}</i></button>`
            : '<span class="rs-card sold" aria-hidden="true">품절</span>').join('')}</div>
        </section>
        <section class="rn-sec">
          <div class="rn-h"><b>내 메카</b><small>${selP ? `「${esc(nameOf(selP.id))}」를 끼울 메카를 누르세요` : '부품 칸을 누르면 벤치로 빼요'}</small></div>
          <div class="rn-mechs">${rs.mechs.map((_, i) => mechCard(i)).join('')}</div>
        </section>
        <section class="rn-sec">
          <div class="rn-h"><b>벤치 <small>${rs.bench.length}/${BENCH_MAX}</small></b>${selP ? `<button class="rn-sell" id="rnSell" type="button">팔기 🪙+${sellValue(selP)}</button>` : ''}</div>
          <div class="rn-bench">${rs.bench.length ? rs.bench.map(benchChip).join('') : '<small class="rn-empty">비어 있어요. 상점에서 부품을 사 보세요.</small>'}</div>
        </section>
        <p class="rn-msg">${esc(msg)}</p>
      </div>
      <footer class="rn-foot">
        <button class="btn" id="rnAuto" type="button">✨ 추천 조립</button>
        <button class="btn primary rn-go" id="rnGo" type="button" ${ready ? '' : 'disabled'}>전투 시작 ▶ <small>(${ready}대)</small></button>
      </footer>
      ${resultPanel()}`;
    bind();
  }

  function bind() {
    (el.querySelector('#rnBack') as HTMLButtonElement).onclick = () => { play('uiBack'); nav.goHangar(); };
    (el.querySelector('#rnReroll') as HTMLButtonElement | null)?.addEventListener('click', () => { const r = reroll(rs); play(r.ok ? 'uiClick' : 'deny'); say(r.msg); render(); });
    el.querySelectorAll<HTMLButtonElement>('.rs-card[data-s]').forEach(b => b.onclick = () => { const r = buy(rs, Number(b.dataset.s)); play(r.ok ? 'packBurst' : 'deny'); say(r.msg); if (r.ok) sel = null; render(); });
    el.querySelectorAll<HTMLButtonElement>('.rb-chip').forEach(b => b.onclick = () => { const u = Number(b.dataset.b); sel = sel === u ? null : u; play('uiClick'); render(); });
    el.querySelectorAll<HTMLElement>('.rm').forEach(c => c.onclick = e => {
      const un = (e.target as HTMLElement).closest<HTMLElement>('[data-un]');
      const i = Number(c.dataset.m);
      if (un && sel === null) { const [mi, k] = un.dataset.un!.split(':'); const ok = unequip(rs, Number(mi), k as SlotKind); play(ok ? 'uiClick' : 'deny'); say(ok ? '부품을 벤치로 뺐어요.' : '벤치가 가득 찼어요.'); render(); return; }
      if (sel !== null) {
        const p = rs.bench.find(q => q.uid === sel);
        if (p && equip(rs, sel, i)) { play('packBurst'); say(`「${nameOf(p.id)}」를 끼웠어요.${mechStatus(rs.mechs[i]).ready ? '' : ' (아직 조립이 안 돼요 — ' + (mechStatus(rs.mechs[i]).reasons[0] ?? '') + ')'}`); sel = null; } else play('deny');
        render();
      }
    });
    (el.querySelector('#rnSell') as HTMLButtonElement | null)?.addEventListener('click', () => { if (sel !== null && sell(rs, sel)) { play('uiClick'); say('부품을 팔았어요.'); sel = null; } render(); });
    (el.querySelector('#rnAuto') as HTMLButtonElement).onclick = () => { autoBuild(rs); sel = null; play('packBurst'); say('가진 부품으로 가장 센 메카를 조립했어요.'); render(); };
    (el.querySelector('#rnGo') as HTMLButtonElement).onclick = () => { const plan = battlePlan(rs); if (!plan) { play('deny'); return; } play('uiClick'); startBattle(plan); };
    el.querySelectorAll<HTMLButtonElement>('.rn-relic').forEach(b => b.onclick = () => { if (chooseRelic(rs, b.dataset.r!)) { play('ready'); say(`유물「${relicInfo(b.dataset.r!).name}」를 얻었어요!`); } render(); });
    (el.querySelector('#rnNext') as HTMLButtonElement | null)?.addEventListener('click', () => { nextRound(rs); sel = null; say(`${rs.round}라운드! 상점이 새로 채워졌어요.`); play('uiClick'); render(); });
    (el.querySelector('#rnAgain') as HTMLButtonElement | null)?.addEventListener('click', () => { rs = newRun(Date.now() & 0x7fffffff); sel = null; say('새 런을 시작했어요.'); play('uiClick'); render(); });
    (el.querySelector('#rnExit') as HTMLButtonElement | null)?.addEventListener('click', () => { play('uiBack'); nav.goHangar(); });
  }

  function startBattle(plan: BattlePlan) {
    nav.runBattle(plan, { round: rs.round, rounds: RUN_ROUNDS, hearts: rs.hearts, seed: rs.seed + rs.round }, result => {
      if (result === 'quit') { say('전투를 포기했어요. 다시 준비하세요.'); show(); return; }
      lastWin = result === 'win'; settle(rs, lastWin); play(lastWin ? 'ready' : 'deny'); show();
    });
  }

  function show() { el.hidden = false; render(); }
  (window as unknown as { __awRun?: unknown }).__awRun = { get rs() { return rs; }, render };   // 점검 도구용
  return { el, show: () => { show(); }, hide: () => { el.hidden = true; } };
}
