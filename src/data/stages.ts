import type { Build } from '../domain/assemble';

/**
 * 작전 데이터 (기획안 FINAL §6 · STAGE5_PLAN 5-D): 1장 훈련 7전투 → 2장 폐허 공장 7전투(공중·수리, 보스 2) → 3장 중앙 요새 7전투(공성·박격포, 보스 1) + 5분 버티기.
 * 1장은 원래 영웅·이동 명령을 가르치려 했으나 슬라이스에는 없어 「길 고르기」「부대 편성」으로 바꿨다 — 영웅·스킬은 5-C 에서 들어왔다.
 * enemyWattMult 로 적의 생산 속도를 낮춰 초반을 쉽게 한다.
 */
export interface Stage {
  id: string; no: number; name: string; hint: string;
  enemy: Build[]; enemyLevel: number; enemyWattMult: number;
  rewardOre: number; rewardExp: number;
  /** 적이 쓰는 스킬 id·영웅 id (없으면 없음) */
  enemySkills?: string[]; enemyHero?: string;
  /** 소속 장(1~3) — no 는 장 안의 번호(1~7) */
  chapter: 1 | 2 | 3;
  /** 보스 id (data/bosses.ts) */
  boss?: string;
  /** 5분 버티기 */
  survival?: boolean;
  /** 작전 변형 규칙 id (data/rules.ts) */
  rule?: string;
}
type Raw = Omit<Stage, 'chapter'>;

const biped: Build = { legs: 'legs_biped_light', body: 'body_arm_scout', weapon: 'wpn_arm_gatling' };
const trackGat: Build = { legs: 'legs_track_heavy', body: 'body_arm_scout', weapon: 'wpn_arm_gatling' };
const trackCannon: Build = { legs: 'legs_track_heavy', body: 'body_turret_bunker', weapon: 'wpn_turret_cannon' };
const trackMissile: Build = { legs: 'legs_track_heavy', body: 'body_shoulder_guard', weapon: 'wpn_shoulder_missile' };
const hoverGat: Build = { legs: 'legs_hover', body: 'body_arm_scout', weapon: 'wpn_arm_gatling' };
const hoverMissile: Build = { legs: 'legs_hover', body: 'body_shoulder_guard', weapon: 'wpn_shoulder_missile' };
// 2장: 공중·수리
const flyerSwarm: Build = { legs: 'legs_flyer', body: 'body_shoulder_gunship', weapon: 'wpn_missile_swarm' };
const hoverMedic: Build = { legs: 'legs_hover_heavy', body: 'body_arm_medic', weapon: 'wpn_repair_beam' };
const hoverHeavyMissile: Build = { legs: 'legs_hover_heavy', body: 'body_shoulder_platform', weapon: 'wpn_missile_heavy' };
const trackDrone: Build = { legs: 'legs_track_light', body: 'body_shoulder_guard', weapon: 'wpn_repair_drone' };
const trackFlak: Build = { legs: 'legs_track_heavy', body: 'body_shoulder_guard', weapon: 'wpn_flak_burst' };
const wheelLaser: Build = { legs: 'legs_wheel_heavy', body: 'body_arm_assault', weapon: 'wpn_laser_beam' };
// 3장: 공성·접근전
const trackMortar: Build = { legs: 'legs_track_heavy', body: 'body_turret_compact', weapon: 'wpn_mortar_light' };
const fortressCannon: Build = { legs: 'legs_track_fortress', body: 'body_turret_siege', weapon: 'wpn_cannon_light' };
const siegeMortar: Build = { legs: 'legs_quad_siege', body: 'body_turret_siege', weapon: 'wpn_mortar_heavy' };
const bladeBiped: Build = { legs: 'legs_biped_assault', body: 'body_arm_heavy', weapon: 'wpn_blade_heavy' };
const laserQuad: Build = { legs: 'legs_quad_siege', body: 'body_turret_bunker', weapon: 'wpn_laser_turret' };
const lanceTrack: Build = { legs: 'legs_track_light', body: 'body_arm_assault', weapon: 'wpn_blade_lance' };

const CH1: Raw[] = [
  { id: 'c1-1', no: 1, name: '첫 출동', hint: '아래 카드를 누른 뒤, 아군 쪽 길을 눌러 생산하세요.', enemy: [biped], enemyLevel: 1, enemyWattMult: 0.45, rewardOre: 120, rewardExp: 60 },
  { id: 'c1-2', no: 2, name: '세 갈래 길', hint: '적이 몰린 길에 유닛을 놓아 막으세요.', enemy: [biped, trackGat], enemyLevel: 1, enemyWattMult: 0.6, rewardOre: 140, rewardExp: 70 },
  { id: 'c1-3', no: 3, name: '첫 조립', hint: '격납고의 「조립」에서 설계도를 바꿔 오면 더 강해집니다.', enemy: [trackGat, trackCannon], enemyLevel: 1, enemyWattMult: 0.65, rewardOre: 160, rewardExp: 80 },
  { id: 'c1-4', no: 4, name: '하늘의 적', hint: '공중 유닛은 어깨형 미사일만 맞힙니다. 대공 카드를 준비하세요.', enemy: [hoverGat, hoverMissile, trackGat], enemyLevel: 1, enemyWattMult: 0.7, rewardOre: 180, rewardExp: 90 },
  { id: 'c1-5', rule: 'rl_storm', no: 5, name: '중앙 거점', hint: '가운데 길 중앙에 5초 머물면 와트 충전이 1.5배가 됩니다.', enemy: [trackCannon, trackMissile, biped], enemyLevel: 1, enemyWattMult: 0.8, rewardOre: 200, rewardExp: 100 },
  { id: 'c1-6', rule: 'rl_heat', no: 6, name: '부대 편성', hint: '6장의 설계도를 섞어 쓰세요. 한 종류만 내면 상성에 집니다.', enemy: [biped, trackGat, trackCannon, hoverGat, hoverMissile], enemyLevel: 2, enemyWattMult: 0.9, rewardOre: 230, rewardExp: 120 },
  { id: 'c1-7', rule: 'rl_weak', no: 7, name: '최종 자격 시험', hint: '지금까지 배운 것을 모두 써서 이기세요.', enemy: [biped, trackGat, trackCannon, trackMissile, hoverGat, hoverMissile], enemyLevel: 2, enemyWattMult: 1.0, rewardOre: 300, rewardExp: 160 },
];

const CH2: Raw[] = [
  { id: 'c2-1', rule: 'rl_fog', no: 1, name: '폐허 입구', hint: '날아다니는 적이 늘었습니다. 어깨형 미사일·대공 포가 있는 설계도를 넣으세요.', enemy: [hoverGat, flyerSwarm, trackGat], enemyLevel: 6, enemyWattMult: 1.1, rewardOre: 260, rewardExp: 140 },
  { id: 'c2-2', rule: 'rl_gravity', no: 2, name: '떠다니는 파편', hint: '날쌘 비행체는 한 번에 여럿이 옵니다. 광역 대공(폭발형)이 잘 듣습니다.', enemy: [flyerSwarm, hoverMissile, wheelLaser], enemyLevel: 7, enemyWattMult: 1.1, rewardOre: 280, rewardExp: 150 },
  { id: 'c2-3', rule: 'rl_guard', no: 3, name: '수리 드론', hint: '적 수리 유닛은 먼저 끊어야 합니다. 사거리가 긴 설계도로 뒤를 노리세요.', enemy: [trackDrone, hoverGat, hoverMedic, trackGat], enemyLevel: 7, enemyWattMult: 1.45, rewardOre: 300, rewardExp: 160 },
  { id: 'c2-4', no: 4, name: '정비 모선', hint: '보스: 모선이 8초마다 적 전체를 20% 고칩니다. 모선을 집중해서 무너뜨리세요.', enemy: [hoverMedic, flyerSwarm, hoverGat, trackFlak], enemyLevel: 8, enemyWattMult: 1.35, rewardOre: 340, rewardExp: 190, boss: 'boss_mother' },
  { id: 'c2-5', rule: 'rl_storm', no: 5, name: '공중 편대', hint: '적이 수리 스킬을 씁니다. 한 번에 몰아서 큰 피해를 주세요.', enemy: [flyerSwarm, hoverHeavyMissile, hoverMissile, trackFlak], enemyLevel: 8, enemyWattMult: 1.3, rewardOre: 360, rewardExp: 200, enemySkills: ['sk_repair'] },
  { id: 'c2-6', rule: 'rl_armor', no: 6, name: '정비 공장 중심', hint: '적이 과부하·수리를 번갈아 씁니다. 거점을 먼저 잡아 와트를 앞서세요.', enemy: [hoverMedic, hoverHeavyMissile, trackDrone, wheelLaser, trackFlak], enemyLevel: 8, enemyWattMult: 1.5, rewardOre: 390, rewardExp: 220, enemySkills: ['sk_overload', 'sk_repair'] },
  { id: 'c2-7', no: 7, name: '공중 요새', hint: '보스: 공중 요새는 12초마다 내 공중 유닛을 쓸어 갑니다. 지상 대공 카드가 열쇠입니다.', enemy: [flyerSwarm, hoverHeavyMissile, hoverMedic, trackFlak, wheelLaser], enemyLevel: 9, enemyWattMult: 1.7, rewardOre: 450, rewardExp: 260, boss: 'boss_fortress', enemySkills: ['sk_slow'] },
];

const CH3: Raw[] = [
  { id: 'c3-1', rule: 'rl_fog', no: 1, name: '요새 외곽', hint: '박격포는 가까운 적을 못 맞힙니다. 달려들어 붙으세요.', enemy: [trackMortar, trackGat, trackCannon], enemyLevel: 6, enemyWattMult: 0.95, rewardOre: 470, rewardExp: 280 },
  { id: 'c3-2', rule: 'rl_weak', no: 2, name: '포격 진지', hint: '적이 길 하나에 포를 모읍니다. 폭격 스킬로 한꺼번에 처리하세요.', enemy: [trackMortar, fortressCannon, trackMissile], enemyLevel: 6, enemyWattMult: 0.95, rewardOre: 490, rewardExp: 290 },
  { id: 'c3-3', rule: 'rl_heat', no: 3, name: '근접 돌파', hint: '적 영웅이 돌격해 옵니다. 영웅은 같은 길에 맞서게 하세요.', enemy: [bladeBiped, lanceTrack, trackCannon, trackMortar], enemyLevel: 6, enemyWattMult: 0.9, rewardOre: 510, rewardExp: 300, enemyHero: 'hero_vanguard' },
  { id: 'c3-4', rule: 'rl_armor', no: 4, name: '레이저 포대', hint: '방어가 높은 적에는 레이저·방어 깎기가 효과적입니다.', enemy: [laserQuad, fortressCannon, trackMissile, bladeBiped], enemyLevel: 7, enemyWattMult: 1.0, rewardOre: 540, rewardExp: 320, enemySkills: ['sk_armor'] },
  { id: 'c3-5', rule: 'rl_heat', no: 5, name: '철벽 라인', hint: '적 저격 영웅이 멀리서 쏩니다. 이동 지시로 길을 옮겨 피하세요.', enemy: [fortressCannon, siegeMortar, laserQuad, trackMissile], enemyLevel: 7, enemyWattMult: 1.0, rewardOre: 570, rewardExp: 340, enemyHero: 'hero_sniper', enemySkills: ['sk_overload'] },
  { id: 'c3-6', rule: 'rl_storm', no: 6, name: '장군의 호위', hint: '적이 영웅과 스킬을 모두 씁니다. 와트를 아껴 맞받아치세요.', enemy: [siegeMortar, fortressCannon, bladeBiped, laserQuad, trackMissile], enemyLevel: 7, enemyWattMult: 1.0, rewardOre: 600, rewardExp: 360, enemyHero: 'hero_medic', enemySkills: ['sk_overload', 'sk_repair'] },
  { id: 'c3-7', no: 7, name: '요새 장군', hint: '보스: 요새 장군의 박격포 일제가 10초마다 내 유닛 3기를 때립니다. 접근전으로 끝내세요.', enemy: [siegeMortar, fortressCannon, bladeBiped, laserQuad, trackMissile], enemyLevel: 6, enemyWattMult: 0.95, rewardOre: 700, rewardExp: 420, boss: 'boss_general', enemySkills: ['sk_armor'] },
];

export const CHAPTERS: { no: 1 | 2 | 3; name: string; stages: Stage[] }[] = [
  { no: 1, name: '훈련소', stages: CH1.map(r => ({ ...r, chapter: 1 as const })) },
  { no: 2, name: '폐허 공장', stages: CH2.map(r => ({ ...r, chapter: 2 as const })) },
  { no: 3, name: '중앙 요새', stages: CH3.map(r => ({ ...r, chapter: 3 as const })) },
];

/** 21개 전투(1장→3장 순서) */
export const STAGES: Stage[] = CHAPTERS.flatMap(c => c.stages);

/** 5분 버티기: 서버 없는 PvE. 웨이브가 15초마다 강해지고 300초를 버티면 승리. 보상은 버틴 시간에 비례. */
export const SURVIVAL: Stage = {
  id: 'survival', no: 0, chapter: 3, name: '5분 버티기', survival: true,
  hint: '적 기지는 무너지지 않습니다. 15초마다 강해지는 적을 5분 동안 막아내세요. 내 기지가 먼저 무너지면 거기까지의 기록이 남습니다.',
  enemy: [biped, trackGat, trackCannon, trackMissile, hoverGat, flyerSwarm, bladeBiped, trackMortar],
  enemyLevel: 3, enemyWattMult: 0.5, rewardOre: 500, rewardExp: 260,
};

export const stageLabel = (s: Stage): string => (s.survival ? '5분 버티기' : `${s.chapter}-${s.no}`);
export function stageById(id: string): Stage | undefined { return id === SURVIVAL.id ? SURVIVAL : STAGES.find(s => s.id === id); }
/** 다음 전투 (3장 끝이면 undefined) */
export function nextStage(s: Stage): Stage | undefined { const i = STAGES.indexOf(s); return i >= 0 ? STAGES[i + 1] : undefined; }

type Clears = Record<string, { clears: number }>;
export function isUnlocked(stage: Stage, clears: Clears): boolean {
  if (stage.survival) return (clears[CHAPTERS[0].stages[6].id]?.clears ?? 0) > 0;      // 1장을 끝내면 열린다
  const i = STAGES.indexOf(stage);
  if (i <= 0) return i === 0;
  return (clears[STAGES[i - 1].id]?.clears ?? 0) > 0;
}
