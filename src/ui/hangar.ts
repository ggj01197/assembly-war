import { assemble, type Build } from '../domain/assemble';
import { PARTS } from '../data/parts';
import { CHAPTERS, STAGES, SURVIVAL, isUnlocked } from '../data/stages';
import { store, update } from '../game/store';
import { SKILLS, HEROES, KIND_LABEL, heroById } from '../domain/loadout';
import { commanderLevel } from '../domain/save';
import { freeChestReady } from '../domain/supply';
import { levelMultiplier } from '../domain/upgrade';
import { unitFit, partName, esc, TARGET_LABEL } from './unitView';
import { play } from '../native/audio';
import type { Nav, Screen } from './app';
import { supplyHtml, oddsHtml, upgradeHtml, shopHtml, bindSheets, type SheetKind, type SheetState } from './hangarSheets';

/** 격납고(홈): 선택한 설계도를 크게 보여 주고, 조립·출격으로 보낸다. */
export function mountHangar(root: HTMLElement, nav: Nav): Screen {
  const el = document.createElement('div');
  el.className = 'screen hangar'; el.hidden = true;
  root.appendChild(el);
  let sel = 0, sheet: false | 'stage' | 'gear' | SheetKind = false;
  const sst: SheetState = { drops: null, upTab: 'legs' };
  let tick: ReturnType<typeof setInterval> | null = null;
  const toast = (msg: string) => { const t = document.createElement('div'); t.className = 'hg-toast'; t.textContent = msg; el.appendChild(t); setTimeout(() => t.remove(), 1800); };
  let chap: 1 | 2 | 3 | 'sv' = 1;

  const slotTitle = (b: Build) => partName(b.weapon);

  function render() {
    const s = store.getState().save;
    const lv = commanderLevel(s.commanderExp);
    const b = s.deck[sel];
    const r = assemble(b, PARTS);
    const st = r.stats;
    const mult = levelMultiplier(1);
    const dps = st ? (st.dmg * st.rate * mult).toFixed(0) : '-';
    const firstClear = (s.stages[STAGES[0].id]?.clears ?? 0) > 0;
    const guideAssemble = firstClear && !s.flags.assembled;
    const guideSortie = !firstClear;
    el.innerHTML = `
      <div class="bg"></div>
      <header class="hg-top">
        <div class="hg-cmd"><b>Lv.${lv.level}</b><span>정비사령관</span><i class="bar"><u style="width:${Math.min(100, (lv.into / lv.need) * 100)}%"></u></i></div>
        <div class="hg-res"><span>보급권 <b>${s.tickets}</b></span><span>광석 <b>${s.ore.toLocaleString('ko-KR')}</b></span></div>
      </header>
      <section class="hg-stage">
        <div class="hg-name"><small>설계도 ${sel + 1}</small><b>${esc(slotTitle(b))}</b><em>${esc(partName(b.legs))} · ${esc(partName(b.body))}${b.accessory ? ' · ' + esc(partName(b.accessory)) : ''}</em></div>
        <div class="hg-showcase"><div class="platform"></div>${unitFit(b, Math.min(300, window.innerWidth - 60), Math.min(250, Math.max(110, window.innerHeight - 470)), 'showcase')}</div>
        <div class="hg-chips">
          <span><small>체력</small><b>${st ? st.hp : '-'}</b></span>
          <span><small>초당 공격</small><b>${dps}</b></span>
          <span><small>사거리</small><b>${st ? st.range : '-'}</b></span>
          <span><small>대상</small><b>${st ? TARGET_LABEL[st.target] : '-'}</b></span>
          <span class="watt"><small>와트</small><b>${r.watt}</b></span>
        </div>
      </section>
      <section class="hg-slots">
        ${s.deck.map((d, i) => { const w = assemble(d, PARTS).watt; return `<button class="slot ${i === sel ? 'on' : ''}" data-i="${i}" type="button" aria-label="설계도 ${i + 1}">${unitFit(d, 50, 54)}<i>${w}</i></button>`; }).join('')}
      </section>
      <nav class="hg-nav">
        <button class="nv" id="nvSupply" type="button">보급${s.tickets > 0 || freeChestReady(s, Date.now()) ? '<i class="dot"></i>' : ''}</button>
        <button class="nv" id="nvUpgrade" type="button">강화</button>
        <button class="nv" id="nvShop" type="button">상점</button>
      </nav>
      <footer class="hg-actions">
        <button class="btn ${guideAssemble ? 'pulse' : ''}" id="hgAssemble" type="button">조립${guideAssemble ? '<em>NEW</em>' : ''}</button>
        <button class="btn" id="hgGear" type="button">장비</button>
        <button class="btn primary big ${guideSortie ? 'pulse' : ''}" id="hgSortie" type="button">출격</button>
      </footer>
      ${guideAssemble ? '<div class="hg-tip">첫 승리! 설계도를 바꿔 더 강해져 보세요.</div>' : ''}
      ${sheet === 'stage' ? stageSheet() : sheet === 'gear' ? gearSheet() : sheet === 'supply' ? supplyHtml(sst, Date.now()) : sheet === 'odds' ? oddsHtml() : sheet === 'upgrade' ? upgradeHtml(sst) : sheet === 'shop' ? shopHtml() : ''}`;

    el.querySelectorAll<HTMLButtonElement>('.slot').forEach(b2 => b2.onclick = () => { sel = Number(b2.dataset.i); play('uiClick'); render(); });
    (el.querySelector('#hgAssemble') as HTMLButtonElement).onclick = () => { play('uiClick'); nav.openAssembly(sel); };
    (el.querySelector('#hgSortie') as HTMLButtonElement).onclick = () => {
      play('uiClick'); sheet = 'stage';
      // 아직 못 깬 첫 작전이 있는 장을 열어 준다
      const cur = STAGES.find(st => (store.getState().save.stages[st.id]?.clears ?? 0) === 0 && isUnlocked(st, store.getState().save.stages));
      chap = cur ? cur.chapter : 3; render();
    };
    el.querySelectorAll<HTMLButtonElement>('.ch-tab:not(:disabled)').forEach(b2 => b2.onclick = () => { play('uiClick'); chap = b2.dataset.ch === 'sv' ? 'sv' : (Number(b2.dataset.ch) as 1 | 2 | 3); render(); });
    (el.querySelector('#hgGear') as HTMLButtonElement).onclick = () => { play('uiClick'); sheet = 'gear'; render(); };
    el.querySelectorAll<HTMLButtonElement>('.gear-hero:not(.locked)').forEach(b2 => b2.onclick = () => { play('uiClick'); update(sv => { sv.loadout.hero = b2.dataset.id!; }); render(); });
    el.querySelectorAll<HTMLButtonElement>('.gear-skill:not(.locked)').forEach(b2 => b2.onclick = () => {
      play('uiClick');
      update(sv => {
        const id = b2.dataset.id!, cur = sv.loadout.skills;
        if (cur.includes(id)) { if (cur.length > 1) sv.loadout.skills = cur.filter(x => x !== id); }   // 최소 1개는 남긴다
        else sv.loadout.skills = [...cur, id].slice(-2);                                             // 3번째를 고르면 먼저 고른 것이 빠진다
      });
      render();
    });
    for (const [id, k] of [['#nvSupply', 'supply'], ['#nvUpgrade', 'upgrade'], ['#nvShop', 'shop']] as const) {
      (el.querySelector(id) as HTMLButtonElement).onclick = () => { play('uiClick'); sst.drops = null; sheet = k; render(); };
    }
    if (sheet === 'supply' || sheet === 'odds' || sheet === 'upgrade' || sheet === 'shop') bindSheets(el, sheet, sst, { rerender: render, toast, open: k => { sheet = k; render(); } });
    el.querySelector('#sheetClose')?.addEventListener('click', () => { play('uiBack'); sheet = false; sst.drops = null; render(); });
    el.querySelector('.sheet-dim')?.addEventListener('click', () => { sheet = false; render(); });
    el.querySelectorAll<HTMLButtonElement>('.stage:not(.locked):not(.gear-hero):not(.gear-skill)').forEach(b2 => b2.onclick = () => { play('uiClick'); sheet = false; nav.startBattle(b2.dataset.id!); });
  }

  /** 출격 장비: 영웅 1명 + 스킬 2개. 사령관 레벨이 올라야 열리는 것이 있다. */
  function gearSheet(): string {
    const s = store.getState().save, lv = commanderLevel(s.commanderExp).level, lo = s.loadout;
    return `<div class="sheet-dim"></div>
      <div class="sheet" role="dialog" aria-label="출격 장비">
        <div class="sheet-head"><b>출격 장비</b><button id="sheetClose" type="button" aria-label="닫기">✕</button></div>
        <div class="stage-list">
          <h3 class="gear-h">영웅 (1명 · 와트 6 · 탭으로 길 이동 지시)</h3>
          ${HEROES.map(h => {
            const open = h.unlock <= lv;
            return `<button class="stage gear-hero ${open ? '' : 'locked'} ${lo.hero === h.id ? 'picked' : ''}" data-id="${h.id}" type="button" ${open ? '' : 'disabled'}>
              <img class="portrait" src="art/portraits/${h.id}.jpg" alt="" draggable="false">
              <span class="tx"><b>${esc(h.name)} <em>${esc(h.role)}</em></b><small>${esc(h.skill.name)}: ${esc(h.skill.desc)}</small></span>
              <span class="rw">${lo.hero === h.id ? '<em>✓ 선택</em>' : open ? '' : `Lv.${h.unlock}`}</span>
            </button>`; }).join('')}
          <h3 class="gear-h">스킬 (2개 · 쿨다운 20초)</h3>
          ${SKILLS.map(k => {
            const open = k.unlock <= lv, on = lo.skills.includes(k.id);
            return `<button class="stage gear-skill ${open ? '' : 'locked'} ${on ? 'picked' : ''}" data-id="${k.id}" type="button" ${open ? '' : 'disabled'}>
              <i class="no">${k.watt}</i>
              <span class="tx"><b>${esc(k.name)} <em>${KIND_LABEL[k.kind]}</em></b><small>${esc(k.desc)}</small></span>
              <span class="rw">${on ? '<em>✓ 장착</em>' : open ? '' : `Lv.${k.unlock}`}</span>
            </button>`; }).join('')}
        </div>
        <p class="gear-note">${esc(heroById(lo.hero)?.name ?? '')} 출격 · 스킬 ${lo.skills.length}/2 — 전투 중 카드 줄의 보라색 칸이 스킬, 와트 줄 오른쪽의 금색 버튼이 영웅입니다.</p>
      </div>`;
  }

  /** 작전 선택: 장 탭(1·2·3장·5분 버티기) + 전투 목록 */
  function stageSheet(): string {
    const s = store.getState().save;
    const ch = CHAPTERS.find(c => c.no === chap);
    const tabs = `<div class="ch-tabs">${CHAPTERS.map(c => {
      const open = isUnlocked(c.stages[0], s.stages);
      return `<button class="ch-tab ${chap === c.no ? 'on' : ''}" data-ch="${c.no}" type="button" ${open ? '' : 'disabled'}>${c.no}장${open ? '' : ' 🔒'}</button>`;
    }).join('')}<button class="ch-tab ${chap === 'sv' ? 'on' : ''}" data-ch="sv" type="button" ${isUnlocked(SURVIVAL, s.stages) ? '' : 'disabled'}>5분 버티기${isUnlocked(SURVIVAL, s.stages) ? '' : ' 🔒'}</button></div>`;
    const list = chap === 'sv'
      ? `<button class="stage" data-id="${SURVIVAL.id}" type="button">
          <i class="no">∞</i>
          <span class="tx"><b>${esc(SURVIVAL.name)}</b><small>${esc(SURVIVAL.hint)}</small></span>
          <span class="rw">${s.survivalBest ? `<em>최고 ${s.survivalBest}초</em>` : '기록 없음'}</span>
        </button>`
      : (ch?.stages ?? []).map(st => {
          const open = isUnlocked(st, s.stages);
          const rec = s.stages[st.id];
          return `<button class="stage ${open ? '' : 'locked'}" data-id="${st.id}" type="button" ${open ? '' : 'disabled'}>
            <i class="no">${st.no}</i>
            <span class="tx"><b>${esc(st.name)}${st.boss ? ' <em>보스</em>' : ''}</b><small>${open ? esc(st.hint) : '앞 작전을 먼저 끝내세요'}</small></span>
            <span class="rw">${rec?.clears ? '<em>✓ 완료</em>' : `광석 ${st.rewardOre}`}</span>
          </button>`;
        }).join('');
    return `<div class="sheet-dim"></div>
      <div class="sheet" role="dialog" aria-label="작전 선택">
        <div class="sheet-head"><b>${chap === 'sv' ? '5분 버티기' : `${chap}장 · ${esc(ch?.name ?? '')}`}</b><button id="sheetClose" type="button" aria-label="닫기">✕</button></div>
        ${tabs}
        <div class="stage-list">${list}</div>
      </div>`;
  }

  return {
    el,
    show() { sheet = false; sst.drops = null; el.hidden = false; render(); if (tick) clearInterval(tick); tick = setInterval(() => { if (!el.hidden && sheet === 'supply' && !sst.drops) render(); }, 30000); },
    hide() { el.hidden = true; if (tick) { clearInterval(tick); tick = null; } },
  };
}
