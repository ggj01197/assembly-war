// 작전 난이도: "표준 플레이어"(봇이 조종) 대 적 덱 승률. npx tsx scripts/stage-sim.ts [판수=30] [장=all|1|2|3|sv]
//  1장: 시작 덱·레벨 1 / 2장: 기준 덱·강화 4 + 스킬·영웅(봇) / 3장: 기준 덱·강화 7 + 스킬·영웅(봇) / 5분 버티기: 기준 덱·강화 6
//  목표 곡선: 1장 100→35%, 2장 85→40%, 3장 70→30% (사람은 이보다 잘하므로 봇 승률이 바닥이어도 풀 수 있다)
import { PARTS } from '../src/data/parts';
import { STAGES, SURVIVAL, type Stage } from '../src/data/stages';
import { STARTER_DECK } from '../src/domain/save';
import type { Build } from '../src/domain/assemble';
import { Battle, SURVIVAL_SECONDS } from '../src/domain/battle/sim';

const REF: Build[] = [
  { legs: 'legs_biped_assault', body: 'body_arm_assault', weapon: 'wpn_laser_beam' },
  { legs: 'legs_track_heavy', body: 'body_shoulder_guard', weapon: 'wpn_missile_heavy' },
  { legs: 'legs_track_fortress', body: 'body_turret_siege', weapon: 'wpn_cannon_light' },
  { legs: 'legs_track_heavy', body: 'body_shoulder_guard', weapon: 'wpn_flak_burst' },
  { legs: 'legs_biped_assault', body: 'body_arm_heavy', weapon: 'wpn_blade_heavy' },
  { legs: 'legs_hover_heavy', body: 'body_shoulder_platform', weapon: 'wpn_missile_swarm' },
];
const N = Number(process.argv[2] ?? 30), only = process.argv[3] ?? 'all';

function player(st: Stage) {
  if (st.survival) return { cards: REF.map(build => ({ build, level: 6 })), skills: ['sk_bomb', 'sk_repair'], hero: 'hero_vanguard', lv: 8 };
  if (st.chapter === 1) return { cards: STARTER_DECK.map(build => ({ build })), skills: [], hero: null as string | null, lv: 1 };
  if (st.chapter === 2) return { cards: REF.map(build => ({ build, level: 4 })), skills: ['sk_bomb', 'sk_repair'], hero: 'hero_vanguard', lv: 4 };
  return { cards: REF.map(build => ({ build, level: 7 })), skills: ['sk_bomb', 'sk_repair'], hero: 'hero_vanguard', lv: 6 };
}

const list = [...STAGES, SURVIVAL].filter(s => only === 'all' || (only === 'sv' ? s.survival : String(s.chapter) === only && !s.survival));
for (const st of list) {
  let win = 0, secs = 0, bossHp = 0;
  for (let k = 0; k < N; k++) {
    const p = player(st);
    const b = new Battle({ cards: p.cards }, { cards: st.enemy.map(build => ({ build, level: st.enemyLevel })) }, PARTS, 900 + k, {
      wattMult: [1, st.enemyWattMult], skills: [p.skills, st.enemySkills ?? []], heroes: [p.hero, st.enemyHero ?? null], heroLevel: [p.lv, st.enemyLevel],
      boss: st.boss ?? null, survival: !!st.survival, modules: process.env.NOMOD ? false : true, rule: process.env.NORULE ? null : st.rule ?? null,
    });
    while (b.step()) { /* run */ }
    const r = b.result();
    if (r.winner === 0) win++;
    secs += r.seconds;
    void bossHp;
  }
  const tag = st.survival ? '5분   ' : `${st.chapter}-${st.no}`.padEnd(6);
  console.log(`${tag} ${st.name.padEnd(9)} 승률 ${String(Math.round(win / N * 100)).padStart(3)}% 평균 ${(secs / N).toFixed(0)}초${st.survival ? ` (목표 ${SURVIVAL_SECONDS}초)` : ''}${st.boss ? ' [보스]' : ''}`);
}
