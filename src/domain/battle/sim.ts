import type { Part } from '../../data/parts';
import { assemble, type Build, type UnitStats } from '../assemble';
import { scaleStats } from '../upgrade';
import { mulberry32 } from '../rng';

/**
 * 3분 세로 전투 시뮬 (기획안 FINAL §5, TD-002). 고정 틱(20Hz) 결정론 — 같은 입력(덱·시드)이면 같은 결과.
 * 화면 없이 balance-sim·비동기 PvP 재생·V2 서버가 같은 코드를 쓴다. 3 길(좌·중·우), 길 길이 100, 아군 기지 0 / 적 기지 100.
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
  /** 카드별 생산 수·가한 피해 (balance-sim 이 부품 승률·기여를 보기 위해) */
  spawnsByCard: [number[], number[]];
  damageByCard: [number[], number[]];
}

interface Unit {
  id: number; team: Team; lane: number; pos: number;
  hp: number; stats: UnitStats; cd: number; card: number;
}

interface Prepared { stats: UnitStats; watt: number }

function prepare(deck: Deck, parts: Part[]): Prepared[] {
  if (deck.cards.length === 0) throw new Error('덱이 비어 있습니다');
  return deck.cards.map((c, i) => {
    const r = assemble(c.build, parts);
    if (!r.ok || !r.stats) throw new Error(`카드 ${i} 조립 불가: ${r.reasons.join(', ')}`);
    return { stats: scaleStats(r.stats, c.level ?? 1), watt: r.watt };
  });
}

function canHit(attacker: UnitStats, target: UnitStats): boolean {
  if (attacker.target === 'both') return true;
  return attacker.target === target.move;
}

export function simulate(deckA: Deck, deckB: Deck, parts: Part[], seed: number): BattleResult {
  const rng = mulberry32(seed);
  const decks: [Prepared[], Prepared[]] = [prepare(deckA, parts), prepare(deckB, parts)];
  const units: Unit[] = [];
  let nextId = 1;
  const baseHp: [number, number] = [BASE_HP, BASE_HP];
  const watt: [number, number] = [WATT_POOL / 2, WATT_POOL / 2];
  const spawned: [number, number] = [0, 0];
  const kills: [number, number] = [0, 0];
  const spawnsByCard: [number[], number[]] = [decks[0].map(() => 0), decks[1].map(() => 0)];
  const damageByCard: [number[], number[]] = [decks[0].map(() => 0), decks[1].map(() => 0)];
  const pointTimer: [number, number] = [0, 0];
  let controller: Team | -1 = -1;

  const maxTicks = (MATCH_SECONDS + OVERTIME_SECONDS) * TICK_HZ;
  let tick = 0;
  let overtime = false;
  let ended = false;

  const dir = (t: Team) => (t === 0 ? 1 : -1);
  const advancePos = (u: Unit) => u.pos + dir(u.team) * u.stats.speed * SPEED_UNIT / TICK_HZ;
  const basePos = (t: Team) => (t === 0 ? LANE_LEN : 0); // t 가 공격하는 상대 기지 위치

  while (tick < maxTicks && !ended) {
    const sec = tick / TICK_HZ;
    if (!overtime && sec >= MATCH_SECONDS) {
      if (baseHp[0] !== baseHp[1]) break;
      overtime = true; // 동률이면 연장
    }

    // 1. 와트 충전
    const mult = overtime ? OVERTIME_MULT : sec >= MATCH_SECONDS - 60 ? FINAL_MINUTE_MULT : 1;
    for (const t of [0, 1] as Team[]) {
      const bonus = controller === t ? POINT_BONUS : 1;
      watt[t] = Math.min(WATT_POOL, watt[t] + (WATT_PER_SEC * mult * bonus) / TICK_HZ);
    }

    // 2. 생산 판단 (봇)
    if (tick % BOT_THINK_TICKS === 0) {
      for (const t of [0, 1] as Team[]) {
        const mine = units.filter(u => u.team === t);
        if (mine.length >= MAX_UNITS_PER_TEAM) continue;
        const enemies = units.filter(u => u.team !== t);
        const enemyAir = enemies.some(u => u.stats.move === 'air');
        const options = decks[t].map((c, i) => ({ c, i })).filter(o => o.c.watt <= watt[t] + 1e-9);
        if (options.length === 0) continue;
        const weights = options.map(o => (enemyAir && o.c.stats.target !== 'ground' ? 3 : 1));
        let r = rng() * weights.reduce((a, b) => a + b, 0), pick = options[0];
        for (let k = 0; k < options.length; k++) { r -= weights[k]; if (r <= 0) { pick = options[k]; break; } }
        // 길: 적이 많은 길을 우선, 동률이면 무작위
        const pressure = [0, 0, 0];
        for (const e of enemies) pressure[e.lane] += 1;
        const mineByLane = [0, 0, 0];
        for (const m of mine) mineByLane[m.lane] += 1;
        const score = pressure.map((p, l) => p - mineByLane[l] + rng() * 0.9);
        const lane = score.indexOf(Math.max(...score));
        watt[t] -= pick.c.watt;
        units.push({ id: nextId++, team: t, lane, pos: t === 0 ? 0 : LANE_LEN, hp: pick.c.stats.hp, stats: pick.c.stats, cd: 0, card: pick.i });
        spawned[t]++; spawnsByCard[t][pick.i]++;
      }
    }

    // 3. 공격 (피해는 모아 두었다가 동시에 적용)
    const unitDamage = new Map<number, number>();
    let baseDmg: [number, number] = [0, 0];
    for (const u of units) {
      u.cd -= 1;
      if (u.cd > 0) continue;
      const range = u.stats.range * RANGE_UNIT;
      let target: Unit | null = null, best = Infinity;
      for (const e of units) {
        if (e.team === u.team || e.lane !== u.lane || !canHit(u.stats, e.stats)) continue;
        const d = Math.abs(e.pos - u.pos);
        if (d <= range && (d < best || (d === best && target && e.id < target.id))) { best = d; target = e; }
      }
      const rate = Math.max(0.2, u.stats.rate);
      if (target) {
        const dealt = Math.max(1, u.stats.dmg * (1 - target.stats.armor / 100));
        unitDamage.set(target.id, (unitDamage.get(target.id) ?? 0) + dealt);
        damageByCard[u.team][u.card] += dealt;
        if (u.stats.family === 'cannon' && target.stats.move === 'ground') {
          for (const e of units) {
            if (e === target || e.team === u.team || e.lane !== u.lane || e.stats.move !== 'ground') continue;
            if (Math.abs(e.pos - target.pos) <= SPLASH_RADIUS) {
              const s = Math.max(1, u.stats.dmg * SPLASH_MULT * (1 - e.stats.armor / 100));
              unitDamage.set(e.id, (unitDamage.get(e.id) ?? 0) + s);
              damageByCard[u.team][u.card] += s;
            }
          }
        }
        u.cd = Math.round(TICK_HZ / rate);
      } else if (Math.abs(basePos(u.team) - u.pos) <= range) {
        const opp: Team = u.team === 0 ? 1 : 0;
        baseDmg[opp] += u.stats.dmg;
        damageByCard[u.team][u.card] += u.stats.dmg;
        u.cd = Math.round(TICK_HZ / rate);
      } else {
        u.cd = 0;
      }
    }
    // 적용
    for (const u of units) {
      const d = unitDamage.get(u.id);
      if (d) u.hp -= d;
    }
    baseHp[0] -= baseDmg[0]; baseHp[1] -= baseDmg[1];
    for (const u of units) if (u.hp <= 0) kills[u.team === 0 ? 1 : 0]++;
    for (let i = units.length - 1; i >= 0; i--) if (units[i].hp <= 0) units.splice(i, 1);

    // 4. 이동 (공격할 대상·기지가 사거리 안에 없을 때만)
    for (const u of units) {
      const range = u.stats.range * RANGE_UNIT;
      let engaged = false;
      for (const e of units) {
        if (e.team !== u.team && e.lane === u.lane && canHit(u.stats, e.stats) && Math.abs(e.pos - u.pos) <= range) { engaged = true; break; }
      }
      if (!engaged && Math.abs(basePos(u.team) - u.pos) <= range) engaged = true;
      if (!engaged) u.pos = Math.min(LANE_LEN, Math.max(0, advancePos(u)));
    }

    // 5. 중앙 거점 점유
    const near: [number, number] = [0, 0];
    for (const u of units) if (u.lane === POINT_LANE && Math.abs(u.pos - POINT_POS) <= POINT_RADIUS) near[u.team]++;
    for (const t of [0, 1] as Team[]) {
      const o: Team = t === 0 ? 1 : 0;
      if (near[t] > 0 && near[o] === 0) pointTimer[t] = Math.min(POINT_CAPTURE_SEC, pointTimer[t] + 1 / TICK_HZ);
      else if (near[o] > 0) pointTimer[t] = 0;
    }
    controller = pointTimer[0] >= POINT_CAPTURE_SEC ? 0 : pointTimer[1] >= POINT_CAPTURE_SEC ? 1 : -1;

    tick++;
    if (baseHp[0] <= 0 || baseHp[1] <= 0) ended = true;
  }

  let winner: Team | -1;
  if (baseHp[0] === baseHp[1]) winner = -1;
  else winner = baseHp[0] > baseHp[1] ? 0 : 1;
  return { winner, baseHp: [Math.max(0, baseHp[0]), Math.max(0, baseHp[1])], seconds: tick / TICK_HZ, overtime, spawned, kills, spawnsByCard, damageByCard };
}
