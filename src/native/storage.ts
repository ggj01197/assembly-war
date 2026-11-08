import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

/** 네이티브는 Preferences, 웹/점검은 localStorage. 둘 다 막혀도 앱은 돌아간다(저장만 안 됨). */
const native = () => { try { return Capacitor.isNativePlatform(); } catch { return false; } };

export async function getItem(key: string): Promise<string | null> {
  try {
    if (native()) return (await Preferences.get({ key })).value ?? null;
    return localStorage.getItem(key);
  } catch { return null; }
}

export async function setItem(key: string, value: string): Promise<void> {
  try {
    if (native()) { await Preferences.set({ key, value }); return; }
    localStorage.setItem(key, value);
  } catch { /* 저장소가 막혀도 게임은 계속 */ }
}

/** 읽기 실패를 「데이터 없음」과 구분하는 읽기 — 실패하면 던진다 (세이브 로드용: 읽기 실패 때 새 게임이 진짜 세이브를 덮어쓰지 않게) */
export async function getItemStrict(key: string): Promise<string | null> {
  if (native()) return (await Preferences.get({ key })).value ?? null;
  return localStorage.getItem(key);
}
