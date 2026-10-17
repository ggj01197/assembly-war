import { assemble, type Build } from '../domain/assemble';
import { PARTS, type Part, type Legs, type Body, type Weapon, type Accessory } from '../data/parts';
import { store, setSlot } from '../game/store';
import { unitFit, esc, TARGET_LABEL, SHAPE_LABEL } from './unitView';
import { spriteUrl, accIconUrl } from '../game/unitLayout';
import { play } from '../native/audio';
import { levelMultiplier } from '../domain/upgrade';
import type { Nav, Screen } from './app';

type Kind = 'legs' | 'body' | 'weapon' | 'accessory';
const TABS: { k: Kind; label: string }[] = [{ k: 'legs', label: '다리' }, { k: 'body', label: '몸통' }, { k: 'weapon', label: '무기' }, { k: 'accessory', label: '액세서리' }];

const ofKind = <T extends Part>(k: Kind) => PARTS.filter(p => p.kind === k) as T[];
const effectText = (a: Accessory): string => {
  const e = a.effect, out: string[] = [];
  if (e.wattDiscount) out.push(`와트 −${e.wattDiscount}`);
  if (e.armor) out.push(`방어 +${e.armor}`);
  if (e.speedPct) out.push(`속도 ${e.speedPct > 0 ? '+' : ''}${e.speedPct}%`);
  if (e.hpPct) out.push(`체력 +${e.hpPct}%`);
  if (e.addAir) out.push('대공 추가');
  if (e.sight) out.push(`시야 +${e.sight}`);
  if (e.dmgPct) out.push(`공격 +${e.dmgPct}%`);
  if (e.ratePct) out.push(`연사 +${e.ratePct}%`);
  if (e.rangeAdd) out.push(`사거리 +${e.rangeAdd}`);
  return out.join(' · ') || '효과 없음';
};

/**
 * 조립 화면: 선택하면 바로 장착·저장된다 (Iron Frontier 의 "선택 즉시 외형·능력치가 바뀌고 저장" 규칙).
 * 조립할 수 없는 조합(하중 초과·형태 불일치)은 이유를 빨갛게 보여 주고 저장하지 않으며, 나갈 때 원래대로 되돌린다.
 * 몸통과 무기의 형태가 달라지면 맞는 짝을 자동으로 골라 준다.
 */
export function mountAssembly(root: HTMLElement, nav: Nav): Screen {
  const el = document.createElement('div');
  el.className = 'screen assembly'; el.hidden = true;
  root.appendChild(el);
  let slot = 0, tab: Kind = 'legs';
  let draft: Build = { ...store.getState().save.deck[0] };
  let note = '';

  const loadSlot = (i: number) => { slot = i; draft = { ...store.getState().save.deck[i] }; note = ''; };

  function pick(k: Kind, id: string | undefined) {
    const prev = { ...draft };
    if (k === 'legs') draft.legs = id!;
    if (k === 'body') {
      draft.body = id!;
      const b = PARTS.find(p => p.id === id) as Body, w = PARTS.find(p => p.id === draft.weapon) as Weapon;
      if (w.shape !== b.shape) {
        const fit = ofKind<Weapon>('weapon').find(x => x.shape === b.shape && x.family === w.family) ?? ofKind<Weapon>('weapon').find(x => x.shape === b.shape);
        if (fit) { draft.weapon = fit.id; note = `몸통이 ${SHAPE_LABEL[b.shape]}이라 무기를 「${fit.name}」로 맞췄어요.`; }
      } else note = '';
    }
    if (k === 'weapon') {
      draft.weapon = id!;
      const w = PARTS.find(p => p.id === id) as Weapon, b = PARTS.find(p => p.id === draft.body) as Body;
      if (b.shape !== w.shape) {
        const fit = ofKind<Body>('body').find(x => x.shape === w.shape);
        if (fit) { draft.body = fit.id; note = `무기가 ${SHAPE_LABEL[w.shape]}이라 몸통을 「${fit.name}」로 맞췄어요.`; }
      } else note = '';
    }
    if (k === 'accessory') { if (id) draft.accessory = id; else delete draft.accessory; }
    const r = assemble(draft, PARTS);
    if (r.ok) { setSlot(slot, draft); play('packBurst'); } else play('deny');
    if (JSON.stringify(prev) === JSON.stringify(draft)) note = note || '';
    render();
  }

  function chip(p: Part): string {
    const cur = draft[p.kind as Kind] === p.id || (p.kind === 'accessory' && draft.accessory === p.id);
    let line = '';
    if (p.kind === 'legs') line = `하중 ${p.load} · 속도 ${p.speed} · ${p.move === 'air' ? '공중' : '지상'}`;
    if (p.kind === 'body') line = `무게 ${p.weight} · 체력 ${p.hp} · 방어 ${p.armor} · ${SHAPE_LABEL[p.shape]}`;
    if (p.kind === 'weapon') {
      const ex = [p.family === 'repair' ? '치료' : '', p.splash ? `광역 ${p.splash}` : '', p.pierce ? `방어 ${Math.round(p.pierce * 100)}% 무시` : '', p.minRange ? `최소 사거리 ${p.minRange}` : ''].filter(Boolean).join(' · ');
      line = `무게 ${p.weight} · ${p.family === 'repair' ? '치료' : '피해'} ${p.dmg}×${p.rate} · 사거리 ${p.range} · ${SHAPE_LABEL[p.shape]} · ${p.family === 'repair' ? '아군' : TARGET_LABEL[p.target]}${ex ? ' · ' + ex : ''}`;
    }
    if (p.kind === 'accessory') line = `무게 ${p.weight} · ${effectText(p)}`;
    const img = p.kind === 'accessory' ? `<img src="${accIconUrl(p.id)}" alt="" draggable="false">` : `<img src="${spriteUrl(p.id)}" alt="" draggable="false">`;
    return `<button class="pchip ${cur ? 'on' : ''}" data-id="${p.id}" type="button">${img}<span><b>${esc(p.name)}</b><small>${esc(line)}</small></span></button>`;
  }

  function render() {
    const s = store.getState().save;
    const r = assemble(draft, PARTS);
    const st = r.stats;
    const mult = levelMultiplier(1);
    const usePct = r.load ? Math.min(100, (r.weight / r.load) * 100) : 0;
    const list = (tab === 'accessory'
      ? ofKind<Accessory>('accessory')
      : ofKind<Legs | Body | Weapon>(tab)) as Part[];
    el.innerHTML = `
      <div class="bg"></div>
      <header class="as-top"><button class="back" id="asBack" type="button" aria-label="격납고로">←</button><b>조립</b><span>설계도 ${slot + 1}</span></header>
      <section class="as-slots">
        ${s.deck.map((d, i) => `<button class="slot ${i === slot ? 'on' : ''}" data-i="${i}" type="button" aria-label="설계도 ${i + 1}">${unitFit(i === slot ? draft : d, 46, 50)}</button>`).join('')}
      </section>
      <section class="as-preview">
        <div class="platform"></div>${unitFit(draft, 260, Math.min(150, Math.max(70, window.innerHeight - 640)), 'showcase')}
        ${r.perfect ? '<em class="perfect">완전 조립 +5% 체력</em>' : ''}
      </section>
      <section class="as-gauges">
        <div class="wbar ${r.ok || r.weight <= r.load ? '' : 'over'}"><i style="width:${usePct}%"></i><span>하중 ${r.weight} / ${r.load}</span></div>
        <div class="as-stats">
          <span><small>체력</small><b>${st ? st.hp : '-'}</b></span>
          <span><small>방어</small><b>${st ? st.armor : '-'}</b></span>
          <span><small>초당 공격</small><b>${st ? (st.dmg * st.rate * mult).toFixed(0) : '-'}</b></span>
          <span><small>사거리</small><b>${st ? st.range : '-'}</b></span>
          <span><small>대상</small><b>${st ? TARGET_LABEL[st.target] : '-'}</b></span>
          <span class="watt"><small>와트</small><b>${r.watt}</b></span>
        </div>
        <p class="as-msg ${r.ok ? (note ? 'info' : 'ok') : 'bad'}">${r.ok ? esc(note || '장착되어 저장됐어요.') : esc('조립할 수 없어요: ' + r.reasons.join(' / '))}</p>
      </section>
      <nav class="as-tabs">${TABS.map(t => `<button class="${t.k === tab ? 'on' : ''}" data-k="${t.k}" type="button">${t.label}</button>`).join('')}</nav>
      <section class="as-list">
        ${tab === 'accessory' ? `<button class="pchip ${draft.accessory ? '' : 'on'}" data-id="" type="button"><i class="acc-ic">∅</i><span><b>없음</b><small>액세서리를 달지 않아요</small></span></button>` : ''}
        ${list.map(chip).join('')}
      </section>`;

    el.querySelectorAll<HTMLButtonElement>('.as-slots .slot').forEach(b => b.onclick = () => { revertIfBad(); loadSlot(Number(b.dataset.i)); play('uiClick'); render(); });
    el.querySelectorAll<HTMLButtonElement>('.as-tabs button').forEach(b => b.onclick = () => { tab = b.dataset.k as Kind; play('uiClick'); render(); });
    el.querySelectorAll<HTMLButtonElement>('.pchip').forEach(b => b.onclick = () => pick(tab, b.dataset.id || undefined));
    (el.querySelector('#asBack') as HTMLButtonElement).onclick = () => { revertIfBad(); play('uiBack'); nav.goHangar(slot); };
  }

  /** 조립이 안 되는 채로 나가면 마지막으로 저장된 설계도로 되돌린다 */
  function revertIfBad() { if (!assemble(draft, PARTS).ok) draft = { ...store.getState().save.deck[slot] }; }

  return {
    el,
    show(arg?: unknown) { loadSlot(typeof arg === 'number' ? arg : slot); tab = 'legs'; el.hidden = false; render(); },
    hide() { revertIfBad(); el.hidden = true; },
  };
}
