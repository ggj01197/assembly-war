import type { SaveData } from './save';
import { grant, type Reward } from './daily';

/**
 * 시즌 이벤트 (GAME_DEPTH_PLAN 10단계). 기간이 있는 시즌 1개가 열려 있는 동안 전투마다 「시즌 포인트」가 쌓이고, 포인트 단계마다 보상을 받는다.
 * 무료 트랙만 열려 있다 — 성장 패스(유료 트랙)는 표시만 하고 결제 연결은 출시 빌드에서 CEO 승인 뒤에 한다.
 * 순수 규칙(날짜는 'YYYY-MM-DD' 문자열) — 화면·저장소는 모른다.
 */
export interface Milestone { pts: number; reward: Reward; copies?: { part: string; n: number } }
export interface SeasonDef { id: string; name: string; icon: string; start: string; end: string; blurb: string; milestones: Milestone[]; /** 성장 패스(유료 트랙)에서 추가로 줄 보상 — 아직 잠김 */ passBonus: Reward }

const M = (pts: number, ore: number, tickets = 0, exp = 0): Milestone => ({ pts, reward: { ore, exp, tickets } });
export const SEASONS: SeasonDef[] = [
  {
    id: 's1', name: '겨울 별빛 시즌', icon: '❄', start: '2026-11-01', end: '2026-12-31',
    blurb: '전투마다 시즌 포인트가 쌓여요. 별빛 방어전(하루 3번)은 포인트가 더 많이 쌓입니다.',
    milestones: [M(40, 200), M(100, 300, 1), M(180, 400), M(280, 500, 1), M(400, 600), M(550, 700, 2), M(720, 800), M(900, 1000, 2), M(1100, 1200, 2),
      { pts: 1400, reward: { ore: 2000, exp: 400, tickets: 5 }, copies: { part: 'epic', n: 5 } }],
    passBonus: { ore: 300, exp: 0, tickets: 1 },
  },
];

export const SEASON_DAILY_POINT_CAP = 150;
export const EVENT_DAILY_CAP = 3;
export const EVENT_WIN_POINTS = 25;

export interface SeasonState { id: string; points: number; claimed: number[]; ptsDate: string; ptsToday: number; evDate: string; evDone: number }
export const defaultSeason = (): SeasonState => ({ id: '', points: 0, claimed: [], ptsDate: '', ptsToday: 0, evDate: '', evDone: 0 });

/** 오늘 열려 있는 시즌 (없으면 null) */
export function activeSeason(today: string): SeasonDef | null { return SEASONS.find(s => today >= s.start && today <= s.end) ?? null; }
/** 아직 안 열린 가장 가까운 시즌 */
export function upcomingSeason(today: string): SeasonDef | null { return SEASONS.filter(s => s.start > today).sort((a, b) => a.start.localeCompare(b.start))[0] ?? null; }
/** 두 날짜(YYYY-MM-DD) 사이 일수 (b − a) */
export function daysBetween(a: string, b: string): number {
  const t = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  return Math.round((t(b) - t(a)) / 86400000);
}
export const daysLeft = (s: SeasonDef, today: string): number => Math.max(0, daysBetween(today, s.end));

/** 시즌이 바뀌었으면 포인트·받은 기록을 새로 시작 */
export function ensureSeasonState(save: SaveData, def: SeasonDef): void {
  if (save.season.id !== def.id) save.season = { ...defaultSeason(), id: def.id };
}

/** 시즌 포인트를 더한다(열린 시즌이 있을 때만, 하루 상한 150). 실제로 더해진 양을 돌려준다. */
export function addSeasonPoints(save: SaveData, today: string, n: number): number {
  const def = activeSeason(today); if (!def || !(n > 0)) return 0;
  ensureSeasonState(save, def);
  const s = save.season;
  if (s.ptsDate !== today) { s.ptsDate = today; s.ptsToday = 0; }
  const add = Math.max(0, Math.min(Math.floor(n), SEASON_DAILY_POINT_CAP - s.ptsToday));
  s.points += add; s.ptsToday += add;
  return add;
}

/** 전투 결과로 얻는 포인트: 승리 10(패배 2) + 모드 보너스 */
export function battlePoints(win: boolean, bonus: number): number { return (win ? 10 : 2) + (win ? bonus : 0); }

export const milestoneReady = (save: SaveData, def: SeasonDef, i: number): boolean => save.season.id === def.id && save.season.points >= def.milestones[i].pts && !save.season.claimed.includes(i);
export function claimMilestone(save: SaveData, today: string, i: number, epicPart: string): { save: SaveData; reward: Reward; copies?: { part: string; n: number } } | null {
  const def = activeSeason(today); if (!def || !def.milestones[i] || !milestoneReady(save, def, i)) return null;
  const next: SaveData = JSON.parse(JSON.stringify(save)), m = def.milestones[i];
  next.season.claimed.push(i); grant(next, m.reward);
  const copies = m.copies ? { part: m.copies.part === 'epic' ? epicPart : m.copies.part, n: m.copies.n } : undefined;
  if (copies) next.copies[copies.part] = (next.copies[copies.part] ?? 0) + copies.n;
  return { save: next, reward: m.reward, copies };
}

/** 별빛 방어전 정산: 하루 3번까지 승리 보상 전액(+시즌 포인트는 호출한 쪽이 더한다), 그 뒤 20%. 졌을 땐 위로 보상. */
export function settleEvent(save: SaveData, stage: { rewardOre: number; rewardExp: number }, win: boolean, today: string): { save: SaveData; rewards: { ore: number; exp: number; tickets: number; firstClear: boolean }; full: boolean } {
  const next: SaveData = JSON.parse(JSON.stringify(save)), def = activeSeason(today);
  if (def) ensureSeasonState(next, def);
  const s = next.season;
  if (s.evDate !== today) { s.evDate = today; s.evDone = 0; }
  let rewards, full = false;
  if (win) {
    full = s.evDone < EVENT_DAILY_CAP;
    rewards = { ore: Math.round(stage.rewardOre * (full ? 1 : 0.2)), exp: Math.round(stage.rewardExp * (full ? 1 : 0.2)), tickets: full && s.evDone === 0 ? 1 : 0, firstClear: false };
    if (full) s.evDone += 1;
    next.winCount = (next.winCount ?? 0) + 1; next.flags.firstWin = true;
  } else rewards = { ore: 20, exp: 10, tickets: 0, firstClear: false };
  next.ore += rewards.ore; next.commanderExp += rewards.exp; next.tickets += rewards.tickets;
  return { save: next, rewards, full };
}
