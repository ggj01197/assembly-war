import type { Part } from '../../data/parts';
import { assemble, type Build, type UnitStats } from '../assemble';
import { scaleStats } from '../upgrade';
import { mulberry32, type Rng } from '../rng';
import { bossById, type BossDef } from '../../data/bosses';
import { ruleById, stormMult, WEAK_TOWER_MULT, type RuleDef } from '../../data/rules';
import { zeroMods, addMods, offerFor, moduleById, OFFER_TIMES, SURVIVAL_OFFER_TIMES, type Mods, type ModuleDef } from '../modules';
import { skillById, heroById, SKILL_COOLDOWN_SEC, HERO_WATT, HERO_RESPAWN_SEC, HERO_SKILL_COOLDOWN_SEC, type HeroDef } from '../loadout';

/**
 * 3분 세로 전투 — 클래시 로얄식 2D 아레나 (CEO 2026-10-22). 고정 틱(20Hz) 결정론 — 같은 입력(덱·시드·플레이어 명령)이면 같은 결과.
 * `Battle` 은 한 틱씩 전진시킬 수 있어 화면(Phaser)이 그대로 쓰고, `simulate` 는 봇끼리 끝까지 돌려 balance-sim 이 같은 코드를 쓴다.
 *
 * 지도(타일): 가로 18 × 세로 32. 아래(y 작음)가 내 진영, 위가 적 진영. 가운데 세로 14.5~17.5 는 강(물)이고
 * 땅 유닛은 왼쪽·오른쪽 두 다리(x 4.5·13.5)로만 건넌다. 공중 유닛은 강 위를 가로질러 날아간다.
 * 내 기지는 뒤쪽 가운데, 방어 포탑은 두 다리 앞 양옆(왼쪽·오른쪽 길)에 1기씩.
 * 카드는 내 진영(강 아래) 어디든 놓을 수 있고, 놓인 유닛은 ① 인식 거리 안 가장 가까운 적을 목표로 삼아 다가가 싸우고
 * ② 없으면 자기 길의 가장 가까운 적 포탑(없으면 기지)을 향해 직진한다. 가는 도중 인식 거리 안에 적이 나타나면 그중 가장 가까운 적으로 목표가 바뀐다.
 */
export const TICK_HZ = 20;
export const MATCH_SECONDS = 180;
export const OVERTIME_SECONDS = 60;
export const ARENA_W = 18;
export const ARENA_H = 32;
export const RIVER_Y0 = 14.5;
export const RIVER_Y1 = 17.5;
export const BRIDGE_X: readonly [number, number] = [4.5, 13.5];
export const BRIDGE_HALF = 1.7;
export const SIDES = 2;
/** 부품 사거리 1 = 0.81 타일, 부품 속도 1 = 초당 0.405 타일 (옛 3길 길이 100 칸 → 새 지도 27 타일 환산) */
export const RANGE_UNIT = 0.81;
export const SPEED_UNIT = 0.405;
export const SPLASH_UNIT = 0.27;
export const UNIT_R = 0.55;
export const TOWER_R = 1.1;
export const BASE_R = 1.7;
export const BASE_HP = 1000;
export const WATT_POOL = 10;
export const WATT_PER_SEC = 0.5;  // 2초에 1
export const FINAL_MINUTE_MULT = 2;  // 마지막 1분 더블 와트 (CEO 2026-10-19, 1.5 → 2)
export const OVERTIME_MULT = 2;
export const MAX_UNITS_PER_TEAM = 12;
export const SPLASH_MULT = 0.5;
export const BOT_THINK_TICKS = 10; // 0.5초마다 생산 판단
export const BOMB_RADIUS = 3.2;

export type Team = 0 | 1;
export interface Card { build: Build; level?: number }
export interface Deck { cards: Card[] }

export interface BattleResult {
  winner: Team | -1;          // -1 = 무승부
  baseHp: [number, number];
  seconds: number;
  overtime: boolean;
  /** 왕관(무너뜨린 상대 포탑 수) */
  crowns: [number, number];
  /** 일일 임무·광고 회수에 쓰는 통계 */
  skillUses: [number, number]; heroDeploys: [number, number]; wattSpent: [number, number];
  spawned: [number, number];
  kills: [number, number];
  /** 카드별 생산 수·가한 피해 (balance-sim 이 부품 승률·기여를 보기 위해, 결과 화면이 "어느 설계도가 밀렸는지" 보여 주려고) */
  spawnsByCard: [number[], number[]];
  damageByCard: [number[], number[]];
  /** 판 중 고른 지휘 모듈 id (팀별) */
  modules: [string[], string[]];
}

/** 유닛이 노리는 대상: 유닛 / 포탑(팀·길) / 기지(팀) */
export type Target = { kind: 'u'; id: number } | { kind: 't'; team: Team; side: number } | { kind: 'b'; team: Team };

export interface Unit {
  id: number; team: Team;
  /** 타일 좌표(발 위치) · 직전 틱 좌표(화면 보간용) */
  x: number; y: number; px: number; py: number; moving: boolean;
  /** 바라보는 방향(마지막으로 움직이거나 쏜 쪽, 라디안·x 오른쪽, y 위) */
  face: number;
  /** 영웅·보스면 id(card 는 -1) */
  hero: string | null;
  hp: number; maxHp: number; stats: UnitStats; cd: number; card: number;
  /** 지금 노리는 대상(없으면 null) */
  tgt: Target | null;
  /** 몸 반지름(타일) */
  r: number;
  /** 태어난 틱 — 화면의 등장 연출용 */
  born: number;
}

export type BattleEvent =
  | { type: 'spawn'; unit: number; team: Team; x: number; y: number }
  | { type: 'attack'; from: number; to: number | null; baseOf: Team | null; towerOf?: Team; side?: number; /** 맞는 곳(타일) */ tx: number; ty: number; family: string; /** 실제로 들어간 피해(치료는 회복량) — 화면 숫자용 */ dmg?: number }
  | { type: 'die'; unit: number; team: Team; x: number; y: number }
  | { type: 'tower'; team: Team; side: number; to: number; dmg: number }          // 포탑이 유닛을 쏨
  | { type: 'towerDown'; team: Team; side: number }                  // 포탑 파괴 (team = 무너진 쪽)
  | { type: 'skill'; team: Team; skill: string; x: number; y: number; unit: number | null }
  | { type: 'module'; team: Team; id: string };

export interface Prepared { stats: UnitStats; watt: number; build: Build; level: number }

export function prepareDeck(deck: Deck, parts: Part[]): Prepared[] {
  if (deck.cards.length === 0) throw new Error('덱이 비어 있습니다');
  return deck.cards.map((c, i) => {
    const r = assemble(c.build, parts);
    if (!r.ok || !r.stats) throw new Error(`카드 ${i} 조립 불가: ${r.reasons.join(', ')}`);
    return { stats: scaleStats(r.stats, c.level ?? 1), watt: r.watt, build: c.build, level: c.level ?? 1 };
  });
}

function canHit(attacker: UnitStats, target: UnitStats): boolean {
  if (attacker.target === 'both') return true;
  return attacker.target === target.move;
}

export interface BattleOptions {
  /** 팀별 봇 조종 여부 (기본: 둘 다 봇). 플레이어 팀은 false 로 두고 spawn() 을 부른다. */
  bots?: [boolean, boolean];
  /** 팀별 와트 충전 배율 (훈련 전투에서 적을 느리게) */
  wattMult?: [number, number];
  /** 팀별 스킬 id (최대 2) · 영웅 id · 영웅 강화 단계(사령관 레벨) */
  skills?: [string[], string[]];
  heroes?: [string | null, string | null];
  heroLevel?: [number, number];
  /** 적(팀 1)에게 나올 보스 id (5-D) */
  boss?: string | null;
  /** 5분 버티기: 300초, 적 기지·포탑은 무적, 15초마다 적이 강해진다. 5분 동안 내 기지가 버티면 승리 */
  survival?: boolean;
  /** 길마다 방어 포탑을 둔다 (기본 켬) */
  towers?: boolean;
  /** 판 중 지휘 모듈 3택 1 (기본 끔 — 실제 전투·스테이지 시뮬만 켠다) */
  modules?: boolean;
  /** 작전 변형 규칙 id (data/rules.ts) — 양쪽에 똑같이 적용 */
  rule?: string | null;
  /** 클래시 로얄식 손패: 덱을 섞어 4장만 손에 들고, 낸 카드는 맨 뒤로 가며 다음 카드가 그 자리에 들어온다 (기본 끔) */
  hand?: boolean;
  /** 시작 기지 체력(보스 러시에서 앞 판 체력을 이어 받는다) */
  startHp?: [number, number];
}

export const HAND_SIZE = 4;

/** 사람이 고를 차례인 모듈 3장 */
export interface ModuleOffer { team: Team; index: number; ids: string[] }

export interface Tower { hp: number; maxHp: number; cd: number; x: number; y: number }

/** 길(왼쪽·오른쪽)마다 양쪽에 방어 포탑 1기 (클래시 로얄식 왕관 규칙): 포탑 1기 파괴 = 왕관 1개(최대 2), 시간이 끝나면 왕관이 많은 쪽이 이긴다. */
export const TOWER_HP = 420;
export const TOWER_ARMOR = 15;
export const TOWER_DMG = 18;
export const TOWER_RATE = 1;        // 초당 1발
export const TOWER_RANGE = 7;       // 부품 사거리 단위 (= 5.7 타일, 중거리 무기와 같다 — 밖에서 일방적으로 못 깎게)
export const SURVIVAL_SECONDS = 300;
export const WAVE_SECONDS = 15;
export const towerPos = (team: Team, side: number): { x: number; y: number } => ({ x: BRIDGE_X[side], y: team === 0 ? 8.5 : ARENA_H - 8.5 });
export const basePos = (team: Team): { x: number; y: number } => ({ x: ARENA_W / 2, y: team === 0 ? 2.6 : ARENA_H - 2.6 });

/** 내 진영에 놓을 수 있는 자리인가: 자기 쪽 땅(강 밖), 벽·포탑·기지에서 떨어져 있어야 한다 */
export function canDeployAt(team: Team, x: number, y: number): boolean {
  if (!(x >= 0.8 && x <= ARENA_W - 0.8)) return false;
  const ym = team === 0 ? y : ARENA_H - y;
  if (!(ym >= 0.8 && ym <= RIVER_Y0 - 0.6)) return false;
  for (let s = 0; s < SIDES; s++) { const p = towerPos(team, s); if (Math.hypot(p.x - x, p.y - y) < TOWER_R + 0.9) return false; }
  const b = basePos(team); return Math.hypot(b.x - x, b.y - y) >= BASE_R + 0.9;
}

/** 부품 사거리(단위) → 타일 */
export const rangeTiles = (s: UnitStats): number => s.range * RANGE_UNIT;
export const minRangeTiles = (s: UnitStats): number => s.minRange * RANGE_UNIT;
/** 인식 거리(타일): 이 안의 적을 목표로 삼는다. 시야가 길수록 멀리 본다 */
export const aggroTiles = (s: UnitStats, sightMod = 0): number => Math.max(rangeTiles(s) + 1.2, 3.2 + s.sight * 0.55) * (1 + sightMod);

export interface HeroState { def: HeroDef; unit: number | null; respawn: number; skillCd: number; mult: number }
/** 스킬 효과가 남은 틱 수 (팀별) */
export interface Effects { overload: [number, number]; shield: [number, number]; slow: [number, number]; armorDown: [number, number]; charge: [number, number] }

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const inBand = (y: number) => y > RIVER_Y0 - 0.05 && y < RIVER_Y1 + 0.05;

export class Battle {
  readonly decks: [Prepared[], Prepared[]];
  readonly units: Unit[] = [];
  readonly baseHp: [number, number] = [BASE_HP, BASE_HP];
  readonly watt: [number, number] = [WATT_POOL / 2, WATT_POOL / 2];
  readonly spawned: [number, number] = [0, 0];
  readonly kills: [number, number] = [0, 0];
  readonly spawnsByCard: [number[], number[]];
  readonly damageByCard: [number[], number[]];
  readonly skillUses: [number, number] = [0, 0];
  readonly heroDeploys: [number, number] = [0, 0];
  readonly wattSpent: [number, number] = [0, 0];
  /** 5분 버티기 이어하기(광고)를 쓴 횟수 */
  continued = 0;
  tick = 0;
  overtime = false;
  over = false;
  /** 방금 끝난 틱에서 일어난 일 (화면이 연출에 쓴다). step() 마다 비워진다. */
  events: BattleEvent[] = [];
  /** step() 밖(플레이어 명령)에서 생긴 일 — 다음 step() 의 events 맨 앞에 들어간다 */
  private pre: BattleEvent[] = [];
  /** 팀별 스킬 id·남은 쿨다운(틱) — HUD 가 읽는다 */
  readonly skillIds: [string[], string[]] = [[], []];
  readonly skillCd: [number[], number[]] = [[], []];
  readonly eff: Effects = { overload: [0, 0], shield: [0, 0], slow: [0, 0], armorDown: [0, 0], charge: [0, 0] };
  readonly hero: [HeroState | null, HeroState | null] = [null, null];
  /** towers[팀][길(0 왼쪽·1 오른쪽)] */
  readonly towers: [Tower[], Tower[]] = [[], []];
  readonly towersOn: boolean;
  /** 지휘 모듈: 팀별 누적 수치·고른 것·지금 사람이 고르는 중인 3장(있으면 step() 은 시간을 멈춘다) */
  readonly mod: [Mods, Mods] = [zeroMods(), zeroMods()];
  readonly picked: [string[], string[]] = [[], []];
  offer: ModuleOffer | null = null;
  readonly modulesOn: boolean;
  /** 이번 판의 변형 규칙 */
  readonly rule: RuleDef | null;
  /** 손패(덱 번호 4개)·다음에 들어올 순서(덱 번호) — handOn 일 때만 의미가 있다 */
  readonly handOn: boolean;
  readonly hand: [number[], number[]] = [[], []];
  readonly queue: [number[], number[]] = [[], []];
  private offerIdx = 0;
  private seed: number;
  private modRng: Rng;

  private rng: Rng;
  private nextId = 1;
  private plan: [number | null, number | null] = [null, null];
  private bots: [boolean, boolean];
  private wattMult: [number, number];
  private matchSec = MATCH_SECONDS;
  private maxTicks = (MATCH_SECONDS + OVERTIME_SECONDS) * TICK_HZ;
  readonly survival: boolean;
  private boss: { def: BossDef; spawned: boolean; unit: number | null; nextTick: number } | null = null;

  constructor(deckA: Deck, deckB: Deck, parts: Part[], seed: number, opts: BattleOptions = {}) {
    this.rng = mulberry32(seed); this.seed = seed; this.modRng = mulberry32((seed ^ 0x5bd1e995) >>> 0);
    this.modulesOn = !!opts.modules;
    this.handOn = !!opts.hand;
    if (opts.startHp) { this.baseHp[0] = opts.startHp[0]; this.baseHp[1] = opts.startHp[1]; }
    this.rule = ruleById(opts.rule) ?? null;
    if (this.rule?.mods) for (const t of [0, 1] as Team[]) addMods(this.mod[t], { id: this.rule.id, name: '', desc: '', cat: 'atk', icon: '', mods: this.rule.mods });
    this.decks = [prepareDeck(deckA, parts), prepareDeck(deckB, parts)];
    this.spawnsByCard = [this.decks[0].map(() => 0), this.decks[1].map(() => 0)];
    this.damageByCard = [this.decks[0].map(() => 0), this.decks[1].map(() => 0)];
    this.bots = opts.bots ?? [true, true];
    this.wattMult = opts.wattMult ?? [1, 1];
    this.survival = !!opts.survival;
    this.towersOn = opts.towers !== false;
    const th = Math.round(TOWER_HP * (this.rule?.id === 'rl_weak' ? WEAK_TOWER_MULT : 1));
    for (const t of [0, 1] as Team[]) this.towers[t] = Array.from({ length: SIDES }, (_, s) => ({ hp: th, maxHp: th, cd: 0, ...towerPos(t, s) }));
    if (this.survival) { this.matchSec = SURVIVAL_SECONDS; this.maxTicks = SURVIVAL_SECONDS * TICK_HZ; }
    const bd = opts.boss ? bossById(opts.boss) : undefined;
    if (bd) this.boss = { def: bd, spawned: false, unit: null, nextTick: 0 };
    if (this.handOn) {
      const hr = mulberry32((seed ^ 0x2c1b3c6d) >>> 0);
      for (const t of [0, 1] as Team[]) {
        const order = this.decks[t].map((_, i) => i);
        for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(hr() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
        this.hand[t] = order.slice(0, HAND_SIZE); this.queue[t] = order.slice(HAND_SIZE);
      }
    }
    for (const t of [0, 1] as Team[]) {
      this.skillIds[t] = (opts.skills?.[t] ?? []).filter(id => !!skillById(id)).slice(0, 2);
      this.skillCd[t] = this.skillIds[t].map(() => 0);
      const hid = opts.heroes?.[t]; const def = hid ? heroById(hid) : undefined;
      if (def) this.hero[t] = { def, unit: null, respawn: 0, skillCd: 0, mult: 1 + 0.03 * Math.max(0, (opts.heroLevel?.[t] ?? 1) - 1) };
    }
  }

  private credit(u: Unit, v: number) { if (u.card >= 0) this.damageByCard[u.team][u.card] += v; }
  private armorOf(e: Unit): number { return Math.max(0, e.stats.armor + this.mod[e.team].armor - (this.eff.armorDown[e.team] > 0 ? 20 : 0)); }
  /** 카드를 낼 때 드는 와트 (경량화 설계 반영, 최소 1) */
  costOf(team: Team, cardIdx: number): number { const w = this.decks[team][cardIdx]?.watt ?? 99; return Math.max(Math.min(1, w), w - this.mod[team].discount); }
  private count(t: Team) { return this.units.filter(u => u.team === t && !u.hero).length; }
  unitById(id: number): Unit | undefined { return this.units.find(u => u.id === id); }
  /** 유닛의 실제 사거리·인식 거리(타일) — 모듈·규칙 반영 (화면의 사거리 표시용) */
  rangeOf(u: Pick<Unit, 'stats' | 'team'>): number { return rangeTiles(u.stats) * (1 + this.mod[u.team].range); }
  aggroOf(u: Pick<Unit, 'stats' | 'team'>): number { return aggroTiles(u.stats, this.mod[u.team].sight) * (1 + this.mod[u.team].range * 0.5); }

  get seconds(): number { return this.tick / TICK_HZ; }
  /** 팀 t 가 얻은 왕관 수 = 무너뜨린 상대 포탑 수 */
  crowns(t: Team): number { return this.towersOn ? this.towers[t === 0 ? 1 : 0].filter(x => x.hp <= 0).length : 0; }
  towerAlive(team: Team, side: number): boolean { return this.towersOn && this.towers[team][side].hp > 0; }
  /** 남은 시간(초). 연장 중에는 연장 남은 시간 */
  get remaining(): number { return Math.max(0, (this.overtime ? this.matchSec + OVERTIME_SECONDS : this.matchSec) - this.seconds); }
  /** 5분 버티기의 현재 웨이브(0부터) */
  get wave(): number { return this.survival ? Math.floor(this.seconds / WAVE_SECONDS) : 0; }
  /** 지금 보스 유닛(나온 뒤 살아 있을 때) */
  bossUnit(): Unit | null { const b = this.boss; return b && b.unit !== null ? this.units.find(u => u.id === b.unit) ?? null : null; }
  get bossDef(): BossDef | null { return this.boss?.def ?? null; }
  get bossSpawned(): boolean { return !!this.boss?.spawned; }

  private makeUnit(team: Team, x: number, y: number, stats: UnitStats, card: number, hero: string | null, r = UNIT_R): Unit {
    const face = team === 0 ? Math.PI / 2 : -Math.PI / 2;
    return { id: this.nextId++, team, x, y, px: x, py: y, moving: false, face, hero, hp: stats.hp, maxHp: stats.hp, stats, cd: 0, card, tgt: null, r, born: this.tick };
  }

  /** 플레이어(또는 외부)가 카드를 (x, y) 타일에 놓는다. 와트·동시 유닛 상한·놓을 수 있는 자리를 지키며 성공 여부를 돌려준다. */
  spawn(team: Team, cardIdx: number, x: number, y: number): boolean {
    if (this.over) return false;
    const card = this.decks[team][cardIdx];
    if (!card || !canDeployAt(team, x, y)) return false;
    if (this.handOn && !this.hand[team].includes(cardIdx)) return false;
    const cost = this.costOf(team, cardIdx);
    if (cost > this.watt[team] + 1e-9) return false;
    if (this.count(team) >= MAX_UNITS_PER_TEAM) return false;
    this.watt[team] -= cost; this.wattSpent[team] += cost;
    let st = card.stats;
    if (this.survival && team === 1) { const w = this.wave; st = { ...st, hp: Math.round(st.hp * (1 + 0.07 * w)), dmg: Math.round(st.dmg * (1 + 0.05 * w) * 100) / 100 }; }
    if (this.mod[team].hp) st = { ...st, hp: Math.round(st.hp * (1 + this.mod[team].hp)) };
    const u = this.makeUnit(team, x, y, st, cardIdx, null);
    this.units.push(u);
    this.spawned[team]++; this.spawnsByCard[team][cardIdx]++;
    if (this.handOn) this.cycle(team, cardIdx);
    this.pre.push({ type: 'spawn', unit: u.id, team, x, y });
    return true;
  }

  /** 낸 카드는 대기열 맨 뒤로, 맨 앞 카드가 그 자리에 들어온다 */
  private cycle(team: Team, cardIdx: number): void {
    const k = this.hand[team].indexOf(cardIdx); if (k < 0) return;
    this.queue[team].push(cardIdx); this.hand[team][k] = this.queue[team].shift()!;
  }
  /** 다음에 손으로 들어올 카드(덱 번호) */
  nextCard(team: Team): number | null { return this.queue[team][0] ?? null; }

  // ───────── 목표 정하기 ─────────
  private posOfTarget(t: Target): { x: number; y: number; r: number } | null {
    if (t.kind === 'u') { const e = this.unitById(t.id); return e && e.hp > 0 ? { x: e.x, y: e.y, r: e.r } : null; }
    if (t.kind === 't') { const tw = this.towers[t.team][t.side]; return this.towersOn && tw.hp > 0 ? { x: tw.x, y: tw.y, r: TOWER_R } : null; }
    return this.baseHp[t.team] > 0 ? { ...basePos(t.team), r: BASE_R } : null;
  }
  private canHitBuildings(u: Unit): boolean { return u.stats.target !== 'air' && u.stats.family !== 'repair'; }
  /** 이 유닛이 지금 걸어갈 「기본 목표」: 가장 가까운 적 포탑, 다 무너졌으면 적 기지 */
  private objective(u: Unit): Target {
    const foe: Team = u.team === 0 ? 1 : 0;
    let best: Target | null = null, bd = Infinity;
    for (let s = 0; s < SIDES; s++) {
      if (!this.towerAlive(foe, s)) continue;
      const tw = this.towers[foe][s], d = Math.hypot(tw.x - u.x, tw.y - u.y);
      if (d < bd) { bd = d; best = { kind: 't', team: foe, side: s }; }
    }
    return best ?? { kind: 'b', team: foe };
  }
  /** 유닛마다 인식 거리 안에서 가장 가까운 적을 찾고, 없으면 기본 목표로 한다 (바꾸는 것은 틱마다 새로 판단) */
  private retarget(u: Unit): void {
    const foe: Team = u.team === 0 ? 1 : 0;
    const aggro = this.aggroOf(u), minR = minRangeTiles(u.stats);
    if (u.stats.family === 'repair') {
      // 치료병: 인식 거리 안에서 가장 다친 아군(자기 제외)을 목표로, 없으면 앞장선 아군 뒤를 따른다
      let ally: Unit | null = null, low = 1;
      for (const a of this.units) {
        if (a === u || a.team !== u.team || a.hp <= 0 || a.hp >= a.maxHp) continue;
        if (Math.hypot(a.x - u.x, a.y - u.y) > aggro) continue;
        const f = a.hp / a.maxHp;
        if (f < low || (f === low && ally && a.id < ally.id)) { low = f; ally = a; }
      }
      if (ally) { u.tgt = { kind: 'u', id: ally.id }; return; }
      let lead: Unit | null = null, ld = Infinity;
      for (const a of this.units) {
        if (a === u || a.team !== u.team || a.hp <= 0 || a.stats.family === 'repair') continue;
        const d = Math.hypot(a.x - u.x, a.y - u.y); if (d < ld) { ld = d; lead = a; }
      }
      u.tgt = lead ? { kind: 'u', id: lead.id } : null; return;
    }
    let best: Target | null = null, bd = Infinity;
    const cur = u.tgt && u.tgt.kind === 'u' ? this.unitById(u.tgt.id) : null;
    for (const e of this.units) {
      if (e.team !== foe || e.hp <= 0 || !canHit(u.stats, e.stats)) continue;
      const d = Math.hypot(e.x - u.x, e.y - u.y) - e.r - u.r;
      if (d > aggro || d < minR) continue;
      if (d < bd) { bd = d; best = { kind: 'u', id: e.id }; }
    }
    if (cur && cur.hp > 0 && cur.team === foe && canHit(u.stats, cur.stats) && best && best.kind === 'u' && best.id !== cur.id) {
      const dc = Math.hypot(cur.x - u.x, cur.y - u.y) - cur.r - u.r;
      if (dc <= aggro * 1.15 && dc >= minR && dc <= bd + 0.3) best = { kind: 'u', id: cur.id };   // 조금 더 가깝다고 바로 갈아타지 않는다
    }
    // 건물(포탑·기지)이 인식 거리 안이면 그것도 후보 — 단 유닛이 있으면 유닛 먼저(0.8 타일 우대)
    if (this.canHitBuildings(u)) {
      for (let s = 0; s < SIDES; s++) {
        if (!this.towerAlive(foe, s)) continue;
        const tw = this.towers[foe][s], d = Math.hypot(tw.x - u.x, tw.y - u.y) - TOWER_R - u.r + 0.8;
        if (d <= aggro && d >= minR && d < bd) { bd = d; best = { kind: 't', team: foe, side: s }; }
      }
      const downs = this.towersOn ? this.towers[foe].filter(t => t.hp <= 0).length : SIDES;
      if (downs >= 1 || !this.towersOn) {
        const bp = basePos(foe), d = Math.hypot(bp.x - u.x, bp.y - u.y) - BASE_R - u.r + 0.8;
        if (this.baseHp[foe] > 0 && d <= aggro && d >= minR && d < bd) { bd = d; best = { kind: 'b', team: foe }; }
      }
    }
    u.tgt = best ?? (this.canHitBuildings(u) ? this.objective(u) : null);
  }

  /** 가려는 곳(tx, ty)으로 가기 위해 지금 향할 점: 강이 사이에 있으면 가까운 다리 입구→출구를 거친다 */
  private waypoint(u: Unit, tx: number, ty: number): { x: number; y: number } {
    if (u.stats.move === 'air') return { x: tx, y: ty };
    const up = ty > u.y;                                           // 위쪽(y 큰 쪽)으로 가는가
    const crossing = inBand(u.y) || (up ? u.y < RIVER_Y0 && ty > RIVER_Y0 : u.y > RIVER_Y1 && ty < RIVER_Y1);
    if (!crossing) return { x: tx, y: ty };
    // 가장 가까운 다리(내 위치에서의 거리 + 다리에서 목표까지)
    let bx = BRIDGE_X[0], bd = Infinity;
    for (const x of BRIDGE_X) { const d = Math.abs(u.x - x) + Math.abs(tx - x) * 0.5; if (d < bd) { bd = d; bx = x; } }
    if (inBand(u.y)) return { x: bx, y: up ? RIVER_Y1 + 0.9 : RIVER_Y0 - 0.9 };          // 다리 위: 곧장 건너편으로
    const edgeY = up ? RIVER_Y0 - 0.15 : RIVER_Y1 + 0.15;
    if (Math.abs(u.x - bx) < 1.0 && Math.abs(u.y - edgeY) < 1.4) return { x: bx, y: up ? RIVER_Y1 + 0.9 : RIVER_Y0 - 0.9 };   // 다리 입구에 닿았으면 건너기 시작
    return { x: bx, y: edgeY };
  }

  /** 한 틱(1/20초) 진행. 끝났으면 false */
  step(): boolean {
    this.events = this.pre; this.pre = [];
    if (this.over) return false;
    const sec = this.tick / TICK_HZ;
    if (!this.overtime && sec >= this.matchSec) {
      if (this.survival || this.baseHp[0] !== this.baseHp[1] || this.crowns(0) !== this.crowns(1)) { this.over = true; return false; }
      this.overtime = true; // 동률이면 연장
    }
    if (this.tick >= this.maxTicks) { this.over = true; return false; }
    if (this.modulesOn) {
      const times = this.survival ? SURVIVAL_OFFER_TIMES : OFFER_TIMES;
      if (!this.offer && this.offerIdx < times.length && sec >= times[this.offerIdx]) this.openOffer();
      if (this.offer) return true;   // 사람이 고를 때까지 시간이 멈춘다
    }

    const { units, baseHp, watt } = this;
    const dt = 1 / TICK_HZ;

    // 0. 스킬·영웅 쿨다운과 효과 시간
    for (const t of [0, 1] as Team[]) {
      this.skillCd[t] = this.skillCd[t].map(c => Math.max(0, c - 1));
      for (const k of ['overload', 'shield', 'slow', 'armorDown', 'charge'] as const) this.eff[k][t] = Math.max(0, this.eff[k][t] - 1);
      const h = this.hero[t]; if (h) { h.respawn = Math.max(0, h.respawn - 1); h.skillCd = Math.max(0, h.skillCd - 1); }
    }
    for (const u of units) {
      const rg = this.mod[u.team].regen;
      if (rg && u.hp > 0 && u.hp < u.maxHp) u.hp = Math.min(u.maxHp, u.hp + (u.maxHp * rg) / TICK_HZ);
    }

    // 1. 와트 충전
    const mult = this.overtime ? OVERTIME_MULT : !this.survival && sec >= this.matchSec - 60 ? FINAL_MINUTE_MULT : 1;
    for (const t of [0, 1] as Team[]) {
      const bonus = (this.eff.charge[t] > 0 ? 2 : 1) * (1 + this.mod[t].wattRate) * (this.rule?.id === 'rl_storm' ? stormMult(sec) : 1);
      watt[t] = Math.min(WATT_POOL, watt[t] + (WATT_PER_SEC * mult * bonus * this.wattMult[t] * (this.survival && t === 1 ? 1 + 0.04 * this.wave : 1)) / TICK_HZ);
    }

    // 2. 생산 판단 (봇)
    if (this.tick % BOT_THINK_TICKS === 0) for (const t of [0, 1] as Team[]) if (this.bots[t]) this.botTurn(t);

    // 2-b. 보스: 때가 되면 나오고, 주기 기술을 쓴다
    this.stepBoss(sec);

    // 3. 목표 정하기 → 공격 (피해는 모아 두었다가 동시에 적용). 치료(repair)는 같은 편 부상자에게 음수 피해로 들어간다.
    const unitDamage = new Map<number, number>();
    const baseDmg: [number, number] = [0, 0];
    const towerDmg: [number[], number[]] = [[0, 0], [0, 0]];
    const order = [...units].sort((a, b) => a.id - b.id);
    for (const u of order) if (u.hp > 0) this.retarget(u);
    for (const u of order) {
      if (u.hp <= 0) continue;
      u.cd -= 1;
      if (u.cd > 0 || !u.tgt) continue;
      const pos = this.posOfTarget(u.tgt); if (!pos) continue;
      const mu = this.mod[u.team];
      const dist = Math.hypot(pos.x - u.x, pos.y - u.y), gap = dist - pos.r - u.r;
      const range = this.rangeOf(u), minR = minRangeTiles(u.stats);
      if (gap > range || gap < minR) { u.cd = 0; continue; }          // 사거리 밖(이동 단계에서 다가간다) 또는 너무 가까움
      const rate = Math.max(0.2, u.stats.rate) * (this.eff.overload[u.team] > 0 ? 1.3 : 1) * (1 + mu.rate);
      const pc = Math.min(0.9, u.stats.pierce + mu.pierce);
      const foe: Team = u.team === 0 ? 1 : 0;
      u.face = Math.atan2(pos.y - u.y, pos.x - u.x);
      if (u.stats.family === 'repair') {
        const ally = this.unitById(u.tgt.kind === 'u' ? u.tgt.id : -1);
        if (!ally || ally.hp >= ally.maxHp) { u.cd = 0; continue; }
        unitDamage.set(ally.id, (unitDamage.get(ally.id) ?? 0) - u.stats.dmg);
        if (u.stats.splash > 0) {
          for (const a of units) {
            if (a === ally || a === u || a.team !== u.team || a.hp <= 0 || a.hp >= a.maxHp || Math.hypot(a.x - ally.x, a.y - ally.y) > u.stats.splash * SPLASH_UNIT) continue;
            unitDamage.set(a.id, (unitDamage.get(a.id) ?? 0) - u.stats.dmg * SPLASH_MULT);
          }
        }
        this.credit(u, u.stats.dmg * 0.5); // 치료 기여는 절반으로 쳐서 결과 화면 순위에 반영
        this.events.push({ type: 'attack', from: u.id, to: ally.id, baseOf: null, tx: ally.x, ty: ally.y, family: 'repair', dmg: u.stats.dmg });
        u.cd = Math.round(TICK_HZ / rate); continue;
      }
      if (u.tgt.kind === 'u') {
        const target = this.unitById(u.tgt.id)!;
        const armor = this.armorOf(target) * (1 - pc);
        const dealt = Math.max(1, u.stats.dmg * (1 + mu.dmg) * (1 - armor / 100));
        unitDamage.set(target.id, (unitDamage.get(target.id) ?? 0) + dealt);
        this.credit(u, dealt);
        this.events.push({ type: 'attack', from: u.id, to: target.id, baseOf: null, tx: target.x, ty: target.y, family: u.stats.family, dmg: dealt });
        if (u.stats.splash > 0) {
          for (const e of units) {
            if (e === target || e.team !== foe || e.hp <= 0 || e.stats.move !== target.stats.move) continue;
            if (Math.hypot(e.x - target.x, e.y - target.y) <= u.stats.splash * SPLASH_UNIT) {
              const sp = Math.max(1, u.stats.dmg * (1 + mu.dmg) * SPLASH_MULT * (1 - this.armorOf(e) * (1 - pc) / 100));
              unitDamage.set(e.id, (unitDamage.get(e.id) ?? 0) + sp);
              this.credit(u, sp);
            }
          }
        }
      } else if (u.tgt.kind === 't') {
        const dealt = Math.max(1, u.stats.dmg * (1 + mu.dmg) * (1 + mu.towerDmg) * (1 - TOWER_ARMOR * (1 - pc) / 100));
        towerDmg[u.tgt.team][u.tgt.side] += dealt; this.credit(u, dealt);
        this.events.push({ type: 'attack', from: u.id, to: null, baseOf: null, towerOf: u.tgt.team, side: u.tgt.side, tx: pos.x, ty: pos.y, family: u.stats.family, dmg: dealt });
      } else {
        const bd = u.stats.dmg * (1 + mu.dmg) * (1 + mu.towerDmg);
        baseDmg[u.tgt.team] += bd; this.credit(u, bd);
        this.events.push({ type: 'attack', from: u.id, to: null, baseOf: u.tgt.team, tx: pos.x, ty: pos.y, family: u.stats.family });
      }
      u.cd = Math.round(TICK_HZ / rate);
    }
    // 3-b. 포탑 사격 (사거리 안에서 가장 가까운 적 유닛 하나)
    if (this.towersOn) {
      for (const t of [0, 1] as Team[]) {
        for (let s = 0; s < SIDES; s++) {
          const tw = this.towers[t][s]; if (tw.hp <= 0) continue;
          tw.cd -= 1; if (tw.cd > 0) continue;
          let tgt: Unit | null = null, best = Infinity;
          const rng = TOWER_RANGE * RANGE_UNIT * (1 + this.mod[t].range);
          for (const e of order) {
            if (e.team === t || e.hp <= 0) continue;
            const d = Math.hypot(e.x - tw.x, e.y - tw.y) - e.r;
            if (d <= rng && (d < best || (d === best && tgt && e.id < tgt.id))) { best = d; tgt = e; }
          }
          if (tgt) {
            const td = Math.max(1, TOWER_DMG * (1 + this.mod[t].dmg) * (1 - this.armorOf(tgt) / 100));
            unitDamage.set(tgt.id, (unitDamage.get(tgt.id) ?? 0) + td);
            this.events.push({ type: 'tower', team: t, side: s, to: tgt.id, dmg: td });
            tw.cd = Math.round(TICK_HZ / TOWER_RATE);
          } else tw.cd = 0;
        }
      }
    }
    for (const u of units) {
      const d = unitDamage.get(u.id);
      if (d) u.hp = Math.min(u.maxHp, u.hp - d);
    }
    if (this.towersOn) {
      for (const t of [0, 1] as Team[]) for (let s = 0; s < SIDES; s++) {
        const tw = this.towers[t][s], dmg = towerDmg[t][s];
        if (!dmg || tw.hp <= 0 || (this.survival && t === 1)) continue;
        tw.hp -= dmg;
        if (tw.hp <= 0) { tw.hp = 0; this.events.push({ type: 'towerDown', team: t, side: s }); }
      }
    }
    for (const t of [0, 1] as Team[]) { if (this.eff.shield[t] > 0) baseDmg[t] *= 0.5; baseDmg[t] *= 1 - this.mod[t].baseGuard; }
    if (this.survival) baseDmg[1] = 0;
    baseHp[0] -= baseDmg[0]; baseHp[1] -= baseDmg[1];
    for (const u of units) if (u.hp <= 0) {
      if (u.hero) { const h = this.hero[u.team]; if (h && h.unit === u.id) { h.unit = null; h.respawn = HERO_RESPAWN_SEC * TICK_HZ; } }
      this.kills[u.team === 0 ? 1 : 0]++; this.events.push({ type: 'die', unit: u.id, team: u.team, x: u.x, y: u.y });
    }
    for (let i = units.length - 1; i >= 0; i--) if (units[i].hp <= 0) units.splice(i, 1);

    // 4. 이동: 사거리 밖이면 목표 쪽으로(땅 유닛은 다리를 거쳐서), 사거리 안이면 멈춰서 공격
    for (const u of order) {
      if (u.hp <= 0) continue;
      u.px = u.x; u.py = u.y; u.moving = false;
      let goal: { x: number; y: number } | null = null;
      if (u.tgt) {
        const pos = this.posOfTarget(u.tgt);
        if (pos) {
          const dist = Math.hypot(pos.x - u.x, pos.y - u.y), gap = dist - pos.r - u.r, range = this.rangeOf(u), minR = minRangeTiles(u.stats);
          if (u.stats.family === 'repair') {
            const ally = u.tgt.kind === 'u' ? this.unitById(u.tgt.id) : null;
            if (ally && ally.hp < ally.maxHp) { if (gap > range) goal = pos; }          // 다친 아군: 사거리까지 다가가 치료
            else if (dist > 2.6) goal = pos;                                              // 아니면 앞선 아군 곁을 따른다
          } else if (gap > range || gap < minR) goal = pos;
        }
      } else if (!this.canHitBuildings(u)) {
        // 건물을 못 때리는 유닛(대공 전용): 적 진영 쪽으로 나아가되 포탑 사거리 밖에서 멈춘다
        const p = this.posOfTarget(this.objective(u));
        if (p && Math.hypot(p.x - u.x, p.y - u.y) > TOWER_RANGE * RANGE_UNIT + 1.5) goal = { x: p.x, y: p.y };
      }
      if (!goal) continue;
      const wp = this.waypoint(u, goal.x, goal.y);
      const dx = wp.x - u.x, dy = wp.y - u.y, d = Math.hypot(dx, dy);
      if (d < 1e-4) continue;
      const sp = u.stats.speed * SPEED_UNIT * (this.eff.slow[u.team] > 0 ? 0.6 : 1) * (1 + this.mod[u.team].speed) * dt;
      const step = Math.min(sp, d);
      u.x += (dx / d) * step; u.y += (dy / d) * step; u.moving = step > 1e-4;
      if (u.moving) u.face = Math.atan2(dy, dx);
    }
    // 4-b. 겹침 풀기(땅 유닛끼리·공중 유닛끼리 살짝 밀어낸다) + 벽·강 막기
    const live = order.filter(u => u.hp > 0);
    for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
      const a = live[i], b = live[j];
      if ((a.stats.move === 'air') !== (b.stats.move === 'air')) continue;
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), min = (a.r + b.r) * 0.9;
      if (d >= min) continue;
      const k = d < 1e-4 ? 0 : (min - d) / d * 0.5, ox = d < 1e-4 ? ((a.id % 2) ? 0.02 : -0.02) : dx * k, oy = d < 1e-4 ? 0 : dy * k;
      if (!(!a.moving && b.moving)) { a.x -= ox; a.y -= oy; }
      if (!(!b.moving && a.moving)) { b.x += ox; b.y += oy; }
    }
    for (const u of live) {
      u.x = clamp(u.x, 0.5, ARENA_W - 0.5); u.y = clamp(u.y, 0.5, ARENA_H - 0.5);
      if (u.stats.move === 'air' || !inBand(u.y)) continue;
      let bx = BRIDGE_X[0]; for (const x of BRIDGE_X) if (Math.abs(u.x - x) < Math.abs(u.x - bx)) bx = x;
      const lim = BRIDGE_HALF - u.r * 0.5;
      if (Math.abs(u.x - bx) <= lim) continue;
      if (inBand(u.py) && Math.abs(u.px - bx) <= lim + 0.01) u.x = bx + clamp(u.x - bx, -lim, lim);   // 다리 위: 옆으로 못 나간다
      else { u.x = u.px; u.y = u.py; }                                                               // 강물 옆으로는 못 들어간다
    }

    this.tick++;
    if (baseHp[0] <= 0 || baseHp[1] <= 0) this.over = true;
    return !this.over;
  }

  // ───────── 봇 ─────────
  /** 봇이 카드를 낼 자리: 위협이 많은 길의 포탑 앞쪽 (원거리는 조금 뒤, 공중은 가운데) */
  private pickSpot(t: Team, c: Prepared): { x: number; y: number } {
    const rng = this.rng, foe: Team = t === 0 ? 1 : 0;
    const press = [0, 0];
    for (const e of this.units) if (e.team === foe && e.hp > 0) {
      const mine = t === 0 ? e.y < RIVER_Y0 + 4 : e.y > RIVER_Y1 - 4;
      press[e.x < ARENA_W / 2 ? 0 : 1] += mine ? 2 : 0.5;
    }
    const mineBySide = [0, 0]; for (const m of this.units) if (m.team === t && m.hp > 0) mineBySide[m.x < ARENA_W / 2 ? 0 : 1]++;
    const score = [0, 1].map(s => press[s] - mineBySide[s] * 0.6 + rng() * 0.9);
    const side = score[0] >= score[1] ? 0 : 1;
    const air = c.stats.move === 'air', ranged = rangeTiles(c.stats) >= 4.2;
    for (let n = 0; n < 8; n++) {
      const x = air ? ARENA_W / 2 + (rng() - 0.5) * 7 : BRIDGE_X[side] + (rng() - 0.5) * 3.4;
      const ym = ranged ? 3.2 + rng() * 4 : 6.5 + rng() * 5.5;
      const y = t === 0 ? ym : ARENA_H - ym;
      if (canDeployAt(t, x, y)) return { x, y };
    }
    return { x: BRIDGE_X[side], y: t === 0 ? 11 : ARENA_H - 11 };
  }

  private botTurn(t: Team): void {
    const { units, watt, rng } = this;
    const mine = units.filter(u => u.team === t && !u.hero);
    if (this.botExtras(t)) return;   // 영웅 출격 와트를 모으는 중이면 이번 판단에는 카드를 사지 않는다
    if (mine.length >= MAX_UNITS_PER_TEAM) return;
    const enemies = units.filter(u => u.team !== t);
    const enemyAir = enemies.some(u => u.stats.move === 'air');
    // 다음에 낼 카드를 먼저 정하고, 와트가 모일 때까지 기다린다 (살 수 있는 걸 바로 사면 값싼 카드만 나가고 비싼 카드는 영영 못 나온다)
    const w = (c: Prepared) => (c.stats.target === 'air' ? (enemyAir ? 3 : 0.1) : enemyAir && c.stats.target === 'both' ? 3 : 1);
    let planned = this.plan[t];
    if (planned !== null && this.decks[t][planned].stats.target === 'air' && !enemyAir) planned = null; // 공중 적이 사라졌으면 계획 철회
    if (planned !== null && this.handOn && !this.hand[t].includes(planned)) planned = null;
    if (planned === null) {
      const weights: number[] = this.decks[t].map((c, i) => (this.handOn && !this.hand[t].includes(i) ? 0 : w(c)));
      if (!weights.some(x => x > 0)) weights[this.hand[t][0] ?? 0] = 1;
      let r = rng() * weights.reduce((x, y) => x + y, 0);
      planned = 0;
      for (let k = 0; k < weights.length; k++) { r -= weights[k]; if (weights[k] > 0 && r <= 0) { planned = k; break; } }
      this.plan[t] = planned;
    }
    if (this.costOf(t, planned) > watt[t] + 1e-9) return;
    const spot = this.pickSpot(t, this.decks[t][planned]);
    if (this.spawn(t, planned, spot.x, spot.y)) this.plan[t] = null;
  }

  private stepBoss(sec: number) {
    const bs = this.boss; if (!bs) return;
    const d = bs.def;
    if (!bs.spawned && sec >= d.spawnAt) {
      bs.spawned = true;
      const st = { ...d.stats };
      const u = this.makeUnit(1, ARENA_W / 2, ARENA_H - 9.5, st, -1, d.id, 1.5);
      this.units.push(u); bs.unit = u.id; bs.nextTick = this.tick + d.ability.every * TICK_HZ;
      this.pre.push({ type: 'spawn', unit: u.id, team: 1, x: u.x, y: u.y });
      this.pre.push({ type: 'skill', team: 1, skill: 'boss_arrive', x: u.x, y: u.y, unit: u.id });
      return;
    }
    const u = this.bossUnit();
    if (!u || u.hp <= 0 || this.tick < bs.nextTick) return;
    bs.nextTick = this.tick + d.ability.every * TICK_HZ;
    const mine = this.units.filter(x => x.team === 0 && x.hp > 0);
    if (d.ability.kind === 'airstrike') {
      for (const x of mine) { if (x.stats.move === 'air') x.hp -= 60; else if (Math.hypot(x.x - u.x, x.y - u.y) < 8) x.hp -= 25; }
    } else if (d.ability.kind === 'mortar') {
      const pool = [...mine]; for (let i = 0; i < 3 && pool.length; i++) { const k = Math.floor(this.rng() * pool.length); pool[k].hp -= 90; pool.splice(k, 1); }
    } else {
      for (const x of this.units) if (x.team === 1 && x.hp > 0) x.hp = Math.min(x.maxHp, x.hp + x.maxHp * 0.2);
    }
    this.pre.push({ type: 'skill', team: 1, skill: 'boss_' + d.ability.kind, x: u.x, y: u.y, unit: u.id });
  }

  // ───────── 스킬·영웅 (플레이어 명령 — 봇도 같은 함수를 쓴다) ─────────
  /** 스킬 칸 slot(0~1)을 쓴다. 자리가 필요한 스킬은 (x, y) 타일을 준다. 성공 여부를 돌려준다. */
  castSkill(team: Team, slot: number, x = -1, y = -1): boolean {
    if (this.over) return false;
    const def = skillById(this.skillIds[team][slot] ?? '');
    if (!def || this.skillCd[team][slot] > 0 || def.watt > this.watt[team] + 1e-9) return false;
    if (def.needsLane && !(x >= 0 && x <= ARENA_W && y >= 0 && y <= ARENA_H)) return false;
    const opp: Team = team === 0 ? 1 : 0, dur = Math.round((def.dur ?? 0) * TICK_HZ);
    this.watt[team] -= def.watt; this.wattSpent[team] += def.watt; this.skillUses[team]++;
    this.skillCd[team][slot] = Math.round(SKILL_COOLDOWN_SEC * TICK_HZ * (1 - this.mod[team].skillCd));
    switch (def.id) {
      case 'sk_bomb': for (const e of this.units) if (e.team === opp && e.hp > 0 && Math.hypot(e.x - x, e.y - y) <= BOMB_RADIUS + e.r) e.hp -= 80; break;
      case 'sk_overload': this.eff.overload[team] = dur; break;
      case 'sk_shield': this.eff.shield[team] = dur; break;
      case 'sk_repair': for (const a of this.units) if (a.team === team && a.hp > 0) a.hp = Math.min(a.maxHp, a.hp + a.maxHp * 0.25); break;
      case 'sk_slow': this.eff.slow[opp] = dur; break;
      case 'sk_armor': this.eff.armorDown[opp] = dur; break;
      case 'sk_strike': if (!this.survival) { this.baseHp[opp] -= this.eff.shield[opp] > 0 ? 30 : 60; if (this.baseHp[opp] <= 0) this.over = true; } break;
      case 'sk_charge': this.eff.charge[team] = dur; break;
    }
    const bp = basePos(opp);
    this.pre.push({ type: 'skill', team, skill: def.id, x: def.needsLane ? x : def.id === 'sk_strike' ? bp.x : basePos(team).x, y: def.needsLane ? y : def.id === 'sk_strike' ? bp.y : basePos(team).y, unit: null });
    return true;
  }

  /** 영웅 출격: 와트 6, 내 진영 어디든. 죽은 뒤 40초가 지나야 다시 나갈 수 있다. */
  deployHero(team: Team, x: number, y: number): boolean {
    const h = this.hero[team];
    if (this.rule?.id === 'rl_nohero') return false;
    if (this.over || !h || h.unit !== null || h.respawn > 0 || !canDeployAt(team, x, y) || this.watt[team] + 1e-9 < HERO_WATT) return false;
    this.watt[team] -= HERO_WATT; this.wattSpent[team] += HERO_WATT; this.heroDeploys[team]++;
    const hm = h.mult * (1 + this.mod[team].hero);
    const st = { ...h.def.stats, hp: Math.round(h.def.stats.hp * hm), dmg: Math.round(h.def.stats.dmg * hm) };
    const u = this.makeUnit(team, x, y, st, -1, h.def.id, 0.8);
    this.units.push(u); h.unit = u.id;
    this.pre.push({ type: 'spawn', unit: u.id, team, x, y });
    return true;
  }

  heroUnit(team: Team): Unit | null {
    const h = this.hero[team]; if (!h || h.unit === null) return null;
    return this.units.find(u => u.id === h.unit) ?? null;
  }

  /** 영웅 고유 기술 */
  castHeroSkill(team: Team): boolean {
    const h = this.hero[team], u = this.heroUnit(team);
    if (this.over || !h || !u || h.skillCd > 0) return false;
    const opp: Team = team === 0 ? 1 : 0, dir = team === 0 ? 1 : -1;
    h.skillCd = HERO_SKILL_COOLDOWN_SEC * TICK_HZ;
    if (h.def.id === 'hero_vanguard') {
      // 돌진: 목표 방향(없으면 앞)으로 2.4 타일 뛰어나가며 지나는 땅 적에게 피해 70
      const tp = u.tgt ? this.posOfTarget(u.tgt) : null;
      const ang = tp ? Math.atan2(tp.y - u.y, tp.x - u.x) : Math.PI / 2 * dir;
      const fx = u.x, fy = u.y, nx = clamp(u.x + Math.cos(ang) * 2.4, 0.5, ARENA_W - 0.5), ny = clamp(u.y + Math.sin(ang) * 2.4, 0.5, ARENA_H - 0.5);
      for (const e of this.units) {
        if (e.team !== opp || e.hp <= 0 || e.stats.move !== 'ground') continue;
        const t = clamp(((e.x - fx) * (nx - fx) + (e.y - fy) * (ny - fy)) / (Math.hypot(nx - fx, ny - fy) ** 2 || 1), 0, 1);
        if (Math.hypot(e.x - (fx + (nx - fx) * t), e.y - (fy + (ny - fy) * t)) <= 1.6) e.hp -= 70 * h.mult;
      }
      u.px = u.x; u.py = u.y; u.x = nx; u.y = ny; u.face = ang;
      if (!inBand(u.y) || u.stats.move === 'air') { /* 강 밖이면 그대로 */ } else { u.x = fx; u.y = fy; }
    } else if (h.def.id === 'hero_sniper') {
      const foes = this.units.filter(e => e.team === opp && e.hp > 0 && Math.hypot(e.x - u.x, e.y - u.y) <= 9);
      foes.sort((a, b) => Math.hypot(a.x - u.x, a.y - u.y) - Math.hypot(b.x - u.x, b.y - u.y) || a.id - b.id);
      for (const e of foes.slice(0, 4)) e.hp -= Math.max(1, 60 * h.mult * (1 - this.armorOf(e) * 0.6 / 100));
    } else {
      for (const a of this.units) if (a.team === team && a.hp > 0 && Math.hypot(a.x - u.x, a.y - u.y) <= 5) a.hp = Math.min(a.maxHp, a.hp + a.maxHp * 0.35);
      this.eff.shield[team] = Math.max(this.eff.shield[team], 4 * TICK_HZ);
    }
    this.pre.push({ type: 'skill', team, skill: h.def.id, x: u.x, y: u.y, unit: u.id });
    return true;
  }

  /** 봇의 스킬·영웅 사용 (스킬·영웅을 받은 팀만) */
  private botExtras(t: Team): boolean {
    const opp: Team = t === 0 ? 1 : 0;
    const mine = this.units.filter(u => u.team === t && !u.hero), foes = this.units.filter(u => u.team === opp && !u.hero && u.hp > 0);
    const avgHp = mine.length ? mine.reduce((a, u) => a + u.hp / u.maxHp, 0) / mine.length : 1;
    const h = this.rule?.id === 'rl_nohero' ? null : this.hero[t]; let saving = false;
    // 위협이 가장 큰 쪽(왼쪽·오른쪽)과 적이 가장 뭉친 곳
    const near = foes.filter(e => (t === 0 ? e.y < RIVER_Y0 + 5 : e.y > RIVER_Y1 - 5));
    const sideCnt = [0, 0]; for (const e of near.length ? near : foes) sideCnt[e.x < ARENA_W / 2 ? 0 : 1]++;
    const hotSide = sideCnt[0] >= sideCnt[1] ? 0 : 1;
    if (h) {
      if (h.unit === null && h.respawn === 0 && mine.length >= 2) {
        if (this.watt[t] >= HERO_WATT) { const y = t === 0 ? 9 : ARENA_H - 9; const x = BRIDGE_X[hotSide] + (this.rng() - 0.5) * 2; if (!this.deployHero(t, x, y)) this.deployHero(t, BRIDGE_X[hotSide], t === 0 ? 11 : ARENA_H - 11); }
        else saving = true;
      } else {
        const u = this.heroUnit(t);
        if (u && foes.some(e => Math.hypot(e.x - u.x, e.y - u.y) <= 5)) this.castHeroSkill(t);
      }
    }
    // 폭격 자리: 반경 안에 적이 가장 많은 적 유닛 위치
    let bombAt: { x: number; y: number; n: number } = { x: 0, y: 0, n: 0 };
    for (const e of foes) { let n = 0, sx = 0, sy = 0; for (const f of foes) if (Math.hypot(f.x - e.x, f.y - e.y) <= BOMB_RADIUS) { n++; sx += f.x; sy += f.y; } if (n > bombAt.n) bombAt = { x: sx / n, y: sy / n, n }; }
    this.skillIds[t].forEach((id, slot) => {
      if (this.skillCd[t][slot] > 0) return;
      const def = skillById(id); if (!def || this.watt[t] < def.watt) return;
      const ok = id === 'sk_bomb' ? bombAt.n >= 2
        : id === 'sk_overload' ? mine.length >= 3 && foes.length >= 2
        : id === 'sk_shield' ? this.baseHp[t] < BASE_HP * 0.8 && foes.length >= 1
        : id === 'sk_repair' ? mine.length >= 3 && avgHp < 0.6
        : id === 'sk_slow' || id === 'sk_armor' ? foes.length >= 3
        : id === 'sk_strike' ? true
        : this.watt[t] < 6;
      if (ok) this.castSkill(t, slot, def.needsLane ? bombAt.x : -1, def.needsLane ? bombAt.y : -1);
    });
    return saving && this.hero[t]!.unit === null;
  }

  // ───────── 지휘 모듈 (판 중 3택 1) ─────────
  private openOffer(): void {
    const idx = this.offerIdx++;
    for (const t of [0, 1] as Team[]) {
      if (this.survival && t === 1) continue;
      const ids = offerFor(this.seed, t, idx, this.picked[t]);
      if (!ids.length) continue;
      if (this.bots[t]) this.apply(t, moduleById(ids[Math.floor(this.modRng() * ids.length)])!);
      else this.offer = { team: t, index: idx, ids };
    }
  }

  /** 사람이 3장 중 하나를 고른다. 성공 여부를 돌려준다 */
  choose(team: Team, id: string): boolean {
    const o = this.offer;
    if (!o || o.team !== team || !o.ids.includes(id)) return false;
    this.offer = null;
    this.apply(team, moduleById(id)!);
    return true;
  }

  private apply(team: Team, def: ModuleDef): void {
    const before = this.mod[team].hp;
    addMods(this.mod[team], def);
    this.picked[team].push(def.id);
    if (def.mods?.hp) {
      const r = (1 + this.mod[team].hp) / (1 + before);
      for (const u of this.units) if (u.team === team && !u.hero && u.hp > 0) { u.maxHp = Math.round(u.maxHp * r); u.hp = Math.round(u.hp * r); u.stats = { ...u.stats, hp: u.maxHp }; }
    }
    if (def.instant === 'repair') {
      for (const u of this.units) if (u.team === team && u.hp > 0) u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.4);
      this.baseHp[team] = Math.min(BASE_HP, this.baseHp[team] + 100);
    } else if (def.instant === 'surge') this.watt[team] = Math.min(WATT_POOL, this.watt[team] + 4);
    else if (def.instant === 'towerHp') {
      for (const tw of this.towers[team]) if (tw.hp > 0) { tw.maxHp = Math.round(tw.maxHp + TOWER_HP * 0.4); tw.hp = Math.min(tw.maxHp, tw.hp + TOWER_HP * 0.4); }
    }
    this.pre.push({ type: 'module', team, id: def.id });
  }

  /** 5분 버티기 이어하기(광고): 내 기지를 절반 체력으로 되살리고 30초 보호막, 내 진영에 들어온 적은 쓸어낸다 */
  revive(): void {
    if (!this.survival || !this.over) return;
    this.over = false; this.continued++;
    this.baseHp[0] = BASE_HP * 0.5; this.eff.shield[0] = Math.max(this.eff.shield[0], 30 * TICK_HZ);
    for (const u of this.units) if (u.team === 1 && !u.hero && u.y < RIVER_Y0) u.hp = 0;
    this.units.splice(0, this.units.length, ...this.units.filter(u => u.hp > 0));
  }

  result(): BattleResult {
    const winner: Team | -1 = this.survival ? (this.baseHp[0] > 0 ? 0 : 1) : this.baseHp[0] <= 0 || this.baseHp[1] <= 0 ? (this.baseHp[0] > this.baseHp[1] ? 0 : 1) : this.crowns(0) !== this.crowns(1) ? (this.crowns(0) > this.crowns(1) ? 0 : 1) : this.baseHp[0] === this.baseHp[1] ? -1 : this.baseHp[0] > this.baseHp[1] ? 0 : 1;
    return {
      winner, baseHp: [Math.max(0, this.baseHp[0]), Math.max(0, this.baseHp[1])], seconds: this.tick / TICK_HZ, overtime: this.overtime, crowns: [this.crowns(0), this.crowns(1)], skillUses: [...this.skillUses], heroDeploys: [...this.heroDeploys], wattSpent: [...this.wattSpent],
      spawned: [...this.spawned], kills: [...this.kills], spawnsByCard: [[...this.spawnsByCard[0]], [...this.spawnsByCard[1]]], damageByCard: [[...this.damageByCard[0]], [...this.damageByCard[1]]],
      modules: [[...this.picked[0]], [...this.picked[1]]],
    } as BattleResult;
  }
}

/** 봇끼리 끝까지 돌린다 (balance-sim·재생용) */
export function simulate(deckA: Deck, deckB: Deck, parts: Part[], seed: number, opts: BattleOptions = {}): BattleResult {
  const b = new Battle(deckA, deckB, parts, seed, opts);
  while (b.step()) { /* 끝날 때까지 */ }
  return b.result();
}
