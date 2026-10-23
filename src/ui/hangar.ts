import { assemble, type Build } from '../domain/assemble';
import { PARTS } from '../data/parts';
import { CHAPTERS, STAGES, SURVIVAL, OPS, RUSH, RUSH_BONUS, OP_DAILY_CAP, TOWER_MAX, opOfDay, towerStage, weekKey, isUnlocked } from '../data/stages';
import { store, update } from '../game/store';
import { SKILLS, HEROES, KIND_LABEL, heroById } from '../domain/loadout';
import { commanderLevel } from '../domain/save';
import { freeChestReady } from '../domain/supply';
import { levelMultiplier } from '../domain/upgrade';
import { unitFit, partName, esc, TARGET_LABEL } from './unitView';
import { play } from '../native/audio';
import { ruleById } from '../data/rules';
import { STORY_TOTAL, storyOf } from '../data/story';
import { activeSeason, upcomingSeason, daysLeft } from '../domain/season';
import { TIERS, tierOf, toNext, opponentTier, rankStage, ensureSeason, claimSeason } from '../domain/rank';
import type { Nav, Screen } from './app';
import { supplyHtml, oddsHtml, upgradeHtml, shopHtml, missionsHtml, attendHtml, seasonHtml, storyHtml, bindSheets, type SheetKind, type SheetState } from './hangarSheets';
import { canAttend, missionDone, todayStr } from '../domain/daily';
import { achClaimable } from '../domain/goals';
import { touchDaily } from './adFlow';

/** 격납고(홈): 선택한 설계도를 크게 보여 주고, 조립·출격으로 보낸다. */
export function mountHangar(root: HTMLElement, nav: Nav): Screen {
  const el = document.createElement('div');
  el.className = 'screen hangar'; el.hidden = true;
  root.appendChild(el);
  let sel = 0, sheet: false | 'stage' | 'gear' | SheetKind = false;
  const sst: SheetState = { drops: null, upTab: 'legs', extra: false, fullSalvage: false };
  let tick: ReturnType<typeof setInterval> | null = null;
  const toast = (msg: string) => { const t = document.createElement('div'); t.className = 'hg-toast'; t.textContent = msg; el.appendChild(t); setTimeout(() => t.remove(), 1800); };
  let chap: 1 | 2 | 3 | 'sv' | 'ch' = 1;
  /** 이야기 지도에서 고른 작전 id (없으면 지금 도전할 작전) */
  let selStage: string | null = null;

  const slotTitle = (b: Build) => partName(b.weapon);

  /** 상단 배너(Stitch 시안의 EVENT 줄): 열린 시즌이 있으면 시즌, 아니면 오늘의 요일 작전 */
  function bannerHtml(s: ReturnType<typeof store.getState>['save']): string {
    const today = todayStr(), se = activeSeason(today);
    if (se) return `<button class="hg-banner se" id="hgBanner" data-go="season" type="button"><em>EVENT</em><span><b>${esc(se.icon + ' ' + se.name)}</b> · 시즌 포인트 ${s.season.id === se.id ? s.season.points : 0}점 · ${daysLeft(se, today)}일 남음</span><i aria-hidden="true">›</i></button>`;
    if (!isUnlocked(OPS[0], s.stages)) return '';
    const op = opOfDay(), done = s.modes.opsDate === today ? s.modes.opsDone : 0;
    return `<button class="hg-banner" id="hgBanner" data-go="ops" type="button"><em>TODAY</em><span><b>${esc(op.name)}</b> · 보상 ${Math.max(0, OP_DAILY_CAP - done)}/${OP_DAILY_CAP}회</span><i aria-hidden="true">›</i></button>`;
  }

  /** 운영자 미오의 한마디(Stitch 시안의 OPERATOR 줄): 지금 하면 좋은 일을 알려 준다 */
  function operatorHtml(s: ReturnType<typeof store.getState>['save']): string {
    let msg: string;
    if (s.daily.missions.some(m => missionDone(m) && !m.claimed)) msg = '사령관님, 일일 임무 보상이 기다리고 있어요!';
    else if (canAttend(s, todayStr())) msg = '오늘 출석 보상을 아직 안 받으셨어요.';
    else if (s.tickets > 0 || freeChestReady(s, Date.now())) msg = '보급 상자를 열 수 있어요. 새 부품이 나올지도 몰라요!';
    else {
      const cur = STAGES.find(st => (s.stages[st.id]?.clears ?? 0) === 0 && isUnlocked(st, s.stages));
      const b = cur ? storyOf(cur.id) : undefined;
      msg = cur && b ? `다음 작전 ${cur.chapter}-${cur.no} 「${cur.name}」 — ${b.brief}.` : '모든 작전을 끝냈어요. 도전 탭에서 더 강한 상대를 만나 보세요!';
    }
    return `<div class="hg-op"><i class="op-av" aria-hidden="true"></i><span><small>OPERATOR · 미오</small><b>${esc(msg)}</b></span></div>`;
  }

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
        <div class="hg-res"><button class="hg-story" id="hgStory" type="button" aria-label="이야기 기록">📖 <b>${s.story.length}/${STORY_TOTAL}</b></button><span class="rs-t"><i aria-hidden="true">🎫</i>보급권 <b>${s.tickets}</b></span><span class="rs-o"><i aria-hidden="true">⛏</i>광석 <b>${s.ore.toLocaleString('ko-KR')}</b></span></div>
      </header>
      ${bannerHtml(s)}
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
      ${operatorHtml(s)}
      <footer class="hg-actions">
        <button class="btn ${guideAssemble ? 'pulse' : ''}" id="hgAssemble" type="button">🔧 유닛 바꾸기${guideAssemble ? '<em>NEW</em>' : ''}</button>
        <button class="btn" id="hgGear" type="button">🎖 장비</button>
        <button class="btn primary big sortie ${guideSortie ? 'pulse' : ''}" id="hgSortie" type="button"><b>출격</b><small>SORTIE</small><i aria-hidden="true">▶▶</i></button>
      </footer>
      <nav class="hg-nav">
        <button class="nv" id="nvMissions" type="button"><i class="nv-ic" aria-hidden="true">📋</i>임무${s.daily.missions.some(m => missionDone(m) && !m.claimed) || achClaimable(s) > 0 ? '<i class="dot"></i>' : ''}</button>
        <button class="nv" id="nvAttend" type="button"><i class="nv-ic" aria-hidden="true">🗓</i>출석${canAttend(s, todayStr()) ? '<i class="dot"></i>' : ''}</button>
        <button class="nv" id="nvSupply" type="button"><i class="nv-ic" aria-hidden="true">📦</i>보급${s.tickets > 0 || freeChestReady(s, Date.now()) ? '<i class="dot"></i>' : ''}</button>
        <button class="nv" id="nvUpgrade" type="button"><i class="nv-ic" aria-hidden="true">🔩</i>강화</button>
        <button class="nv" id="nvShop" type="button"><i class="nv-ic" aria-hidden="true">🛒</i>상점</button>
      </nav>
      ${guideAssemble ? '<div class="hg-tip">첫 승리! 설계도를 바꿔 더 강해져 보세요.</div>' : ''}
      ${sheet === 'stage' ? stageSheet() : sheet === 'gear' ? gearSheet() : sheet === 'supply' ? supplyHtml(sst, Date.now()) : sheet === 'odds' ? oddsHtml() : sheet === 'upgrade' ? upgradeHtml(sst) : sheet === 'shop' ? shopHtml() : sheet === 'missions' ? missionsHtml(sst.msTab ?? 'daily') : sheet === 'attend' ? attendHtml() : sheet === 'season' ? seasonHtml() : sheet === 'story' ? storyHtml() : ''}`;

    el.querySelectorAll<HTMLButtonElement>('.slot').forEach(b2 => b2.onclick = () => { sel = Number(b2.dataset.i); play('uiClick'); render(); });
    (el.querySelector('#hgAssemble') as HTMLButtonElement).onclick = () => { play('uiClick'); nav.openAssembly(sel); };
    (el.querySelector('#hgSortie') as HTMLButtonElement).onclick = () => {
      play('uiClick'); sheet = 'stage';
      // 아직 못 깬 첫 작전이 있는 장을 열어 준다
      const cur = STAGES.find(st => (store.getState().save.stages[st.id]?.clears ?? 0) === 0 && isUnlocked(st, store.getState().save.stages));
      chap = cur ? cur.chapter : 3; selStage = null; render();
    };
    el.querySelectorAll<HTMLButtonElement>('.ch-tab:not(:disabled)').forEach(b2 => b2.onclick = () => { play('uiClick'); chap = b2.dataset.ch === 'sv' ? 'sv' : b2.dataset.ch === 'ch' ? 'ch' : (Number(b2.dataset.ch) as 1 | 2 | 3); selStage = null; render(); });
    el.querySelectorAll<HTMLButtonElement>('.mp-node:not(:disabled)').forEach(b2 => b2.onclick = () => { play('uiClick'); selStage = b2.dataset.id!; render(); });
    (el.querySelector('#mapGo') as HTMLButtonElement | null)?.addEventListener('click', () => { play('uiClick'); sheet = false; nav.startBattle((el.querySelector('#mapGo') as HTMLButtonElement).dataset.id!); });
    (el.querySelector('#hgGear') as HTMLButtonElement).onclick = () => { play('uiClick'); sheet = 'gear'; render(); };
    (el.querySelector('#hgBanner') as HTMLButtonElement | null)?.addEventListener('click', () => {
      play('uiClick');
      if ((el.querySelector('#hgBanner') as HTMLElement).dataset.go === 'season') sheet = 'season'; else { sheet = 'stage'; chap = 'ch'; selStage = null; }
      render();
    });
    (el.querySelector('#hgStory') as HTMLButtonElement | null)?.addEventListener('click', () => { play('uiClick'); sheet = 'story'; render(); });
    (el.querySelector('#openSeason') as HTMLButtonElement | null)?.addEventListener('click', () => { play('uiClick'); sheet = 'season'; render(); });
    (el.querySelector('#rkClaim') as HTMLButtonElement | null)?.addEventListener('click', () => {
      const r = claimSeason(store.getState().save); if (!r) return;
      update(sv => { Object.assign(sv, r.save); }); play('packBurst'); toast(`시즌 보상: 광석 +${r.reward.ore}${r.reward.tickets ? ` · 보급권 +${r.reward.tickets}` : ''}`); render();
    });
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
    for (const [id, k] of [['#nvMissions', 'missions'], ['#nvAttend', 'attend'], ['#nvSupply', 'supply'], ['#nvUpgrade', 'upgrade'], ['#nvShop', 'shop']] as const) {
      (el.querySelector(id) as HTMLButtonElement).onclick = () => { play('uiClick'); sst.drops = null; sheet = k; render(); };
    }
    if (sheet === 'supply' || sheet === 'odds' || sheet === 'upgrade' || sheet === 'shop' || sheet === 'missions' || sheet === 'attend' || sheet === 'season' || sheet === 'story') bindSheets(el, sheet, sst, { rerender: render, toast, open: k => { sheet = k; render(); } });
    el.querySelector('#sheetClose')?.addEventListener('click', () => { play('uiBack'); sheet = false; sst.drops = null; render(); });
    el.querySelector('.sheet-dim')?.addEventListener('click', () => { sheet = false; render(); });
    el.querySelectorAll<HTMLButtonElement>('.stage:not(.locked):not(.gear-hero):not(.gear-skill):not(#openSeason):not(.st-read)').forEach(b2 => b2.onclick = () => { play('uiClick'); sheet = false; nav.startBattle(b2.dataset.id!); });
  }

  /** 출격 장비: 영웅 1명 + 스킬 2개. 사령관 레벨이 올라야 열리는 것이 있다. */
  function gearSheet(): string {
    const s = store.getState().save, lv = commanderLevel(s.commanderExp).level, lo = s.loadout;
    return `<div class="sheet-dim"></div>
      <div class="sheet" role="dialog" aria-label="출격 장비">
        <div class="sheet-head"><b>출격 장비</b><button id="sheetClose" type="button" aria-label="닫기">✕</button></div>
        <div class="stage-list">
          <h3 class="gear-h">영웅 (1명 · 와트 6 · 내 진영 어디든 출격)</h3>
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

  /** 시즌 이벤트 카드: 열린 시즌이 있으면 포인트·남은 일수, 없으면 다음 시즌 안내 */
  function seasonCard(s: ReturnType<typeof store.getState>['save']): string {
    const today = todayStr(), def = activeSeason(today), up = upcomingSeason(today);
    if (!def && !up) return '';
    const pts = def && s.season.id === def.id ? s.season.points : 0;
    return `<button class="stage se ${def ? '' : 'idle'}" id="openSeason" type="button"><i class="no">${(def ?? up)!.icon}</i>
      <span class="tx"><b>${esc((def ?? up)!.name)} <em class="rule">시즌 이벤트</em></b><small>${def ? `시즌 포인트 ${pts}점 · ${daysLeft(def, today)}일 남음. 보상과 별빛 방어전이 열려 있어요.` : `${up!.start.slice(5, 7)}월 ${up!.start.slice(8)}일에 시작해요.`}</small></span>
      <span class="rw"><em>${def ? '열림' : '준비 중'}</em></span></button>`;
  }

  /** 랭크전: AI 지휘관과 대전, 품계 점수 */
  function rankCard(s: ReturnType<typeof store.getState>['save']): string {
    const k = s.rank, t = tierOf(k.rp), nxt = toNext(k.rp), st = rankStage(opponentTier(t, k.seed), k.seed), ot = TIERS[st.rank!.tier];
    return `<div class="rk-box"><p class="rk-me"><b>${TIERS[t].icon} ${TIERS[t].name}</b> <small>${k.rp}점${nxt === null ? ' · 최고 품계' : ` · 다음 품계까지 ${nxt}점`} · 이번 주 ${k.wins}승 ${k.plays - k.wins}패</small></p>
      ${k.pending ? `<button class="btn primary pulse" id="rkClaim" type="button">지난 시즌 보상 받기 (광석 ${k.pending.ore}${k.pending.tickets ? ` · 보급권 ${k.pending.tickets}` : ''})</button>` : ''}</div>
      <button class="stage rk" data-id="${st.id}" type="button">
        <i class="no">${ot.icon}</i>
        <span class="tx"><b>랭크전 <em>AI 지휘관</em></b><small>${esc(st.rank!.name)} · ${ot.name} 품계 · 적 레벨 ${st.enemyLevel}. 서버 없이 AI 가 조종하는 상대예요. 이기면 품계 점수가 오릅니다.</small></span>
        <span class="rw"><em>대전</em>광석 ${st.rewardOre}</span>
      </button>`;
  }

  /** 무한의 탑: 최고 층 + 1 층에 도전 */
  function towerCard(s: ReturnType<typeof store.getState>['save']): string {
    const best = s.modes.towerBest, f = Math.min(TOWER_MAX, best + 1), t = towerStage(f), r = ruleById(t.rule);
    return `<button class="stage tw" data-id="${t.id}" type="button">
        <i class="no">${f}층</i>
        <span class="tx"><b>무한의 탑${t.boss ? ' <em>보스</em>' : ''}${r ? ` <em class="rule">${r.icon} ${esc(r.name)}</em>` : ''}</b><small>${esc(t.hint)}${r ? ` <i class="rule-tx">규칙: ${esc(r.desc)}</i>` : ''}</small></span>
        <span class="rw"><em>${best ? `최고 ${best}층` : '기록 없음'}</em>광석 ${t.rewardOre}</span>
      </button>`;
  }

  /** 보스 러시: 3연전, 주 1회 큰 보상 */
  function rushCard(s: ReturnType<typeof store.getState>['save']): string {
    const open = isUnlocked(RUSH[0], s.stages), done = s.modes.rushWeek === weekKey() && s.modes.rushDone;
    return `<button class="stage rush ${open ? '' : 'locked'}" data-id="${RUSH[0].id}" type="button" ${open ? '' : 'disabled'}>
        <i class="no">☠</i>
        <span class="tx"><b>보스 러시 <em>보스 3연전</em></b><small>${open ? '모선 → 공중 요새 → 요새 장군. 기지 체력이 이어집니다. 끝까지 이기면 주간 보너스(광석 ' + RUSH_BONUS.ore + ' · 보급권 ' + RUSH_BONUS.tickets + ').' : '2장을 끝내면 열립니다'}</small></span>
        <span class="rw"><em>${done ? '이번 주 완료' : '이번 주 도전 가능'}</em>최고 ${s.modes.rushBest}/3</span>
      </button>`;
  }

  /** 도전 탭: 오늘의 요일 작전 */
  function challengeList(s: ReturnType<typeof store.getState>['save']): string {
    const today = todayStr(), op = opOfDay(), done = s.modes.opsDate === today ? s.modes.opsDone : 0, left = Math.max(0, OP_DAILY_CAP - done);
    const r = ruleById(op.rule), DAYS = ['일', '월', '화', '수', '목', '금', '토'];
    const week = OPS.slice(1).concat(OPS[0]).map(o => `<span class="${o.id === op.id ? 'on' : ''}">${DAYS[o.op!]}</span>`).join('');
    return `<button class="stage op" data-id="${op.id}" type="button">
        <i class="no">${DAYS[op.op!]}</i>
        <span class="tx"><b>${esc(op.name.split(' · ')[1] ?? op.name)}${op.boss ? ' <em>보스</em>' : ''}${r ? ` <em class="rule">${r.icon} ${esc(r.name)}</em>` : ''}</b><small>${esc(op.hint)}${r ? ` <i class="rule-tx">규칙: ${esc(r.desc)}</i>` : ''}</small></span>
        <span class="rw"><em>${left > 0 ? `보상 ${left}/${OP_DAILY_CAP}회` : '보상 완료'}</em>광석 ${op.rewardOre}</span>
      </button>
      <p class="op-week" aria-label="요일 작전 일정">${week}</p>
      <p class="op-note">하루 ${OP_DAILY_CAP}번 이기면 보상을 전부 받아요(첫 승리는 보급권 2). 그 뒤에도 도전은 가능하고 보상은 20%예요.</p>
      ${seasonCard(s)}${towerCard(s)}${rushCard(s)}${rankCard(s)}`;
  }

  /**
   * 이야기 지도 (Stitch 시안 「STORY MAP」 반영): 1·2·3장은 아래에서 위로 올라가는 길 위의 마디로 보인다.
   * 깬 마디는 책(이야기 해금)+별, 지금 도전할 마디는 빛나고, 잠긴 마디는 자물쇠, 7번째는 큰 보스 마디. 마디를 누르면 아래 설명 칸에 이야기·보상이 뜨고 「작전 개시」 로 출격.
   */
  function mapSheet(s: ReturnType<typeof store.getState>['save'], ch: (typeof CHAPTERS)[number], tabs: string): string {
    const cleared = (id: string) => (s.stages[id]?.clears ?? 0) > 0;
    const cur = ch.stages.find(st => !cleared(st.id) && isUnlocked(st, s.stages)) ?? ch.stages[ch.stages.length - 1];
    const sel = ch.stages.find(st => st.id === selStage && isUnlocked(st, s.stages)) ?? cur;
    const N = ch.stages.length, ROW = 96, H = N * ROW + 40;
    const XS = [50, 28, 70, 34, 72, 30, 50];
    const pos = ch.stages.map((_, i) => ({ x: XS[i % XS.length], y: H - 20 - (i + 0.5) * ROW }));
    const doneUpTo = Math.max(-1, ...ch.stages.map((st, i) => (cleared(st.id) ? i : -1)));
    const trail = (upTo: number): string => { let d = ''; pos.slice(0, upTo + 1).forEach((p, i) => { if (i === 0) d += `M${p.x},${p.y}`; else { const q = pos[i - 1], my = (p.y + q.y) / 2; d += ` C${q.x},${my} ${p.x},${my} ${p.x},${p.y}`; } }); return d; };
    const path = trail(N - 1), donePath = doneUpTo >= 1 ? trail(Math.min(N - 1, doneUpTo + 1)) : '';
    const stars = (st: (typeof ch.stages)[number]) => { const hp = s.stages[st.id]?.bestBaseHp ?? 0; return hp >= 700 ? 3 : hp >= 350 ? 2 : 1; };
    const nodes = ch.stages.map((st, i) => {
      const open = isUnlocked(st, s.stages), done = cleared(st.id), isCur = st.id === cur.id && !done, boss = !!st.boss || i === N - 1;
      const icon = done ? (s.story.includes(st.id) ? '📖' : '✔') : isCur ? '⚔' : open ? '▶' : '🔒';
      const state = done ? 'done' : isCur ? 'cur' : open ? 'open' : 'lock';
      return `<button class="mp-node ${state} ${boss ? 'boss' : ''} ${st.id === sel.id ? 'sel' : ''}" data-id="${st.id}" type="button" ${open ? '' : 'disabled'} style="left:${pos[i].x}%;top:${pos[i].y}px" aria-label="${ch.no}-${st.no} ${esc(st.name)}${done ? ' 완료' : open ? '' : ' 잠김'}">
        <i class="mp-ic">${boss && !done ? '☠' : icon}</i>
        <b class="mp-no">${ch.no}-${st.no}</b>
        <span class="mp-nm">${esc(st.name)}</span>
        ${done ? `<span class="mp-st">${'★'.repeat(stars(st))}${'☆'.repeat(3 - stars(st))}</span>` : isCur ? '<span class="mp-st cur">진행 중</span>' : ''}
      </button>`;
    }).join('');
    const rule = ruleById(sel.rule), b = storyOf(sel.id), got = s.story.includes(sel.id), rec = s.stages[sel.id];
    const read = ch.stages.filter(st => s.story.includes(st.id)).length;
    const detail = `<div class="mp-detail">
        <div class="mp-dh"><span class="mp-tag">STAGE ${ch.no}-${sel.no}</span><b>${esc(sel.name)}</b>${sel.boss ? '<em class="boss-tag">보스</em>' : ''}${rule ? `<em class="rule">${rule.icon} ${esc(rule.name)}</em>` : ''}</div>
        <p class="mp-story">${b ? `📖 ${got ? esc(b.title) + ' (해금됨)' : esc(b.brief) + ' — 클리어하면 이야기 해금'}` : ''}</p>
        <p class="mp-hint">${esc(sel.hint)}${rule ? ` <i class="rule-tx">규칙: ${esc(rule.desc)}</i>` : ''}</p>
        <div class="mp-foot"><span>${rec?.clears ? `클리어 ${rec.clears}회 · ` : ''}광석 ${sel.rewardOre} · 경험치 ${sel.rewardExp}</span><button class="btn primary mp-go" id="mapGo" data-id="${sel.id}" type="button">작전 개시</button></div>
      </div>`;
    return `<div class="sheet-dim"></div>
      <div class="sheet map" role="dialog" aria-label="이야기 지도">
        <div class="sheet-head"><b>이야기 지도</b><button id="sheetClose" type="button" aria-label="닫기">✕</button></div>
        ${tabs}
        <div class="mp-chap"><span class="mp-tag">CHAPTER ${String(ch.no).padStart(2, '0')}</span><b>${esc(ch.name)}</b><span class="mp-prog">📖 이야기 ${read}/${N}</span></div>
        <div class="stage-list mp-wrap"><div class="mp-map" style="height:${H}px">
          <svg class="mp-path" viewBox="0 0 100 ${H}" preserveAspectRatio="none" aria-hidden="true"><path class="base" d="${path}" vector-effect="non-scaling-stroke"/>${donePath ? `<path class="done" d="${donePath}" vector-effect="non-scaling-stroke"/>` : ''}</svg>
          ${nodes}
        </div></div>
        ${detail}
      </div>`;
  }

  /** 작전 선택: 장 탭(1·2·3장·5분 버티기) + 전투 목록 */
  function stageSheet(): string {
    const s = store.getState().save;
    const ch = CHAPTERS.find(c => c.no === chap);
    const tabsHtml = (): string => `<div class="ch-tabs">${CHAPTERS.map(c => {
      const open = isUnlocked(c.stages[0], s.stages);
      return `<button class="ch-tab ${chap === c.no ? 'on' : ''}" data-ch="${c.no}" type="button" ${open ? '' : 'disabled'}>${c.no}장${open ? '' : ' 🔒'}</button>`;
    }).join('')}<button class="ch-tab ${chap === 'sv' ? 'on' : ''}" data-ch="sv" type="button" ${isUnlocked(SURVIVAL, s.stages) ? '' : 'disabled'}>5분 버티기${isUnlocked(SURVIVAL, s.stages) ? '' : ' 🔒'}</button><button class="ch-tab ${chap === 'ch' ? 'on' : ''}" data-ch="ch" type="button" ${isUnlocked(OPS[0], s.stages) ? '' : 'disabled'}>도전${isUnlocked(OPS[0], s.stages) ? '' : ' 🔒'}</button></div>`;
    const tabs = tabsHtml();
    if (typeof chap === 'number' && ch) return mapSheet(s, ch, tabs);
    const list = chap === 'ch' ? challengeList(s) : chap === 'sv'
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
            <span class="tx"><b>${esc(st.name)}${st.boss ? ' <em>보스</em>' : ''}${ruleById(st.rule) ? ` <em class="rule">${ruleById(st.rule)!.icon} ${esc(ruleById(st.rule)!.name)}</em>` : ''}</b><small>${storyOf(st.id) ? `<i class="brief">📖 ${esc(storyOf(st.id)!.brief)}${(store.getState().save.story.includes(st.id)) ? ' ✓' : ''}</i> ` : ''}${open ? esc(st.hint) : '앞 작전을 먼저 끝내세요'}${open && ruleById(st.rule) ? ` <i class="rule-tx">규칙: ${esc(ruleById(st.rule)!.desc)}</i>` : ''}</small></span>
            <span class="rw">${rec?.clears ? '<em>✓ 완료</em>' : `광석 ${st.rewardOre}`}</span>
          </button>`;
        }).join('');
    return `<div class="sheet-dim"></div>
      <div class="sheet" role="dialog" aria-label="작전 선택">
        <div class="sheet-head"><b>${chap === 'sv' ? '5분 버티기' : chap === 'ch' ? '도전 작전' : `${chap}장 · ${esc(ch?.name ?? '')}`}</b><button id="sheetClose" type="button" aria-label="닫기">✕</button></div>
        ${tabs}
        <div class="stage-list">${list}</div>
      </div>`;
  }

  return {
    el,
    show() { sheet = false; sst.drops = null; sst.extra = false; touchDaily(() => { /* 오늘 임무 뽑기 */ }); update(sv => { ensureSeason(sv, weekKey()); }); el.hidden = false; render(); if (tick) clearInterval(tick); tick = setInterval(() => { if (!el.hidden && sheet === 'supply' && !sst.drops) render(); }, 30000); },
    hide() { el.hidden = true; if (tick) { clearInterval(tick); tick = null; } },
  };
}
