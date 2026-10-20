import type { Mods } from '../domain/modules';

/**
 * 작전 변형 규칙 (GAME_DEPTH_PLAN 2단계): 전투마다 규칙 1개가 양쪽에 똑같이 적용된다.
 * 수치형은 두 팀의 `Mods` 에 처음부터 깔리고(지휘 모듈이 그 위에 쌓인다), 나머지는 시뮬이 id 로 처리한다.
 */
export interface RuleDef {
  id: string; name: string; icon: string; desc: string;
  mods?: Partial<Mods>;
}

export const RULES: RuleDef[] = [
  { id: 'rl_fog', name: '짙은 안개', icon: '🌫', desc: '모든 사거리 −20% — 가까이 붙어야 맞힙니다', mods: { range: -0.2 } },
  { id: 'rl_storm', name: '와트 폭풍', icon: '🌩', desc: '와트 충전이 5초마다 빨라졌다(×1.6) 느려집니다(×0.4)' },
  { id: 'rl_gravity', name: '중력 이상', icon: '🌀', desc: '모든 유닛 이동 −25% — 전선이 천천히 움직입니다', mods: { speed: -0.25 } },
  { id: 'rl_weak', name: '노후 포탑', icon: '🏚', desc: '모든 포탑 체력 −35% — 왕관 싸움이 빨라집니다' },
  { id: 'rl_nohero', name: '영웅 봉쇄', icon: '🚫', desc: '이번 작전은 영웅이 출격할 수 없습니다' },
  { id: 'rl_armor', name: '중장갑 전장', icon: '🛡', desc: '모든 유닛 체력 +30% — 긴 교전', mods: { hp: 0.3 } },
  { id: 'rl_heat', name: '과열 전장', icon: '🔥', desc: '모든 유닛 공격 속도 +25% — 빠른 교전', mods: { rate: 0.25 } },
  { id: 'rl_guard', name: '철벽 기지', icon: '🏰', desc: '두 기지가 받는 피해 −35% — 포탑 왕관이 승부를 가릅니다', mods: { baseGuard: 0.35 } },
];

const BY_ID = new Map(RULES.map(r => [r.id, r]));
export const ruleById = (id: string | null | undefined): RuleDef | undefined => (id ? BY_ID.get(id) : undefined);

/** 와트 폭풍: 초(sec) 시점의 충전 배율 (5초 ×1.6, 5초 ×0.4 반복 → 평균 1.0) */
export const stormMult = (sec: number): number => (Math.floor(sec / 5) % 2 === 0 ? 1.6 : 0.4);
export const WEAK_TOWER_MULT = 0.65;
