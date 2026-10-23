import { PARTS } from '../src/data/parts';
import { STAGES } from '../src/data/stages';
import { Battle } from '../src/domain/battle/sim';
const REF = [
  { legs: 'legs_biped_assault', body: 'body_arm_assault', weapon: 'wpn_laser_beam' },
  { legs: 'legs_track_heavy', body: 'body_shoulder_guard', weapon: 'wpn_missile_heavy' },
  { legs: 'legs_track_fortress', body: 'body_turret_siege', weapon: 'wpn_cannon_light' },
  { legs: 'legs_track_heavy', body: 'body_shoulder_guard', weapon: 'wpn_flak_burst' },
  { legs: 'legs_biped_assault', body: 'body_arm_heavy', weapon: 'wpn_blade_heavy' },
  { legs: 'legs_hover_heavy', body: 'body_shoulder_platform', weapon: 'wpn_missile_swarm' },
];
const st = STAGES.find(s => s.id === (process.argv[2] ?? 'c2-3'))!;
console.log(st.name, st.enemy.map(e => e.legs + '/' + e.weapon), 'lv', st.enemyLevel, 'mult', st.enemyWattMult);
const b = new Battle({ cards: REF.map(build => ({ build, level: 4 })) }, { cards: st.enemy.map(build => ({ build, level: st.enemyLevel })) }, PARTS, 900, { wattMult: [1, st.enemyWattMult], skills: [['sk_bomb', 'sk_repair'], st.enemySkills ?? []], heroes: ['hero_vanguard', st.enemyHero ?? null], heroLevel: [4, st.enemyLevel], rule: st.rule ?? null, modules: true, hand: true });
let t = 0;
while (b.step()) { t++; if (t % 400 === 0) console.log((t / 20) + 's', 'base', b.baseHp.map(Math.round), 'towers', b.towers.map(r => r.map(x => Math.round(x.hp))), 'units', b.units.filter(u=>u.team===0).length, b.units.filter(u=>u.team===1).length, 'spawned', b.spawned, 'kills', b.kills); }
console.log(b.result());
