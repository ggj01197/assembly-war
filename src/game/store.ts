import { createStore } from 'zustand/vanilla';
import { PARTS } from '../data/parts';
import { defaultSave, repairSave, isSane, type SaveData } from '../domain/save';
import type { Build } from '../domain/assemble';
import { getItemStrict, setItem } from '../native/storage';
import { setClockFloor, persistClock } from '../domain/daily';

/** 세이브 하나를 가진 스토어 (TD-005). 화면은 구독해서 다시 그리고, 저장은 변경 뒤 0.6초 묶어서 한다 (TD-006). */
const KEY = 'assemblywar.save';
const ALL_IDS = PARTS.map(p => p.id);

export interface GameState {
  save: SaveData;
  ready: boolean;
}

export const store = createStore<GameState>(() => ({ save: defaultSave(ALL_IDS), ready: false }));

let timer: ReturnType<typeof setTimeout> | null = null;
/** 세이브를 읽지 못한 채(저장소 오류) 시작했으면 true — 이때는 진짜 세이브를 덮어쓰지 않도록 디스크에 쓰지 않는다 */
let readFailed = false;

export async function flushSave(): Promise<void> {
  if (timer) { clearTimeout(timer); timer = null; }
  const { save, ready } = store.getState();
  if (!ready || readFailed || !isSane(save)) return; // 망가진 상태·읽기 실패 상태는 디스크에 쓰지 않는다
  await setItem(KEY, JSON.stringify(save));
}

function scheduleSave() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { void flushSave(); }, 600);
}

export async function boot(): Promise<void> {
  let raw: string | null = null;
  for (let i = 0; i < 3; i++) {                       // 일시적 읽기 오류(잠금 상태 등)는 재시도
    try { raw = await getItemStrict(KEY); readFailed = false; break; } catch { readFailed = true; if (i < 2) await new Promise(r => setTimeout(r, 400)); }
  }
  let parsed: unknown = null;
  if (raw) {
    try { parsed = JSON.parse(raw); } catch {
      // 읽지 못한 세이브는 새 게임이 덮어쓰기 전에 따로 보관한다
      await setItem(KEY + '.corrupt.' + Date.now(), raw);
    }
  }
  const loaded = repairSave(parsed, ALL_IDS);
  setClockFloor(loaded.clockMax); persistClock(loaded);   // 시계 되돌리기 방지: 본 가장 늦은 날짜를 이어받는다
  store.setState({ save: loaded, ready: true });
  window.addEventListener('pagehide', () => { void flushSave(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) void flushSave(); });
}

export function update(fn: (s: SaveData) => void): void {
  const next: SaveData = JSON.parse(JSON.stringify(store.getState().save));
  fn(next);
  persistClock(next);
  store.setState({ save: next });
  scheduleSave();
}

export function setSlot(i: number, b: Build): void {
  update(s => { s.deck[i] = { ...b }; s.flags.assembled = true; });
}
