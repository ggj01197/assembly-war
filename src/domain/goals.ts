import type { SaveData } from './save';
import { commanderLevel } from './save';
import { grant, type Reward } from './daily';

/**
 * 주간 과제 5개 + 업적 칭호 (GAME_DEPTH_PLAN 7단계). 순수 규칙 — 화면·저장소는 모른다.
 * 주간 과제: 월요일(주 키 = 그 주 월요일 날짜)에 새로 시작, 진행도는 전투 정산 때 `addWeekly` 로 쌓는다.
 * 업적: 달성 여부는 저장된 값에서 매번 계산(저장 불필요), 받은 것만 `goals.ach` 에 남긴다.
 */
export type WeeklyType = 'wins' | 'ops' | 'tower' | 'boss' | 'hero';
export interface WeeklyDef { type: WeeklyType; label: string; target: number; reward: Reward }
export const WEEKLY: WeeklyDef[] = [
  { type: 'wins', label: '작전에서 승리하기', target: 12, reward: { ore: 300, exp: 80, tickets: 0 } },
  { type: 'ops', label: '요일 작전 승리하기', target: 5, reward: { ore: 300, exp: 80, tickets: 1 } },
  { type: 'tower', label: '무한의 탑 새 층 오르기', target: 3, reward: { ore: 300, exp: 80, tickets: 0 } },
  { type: 'boss', label: '보스 쓰러뜨리기', target: 3, reward: { ore: 300, exp: 80, tickets: 1 } },
  { type: 'hero', label: '영웅 출격시키기', target: 8, reward: { ore: 300, exp: 80, tickets: 0 } },
];
export const WEEKLY_BONUS: Reward = { ore: 600, exp: 200, tickets: 3 };

export interface GoalsState { week: string; prog: Partial<Record<WeeklyType, number>>; claimed: WeeklyType[]; bonus: boolean; ach: string[] }
export const defaultGoals = (): GoalsState => ({ week: '', prog: {}, claimed: [], bonus: false, ach: [] });

/** 주가 바뀌었으면 주간 과제를 새로 시작한다 (업적 기록은 유지) */
export function ensureWeekly(save: SaveData, week: string): void {
  if (save.goals.week === week) return;
  save.goals = { ...save.goals, week, prog: {}, claimed: [], bonus: false };
}
export function addWeekly(save: SaveData, type: WeeklyType, week: string, n = 1): void {
  if (!(n > 0)) return;
  ensureWeekly(save, week);
  const d = WEEKLY.find(w => w.type === type)!;
  save.goals.prog[type] = Math.min(d.target, (save.goals.prog[type] ?? 0) + Math.floor(n));
}
export const weeklyProgress = (save: SaveData, type: WeeklyType, week: string): number => (save.goals.week === week ? save.goals.prog[type] ?? 0 : 0);
export const weeklyDone = (save: SaveData, d: WeeklyDef, week: string): boolean => weeklyProgress(save, d.type, week) >= d.target;
export const weeklyClaimed = (save: SaveData, type: WeeklyType, week: string): boolean => save.goals.week === week && save.goals.claimed.includes(type);

export function claimWeekly(save: SaveData, type: WeeklyType, week: string): { save: SaveData; reward: Reward } | null {
  const d = WEEKLY.find(w => w.type === type);
  if (!d || !weeklyDone(save, d, week) || weeklyClaimed(save, type, week)) return null;
  const next: SaveData = JSON.parse(JSON.stringify(save));
  ensureWeekly(next, week); next.goals.claimed.push(type); grant(next, d.reward);
  return { save: next, reward: d.reward };
}
/** 5개를 모두 받았으면 주간 보너스 */
export const bonusReady = (save: SaveData, week: string): boolean => save.goals.week === week && !save.goals.bonus && WEEKLY.every(w => save.goals.claimed.includes(w.type));
export function claimWeeklyBonus(save: SaveData, week: string): { save: SaveData; reward: Reward } | null {
  if (!bonusReady(save, week)) return null;
  const next: SaveData = JSON.parse(JSON.stringify(save));
  next.goals.bonus = true; grant(next, WEEKLY_BONUS);
  return { save: next, reward: WEEKLY_BONUS };
}

// ───────── 업적 ─────────
export interface AchievementDef { id: string; title: string; desc: string; icon: string; target: number; cur: (s: SaveData) => number; reward: Reward }
const cleared = (id: string) => (s: SaveData): number => ((s.stages[id]?.clears ?? 0) > 0 ? 1 : 0);
const maxLevel = (s: SaveData): number => Math.max(1, ...Object.values(s.partLevels));
const R = (ore: number, tickets = 0): Reward => ({ ore, exp: Math.round(ore / 5), tickets });

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'ac_win1', title: '첫 출동', desc: '작전에서 처음 승리', icon: '🎖', target: 1, cur: s => s.winCount, reward: R(100) },
  { id: 'ac_win10', title: '신참 지휘관', desc: '작전 10번 승리', icon: '🥉', target: 10, cur: s => s.winCount, reward: R(250) },
  { id: 'ac_win50', title: '숙련 지휘관', desc: '작전 50번 승리', icon: '🥈', target: 50, cur: s => s.winCount, reward: R(600, 1) },
  { id: 'ac_win150', title: '전장의 지배자', desc: '작전 150번 승리', icon: '🥇', target: 150, cur: s => s.winCount, reward: R(1500, 3) },
  { id: 'ac_ch1', title: '훈련소 수료', desc: '1장 최종 시험 통과', icon: '🏫', target: 1, cur: cleared('c1-7'), reward: R(300) },
  { id: 'ac_ch2', title: '폐허 정복', desc: '2장 공중 요새 격파', icon: '🏚', target: 1, cur: cleared('c2-7'), reward: R(500, 1) },
  { id: 'ac_ch3', title: '요새 함락', desc: '3장 요새 장군 격파', icon: '🏰', target: 1, cur: cleared('c3-7'), reward: R(900, 2) },
  { id: 'ac_sv120', title: '버티기 2분', desc: '5분 버티기 120초 기록', icon: '⏳', target: 120, cur: s => s.survivalBest, reward: R(300) },
  { id: 'ac_sv300', title: '철의 기지', desc: '5분 버티기 300초 돌파', icon: '🛡', target: 300, cur: s => s.survivalBest, reward: R(900, 2) },
  { id: 'ac_tw10', title: '탑의 초입', desc: '무한의 탑 10층 도달', icon: '🗼', target: 10, cur: s => s.modes.towerBest, reward: R(400, 1) },
  { id: 'ac_tw30', title: '탑의 중턱', desc: '무한의 탑 30층 도달', icon: '🗼', target: 30, cur: s => s.modes.towerBest, reward: R(1000, 2) },
  { id: 'ac_tw50', title: '탑의 정상 근처', desc: '무한의 탑 50층 도달', icon: '🗼', target: 50, cur: s => s.modes.towerBest, reward: R(2000, 4) },
  { id: 'ac_rush', title: '보스 사냥꾼', desc: '보스 러시 3연전 완주', icon: '☠', target: 3, cur: s => s.modes.rushBest, reward: R(800, 2) },
  { id: 'ac_ops', title: '요일의 달인', desc: '요일 작전 7종 모두 승리', icon: '📅', target: 7, cur: s => [0, 1, 2, 3, 4, 5, 6].filter(i => (s.stages[`op-${i}`]?.clears ?? 0) > 0).length, reward: R(800, 2) },
  { id: 'ac_chest10', title: '보급 담당', desc: '보급 상자 10개 열기', icon: '📦', target: 10, cur: s => s.supply.opened, reward: R(250) },
  { id: 'ac_chest50', title: '보급 대장', desc: '보급 상자 50개 열기', icon: '📦', target: 50, cur: s => s.supply.opened, reward: R(900, 2) },
  { id: 'ac_cmd5', title: '사령관 Lv.5', desc: '사령관 레벨 5 도달', icon: '⭐', target: 5, cur: s => commanderLevel(s.commanderExp).level, reward: R(300) },
  { id: 'ac_cmd10', title: '사령관 Lv.10', desc: '사령관 레벨 10 도달', icon: '🌟', target: 10, cur: s => commanderLevel(s.commanderExp).level, reward: R(900, 1) },
  { id: 'ac_up5', title: '강화 입문', desc: '부품 하나를 Lv.5 로 강화', icon: '🔧', target: 5, cur: maxLevel, reward: R(300) },
  { id: 'ac_up10', title: '강화 장인', desc: '부품 하나를 Lv.10 으로 강화', icon: '🛠', target: 10, cur: maxLevel, reward: R(1000, 2) },
  { id: 'ac_att7', title: '개근 일주일', desc: '출석 7일 받기', icon: '🗓', target: 7, cur: s => s.attend.claimed, reward: R(300, 1) },
  { id: 'ac_att28', title: '개근 한 달', desc: '출석 28일 받기', icon: '🏅', target: 28, cur: s => s.attend.claimed, reward: R(1200, 3) },
];

export const achProgress = (s: SaveData, a: AchievementDef): number => Math.min(a.target, Math.max(0, Math.floor(a.cur(s))));
export const achDone = (s: SaveData, a: AchievementDef): boolean => a.cur(s) >= a.target;
export const achClaimed = (s: SaveData, id: string): boolean => s.goals.ach.includes(id);
export function claimAch(save: SaveData, id: string): { save: SaveData; reward: Reward; title: string } | null {
  const a = ACHIEVEMENTS.find(x => x.id === id);
  if (!a || achClaimed(save, id) || !achDone(save, a)) return null;
  const next: SaveData = JSON.parse(JSON.stringify(save));
  next.goals.ach.push(id); grant(next, a.reward);
  return { save: next, reward: a.reward, title: a.title };
}
/** 받을 수 있는(달성했지만 아직 안 받은) 업적 수 — 배지용 */
export const achClaimable = (s: SaveData): number => ACHIEVEMENTS.filter(a => achDone(s, a) && !achClaimed(s, a.id)).length;
