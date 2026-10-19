import type { Battle } from '../domain/battle/sim';
import type { Stage } from '../data/stages';
import { nextStage, stageLabel } from '../data/stages';
import type { Settlement } from '../domain/rewards';
import { weakestCard } from '../domain/rewards';
import type { Build } from '../domain/assemble';
import { unitFit, esc, partName } from './unitView';
import { play } from '../native/audio';
import { BASE_HP } from '../domain/battle/sim';
import type { Nav, Screen } from './app';
import { grant, lossOre } from '../domain/daily';
import { adAvailable, adLabel, watchForSlot } from './adFlow';

export interface ResultData { stage: Stage; battle: Battle; builds: Build[]; rewards: Settlement; win: boolean; quit: boolean; /** 5분 버티기 최고 기록 갱신 */ record?: boolean;
  /** 이어하기(광고)를 기다리는 동안 보류한 정산 — 나갈 때 한 번 실행한다 */ commit?: () => void;
  /** 5분 버티기 이어하기(광고 A5) */ onContinue?: () => void }

/** 결과: 이겼는지·보상, 그리고 "어느 설계도가 밀렸는지" — 지면 바로 조립하러 가게 한다 (기획안 §3 핵심 순환). */
export function mountResult(root: HTMLElement, nav: Nav): Screen {
  const el = document.createElement('div');
  el.className = 'screen result'; el.hidden = true;
  root.appendChild(el);
  const used = { double: false, loss: false, boss: false };
  let msg = '';

  function render(d: ResultData) {
    const r = d.battle.result();
    const dmg = r.damageByCard[0], spawn = r.spawnsByCard[0];
    const maxDmg = Math.max(1, ...dmg);
    const weak = weakestCard(spawn, dmg);
    const next = nextStage(d.stage);
    const sv = !!d.stage.survival;
    const secs = Math.round(r.seconds);
    el.innerHTML = `
      <div class="bg"></div>
      <section class="rs-head ${d.win ? 'win' : 'lose'}">
        <small>${sv ? '' : '작전 '}${esc(stageLabel(d.stage))}${sv ? '' : ' · ' + esc(d.stage.name)}</small>
        <h1>${d.quit ? '작전 포기' : sv ? (d.win ? '5분 돌파!' : '기록 ' + secs + '초') : d.win ? '작전 성공' : '작전 실패'}</h1>
        <p>${Math.floor(secs / 60)}분 ${String(secs % 60).padStart(2, '0')}초 버팀${sv ? '' : ` · 왕관 ${r.crowns[0]}:${r.crowns[1]} · 내 기지 ${Math.max(0, Math.ceil(r.baseHp[0]))}/${BASE_HP} · 적 기지 ${Math.max(0, Math.ceil(r.baseHp[1]))}/${BASE_HP}`}${sv ? ` · 내 기지 ${Math.max(0, Math.ceil(r.baseHp[0]))}/${BASE_HP} · 처치 ${r.kills[0]}` : ''}</p>
      </section>
      <section class="rs-rewards">
        <span>광석 <b>+${d.rewards.ore}</b></span><span>경험치 <b>+${d.rewards.exp}</b></span>${d.rewards.tickets ? `<span>보급권 <b>+${d.rewards.tickets}</b></span>` : ''}
        ${d.record ? '<em>최고 기록 갱신!</em>' : d.rewards.firstClear ? '<em>첫 승리 보상!</em>' : ''}
      </section>
      <section class="rs-cards">
        <h2>설계도별 활약</h2>
        ${d.builds.map((b, i) => `<div class="rs-row ${weak === i && !d.win ? 'weak' : ''}">
            ${unitFit(b, 44, 46)}
            <span class="nm"><b>${esc(partName(b.weapon))}</b><small>생산 ${spawn[i]}기 · 가한 피해 ${Math.round(dmg[i])}</small></span>
            <i class="bar"><u style="width:${(dmg[i] / maxDmg) * 100}%"></u></i>
            ${weak === i ? `<em>${d.win ? '가장 약했어요' : '가장 밀렸어요'}</em>` : ''}
          </div>`).join('')}
        ${weak !== null && !d.win ? '<p class="rs-tip">밀린 설계도를 바꿔 보세요. 부품 하나만 바꿔도 달라집니다.</p>' : ''}
      </section>
      <section class="rs-ad">
        ${d.win && !used.double && (d.rewards.ore || d.rewards.exp || d.rewards.tickets) && adAvailable('result_double') ? `<button class="btn ad" id="rsDouble" type="button">${adLabel('보상 2배', 'result_double')}</button>` : ''}
        ${d.win && d.stage.boss && !used.boss && adAvailable('boss_extra') ? `<button class="btn ad" id="rsBoss" type="button">${adLabel('보스 보상 한 번 더', 'boss_extra')}</button>` : ''}
        ${!d.win && !used.loss && lossOre(r.wattSpent[0]) > 0 && adAvailable('loss_ore') ? `<button class="btn ad" id="rsLoss" type="button">${adLabel(`광석 회수 +${lossOre(r.wattSpent[0])}`, 'loss_ore')}</button>` : ''}
        ${sv && !d.win && d.onContinue && d.battle.continued < 1 && adAvailable('survival_continue') ? `<button class="btn ad" id="rsCont" type="button">${adLabel('이어하기 (보호막 30초)', 'survival_continue')}</button>` : ''}
        ${msg ? `<p class="rs-tip">${esc(msg)}</p>` : ''}
      </section>
      <footer class="rs-actions">
        ${!d.win && weak !== null ? '<button class="btn pulse" id="rsAsm" type="button">조립하러 가기</button>' : ''}
        ${d.win && next && !sv ? '<button class="btn primary" id="rsNext" type="button">다음 작전</button>' : ''}
        <button class="btn ${d.win ? '' : 'primary'}" id="rsRetry" type="button">다시 도전</button>
        <button class="btn" id="rsHome" type="button">격납고</button>
      </footer>`;
    const on = (id: string, f: () => void) => { const b = el.querySelector(id) as HTMLButtonElement | null; if (b) b.onclick = () => { play('uiClick'); f(); }; };
    /** 나가기 단추: 보류한 정산이 있으면 먼저 한다 */
    const leave = (f: () => void) => () => { d.commit?.(); d.commit = undefined; f(); };
    on('#rsAsm', leave(() => nav.openAssembly(weak ?? 0)));
    on('#rsNext', leave(() => nav.startBattle(next!.id)));
    on('#rsRetry', leave(() => nav.startBattle(d.stage.id)));
    on('#rsHome', leave(() => nav.goHangar()));
    // ── 보상형 광고 (A1·A2·A5·A8): 눌러야만, 끝까지 본 뒤에만 지급
    const ad = (id: string, slot: 'result_double' | 'loss_ore' | 'boss_extra' | 'survival_continue', grantFn: (sv: import('../domain/save').SaveData) => void, after: () => void) => {
      const b = el.querySelector(id) as HTMLButtonElement | null; if (!b) return;
      b.onclick = async () => {
        b.disabled = true;
        const res = await watchForSlot(slot, grantFn);
        if (!res.ok) { msg = res.msg; play('deny'); render(d); return; }
        play('ready'); after(); render(d);
      };
    };
    ad('#rsDouble', 'result_double', sv => grant(sv, { ore: d.rewards.ore, exp: d.rewards.exp, tickets: d.rewards.tickets }), () => { used.double = true; d.rewards = { ...d.rewards, ore: d.rewards.ore * 2, exp: d.rewards.exp * 2, tickets: d.rewards.tickets * 2 }; msg = '보상이 2배가 됐어요!'; });
    ad('#rsBoss', 'boss_extra', sv => grant(sv, { ore: d.stage.rewardOre, exp: d.stage.rewardExp, tickets: 0 }), () => { used.boss = true; msg = `보스 보상을 한 번 더 받았어요: 광석 +${d.stage.rewardOre} · 경험치 +${d.stage.rewardExp}`; });
    ad('#rsLoss', 'loss_ore', sv => { sv.ore += lossOre(r.wattSpent[0]); }, () => { used.loss = true; msg = `광석 +${lossOre(r.wattSpent[0])} 회수!`; });
    ad('#rsCont', 'survival_continue', () => { /* 이어하기는 정산 없이 전투로 돌아간다 */ }, () => { d.commit = undefined; const f = d.onContinue; d.onContinue = undefined; f?.(); });
    play(d.win ? 'win' : 'lose');
  }

  return { el, show(arg?: unknown) { used.double = false; used.loss = false; used.boss = false; msg = ''; el.hidden = false; render(arg as ResultData); }, hide() { el.hidden = true; } };
}
