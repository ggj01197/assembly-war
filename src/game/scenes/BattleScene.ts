import Phaser from 'phaser';
import { LANES, TICK_HZ, BASE_HP, POINT_LANE, POINT_POS, POINT_RADIUS, POINT_CAPTURE_SEC, type Battle, type BattleEvent, type Unit } from '../../domain/battle/sim';
import { layoutUnit, spriteUrl, spriteUrlBack } from '../unitLayout';
import { PARTS } from '../../data/parts';
import { play } from '../../native/audio';
import type { BattleHud } from '../../ui/battleHud';
import type { Stage } from '../../data/stages';

/**
 * 전장(세로): 아래(내 격납 패드)에서 위(적 관문)로 행군하는 3개 길. 규칙은 전부 `Battle`(domain)이 하고
 * 이 씬은 그리기·연출·입력만 한다. 내 유닛은 뒷모습, 적 유닛은 앞모습으로 그려 "내가 밀고 올라가는" 구도를 만든다.
 * 카드(HUD)를 누른 뒤 아군 진영(아래 절반)의 길을 누르면 생산 (기획안 §5).
 */
export interface BattleConfig { stage: Stage; battle: Battle; hud: BattleHud; reducedMotion: boolean; onEnd(b: Battle): void; onQuit(): void }

type Move = 'walk' | 'wheel' | 'track' | 'hover' | 'fly';
interface View {
  c: Phaser.GameObjects.Container; rig: Phaser.GameObjects.Container; legsC: Phaser.GameObjects.Container; upper: Phaser.GameObjects.Container;
  shadow: Phaser.GameObjects.Ellipse; imgs: Phaser.GameObjects.Image[];
  unit: Unit; w: number; h: number; lift: number; kind: Move; face: 1 | -1;
  ph: number; mv: number; born: number; landed: boolean; recoil: number; lunge: number; flash: number; hpShow: number; shake: number;
  lastX: number; lastY: number; foot: number; dying: number; tinted: boolean; lastHp: number; recoilK?: number;
}
type FxKind = 'tracer' | 'blast' | 'puff' | 'ring' | 'flash' | 'spark' | 'dust' | 'debris';
interface Fx { kind: FxKind; x1: number; y1: number; x2: number; y2: number; t: number; dur: number; color: number; r: number }

/** 무기 계열별 연출: 선 색·굵기·길이, 착탄 폭발, 소리 (sim 은 계열 이름을 몰라도 되고 연출만 안다) */
const FAMILY_FX: Record<string, { color: number; width: number; dur: number; blast?: { r: number; color: number; t: number; dur: number }; sound: string; gap: number; kick: number }> = {
  gatling: { color: 0xffe07a, width: 2, dur: 0.1, sound: 'gatling', gap: 110, kick: 0.5 },
  cannon: { color: 0xff9f43, width: 4, dur: 0.18, blast: { r: 26, color: 0xffa94d, t: 0, dur: 0.3 }, sound: 'cannon', gap: 160, kick: 1.3 },
  missile: { color: 0x5fd3ff, width: 3, dur: 0.26, blast: { r: 14, color: 0x8fe9ff, t: 0.2, dur: 0.25 }, sound: 'missile', gap: 140, kick: 0.8 },
  laser: { color: 0xb8f7ff, width: 4, dur: 0.14, sound: 'laser', gap: 120, kick: 0.3 },
  blade: { color: 0xf0fbff, width: 5, dur: 0.1, blast: { r: 12, color: 0xdff6ff, t: 0, dur: 0.18 }, sound: 'blade', gap: 100, kick: 0 },
  flak: { color: 0xfff3b0, width: 3, dur: 0.12, blast: { r: 22, color: 0xffffff, t: 0.08, dur: 0.22 }, sound: 'flak', gap: 120, kick: 0.7 },
  repair: { color: 0x6fe39a, width: 3, dur: 0.2, sound: 'repair', gap: 160, kick: 0 },
  mortar: { color: 0xffc46b, width: 5, dur: 0.34, blast: { r: 38, color: 0xff9f43, t: 0.28, dur: 0.38 }, sound: 'mortar', gap: 200, kick: 1.6 },
};
const TRAY_H = 176;     // CSS 와 같아야 한다 (battle .bt-tray)
const TOP_H = 84;       // 위 막대·타이머

// 배경 그림(752×1344)의 바닥 형태: 길 중심의 가로 위치(그림 폭 비율)를 아래 끝·위 끝에서 잰 값, 길이 끝나는 세로 위치(그림 높이 비율)
const IMG_W = 752, IMG_H = 1344;
const U_NEAR = [0.168, 0.5, 0.832], U_FAR = [0.31, 0.5, 0.69];
const V_FAR = 0.14, V_NEAR = 0.8;
const FAR_SCALE = 0.62;  // 먼 곳(적 진영) 유닛 크기 비율 — 원근

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function moveKind(legsId: string, air: boolean): Move {
  if (air) return 'fly';
  if (legsId.includes('hover')) return 'hover';
  if (legsId.includes('track')) return 'track';
  if (legsId.includes('wheel')) return 'wheel';
  return 'walk';
}

export class BattleScene extends Phaser.Scene {
  private cfg!: BattleConfig;
  private views = new Map<number, View>();
  private ghosts: View[] = [];
  private fx: Fx[] = [];
  private fxG!: Phaser.GameObjects.Graphics;
  private laneG!: Phaser.GameObjects.Graphics;
  private groundG!: Phaser.GameObjects.Graphics;
  private acc = 0;
  private selected: number | null = null;
  private ended = false;
  private baseFlash: [number, number] = [0, 0];
  private pointPulse = 0;
  private W = 390; private H = 844; private y0 = 130; private y1 = 600; private k = 0.6;
  private ox = 0; private sxw = 0.55;
  private firstSpawnHinted = false;
  private wattFull = false;
  private dead = false;
  private hoverLane = -1;
  private motes: { x: number; y: number; v: number; s: number }[] = [];

  constructor() { super('battle'); }

  init(cfg: BattleConfig) {
    this.cfg = cfg; this.views.clear(); this.ghosts = []; this.fx = []; this.acc = 0; this.selected = null; this.ended = false;
    this.baseFlash = [0, 0]; this.pointPulse = 0; this.firstSpawnHinted = false; this.wattFull = false; this.dead = false; this.hoverLane = -1;
  }

  preload() {
    if (!this.textures.exists('battlefield')) this.load.image('battlefield', 'art/battlefield.jpg');
    for (const p of PARTS) {
      if (p.kind === 'accessory') continue;
      if (!this.textures.exists(p.id)) this.load.image(p.id, spriteUrl(p.id));
      if (!this.textures.exists('b_' + p.id)) this.load.image('b_' + p.id, spriteUrlBack(p.id));
    }
    this.load.on('loaderror', () => { /* 뒷모습이 없으면 앞모습으로 대신한다 (layoutUnit) */ });
  }

  create() {
    this.cfg.hud.setup(this.cfg.stage, this.cfg.battle, { onSelect: i => { this.selected = this.selected === i ? null : i; }, onQuit: () => { if (!this.ended) { this.ended = true; this.cfg.onQuit(); } } });
    this.layout();
    this.laneG = this.add.graphics().setDepth(5);
    this.groundG = this.add.graphics().setDepth(6);
    this.fxG = this.add.graphics().setDepth(100000);
    this.scale.on('resize', this.onResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { this.dead = true; this.scale.off('resize', this.onResize, this); });
    this.drawStatic();
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onTap(p.worldX, p.worldY));
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => { this.hoverLane = p.y > (this.y0 + this.y1) / 2 ? this.laneAt(p.worldX, p.worldY) : -1; });
    for (let i = 0; i < 14; i++) this.motes.push({ x: Math.random(), y: Math.random(), v: 0.012 + Math.random() * 0.02, s: 0.6 + Math.random() * 1.4 });
    if (!this.cfg.reducedMotion) {
      // 입장 연출: 어둠에서 밝아지며 살짝 당겨졌다 물러난다
      this.cameras.main.fadeIn(420, 7, 13, 22);
      this.cameras.main.setZoom(1.07);
      this.tweens.add({ targets: this.cameras.main, zoom: 1, duration: 950, ease: 'Cubic.out' });
    }
  }

  // ───────── 배치·원근 ─────────
  private layout() {
    this.W = this.scale.width; this.H = this.scale.height;
    const m = this.cfg.hud.metrics();
    this.y0 = (m.top || TOP_H) + 34;                 // 적 쪽 끝(pos 100)
    this.y1 = this.H - (m.tray || TRAY_H) - 26;      // 내 쪽 끝(pos 0)
    this.k = clamp(0.6 * (this.W / 390), 0.42, 0.85);
  }
  private onResize() { this.layout(); this.drawStatic(); }
  private get sy() { return (this.y1 - this.y0) / ((V_NEAR - V_FAR) * IMG_H); }
  private get oy() { return this.y0 - V_FAR * IMG_H * this.sy; }
  /** 0(내 기지) ~ 1(적 기지) 의 깊이 */
  private tOf = (pos: number) => clamp(pos / 100, 0, 1);
  private posToY = (p: number) => this.y1 + (this.y0 - this.y1) * this.tOf(p);
  private laneXAt(l: number, t: number) { return this.ox + lerp(U_NEAR[l], U_FAR[l], t) * IMG_W * this.sxw; }
  private scaleAt(t: number) { return lerp(1, FAR_SCALE, t); }
  private laneHalf(t: number) { return (this.laneXAt(1, t) - this.laneXAt(0, t)) * 0.46; }
  private baseY = (team: 0 | 1) => (team === 0 ? this.y1 + 12 : this.y0 - 14);
  private laneAt(x: number, y: number): number {
    const t = clamp((this.y1 - y) / (this.y1 - this.y0), 0, 1);
    let best = 0, bd = 1e9;
    for (let l = 0; l < LANES; l++) { const d = Math.abs(x - this.laneXAt(l, t)); if (d < bd) { bd = d; best = l; } }
    return best;
  }

  private drawStatic() {
    this.children.getAll().filter(o => (o as Phaser.GameObjects.GameObject).name === 'bg').forEach(o => o.destroy());
    this.add.rectangle(this.W / 2, this.H / 2, this.W, this.H, 0x070d16, 1).setName('bg').setDepth(-20);
    // 그림을 바닥 길이에 맞춰 놓는다: 세로는 길이 끝(V_FAR·V_NEAR)이 y0·y1 에 오도록, 가로는 바닥 폭이 화면 폭에 들어오게
    this.sxw = (this.W * 1.0) / (0.93 * IMG_W);
    this.ox = this.W / 2 - (IMG_W * this.sxw) / 2;
    const bg = this.add.image(this.ox, this.oy, 'battlefield').setOrigin(0, 0).setName('bg').setDepth(-10);
    bg.setDisplaySize(IMG_W * this.sxw, IMG_H * this.sy);
    // 가장자리 어둡게 (집중 + 위계)
    if (this.textures.exists('vignette')) this.textures.remove('vignette');
    const ct = this.textures.createCanvas('vignette', 256, 512)!;
    const cx = ct.getContext();
    const gr = cx.createRadialGradient(128, 256, 120, 128, 256, 330);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.62)');
    cx.fillStyle = gr; cx.fillRect(0, 0, 256, 512); ct.refresh();
    this.add.image(this.W / 2, this.H / 2, 'vignette').setDisplaySize(this.W, this.H).setName('bg').setDepth(99999);
  }

  // ───────── 입력 ─────────
  private onTap(x: number, y: number) {
    if (this.ended) return;
    const b = this.cfg.battle, hud = this.cfg.hud;
    if (this.selected === null) { hud.toast('아래 카드를 먼저 눌러 고르세요.'); play('deny'); return; }
    if (y < (this.y0 + this.y1) / 2) { hud.toast('아군 진영(아래쪽)의 길을 눌러 주세요.'); play('deny'); return; }
    const lane = this.laneAt(x, y);
    if (!b.spawn(0, this.selected, lane)) {
      play('deny');
      hud.toast(b.decks[0][this.selected].watt > b.watt[0] ? '와트가 부족해요. 조금 기다리세요.' : '유닛이 너무 많아요.');
    }
  }

  // ───────── 한 프레임 ─────────
  update(_t: number, delta: number) {
    if (!this.cfg || this.dead) return;
    const b = this.cfg.battle;
    const stepMs = 1000 / TICK_HZ;
    if (!this.ended) {
      this.acc += Math.min(100, delta);
      while (this.acc >= stepMs && !b.over) { b.step(); this.consume(b.events); this.acc -= stepMs; }
      if (b.over) {
        this.ended = true;
        if (b.baseHp[1] <= 0 || b.baseHp[0] <= 0) { play('baseHit'); if (!this.cfg.reducedMotion) this.cameras.main.shake(260, 0.01); }
        this.time.delayedCall(1100, () => this.cfg.onEnd(b));
      }
    }
    const alpha = this.ended ? 1 : clamp(this.acc / stepMs, 0, 1);
    this.sync(b, delta, alpha);
    this.draw(b, delta);
    this.cfg.hud.update(b, this.selected);
    // 와트가 가득 차면(낭비되기 직전) 한 번 알려 준다
    if (b.watt[0] >= 9.99 && !this.wattFull) { this.wattFull = true; play('ready'); } else if (b.watt[0] < 9) this.wattFull = false;
  }

  /** 유닛의 화면 좌표(발 위치)와 원근 크기. 보간 없이 틱 끝 위치 — 이벤트 연출용 */
  private posOf(id: number, b: Battle): { x: number; y: number; s: number; h: number } | null {
    const u = b.units.find(q => q.id === id);
    const v = this.views.get(id);
    if (u) { const t = this.tOf(u.pos); return { x: this.laneXAt(u.lane, t), y: this.posToY(u.pos), s: this.scaleAt(t), h: v ? v.h : 60 }; }
    return v ? { x: v.c.x, y: v.c.y, s: v.c.scaleX, h: v.h } : null;
  }

  private consume(evs: BattleEvent[]) {
    const b = this.cfg.battle;
    const calm = this.cfg.reducedMotion;
    for (const e of evs) {
      if (e.type === 'spawn') {
        const u = b.units.find(q => q.id === e.unit); if (!u) continue;
        const t = this.tOf(u.pos), x = this.laneXAt(e.lane, t), y = this.posToY(u.pos), s = this.scaleAt(t);
        const col = e.team === 0 ? 0x5fd3ff : 0xff9f43;
        this.fx.push({ kind: 'ring', x1: x, y1: y, x2: x, y2: y, t: 0, dur: 0.45, color: col, r: 32 * s });
        this.fx.push({ kind: 'ring', x1: x, y1: y, x2: x, y2: y, t: 0.12, dur: 0.4, color: 0xffffff, r: 20 * s });
        play('spawn', 90);
        if (e.team === 0 && !this.firstSpawnHinted) { this.firstSpawnHinted = true; this.cfg.hud.toast('유닛은 자동으로 앞으로 나아가 싸웁니다.'); }
      } else if (e.type === 'attack') {
        const a = this.posOf(e.from, b); if (!a) continue;
        const av = this.views.get(e.from);
        let tx: number, ty: number, ts = 1;
        if (e.to !== null) {
          const t = this.posOf(e.to, b); if (!t) continue; tx = t.x; ty = t.y - t.h * 0.4 * t.s; ts = t.s;
          const tv = this.views.get(e.to);
          if (tv && e.family !== 'repair') { tv.flash = 1; tv.hpShow = 1.4; tv.shake = 1; }
        } else {
          tx = this.laneXAt(e.lane, e.baseOf === 1 ? 1 : 0); ty = this.baseY(e.baseOf as 0 | 1); this.baseFlash[e.baseOf as 0 | 1] = 1;
          play('hit', 80); if (e.baseOf === 0 && !calm) this.cameras.main.shake(70, 0.003);
        }
        const fx = FAMILY_FX[e.family] ?? FAMILY_FX.gatling;
        if (av) {
          if (e.family === 'blade') av.lunge = 1; else av.recoil = Math.max(av.recoil, fx.kick > 0 ? 1 : 0.2);
          av.recoilK = fx.kick;
        }
        // 총구: 내 유닛(뒷모습)은 위쪽을 향해 쏜다
        const mine = av ? av.face === 1 : true;
        const mx = a.x + (mine ? a.s * 8 : -a.s * 8), my = a.y - a.h * a.s * (mine ? 0.62 : 0.4);
        this.fx.push({ kind: 'tracer', x1: mx, y1: my, x2: tx, y2: ty, t: 0, dur: fx.dur, color: fx.color, r: fx.width * Math.max(0.8, a.s) });
        if (fx.kick > 0) this.fx.push({ kind: 'flash', x1: mx, y1: my, x2: mx, y2: my, t: 0, dur: 0.1, color: fx.color, r: (5 + fx.kick * 4) * a.s });
        if (fx.blast) this.fx.push({ kind: 'blast', x1: tx, y1: ty, x2: tx, y2: ty, t: fx.blast.t, dur: fx.blast.dur, color: fx.blast.color, r: fx.blast.r * ts });
        if (e.family !== 'repair') this.fx.push({ kind: 'spark', x1: tx, y1: ty, x2: tx, y2: ty, t: fx.blast ? fx.blast.t : 0.05, dur: 0.2, color: 0xfff3b0, r: 12 * ts });
        if (e.family === 'repair') this.fx.push({ kind: 'ring', x1: tx, y1: ty, x2: tx, y2: ty, t: 0.05, dur: 0.3, color: 0x6fe39a, r: 22 * ts });
        play(fx.sound, fx.gap);
      } else if (e.type === 'die') {
        const t = this.tOf(e.pos), x = this.laneXAt(e.lane, t), y = this.posToY(e.pos) - 18 * this.scaleAt(t), s = this.scaleAt(t);
        const col = e.team === 0 ? 0x5fd3ff : 0xff7a45;
        this.fx.push({ kind: 'puff', x1: x, y1: y, x2: x, y2: y, t: 0, dur: 0.5, color: col, r: 34 * s });
        this.fx.push({ kind: 'debris', x1: x, y1: y, x2: x, y2: y, t: 0, dur: 0.7, color: 0xb9c3d1, r: 46 * s });
        this.fx.push({ kind: 'ring', x1: x, y1: y + 10 * s, x2: x, y2: y + 10 * s, t: 0, dur: 0.4, color: 0xffd7a0, r: 40 * s });
        play('boom', 110);
        if (!calm) this.cameras.main.shake(50, 0.0015);
      } else if (e.type === 'point') {
        this.pointPulse = 1;
        if (e.controller === 0) play('pointCapture');
      }
    }
  }

  // ───────── 유닛 그림: 틱 사이 보간·걸음·소환·피격·사망 ─────────
  private sync(b: Battle, delta: number, alpha: number) {
    const dt = delta / 1000, now = this.time.now / 1000, calm = this.cfg.reducedMotion;
    const amp = calm ? 0.35 : 1;
    const alive = new Set<number>();
    for (const u of b.units) {
      alive.add(u.id);
      let v = this.views.get(u.id);
      if (!v) { v = this.makeView(u); this.views.set(u.id, v); }
      v.unit = u;
      // 20Hz 틱 사이를 정확히 잇는다: 지난 틱 위치 → 이번 틱 위치
      const pos = lerp(u.prev, u.pos, alpha), t = this.tOf(pos);
      const x = this.laneXAt(u.lane, t), y = this.posToY(pos);
      const moved = Math.hypot(x - v.lastX, y - v.lastY);
      if (v.lastX === 0 && v.lastY === 0) { v.lastX = x; v.lastY = y; }
      v.c.setPosition(x, y); v.c.setScale(this.scaleAt(t)); v.c.setDepth(y);
      const mvTarget = u.moving ? 1 : 0;
      v.mv += (mvTarget - v.mv) * Math.min(1, dt * 9);
      const stride = Math.max(18, v.w * 0.42);
      v.ph += (moved / this.scaleAt(t)) / stride * Math.PI;
      v.lastX = x; v.lastY = y;
      this.animateView(v, dt, now, amp, calm);
      if (u.hp < v.lastHp) v.hpShow = Math.max(v.hpShow, 1.4);
      v.lastHp = u.hp;
    }
    for (const [id, v] of this.views) if (!alive.has(id)) { v.dying = 0; this.ghosts.push(v); this.views.delete(id); }
    // 쓰러지는 유닛: 어두워지며 가라앉고 사라진다
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      const g = this.ghosts[i];
      if (!g.c.active) { this.ghosts.splice(i, 1); continue; }
      g.dying += dt;
      const p = g.dying / 0.45;
      if (p >= 1) { g.c.destroy(); this.ghosts.splice(i, 1); continue; }
      g.c.setAlpha(1 - p * p); g.rig.y += p * 1.2; g.rig.rotation += g.face * dt * 0.8;
      for (const im of g.imgs) im.setTintFill(0x202833);
    }
  }

  private animateView(v: View, dt: number, now: number, amp: number, calm: boolean) {
    const h = v.h, id = v.unit.id;
    const age = now - v.born;
    // 소환: 위에서 내려앉으며 나타난다 (착지 때 먼지 + 눌림)
    const sp = clamp(age / 0.4, 0, 1), e = 1 - Math.pow(1 - sp, 3);
    const drop = calm ? 0 : -(1 - e) * (v.face === 1 ? 90 : 55);
    v.c.setAlpha(Math.min(1, age / 0.22));
    if (sp >= 1 && !v.landed) {
      v.landed = true;
      if (!calm) { this.fx.push({ kind: 'dust', x1: v.c.x - 10, y1: v.c.y, x2: v.c.x - 10, y2: v.c.y, t: 0, dur: 0.5, color: 0xaab4c4, r: 12 * v.c.scaleX }); this.fx.push({ kind: 'dust', x1: v.c.x + 10, y1: v.c.y, x2: v.c.x + 10, y2: v.c.y, t: 0.04, dur: 0.5, color: 0xaab4c4, r: 12 * v.c.scaleX }); }
    }
    const land = sp >= 1 && age < 0.62 && !calm ? Math.sin((age - 0.4) / 0.22 * Math.PI) * 0.07 : 0; // 착지 눌림
    const mv = v.mv;
    let rigY = 0, rigRot = 0, legRot = 0, upY = 0, upRot = 0, upX = 0, sqY = 1;
    const sw = Math.sin(v.ph), ab = Math.abs(sw);
    switch (v.kind) {
      case 'walk':
        rigY = -ab * h * 0.026 * mv * amp; legRot = sw * 0.06 * mv * amp; upY = -Math.abs(Math.sin(v.ph + 0.7)) * h * 0.012 * mv * amp;
        upRot = -sw * 0.03 * mv * amp; sqY = 1 + Math.cos(v.ph * 2) * 0.016 * mv * amp; break;
      case 'wheel':
        rigY = -Math.abs(Math.sin(v.ph * 2)) * h * 0.012 * mv * amp; rigRot = Math.sin(v.ph * 1.3) * 0.012 * mv * amp; break;
      case 'track':
        upX = Math.sin(now * 55 + id) * 0.7 * mv * amp; rigY = Math.sin(now * 38 + id) * 0.5 * mv * amp; break;
      case 'hover':
        rigY = Math.sin(now * 2.6 + id) * h * 0.022 * amp; rigRot = Math.sin(now * 1.7 + id) * 0.018 * amp - v.face * 0.0 + (-v.face * 0.03 * mv); break;
      case 'fly':
        rigY = Math.sin(now * 3 + id) * h * 0.03 * amp; rigRot = Math.sin(now * 1.9 + id) * 0.03 * amp + (-v.face * 0.05 * mv); break;
    }
    // 서 있는 동안의 숨 쉬기
    upY += Math.sin(now * 2 + id) * 0.5 * (1 - mv) * amp;
    // 사격 반동 / 근접 돌진
    v.recoil = Math.max(0, v.recoil - dt * 6); v.lunge = Math.max(0, v.lunge - dt * 5);
    const kick = (v.recoilK ?? 0.5) * (calm ? 0 : 1);
    const recoilPx = v.recoil * v.recoil * h * 0.05 * kick * v.face;             // 내 유닛(face=1)은 아래로 밀린다
    const lungePx = Math.sin(v.lunge * Math.PI) * h * 0.14 * -v.face * (calm ? 0 : 1); // 앞으로 찌르기
    v.rig.setPosition(upX + (v.shake > 0 ? Math.sin(now * 90) * v.shake * 2.2 : 0), -v.lift + rigY + recoilPx + lungePx + drop);
    v.rig.rotation = rigRot;
    v.rig.setScale(1 + land * 0.5, sqY - land);
    v.legsC.rotation = legRot; v.upper.setPosition(upX * 0.5, upY - recoilPx * 0.4); v.upper.rotation = upRot;
    v.shadow.setScale(1 - (1 - e) * 0.4, 1 - (1 - e) * 0.4).setAlpha(0.35 * e);
    // 피격 반짝임·흔들림
    v.shake = Math.max(0, v.shake - dt * 7); v.flash = Math.max(0, v.flash - dt * 9); v.hpShow = Math.max(0, v.hpShow - dt);
    const wantTint = v.flash > 0.25;
    if (wantTint !== v.tinted) { v.tinted = wantTint; for (const im of v.imgs) { if (wantTint) im.setTintFill(0xffffff); else im.clearTint(); } }
    // 걸음마다 발밑 먼지
    if (!calm && mv > 0.6 && (v.kind === 'walk' || v.kind === 'wheel') && this.fx.length < 90) {
      const step = Math.floor(v.ph / Math.PI);
      if (step !== v.foot) { v.foot = step; this.fx.push({ kind: 'dust', x1: v.c.x + (step % 2 ? 6 : -6) * v.c.scaleX, y1: v.c.y, x2: v.c.x, y2: v.c.y, t: 0, dur: 0.4, color: 0x9aa7b8, r: 6 * v.c.scaleX }); }
    }
  }

  private makeView(u: Unit): View {
    const build = this.cfg.battle.decks[u.team][u.card].build;
    const face: 1 | -1 = u.team === 0 ? 1 : -1;
    const L = layoutUnit(build, this.k, face === 1)!;
    const air = u.stats.move === 'air';
    const lift = air ? 20 * (this.k / 0.6) : 0;
    const ringColor = u.team === 0 ? 0x5fd3ff : 0xff7a45;
    const shadow = this.add.ellipse(0, -1, L.w * 0.9, Math.max(8, L.w * 0.24), 0x000000, 0.35);
    const ring = this.add.ellipse(0, -1, L.w * 0.72, Math.max(6, L.w * 0.18), ringColor, 0.12).setStrokeStyle(1.5, ringColor, 0.85);
    const imgs: Phaser.GameObjects.Image[] = [];
    const mk = (i: number) => { const p = L.parts[i]; const im = this.add.image(p.x, p.y, this.textures.exists(p.tex) ? p.tex : p.id).setOrigin(0, 0).setDisplaySize(p.w, p.h); imgs.push(im); return im; };
    const legsC = this.add.container(0, 0, [mk(0)]);
    const upper = this.add.container(0, 0, [mk(1), mk(2)]);
    const rig = this.add.container(0, -lift, [legsC, upper]);
    const c = this.add.container(0, 0, [shadow, ring, rig]);
    c.setAlpha(0);
    const t = this.tOf(u.pos), y = this.posToY(u.pos);
    c.setPosition(this.laneXAt(u.lane, t), y);
    return {
      c, rig, legsC, upper, shadow, imgs, unit: u, w: L.w, h: L.h, lift, kind: moveKind(build.legs, air), face,
      ph: Math.random() * 6, mv: 0, born: this.time.now / 1000, landed: false, recoil: 0, lunge: 0, flash: 0, hpShow: 0, shake: 0,
      lastX: 0, lastY: 0, foot: 0, dying: -1, tinted: false, lastHp: u.hp,
    } as View;
  }

  // ───────── 바닥·기지·효과 그리기 ─────────
  private quad(g: Phaser.GameObjects.Graphics, l: number, t0: number, t1: number, fillA: number, strokeA: number, color: number) {
    const x00 = this.laneXAt(l, t0) - this.laneHalf(t0), x01 = this.laneXAt(l, t0) + this.laneHalf(t0);
    const x10 = this.laneXAt(l, t1) - this.laneHalf(t1), x11 = this.laneXAt(l, t1) + this.laneHalf(t1);
    const ya = lerp(this.y1, this.y0, t0), yb = lerp(this.y1, this.y0, t1);
    g.fillStyle(color, fillA); g.fillPoints([new Phaser.Geom.Point(x00, ya), new Phaser.Geom.Point(x01, ya), new Phaser.Geom.Point(x11, yb), new Phaser.Geom.Point(x10, yb)], true);
    if (strokeA > 0) { g.lineStyle(2, color, strokeA); g.strokePoints([new Phaser.Geom.Point(x00, ya), new Phaser.Geom.Point(x01, ya), new Phaser.Geom.Point(x11, yb), new Phaser.Geom.Point(x10, yb)], true); }
  }

  private plate(g: Phaser.GameObjects.Graphics, team: 0 | 1, hpFrac: number, flash: number) {
    const near = team === 0, y = this.baseY(team), t = near ? 0 : 1;
    const hw = near ? this.W * 0.46 : this.W * 0.27, hh = near ? 13 : 9;
    const col = near ? 0x5fd3ff : 0xff7a45;
    const skew = near ? 0 : 0;
    g.fillStyle(0x05080e, 0.7); g.fillRoundedRect(this.W / 2 - hw - 3 + skew, y - hh - 3, (hw + 3) * 2, hh * 2 + 6, 8);
    g.fillStyle(col, 0.18); g.fillRoundedRect(this.W / 2 - hw, y - hh, hw * 2, hh * 2, 6);
    g.fillStyle(col, 0.95); g.fillRoundedRect(this.W / 2 - hw + 3, y - hh + 3, Math.max(0, (hw * 2 - 6) * hpFrac), hh * 2 - 6, 4);
    g.lineStyle(2, col, 0.95); g.strokeRoundedRect(this.W / 2 - hw, y - hh, hw * 2, hh * 2, 6);
    if (flash > 0) { g.fillStyle(0xffffff, 0.55 * flash); g.fillRoundedRect(this.W / 2 - hw, y - hh, hw * 2, hh * 2, 6); }
    void t;
  }

  private draw(b: Battle, delta: number) {
    const dt = delta / 1000, now = this.time.now / 1000;
    const lg = this.laneG; lg.clear();
    const gg = this.groundG; gg.clear();
    const g = this.fxG; g.clear();
    // 길 안내: 카드를 고르면 내 진영의 길이 빛난다
    if (this.selected !== null && !this.ended) {
      const pulse = 0.5 + 0.5 * Math.sin(now * 4);
      for (let l = 0; l < LANES; l++) {
        const hot = this.hoverLane === l;
        this.quad(lg, l, 0, 0.5, (hot ? 0.2 : 0.09) + 0.05 * pulse, hot ? 0.9 : 0.35, 0x5fd3ff);
        // 위로 흐르는 화살표
        for (let i = 0; i < 3; i++) {
          const tt = ((now * 0.35 + i / 3) % 1) * 0.5, y = lerp(this.y1, this.y0, tt), x = this.laneXAt(l, tt), s = this.scaleAt(tt) * 9;
          lg.lineStyle(2, 0xbfeaff, 0.55 * (1 - tt * 2)); lg.lineBetween(x - s, y + s * 0.6, x, y - s * 0.4); lg.lineBetween(x + s, y + s * 0.6, x, y - s * 0.4);
        }
      }
    }
    // 기지
    for (const team of [1, 0] as const) {
      this.baseFlash[team] = Math.max(0, this.baseFlash[team] - dt * 4);
      this.plate(gg, team, Math.max(0, b.baseHp[team] / BASE_HP), this.baseFlash[team]);
    }
    // 중앙 거점
    const pt = this.tOf(POINT_POS), px = this.laneXAt(POINT_LANE, pt), py = this.posToY(POINT_POS);
    const rx = this.laneHalf(pt) * 0.95, ry = (POINT_RADIUS / 100) * (this.y1 - this.y0) * 0.9;
    this.pointPulse = Math.max(0, this.pointPulse - dt * 2);
    const ctl = b.controller;
    const col = ctl === 0 ? 0x5fd3ff : ctl === 1 ? 0xff7a45 : 0x8aa2c8;
    gg.fillStyle(col, ctl === -1 ? 0.1 : 0.24 + 0.2 * this.pointPulse); gg.fillEllipse(px, py, rx * 2, ry * 2);
    gg.lineStyle(2, col, 0.9); gg.strokeEllipse(px, py, rx * 2, ry * 2);
    gg.lineStyle(1, col, 0.5); gg.strokeEllipse(px, py, rx * 1.3, ry * 1.3);
    for (const t of [0, 1] as const) {
      const p = b.pointTimer[t] / POINT_CAPTURE_SEC;
      if (p > 0 && p < 1) {
        gg.lineStyle(4, t === 0 ? 0x5fd3ff : 0xff7a45, 0.95); gg.beginPath();
        for (let i = 0; i <= 32; i++) { const a = -Math.PI / 2 + (i / 32) * p * Math.PI * 2; const x = px + Math.cos(a) * rx * 0.9, y = py + Math.sin(a) * ry * 0.9; if (i === 0) gg.moveTo(x, y); else gg.lineTo(x, y); }
        gg.strokePath();
      }
    }
    // 체력 막대: 맞았거나 다친 유닛만 (화면 정리)
    for (const v of this.views.values()) {
      if (v.unit.hp >= v.unit.maxHp && v.hpShow <= 0) continue;
      const s = v.c.scaleX, w = Math.max(26, v.w * 0.8) * s, x = v.c.x - w / 2, y = v.c.y - (v.h + v.lift) * s - 7;
      g.fillStyle(0x000000, 0.65); g.fillRect(x - 1, y - 1, w + 2, 6);
      g.fillStyle(v.unit.team === 0 ? 0x6fe39a : 0xff7a45, 1); g.fillRect(x, y, w * Math.max(0, v.unit.hp / v.unit.maxHp), 4);
    }
    // 효과
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i]; f.t += dt;
      const p = f.t / f.dur;
      if (p >= 1) { this.fx.splice(i, 1); continue; }
      if (p < 0) continue;
      if (f.kind === 'tracer') {
        const hx = f.x1 + (f.x2 - f.x1) * Math.min(1, p * 1.5), hy = f.y1 + (f.y2 - f.y1) * Math.min(1, p * 1.5);
        g.lineStyle(f.r * 2.2, f.color, 0.22 * (1 - p)); g.lineBetween(f.x1 + (hx - f.x1) * 0.35, f.y1 + (hy - f.y1) * 0.35, hx, hy);
        g.lineStyle(f.r, f.color, 1 - p * 0.6); g.lineBetween(f.x1 + (hx - f.x1) * 0.35, f.y1 + (hy - f.y1) * 0.35, hx, hy);
      } else if (f.kind === 'blast') {
        g.fillStyle(f.color, 0.6 * (1 - p)); g.fillCircle(f.x2, f.y2, f.r * (0.4 + p));
        g.fillStyle(0xffffff, 0.5 * (1 - p) * (1 - p)); g.fillCircle(f.x2, f.y2, f.r * 0.35 * (1 - p));
      } else if (f.kind === 'puff') {
        for (let k = 0; k < 6; k++) { const a = k * 1.05 + 0.4, d = f.r * p; g.fillStyle(f.color, 0.7 * (1 - p)); g.fillCircle(f.x2 + Math.cos(a) * d, f.y2 + Math.sin(a) * d * 0.8, 6 * (1 - p) + 2); }
        g.fillStyle(0xfff2cc, 0.85 * (1 - p)); g.fillCircle(f.x2, f.y2, f.r * 0.5 * (1 - p));
      } else if (f.kind === 'flash') {
        g.fillStyle(f.color, 0.8 * (1 - p)); g.fillCircle(f.x2, f.y2, f.r * (1 - p * 0.4));
        g.fillStyle(0xffffff, 0.9 * (1 - p)); g.fillCircle(f.x2, f.y2, f.r * 0.45);
      } else if (f.kind === 'spark') {
        g.lineStyle(2, f.color, 1 - p);
        for (let k = 0; k < 6; k++) { const a = k * 1.047 + 0.3, d0 = f.r * p * 0.5, d1 = f.r * (0.4 + p); g.lineBetween(f.x2 + Math.cos(a) * d0, f.y2 + Math.sin(a) * d0, f.x2 + Math.cos(a) * d1, f.y2 + Math.sin(a) * d1); }
      } else if (f.kind === 'dust') {
        for (let k = 0; k < 3; k++) { const a = k * 2.1 + 0.5; g.fillStyle(f.color, 0.32 * (1 - p)); g.fillCircle(f.x2 + Math.cos(a) * f.r * p * 1.4, f.y2 - p * f.r * 0.9 + Math.sin(a) * 2, f.r * (0.45 + p * 0.5)); }
      } else if (f.kind === 'debris') {
        for (let k = 0; k < 8; k++) {
          const a = k * 0.8 + 0.2, d = f.r * p;
          const x = f.x2 + Math.cos(a) * d, y = f.y2 + Math.sin(a) * d * 0.5 - 22 * p + 60 * p * p;
          g.fillStyle(k % 3 === 0 ? 0xffb35c : f.color, 1 - p); g.fillRect(x - 2, y - 2, 4 * (1 - p * 0.5), 4 * (1 - p * 0.5));
        }
      } else {
        g.lineStyle(3, f.color, 1 - p); g.strokeCircle(f.x2, f.y2, f.r * (0.3 + p));
      }
    }
    // 떠다니는 먼지 (분위기)
    for (const m of this.motes) {
      m.y -= m.v * dt; if (m.y < 0) { m.y = 1; m.x = Math.random(); }
      g.fillStyle(0xbfd8ff, 0.1 + 0.06 * Math.sin(now * 1.5 + m.x * 9)); g.fillCircle(m.x * this.W + Math.sin(now * 0.5 + m.y * 6) * 6, m.y * this.H, m.s);
    }
  }
}
