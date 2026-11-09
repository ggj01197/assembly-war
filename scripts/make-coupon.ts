// 쿠폰 만들기
//   새 무작위 코드 N개:  npx tsx scripts/make-coupon.ts --new 3   (코드와 해시를 같이 출력 — 코드는 안전한 곳에만 적는다)
//   기존 코드의 해시:    npx tsx scripts/make-coupon.ts <코드> [<코드> ...]
// 출력된 해시를 src/domain/coupons.ts 의 COUPONS[].h 에 넣는다 (코드 문자열은 앱·저장소에 넣지 않는다).
import { randomBytes } from 'node:crypto';
import { couponHash, normalize } from '../src/domain/coupons';
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';   // Crockford base32 (I L O U 제외)
const gen = (): string => { const b = randomBytes(12); let t = ''; for (let i = 0; i < 12; i++) t += ALPHABET[b[i] & 31]; return `${t.slice(0, 4)}-${t.slice(4, 8)}-${t.slice(8)}`; };
const args = process.argv.slice(2);
if (args[0] === '--new') for (let i = 0; i < Number(args[1] ?? 1); i++) { const c = gen(); console.log(`${c} → h: '${couponHash(c)}'`); }
else for (const code of args) console.log(`${normalize(code)} → h: '${couponHash(code)}'`);
