// 쿠폰 해시 만들기: npx tsx scripts/make-coupon.ts <코드> [<코드> ...]
// 출력된 해시를 src/domain/coupons.ts 의 COUPONS[].h 에 넣는다 (코드 문자열은 앱에 넣지 않는다).
import { couponHash, normalize } from '../src/domain/coupons';
for (const code of process.argv.slice(2)) console.log(`${normalize(code)} → h: '${couponHash(code)}'`);
