// 밸런스 시뮬 (기획안 FINAL §10, RISK R-02): 자동 대전으로 승률이 벗어난 부품·계열·조합을 찾는다.
//   npx tsx scripts/balance-sim.ts [무작위 덱 판수=3000] [시드=777]
// 부품이 60종(조립 가능 조합 ~900)이 되어 전수 총당전은 불가능하다 → 무작위 6장 덱 대전에서 "그 부품이 덱에 들어 있을 때의 승률"을
// 부품·계열·조합 단위로 모은다. 부품 단위는 표본이 크고(부품당 수천 슬롯) 밸런스 조정의 기본 단위다.
// 결과: ../00_PROJECT_CONTROL/BALANCE_REPORT.md
import { writeFileSync } from 'node:fs';
import { PARTS, type Part } from '../src/data/parts';
import { allValidBuilds, assemble, type Build } from '../src/domain/assemble';
import { simulate } from '../src/domain/battle/sim';
import { mulberry32 } from '../src/domain/rng';

const MATCHES = Number(process.argv[2] ?? 3000);
const SEED = Number(process.argv[3] ?? 777);
const PART_LO = 0.42, PART_HI = 0.58;   // 부품 평균 허용 범위
// 틈새 계열(대공 전용·수리)은 무작위 덱에서 구조적으로 낮다 — 사람은 짝을 맞춰 쓰므로 하한만 40% 로 완화
const NICHE_LO = 0.40;
const BUILD_LO = 0.30, BUILD_HI = 0.70; // 조합 하나는 표본이 작아 넓게

const rng = mulberry32(SEED);
const accessories = PARTS.filter(p => p.kind === 'accessory').map(p => p.id);
// 유효 조합마다 액세서리를 무작위로(없음 포함) 하나 붙인다 — 액세서리도 부품 단위로 통계가 쌓이게
const builds: Build[] = [];
for (const b of allValidBuilds(PARTS)) {
  const pick = Math.floor(rng() * (accessories.length + 1));
  const cand: Build = pick === accessories.length ? b : { ...b, accessory: accessories[pick] };
  builds.push(assemble(cand, PARTS).ok ? cand : b);
}
const name = (b: Build) => [b.legs, b.body, b.weapon, b.accessory ?? '-'].map(s => s.replace(/^(legs|body|wpn|acc)_/, '')).join('/');
const pickDeck = (): Build[] => Array.from({ length: 6 }, () => builds[Math.floor(rng() * builds.length)]);

const bw = new Map<string, number>(), bg = new Map<string, number>();
const pw = new Map<string, number>(), pg = new Map<string, number>();
const add = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v);
const t0 = Date.now();
for (let m = 0; m < MATCHES; m++) {
  const da = pickDeck(), db = pickDeck();
  const r = simulate({ cards: da.map(build => ({ build })) }, { cards: db.map(build => ({ build })) }, PARTS, 5000 + m);
  const sa = r.winner === 0 ? 1 : r.winner === -1 ? 0.5 : 0;
  for (const [deck, s] of [[da, sa], [db, 1 - sa]] as [Build[], number][]) {
    for (const b of new Set(deck.map(name))) { add(bw, b, s); add(bg, b, 1); }
    const parts = new Set<string>();
    for (const b of deck) for (const id of [b.legs, b.body, b.weapon, b.accessory]) if (id) parts.add(id);
    for (const id of parts) { add(pw, id, s); add(pg, id, 1); }
  }
  if (m % 500 === 499) console.error(`  ${m + 1}/${MATCHES} (${Math.round((Date.now() - t0) / 1000)}s)`);
}

const pct = (x: number) => (x * 100).toFixed(1) + '%';
const kindOf = (id: string) => PARTS.find(p => p.id === id)!;
const partRows = PARTS.map(p => ({ p, wr: (pw.get(p.id) ?? 0) / Math.max(1, pg.get(p.id) ?? 0), n: pg.get(p.id) ?? 0 }));
const flag = (wr: number, lo: number, hi: number) => (wr < lo ? '⚠ 약함' : wr > hi ? '⚠ 강함' : 'OK');
const isNiche = (p: Part) => p.kind === 'weapon' && (p.family === 'flak' || p.family === 'repair');
const lowOf = (p: Part) => (isNiche(p) ? NICHE_LO : PART_LO);

// 계열(무기 family) 평균: 그 계열 무기가 덱에 있을 때
const fam = new Map<string, { s: number; n: number }>();
for (const r of partRows) if (r.p.kind === 'weapon') { const f = (r.p as Extract<Part, { kind: 'weapon' }>).family; const e = fam.get(f) ?? { s: 0, n: 0 }; e.s += r.wr * r.n; e.n += r.n; fam.set(f, e); }

const lines: string[] = [];
lines.push('# 조립전쟁 — BALANCE REPORT (자동 생성)', '');
lines.push(`생성: balance-sim · 부품 ${PARTS.length}종 · 유효 조합 ${builds.length} · 무작위 6장 덱 ${MATCHES}판(시드 ${SEED}) · 부품 허용 ${PART_LO * 100}~${PART_HI * 100}% (대공·수리 ${NICHE_LO * 100}~) · 조합 허용 ${BUILD_LO * 100}~${BUILD_HI * 100}% · ${Math.round((Date.now() - t0) / 1000)}초`, '');
lines.push('## 1. 무기 계열 평균 승률', '', '| 계열 | 승률 | 슬롯 | 판정 |', '|---|---|---|---|');
for (const [f, e] of [...fam].sort((a, b) => b[1].s / b[1].n - a[1].s / a[1].n)) lines.push(`| ${f} | ${pct(e.s / e.n)} | ${e.n} | ${flag(e.s / e.n, PART_LO, PART_HI)} |`);
for (const kind of ['weapon', 'legs', 'body', 'accessory'] as const) {
  lines.push('', `## 부품 — ${{ weapon: '무기', legs: '다리', body: '몸통', accessory: '액세서리' }[kind]}`, '', '| 부품 | 승률 | 덱 수 | 판정 |', '|---|---|---|---|');
  for (const r of partRows.filter(r => r.p.kind === kind).sort((a, b) => b.wr - a.wr)) lines.push(`| ${r.p.id} (${r.p.name}) | ${pct(r.wr)} | ${r.n} | ${flag(r.wr, lowOf(r.p), PART_HI)} |`);
}
const buildRows = builds.map(b => ({ b, wr: (bw.get(name(b)) ?? 0) / Math.max(1, bg.get(name(b)) ?? 0), n: bg.get(name(b)) ?? 0 })).filter(r => r.n >= 10);
lines.push('', '## 조합 상·하위 12 (표본 10덱 이상)', '', '| 조합 | 승률 | 덱 수 |', '|---|---|---|');
for (const r of [...buildRows].sort((a, b) => b.wr - a.wr).slice(0, 12)) lines.push(`| ${name(r.b)} | ${pct(r.wr)} | ${r.n} |`);
lines.push('| … | … | … |');
for (const r of [...buildRows].sort((a, b) => a.wr - b.wr).slice(0, 12)) lines.push(`| ${name(r.b)} | ${pct(r.wr)} | ${r.n} |`);
const badParts = partRows.filter(r => r.wr < lowOf(r.p) || r.wr > PART_HI);
const badBuilds = buildRows.filter(r => r.wr < BUILD_LO || r.wr > BUILD_HI);
lines.push('', '## 요약', '', `- 부품 승률이 ${PART_LO * 100}~${PART_HI * 100}% 밖: **${badParts.length}/${partRows.length}** ${badParts.map(r => r.p.id).join(', ')}`, `- 조합 승률이 ${BUILD_LO * 100}~${BUILD_HI * 100}% 밖(표본 충분한 것만): **${badBuilds.length}/${buildRows.length}**`, `- 부품 최고 ${pct(Math.max(...partRows.map(r => r.wr)))} · 최저 ${pct(Math.min(...partRows.map(r => r.wr)))}`);
writeFileSync(new URL('../../00_PROJECT_CONTROL/BALANCE_REPORT.md', import.meta.url), lines.join('\n') + '\n', 'utf8');
void kindOf;
console.log(lines.slice(-5).join('\n'));
