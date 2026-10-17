import type { Part, Legs, Body, Weapon, Accessory } from '../data/parts';

/**
 * 조립 규칙 3개 (기획안 FINAL §4-2, TD-004). 격납고 UI·전투·balance-sim 이 전부 이 함수 하나를 쓴다.
 *  1. 하중: 몸통+무기+액세서리 무게 ≤ 다리 하중. 남는 하중 ≤ PERFECT_SLACK 이면 완전 조립 보너스(체력 +5%).
 *  2. 형태: 몸통 형태 = 무기 형태. 대공(air/both) 무기는 어깨형 몸통에만.
 *  3. 와트: 부품 와트 합 − 액세서리 할인, 반올림, WATT_MIN~WATT_MAX 로 자른다.
 */
export const PERFECT_SLACK = 2;
export const PERFECT_HP_BONUS = 0.05;
export const WATT_MIN = 2;
export const WATT_MAX = 7;

export interface Build { legs: string; body: string; weapon: string; accessory?: string }

export interface UnitStats {
  hp: number; armor: number; speed: number; sight: number;
  dmg: number; range: number; rate: number; target: 'ground' | 'air' | 'both'; move: 'ground' | 'air';
}

export interface AssembleResult {
  ok: boolean;
  reasons: string[];
  weight: number;
  load: number;
  perfect: boolean;
  watt: number;
  stats: UnitStats | null;
}

function byId<T extends Part>(parts: Part[], id: string | undefined, kind: T['kind']): T | undefined {
  if (!id) return undefined;
  const p = parts.find(x => x.id === id);
  return p && p.kind === kind ? (p as T) : undefined;
}

export function assemble(build: Build, parts: Part[]): AssembleResult {
  const reasons: string[] = [];
  const legs = byId<Legs>(parts, build.legs, 'legs');
  const body = byId<Body>(parts, build.body, 'body');
  const weapon = byId<Weapon>(parts, build.weapon, 'weapon');
  const acc = byId<Accessory>(parts, build.accessory, 'accessory');
  if (!legs) reasons.push('다리가 없습니다');
  if (!body) reasons.push('몸통이 없습니다');
  if (!weapon) reasons.push('무기가 없습니다');
  if (build.accessory && !acc) reasons.push('액세서리를 찾을 수 없습니다');
  if (!legs || !body || !weapon) return { ok: false, reasons, weight: 0, load: 0, perfect: false, watt: 0, stats: null };

  // 1. 하중
  const weight = body.weight + weapon.weight + (acc?.weight ?? 0);
  const load = legs.load;
  if (weight > load) reasons.push(`하중 초과: ${weight} > ${load}`);
  const perfect = weight <= load && load - weight <= PERFECT_SLACK;

  // 2. 형태
  if (body.shape !== weapon.shape) reasons.push(`형태 불일치: 몸통 ${body.shape} · 무기 ${weapon.shape}`);
  if (weapon.target !== 'ground' && body.shape !== 'shoulder') reasons.push('대공 무기는 어깨형 몸통에만 장착할 수 있습니다');

  // 3. 와트
  const rawWatt = legs.watt + body.watt + weapon.watt + (acc?.watt ?? 0) - (acc?.effect.wattDiscount ?? 0);
  const watt = Math.min(WATT_MAX, Math.max(WATT_MIN, Math.round(rawWatt)));

  const ok = reasons.length === 0;
  if (!ok) return { ok, reasons, weight, load, perfect: false, watt, stats: null };

  const hpBase = legs.hp + body.hp;
  const hp = Math.round(hpBase * (1 + (perfect ? PERFECT_HP_BONUS : 0) + (acc?.effect.hpPct ?? 0) / 100));
  const armor = Math.min(60, body.armor + (acc?.effect.armor ?? 0));
  const speed = Math.max(0.5, legs.speed * (1 + (acc?.effect.speedPct ?? 0) / 100));
  const sight = body.sight + (acc?.effect.sight ?? 0);
  let target = weapon.target;
  if (acc?.effect.addAir && target === 'ground' && body.shape === 'shoulder') target = 'both';

  return {
    ok, reasons, weight, load, perfect, watt,
    stats: { hp, armor, speed, sight, dmg: weapon.dmg, range: weapon.range, rate: weapon.rate, target, move: legs.move },
  };
}

/** 모든 다리×몸통×무기 조합 중 조립 가능한 것 (balance-sim·격납고 추천용) */
export function allValidBuilds(parts: Part[]): Build[] {
  const legs = parts.filter(p => p.kind === 'legs');
  const bodies = parts.filter(p => p.kind === 'body');
  const weapons = parts.filter(p => p.kind === 'weapon');
  const out: Build[] = [];
  for (const l of legs) for (const b of bodies) for (const w of weapons) {
    const build = { legs: l.id, body: b.id, weapon: w.id };
    if (assemble(build, parts).ok) out.push(build);
  }
  return out;
}
