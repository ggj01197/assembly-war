import { describe, it, expect } from 'vitest';
import { STAGES, isUnlocked, stageById } from './stages';
import { PARTS } from './parts';
import { assemble } from '../domain/assemble';
import { STARTER_DECK } from '../domain/save';
import { Battle } from '../domain/battle/sim';

describe('1장 훈련 7전투', () => {
  it('7개이고 번호·id 가 이어진다', () => {
    expect(STAGES).toHaveLength(7);
    STAGES.forEach((s, i) => { expect(s.no).toBe(i + 1); expect(stageById(s.id)).toBe(s); });
  });

  it('적 덱은 전부 조립 가능하고 최대 6장이다', () => {
    for (const s of STAGES) {
      expect(s.enemy.length).toBeGreaterThan(0);
      expect(s.enemy.length).toBeLessThanOrEqual(6);
      for (const b of s.enemy) expect(assemble(b, PARTS).ok).toBe(true);
    }
  });

  it('앞 스테이지를 깨야 다음이 열린다', () => {
    expect(isUnlocked(STAGES[0], {})).toBe(true);
    expect(isUnlocked(STAGES[1], {})).toBe(false);
    expect(isUnlocked(STAGES[1], { 'c1-1': { clears: 1 } })).toBe(true);
    expect(isUnlocked(STAGES[6], { 'c1-5': { clears: 1 } })).toBe(false);
  });

  it('난이도가 대체로 오른다: 첫 판은 시작 덱 봇이 거의 다 이기고 마지막은 어렵다', () => {
    const rate = (i: number, n = 20) => {
      let w = 0;
      for (let s = 0; s < n; s++) {
        const st = STAGES[i];
        const b = new Battle({ cards: STARTER_DECK.map(build => ({ build })) }, { cards: st.enemy.map(build => ({ build, level: st.enemyLevel })) }, PARTS, 900 + s, { wattMult: [1, st.enemyWattMult] });
        while (b.step()) { /* run */ }
        if (b.result().winner === 0) w++;
      }
      return w / n;
    };
    expect(rate(0)).toBeGreaterThanOrEqual(0.9);
    expect(rate(6)).toBeLessThan(rate(0));
  }, 60000);
});
