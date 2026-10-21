import type { Part } from '../../data/parts';
import { assemble, type Build, type UnitStats } from '../assemble';
import { scaleStats } from '../upgrade';
import { mulberry32, type Rng } from '../rng';
import { bossById, type BossDef } from '../../data/bosses';
import { ruleById, stormMult, WEAK_TOWER_MULT, type RuleDef } from '../../data/rules';
import { zeroMods, addMods, offerFor, moduleById, OFFER_TIMES, SURVIVAL_OFFER_TIMES, type Mods, type ModuleDef } from '../modules';
import { skillById, heroById, SKILL_COOLDOWN_SEC, HERO_WATT, HERO_RESPAWN_SEC, HERO_SKILL_COOLDOWN_SEC, HERO_MOVE_SEC, HERO_MOVE_COOLDOWN_SEC, type HeroDef } from '../loadout';

/**
 * 3분 세로 전투 (기획안 FINAL §5, TD-002). 고정 틱(20Hz) 결정론 — 같은 입력(덱·시드·플레이어 명령)이면 같은 결과.
 * `Battle` 은 한 틱씩 전진시킬 수 있어 화면(Phaser)이 그대로 쓰고, `simulate` 는 봇끼리 끝까지 돌려
 * balance-sim·비동기 PvP 재생·V2 서버가 같은 코드를 쓴다. 3 길(좌·중·우), 길 길이 100, 아군 기지 0 / 적 기지 100.
 */
export const TICK_HZ = 20;
export const MATCH_SECONDS = 180;
export const OVERTIME_SECONDS = 60;
export const LANES = 3;
export const LANE_LEN = 100;
export const RANGE_UNIT = 3;      // 부품 사거리 1 = 길 위 3 칸
export const SPEED_UNIT = 1.5;    // 부품 속도 1 = 초당 1.5 칸
export const BASE_HP = 1000;
export const WATT_POOL = 10;
export const WATT_PER_SEC = 0.5;  // 2초에 1
export const FINAL_MINUTE_MULT = 2;  // 마지막 1분 더블 와트 (CEO 2026-10-19, 1.5 → 2)
export const OVERTIME_MULT = 2;
export const POINT_LANE = 1;
export const POINT_POS = 50;
export const POINT_RADIUS = 8;
export const POINT_CAPTURE_SEC = 5;
export const POINT_BONUS = 1.5;
export const MAX_UNITS_PER_TEAM = 12;
export const SPLASH_RADIUS = 4;
export const SPLASH_MULT = 0.5;
export const BOT_THINK_TICKS = 10; // 0.5초마다 생산 판단

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

export interface Unit {
  id: number; team: Team; lane: number; pos: number;
  /** 직전 틱의 위치·이동 여부 — 화면이 20Hz 틱 사이를 매끄럽게 이을 때만 쓴다(규칙과 무관) */
  prev: number; moving: boolean;
  /** 영웅이면 영웅 id(card 는 -1). ghost>0 은 길을 옮기는 중(맞지도 때리지도 않음) */
  hero: string | null; ghost: number; toLane: number; moveCd: number;
  hp: number; maxHp: number; stats: UnitStats; cd: number; card: number;
}

export type BattleEvent =
  | { type: 'spawn'; unit: number; team: Team; lane: number }
  | { type: 'attack'; from: number; to: number | null; baseOf: Team | null; lane: number; family: string; towerOf?: Team; /** 실제로 들어간 피해(치료는 회복량) — 화면 숫자용 */ dmg?: number }   // towerOf: 그 팀의 같은 길 포탑을 공격
  | { type: 'die'; unit: number; team: Team; lane: number; pos: number }
  | { type: 'tower'; team: Team; lane: number; to: number; dmg: number }          // 포탑이 유닛을 쏨
  | { type: 'towerDown'; team: Team; lane: number }                  // 포탑 파괴 (team = 무너진 쪽)
  | { type: 'point'; controller: Team | -1 }
  | { type: 'skill'; team: Team; skill: string; lane: number; unit: number | null }
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
  /** 5분 버티기: 300초, 적 기지는 무적, 15초마다 적이 강해진다. 5분 동안 내 기지가 버티면 승리 */
  survival?: boolean;
  /** 길마다 방어 포탑을 둔다 (기본 켬) */
  towers?: boolean;
  /** 판 중 지휘 모듈 3택 1 (기본 끔 — 실제 전투·스테이지 시뮬만 켠다) */
  modules?: boolean;
  /** 작전 변형 규칙 id (data/rules.ts) — 양쪽에 똑같이 적용 */
  rule?: string | null;
  /** 클래시 로얄식 손패: 덱을 섞어 4장만 손에 들고, 낸 카드는 맨 뒤로 가며 다음 카드가 그 자리에 들어온다 (기본 끔) */
  hand?: boolean;
}

export const HAND_SIZE = 4;

/** 사람이 고를 차례인 모듈 3장 */
export interface ModuleOffer { team: Team; index: number; ids: string[] }

export interface Tower { hp: number; maxHp: number; cd: number }

/** 길마다 양쪽에 방어 포탑 1기 (클래시 로얄식 왕관 규칙): 포탑이 서 있는 길에서는 기지를 못 때린다. 포탑 1기 파괴 = 왕관 1개, 시간이 끝나면 왕관이 많은 쪽이 이긴다. */
export const TOWER_HP = 420;
export const TOWER_ARMOR = 15;
export const TOWER_DMG = 18;
export const TOWER_RATE = 1;        // 초당 1발
export const TOWER_RANGE = 7;       // 사거리 7 = 길 위 21 칸 (중거리 무기와 같다 — 밖에서 일방적으로 못 깎게)
export const TOWER_NEAR = 12;       // 내(팀 0) 포탑 위치
export const TOWER_FAR = 88;        // 적(팀 1) 포탑 위치
export const SURVIVAL_SECONDS = 300;
export const WAVE_SECONDS = 15;

export interface HeroState { def: HeroDef; unit: number | null; respawn: number; skillCd: number; mult: number }
/** 스킬 효과가 남은 틱 수 (팀별) */
export interface Effects { overload: [number, number]; shield: [number, number]; slow: [number, number]; armorDown: [number, number]; charge: [number, number] }

export class Battle {
  readonly decks: [Prepared[], Prepared[]];
  readonly units: Unit[] = [];
  readonly baseHp: [number, number] = [BASE_HP, BASE_HP];
  readonly watt: [number, number] = [WATT_POOL / 2, WATT_POOL / 2];
  readonly spawned: [number, number] = [0, 0];
  readonly kills: [number, number] = [0, 0];
  readonly spawnsByCard: [number[], number[]];
  readonly damageByCard: [number[], number[]];
  readonly pointTimer: [number, number] = [0, 0];
  readonly skillUses: [number, number] = [0, 0];
  readonly heroDeploys: [number, number] = [0, 0];
  readonly wattSpent: [number, number] = [0, 0];
  /** 5분 버티기 이어하기(광고)를 쓴 횟수 */
  continued = 0;
  controller: Team | -1 = -1;
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
  /** towers[팀][길] */
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
    for (const t of [0, 1] as Team[]) this.towers[t] = Array.from({ length: LANES }, () => ({ hp: th, maxHp: th, cd: 0 }));
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

  get seconds(): number { return this.tick / TICK_HZ; }
  /** 팀 t 가 얻은 왕관 수 = 무너뜨린 상대 포탑 수 */
  crowns(t: Team): number { return this.towersOn ? this.towers[t === 0 ? 1 : 0].filter(x => x.hp <= 0).length : 0; }
  private towerAlive(team: Team, lane: number): boolean { return this.towersOn && this.towers[team][lane].hp > 0; }
  /** 남은 시간(초). 연장 중에는 연장 남은 시간 */
  get remaining(): number { return Math.max(0, (this.overtime ? this.matchSec + OVERTIME_SECONDS : this.matchSec) - this.seconds); }
  /** 5분 버티기의 현재 웨이브(0부터) */
  get wave(): number { return this.survival ? Math.floor(this.seconds / WAVE_SECONDS) : 0; }
  /** 지금 보스 유닛(나온 뒤 살아 있을 때) */
  bossUnit(): Unit | null { const b = this.boss; return b && b.unit !== null ? this.units.find(u => u.id === b.unit) ?? null : null; }
  get bossDef(): BossDef | null { return this.boss?.def ?? null; }
  get bossSpawned(): boolean { return !!this.boss?.spawned; }

  /** 플레이어(또는 외부)가 카드를 생산한다. 와트·동시 유닛 상한을 지키며 성공 여부를 돌려준다. */
  spawn(team: Team, cardIdx: number, lane: number): boolean {
    if (this.over) return false;
    const card = this.decks[team][cardIdx];
    if (!card || lane < 0 || lane >= LANES) return false;
    if (this.handOn && !this.hand[team].includes(cardIdx)) return false;
    const cost = this.costOf(team, cardIdx);
    if (cost > this.watt[team] + 1e-9) return false;
    if (this.count(team) >= MAX_UNITS_PER_TEAM) return false;
    this.watt[team] -= cost; this.wattSpent[team] += cost;
    const u: Unit = { id: this.nextId++, team, lane, pos: team === 0 ? 0 : LANE_LEN, prev: team === 0 ? 0 : LANE_LEN, moving: false, hero: null, ghost: 0, toLane: lane, moveCd: 0, hp: 0, maxHp: 0, stats: card.stats, cd: 0, card: cardIdx };
    if (this.survival && team === 1) { const w = this.wave; u.stats = { ...card.stats, hp: Math.round(card.stats.hp * (1 + 0.07 * w)), dmg: Math.round(card.stats.dmg * (1 + 0.05 * w) * 100) / 100 }; }
    if (this.mod[team].hp) u.stats = { ...u.stats, hp: Math.round(u.stats.hp * (1 + this.mod[team].hp)) };
    u.hp = u.maxHp = u.stats.hp;
    this.units.push(u);
    this.spawned[team]++; this.spawnsByCard[team][cardIdx]++;
    if (this.handOn) this.cycle(team, cardIdx);
    this.pre.push({ type: 'spawn', unit: u.id, team, lane });
    return true;
  }

  /** 낸 카드는 대기열 맨 뒤로, 맨 앞 카드가 그 자리에 들어온다 */
  private cycle(team: Team, cardIdx: number): void {
    const k = this.hand[team].indexOf(cardIdx); if (k < 0) return;
    this.queue[team].push(cardIdx); this.hand[team][k] = this.queue[team].shift()!;
  }
  /** 다음에 손으로 들어올 카드(덱 번호) */
  nextCard(team: Team): number | null { return this.queue[team][0] ?? null; }

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

    const { units, baseHp, watt, rng } = this;
    const basePos = (t: Team) => (t === 0 ? LANE_LEN : 0); // t 가 공격하는 상대 기지 위치

    // 0. 스킬·영웅 쿨다운과 효과 시간
    for (const t of [0, 1] as Team[]) {
      this.skillCd[t] = this.skillCd[t].map(c => Math.max(0, c - 1));
      for (const k of ['overload', 'shield', 'slow', 'armorDown', 'charge'] as const) this.eff[k][t] = Math.max(0, this.eff[k][t] - 1);
      const h = this.hero[t]; if (h) { h.respawn = Math.max(0, h.respawn - 1); h.skillCd = Math.max(0, h.skillCd - 1); }
    }
    for (const u of this.units) {
      if (u.moveCd > 0) u.moveCd--;
      const rg = this.mod[u.team].regen;
      if (rg && u.hp > 0 && u.hp < u.maxHp) u.hp = Math.min(u.maxHp, u.hp + (u.maxHp * rg) / TICK_HZ);
    }

    // 1. 와트 충전
    const mult = this.overtime ? OVERTIME_MULT : !this.survival && sec >= this.matchSec - 60 ? FINAL_MINUTE_MULT : 1;
    for (const t of [0, 1] as Team[]) {
      const bonus = (this.controller === t ? POINT_BONUS : 1) * (this.eff.charge[t] > 0 ? 2 : 1) * (1 + this.mod[t].wattRate) * (this.rule?.id === 'rl_storm' ? stormMult(sec) : 1);
      watt[t] = Math.min(WATT_POOL, watt[t] + (WATT_PER_SEC * mult * bonus * this.wattMult[t] * (this.survival && t === 1 ? 1 + 0.04 * this.wave : 1)) / TICK_HZ);
    }

    // 2. 생산 판단 (봇)
    if (this.tick % BOT_THINK_TICKS === 0) {
      for (const t of [0, 1] as Team[]) {
        if (!this.bots[t]) continue;
        const mine = units.filter(u => u.team === t && !u.hero);
        if (this.botExtras(t)) continue;   // 영웅 출격 와트를 모으는 중이면 이번 판단에는 카드를 사지 않는다
        if (mine.length >= MAX_UNITS_PER_TEAM) continue;
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
        if (this.costOf(t, planned) > watt[t] + 1e-9) continue;
        // 길: 적이 많은 길을 우선, 동률이면 무작위
        const pressure = [0, 0, 0];
        for (const e of enemies) pressure[e.lane] += 1;
        const mineByLane = [0, 0, 0];
        for (const m of mine) mineByLane[m.lane] += 1;
        const score = pressure.map((p, l) => p - mineByLane[l] + rng() * 0.9);
        if (this.spawn(t, planned, score.indexOf(Math.max(...score)))) this.plan[t] = null;
      }
    }

    // 2-b. 보스: 때가 되면 나오고, 주기 기술을 쓴다
    this.stepBoss(sec);

    // 3. 공격 (피해는 모아 두었다가 동시에 적용). 치료(repair)는 같은 편 부상자에게 음수 피해로 들어간다.
    const unitDamage = new Map<number, number>();
    const baseDmg: [number, number] = [0, 0];
    const towerDmg: [number[], number[]] = [[0, 0, 0], [0, 0, 0]];
    for (const u of units) {
      if (u.ghost > 0) { u.ghost--; if (u.ghost === 0) { u.lane = u.toLane; u.moveCd = HERO_MOVE_COOLDOWN_SEC * TICK_HZ; u.cd = 0; } continue; }
      if (u.hp <= 0) continue;
      u.cd -= 1;
      if (u.cd > 0) continue;
      const mu = this.mod[u.team];
      const range = u.stats.range * RANGE_UNIT * (1 + mu.range);
      const pc = Math.min(0.9, u.stats.pierce + mu.pierce);
      const rate = Math.max(0.2, u.stats.rate) * (this.eff.overload[u.team] > 0 ? 1.3 : 1) * (1 + mu.rate);
      if (u.stats.family === 'repair') {
        // 사거리 안에서 체력 비율이 가장 낮은 아군 (자기 자신 제외)
        let ally: Unit | null = null, low = 1;
        for (const a of units) {
          if (a === u || a.team !== u.team || a.lane !== u.lane || a.hp >= a.maxHp || a.ghost > 0) continue;
          if (Math.abs(a.pos - u.pos) > range) continue;
          const f = a.hp / a.maxHp;
          if (f < low || (f === low && ally && a.id < ally.id)) { low = f; ally = a; }
        }
        if (ally) {
          unitDamage.set(ally.id, (unitDamage.get(ally.id) ?? 0) - u.stats.dmg);
          if (u.stats.splash > 0) {
            for (const a of units) {
              if (a === ally || a === u || a.team !== u.team || a.lane !== u.lane || a.hp >= a.maxHp || Math.abs(a.pos - ally.pos) > u.stats.splash) continue;
              unitDamage.set(a.id, (unitDamage.get(a.id) ?? 0) - u.stats.dmg * SPLASH_MULT);
            }
          }
          this.credit(u, u.stats.dmg * 0.5); // 치료 기여는 절반으로 쳐서 결과 화면 순위에 반영
          this.events.push({ type: 'attack', from: u.id, to: ally.id, baseOf: null, lane: u.lane, family: 'repair', dmg: u.stats.dmg });
          u.cd = Math.round(TICK_HZ / rate);
        } else u.cd = 0;
        continue;
      }
      const minR = u.stats.minRange * RANGE_UNIT;
      let target: Unit | null = null, best = Infinity;
      for (const e of units) {
        if (e.team === u.team || e.lane !== u.lane || e.ghost > 0 || e.hp <= 0 || !canHit(u.stats, e.stats)) continue;
        const d = Math.abs(e.pos - u.pos);
        if (d <= range && d >= minR && (d < best || (d === best && target && e.id < target.id))) { best = d; target = e; }
      }
      if (target) {
        const armor = this.armorOf(target) * (1 - pc);
        const dealt = Math.max(1, u.stats.dmg * (1 + mu.dmg) * (1 - armor / 100));
        unitDamage.set(target.id, (unitDamage.get(target.id) ?? 0) + dealt);
        this.credit(u, dealt);
        this.events.push({ type: 'attack', from: u.id, to: target.id, baseOf: null, lane: u.lane, family: u.stats.family, dmg: dealt });
        if (u.stats.splash > 0) {
          for (const e of units) {
            if (e === target || e.team === u.team || e.lane !== u.lane || e.ghost > 0 || e.stats.move !== target.stats.move) continue;
            if (Math.abs(e.pos - target.pos) <= u.stats.splash) {
              const sp = Math.max(1, u.stats.dmg * (1 + mu.dmg) * SPLASH_MULT * (1 - this.armorOf(e) * (1 - pc) / 100));
              unitDamage.set(e.id, (unitDamage.get(e.id) ?? 0) + sp);
              this.credit(u, sp);
            }
          }
        }
        u.cd = Math.round(TICK_HZ / rate);
      } else if (this.towerAlive(u.team === 0 ? 1 : 0, u.lane)) {
        // 상대 포탑이 서 있으면 먼저 포탑을 친다 (공중 전용 무기는 못 침)
        const opp: Team = u.team === 0 ? 1 : 0, tp = u.team === 0 ? TOWER_FAR : TOWER_NEAR, d = Math.abs(tp - u.pos);
        if (u.stats.target !== 'air' && d <= range && d >= minR) {
          const dealt = Math.max(1, u.stats.dmg * (1 + mu.dmg) * (1 + mu.towerDmg) * (1 - TOWER_ARMOR * (1 - pc) / 100));
          towerDmg[opp][u.lane] += dealt; this.credit(u, dealt);
          this.events.push({ type: 'attack', from: u.id, to: null, baseOf: null, towerOf: opp, lane: u.lane, family: u.stats.family, dmg: dealt });
          u.cd = Math.round(TICK_HZ / rate);
        } else u.cd = 0;
      } else if (Math.abs(basePos(u.team) - u.pos) <= range && Math.abs(basePos(u.team) - u.pos) >= minR && u.stats.target !== 'air') {
        const opp: Team = u.team === 0 ? 1 : 0;
        const bd = u.stats.dmg * (1 + mu.dmg) * (1 + mu.towerDmg);
        baseDmg[opp] += bd;
        this.credit(u, bd);
        this.events.push({ type: 'attack', from: u.id, to: null, baseOf: opp, lane: u.lane, family: u.stats.family });
        u.cd = Math.round(TICK_HZ / rate);
      } else {
        u.cd = 0;
      }
    }
    // 3-b. 포탑 사격 (같은 길에서 가장 가까운 적 유닛 하나)
    if (this.towersOn) {
      for (const t of [0, 1] as Team[]) {
        for (let l = 0; l < LANES; l++) {
          const tw = this.towers[t][l]; if (tw.hp <= 0) continue;
          tw.cd -= 1; if (tw.cd > 0) continue;
          const tp = t === 0 ? TOWER_NEAR : TOWER_FAR; let tgt: Unit | null = null, best = Infinity;
          for (const e of units) {
            if (e.team === t || e.lane !== l || e.ghost > 0 || e.hp <= 0) continue;
            const d = Math.abs(e.pos - tp);
            if (d <= TOWER_RANGE * RANGE_UNIT && (d < best || (d === best && tgt && e.id < tgt.id))) { best = d; tgt = e; }
          }
          if (tgt) {
            const td = Math.max(1, TOWER_DMG * (1 - this.armorOf(tgt) / 100));
            unitDamage.set(tgt.id, (unitDamage.get(tgt.id) ?? 0) + td);
            this.events.push({ type: 'tower', team: t, lane: l, to: tgt.id, dmg: td });
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
      for (const t of [0, 1] as Team[]) for (let l = 0; l < LANES; l++) {
        const tw = this.towers[t][l], dmg = towerDmg[t][l];
        if (!dmg || tw.hp <= 0 || (this.survival && t === 1)) continue;
        tw.hp -= dmg;
        if (tw.hp <= 0) { tw.hp = 0; this.events.push({ type: 'towerDown', team: t, lane: l }); }
      }
    }
    for (const t of [0, 1] as Team[]) { if (this.eff.shield[t] > 0) baseDmg[t] *= 0.5; baseDmg[t] *= 1 - this.mod[t].baseGuard; }
    if (this.survival) baseDmg[1] = 0;
    baseHp[0] -= baseDmg[0]; baseHp[1] -= baseDmg[1];
    for (const u of units) if (u.hp <= 0) {
      if (u.hero) { const h = this.hero[u.team]; if (h && h.unit === u.id) { h.unit = null; h.respawn = HERO_RESPAWN_SEC * TICK_HZ; } }
      this.kills[u.team === 0 ? 1 : 0]++; this.events.push({ type: 'die', unit: u.id, team: u.team, lane: u.lane, pos: u.pos }); }
    for (let i = units.length - 1; i >= 0; i--) if (units[i].hp <= 0) units.splice(i, 1);

    // 4. 이동 (공격할 대상·기지가 사거리 안에 없을 때만)
    for (const u of units) {
      if (u.ghost > 0) { u.prev = u.pos; u.moving = false; continue; }
      const range = u.stats.range * RANGE_UNIT * (1 + this.mod[u.team].range), minR = u.stats.minRange * RANGE_UNIT;
      let engaged = false;
      if (u.stats.family === 'repair') {
        engaged = units.some(a => a !== u && a.team === u.team && a.lane === u.lane && a.hp < a.maxHp && a.ghost === 0 && Math.abs(a.pos - u.pos) <= range);
      } else {
        for (const e of units) {
          const d = Math.abs(e.pos - u.pos);
          if (e.team !== u.team && e.lane === u.lane && e.ghost === 0 && canHit(u.stats, e.stats) && d <= range && d >= minR) { engaged = true; break; }
        }
        const oppT: Team = u.team === 0 ? 1 : 0;
        if (!engaged && this.towerAlive(oppT, u.lane)) {
          const td = Math.abs((u.team === 0 ? TOWER_FAR : TOWER_NEAR) - u.pos);
          if (u.stats.target !== 'air' && td <= range && td >= minR) engaged = true;
        } else {
          const bd = Math.abs(basePos(u.team) - u.pos);
          if (!engaged && bd <= range && bd >= minR && u.stats.target !== 'air') engaged = true;
        }
      }
      u.prev = u.pos; u.moving = false;
      if (!engaged) { u.pos = Math.min(LANE_LEN, Math.max(0, u.pos + (u.team === 0 ? 1 : -1) * u.stats.speed * (this.eff.slow[u.team] > 0 ? 0.6 : 1) * (1 + this.mod[u.team].speed) * SPEED_UNIT / TICK_HZ)); u.moving = u.pos !== u.prev; }
    }

    // 5. 중앙 거점 점유
    const near: [number, number] = [0, 0];
    for (const u of units) if (u.ghost === 0 && u.lane === POINT_LANE && Math.abs(u.pos - POINT_POS) <= POINT_RADIUS) near[u.team]++;
    for (const t of [0, 1] as Team[]) {
      const o: Team = t === 0 ? 1 : 0;
      if (near[t] > 0 && near[o] === 0) this.pointTimer[t] = Math.min(POINT_CAPTURE_SEC, this.pointTimer[t] + (1 + this.mod[t].capture) / TICK_HZ);
      else if (near[o] > 0) this.pointTimer[t] = 0;
    }
    const prev = this.controller;
    this.controller = this.pointTimer[0] >= POINT_CAPTURE_SEC ? 0 : this.pointTimer[1] >= POINT_CAPTURE_SEC ? 1 : -1;
    if (prev !== this.controller) this.events.push({ type: 'point', controller: this.controller });

    this.tick++;
    if (baseHp[0] <= 0 || baseHp[1] <= 0) this.over = true;
    return !this.over;
  }

  private stepBoss(sec: number) {
    const bs = this.boss; if (!bs) return;
    const d = bs.def;
    if (!bs.spawned && sec >= d.spawnAt) {
      bs.spawned = true;
      const st = { ...d.stats };
      const u: Unit = { id: this.nextId++, team: 1, lane: 1, pos: LANE_LEN, prev: LANE_LEN, moving: false, hero: d.id, ghost: 0, toLane: 1, moveCd: 0, hp: st.hp, maxHp: st.hp, stats: st, cd: 0, card: -1 };
      this.units.push(u); bs.unit = u.id; bs.nextTick = this.tick + d.ability.every * TICK_HZ;
      this.pre.push({ type: 'spawn', unit: u.id, team: 1, lane: 1 });
      this.pre.push({ type: 'skill', team: 1, skill: 'boss_arrive', lane: 1, unit: u.id });
      return;
    }
    const u = this.bossUnit();
    if (!u || u.hp <= 0 || this.tick < bs.nextTick) return;
    bs.nextTick = this.tick + d.ability.every * TICK_HZ;
    const mine = this.units.filter(x => x.team === 0 && x.ghost === 0 && x.hp > 0);
    if (d.ability.kind === 'airstrike') {
      for (const x of mine) { if (x.stats.move === 'air') x.hp -= 60; else if (x.lane === u.lane) x.hp -= 25; }
    } else if (d.ability.kind === 'mortar') {
      const pool = [...mine]; for (let i = 0; i < 3 && pool.length; i++) { const k = Math.floor(this.rng() * pool.length); pool[k].hp -= 90; pool.splice(k, 1); }
    } else {
      for (const x of this.units) if (x.team === 1 && x.hp > 0) x.hp = Math.min(x.maxHp, x.hp + x.maxHp * 0.2);
    }
    this.pre.push({ type: 'skill', team: 1, skill: 'boss_' + d.ability.kind, lane: u.lane, unit: u.id });
  }

  // ───────── 스킬·영웅 (플레이어 명령 — 봇도 같은 함수를 쓴다) ─────────
  /** 스킬 칸 slot(0~1)을 쓴다. 길이 필요한 스킬은 lane 을 준다. 성공 여부를 돌려준다. */
  castSkill(team: Team, slot: number, lane = -1): boolean {
    if (this.over) return false;
    const def = skillById(this.skillIds[team][slot] ?? '');
    if (!def || this.skillCd[team][slot] > 0 || def.watt > this.watt[team] + 1e-9) return false;
    if (def.needsLane && (lane < 0 || lane >= LANES)) return false;
    const opp: Team = team === 0 ? 1 : 0, dur = Math.round((def.dur ?? 0) * TICK_HZ);
    this.watt[team] -= def.watt; this.wattSpent[team] += def.watt; this.skillUses[team]++;
    this.skillCd[team][slot] = Math.round(SKILL_COOLDOWN_SEC * TICK_HZ * (1 - this.mod[team].skillCd));
    switch (def.id) {
      case 'sk_bomb': for (const e of this.units) if (e.team === opp && e.lane === lane && e.ghost === 0) e.hp -= 80; break;
      case 'sk_overload': this.eff.overload[team] = dur; break;
      case 'sk_shield': this.eff.shield[team] = dur; break;
      case 'sk_repair': for (const a of this.units) if (a.team === team && a.hp > 0) a.hp = Math.min(a.maxHp, a.hp + a.maxHp * 0.25); break;
      case 'sk_slow': this.eff.slow[opp] = dur; break;
      case 'sk_armor': this.eff.armorDown[opp] = dur; break;
      case 'sk_strike': if (!this.survival) { this.baseHp[opp] -= this.eff.shield[opp] > 0 ? 30 : 60; if (this.baseHp[opp] <= 0) this.over = true; } break;
      case 'sk_charge': this.eff.charge[team] = dur; break;
    }
    this.pre.push({ type: 'skill', team, skill: def.id, lane, unit: null });
    return true;
  }

  /** 영웅 출격: 와트 6, 길 지정. 죽은 뒤 40초가 지나야 다시 나갈 수 있다. */
  deployHero(team: Team, lane: number): boolean {
    const h = this.hero[team];
    if (this.rule?.id === 'rl_nohero') return false;
    if (this.over || !h || h.unit !== null || h.respawn > 0 || lane < 0 || lane >= LANES || this.watt[team] + 1e-9 < HERO_WATT) return false;
    this.watt[team] -= HERO_WATT; this.wattSpent[team] += HERO_WATT; this.heroDeploys[team]++;
    const hm = h.mult * (1 + this.mod[team].hero);
    const st = { ...h.def.stats, hp: Math.round(h.def.stats.hp * hm), dmg: Math.round(h.def.stats.dmg * hm) };
    const pos = team === 0 ? 0 : LANE_LEN;
    const u: Unit = { id: this.nextId++, team, lane, pos, prev: pos, moving: false, hero: h.def.id, ghost: 0, toLane: lane, moveCd: 0, hp: st.hp, maxHp: st.hp, stats: st, cd: 0, card: -1 };
    this.units.push(u); h.unit = u.id;
    this.pre.push({ type: 'spawn', unit: u.id, team, lane });
    return true;
  }

  /** 영웅에게 길 옮기기 지시(1.5초 이동, 그 사이 무적·공격 불가, 뒤 5초 재지시 불가) */
  heroMove(team: Team, lane: number): boolean {
    const u = this.heroUnit(team);
    if (this.over || !u || u.ghost > 0 || u.moveCd > 0 || lane < 0 || lane >= LANES || lane === u.lane) return false;
    u.toLane = lane; u.ghost = Math.round(HERO_MOVE_SEC * TICK_HZ);
    return true;
  }

  heroUnit(team: Team): Unit | null {
    const h = this.hero[team]; if (!h || h.unit === null) return null;
    return this.units.find(u => u.id === h.unit) ?? null;
  }

  /** 영웅 고유 기술 */
  castHeroSkill(team: Team): boolean {
    const h = this.hero[team], u = this.heroUnit(team);
    if (this.over || !h || !u || u.ghost > 0 || h.skillCd > 0) return false;
    const opp: Team = team === 0 ? 1 : 0, dir = team === 0 ? 1 : -1, foes = this.units.filter(e => e.team === opp && e.lane === u.lane && e.ghost === 0 && e.hp > 0);
    h.skillCd = HERO_SKILL_COOLDOWN_SEC * TICK_HZ;
    if (h.def.id === 'hero_vanguard') {
      const from = u.pos; u.pos = Math.min(LANE_LEN, Math.max(0, u.pos + dir * 8)); u.prev = from;
      for (const e of foes) if (e.stats.move === 'ground' && (e.pos - from) * dir >= -2 && (e.pos - u.pos) * dir <= 3) e.hp -= 70 * h.mult;
    } else if (h.def.id === 'hero_sniper') {
      foes.sort((a, b) => Math.abs(a.pos - u.pos) - Math.abs(b.pos - u.pos) || a.id - b.id);
      for (const e of foes.slice(0, 4)) e.hp -= Math.max(1, 60 * h.mult * (1 - this.armorOf(e) * 0.6 / 100));
    } else {
      for (const a of this.units) if (a.team === team && a.lane === u.lane && a.ghost === 0 && a.hp > 0) a.hp = Math.min(a.maxHp, a.hp + a.maxHp * 0.35);
      this.eff.shield[team] = Math.max(this.eff.shield[team], 4 * TICK_HZ);
    }
    this.pre.push({ type: 'skill', team, skill: h.def.id, lane: u.lane, unit: u.id });
    return true;
  }

  /** 봇의 스킬·영웅 사용 (스킬·영웅을 받은 팀만) */
  private botExtras(t: Team): boolean {
    const opp: Team = t === 0 ? 1 : 0;
    const mine = this.units.filter(u => u.team === t && !u.hero), foes = this.units.filter(u => u.team === opp && !u.hero);
    const byLane = [0, 0, 0]; for (const e of foes) byLane[e.lane]++;
    const avgHp = mine.length ? mine.reduce((a, u) => a + u.hp / u.maxHp, 0) / mine.length : 1;
    const h = this.rule?.id === 'rl_nohero' ? null : this.hero[t]; let saving = false;
    if (h) {
      if (h.unit === null && h.respawn === 0 && mine.length >= 2) {
        if (this.watt[t] >= HERO_WATT) { const lane = byLane.indexOf(Math.max(...byLane)); this.deployHero(t, lane >= 0 ? lane : 1); }
        else saving = true;
      } else {
        const u = this.heroUnit(t);
        if (u && foes.some(e => e.lane === u.lane && Math.abs(e.pos - u.pos) <= 14)) this.castHeroSkill(t);
      }
    }
    this.skillIds[t].forEach((id, slot) => {
      if (this.skillCd[t][slot] > 0) return;
      const def = skillById(id); if (!def || this.watt[t] < def.watt) return;
      const hotLane = byLane.indexOf(Math.max(...byLane));
      const ok = id === 'sk_bomb' ? byLane[hotLane] >= 2
        : id === 'sk_overload' ? mine.length >= 3 && foes.length >= 2
        : id === 'sk_shield' ? this.baseHp[t] < BASE_HP * 0.8 && foes.length >= 1
        : id === 'sk_repair' ? mine.length >= 3 && avgHp < 0.6
        : id === 'sk_slow' || id === 'sk_armor' ? foes.length >= 3
        : id === 'sk_strike' ? true
        : this.watt[t] < 6;
      if (ok) this.castSkill(t, slot, def.needsLane ? hotLane : -1);
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

  /** 5분 버티기 이어하기(광고): 내 기지를 절반 체력으로 되살리고 30초 보호막, 기지 앞 적은 쓸어낸다 */
  revive(): void {
    if (!this.survival || !this.over) return;
    this.over = false; this.continued++;
    this.baseHp[0] = BASE_HP * 0.5; this.eff.shield[0] = Math.max(this.eff.shield[0], 30 * TICK_HZ);
    for (const u of this.units) if (u.team === 1 && !u.hero && u.pos < 40) u.hp = 0;
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
