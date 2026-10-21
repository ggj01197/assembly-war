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
    next.winCount = (next.winCount ?? 0) + 1;
    // 보급권: 처음 이기면 1(보스 작전은 2), 그 뒤 3승마다 1
    const tickets = (first ? ((stage as { boss?: string }).boss ? 2 : 1) : 0) + (next.winCount % 3 === 0 ? 1 : 0);
    rewards = { ore: Math.round(stage.rewardOre * k), exp: Math.round(stage.rewardExp * k), tickets, firstClear: first };
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

/** 요일 작전 정산: 하루 `cap` 번까지 승리 보상 전액(+보급권 1, 하루 첫 승리는 +1 더), 그 뒤엔 보상 20%. 졌을 땐 위로 보상만. */
export function settleOp(save: SaveData, stage: StageLike, win: boolean, today: string, cap: number): { save: SaveData; rewards: Settlement } {
  const next: SaveData = JSON.parse(JSON.stringify(save));
  const m = next.modes;
  if (m.opsDate !== today) { m.opsDate = today; m.opsDone = 0; }
  let rewards: Settlement;
  if (win) {
    const full = m.opsDone < cap;
    const first = m.opsDone === 0;
    next.winCount = (next.winCount ?? 0) + 1;
    rewards = { ore: Math.round(stage.rewardOre * (full ? 1 : 0.2)), exp: Math.round(stage.rewardExp * (full ? 1 : 0.2)), tickets: full ? (first ? 2 : 1) : 0, firstClear: false };
    if (full) m.opsDone += 1;
    const rec = next.stages[stage.id] ?? { clears: 0, bestBaseHp: 0 }; rec.clears += 1; next.stages[stage.id] = rec;
    next.flags.firstWin = true;
  } else {
    rewards = { ore: LOSS_ORE, exp: LOSS_EXP, tickets: 0, firstClear: false };
  }
  next.ore += rewards.ore; next.commanderExp += rewards.exp; next.tickets += rewards.tickets;
  return { save: next, rewards };
}

/** 무한의 탑 정산: 최고 층을 넘기는 승리면 전액(5층마다 보급권 1, 10층마다 2), 이미 깬 층은 20%. 졌을 땐 위로 보상. */
export function settleTower(save: SaveData, stage: StageLike & { tower?: number }, win: boolean): { save: SaveData; rewards: Settlement; record: boolean } {
  const next: SaveData = JSON.parse(JSON.stringify(save));
  const f = stage.tower ?? 0;
  let rewards: Settlement, record = false;
  if (win) {
    record = f > next.modes.towerBest;
    next.winCount = (next.winCount ?? 0) + 1;
    rewards = { ore: Math.round(stage.rewardOre * (record ? 1 : 0.2)), exp: Math.round(stage.rewardExp * (record ? 1 : 0.2)), tickets: record ? (f % 10 === 0 ? 2 : f % 5 === 0 ? 1 : 0) : 0, firstClear: record };
    if (record) next.modes.towerBest = f;
    next.flags.firstWin = true;
  } else rewards = { ore: LOSS_ORE, exp: LOSS_EXP, tickets: 0, firstClear: false };
  next.ore += rewards.ore; next.commanderExp += rewards.exp; next.tickets += rewards.tickets;
  return { save: next, rewards, record };
}

/** 보스 러시 정산: 이긴 보스마다 기본 보상, 3번째(마지막)를 이번 주 처음 이기면 주간 보너스. 최고 진행(rushBest)을 남긴다. */
export function settleRush(save: SaveData, stage: StageLike & { rush?: number }, win: boolean, week: string, bonus: { ore: number; exp: number; tickets: number }): { save: SaveData; rewards: Settlement } {
  const next: SaveData = JSON.parse(JSON.stringify(save));
  const m = next.modes, k = stage.rush ?? 1;
  if (m.rushWeek !== week) { m.rushWeek = week; m.rushDone = false; }
  let rewards: Settlement;
  if (win) {
    next.winCount = (next.winCount ?? 0) + 1;
    rewards = { ore: stage.rewardOre, exp: stage.rewardExp, tickets: 0, firstClear: false };
    m.rushBest = Math.max(m.rushBest, k);
    if (k === 3 && !m.rushDone) { m.rushDone = true; rewards = { ore: rewards.ore + bonus.ore, exp: rewards.exp + bonus.exp, tickets: bonus.tickets, firstClear: true }; }
    next.flags.firstWin = true;
  } else rewards = { ore: LOSS_ORE, exp: LOSS_EXP, tickets: 0, firstClear: false };
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
