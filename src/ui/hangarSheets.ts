import { PARTS } from '../data/parts';
import { CATALOG, GROUP_LABEL, won, type ProductGroup } from '../data/catalog';
import { store, update } from '../game/store';
import { openChest, openFreeChest, extraDrop, freeChestReady, freeChestWaitMs, oddsTable, partsOf, rarityOf, upgradePart, SUPPLY, RARITY_LABEL, type Drop, type Rarity } from '../domain/supply';
import { MISSION_REWARDS, defOf, missionDone, claimMission, refreshMission, claimAttend, attendReward, attendDay, canAttend, ATTEND_DAYS, salvageCopies, addProgress, todayStr, SALVAGE_RATIO } from '../domain/daily';
import { adAvailable, adLabel, watchForSlot, touchDaily } from './adFlow';
import { WEEKLY, WEEKLY_BONUS, ACHIEVEMENTS, weeklyProgress, weeklyDone, weeklyClaimed, bonusReady, claimWeekly, claimWeeklyBonus, achProgress, achDone, achClaimed, claimAch, achClaimable } from '../domain/goals';
import { weekKey } from '../data/stages';
import { upgradeCost, levelMultiplier, MAX_LEVEL } from '../domain/upgrade';
import { accIconUrl, spriteUrl } from '../game/unitLayout';
import { esc, partName } from './unitView';
import { play } from '../native/audio';

/** 격납고 시트 4종: 보급(상자) · 강화 · 상점 · 확률표. 화면 이동 없이 격납고 위에 올라온다. */
export type SheetKind = 'supply' | 'upgrade' | 'shop' | 'odds' | 'missions' | 'attend';
export interface SheetState { msTab?: 'daily' | 'weekly' | 'ach'; drops: Drop[] | null; upTab: 'legs' | 'body' | 'weapon' | 'accessory'; /** 이번 상자에 한 칸 더(광고)를 썼는가 */ extra: boolean; /** 다음 분해를 100% 로(광고 A7 시청 뒤) */ fullSalvage: boolean }
export interface SheetCtx { rerender(): void; toast(msg: string): void; open(k: SheetKind | false): void }

const partImg = (id: string, w = 40) => {
  const p = PARTS.find(x => x.id === id);
  return `<img class="pimg" src="${p?.kind === 'accessory' ? accIconUrl(id) : spriteUrl(id)}" alt="" draggable="false" style="max-width:${w}px;max-height:${w}px">`;
};
const rarityTag = (r: Rarity) => `<em class="rar ${r}">${RARITY_LABEL[r]}</em>`;
const crate = (tier: 1 | 2 | 3, open = false) => `<img class="crate" src="sprites/ui/crate_${tier}${open ? 'o' : ''}.png" alt="" draggable="false" onerror="this.style.display='none'">`;
const head = (title: string) => `<div class="sheet-head"><b>${title}</b><button id="sheetClose" type="button" aria-label="닫기">✕</button></div>`;

function waitText(ms: number): string {
  const m = Math.ceil(ms / 60000);
  return m >= 60 ? `${Math.floor(m / 60)}시간 ${m % 60}분` : `${m}분`;
}

export function supplyHtml(st: SheetState, now: number): string {
  const s = store.getState().save;
  const free = freeChestReady(s, now);
  const best: Rarity = st.drops?.some(d => d.rarity === 'epic') ? 'epic' : st.drops?.some(d => d.rarity === 'rare') ? 'rare' : 'common';
  const tier = best === 'epic' ? 3 : best === 'rare' ? 2 : 1;
  const drops = st.drops ? `<div class="sp-drops">${st.drops.map(d => d.kind === 'ore'
    ? `<div class="drop ore"><i class="ic">⛏</i><b>광석 +${d.ore}</b><small>${rarityTag('common').replace('일반', '재화')}</small></div>`
    : `<div class="drop ${d.rarity}">${partImg(d.part!, 56)}<b>${esc(partName(d.part!))}</b><small>조각 ×${d.copies} ${rarityTag(d.rarity!)}</small></div>`).join('')}</div>` : '';
  return `<div class="sheet-dim"></div>
    <div class="sheet" role="dialog" aria-label="보급 상자">
      ${head('보급 상자')}
      <div class="sp-body">
        <div class="sp-hero">${crate(st.drops ? tier : 1, !!st.drops)}<div class="sp-stat"><span>보급권 <b>${s.tickets}</b></span><span>연 상자 <b>${s.supply.opened}</b></span><span>에픽 천장 <b>${Math.min(s.supply.pity, SUPPLY.pityEvery)}/${SUPPLY.pityEvery}</b></span></div></div>
        ${drops || '<p class="sp-tip">상자 하나에 칸 3개 — 광석 또는 부품 조각이 나와요. 조각은 「강화」에 씁니다.</p>'}
        <div class="sp-actions">
          <button class="btn primary" id="spOpen" type="button" ${s.tickets > 0 ? '' : 'disabled'}>보급권으로 열기 (${s.tickets}장)</button>
          <button class="btn ${free ? 'pulse' : ''}" id="spFree" type="button" ${free ? '' : 'disabled'}>${free ? '무료 상자 열기' : `무료 상자 ${waitText(freeChestWaitMs(s, now))} 뒤`}</button>
          ${!free && adAvailable('free_chest') ? `<button class="btn ad" id="spFreeAd" type="button">${adLabel('무료 상자 바로 열기', 'free_chest')}</button>` : ''}
          ${st.drops && !st.extra && adAvailable('chest_extra') ? `<button class="btn ad" id="spExtra" type="button">${adLabel('한 칸 더 받기', 'chest_extra')}</button>` : ''}
          <button class="btn ghost" id="spOdds" type="button">확률표 보기</button>
        </div>
        <p class="sp-note">보급권은 작전 첫 승리(보스 2장)와 3승마다 받아요. 유료 상자는 없습니다 — 모든 상자는 같은 확률표를 씁니다.</p>
      </div>
    </div>`;
}

export function oddsHtml(): string {
  const rows = oddsTable().map(r => `<tr><td>${r.label}</td><td class="n">${r.pct.toFixed(0)}%</td><td>${r.note}</td></tr>`).join('');
  const byR = (['epic', 'rare', 'common'] as Rarity[]).map(r => `<p><b>${RARITY_LABEL[r]}</b> ${partsOf(r).length}종: ${partsOf(r).map(p => esc(p.name)).join(' · ')}</p>`).join('');
  return `<div class="sheet-dim"></div>
    <div class="sheet" role="dialog" aria-label="확률표">
      ${head('상자 확률표')}
      <div class="sp-body">
        <p class="sp-note">상자 1개 = 칸 ${SUPPLY.rolls}개, 칸마다 아래 확률로 따로 뽑습니다.</p>
        <table class="odds"><thead><tr><th>결과</th><th>확률</th><th>내용</th></tr></thead><tbody>${rows}</tbody></table>
        <p class="sp-note">에픽 부품 조각이 ${SUPPLY.pityEvery - 1}상자 연속 나오지 않으면 다음 상자의 마지막 칸은 에픽 조각이 확정입니다. 무료 상자(${SUPPLY.freeHours}시간마다)·보급권 상자는 같은 표를 씁니다. 부품 등급은 같은 종류 안에서 와트가 높은 순입니다.</p>
        <div class="odds-parts">${byR}</div>
        <button class="btn" id="oddsBack" type="button">보급 화면으로</button>
      </div>
    </div>`;
}

const UP_TABS: { k: SheetState['upTab']; label: string }[] = [{ k: 'legs', label: '다리' }, { k: 'body', label: '몸통' }, { k: 'weapon', label: '무기' }, { k: 'accessory', label: '액세서리' }];

export function upgradeHtml(st: SheetState): string {
  const s = store.getState().save;
  const list = PARTS.filter(p => p.kind === st.upTab).map(p => {
    const lv = s.partLevels[p.id] ?? 1, cost = upgradeCost(lv), have = s.copies[p.id] ?? 0;
    const can = !!cost && have >= cost.copies && s.ore >= cost.ore;
    return `<div class="up-row">
      ${partImg(p.id, 44)}
      <span class="tx"><b>${esc(p.name)} ${rarityTag(rarityOf(p.id))}</b><small>Lv.${lv}/${MAX_LEVEL} · 능력 +${Math.round((levelMultiplier(lv) - 1) * 100)}%${cost ? ` · 다음 +${Math.round((levelMultiplier(lv + 1) - levelMultiplier(lv)) * 100)}%` : ' · 최고'}</small>
        ${cost ? `<i class="bar"><u style="width:${Math.min(100, (have / cost.copies) * 100)}%"></u></i><small>조각 ${have}/${cost.copies} · 광석 ${cost.ore}</small>` : ''}</span>
      <span class="up-acts"><button class="btn ${can ? 'primary' : ''} up-btn" data-id="${p.id}" type="button" ${cost ? '' : 'disabled'}>${cost ? '강화' : 'MAX'}</button>${have > 0 ? `<button class="btn up-salv" data-id="${p.id}" type="button">분해</button>` : ''}</span>
    </div>`;
  }).join('');
  return `<div class="sheet-dim"></div>
    <div class="sheet" role="dialog" aria-label="강화">
      ${head('부품 강화')}
      <div class="ch-tabs">${UP_TABS.map(t => `<button class="ch-tab up-tab ${st.upTab === t.k ? 'on' : ''}" data-k="${t.k}" type="button">${t.label}</button>`).join('')}</div>
      <p class="sp-note">광석 <b>${s.ore.toLocaleString('ko-KR')}</b> · 같은 부품 조각(보급 상자)과 광석으로 한 단계씩 올려요. Lv10 은 Lv1 보다 최대 +30% (체력·공격). 설계도 강화 단계 = 세 부품 레벨의 평균입니다. 남는 조각은 「분해」로 광석 ${Math.round(SALVAGE_RATIO * 100)}% 를 돌려받아요.</p>
      ${st.fullSalvage ? '<p class="sp-note"><b>다음 분해는 100% 환급</b>이 적용돼요.</p>' : adAvailable('salvage_full') ? `<button class="btn ad up-full" id="upFull" type="button">${adLabel('분해 100% 환급', 'salvage_full')}</button>` : ''}
      <div class="stage-list">${list}</div>
    </div>`;
}

export function shopHtml(): string {
  const groups = (Object.keys(GROUP_LABEL) as ProductGroup[]).map(g => {
    const items = CATALOG.filter(p => p.group === g);
    if (!items.length) return '';
    return `<h3 class="gear-h">${GROUP_LABEL[g]}</h3>${items.map(p => `<div class="shop-row"><span class="tx"><b>${esc(p.name)}</b><small>${esc(p.desc)}</small></span><button class="btn shop-buy" data-id="${p.id}" type="button">${won(p.krw)}${p.per ? ` / ${p.per}` : ''}</button></div>`).join('')}`;
  }).join('');
  return `<div class="sheet-dim"></div>
    <div class="sheet" role="dialog" aria-label="상점">
      ${head('상점')}
      <p class="sp-note shop-note">테스트 빌드에서는 결제가 열리지 않아요. 출시 때 같은 목록으로 열립니다. 능력치를 파는 상품은 없고, 유료 상자도 없습니다.</p>
      <div class="stage-list">${groups}</div>
    </div>`;
}

const rewTx = (r: { ore: number; exp: number; tickets: number }) => `광석 ${r.ore}${r.exp ? ` · 경험치 ${r.exp}` : ''}${r.tickets ? ` · 보급권 ${r.tickets}` : ''}`;

function weeklyRows(): string {
  const s = store.getState().save, wk = weekKey();
  const rows = WEEKLY.map(w => {
    const p = weeklyProgress(s, w.type, wk), done = weeklyDone(s, w, wk), got = weeklyClaimed(s, w.type, wk);
    return `<div class="ms-row ${got ? 'done' : ''}">
      <span class="tx"><b>${w.label} (${w.target})</b><i class="bar"><u style="width:${(p / w.target) * 100}%"></u></i><small>${p}/${w.target} · ${rewTx(w.reward)}</small></span>
      <span class="ms-acts"><button class="btn ${done && !got ? 'primary pulse' : ''} wk-claim" data-t="${w.type}" type="button" ${done && !got ? '' : 'disabled'}>${got ? '받음' : done ? '받기' : '진행 중'}</button></span>
    </div>`;
  }).join('');
  const bonus = bonusReady(s, wk), bGot = s.goals.week === wk && s.goals.bonus;
  return `${rows}<div class="ms-row ${bGot ? 'done' : ''}"><span class="tx"><b>주간 보너스 — 5개 모두 받기</b><small>${rewTx(WEEKLY_BONUS)}</small></span><span class="ms-acts"><button class="btn ${bonus ? 'primary pulse' : ''}" id="wkBonus" type="button" ${bonus ? '' : 'disabled'}>${bGot ? '받음' : bonus ? '받기' : '잠김'}</button></span></div>`;
}

function achRows(): string {
  const s = store.getState().save;
  const order = [...ACHIEVEMENTS].sort((a, b) => Number(achClaimed(s, a.id)) - Number(achClaimed(s, b.id)) || Number(achDone(s, b)) - Number(achDone(s, a)));
  return order.map(a => {
    const p = achProgress(s, a), done = achDone(s, a), got = achClaimed(s, a.id);
    return `<div class="ms-row ${got ? 'done' : ''}">
      <span class="tx"><b>${a.icon} ${esc(a.title)}</b><i class="bar"><u style="width:${(p / a.target) * 100}%"></u></i><small>${esc(a.desc)} · ${Math.min(p, a.target)}/${a.target} · ${rewTx(a.reward)}</small></span>
      <span class="ms-acts"><button class="btn ${done && !got ? 'primary pulse' : ''} ac-claim" data-id="${a.id}" type="button" ${done && !got ? '' : 'disabled'}>${got ? '칭호 ✓' : done ? '받기' : '진행 중'}</button></span>
    </div>`;
  }).join('');
}

export function missionsHtml(tab: 'daily' | 'weekly' | 'ach' = 'daily'): string {
  const s = store.getState().save, d = s.daily;
  const tabs = `<div class="ch-tabs ms-tabs">${([['daily', '일일'], ['weekly', '주간'], ['ach', `업적${achClaimable(s) ? ' ●' : ''}`]] as const).map(([k, l]) => `<button class="ch-tab ms-tab ${tab === k ? 'on' : ''}" data-k="${k}" type="button">${l}</button>`).join('')}</div>`;
  if (tab !== 'daily') {
    return `<div class="sheet-dim"></div>
    <div class="sheet" role="dialog" aria-label="${tab === 'weekly' ? '주간 과제' : '업적'}">
      ${head(tab === 'weekly' ? '주간 과제' : `업적 칭호 ${s.goals.ach.length}/${ACHIEVEMENTS.length}`)}
      ${tabs}
      <p class="sp-note">${tab === 'weekly' ? '매주 월요일에 새로 시작해요. 완료한 과제는 직접 「받기」를 눌러야 지급되고, 5개를 모두 받으면 주간 보너스가 열립니다.' : '조건을 채우면 칭호와 보상을 받을 수 있어요. 받은 칭호는 계속 남습니다.'}</p>
      <div class="stage-list">${tab === 'weekly' ? weeklyRows() : achRows()}</div>
    </div>`;
  }

  const rows = d.missions.map((m, i) => {
    const def = defOf(m.type), r = MISSION_REWARDS[i] ?? MISSION_REWARDS[0], done = missionDone(m);
    const rew = `광석 ${r.ore} · 경험치 ${r.exp}${r.tickets ? ` · 보급권 ${r.tickets}` : ''}`;
    const canRef = !m.claimed && !d.refreshed && adAvailable('mission_refresh');
    return `<div class="ms-row ${m.claimed ? 'done' : ''}">
      <span class="tx"><b>${def.label} (${m.target})</b><i class="bar"><u style="width:${(m.progress / m.target) * 100}%"></u></i><small>${m.progress}/${m.target} · ${rew}</small></span>
      <span class="ms-acts"><button class="btn ${done && !m.claimed ? 'primary pulse' : ''} ms-claim" data-i="${i}" type="button" ${done && !m.claimed ? '' : 'disabled'}>${m.claimed ? '받음' : done ? '받기' : '진행 중'}</button>${canRef ? `<button class="btn ad ms-ref" data-i="${i}" type="button">${adLabel('임무 바꾸기', 'mission_refresh')}</button>` : ''}</span>
    </div>`;
  }).join('');
  return `<div class="sheet-dim"></div>
    <div class="sheet" role="dialog" aria-label="일일 임무">
      ${head('일일 임무')}
      ${tabs}
      <p class="sp-note">매일 자정(기기 시간)에 새로 바뀌어요. 완료한 임무는 직접 「받기」를 눌러야 지급됩니다. 하루에 임무 1개는 광고로 바꿀 수 있어요.</p>
      <div class="stage-list">${rows || '<p class="sp-tip">임무를 불러오는 중…</p>'}</div>
    </div>`;
}

export function attendHtml(): string {
  const s = store.getState().save, today = todayStr(), can = canAttend(s, today), cur = attendDay(s);
  const cells = Array.from({ length: ATTEND_DAYS }, (_, i) => {
    const day = i + 1, r = attendReward(day), got = day < cur || (day === cur && !can && s.attend.lastDate === today), isToday = day === cur && can;
    const big = !!r.copies || day === ATTEND_DAYS;
    return `<div class="at-cell ${got ? 'got' : ''} ${isToday ? 'today' : ''} ${big ? 'big' : ''}"><i>${day}</i><b>${r.copies ? '조각' : r.tickets ? '🎁' : '⛏'}</b><small>${r.copies ? `×${r.copies.n}` : r.tickets ? `+${r.tickets}` : r.ore}</small>${got ? '<em>✓</em>' : ''}</div>`;
  }).join('');
  const r = attendReward(cur);
  return `<div class="sheet-dim"></div>
    <div class="sheet" role="dialog" aria-label="출석">
      ${head('출석 28일')}
      <p class="sp-note">하루에 한 번 받아요. 빠진 날이 있어도 벌칙 없이 다음 날짜부터 이어집니다. 28일을 채우면 처음부터 다시 시작해요. 오늘 보상: 광석 ${r.ore} · 경험치 ${r.exp}${r.tickets ? ` · 보급권 ${r.tickets}` : ''}${r.copies ? ` · ${esc(partName(r.copies.part))} 조각 ×${r.copies.n}` : ''}</p>
      <div class="at-grid">${cells}</div>
      <button class="btn ${can ? 'primary pulse' : ''}" id="atClaim" type="button" ${can ? '' : 'disabled'}>${can ? `${cur}일차 출석 받기` : '오늘은 받았어요'}</button>
    </div>`;
}

/** 시트 안 버튼 연결 (격납고 render 끝에서 호출) */
export function bindSheets(el: HTMLElement, kind: SheetKind, st: SheetState, ctx: SheetCtx): void {
  const on = (sel: string, f: (b: HTMLButtonElement) => void) => el.querySelectorAll<HTMLButtonElement>(sel).forEach(b => b.onclick = () => f(b));
  on('#spOpen', () => {
    const r = openChest(store.getState().save);
    if (!r) { play('deny'); ctx.toast('보급권이 없어요.'); return; }
    update(sv => { Object.assign(sv, r.save); }); touchDaily(sv => addProgress(sv, 'chest')); st.drops = r.drops; st.extra = false; play('packBurst'); ctx.rerender();
  });
  on('#spFree', () => {
    const r = openFreeChest(store.getState().save, Date.now());
    if (!r) { play('deny'); return; }
    update(sv => { Object.assign(sv, r.save); }); touchDaily(sv => addProgress(sv, 'chest')); st.drops = r.drops; st.extra = false; play('packBurst'); ctx.rerender();
  });
  on('#spOdds', () => { play('uiClick'); ctx.open('odds'); });
  on('#oddsBack', () => { play('uiBack'); ctx.open('supply'); });
  on('.up-tab', b => { st.upTab = b.dataset.k as SheetState['upTab']; play('uiClick'); ctx.rerender(); });
  on('.up-btn', b => {
    const r = upgradePart(store.getState().save, b.dataset.id!);
    if (!r.ok) { play('deny'); ctx.toast(r.reason); return; }
    update(sv => { Object.assign(sv, r.save); }); touchDaily(sv => addProgress(sv, 'upgrade')); play('ready'); ctx.toast(`${partName(b.dataset.id!)} Lv.${r.save.partLevels[b.dataset.id!]} 강화!`); ctx.rerender();
  });
  on('.shop-buy', () => { play('deny'); ctx.toast('테스트 빌드에서는 결제가 열리지 않아요.'); });
  // ── 보상형 광고 자리 (A3·A4·A6·A7)
  on('#spFreeAd', async () => {
    const r = await watchForSlot('free_chest', sv => { sv.supply.freeAt = 0; });
    if (!r.ok) { play('deny'); ctx.toast(r.msg); return; }
    const o = openFreeChest(store.getState().save, Date.now()); if (!o) return;
    update(sv => { Object.assign(sv, o.save); }); touchDaily(sv => addProgress(sv, 'chest')); st.drops = o.drops; st.extra = false; play('packBurst'); ctx.rerender();
  });
  on('#spExtra', async () => {
    let drop: Drop | null = null;
    const r = await watchForSlot('chest_extra', sv => { const e = extraDrop(sv); Object.assign(sv, e.save); drop = e.drop; });
    if (!r.ok || !drop) { play('deny'); ctx.toast(r.msg); return; }
    st.drops = [...(st.drops ?? []), drop]; st.extra = true; play('packBurst'); ctx.rerender();
  });
  on('#upFull', async () => {
    const r = await watchForSlot('salvage_full', () => { /* 지급은 분해할 때 */ });
    if (!r.ok) { play('deny'); ctx.toast(r.msg); return; }
    st.fullSalvage = true; play('ready'); ctx.toast('다음 분해는 광석 100% 로 돌려받아요.'); ctx.rerender();
  });
  on('.up-salv', b => {
    const id = b.dataset.id!, r = salvageCopies(store.getState().save, id, st.fullSalvage);
    if (!r) { play('deny'); return; }
    update(sv => { Object.assign(sv, r.save); }); st.fullSalvage = false; play('ready'); ctx.toast(`${partName(id)} 조각을 분해해 광석 +${r.ore}`); ctx.rerender();
  });
  // ── 일일 임무 · 출석
  on('.ms-claim', b => {
    const r = claimMission(store.getState().save, Number(b.dataset.i)); if (!r) { play('deny'); return; }
    update(sv => { Object.assign(sv, r.save); }); play('ready'); ctx.toast(`임무 보상: 광석 +${r.reward.ore}${r.reward.tickets ? ` · 보급권 +${r.reward.tickets}` : ''}`); ctx.rerender();
  });
  on('.ms-ref', async b => {
    const i = Number(b.dataset.i);
    const r = await watchForSlot('mission_refresh', sv => { const n = refreshMission(sv, i); if (n) Object.assign(sv, n); });
    if (!r.ok) { play('deny'); ctx.toast(r.msg); return; }
    play('uiClick'); ctx.toast('임무를 바꿨어요.'); ctx.rerender();
  });
  on('.ms-tab', b => { play('uiClick'); st.msTab = b.dataset.k as 'daily' | 'weekly' | 'ach'; ctx.rerender(); });
  on('.wk-claim', b => {
    const r = claimWeekly(store.getState().save, b.dataset.t as never, weekKey()); if (!r) { play('deny'); return; }
    update(sv => { Object.assign(sv, r.save); }); play('ready'); ctx.toast(`주간 과제 보상: ${rewTx(r.reward)}`); ctx.rerender();
  });
  on('#wkBonus', () => {
    const r = claimWeeklyBonus(store.getState().save, weekKey()); if (!r) { play('deny'); return; }
    update(sv => { Object.assign(sv, r.save); }); play('packBurst'); ctx.toast(`주간 보너스! ${rewTx(r.reward)}`); ctx.rerender();
  });
  on('.ac-claim', b => {
    const r = claimAch(store.getState().save, b.dataset.id!); if (!r) { play('deny'); return; }
    update(sv => { Object.assign(sv, r.save); }); play('packBurst'); ctx.toast(`칭호 「${r.title}」 획득! ${rewTx(r.reward)}`); ctx.rerender();
  });
  on('#atClaim', () => {
    const r = claimAttend(store.getState().save, todayStr()); if (!r) { play('deny'); return; }
    update(sv => { Object.assign(sv, r.save); }); play('packBurst'); ctx.toast(`${r.day}일차 출석! 광석 +${r.reward.ore}${r.reward.tickets ? ` · 보급권 +${r.reward.tickets}` : ''}${r.reward.copies ? ' · 부품 조각' : ''}`); ctx.rerender();
  });
  void kind;
}
