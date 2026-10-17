import { describe, it, expect } from 'vitest';
import { assemble, allValidBuilds, WATT_MAX, WATT_MIN } from './assemble';
import { PARTS } from '../data/parts';

describe('조립 규칙 3개 (기획안 FINAL §4-2)', () => {
  it('형태가 맞고 하중 안이면 조립된다', () => {
    const r = assemble({ legs: 'legs_biped_light', body: 'body_arm_scout', weapon: 'wpn_arm_gatling' }, PARTS);
    expect(r.ok).toBe(true);
    expect(r.weight).toBe(20);
    expect(r.load).toBe(26);
    expect(r.stats?.hp).toBe(180);
    expect(r.stats?.move).toBe('ground');
  });

  it('하중을 넘으면 거부하고 이유를 말한다', () => {
    const r = assemble({ legs: 'legs_biped_light', body: 'body_turret_bunker', weapon: 'wpn_turret_cannon' }, PARTS);
    expect(r.ok).toBe(false);
    expect(r.reasons.join()).toContain('하중 초과');
  });

  it('몸통과 무기 형태가 다르면 거부한다', () => {
    const r = assemble({ legs: 'legs_track_heavy', body: 'body_turret_bunker', weapon: 'wpn_arm_gatling' }, PARTS);
    expect(r.ok).toBe(false);
    expect(r.reasons.join()).toContain('형태 불일치');
  });

  it('대공 무기는 어깨형에만 붙는다', () => {
    const ok = assemble({ legs: 'legs_track_heavy', body: 'body_shoulder_guard', weapon: 'wpn_shoulder_missile' }, PARTS);
    expect(ok.ok).toBe(true);
    expect(ok.stats?.target).toBe('both');
  });

  it('남는 하중이 2 이하면 완전 조립 보너스 체력 +5%', () => {
    // 궤도(48) + 벙커 탑형(20) + 캐넌(22) + 증설 장갑(6) = 48 → 딱 맞음
    const r = assemble({ legs: 'legs_track_heavy', body: 'body_turret_bunker', weapon: 'wpn_turret_cannon', accessory: 'acc_plate' }, PARTS);
    expect(r.ok).toBe(true);
    expect(r.perfect).toBe(true);
    expect(r.stats?.hp).toBe(Math.round(480 * 1.05));
    expect(r.stats?.armor).toBe(40);
  });

  it('와트는 부품 합에서 액세서리 할인을 빼고 2~7 로 자른다', () => {
    const base = assemble({ legs: 'legs_track_heavy', body: 'body_turret_bunker', weapon: 'wpn_turret_cannon' }, PARTS);
    expect(base.watt).toBe(5); // 1.8+1.4+2.2 = 5.4 → 5
    const miser = assemble({ legs: 'legs_track_heavy', body: 'body_turret_bunker', weapon: 'wpn_turret_cannon', accessory: 'acc_miser' }, PARTS);
    expect(miser.watt).toBe(4);
    for (const b of allValidBuilds(PARTS)) {
      const w = assemble(b, PARTS).watt;
      expect(w).toBeGreaterThanOrEqual(WATT_MIN);
      expect(w).toBeLessThanOrEqual(WATT_MAX);
    }
  });

  it('없는 부품 id 는 거부한다', () => {
    const r = assemble({ legs: 'nope', body: 'body_arm_scout', weapon: 'wpn_arm_gatling' }, PARTS);
    expect(r.ok).toBe(false);
    expect(r.reasons[0]).toContain('다리');
  });

  it('시험용 3×3×3 중 형태가 맞는 조합은 다리 3 × 짝 3 = 9 개 이하', () => {
    const builds = allValidBuilds(PARTS);
    expect(builds.length).toBeGreaterThan(0);
    expect(builds.length).toBeLessThanOrEqual(9);
  });
});
