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

import { towerStage, TOWER_MAX, RUSH, RUSH_BONUS, weekKey, nextStage } from '../data/stages';
import { settleTower, settleRush } from './rewards';

describe('무한의 탑', () => {
  it('층 구성은 층 번호만으로 정해지고(결정론) 층이 오를수록 강해진다', () => {
    expect(JSON.stringify(towerStage(7))).toBe(JSON.stringify(towerStage(7)));
    expect(towerStage(20).enemyLevel).toBeGreaterThan(towerStage(2).enemyLevel);
    expect(towerStage(1).enemy.length).toBe(3); expect(towerStage(40).enemy.length).toBe(6);
    expect(stageById('tower-12')?.tower).toBe(12); expect(stageById('tower-0')).toBeUndefined(); expect(stageById(`tower-${TOWER_MAX + 1}`)).toBeUndefined();
  });
  it('규칙은 3층마다, 보스는 10층마다 순환', () => {
    expect(towerStage(2).rule).toBeUndefined(); expect(towerStage(3).rule).toBeTruthy(); expect(towerStage(9).rule).toBeTruthy();
    expect(towerStage(10).boss).toBe('boss_mother'); expect(towerStage(20).boss).toBe('boss_fortress'); expect(towerStage(30).boss).toBe('boss_general'); expect(towerStage(40).boss).toBe('boss_mother');
    for (let f = 1; f <= TOWER_MAX; f++) { const t = towerStage(f); if (t.rule) expect(ruleById(t.rule), String(f)).toBeTruthy(); }
  });
  it('최고 층을 넘기면 전액·보급권(5층 1, 10층 2), 이미 깬 층은 20%, 지면 기록 그대로', () => {
    let s = base();
    const go = (f: number, win = true) => { const r = settleTower(s, towerStage(f), win); s = r.save; return r; };
    expect(go(1).record).toBe(true); expect(s.modes.towerBest).toBe(1);
    for (let f = 2; f <= 4; f++) go(f);
    const r5 = go(5); expect(r5.rewards.tickets).toBe(1); for (let f = 6; f <= 9; f++) go(f);
    expect(go(10).rewards.tickets).toBe(2);
    const again = go(4); expect(again.record).toBe(false); expect(again.rewards.ore).toBe(Math.round(towerStage(4).rewardOre * 0.2));
    const lose = go(11, false); expect(s.modes.towerBest).toBe(10); expect(lose.rewards.ore).toBeLessThan(50);
  });
  it('nextStage: 다음 층', () => { expect(nextStage(towerStage(5))?.tower).toBe(6); expect(nextStage(towerStage(TOWER_MAX))).toBeUndefined(); });
});

describe('보스 러시', () => {
  it('3연전, 2장을 끝내야 열린다, 다음 보스로 이어진다', () => {
    expect(RUSH.length).toBe(3); expect(RUSH.every(r => r.boss)).toBe(true);
    expect(isUnlocked(RUSH[0], { 'c1-7': { clears: 1 } })).toBe(false); expect(isUnlocked(RUSH[0], { 'c2-7': { clears: 1 } })).toBe(true);
    expect(nextStage(RUSH[0])?.id).toBe('rush-2'); expect(nextStage(RUSH[1])?.id).toBe('rush-3'); expect(nextStage(RUSH[2])).toBeUndefined();
  });
  it('주간 보너스는 3번째 보스를 이번 주 처음 이길 때 한 번만, 주가 바뀌면 다시', () => {
    let s = base();
    const go = (k: 0 | 1 | 2, week: string, win = true) => { const r = settleRush(s, RUSH[k], win, week, RUSH_BONUS); s = r.save; return r.rewards; };
    expect(go(0, '2026-10-19').tickets).toBe(0); go(1, '2026-10-19');
    const fin = go(2, '2026-10-19'); expect(fin.tickets).toBe(RUSH_BONUS.tickets); expect(fin.ore).toBe(RUSH[2].rewardOre + RUSH_BONUS.ore); expect(s.modes.rushBest).toBe(3);
    expect(go(2, '2026-10-19').tickets).toBe(0);
    expect(go(2, '2026-10-26').tickets).toBe(RUSH_BONUS.tickets);
    expect(go(0, '2026-10-26', false).ore).toBeLessThan(50);
  });
  it('weekKey: 같은 주(월~일)는 월요일 날짜로 같다', () => {
    expect(weekKey(new Date(2026, 9, 21))).toBe('2026-10-19'); expect(weekKey(new Date(2026, 9, 25))).toBe('2026-10-19'); expect(weekKey(new Date(2026, 9, 26))).toBe('2026-10-26');
  });
  it('시작 기지 체력 옵션이 적용된다', () => {
    const b = new Battle({ cards: RUSH[0].enemy.map(build => ({ build })) }, { cards: RUSH[0].enemy.map(build => ({ build })) }, PARTS, 1, { startHp: [640, 1000] });
    expect(b.baseHp[0]).toBe(640); expect(b.baseHp[1]).toBe(1000);
  });
});
