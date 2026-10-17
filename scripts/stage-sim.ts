// 1장 훈련 7전투 난이도: 시작 덱(봇이 조종) 대 적 덱 승률. npx tsx scripts/stage-sim.ts [판수=40]
import { PARTS } from '../src/data/parts';
import { STAGES } from '../src/data/stages';
import { STARTER_DECK } from '../src/domain/save';
import { Battle } from '../src/domain/battle/sim';

const N = Number(process.argv[2] ?? 40);
for (const st of STAGES) {
  let win = 0, draw = 0, secs = 0;
  for (let s = 0; s < N; s++) {
    const b = new Battle({ cards: STARTER_DECK.map(build => ({ build })) }, { cards: st.enemy.map(build => ({ build, level: st.enemyLevel })) }, PARTS, 900 + s, { wattMult: [1, st.enemyWattMult] });
    while (b.step()) { /* run */ }
    const r = b.result();
    if (r.winner === 0) win++; else if (r.winner === -1) draw++;
    secs += r.seconds;
  }
  console.log(`${st.no} ${st.name.padEnd(8)} 승률 ${(win / N * 100).toFixed(0)}% 무 ${draw} 평균 ${(secs / N).toFixed(0)}초`);
}
