import { describe, it, expect } from 'vitest';
import { Battle, TICK_HZ, BASE_HP, SURVIVAL_SECONDS, ARENA_W, RIVER_Y1, type Deck } from './sim';
import { PARTS } from '../../data/parts';
import { settleSurvival } from '../rewards';
import { defaultSave } from '../save';

const biped = { legs: 'legs_biped_light', body: 'body_arm_scout', weapon: 'wpn_arm_gatling' };
const tank = { legs: 'legs_track_heavy', body: 'body_turret_bunker', weapon: 'wpn_turret_cannon' };
const deck = (...b: typeof biped[]): Deck => ({ cards: b.map(build => ({ build })) });
const run = (b: Battle, sec: number) => { for (let i = 0; i < sec * TICK_HZ && !b.over; i++) b.step(); };

describe('보스', () => {
  it('정해진 때에 적 진영 가운데에서 나온다 (카드 상한·영웅 상한과 무관)', () => {
    const b = new Battle(deck(biped), deck(biped), PARTS, 3, { bots: [false, false], boss: 'boss_general' });
    run(b, 39); expect(b.bossSpawned).toBe(false);
    run(b, 2); expect(b.bossSpawned).toBe(true);
    const u = b.bossUnit()!;
    expect(u.team).toBe(1); expect(Math.abs(u.x - ARENA_W / 2)).toBeLessThan(3); expect(u.y).toBeGreaterThan(RIVER_Y1); expect(u.hp).toBe(5000);
    expect(b.units.filter(x => x.team === 1 && !x.hero)).toHaveLength(0);
  });

  it('공중 요새: 12초마다 내 공중 유닛에 60, 보스 가까이 지상에 25', () => {
    const b = new Battle(deck(biped), deck(biped), PARTS, 3, { bots: [false, false], boss: 'boss_fortress' });
    run(b, 46);
    const boss = b.bossUnit()!; boss.cd = 99999;
    const air = { legs: 'legs_hover', body: 'body_arm_scout', weapon: 'wpn_arm_gatling' };
    const b2 = new Battle(deck(biped, air), deck(biped), PARTS, 3, { bots: [false, false], towers: false, boss: 'boss_fortress' });
    run(b2, 46); b2.watt[0] = 10; b2.spawn(0, 0, 9, 12); b2.watt[0] = 10; b2.spawn(0, 1, 9, 12);
    const g = b2.units.find(u => u.team === 0 && u.stats.move === 'ground')!, a = b2.units.find(u => u.team === 0 && u.stats.move === 'air')!;
    const bu = b2.bossUnit()!; for (const u of [bu, g, a]) { u.cd = 99999; u.stats = { ...u.stats, speed: 0.001 }; }
    for (const u of [g, a]) { u.x = 9; u.y = 17; u.px = 9; u.py = 17; }
    const gh = g.hp, ah = a.hp;
    run(b2, 12);
    expect(g.hp).toBe(gh - 25); expect(a.hp).toBe(ah - 60);
  });

  it('정비 모선: 8초마다 적 전체 20% 회복', () => {
    const b = new Battle(deck(biped), deck(biped), PARTS, 3, { bots: [false, false], towers: false, boss: 'boss_mother' });
    run(b, 51); b.watt[1] = 10; b.spawn(1, 0, 9, 24);
    const e = b.units.find(u => u.team === 1 && !u.hero)!; e.cd = 99999; e.stats = { ...e.stats, speed: 0.001 }; e.hp = 10;
    const bu = b.bossUnit()!; bu.cd = 99999; bu.hp = 100;
    run(b, 8.1);
    expect(e.hp).toBeCloseTo(10 + e.maxHp * 0.2, 5);
    expect(bu.hp).toBeCloseTo(100 + bu.maxHp * 0.2, 5);
  });

  it('요새 장군: 10초마다 내 유닛 최대 3기에 90 피해, 같은 시드면 같은 결과', () => {
    const mk = () => { const b = new Battle(deck(biped), deck(biped), PARTS, 9, { bots: [false, false], boss: 'boss_general' }); run(b, 41); for (let i = 0; i < 5; i++) { b.watt[0] = 10; b.spawn(0, 0, 3 + i * 3, 10); } b.units.forEach(u => { if (u.team === 0) { u.cd = 99999; u.hp = u.maxHp = 500; u.stats = { ...u.stats, speed: 0.001 }; } }); b.bossUnit()!.cd = 99999; run(b, 10); return b.units.filter(u => u.team === 0).map(u => u.hp); };
    const a = mk(), c = mk();
    expect(a).toEqual(c);
    expect(a.filter(h => h === 410)).toHaveLength(3);
  });
});

describe('5분 버티기', () => {
  it('300초 뒤 내 기지가 살아 있으면 승리, 적 기지는 무적', () => {
    const b = new Battle(deck(tank, biped), deck(biped), PARTS, 4, { bots: [true, true], survival: true, wattMult: [1, 0.3] });
    let n = 0; while (b.step()) n++;
    expect(b.seconds).toBeGreaterThanOrEqual(SURVIVAL_SECONDS - 0.1); expect(b.seconds).toBeLessThanOrEqual(SURVIVAL_SECONDS + 0.1);
    expect(b.baseHp[1]).toBe(BASE_HP);
    expect(b.result().winner).toBe(0);
    expect(n).toBeGreaterThan(0);
  });

  it('웨이브는 15초마다 오르고 새로 나오는 적이 강해진다', () => {
    const b = new Battle(deck(biped), deck(biped), PARTS, 4, { bots: [false, false], survival: true });
    b.baseHp[0] = 1e9; b.watt[1] = 10; b.spawn(1, 0, 9, 24); const early = b.units[0].maxHp;
    run(b, 150);
    expect(b.wave).toBe(10);
    b.watt[1] = 10; b.spawn(1, 0, 9, 26); const late = b.units[b.units.length - 1].maxHp;
    expect(late).toBeGreaterThan(early * 1.6);
  });

  it('내 기지가 먼저 무너지면 패배하고 버틴 시간이 남는다', () => {
    const b = new Battle(deck(biped), deck(biped), PARTS, 4, { bots: [false, true], survival: true, wattMult: [1, 3] });
    while (b.step()) { /* run */ }
    expect(b.result().winner).toBe(1);
    expect(b.seconds).toBeLessThan(SURVIVAL_SECONDS);
  });

  it('정산: 최고 기록은 시간 비율만큼 전액, 아니면 40%, 300초를 처음 채우면 보급권', () => {
    const ids = PARTS.map(p => p.id), st = { id: 'survival', rewardOre: 500, rewardExp: 260 };
    const s0 = defaultSave(ids);
    const a = settleSurvival(s0, st, 150, false);
    expect(a.record).toBe(true); expect(a.rewards.ore).toBe(250); expect(a.save.survivalBest).toBe(150);
    const b = settleSurvival(a.save, st, 100, false);
    expect(b.record).toBe(false); expect(b.rewards.ore).toBe(Math.round(500 * (100 / 300) * 0.4));
    const c = settleSurvival(b.save, st, 300, true);
    expect(c.rewards.tickets).toBe(1); expect(c.save.survivalBest).toBe(300); expect(c.rewards.ore).toBe(500);
    expect(settleSurvival(c.save, st, 300, true).rewards.tickets).toBe(0);
  });
});
