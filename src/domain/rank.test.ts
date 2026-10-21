import { describe, it, expect } from 'vitest';
import { PARTS } from '../data/parts';
import { stageById } from '../data/stages';
import { defaultSave, repairSave } from './save';
import { TIERS, tierOf, toNext, opponentFor, opponentTier, opponentValid, rankStage, settleRank, ensureSeason, claimSeason } from './rank';
import { assemble } from './assemble';

const base = () => defaultSave(PARTS.map(p => p.id));

describe('랭크전: AI 지휘관', () => {
  it('품계 6단계, 점수로 품계가 정해진다', () => {
    expect(TIERS.length).toBe(6);
    expect([0, 99, 100, 249, 250, 999, 1000, 5000].map(tierOf)).toEqual([0, 0, 1, 1, 2, 4, 5, 5]);
    expect(toNext(0)).toBe(100); expect(toNext(1200)).toBeNull();
  });
  it('같은 (품계, 시드)면 같은 상대, 설계도 6장 모두 조립 가능, 대공 카드 포함', () => {
    for (let t = 0; t < 6; t++) for (let sd = 1; sd <= 25; sd++) {
      const a = opponentFor(t, sd), b = opponentFor(t, sd);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      expect(opponentValid(a), `${t}-${sd}`).toBe(true);
      expect(a.builds.some(x => assemble(x, PARTS).stats!.target !== 'ground'), `air ${t}-${sd}`).toBe(true);
      expect(a.skills.length).toBe(2);
    }
    expect(JSON.stringify(opponentFor(2, 1))).not.toBe(JSON.stringify(opponentFor(2, 2)));
  });
  it('상대 품계는 내 품계 −1~+1, 레벨은 품계에 따라 오른다, 스테이지 id 로 다시 만들어진다', () => {
    for (let sd = 1; sd < 50; sd++) { const o = opponentTier(2, sd); expect(o).toBeGreaterThanOrEqual(1); expect(o).toBeLessThanOrEqual(3); }
    expect(opponentTier(0, 3)).toBeGreaterThanOrEqual(0); expect(opponentTier(5, 3)).toBeLessThanOrEqual(5);
    expect(rankStage(5, 9).enemyLevel).toBeGreaterThan(rankStage(0, 9).enemyLevel);
    const st = rankStage(3, 777); const again = stageById(st.id)!;
    expect(again.rank).toEqual(st.rank); expect(JSON.stringify(again.enemy)).toBe(JSON.stringify(st.enemy));
    expect(stageById('rank-9-1')).toBeTruthy();   // 한 자리 숫자면 파싱은 되고 품계는 범위로 잘린다
    expect(stageById('rank-x-1')).toBeUndefined();
  });
});

describe('랭크전 정산', () => {
  it('이기면 점수가 오르고, 강한 상대일수록 많이 오른다', () => {
    const s = base(); s.rank.week = '2026-10-19';
    const lo = settleRank(s, { rank: { tier: 0 }, rewardOre: 100, rewardExp: 40 }, true, '2026-10-19');
    const hi = settleRank(s, { rank: { tier: 1 }, rewardOre: 140, rewardExp: 50 }, true, '2026-10-19');
    expect(lo.delta).toBe(25); expect(hi.delta).toBe(31); expect(lo.save.rank.wins).toBe(1); expect(lo.save.ore).toBe(s.ore + 100);
  });
  it('지면 점수가 내려가지만 현재 품계 아래로는 안 내려가고 0 미만이 없다', () => {
    const s = base(); s.rank.week = 'w'; s.rank.rp = 110; s.rank.best = 1;
    const r = settleRank(s, { rank: { tier: 1 }, rewardOre: 100, rewardExp: 40 }, false, 'w');
    expect(r.save.rank.rp).toBe(100); expect(r.delta).toBe(-10); expect(r.rewards.ore).toBe(20);
    const z = settleRank(base(), { rank: { tier: 0 }, rewardOre: 100, rewardExp: 40 }, false, '');
    expect(z.save.rank.rp).toBe(0);
  });
  it('처음 오른 품계에만 보급권(품계 번호만큼), 같은 품계로 다시 오르면 없다, 시드가 바뀐다', () => {
    const s = base(); s.rank.week = 'w'; s.rank.rp = 90;
    const r = settleRank(s, { rank: { tier: 1 }, rewardOre: 140, rewardExp: 50 }, true, 'w');
    expect(r.promoted).toBe(true); expect(r.rewards.tickets).toBe(1); expect(r.save.rank.best).toBe(1); expect(r.note).toContain('승급');
    expect(r.save.rank.seed).not.toBe(s.rank.seed);
    const t = structuredClone(r.save); t.rank.rp = 99; t.rank.week = 'w';
    expect(settleRank(t, { rank: { tier: 1 }, rewardOre: 140, rewardExp: 50 }, true, 'w').rewards.tickets).toBe(0);
  });
  it('시즌: 새 주가 되면 점수 70%·보상 보류, 받으면 지급, 처음 주는 보상 없음', () => {
    const s = base(); ensureSeason(s, 'w1'); expect(s.rank.pending).toBeNull();
    s.rank.rp = 500; s.rank.wins = 9; ensureSeason(s, 'w2');
    expect(s.rank.rp).toBe(350); expect(s.rank.wins).toBe(0); expect(s.rank.pending).toEqual({ ore: 900, tickets: 1 });
    const c = claimSeason(s)!; expect(c.save.ore).toBe(s.ore + 900); expect(c.save.rank.pending).toBeNull(); expect(claimSeason(c.save)).toBeNull();
  });
  it('세이브 복구: 망가진 rank 를 안전하게 읽는다', () => {
    const r = repairSave({ ...base(), rank: { rp: -5, best: 99, week: 3, seed: 'x', pending: { ore: -1, tickets: 'a' } } }, PARTS.map(p => p.id));
    expect(r.rank).toEqual({ rp: 0, best: 5, week: '', seed: 1, wins: 0, plays: 0, pending: { ore: 0, tickets: 0 } });
    expect(repairSave({}, PARTS.map(p => p.id)).rank.pending).toBeNull();
  });
});
