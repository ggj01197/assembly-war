import { describe, it, expect } from 'vitest';
import { settle, weakestCard, REPEAT_RATIO, LOSS_ORE } from './rewards';
import { defaultSave } from './save';
import { PARTS } from '../data/parts';

const stage = { id: 'c1-1', rewardOre: 120, rewardExp: 60 };
const base = () => defaultSave(PARTS.map(p => p.id));

describe('전투 정산', () => {
  it('첫 승리는 전액 + 보급권 1, 같은 판을 다시 이기면 40%', () => {
    const a = settle(base(), stage, true, 800);
    expect(a.rewards).toEqual({ ore: 120, exp: 60, tickets: 1, firstClear: true });
    expect(a.save.ore).toBe(base().ore + 120);
    expect(a.save.stages['c1-1']).toEqual({ clears: 1, bestBaseHp: 800 });
    expect(a.save.flags.firstWin).toBe(true);
    const b = settle(a.save, stage, true, 600);
    expect(b.rewards).toEqual({ ore: Math.round(120 * REPEAT_RATIO), exp: Math.round(60 * REPEAT_RATIO), tickets: 0, firstClear: false });
    expect(b.save.stages['c1-1']).toEqual({ clears: 2, bestBaseHp: 800 }); // 최고 기록은 안 내려간다
  });

  it('패배는 소량만 주고 클리어로 치지 않는다', () => {
    const a = settle(base(), stage, false, 0);
    expect(a.rewards.ore).toBe(LOSS_ORE);
    expect(a.rewards.tickets).toBe(0);
    expect(a.save.stages['c1-1'].clears).toBe(0);
    expect(a.save.flags.firstWin).toBe(false);
  });

  it('원본 세이브를 바꾸지 않는다 (순수 함수)', () => {
    const s = base(); const before = JSON.stringify(s);
    settle(s, stage, true, 500);
    expect(JSON.stringify(s)).toBe(before);
  });

  it('남은 기지 체력이 음수·소수여도 안전하다', () => {
    expect(settle(base(), stage, true, -50).save.stages['c1-1'].bestBaseHp).toBe(0);
    expect(settle(base(), stage, true, 333.6).save.stages['c1-1'].bestBaseHp).toBe(334);
  });

  it('가장 약했던 설계도: 생산한 것 중 1기당 피해가 가장 낮은 카드', () => {
    expect(weakestCard([3, 2, 0, 4], [300, 50, 0, 800])).toBe(1);
    expect(weakestCard([0, 0], [0, 0])).toBeNull();
  });
});
