// 상자 확률 공개 페이지(한국 확률형 아이템 공시): src/domain/supply.ts 의 숫자에서 public/odds.html 을 만든다. npx tsx scripts/make-odds.ts
import { writeFileSync } from 'node:fs';
import { oddsTable, SUPPLY, partsOf, RARITY_LABEL, type Rarity } from '../src/domain/supply';

const rows = oddsTable().map(r => `<tr><td>${r.label}</td><td class="n">${r.pct.toFixed(0)}%</td><td>${r.note}</td></tr>`).join('\n');
const parts = (['epic', 'rare', 'common'] as Rarity[]).map(r => `<h3>${RARITY_LABEL[r]} 부품 (${partsOf(r).length}종)</h3><p>${partsOf(r).map(p => p.name).join(' · ')}</p>`).join('\n');
const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>조립전쟁 — 보급 상자 확률 공개</title>
<style>body{margin:0;background:#0b1420;color:#e8f0ff;font:15px/1.6 system-ui,'Noto Sans KR',sans-serif;padding:20px;max-width:680px;margin:auto}h1{font-size:22px}h3{margin:18px 0 4px;font-size:15px;color:#5fd3ff}table{width:100%;border-collapse:collapse}th,td{padding:8px 6px;border-bottom:1px solid #2a3b57;text-align:left}.n{text-align:right;font-weight:700;color:#d6a24f}small{color:#8aa2c8}</style></head>
<body>
<h1>조립전쟁 · 보급 상자 확률 공개</h1>
<p>상자 1개는 칸 ${SUPPLY.rolls}개이고, 칸마다 아래 확률로 따로 뽑습니다. 유료 상자는 없으며 보급권·${SUPPLY.freeHours}시간 무료 상자는 모두 같은 표를 씁니다.</p>
<table><thead><tr><th>결과</th><th>확률(칸당)</th><th>내용</th></tr></thead><tbody>
${rows}
</tbody></table>
<p>천장: 에픽 부품 조각이 ${SUPPLY.pityEvery - 1}상자 연속 나오지 않으면 다음 상자의 마지막 칸은 에픽 부품 조각이 확정입니다.</p>
<p><small>부품 등급은 같은 종류(다리·몸통·무기·액세서리) 안에서 와트(액세서리는 무게)가 높은 순으로 위 20% 에픽, 다음 30% 희귀, 나머지 일반입니다.</small></p>
${parts}
<p><small>문의·정정: 앱 설정의 문의 메일. 이 표는 앱 안 「보급 → 확률표」와 같은 숫자입니다.</small></p>
</body></html>
`;
writeFileSync(new URL('../public/odds.html', import.meta.url), html);
console.log('odds.html', html.length);
