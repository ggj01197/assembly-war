import { describe, it, expect } from 'vitest';
import { SUPPLY, rollChest, openChest, openFreeChest, freeChestReady, oddsTable, partsOf, rarityOf, upgradePart, cardLevel } from './supply';
import { defaultSave, repairSave } from './save';
import { settle } from './rewards';
import { PARTS } from '../data/parts';
import { mulberry32 } from './rng';

const ids = PARTS.map(p => p.id);
const fresh = () => defaultSave(ids);

describe('보급 상자 (확률 공개, 유료 상자 없음)', () => {
  it('확률표의 합은 1 이고 공시 표가 같은 숫자를 쓴다', () => {
    const o = SUPPLY.odds; expect(o.ore + o.common + o.rare + o.epic).toBeCloseTo(1, 10);
    expect(oddsTable().reduce((a, r) => a + r.pct, 0)).toBeCloseTo(100, 8);
  });

  it('부품 60종이 희귀도 3단계로 나뉘고 비어 있는 단계가 없다', () => {
    const n = (['common', 'rare', 'epic'] as const).map(r => partsOf(r).length);
    expect(n.every(x => x > 0)).toBe(true); expect(n.reduce((a, b) => a + b, 0)).toBe(PARTS.length);
    expect(rarityOf('legs_biped_light')).toBe('common');
  });

  it('보급권이 있어야 열리고, 열면 권 1장·칸 3개의 보상이 저장에 반영된다', () => {
    expect(openChest(fresh(), mulberry32(1))).toBeNull();
    const s = fresh(); s.tickets = 2;
    const r = openChest(s, mulberry32(7))!;
    expect(r.save.tickets).toBe(1); expect(r.drops).toHaveLength(SUPPLY.rolls); expect(r.save.supply.opened).toBe(1);
    const gotOre = r.drops.filter(d => d.kind === 'ore').reduce((a, d) => a + (d.ore ?? 0), 0);
    const gotCopies = Object.values(r.save.copies).reduce((a, b) => a + b, 0);
    expect(r.save.ore).toBe(s.ore + gotOre);
    expect(gotCopies).toBe(r.drops.filter(d => d.kind === 'part').reduce((a, d) => a + (d.copies ?? 0), 0));
  });

  it('1만 칸을 열면 분포가 공시 확률과 가깝다 (표본 오차 안)', () => {
    const rng = mulberry32(2026); const cnt = { ore: 0, common: 0, rare: 0, epic: 0 }; const N = 10000;
    for (let i = 0; i < N; i++) { const { drops } = rollChest(0, rng); for (const d of drops) { if (d.kind === 'ore') cnt.ore++; else cnt[d.rarity!]++; } }
    const tot = N * SUPPLY.rolls;
    for (const k of Object.keys(cnt) as (keyof typeof cnt)[]) expect(Math.abs(cnt[k] / tot - SUPPLY.odds[k])).toBeLessThan(0.012);
  });

  it('천장: 에픽 부품 없이 9상자를 열면 10번째 상자에는 반드시 에픽이 있다', () => {
    const noEpic = () => 0.5;   // 항상 희귀 — 에픽 없음
    expect(rollChest(SUPPLY.pityEvery - 2, noEpic).gotEpic).toBe(false);
    const hit = rollChest(SUPPLY.pityEvery - 1, noEpic);
    expect(hit.gotEpic).toBe(true); expect(hit.drops.some(d => d.rarity === 'epic')).toBe(true);
    const s = fresh(); s.tickets = 20; let cur = s;
    for (let i = 0; i < 10; i++) { const r = openChest(cur, noEpic)!; cur = r.save; }
    expect(cur.supply.pity).toBe(0);   // 10번째에서 에픽이 나와 초기화
  });

  it('5시간 무료 상자: 처음엔 바로, 연 뒤 5시간은 닫힌다', () => {
    const s = fresh(); const t0 = 1_000_000;
    expect(freeChestReady(s, t0)).toBe(true);
    const r = openFreeChest(s, t0, mulberry32(3))!;
    expect(r.save.supply.freeAt).toBe(t0 + SUPPLY.freeHours * 3600_000);
    expect(openFreeChest(r.save, t0 + 3600_000)).toBeNull();
    expect(openFreeChest(r.save, t0 + SUPPLY.freeHours * 3600_000)).not.toBeNull();
    expect(r.save.tickets).toBe(s.tickets);   // 보급권은 쓰지 않는다
  });
});

describe('강화 · 보급권 보상', () => {
  it('조각과 광석이 모자라면 못 올리고, 충분하면 둘 다 쓰고 한 단계 오른다', () => {
    const s = fresh(); const id = 'legs_biped_light';
    expect(upgradePart(s, id).ok).toBe(false);
    s.copies[id] = 2; s.ore = 1000;
    const r = upgradePart(s, id); expect(r.ok).toBe(true);
    if (r.ok) { expect(r.save.partLevels[id]).toBe(2); expect(r.save.copies[id]).toBe(0); expect(r.save.ore).toBe(1000 - 40); }
    s.copies[id] = 99; s.partLevels[id] = 10; expect(upgradePart(s, id).ok).toBe(false);
  });

  it('카드 레벨은 다리·몸통·무기 레벨의 평균', () => {
    const lv = { legs_biped_light: 4, body_arm_scout: 2, wpn_arm_gatling: 3 };
    expect(cardLevel({ legs: 'legs_biped_light', body: 'body_arm_scout', weapon: 'wpn_arm_gatling' }, lv)).toBe(3);
    expect(cardLevel({ legs: 'legs_biped_light', body: 'body_arm_scout', weapon: 'wpn_arm_gatling' }, {})).toBe(1);
  });

  it('보급권: 처음 이기면 1(보스 2), 그 뒤 3승마다 1', () => {
    let s = fresh(); const st = { id: 'a', rewardOre: 100, rewardExp: 50 }, boss = { id: 'b', rewardOre: 100, rewardExp: 50, boss: 'boss_mother' };
    const r1 = settle(s, st, true, 500); expect(r1.rewards.tickets).toBe(1); s = r1.save;
    const r2 = settle(s, st, true, 500); expect(r2.rewards.tickets).toBe(0); s = r2.save;
    const r3 = settle(s, boss, true, 500); expect(r3.rewards.tickets).toBe(2 + 1); s = r3.save;   // 보스 첫 승리 2 + 3승째 1
    expect(settle(s, st, false, 0).rewards.tickets).toBe(0);
  });

  it('옛 세이브(보급·조각 칸 없음)와 망가진 값도 고쳐서 읽는다', () => {
    const s = repairSave({ copies: { legs_hover: 5, nope: 3, legs_flyer: -2 }, supply: { opened: -4, pity: 'x', freeAt: NaN }, winCount: 'a' }, ids);
    expect(s.copies).toEqual({ legs_hover: 5 }); expect(s.supply).toEqual({ opened: 0, pity: 0, freeAt: 0 }); expect(s.winCount).toBe(0);
  });
});

import { readFileSync } from 'node:fs';
describe('확률 공시 페이지', () => {
  it('public/odds.html 이 앱 안 확률표와 같은 숫자를 담는다 (다르면 npx tsx scripts/make-odds.ts)', () => {
    const html = readFileSync(new URL('../../public/odds.html', import.meta.url), 'utf-8');
    for (const r of oddsTable()) expect(html).toContain(`${r.pct.toFixed(0)}%`);
    expect(html).toContain(`${SUPPLY.pityEvery - 1}상자`);
  });
});
