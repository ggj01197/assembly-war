// 조립 런 난이도 점검: 「가진 코인으로 상점을 훑어 사고 추천 조립만 누르는 플레이어」의 라운드별 승률  npx tsx scripts/run-sim.ts [시드수=200]
import { PARTS } from '../src/data/parts';
import { Battle } from '../src/domain/battle/sim';
import { newRun, buy, autoBuild, readyMechs, battlePlan, settle, nextRound, chooseRelic, SHOP_SIZE, BENCH_MAX, RUN_ROUNDS, type RunState } from '../src/domain/run/run';
const N = Number(process.argv[2] ?? 200);
const sim = (rs: RunState) => { const p = battlePlan(rs)!; const b = new Battle(p.mineDeck, p.foeDeck, PARTS, rs.seed + rs.round, { skirmish: { mine: p.mine, foe: p.foe, mods: p.mods, limitSec: p.limitSec } }); let n = 0; while (b.step() && n++ < 3000) { /* */ } return b.result().winner === 0; };
const w = Array(RUN_ROUNDS + 1).fill(0), t = Array(RUN_ROUNDS + 1).fill(0); let cleared = 0;
for (let seed = 1; seed <= N; seed++) {
  const rs = newRun(seed);
  for (let g = 0; g < 24 && ['build', 'won', 'lost'].includes(rs.phase); g++) {
    if (rs.phase !== 'build') { nextRound(rs); continue; }
    for (let i = 0; i < SHOP_SIZE; i++) if (rs.shop[i] && rs.coins >= rs.shop[i]!.cost && rs.bench.length < BENCH_MAX) buy(rs, i);
    autoBuild(rs); if (!readyMechs(rs).length) break;
    const win = sim(rs); t[rs.round]++; if (win) w[rs.round]++; settle(rs, win); if (rs.relicOffer) chooseRelic(rs, rs.relicOffer[0]);
  }
  if (rs.phase === 'cleared') cleared++;
}
for (let r = 1; r <= RUN_ROUNDS; r++) console.log(`라운드 ${r}: 승률 ${Math.round((w[r] / Math.max(1, t[r])) * 100)}% (${t[r]}판)`);
console.log(`런 클리어 ${Math.round((cleared / N) * 100)}%`);
