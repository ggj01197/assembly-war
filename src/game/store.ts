import { createStore } from 'zustand/vanilla';
import { PARTS } from '../data/parts';
import { defaultSave, repairSave, isSane, type SaveData } from '../domain/save';
import type { Build } from '../domain/assemble';
import { getItem, setItem } from '../native/storage';

/** 세이브 하나를 가진 스토어 (TD-005). 화면은 구독해서 다시 그리고, 저장은 변경 뒤 0.6초 묶어서 한다 (TD-006). */
const KEY = 'assemblywar.save';
const ALL_IDS = PARTS.map(p => p.id);

export interface GameState {
  save: SaveData;
  ready: boolean;
}

export const store = createStore<GameState>(() => ({ save: defaultSave(ALL_IDS), ready: false }));

let timer: ReturnType<typeof setTimeout> | null = null;

export async function flushSave(): Promise<void> {
  if (timer) { clearTimeout(timer); timer = null; }
  const { save, ready } = store.getState();
  if (!ready || !isSane(save)) return; // 망가진 상태는 디스크에 쓰지 않는다
  await setItem(KEY, JSON.stringify(save));
}

function scheduleSave() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { void flushSave(); }, 600);
}

export async function boot(): Promise<void> {
  const raw = await getItem(KEY);
  let parsed: unknown = null;
  if (raw) {
    try { parsed = JSON.parse(raw); } catch {
      // 읽지 못한 세이브는 새 게임이 덮어쓰기 전에 따로 보관한다
      await setItem(KEY + '.corrupt', raw);
    }
  }
  store.setState({ save: repairSave(parsed, ALL_IDS), ready: true });
  window.addEventListener('pagehide', () => { void flushSave(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) void flushSave(); });
}

export function update(fn: (s: SaveData) => void): void {
  const next: SaveData = JSON.parse(JSON.stringify(store.getState().save));
  fn(next);
  store.setState({ save: next });
  scheduleSave();
}

export function setSlot(i: number, b: Build): void {
  update(s => { s.deck[i] = { ...b }; s.flags.assembled = true; });
}
