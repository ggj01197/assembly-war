import type { Battle } from '../domain/battle/sim';
import type { Stage } from '../data/stages';
import { BASE_HP, WATT_POOL } from '../domain/battle/sim';
import { unitFit, esc, partName } from './unitView';
import { play } from '../native/audio';
import { skillById, KIND_LABEL, SKILL_COOLDOWN_SEC, HERO_SKILL_COOLDOWN_SEC, HERO_WATT } from '../domain/loadout';
import { TICK_HZ } from '../domain/battle/sim';
import { stageLabel } from '../data/stages';

/** 전투 화면의 HTML 부분: 위(남은 시간·적 기지·힌트) / 아래(내 기지·와트·카드 6장 + 스킬 칸 2개). 전장은 Phaser. */
export interface HudHandlers { onSelect(i: number): void; onSkill(slot: number): void; onHero(): void; onHeroSkill(): void; onQuit(): void }
/** 지금 눌려 있는 것: 카드 / 길을 고를 스킬 / 영웅(출격·이동) */
export interface HudSel { card: number | null; skill: number | null; hero: boolean }

export class BattleHud {
  readonly el: HTMLElement;
  private cards: HTMLButtonElement[] = [];
  private timerEl!: HTMLElement; private enemyBar!: HTMLElement; private myBar!: HTMLElement; private enemyNum!: HTMLElement; private myNum!: HTMLElement;
  private wattFill!: HTMLElement; private wattNum!: HTMLElement; private hintEl!: HTMLElement; private toastEl!: HTMLElement; private pointEl!: HTMLElement;
  private quitArmed = 0;
  private toastT: ReturnType<typeof setTimeout> | null = null;
  private hintT: ReturnType<typeof setTimeout> | null = null;
  private costs: number[] = [];
  private skillBtns: HTMLButtonElement[] = [];
  private subEl: HTMLElement | null = null;
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
        <div class="bt-mid"><b id="btTime">3:00</b><small id="btSub">${stage.survival ? '5분 버티기 · 웨이브 1' : `작전 ${stageLabel(stage)} · ${esc(stage.name)}`}</small></div>
        <div class="bt-point" id="btPoint" title="중앙 거점">거점</div>
      </header>
      <div class="bt-bars top"><span>적 기지</span><i class="hpbar"><u id="btEnemy"></u></i><em id="btEnemyN">${BASE_HP}</em></div>
      <div class="bt-hint" id="btHint">${esc(stage.hint)}</div>
      <div class="bt-toast" id="btToast"></div>
      <footer class="bt-tray">
        <div class="bt-bars"><span>내 기지</span><i class="hpbar mine"><u id="btMine"></u></i><em id="btMineN">${BASE_HP}</em></div>
        <div class="bt-watt"><i class="wfill"><u id="btWatt"></u><s></s></i><b id="btWattN">5</b><small>와트</small></div>
        <div class="bt-cards">
          ${battle.decks[0].map((c, i) => `<button class="card" data-i="${i}" type="button" aria-label="${esc(partName(c.build.weapon))} 와트 ${c.watt}">${unitFit(c.build, cellW, 42)}<i class="cost">${c.watt}</i><span class="nm">${esc(partName(c.build.weapon).replace(/^(팔형|탑형|어깨형) /, ''))}</span></button>`).join('')}
          ${[0, 1].map(slot => { const d = skillById(battle.skillIds[0][slot] ?? ''); return d
            ? `<button class="card skill" data-skill="${slot}" type="button" aria-label="${esc(d.name)} 와트 ${d.watt}"><i class="cost">${d.watt}</i><span class="nm">${esc(d.name)}</span><small>${KIND_LABEL[d.kind]}</small><u class="cd"></u></button>`
            : '<button class="card skill" type="button" disabled><span class="nm">스킬</span><small>비어 있음</small></button>'; }).join('')}
        </div>
      </footer>
      ${battle.hero[0] ? `<div class="bt-hero">
        <button class="hs" id="btHeroSkill" type="button" aria-label="영웅 기술 ${esc(battle.hero[0]!.def.skill.name)}"><u class="cd"></u><b>${esc(battle.hero[0]!.def.skill.name)}</b></button>
        <button class="hb" id="btHeroBtn" type="button" aria-label="영웅 ${esc(battle.hero[0]!.def.name)}"><u class="cd"></u>${unitFit(battle.hero[0]!.def.build, 40, 46)}<small id="btHeroTx">출격 ${HERO_WATT}</small></button>
      </div>` : ''}`;
    const q = <T extends HTMLElement>(s: string) => this.el.querySelector(s) as T;
    this.timerEl = q('#btTime'); this.enemyBar = q('#btEnemy'); this.myBar = q('#btMine'); this.enemyNum = q('#btEnemyN'); this.myNum = q('#btMineN');
    this.wattFill = q('#btWatt'); this.wattNum = q('#btWattN'); this.hintEl = q('#btHint'); this.toastEl = q('#btToast'); this.pointEl = q('#btPoint');
    this.cards = Array.from(this.el.querySelectorAll<HTMLButtonElement>('.card[data-i]'));
    this.cards.forEach(c => c.onclick = () => { play('uiClick'); h.onSelect(Number(c.dataset.i)); });
    this.subEl = this.el.querySelector('#btSub');
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
      c.classList.toggle('on', selected === i);
      c.classList.toggle('ready', this.costs[i] <= w + 1e-9);
      c.classList.toggle('short', this.costs[i] > w + 1e-9);
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

  hide(): void { this.el.hidden = true; if (this.hintT) clearTimeout(this.hintT); }
}
