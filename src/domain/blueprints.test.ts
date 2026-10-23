import { describe, it, expect } from 'vitest';
import { PARTS } from '../data/parts';
import { assemble } from './assemble';
import { BLUEPRINTS, ROLE_ORDER, compatibleParts, suggestFix, advancedUnlocked, sameBuild } from './blueprints';
import { STARTER_DECK } from './save';

describe('쉬운 조립: 추천 완성품 카드', () => {
  it('모든 추천 카드는 실제로 조립이 되고, 이름·id 가 겹치지 않는다', () => {
    for (const b of BLUEPRINTS) expect(assemble(b.build, PARTS).ok, b.id).toBe(true);
    expect(new Set(BLUEPRINTS.map(b => b.id)).size).toBe(BLUEPRINTS.length);
    expect(new Set(BLUEPRINTS.map(b => b.name)).size).toBe(BLUEPRINTS.length);
  });
  it('모든 역할이 최소 2장씩 있고, 공중·대공·지원이 모두 있다', () => {
    for (const r of ROLE_ORDER) expect(BLUEPRINTS.filter(b => b.role === r).length, r).toBeGreaterThanOrEqual(2);
  });
  it('시작 덱 6장은 각각 같은 역할의 추천 카드 근처로 시작한다 (모두 조립 가능)', () => {
    for (const b of STARTER_DECK) expect(assemble(b, PARTS).ok).toBe(true);
    expect(BLUEPRINTS.some(b => sameBuild(b.build, STARTER_DECK[0]))).toBe(true);
  });
});

describe('쉬운 조립: 부품 한 칸 바꾸기', () => {
  it('보여 주는 부품은 전부 조립이 되고, 지금 장착한 부품도 들어 있다', () => {
    for (const bp of BLUEPRINTS) for (const kind of ['legs', 'body', 'weapon'] as const) {
      const list = compatibleParts(bp.build, kind);
      expect(list.length, `${bp.id}/${kind}`).toBeGreaterThan(0);
      expect(list.some(p => p.id === bp.build[kind]), `${bp.id}/${kind} 현재 부품`).toBe(true);
      for (const p of list) expect(assemble({ ...bp.build, [kind]: p.id }, PARTS).ok).toBe(true);
    }
  });
  it('무게가 큰 부품은 가벼운 다리 목록에서 빠진다', () => {
    const bp = BLUEPRINTS.find(b => b.id === 'bp_titan')!;
    const legs = compatibleParts(bp.build, 'legs').map(p => p.id);
    expect(legs).toContain('legs_track_fortress'); expect(legs).not.toContain('legs_biped_light');
  });
});

describe('추천 고치기', () => {
  it('조립이 되는 조합이면 null, 안 되는 조합은 한 번에 맞는 안을 준다', () => {
    expect(suggestFix(BLUEPRINTS[0].build)).toBeNull();
    const over = { legs: 'legs_biped_light', body: 'body_turret_siege', weapon: 'wpn_cannon_siege' };       // 형태·하중 모두 모자람(몸통은 탑형, 무기도 탑형이지만 하중 초과)
    const fix = suggestFix(over); expect(fix).not.toBeNull();
    expect(assemble(fix!.build, PARTS).ok).toBe(true); expect(fix!.text.length).toBeGreaterThan(4);
    const mismatch = { legs: 'legs_track_heavy', body: 'body_arm_scout', weapon: 'wpn_flak_light' };   // 대공 무기 + 팔형 몸통
    const fix2 = suggestFix(mismatch); expect(fix2).not.toBeNull(); expect(assemble(fix2!.build, PARTS).ok).toBe(true);
  });
  it('모든 불가능 조합(샘플 400개)에서도 맞는 안을 찾는다', () => {
    const legs = PARTS.filter(p => p.kind === 'legs'), bodies = PARTS.filter(p => p.kind === 'body'), ws = PARTS.filter(p => p.kind === 'weapon');
    let n = 0, found = 0;
    for (const l of legs) for (const b of bodies) for (const w of ws) {
      const t = { legs: l.id, body: b.id, weapon: w.id };
      if (assemble(t, PARTS).ok || (n++ % 3)) continue;
      const f = suggestFix(t); if (f && assemble(f.build, PARTS).ok) found++; else expect(f, JSON.stringify(t)).not.toBeNull();
    }
    expect(found).toBeGreaterThan(100);
  });
});

describe('고급 조립 해금', () => {
  it('처음엔 잠겨 있고, 작전 1-4 를 이기면 열린다', () => {
    expect(advancedUnlocked({ stages: {} })).toBe(false);
    expect(advancedUnlocked({ stages: { 'c1-3': { clears: 2, bestBaseHp: 900 } } })).toBe(false);
    expect(advancedUnlocked({ stages: { 'c1-4': { clears: 1, bestBaseHp: 900 } } })).toBe(true);
  });
});
