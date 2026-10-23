import { PARTS, type Part } from '../data/parts';
import { assemble, type Build } from './assemble';
import type { SaveData } from './save';

/**
 * 쉬운 조립 (CEO 2026-10-23 「조립이 너무 어려울 수 있다 → B안」):
 *  ① 추천 완성품 카드 — 미리 조립해 둔 유닛(역할·설명 포함)을 고르면 바로 설계도에 들어간다.
 *  ② 부품 한 칸 바꾸기 — 지금 조합에서 **조립이 되는 부품만** 보여 준다 (빨간 오류가 나오지 않는다).
 *  ③ 고급 조립 — 모든 부품·규칙(하중·형태·와트)을 직접 다루는 기존 화면. 작전 1-4 클리어(또는 이미 조립해 본 사람)부터.
 *  ④ 추천 고치기 — 고급 조립에서 안 맞는 조합이 되면 가장 작게 바꿔 맞는 안을 제안한다.
 */
export type Role = 'melee' | 'ranged' | 'siege' | 'air' | 'antiair' | 'support' | 'tank';
export const ROLE_LABEL: Record<Role, string> = { melee: '근접', ranged: '원거리', siege: '공성', air: '공중', antiair: '대공', support: '지원', tank: '방어' };
export const ROLE_ORDER: Role[] = ['melee', 'ranged', 'tank', 'siege', 'air', 'antiair', 'support'];

export interface Blueprint { id: string; name: string; role: Role; desc: string; build: Build }

export const BLUEPRINTS: Blueprint[] = [
  { id: 'bp_scout', name: '정찰병', role: 'ranged', desc: '가볍고 빠른 기관포병. 처음 쓰기 좋아요.', build: { legs: 'legs_biped_light', body: 'body_arm_scout', weapon: 'wpn_arm_gatling' } },
  { id: 'bp_assault', name: '돌격병', role: 'melee', desc: '대검을 들고 적에게 뛰어드는 근접 유닛.', build: { legs: 'legs_biped_assault', body: 'body_arm_heavy', weapon: 'wpn_blade_heavy' } },
  { id: 'bp_lancer', name: '창병', role: 'melee', desc: '긴 창으로 한 칸 멀리서 찌르는 근접 유닛.', build: { legs: 'legs_biped_assault', body: 'body_arm_assault', weapon: 'wpn_blade_lance' } },
  { id: 'bp_sniper', name: '저격병', role: 'ranged', desc: '멀리서 레이저로 쏘는 원거리 유닛.', build: { legs: 'legs_biped_assault', body: 'body_arm_assault', weapon: 'wpn_laser_beam' } },
  { id: 'bp_runner', name: '질주 사수', role: 'ranged', desc: '바퀴로 빠르게 달리며 쏘는 기동 사수.', build: { legs: 'legs_wheel_scout', body: 'body_arm_light', weapon: 'wpn_gatling_light' } },
  { id: 'bp_biker', name: '중량 바이커', role: 'ranged', desc: '튼튼한 바퀴 차체에 레이저를 단 돌파형.', build: { legs: 'legs_wheel_heavy', body: 'body_arm_assault', weapon: 'wpn_laser_light' } },
  { id: 'bp_tank', name: '중장 전차', role: 'tank', desc: '단단한 궤도 차체와 캐넌. 앞에서 버텨 줘요.', build: { legs: 'legs_track_heavy', body: 'body_turret_bunker', weapon: 'wpn_turret_cannon' } },
  { id: 'bp_bunker', name: '벙커 포대', role: 'tank', desc: '아주 단단한 방어형. 느리지만 잘 안 죽어요.', build: { legs: 'legs_track_fortress', body: 'body_turret_siege', weapon: 'wpn_cannon_light' } },
  { id: 'bp_walker', name: '사족 보행포', role: 'ranged', desc: '사족 보행으로 안정적으로 쏘는 중거리 유닛.', build: { legs: 'legs_quad_walker', body: 'body_turret_compact', weapon: 'wpn_cannon_light' } },
  { id: 'bp_mortar', name: '박격포병', role: 'siege', desc: '멀리 있는 적과 포탑을 포격하는 공성 유닛.', build: { legs: 'legs_track_light', body: 'body_arm_scout', weapon: 'wpn_mortar_hand' } },
  { id: 'bp_siege', name: '공성 포대', role: 'siege', desc: '매우 먼 거리에서 큰 피해를 주는 중형 박격포.', build: { legs: 'legs_quad_siege', body: 'body_turret_siege', weapon: 'wpn_mortar_light' } },
  { id: 'bp_titan', name: '요새 거포', role: 'siege', desc: '가장 큰 한 방. 느리고 비싸지만 포탑을 부숴요.', build: { legs: 'legs_track_fortress', body: 'body_turret_siege', weapon: 'wpn_cannon_siege' } },
  { id: 'bp_missile', name: '미사일 전차', role: 'ranged', desc: '땅과 하늘을 모두 맞히는 미사일 차량.', build: { legs: 'legs_track_heavy', body: 'body_shoulder_guard', weapon: 'wpn_shoulder_missile' } },
  { id: 'bp_swarm', name: '다연장 호버', role: 'air', desc: '떠다니며 미사일을 퍼붓는 공중 유닛.', build: { legs: 'legs_hover', body: 'body_shoulder_gunship', weapon: 'wpn_missile_swarm' } },
  { id: 'bp_gunship', name: '건쉽', role: 'air', desc: '빠르게 날아 적 포탑까지 곧장 가는 공중 유닛.', build: { legs: 'legs_flyer', body: 'body_shoulder_gunship', weapon: 'wpn_missile_swarm' } },
  { id: 'bp_heavyhover', name: '중량 호버 미사일', role: 'air', desc: '튼튼한 공중 유닛. 큰 미사일로 지상을 눌러요.', build: { legs: 'legs_hover_heavy', body: 'body_shoulder_platform', weapon: 'wpn_missile_heavy' } },
  { id: 'bp_flak', name: '대공포 차량', role: 'antiair', desc: '날아다니는 적을 잡는 대공 유닛.', build: { legs: 'legs_track_heavy', body: 'body_shoulder_guard', weapon: 'wpn_flak_burst' } },
  { id: 'bp_aa', name: '대공 호버', role: 'antiair', desc: '빠르게 움직이며 하늘의 적을 쏘는 대공 유닛.', build: { legs: 'legs_hover', body: 'body_shoulder_guard', weapon: 'wpn_flak_light' } },
  { id: 'bp_medic', name: '정비병', role: 'support', desc: '다친 아군을 치료하는 지원 유닛.', build: { legs: 'legs_biped_light', body: 'body_arm_medic', weapon: 'wpn_repair_beam' } },
  { id: 'bp_fieldmedic', name: '야전 정비 차량', role: 'support', desc: '넓게 치료하는 튼튼한 정비 차량.', build: { legs: 'legs_track_heavy', body: 'body_turret_compact', weapon: 'wpn_repair_field' } },
  { id: 'bp_drone', name: '수리 드론기', role: 'support', desc: '하늘에서 따라다니며 아군을 고치는 드론.', build: { legs: 'legs_hover', body: 'body_shoulder_gunship', weapon: 'wpn_repair_drone' } },
];

export const sameBuild = (a: Build, b: Build): boolean => a.legs === b.legs && a.body === b.body && a.weapon === b.weapon && (a.accessory ?? '') === (b.accessory ?? '');

export type SwapKind = 'legs' | 'body' | 'weapon';

/** 나머지 두 부품은 그대로 두고 이 칸만 바꿨을 때 조립이 되는 부품들 (지금 장착한 것 포함) */
export function compatibleParts(build: Build, kind: SwapKind): Part[] {
  return PARTS.filter(p => p.kind === kind && assemble({ ...build, [kind]: p.id }, PARTS).ok);
}

/**
 * 조립이 안 되는 조합을 가장 작게 바꿔 맞춘다(액세서리는 건드리지 않음). 이미 되면 null.
 * 조립이 되는 모든 조합 중 바뀌는 부품이 가장 적은 것을 고른다 (무기를 가장 지키고, 다음 다리, 다음 몸통 — 같은 계열 무기·같은 이동 방식이면 더 가깝게 친다).
 */
export function suggestFix(build: Build): { build: Build; text: string } | null {
  if (assemble(build, PARTS).ok) return null;
  const legs = PARTS.filter(p => p.kind === 'legs'), bodies = PARTS.filter(p => p.kind === 'body'), weapons = PARTS.filter(p => p.kind === 'weapon');
  const cl = PARTS.find(p => p.id === build.legs), cw = PARTS.find(p => p.id === build.weapon), cb = PARTS.find(p => p.id === build.body);
  let best: { build: Build; cost: number } | null = null;
  for (const l of legs) for (const b of bodies) for (const w of weapons) {
    const t: Build = { ...build, legs: l.id, body: b.id, weapon: w.id };
    if (!assemble(t, PARTS).ok) continue;
    let cost = 0;
    if (l.id !== build.legs) cost += 3 + (cl?.kind === 'legs' && l.kind === 'legs' && cl.move !== l.move ? 6 : 0) + (cl?.kind === 'legs' && l.kind === 'legs' ? Math.abs(cl.speed - l.speed) * 0.3 : 0);
    if (b.id !== build.body) cost += 2 + (cb?.kind === 'body' && b.kind === 'body' && cb.shape !== b.shape ? 1 : 0);
    if (w.id !== build.weapon) cost += 5 + (cw?.kind === 'weapon' && w.kind === 'weapon' && cw.family !== w.family ? 6 : 0);
    if (!best || cost < best.cost) best = { build: t, cost };
  }
  if (!best) return null;
  const name = (id: string) => PARTS.find(p => p.id === id)?.name ?? id;
  const ch = (['legs', 'body', 'weapon'] as const).filter(k => best!.build[k] !== build[k]).map(k => `${{ legs: '다리', body: '몸통', weapon: '무기' }[k]} 「${name(build[k])}」→「${name(best!.build[k])}」`);
  return { build: best.build, text: `이렇게 바꾸면 조립돼요: ${ch.join(', ')}` };
}

/** 고급 조립 해금: 작전 1-4 를 이겼을 때 (쉬운 조립에서 카드를 바꿔도 flags.assembled 가 켜지므로 그것으로는 판단하지 않는다) */
export const ADVANCED_UNLOCK_STAGE = 'c1-4';
export function advancedUnlocked(s: Pick<SaveData, 'stages'>): boolean {
  return (s.stages[ADVANCED_UNLOCK_STAGE]?.clears ?? 0) > 0;
}

/** 설계도의 이름·역할: 추천 카드와 같으면 그 카드 이름, 아니면 무기·다리로 짐작한 역할 + 무기 이름 */
export function describeBuild(build: Build): { name: string; role: Role; custom: boolean } {
  const bp = BLUEPRINTS.find(b => sameBuild(b.build, { ...build, accessory: undefined }));
  if (bp) return { name: bp.name, role: bp.role, custom: false };
  const w = PARTS.find(p => p.id === build.weapon), l = PARTS.find(p => p.id === build.legs);
  const fam = w && w.kind === 'weapon' ? w.family : '';
  const air = l && l.kind === 'legs' && l.move === 'air';
  const role: Role = fam === 'repair' ? 'support' : fam === 'flak' ? 'antiair' : air ? 'air' : fam === 'blade' ? 'melee' : fam === 'mortar' || fam === 'cannon' ? 'siege' : 'ranged';
  return { name: w?.name ?? build.weapon, role, custom: true };
}

/**
 * 작전 시작 때 보여 주는 상성 힌트: 적 구성을 보고 어떤 카드가 잘 맞는지 한 줄로 알려 준다 (조립이 어려운 사람도 덱을 고칠 수 있게).
 * 내 덱에 필요한 역할이 없으면 그 사실을 먼저 말한다. 힌트가 필요 없으면 빈 문자열.
 */
export function matchupTip(enemy: Build[], mine: Build[]): string {
  const st = (b: Build) => assemble(b, PARTS).stats;
  const es = enemy.map(st).filter((x): x is NonNullable<ReturnType<typeof st>> => !!x), ms = mine.map(st).filter((x): x is NonNullable<ReturnType<typeof st>> => !!x);
  const air = es.filter(x => x.move === 'air').length;
  const siege = es.filter(x => x.range >= 7).length;
  const armored = es.filter(x => x.armor >= 25).length;
  const myAA = ms.filter(x => x.target !== 'ground').length;
  const myPierce = ms.filter(x => x.pierce >= 0.4 || x.dmg >= 40).length;
  if (air >= 2) return myAA === 0 ? '⚠ 공중 적이 많은데 내 덱에는 대공이 없어요! 🔧 유닛 바꾸기에서 「대공」 카드를 넣어 보세요.' : '공중 적이 많아요. 대공·미사일 카드를 먼저 내세요.';
  if (siege >= 2) return '멀리서 포격하는 적이 있어요. 빠른 유닛이나 공중 유닛으로 파고들어 보세요.';
  if (armored >= 2) return myPierce === 0 ? '⚠ 단단한 적이 많아요. 레이저·대검·공성 캐넌처럼 센 한 방 카드가 필요해요.' : '단단한 적이 많아요. 센 한 방 카드를 아끼지 마세요.';
  return '';
}
