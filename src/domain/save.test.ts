import { describe, it, expect } from 'vitest';
import { defaultSave, repairSave, isSane, commanderLevel, STARTER_DECK, DECK_SIZE } from './save';
import { PARTS } from '../data/parts';
import { assemble } from './assemble';

const ids = PARTS.map(p => p.id);

describe('세이브 (TD-006)', () => {
  it('기본 세이브의 시작 덱 6장은 모두 조립 가능하다', () => {
    const s = defaultSave(ids);
    expect(s.deck).toHaveLength(DECK_SIZE);
    for (const b of STARTER_DECK) expect(assemble(b, PARTS).ok).toBe(true);
    expect(isSane(s)).toBe(true);
  });

  it('쓰레기 입력은 기본 세이브가 된다', () => {
    for (const bad of [null, undefined, 5, 'x', [], {}]) expect(isSane(repairSave(bad, ids))).toBe(true);
  });

  it('NaN·음수·무한대·범위 밖 레벨을 고친다', () => {
    const s = repairSave({ ore: NaN, tickets: -5, commanderExp: Infinity, partLevels: { legs_hover: 99, body_arm_scout: -3 } }, ids);
    expect(s.ore).toBe(300);
    expect(s.tickets).toBe(0);
    expect(s.commanderExp).toBeGreaterThanOrEqual(0);
    expect(s.partLevels.legs_hover).toBe(10);
    expect(s.partLevels.body_arm_scout).toBe(1);
  });

  it('없는 부품 id 가 든 덱 칸은 시작 덱으로 되돌린다', () => {
    const s = repairSave({ deck: [{ legs: 'nope', body: 'x', weapon: 'y' }] }, ids);
    expect(s.deck[0]).toEqual(STARTER_DECK[0]);
    expect(s.deck).toHaveLength(DECK_SIZE);
  });

  it('정상 덱·기록은 그대로 보존한다', () => {
    const base = defaultSave(ids);
    base.deck[1] = { legs: 'legs_track_heavy', body: 'body_turret_bunker', weapon: 'wpn_turret_cannon', accessory: 'acc_plate' };
    base.stages['t1'] = { clears: 2, bestBaseHp: 640 };
    base.flags.assembled = true; base.ore = 1234;
    const round = repairSave(JSON.parse(JSON.stringify(base)), ids);
    expect(round).toEqual(base);
  });

  it('사령관 레벨: 100, 300, 600 … 누적', () => {
    expect(commanderLevel(0)).toEqual({ level: 1, into: 0, need: 100 });
    expect(commanderLevel(100).level).toBe(2);
    expect(commanderLevel(299).level).toBe(2);
    expect(commanderLevel(300).level).toBe(3);
    expect(commanderLevel(1e9).level).toBe(30);
  });
});
