import type { Battle } from '../domain/battle/sim';
import type { Stage } from '../data/stages';
import type { BattleHudLike } from '../game/scenes/BattleScene';
import { play } from '../native/audio';

/**
 * 조립 런의 자동 전투 HUD: 나가기(포기), 라운드·하트, 배속(×1·×2)·건너뛰기. 카드·와트·스킬이 없다.
 * 전장 장면은 일반 전투 HUD 와 같은 모양(BattleHudLike)만 보고 이것을 쓴다.
 */
export class RunBattleHud implements BattleHudLike {
  readonly el: HTMLElement;
  private speedV = 1; private skipV = false;
  private toastEl!: HTMLElement; private toastT: ReturnType<typeof setTimeout> | null = null;
  private info = { round: 1, rounds: 3, hearts: 3 };
  private mineEl!: HTMLElement; private foeEl!: HTMLElement;

  constructor(root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'screen battle run-hud'; this.el.hidden = true;
    root.appendChild(this.el);
  }

  /** 새 라운드 전투를 시작하기 전에 라운드 정보를 알려 준다 */
  configure(info: { round: number; rounds: number; hearts: number }): void { this.info = info; this.speedV = 1; this.skipV = false; }
  speed = (): number => this.speedV;
  skip = (): boolean => this.skipV;

  setup(_stage: Stage, _battle: Battle, h: { onQuit(): void }): void {
    const { round, rounds, hearts } = this.info;
    this.el.hidden = false;
    this.el.innerHTML = `
      <header class="bt-top"><button class="quit" type="button" aria-label="포기"><span aria-hidden="true">‹</span><small>포기</small></button></header>
      <div class="bt-mid"><b>${round}/${rounds} 라운드</b><i class="crowns"><b class="me">${'❤'.repeat(Math.max(0, hearts))}${'♡'.repeat(Math.max(0, 3 - hearts))}</b></i></div>
      <div class="rb-sides"><b class="mine" id="rbMine"></b><b class="foe" id="rbFoe"></b></div>
      <div class="bt-toast" id="btToast"></div>
      <footer class="rb-speed" role="group" aria-label="전투 속도">
        <button type="button" data-s="1" class="on">×1</button><button type="button" data-s="2">×2</button><button type="button" data-s="skip">⏭ 건너뛰기</button>
      </footer>`;
    this.toastEl = this.el.querySelector('#btToast') as HTMLElement;
    this.mineEl = this.el.querySelector('#rbMine') as HTMLElement; this.foeEl = this.el.querySelector('#rbFoe') as HTMLElement;
    (this.el.querySelector('.quit') as HTMLButtonElement).onclick = () => { play('uiBack'); h.onQuit(); };
    this.el.querySelectorAll<HTMLButtonElement>('.rb-speed button').forEach(b => b.onclick = () => {
      play('uiClick');
      if (b.dataset.s === 'skip') { this.skipV = true; return; }
      this.speedV = Number(b.dataset.s);
      this.el.querySelectorAll('.rb-speed button').forEach(x => x.classList.toggle('on', x === b));
    });
  }

  update(b: Battle): void {
    const alive = (t: 0 | 1) => b.units.filter(u => u.team === t && u.hp > 0).length;
    if (this.mineEl) { this.mineEl.textContent = `내 메카 ${alive(0)}`; this.foeEl.textContent = `적 ${alive(1)}`; }
  }
  toast(msg: string): void {
    if (!this.toastEl) return;
    this.toastEl.textContent = msg; this.toastEl.classList.add('on');
    if (this.toastT) clearTimeout(this.toastT);
    this.toastT = setTimeout(() => this.toastEl.classList.remove('on'), 1600);
  }
  combo(_n: number): void { /* 자동 전투에는 연속 처치 표시가 없다 */ }
  bossBanner(_id: string, _name: string, _title: string): void { /* 보스는 M2 */ }
  showOffer(): void { /* 지휘 모듈은 런의 유물로 M2 에서 */ }
  get offering(): boolean { return false; }
  metrics(): { top: number; tray: number } {
    const q = this.el.querySelector('.bt-top .quit') as HTMLElement | null, sp = this.el.querySelector('.rb-speed') as HTMLElement | null;
    return { top: q ? q.getBoundingClientRect().top : 8, tray: sp ? window.innerHeight - sp.getBoundingClientRect().top : 90 };
  }
  hide(): void { this.el.hidden = true; }
}
