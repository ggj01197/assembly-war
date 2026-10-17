import { describe, it, expect } from 'vitest';
import { simulate, MATCH_SECONDS, BASE_HP, MAX_UNITS_PER_TEAM, type Deck } from './sim';
import { PARTS } from '../../data/parts';
import { assemble, allValidBuilds } from '../assemble';

const biped = { legs: 'legs_biped_light', body: 'body_arm_scout', weapon: 'wpn_arm_gatling' };
const tank = { legs: 'legs_track_heavy', body: 'body_turret_bunker', weapon: 'wpn_turret_cannon' };
const hoverMissile = { legs: 'legs_hover', body: 'body_shoulder_guard', weapon: 'wpn_shoulder_missile' };

const deck = (...cards: { legs: string; body: string; weapon: string; accessory?: string }[]): Deck => ({ cards: cards.map(build => ({ build })) });

describe('전투 시뮬 (결정론 틱, 기획안 FINAL §5)', () => {
  it('같은 덱·같은 시드면 결과가 똑같다', () => {
    const a = simulate(deck(biped, tank), deck(tank, hoverMissile), PARTS, 42);
    const b = simulate(deck(biped, tank), deck(tank, hoverMissile), PARTS, 42);
    expect(a).toEqual(b);
  });

  it('시드가 다르면 과정이 달라질 수 있다 (생산 순서)', () => {
    const results = new Set<string>();
    for (let s = 1; s <= 8; s++) {
      const r = simulate(deck(biped, tank, hoverMissile), deck(biped, tank, hoverMissile), PARTS, s);
      results.add(r.spawned.join(',') + '|' + r.baseHp.join(','));
    }
    expect(results.size).toBeGreaterThan(1);
  });

  it('3분(+연장 60초)을 넘기지 않고 끝난다', () => {
    const r = simulate(deck(biped), deck(biped), PARTS, 7);
    expect(r.seconds).toBeLessThanOrEqual(MATCH_SECONDS + 60 + 0.1);
  });

  it('기지 체력은 0 아래로 내려가지 않고 BASE_HP 를 넘지 않는다', () => {
    const r = simulate(deck(tank, hoverMissile), deck(biped), PARTS, 11);
    for (const hp of r.baseHp) { expect(hp).toBeGreaterThanOrEqual(0); expect(hp).toBeLessThanOrEqual(BASE_HP); }
  });

  it('지상 전용 무기는 공중 유닛을 한 기도 못 잡는다 (대공 상성)', () => {
    // 호버 미사일(공중) 대 지상 전용 기관포 보병: 보병(팀 1)의 격파 수는 0
    for (const seed of [3, 4, 5]) {
      const r = simulate(deck(hoverMissile), deck(biped), PARTS, seed);
      expect(r.kills[1]).toBe(0);
      expect(r.kills[0]).toBeGreaterThan(0); // 미사일은 대공·대지 모두 가능
    }
  });

  it('생산 수는 동시 유닛 상한을 넘지 않고 와트 한도 안이다', () => {
    const r = simulate(deck(biped), deck(biped), PARTS, 5);
    // 3분 동안 와트는 5 + 90 + 보너스 이내 — 기병 와트 2 이상이므로 90 기를 넘을 수 없다
    expect(r.spawned[0]).toBeLessThan(90);
    expect(MAX_UNITS_PER_TEAM).toBe(12);
  });

  it('조립 불가 카드를 넣으면 거부한다', () => {
    expect(() => simulate(deck({ legs: 'legs_biped_light', body: 'body_turret_bunker', weapon: 'wpn_turret_cannon' }), deck(biped), PARTS, 1)).toThrow();
    expect(() => simulate({ cards: [] }, deck(biped), PARTS, 1)).toThrow();
  });

  it('강화 레벨 10 이 레벨 1 을 이긴다 (같은 덱)', () => {
    let wins = 0;
    const n = 12;
    for (let s = 1; s <= n; s++) {
      const strong: Deck = { cards: [{ build: tank, level: 10 }, { build: hoverMissile, level: 10 }] };
      const weak: Deck = { cards: [{ build: tank, level: 1 }, { build: hoverMissile, level: 1 }] };
      const r = simulate(strong, weak, PARTS, s);
      if (r.winner === 0) wins++;
    }
    expect(wins).toBeGreaterThanOrEqual(8);
  });

  it('유효한 모든 조합이 시뮬에서 오류 없이 돈다', () => {
    for (const b of allValidBuilds(PARTS)) {
      expect(assemble(b, PARTS).ok).toBe(true);
      const r = simulate(deck(b), deck(biped), PARTS, 2);
      expect(r.seconds).toBeGreaterThan(0);
    }
  });
});
