import { describe, it, expect } from 'vitest';
import { PARTS } from '../data/parts';
import { defaultSave, repairSave } from './save';
import { WEEKLY, WEEKLY_BONUS, ACHIEVEMENTS, addWeekly, ensureWeekly, claimWeekly, claimWeeklyBonus, bonusReady, claimAch, achDone, achClaimable, weeklyProgress } from './goals';

const base = () => defaultSave(PARTS.map(p => p.id));
const W1 = '2026-10-19', W2 = '2026-10-26';

describe('주간 과제', () => {
  it('진행도는 목표를 넘지 않고 주가 바뀌면 새로 시작(업적 기록은 유지)', () => {
    const s = base(); addWeekly(s, 'wins', W1, 99); expect(weeklyProgress(s, 'wins', W1)).toBe(12);
    s.goals.ach.push('ac_win1'); addWeekly(s, 'ops', W2); expect(weeklyProgress(s, 'wins', W2)).toBe(0); expect(weeklyProgress(s, 'ops', W2)).toBe(1); expect(s.goals.ach).toEqual(['ac_win1']);
    addWeekly(s, 'hero', W2, 0); addWeekly(s, 'hero', W2, -3); expect(weeklyProgress(s, 'hero', W2)).toBe(0);
  });
  it('완료한 것만 한 번 받고, 5개를 모두 받으면 보너스가 열린다', () => {
    let s = base(); ensureWeekly(s, W1);
    expect(claimWeekly(s, 'wins', W1)).toBeNull();
    for (const w of WEEKLY) addWeekly(s, w.type, W1, w.target);
    expect(bonusReady(s, W1)).toBe(false);
    const ore0 = s.ore;
    for (const w of WEEKLY) { const r = claimWeekly(s, w.type, W1)!; expect(r).toBeTruthy(); s = r.save; expect(claimWeekly(s, w.type, W1)).toBeNull(); }
    expect(s.ore).toBe(ore0 + WEEKLY.reduce((a, w) => a + w.reward.ore, 0));
    expect(bonusReady(s, W1)).toBe(true);
    const b = claimWeeklyBonus(s, W1)!; expect(b.reward).toEqual(WEEKLY_BONUS); expect(claimWeeklyBonus(b.save, W1)).toBeNull();
    expect(bonusReady(b.save, W2)).toBe(false);
  });
});

describe('업적', () => {
  it('25개, id 중복 없음, 보상은 모두 양수', () => {
    expect(ACHIEVEMENTS.length).toBe(25); expect(new Set(ACHIEVEMENTS.map(a => a.id)).size).toBe(ACHIEVEMENTS.length);
    for (const a of ACHIEVEMENTS) { expect(a.reward.ore, a.id).toBeGreaterThan(0); expect(a.target).toBeGreaterThan(0); }
  });
  it('조건을 채우면 받을 수 있고 한 번만 받는다', () => {
    let s = base();
    expect(achClaimable(s)).toBe(0);
    s.winCount = 12; s.modes.towerBest = 11; s.stages['c1-7'] = { clears: 1, bestBaseHp: 1 };
    const ids = ACHIEVEMENTS.filter(a => achDone(s, a)).map(a => a.id);
    expect(ids).toEqual(expect.arrayContaining(['ac_win1', 'ac_win10', 'ac_ch1', 'ac_tw10']));
    expect(ids).not.toContain('ac_win50');
    expect(achClaimable(s)).toBe(ids.length);
    const r = claimAch(s, 'ac_win10')!; expect(r.title).toBe('신참 지휘관'); s = r.save;
    expect(claimAch(s, 'ac_win10')).toBeNull(); expect(claimAch(s, 'ac_win50')).toBeNull(); expect(claimAch(s, 'nope')).toBeNull();
  });
  it('세이브 복구: 망가진 goals 를 안전하게 읽는다', () => {
    const ids = PARTS.map(p => p.id);
    const s = repairSave({ ...base(), goals: { week: 3, prog: { wins: 999, ops: -2, x: 4 }, claimed: ['wins', 'zzz'], bonus: 1, ach: ['ac_win1', 'bad'] } }, ids);
    expect(s.goals).toEqual({ week: '', prog: { wins: 12 }, claimed: ['wins'], bonus: true, ach: ['ac_win1'] });
    expect(repairSave({}, ids).goals.ach).toEqual([]);
  });
});
