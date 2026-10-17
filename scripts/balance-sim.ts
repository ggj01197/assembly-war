// 밸런스 시뮬 (기획안 FINAL §10, RISK R-02): 자동 대전으로 승률이 35~65% 를 벗어나는 조합·부품을 찾는다.
//   npx tsx scripts/balance-sim.ts [단일덱 시드수=12] [랜덤덱 판수=600]
// 결과: ../00_PROJECT_CONTROL/BALANCE_REPORT.md
import { writeFileSync } from 'node:fs';
import { PARTS } from '../src/data/parts';
import { allValidBuilds, assemble, type Build } from '../src/domain/assemble';
import { simulate, type Deck } from '../src/domain/battle/sim';
import { mulberry32 } from '../src/domain/rng';

const SEEDS = Number(process.argv[2] ?? 12);
const RANDOM_MATCHES = Number(process.argv[3] ?? 600);
const LO = 0.35, HI = 0.65;

const accessories = [undefined, ...PARTS.filter(p => p.kind === 'accessory').map(p => p.id)];
const builds: Build[] = [];
for (const b of allValidBuilds(PARTS)) for (const a of accessories) {
  const cand = { ...b, accessory: a };
  if (assemble(cand, PARTS).ok) builds.push(cand);
}
const name = (b: Build) => [b.legs, b.body, b.weapon, b.accessory ?? '-'].map(s => s.replace(/^(legs|body|wpn|acc)_/, '')).join('/');
const one = (b: Build): Deck => ({ cards: [{ build: b }] });

// 1) 단일 조합 총당전
const wins = builds.map(() => 0), games = builds.map(() => 0);
for (let i = 0; i < builds.length; i++) for (let j = i + 1; j < builds.length; j++) {
  for (let s = 0; s < SEEDS; s++) {
    const r = simulate(one(builds[i]), one(builds[j]), PARTS, 1000 + s);
    games[i]++; games[j]++;
    if (r.winner === 0) wins[i]++; else if (r.winner === 1) wins[j]++; else { wins[i] += 0.5; wins[j] += 0.5; }
  }
}
const single = builds.map((b, i) => ({ b, wr: games[i] ? wins[i] / games[i] : 0.5 }));

// 2) 무작위 6장 덱 대전 — 카드가 덱에 들어 있을 때의 승률(메타에서의 실제 가치)
const rng = mulberry32(777);
const pickDeck = (): Build[] => Array.from({ length: Math.min(6, builds.length) }, () => builds[Math.floor(rng() * builds.length)]);
const key = (b: Build) => name(b);
const inW: Record<string, number> = {}, inG: Record<string, number> = {};
for (let m = 0; m < RANDOM_MATCHES; m++) {
  const da = pickDeck(), db = pickDeck();
  const r = simulate({ cards: da.map(build => ({ build })) }, { cards: db.map(build => ({ build })) }, PARTS, 5000 + m);
  const sa = r.winner === 0 ? 1 : r.winner === -1 ? 0.5 : 0;
  for (const b of new Set(da.map(key))) { inG[b] = (inG[b] ?? 0) + 1; inW[b] = (inW[b] ?? 0) + sa; }
  for (const b of new Set(db.map(key))) { inG[b] = (inG[b] ?? 0) + 1; inW[b] = (inW[b] ?? 0) + (1 - sa); }
}
const deckWr = builds.map(b => ({ b, wr: (inW[key(b)] ?? 0) / Math.max(1, inG[key(b)] ?? 0), n: inG[key(b)] ?? 0 }));

// 3) 부품별 평균 (덱 승률)
const partAvg = new Map<string, { sum: number; n: number }>();
for (const d of deckWr) for (const id of [d.b.legs, d.b.body, d.b.weapon, d.b.accessory].filter(Boolean) as string[]) {
  const e = partAvg.get(id) ?? { sum: 0, n: 0 }; e.sum += d.wr; e.n++; partAvg.set(id, e);
}

const pct = (x: number) => (x * 100).toFixed(1) + '%';
const flag = (x: number) => (x < LO ? ' ⚠ 약함' : x > HI ? ' ⚠ 강함' : '');
const lines: string[] = [];
lines.push('# 조립전쟁 — BALANCE REPORT (자동 생성)', '');
lines.push(`생성: balance-sim · 부품 ${PARTS.length}종 · 유효 조합 ${builds.length} · 단일 총당전 시드 ${SEEDS} · 무작위 덱 ${RANDOM_MATCHES}판 · 허용 승률 ${LO * 100}~${HI * 100}%`, '');
lines.push('## 1. 무작위 6장 덱에 들어 있을 때 조합 승률 (메타 가치)', '', '| 조합 | 승률 | 표본 | 판정 |', '|---|---|---|---|');
for (const d of [...deckWr].sort((a, b) => b.wr - a.wr)) lines.push(`| ${name(d.b)} | ${pct(d.wr)} | ${d.n} | ${flag(d.wr).trim() || 'OK'} |`);
lines.push('', '## 2. 단일 조합 총당전 승률 (상성 포함, 참고)', '', '| 조합 | 승률 | 판정 |', '|---|---|---|');
for (const s of [...single].sort((a, b) => b.wr - a.wr)) lines.push(`| ${name(s.b)} | ${pct(s.wr)} | ${flag(s.wr).trim() || 'OK'} |`);
lines.push('', '## 3. 부품별 평균 덱 승률', '', '| 부품 | 평균 | 판정 |', '|---|---|---|');
for (const [id, e] of [...partAvg].sort((a, b) => b[1].sum / b[1].n - a[1].sum / a[1].n)) {
  const wr = e.sum / e.n; lines.push(`| ${id} | ${pct(wr)} | ${flag(wr).trim() || 'OK'} |`);
}
const bad = deckWr.filter(d => d.wr < LO || d.wr > HI);
lines.push('', `## 요약`, '', `- 덱 승률이 ${LO * 100}~${HI * 100}% 밖인 조합: **${bad.length}/${deckWr.length}**`, `- 최고 ${pct(Math.max(...deckWr.map(d => d.wr)))} · 최저 ${pct(Math.min(...deckWr.map(d => d.wr)))}`);
const out = new URL('../../00_PROJECT_CONTROL/BALANCE_REPORT.md', import.meta.url);
writeFileSync(out, lines.join('\n') + '\n', 'utf8');
console.log(lines.slice(-4).join('\n'));
console.log('builds', builds.length, '→ BALANCE_REPORT.md');
