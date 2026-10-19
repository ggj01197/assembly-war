import { PARTS } from '../data/parts';
import { CATALOG, GROUP_LABEL, won, type ProductGroup } from '../data/catalog';
import { store, update } from '../game/store';
import { openChest, openFreeChest, freeChestReady, freeChestWaitMs, oddsTable, partsOf, rarityOf, upgradePart, SUPPLY, RARITY_LABEL, type Drop, type Rarity } from '../domain/supply';
import { upgradeCost, levelMultiplier, MAX_LEVEL } from '../domain/upgrade';
import { accIconUrl, spriteUrl } from '../game/unitLayout';
import { esc, partName } from './unitView';
import { play } from '../native/audio';

/** 격납고 시트 4종: 보급(상자) · 강화 · 상점 · 확률표. 화면 이동 없이 격납고 위에 올라온다. */
export type SheetKind = 'supply' | 'upgrade' | 'shop' | 'odds';
export interface SheetState { drops: Drop[] | null; upTab: 'legs' | 'body' | 'weapon' | 'accessory' }
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
          <button class="btn" id="spAd" type="button" disabled>광고 보고 즉시 열기 (준비 중)</button>
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
      <button class="btn ${can ? 'primary' : ''} up-btn" data-id="${p.id}" type="button" ${cost ? '' : 'disabled'}>${cost ? '강화' : 'MAX'}</button>
    </div>`;
  }).join('');
  return `<div class="sheet-dim"></div>
    <div class="sheet" role="dialog" aria-label="강화">
      ${head('부품 강화')}
      <div class="ch-tabs">${UP_TABS.map(t => `<button class="ch-tab up-tab ${st.upTab === t.k ? 'on' : ''}" data-k="${t.k}" type="button">${t.label}</button>`).join('')}</div>
      <p class="sp-note">광석 <b>${s.ore.toLocaleString('ko-KR')}</b> · 같은 부품 조각(보급 상자)과 광석으로 한 단계씩 올려요. Lv10 은 Lv1 보다 최대 +30% (체력·공격). 설계도 강화 단계 = 세 부품 레벨의 평균입니다.</p>
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

/** 시트 안 버튼 연결 (격납고 render 끝에서 호출) */
export function bindSheets(el: HTMLElement, kind: SheetKind, st: SheetState, ctx: SheetCtx): void {
  const on = (sel: string, f: (b: HTMLButtonElement) => void) => el.querySelectorAll<HTMLButtonElement>(sel).forEach(b => b.onclick = () => f(b));
  on('#spOpen', () => {
    const r = openChest(store.getState().save);
    if (!r) { play('deny'); ctx.toast('보급권이 없어요.'); return; }
    update(sv => { Object.assign(sv, r.save); }); st.drops = r.drops; play('packBurst'); ctx.rerender();
  });
  on('#spFree', () => {
    const r = openFreeChest(store.getState().save, Date.now());
    if (!r) { play('deny'); return; }
    update(sv => { Object.assign(sv, r.save); }); st.drops = r.drops; play('packBurst'); ctx.rerender();
  });
  on('#spOdds', () => { play('uiClick'); ctx.open('odds'); });
  on('#oddsBack', () => { play('uiBack'); ctx.open('supply'); });
  on('.up-tab', b => { st.upTab = b.dataset.k as SheetState['upTab']; play('uiClick'); ctx.rerender(); });
  on('.up-btn', b => {
    const r = upgradePart(store.getState().save, b.dataset.id!);
    if (!r.ok) { play('deny'); ctx.toast(r.reason); return; }
    update(sv => { Object.assign(sv, r.save); }); play('ready'); ctx.toast(`${partName(b.dataset.id!)} Lv.${r.save.partLevels[b.dataset.id!]} 강화!`); ctx.rerender();
  });
  on('.shop-buy', () => { play('deny'); ctx.toast('테스트 빌드에서는 결제가 열리지 않아요.'); });
  void kind;
}
