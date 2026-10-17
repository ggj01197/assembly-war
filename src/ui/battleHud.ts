import type { Battle } from '../domain/battle/sim';
import type { Stage } from '../data/stages';
import { BASE_HP, WATT_POOL } from '../domain/battle/sim';
import { unitFit, esc, partName } from './unitView';
import { play } from '../native/audio';

/** 전투 화면의 HTML 부분: 위(남은 시간·적 기지·힌트) / 아래(내 기지·와트·카드 6장 + 스킬 칸 2개). 전장은 Phaser. */
export interface HudHandlers { onSelect(i: number): void; onQuit(): void }

export class BattleHud {
  readonly el: HTMLElement;
  private cards: HTMLButtonElement[] = [];
  private timerEl!: HTMLElement; private enemyBar!: HTMLElement; private myBar!: HTMLElement; private enemyNum!: HTMLElement; private myNum!: HTMLElement;
  private wattFill!: HTMLElement; private wattNum!: HTMLElement; private hintEl!: HTMLElement; private toastEl!: HTMLElement; private pointEl!: HTMLElement;
  private quitArmed = 0;
  private toastT: ReturnType<typeof setTimeout> | null = null;
  private hintT: ReturnType<typeof setTimeout> | null = null;
  private costs: number[] = [];

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
        <div class="bt-mid"><b id="btTime">3:00</b><small>작전 ${stage.no} · ${esc(stage.name)}</small></div>
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
          <button class="card skill" type="button" disabled><span class="nm">스킬</span><small>준비 중</small></button>
          <button class="card skill" type="button" disabled><span class="nm">스킬</span><small>준비 중</small></button>
        </div>
      </footer>`;
    const q = <T extends HTMLElement>(s: string) => this.el.querySelector(s) as T;
    this.timerEl = q('#btTime'); this.enemyBar = q('#btEnemy'); this.myBar = q('#btMine'); this.enemyNum = q('#btEnemyN'); this.myNum = q('#btMineN');
    this.wattFill = q('#btWatt'); this.wattNum = q('#btWattN'); this.hintEl = q('#btHint'); this.toastEl = q('#btToast'); this.pointEl = q('#btPoint');
    this.cards = Array.from(this.el.querySelectorAll<HTMLButtonElement>('.card[data-i]'));
    this.cards.forEach(c => c.onclick = () => { play('uiClick'); h.onSelect(Number(c.dataset.i)); });
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

  update(b: Battle, selected: number | null): void {
    const rem = Math.ceil(b.remaining);
    this.timerEl.textContent = `${Math.floor(rem / 60)}:${String(rem % 60).padStart(2, '0')}`;
    this.timerEl.classList.toggle('ot', b.overtime);
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
  }

  /** 전장이 쓸 수 있는 세로 구간 (HTML 위·아래 가림막 높이) */
  metrics(): { top: number; tray: number } {
    const bars = this.el.querySelector('.bt-bars.top') as HTMLElement | null, tray = this.el.querySelector('.bt-tray') as HTMLElement | null;
    return { top: bars ? bars.getBoundingClientRect().bottom : 84, tray: tray ? window.innerHeight - tray.getBoundingClientRect().top : 176 };
  }

  hide(): void { this.el.hidden = true; if (this.hintT) clearTimeout(this.hintT); }
}
