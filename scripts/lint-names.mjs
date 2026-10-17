// 노바1492 고유명사가 게임 데이터·문구에 들어가면 빌드를 막는다 (RISK R-05, TD-003).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const BANNED = ['노바1492', '노바 1492', 'NOVA1492', 'NOVA 1492', '토틀러', '킹핀', '사지타리움', '메가배럴', '아모건', '스카이킬러', '홀리가드', '엔젤가드', '데블스피릿', '하프라이프', '퀴러시어', '스쿼드론', '바탈리안', '크롤러', '라운시', '제니스', '마이저', '베베세', '크루저N', '아라마루'];

function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) { if (f !== 'node_modules') walk(p, out); }
    else if (/\.(ts|json|html|css|md)$/.test(f)) out.push(p);
  }
  return out;
}

const files = walk('src');
const hits = [];
for (const f of files) {
  const text = readFileSync(f, 'utf8');
  for (const word of BANNED) if (text.includes(word)) hits.push(`${f}: "${word}"`);
}
if (hits.length) {
  console.error('금지된 노바1492 고유명사가 있습니다:\n' + hits.join('\n'));
  process.exit(1);
}
console.log(`lint-names OK (${files.length} files)`);
