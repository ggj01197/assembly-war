// 임시 튜닝: 단계별 목표 승률에 맞는 enemyWattMult 탐색
import { PARTS } from '../src/data/parts';
import { STAGES, OPS, type Stage } from '../src/data/stages';
import { STARTER_DECK } from '../src/domain/save';
import { Battle } from '../src/domain/battle/sim';
const REF = [
  { legs: 'legs_biped_assault', body: 'body_arm_assault', weapon: 'wpn_laser_beam' },
  { legs: 'legs_track_heavy', body: 'body_shoulder_guard', weapon: 'wpn_missile_heavy' },
  { legs: 'legs_track_fortress', body: 'body_turret_siege', weapon: 'wpn_cannon_light' },
  { legs: 'legs_track_heavy', body: 'body_shoulder_guard', weapon: 'wpn_flak_burst' },
  { legs: 'legs_biped_assault', body: 'body_arm_heavy', weapon: 'wpn_blade_heavy' },
  { legs: 'legs_hover_heavy', body: 'body_shoulder_platform', weapon: 'wpn_missile_swarm' },
];
const N = 20;
const player = (st: Stage) => st.chapter === 1 ? { cards: STARTER_DECK.map(build => ({ build })), skills: [] as string[], hero: null as string | null, lv: 1 }
  : st.chapter === 2 ? { cards: REF.map(build => ({ build, level: 4 })), skills: ['sk_bomb', 'sk_repair'], hero: 'hero_vanguard', lv: 4 }
  : { cards: REF.map(build => ({ build, level: 7 })), skills: ['sk_bomb', 'sk_repair'], hero: 'hero_vanguard', lv: 6 };
function rate(st: Stage, mult: number): number {
  let win = 0;
  for (let k = 0; k < N; k++) {
    const p = player(st);
    const b = new Battle({ cards: p.cards }, { cards: st.enemy.map(build => ({ build, level: st.enemyLevel })) }, PARTS, 900 + k, {
      wattMult: [1, mult], skills: [p.skills, st.enemySkills ?? []], heroes: [p.hero, st.enemyHero ?? null], heroLevel: [p.lv, st.enemyLevel], boss: st.boss ?? null, modules: true, hand: true, rule: st.rule ?? null });
    while (b.step()) { /* */ }
    if (b.result().winner === 0) win++;
  }
  return win / N;
}
const TARGET: Record<string, number> = { 'c2-1': .85, 'c2-2': .78, 'c2-3': .7, 'c2-4': .55, 'c2-5': .55, 'c2-6': .5, 'c2-7': .4, 'c3-1': .7, 'c3-2': .65, 'c3-3': .6, 'c3-4': .55, 'c3-5': .45, 'c3-6': .4, 'c3-7': .3 };
const only = process.argv[2]?.split(',');
for (const st of STAGES) {
  const tg = TARGET[st.id]; if (tg === undefined || (only && !only.includes(st.id))) continue;
  let lo = 0.3, hi = st.enemyWattMult * 1.3, best = st.enemyWattMult, bestD = 9;
  for (let i = 0; i < 6; i++) { const m = (lo + hi) / 2, r = rate(st, m); if (Math.abs(r - tg) < bestD) { bestD = Math.abs(r - tg); best = m; } if (r > tg) lo = m; else hi = m; }
  console.log(st.id, st.name.padEnd(8), 'now', st.enemyWattMult, '→', best.toFixed(2), 'rate', Math.round(rate(st, best) * 100) + '%', 'target', tg * 100);
}
void OPS;
