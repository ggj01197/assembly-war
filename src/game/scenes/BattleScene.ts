import Phaser from 'phaser';
import { LANES, TICK_HZ, BASE_HP, POINT_LANE, POINT_POS, POINT_RADIUS, POINT_CAPTURE_SEC, type Battle, type BattleEvent, type Unit } from '../../domain/battle/sim';
import { layoutUnit, spriteUrl } from '../unitLayout';
import { PARTS } from '../../data/parts';
import { play } from '../../native/audio';
import type { BattleHud } from '../../ui/battleHud';
import type { Stage } from '../../data/stages';

/**
 * 전장(세로): 길 3개·양쪽 기지·중앙 거점. 규칙은 전부 `Battle`(domain)이 하고 이 씬은 그리기와 입력만 한다.
 * 카드(HUD)를 누른 뒤 아군 진영(아래 절반)의 길을 누르면 생산 (기획안 §5).
 */
export interface BattleConfig { stage: Stage; battle: Battle; hud: BattleHud; reducedMotion: boolean; onEnd(b: Battle): void; onQuit(): void }

interface View { c: Phaser.GameObjects.Container; unit: Unit; ty: number; tx: number; lift: number; h: number }
interface Fx { kind: 'tracer' | 'blast' | 'puff' | 'ring'; x1: number; y1: number; x2: number; y2: number; t: number; dur: number; color: number; r: number }

/** 무기 계열별 연출: 선 색·굵기·길이, 착탄 폭발, 소리 (sim 은 계열 이름을 몰라도 되고 연출만 안다) */
const FAMILY_FX: Record<string, { color: number; width: number; dur: number; blast?: { r: number; color: number; t: number; dur: number }; sound: string; gap: number }> = {
  gatling: { color: 0xffe07a, width: 2, dur: 0.1, sound: 'gatling', gap: 110 },
  cannon: { color: 0xff9f43, width: 4, dur: 0.18, blast: { r: 26, color: 0xffa94d, t: 0, dur: 0.3 }, sound: 'cannon', gap: 160 },
  missile: { color: 0x5fd3ff, width: 3, dur: 0.26, blast: { r: 14, color: 0x8fe9ff, t: 0.2, dur: 0.25 }, sound: 'missile', gap: 140 },
  laser: { color: 0xb8f7ff, width: 4, dur: 0.14, sound: 'laser', gap: 120 },
  blade: { color: 0xf0fbff, width: 5, dur: 0.1, blast: { r: 12, color: 0xdff6ff, t: 0, dur: 0.18 }, sound: 'blade', gap: 100 },
  flak: { color: 0xfff3b0, width: 3, dur: 0.12, blast: { r: 22, color: 0xffffff, t: 0.08, dur: 0.22 }, sound: 'flak', gap: 120 },
  repair: { color: 0x6fe39a, width: 3, dur: 0.2, sound: 'repair', gap: 160 },
  mortar: { color: 0xffc46b, width: 5, dur: 0.34, blast: { r: 38, color: 0xff9f43, t: 0.28, dur: 0.38 }, sound: 'mortar', gap: 200 },
};
const TRAY_H = 176;     // CSS 와 같아야 한다 (battle .bt-tray)
const TOP_H = 84;       // 위 막대·타이머

export class BattleScene extends Phaser.Scene {
  private cfg!: BattleConfig;
  private views = new Map<number, View>();
  private fx: Fx[] = [];
  private fxG!: Phaser.GameObjects.Graphics;
  private bgG!: Phaser.GameObjects.Graphics;
  private acc = 0;
  private selected: number | null = null;
  private ended = false;
  private baseFlash: [number, number] = [0, 0];
  private pointPulse = 0;
  private W = 390; private H = 844; private y0 = 130; private y1 = 600; private k = 0.36;
  private firstSpawnHinted = false;
  private wattFull = false;
  private dead = false;

  constructor() { super('battle'); }

  init(cfg: BattleConfig) { this.cfg = cfg; this.views.clear(); this.fx = []; this.acc = 0; this.selected = null; this.ended = false; this.baseFlash = [0, 0]; this.pointPulse = 0; this.firstSpawnHinted = false; this.wattFull = false; this.dead = false; }

  preload() {
    if (!this.textures.exists('hangar_bg')) this.load.image('hangar_bg', 'art/hangar_bg.jpg');
    for (const p of PARTS) if (p.kind !== 'accessory' && !this.textures.exists(p.id)) this.load.image(p.id, spriteUrl(p.id));
  }

  create() {
    this.cfg.hud.setup(this.cfg.stage, this.cfg.battle, { onSelect: i => { this.selected = this.selected === i ? null : i; }, onQuit: () => { if (!this.ended) { this.ended = true; this.cfg.onQuit(); } } });
    this.layout();
    this.bgG = this.add.graphics().setDepth(1);
    this.fxG = this.add.graphics().setDepth(100000);
    this.scale.on('resize', this.onResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { this.dead = true; this.scale.off('resize', this.onResize, this); });
    this.drawStatic();
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onTap(p.x, p.y));
  }

  // ───────── 배치 ─────────
  private layout() {
    this.W = this.scale.width; this.H = this.scale.height;
    const m = this.cfg.hud.metrics();
    this.y0 = (m.top || TOP_H) + 54;
    this.y1 = this.H - (m.tray || TRAY_H) - 52;
    this.k = Math.min(0.5, Math.max(0.3, 0.36 * (this.W / 390)));
  }
  private onResize() { this.layout(); this.drawStatic(); }
  private laneX = (l: number) => (this.W / LANES) * (l + 0.5);
  private posToY = (p: number) => this.y1 - (p / 100) * (this.y1 - this.y0);
  private baseY = (team: 0 | 1) => (team === 0 ? this.y1 + 30 : this.y0 - 30);

  private drawStatic() {
    this.children.getAll().filter(o => (o as Phaser.GameObjects.GameObject).name === 'bg').forEach(o => o.destroy());
    const bg = this.add.image(this.W / 2, this.H / 2, 'hangar_bg').setName('bg').setDepth(0);
    const s = Math.max(this.W / bg.width, this.H / bg.height); bg.setScale(s);
    const dim = this.add.rectangle(this.W / 2, this.H / 2, this.W, this.H, 0x070d16, 0.62).setName('bg').setDepth(0.5);
    void dim;
    const g = this.bgG; g.clear();
    const lw = this.W / LANES;
    for (let l = 0; l < LANES; l++) {
      g.fillStyle(0x0b1420, 0.5); g.fillRoundedRect(l * lw + 5, this.y0 - 14, lw - 10, this.y1 - this.y0 + 28, 10);
      g.lineStyle(1, 0x2a3b57, 0.9); g.strokeRoundedRect(l * lw + 5, this.y0 - 14, lw - 10, this.y1 - this.y0 + 28, 10);
      g.lineStyle(1, 0x2a3b57, 0.5);
      for (let y = this.y0; y < this.y1; y += 24) g.lineBetween(this.laneX(l), y, this.laneX(l), y + 10);
    }
  }

  // ───────── 입력 ─────────
  private onTap(x: number, y: number) {
    if (this.ended) return;
    const b = this.cfg.battle, hud = this.cfg.hud;
    if (this.selected === null) { hud.toast('아래 카드를 먼저 눌러 고르세요.'); play('deny'); return; }
    if (y < (this.y0 + this.y1) / 2) { hud.toast('아군 진영(아래쪽)의 길을 눌러 주세요.'); play('deny'); return; }
    const lane = Math.min(LANES - 1, Math.max(0, Math.floor(x / (this.W / LANES))));
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
    this.sync(b, delta);
    this.draw(b, delta);
    this.cfg.hud.update(b, this.selected);
    // 와트가 가득 차면(낭비되기 직전) 한 번 알려 준다
    if (b.watt[0] >= 9.99 && !this.wattFull) { this.wattFull = true; play('ready'); } else if (b.watt[0] < 9) this.wattFull = false;
  }

  private posOf(id: number, b: Battle): { x: number; y: number } | null {
    const u = b.units.find(q => q.id === id);
    if (u) return { x: this.laneX(u.lane), y: this.posToY(u.pos) };
    const v = this.views.get(id);
    return v ? { x: v.c.x, y: v.c.y } : null;
  }

  private consume(evs: BattleEvent[]) {
    const b = this.cfg.battle;
    for (const e of evs) {
      if (e.type === 'spawn') {
        const u = b.units.find(q => q.id === e.unit); if (!u) continue;
        const x = this.laneX(e.lane), y = this.posToY(u.pos);
        this.fx.push({ kind: 'ring', x1: x, y1: y, x2: x, y2: y, t: 0, dur: 0.35, color: e.team === 0 ? 0x5fd3ff : 0xff9f43, r: 26 });
        play('spawn', 90);
        if (e.team === 0 && !this.firstSpawnHinted) { this.firstSpawnHinted = true; this.cfg.hud.toast('유닛은 자동으로 앞으로 나아가 싸웁니다.'); }
      } else if (e.type === 'attack') {
        const a = this.posOf(e.from, b); if (!a) continue;
        let tx: number, ty: number;
        if (e.to !== null) { const t = this.posOf(e.to, b); if (!t) continue; tx = t.x; ty = t.y; }
        else { tx = this.laneX(e.lane); ty = this.baseY(e.baseOf as 0 | 1); this.baseFlash[e.baseOf as 0 | 1] = 1; play('hit', 80); if (e.baseOf === 0 && !this.cfg.reducedMotion) this.cameras.main.shake(70, 0.003); }
        const fx = FAMILY_FX[e.family] ?? FAMILY_FX.gatling;
        this.fx.push({ kind: 'tracer', x1: a.x, y1: a.y - 22, x2: tx, y2: ty - 10, t: 0, dur: fx.dur, color: fx.color, r: fx.width });
        if (fx.blast) this.fx.push({ kind: 'blast', x1: tx, y1: ty, x2: tx, y2: ty, t: fx.blast.t, dur: fx.blast.dur, color: fx.blast.color, r: fx.blast.r });
        if (e.family === 'repair') this.fx.push({ kind: 'ring', x1: tx, y1: ty, x2: tx, y2: ty, t: 0.05, dur: 0.3, color: 0x6fe39a, r: 22 });
        play(fx.sound, fx.gap);
      } else if (e.type === 'die') {
        const x = this.laneX(e.lane), y = this.posToY(e.pos);
        this.fx.push({ kind: 'puff', x1: x, y1: y - 18, x2: x, y2: y - 18, t: 0, dur: 0.45, color: e.team === 0 ? 0x5fd3ff : 0xff7a45, r: 30 });
        play('boom', 110);
      } else if (e.type === 'point') {
        this.pointPulse = 1;
        if (e.controller === 0) play('pointCapture');
      }
    }
  }

  private sync(b: Battle, delta: number) {
    const alive = new Set<number>();
    for (const u of b.units) {
      alive.add(u.id);
      let v = this.views.get(u.id);
      if (!v) { v = this.makeView(u); this.views.set(u.id, v); v.c.setPosition(this.laneX(u.lane), this.posToY(u.pos)); }
      v.unit = u; v.tx = this.laneX(u.lane); v.ty = this.posToY(u.pos);
    }
    for (const [id, v] of this.views) if (!alive.has(id)) { v.c.destroy(); this.views.delete(id); }
    const f = 1 - Math.pow(0.0005, delta / 1000); // 프레임 보간 (20Hz 틱 → 60fps)
    const tNow = this.time.now / 1000;
    for (const v of this.views.values()) {
      if (!v.c.active) continue;
      v.c.x += (v.tx - v.c.x) * f; v.c.y += (v.ty - v.c.y) * f;
      v.c.setDepth(v.c.y);
      const bob = v.lift ? Math.sin(tNow * 3 + v.unit.id) * 2 : 0;
      const bodyC = v.c.getAt(1) as Phaser.GameObjects.Container | undefined;
      if (bodyC) bodyC.y = -v.lift + bob;
    }
  }

  private makeView(u: Unit): View {
    const build = this.cfg.battle.decks[u.team][u.card].build;
    const L = layoutUnit(build, this.k)!;
    const air = u.stats.move === 'air';
    const lift = air ? 18 * (this.k / 0.36) : 0;
    const ringColor = u.team === 0 ? 0x5fd3ff : 0xff7a45;
    const ring = this.add.ellipse(0, -2, L.w * 0.95, Math.max(8, L.w * 0.26), ringColor, air ? 0.22 : 0.3).setStrokeStyle(2, ringColor, 0.9);
    const body = this.add.container(0, -lift);
    for (const p of L.parts) body.add(this.add.image(p.x, p.y, p.id).setOrigin(0, 0).setDisplaySize(p.w, p.h));
    const c = this.add.container(0, 0, [ring, body]);
    return { c, unit: u, tx: 0, ty: 0, lift, h: L.h };
  }

  private draw(b: Battle, delta: number) {
    const g = this.fxG; g.clear();
    const dt = delta / 1000;
    // 기지
    for (const team of [1, 0] as const) {
      const y = this.baseY(team), w = this.W * 0.9, h = 34;
      const mine = team === 0;
      this.baseFlash[team] = Math.max(0, this.baseFlash[team] - dt * 4);
      g.fillStyle(mine ? 0x10303a : 0x3a1a16, 0.92); g.fillRoundedRect(this.W / 2 - w / 2, y - h / 2, w, h, 8);
      g.lineStyle(2, mine ? 0x5fd3ff : 0xff7a45, 0.95); g.strokeRoundedRect(this.W / 2 - w / 2, y - h / 2, w, h, 8);
      const hpw = (w - 16) * Math.max(0, b.baseHp[team] / BASE_HP);
      g.fillStyle(mine ? 0x5fd3ff : 0xff7a45, 0.85); g.fillRoundedRect(this.W / 2 - w / 2 + 8, y - 5, hpw, 10, 4);
      if (this.baseFlash[team] > 0) { g.fillStyle(0xffffff, 0.5 * this.baseFlash[team]); g.fillRoundedRect(this.W / 2 - w / 2, y - h / 2, w, h, 8); }
    }
    // 중앙 거점
    const px = this.laneX(POINT_LANE), py = this.posToY(POINT_POS), rx = this.W / LANES * 0.4, ry = (POINT_RADIUS / 100) * (this.y1 - this.y0);
    this.pointPulse = Math.max(0, this.pointPulse - dt * 2);
    const ctl = b.controller;
    const col = ctl === 0 ? 0x5fd3ff : ctl === 1 ? 0xff7a45 : 0x8aa2c8;
    g.fillStyle(col, ctl === -1 ? 0.12 : 0.28 + 0.2 * this.pointPulse); g.fillEllipse(px, py, rx * 2, ry * 2);
    g.lineStyle(2, col, 0.9); g.strokeEllipse(px, py, rx * 2, ry * 2);
    for (const t of [0, 1] as const) {
      const p = b.pointTimer[t] / POINT_CAPTURE_SEC;
      if (p > 0 && p < 1) { g.lineStyle(4, t === 0 ? 0x5fd3ff : 0xff7a45, 0.9); g.beginPath(); g.arc(px, py, Math.min(rx, 22), -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2); g.strokePath(); }
    }
    // 체력 막대
    for (const v of this.views.values()) {
      const w = 30 * (this.k / 0.36), x = v.c.x - w / 2, y = v.c.y - v.h - v.lift - 6;
      g.fillStyle(0x000000, 0.6); g.fillRect(x - 1, y - 1, w + 2, 6);
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
        g.lineStyle(f.r, f.color, 1 - p * 0.6); g.lineBetween(f.x1 + (hx - f.x1) * 0.35, f.y1 + (hy - f.y1) * 0.35, hx, hy);
      } else if (f.kind === 'blast') {
        g.fillStyle(f.color, 0.6 * (1 - p)); g.fillCircle(f.x2, f.y2, f.r * (0.4 + p));
      } else if (f.kind === 'puff') {
        for (let k = 0; k < 5; k++) { const a = k * 1.26 + 0.4, d = f.r * p; g.fillStyle(f.color, 0.7 * (1 - p)); g.fillCircle(f.x2 + Math.cos(a) * d, f.y2 + Math.sin(a) * d * 0.8, 6 * (1 - p) + 2); }
        g.fillStyle(0xfff2cc, 0.8 * (1 - p)); g.fillCircle(f.x2, f.y2, 14 * (1 - p));
      } else {
        g.lineStyle(3, f.color, 1 - p); g.strokeCircle(f.x2, f.y2, f.r * (0.3 + p));
      }
    }
  }
}
