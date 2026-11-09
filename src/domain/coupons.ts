import type { SaveData } from './save';
import { grant, type Reward } from './daily';
import { sha256Hex } from './sha256';

/**
 * 쿠폰 코드 (GAME_DEPTH_PLAN 10단계). 서버 없이 동작한다: 코드 문자열은 앱에 넣지 않고 소금 친 해시만 둔다(`scripts/make-coupon.ts` 로 새 코드의 해시를 만든다).
 * 코드는 무작위 12글자(60비트)라 추측·해시 역산이 불가능하다. 한 코드는 기기(세이브)당 한 번만 쓸 수 있고, 유효기간(until, 그 날까지)이 있으면 지나면 안 된다. 보상은 광석·경험치·보급권만 — 결제 가치가 있는 것은 넣지 않는다.
 * 주의: 서버 검증이 없으므로 코드가 새어 나가면 막을 수 없다 — 소량·한정 보상용. 대량 배포용 코드는 서버가 열린 뒤에.
 */
export interface CouponDef { h: string; label: string; reward: Reward; until?: string }

const SALT = 'aw2-coupon-2026';
/** SHA-256(소금 + 정규화된 코드)의 앞 16자리 16진수(64비트). 코드는 무작위 60비트 이상(scripts/make-coupon.ts --new)이라 해시에서 거꾸로 만들 수 없다 */
export function couponHash(code: string): string {
  return sha256Hex(SALT + normalize(code)).slice(0, 16);
}
/** 공백·하이픈 무시, 대문자 */
export const normalize = (code: string): string => code.toUpperCase().replace(/[\s\-_]/g, '');

export const COUPONS: CouponDef[] = [
  { h: '2db87b100037bbf7', label: '출시 기념 선물', reward: { ore: 500, exp: 0, tickets: 2 } },
  { h: '12956ce38de982e4', label: '조립 지원금', reward: { ore: 300, exp: 100, tickets: 0 } },
  { h: 'a046442060572dc5', label: '겨울 별빛 보급', reward: { ore: 0, exp: 0, tickets: 3 }, until: '2026-12-31' },
];

export type RedeemResult = { ok: true; save: SaveData; reward: Reward; label: string } | { ok: false; msg: string };
export function redeemCoupon(save: SaveData, code: string, today: string): RedeemResult {
  const n = normalize(code);
  if (n.length < 4 || n.length > 40) return { ok: false, msg: '쿠폰 코드를 다시 확인해 주세요.' };
  const h = couponHash(n), def = COUPONS.find(c => c.h === h);
  if (!def) return { ok: false, msg: '없는 쿠폰 코드예요.' };
  if (def.until && today > def.until) return { ok: false, msg: '기간이 지난 쿠폰이에요.' };
  if (save.coupons.includes(h)) return { ok: false, msg: '이미 사용한 쿠폰이에요.' };
  const next: SaveData = JSON.parse(JSON.stringify(save));
  next.coupons.push(h); if (next.coupons.length > 200) next.coupons.shift();
  grant(next, def.reward);
  return { ok: true, save: next, reward: def.reward, label: def.label };
}
