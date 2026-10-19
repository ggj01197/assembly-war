import { describe, it, expect } from 'vitest';
import { Battle, TICK_HZ, TOWER_HP, TOWER_FAR, TOWER_NEAR, BASE_HP, type Deck } from './sim';
import { PARTS } from '../../data/parts';

const biped = { legs: 'legs_biped_light', body: 'body_arm_scout', weapon: 'wpn_arm_gatling' };
const tank = { legs: 'legs_track_heavy', body: 'body_turret_bunker', weapon: 'wpn_turret_cannon' };
const aa = { legs: 'legs_hover', body: 'body_shoulder_guard', weapon: 'wpn_flak_light' };
const deck = (...b: typeof biped[]): Deck => ({ cards: b.map(build => ({ build })) });
const run = (b: Battle, sec: number) => { for (let i = 0; i < sec * TICK_HZ && !b.over; i++) b.step(); };
const mk = (d0: Deck, d1: Deck, o = {}) => new Battle(d0, d1, PARTS, 5, { bots: [false, false], ...o });
const put = (b: Battle, team: 0 | 1, card: number, lane: number, pos: number) => { b.watt[team] = 10; b.spawn(team, card, lane); const u = b.units[b.units.length - 1]; u.pos = pos; u.prev = pos; return u; };

describe('길 포탑 · 왕관 (클래시 로얄식)', () => {
  it('길마다 양쪽에 포탑이 서 있고 왕관은 0 이다', () => {
    const b = mk(deck(biped), deck(biped));
    expect(b.towers[0]).toHaveLength(3); expect(b.towers[1]).toHaveLength(3);
    expect(b.towers[1].every(t => t.hp === TOWER_HP)).toBe(true);
    expect(b.crowns(0)).toBe(0); expect(b.crowns(1)).toBe(0);
  });

  it('포탑이 서 있는 길에서는 적 기지를 못 때리고, 포탑부터 맞는다', () => {
    const b = mk(deck(tank), deck(biped));
    const u = put(b, 0, 0, 1, TOWER_FAR - 10); u.cd = 0;
    run(b, 3);
    expect(b.baseHp[1]).toBe(BASE_HP);
    expect(b.towers[1][1].hp).toBeLessThan(TOWER_HP);
  });

  it('포탑이 무너지면 왕관 1개, 그 길에서는 기지가 맞는다', () => {
    const b = mk(deck(tank), deck(biped));
    b.towers[1][1].hp = 5;
    const u = put(b, 0, 0, 1, TOWER_FAR - 10);
    run(b, 5);
    expect(b.towers[1][1].hp).toBe(0);
    expect(b.crowns(0)).toBe(1); expect(b.crowns(1)).toBe(0);
    expect(u.hp).toBeGreaterThan(0);
    run(b, 6);
    expect(b.baseHp[1]).toBeLessThan(BASE_HP);
  });

  it('포탑은 같은 길의 가장 가까운 적 유닛을 쏜다 (다른 길은 안 쏨)', () => {
    const b = mk(deck(biped), deck(biped));
    const near = put(b, 0, 0, 1, TOWER_FAR - 6), far = put(b, 0, 0, 0, TOWER_FAR - 6);
    near.cd = far.cd = 99999; // 유닛은 쏘지 않게
    const h = near.hp; run(b, 2.5);
    expect(near.hp).toBeLessThan(h); expect(far.hp).toBeLessThan(far.maxHp); // 두 길 모두 자기 길 포탑에 맞음
    const b2 = mk(deck(biped), deck(biped)); const u = put(b2, 0, 0, 1, 40); u.cd = 99999; run(b2, 3);
    expect(u.hp).toBe(u.maxHp);                                                 // 사거리 밖
  });

  it('공중 전용 대공 유닛은 포탑을 못 때린다', () => {
    const b = mk(deck(aa), deck(biped));
    const u = put(b, 0, 0, 1, TOWER_FAR - 8); u.hp = u.maxHp = 99999;
    run(b, 5);
    expect(b.towers[1][1].hp).toBe(TOWER_HP);
  });

  it('시간이 끝나면 왕관이 많은 쪽이 이긴다 (기지 체력이 더 높아도)', () => {
    const b = mk(deck(biped), deck(biped));
    b.towers[1][0].hp = 0; b.baseHp[0] = 500; b.baseHp[1] = 1000;
    while (b.step()) { /* 끝까지 */ }
    expect(b.result().crowns).toEqual([1, 0]);
    expect(b.result().winner).toBe(0);
  });

  it('왕관이 같으면 기지 체력, 그것도 같으면 연장전', () => {
    const b = mk(deck(biped), deck(biped));
    b.baseHp[0] = 900;
    while (b.step()) { /* 끝까지 */ }
    expect(b.result().winner).toBe(1);
  });

  it('5분 버티기: 적 포탑·기지는 무적', () => {
    const b = mk(deck(tank), deck(biped), { survival: true });
    const u = put(b, 0, 0, 1, TOWER_FAR - 10);
    run(b, 20);
    expect(b.towers[1][1].hp).toBe(TOWER_HP);
    expect(u.hp).toBeGreaterThan(0);
  });

  it('towers:false 면 예전처럼 기지를 바로 때린다', () => {
    const b = mk(deck(tank), deck(biped), { towers: false });
    put(b, 0, 0, 1, 80); run(b, 4);
    expect(b.baseHp[1]).toBeLessThan(BASE_HP);
    expect(b.crowns(0)).toBe(0);
    void TOWER_NEAR;
  });
});
