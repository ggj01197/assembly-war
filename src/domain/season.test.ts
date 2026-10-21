import { describe, it, expect } from 'vitest';
import { PARTS } from '../data/parts';
import { EVENT_STAGE, stageById, isUnlocked } from '../data/stages';
import { defaultSave, repairSave } from './save';
import { SEASONS, activeSeason, upcomingSeason, daysLeft, daysBetween, addSeasonPoints, battlePoints, claimMilestone, milestoneReady, settleEvent, SEASON_DAILY_POINT_CAP, EVENT_DAILY_CAP } from './season';
import { COUPONS, couponHash, normalize, redeemCoupon } from './coupons';

const base = () => defaultSave(PARTS.map(p => p.id));
const IN = '2026-11-10', BEFORE = '2026-10-21', AFTER = '2027-01-02';
const epic = PARTS.find(p => p.id === 'epic') ? 'epic' : PARTS[PARTS.length - 1].id;

describe('시즌 이벤트', () => {
  it('기간 안에서만 열리고, 시작 전·종료 후에는 열리지 않는다', () => {
    expect(activeSeason(IN)?.id).toBe('s1'); expect(activeSeason('2026-11-01')?.id).toBe('s1'); expect(activeSeason('2026-12-31')?.id).toBe('s1');
    expect(activeSeason(BEFORE)).toBeNull(); expect(activeSeason(AFTER)).toBeNull();
    expect(upcomingSeason(BEFORE)?.id).toBe('s1'); expect(upcomingSeason(IN)).toBeNull();
    expect(daysBetween('2026-10-21', '2026-11-01')).toBe(11); expect(daysLeft(SEASONS[0], '2026-12-30')).toBe(1); expect(daysLeft(SEASONS[0], AFTER)).toBe(0);
  });
  it('포인트는 열린 시즌에서만, 하루 상한 150, 날이 바뀌면 다시', () => {
    const s = base();
    expect(addSeasonPoints(s, BEFORE, 50)).toBe(0); expect(s.season.points).toBe(0);
    expect(addSeasonPoints(s, IN, 100)).toBe(100); expect(addSeasonPoints(s, IN, 100)).toBe(SEASON_DAILY_POINT_CAP - 100); expect(addSeasonPoints(s, IN, 10)).toBe(0);
    expect(s.season.points).toBe(150); expect(addSeasonPoints(s, '2026-11-11', 30)).toBe(30); expect(s.season.points).toBe(180);
    expect(addSeasonPoints(s, IN, -5)).toBe(0);
  });
  it('전투 포인트: 승리 10 + 보너스, 패배 2 (보너스 없음)', () => { expect(battlePoints(true, 5)).toBe(15); expect(battlePoints(false, 5)).toBe(2); });
  it('단계 보상은 포인트가 차야 한 번만 받는다', () => {
    let s = base(); addSeasonPoints(s, IN, 100);
    expect(milestoneReady(s, SEASONS[0], 0)).toBe(true); expect(milestoneReady(s, SEASONS[0], 1)).toBe(true); expect(milestoneReady(s, SEASONS[0], 2)).toBe(false);
    const r = claimMilestone(s, IN, 0, epic)!; s = r.save; expect(s.ore).toBe(300 + 200);
    expect(claimMilestone(s, IN, 0, epic)).toBeNull(); expect(claimMilestone(s, IN, 2, epic)).toBeNull(); expect(claimMilestone(s, AFTER, 1, epic)).toBeNull();
  });
  it('마지막 단계는 부품 조각까지 준다', () => {
    let s = base(); s.season = { ...s.season, id: 's1', points: 1400 };
    const last = SEASONS[0].milestones.length - 1; const r = claimMilestone(s, IN, last, epic)!;
    expect(r.copies).toEqual({ part: epic, n: 5 }); expect(r.save.copies[epic]).toBe(5);
  });
  it('시즌이 바뀌면 포인트를 새로 시작', () => { const s = base(); s.season = { ...s.season, id: 'old', points: 500, claimed: [0] }; addSeasonPoints(s, IN, 10); expect(s.season.id).toBe('s1'); expect(s.season.points).toBe(10); expect(s.season.claimed).toEqual([]); });
  it('별빛 방어전: 하루 3번 전액(첫 승리 보급권 1), 그 뒤 20%, 졌을 땐 위로 보상', () => {
    let s = base();
    const go = (win: boolean, day = IN) => { const r = settleEvent(s, EVENT_STAGE, win, day); s = r.save; return r; };
    const r = [go(true), go(true), go(true), go(true)];
    expect(r.map(x => x.rewards.tickets)).toEqual([1, 0, 0, 0]); expect(r[0].rewards.ore).toBe(EVENT_STAGE.rewardOre); expect(r[3].rewards.ore).toBe(Math.round(EVENT_STAGE.rewardOre * 0.2));
    expect(r.map(x => x.full)).toEqual([true, true, true, false]); expect(s.season.evDone).toBe(EVENT_DAILY_CAP);
    expect(go(true, '2026-11-11').full).toBe(true); expect(go(false).rewards.ore).toBe(20);
  });
  it('이벤트 전투 스테이지가 있고 1장 클리어 후 열린다', () => {
    expect(stageById('event')).toBe(EVENT_STAGE); expect(isUnlocked(EVENT_STAGE, {})).toBe(false); expect(isUnlocked(EVENT_STAGE, { 'c1-7': { clears: 1 } })).toBe(true);
  });
  it('세이브 복구: 망가진 season·coupons 를 안전하게 읽는다', () => {
    const ids = PARTS.map(p => p.id);
    const r = repairSave({ ...base(), season: { id: 5, points: -3, claimed: [1, 1, 'x', 99, 2], evDone: 'a' }, coupons: ['abcdef01', 'nothex', 5] }, ids);
    expect(r.season).toEqual({ id: '', points: 0, claimed: [1, 2], ptsDate: '', ptsToday: 0, evDate: '', evDone: 0 }); expect(r.coupons).toEqual(['abcdef01']);
    expect(repairSave({}, ids).coupons).toEqual([]);
  });
});

describe('쿠폰 코드', () => {
  it('해시는 공백·하이픈·대소문자와 무관하고 코드는 앱 안에 평문으로 없다', () => {
    expect(couponHash('welcome-assembly')).toBe(couponHash(' WELCOME ASSEMBLY ')); expect(normalize('a-b_c d')).toBe('ABCD');
    expect(COUPONS.every(c => /^[0-9a-f]{8}$/.test(c.h))).toBe(true);
  });
  it('맞는 코드는 보상을 주고 한 번만, 틀린 코드·짧은 코드는 거절', () => {
    let s = base();
    const r = redeemCoupon(s, 'welcome-assembly', IN); expect(r.ok).toBe(true); if (!r.ok) return;
    s = r.save; expect(s.ore).toBe(300 + 500); expect(s.tickets).toBe(2);
    const again = redeemCoupon(s, 'WELCOMEASSEMBLY', IN); expect(again.ok).toBe(false);
    expect(redeemCoupon(s, 'NOPE-NOPE', IN).ok).toBe(false); expect(redeemCoupon(s, 'ab', IN).ok).toBe(false); expect(redeemCoupon(s, 'x'.repeat(50), IN).ok).toBe(false);
  });
  it('유효기간이 지난 쿠폰은 거절', () => {
    expect(redeemCoupon(base(), 'STARLIGHT-WINTER', '2026-12-31').ok).toBe(true);
    const late = redeemCoupon(base(), 'STARLIGHT-WINTER', '2027-01-01'); expect(late.ok).toBe(false); if (!late.ok) expect(late.msg).toContain('기간');
  });
});
