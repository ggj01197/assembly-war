import type { Build, UnitStats } from './assemble';

/**
 * 출격 장비 (STAGE5_PLAN 5-C): 스킬 8종(2칸 선택)과 영웅 3종(1명 선택). 순수 데이터 — 규칙은 `battle/sim.ts` 가 쓴다.
 * 스킬은 와트를 쓰고 20초 쿨다운. 영웅은 와트 6 으로 출격, 죽으면 40초 뒤 다시 출격, 고유 기술은 별도 쿨다운.
 */
export const SKILL_COOLDOWN_SEC = 20;
export const HERO_WATT = 6;
export const HERO_RESPAWN_SEC = 40;
export const HERO_SKILL_COOLDOWN_SEC = 18;
export const HERO_MOVE_SEC = 1.5;      // 길 옮기는 시간(이동 중에는 맞지도 때리지도 않는다)
export const HERO_MOVE_COOLDOWN_SEC = 5;

export type SkillKind = 'attack' | 'defense' | 'curse' | 'base';
export interface SkillDef {
  id: string; name: string; kind: SkillKind; watt: number;
  /** 길을 골라야 하는가 */
  needsLane: boolean;
  /** 지속 시간(초), 없으면 즉시 효과 */
  dur?: number;
  desc: string;
  /** 사령관 레벨이 이 이상이면 쓸 수 있다 */
  unlock: number;
}

export const SKILLS: SkillDef[] = [
  { id: 'sk_bomb', name: '폭격', kind: 'attack', watt: 4, needsLane: true, desc: '고른 길의 적 전체에 광역 피해 80', unlock: 1 },
  { id: 'sk_overload', name: '과부하', kind: 'attack', watt: 3, needsLane: false, dur: 6, desc: '내 유닛 전체 연사 +30% (6초)', unlock: 1 },
  { id: 'sk_shield', name: '보호막', kind: 'defense', watt: 3, needsLane: false, dur: 8, desc: '내 기지가 받는 피해 −50% (8초)', unlock: 1 },
  { id: 'sk_repair', name: '긴급 수리', kind: 'defense', watt: 4, needsLane: false, desc: '내 유닛 전체 체력 +25%', unlock: 1 },
  { id: 'sk_slow', name: '감속장', kind: 'curse', watt: 3, needsLane: false, dur: 6, desc: '적 전체 속도 −40% (6초)', unlock: 2 },
  { id: 'sk_armor', name: '방어 깎기', kind: 'curse', watt: 3, needsLane: false, dur: 6, desc: '적 전체 방어 −20 (6초)', unlock: 3 },
  { id: 'sk_strike', name: '기지 포격', kind: 'base', watt: 5, needsLane: false, desc: '적 기지에 직접 피해 60', unlock: 4 },
  { id: 'sk_charge', name: '정비 신호', kind: 'base', watt: 2, needsLane: false, dur: 5, desc: '5초간 와트 충전 2배', unlock: 5 },
];
export const DEFAULT_SKILLS: [string, string] = ['sk_bomb', 'sk_repair'];
export const skillById = (id: string): SkillDef | undefined => SKILLS.find(s => s.id === id);
export const KIND_LABEL: Record<SkillKind, string> = { attack: '공격', defense: '방어', curse: '저주', base: '기지' };

export interface HeroDef {
  id: string; name: string; role: string; unlock: number;
  /** 모습: 부품 조합을 그대로 그린다(능력치는 조립 규칙과 무관한 고정 값) */
  build: Build;
  stats: UnitStats;
  skill: { name: string; desc: string };
  /** 전장에서 그릴 때 키우는 배율 */
  scale: number;
}

export const HEROES: HeroDef[] = [
  {
    id: 'hero_vanguard', name: '불도저 가온', role: '돌격형', unlock: 1, scale: 1.3,
    build: { legs: 'legs_biped_assault', body: 'body_arm_heavy', weapon: 'wpn_blade_heavy' },
    stats: { hp: 1100, armor: 35, speed: 3, sight: 5, dmg: 36, range: 1.5, rate: 1.2, target: 'ground', move: 'ground', family: 'blade', splash: 3, pierce: 0, minRange: 0 },
    skill: { name: '돌진', desc: '앞으로 8칸 뛰어나가며 지나는 적에게 피해 70' },
  },
  {
    id: 'hero_sniper', name: '저격수 라이', role: '사격형', unlock: 3, scale: 1.25,
    build: { legs: 'legs_quad_walker', body: 'body_arm_assault', weapon: 'wpn_laser_beam' },
    stats: { hp: 560, armor: 10, speed: 2.2, sight: 9, dmg: 22, range: 8, rate: 2, target: 'both', move: 'ground', family: 'laser', splash: 0, pierce: 0.4, minRange: 0 },
    skill: { name: '일제 사격', desc: '같은 길의 가까운 적 4기에게 피해 60' },
  },
  {
    id: 'hero_medic', name: '정비병 미오', role: '지원형', unlock: 5, scale: 1.25,
    build: { legs: 'legs_hover_heavy', body: 'body_arm_medic', weapon: 'wpn_repair_beam' },
    stats: { hp: 760, armor: 20, speed: 2.4, sight: 7, dmg: 16, range: 6, rate: 1.5, target: 'ground', move: 'ground', family: 'repair', splash: 4, pierce: 0, minRange: 0 },
    skill: { name: '보호 치료', desc: '같은 길의 아군 체력 35% 회복 + 내 기지 보호막 4초' },
  },
];
export const DEFAULT_HERO = 'hero_vanguard';
export const heroById = (id: string): HeroDef | undefined => HEROES.find(h => h.id === id);

export interface Loadout { skills: string[]; hero: string }
export const defaultLoadout = (): Loadout => ({ skills: [...DEFAULT_SKILLS], hero: DEFAULT_HERO });

/** 저장된 값을 쓸 수 있게 고친다: 모르는 id·잠긴 항목·중복은 기본값으로 */
export function repairLoadout(raw: unknown, commanderLv: number): Loadout {
  const base = defaultLoadout();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<Loadout>;
  const ok = (id: unknown): id is string => typeof id === 'string' && !!skillById(id) && skillById(id)!.unlock <= commanderLv;
  const picked: string[] = [];
  if (Array.isArray(r.skills)) for (const id of r.skills) if (ok(id) && !picked.includes(id) && picked.length < 2) picked.push(id);
  for (const id of base.skills) if (picked.length < 2 && !picked.includes(id)) picked.push(id);
  const h = typeof r.hero === 'string' ? heroById(r.hero) : undefined;
  return { skills: picked, hero: h && h.unlock <= commanderLv ? h.id : base.hero };
}
