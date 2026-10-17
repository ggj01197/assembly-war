import { describe, it, expect } from 'vitest';
import { levelMultiplier, scaleStats, upgradeCost, totalCostTo, salvageOre, deckStrength, isMatchable, MAX_LEVEL, UPGRADE_CAP, clampLevel } from './upgrade';
import { assemble } from './assemble';
import { PARTS } from '../data/parts';

describe('강화 (기획안 FINAL §4-3, 결정 #6 +30% 상한)', () => {
  it('Lv1 은 1.0, Lv10 은 정확히 1.3, 그 이상은 없다', () => {
    expect(levelMultiplier(1)).toBe(1);
    expect(levelMultiplier(MAX_LEVEL)).toBeCloseTo(1 + UPGRADE_CAP, 10);
    expect(levelMultiplier(99)).toBeCloseTo(1.3, 10);
    expect(levelMultiplier(-5)).toBe(1);
    expect(levelMultiplier(NaN)).toBe(1);
  });

  it('레벨이 오를수록 단조 증가하고 한 번에 크게 뛰지 않는다', () => {
    let prev = levelMultiplier(1);
    for (let l = 2; l <= MAX_LEVEL; l++) {
      const m = levelMultiplier(l);
      expect(m).toBeGreaterThan(prev);
      expect(m - prev).toBeLessThan(0.04);
      prev = m;
    }
  });

  it('체력·공격만 오르고 사거리·속도·방어는 그대로', () => {
    const base = assemble({ legs: 'legs_track_heavy', body: 'body_turret_bunker', weapon: 'wpn_turret_cannon' }, PARTS).stats!;
    const max = scaleStats(base, 10);
    expect(max.hp).toBe(Math.round(base.hp * 1.3));
    expect(max.dmg).toBeCloseTo(base.dmg * 1.3, 1);
    expect(max.range).toBe(base.range);
    expect(max.speed).toBe(base.speed);
    expect(max.armor).toBe(base.armor);
  });

  it('비용은 레벨이 오를수록 늘고 Lv10 에서는 더 올릴 수 없다', () => {
    expect(upgradeCost(10)).toBeNull();
    expect(upgradeCost(1)).toEqual({ copies: 2, ore: 40 });
    expect(upgradeCost(5)!.ore).toBeGreaterThan(upgradeCost(4)!.ore);
    expect(totalCostTo(1)).toEqual({ copies: 0, ore: 0 });
  });

  it('분해하면 광석 70% 를 돌려준다', () => {
    const total = totalCostTo(5).ore;
    expect(salvageOre(5)).toBe(Math.floor(total * 0.7));
    expect(salvageOre(1)).toBe(0);
  });

  it('덱 강화 총합 ±15% 안에서만 매칭된다', () => {
    expect(isMatchable([1, 1, 1, 1, 1, 1], [1, 1, 1, 1, 1, 1])).toBe(true);
    expect(isMatchable([1, 1, 1, 1, 1, 1], [10, 10, 10, 10, 10, 10])).toBe(false); // 1.0 vs 1.3 = 23% 차이
    expect(isMatchable([5, 5, 5, 5, 5, 5], [7, 7, 7, 7, 7, 7])).toBe(true);
    expect(isMatchable([], [1])).toBe(false);
    expect(deckStrength([1, 10])).toBeCloseTo(2.3, 10);
  });

  it('clampLevel 은 정수로 자른다', () => {
    expect(clampLevel(3.9)).toBe(3);
    expect(clampLevel(0)).toBe(1);
  });
});
