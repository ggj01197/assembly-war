import { PARTS, type Part } from '../data/parts';
import type { SaveData } from './save';
import { upgradeCost, clampLevel, MAX_LEVEL } from './upgrade';
import type { Build } from './assemble';

/**
 * 보급 상자 (기획안 FINAL §4·§8): 유료 상자 없음 — 보급권(전투 보상·일일·패키지)과 5시간 무료 상자만 연다.
 * 확률표는 앱 안(보급 화면 「확률표」)과 웹(`odds.html`)에 같은 숫자로 공개한다. 숫자는 여기 한 곳(`SUPPLY`)에서만 정한다.
 */
export type Rarity = 'common' | 'rare' | 'epic';
export const SUPPLY = {
  /** 상자 1개 = 칸 3개 */
  rolls: 3,
  /** 칸 하나의 결과 확률(합 1) */
  odds: { ore: 0.25, common: 0.45, rare: 0.22, epic: 0.08 },
  oreRange: [150, 400] as [number, number],
  /** 부품 조각 수 (희귀할수록 적게) */
  copies: { common: 3, rare: 2, epic: 1 } as Record<Rarity, number>,
  /** 에픽 부품이 안 나온 채 연 상자가 이 수(−1)에 이르면 다음 상자의 마지막 칸은 에픽 부품이 확정 */
  pityEvery: 10,
  freeHours: 5,
} as const;
export const RARITY_LABEL: Record<Rarity, string> = { common: '일반', rare: '희귀', epic: '에픽' };

/** 같은 종류(다리·몸통·무기·액세서리) 안에서 와트(액세서리는 무게)가 높을수록 희귀: 위 20% 에픽, 그다음 30% 희귀, 나머지 일반 */
function buildRarity(): Map<string, Rarity> {
  const out = new Map<string, Rarity>();
  for (const kind of ['legs', 'body', 'weapon', 'accessory'] as const) {
    const list = PARTS.filter(p => p.kind === kind).sort((a, b) => (kind === 'accessory' ? a.weight - b.weight : a.watt - b.watt) || a.id.localeCompare(b.id));
    list.forEach((p, i) => { const f = (i + 1) / list.length; out.set(p.id, f > 0.8 ? 'epic' : f > 0.5 ? 'rare' : 'common'); });
  }
  return out;
}
const RARITY = buildRarity();
export const rarityOf = (id: string): Rarity => RARITY.get(id) ?? 'common';
export const partsOf = (r: Rarity): Part[] => PARTS.filter(p => rarityOf(p.id) === r);

export interface Drop { kind: 'ore' | 'part'; ore?: number; part?: string; copies?: number; rarity?: Rarity }
export type Rng = () => number;

function rollOne(rng: Rng): Drop {
  const o = SUPPLY.odds; let r = rng();
  if ((r -= o.ore) < 0) return { kind: 'ore', ore: SUPPLY.oreRange[0] + Math.floor(rng() * (SUPPLY.oreRange[1] - SUPPLY.oreRange[0] + 1)) };
  const rarity: Rarity = (r -= o.common) < 0 ? 'common' : (r -= o.rare) < 0 ? 'rare' : 'epic';
  return partDrop(rarity, rng);
}
function partDrop(rarity: Rarity, rng: Rng): Drop {
  const pool = partsOf(rarity);
  return { kind: 'part', part: pool[Math.floor(rng() * pool.length)].id, copies: SUPPLY.copies[rarity], rarity };
}

/** 상자 하나를 열어 보상을 정한다(저장은 `openChest`). 천장: 에픽 부품이 (pityEvery−1)번 연속 안 나왔으면 마지막 칸을 에픽 부품으로. */
export function rollChest(pity: number, rng: Rng): { drops: Drop[]; gotEpic: boolean } {
  const drops = Array.from({ length: SUPPLY.rolls }, () => rollOne(rng));
  let gotEpic = drops.some(d => d.rarity === 'epic');
  if (!gotEpic && pity >= SUPPLY.pityEvery - 1) { drops[drops.length - 1] = partDrop('epic', rng); gotEpic = true; }
  return { drops, gotEpic };
}

function apply(save: SaveData, drops: Drop[]) {
  for (const d of drops) {
    if (d.kind === 'ore') save.ore += d.ore ?? 0;
    else if (d.part) save.copies[d.part] = (save.copies[d.part] ?? 0) + (d.copies ?? 0);
  }
}

/** 보급권 1장으로 상자 열기. 권이 없으면 null. */
export function openChest(save: SaveData, rng: Rng = Math.random): { save: SaveData; drops: Drop[] } | null {
  if (save.tickets < 1) return null;
  const next: SaveData = JSON.parse(JSON.stringify(save));
  next.tickets -= 1;
  const { drops, gotEpic } = rollChest(next.supply.pity, rng);
  next.supply.pity = gotEpic ? 0 : next.supply.pity + 1; next.supply.opened += 1;
  apply(next, drops);
  return { save: next, drops };
}

/** 상자 한 칸 더(광고 A4): 같은 확률표로 한 칸을 더 뽑아 보상에 반영한다 */
export function extraDrop(save: SaveData, rng: Rng = Math.random): { save: SaveData; drop: Drop } {
  const next: SaveData = JSON.parse(JSON.stringify(save));
  const drop = rollOne(rng);
  apply(next, [drop]);
  return { save: next, drop };
}

export const freeChestReady = (save: SaveData, now: number): boolean => now >= save.supply.freeAt;
export const freeChestWaitMs = (save: SaveData, now: number): number => Math.max(0, save.supply.freeAt - now);

/** 5시간 무료 상자(보급권 불필요). 아직이면 null. */
export function openFreeChest(save: SaveData, now: number, rng: Rng = Math.random): { save: SaveData; drops: Drop[] } | null {
  if (!freeChestReady(save, now)) return null;
  const next: SaveData = JSON.parse(JSON.stringify(save));
  const { drops, gotEpic } = rollChest(next.supply.pity, rng);
  next.supply.pity = gotEpic ? 0 : next.supply.pity + 1; next.supply.opened += 1;
  next.supply.freeAt = now + SUPPLY.freeHours * 3600 * 1000;
  apply(next, drops);
  return { save: next, drops };
}

/** 공시용 확률표: 칸 하나 기준 */
export function oddsTable(): { label: string; pct: number; note: string }[] {
  const o = SUPPLY.odds;
  return [
    { label: '광석', pct: o.ore * 100, note: `${SUPPLY.oreRange[0]}~${SUPPLY.oreRange[1]}개` },
    { label: '일반 부품 조각', pct: o.common * 100, note: `${SUPPLY.copies.common}조각 · ${partsOf('common').length}종 중 균등` },
    { label: '희귀 부품 조각', pct: o.rare * 100, note: `${SUPPLY.copies.rare}조각 · ${partsOf('rare').length}종 중 균등` },
    { label: '에픽 부품 조각', pct: o.epic * 100, note: `${SUPPLY.copies.epic}조각 · ${partsOf('epic').length}종 중 균등` },
  ];
}

// ───────── 강화 (부품 조각 + 광석) ─────────
export type UpgradeResult = { ok: true; save: SaveData } | { ok: false; reason: string };
export function upgradePart(save: SaveData, partId: string): UpgradeResult {
  const lv = clampLevel(save.partLevels[partId] ?? 1), cost = upgradeCost(lv);
  if (!PARTS.some(p => p.id === partId)) return { ok: false, reason: '알 수 없는 부품' };
  if (!cost) return { ok: false, reason: `이미 최고 레벨(Lv.${MAX_LEVEL})` };
  const have = save.copies[partId] ?? 0;
  if (have < cost.copies) return { ok: false, reason: `조각 ${cost.copies - have}개 부족` };
  if (save.ore < cost.ore) return { ok: false, reason: `광석 ${cost.ore - save.ore} 부족` };
  const next: SaveData = JSON.parse(JSON.stringify(save));
  next.copies[partId] = have - cost.copies; next.ore -= cost.ore; next.partLevels[partId] = lv + 1;
  return { ok: true, save: next };
}

/** 카드(설계도)의 강화 단계: 다리·몸통·무기 세 부품 레벨의 평균(반올림). 액세서리는 제외. */
export function cardLevel(b: Pick<Build, 'legs' | 'body' | 'weapon'>, levels: Record<string, number>): number {
  const l = (id: string) => clampLevel(levels[id] ?? 1);
  return clampLevel(Math.round((l(b.legs) + l(b.body) + l(b.weapon)) / 3));
}
