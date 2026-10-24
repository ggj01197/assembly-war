import Phaser from 'phaser';
import { TICK_HZ, ARENA_W, ARENA_H, RIVER_Y0, RIVER_Y1, BRIDGE_X, BRIDGE_HALF, SIDES, TOWER_R, BASE_R, BOMB_RADIUS, towerPos, basePos, POCKET_DEPTH, type Battle, type BattleEvent, type Unit } from '../../domain/battle/sim';
import { layoutUnit, spriteUrl, spriteUrlBack, spriteSize, spriteSizeBack } from '../unitLayout';
import animFrames from '../../data/anim-frames.json';
import { PARTS } from '../../data/parts';
import { play, playMusic, buzz } from '../../native/audio';
import type { BattleHud, DragPhase } from '../../ui/battleHud';
import { skillById, heroById, HERO_WATT } from '../../domain/loadout';
import { bossById } from '../../data/bosses';
import { moduleById } from '../../domain/modules';
import type { Stage } from '../../data/stages';

/**
 * 전장(세로, 클래시 로얄식 2D 아레나): 아래(내 진영)에서 위(적 진영)로. 가운데 강(물)과 두 다리, 양옆 두 갈래 길.
 * 규칙은 전부 `Battle`(domain)이 하고 이 씬은 그리기·연출·입력만 한다. 내 유닛은 뒷모습, 적 유닛은 앞모습으로 그린다.
 * 카드를 끌어다(또는 누른 뒤 눌러) 내 진영 어디든 놓을 수 있고, 놓는 동안 사거리(실선)·인식 거리(점선)가 보인다.
 */
/** 전투 화면이 쓰는 HUD 의 최소 모양 (일반 전투 HUD 와 조립 런 HUD 가 같이 쓴다) */
export type BattleHudLike = Pick<BattleHud, 'setup' | 'metrics' | 'update' | 'toast' | 'combo' | 'bossBanner' | 'showOffer' | 'offering' | 'hide'>;
/** hud 는 BattleHudLike. speed: 배속(1·2), skip: 건너뛰기(조립 런 자동 전투) */
export interface BattleConfig { stage: Stage; battle: Battle; hud: BattleHudLike; reducedMotion: boolean; onEnd(b: Battle): void; onQuit(): void; speed?: () => number; skip?: () => boolean }

type Move = 'walk' | 'wheel' | 'track' | 'hover' | 'fly';
interface View {
  c: Phaser.GameObjects.Container; rig: Phaser.GameObjects.Container; legsC: Phaser.GameObjects.Container; upper: Phaser.GameObjects.Container; weaponC: Phaser.GameObjects.Container; hip: { x: number; y: number };
  shadow: Phaser.GameObjects.Ellipse; imgs: Phaser.GameObjects.Image[];
  unit: Unit; w: number; h: number; lift: number; kind: Move; face: 1 | -1; flip: number;
  ph: number; mv: number; born: number; landed: boolean; recoil: number; lunge: number; flash: number; hpShow: number; shake: number;
  lastX: number; lastY: number; foot: number; dying: number; tinted: boolean; lastHp: number; recoilK?: number; k: number; hero: boolean; atkT: number; atkW: number;
  /** 조준 각(라디안)·옆으로 가는 속도·맞은 방향과 세기·무기 계열·무기 휘두름 */
  aim: number; vx: number; hit: number; hitX: number; hitY: number; fam: string; swing: number;
  /** 동작 그림이 있는 다리·무기 이미지 (없으면 null) 와 지금 칸 */
  legImg: Phaser.GameObjects.Image | null; legImg2: Phaser.GameObjects.Image | null; legP: number; wpnImg: Phaser.GameObjects.Image | null; legF: number; wpnF: number; flashAt: number;
}
type FxKind = 'tracer' | 'blast' | 'puff' | 'ring' | 'flash' | 'spark' | 'dust' | 'debris' | 'proj' | 'beam' | 'img';
/** key: 스프라이트(투사체·효과), arc: 포물선 높이(px), rot: 회전, img: 만들어진 그림(끝나면 지운다) */
interface Fx { kind: FxKind; x1: number; y1: number; x2: number; y2: number; t: number; dur: number; color: number; r: number; key?: string; arc?: number; rot?: number; add?: boolean; w1?: number; img?: Phaser.GameObjects.Image; img2?: Phaser.GameObjects.Image }

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
/** 무기 계열별 투사체: 스프라이트·비행 시간·포물선(거리 대비)·굵기(px, 화면 폭 390 기준)·연발 수 */
const PROJ: Record<string, { key: string; dur: number; arc: number; w: number; count: number }> = {
  gatling: { key: 'pj_bullet', dur: 0.11, arc: 0, w: 34, count: 2 },
  cannon: { key: 'pj_shell', dur: 0.26, arc: 0.12, w: 38, count: 1 },
  missile: { key: 'pj_missile', dur: 0.36, arc: 0.1, w: 46, count: 1 },
  flak: { key: 'pj_flak', dur: 0.2, arc: 0.04, w: 34, count: 1 },
  mortar: { key: 'pj_shell', dur: 0.55, arc: 0.55, w: 34, count: 1 },
  repair: { key: 'pj_plasma', dur: 0.26, arc: 0.08, w: 30, count: 1 },
};
/** Codex 가 그린 부품 동작 그림(4프레임 가로 시트): 부품id → {여백, 있는 면}. 텍스처 키 'an_'+(뒷모습이면 'b_')+id, 프레임 f0~f3 */
const ANIM = animFrames as unknown as Record<string, { m: [number, number, number]; sides: ('front' | 'back')[] }>;
const FX_KEYS = ['fx_explosion', 'fx_smoke', 'fx_spark', 'fx_energy', 'fx_slash', 'fx_muzzle', 'fx_heal', 'fx_ring', 'fx_shield', 'pj_bullet', 'pj_missile', 'pj_shell', 'pj_laser', 'pj_flak', 'pj_plasma'];
const MAIN_STATES = ['ok', 'hurt', 'dead', 'fire'];
const MAIN_KEYS = ['f', 'b'].flatMap(sd => MAIN_STATES.map(st => `main_${sd}_${st}`));   // 메인 타워(기지) 전용 건물 그림
const TOWER_KEYS = ['tower_f_ok', 'tower_f_hurt', 'tower_f_dead', 'tower_b_ok', 'tower_b_hurt', 'tower_b_dead'];
const TRAY_H = 176;     // CSS 와 같아야 한다 (battle .bt-tray)
const TOP_H = 84;       // 위 막대·타이머
const FAR_SCALE = 0.8;  // 먼 곳(적 진영) 유닛 크기 비율 — 원근
const NEAR_W = 0.98, FAR_W = 0.9;   // 화면 폭 대비 아레나 폭: 아래(내 쪽)·위(적 쪽)

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function moveKind(legsId: string, air: boolean): Move {
  if (air) return 'fly';
  if (legsId.includes('hover')) return 'hover';
  if (legsId.includes('track')) return 'track';
  if (legsId.includes('wheel')) return 'wheel';
  return 'walk';
}

interface Proj { x: number; y: number; s: number; t: number }

export class BattleScene extends Phaser.Scene {
  private cfg!: BattleConfig;
  private views = new Map<number, View>();
  private ghosts: View[] = [];
  private fx: Fx[] = [];
  private fxG!: Phaser.GameObjects.Graphics;
  private laneG!: Phaser.GameObjects.Graphics;
  private groundG!: Phaser.GameObjects.Graphics;
  /** 메인 타워 체력 문·포탑 체력 막대: 유닛·건물 그림 위에 */
  private plateG!: Phaser.GameObjects.Graphics;
  private arenaG!: Phaser.GameObjects.Graphics;
  private waterG!: Phaser.GameObjects.Graphics;
  private bridgeG!: Phaser.GameObjects.Graphics;
  private acc = 0;
  private selected: number | null = null;
  private selSkill: number | null = null;
  private selHero = false;
  private ended = false;
  private baseFlash: [number, number] = [0, 0];
  /** 메인 타워 건물 바로 아래(체력 문 자리)의 화면 y — 건물 그림 높이에 따라 매 프레임 갱신 */
  private basePlateY: [number, number] = [0, 0];
  /** 조립 런 자동 전투: 아레나의 한가운데(아래 보이는 창)만 크게 보여 준다 */
  private skirm = false; private vx0 = 0; private vx1 = ARENA_W; private vy0 = 0; private vy1 = ARENA_H;
  private fxK = 0.6; private W = 390; private H = 844; private y0 = 130; private y1 = 600; private k = 0.6;
  private firstSpawnHinted = false;
  private wattFull = false;
  private dead = false;
  /** 포인터가 가리키는 아레나 좌표(타일)와 놓을 수 있는 자리인지 */
  private hover: { x: number; y: number } | null = null;
  private bossText: Phaser.GameObjects.Text | null = null;
  private baseTxt: [Phaser.GameObjects.Text | null, Phaser.GameObjects.Text | null] = [null, null];
  private motes: { x: number; y: number; v: number; s: number }[] = [];
  private towerImgs: Phaser.GameObjects.Image[][] = [[], []];
  private towerKick: number[][] = [[0, 0, 0], [0, 0, 0]]; private towerFlash: number[][] = [[0, 0, 0], [0, 0, 0]]; private towerSmoke = 0;
  private numbers = new Map<string, { acc: number; t: number; x: number; y: number; color: number; heal: boolean }>();
  private drag: { card: number; ghost: Phaser.GameObjects.Container } | null = null;

  constructor() { super('battle'); }

  init(cfg: BattleConfig) {
    this.cfg = cfg; this.views.clear(); this.ghosts = []; this.fx = []; this.acc = 0; this.selected = null; this.selSkill = null; this.selHero = false; this.ended = false;
    this.baseFlash = [0, 0]; this.firstSpawnHinted = !!cfg.battle.skirmishMode; this.wattFull = false; this.dead = false; this.hover = null; this.bossText = null; this.baseTxt = [null, null];
    this.towerImgs = [[], []]; this.basePlateY = [0, 0]; this.towerKick = [[0, 0, 0], [0, 0, 0]]; this.towerFlash = [[0, 0, 0], [0, 0, 0]]; this.towerSmoke = 0; this.numbers = new Map(); this.drag = null;
  }

  preload() {
    for (const p of PARTS) {
      if (p.kind === 'accessory') continue;
      if (!this.textures.exists(p.id)) this.load.image(p.id, spriteUrl(p.id));
      if (!this.textures.exists('b_' + p.id)) this.load.image('b_' + p.id, spriteUrlBack(p.id));
    }
    // 동작 그림은 이번 전투에 나오는 부품 것만 불러온다 (전부 25MB)
    const need = new Set<string>(), b0 = this.cfg.battle;
    const addB = (bd?: { legs: string; weapon: string }) => { if (bd) { need.add(bd.legs); need.add(bd.weapon); } };
    for (const t of [0, 1] as const) { for (const c of b0.decks[t]) addB(c.build); addB(b0.hero[t]?.def.build); }
    addB(b0.bossDef?.build);
    for (const [pid, info] of Object.entries(ANIM)) if (need.has(pid)) for (const side of info.sides) { const key = 'an_' + (side === 'back' ? 'b_' : '') + pid; if (!this.textures.exists(key)) this.load.image(key, `sprites/anim/${pid}_${side}.png`); }
    for (const k of FX_KEYS) if (!this.textures.exists(k)) this.load.image(k, `sprites/fx/${k}.png`);
    for (const k of [...TOWER_KEYS, ...MAIN_KEYS]) if (!this.textures.exists(k)) this.load.image(k, `sprites/tower/${k}.png`);
    this.load.on('loaderror', () => { /* 뒷모습이 없으면 앞모습으로 대신한다 (layoutUnit) */ });
  }

  create() {
    this.registerAnimFrames();
    this.cfg.hud.setup(this.cfg.stage, this.cfg.battle, {
      onSelect: i => { this.selected = this.selected === i ? null : i; this.selSkill = null; this.selHero = false; },
      onDrag: (ph, card, x, y) => this.onDrag(ph, card, x, y),
      onSkill: slot => this.pickSkill(slot), onHero: () => this.pickHero(), onHeroSkill: () => this.heroSkill(),
      onQuit: () => { if (!this.ended) { this.ended = true; this.cfg.onQuit(); } },
    });
    this.layout();
    this.arenaG = this.add.graphics().setDepth(-6);
    this.waterG = this.add.graphics().setDepth(-5);
    this.bridgeG = this.add.graphics().setDepth(-4);
    this.laneG = this.add.graphics().setDepth(5);
    this.groundG = this.add.graphics().setDepth(6);
    this.plateG = this.add.graphics().setDepth(90000);
    this.fxG = this.add.graphics().setDepth(100000);
    this.scale.on('resize', this.onResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { this.dead = true; this.scale.off('resize', this.onResize, this); });
    this.drawStatic();
    this.buildTowers();
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onTap(p.worldX, p.worldY));
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => { if (!this.drag) this.hover = this.unproj(p.worldX, p.worldY); });
    for (let i = 0; i < 14; i++) this.motes.push({ x: Math.random(), y: Math.random(), v: 0.012 + Math.random() * 0.02, s: 0.6 + Math.random() * 1.4 });
    if (!this.cfg.reducedMotion) {
      // 입장 연출: 어둠에서 밝아지며 살짝 당겨졌다 물러난다
      this.cameras.main.fadeIn(420, 7, 13, 22);
      this.cameras.main.setZoom(1.07);
      this.tweens.add({ targets: this.cameras.main, zoom: 1, duration: 950, ease: 'Cubic.out' });
    }
  }

  /** 맞았을 때 하얗게 번쩍: 연사에 맞아도 계속 하얗지 않게 0.3초에 한 번만 */
  private flashView(v: View) { const now = this.time.now / 1000; if (now - v.flashAt > 0.3) { v.flash = 0.55; v.flashAt = now; } }

  /** 4프레임 시트를 칸(f0~f3)으로 나눈다 */
  private registerAnimFrames() {
    for (const [pid, info] of Object.entries(ANIM)) for (const side of info.sides) {
      const back = side === 'back', key = 'an_' + (back ? 'b_' : '') + pid;
      if (!this.textures.exists(key)) continue;
      const tex = this.textures.get(key); if (tex.has('f0')) continue;
      const sz = (back ? spriteSizeBack : spriteSize)[pid]; if (!sz) continue;
      const tw = sz.w + 2 * info.m[0], th = sz.h + info.m[1] + info.m[2];
      for (let i = 0; i < 4; i++) tex.add('f' + i, 0, i * tw, 0, tw, th);
    }
  }

  // ───────── 배치·원근 ─────────
  private layout() {
    this.W = this.scale.width; this.H = this.scale.height;
    const m = this.cfg.hud.metrics();
    // 화면 전체를 쓴다: 위쪽 HUD(나가기·시간)는 모서리에 겹쳐 있고, 바닥은 맨 위·맨 아래까지 이어진다
    this.skirm = !!this.cfg.battle.skirmishMode;
    if (this.skirm) {
      // 자동 전투: x 3.5~14.5 · y 1.5~13.5 만 보이게 크게 (유닛이 화면의 큰 부분을 차지한다)
      this.vx0 = 3.5; this.vx1 = 14.5; this.vy0 = 1.5; this.vy1 = 13.5;
      this.y0 = (m.top || TOP_H) + 60; this.y1 = this.H - (m.tray || 90) - 10;
      this.k = clamp(0.62 * (this.W / 390), 0.42, 0.95);
    } else {
      this.vx0 = 0; this.vx1 = ARENA_W; this.vy0 = 0; this.vy1 = ARENA_H;
      this.y0 = (m.top || TOP_H) + 46;                 // 적 쪽 끝(y = ARENA_H) — 적 메인 타워 그림이 화면 위로 안 나갈 만큼만 남긴다
      this.y1 = this.H - (m.tray || TRAY_H) + 6;       // 내 쪽 끝(y = 0) — 카드 줄 바로 위
      this.k = clamp(0.36 * (this.W / 390), 0.26, 0.56);
    }
    this.fxK = this.k / 0.6;                         // 효과 크기 (유닛 크기에 비례)
  }
  private onResize() { this.layout(); this.drawStatic(); this.buildTowers(); }
  private tOfY = (y: number) => (y - this.vy0) / (this.vy1 - this.vy0);   // 아레나 밖(바닥 연장부)도 같은 비율로 이어진다
  private widthAt(t: number) { return lerp(this.W * NEAR_W, this.W * FAR_W, t); }
  private scaleAt(t: number) { return lerp(1, FAR_SCALE, t); }
  /** 타일 → 화면 */
  private proj(x: number, y: number): Proj { const t = this.tOfY(y); return { x: this.W / 2 + ((x - (this.vx0 + this.vx1) / 2) / (this.vx1 - this.vx0)) * this.widthAt(t), y: lerp(this.y1, this.y0, t), s: this.scaleAt(t), t }; }
  /** 화면 → 타일 */
  private unproj(sx: number, sy: number): { x: number; y: number } {
    const t = clamp((this.y1 - sy) / (this.y1 - this.y0), 0, 1);
    return { x: (this.vx0 + this.vx1) / 2 + ((sx - this.W / 2) / this.widthAt(t)) * (this.vx1 - this.vx0), y: this.vy0 + t * (this.vy1 - this.vy0) };
  }
  /** 타일 한 칸의 화면 크기 (가로는 깊이에 따라, 세로는 일정) */
  private pxX(t: number) { return this.widthAt(t) / (this.vx1 - this.vx0); }
  private get pxY() { return (this.y1 - this.y0) / (this.vy1 - this.vy0); }
  private pt(...xy: [number, number][]): Phaser.Geom.Point[] { return xy.map(([x, y]) => { const p = this.proj(x, y); return new Phaser.Geom.Point(p.x, p.y); }); }

  private drawStatic() {
    this.children.getAll().filter(o => (o as Phaser.GameObjects.GameObject).name === 'bg').forEach(o => o.destroy());
    this.add.rectangle(this.W / 2, this.H / 2, this.W, this.H, 0x070d16, 1).setName('bg').setDepth(-20);
    const g = this.arenaG; g.clear();
    if (this.skirm) { this.drawSkirmFloor(g); this.addVignette(); return; }
    // 바닥: 깊이마다 살짝 다른 어두운 금속색 띠 + 패널 이음선
    const EXT = 9;   // 아레나 위·아래로 바닥을 이어 화면 맨 위·맨 아래까지 채운다
    for (let i = -EXT; i < ARENA_H + EXT; i++) {
      const mine = i < ARENA_H / 2, a = 0.55 + 0.3 * ((i % 2) as number), out = i < 0 || i >= ARENA_H;
      const c = mine ? (i % 2 ? 0x10243a : 0x0d1e33) : (i % 2 ? 0x2a1a1c : 0x241619);
      g.fillStyle(c, (a + 0.2) * (out ? 0.7 : 1)); g.fillPoints(this.pt([0, i], [ARENA_W, i], [ARENA_W, i + 1], [0, i + 1]), true);
    }
    g.lineStyle(1, 0x7fb2e0, 0.1);
    for (let x = 0; x <= ARENA_W; x += 2) { const a = this.proj(x, -EXT), b = this.proj(x, ARENA_H + EXT); g.lineBetween(a.x, a.y, b.x, b.y); }
    for (let y = -EXT; y <= ARENA_H + EXT; y += 2) { const a = this.proj(0, y), b = this.proj(ARENA_W, y); g.lineBetween(a.x, a.y, b.x, b.y); }
    // 양쪽 벽
    for (const sx of [-1, 1]) {
      const x0 = sx < 0 ? -1.6 : ARENA_W, x1 = sx < 0 ? 0 : ARENA_W + 1.6;
      g.fillStyle(0x070f1b, 0.95); g.fillPoints(this.pt([x0, -EXT], [x1, -EXT], [x1, ARENA_H + EXT], [x0, ARENA_H + EXT]), true);
      const e = sx < 0 ? 0 : ARENA_W;
      g.lineStyle(3, 0x5fd3ff, 0.55); const a = this.proj(e, 0), b = this.proj(e, RIVER_Y0 - 0.2); g.lineBetween(a.x, a.y, b.x, b.y);
      g.lineStyle(3, 0xff7a45, 0.55); const c = this.proj(e, RIVER_Y1 + 0.2), d = this.proj(e, ARENA_H); g.lineBetween(c.x, c.y, d.x, d.y);
    }
    // 길(빛 띠): 두 다리 쪽으로 이어지는 길을 은은히 표시
    for (const bx of BRIDGE_X) {
      for (const [ya, yb, col] of [[3.2, RIVER_Y0 - 0.3, 0x5fd3ff], [RIVER_Y1 + 0.3, ARENA_H - 3.2, 0xff9f43]] as [number, number, number][]) {
        for (const off of [-BRIDGE_HALF, BRIDGE_HALF]) {
          g.lineStyle(3, col, 0.1); const a = this.proj(bx + off, ya), b = this.proj(bx + off, yb); g.lineBetween(a.x, a.y, b.x, b.y);
          g.lineStyle(1.5, col, 0.45); g.lineBetween(a.x, a.y, b.x, b.y);
        }
        g.fillStyle(col, 0.04); g.fillPoints(this.pt([bx - BRIDGE_HALF, ya], [bx + BRIDGE_HALF, ya], [bx + BRIDGE_HALF, yb], [bx - BRIDGE_HALF, yb]), true);
      }
    }
    // 기지·포탑 발판
    for (const team of [0, 1] as const) {
      const col = team === 0 ? 0x5fd3ff : 0xff7a45;
      const pads: { x: number; y: number; r: number }[] = [{ ...basePos(team), r: BASE_R + 0.7 }, ...[0, 1].map(s => ({ ...towerPos(team, s), r: TOWER_R + 0.6 }))];
      for (const p of pads) { const q = this.proj(p.x, p.y); g.fillStyle(0x05080e, 0.55); g.fillEllipse(q.x, q.y, p.r * 2 * this.pxX(q.t), p.r * 2 * this.pxY); g.lineStyle(2, col, 0.5); g.strokeEllipse(q.x, q.y, p.r * 2 * this.pxX(q.t), p.r * 2 * this.pxY); }
    }
    // 다리
    const br = this.bridgeG; br.clear();
    for (const bx of BRIDGE_X) {
      const hw = BRIDGE_HALF + 0.25;
      br.fillStyle(0x1b2a3f, 1); br.fillPoints(this.pt([bx - hw, RIVER_Y0 - 0.35], [bx + hw, RIVER_Y0 - 0.35], [bx + hw, RIVER_Y1 + 0.35], [bx - hw, RIVER_Y1 + 0.35]), true);
      br.fillStyle(0x2a3d58, 1); br.fillPoints(this.pt([bx - hw + 0.25, RIVER_Y0 - 0.2], [bx + hw - 0.25, RIVER_Y0 - 0.2], [bx + hw - 0.25, RIVER_Y1 + 0.2], [bx - hw + 0.25, RIVER_Y1 + 0.2]), true);
      br.lineStyle(1, 0x0b1624, 0.8);
      for (let y = RIVER_Y0; y <= RIVER_Y1; y += 0.6) { const a = this.proj(bx - hw + 0.25, y), b = this.proj(bx + hw - 0.25, y); br.lineBetween(a.x, a.y, b.x, b.y); }
      for (const off of [-hw, hw]) { br.lineStyle(3, 0x5fd3ff, 0.8); const a = this.proj(bx + off, RIVER_Y0 - 0.35), b = this.proj(bx + off, RIVER_Y1 + 0.35); br.lineBetween(a.x, a.y, b.x, b.y); }
    }
    this.addVignette();
  }

  /** 가장자리 어둡게 (집중 + 위계) */
  private addVignette() {
    if (this.textures.exists('vignette')) this.textures.remove('vignette');
    const ct = this.textures.createCanvas('vignette', 256, 512)!;
    const cx = ct.getContext();
    const gr = cx.createRadialGradient(128, 256, 120, 128, 256, 330);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.62)');
    cx.fillStyle = gr; cx.fillRect(0, 0, 256, 512); ct.refresh();
    this.add.image(this.W / 2, this.H / 2, 'vignette').setDisplaySize(this.W, this.H).setName('bg').setDepth(99999);
  }

  /** 조립 런 자동 전투의 바닥: 양 진영 띠 + 가운데 전선, 벽 없이 화면 가득 */
  private drawSkirmFloor(g: Phaser.GameObjects.Graphics) {
    for (let i = -12; i < 28; i++) {
      const mine = i + 0.5 < 7.5, c = mine ? (i % 2 ? 0x10243a : 0x0d1e33) : (i % 2 ? 0x2a1a1c : 0x241619);
      g.fillStyle(c, 0.95); g.fillPoints(this.pt([-6, i], [ARENA_W + 6, i], [ARENA_W + 6, i + 1], [-6, i + 1]), true);
    }
    g.lineStyle(1, 0x7fb2e0, 0.12);
    for (let x = -6; x <= ARENA_W + 6; x += 2) { const a = this.proj(x, -12), b2 = this.proj(x, 28); g.lineBetween(a.x, a.y, b2.x, b2.y); }
    for (let y = -12; y <= 28; y += 2) { const a = this.proj(-6, y), b2 = this.proj(ARENA_W + 6, y); g.lineBetween(a.x, a.y, b2.x, b2.y); }
    // 전선(가운데): 빛 띠
    const l1 = this.proj(-6, 7.5), l2 = this.proj(ARENA_W + 6, 7.5);
    g.lineStyle(10, 0x5fd3ff, 0.07); g.lineBetween(l1.x, l1.y, l2.x, l2.y); g.lineStyle(2, 0xffd067, 0.5); g.lineBetween(l1.x, l1.y, l2.x, l2.y);
    // 배치 칸 표시(옅게): 앞줄·뒷줄
    for (const [y, col] of [[3.6, 0x5fd3ff], [6.4, 0x5fd3ff], [8.6, 0xff7a45], [11.4, 0xff7a45]] as [number, number][]) { const a = this.proj(4.5, y), b2 = this.proj(13.5, y); g.lineStyle(1.5, col, 0.16); g.lineBetween(a.x, a.y, b2.x, b2.y); }
  }

  /** 강: 물결이 흘러가는 모습 (매 프레임) */
  private drawWater(now: number) {
    if (this.skirm) { this.waterG.clear(); this.bridgeG.clear(); return; }
    const g = this.waterG; g.clear();
    g.fillStyle(0x0a2d44, 1); g.fillPoints(this.pt([-0.2, RIVER_Y0], [ARENA_W + 0.2, RIVER_Y0], [ARENA_W + 0.2, RIVER_Y1], [-0.2, RIVER_Y1]), true);
    g.fillStyle(0x0f4766, 0.7); g.fillPoints(this.pt([-0.2, RIVER_Y0 + 0.5], [ARENA_W + 0.2, RIVER_Y0 + 0.5], [ARENA_W + 0.2, RIVER_Y1 - 0.5], [-0.2, RIVER_Y1 - 0.5]), true);
    const N = 7;
    for (let i = 0; i < N; i++) {
      const yy = RIVER_Y0 + 0.35 + (i / (N - 1)) * (RIVER_Y1 - RIVER_Y0 - 0.7);
      g.lineStyle(2, i % 2 ? 0x6fd0ff : 0x3fa6d6, 0.38);
      g.beginPath();
      for (let k = 0; k <= 28; k++) {
        const x = (k / 28) * ARENA_W, wy = yy + Math.sin(now * 1.6 + k * 0.55 + i * 1.7) * 0.18, p = this.proj(x, wy);
        if (k === 0) g.moveTo(p.x, p.y); else g.lineTo(p.x, p.y);
      }
      g.strokePath();
    }
    for (const yy of [RIVER_Y0, RIVER_Y1]) { g.lineStyle(3, 0x5fd3ff, 0.55 + 0.15 * Math.sin(now * 2)); const a = this.proj(-0.2, yy), b = this.proj(ARENA_W + 0.2, yy); g.lineBetween(a.x, a.y, b.x, b.y); }
  }

  // ───────── 포탑 (길마다 양쪽 1기) ─────────
  /** 포탑 자리 (side −1·SIDES = 메인 타워=기지) */
  private towerXY(team: 0 | 1, side: number) { const p = side < 0 || side >= SIDES ? basePos(team) : towerPos(team, side), q = this.proj(p.x, p.y); return { x: q.x, y: q.y, s: q.s }; }
  private buildTowers() {
    for (const row of this.towerImgs) for (const im of row) im.destroy();
    this.towerImgs = [[], []];
    for (const team of [0, 1] as const) for (let l = 0; l <= SIDES; l++) {   // 마지막 칸 = 메인 타워(기지)
      const im = this.add.image(0, 0, team === 0 ? 'tower_b_ok' : 'tower_f_ok').setOrigin(0.5, 0.88);
      this.towerImgs[team].push(im);
    }
  }
  private syncTowers(b: Battle, dt: number) {
    if (this.skirm) { for (const row of this.towerImgs) for (const im of row) im.setVisible(false); return; }
    const gg = this.plateG;
    for (const team of [0, 1] as const) for (let l = 0; l <= SIDES; l++) {
      const im = this.towerImgs[team][l]; if (!im) continue;
      const isBase = l === SIDES;
      if (!isBase && !b.towersOn) { im.setVisible(false); continue; }
      const hp = isBase ? b.baseHp[team] : b.towers[team][l].hp, maxHp = isBase ? 1000 : b.towers[team][l].maxHp, f = hp / maxHp, pre = team === 0 ? 'tower_b_' : 'tower_f_';
      this.towerKick[team][l] = Math.max(0, this.towerKick[team][l] - dt * 7); this.towerFlash[team][l] = Math.max(0, this.towerFlash[team][l] - dt * 8);
      const kick = this.cfg.reducedMotion ? 0 : this.towerKick[team][l];
      // 메인 타워는 사이드 포탑과 다른 전용 건물 그림(있으면): 멀쩡·손상·파괴, 쏜 직후에는 발사 장면
      const mainPre = `main_${team === 0 ? 'b' : 'f'}_`, useMain = isBase && this.textures.exists(mainPre + 'ok');
      const state = hp <= 0 ? 'dead' : useMain && kick > 0.45 ? 'fire' : f < 0.45 ? 'hurt' : 'ok';
      const key = (useMain ? mainPre : pre) + state;
      if (im.texture.key !== key) im.setTexture(key);
      const { x, y, s } = this.towerXY(team, l), okW = this.textures.get((useMain ? mainPre : pre) + 'ok').getSourceImage().width;
      const dw = this.W * (isBase ? (useMain ? 0.36 : 0.3) : 0.17) * s, k = dw / okW, src = im.texture.getSourceImage();
      if (isBase) this.basePlateY[team] = y + src.height * k * 0.12 + 14 * s;   // 체력 문은 건물 그림 아래에 따로
      im.setPosition(x, y + kick * 4 * s * (team === 0 ? 1 : -1)).setDisplaySize(src.width * k * (1 + kick * 0.04), src.height * k * (1 - kick * 0.03)).setDepth(y).setVisible(true);
      if (this.towerFlash[team][l] > 0.3 && hp > 0) im.setTintFill(0xffffff); else im.clearTint();
      if (!isBase && hp > 0 && f < 1) {
        const w = dw * 0.95, bx = x - w / 2, by = y - src.height * k * 0.88 - 8 * s;
        gg.fillStyle(0x000000, 0.65); gg.fillRect(bx - 1, by - 1, w + 2, 6);
        gg.fillStyle(team === 0 ? 0x5fd3ff : 0xff7a45, 1); gg.fillRect(bx, by, w * f, 4);
      }
      if (hp <= 0 && !this.cfg.reducedMotion) {
        this.towerSmoke -= dt;
        if (this.towerSmoke <= 0 && this.fx.length < 100) { this.towerSmoke = 0.35; this.fx.push({ kind: 'img', key: 'fx_smoke', x1: 0, y1: 0, x2: x + (Math.random() - 0.5) * 16 * s, y2: y - 24 * s, t: 0, dur: 1.2, color: 0xffffff, r: 18 * s, w1: 42 * s }); }
      }
    }
  }

  // ───────── 피해 숫자 (같은 대상은 0.35초 단위로 모아서) ─────────
  private addNumber(key: string, x: number, y: number, v: number, color: number, heal = false) {
    const e = this.numbers.get(key);
    if (e) { e.acc += v; e.x = x; e.y = y; } else this.numbers.set(key, { acc: v, t: 0.05, x, y, color, heal });
  }
  private tickNumbers(dt: number) {
    for (const [k, e] of this.numbers) {
      e.t -= dt; if (e.t > 0) continue;
      if (e.acc >= 1) {
        const txt = this.add.text(e.x + (Math.random() - 0.5) * 10, e.y, (e.heal ? '+' : '') + Math.round(e.acc), { fontFamily: 'Black Han Sans, Noto Sans KR, sans-serif', fontSize: e.acc >= 40 ? '19px' : '14px', color: '#' + e.color.toString(16).padStart(6, '0'), stroke: '#000', strokeThickness: 3 }).setOrigin(0.5).setDepth(100002);
        this.tweens.add({ targets: txt, y: e.y - 30, alpha: 0, duration: 650, ease: 'Cubic.out', onComplete: () => txt.destroy() });
      }
      this.numbers.delete(k);
    }
  }

  // ───────── 카드 끌어다 놓기 (클래시 로얄식) ─────────
  private toWorld(cx: number, cy: number) { const r = this.game.canvas.getBoundingClientRect(); return { x: (cx - r.left) * (this.W / r.width), y: (cy - r.top) * (this.H / r.height) }; }
  private whyNot(b: Battle, card: number, ax: number, ay: number): string | null {
    if (b.costOf(0, card) > b.watt[0]) return '와트가 부족해요. 조금 기다리세요.';
    if (!b.canDeploy(0, ax, ay)) return ay > RIVER_Y0 ? `내 진영(강 아래쪽)에만 놓을 수 있어요.${b.towersOn && !b.survival && b.towers[1].some(t => t.hp <= 0) ? ' 부순 포탑 쪽 파란 칸(포켓)에도 놓을 수 있어요.' : ''}` : '여기에는 놓을 수 없어요. (포탑·기지·벽 근처)';
    return '유닛이 너무 많아요.';
  }
  private onDrag(ph: DragPhase, card: number, cx: number, cy: number) {
    if (this.ended || this.skirm) return;
    const b = this.cfg.battle, hud = this.cfg.hud, { x, y } = this.toWorld(cx, cy);
    if (ph === 'start') {
      this.clearSel(); this.selected = card;
      const build = b.decks[0][card].build, L = layoutUnit(build, this.k, true);
      const c = this.add.container(x, y).setDepth(100500).setAlpha(0.75);
      if (L) for (const part of L.parts) c.add(this.add.image(part.x, part.y, this.textures.exists(part.tex) ? part.tex : part.id).setOrigin(0, 0).setDisplaySize(part.w, part.h));
      this.drag = { card, ghost: c };
      this.hover = this.unproj(x, y);
    } else if (this.drag) {
      this.drag.ghost.setPosition(x, y);               // 손가락 바로 위치에 놓인다 (발 위치 = 놓일 자리)
      this.hover = this.unproj(x, y);
      if (ph === 'end' || ph === 'cancel') {
        const at = this.hover; this.drag.ghost.destroy(); this.drag = null;
        if (ph === 'end' && at) {
          if (!b.spawn(0, card, at.x, at.y)) { play('deny'); hud.toast(this.whyNot(b, card, at.x, at.y)!); }
          else this.selected = null;
        }
      }
    }
  }

  // ───────── 입력 ─────────
  private clearSel() { this.selected = null; this.selSkill = null; this.selHero = false; }

  private pickSkill(slot: number) {
    if (this.ended) return;
    const b = this.cfg.battle, hud = this.cfg.hud, d = skillById(b.skillIds[0][slot] ?? ''); if (!d) return;
    const cd = b.skillCd[0][slot];
    if (cd > 0) { hud.toast(`${d.name}: 다시 쓰려면 ${Math.ceil(cd / TICK_HZ)}초`); play('deny'); return; }
    if (d.watt > b.watt[0] + 1e-9) { hud.toast('와트가 부족해요. 조금 기다리세요.'); play('deny'); return; }
    if (!d.needsLane) { this.clearSel(); if (b.castSkill(0, slot)) play('uiClick'); return; }
    const on = this.selSkill === slot; this.clearSel();
    if (!on) { this.selSkill = slot; hud.toast(`${d.name}: 적이 몰린 곳을 눌러 주세요.`); play('uiClick'); }
  }

  private pickHero() {
    if (this.ended) return;
    const b = this.cfg.battle, hud = this.cfg.hud, hs = b.hero[0]; if (!hs) return;
    const u = b.heroUnit(0);
    if (b.rule?.id === 'rl_nohero') { hud.toast('이번 작전은 영웅이 출격할 수 없어요.'); play('deny'); return; }
    if (u) { hud.toast('영웅이 이미 출격해 있어요. 오른쪽 금색 기술 버튼을 쓰세요.'); play('deny'); return; }
    if (hs.respawn > 0) { hud.toast(`${hs.def.name}: ${Math.ceil(hs.respawn / TICK_HZ)}초 뒤에 다시 출격할 수 있어요.`); play('deny'); return; }
    if (b.watt[0] + 1e-9 < HERO_WATT) { hud.toast(`영웅 출격은 와트 ${HERO_WATT} 이 필요해요.`); play('deny'); return; }
    const on = this.selHero; this.clearSel();
    if (!on) { this.selHero = true; hud.toast('영웅이 출격할 자리를 내 진영에서 눌러 주세요.'); play('uiClick'); }
  }

  private heroSkill() {
    if (this.ended) return;
    const b = this.cfg.battle, hud = this.cfg.hud, hs = b.hero[0]; if (!hs) return;
    const u = b.heroUnit(0);
    if (!u) { hud.toast('영웅이 출격해 있어야 기술을 쓸 수 있어요.'); play('deny'); return; }
    if (hs.skillCd > 0) { hud.toast(`${hs.def.skill.name}: ${Math.ceil(hs.skillCd / TICK_HZ)}초 뒤에 쓸 수 있어요.`); play('deny'); return; }
    if (!b.castHeroSkill(0)) { hud.toast('지금은 쓸 수 없어요.'); play('deny'); }
  }

  private onTap(sx: number, sy: number) {
    if (this.ended || this.skirm) return;
    const b = this.cfg.battle, hud = this.cfg.hud, at = this.unproj(sx, sy);
    this.hover = at;
    if (this.selSkill !== null) {
      if (b.castSkill(0, this.selSkill, at.x, at.y)) this.selSkill = null; else { play('deny'); hud.toast('지금은 쓸 수 없어요.'); }
      return;
    }
    if (this.selHero) {
      if (b.deployHero(0, at.x, at.y)) this.selHero = false; else { play('deny'); hud.toast(b.canDeploy(0, at.x, at.y) ? '지금은 출격할 수 없어요.' : '내 진영(강 아래쪽)의 빈 땅을 눌러 주세요.'); }
      return;
    }
    if (this.selected === null) { hud.toast('아래 카드를 먼저 눌러 고르세요. 끌어다 놓아도 돼요.'); play('deny'); return; }
    if (!b.spawn(0, this.selected, at.x, at.y)) { play('deny'); hud.toast(this.whyNot(b, this.selected, at.x, at.y)!); }
  }

  // ───────── 한 프레임 ─────────
  update(_t: number, delta: number) {
    if (!this.cfg || this.dead) return;
    const b = this.cfg.battle;
    const stepMs = 1000 / TICK_HZ;
    if (!this.ended) {
      const sp = this.cfg.speed ? this.cfg.speed() : 1;
      if (this.cfg.skip?.() && !b.over) { let n = 0; while (!b.over && n++ < 4000) b.step(); this.acc = 0; }   // 건너뛰기: 끝까지 한 번에
      this.acc += Math.min(100, delta) * sp;
      while (this.acc >= stepMs && !b.over && !b.offer) { b.step(); this.consume(b.events); this.acc -= stepMs; if (b.offer) this.openOffer(); }
      if (b.offer) { this.acc = 0; if (!this.cfg.hud.offering) this.openOffer(); }
      if (b.over) {
        this.ended = true;
        if (b.baseHp[1] <= 0 || b.baseHp[0] <= 0) { play('baseHit'); if (!this.cfg.reducedMotion) this.cameras.main.shake(260, 0.01); }
        this.time.delayedCall(1100, () => this.cfg.onEnd(b));
      }
    }
    const alpha = this.ended ? 1 : clamp(this.acc / stepMs, 0, 1);
    this.drawWater(this.time.now / 1000);
    this.sync(b, delta, alpha);
    this.draw(b, delta);
    this.syncTowers(b, delta / 1000);
    this.tickNumbers(delta / 1000);
    this.cfg.hud.update(b, { card: this.selected, skill: this.selSkill, hero: this.selHero });
    // 와트가 가득 차면(낭비되기 직전) 한 번 알려 준다
    if (b.watt[0] >= 9.99 && !this.wattFull) { this.wattFull = true; play('ready'); } else if (b.watt[0] < 9) this.wattFull = false;
  }

  /** 지휘 모듈 3택 1: 시간이 멈춘 채 고르면 다시 흐른다 */
  private openOffer() {
    const b = this.cfg.battle, o = b.offer; if (!o || this.cfg.hud.offering) return;
    this.clearSel();
    if (this.drag) { this.drag.ghost.destroy(); this.drag = null; this.hover = null; }
    play('ready');
    this.cfg.hud.showOffer(o, 12, id => { if (b.choose(0, id)) { buzz('success'); const d = moduleById(id); if (d) this.cfg.hud.toast(`${d.icon} ${d.name}: ${d.desc}`); } });
  }

  /** 유닛의 화면 좌표(발 위치)와 원근 크기. 보간 없이 틱 끝 위치 — 이벤트 연출용 */
  private posOf(id: number, b: Battle): { x: number; y: number; s: number; h: number } | null {
    const u = b.units.find(q => q.id === id);
    const v = this.views.get(id);
    if (u) { const q = this.proj(u.x, u.y); return { x: q.x, y: q.y, s: q.s, h: v ? v.h : 60 }; }
    return v ? { x: v.c.x, y: v.c.y, s: v.c.scaleX, h: v.h } : null;
  }

  private consume(evs: BattleEvent[]) {
    const b = this.cfg.battle;
    const calm = this.cfg.reducedMotion;
    for (const e of evs) {
      if (e.type === 'module') {
        if (e.team === 1) { const d = moduleById(e.id); if (d) this.cfg.hud.toast(`적이 「${d.name}」 장착`); }
        continue;
      }
      if (e.type === 'spawn') {
        const q = this.proj(e.x, e.y), x = q.x, y = q.y, s = q.s;
        const col = e.team === 0 ? 0x5fd3ff : 0xff9f43;
        this.fx.push({ kind: 'ring', x1: x, y1: y, x2: x, y2: y, t: 0, dur: 0.45, color: col, r: 32 * s });
        this.fx.push({ kind: 'ring', x1: x, y1: y, x2: x, y2: y, t: 0.12, dur: 0.4, color: 0xffffff, r: 20 * s });
        play('spawn', 90);
        if (e.team === 0 && !this.firstSpawnHinted) { this.firstSpawnHinted = true; this.cfg.hud.toast('유닛은 사거리 안의 적에게 다가가 싸우고, 없으면 길을 따라 전진합니다.'); }
      } else if (e.type === 'attack') {
        const a = this.posOf(e.from, b); if (!a) continue;
        const av = this.views.get(e.from);
        let tx: number, ty: number, ts = 1;
        const heal = e.family === 'repair';
        if (e.to !== null) {
          const t = this.posOf(e.to, b); if (!t) continue; tx = t.x; ty = t.y - t.h * 0.4 * t.s; ts = t.s;
          const tv = this.views.get(e.to);
          if (tv && !heal) { this.flashView(tv); tv.hpShow = 1.4; tv.shake = Math.max(tv.shake, 0.5); tv.hit = 1; const dx = t.x - a.x, dy = t.y - a.y, dl = Math.hypot(dx, dy) || 1; tv.hitX = dx / dl; tv.hitY = dy / dl; }
          if (e.dmg) this.addNumber('u' + e.to, tx, t.y - t.h * t.s - 10, e.dmg, heal ? 0x6fe39a : (tv && tv.unit.team === 0 ? 0xff8a6b : 0xfff3b0), heal);
        } else if (e.towerOf !== undefined) {
          const tp = this.towerXY(e.towerOf, e.side ?? 0); tx = tp.x; ty = tp.y - 30 * tp.s; ts = tp.s;
          this.towerFlash[e.towerOf][e.side ?? 0] = 1;
          if (e.dmg) this.addNumber(`t${e.towerOf}${e.side}`, tx, tp.y - 70 * tp.s, e.dmg, 0xffd9a0);
        } else {
          const q = this.proj(e.tx, e.ty); tx = q.x; ty = q.y - 14; ts = q.s; this.baseFlash[e.baseOf as 0 | 1] = 1; this.towerFlash[e.baseOf as 0 | 1][SIDES] = 1;
          play('hit', 80); if (e.baseOf === 0 && !calm) this.cameras.main.shake(70, 0.003);
        }
        const fx = FAMILY_FX[e.family] ?? FAMILY_FX.gatling;
        if (av) {
          if (e.family === 'blade') av.lunge = 1; else av.recoil = Math.max(av.recoil, fx.kick > 0 ? 1 : 0.2);
          av.recoilK = fx.kick; av.fam = e.family; av.atkT = 0; if (e.family === 'blade') av.swing = 1;
           av.atkW = e.family === 'blade' ? 1.4 : 0.6 + fx.kick * 0.4;
        }
        // 총구: 내 유닛(뒷모습)은 위쪽을 향해 쏜다
        const mine = av ? av.face === 1 : true;
        const mx = a.x + (mine ? a.s * 10 : -a.s * 10), my = a.y - a.h * a.s * (mine ? 0.66 : 0.42);
        const ang = Math.atan2(ty - my, tx - mx), wk = this.fxK;
        const delay = (n: number) => -n * 0.05;
        if (fx.kick > 0 && e.family !== 'blade') this.fx.push({ kind: 'flash', x1: mx, y1: my, x2: mx, y2: my, t: 0, dur: 0.12, color: fx.color, r: (7 + fx.kick * 6) * a.s * wk, rot: ang + Math.PI / 2 });
        if (e.family === 'laser') {
          this.fx.push({ kind: 'beam', key: 'pj_laser', x1: mx, y1: my, x2: tx, y2: ty, t: 0, dur: 0.17, color: fx.color, r: 16 * a.s * wk });
          this.fx.push({ kind: 'img', key: 'fx_energy', x1: 0, y1: 0, x2: tx, y2: ty, t: 0.03, dur: 0.3, color: fx.color, r: 20 * ts * wk, w1: 46 * ts * wk, add: true });
        } else if (e.family === 'blade') {
          this.fx.push({ kind: 'img', key: 'fx_slash', x1: 0, y1: 0, x2: tx, y2: ty, t: 0.04, dur: 0.22, color: fx.color, r: 40 * ts * wk, w1: 58 * ts * wk, rot: ang + 0.6, add: true });
          this.fx.push({ kind: 'spark', x1: tx, y1: ty, x2: tx, y2: ty, t: 0.06, dur: 0.22, color: 0xffffff, r: 14 * ts * wk });
        } else {
          const pj = PROJ[e.family] ?? PROJ.gatling, dist = Math.hypot(tx - mx, ty - my);
          for (let n = 0; n < pj.count; n++) {
            this.fx.push({ kind: 'proj', key: pj.key, x1: mx, y1: my, x2: tx, y2: ty, t: delay(n), dur: pj.dur, color: fx.color, r: pj.w * a.s * wk, arc: pj.arc * dist, rot: ang });
          }
          const hit = pj.dur;   // 마지막 탄이 닿을 때
          if (fx.blast) this.fx.push({ kind: 'blast', x1: tx, y1: ty, x2: tx, y2: ty, t: pj.dur * 0.92, dur: fx.blast.dur, color: fx.blast.color, r: fx.blast.r * ts * wk });
          else if (!heal) this.fx.push({ kind: 'spark', x1: tx, y1: ty, x2: tx, y2: ty, t: hit * 0.95, dur: 0.2, color: 0xfff3b0, r: 11 * ts * wk });
          if (heal) this.fx.push({ kind: 'img', key: 'fx_heal', x1: 0, y1: 0, x2: tx, y2: ty + 6 * ts, t: pj.dur * 0.9, dur: 0.6, color: 0x6fe39a, r: 26 * ts * wk, w1: 34 * ts * wk, add: true });
        }
        play(fx.sound, fx.gap);
      } else if (e.type === 'tower') {
        const tp = this.towerXY(e.team, e.side), tgt = this.posOf(e.to, b); if (!tgt) continue;
        const tv = this.views.get(e.to); if (tv) { this.flashView(tv); tv.hpShow = 1.4; tv.shake = Math.max(tv.shake, 0.5); }
        const slot = e.side < 0 ? SIDES : e.side;
        this.towerKick[e.team][slot] = 1;
        const mx = tp.x, my = tp.y - (e.side < 0 ? 78 : 46) * tp.s, tx = tgt.x, ty = tgt.y - tgt.h * 0.4 * tgt.s, wk = this.fxK;
        this.fx.push({ kind: 'flash', x1: mx, y1: my, x2: mx, y2: my, t: 0, dur: 0.12, color: 0xffe07a, r: 10 * tp.s * wk, rot: Math.atan2(ty - my, tx - mx) + Math.PI / 2 });
        this.fx.push({ kind: 'proj', key: 'pj_shell', x1: mx, y1: my, x2: tx, y2: ty, t: 0, dur: 0.2, color: 0xffe07a, r: 34 * tp.s * wk, arc: 0.06 * Math.hypot(tx - mx, ty - my), rot: Math.atan2(ty - my, tx - mx) });
        this.fx.push({ kind: 'spark', x1: tx, y1: ty, x2: tx, y2: ty, t: 0.18, dur: 0.2, color: 0xfff3b0, r: 10 * tgt.s * wk });
        this.addNumber('u' + e.to, tx, tgt.y - tgt.h * tgt.s - 10, e.dmg, tgt.x ? (tv && tv.unit.team === 0 ? 0xff8a6b : 0xfff3b0) : 0xffffff);
        play('gatling', 160);
      } else if (e.type === 'towerDown') {
        const tp = this.towerXY(e.team, e.side), wk = this.fxK;
        for (let i = 0; i < 5; i++) this.fx.push({ kind: 'blast', x1: 0, y1: 0, x2: tp.x + (i - 2) * 16 * tp.s, y2: tp.y - 26 * tp.s - (i % 2) * 20 * tp.s, t: i * 0.08, dur: 0.55, color: 0xffa94d, r: 46 * tp.s * wk });
        this.fx.push({ kind: 'ring', x1: tp.x, y1: tp.y, x2: tp.x, y2: tp.y, t: 0, dur: 0.6, color: 0xffd7a0, r: 70 * tp.s * wk });
        play('baseHit'); play('boom', 0); buzz('heavy');
        if (!calm) { this.cameras.main.shake(380, 0.012); if (e.team === 1) this.cameras.main.flash(140, 255, 236, 200, true); }
        this.cfg.hud.toast(e.team === 1 ? '적 포탑 파괴! 왕관 +1 👑 · 그쪽 길 앞에 유닛을 놓을 수 있어요' : '내 포탑이 무너졌어요!');
      } else if (e.type === 'die') {
        const q = this.proj(e.x, e.y), x = q.x, y = q.y - 18 * q.s, s = q.s;
        const col = e.team === 0 ? 0x5fd3ff : 0xff7a45;
        this.fx.push({ kind: 'puff', x1: x, y1: y, x2: x, y2: y, t: 0, dur: 0.5, color: col, r: 34 * s });
        this.fx.push({ kind: 'debris', x1: x, y1: y, x2: x, y2: y, t: 0, dur: 0.7, color: 0xb9c3d1, r: 46 * s });
        this.fx.push({ kind: 'img', key: 'fx_smoke', x1: 0, y1: 0, x2: x, y2: y - 10 * s, t: 0.1, dur: 0.9, color: 0xffffff, r: 22 * s * (this.fxK), w1: 52 * s * (this.fxK) });
        this.fx.push({ kind: 'ring', x1: x, y1: y + 10 * s, x2: x, y2: y + 10 * s, t: 0, dur: 0.4, color: 0xffd7a0, r: 40 * s });
        play('boom', 110);
        if (e.team === 1) this.onKill(b.seconds);
        const big = this.views.get(e.unit);
        if (big && big.k >= 1.5) { for (let i = 0; i < 4; i++) this.fx.push({ kind: 'blast', x1: 0, y1: 0, x2: x + (i - 1.5) * 22 * s, y2: y - (i % 2) * 18 * s, t: -i * 0.12, dur: 0.5, color: 0xffa94d, r: 44 * s }); if (!calm) this.cameras.main.shake(320, 0.01); }
        else if (!calm) this.cameras.main.shake(50, 0.0015);
      } else if (e.type === 'skill') {
        this.skillFx(e);
      }
    }
  }

  /** 연속 처치: 2.5초(전투 시간) 안에 이어서 잡으면 이어진다. 3연속부터 표시·진동 */
  private comboN = 0; private comboAt = -99;
  private onKill(sec: number) {
    this.comboN = sec - this.comboAt <= 2.5 ? this.comboN + 1 : 1; this.comboAt = sec;
    if (this.comboN >= 3) { this.cfg.hud.combo(this.comboN); buzz(this.comboN >= 5 ? 'medium' : 'light'); if (this.comboN === 5 || this.comboN === 8) play('ready'); }
  }

  /** 스킬·영웅 기술 연출 (효과 자체는 sim 이 한다) */
  private skillFx(e: Extract<BattleEvent, { type: 'skill' }>) {
    const b = this.cfg.battle, calm = this.cfg.reducedMotion;
    if (e.team === 0) buzz('medium'); else if (e.skill.startsWith('boss_')) buzz('heavy');
    const pulse = (team: 0 | 1, color: number, r = 30, delay = 0) => {
      for (const v of this.views.values()) if (v.unit.team === team) this.fx.push({ kind: 'ring', x1: v.c.x, y1: v.c.y, x2: v.c.x, y2: v.c.y - 12 * v.c.scaleX, t: -delay, dur: 0.5, color, r: r * v.c.scaleX });
    };
    const opp: 0 | 1 = e.team === 0 ? 1 : 0;
    const q = this.proj(e.x, e.y);
    switch (e.skill) {
      case 'sk_bomb': {
        const rr = BOMB_RADIUS * this.pxX(q.t);
        this.fx.push({ kind: 'ring', x1: q.x, y1: q.y, x2: q.x, y2: q.y, t: 0, dur: 0.5, color: 0xff7a45, r: rr });
        for (let i = 0; i < 9; i++) { const a = i * 2.4, d = (i % 3 === 0 ? 0 : 0.55 + (i % 4) * 0.12) * rr; const px = q.x + Math.cos(a) * d, py = q.y + Math.sin(a) * d * 0.6; this.fx.push({ kind: 'blast', x1: 0, y1: 0, x2: px, y2: py, t: -i * 0.05, dur: 0.42, color: 0xff9f43, r: 30 * q.s }); this.fx.push({ kind: 'spark', x1: 0, y1: 0, x2: px, y2: py, t: -i * 0.05, dur: 0.3, color: 0xfff3b0, r: 18 * q.s }); }
        play('cannon'); play('boom', 0); if (!calm) this.cameras.main.shake(160, 0.006); break;
      }
      case 'sk_overload': pulse(e.team, 0xffb347, 34); play('ready'); break;
      case 'sk_shield': this.baseFlash[e.team] = 1; this.fx.push({ kind: 'ring', x1: q.x, y1: q.y, x2: q.x, y2: q.y, t: 0, dur: 0.6, color: 0x7fe8ff, r: this.W * 0.35 }); play('ready'); break;
      case 'sk_repair': pulse(e.team, 0x6fe39a, 34); play('repair'); break;
      case 'sk_slow': pulse(opp, 0x7fe8ff, 34); play('laser'); break;
      case 'sk_armor': pulse(opp, 0xff6b6b, 34); play('laser'); break;
      case 'sk_strike': {
        this.fx.push({ kind: 'tracer', x1: q.x, y1: this.y0 - 200, x2: q.x, y2: q.y, t: 0, dur: 0.25, color: 0xff7a45, r: 9 });
        this.fx.push({ kind: 'blast', x1: q.x, y1: q.y, x2: q.x, y2: q.y, t: 0.18, dur: 0.5, color: 0xffa94d, r: 70 });
        this.baseFlash[opp] = 1; play('mortar'); if (!calm) this.cameras.main.shake(180, 0.007); break;
      }
      case 'sk_charge': this.fx.push({ kind: 'ring', x1: q.x, y1: q.y, x2: q.x, y2: q.y, t: 0, dur: 0.6, color: 0xffd067, r: this.W * 0.3 }); play('pointCapture'); break;
      case 'boss_arrive': {
        const d = b.bossDef; if (!d) break;
        this.cfg.hud.toast(`경고! ${d.name} 출현`); play('baseHit');
        playMusic('boss'); this.cfg.hud.bossBanner(d.id, d.name, d.title);
        if (!calm) this.cameras.main.shake(300, 0.008);
        this.fx.push({ kind: 'ring', x1: q.x, y1: q.y, x2: q.x, y2: q.y, t: 0, dur: 0.7, color: 0xff4d4d, r: this.W * 0.45 });
        break;
      }
      case 'boss_airstrike': pulse(0, 0xff6b6b, 36); play('flak'); if (!calm) this.cameras.main.shake(200, 0.006); break;
      case 'boss_mortar': pulse(0, 0xff9f43, 30); play('mortar'); if (!calm) this.cameras.main.shake(220, 0.007); break;
      case 'boss_repair': pulse(1, 0x6fe39a, 38); play('repair'); break;
      case 'hero_vanguard': {
        const v = e.unit !== null ? this.views.get(e.unit) : undefined; if (!v) break;
        this.fx.push({ kind: 'ring', x1: v.c.x, y1: v.c.y, x2: v.c.x, y2: v.c.y, t: 0, dur: 0.45, color: 0xffe08a, r: 46 * v.c.scaleX });
        this.fx.push({ kind: 'tracer', x1: v.c.x, y1: v.c.y, x2: q.x, y2: q.y, t: 0, dur: 0.3, color: 0xffe08a, r: 8 }); this.fx.push({ kind: 'blast', x1: 0, y1: 0, x2: q.x, y2: q.y - 20 * q.s, t: 0.05, dur: 0.4, color: 0xffd067, r: 38 * q.s });
        play('blade'); if (!calm) this.cameras.main.shake(120, 0.005); break;
      }
      case 'hero_sniper': {
        const h = e.unit !== null ? b.units.find(u => u.id === e.unit) : undefined, v = e.unit !== null ? this.views.get(e.unit) : undefined; if (!h || !v) break;
        const foes = b.units.filter(u => u.team !== h.team && u.hp > 0 && Math.hypot(u.x - h.x, u.y - h.y) <= 9).sort((a, c) => Math.hypot(a.x - h.x, a.y - h.y) - Math.hypot(c.x - h.x, c.y - h.y)).slice(0, 4);
        foes.forEach((u, i) => { const p = this.proj(u.x, u.y), s = p.s, x = p.x, y = p.y - 28 * s; this.fx.push({ kind: 'tracer', x1: v.c.x, y1: v.c.y - 44 * v.c.scaleX, x2: x, y2: y, t: -i * 0.07, dur: 0.2, color: 0xb8f7ff, r: 5 }); this.fx.push({ kind: 'blast', x1: 0, y1: 0, x2: x, y2: y, t: -i * 0.07 + 0.1, dur: 0.3, color: 0x8fe9ff, r: 22 * s }); });
        play('laser'); break;
      }
      case 'hero_medic': {
        const h = e.unit !== null ? b.units.find(u => u.id === e.unit) : undefined; if (!h) break;
        for (const v of this.views.values()) if (v.unit.team === h.team && Math.hypot(v.unit.x - h.x, v.unit.y - h.y) <= 5) this.fx.push({ kind: 'ring', x1: v.c.x, y1: v.c.y, x2: v.c.x, y2: v.c.y - 10 * v.c.scaleX, t: 0, dur: 0.55, color: 0x6fe39a, r: 34 * v.c.scaleX });
        const bq = this.proj(basePos(h.team).x, basePos(h.team).y); this.fx.push({ kind: 'ring', x1: bq.x, y1: bq.y, x2: bq.x, y2: bq.y, t: 0.1, dur: 0.6, color: 0x7fe8ff, r: this.W * 0.3 });
        play('repair'); break;
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
      const q = this.proj(lerp(u.px, u.x, alpha), lerp(u.py, u.y, alpha)), x = q.x, y = q.y;
      const moved = Math.hypot(x - v.lastX, y - v.lastY);
      if (v.lastX === 0 && v.lastY === 0) { v.lastX = x; v.lastY = y; }
      v.c.setPosition(x, y); v.c.setScale(q.s * v.k); v.c.setDepth(y + (u.stats.move === 'air' ? 4000 : 0));
      const mvTarget = u.moving ? 1 : 0;
      v.mv += (mvTarget - v.mv) * Math.min(1, dt * 9);
      const stride = Math.max(14, v.w * 0.30);
      v.ph += (moved / q.s) / stride * Math.PI;
      const vxNow = (x - v.lastX) / Math.max(dt, 0.001) / (this.W * 0.12);       // 옆으로 가는 빠르기(화면 폭 기준)
      v.vx += (clamp(vxNow, -1.5, 1.5) - v.vx) * Math.min(1, dt * 7);
      v.lastX = x; v.lastY = y;
      // 겨눔: 목표가 있으면 그쪽으로, 없으면 앞을 보며 살짝 두리번
      const tp = u.tgt ? b.posOfTarget(u.tgt) : null;
      let aimWant = Math.sin(now * 0.8 + u.id * 2.1) * 0.05;
      if (tp) { const tq = this.proj(tp.x, tp.y); aimWant = clamp(Math.atan2(tq.x - x, Math.abs(tq.y - y) + 14), -0.55, 0.55); }
      v.aim += (aimWant - v.aim) * Math.min(1, dt * 10);
      // 좌우 방향: 옆으로 가거나 옆을 향하면 몸을 뒤집는다 (앞·뒷모습 그림이라 살짝만)
      const wantFlip = 1;   // 좌우로 뒤집지 않는다 — 앞·뒷모습 그림이라 뒤집으면 가늘게 찌그러졌다 무기 쪽이 바뀌어 어색했다 (방향은 무기 겨눔으로 표현)
      v.flip += (wantFlip - v.flip) * Math.min(1, dt * 10);
      this.animateView(v, dt, now, amp, calm, false);
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

  /**
   * 유닛 한 기의 움직임 (조합된 어떤 다리·몸통·무기에도 같은 규칙):
   *  다리 종류별 보행(두발 걸음·바퀴 출렁임·무한궤도 진동·호버 부유·비행 흔들림) → 엉덩이 기울임 → 무기를 목표 쪽으로 겨눔 → 쏠 때 반동·돌진·휘두름 → 맞으면 밀림
   */
  private animateView(v: View, dt: number, now: number, amp: number, calm: boolean, transit = false) {
    const h = v.h, id = v.unit.id, s = v.c.scaleX;
    const age = now - v.born;
    // 소환: 위에서 내려앉으며 나타난다 (착지 때 먼지 + 눌림)
    const sp = clamp(age / 0.4, 0, 1), e = 1 - Math.pow(1 - sp, 3);
    const drop = calm ? 0 : -(1 - e) * (v.face === 1 ? 90 : 55);
    if (!transit) v.c.setAlpha(Math.min(1, age / 0.22));
    if (sp >= 1 && !v.landed) {
      v.landed = true;
      if (!calm) { this.fx.push({ kind: 'dust', x1: v.c.x - 10, y1: v.c.y, x2: v.c.x - 10, y2: v.c.y, t: 0, dur: 0.5, color: 0xaab4c4, r: 12 * s }); this.fx.push({ kind: 'dust', x1: v.c.x + 10, y1: v.c.y, x2: v.c.x + 10, y2: v.c.y, t: 0.04, dur: 0.5, color: 0xaab4c4, r: 12 * s }); }
    }
    const land = sp >= 1 && age < 0.62 && !calm ? Math.sin((age - 0.4) / 0.22 * Math.PI) * 0.07 : 0; // 착지 눌림
    const mv = v.mv, f = v.face;
    let rigY = 0, rigRot = 0, legRot = 0, legX = 0, upY = 0, upRot = 0, upX = 0, sqY = 1, wRot = 0, wY = 0;
    const sw = Math.sin(v.ph), cw = Math.cos(v.ph), ab = Math.abs(sw);
    switch (v.kind) {
      case 'walk':     // 두 발: 걸음마다 몸이 위아래로 출렁이고, 디딘 발 쪽으로 몸이 기운다
        rigY = -ab * h * 0.03 * mv * amp; legRot = sw * 0.07 * mv * amp; legX = sw * h * 0.012 * mv * amp;
        upY = -Math.abs(Math.sin(v.ph + 0.7)) * h * 0.014 * mv * amp; upRot = -sw * 0.045 * mv * amp; upX = -sw * h * 0.01 * mv * amp;
        sqY = 1 + cw * 0.02 * mv * amp; wRot = sw * 0.03 * mv * amp; break;
      case 'wheel':    // 바퀴: 매끄럽게 달리며 가속 방향으로 앞이 들린다
        rigY = -Math.abs(Math.sin(v.ph * 2)) * h * 0.012 * mv * amp; rigRot = Math.sin(v.ph * 1.3) * 0.014 * mv * amp; upRot = -v.vx * 0.05 * amp; break;
      case 'track':    // 무한궤도: 묵직한 진동, 차체는 거의 수평
        legX = Math.sin(now * 55 + id) * 0.8 * mv * amp; rigY = Math.sin(now * 38 + id) * 0.55 * mv * amp; upY = Math.sin(now * 19 + id) * 0.35 * mv * amp; break;
      case 'hover':    // 호버: 둥실 떠서 천천히 흔들리고, 가는 쪽으로 기운다
        rigY = Math.sin(now * 2.6 + id) * h * 0.024 * amp; rigRot = Math.sin(now * 1.7 + id) * 0.02 * amp + v.vx * 0.07 * amp; legRot = -v.vx * 0.03 * amp; break;
      case 'fly':      // 비행: 날갯짓처럼 상하, 기동 때 기체가 크게 기운다
        rigY = Math.sin(now * 3 + id) * h * 0.035 * amp + Math.sin(now * 6.5 + id) * h * 0.008 * amp; rigRot = Math.sin(now * 1.9 + id) * 0.035 * amp + v.vx * 0.12 * amp; break;
    }
    if (v.legImg && !calm) { legRot = 0; legX = 0; rigY *= 0.6; upX = 0; }   // 걸음은 그림 칸이 맡는다 — 같은 움직임을 컨테이너가 또 흔들면 떨려 보였다
    // 서 있는 동안의 숨 쉬기·주위를 살핌
    const idle = 1 - mv;
    upY += Math.sin(now * 2 + id) * 0.6 * idle * amp;
    upRot += Math.sin(now * 0.9 + id * 1.7) * 0.012 * idle * amp;
    // 옆으로 가면 몸이 기운다(가속감)
    upRot += v.vx * 0.04 * mv * amp * (v.kind === 'walk' ? 1 : 0.6);

    // 무기: 목표 쪽으로 겨누고 → 쏠 때 반동 → 계열별 연출
    v.recoil = Math.max(0, v.recoil - dt * 6); v.lunge = Math.max(0, v.lunge - dt * 5); v.swing = Math.max(0, v.swing - dt * 4.5); v.atkT += dt;
    const kick = (v.recoilK ?? 0.5) * (calm ? 0 : 1);
    const aimRot = v.aim * f * 0.45 * amp;   // 무기가 몸에서 떨어져 보이지 않게 겨눔 각도는 작게 (최대 약 14°)
    wRot += aimRot;
    // 반동: 무기가 뒤로 밀렸다가 돌아온다 / 몸도 살짝 밀린다
    const rc = v.recoil * v.recoil;
    wY += rc * h * 0.07 * kick * f;
    upRot += -f * rc * 0.05 * kick * (calm ? 0 : 1);
    const recoilPx = rc * h * 0.045 * kick * f;
    // 예비 동작(쏘기 직전 몸을 살짝 젖힘) → 발사
    const wind = !calm && v.atkT < 0.2 ? (v.atkT < 0.07 ? v.atkT / 0.07 : 1 - (v.atkT - 0.07) / 0.13) * h * 0.02 * v.atkW * f : 0;
    // 연사: 총열이 떨림, 미사일: 발사 때 무기가 번쩍 들림, 레이저: 겨눈 채 고정, 박격포: 크게 들썩
    const fam = v.fam;
    if (!calm && v.atkT < 0.22) {
      const ph = Math.sin(Math.min(1, v.atkT / 0.22) * Math.PI);
      if (fam === 'gatling') { upX += Math.sin(v.atkT * 130) * 0.9; wRot += Math.sin(v.atkT * 150) * 0.03; }
      else if (fam === 'missile' || fam === 'flak') wRot += -f * ph * 0.12;
      else if (fam === 'mortar' || fam === 'cannon') { wRot += -f * ph * 0.08; upY += ph * h * 0.012; }
      else if (fam === 'laser') wRot += Math.sin(v.atkT * 90) * 0.012;
    }
    // 근접: 무기를 뒤로 젖혔다가 크게 휘두르며 앞으로 돌진
    let lungePx = 0;
    if (!calm && v.swing > 0) {
      const p = 1 - v.swing;                       // 0 → 1
      const arc = p < 0.25 ? -(p / 0.25) : (p - 0.25) / 0.75 * 2 - 1;   // 젖힘(−1) → 휘두름(+1)
      wRot += f * (p < 0.25 ? arc * 0.45 : arc * 0.75);
      lungePx = p > 0.25 ? Math.sin((p - 0.25) / 0.75 * Math.PI) * h * 0.13 * -f : 0;
      upRot += f * (p < 0.25 ? 0.05 : -0.08 * Math.sin((p - 0.25) / 0.75 * Math.PI));
    }
    // 맞음: 맞은 방향으로 휘청이다 돌아온다
    v.hit = Math.max(0, v.hit - dt * 6);
    const hitK = calm ? 0 : v.hit * v.hit;
    const hitX = v.hitX * hitK * h * 0.05, hitY = v.hitY * hitK * h * 0.02;
    upRot += v.hitX * hitK * 0.07;

    v.rig.setPosition(upX + hitX + (v.shake > 0 ? Math.sin(now * 90) * v.shake * 2 : 0), -v.lift + rigY + recoilPx + lungePx + wind + hitY + drop);
    v.rig.rotation = rigRot;
    v.rig.setScale((1 + land * 0.5) * (v.flip >= 0 ? 1 : -1) * Math.max(0.15, Math.abs(v.flip)), sqY - land);
    v.legsC.setPosition(legX, 0); v.legsC.rotation = legRot;
    v.upper.setPosition(v.hip.x + upX * 0.5, v.hip.y + upY - recoilPx * 0.4); v.upper.rotation = upRot;
    v.weaponC.rotation = wRot; v.weaponC.y = (v.weaponC.getData('y0') as number) + wY; v.weaponC.x = (v.weaponC.getData('x0') as number) - wY * Math.sin(aimRot) * f;
    v.shadow.setScale(1 - (1 - e) * 0.4, 1 - (1 - e) * 0.4).setAlpha(0.35 * e);
    // 동작 그림 칸 고르기: 4칸을 연속 위상으로 돌리고, 지금 칸 위에 다음 칸을 위상만큼 투명하게 겹쳐 부드럽게 잇는다
    if (v.legImg && v.legImg2 && !calm) {
      const tp = v.kind === 'hover' || v.kind === 'fly' ? (now * 6 + id) % 4 : ((((v.ph / (2 * Math.PI)) % 1) + 1) % 1) * 4;   // 걸음·궤도·바퀴는 간 거리로, 추진기·날개는 시간으로
      if (mv < 0.15 && v.kind !== 'hover' && v.kind !== 'fly') {   // 멈추면 가장 가까운 디딘 자세(짝수 칸)로 부드럽게
        const tgt = Math.round(v.legP / 2) * 2, d = ((tgt - v.legP + 6) % 4) - 2;
        v.legP = ((v.legP + d * Math.min(1, dt * 8)) % 4 + 4) % 4;
      } else v.legP = tp;
      const i0 = Math.floor(v.legP) % 4, i1 = (i0 + 1) % 4, a = v.legP - Math.floor(v.legP);
      if (i0 !== v.legF) { v.legF = i0; v.legImg.setFrame('f' + i0); }
      v.legImg2.setFrame('f' + i1).setAlpha(a);
    }
    if (v.wpnImg && !calm) {
      const cdTicks = v.unit.cd, f = v.atkT < 0.07 ? 2 : v.atkT < 0.17 ? 3 : cdTicks > 0 && cdTicks <= 3 && v.unit.tgt ? 1 : 0;
      if (f !== v.wpnF) { v.wpnF = f; v.wpnImg.setFrame('f' + f); }
    }
    // 피격 반짝임·흔들림
    v.shake = Math.max(0, v.shake - dt * 7); v.flash = Math.max(0, v.flash - dt * 9); v.hpShow = Math.max(0, v.hpShow - dt);
    const wantTint = v.flash > 0.25;
    if (wantTint !== v.tinted) { v.tinted = wantTint; for (const im of v.imgs) { if (wantTint) im.setTintFill(0xffffff); else im.clearTint(); } }
    // 걸음마다 발밑 먼지
    if (!calm && mv > 0.6 && (v.kind === 'walk' || v.kind === 'wheel') && this.fx.length < 90) {
      const step = Math.floor(v.ph / Math.PI);
      if (step !== v.foot) { v.foot = step; this.fx.push({ kind: 'dust', x1: v.c.x + (step % 2 ? 6 : -6) * s, y1: v.c.y, x2: v.c.x, y2: v.c.y, t: 0, dur: 0.4, color: 0x9aa7b8, r: 6 * s }); }
    }
  }

  private makeView(u: Unit): View {
    const hd = u.hero ? (heroById(u.hero) ?? bossById(u.hero)) : undefined;   // 영웅 또는 보스(겉모습·크기를 같은 방식으로)
    const build = hd ? hd.build : this.cfg.battle.decks[u.team][u.card].build;
    const face: 1 | -1 = u.team === 0 ? 1 : -1;
    const L = layoutUnit(build, this.k, face === 1)!;
    const air = u.stats.move === 'air';
    const lift = air ? 20 * (this.k / 0.6) : 0;
    const ringColor = hd && u.team === 0 ? 0xffd067 : u.team === 0 ? 0x5fd3ff : 0xff7a45;
    const shadow = this.add.ellipse(0, -1, L.w * 0.9, Math.max(8, L.w * 0.24), 0x000000, 0.35);
    const ring = this.add.ellipse(0, -1, L.w * 0.72, Math.max(6, L.w * 0.18), ringColor, 0.12).setStrokeStyle(1.5, ringColor, 0.85);
    const imgs: Phaser.GameObjects.Image[] = [];
    // 다리는 발 기준, 몸통은 엉덩이(hip)를 축으로, 무기는 어깨/팔 자리(mount)를 축으로 돌린다
    const mk = (i: number, ox = 0, oy = 0) => { const p = L.parts[i]; const im = this.add.image(p.x - ox, p.y - oy, this.textures.exists(p.tex) ? p.tex : p.id).setOrigin(0, 0).setDisplaySize(p.w, p.h); imgs.push(im); return im; };
    /** 동작 그림이 있으면 4칸 시트의 f0 으로 그린다 (칸에 여백이 있어 그만큼 크게·위로 옮겨 원본과 같은 자리) */
    const mkAnim = (i: number, ox = 0, oy = 0): Phaser.GameObjects.Image | null => {
      const p = L.parts[i], back = p.tex.startsWith('b_'), info = ANIM[p.id], key = 'an_' + p.tex;
      if (!info || !info.sides.includes(back ? 'back' : 'front') || !this.textures.exists(key) || !this.textures.get(key).has('f0')) return null;
      const sz = (back ? spriteSizeBack : spriteSize)[p.id]; if (!sz) return null;
      const kk = p.w / sz.w, [mx, mt, mb] = info.m;
      const im = this.add.image(p.x - ox - mx * kk, p.y - oy - mt * kk, key, 'f0').setOrigin(0, 0).setDisplaySize((sz.w + 2 * mx) * kk, (sz.h + mt + mb) * kk);
      imgs.push(im); return im;
    };
    const legAnim = mkAnim(0), wpnAnim = mkAnim(2, L.mount.x, L.mount.y);
    const legAnim2 = legAnim ? mkAnim(0) : null;     // 다음 칸을 겹쳐 서서히 섞는다 (4칸만으로도 끊기지 않게)
    legAnim2?.setAlpha(0);
    const legsC = this.add.container(0, 0, legAnim ? [legAnim, legAnim2!] : [mk(0)]);
    const bodyImg = mk(1, L.hip.x, L.hip.y), wImg = wpnAnim ?? mk(2, L.mount.x, L.mount.y);
    const weaponC = this.add.container(L.mount.x - L.hip.x, L.mount.y - L.hip.y, [wImg]).setData('x0', L.mount.x - L.hip.x).setData('y0', L.mount.y - L.hip.y);
    const upper = this.add.container(L.hip.x, L.hip.y, [bodyImg, weaponC]);
    const rig = this.add.container(0, -lift, [legsC, upper]);
    const c = this.add.container(0, 0, [shadow, ring, rig]);
    c.setAlpha(0);
    const q = this.proj(u.x, u.y);
    c.setPosition(q.x, q.y);
    return {
      c, rig, legsC, upper, weaponC, hip: L.hip, shadow, imgs, unit: u, w: L.w, h: L.h, lift, kind: moveKind(build.legs, air), face, flip: 1,
      ph: Math.random() * 6, mv: 0, born: this.time.now / 1000, landed: false, recoil: 0, lunge: 0, flash: 0, hpShow: 0, shake: 0,
      lastX: 0, lastY: 0, foot: 0, dying: -1, tinted: false, lastHp: u.hp, k: hd ? hd.scale : 1, hero: !!hd, atkT: 9, atkW: 0,
      aim: 0, vx: 0, hit: 0, hitX: 0, hitY: 0, fam: '', swing: 0, legImg: legAnim, legImg2: legAnim2, legP: 0, wpnImg: wpnAnim, legF: 0, wpnF: 0, flashAt: -9,
    } as View;
  }

  // ───────── 바닥·기지·효과 그리기 ─────────
  /** 타일 원/타원: (x,y) 중심, 반지름 r(타일) — 원근에 맞춰 납작한 타원으로 */
  private ring(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, color: number, alpha: number, width = 2, dashed = false, fill = 0) {
    const q = this.proj(x, y), rx = r * this.pxX(q.t), ry = r * this.pxY;
    if (fill > 0) { g.fillStyle(color, fill); g.fillEllipse(q.x, q.y, rx * 2, ry * 2); }
    g.lineStyle(width, color, alpha);
    if (!dashed) { g.strokeEllipse(q.x, q.y, rx * 2, ry * 2); return; }
    const N = 36;
    for (let i = 0; i < N; i += 2) { const a0 = (i / N) * Math.PI * 2, a1 = ((i + 1) / N) * Math.PI * 2; g.lineBetween(q.x + Math.cos(a0) * rx, q.y + Math.sin(a0) * ry, q.x + Math.cos(a1) * rx, q.y + Math.sin(a1) * ry); }
  }

  private plate(g: Phaser.GameObjects.Graphics, team: 0 | 1, hpFrac: number, flash: number) {
    // 기지 문: 육각 철문 + 팀 색 테두리 + 20칸 체력 막대 + 가운데 숫자 (Stitch 시안의 「기지 게이트」)
    const near = team === 0, bp = basePos(team), q = this.proj(bp.x, bp.y), cx = q.x, y = this.basePlateY[team] || q.y + 30 * q.s;
    const hw = this.pxX(q.t) * 3.1, hh = 12 * q.s + 3, ch = 9 * q.s + 2;
    const col = near ? 0x5fd3ff : 0xff7a45, N = 20, f = Math.max(0, Math.min(1, hpFrac));
    const hex = (grow: number): Phaser.Geom.Point[] => [[-hw + ch + grow, -hh - grow], [hw - ch - grow, -hh - grow], [hw + grow, 0], [hw - ch - grow, hh + grow], [-hw + ch + grow, hh + grow], [-hw - grow, 0]].map(([dx, dy]) => new Phaser.Geom.Point(cx + dx, y + dy));
    g.fillStyle(col, 0.1); g.fillPoints(hex(9), true);                                  // 바깥 빛
    g.fillStyle(0x06101c, 0.94); g.fillPoints(hex(0), true);                           // 철문 몸체
    g.fillStyle(0xffffff, 0.06); g.fillRect(cx - hw + ch, y - hh, (hw - ch) * 2, 3);   // 윗면 하이라이트
    g.lineStyle(2, col, 0.95); g.strokePoints(hex(0), true);
    g.lineStyle(1, col, 0.35); g.strokePoints(hex(-5), true);
    const bx = cx - hw + ch + 8, bw = (hw - ch - 8) * 2, by = y - 5, bh = 10;
    g.fillStyle(0x000000, 0.55); g.fillRoundedRect(bx - 2, by - 2, bw + 4, bh + 4, 5);
    const on = Math.ceil(f * N), sw = bw / N;
    const tint = f > 0.5 ? col : f > 0.25 ? 0xffd067 : 0xff4d4d;
    for (let i = 0; i < N; i++) { g.fillStyle(i < on ? tint : 0x2a3a52, i < on ? 0.95 : 0.55); g.fillRect(bx + i * sw + 1, by, sw - 2, bh); }
    for (const sx of [-1, 1]) { g.fillStyle(col, 0.9); g.fillCircle(cx + sx * (hw - ch - 2), y, 2.5); }   // 양끝 볼트
    if (flash > 0) { g.fillStyle(0xffffff, 0.5 * flash); g.fillPoints(hex(0), true); }
    const k = team, label = Math.max(0, Math.ceil(this.cfg.battle.baseHp[team]));
    if (!this.baseTxt[k]) this.baseTxt[k] = this.add.text(cx, y, '', { fontFamily: 'Black Han Sans, Noto Sans KR, sans-serif', fontSize: near ? '13px' : '11px', color: '#ffffff', stroke: '#000', strokeThickness: 4 }).setOrigin(0.5).setDepth(90001);
    this.baseTxt[k]!.setText(String(label)).setPosition(cx, y - 1);
  }

  /** 놓기 도우미: 내 진영 표시 · 놓을 수 없는 자리 · 사거리(실선)·인식 거리(점선) · 스킬 범위 */
  private drawPlacement(b: Battle, lg: Phaser.GameObjects.Graphics, now: number) {
    const placing = (this.selected !== null || this.selHero || this.selSkill !== null) && !this.ended;
    if (!placing) return;
    const pulse = 0.5 + 0.5 * Math.sin(now * 4);
    if (this.selSkill === null) {
      lg.fillStyle(0x5fd3ff, 0.07 + 0.04 * pulse); lg.fillPoints(this.pt([0.8, 0.8], [ARENA_W - 0.8, 0.8], [ARENA_W - 0.8, RIVER_Y0 - 0.6], [0.8, RIVER_Y0 - 0.6]), true);
      // 포켓: 상대 포탑이 무너진 쪽 길의 강 건너 땅도 놓을 수 있게 열린다
      for (let sd = 0; sd < SIDES; sd++) if (b.towersOn && !b.survival && b.towers[1][sd].hp <= 0) {
        const x0 = sd === 0 ? 0.8 : ARENA_W / 2 + 0.5, x1 = sd === 0 ? ARENA_W / 2 - 0.5 : ARENA_W - 0.8, y0 = ARENA_H - RIVER_Y0 + 1, y1 = ARENA_H - RIVER_Y0 + POCKET_DEPTH;
        lg.fillStyle(0x5fd3ff, 0.1 + 0.05 * pulse); lg.fillPoints(this.pt([x0, y0], [x1, y0], [x1, y1], [x0, y1]), true);
        lg.lineStyle(2, 0x5fd3ff, 0.6); lg.strokePoints(this.pt([x0, y0], [x1, y0], [x1, y1], [x0, y1]), true);
      }
      lg.lineStyle(2, 0x5fd3ff, 0.5); lg.strokePoints(this.pt([0.8, 0.8], [ARENA_W - 0.8, 0.8], [ARENA_W - 0.8, RIVER_Y0 - 0.6], [0.8, RIVER_Y0 - 0.6]), true);
      for (let s = 0; s < SIDES; s++) { const p = towerPos(0, s); this.ring(lg, p.x, p.y, TOWER_R + 0.9, 0xff5a5a, 0.5, 1.5, false, 0.16); }
      const bp = basePos(0); this.ring(lg, bp.x, bp.y, BASE_R + 0.9, 0xff5a5a, 0.5, 1.5, false, 0.16);
    }
    const h = this.hover; if (!h) return;
    if (this.selSkill !== null) { this.ring(lg, h.x, h.y, BOMB_RADIUS, 0xff7a45, 0.9, 3, false, 0.14); return; }
    const ok = b.canDeploy(0, h.x, h.y);
    const u = this.selHero ? b.hero[0]?.def : null;
    const stats = this.selected !== null ? b.decks[0][this.selected].stats : u ? u.stats : null;
    if (!stats) return;
    const q = this.proj(h.x, h.y);
    if (!ok) { this.ring(lg, h.x, h.y, 0.9, 0xff5a5a, 0.9, 3, false, 0.25); lg.lineStyle(3, 0xff5a5a, 0.9); lg.lineBetween(q.x - 10, q.y - 8, q.x + 10, q.y + 8); lg.lineBetween(q.x - 10, q.y + 8, q.x + 10, q.y - 8); return; }
    const fake = { stats, team: 0 as const };
    this.ring(lg, h.x, h.y, b.aggroOf(fake), 0xbfeaff, 0.55, 1.5, true);                        // 인식 거리(점선)
    this.ring(lg, h.x, h.y, b.rangeOf(fake), stats.family === 'repair' ? 0x6fe39a : 0x5fd3ff, 0.95, 2.5, false, 0.1);   // 사거리(실선)
    this.ring(lg, h.x, h.y, 0.55, 0xffffff, 0.9, 2);
  }

  private draw(b: Battle, delta: number) {
    const dt = delta / 1000, now = this.time.now / 1000;
    const lg = this.laneG; lg.clear();
    const gg = this.groundG; gg.clear();
    const pg = this.plateG; pg.clear();
    const g = this.fxG; g.clear();
    if (!this.skirm) this.drawPlacement(b, lg, now);
    // 기지
    for (const team of this.skirm ? [] as (0 | 1)[] : [1, 0] as const) {
      this.baseFlash[team] = Math.max(0, this.baseFlash[team] - dt * 4);
      this.plate(pg, team, Math.max(0, b.baseHp[team] / 1000), this.baseFlash[team]);
    }
    // 지속 효과 표시: 내 기지 보호막 · 유닛 발밑 고리
    for (const t of [0, 1] as const) {
      if (b.eff.shield[t] > 0) { const q = this.proj(basePos(t).x, basePos(t).y), hw = this.pxX(q.t) * 5; gg.lineStyle(3, 0x7fe8ff, 0.5 + 0.3 * Math.sin(now * 6)); gg.strokeEllipse(q.x, q.y, hw * 2, 46); gg.fillStyle(0x7fe8ff, 0.1); gg.fillEllipse(q.x, q.y, hw * 2, 46); }
    }
    for (const v of this.views.values()) {
      const t = v.unit.team, s = v.c.scaleX, ry = Math.max(5, v.w * 0.09) * s;
      const ring = (color: number, grow: number) => { gg.lineStyle(2, color, 0.7 + 0.25 * Math.sin(now * 8 + v.unit.id)); gg.strokeEllipse(v.c.x, v.c.y - 1, v.w * s * (0.9 + grow), ry * 2 * (1 + grow)); };
      if (b.eff.overload[t] > 0) ring(0xffb347, 0);
      if (b.eff.slow[t] > 0) ring(0x7fe8ff, 0.12);
      if (b.eff.armorDown[t] > 0) ring(0xff6b6b, 0.24);
    }
    // 체력 막대: 맞았거나 다친 유닛(영웅은 항상)
    for (const v of this.views.values()) {
      if (v.unit.hp >= v.unit.maxHp && v.hpShow <= 0 && !v.hero) continue;
      const s = v.c.scaleX, w = Math.max(26, v.w * 0.8) * s, x = v.c.x - w / 2, y = v.c.y - (v.h + v.lift) * s - 7;
      g.fillStyle(0x000000, 0.65); g.fillRect(x - 1, y - 1, w + 2, 6);
      g.fillStyle(v.hero && v.unit.team === 0 ? 0xffd067 : v.unit.team === 0 ? 0x6fe39a : 0xff7a45, 1); g.fillRect(x, y, w * Math.max(0, v.unit.hp / v.unit.maxHp), 4);
      if (v.hero) { const c = v.unit.team === 0 ? 0xffd067 : 0xff4d4d; g.fillStyle(c, 1); g.fillTriangle(v.c.x - 5, y - 9, v.c.x + 5, y - 9, v.c.x, y - 2); }
    }
    // 보스 체력 막대 (위쪽 가운데)
    const bu = b.bossUnit();
    if (bu && b.bossDef) {
      const w = this.W * 0.62, x = this.W / 2 - w / 2, y = this.y0 + 26;
      g.fillStyle(0x000000, 0.7); g.fillRoundedRect(x - 3, y - 3, w + 6, 16, 6);
      g.fillStyle(0xff4d4d, 1); g.fillRoundedRect(x, y, w * Math.max(0, bu.hp / bu.maxHp), 10, 4);
      g.lineStyle(1, 0xffb0b0, 0.8); g.strokeRoundedRect(x, y, w, 10, 4);
      if (!this.bossText) this.bossText = this.add.text(this.W / 2, y - 12, b.bossDef.name, { fontFamily: 'Black Han Sans, Noto Sans KR, sans-serif', fontSize: '13px', color: '#ffd0d0', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5).setDepth(100001);
      this.bossText.setPosition(this.W / 2, y - 11).setVisible(true);
    } else if (this.bossText) this.bossText.setVisible(false);
    // 효과
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i]; f.t += dt;
      const p = f.t / f.dur;
      if (p >= 1) { f.img?.destroy(); f.img2?.destroy(); this.fx.splice(i, 1); continue; }
      if (p < 0) continue;
      const imgFx = (key: string, w0: number, w1: number, a0: number, a1: number, add: boolean, rot = 0) => {
        if (!f.img) { f.img = this.add.image(f.x2, f.y2, key).setDepth(100001); if (add) f.img.setBlendMode(Phaser.BlendModes.ADD); }
        const tex = f.img.texture.getSourceImage(), w = lerp(w0, w1, p);
        f.img.setPosition(f.x2, f.y2).setDisplaySize(w, w * tex.height / tex.width).setAlpha(lerp(a0, a1, p)).setRotation(rot);
      };
      if (f.kind === 'tracer') {
        const hx = f.x1 + (f.x2 - f.x1) * Math.min(1, p * 1.5), hy = f.y1 + (f.y2 - f.y1) * Math.min(1, p * 1.5);
        g.lineStyle(f.r * 2.2, f.color, 0.22 * (1 - p)); g.lineBetween(f.x1 + (hx - f.x1) * 0.35, f.y1 + (hy - f.y1) * 0.35, hx, hy);
        g.lineStyle(f.r, f.color, 1 - p * 0.6); g.lineBetween(f.x1 + (hx - f.x1) * 0.35, f.y1 + (hy - f.y1) * 0.35, hx, hy);
      } else if (f.kind === 'proj') {
        // 탄: 총구 → 목표, 포물선 + 진행 방향으로 회전
        if (!f.img) f.img = this.add.image(f.x1, f.y1, f.key!).setDepth(100001);
        const x = lerp(f.x1, f.x2, p), y = lerp(f.y1, f.y2, p) - (f.arc ?? 0) * 4 * p * (1 - p);
        const dx = (f.x2 - f.x1), dy = (f.y2 - f.y1) - (f.arc ?? 0) * 4 * (1 - 2 * p);
        const tex = f.img.texture.getSourceImage();
        f.img.setPosition(x, y).setRotation(Math.atan2(dy, dx)).setDisplaySize(f.r, f.r * tex.height / tex.width).setAlpha(1);
      } else if (f.kind === 'beam') {
        if (!f.img) f.img = this.add.image(f.x1, f.y1, f.key!).setOrigin(0, 0.5).setDepth(100001).setBlendMode(Phaser.BlendModes.ADD);
        const len = Math.hypot(f.x2 - f.x1, f.y2 - f.y1), tex = f.img.texture.getSourceImage();
        f.img.setPosition(f.x1, f.y1).setRotation(Math.atan2(f.y2 - f.y1, f.x2 - f.x1)).setDisplaySize(len, f.r * (1 - p * 0.5) * (tex.height / tex.width) * 6).setAlpha(1 - p * p);
      } else if (f.kind === 'img') {
        imgFx(f.key!, f.r * 2, f.w1 ?? f.r * 3, 0.95, 0, !!f.add && f.key !== 'fx_smoke', f.rot ?? 0);
        if (f.key === 'fx_smoke') f.img!.setY(f.y2 - p * 14);
      } else if (f.kind === 'blast') {
        imgFx('fx_explosion', f.r * 1.5, f.r * 2.9, 0.95, 0, false);
      } else if (f.kind === 'spark') {
        imgFx('fx_spark', f.r * 1.8, f.r * 3.6, 1, 0, true);
      } else if (f.kind === 'flash') {
        imgFx('fx_muzzle', f.r * 3.4, f.r * 2.2, 1, 0, true, f.rot ?? 0);
        f.img!.setPosition(f.x1, f.y1);
      } else if (f.kind === 'puff') {
        imgFx('fx_explosion', f.r * 2.0, f.r * 3.2, 0.95, 0, false);
        for (let k = 0; k < 4; k++) { const a = k * 1.6 + 0.4, d = f.r * p * 0.9; g.fillStyle(f.color, 0.55 * (1 - p)); g.fillCircle(f.x2 + Math.cos(a) * d, f.y2 + Math.sin(a) * d * 0.8, 5 * (1 - p) + 2); }
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
