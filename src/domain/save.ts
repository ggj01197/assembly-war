import type { Build } from './assemble';
import { defaultLoadout, repairLoadout, type Loadout } from './loadout';

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
}

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
    loadout: defaultLoadout(),
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
