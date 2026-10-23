import { assemble, type Build } from '../domain/assemble';
import { PARTS, type Part, type Legs, type Body, type Weapon, type Accessory } from '../data/parts';
import { store, setSlot } from '../game/store';
import { unitFit, esc, TARGET_LABEL, SHAPE_LABEL } from './unitView';
import { spriteUrl, accIconUrl } from '../game/unitLayout';
import { play } from '../native/audio';
import { levelMultiplier } from '../domain/upgrade';
import { BLUEPRINTS, ROLE_LABEL, ROLE_ORDER, compatibleParts, suggestFix, advancedUnlocked, sameBuild, type Role } from '../domain/blueprints';
import type { Nav, Screen } from './app';

type Kind = 'legs' | 'body' | 'weapon' | 'accessory';
type Tab = Kind | 'cards';
type Mode = 'easy' | 'adv';
const ADV_TABS: { k: Kind; label: string }[] = [{ k: 'legs', label: '다리' }, { k: 'body', label: '몸통' }, { k: 'weapon', label: '무기' }, { k: 'accessory', label: '액세서리' }];
const EASY_TABS: { k: Tab; label: string }[] = [{ k: 'cards', label: '추천 카드' }, { k: 'legs', label: '다리 바꾸기' }, { k: 'body', label: '몸통 바꾸기' }, { k: 'weapon', label: '무기 바꾸기' }];
const MODE_KEY = 'aw-assembly-mode';

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
const loadMode = (): Mode => { try { return localStorage.getItem(MODE_KEY) === 'adv' ? 'adv' : 'easy'; } catch { return 'easy'; } };
const saveMode = (m: Mode) => { try { localStorage.setItem(MODE_KEY, m); } catch { /* 저장 못 해도 이번 판에는 문제없음 */ } };

/**
 * 조립 화면 (B안, CEO 2026-10-23): 쉬운 조립 ↔ 고급 조립.
 *  쉬운 조립 — 추천 완성품 카드를 고르거나, 지금 조합에서 조립이 되는 부품만 보고 한 칸씩 바꾼다. 규칙 용어·빨간 오류가 없다.
 *  고급 조립 — 모든 부품·하중·형태·와트를 직접 다룬다(작전 1-4 클리어 뒤 해금). 안 맞으면 「추천 고치기」 한 번으로 맞춘다.
 * 선택하면 바로 장착·저장된다. 조립이 안 되는 조합은 저장하지 않고, 나갈 때 원래대로 되돌린다.
 */
export function mountAssembly(root: HTMLElement, nav: Nav): Screen {
  const el = document.createElement('div');
  el.className = 'screen assembly'; el.hidden = true;
  root.appendChild(el);
  let slot = 0, tab: Tab = 'cards', mode: Mode = 'easy', role: Role | 'all' = 'all';
  let draft: Build = { ...store.getState().save.deck[0] };
  let note = '';

  const loadSlot = (i: number) => { slot = i; draft = { ...store.getState().save.deck[i] }; note = ''; };
  const unlocked = () => advancedUnlocked(store.getState().save);

  /** 조립이 되면 저장하고 소리를 낸다 */
  function apply(next: Build, msg = '') {
    draft = next; note = msg;
    if (assemble(draft, PARTS).ok) { setSlot(slot, draft); play('packBurst'); } else play('deny');
    render();
  }

  function pick(k: Kind, id: string | undefined) {
    const next = { ...draft };
    let msg = '';
    if (k === 'legs') next.legs = id!;
    if (k === 'body') {
      next.body = id!;
      const b = PARTS.find(p => p.id === id) as Body, w = PARTS.find(p => p.id === next.weapon) as Weapon;
      if (w.shape !== b.shape) {
        const fit = ofKind<Weapon>('weapon').find(x => x.shape === b.shape && x.family === w.family) ?? ofKind<Weapon>('weapon').find(x => x.shape === b.shape);
        if (fit) { next.weapon = fit.id; msg = `몸통이 ${SHAPE_LABEL[b.shape]}이라 무기를 「${fit.name}」로 맞췄어요.`; }
      }
    }
    if (k === 'weapon') {
      next.weapon = id!;
      const w = PARTS.find(p => p.id === id) as Weapon, b = PARTS.find(p => p.id === next.body) as Body;
      if (b.shape !== w.shape) {
        const fit = ofKind<Body>('body').find(x => x.shape === w.shape);
        if (fit) { next.body = fit.id; msg = `무기가 ${SHAPE_LABEL[w.shape]}이라 몸통을 「${fit.name}」로 맞췄어요.`; }
      }
    }
    if (k === 'accessory') { if (id) next.accessory = id; else delete next.accessory; }
    apply(next, msg);
  }

  /** 부품 한 줄 (이름·그림·능력치). 쉬운 조립에서는 규칙 용어(하중·형태)를 빼고 보여 준다 */
  function chip(p: Part): string {
    const cur = draft[p.kind as Kind] === p.id || (p.kind === 'accessory' && draft.accessory === p.id);
    const easy = mode === 'easy';
    let line = '';
    if (p.kind === 'legs') line = easy ? `속도 ${p.speed} · 체력 ${p.hp} · ${p.move === 'air' ? '공중' : '지상'}` : `하중 ${p.load} · 속도 ${p.speed} · ${p.move === 'air' ? '공중' : '지상'}`;
    if (p.kind === 'body') line = easy ? `체력 ${p.hp} · 방어 ${p.armor}` : `무게 ${p.weight} · 체력 ${p.hp} · 방어 ${p.armor} · ${SHAPE_LABEL[p.shape]}`;
    if (p.kind === 'weapon') {
      const ex = [p.family === 'repair' ? '치료' : '', p.splash ? `광역 ${p.splash}` : '', p.pierce ? `방어 ${Math.round(p.pierce * 100)}% 무시` : '', p.minRange ? `최소 사거리 ${p.minRange}` : ''].filter(Boolean).join(' · ');
      line = `${easy ? '' : `무게 ${p.weight} · `}${p.family === 'repair' ? '치료' : '피해'} ${p.dmg}×${p.rate} · 사거리 ${p.range}${easy ? '' : ' · ' + SHAPE_LABEL[p.shape]} · ${p.family === 'repair' ? '아군' : TARGET_LABEL[p.target]}${ex ? ' · ' + ex : ''}`;
    }
    if (p.kind === 'accessory') line = `무게 ${p.weight} · ${effectText(p)}`;
    const img = p.kind === 'accessory' ? `<img src="${accIconUrl(p.id)}" alt="" draggable="false">` : `<img src="${spriteUrl(p.id)}" alt="" draggable="false">`;
    return `<button class="pchip ${cur ? 'on' : ''}" data-id="${p.id}" type="button">${img}<span><b>${esc(p.name)}</b><small>${esc(line)}</small></span></button>`;
  }

  /** 추천 완성품 카드 한 장 */
  function bpCard(bp: (typeof BLUEPRINTS)[number]): string {
    const r = assemble(bp.build, PARTS), st = r.stats, mult = levelMultiplier(1);
    const cur = sameBuild(bp.build, draft);
    return `<button class="bpcard ${cur ? 'on' : ''}" data-bp="${bp.id}" type="button">
      <span class="bp-img">${unitFit(bp.build, 62, 66)}</span>
      <span class="bp-txt"><b>${esc(bp.name)}<em class="role r-${bp.role}">${ROLE_LABEL[bp.role]}</em></b><small>${esc(bp.desc)}</small>
      <span class="bp-st">${st ? `체력 ${st.hp} · 공격 ${(st.dmg * st.rate * mult).toFixed(0)} · 사거리 ${st.range}` : ''}</span></span>
      <i class="bp-watt">${r.watt}</i>${cur ? '<u class="bp-now">장착 중</u>' : ''}</button>`;
  }

  function render() {
    const s = store.getState().save;
    const r = assemble(draft, PARTS);
    const st = r.stats;
    const mult = levelMultiplier(1);
    const usePct = r.load ? Math.min(100, (r.weight / r.load) * 100) : 0;
    const easy = mode === 'easy', open = unlocked();
    const tabs = easy ? EASY_TABS : ADV_TABS;
    if (!tabs.some(t => t.k === tab)) tab = easy ? 'cards' : 'legs';
    let listHtml = '', tipHtml = '';
    if (tab === 'cards') {
      const roles = ROLE_ORDER.filter(x => BLUEPRINTS.some(b => b.role === x));
      tipHtml = `<div class="bp-roles"><button class="${role === 'all' ? 'on' : ''}" data-role="all" type="button">전체</button>${roles.map(x => `<button class="${role === x ? 'on' : ''}" data-role="${x}" type="button">${ROLE_LABEL[x]}</button>`).join('')}</div>`;
      listHtml = BLUEPRINTS.filter(b => role === 'all' || b.role === role).map(bpCard).join('');
    } else if (easy) {
      const list = compatibleParts(draft, tab as 'legs' | 'body' | 'weapon');
      tipHtml = `<p class="as-tip">지금 조합에 <b>맞는 부품만</b> 보여요 (${list.length}개). 다른 형태로 바꾸려면 「추천 카드」를 고르세요.</p>`;
      listHtml = list.map(chip).join('');
    } else {
      const list = (tab === 'accessory' ? ofKind<Accessory>('accessory') : ofKind<Legs | Body | Weapon>(tab as Kind)) as Part[];
      listHtml = (tab === 'accessory' ? `<button class="pchip ${draft.accessory ? '' : 'on'}" data-id="" type="button"><i class="acc-ic">∅</i><span><b>없음</b><small>액세서리를 달지 않아요</small></span></button>` : '') + list.map(chip).join('');
    }
    const fix = !r.ok && !easy ? suggestFix(draft) : null;
    const msg = r.ok ? (note || (easy ? '마음에 드는 카드를 눌러 바꿔 보세요. 바로 저장돼요.' : '장착되어 저장됐어요.')) : '조립할 수 없어요: ' + r.reasons.join(' / ');
    el.innerHTML = `
      <div class="bg"></div>
      <header class="as-top"><button class="back" id="asBack" type="button" aria-label="격납고로">←</button><b>${easy ? '쉬운 조립' : '고급 조립'}</b><button class="as-mode ${easy && !open ? 'locked' : ''}" id="asMode" type="button">${easy ? (open ? '고급 조립 ▸' : '🔒 고급 조립') : '◂ 쉬운 조립'}</button><span>설계도 ${slot + 1}</span></header>
      <section class="as-slots">
        ${s.deck.map((d, i) => `<button class="slot ${i === slot ? 'on' : ''}" data-i="${i}" type="button" aria-label="설계도 ${i + 1}">${unitFit(i === slot ? draft : d, 46, 50)}</button>`).join('')}
      </section>
      <section class="as-preview">
        <div class="platform"></div>${unitFit(draft, 260, Math.min(150, Math.max(70, window.innerHeight - 640)), 'showcase')}
        ${r.perfect && !easy ? '<em class="perfect">완전 조립 +5% 체력</em>' : ''}
      </section>
      <section class="as-gauges">
        ${easy ? '' : `<div class="wbar ${r.ok || r.weight <= r.load ? '' : 'over'}"><i style="width:${usePct}%"></i><span>하중 ${r.weight} / ${r.load}</span></div>`}
        <div class="as-stats">
          <span><small>체력</small><b>${st ? st.hp : '-'}</b></span>
          <span><small>방어</small><b>${st ? st.armor : '-'}</b></span>
          <span><small>초당 공격</small><b>${st ? (st.dmg * st.rate * mult).toFixed(0) : '-'}</b></span>
          <span><small>사거리</small><b>${st ? st.range : '-'}</b></span>
          <span><small>대상</small><b>${st ? TARGET_LABEL[st.target] : '-'}</b></span>
          <span class="watt"><small>와트</small><b>${r.watt}</b></span>
        </div>
        <p class="as-msg ${r.ok ? (note ? 'info' : 'ok') : 'bad'}">${esc(msg)}</p>
        ${fix ? `<button class="as-fix" id="asFix" type="button"><b>추천 고치기</b><small>${esc(fix.text)}</small></button>` : ''}
      </section>
      <nav class="as-tabs ${easy ? 'easy' : ''}">${tabs.map(t => `<button class="${t.k === tab ? 'on' : ''}" data-k="${t.k}" type="button">${t.label}</button>`).join('')}</nav>
      ${tipHtml}
      <section class="as-list">${listHtml}</section>`;

    el.querySelectorAll<HTMLButtonElement>('.as-slots .slot').forEach(b => b.onclick = () => { revertIfBad(); loadSlot(Number(b.dataset.i)); play('uiClick'); render(); });
    el.querySelectorAll<HTMLButtonElement>('.as-tabs button').forEach(b => b.onclick = () => { tab = b.dataset.k as Tab; play('uiClick'); render(); });
    el.querySelectorAll<HTMLButtonElement>('.pchip').forEach(b => b.onclick = () => pick(tab as Kind, b.dataset.id || undefined));
    el.querySelectorAll<HTMLButtonElement>('.bpcard').forEach(b => b.onclick = () => { const bp = BLUEPRINTS.find(x => x.id === b.dataset.bp); if (bp) apply({ ...bp.build, ...(draft.accessory ? { accessory: draft.accessory } : {}) }, `「${bp.name}」 카드로 바꿨어요.`); });
    el.querySelectorAll<HTMLButtonElement>('.bp-roles button').forEach(b => b.onclick = () => { role = b.dataset.role as Role | 'all'; play('uiClick'); render(); });
    (el.querySelector('#asBack') as HTMLButtonElement).onclick = () => { revertIfBad(); play('uiBack'); nav.goHangar(slot); };
    (el.querySelector('#asMode') as HTMLButtonElement).onclick = () => {
      if (easy && !unlocked()) { play('deny'); note = '고급 조립은 작전 1-4 를 클리어하면 열려요.'; render(); return; }
      revertIfBad(); mode = easy ? 'adv' : 'easy'; saveMode(mode); tab = mode === 'easy' ? 'cards' : 'legs'; play('uiClick'); render();
    };
    (el.querySelector('#asFix') as HTMLButtonElement | null)?.addEventListener('click', () => { if (fix) apply(fix.build, '추천대로 고쳐서 저장했어요.'); });
  }

  /** 조립이 안 되는 채로 나가면 마지막으로 저장된 설계도로 되돌린다 */
  function revertIfBad() { if (!assemble(draft, PARTS).ok) draft = { ...store.getState().save.deck[slot] }; }

  return {
    el,
    show(arg?: unknown) {
      loadSlot(typeof arg === 'number' ? arg : slot);
      mode = unlocked() ? loadMode() : 'easy'; tab = mode === 'easy' ? 'cards' : 'legs'; role = 'all';
      el.hidden = false; render();
    },
    hide() { revertIfBad(); el.hidden = true; },
  };
}
