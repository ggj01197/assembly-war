import { describe, it, expect } from 'vitest';
import { PARTS } from '../../data/parts';
import { Battle, TICK_HZ, ARENA_W, ARENA_H, RIVER_Y0, RIVER_Y1, BRIDGE_X, BRIDGE_HALF, canDeployAt, towerPos, basePos, rangeTiles, type Unit } from './sim';
import type { Build } from '../assemble';

const biped: Build = { legs: 'legs_biped_light', body: 'body_arm_scout', weapon: 'wpn_arm_gatling' };
const blade: Build = { legs: 'legs_biped_assault', body: 'body_arm_heavy', weapon: 'wpn_blade_heavy' };
const flyer: Build = { legs: 'legs_flyer', body: 'body_shoulder_gunship', weapon: 'wpn_missile_swarm' };
const mortar: Build = { legs: 'legs_track_heavy', body: 'body_turret_compact', weapon: 'wpn_mortar_light' };
const deckOf = (...b: Build[]) => ({ cards: b.map(build => ({ build })) });
const mk = (a: Build[], b: Build[], o = {}) => new Battle(deckOf(...a), deckOf(...b), PARTS, 7, { bots: [false, false], ...o });
const run = (b: Battle, sec: number, each?: () => void) => { for (let i = 0; i < sec * TICK_HZ && !b.over; i++) { b.step(); each?.(); } };
const put = (b: Battle, team: 0 | 1, card: number, x: number, y: number): Unit => { b.watt[team] = 10; expect(b.spawn(team, card, x, y), `spawn ${x},${y}`).toBe(true); return b.units[b.units.length - 1]; };
const dummy = (u: Unit) => { u.stats = { ...u.stats, speed: 0.001, dmg: 0.1 }; return u; };
const inBand = (y: number) => y > RIVER_Y0 && y < RIVER_Y1;

describe('2D 아레나: 배치', () => {
  it('내 진영(강 아래)의 빈 땅 어디든 놓을 수 있고, 강·적 진영·벽·포탑·기지 위는 안 된다', () => {
    expect(canDeployAt(0, 9, 10)).toBe(true); expect(canDeployAt(0, 2, 12)).toBe(true); expect(canDeployAt(0, 16, 6)).toBe(true);
    expect(canDeployAt(0, 9, 15.5)).toBe(false);             // 강
    expect(canDeployAt(0, 9, 20)).toBe(false);               // 적 진영
    expect(canDeployAt(0, 0.2, 10)).toBe(false);             // 벽
    const t = towerPos(0, 0); expect(canDeployAt(0, t.x, t.y)).toBe(false);   // 포탑 자리
    const bp = basePos(0); expect(canDeployAt(0, bp.x, bp.y)).toBe(false);    // 기지 자리
    expect(canDeployAt(1, 9, ARENA_H - 10)).toBe(true); expect(canDeployAt(1, 9, 10)).toBe(false);
  });
  it('spawn 은 놓을 수 없는 자리나 와트 부족이면 실패하고 와트를 쓰지 않는다', () => {
    const b = mk([biped], [biped]); b.watt[0] = 10;
    expect(b.spawn(0, 0, 9, 20)).toBe(false); expect(b.spawn(0, 0, 9, 15.5)).toBe(false); expect(b.watt[0]).toBe(10);
    b.watt[0] = 0.5; expect(b.spawn(0, 0, 9, 9)).toBe(false);
  });
});

describe('2D 아레나: 이동·다리·공중', () => {
  it('땅 유닛은 가까운 다리로만 강을 건넌다 (강 한가운데 안 지나감)', () => {
    for (const x0 of [2, 4.5, 9, 13.5, 16]) {
      const b = mk([biped], [biped], { towers: false }); const u = put(b, 0, 0, x0, 12);
      let crossed = false;
      run(b, 70, () => {
        if (inBand(u.y)) { const bx = BRIDGE_X.reduce((m, x) => (Math.abs(u.x - x) < Math.abs(u.x - m) ? x : m)); expect(Math.abs(u.x - bx), `x0=${x0} y=${u.y.toFixed(1)}`).toBeLessThanOrEqual(BRIDGE_HALF + 0.01); }
        if (u.y > RIVER_Y1 + 1) crossed = true;
      });
      expect(crossed, `x0=${x0}`).toBe(true);
    }
  });
  it('공중 유닛은 다리와 상관없이 강 위를 가로질러 날아간다', () => {
    const b = mk([flyer], [biped], { towers: false }); const u = put(b, 0, 0, 9, 12);
    let overWater = false;
    run(b, 25, () => { if (inBand(u.y) && Math.abs(u.x - BRIDGE_X[0]) > 3 && Math.abs(u.x - BRIDGE_X[1]) > 3) overWater = true; });
    expect(overWater).toBe(true); expect(u.y).toBeGreaterThan(RIVER_Y1);
  });
  it('인식 거리 밖의 적은 무시하고 자기 길의 가까운 적 포탑을 향해 직진한다', () => {
    const b = mk([biped], [biped]); const u = put(b, 0, 0, 4.5, 12);
    b.step(); expect(u.tgt).toEqual({ kind: 't', team: 1, side: 0 });                  // 왼쪽 길 → 왼쪽 포탑
    const v = put(b, 0, 0, 13.5, 12); b.step(); expect(v.tgt).toEqual({ kind: 't', team: 1, side: 1 });
  });
  it('가는 도중 인식 거리 안에 적이 소환되면 가장 가까운 적이 목표가 된다', () => {
    const b = mk([biped], [biped, biped], { towers: false }); const u = put(b, 0, 0, 4.5, 12);
    const far = dummy(put(b, 1, 0, 4.5, 27));                                             // 멀다 — 무시
    b.step(); expect(u.tgt?.kind).not.toBe('u');
    b.units.splice(b.units.indexOf(far), 1);
    const near = dummy(put(b, 1, 1, 4.5, 21)); u.y = 17.8; u.x = 4.5; u.px = 4.5; u.py = 17.8;   // 내가 강을 건너 가까워짐
    b.step(); expect(u.tgt).toEqual({ kind: 'u', id: near.id });
    const nearer = dummy(put(b, 1, 0, 5.4, 19.8)); b.step(); expect(u.tgt).toEqual({ kind: 'u', id: nearer.id });   // 더 가까운 적이 새로 들어오면 그쪽으로
  });
  it('사거리 안에 들어오면 멈춰서 싸우고, 근접 유닛은 바싹 붙는다', () => {
    const b = mk([blade], [biped], { towers: false }); const u = put(b, 0, 0, 4.5, 12); const e = dummy(put(b, 1, 0, 4.5, 21)); e.hp = e.maxHp = 5000;
    let still = 0;
    run(b, 40, () => { const gap = Math.hypot(u.x - e.x, u.y - e.y) - u.r - e.r; if (gap < 1.2) { if (!u.moving) still++; } });
    expect(e.hp).toBeLessThan(e.maxHp);                                                  // 근접 유닛이 다가가 때렸다
    expect(still).toBeGreaterThan(20);                                                    // 붙은 뒤에는 멈춰서 싸운다
    expect(Math.hypot(u.x - e.x, u.y - e.y)).toBeLessThan(2.4);
  });
  it('원거리 유닛은 강 너머 적을 쏜다 (다리로 건너지 않아도)', () => {
    const b = mk([mortar], [biped], { towers: false }); const m = put(b, 0, 0, 4.5, 13); const e = dummy(put(b, 1, 0, 4.5, 21.5));
    run(b, 12);
    expect(rangeTiles(m.stats)).toBeGreaterThan(6); expect(e.hp).toBeLessThan(e.maxHp);
  });
});

describe('2D 아레나: 포탑·기지·왕관', () => {
  it('포탑은 사거리 안의 적 유닛(땅·공중)을 쏜다', () => {
    const b = mk([biped, flyer], [biped]); const g = put(b, 0, 0, 4.5, 12); const a = put(b, 0, 1, 13.5, 12);
    // 적 포탑(y=23.5) 사거리 안으로 옮긴다
    g.x = 4.5; g.y = 20; a.x = 13.5; a.y = 20; g.stats = { ...g.stats, speed: 0.001 }; a.stats = { ...a.stats, speed: 0.001 };
    let shots = 0; run(b, 5, () => { for (const e of b.events) if (e.type === 'tower' && e.team === 1) shots++; });
    expect(shots).toBeGreaterThan(2); expect(g.hp < g.maxHp && a.hp < a.maxHp).toBe(true);
  });
  it('포탑을 무너뜨리면 왕관 +1, 두 포탑이 다 무너지면 기지를 노린다', () => {
    const b = mk([blade, blade], [biped]); b.towers[1][0].hp = 1; b.towers[1][1].hp = 1;
    const u0 = put(b, 0, 0, 4.5, 12), u1 = put(b, 0, 1, 13.5, 12);
    run(b, 70);
    expect(b.crowns(0)).toBe(2);
    run(b, 30);
    expect(b.baseHp[1]).toBeLessThan(1000);
    void u0; void u1;
  });
  it('기지가 무너지면 즉시 끝나고 이긴 쪽이 정해진다', () => {
    const b = mk([blade], [biped]); b.baseHp[1] = 1; b.towers[1][0].hp = 0; b.towers[1][1].hp = 0;
    put(b, 0, 0, 9, 12); run(b, 80);
    expect(b.over).toBe(true); expect(b.result().winner).toBe(0);
  });
  it('시간이 끝나면 왕관이 많은 쪽이 이긴다', () => {
    const b = mk([biped], [biped]); b.towers[1][0].hp = 0;
    const r = (() => { while (b.step()) { /* */ } return b.result(); })();
    expect(r.crowns[0]).toBe(1); expect(r.winner).toBe(0);
  });
});

describe('2D 아레나: 결정론', () => {
  it('같은 시드·같은 입력이면 틱마다 같은 위치', () => {
    const go = () => { const b = new Battle(deckOf(biped, blade, flyer, mortar), deckOf(biped, blade, flyer, mortar), PARTS, 99, { hand: true, modules: true }); while (b.step()) { /* */ } return JSON.stringify([b.result(), b.units.map(u => [u.id, +u.x.toFixed(3), +u.y.toFixed(3)])]); };
    expect(go()).toBe(go());
  });
  it('봇끼리 끝까지 돌아가고 양쪽 모두 유닛을 내고 서로 피해를 준다', () => {
    const b = new Battle(deckOf(biped, blade, flyer, mortar), deckOf(biped, blade, flyer, mortar), PARTS, 5);
    while (b.step()) { /* */ }
    const r = b.result(); expect(r.spawned[0]).toBeGreaterThan(6); expect(r.spawned[1]).toBeGreaterThan(6); expect(r.kills[0] + r.kills[1]).toBeGreaterThan(2);
    void ARENA_W;
  });
});
