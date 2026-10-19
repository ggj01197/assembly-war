/**
 * 인앱 상품 목록 (ASC 에 2026-10-19 생성·가격 입력 완료, MONETIZATION_DESIGN.md §3). 앱 안 상점 화면이 이 표를 그대로 보여 준다.
 * 결제 연결(영수증 검증·복원)은 출시 빌드에서 — 지금은 보기 전용. ID 앞에 `com.shortappstudio.assemblywar.` 가 붙는다.
 * 능력치를 파는 상품은 없다(강화 격차 +30% 상한, 유료 상자 없음).
 */
export const PRODUCT_PREFIX = 'com.shortappstudio.assemblywar.';
export type ProductGroup = 'ads' | 'member' | 'pass' | 'look' | 'gear' | 'pack';
export interface Product { id: string; group: ProductGroup; name: string; desc: string; krw: number; kind: 'nonconsumable' | 'consumable' | 'subscription'; per?: '월' }

export const GROUP_LABEL: Record<ProductGroup, string> = { ads: '광고', member: '멤버십', pass: '패스·슬롯', look: '외형·음성', gear: '톱니', pack: '패키지' };

export const CATALOG: Product[] = [
  { id: 'remove_ads', group: 'ads', name: '광고 제거', desc: '보상형 광고 자리가 모두 「바로 받기」로 바뀝니다. 전면·강제 광고는 원래 없어요.', krw: 4900, kind: 'nonconsumable' },
  { id: 'member30', group: 'member', name: '정비반 멤버십', desc: '광고 제거 포함 · 매일 보급권 1장 · 톱니 30 · 격납고 슬롯 +4', krw: 5900, kind: 'subscription', per: '월' },
  { id: 'member30_plus', group: 'member', name: '정비반 멤버십 플러스', desc: '위 혜택 + 매일 보급권 2장 · 톱니 80 · 일일 임무 보상 1.5배', krw: 11000, kind: 'subscription', per: '월' },
  { id: 'season_pass_s1', group: 'pass', name: '성장 패스 시즌 1', desc: '트로피 구간 보상 2줄 + 시즌 스킨 1개', krw: 7900, kind: 'nonconsumable' },
  { id: 'hangar_slots', group: 'pass', name: '격납고 슬롯 +6', desc: '설계도를 보관하는 슬롯 6개 추가', krw: 3300, kind: 'nonconsumable' },
  { id: 'skin_pack_1', group: 'look', name: '스킨 세트 1', desc: '색·무늬만 바뀌는 외형 세트 (능력치 동일)', krw: 2200, kind: 'nonconsumable' },
  { id: 'skin_pack_2', group: 'look', name: '스킨 세트 2', desc: '색·무늬만 바뀌는 외형 세트 (능력치 동일)', krw: 2200, kind: 'nonconsumable' },
  { id: 'skin_pack_3', group: 'look', name: '스킨 세트 3', desc: '색·무늬만 바뀌는 외형 세트 (능력치 동일)', krw: 2200, kind: 'nonconsumable' },
  { id: 'voice_pack_1', group: 'look', name: '파일럿 음성 팩', desc: '전투 중 파일럿 음성 (영웅 3명)', krw: 2200, kind: 'nonconsumable' },
  { id: 'gear_s', group: 'gear', name: '톱니 300', desc: '프리미엄 재화 — 스킨·보급권·광석 교환', krw: 3300, kind: 'consumable' },
  { id: 'gear_m', group: 'gear', name: '톱니 700', desc: '프리미엄 재화 — 스킨·보급권·광석 교환', krw: 7700, kind: 'consumable' },
  { id: 'gear_l', group: 'gear', name: '톱니 1,600', desc: '프리미엄 재화 — 스킨·보급권·광석 교환', krw: 16500, kind: 'consumable' },
  { id: 'gear_xl', group: 'gear', name: '톱니 4,000', desc: '프리미엄 재화 — 스킨·보급권·광석 교환', krw: 39000, kind: 'consumable' },
  { id: 'starter_pack', group: 'pack', name: '시작 패키지', desc: '보급권 5장 · 광석 2,000 · 톱니 100 (1회만)', krw: 2200, kind: 'consumable' },
  { id: 'supply_pack_10', group: 'pack', name: '보급권 10+1', desc: '보급권 11장 — 무료 상자와 같은 확률표', krw: 5500, kind: 'consumable' },
  { id: 'ore_pack', group: 'pack', name: '광석 6,000', desc: '강화와 제작에 쓰는 광석', krw: 3300, kind: 'consumable' },
];
export const won = (n: number): string => '₩' + n.toLocaleString('ko-KR');
