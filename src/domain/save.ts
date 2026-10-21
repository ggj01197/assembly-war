import type { Build } from './assemble';
import { defaultLoadout, repairLoadout, type Loadout } from './loadout';
import type { DailyState, AttendState, AdState, MissionType, AdSlot } from './daily';
import { defaultGoals, WEEKLY, ACHIEVEMENTS, type GoalsState } from './goals';
import { defaultRank, type RankState } from './rank';
import { defaultSeason, type SeasonState } from './season';

/**
 * 세이브 (TD-006): 버전 필드 + 읽을 때마다 고치기(repair). 읽지 못한 세이브는 새 게임이 덮어쓰기 전에 호출 쪽이 격리한다.
 * Phaser·네이티브 무의존 순수 함수 — Vitest 로 검증.
 */
export const SAVE_VERSION = 1;
export const DECK_SIZE = 6;

export interface SaveData {
  version: number;
  ore: number;
  tickets: number;
  commanderExp: number;
  /** 설계도 6장 */
  deck: Build[];
  /** 부품 id → 강화 레벨 (보유 = 키가 있음) */
  partLevels: Record<string, number>;
  /** 스테이지 id → 최고 기록 */
  stages: Record<string, { clears: number; bestBaseHp: number }>;
  flags: { assembled: boolean; firstWin: boolean };
  settings: { sound: boolean; reducedMotion: boolean };
  /** 출격 장비: 스킬 2칸 + 영웅 1명 (5-C) */
  loadout: Loadout;
  /** 5분 버티기 최고 기록(초) */
  survivalBest: number;
  /** 부품 조각(강화 재료): 부품 id → 개수 */
  copies: Record<string, number>;
  /** 보급: 연 상자 수 · 에픽 없이 연 상자 수(천장) · 다음 무료 상자 시각(ms) */
  supply: { opened: number; pity: number; freeAt: number };
  /** 누적 승리 수 (3승마다 보급권 1) */
  winCount: number;
  /** 일일 임무(오늘 3개) · 출석 28일 · 오늘 본 광고 · 광고 제거 보유(상품 구매 뒤 켜짐) */
  daily: DailyState;
  attend: AttendState;
  ads: AdState;
  noAds: boolean;
  /** 도전 모드(요일 작전·무한의 탑·보스 러시) 기록: 오늘 보상 받은 횟수·최고 층·이번 주 러시 */
  modes: ModesState;
  /** 주간 과제 진행·업적 받은 기록 */
  goals: GoalsState;
  /** 랭크전 품계 점수·시즌 */
  rank: RankState;
  /** 시즌 이벤트 포인트·받은 단계 · 쓴 쿠폰(해시) */
  season: SeasonState;
  coupons: string[];
}

export interface ModesState { opsDate: string; opsDone: number; towerBest: number; rushWeek: string; rushDone: boolean; rushBest: number }
export const defaultModes = (): ModesState => ({ opsDate: '', opsDone: 0, towerBest: 0, rushWeek: '', rushDone: false, rushBest: 0 });

export const STARTER_DECK: Build[] = [
  { legs: 'legs_biped_light', body: 'body_arm_scout', weapon: 'wpn_arm_gatling' },
  { legs: 'legs_track_heavy', body: 'body_arm_scout', weapon: 'wpn_arm_gatling' },
  { legs: 'legs_track_heavy', body: 'body_turret_bunker', weapon: 'wpn_turret_cannon' },
  { legs: 'legs_track_heavy', body: 'body_shoulder_guard', weapon: 'wpn_shoulder_missile' },
  { legs: 'legs_hover', body: 'body_arm_scout', weapon: 'wpn_arm_gatling' },
  { legs: 'legs_hover', body: 'body_shoulder_guard', weapon: 'wpn_shoulder_missile' },
];

export function defaultSave(allPartIds: string[]): SaveData {
  const partLevels: Record<string, number> = {};
  for (const id of allPartIds) partLevels[id] = 1;
  return {
    version: SAVE_VERSION, ore: 300, tickets: 0, commanderExp: 0,
    deck: STARTER_DECK.map(b => ({ ...b })),
    partLevels, stages: {},
    flags: { assembled: false, firstWin: false },
    settings: { sound: true, reducedMotion: false },
    loadout: defaultLoadout(), survivalBest: 0,
    copies: {}, supply: { opened: 0, pity: 0, freeAt: 0 }, winCount: 0,
    daily: { date: '', missions: [], refreshed: false }, attend: { claimed: 0, lastDate: '' }, ads: { date: '', used: 0, bySlot: {} }, noAds: false, modes: defaultModes(), goals: defaultGoals(), rank: defaultRank(), season: defaultSeason(), coupons: [],
  };
}

const num = (v: unknown, d: number, min = 0, max = 1e9): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d;

/** 어떤 값이 와도 쓸 수 있는 세이브로 만든다 (NaN·음수·옛 버전·빠진 칸). 앞으로 버전이 오르면 여기서 이전 형식을 옮긴다. */
export function repairSave(raw: unknown, allPartIds: string[]): SaveData {
  const base = defaultSave(allPartIds);
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<SaveData>;
  const out: SaveData = {
    ...base,
    ore: Math.floor(num(r.ore, base.ore)),
    tickets: Math.floor(num(r.tickets, base.tickets)),
    commanderExp: Math.floor(num(r.commanderExp, 0)),
  };
  if (Array.isArray(r.deck)) {
    out.deck = Array.from({ length: DECK_SIZE }, (_, i) => {
      const b = r.deck![i] as Partial<Build> | undefined;
      const fb = base.deck[i];
      if (!b || typeof b.legs !== 'string' || typeof b.body !== 'string' || typeof b.weapon !== 'string') return fb;
      const ok = [b.legs, b.body, b.weapon].every(id => allPartIds.includes(id));
      if (!ok) return fb;
      const acc = typeof b.accessory === 'string' && allPartIds.includes(b.accessory) ? b.accessory : undefined;
      return acc ? { legs: b.legs, body: b.body, weapon: b.weapon, accessory: acc } : { legs: b.legs, body: b.body, weapon: b.weapon };
    });
  }
  if (r.partLevels && typeof r.partLevels === 'object') {
    for (const id of allPartIds) {
      const v = (r.partLevels as Record<string, unknown>)[id];
      if (typeof v === 'number' && Number.isFinite(v)) out.partLevels[id] = Math.min(10, Math.max(1, Math.floor(v)));
    }
  }
  if (r.stages && typeof r.stages === 'object') {
    for (const [k, v] of Object.entries(r.stages)) {
      if (v && typeof v === 'object') out.stages[k] = { clears: Math.floor(num((v as { clears?: unknown }).clears, 0)), bestBaseHp: Math.floor(num((v as { bestBaseHp?: unknown }).bestBaseHp, 0)) };
    }
  }
  if (r.flags && typeof r.flags === 'object') {
    out.flags = { assembled: !!(r.flags as { assembled?: unknown }).assembled, firstWin: !!(r.flags as { firstWin?: unknown }).firstWin };
  }
  if (r.settings && typeof r.settings === 'object') {
    out.settings = { sound: (r.settings as { sound?: unknown }).sound !== false, reducedMotion: !!(r.settings as { reducedMotion?: unknown }).reducedMotion };
  }
  out.loadout = repairLoadout((r as { loadout?: unknown }).loadout, commanderLevel(out.commanderExp).level);
  out.survivalBest = Math.floor(num((r as { survivalBest?: unknown }).survivalBest, 0, 0, 300));
  if (r.copies && typeof r.copies === 'object') {
    for (const id of allPartIds) { const v = (r.copies as Record<string, unknown>)[id]; if (typeof v === 'number' && Number.isFinite(v) && v > 0) out.copies[id] = Math.min(9999, Math.floor(v)); }
  }
  if (r.supply && typeof r.supply === 'object') {
    const sp = r.supply as Partial<SaveData['supply']>;
    out.supply = { opened: Math.floor(num(sp.opened, 0)), pity: Math.floor(num(sp.pity, 0, 0, 99)), freeAt: num(sp.freeAt, 0, 0, 1e15) };
  }
  out.winCount = Math.floor(num((r as { winCount?: unknown }).winCount, 0));
  const MT: MissionType[] = ['win', 'deploy', 'kills', 'towers', 'skill', 'hero', 'upgrade', 'chest'];
  const AS: AdSlot[] = ['result_double', 'loss_ore', 'free_chest', 'chest_extra', 'survival_continue', 'mission_refresh', 'salvage_full', 'boss_extra'];
  if (r.daily && typeof r.daily === 'object') {
    const d = r.daily as Partial<DailyState>;
    const ms = Array.isArray(d.missions) ? d.missions.filter(m => m && MT.includes((m as { type: MissionType }).type)).slice(0, 3).map(m => {
      const x = m as { type: MissionType; target?: unknown; progress?: unknown; claimed?: unknown };
      const target = Math.max(1, Math.floor(num(x.target, 1, 1, 99)));
      return { type: x.type, target, progress: Math.min(target, Math.floor(num(x.progress, 0, 0, 999))), claimed: !!x.claimed };
    }) : [];
    out.daily = { date: typeof d.date === 'string' ? d.date : '', missions: ms.length === 3 ? ms : [], refreshed: !!d.refreshed };
  }
  if (r.attend && typeof r.attend === 'object') {
    const a = r.attend as Partial<AttendState>;
    out.attend = { claimed: Math.floor(num(a.claimed, 0, 0, 9999)), lastDate: typeof a.lastDate === 'string' ? a.lastDate : '' };
  }
  if (r.ads && typeof r.ads === 'object') {
    const a = r.ads as Partial<AdState>, by: Partial<Record<AdSlot, number>> = {};
    for (const k of AS) { const v = (a.bySlot as Record<string, unknown> | undefined)?.[k]; if (typeof v === 'number' && Number.isFinite(v) && v > 0) by[k] = Math.min(99, Math.floor(v)); }
    out.ads = { date: typeof a.date === 'string' ? a.date : '', used: Math.floor(num(a.used, 0, 0, 99)), bySlot: by };
  }
  out.noAds = !!(r as { noAds?: unknown }).noAds;
  if (r.modes && typeof r.modes === 'object') {
    const m = r.modes as Partial<ModesState>;
    out.modes = { opsDate: typeof m.opsDate === 'string' ? m.opsDate : '', opsDone: Math.floor(num(m.opsDone, 0, 0, 99)), towerBest: Math.floor(num(m.towerBest, 0, 0, 999)), rushWeek: typeof m.rushWeek === 'string' ? m.rushWeek : '', rushDone: !!m.rushDone, rushBest: Math.floor(num(m.rushBest, 0, 0, 3)) };
  }
  if (r.goals && typeof r.goals === 'object') {
    const g = r.goals as Partial<GoalsState>, prog: GoalsState['prog'] = {};
    for (const w of WEEKLY) { const v = (g.prog as Record<string, unknown> | undefined)?.[w.type]; if (typeof v === 'number' && Number.isFinite(v) && v > 0) prog[w.type] = Math.min(w.target, Math.floor(v)); }
    const types = WEEKLY.map(w => w.type);
    out.goals = {
      week: typeof g.week === 'string' ? g.week : '', prog,
      claimed: Array.isArray(g.claimed) ? types.filter(t => (g.claimed as unknown[]).includes(t)) : [],
      bonus: !!g.bonus,
      ach: Array.isArray(g.ach) ? ACHIEVEMENTS.map(a => a.id).filter(id => (g.ach as unknown[]).includes(id)) : [],
    };
  }
  if (r.rank && typeof r.rank === 'object') {
    const k = r.rank as Partial<RankState>, p = k.pending as { ore?: unknown; tickets?: unknown } | null | undefined;
    out.rank = {
      rp: Math.floor(num(k.rp, 0, 0, 99999)), best: Math.floor(num(k.best, 0, 0, 5)), week: typeof k.week === 'string' ? k.week : '',
      seed: Math.floor(num(k.seed, 1, 1, 1e9)), wins: Math.floor(num(k.wins, 0, 0, 99999)), plays: Math.floor(num(k.plays, 0, 0, 99999)),
      pending: p && typeof p === 'object' ? { ore: Math.floor(num(p.ore, 0, 0, 1e6)), tickets: Math.floor(num(p.tickets, 0, 0, 999)) } : null,
    };
  }
  if (r.season && typeof r.season === 'object') {
    const q = r.season as Partial<SeasonState>;
    out.season = {
      id: typeof q.id === 'string' ? q.id.slice(0, 20) : '', points: Math.floor(num(q.points, 0, 0, 99999)),
      claimed: Array.isArray(q.claimed) ? [...new Set((q.claimed as unknown[]).filter((x): x is number => typeof x === 'number' && Number.isInteger(x) && x >= 0 && x < 20))] : [],
      ptsDate: typeof q.ptsDate === 'string' ? q.ptsDate : '', ptsToday: Math.floor(num(q.ptsToday, 0, 0, 9999)), evDate: typeof q.evDate === 'string' ? q.evDate : '', evDone: Math.floor(num(q.evDone, 0, 0, 99)),
    };
  }
  if (Array.isArray((r as { coupons?: unknown }).coupons)) out.coupons = ((r as { coupons: unknown[] }).coupons).filter((x): x is string => typeof x === 'string' && /^[0-9a-f]{8}$/.test(x)).slice(-200);
  out.version = SAVE_VERSION;
  return out;
}

export function isSane(s: SaveData): boolean {
  return [s.ore, s.tickets, s.commanderExp].every(n => Number.isFinite(n) && n >= 0) && s.deck.length === DECK_SIZE;
}

/** 사령관 레벨: 필요 경험치는 레벨 × 100 (Lv1→2 = 100) */
export function commanderLevel(exp: number): { level: number; into: number; need: number } {
  let level = 1, left = Math.max(0, exp);
  while (left >= level * 100 && level < 30) { left -= level * 100; level++; }
  return { level, into: left, need: level * 100 };
}
