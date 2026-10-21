import { describe, it, expect, beforeEach } from 'vitest';
import { PARTS } from '../data/parts';
import { defaultSave, repairSave } from './save';
import { todayStr, setClockFloor, resetClockFloor, getClockFloor, persistClock, effectiveToday, claimAttend, canAttend, ensureDaily } from './daily';
import { weekKey, opOfDay } from '../data/stages';

const base = () => defaultSave(PARTS.map(p => p.id));
beforeEach(() => resetClockFloor());

describe('시계 왕복 방지', () => {
  it('바닥이 없으면 실제 오늘, 바닥이 더 늦으면 바닥을 따른다 (시계를 뒤로 돌려도 날짜가 내려가지 않는다)', () => {
    const real = todayStr(); expect(real).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    setClockFloor('2999-05-05'); expect(todayStr()).toBe('2999-05-05');
    setClockFloor('2000-01-01'); expect(todayStr()).toBe('2999-05-05');   // 더 이른 값은 무시
    expect(getClockFloor()).toBe('2999-05-05');
  });
  it('인자를 주면 그 날짜 그대로(테스트·표시용)', () => { setClockFloor('2999-05-05'); expect(todayStr(new Date(2026, 9, 21))).toBe('2026-10-21'); });
  it('잘못된 형식은 바닥으로 받지 않는다', () => { setClockFloor('내일'); setClockFloor('2026-1-1'); expect(getClockFloor()).toBe(''); });
  it('세이브에 기록되고 다시 읽으면 이어진다 (앱을 껐다 켜도 유지)', () => {
    const s = base(); setClockFloor('2099-05-05'); expect(persistClock(s)).toBe(true); expect(s.clockMax).toBe('2099-05-05'); expect(persistClock(s)).toBe(false);
    const r = repairSave(JSON.parse(JSON.stringify(s)), PARTS.map(p => p.id)); expect(r.clockMax).toBe('2099-05-05');
    expect(repairSave({ ...s, clockMax: 'x' }, PARTS.map(p => p.id)).clockMax).toBe('');
    expect(repairSave({ ...s, clockMax: '9999-01-01' }, PARTS.map(p => p.id)).clockMax).toBe('');
  });
  it('출석: 날짜를 앞으로 갔다가 되돌려도 같은 날 두 번 받을 수 없다', () => {
    let s = base();
    setClockFloor('2999-05-05'); const first = claimAttend(s, todayStr())!; s = first.save;      // 미래 날짜에 한 번
    expect(canAttend(s, todayStr())).toBe(false);                                                  // 시계를 현재로 되돌려도 바닥(2999)이 유지돼 오늘은 이미 받음
    expect(claimAttend(s, todayStr())).toBeNull();
  });
  it('일일 임무도 되돌린 날짜로 다시 뽑히지 않는다', () => {
    const s = base(); setClockFloor('2999-05-05');
    const a = ensureDaily(s, todayStr()); expect(a.daily.date).toBe('2999-05-05');
    expect(ensureDaily(a, todayStr())).toBe(a);   // 같은 객체: 새로 뽑지 않음
  });
  it('주 키·요일 작전도 바닥을 따른다', () => {
    setClockFloor('2026-12-23');   // 수요일 → 그 주 월요일 2026-12-21
    expect(effectiveToday().getMonth()).toBe(11); expect(weekKey()).toBe('2026-12-21'); expect(opOfDay().op).toBe(effectiveToday().getDay());
  });
});
