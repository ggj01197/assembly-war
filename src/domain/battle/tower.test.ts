import { describe, it, expect } from 'vitest';
import { Battle, TICK_HZ, TOWER_HP, BASE_HP, towerPos, basePos, type Deck } from './sim';
import { PARTS } from '../../data/parts';

const biped = { legs: 'legs_biped_light', body: 'body_arm_scout', weapon: 'wpn_arm_gatling' };
const tank = { legs: 'legs_track_heavy', body: 'body_turret_bunker', weapon: 'wpn_turret_cannon' };
const aa = { legs: 'legs_hover', body: 'body_shoulder_guard', weapon: 'wpn_flak_light' };
const deck = (...b: typeof biped[]): Deck => ({ cards: b.map(build => ({ build })) });
const run = (b: Battle, sec: number) => { for (let i = 0; i < sec * TICK_HZ && !b.over; i++) b.step(); };
const mk = (d0: Deck, d1: Deck, o = {}) => new Battle(d0, d1, PARTS, 5, { bots: [false, false], ...o });
const put = (b: Battle, team: 0 | 1, card: number, x: number, y: number) => { b.watt[team] = 10; expect(b.spawn(team, card, x, y)).toBe(true); return b.units[b.units.length - 1]; };
/** 유닛을 적 포탑 앞(사거리 안)으로 옮겨 놓는다 */
const nearTower = (u: ReturnType<typeof put>, side: number, dy = 6) => { const p = towerPos(1, side); u.x = p.x; u.y = p.y - dy; u.px = u.x; u.py = u.y; return u; };

describe('길 포탑 · 왕관 (클래시 로얄식)', () => {
  it('길마다 양쪽에 포탑이 서 있고 왕관은 0 이다', () => {
    const b = mk(deck(biped), deck(biped));
    expect(b.towers[0]).toHaveLength(2); expect(b.towers[1]).toHaveLength(2);
    expect(b.towers[1].every(t => t.hp === TOWER_HP)).toBe(true);
    expect(b.crowns(0)).toBe(0); expect(b.crowns(1)).toBe(0);
  });

  it('포탑이 서 있는 동안 그 길 유닛은 포탑부터 때린다', () => {
    const b = mk(deck(tank), deck(biped));
    const u = nearTower(put(b, 0, 0, 4.5, 12), 0);
    run(b, 4);
    expect(b.towers[1][0].hp).toBeLessThan(TOWER_HP);
    expect(b.baseHp[1]).toBe(BASE_HP);
    void u;
  });

  it('포탑이 무너지면 왕관 1개', () => {
    const b = mk(deck(tank), deck(biped));
    b.towers[1][0].hp = 5;
    const u = nearTower(put(b, 0, 0, 4.5, 12), 0);
    run(b, 6);
    expect(b.towers[1][0].hp).toBe(0);
    expect(b.crowns(0)).toBe(1); expect(b.crowns(1)).toBe(0);
    expect(u.hp).toBeGreaterThan(0);
  });

  it('포탑은 사거리 안의 적 유닛을 쏘고, 사거리 밖은 안 쏜다', () => {
    const b = mk(deck(biped), deck(biped));
    const near = nearTower(put(b, 0, 0, 4.5, 12), 0, 5); near.stats = { ...near.stats, speed: 0.001, dmg: 0.1 };
    const h = near.hp; run(b, 3);
    expect(near.hp).toBeLessThan(h);
    const b2 = mk(deck(biped), deck(biped)); const u = put(b2, 0, 0, 4.5, 12); u.stats = { ...u.stats, speed: 0.001, dmg: 0.1 }; run(b2, 3);
    expect(u.hp).toBe(u.maxHp);
  });

  it('공중 전용 대공 유닛은 포탑을 못 때린다', () => {
    const b = mk(deck(aa), deck(biped));
    const u = nearTower(put(b, 0, 0, 4.5, 12), 0, 5); u.hp = u.maxHp = 99999;
    run(b, 6);
    expect(b.towers[1][0].hp).toBe(TOWER_HP);
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
    const u = nearTower(put(b, 0, 0, 4.5, 12), 0);
    run(b, 20);
    expect(b.towers[1][0].hp).toBe(TOWER_HP);
    expect(u.hp).toBeGreaterThan(0);
  });

  it('towers:false 면 포탑 없이 기지를 바로 때린다', () => {
    const b = mk(deck(tank), deck(biped), { towers: false });
    put(b, 0, 0, 9, 12); run(b, 60);
    expect(b.baseHp[1]).toBeLessThan(BASE_HP);
    expect(b.crowns(0)).toBe(0);
  });

  it('메인 타워(기지)도 공격 건물: 사거리 안의 적 유닛을 쏘고 사이드 포탑보다 멀리 닿는다', () => {
    const b = mk(deck(biped), deck(biped));
    const bp = basePos(1), e = put(b, 0, 0, 9, 12);   // 내 유닛을 적 기지 앞에 둔다 (사이드 포탑 사거리 밖 가운데)
    e.x = bp.x; e.y = bp.y - 6.2; e.px = e.x; e.py = e.y; e.stats = { ...e.stats, speed: 0.001, dmg: 0.1 };
    let shots = 0; for (let i = 0; i < 6 * TICK_HZ; i++) { b.step(); for (const ev of b.events) if (ev.type === 'tower' && ev.side === -1 && ev.team === 1) shots++; }
    expect(shots).toBeGreaterThan(2); expect(e.hp).toBeLessThan(e.maxHp);
  });

  it('towers:false(연습)와 버티기의 적 기지는 쏘지 않는다', () => {
    const b = mk(deck(biped), deck(biped), { towers: false });
    const bp = basePos(1), e = put(b, 0, 0, 9, 12); e.x = bp.x; e.y = bp.y - 5; e.px = e.x; e.py = e.y; e.stats = { ...e.stats, speed: 0.001, dmg: 0.1 };
    let shots = 0; for (let i = 0; i < 4 * TICK_HZ; i++) { b.step(); for (const ev of b.events) if (ev.type === 'tower') shots++; }
    expect(shots).toBe(0);
  });
});
