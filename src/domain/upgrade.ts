import type { UnitStats } from './assemble';

/**
 * 강화 규칙 (기획안 FINAL §4-3, 결정 #6): Lv1~10, Lv10 은 Lv1 보다 최대 +30% (체력·공격만). 사거리·속도·와트는 안 변한다.
 * 상한이 코드 한 곳에 있어야 과금 격차가 +30% 를 넘지 않는다는 것을 테스트로 지킨다.
 */
export const MAX_LEVEL = 10;
export const UPGRADE_CAP = 0.3;
/** 비동기 대전 매칭: 덱 강화 총합 차이 허용 비율 (기획안 §4-3) */
export const MATCH_STRENGTH_TOLERANCE = 0.15;
/** 분해 환급 비율 (기획안 §4-3) */
export const SALVAGE_REFUND = 0.7;

export function clampLevel(level: number): number {
  if (!Number.isFinite(level)) return 1;
  return Math.min(MAX_LEVEL, Math.max(1, Math.floor(level)));
}

/** Lv → 능력치 배율 (1.00 ~ 1.30) */
export function levelMultiplier(level: number): number {
  const l = clampLevel(level);
  return 1 + (UPGRADE_CAP * (l - 1)) / (MAX_LEVEL - 1);
}

export function scaleStats(stats: UnitStats, level: number): UnitStats {
  const m = levelMultiplier(level);
  return { ...stats, hp: Math.round(stats.hp * m), dmg: Math.round(stats.dmg * m * 100) / 100 };
}

/** Lv n → n+1 에 필요한 같은 부품 수와 광석. 레벨이 오를수록 비싸다 (완만한 곡선) */
export function upgradeCost(fromLevel: number): { copies: number; ore: number } | null {
  const l = clampLevel(fromLevel);
  if (l >= MAX_LEVEL) return null;
  return { copies: l + 1, ore: 40 * l * l };
}

/** 부품을 Lv1 에서 Lv n 까지 올리는 데 든 총 복사본·광석 (분해 환급 계산용) */
export function totalCostTo(level: number): { copies: number; ore: number } {
  let copies = 0, ore = 0;
  for (let l = 1; l < clampLevel(level); l++) {
    const c = upgradeCost(l);
    if (c) { copies += c.copies; ore += c.ore; }
  }
  return { copies, ore };
}

export function salvageOre(level: number): number {
  return Math.floor(totalCostTo(level).ore * SALVAGE_REFUND);
}

/** 덱 강화 총합 (카드 레벨 합) — 매칭에 쓴다 */
export function deckStrength(levels: number[]): number {
  return levels.reduce((a, l) => a + levelMultiplier(l), 0);
}

export function isMatchable(a: number[], b: number[]): boolean {
  const sa = deckStrength(a), sb = deckStrength(b);
  if (sa === 0 || sb === 0) return false;
  return Math.abs(sa - sb) / Math.max(sa, sb) <= MATCH_STRENGTH_TOLERANCE;
}
