import { describe, it, expect } from 'vitest';
import { PARTS } from '../../data/parts';
import { Battle, TICK_HZ, BASE_HP } from './sim';
import { MODULES, offerFor, moduleById, OFFER_TIMES, type ModCategory } from '../modules';
import type { Build } from '../assemble';

const biped: Build = { legs: 'legs_biped_light', body: 'body_arm_scout', weapon: 'wpn_arm_gatling' };
const deck = (n = 1) => ({ cards: Array.from({ length: n }, () => ({ build: biped })) });
const run = (b: Battle, sec: number) => { for (let i = 0; i < sec * TICK_HZ && !b.over && !b.offer; i++) b.step(); };

describe('지휘 모듈', () => {
  it('모듈은 공격·방어·운영 각 6종, id 는 중복 없음', () => {
    const cnt: Record<ModCategory, number> = { atk: 0, def: 0, eco: 0 };
    for (const m of MODULES) cnt[m.cat]++;
    expect(cnt).toEqual({ atk: 6, def: 6, eco: 6 });
    expect(new Set(MODULES.map(m => m.id)).size).toBe(MODULES.length);
  });

  it('같은 시드·번째면 같은 3장(공격·방어·운영 하나씩), 이미 고른 것은 빠진다', () => {
    const a = offerFor(77, 0, 1, []), b = offerFor(77, 0, 1, []);
    expect(a).toEqual(b); expect(a.length).toBe(3);
    expect(a.map(id => moduleById(id)!.cat)).toEqual(['atk', 'def', 'eco']);
    expect(offerFor(77, 0, 1, a)).not.toContain(a[0]);
    expect(offerFor(78, 0, 1, [])).not.toEqual(offerFor(77, 0, 1, []));   // 시드가 다르면 (거의 항상) 다르다
  });

  it('modules 옵션이 꺼져 있으면 시간이 멈추지 않는다', () => {
    const b = new Battle(deck(), deck(), PARTS, 5, { bots: [false, false] });
    run(b, 50); expect(b.offer).toBeNull(); expect(b.tick).toBe(50 * TICK_HZ);
  });

  it('45초에 사람 차례 3장이 뜨고 시간이 멈춘다, 고르면 다시 흐른다', () => {
    const b = new Battle(deck(), deck(), PARTS, 5, { bots: [false, true], modules: true });
    run(b, 60);
    expect(b.offer).not.toBeNull(); expect(b.offer!.ids.length).toBe(3);
    const t = b.tick; b.step(); b.step(); expect(b.tick).toBe(t);   // 멈춤
    expect(b.choose(0, 'md_nope')).toBe(false);
    const id = b.offer!.ids[0];
    expect(b.choose(0, id)).toBe(true);
    expect(b.offer).toBeNull(); expect(b.picked[0]).toEqual([id]);
    b.step(); expect(b.tick).toBe(t + 1);
    expect(b.events.some(e => e.type === 'module' && e.team === 0 && e.id === id)).toBe(true);
    expect(b.result().modules[0]).toEqual([id]);
  });

  it('봇은 같은 때에 스스로 고른다 (사람이 아닌 팀)', () => {
    const b = new Battle(deck(), deck(), PARTS, 5, { bots: [true, true], modules: true });
    run(b, OFFER_TIMES[0] + 1);
    expect(b.picked[0].length).toBe(1); expect(b.picked[1].length).toBe(1);
  });

  it('봇끼리는 결정론: 같은 시드면 고른 모듈·결과가 같다', () => {
    const go = () => { const b = new Battle(deck(3), deck(3), PARTS, 42, { bots: [true, true], modules: true }); while (b.step()) { /* */ } return JSON.stringify([b.picked, b.result().winner, b.result().baseHp]); };
    expect(go()).toBe(go());
  });

  it('경량화 설계: 비용 −1(최소 1), 비상 전원: 와트 +4(상한 10)', () => {
    const b = new Battle(deck(), deck(), PARTS, 5, { bots: [false, false], modules: true });
    const base = b.decks[0][0].watt;
    b.offer = { team: 0, index: 0, ids: ['md_discount', 'md_surge'] };
    b.choose(0, 'md_discount'); expect(b.costOf(0, 0)).toBe(Math.max(1, base - 1));
    b.offer = { team: 0, index: 1, ids: ['md_surge'] }; b.watt[0] = 8; b.choose(0, 'md_surge'); expect(b.watt[0]).toBe(10);
  });

  it('강화 장갑: 이미 나온 유닛도 체력이 늘고 새 유닛도 늘어난다', () => {
    const b = new Battle(deck(), deck(), PARTS, 5, { bots: [false, false], modules: true });
    b.watt[0] = 10; b.spawn(0, 0, 1); const before = b.units[0].maxHp;
    b.offer = { team: 0, index: 0, ids: ['md_hp'] }; b.choose(0, 'md_hp');
    expect(b.units[0].maxHp).toBe(Math.round(before * 1.15)); expect(b.units[0].hp).toBe(b.units[0].maxHp);
    b.watt[0] = 10; b.spawn(0, 0, 0); expect(b.units[1].maxHp).toBe(Math.round(before * 1.15));
  });

  it('긴급 정비·방벽 강화: 유닛·기지 회복, 기지가 받는 피해 감소', () => {
    const b = new Battle(deck(), deck(), PARTS, 5, { bots: [false, false], modules: true });
    b.watt[0] = 10; b.spawn(0, 0, 1); b.units[0].hp = 10; b.baseHp[0] = 500;
    b.offer = { team: 0, index: 0, ids: ['md_repair'] }; b.choose(0, 'md_repair');
    expect(b.units[0].hp).toBeGreaterThan(10); expect(b.baseHp[0]).toBe(600);
    b.baseHp[0] = BASE_HP; b.offer = { team: 0, index: 1, ids: ['md_guard'] }; b.choose(0, 'md_guard');
    expect(b.mod[0].baseGuard).toBe(0.2);
  });

  it('강화탄: 같은 조건에서 더 큰 피해를 준다', () => {
    const dmg = (mod: boolean) => {
      const b = new Battle(deck(), deck(), PARTS, 5, { bots: [false, false], modules: true, towers: false });
      if (mod) { b.offer = { team: 0, index: 0, ids: ['md_dmg'] }; b.choose(0, 'md_dmg'); }
      b.watt[0] = 10; b.spawn(0, 0, 1); b.watt[1] = 10; b.spawn(1, 0, 1);
      const [a, e] = [b.units[0], b.units[1]]; a.pos = 49; e.pos = 51; a.prev = 49; e.prev = 51;
      const hp0 = e.hp; b.step(); return hp0 - e.hp;
    };
    expect(dmg(true)).toBeGreaterThan(dmg(false));
  });

  it('5분 버티기: 사람만 45초마다 모듈을 받는다 (적은 받지 않음)', () => {
    const b = new Battle(deck(), deck(), PARTS, 5, { bots: [true, true], modules: true, survival: true });
    b.baseHp[0] = 1e9; run(b, 140); expect(b.picked[0].length).toBe(3); expect(b.picked[1].length).toBe(0);
  });
});
