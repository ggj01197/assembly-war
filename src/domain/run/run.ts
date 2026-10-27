import { PARTS, type Part } from '../../data/parts';
import { assemble, type Build } from '../assemble';
import { mulberry32 } from '../rng';
import { rarityOf, type Rarity } from '../supply';
import { BLUEPRINTS } from '../blueprints';
import { moduleById } from '../modules';
import { bossById } from '../../data/bosses';
import type { SkirmishUnit, Deck } from '../battle/sim';

/**
 * 조립 오토배틀 런 (REDESIGN_PLAN_v0 안 1, M1 프로토타입 2026-10-23).
 * 라운드마다 ① 상점에서 부품을 사고 ② 작업대에서 메카를 조립하고 ③ 자동 전투를 구경한다. 지면 하트가 줄고, 하트가 0 이면 런이 끝난다.
 * 이 파일은 규칙만 다룬다(화면·저장 없음). 같은 시드·같은 행동이면 같은 결과.
 */
export const RUN_ROUNDS = 6;            // M2: 6라운드 (기획안 최종은 10)
export const RUN_HEARTS = 3;
export const START_COINS = 10;
export const SHOP_SIZE = 5;
export const MECH_SLOTS = 4;
export const BENCH_MAX = 10;
export const REROLL_COST = 1;
export const STAR_MAX = 3;
/** ★ 한 단계마다 그 부품이 들어 있는 메카의 체력·공격 +25% */
export const STAR_BONUS = 0.25;
export const WIN_INCOME = 6;            // 이기면 6 + 라운드 코인, 지면 4
export const LOSE_INCOME = 4;
export const COST: Record<Rarity, number> = { common: 2, rare: 3, epic: 4 };

export type SlotKind = 'legs' | 'body' | 'weapon' | 'accessory';
export const SLOT_KINDS: SlotKind[] = ['legs', 'body', 'weapon', 'accessory'];
export interface PartInst { uid: number; id: string; star: number }
export interface Mech { legs: PartInst | null; body: PartInst | null; weapon: PartInst | null; accessory: PartInst | null }
export interface ShopOffer { id: string; cost: number }
export type Phase = 'build' | 'won' | 'lost' | 'cleared' | 'over';

/** 보스 라운드: 라운드 번호 → 보스 id (보스 능력치·크기는 data/bosses) */
export const BOSS_ROUNDS: Record<number, string> = { 3: 'boss_mother', 6: 'boss_general' };
/** 이 라운드를 이기면 유물 3택 1 */
export const RELIC_ROUNDS = [2, 4];

/** 유물: 런이 끝날 때까지 이어지는 강화. 전투 유물은 지휘 모듈(modules.ts)을 그대로 쓰고, 경제 유물은 코인을 준다. */
export interface RelicInfo { id: string; name: string; desc: string; icon: string; combat: boolean }
export const COMBAT_RELICS = ['md_dmg', 'md_rate', 'md_range', 'md_pierce', 'md_hp', 'md_armor', 'md_regen', 'md_speed'];
const ECON_RELICS: RelicInfo[] = [
  { id: 'rl_income', name: '배당금', desc: '라운드가 끝날 때마다 코인 +2', icon: '🪙', combat: false },
  { id: 'rl_bank', name: '보급 계약', desc: '지금 코인 +6', icon: '📦', combat: false },
];
export function relicInfo(id: string): RelicInfo {
  const e = ECON_RELICS.find(r => r.id === id); if (e) return e;
  const m = moduleById(id); return { id, name: m?.name ?? id, desc: m?.desc ?? '', icon: m?.icon ?? '✨', combat: true };
}
const ALL_RELICS = [...COMBAT_RELICS, ...ECON_RELICS.map(r => r.id)];
export interface RunState {
  seed: number; round: number; hearts: number; coins: number; rerolls: number; nextUid: number; phase: Phase;
  shop: (ShopOffer | null)[]; bench: PartInst[]; mechs: Mech[];
  /** 가진 유물 · 지금 고를 수 있는 유물 3장(없으면 null) · 라운드 끝 추가 코인 */
  relics: string[]; relicOffer: string[] | null; bonusIncome: number;
}

const partOf = (id: string): Part | undefined => PARTS.find(p => p.id === id);
export const kindOf = (id: string): SlotKind => (partOf(id)?.kind ?? 'weapon') as SlotKind;
export const emptyMech = (): Mech => ({ legs: null, body: null, weapon: null, accessory: null });

function fromBuild(rs: RunState, b: Build): Mech {
  const mk = (id: string | undefined): PartInst | null => (id ? { uid: rs.nextUid++, id, star: 1 } : null);
  return { legs: mk(b.legs), body: mk(b.body), weapon: mk(b.weapon), accessory: mk(b.accessory) };
}

/** 새 런: 메카 두 대(정찰병·중장 전차)를 가지고 시작한다 */
export function newRun(seed: number): RunState {
  const rs: RunState = { seed, round: 1, hearts: RUN_HEARTS, coins: START_COINS, rerolls: 0, nextUid: 1, phase: 'build', shop: [], bench: [], relics: [], relicOffer: null, bonusIncome: 0, mechs: [emptyMech(), emptyMech(), emptyMech(), emptyMech()] };
  const get = (id: string) => BLUEPRINTS.find(b => b.id === id)!.build;
  rs.mechs[0] = fromBuild(rs, get('bp_scout')); rs.mechs[1] = fromBuild(rs, get('bp_tank'));
  rollShop(rs);
  return rs;
}

/** 상점 진열을 새로 뽑는다 (라운드·리롤 횟수가 시드에 섞여 같은 행동이면 같은 진열) */
export function rollShop(rs: RunState): void {
  const rng = mulberry32((rs.seed * 31 + rs.round * 977 + rs.rerolls * 7919) >>> 0);
  const pool = PARTS.filter(p => p.kind !== 'accessory' || rs.round >= 2);
  const w = (p: Part) => { const r = rarityOf(p.id); return r === 'common' ? 6 : r === 'rare' ? 3 : (rs.round >= 2 ? 1 : 0.3); };
  const total = pool.reduce((a, p) => a + w(p), 0);
  rs.shop = Array.from({ length: SHOP_SIZE }, () => {
    let x = rng() * total, pick = pool[0];
    for (const p of pool) { x -= w(p); if (x <= 0) { pick = p; break; } }
    return { id: pick.id, cost: COST[rarityOf(pick.id)] };
  });
}

/** 벤치에 같은 부품(같은 ★) 세 개가 모이면 ★ 한 단계 올린 부품 하나로 합쳐진다 */
export function mergeBench(rs: RunState): string[] {
  const msgs: string[] = [];
  for (let again = true; again;) {
    again = false;
    for (const p of rs.bench) {
      if (p.star >= STAR_MAX) continue;
      const same = rs.bench.filter(q => q.id === p.id && q.star === p.star);
      if (same.length >= 3) {
        const keep = same[0]; keep.star++;
        rs.bench = rs.bench.filter(q => q === keep || !same.slice(1, 3).includes(q));
        msgs.push(`${partOf(p.id)?.name ?? p.id} ★${keep.star} 로 합쳐졌어요!`); again = true; break;
      }
    }
  }
  return msgs;
}

export type Fail = string | null;

export function buy(rs: RunState, idx: number): { ok: boolean; msg: string } {
  const o = rs.shop[idx];
  if (rs.phase !== 'build' || !o) return { ok: false, msg: '살 수 없어요.' };
  if (rs.coins < o.cost) return { ok: false, msg: `코인이 모자라요 (${o.cost} 필요).` };
  if (rs.bench.length >= BENCH_MAX) return { ok: false, msg: '벤치가 가득 찼어요. 부품을 장착하거나 팔아요.' };
  rs.coins -= o.cost; rs.shop[idx] = null;
  rs.bench.push({ uid: rs.nextUid++, id: o.id, star: 1 });
  const m = mergeBench(rs);
  return { ok: true, msg: m[0] ?? `${partOf(o.id)?.name ?? o.id} 을(를) 샀어요.` };
}

export function reroll(rs: RunState): { ok: boolean; msg: string } {
  if (rs.phase !== 'build') return { ok: false, msg: '지금은 안 돼요.' };
  if (rs.coins < REROLL_COST) return { ok: false, msg: '코인이 모자라요.' };
  rs.coins -= REROLL_COST; rs.rerolls++; rollShop(rs);
  return { ok: true, msg: '진열을 새로 뽑았어요.' };
}

/** 벤치 부품을 파는 값 (산 값의 절반, 최소 1) — ★ 단계마다 3배 */
export function sellValue(p: PartInst): number { return Math.max(1, Math.floor(COST[rarityOf(p.id)] / 2) * Math.pow(3, p.star - 1)); }
export function sell(rs: RunState, uid: number): boolean {
  const i = rs.bench.findIndex(p => p.uid === uid); if (i < 0 || rs.phase !== 'build') return false;
  rs.coins += sellValue(rs.bench[i]); rs.bench.splice(i, 1); return true;
}

/** 벤치 부품을 메카 칸에 끼운다. 이미 끼워진 부품은 벤치로 돌아온다. 몸통·무기 형태가 안 맞으면 짝을 자동으로 바꾸지 않고 「조립 불가」 상태로 둔다(조립 화면이 이유를 보여 준다). */
export function equip(rs: RunState, uid: number, mechIdx: number): boolean {
  const i = rs.bench.findIndex(p => p.uid === uid), m = rs.mechs[mechIdx];
  if (i < 0 || !m || rs.phase !== 'build') return false;
  const inst = rs.bench[i], k = kindOf(inst.id);
  const old = m[k];
  rs.bench.splice(i, 1);
  if (old) rs.bench.push(old);
  m[k] = inst;
  return true;
}
export function unequip(rs: RunState, mechIdx: number, kind: SlotKind): boolean {
  const m = rs.mechs[mechIdx]; if (!m || !m[kind] || rs.bench.length >= BENCH_MAX || rs.phase !== 'build') return false;
  rs.bench.push(m[kind]!); m[kind] = null; return true;
}

export function mechBuild(m: Mech): Build | null {
  if (!m.legs || !m.body || !m.weapon) return null;
  return { legs: m.legs.id, body: m.body.id, weapon: m.weapon.id, ...(m.accessory ? { accessory: m.accessory.id } : {}) };
}
/** 메카의 조립 상태: 빠진 칸·규칙 위반 이유 */
export function mechStatus(m: Mech): { ready: boolean; reasons: string[]; watt: number } {
  const b = mechBuild(m);
  if (!b) { const miss = (['legs', 'body', 'weapon'] as const).filter(k => !m[k]).map(k => ({ legs: '다리', body: '몸통', weapon: '무기' }[k])); return { ready: false, reasons: [`${miss.join('·')}이(가) 없어요`], watt: 0 }; }
  const r = assemble(b, PARTS);
  return { ready: r.ok, reasons: r.reasons, watt: r.watt };
}
/** ★ 보너스: 끼워진 부품의 (★−1) 합 × 25% */
export function mechMult(m: Mech): number {
  return 1 + STAR_BONUS * SLOT_KINDS.reduce((a, k) => a + (m[k] ? m[k]!.star - 1 : 0), 0);
}
export function readyMechs(rs: RunState): { idx: number; build: Build; mult: number }[] {
  const out: { idx: number; build: Build; mult: number }[] = [];
  rs.mechs.forEach((m, idx) => { const b = mechBuild(m); if (b && mechStatus(m).ready) out.push({ idx, build: b, mult: mechMult(m) }); });
  return out;
}

/** 메카 한 대의 점수(자동 조립이 고를 때): 버티는 힘 × 때리는 힘 × 사거리 보정 */
function score(b: Build): number {
  const r = assemble(b, PARTS); if (!r.ok || !r.stats) return -1;
  const s = r.stats;
  return Math.sqrt(s.hp * (1 + s.armor / 100)) * Math.sqrt(Math.max(1, s.dmg * s.rate) * (s.family === 'repair' ? 0.6 : 1)) * (1 + s.range * 0.04) * (s.target === 'both' ? 1.1 : 1);
}

/**
 * 추천 조립: 가진 부품(벤치 + 끼운 것) 전부로 가장 센 메카를 최대 MECH_SLOTS 대 새로 조립한다 (부품 하나는 한 대에만).
 * 점수가 높은 조합부터 욕심쟁이로 고른다. 남는 부품은 벤치로 간다.
 */
export function autoBuild(rs: RunState): void {
  if (rs.phase !== 'build') return;
  let pool: PartInst[] = [...rs.bench]; for (const m of rs.mechs) for (const k of SLOT_KINDS) if (m[k]) pool.push(m[k]!);
  const mechs: Mech[] = [];
  for (let n = 0; n < MECH_SLOTS; n++) {
    const L = pool.filter(p => kindOf(p.id) === 'legs'), B = pool.filter(p => kindOf(p.id) === 'body'), W = pool.filter(p => kindOf(p.id) === 'weapon');
    let best: { l: PartInst; b: PartInst; w: PartInst; sc: number } | null = null;
    for (const l of L) for (const b of B) for (const w of W) {
      const sc = score({ legs: l.id, body: b.id, weapon: w.id }) * (1 + STAR_BONUS * (l.star + b.star + w.star - 3));
      if (sc > 0 && (!best || sc > best.sc)) best = { l, b, w, sc };
    }
    if (!best) break;
    const m: Mech = { legs: best.l, body: best.b, weapon: best.w, accessory: null };
    pool = pool.filter(p => p !== best!.l && p !== best!.b && p !== best!.w);
    // 액세서리가 남아 있으면 하중이 되는 것 하나를 단다
    for (const a of pool.filter(p => kindOf(p.id) === 'accessory')) { if (assemble({ legs: m.legs!.id, body: m.body!.id, weapon: m.weapon!.id, accessory: a.id }, PARTS).ok) { m.accessory = a; pool = pool.filter(p => p !== a); break; } }
    mechs.push(m);
  }
  while (mechs.length < MECH_SLOTS) mechs.push(emptyMech());
  rs.mechs = mechs; rs.bench = pool;   // 남는 부품은 벤치에 그대로 둔다 (예전에는 10칸을 넘는 부품이 조용히 사라졌다)
}

// ───────── 적과 전투 준비 ─────────
/** 라운드별 적: 추천 카드 중에서 시드로 뽑는다 (개수·★ 배율은 라운드가 올라갈수록 늘어난다) */
export const ENEMY_COUNT = [2, 3, 3, 4, 4, 4];           // 라운드별 적 수 (보스 라운드는 보스 포함)
export const ENEMY_MULT = [0.45, 0.6, 0.72, 0.8, 0.88, 0.96];   // 라운드별 적 체력·공격 배율
export const BOSS_MULT = 0.3;                                   // 보스는 능력치가 매우 커서 줄여 쓴다
export function enemyFor(round: number, seed: number): { builds: Build[]; mult: number; boss: string | null; bossMult: number } {
  const rng = mulberry32((seed * 131 + round * 7907) >>> 0);
  const i = Math.min(round, ENEMY_COUNT.length) - 1, boss = BOSS_ROUNDS[round] ?? null;
  const n = Math.max(1, ENEMY_COUNT[i] - (boss ? 1 : 0)), pool = [...BLUEPRINTS];
  const builds: Build[] = [];
  for (let k = 0; k < n && pool.length; k++) { const j = Math.floor(rng() * pool.length); builds.push({ ...pool[j].build }); pool.splice(j, 1); }
  return { builds, mult: ENEMY_MULT[i], boss, bossMult: BOSS_MULT * (1 + 0.25 * (round / RUN_ROUNDS)) };
}

/** 전투 자리: 근접·단단한 쪽은 앞줄, 멀리 쏘는 쪽·치료는 뒷줄. 내 쪽은 y 작은 쪽이 뒤. */
export interface RowRole { back: boolean }
function isBack(b: Build): boolean { const r = assemble(b, PARTS); const s = r.stats; return !!s && (s.range >= 5 || s.family === 'repair' || s.move === 'air'); }
function place(builds: Build[], team: 0 | 1): { x: number; y: number }[] {
  const idx = builds.map((b, i) => ({ i, back: isBack(b) }));
  const front = idx.filter(o => !o.back), back = idx.filter(o => o.back);
  const spots: { x: number; y: number }[] = new Array(builds.length);
  const row = (list: { i: number }[], y: number) => list.forEach((o, k) => { spots[o.i] = { x: list.length === 1 ? 9 : 5.5 + (k * 7) / (list.length - 1), y }; });
  // 앞줄이 비면 모두 한 줄, 뒷줄이 비면 모두 앞줄
  row(front, team === 0 ? 6.4 : 8.6); row(back, team === 0 ? 3.6 : 11.4);
  return spots;
}

export interface BattlePlan {
  mineDeck: Deck; foeDeck: Deck;
  mine: SkirmishUnit[]; foe: SkirmishUnit[];
  mineMechIdx: number[];
  /** 내 팀에 적용할 전투 유물(지휘 모듈 id) · 제한 시간(보스 라운드는 길다) · 보스 이름 */
  mods: string[]; limitSec: number; bossName: string | null;
}
export function battlePlan(rs: RunState): BattlePlan | null {
  const mine = readyMechs(rs);
  if (!mine.length) return null;
  const en = enemyFor(rs.round, rs.seed);
  const mp = place(mine.map(m => m.build), 0), fp = place(en.builds, 1);
  const foe: SkirmishUnit[] = en.builds.map((_, i) => ({ card: i, x: fp[i].x, y: en.boss ? 11.4 : fp[i].y, mult: en.mult }));
  const bd = en.boss ? bossById(en.boss) : null;
  if (bd) foe.push({ card: -1, x: 9, y: 9.4, mult: en.bossMult, boss: bd.id });
  return {
    mineDeck: { cards: mine.map(m => ({ build: m.build })) },
    foeDeck: { cards: en.builds.map(build => ({ build })) },
    mine: mine.map((m, i) => ({ card: i, x: mp[i].x, y: mp[i].y, mult: m.mult })),
    foe, mineMechIdx: mine.map(m => m.idx),
    mods: rs.relics.filter(id => relicInfo(id).combat), limitSec: bd ? 70 : 45, bossName: bd?.name ?? null,
  };
}

/** 유물 3장을 뽑는다 (이미 가진 것은 뺀다, 같은 시드·라운드면 같은 3장) */
export function offerRelics(rs: RunState): string[] {
  const rng = mulberry32((rs.seed * 17 + rs.round * 4177) >>> 0);
  const pool = ALL_RELICS.filter(id => !rs.relics.includes(id)), out: string[] = [];
  while (out.length < 3 && pool.length) { const k = Math.floor(rng() * pool.length); out.push(pool[k]); pool.splice(k, 1); }
  return out;
}
export function chooseRelic(rs: RunState, id: string): boolean {
  if (!rs.relicOffer || !rs.relicOffer.includes(id)) return false;
  rs.relics.push(id); rs.relicOffer = null;
  if (id === 'rl_income') rs.bonusIncome += 2;
  if (id === 'rl_bank') rs.coins += 6;
  return true;
}

/** 전투가 끝난 뒤 정산: 이기면 코인·다음 라운드(마지막이면 클리어), 지면 하트 −1 (0 이면 런 종료) */
export function settle(rs: RunState, win: boolean): void {
  if (rs.phase !== 'build') return;   // 한 라운드는 한 번만 정산한다 (두 번 부르면 코인·유물이 복제됐다 — 레드팀 2026-10-27)
  if (win) {
    rs.coins += WIN_INCOME + rs.round + rs.bonusIncome;
    rs.phase = rs.round >= RUN_ROUNDS ? 'cleared' : 'won';
    if (rs.phase === 'won' && RELIC_ROUNDS.includes(rs.round)) rs.relicOffer = offerRelics(rs);
  } else {
    rs.hearts--; rs.coins += LOSE_INCOME + rs.bonusIncome;
    rs.phase = rs.hearts <= 0 || rs.round >= RUN_ROUNDS ? 'over' : 'lost';   // 마지막 라운드를 지면 런 끝
  }
}
/** 다음 라운드로(이겼든 졌든 하트가 남았으면): 상점을 새로 채운다 */
export function nextRound(rs: RunState): boolean {
  if ((rs.phase !== 'won' && rs.phase !== 'lost') || rs.relicOffer) return false;   // 유물을 먼저 골라야 한다
  rs.round++; rs.rerolls = 0; rs.phase = 'build'; rollShop(rs); return true;
}
