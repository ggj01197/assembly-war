import type { Build } from '../domain/assemble';

/**
 * 1장 훈련 7전투 (기획안 FINAL §6). 원래 순서는 생산→이동→조립→대공→거점→영웅→종합이었으나
 * 슬라이스에는 영웅·이동 명령이 아직 없어(자동 진군) 「길 고르기」「부대 편성」으로 바꿨다 — 영웅은 5단계에서 추가.
 * enemyWattMult 로 적의 생산 속도를 낮춰 초반을 쉽게 한다.
 */
export interface Stage {
  id: string; no: number; name: string; hint: string;
  enemy: Build[]; enemyLevel: number; enemyWattMult: number;
  rewardOre: number; rewardExp: number;
  /** 적이 쓰는 스킬 id·영웅 id (없으면 없음) — 2·3장에서 사용 */
  enemySkills?: string[]; enemyHero?: string;
}

const biped: Build = { legs: 'legs_biped_light', body: 'body_arm_scout', weapon: 'wpn_arm_gatling' };
const trackGat: Build = { legs: 'legs_track_heavy', body: 'body_arm_scout', weapon: 'wpn_arm_gatling' };
const trackCannon: Build = { legs: 'legs_track_heavy', body: 'body_turret_bunker', weapon: 'wpn_turret_cannon' };
const trackMissile: Build = { legs: 'legs_track_heavy', body: 'body_shoulder_guard', weapon: 'wpn_shoulder_missile' };
const hoverGat: Build = { legs: 'legs_hover', body: 'body_arm_scout', weapon: 'wpn_arm_gatling' };
const hoverMissile: Build = { legs: 'legs_hover', body: 'body_shoulder_guard', weapon: 'wpn_shoulder_missile' };

export const STAGES: Stage[] = [
  { id: 'c1-1', no: 1, name: '첫 출동', hint: '아래 카드를 누른 뒤, 아군 쪽 길을 눌러 생산하세요.', enemy: [biped], enemyLevel: 1, enemyWattMult: 0.45, rewardOre: 120, rewardExp: 60 },
  { id: 'c1-2', no: 2, name: '세 갈래 길', hint: '적이 몰린 길에 유닛을 놓아 막으세요.', enemy: [biped, trackGat], enemyLevel: 1, enemyWattMult: 0.6, rewardOre: 140, rewardExp: 70 },
  { id: 'c1-3', no: 3, name: '첫 조립', hint: '격납고의 「조립」에서 설계도를 바꿔 오면 더 강해집니다.', enemy: [trackGat, trackCannon], enemyLevel: 1, enemyWattMult: 0.65, rewardOre: 160, rewardExp: 80 },
  { id: 'c1-4', no: 4, name: '하늘의 적', hint: '공중 유닛은 어깨형 미사일만 맞힙니다. 대공 카드를 준비하세요.', enemy: [hoverGat, hoverMissile, trackGat], enemyLevel: 1, enemyWattMult: 0.7, rewardOre: 180, rewardExp: 90 },
  { id: 'c1-5', no: 5, name: '중앙 거점', hint: '가운데 길 중앙에 5초 머물면 와트 충전이 1.5배가 됩니다.', enemy: [trackCannon, trackMissile, biped], enemyLevel: 1, enemyWattMult: 0.75, rewardOre: 200, rewardExp: 100 },
  { id: 'c1-6', no: 6, name: '부대 편성', hint: '6장의 설계도를 섞어 쓰세요. 한 종류만 내면 상성에 집니다.', enemy: [biped, trackGat, trackCannon, hoverGat, hoverMissile], enemyLevel: 2, enemyWattMult: 0.85, rewardOre: 230, rewardExp: 120 },
  { id: 'c1-7', no: 7, name: '최종 자격 시험', hint: '지금까지 배운 것을 모두 써서 이기세요.', enemy: [biped, trackGat, trackCannon, trackMissile, hoverGat, hoverMissile], enemyLevel: 2, enemyWattMult: 0.95, rewardOre: 300, rewardExp: 160 },
];

export function stageById(id: string): Stage | undefined { return STAGES.find(s => s.id === id); }
export function isUnlocked(stage: Stage, clears: Record<string, { clears: number }>): boolean {
  if (stage.no === 1) return true;
  const prev = STAGES[stage.no - 2];
  return !!prev && (clears[prev.id]?.clears ?? 0) > 0;
}
