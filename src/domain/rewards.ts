import type { SaveData } from './save';

/** 전투 정산 (순수 함수 — 한 번 호출하면 한 번만 지급되도록 화면이 결과 화면 진입 때 딱 한 번 부른다) */
export interface StageLike { id: string; rewardOre: number; rewardExp: number }
export interface Settlement { ore: number; exp: number; tickets: number; firstClear: boolean }

export const REPEAT_RATIO = 0.4;
export const LOSS_ORE = 20;
export const LOSS_EXP = 10;

export function settle(save: SaveData, stage: StageLike, win: boolean, baseHpLeft: number): { save: SaveData; rewards: Settlement } {
  const next: SaveData = JSON.parse(JSON.stringify(save));
  const rec = next.stages[stage.id] ?? { clears: 0, bestBaseHp: 0 };
  let rewards: Settlement;
  if (win) {
    const first = rec.clears === 0;
    const k = first ? 1 : REPEAT_RATIO;
    rewards = { ore: Math.round(stage.rewardOre * k), exp: Math.round(stage.rewardExp * k), tickets: first ? 1 : 0, firstClear: first };
    rec.clears += 1;
    rec.bestBaseHp = Math.max(rec.bestBaseHp, Math.max(0, Math.round(baseHpLeft)));
    next.flags.firstWin = true;
  } else {
    rewards = { ore: LOSS_ORE, exp: LOSS_EXP, tickets: 0, firstClear: false };
  }
  next.stages[stage.id] = rec;
  next.ore += rewards.ore; next.commanderExp += rewards.exp; next.tickets += rewards.tickets;
  return { save: next, rewards };
}

/** 5분 버티기 정산: 버틴 시간 비율만큼 지급, 최고 기록을 넘기면 전액·아니면 40%. 300초를 처음 채우면 보급권 1. */
export function settleSurvival(save: SaveData, stage: StageLike, seconds: number, full: boolean): { save: SaveData; rewards: Settlement; record: boolean } {
  const next: SaveData = JSON.parse(JSON.stringify(save));
  const secs = Math.max(0, Math.min(300, Math.floor(seconds)));
  const record = secs > next.survivalBest;
  const k = (secs / 300) * (record ? 1 : REPEAT_RATIO);
  const rec = next.stages[stage.id] ?? { clears: 0, bestBaseHp: 0 };
  const first = full && rec.clears === 0;
  const rewards: Settlement = { ore: Math.round(stage.rewardOre * k), exp: Math.round(stage.rewardExp * k), tickets: first ? 1 : 0, firstClear: first };
  if (full) rec.clears += 1;
  next.stages[stage.id] = rec;
  if (record) next.survivalBest = secs;
  next.ore += rewards.ore; next.commanderExp += rewards.exp; next.tickets += rewards.tickets;
  return { save: next, rewards, record };
}

/** 결과 화면 "가장 약했던 설계도": 생산한 카드 중 1기당 가한 피해가 가장 낮은 것 (없으면 null) */
export function weakestCard(spawns: number[], damage: number[]): number | null {
  let worst: number | null = null, wv = Infinity;
  spawns.forEach((n, i) => {
    if (n <= 0) return;
    const v = damage[i] / n;
    if (v < wv) { wv = v; worst = i; }
  });
  return worst;
}
