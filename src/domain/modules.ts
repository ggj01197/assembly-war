/**
 * 지휘 모듈 — 판 중 「3택 1」 강화 (GAME_DEPTH_PLAN 1단계, 룬 헌터식).
 * 판이 45초·100초·150초에 이르면(5분 버티기는 45초마다) 공격·방어·운영에서 1개씩 3장이 나오고 하나를 고른다.
 * 같은 시드·같은 횟수면 같은 3장(선택에 따라 달라지지 않는다) — 결정론. 한 번 고른 모듈은 같은 판에서 다시 나오지 않는다.
 * 수치는 팀별 `Mods`(모두 0 이 기본, 비율은 0.12 = +12%)에 쌓이고, 시뮬(`Battle`)이 읽는다.
 */
export type ModCategory = 'atk' | 'def' | 'eco';

export interface Mods {
  dmg: number; rate: number; range: number; pierce: number; towerDmg: number; hero: number;
  hp: number; armor: number; baseGuard: number; regen: number;
  wattRate: number; discount: number; speed: number; skillCd: number; capture: number;
}
export const zeroMods = (): Mods => ({ dmg: 0, rate: 0, range: 0, pierce: 0, towerDmg: 0, hero: 0, hp: 0, armor: 0, baseGuard: 0, regen: 0, wattRate: 0, discount: 0, speed: 0, skillCd: 0, capture: 0 });

/** 고른 즉시 한 번 일어나는 일 (수치 누적과 별개) */
export type ModInstant = 'repair' | 'surge' | 'towerHp';

export interface ModuleDef {
  id: string; name: string; desc: string; cat: ModCategory; icon: string;
  mods?: Partial<Mods>; instant?: ModInstant;
}

export const MODULES: ModuleDef[] = [
  // 공격
  { id: 'md_dmg', name: '강화탄', desc: '모든 유닛 공격력 +12%', cat: 'atk', icon: '💥', mods: { dmg: 0.12 } },
  { id: 'md_rate', name: '고속 장전', desc: '공격 속도 +12%', cat: 'atk', icon: '⚡', mods: { rate: 0.12 } },
  { id: 'md_range', name: '정밀 조준', desc: '사거리 +10%', cat: 'atk', icon: '🎯', mods: { range: 0.10 } },
  { id: 'md_pierce', name: '관통탄', desc: '상대 방어를 15% 더 무시', cat: 'atk', icon: '🔩', mods: { pierce: 0.15 } },
  { id: 'md_tower', name: '공성 장치', desc: '포탑·기지에 주는 피해 +35%', cat: 'atk', icon: '🏹', mods: { towerDmg: 0.35 } },
  { id: 'md_hero', name: '영웅 각성', desc: '영웅 체력·공격 +20%', cat: 'atk', icon: '⭐', mods: { hero: 0.20 } },
  // 방어
  { id: 'md_hp', name: '강화 장갑', desc: '유닛 체력 +15% (이미 나온 유닛도)', cat: 'def', icon: '🛡', mods: { hp: 0.15 } },
  { id: 'md_armor', name: '방탄 도금', desc: '유닛 방어 +6', cat: 'def', icon: '🧱', mods: { armor: 6 } },
  { id: 'md_guard', name: '방벽 강화', desc: '내 기지가 받는 피해 −20%', cat: 'def', icon: '🏰', mods: { baseGuard: 0.20 } },
  { id: 'md_towerhp', name: '포탑 증설', desc: '내 포탑 체력 +40% 즉시 회복', cat: 'def', icon: '🗼', instant: 'towerHp' },
  { id: 'md_repair', name: '긴급 정비', desc: '모든 유닛 체력 40% 회복 · 기지 +100', cat: 'def', icon: '🔧', instant: 'repair' },
  { id: 'md_regen', name: '자가 수리', desc: '유닛이 초당 체력 1.5% 회복', cat: 'def', icon: '🩹', mods: { regen: 0.015 } },
  // 운영
  { id: 'md_watt', name: '고출력 발전기', desc: '와트 충전 +15%', cat: 'eco', icon: '🔋', mods: { wattRate: 0.15 } },
  { id: 'md_discount', name: '경량화 설계', desc: '카드 와트 비용 −1 (최소 1)', cat: 'eco', icon: '🪶', mods: { discount: 1 } },
  { id: 'md_surge', name: '비상 전원', desc: '지금 와트 +4', cat: 'eco', icon: '🔌', instant: 'surge' },
  { id: 'md_speed', name: '추진기 튜닝', desc: '이동 속도 +12%', cat: 'eco', icon: '🚀', mods: { speed: 0.12 } },
  { id: 'md_skill', name: '스킬 가속', desc: '스킬 재사용 −25%', cat: 'eco', icon: '⏱', mods: { skillCd: 0.25 } },
  { id: 'md_capture', name: '점령 전문', desc: '거점 점령이 빨라짐(5초 → 3초)', cat: 'eco', icon: '🚩', mods: { capture: 0.67 } },
];

const BY_ID = new Map(MODULES.map(m => [m.id, m]));
export const moduleById = (id: string): ModuleDef | undefined => BY_ID.get(id);
export const CAT_LABEL: Record<ModCategory, string> = { atk: '공격', def: '방어', eco: '운영' };

/** 판 중 모듈이 나오는 시각(초): 3분 판은 3번, 5분 버티기는 45초마다 6번 */
export const OFFER_TIMES = [45, 100, 150];
export const SURVIVAL_OFFER_TIMES = [45, 90, 135, 180, 225, 270];

/** 같은 (시드, 팀, 번째)면 같은 결과: 가벼운 해시로 만든 자체 난수 — 전투 난수열을 건드리지 않는다 */
function offerRng(seed: number, team: number, index: number): () => number {
  let s = (Math.imul(seed | 0, 2654435761) ^ Math.imul(index + 1, 40503) ^ Math.imul(team + 7, 2246822519)) >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** 공격·방어·운영에서 하나씩, 이미 고른 것은 뺀 3장 */
export function offerFor(seed: number, team: number, index: number, taken: readonly string[]): string[] {
  const rng = offerRng(seed, team, index), out: string[] = [];
  for (const cat of ['atk', 'def', 'eco'] as ModCategory[]) {
    const pool = MODULES.filter(m => m.cat === cat && !taken.includes(m.id));
    if (pool.length) out.push(pool[Math.floor(rng() * pool.length)].id);
  }
  return out;
}

/** 모듈 하나의 수치를 팀 Mods 에 더한다 (즉시 효과는 시뮬이 따로 처리) */
export function addMods(into: Mods, def: ModuleDef): void {
  if (!def.mods) return;
  for (const k of Object.keys(def.mods) as (keyof Mods)[]) into[k] += def.mods[k] ?? 0;
}
