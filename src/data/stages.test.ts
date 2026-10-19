import { describe, it, expect } from 'vitest';
import { STAGES, CHAPTERS, SURVIVAL, isUnlocked, stageById, nextStage, stageLabel } from './stages';
import { BOSSES, bossById } from './bosses';
import { PARTS } from './parts';
import { assemble } from '../domain/assemble';
import { skillById, heroById } from '../domain/loadout';
import { STARTER_DECK } from '../domain/save';
import { Battle } from '../domain/battle/sim';

describe('작전 21개 (1·2·3장 각 7) + 5분 버티기', () => {
  it('장마다 7개이고 번호·id 가 이어진다', () => {
    expect(CHAPTERS.map(c => c.stages.length)).toEqual([7, 7, 7]);
    expect(STAGES).toHaveLength(21);
    for (const c of CHAPTERS) c.stages.forEach((s, i) => { expect(s.no).toBe(i + 1); expect(s.id).toBe(`c${c.no}-${i + 1}`); expect(s.chapter).toBe(c.no); expect(stageById(s.id)).toBe(s); });
    expect(stageLabel(STAGES[8])).toBe('2-2');
  });

  it('적 덱은 전부 조립 가능하고 최대 6장(5분 버티기는 8장)이다', () => {
    for (const s of [...STAGES, SURVIVAL]) {
      expect(s.enemy.length).toBeGreaterThan(0);
      expect(s.enemy.length).toBeLessThanOrEqual(s === SURVIVAL ? 8 : 6);
      for (const b of s.enemy) expect(assemble(b, PARTS).ok, `${s.id} ${JSON.stringify(b)}`).toBe(true);
    }
  });

  it('보스 3종이 정확히 2·3장에 있고, 적 스킬·영웅 id 는 모두 실제 항목이다', () => {
    const withBoss = STAGES.filter(s => s.boss);
    expect(withBoss.map(s => s.id)).toEqual(['c2-4', 'c2-7', 'c3-7']);
    expect(BOSSES).toHaveLength(3);
    for (const s of STAGES) {
      if (s.boss) expect(bossById(s.boss), s.id).toBeTruthy();
      for (const k of s.enemySkills ?? []) expect(skillById(k), `${s.id} ${k}`).toBeTruthy();
      if (s.enemyHero) expect(heroById(s.enemyHero), s.id).toBeTruthy();
    }
    for (const b of BOSSES) { expect(b.stats.hp).toBeGreaterThanOrEqual(1800); for (const id of [b.build.legs, b.build.body, b.build.weapon]) expect(PARTS.find(p => p.id === id), `${b.id} ${id}`).toBeTruthy(); }
  });

  it('앞 스테이지를 깨야 다음이 열리고, 2·3장은 앞 장의 마지막을 깨야 열린다', () => {
    expect(isUnlocked(STAGES[0], {})).toBe(true);
    expect(isUnlocked(STAGES[1], {})).toBe(false);
    expect(isUnlocked(STAGES[1], { 'c1-1': { clears: 1 } })).toBe(true);
    expect(isUnlocked(STAGES[6], { 'c1-5': { clears: 1 } })).toBe(false);
    expect(isUnlocked(CHAPTERS[1].stages[0], {})).toBe(false);
    expect(isUnlocked(CHAPTERS[1].stages[0], { 'c1-7': { clears: 1 } })).toBe(true);
    expect(isUnlocked(CHAPTERS[2].stages[0], { 'c2-7': { clears: 1 } })).toBe(true);
    expect(nextStage(STAGES[6])).toBe(STAGES[7]);
    expect(nextStage(STAGES[20])).toBeUndefined();
  });

  it('5분 버티기는 1장을 끝내야 열린다', () => {
    expect(isUnlocked(SURVIVAL, {})).toBe(false);
    expect(isUnlocked(SURVIVAL, { 'c1-7': { clears: 1 } })).toBe(true);
    expect(stageById('survival')).toBe(SURVIVAL);
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
