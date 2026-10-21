import { describe, it, expect } from 'vitest';
import { PARTS } from '../data/parts';
import { OPS, OP_DAILY_CAP, opOfDay, opLevel, isUnlocked, stageById, STAGES } from '../data/stages';
import { ruleById } from '../data/rules';
import { settleOp } from './rewards';
import { defaultSave, repairSave } from './save';
import { Battle } from './battle/sim';

const base = () => defaultSave(PARTS.map(p => p.id));
const op = OPS[3];

describe('요일 작전', () => {
  it('7일 모두 정의돼 있고 요일 번호가 맞으며 규칙이 존재한다', () => {
    expect(OPS.length).toBe(7);
    OPS.forEach((o, i) => { expect(o.op).toBe(i); expect(o.id).toBe(`op-${i}`); expect(stageById(o.id)).toBe(o); if (o.rule) expect(ruleById(o.rule)).toBeTruthy(); });
    expect(opOfDay(new Date(2026, 9, 21)).op).toBe(3);   // 2026-10-21 은 수요일
  });
  it('1장을 끝내야 열린다, 적 레벨은 깬 장에 따라 오른다', () => {
    expect(isUnlocked(op, {})).toBe(false);
    expect(isUnlocked(op, { 'c1-7': { clears: 1 } })).toBe(true);
    expect(opLevel({})).toBe(3); expect(opLevel({ 'c1-7': { clears: 1 } })).toBe(5);
    expect(opLevel({ 'c1-7': { clears: 1 }, 'c2-7': { clears: 1 } })).toBe(7); expect(opLevel({ 'c3-7': { clears: 1 } })).toBe(9);
  });
  it('하루 3번까지 전액(첫 승리 보급권 2, 그다음 1), 그 뒤 20%, 날이 바뀌면 다시', () => {
    let s = base();
    const w = (day: string) => { const r = settleOp(s, op, true, day, OP_DAILY_CAP); s = r.save; return r.rewards; };
    const r1 = w('2026-10-21'), r2 = w('2026-10-21'), r3 = w('2026-10-21'), r4 = w('2026-10-21');
    expect([r1.tickets, r2.tickets, r3.tickets, r4.tickets]).toEqual([2, 1, 1, 0]);
    expect(r1.ore).toBe(op.rewardOre); expect(r4.ore).toBe(Math.round(op.rewardOre * 0.2));
    expect(s.modes.opsDone).toBe(3);
    expect(w('2026-10-22').tickets).toBe(2); expect(s.modes.opsDone).toBe(1);
  });
  it('졌을 땐 위로 보상만, 횟수는 줄지 않는다', () => {
    const r = settleOp(base(), op, false, '2026-10-21', OP_DAILY_CAP);
    expect(r.rewards.tickets).toBe(0); expect(r.rewards.ore).toBeLessThan(50); expect(r.save.modes.opsDone).toBe(0);
  });
  it('세이브 복구: 망가진 modes 도 안전하게 읽는다', () => {
    const s = repairSave({ ...base(), modes: { opsDate: 5, opsDone: -3, towerBest: 'x', rushBest: 99 } }, PARTS.map(p => p.id));
    expect(s.modes).toEqual({ opsDate: '', opsDone: 0, towerBest: 0, rushWeek: '', rushDone: false, rushBest: 3 });
    expect(repairSave({}, PARTS.map(p => p.id)).modes.opsDone).toBe(0);
  });
  it('요일 작전 전투가 끝까지 돌고, 규칙이 적용된다', () => {
    for (const o of OPS) {
      const b = new Battle({ cards: STAGES[0].enemy.map(build => ({ build, level: 5 })) }, { cards: o.enemy.map(build => ({ build, level: 5 })) }, PARTS, 3, { rule: o.rule ?? null, boss: o.boss ?? null, skills: [[], o.enemySkills ?? []], hand: true, modules: true });
      let n = 0; while (b.step() && n++ < 20000) { /* */ }
      expect(b.over, o.id).toBe(true);
      expect(b.rule?.id ?? null).toBe(o.rule ?? null);
    }
  });
});
