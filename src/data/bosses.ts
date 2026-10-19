import type { Build, UnitStats } from '../domain/assemble';

/**
 * 보스 3종 (STAGE5_PLAN 5-D). 조립 규칙과 무관한 고정 능력치의 큰 유닛 하나가 정해진 때에 가운데 길로 나온다.
 * 겉모습은 기존 부품 조합을 크게 키워 쓴다(전용 일러스트는 5-E). 주기 기술은 sim 이 처리한다.
 */
export type BossAbility = 'airstrike' | 'mortar' | 'repair';
export interface BossDef {
  id: string; name: string; title: string;
  build: Build; scale: number;
  stats: UnitStats;
  /** 전투 시작 뒤 몇 초에 나오는가 */
  spawnAt: number;
  ability: { kind: BossAbility; every: number; desc: string };
}

export const BOSSES: BossDef[] = [
  {
    id: 'boss_mother', name: '정비 모선', title: '2장 중간 보스', scale: 1.7, spawnAt: 50,
    build: { legs: 'legs_hover_heavy', body: 'body_arm_medic', weapon: 'wpn_repair_beam' },
    stats: { hp: 1800, armor: 20, speed: 1.1, sight: 6, dmg: 14, range: 5, rate: 1.5, target: 'both', move: 'ground', family: 'gatling', splash: 0, pierce: 0, minRange: 0 },
    ability: { kind: 'repair', every: 8, desc: '8초마다 적 유닛 전체의 체력을 20% 회복' },
  },
  {
    id: 'boss_fortress', name: '공중 요새', title: '2장 보스', scale: 1.9, spawnAt: 45,
    build: { legs: 'legs_flyer', body: 'body_shoulder_platform', weapon: 'wpn_flak_missile' },
    stats: { hp: 3000, armor: 25, speed: 1, sight: 8, dmg: 40, range: 8, rate: 0.8, target: 'both', move: 'air', family: 'flak', splash: 4, pierce: 0, minRange: 0 },
    ability: { kind: 'airstrike', every: 12, desc: '12초마다 내 공중 유닛 전체에 피해 60, 같은 길 지상에 25' },
  },
  {
    id: 'boss_general', name: '요새 장군', title: '3장 보스', scale: 2, spawnAt: 40,
    build: { legs: 'legs_track_fortress', body: 'body_turret_siege', weapon: 'wpn_mortar_heavy' },
    stats: { hp: 5000, armor: 45, speed: 0.8, sight: 9, dmg: 70, range: 9, rate: 0.5, target: 'ground', move: 'ground', family: 'mortar', splash: 5, pierce: 0, minRange: 0 },
    ability: { kind: 'mortar', every: 10, desc: '10초마다 내 유닛 3기에 박격포 일제 사격(피해 90)' },
  },
];
export const bossById = (id: string): BossDef | undefined => BOSSES.find(b => b.id === id);
