import type { Battle } from '../domain/battle/sim';
import type { Stage } from '../data/stages';
import { STAGES } from '../data/stages';
import type { Settlement } from '../domain/rewards';
import { weakestCard } from '../domain/rewards';
import type { Build } from '../domain/assemble';
import { unitFit, esc, partName } from './unitView';
import { play } from '../native/audio';
import { BASE_HP } from '../domain/battle/sim';
import type { Nav, Screen } from './app';

export interface ResultData { stage: Stage; battle: Battle; builds: Build[]; rewards: Settlement; win: boolean; quit: boolean }

/** 결과: 이겼는지·보상, 그리고 "어느 설계도가 밀렸는지" — 지면 바로 조립하러 가게 한다 (기획안 §3 핵심 순환). */
export function mountResult(root: HTMLElement, nav: Nav): Screen {
  const el = document.createElement('div');
  el.className = 'screen result'; el.hidden = true;
  root.appendChild(el);

  function render(d: ResultData) {
    const r = d.battle.result();
    const dmg = r.damageByCard[0], spawn = r.spawnsByCard[0];
    const maxDmg = Math.max(1, ...dmg);
    const weak = weakestCard(spawn, dmg);
    const next = STAGES[d.stage.no];   // 다음 스테이지 (번호는 1부터라 index = no)
    const secs = Math.round(r.seconds);
    el.innerHTML = `
      <div class="bg"></div>
      <section class="rs-head ${d.win ? 'win' : 'lose'}">
        <small>작전 ${d.stage.no} · ${esc(d.stage.name)}</small>
        <h1>${d.quit ? '작전 포기' : d.win ? '작전 성공' : '작전 실패'}</h1>
        <p>${Math.floor(secs / 60)}분 ${String(secs % 60).padStart(2, '0')}초 · 내 기지 ${Math.max(0, Math.ceil(r.baseHp[0]))}/${BASE_HP} · 적 기지 ${Math.max(0, Math.ceil(r.baseHp[1]))}/${BASE_HP}</p>
      </section>
      <section class="rs-rewards">
        <span>광석 <b>+${d.rewards.ore}</b></span><span>경험치 <b>+${d.rewards.exp}</b></span>${d.rewards.tickets ? `<span>보급권 <b>+${d.rewards.tickets}</b></span>` : ''}
        ${d.rewards.firstClear ? '<em>첫 승리 보상!</em>' : ''}
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
      <footer class="rs-actions">
        ${!d.win && weak !== null ? '<button class="btn pulse" id="rsAsm" type="button">조립하러 가기</button>' : ''}
        ${d.win && next ? '<button class="btn primary" id="rsNext" type="button">다음 작전</button>' : ''}
        <button class="btn ${d.win ? '' : 'primary'}" id="rsRetry" type="button">다시 도전</button>
        <button class="btn" id="rsHome" type="button">격납고</button>
      </footer>`;
    const on = (id: string, f: () => void) => { const b = el.querySelector(id) as HTMLButtonElement | null; if (b) b.onclick = () => { play('uiClick'); f(); }; };
    on('#rsAsm', () => nav.openAssembly(weak ?? 0));
    on('#rsNext', () => nav.startBattle(next!.id));
    on('#rsRetry', () => nav.startBattle(d.stage.id));
    on('#rsHome', () => nav.goHangar());
    play(d.win ? 'win' : 'lose');
  }

  return { el, show(arg?: unknown) { el.hidden = false; render(arg as ResultData); }, hide() { el.hidden = true; } };
}
