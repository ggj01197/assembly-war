import type { SaveData } from './save';
import { PARTS } from '../data/parts';
import { partsOf, rarityOf } from './supply';
import { mulberry32 } from './rng';

/**
 * 일일 임무 3 · 출석 28 · 보상형 광고 8곳(하루 15회) — 기획안 FINAL §6·§8, MONETIZATION_DESIGN.md §2.
 * 순수 규칙(날짜는 'YYYY-MM-DD' 문자열로 받는다 → 테스트 가능). 화면·광고 SDK 는 모른다.
 */
export interface Reward { ore: number; exp: number; tickets: number }
export const ZERO: Reward = { ore: 0, exp: 0, tickets: 0 };
export const addReward = (a: Reward, b: Reward): Reward => ({ ore: a.ore + b.ore, exp: a.exp + b.exp, tickets: a.tickets + b.tickets });
export function grant(save: SaveData, r: Reward): void { save.ore += r.ore; save.commanderExp += r.exp; save.tickets += r.tickets; }

/** 오늘 날짜(기기 시간대) */
export function todayStr(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const hash = (s: string): number => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

// ───────── 일일 임무 ─────────
export type MissionType = 'win' | 'deploy' | 'kills' | 'towers' | 'skill' | 'hero' | 'upgrade' | 'chest';
export interface MissionDef { type: MissionType; label: string; targets: number[] }
export const MISSIONS: MissionDef[] = [
  { type: 'win', label: '작전에서 승리하기', targets: [2, 3] },
  { type: 'deploy', label: '유닛 생산하기', targets: [15, 20, 30] },
  { type: 'kills', label: '적 유닛 처치하기', targets: [20, 30, 40] },
  { type: 'towers', label: '적 포탑 파괴하기', targets: [2, 3] },
  { type: 'skill', label: '스킬 사용하기', targets: [3, 4] },
  { type: 'hero', label: '영웅 출격시키기', targets: [1, 2] },
  { type: 'upgrade', label: '부품 강화하기', targets: [1] },
  { type: 'chest', label: '보급 상자 열기', targets: [1, 2] },
];
/** 칸(0~2)마다 보상이 정해져 있다: 셋째 칸이 가장 크고 보급권이 붙는다 */
export const MISSION_REWARDS: Reward[] = [
  { ore: 150, exp: 40, tickets: 0 },
  { ore: 200, exp: 50, tickets: 0 },
  { ore: 250, exp: 70, tickets: 1 },
];
export const defOf = (t: MissionType): MissionDef => MISSIONS.find(m => m.type === t)!;
export interface Mission { type: MissionType; target: number; progress: number; claimed: boolean }
export interface DailyState { date: string; missions: Mission[]; refreshed: boolean }

const pickTarget = (t: MissionType, rnd: () => number): number => { const d = defOf(t).targets; return d[Math.floor(rnd() * d.length)]; };

/** 날짜가 바뀌었으면 오늘 임무 3개를 새로 뽑는다(같은 날이면 그대로). 같은 날짜는 항상 같은 임무가 나온다. */
export function ensureDaily(save: SaveData, today: string): SaveData {
  if (save.daily.date === today && save.daily.missions.length === 3) return save;
  const next: SaveData = JSON.parse(JSON.stringify(save));
  const rnd = mulberry32(hash(today));
  const pool = MISSIONS.map(m => m.type); const picked: MissionType[] = [];
  while (picked.length < 3) { const i = Math.floor(rnd() * pool.length); picked.push(pool.splice(i, 1)[0]); }
  next.daily = { date: today, refreshed: false, missions: picked.map(t => ({ type: t, target: pickTarget(t, rnd), progress: 0, claimed: false })) };
  return next;
}

/** 진행도 더하기 (target 을 넘지 않는다). 임무가 없는 종류면 아무 일도 없다. */
export function addProgress(save: SaveData, type: MissionType, n = 1): void {
  if (!(n > 0)) return;
  for (const m of save.daily.missions) if (m.type === type && !m.claimed) m.progress = Math.min(m.target, m.progress + Math.floor(n));
}
export const missionDone = (m: Mission): boolean => m.progress >= m.target;

export function claimMission(save: SaveData, idx: number): { save: SaveData; reward: Reward } | null {
  const m = save.daily.missions[idx];
  if (!m || m.claimed || !missionDone(m)) return null;
  const next: SaveData = JSON.parse(JSON.stringify(save));
  next.daily.missions[idx].claimed = true;
  const reward = MISSION_REWARDS[idx] ?? MISSION_REWARDS[0];
  grant(next, reward);
  return { save: next, reward };
}

/** 임무 하나를 다른 종류로 바꾼다 (하루 1번, 광고 A6). 이미 받은 임무·같은 날 두 번째는 못 바꾼다. */
export function refreshMission(save: SaveData, idx: number, rnd: () => number = Math.random): SaveData | null {
  const m = save.daily.missions[idx];
  if (!m || m.claimed || save.daily.refreshed) return null;
  const have = new Set(save.daily.missions.map(x => x.type));
  const options = MISSIONS.map(d => d.type).filter(t => !have.has(t));
  const type = options[Math.floor(rnd() * options.length)];
  const next: SaveData = JSON.parse(JSON.stringify(save));
  next.daily.missions[idx] = { type, target: pickTarget(type, rnd), progress: 0, claimed: false };
  next.daily.refreshed = true;
  return next;
}

// ───────── 출석 28일 ─────────
export const ATTEND_DAYS = 28;
export interface AttendReward extends Reward { copies?: { part: string; n: number } }
/** 28일 보상표. 7·14·21일은 에픽 부품 조각, 28일은 큰 상자 */
export function attendReward(day: number): AttendReward {
  const d = ((day - 1) % ATTEND_DAYS) + 1;
  const epics = partsOf('epic');
  const base: Reward = { ore: 100 + d * 10, exp: 20, tickets: [3, 6, 10, 13, 17, 20, 24].includes(d) ? 1 : 0 };
  if (d === 28) return { ore: 1000, exp: 200, tickets: 3, copies: { part: epics[epics.length - 1].id, n: 5 } };
  if (d === 7 || d === 14 || d === 21) return { ...base, ore: base.ore + 200, tickets: 2, copies: { part: epics[(d / 7 - 1) % epics.length].id, n: 3 } };
  return base;
}
export interface AttendState { claimed: number; lastDate: string }
export const attendDay = (save: SaveData): number => (save.attend.claimed % ATTEND_DAYS) + 1;
export const canAttend = (save: SaveData, today: string): boolean => save.attend.lastDate !== today;
export function claimAttend(save: SaveData, today: string): { save: SaveData; reward: AttendReward; day: number } | null {
  if (!canAttend(save, today)) return null;
  const day = attendDay(save), reward = attendReward(day);
  const next: SaveData = JSON.parse(JSON.stringify(save));
  grant(next, reward);
  if (reward.copies) next.copies[reward.copies.part] = (next.copies[reward.copies.part] ?? 0) + reward.copies.n;
  next.attend = { claimed: save.attend.claimed + 1, lastDate: today };
  return { save: next, reward, day };
}

// ───────── 보상형 광고 8곳 ─────────
export type AdSlot = 'result_double' | 'loss_ore' | 'free_chest' | 'chest_extra' | 'survival_continue' | 'mission_refresh' | 'salvage_full' | 'boss_extra';
export const AD_DAILY_CAP = 15;
export const AD_SLOTS: Record<AdSlot, { no: string; label: string; cap: number }> = {
  result_double: { no: 'A1', label: '보상 2배', cap: 5 },
  loss_ore: { no: 'A2', label: '광석 회수', cap: 3 },
  free_chest: { no: 'A3', label: '무료 상자 바로 열기', cap: 2 },
  chest_extra: { no: 'A4', label: '상자 한 칸 더', cap: 2 },
  survival_continue: { no: 'A5', label: '이어하기', cap: 2 },
  mission_refresh: { no: 'A6', label: '임무 새로 고침', cap: 1 },
  salvage_full: { no: 'A7', label: '분해 100% 환급', cap: 1 },
  boss_extra: { no: 'A8', label: '보스 보상 한 번 더', cap: 1 },
};
export interface AdState { date: string; used: number; bySlot: Partial<Record<AdSlot, number>> }

/** 오늘 기준 광고 사용량(날짜가 다르면 0) */
export function adUsage(save: SaveData, today: string): { used: number; by: Partial<Record<AdSlot, number>> } {
  return save.ads.date === today ? { used: save.ads.used, by: save.ads.bySlot } : { used: 0, by: {} };
}
export function adsLeft(save: SaveData, today: string, slot?: AdSlot): number {
  const u = adUsage(save, today), total = AD_DAILY_CAP - u.used;
  return slot ? Math.max(0, Math.min(total, AD_SLOTS[slot].cap - (u.by[slot] ?? 0))) : Math.max(0, total);
}
export const canWatchAd = (save: SaveData, today: string, slot: AdSlot): boolean => adsLeft(save, today, slot) > 0;
/** 광고(또는 광고 제거 보유자의 「바로 받기」)를 한 번 쓴 것으로 센다 */
export function recordAd(save: SaveData, today: string, slot: AdSlot): void {
  const u = adUsage(save, today);
  save.ads = { date: today, used: u.used + 1, bySlot: { ...u.by, [slot]: (u.by[slot] ?? 0) + 1 } };
}

/** 결과 화면 2배(A1): 방금 받은 보상을 한 번 더 준다 */
export const doubleReward = (r: Reward): Reward => ({ ore: r.ore, exp: r.exp, tickets: r.tickets });
/** 패배 후 광석 회수(A2): 이번 판에 쓴 와트의 30% 를 광석으로(와트 1 = 광석 10 기준, 최대 400) */
export const lossOre = (wattSpent: number): number => Math.min(400, Math.round(wattSpent * 0.3 * 10));

// ───────── 분해 (조각 → 광석) ─────────
export const SALVAGE_ORE = { common: 30, rare: 60, epic: 120 } as const;
export const SALVAGE_RATIO = 0.7;
/** 같은 부품 조각을 전부 광석으로. full=true(광고 A7)면 100%, 아니면 70% */
export function salvageCopies(save: SaveData, partId: string, full: boolean): { save: SaveData; ore: number } | null {
  const n = save.copies[partId] ?? 0;
  if (n <= 0 || !PARTS.some(p => p.id === partId)) return null;
  const ore = Math.floor(n * SALVAGE_ORE[rarityOf(partId)] * (full ? 1 : SALVAGE_RATIO));
  const next: SaveData = JSON.parse(JSON.stringify(save));
  next.copies[partId] = 0; delete next.copies[partId]; next.ore += ore;
  return { save: next, ore };
}
