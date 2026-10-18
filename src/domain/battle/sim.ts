import type { Part } from '../../data/parts';
import { assemble, type Build, type UnitStats } from '../assemble';
import { scaleStats } from '../upgrade';
import { mulberry32, type Rng } from '../rng';

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
export const FINAL_MINUTE_MULT = 1.5;
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
  spawned: [number, number];
  kills: [number, number];
  /** 카드별 생산 수·가한 피해 (balance-sim 이 부품 승률·기여를 보기 위해, 결과 화면이 "어느 설계도가 밀렸는지" 보여 주려고) */
  spawnsByCard: [number[], number[]];
  damageByCard: [number[], number[]];
}

export interface Unit {
  id: number; team: Team; lane: number; pos: number;
  /** 직전 틱의 위치·이동 여부 — 화면이 20Hz 틱 사이를 매끄럽게 이을 때만 쓴다(규칙과 무관) */
  prev: number; moving: boolean;
  hp: number; maxHp: number; stats: UnitStats; cd: number; card: number;
}

export type BattleEvent =
  | { type: 'spawn'; unit: number; team: Team; lane: number }
  | { type: 'attack'; from: number; to: number | null; baseOf: Team | null; lane: number; family: string }
  | { type: 'die'; unit: number; team: Team; lane: number; pos: number }
  | { type: 'point'; controller: Team | -1 };

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
}

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
  controller: Team | -1 = -1;
  tick = 0;
  overtime = false;
  over = false;
  /** 방금 끝난 틱에서 일어난 일 (화면이 연출에 쓴다). step() 마다 비워진다. */
  events: BattleEvent[] = [];

  private rng: Rng;
  private nextId = 1;
  private plan: [number | null, number | null] = [null, null];
  private bots: [boolean, boolean];
  private wattMult: [number, number];
  private maxTicks = (MATCH_SECONDS + OVERTIME_SECONDS) * TICK_HZ;

  constructor(deckA: Deck, deckB: Deck, parts: Part[], seed: number, opts: BattleOptions = {}) {
    this.rng = mulberry32(seed);
    this.decks = [prepareDeck(deckA, parts), prepareDeck(deckB, parts)];
    this.spawnsByCard = [this.decks[0].map(() => 0), this.decks[1].map(() => 0)];
    this.damageByCard = [this.decks[0].map(() => 0), this.decks[1].map(() => 0)];
    this.bots = opts.bots ?? [true, true];
    this.wattMult = opts.wattMult ?? [1, 1];
  }

  get seconds(): number { return this.tick / TICK_HZ; }
  /** 남은 시간(초). 연장 중에는 연장 남은 시간 */
  get remaining(): number { return Math.max(0, (this.overtime ? MATCH_SECONDS + OVERTIME_SECONDS : MATCH_SECONDS) - this.seconds); }

  /** 플레이어(또는 외부)가 카드를 생산한다. 와트·동시 유닛 상한을 지키며 성공 여부를 돌려준다. */
  spawn(team: Team, cardIdx: number, lane: number): boolean {
    if (this.over) return false;
    const card = this.decks[team][cardIdx];
    if (!card || lane < 0 || lane >= LANES) return false;
    if (card.watt > this.watt[team] + 1e-9) return false;
    if (this.units.filter(u => u.team === team).length >= MAX_UNITS_PER_TEAM) return false;
    this.watt[team] -= card.watt;
    const u: Unit = { id: this.nextId++, team, lane, pos: team === 0 ? 0 : LANE_LEN, prev: team === 0 ? 0 : LANE_LEN, moving: false, hp: card.stats.hp, maxHp: card.stats.hp, stats: card.stats, cd: 0, card: cardIdx };
    this.units.push(u);
    this.spawned[team]++; this.spawnsByCard[team][cardIdx]++;
    this.events.push({ type: 'spawn', unit: u.id, team, lane });
    return true;
  }

  /** 한 틱(1/20초) 진행. 끝났으면 false */
  step(): boolean {
    this.events = [];
    if (this.over) return false;
    const sec = this.tick / TICK_HZ;
    if (!this.overtime && sec >= MATCH_SECONDS) {
      if (this.baseHp[0] !== this.baseHp[1]) { this.over = true; return false; }
      this.overtime = true; // 동률이면 연장
    }
    if (this.tick >= this.maxTicks) { this.over = true; return false; }

    const { units, baseHp, watt, rng } = this;
    const basePos = (t: Team) => (t === 0 ? LANE_LEN : 0); // t 가 공격하는 상대 기지 위치

    // 1. 와트 충전
    const mult = this.overtime ? OVERTIME_MULT : sec >= MATCH_SECONDS - 60 ? FINAL_MINUTE_MULT : 1;
    for (const t of [0, 1] as Team[]) {
      const bonus = this.controller === t ? POINT_BONUS : 1;
      watt[t] = Math.min(WATT_POOL, watt[t] + (WATT_PER_SEC * mult * bonus * this.wattMult[t]) / TICK_HZ);
    }

    // 2. 생산 판단 (봇)
    if (this.tick % BOT_THINK_TICKS === 0) {
      for (const t of [0, 1] as Team[]) {
        if (!this.bots[t]) continue;
        const mine = units.filter(u => u.team === t);
        if (mine.length >= MAX_UNITS_PER_TEAM) continue;
        const enemies = units.filter(u => u.team !== t);
        const enemyAir = enemies.some(u => u.stats.move === 'air');
        // 다음에 낼 카드를 먼저 정하고, 와트가 모일 때까지 기다린다 (살 수 있는 걸 바로 사면 값싼 카드만 나가고 비싼 카드는 영영 못 나온다)
        const w = (c: Prepared) => (c.stats.target === 'air' ? (enemyAir ? 3 : 0.1) : enemyAir && c.stats.target === 'both' ? 3 : 1);
        let planned = this.plan[t];
        if (planned !== null && this.decks[t][planned].stats.target === 'air' && !enemyAir) planned = null; // 공중 적이 사라졌으면 계획 철회
        if (planned === null) {
          const weights = this.decks[t].map(w);
          let r = rng() * weights.reduce((x, y) => x + y, 0);
          planned = 0;
          for (let k = 0; k < weights.length; k++) { r -= weights[k]; if (r <= 0) { planned = k; break; } }
          this.plan[t] = planned;
        }
        if (this.decks[t][planned].watt > watt[t] + 1e-9) continue;
        // 길: 적이 많은 길을 우선, 동률이면 무작위
        const pressure = [0, 0, 0];
        for (const e of enemies) pressure[e.lane] += 1;
        const mineByLane = [0, 0, 0];
        for (const m of mine) mineByLane[m.lane] += 1;
        const score = pressure.map((p, l) => p - mineByLane[l] + rng() * 0.9);
        if (this.spawn(t, planned, score.indexOf(Math.max(...score)))) this.plan[t] = null;
      }
    }

    // 3. 공격 (피해는 모아 두었다가 동시에 적용). 치료(repair)는 같은 편 부상자에게 음수 피해로 들어간다.
    const unitDamage = new Map<number, number>();
    const baseDmg: [number, number] = [0, 0];
    for (const u of units) {
      u.cd -= 1;
      if (u.cd > 0) continue;
      const range = u.stats.range * RANGE_UNIT;
      const rate = Math.max(0.2, u.stats.rate);
      if (u.stats.family === 'repair') {
        // 사거리 안에서 체력 비율이 가장 낮은 아군 (자기 자신 제외)
        let ally: Unit | null = null, low = 1;
        for (const a of units) {
          if (a === u || a.team !== u.team || a.lane !== u.lane || a.hp >= a.maxHp) continue;
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
          this.damageByCard[u.team][u.card] += u.stats.dmg * 0.5; // 치료 기여는 절반으로 쳐서 결과 화면 순위에 반영
          this.events.push({ type: 'attack', from: u.id, to: ally.id, baseOf: null, lane: u.lane, family: 'repair' });
          u.cd = Math.round(TICK_HZ / rate);
        } else u.cd = 0;
        continue;
      }
      const minR = u.stats.minRange * RANGE_UNIT;
      let target: Unit | null = null, best = Infinity;
      for (const e of units) {
        if (e.team === u.team || e.lane !== u.lane || !canHit(u.stats, e.stats)) continue;
        const d = Math.abs(e.pos - u.pos);
        if (d <= range && d >= minR && (d < best || (d === best && target && e.id < target.id))) { best = d; target = e; }
      }
      if (target) {
        const armor = target.stats.armor * (1 - u.stats.pierce);
        const dealt = Math.max(1, u.stats.dmg * (1 - armor / 100));
        unitDamage.set(target.id, (unitDamage.get(target.id) ?? 0) + dealt);
        this.damageByCard[u.team][u.card] += dealt;
        this.events.push({ type: 'attack', from: u.id, to: target.id, baseOf: null, lane: u.lane, family: u.stats.family });
        if (u.stats.splash > 0) {
          for (const e of units) {
            if (e === target || e.team === u.team || e.lane !== u.lane || e.stats.move !== target.stats.move) continue;
            if (Math.abs(e.pos - target.pos) <= u.stats.splash) {
              const sp = Math.max(1, u.stats.dmg * SPLASH_MULT * (1 - e.stats.armor * (1 - u.stats.pierce) / 100));
              unitDamage.set(e.id, (unitDamage.get(e.id) ?? 0) + sp);
              this.damageByCard[u.team][u.card] += sp;
            }
          }
        }
        u.cd = Math.round(TICK_HZ / rate);
      } else if (Math.abs(basePos(u.team) - u.pos) <= range && Math.abs(basePos(u.team) - u.pos) >= minR && u.stats.target !== 'air') {
        const opp: Team = u.team === 0 ? 1 : 0;
        baseDmg[opp] += u.stats.dmg;
        this.damageByCard[u.team][u.card] += u.stats.dmg;
        this.events.push({ type: 'attack', from: u.id, to: null, baseOf: opp, lane: u.lane, family: u.stats.family });
        u.cd = Math.round(TICK_HZ / rate);
      } else {
        u.cd = 0;
      }
    }
    for (const u of units) {
      const d = unitDamage.get(u.id);
      if (d) u.hp = Math.min(u.maxHp, u.hp - d);
    }
    baseHp[0] -= baseDmg[0]; baseHp[1] -= baseDmg[1];
    for (const u of units) if (u.hp <= 0) { this.kills[u.team === 0 ? 1 : 0]++; this.events.push({ type: 'die', unit: u.id, team: u.team, lane: u.lane, pos: u.pos }); }
    for (let i = units.length - 1; i >= 0; i--) if (units[i].hp <= 0) units.splice(i, 1);

    // 4. 이동 (공격할 대상·기지가 사거리 안에 없을 때만)
    for (const u of units) {
      const range = u.stats.range * RANGE_UNIT, minR = u.stats.minRange * RANGE_UNIT;
      let engaged = false;
      if (u.stats.family === 'repair') {
        engaged = units.some(a => a !== u && a.team === u.team && a.lane === u.lane && a.hp < a.maxHp && Math.abs(a.pos - u.pos) <= range);
      } else {
        for (const e of units) {
          const d = Math.abs(e.pos - u.pos);
          if (e.team !== u.team && e.lane === u.lane && canHit(u.stats, e.stats) && d <= range && d >= minR) { engaged = true; break; }
        }
        const bd = Math.abs(basePos(u.team) - u.pos);
        if (!engaged && bd <= range && bd >= minR && u.stats.target !== 'air') engaged = true;
      }
      u.prev = u.pos; u.moving = false;
      if (!engaged) { u.pos = Math.min(LANE_LEN, Math.max(0, u.pos + (u.team === 0 ? 1 : -1) * u.stats.speed * SPEED_UNIT / TICK_HZ)); u.moving = u.pos !== u.prev; }
    }

    // 5. 중앙 거점 점유
    const near: [number, number] = [0, 0];
    for (const u of units) if (u.lane === POINT_LANE && Math.abs(u.pos - POINT_POS) <= POINT_RADIUS) near[u.team]++;
    for (const t of [0, 1] as Team[]) {
      const o: Team = t === 0 ? 1 : 0;
      if (near[t] > 0 && near[o] === 0) this.pointTimer[t] = Math.min(POINT_CAPTURE_SEC, this.pointTimer[t] + 1 / TICK_HZ);
      else if (near[o] > 0) this.pointTimer[t] = 0;
    }
    const prev = this.controller;
    this.controller = this.pointTimer[0] >= POINT_CAPTURE_SEC ? 0 : this.pointTimer[1] >= POINT_CAPTURE_SEC ? 1 : -1;
    if (prev !== this.controller) this.events.push({ type: 'point', controller: this.controller });

    this.tick++;
    if (baseHp[0] <= 0 || baseHp[1] <= 0) this.over = true;
    return !this.over;
  }

  result(): BattleResult {
    const winner: Team | -1 = this.baseHp[0] === this.baseHp[1] ? -1 : this.baseHp[0] > this.baseHp[1] ? 0 : 1;
    return {
      winner, baseHp: [Math.max(0, this.baseHp[0]), Math.max(0, this.baseHp[1])], seconds: this.tick / TICK_HZ, overtime: this.overtime,
      spawned: [...this.spawned], kills: [...this.kills], spawnsByCard: [[...this.spawnsByCard[0]], [...this.spawnsByCard[1]]], damageByCard: [[...this.damageByCard[0]], [...this.damageByCard[1]]],
    } as BattleResult;
  }
}

/** 봇끼리 끝까지 돌린다 (balance-sim·재생용) */
export function simulate(deckA: Deck, deckB: Deck, parts: Part[], seed: number): BattleResult {
  const b = new Battle(deckA, deckB, parts, seed);
  while (b.step()) { /* 끝날 때까지 */ }
  return b.result();
}
