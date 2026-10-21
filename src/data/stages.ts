import type { Build } from '../domain/assemble';
import { mulberry32 } from '../domain/rng';
import { RULES } from './rules';

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
  /** 요일 작전이면 요일 번호(0=일 … 6=토) */
  op?: number;
  /** 무한의 탑이면 층 번호(1~) */
  tower?: number;
  /** 보스 러시면 몇 번째 보스(1~3) */
  rush?: 1 | 2 | 3;
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

/**
 * 요일 작전 (GAME_DEPTH_PLAN 4단계): 요일마다 다른 규칙·적 편성. 하루 3번까지 보상(OP_DAILY_CAP), 1장을 끝내면 열린다.
 * 적 레벨은 진행도(깬 장)에 따라 정해진다 — opLevel.
 */
export const OP_DAILY_CAP = 3;
export const OPS: Stage[] = [
  { id: 'op-0', op: 0, no: 0, chapter: 3, name: '일요일 · 보스 사냥', hint: '주말 특별 작전: 요새 장군이 나옵니다. 보상이 가장 큽니다.', enemy: [siegeMortar, fortressCannon, bladeBiped, laserQuad, trackMissile], enemyLevel: 7, enemyWattMult: 0.8, rewardOre: 900, rewardExp: 420, boss: 'boss_general', rule: 'rl_guard' },
  { id: 'op-1', op: 1, no: 0, chapter: 3, name: '월요일 · 공중 습격', hint: '날아다니는 적이 몰려옵니다. 대공 카드가 열쇠예요.', enemy: [flyerSwarm, hoverMissile, hoverGat, hoverHeavyMissile], enemyLevel: 8, enemyWattMult: 1.4, rewardOre: 520, rewardExp: 260, rule: 'rl_fog', enemySkills: ['sk_slow'] },
  { id: 'op-2', op: 2, no: 0, chapter: 3, name: '화요일 · 중장갑 행군', hint: '단단한 적이 천천히 밀려옵니다. 관통·방어 깎기가 좋습니다.', enemy: [trackCannon, fortressCannon, trackMissile, trackFlak], enemyLevel: 7, enemyWattMult: 1.0, rewardOre: 520, rewardExp: 260, rule: 'rl_armor', enemySkills: ['sk_armor'] },
  { id: 'op-3', op: 3, no: 0, chapter: 3, name: '수요일 · 포격 지대', hint: '박격포가 길을 덮습니다. 포탑이 약해져 있어 왕관을 노리세요.', enemy: [trackMortar, siegeMortar, trackCannon, laserQuad], enemyLevel: 7, enemyWattMult: 1.0, rewardOre: 540, rewardExp: 270, rule: 'rl_weak' },
  { id: 'op-4', op: 4, no: 0, chapter: 3, name: '목요일 · 와트 폭풍', hint: '와트가 빠르게 찼다 느려집니다. 몰아서 내는 타이밍을 잡으세요.', enemy: [biped, hoverGat, trackGat, flyerSwarm, bladeBiped], enemyLevel: 7, enemyWattMult: 1.15, rewardOre: 540, rewardExp: 270, rule: 'rl_storm' },
  { id: 'op-5', op: 5, no: 0, chapter: 3, name: '금요일 · 근접 난투', hint: '모두 공격이 빨라진 난전! 물러서지 말고 맞붙으세요.', enemy: [bladeBiped, lanceTrack, trackGat, bladeBiped, hoverGat], enemyLevel: 7, enemyWattMult: 1.0, rewardOre: 560, rewardExp: 280, rule: 'rl_heat', enemySkills: ['sk_overload'] },
  { id: 'op-6', op: 6, no: 0, chapter: 3, name: '토요일 · 영웅 봉쇄', hint: '영웅이 출격할 수 없습니다. 카드와 스킬만으로 정예를 꺾으세요.', enemy: [wheelLaser, hoverHeavyMissile, laserQuad, fortressCannon, trackMissile], enemyLevel: 7, enemyWattMult: 1.0, rewardOre: 580, rewardExp: 290, rule: 'rl_nohero', enemySkills: ['sk_overload', 'sk_repair'] },
];
export const opOfDay = (d: Date = new Date()): Stage => OPS[d.getDay()];
/** 요일 작전 적 레벨: 깬 장이 늘수록 올라간다 (1장 4 → 2장 6 → 3장 8) */
export function opLevel(clears: Record<string, { clears: number }>): number {
  const done = (id: string) => (clears[id]?.clears ?? 0) > 0;
  return done('c3-7') ? 9 : done('c2-7') ? 7 : done('c1-7') ? 5 : 3;
}

/**
 * 무한의 탑 (5단계): 층마다 한 판. 다음 층(= 최고 층 + 1)에 도전하고, 이기면 올라간다. 층 구성은 층 번호로만 정해진다(결정론).
 * 규칙은 3층마다, 보스는 10층마다(모선→요새→장군 순환). 적 레벨·와트는 층이 오를수록 올라 결국 막힌다 — 그게 최고 기록 경쟁.
 */
export const TOWER_MAX = 100;
const TOWER_POOL: Build[] = [biped, trackGat, trackCannon, trackMissile, hoverGat, hoverMissile, flyerSwarm, hoverMedic, hoverHeavyMissile, trackDrone, trackFlak, wheelLaser, trackMortar, fortressCannon, siegeMortar, bladeBiped, laserQuad, lanceTrack];
const TOWER_BOSSES = ['boss_mother', 'boss_fortress', 'boss_general'];
export function towerStage(floor: number): Stage {
  const f = Math.max(1, Math.min(TOWER_MAX, Math.floor(floor)));
  const rng = mulberry32(f * 7919 + 13), pool = [...TOWER_POOL];
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const n = Math.min(6, 3 + Math.floor(f / 4));
  const boss = f % 10 === 0 ? TOWER_BOSSES[(f / 10 - 1) % 3] : undefined;
  const rule = f >= 3 && f % 3 === 0 ? RULES[(f / 3 - 1) % RULES.length].id : undefined;
  const skills = f >= 15 ? ['sk_overload', 'sk_repair'] : f >= 5 ? ['sk_overload'] : [];
  return {
    id: `tower-${f}`, tower: f, no: f, chapter: 3, name: `무한의 탑 ${f}층`,
    hint: boss ? '보스 층! 정예와 함께 보스가 나옵니다.' : rule ? '이 층에는 특별한 규칙이 있어요. 규칙을 먼저 읽으세요.' : '다음 층으로 올라가세요. 층이 오를수록 적이 강해집니다.',
    enemy: pool.slice(0, n), enemyLevel: Math.min(20, Math.round(2 + f * 0.5)), enemyWattMult: Math.min(1.5, 0.7 + f * 0.03),
    rewardOre: 150 + 12 * f, rewardExp: 80 + 6 * f, boss, rule, enemySkills: skills, enemyHero: f >= 20 ? 'hero_vanguard' : undefined,
  };
}

/** 보스 러시 (6단계): 모선→요새→장군 3연전. 내 기지 체력이 이어지고(조금 회복), 끝까지 이기면 주 1회 큰 보상. 2장을 끝내면 열린다. */
export const RUSH: Stage[] = [
  { id: 'rush-1', rush: 1, no: 1, chapter: 3, name: '보스 러시 1 · 정비 모선', hint: '모선이 8초마다 적 전체를 고칩니다. 집중 공격하세요. 기지 체력은 다음 보스로 이어집니다.', enemy: [hoverMedic, flyerSwarm, hoverGat, trackFlak], enemyLevel: 8, enemyWattMult: 1.0, rewardOre: 260, rewardExp: 130, boss: 'boss_mother' },
  { id: 'rush-2', rush: 2, no: 2, chapter: 3, name: '보스 러시 2 · 공중 요새', hint: '요새가 12초마다 내 공중 유닛을 쓸어 갑니다. 지상 대공이 열쇠예요.', enemy: [flyerSwarm, hoverHeavyMissile, hoverMedic, trackFlak, wheelLaser], enemyLevel: 8, enemyWattMult: 1.0, rewardOre: 320, rewardExp: 160, boss: 'boss_fortress' },
  { id: 'rush-3', rush: 3, no: 3, chapter: 3, name: '보스 러시 3 · 요새 장군', hint: '마지막! 박격포 일제가 10초마다 유닛 3기를 때립니다. 접근전으로 끝내세요.', enemy: [siegeMortar, fortressCannon, bladeBiped, laserQuad, trackMissile], enemyLevel: 6, enemyWattMult: 0.95, rewardOre: 400, rewardExp: 200, boss: 'boss_general' },
];
export const RUSH_BONUS = { ore: 800, exp: 400, tickets: 3 };
/** 그 날이 속한 주의 월요일 날짜(주간 보상 기준) */
export function weekKey(d: Date = new Date()): string {
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
  return `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}-${String(m.getDate()).padStart(2, '0')}`;
}

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

export const stageLabel = (s: Stage): string => (s.survival ? '5분 버티기' : s.op !== undefined ? '요일 작전' : s.tower ? '무한의 탑' : s.rush ? '보스 러시' : `${s.chapter}-${s.no}`);
export function stageById(id: string): Stage | undefined {
  if (id === SURVIVAL.id) return SURVIVAL;
  if (id.startsWith('tower-')) { const f = Number(id.slice(6)); return Number.isInteger(f) && f >= 1 && f <= TOWER_MAX ? towerStage(f) : undefined; }
  return STAGES.find(s => s.id === id) ?? OPS.find(s => s.id === id) ?? RUSH.find(s => s.id === id);
}
/** 다음 전투 (3장 끝이면 undefined) */
export function nextStage(s: Stage): Stage | undefined {
  if (s.tower) return s.tower < TOWER_MAX ? towerStage(s.tower + 1) : undefined;
  if (s.rush) return s.rush < 3 ? RUSH[s.rush] : undefined;
  const i = STAGES.indexOf(s); return i >= 0 ? STAGES[i + 1] : undefined;
}

type Clears = Record<string, { clears: number }>;
export function isUnlocked(stage: Stage, clears: Clears): boolean {
  if (stage.rush) return (clears[CHAPTERS[1].stages[6].id]?.clears ?? 0) > 0;      // 보스 러시는 2장을 끝내면 열린다
  if (stage.survival || stage.op !== undefined || stage.tower) return (clears[CHAPTERS[0].stages[6].id]?.clears ?? 0) > 0;      // 1장을 끝내면 열린다
  const i = STAGES.indexOf(stage);
  if (i <= 0) return i === 0;
  return (clears[STAGES[i - 1].id]?.clears ?? 0) > 0;
}
