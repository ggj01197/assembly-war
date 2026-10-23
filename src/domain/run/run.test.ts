import { describe, it, expect } from 'vitest';
import { PARTS } from '../../data/parts';
import { assemble } from '../assemble';
import { Battle } from '../battle/sim';
import { newRun, buy, reroll, sell, equip, unequip, mergeBench, autoBuild, readyMechs, mechStatus, mechMult, battlePlan, enemyFor, settle, nextRound, RUN_ROUNDS, RUN_HEARTS, START_COINS, SHOP_SIZE, BENCH_MAX, kindOf, type RunState } from './run';

const sim = (rs: RunState) => {
  const plan = battlePlan(rs)!;
  const b = new Battle(plan.mineDeck, plan.foeDeck, PARTS, rs.seed + rs.round, { skirmish: { mine: plan.mine, foe: plan.foe } });
  let n = 0; while (b.step() && n++ < 3000) { /* 끝까지 */ }
  return b.result().winner === 0;
};

describe('조립 런: 시작·상점', () => {
  it('새 런은 메카 두 대·코인 10·하트 3·진열 5개로 시작하고, 두 메카는 조립 가능하다', () => {
    const rs = newRun(1);
    expect(rs.coins).toBe(START_COINS); expect(rs.hearts).toBe(RUN_HEARTS); expect(rs.shop.filter(Boolean)).toHaveLength(SHOP_SIZE); expect(rs.round).toBe(1);
    expect(readyMechs(rs)).toHaveLength(2);
  });
  it('같은 시드면 같은 진열, 리롤하면 달라지고 코인 1 을 쓴다', () => {
    expect(JSON.stringify(newRun(7).shop)).toBe(JSON.stringify(newRun(7).shop));
    const rs = newRun(7), before = JSON.stringify(rs.shop); expect(reroll(rs).ok).toBe(true);
    expect(rs.coins).toBe(START_COINS - 1); expect(JSON.stringify(rs.shop)).not.toBe(before);
  });
  it('사기: 코인이 모자라면 실패, 사면 벤치로 가고 진열 칸이 빈다', () => {
    const rs = newRun(3); const cost = rs.shop[0]!.cost;
    expect(buy(rs, 0).ok).toBe(true); expect(rs.coins).toBe(START_COINS - cost); expect(rs.bench).toHaveLength(1); expect(rs.shop[0]).toBeNull();
    expect(buy(rs, 0).ok).toBe(false);
    rs.coins = 0; expect(buy(rs, 1).ok).toBe(false);
  });
  it('벤치가 가득 차면 못 사고, 팔면 코인이 돌아온다', () => {
    const rs = newRun(3); rs.coins = 99;
    for (let i = 0; i < BENCH_MAX; i++) rs.bench.push({ uid: 900 + i, id: 'wpn_blade_short', star: 1 });
    expect(buy(rs, 0).ok).toBe(false);
    const c = rs.coins; expect(sell(rs, 900)).toBe(true); expect(rs.coins).toBeGreaterThan(c);
  });
});

describe('조립 런: 합성·장착', () => {
  it('같은 부품 3개는 ★2 하나로 합쳐지고, ★2 세 개는 ★3 이 된다', () => {
    const rs = newRun(1); for (let i = 0; i < 3; i++) rs.bench.push({ uid: 100 + i, id: 'wpn_blade_short', star: 1 });
    expect(mergeBench(rs)).toHaveLength(1); expect(rs.bench).toHaveLength(1); expect(rs.bench[0].star).toBe(2);
    for (let i = 0; i < 2; i++) rs.bench.push({ uid: 200 + i, id: 'wpn_blade_short', star: 2 });
    mergeBench(rs); expect(rs.bench).toHaveLength(1); expect(rs.bench[0].star).toBe(3);
  });
  it('장착하면 벤치에서 빠지고 원래 부품은 벤치로 돌아온다, 장착 해제도 된다', () => {
    const rs = newRun(1); rs.bench.push({ uid: 500, id: 'legs_wheel_scout', star: 1 });
    const old = rs.mechs[0].legs!.id;
    expect(equip(rs, 500, 0)).toBe(true); expect(rs.mechs[0].legs!.id).toBe('legs_wheel_scout'); expect(rs.bench.map(p => p.id)).toContain(old);
    expect(unequip(rs, 0, 'legs')).toBe(true); expect(rs.mechs[0].legs).toBeNull(); expect(mechStatus(rs.mechs[0]).ready).toBe(false);
  });
  it('조립이 안 되는 메카는 이유가 나오고 전투에 나가지 않는다', () => {
    const rs = newRun(1); rs.bench.push({ uid: 501, id: 'wpn_flak_light', star: 1 });
    equip(rs, 501, 0);   // 팔형 몸통에 어깨형 무기
    const st = mechStatus(rs.mechs[0]); expect(st.ready).toBe(false); expect(st.reasons.length).toBeGreaterThan(0);
    expect(readyMechs(rs).some(m => m.idx === 0)).toBe(false);
  });
  it('★ 부품이 들어 있으면 메카 배율이 오른다', () => {
    const rs = newRun(1); expect(mechMult(rs.mechs[0])).toBe(1); rs.mechs[0].weapon!.star = 2; rs.mechs[0].body!.star = 3;
    expect(mechMult(rs.mechs[0])).toBeCloseTo(1 + 0.25 * 3, 5);
  });
});

describe('조립 런: 추천 조립', () => {
  it('가진 부품으로 조립 가능한 메카를 만들고, 부품을 중복으로 쓰지 않는다', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const rs = newRun(seed); rs.coins = 60;
      for (let i = 0; i < 5; i++) buy(rs, i);
      autoBuild(rs);
      const ready = readyMechs(rs); expect(ready.length).toBeGreaterThanOrEqual(2);
      const ids = new Set<number>(); for (const m of rs.mechs) for (const k of ['legs', 'body', 'weapon', 'accessory'] as const) if (m[k]) { expect(ids.has(m[k]!.uid)).toBe(false); ids.add(m[k]!.uid); }
      for (const p of rs.bench) expect(ids.has(p.uid)).toBe(false);
      for (const m of ready) expect(assemble(m.build, PARTS).ok).toBe(true);
    }
  });
  it('부품 종류가 맞게 들어간다 (다리 칸에는 다리만)', () => {
    const rs = newRun(2); autoBuild(rs);
    for (const m of rs.mechs) { if (m.legs) expect(kindOf(m.legs.id)).toBe('legs'); if (m.body) expect(kindOf(m.body.id)).toBe('body'); if (m.weapon) expect(kindOf(m.weapon.id)).toBe('weapon'); }
  });
});

describe('조립 런: 전투·정산', () => {
  it('적은 라운드가 갈수록 늘거나 세지고 전부 조립 가능하다', () => {
    let prevN = 0, prevM = 0; for (let r = 1; r <= RUN_ROUNDS; r++) { const e = enemyFor(r, 5); expect(e.builds.length).toBeGreaterThanOrEqual(prevN); expect(e.mult).toBeGreaterThan(prevM); prevN = e.builds.length; prevM = e.mult; for (const b of e.builds) expect(assemble(b, PARTS).ok).toBe(true); }
  });
  it('전투 계획의 자리는 아레나 안이고, 전투가 끝까지 돈다', () => {
    const rs = newRun(1), plan = battlePlan(rs)!;
    for (const u of [...plan.mine, ...plan.foe]) { expect(u.x).toBeGreaterThanOrEqual(3); expect(u.x).toBeLessThanOrEqual(15); expect(u.y).toBeGreaterThan(2); expect(u.y).toBeLessThan(13); }
    expect(plan.mine.every(u => u.y < 7) && plan.foe.every(u => u.y > 8)).toBe(true);
    expect(typeof sim(rs)).toBe('boolean');
  });
  it('이기면 코인을 받고 다음 라운드, 마지막 라운드를 이기면 클리어', () => {
    const rs = newRun(1); const c = rs.coins; settle(rs, true); expect(rs.phase).toBe('won'); expect(rs.coins).toBeGreaterThan(c);
    expect(nextRound(rs)).toBe(true); expect(rs.round).toBe(2); expect(rs.phase).toBe('build'); expect(rs.shop.filter(Boolean)).toHaveLength(SHOP_SIZE);
    rs.round = RUN_ROUNDS; settle(rs, true); expect(rs.phase).toBe('cleared');
  });
  it('지면 하트가 줄고, 하트가 0 이거나 마지막 라운드면 런이 끝난다', () => {
    const rs = newRun(1); settle(rs, false); expect(rs.hearts).toBe(RUN_HEARTS - 1); expect(rs.phase).toBe('lost'); expect(nextRound(rs)).toBe(true);
    rs.hearts = 1; settle(rs, false); expect(rs.phase).toBe('over'); expect(nextRound(rs)).toBe(false);
    const r2 = newRun(2); r2.round = RUN_ROUNDS; settle(r2, false); expect(r2.phase).toBe('over');
  });
  it('추천 조립만 누르며 끝까지 돌려도 막히지 않고 런이 끝난다 (시드 20개)', () => {
    let wins = 0, total = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const rs = newRun(seed);
      for (let guard = 0; guard < 10 && (rs.phase === 'build' || rs.phase === 'won' || rs.phase === 'lost'); guard++) {
        if (rs.phase !== 'build') { nextRound(rs); continue; }
        for (let i = 0; i < SHOP_SIZE; i++) if (rs.shop[i] && rs.coins >= rs.shop[i]!.cost && rs.bench.length < BENCH_MAX) buy(rs, i);
        autoBuild(rs);
        if (!readyMechs(rs).length) break;
        const w = sim(rs); total++; if (w) wins++; settle(rs, w);
      }
      expect(['cleared', 'over']).toContain(rs.phase);
    }
    expect(total).toBeGreaterThan(20);
    expect(wins / total).toBeGreaterThan(0.25); expect(wins / total).toBeLessThan(0.98);   // 너무 쉽지도 불가능하지도 않다(대략)
  }, 60000);
});
