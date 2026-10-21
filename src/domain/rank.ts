import type { SaveData } from './save';
import type { Stage } from '../data/stages';
import { PARTS } from '../data/parts';
import { allValidBuilds, assemble, type Build } from './assemble';
import { HEROES, SKILLS } from './loadout';
import { mulberry32 } from './rng';

/**
 * 비동기 랭크전 (GAME_DEPTH_PLAN 8단계) — 서버 없는 V1: 상대는 시드로 만든 「AI 지휘관」(이름·품계·설계도 6장·스킬·영웅)이고, 화면에도 AI 지휘관으로 표기한다.
 * 품계 6단계(훈련병→사령관), 품계 점수(RP). 이기면 오르고 지면 내리되 한 번 오른 품계 아래로는 내려가지 않는다(주간 시즌 정리 때만 70% 로 줄어든다).
 * 서버가 열리면 `opponentFor` 만 실제 설계도 업로드로 바꿔 꽂으면 된다.
 */
export interface Tier { name: string; min: number; level: number; icon: string }
export const TIERS: Tier[] = [
  { name: '훈련병', min: 0, level: 2, icon: '🔰' },
  { name: '하사', min: 100, level: 4, icon: '🥉' },
  { name: '중위', min: 250, level: 6, icon: '🥈' },
  { name: '대위', min: 450, level: 8, icon: '🥇' },
  { name: '소령', min: 700, level: 11, icon: '🏅' },
  { name: '사령관', min: 1000, level: 14, icon: '👑' },
];
export const tierOf = (rp: number): number => { let t = 0; TIERS.forEach((x, i) => { if (rp >= x.min) t = i; }); return t; };
/** 다음 품계까지 남은 점수 (최고 품계면 null) */
export const toNext = (rp: number): number | null => { const t = tierOf(rp); return t >= TIERS.length - 1 ? null : TIERS[t + 1].min - rp; };

export interface RankState { rp: number; best: number; week: string; seed: number; wins: number; plays: number; pending: { ore: number; tickets: number } | null }
export const defaultRank = (): RankState => ({ rp: 0, best: 0, week: '', seed: 1, wins: 0, plays: 0, pending: null });

const NAMES = ['강철', '번개', '그림자', '폭풍', '불꽃', '서리', '독수리', '늑대', '호랑이', '바람', '여우', '거북', '철벽', '유성', '파도', '화살', '송곳', '방패', '천둥', '새벽', '황혼', '은하', '암초', '태풍'];
const POSTS = ['지휘관', '대령', '교관', '정찰대장', '포대장', '기동대장'];

let VALID: Build[] | null = null;
const valid = (): Build[] => (VALID ??= allValidBuilds(PARTS));

export interface Opponent { name: string; tier: number; builds: Build[]; level: number; skills: string[]; hero: string | null }

/** 같은 (품계, 시드)면 항상 같은 상대. 설계도 6장에는 대공이 되는 카드가 1장 이상, 같은 무기 계열은 2장까지 */
export function opponentFor(tier: number, seed: number): Opponent {
  const t = Math.max(0, Math.min(TIERS.length - 1, Math.floor(tier)));
  const rng = mulberry32((seed * 2654435761 + t * 40503) >>> 0);
  const pool = valid().filter(b => { const w = assemble(b, PARTS).watt; return t >= 3 ? w >= 4 : t >= 1 ? w >= 3 : w <= 5; });
  const info = (b: Build) => { const w = PARTS.find(p => p.id === b.weapon)!; return { fam: (w as { family: string }).family, air: (w as { target: string }).target !== 'ground' }; };
  const builds: Build[] = [], fams: Record<string, number> = {};
  let guard = 0;
  while (builds.length < 6 && guard++ < 400) {
    const b = pool[Math.floor(rng() * pool.length)], i = info(b);
    if ((fams[i.fam] ?? 0) >= 2 || builds.some(x => x.legs === b.legs && x.body === b.body && x.weapon === b.weapon)) continue;
    if (builds.length === 5 && !builds.some(x => info(x).air) && !i.air) continue;
    builds.push(b); fams[i.fam] = (fams[i.fam] ?? 0) + 1;
  }
  const sk = SKILLS.map(s => s.id); const skills: string[] = [];
  while (skills.length < 2) { const id = sk[Math.floor(rng() * sk.length)]; if (!skills.includes(id)) skills.push(id); }
  return {
    name: `${NAMES[Math.floor(rng() * NAMES.length)]} ${POSTS[Math.floor(rng() * POSTS.length)]}`, tier: t, builds, level: TIERS[t].level, skills,
    hero: t >= 1 ? HEROES[Math.floor(rng() * HEROES.length)].id : null,
  };
}

/** 이번 상대의 품계: 내 품계 −1·같음·같음·+1 (시드로 정해짐) */
export const opponentTier = (myTier: number, seed: number): number => Math.max(0, Math.min(TIERS.length - 1, myTier + [-1, 0, 0, 1][Math.abs(seed) % 4]));

export function rankStage(tier: number, seed: number): Stage {
  const o = opponentFor(tier, seed);
  return {
    id: `rank-${o.tier}-${seed}`, no: 0, chapter: 3, name: `랭크전 · AI ${o.name}`, hint: `${TIERS[o.tier].icon} ${TIERS[o.tier].name} 품계의 AI 지휘관입니다. 이기면 품계 점수가 오릅니다.`,
    enemy: o.builds, enemyLevel: o.level, enemyWattMult: o.tier >= 5 ? 1.2 : o.tier >= 4 ? 1.1 : 1.0, rewardOre: 100 + 40 * o.tier, rewardExp: 40 + 10 * o.tier,
    enemySkills: o.skills, enemyHero: o.hero ?? undefined, rank: { tier: o.tier, seed, name: o.name },
  };
}

const hash = (a: number, b: number): number => { let h = 2166136261 ^ a; h = Math.imul(h ^ b, 16777619); h ^= h >>> 13; return (h >>> 0) % 1000000 + 1; };

/** 새 주가 되면 지난 시즌 보상을 보류 칸에 넣고 점수를 70% 로 줄인다 */
export function ensureSeason(save: SaveData, week: string): void {
  const r = save.rank;
  if (r.week === week) return;
  if (r.week) {
    const t = tierOf(r.rp);
    if (t >= 1) r.pending = { ore: (r.pending?.ore ?? 0) + t * 300, tickets: (r.pending?.tickets ?? 0) + (t >= 5 ? 2 : t >= 3 ? 1 : 0) };
    r.rp = Math.round(r.rp * 0.7); r.wins = 0; r.plays = 0;
  }
  r.week = week;
}
export function claimSeason(save: SaveData): { save: SaveData; reward: { ore: number; tickets: number } } | null {
  if (!save.rank.pending) return null;
  const next: SaveData = JSON.parse(JSON.stringify(save)), p = next.rank.pending!;
  next.ore += p.ore; next.tickets += p.tickets; next.rank.pending = null;
  return { save: next, reward: p };
}

export interface RankResult { save: SaveData; rewards: { ore: number; exp: number; tickets: number; firstClear: boolean }; delta: number; promoted: boolean; note: string }
/** 랭크전 정산 (한 판에 한 번) */
export function settleRank(save: SaveData, stage: { rank?: { tier: number }; rewardOre: number; rewardExp: number }, win: boolean, week: string): RankResult {
  const next: SaveData = JSON.parse(JSON.stringify(save)), r = next.rank;
  ensureSeason(next, week);
  const myT = tierOf(r.rp), oppT = stage.rank?.tier ?? myT, gap = oppT - myT;
  const before = r.rp;
  let delta: number;
  if (win) delta = Math.max(12, Math.min(45, 25 + 6 * gap)); else delta = -Math.max(6, Math.min(28, 18 - 5 * gap));
  r.rp = Math.max(win ? 0 : TIERS[myT].min, before + delta);   // 한 번 오른 품계 아래로는 내려가지 않는다
  delta = r.rp - before;
  r.plays += 1; if (win) { r.wins += 1; next.winCount = (next.winCount ?? 0) + 1; next.flags.firstWin = true; }
  const nowT = tierOf(r.rp), promoted = nowT > r.best;
  let tickets = 0;
  if (promoted) { tickets = nowT; r.best = nowT; }
  r.seed = hash(r.seed, r.plays * 31 + r.rp);
  const rewards = win ? { ore: stage.rewardOre, exp: stage.rewardExp, tickets, firstClear: promoted } : { ore: 20, exp: 10, tickets, firstClear: promoted };
  next.ore += rewards.ore; next.commanderExp += rewards.exp; next.tickets += rewards.tickets;
  const note = `품계 점수 ${delta >= 0 ? '+' : ''}${delta} → ${TIERS[nowT].name} ${r.rp}점${promoted ? ' · 승급!' : ''}`;
  return { save: next, rewards, delta, promoted, note };
}

/** 에디터·테스트용: 상대 덱이 모두 조립 가능한지 */
export const opponentValid = (o: Opponent): boolean => o.builds.length === 6 && o.builds.every(b => assemble(b, PARTS).ok);
