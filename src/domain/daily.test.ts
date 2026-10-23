import { describe, it, expect } from 'vitest';
import { ensureDaily, addProgress, claimMission, refreshMission, missionDone, MISSIONS, MISSION_REWARDS, attendReward, claimAttend, canAttend, attendDay, ATTEND_DAYS,
  adsLeft, canWatchAd, recordAd, AD_DAILY_CAP, AD_SLOTS, lossOre, salvageCopies, todayStr, type AdSlot } from './daily';
import { defaultSave, repairSave } from './save';
import { Battle, type Deck } from './battle/sim';
import { PARTS } from '../data/parts';

const ids = PARTS.map(p => p.id);
const fresh = () => defaultSave(ids);
const biped = { legs: 'legs_biped_light', body: 'body_arm_scout', weapon: 'wpn_arm_gatling' };
const deck = (...b: typeof biped[]): Deck => ({ cards: b.map(build => ({ build })) });

describe('일일 임무 3개', () => {
  it('날짜가 바뀔 때만 새로 뽑고, 같은 날짜는 같은 임무(서로 다른 3종)가 나온다', () => {
    const a = ensureDaily(fresh(), '2026-10-19'), b = ensureDaily(fresh(), '2026-10-19');
    expect(a.daily.missions).toHaveLength(3); expect(a.daily).toEqual(b.daily);
    expect(new Set(a.daily.missions.map(m => m.type)).size).toBe(3);
    expect(ensureDaily(a, '2026-10-19')).toBe(a);
    const c = ensureDaily(a, '2026-10-20'); expect(c.daily.date).toBe('2026-10-20'); expect(c.daily.missions.every(m => m.progress === 0 && !m.claimed)).toBe(true);
    const days = new Set(Array.from({ length: 30 }, (_, i) => ensureDaily(fresh(), `2026-11-${String(i + 1).padStart(2, '0')}`).daily.missions.map(m => m.type).join()));
    expect(days.size).toBeGreaterThan(5);   // 날마다 다양하다
  });

  it('진행도는 목표를 넘지 않고, 완료해야 받을 수 있고, 한 번만 받는다', () => {
    const s = ensureDaily(fresh(), '2026-10-19'), t = s.daily.missions[0];
    addProgress(s, t.type, 999);
    expect(s.daily.missions[0].progress).toBe(t.target); expect(missionDone(s.daily.missions[0])).toBe(true);
    expect(claimMission(s, 1)).toBeNull();                     // 아직 미완료(0 진행)
    const r = claimMission(s, 0)!; expect(r.reward).toEqual(MISSION_REWARDS[0]);
    expect(r.save.ore).toBe(s.ore + MISSION_REWARDS[0].ore);
    expect(claimMission(r.save, 0)).toBeNull();
  });

  it('임무 새로 고침(광고 A6)은 하루 1번, 안 받은 임무만, 다른 종류로', () => {
    const s = ensureDaily(fresh(), '2026-10-19'); const before = s.daily.missions[1].type;
    const r = refreshMission(s, 1, () => 0)!;
    expect(r.daily.missions[1].type).not.toBe(before); expect(new Set(r.daily.missions.map(m => m.type)).size).toBe(3); expect(r.daily.refreshed).toBe(true);
    expect(refreshMission(r, 2)).toBeNull();
    addProgress(s, s.daily.missions[0].type, 99); const c = claimMission(s, 0)!.save;
    expect(refreshMission(c, 0)).toBeNull();
  });

  it('전투 결과 통계(생산·스킬·영웅·와트)가 Battle 에서 나온다', () => {
    const b = new Battle(deck(biped), deck(biped), PARTS, 5, { bots: [false, false], skills: [['sk_overload'], []], heroes: ['hero_vanguard', null] });
    b.watt[0] = 10; b.spawn(0, 0, 9, 8); b.castSkill(0, 0); b.watt[0] = 10; b.deployHero(0, 9, 10);
    const r = b.result();
    expect(r.skillUses[0]).toBe(1); expect(r.heroDeploys[0]).toBe(1); expect(r.wattSpent[0]).toBe(3 + 3 + 6); expect(r.spawned[0]).toBe(1);
  });
});

describe('출석 28일', () => {
  it('하루 한 번, 1일차부터 차례로, 28일 뒤에는 처음으로', () => {
    let s = fresh();
    expect(attendDay(s)).toBe(1); expect(canAttend(s, '2026-10-19')).toBe(true);
    const r = claimAttend(s, '2026-10-19')!; s = r.save;
    expect(r.day).toBe(1); expect(s.ore).toBe(fresh().ore + attendReward(1).ore);
    expect(claimAttend(s, '2026-10-19')).toBeNull();
    for (let i = 2; i <= 28; i++) s = claimAttend(s, `2026-11-${String(i).padStart(2, '0')}`)!.save;
    expect(s.attend.claimed).toBe(28); expect(attendDay(s)).toBe(1);
    expect(canAttend(s, '2026-12-30')).toBe(true);
  });

  it('보상표: 7·14·21일 에픽 조각 3, 28일 큰 보상, 29일차는 1일차와 같다', () => {
    for (const d of [7, 14, 21]) expect(attendReward(d).copies?.n).toBe(3);
    const last = attendReward(28); expect(last.copies?.n).toBe(5); expect(last.tickets).toBe(3);
    expect(attendReward(ATTEND_DAYS + 1)).toEqual(attendReward(1));
    const s = fresh(); s.attend = { claimed: 6, lastDate: '2026-10-18' };
    const r = claimAttend(s, '2026-10-19')!; expect(r.day).toBe(7);
    expect(Object.values(r.save.copies).reduce((a, b) => a + b, 0)).toBe(3);
  });

  it('날짜를 건너뛰어도 벌칙 없이 이어서 받는다', () => {
    const s = fresh(); s.attend = { claimed: 2, lastDate: '2026-10-01' };
    expect(claimAttend(s, '2026-10-19')!.day).toBe(3);
  });
});

describe('보상형 광고 8곳 (하루 15회)', () => {
  const slots = Object.keys(AD_SLOTS) as AdSlot[];
  it('자리 8곳이고, 자리별 상한 합이 15 이상이며 전체 상한 15 를 지킨다', () => {
    expect(slots).toHaveLength(8);
    const sum = slots.reduce((a, k) => a + AD_SLOTS[k].cap, 0);
    expect(sum).toBeGreaterThanOrEqual(AD_DAILY_CAP);
    const s = fresh(); const d = '2026-10-19';
    let n = 0; for (const k of slots) while (canWatchAd(s, d, k)) { recordAd(s, d, k); n++; if (n > 40) break; }
    expect(n).toBe(Math.min(AD_DAILY_CAP, sum));
    expect(adsLeft(s, d)).toBe(0);
  });
  it('자리별 상한: A6·A7·A8 은 하루 1번, 날짜가 바뀌면 다시 열린다', () => {
    const s = fresh(); const d = '2026-10-19';
    for (const k of ['mission_refresh', 'salvage_full', 'boss_extra'] as AdSlot[]) { expect(canWatchAd(s, d, k)).toBe(true); recordAd(s, d, k); expect(canWatchAd(s, d, k)).toBe(false); }
    expect(canWatchAd(s, '2026-10-20', 'mission_refresh')).toBe(true);
  });
  it('패배 광석 회수는 쓴 와트의 30%(와트당 10, 최대 400)', () => { expect(lossOre(0)).toBe(0); expect(lossOre(60)).toBe(180); expect(lossOre(9999)).toBe(400); });
});

describe('분해 · 저장 보정 · 이어하기', () => {
  it('분해는 조각 전부를 광석으로(70%, 광고 후 100%)', () => {
    const s = fresh(); s.copies.legs_biped_light = 10;   // 일반 30 광석/조각
    expect(salvageCopies(s, 'legs_biped_light', false)!.ore).toBe(Math.floor(10 * 30 * 0.7));
    const f = salvageCopies(s, 'legs_biped_light', true)!; expect(f.ore).toBe(300); expect(f.save.copies.legs_biped_light).toBeUndefined();
    expect(salvageCopies(fresh(), 'legs_biped_light', false)).toBeNull();
  });
  it('망가진 일일·출석·광고 값도 고쳐서 읽는다', () => {
    const s = repairSave({ daily: { date: 5, missions: [{ type: 'nope' }, { type: 'win', target: 'x', progress: -3, claimed: 1 }], refreshed: 1 }, attend: { claimed: -9, lastDate: 7 }, ads: { date: 3, used: 'a', bySlot: { result_double: 2, zzz: 9 } }, noAds: 'yes' }, ids);
    expect(s.daily.missions).toEqual([]); expect(s.attend).toEqual({ claimed: 0, lastDate: '' }); expect(s.ads.bySlot).toEqual({ result_double: 2 }); expect(s.noAds).toBe(true);
    expect(todayStr(new Date(2026, 9, 9))).toBe('2026-10-09');
    expect(MISSIONS.length).toBeGreaterThanOrEqual(8);
  });
  it('5분 버티기 이어하기: 기지 절반 체력·30초 보호막, 기지 앞 적 제거', () => {
    const b = new Battle(deck(biped), deck(biped), PARTS, 3, { bots: [false, false], survival: true, towers: false });
    b.watt[1] = 10; b.spawn(1, 0, 9, 24); b.units[0].y = 6; b.units[0].py = 6; b.baseHp[0] = 0; b.over = true;
    b.revive();
    expect(b.over).toBe(false); expect(b.baseHp[0]).toBe(500); expect(b.eff.shield[0]).toBeGreaterThan(0); expect(b.units.length).toBe(0); expect(b.continued).toBe(1);
  });
});
