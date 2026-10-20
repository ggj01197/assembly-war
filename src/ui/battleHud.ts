import type { Battle, ModuleOffer } from '../domain/battle/sim';
import { moduleById, CAT_LABEL, type ModuleDef } from '../domain/modules';
import type { Stage } from '../data/stages';
import { BASE_HP, WATT_POOL } from '../domain/battle/sim';
import { unitFit, esc, partName } from './unitView';
import { play } from '../native/audio';
import { skillById, KIND_LABEL, SKILL_COOLDOWN_SEC, HERO_SKILL_COOLDOWN_SEC, HERO_WATT } from '../domain/loadout';
import { TICK_HZ } from '../domain/battle/sim';
import { stageLabel } from '../data/stages';

/** 전투 화면의 HTML 부분: 위(남은 시간·적 기지·힌트) / 아래(내 기지·와트·카드 6장 + 스킬 칸 2개). 전장은 Phaser. */
/** 카드를 끌어다 놓기(클래시 로얄식): 시작·이동·놓기·취소. 좌표는 화면(클라이언트) 좌표 */
export type DragPhase = 'start' | 'move' | 'end' | 'cancel';
export interface HudHandlers { onDrag(phase: DragPhase, card: number, x: number, y: number): void; onSelect(i: number): void; onSkill(slot: number): void; onHero(): void; onHeroSkill(): void; onQuit(): void }
/** 지금 눌려 있는 것: 카드 / 길을 고를 스킬 / 영웅(출격·이동) */
export interface HudSel { card: number | null; skill: number | null; hero: boolean }

export class BattleHud {
  readonly el: HTMLElement;
  private cards: HTMLButtonElement[] = [];
  private timerEl!: HTMLElement; private enemyBar!: HTMLElement; private myBar!: HTMLElement; private enemyNum!: HTMLElement; private myNum!: HTMLElement;
  private wattFill!: HTMLElement; private wattNum!: HTMLElement; private hintEl!: HTMLElement; private toastEl!: HTMLElement; private pointEl!: HTMLElement;
  private quitArmed = 0;
  private offerEl: HTMLElement | null = null; private offerT: ReturnType<typeof setInterval> | null = null;
  private toastT: ReturnType<typeof setTimeout> | null = null;
  private hintT: ReturnType<typeof setTimeout> | null = null;
  private costs: number[] = [];
  private skillBtns: HTMLButtonElement[] = [];
  private subEl: HTMLElement | null = null; private crownEl: HTMLElement | null = null;
  private heroBtn: HTMLButtonElement | null = null; private heroSkillBtn: HTMLButtonElement | null = null; private heroTx: HTMLElement | null = null;

  constructor(root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'screen battle'; this.el.hidden = true;
    root.appendChild(this.el);
  }

  setup(stage: Stage, battle: Battle, h: HudHandlers): void {
    this.costs = battle.decks[0].map(c => c.watt);
    const cellW = Math.max(26, Math.min(40, Math.floor((window.innerWidth - 20 - 28) / 8) - 6));
    this.el.innerHTML = `
      <header class="bt-top">
        <button class="quit" type="button" aria-label="나가기">나가기</button>
        <div class="bt-mid"><b id="btTime">3:00</b><i class="crowns" id="btCrowns"></i><small id="btSub">${stage.survival ? '5분 버티기 · 웨이브 1' : `작전 ${stageLabel(stage)} · ${esc(stage.name)}`}</small></div>
        <div class="bt-point" id="btPoint" title="중앙 거점">거점</div>
      </header>
      <div class="bt-bars top"><span>적 기지</span><i class="hpbar"><u id="btEnemy"></u></i><em id="btEnemyN">${BASE_HP}</em></div>
      <div class="bt-hint" id="btHint">${esc(stage.hint)}</div>
      <div class="bt-toast" id="btToast"></div>
      <footer class="bt-tray">
        <div class="bt-bars"><span>내 기지</span><i class="hpbar mine"><u id="btMine"></u></i><em id="btMineN">${BASE_HP}</em></div>
        <div class="bt-watt ${battle.hero[0] ? 'has-hero' : ''}"><i class="wfill"><u id="btWatt"></u><s></s></i><b id="btWattN">5</b><small>와트</small>${battle.hero[0] ? `<div class="bt-hero">
        <button class="hs" id="btHeroSkill" type="button" aria-label="영웅 기술 ${esc(battle.hero[0]!.def.skill.name)}"><u class="cd"></u><b>${esc(battle.hero[0]!.def.skill.name)}</b></button>
        <button class="hb" id="btHeroBtn" type="button" aria-label="영웅 ${esc(battle.hero[0]!.def.name)}"><u class="cd"></u>${unitFit(battle.hero[0]!.def.build, 40, 46)}<small id="btHeroTx">출격 ${HERO_WATT}</small></button>
      </div>` : ''}</div>
        <div class="bt-cards">
          ${battle.decks[0].map((c, i) => `<button class="card" data-i="${i}" type="button" aria-label="${esc(partName(c.build.weapon))} 와트 ${c.watt}">${unitFit(c.build, cellW, 42)}<i class="cost">${c.watt}</i><span class="nm">${esc(partName(c.build.weapon).replace(/^(팔형|탑형|어깨형) /, ''))}</span></button>`).join('')}
          ${[0, 1].map(slot => { const d = skillById(battle.skillIds[0][slot] ?? ''); return d
            ? `<button class="card skill" data-skill="${slot}" type="button" aria-label="${esc(d.name)} 와트 ${d.watt}"><i class="cost">${d.watt}</i><span class="nm">${esc(d.name)}</span><small>${KIND_LABEL[d.kind]}</small><u class="cd"></u></button>`
            : '<button class="card skill" type="button" disabled><span class="nm">스킬</span><small>비어 있음</small></button>'; }).join('')}
        </div>
      </footer>`;
    const q = <T extends HTMLElement>(s: string) => this.el.querySelector(s) as T;
    this.timerEl = q('#btTime'); this.enemyBar = q('#btEnemy'); this.myBar = q('#btMine'); this.enemyNum = q('#btEnemyN'); this.myNum = q('#btMineN');
    this.wattFill = q('#btWatt'); this.wattNum = q('#btWattN'); this.hintEl = q('#btHint'); this.toastEl = q('#btToast'); this.pointEl = q('#btPoint');
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
    if (this.crownEl) this.crownEl.innerHTML = b.survival || !b.towersOn ? '' : `<b class="me">내 ${'★'.repeat(b.crowns(0)) || '☆'}</b><b class="foe">${'★'.repeat(b.crowns(1)) || '☆'} 적</b>`;
    if (b.survival && this.subEl) this.subEl.textContent = `5분 버티기 · 웨이브 ${b.wave + 1}`;
    this.enemyBar.style.width = `${Math.max(0, (b.baseHp[1] / BASE_HP) * 100)}%`;
    this.myBar.style.width = `${Math.max(0, (b.baseHp[0] / BASE_HP) * 100)}%`;
    this.enemyNum.textContent = String(Math.max(0, Math.ceil(b.baseHp[1])));
    this.myNum.textContent = String(Math.max(0, Math.ceil(b.baseHp[0])));
    const w = b.watt[0];
    this.wattFill.style.width = `${(w / WATT_POOL) * 100}%`;
    this.wattNum.textContent = String(Math.floor(w));
    this.pointEl.className = 'bt-point' + (b.controller === 0 ? ' mine' : b.controller === 1 ? ' enemy' : '');
    this.cards.forEach((c, i) => {
      const cost = b.costOf(0, i);   // 경량화 설계 같은 모듈이 비용을 바꾼다
      if (this.costs[i] !== cost) { this.costs[i] = cost; const ce = c.querySelector('.cost'); if (ce) ce.textContent = String(cost); c.classList.toggle('cheaper', cost < b.decks[0][i].watt); }
      c.classList.toggle('on', selected === i);
      c.classList.toggle('ready', cost <= w + 1e-9);
      c.classList.toggle('short', cost > w + 1e-9);
    });
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
      if (!u) { if (hs.respawn > 0) { tx = `${Math.ceil(hs.respawn / TICK_HZ)}초`; cls = 'dead'; } else { tx = `출격 ${HERO_WATT}`; cls = w >= HERO_WATT - 1e-9 ? 'ready' : 'short'; } }
      else if (u.ghost > 0) { tx = '이동 중'; cls = 'deployed'; }
      else { tx = sel.hero ? '길 선택' : u.moveCd > 0 ? `이동 ${Math.ceil(u.moveCd / TICK_HZ)}` : '이동'; cls = 'deployed'; }
      this.heroTx.textContent = tx;
      this.heroBtn.className = 'hb ' + cls + (sel.hero ? ' on' : '');
      (this.heroBtn.querySelector('.cd') as HTMLElement).style.height = !u && hs.respawn > 0 ? `${(hs.respawn / (40 * TICK_HZ)) * 100}%` : '0%';
      const ready = !!u && u.ghost === 0 && hs.skillCd === 0;
      this.heroSkillBtn.className = 'hs' + (ready ? ' ready' : '') + (!u ? ' off' : '');
      (this.heroSkillBtn.querySelector('.cd') as HTMLElement).style.height = `${(hs.skillCd / (HERO_SKILL_COOLDOWN_SEC * TICK_HZ)) * 100}%`;
    }
  }

  /** 전장이 쓸 수 있는 세로 구간 (HTML 위·아래 가림막 높이) */
  metrics(): { top: number; tray: number } {
    const bars = this.el.querySelector('.bt-bars.top') as HTMLElement | null, tray = this.el.querySelector('.bt-tray') as HTMLElement | null;
    return { top: bars ? bars.getBoundingClientRect().bottom : 84, tray: tray ? window.innerHeight - tray.getBoundingClientRect().top : 176 };
  }

  hide(): void { this.el.hidden = true; this.hideOffer(); if (this.hintT) clearTimeout(this.hintT); }
}
