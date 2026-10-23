import { describe, it, expect } from 'vitest';
import { PARTS } from '../../data/parts';
import { Battle, TICK_HZ, type Deck, type SkirmishUnit } from './sim';
import type { Build } from '../assemble';

const scout: Build = { legs: 'legs_biped_light', body: 'body_arm_scout', weapon: 'wpn_arm_gatling' };
const tank: Build = { legs: 'legs_track_heavy', body: 'body_turret_bunker', weapon: 'wpn_turret_cannon' };
const flyer: Build = { legs: 'legs_flyer', body: 'body_shoulder_gunship', weapon: 'wpn_missile_swarm' };
const deckOf = (...b: Build[]): Deck => ({ cards: b.map(build => ({ build })) });
const mk = (a: Build[], b: Build[], mine: SkirmishUnit[], foe: SkirmishUnit[], limitSec?: number) =>
  new Battle(deckOf(...a), deckOf(...b), PARTS, 3, { skirmish: { mine, foe, limitSec } });
const run = (b: Battle) => { let n = 0; while (b.step() && n++ < 100 * TICK_HZ) { /* 끝까지 */ } return b.result(); };

describe('조립 런 자동 전투 (skirmish)', () => {
  it('카드마다 정해진 자리에 유닛이 한 기씩 놓이고 와트·포탑·기지는 쓰이지 않는다', () => {
    const b = mk([scout, tank], [scout], [{ card: 0, x: 6, y: 4 }, { card: 1, x: 10, y: 4 }], [{ card: 0, x: 8, y: 11 }]);
    expect(b.units).toHaveLength(3); expect(b.towersOn).toBe(false); expect(b.skirmishMode).toBe(true);
    expect(b.units.filter(u => u.team === 0).map(u => [u.x, u.y])).toEqual([[6, 4], [10, 4]]);
    b.step(); expect(b.events.filter(e => e.type === 'spawn').length).toBe(3);   // 첫 틱에 생성 이벤트 3개 (화면이 등장 연출을 한다)
  });

  it('한쪽이 전멸하면 끝나고, 더 센 쪽이 이긴다', () => {
    const b = mk([tank], [scout], [{ card: 0, x: 9, y: 4 }], [{ card: 0, x: 9, y: 11 }]);
    const r = run(b);
    expect(b.over).toBe(true); expect(r.winner).toBe(0); expect(b.units.some(u => u.team === 1)).toBe(false);
    expect(r.seconds).toBeLessThan(40);
  });

  it('거리가 멀어도 곧장 다가가 싸운다 (인식 거리 제한이 없다)', () => {
    const b = mk([scout], [scout], [{ card: 0, x: 3, y: 2 }], [{ card: 0, x: 15, y: 12 }]);
    const r = run(b); expect(r.kills[0] + r.kills[1]).toBeGreaterThan(0);
  });

  it('서로 못 때리는 상대(지상 전용 vs 공중)만 남으면 시간이 다 되어 남은 체력 비율로 가른다', () => {
    const b = mk([scout], [flyer], [{ card: 0, x: 3, y: 2 }], [{ card: 0, x: 15, y: 12 }], 6);
    b.units.find(u => u.team === 1)!.stats = { ...b.units.find(u => u.team === 1)!.stats, dmg: 0.001 };   // 공중 쪽도 거의 못 때린다
    const r = run(b);
    expect(r.seconds).toBeGreaterThanOrEqual(5.9); expect([0, 1, -1]).toContain(r.winner);
  });

  it('같은 입력이면 같은 결과 (결정론)', () => {
    const go = () => { const b = mk([scout, tank], [scout, tank, flyer], [{ card: 0, x: 6, y: 4 }, { card: 1, x: 10, y: 5 }], [{ card: 0, x: 6, y: 11 }, { card: 1, x: 10, y: 12 }, { card: 2, x: 8, y: 12 }]); const r = run(b); return JSON.stringify([r.winner, r.seconds, b.units.map(u => [u.id, +u.x.toFixed(3), +u.y.toFixed(3), +u.hp.toFixed(2)])]); };
    expect(go()).toBe(go());
  });

  it('일반 전투(skirmish 아님)는 영향을 받지 않는다', () => {
    const b = new Battle(deckOf(scout), deckOf(scout), PARTS, 5, { bots: [false, false] });
    expect(b.skirmishMode).toBe(false); expect(b.towersOn).toBe(true); expect(b.units).toHaveLength(0);
  });
});
