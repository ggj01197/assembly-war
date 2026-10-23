import { describe, it, expect } from 'vitest';
import { PARTS } from '../../data/parts';
import { RULES, ruleById, stormMult } from '../../data/rules';
import { STAGES } from '../../data/stages';
import { Battle, TICK_HZ, TOWER_HP } from './sim';
import type { Build } from '../assemble';

const biped: Build = { legs: 'legs_biped_light', body: 'body_arm_scout', weapon: 'wpn_arm_gatling' };
const deck = { cards: [{ build: biped }] };
const mk = (rule: string | null, o = {}) => new Battle(deck, deck, PARTS, 3, { bots: [false, false], rule, ...o });

describe('작전 변형 규칙', () => {
  it('규칙 8종, 스테이지가 가리키는 규칙은 모두 존재한다', () => {
    expect(RULES.length).toBe(8);
    for (const s of STAGES) if (s.rule) expect(ruleById(s.rule), s.id).toBeTruthy();
    expect(STAGES.filter(s => s.rule).length).toBeGreaterThanOrEqual(10);
  });

  it('수치 규칙은 양 팀에 똑같이 깔린다', () => {
    const b = mk('rl_fog');
    expect(b.mod[0].range).toBeCloseTo(-0.2); expect(b.mod[1].range).toBeCloseTo(-0.2);
    expect(mk(null).mod[0].range).toBe(0);
  });

  it('노후 포탑: 포탑 체력 −35%', () => {
    expect(mk('rl_weak').towers[0][0].maxHp).toBe(Math.round(TOWER_HP * 0.65));
    expect(mk(null).towers[0][0].maxHp).toBe(TOWER_HP);
  });

  it('영웅 봉쇄: 출격 불가, 봇도 와트를 모으느라 멈추지 않는다', () => {
    const b = new Battle(deck, deck, PARTS, 3, { bots: [false, false], rule: 'rl_nohero', heroes: ['hero_vanguard', 'hero_vanguard'] });
    b.watt[0] = 10; expect(b.deployHero(0, 9, 10)).toBe(false); expect(b.heroDeploys[0]).toBe(0);
    const c = new Battle(deck, deck, PARTS, 3, { rule: 'rl_nohero', heroes: ['hero_vanguard', 'hero_vanguard'] });
    for (let i = 0; i < 30 * TICK_HZ; i++) c.step();
    expect(c.spawned[0]).toBeGreaterThan(2);
  });

  it('와트 폭풍: 5초마다 충전이 빠르고 느리게 번갈아 평균 1배', () => {
    expect(stormMult(0)).toBeCloseTo(1.6); expect(stormMult(5)).toBeCloseTo(0.4); expect(stormMult(10)).toBeCloseTo(1.6);
    expect((stormMult(0) + stormMult(5)) / 2).toBeCloseTo(1);
    const gain = (sec: number) => { const b = mk('rl_storm'); b.watt[0] = 0; for (let i = 0; i < sec * TICK_HZ; i++) b.step(); return b.watt[0]; };
    expect(gain(5)).toBeGreaterThan(mk(null).watt[0] * 0 + 5 * 0.5 * 1.5);   // 처음 5초는 ×1.6
  });

  it('같은 시드·같은 규칙이면 결과가 같다 (결정론)', () => {
    const go = () => { const b = new Battle(deck, deck, PARTS, 9, { rule: 'rl_heat' }); while (b.step()) { /* */ } return JSON.stringify(b.result()); };
    expect(go()).toBe(go());
  });
});
