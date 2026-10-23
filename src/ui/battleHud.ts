import type { Battle, ModuleOffer } from '../domain/battle/sim';
import type { Build } from '../domain/assemble';
import { moduleById, CAT_LABEL, type ModuleDef } from '../domain/modules';
import { matchupTip } from '../domain/blueprints';
import type { Stage } from '../data/stages';
import { WATT_POOL } from '../domain/battle/sim';
import { unitFit, esc, partName } from './unitView';
import { play } from '../native/audio';
import { skillById, KIND_LABEL, SKILL_COOLDOWN_SEC, HERO_SKILL_COOLDOWN_SEC, HERO_WATT } from '../domain/loadout';
import { TICK_HZ } from '../domain/battle/sim';
import { stageLabel } from '../data/stages';

/** 전투 화면의 HTML 부분: 위(남은 시간·적 기지·힌트) / 아래(내 기지·와트·카드 6장 + 스킬 칸 2개). 전장은 Phaser. */
/** 카드를 끌어다 놓기(클래시 로얄식): 시작·이동·놓기·취소. 좌표는 화면(클라이언트) 좌표 */
export type DragPhase = 'start' | 'move' | 'end' | 'cancel';
export interface HudHandlers { onDrag(phase: DragPhase, card: number, x: number, y: number): void; onSelect(i: number): void; onSkill(slot: number): void; onHero(): void; onHeroSkill(): void; onQuit(): void }
/** 지금 눌려 있는 것: 카드 / 지점을 고를 스킬 / 영웅 출격 */
export interface HudSel { card: number | null; skill: number | null; hero: boolean }

export class BattleHud {
  readonly el: HTMLElement;
  private cards: HTMLButtonElement[] = [];
  private timerEl!: HTMLElement;
  private wattFill!: HTMLElement; private wattNum!: HTMLElement; private hintEl!: HTMLElement; private toastEl!: HTMLElement;
  private quitArmed = 0;
  private comboT: ReturnType<typeof setTimeout> | null = null;
  private offerEl: HTMLElement | null = null; private offerT: ReturnType<typeof setInterval> | null = null;
  private toastT: ReturnType<typeof setTimeout> | null = null;
  private hintT: ReturnType<typeof setTimeout> | null = null;
  private skillBtns: HTMLButtonElement[] = [];
  private subEl: HTMLElement | null = null; private crownEl: HTMLElement | null = null;
  private heroBtn: HTMLButtonElement | null = null; private heroSkillBtn: HTMLButtonElement | null = null; private heroTx: HTMLElement | null = null;

  constructor(root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'screen battle'; this.el.hidden = true;
    root.appendChild(this.el);
  }

  setup(stage: Stage, battle: Battle, h: HudHandlers): void {
    this.cellW = Math.max(26, Math.min(44, Math.floor((window.innerWidth - 20 - 28) / (battle.handOn ? 7 : 8)) - 6));
    const slots = battle.handOn ? battle.hand[0] : battle.decks[0].map((_, i) => i);
    this.handOn = battle.handOn;
    const tip = stage.survival ? '' : matchupTip(stage.enemy, battle.decks[0].map(c => c.build));
    this.el.innerHTML = `
      <header class="bt-top">
        <button class="quit" type="button" aria-label="나가기"><span aria-hidden="true">‹</span><small>나가기</small></button>
        <div class="bt-mid"><b id="btTime">3:00</b><i class="crowns" id="btCrowns"></i><small id="btSub">${stage.survival ? '5분 버티기 · 웨이브 1' : `작전 ${stageLabel(stage)} · ${esc(stage.name)}`}${battle.rule ? ` · ${battle.rule.icon} ${esc(battle.rule.name)}` : ''}</small></div>
      </header>
      <div class="bt-hint" id="btHint">${battle.rule ? `<b>${battle.rule.icon} ${esc(battle.rule.name)}</b> ${esc(battle.rule.desc)}<br>` : ''}${esc(stage.hint)}${tip ? `<br><b class="tip">${esc(tip)}</b>` : ''}</div>
      <div class="bt-toast" id="btToast"></div>
      <footer class="bt-tray">
        <div class="bt-watt ${battle.hero[0] ? 'has-hero' : ''}"><i class="wfill"><u id="btWatt"></u><s></s></i><b id="btWattN">5</b><small>와트</small>${battle.hero[0] ? `<div class="bt-hero">
        <button class="hs" id="btHeroSkill" type="button" aria-label="영웅 기술 ${esc(battle.hero[0]!.def.skill.name)}"><u class="cd"></u><b>${esc(battle.hero[0]!.def.skill.name)}</b></button>
        <button class="hb" id="btHeroBtn" type="button" aria-label="영웅 ${esc(battle.hero[0]!.def.name)}"><u class="cd"></u>${unitFit(battle.hero[0]!.def.build, 40, 46)}<small id="btHeroTx">출격 ${HERO_WATT}</small></button>
      </div>` : ''}</div>
        <div class="bt-cards ${battle.handOn ? 'hand' : ''}">
          ${battle.handOn ? '<div class="bt-next" aria-label="다음 카드"><small>다음</small><div class="nx" id="btNext"></div></div>' : ''}
          ${slots.map(i => { const c = battle.decks[0][i]; return `<button class="card" data-i="${i}" data-cost="${c.watt}" type="button" aria-label="${esc(partName(c.build.weapon))} 와트 ${c.watt}">${this.cardInner(c.build, c.watt)}</button>`; }).join('')}
          ${[0, 1].map(slot => { const d = skillById(battle.skillIds[0][slot] ?? ''); return d
            ? `<button class="card skill" data-skill="${slot}" type="button" aria-label="${esc(d.name)} 와트 ${d.watt}"><i class="cost">${d.watt}</i><span class="nm">${esc(d.name)}</span><small>${KIND_LABEL[d.kind]}</small><u class="cd"></u></button>`
            : '<button class="card skill" type="button" disabled><span class="nm">스킬</span><small>비어 있음</small></button>'; }).join('')}
        </div>
      </footer>`;
    const q = <T extends HTMLElement>(s: string) => this.el.querySelector(s) as T;
    this.timerEl = q('#btTime');
    this.wattFill = q('#btWatt'); this.wattNum = q('#btWattN'); this.hintEl = q('#btHint'); this.toastEl = q('#btToast');
    this.cards = Array.from(this.el.querySelectorAll<HTMLButtonElement>('.card[data-i]'));
    this.cards.forEach(c => {
      let sx = 0, sy = 0, down = false, dragging = false, justDragged = false;
      c.onpointerdown = e => { down = true; dragging = false; sx = e.clientX; sy = e.clientY; };
      c.onpointermove = e => {
        if (!down) return;
        if (!dragging && Math.hypot(e.clientX - sx, e.clientY - sy) > 14) { dragging = true; try { c.setPointerCapture(e.pointerId); } catch { /* 무시 */ } h.onDrag('start', Number(c.dataset.i), e.clientX, e.clientY); }
        if (dragging) h.onDrag('move', Number(c.dataset.i), e.clientX, e.clientY);
      };
      const finish = (e: PointerEvent, cancel: boolean) => {
        if (down && dragging) { h.onDrag(cancel ? 'cancel' : 'end', Number(c.dataset.i), e.clientX, e.clientY); justDragged = true; setTimeout(() => { justDragged = false; }, 60); }
        down = false; dragging = false;
      };
      c.onpointerup = e => finish(e, false); c.onpointercancel = e => finish(e, true);
      c.onclick = () => { if (justDragged) return; play('uiClick'); h.onSelect(Number(c.dataset.i)); };
    });
    this.subEl = this.el.querySelector('#btSub'); this.crownEl = this.el.querySelector('#btCrowns');
    this.skillBtns = Array.from(this.el.querySelectorAll<HTMLButtonElement>('.card.skill[data-skill]'));
    this.skillBtns.forEach(c => c.onclick = () => { h.onSkill(Number(c.dataset.skill)); });
    this.heroBtn = this.el.querySelector('#btHeroBtn'); this.heroSkillBtn = this.el.querySelector('#btHeroSkill'); this.heroTx = this.el.querySelector('#btHeroTx');
    if (this.heroBtn) this.heroBtn.onclick = () => { h.onHero(); };
    if (this.heroSkillBtn) this.heroSkillBtn.onclick = () => { h.onHeroSkill(); };
    q<HTMLButtonElement>('.quit').onclick = () => {
      const now = Date.now();
      if (now - this.quitArmed < 3000) { play('uiBack'); h.onQuit(); return; }
      this.quitArmed = now; this.toast('한 번 더 누르면 작전을 포기합니다.');
    };
    this.hintEl.onclick = () => this.hintEl.classList.add('gone');
    if (this.hintT) clearTimeout(this.hintT);
    this.hintT = setTimeout(() => this.hintEl.classList.add('gone'), 8000);
    this.el.hidden = false;
  }

  private cellW = 36; private handOn = false; private nextIdx: number | null | undefined;
  private cardInner(build: Build, cost: number): string { return `${unitFit(build, this.cellW, 42)}<i class="cost">${cost}</i><span class="nm">${esc(partName(build.weapon).replace(/^(팔형|탑형|어깨형) /, ''))}</span>`; }

  /** 보스 등장 배너: 초상화 + 이름, 2.6초 뒤 사라진다 */
  bossBanner(id: string, name: string, title: string): void {
    const b = document.createElement('div'); b.className = 'bt-boss';
    b.innerHTML = `<img src="art/portraits/${id}.jpg" alt="" draggable="false"><span><small>${esc(title)}</small><b>${esc(name)}</b></span>`;
    this.el.appendChild(b); setTimeout(() => b.classList.add('out'), 2200); setTimeout(() => b.remove(), 2700);
  }

  /** 지휘 모듈 3택 1 — 고르는 동안 전투 시간이 멈춘다(시뮬이 멈춤). 12초 안에 안 고르면 첫 장이 자동 선택된다 */
  showOffer(offer: ModuleOffer, remainingSec: number, onPick: (id: string) => void): void {
    this.hintEl.classList.add('gone');
    this.hideOffer();
    const defs = offer.ids.map(id => moduleById(id)).filter((d): d is ModuleDef => !!d);
    const el = document.createElement('div'); el.className = 'bt-offer'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', '지휘 모듈 선택');
    el.innerHTML = `<div class="of-box"><p class="of-ttl">지휘 모듈 <small>하나를 고르세요 · <b class="of-left">12</b>초</small></p>
      <div class="of-list">${defs.map(d => `<button class="of-card ${d.cat}" data-id="${d.id}" type="button"><i class="of-ic" aria-hidden="true">${d.icon}</i><span class="of-cat">${CAT_LABEL[d.cat]}</span><b>${esc(d.name)}</b><small>${esc(d.desc)}</small></button>`).join('')}</div></div>`;
    this.el.appendChild(el); this.offerEl = el;
    let left = 12, done = false;
    const pick = (id: string) => { if (done) return; done = true; this.hideOffer(); play('ready'); onPick(id); };
    el.querySelectorAll<HTMLButtonElement>('.of-card').forEach(b => { b.onclick = () => pick(b.dataset.id!); });
    const lf = el.querySelector('.of-left') as HTMLElement;
    this.offerT = setInterval(() => { left--; lf.textContent = String(Math.max(0, left)); if (left <= 0) pick(defs[0].id); }, 1000);
    void remainingSec;
  }
  hideOffer(): void { if (this.offerT) { clearInterval(this.offerT); this.offerT = null; } this.offerEl?.remove(); this.offerEl = null; }
  get offering(): boolean { return !!this.offerEl; }

  /** 연속 처치 표시: 3연속부터 크게 튀어 오른다 (n 이 클수록 색이 달아오름) */
  combo(n: number): void {
    let el = this.el.querySelector('.bt-combo') as HTMLElement | null;
    if (!el) { el = document.createElement('div'); el.className = 'bt-combo'; el.setAttribute('aria-live', 'polite'); this.el.appendChild(el); }
    el.textContent = `연속 처치 ×${n}`; el.dataset.lv = n >= 8 ? '3' : n >= 5 ? '2' : '1';
    el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
    if (this.comboT) clearTimeout(this.comboT);
    this.comboT = setTimeout(() => el!.classList.remove('pop'), 1500);
  }

  toast(msg: string): void {
    this.toastEl.textContent = msg; this.toastEl.classList.add('on');
    if (this.toastT) clearTimeout(this.toastT);
    this.toastT = setTimeout(() => this.toastEl.classList.remove('on'), 1600);
  }

  update(b: Battle, sel: HudSel): void {
    const selected = sel.card;
    const rem = Math.ceil(b.remaining);
    this.timerEl.textContent = `${Math.floor(rem / 60)}:${String(rem % 60).padStart(2, '0')}`;
    this.timerEl.classList.toggle('ot', b.overtime);
    if (this.crownEl) this.crownEl.innerHTML = b.survival ? `<b class="me">웨이브 ${b.wave + 1}</b>` : !b.towersOn ? '' : `<b class="me">내 ${'★'.repeat(b.crowns(0)) || '☆'}</b><b class="foe">${'★'.repeat(b.crowns(1)) || '☆'} 적</b>`;
    if (b.survival && this.subEl) this.subEl.textContent = `5분 버티기 · 웨이브 ${b.wave + 1}`;
    const w = b.watt[0];
    this.wattFill.style.width = `${(w / WATT_POOL) * 100}%`;
    this.wattNum.textContent = String(Math.floor(w));
    this.cards.forEach((c, k) => {
      let i = Number(c.dataset.i);
      if (this.handOn && b.hand[0][k] !== undefined && b.hand[0][k] !== i) {   // 낸 자리에 다음 카드가 들어온다
        i = b.hand[0][k]; const d = b.decks[0][i];
        c.dataset.i = String(i); c.dataset.cost = ''; c.innerHTML = this.cardInner(d.build, d.watt); c.setAttribute('aria-label', `${partName(d.build.weapon)} 와트 ${d.watt}`);
        c.classList.remove('deal'); void c.offsetWidth; c.classList.add('deal');
      }
      const cost = b.costOf(0, i);   // 경량화 설계 같은 모듈이 비용을 바꾼다
      if (c.dataset.cost !== String(cost)) { c.dataset.cost = String(cost); const ce = c.querySelector('.cost'); if (ce) ce.textContent = String(cost); c.classList.toggle('cheaper', cost < b.decks[0][i].watt); }
      c.classList.toggle('on', selected === i);
      c.classList.toggle('ready', cost <= w + 1e-9);
      c.classList.toggle('short', cost > w + 1e-9);
    });
    if (this.handOn) {   // 다음에 들어올 카드 미리보기
      const nx = b.nextCard(0);
      if (nx !== this.nextIdx) { this.nextIdx = nx; const el = this.el.querySelector('#btNext'); if (el) el.innerHTML = nx === null ? '' : `${unitFit(b.decks[0][nx].build, 24, 28)}<i>${b.costOf(0, nx)}</i>`; }
    }
    // 스킬 칸: 쿨다운 가림막 · 와트 부족 · 선택
    this.skillBtns.forEach(c => {
      const slot = Number(c.dataset.skill), d = skillById(b.skillIds[0][slot] ?? ''); if (!d) return;
      const cd = b.skillCd[0][slot];
      (c.querySelector('.cd') as HTMLElement).style.height = `${(cd / (SKILL_COOLDOWN_SEC * TICK_HZ)) * 100}%`;
      c.classList.toggle('ready', cd === 0 && d.watt <= w + 1e-9);
      c.classList.toggle('short', cd > 0 || d.watt > w + 1e-9);
      c.classList.toggle('on', sel.skill === slot);
    });
    // 영웅 버튼: 출격 / 재출격 대기 / 이동 지시, 그리고 고유 기술
    const hs = b.hero[0];
    if (hs && this.heroBtn && this.heroSkillBtn && this.heroTx) {
      const u = b.heroUnit(0);
      let tx: string, cls: string;
      if (b.rule?.id === 'rl_nohero') { tx = '봉쇄'; cls = 'dead'; }
      else if (!u) { if (hs.respawn > 0) { tx = `${Math.ceil(hs.respawn / TICK_HZ)}초`; cls = 'dead'; } else { tx = sel.hero ? '자리 선택' : `출격 ${HERO_WATT}`; cls = w >= HERO_WATT - 1e-9 ? 'ready' : 'short'; } }
      else { tx = '출격 중'; cls = 'deployed'; }
      this.heroTx.textContent = tx;
      this.heroBtn.className = 'hb ' + cls + (sel.hero ? ' on' : '');
      (this.heroBtn.querySelector('.cd') as HTMLElement).style.height = !u && hs.respawn > 0 ? `${(hs.respawn / (40 * TICK_HZ)) * 100}%` : '0%';
      const ready = !!u && hs.skillCd === 0;
      this.heroSkillBtn.className = 'hs' + (ready ? ' ready' : '') + (!u ? ' off' : '');
      (this.heroSkillBtn.querySelector('.cd') as HTMLElement).style.height = `${(hs.skillCd / (HERO_SKILL_COOLDOWN_SEC * TICK_HZ)) * 100}%`;
    }
  }

  /** 전장이 쓸 수 있는 세로 구간: top = 위쪽 HUD 가 시작하는 y(안전 영역 아래), tray = 아래 카드 줄 높이 */
  metrics(): { top: number; tray: number } {
    const top = this.el.querySelector('.bt-top .quit') as HTMLElement | null, tray = this.el.querySelector('.bt-tray') as HTMLElement | null;
    return { top: top ? top.getBoundingClientRect().top : 8, tray: tray ? window.innerHeight - tray.getBoundingClientRect().top : 176 };
  }

  hide(): void { this.el.hidden = true; this.hideOffer(); if (this.hintT) clearTimeout(this.hintT); }
}
