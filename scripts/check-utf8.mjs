// 소스 텍스트 파일이 유효한 UTF-8 인지 검사 (PowerShell Add-Content 등이 한글을 CP949 로 덧붙여 빌드가 깨진 사고 방지, 2026-10-22)
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
const EXT = /\.(ts|css|html|json|mjs|md|yaml|yml)$/;
const bad = [];
const walk = d => { for (const n of readdirSync(d)) { if (n === 'node_modules' || n === 'dist' || n.startsWith('.')) continue; const p = join(d, n), s = statSync(p); if (s.isDirectory()) walk(p); else if (EXT.test(n)) { try { new TextDecoder('utf-8', { fatal: true }).decode(readFileSync(p)); } catch { bad.push(p); } } } };
for (const d of ['src', 'scripts', 'public']) walk(d);
if (bad.length) { console.error('유효하지 않은 UTF-8 파일:', bad.join(', ')); process.exit(1); }
console.log('check-utf8 OK');
