import { store, update, flushSave } from '../game/store';
import { adsSupported, showRewardedAd } from '../native/ads';
import { AD_SLOTS, adsLeft, canWatchAd, recordAd, todayStr, ensureDaily, type AdSlot } from '../domain/daily';
import type { SaveData } from '../domain/save';

/**
 * 보상형 광고 8곳을 부르는 한 곳. 규칙(MONETIZATION_DESIGN.md §2):
 *  · 사용자가 「광고 보고 …」 를 눌렀을 때만, 한 번에 하나(연타·겹침 차단), 지급은 광고를 끝까지 본 뒤에만
 *  · 하루 15회·자리별 상한 · 광고 제거 보유자는 광고 없이 「바로 받기」(같은 상한은 그대로)
 *  · 전투 중·조립 중에는 이 함수를 부르는 단추가 없다(결과·격납고·상자·임무 화면만)
 */
let busy = false;
export const isBusy = (): boolean => busy;

export interface WatchResult { ok: boolean; msg: string }

export async function watchForSlot(slot: AdSlot, grantFn: (sv: SaveData) => void): Promise<WatchResult> {
  if (busy) return { ok: false, msg: '광고를 불러오는 중이에요.' };
  const today = todayStr();
  if (!canWatchAd(store.getState().save, today, slot)) return { ok: false, msg: '오늘은 더 이상 쓸 수 없어요.' };
  busy = true;
  try {
    if (!store.getState().save.noAds) {
      const r = await showRewardedAd();
      if (r === 'closed') return { ok: false, msg: '광고를 끝까지 보면 받을 수 있어요.' };
      if (r === 'unavailable') return { ok: false, msg: '지금은 보여 줄 광고가 없어요. 잠시 뒤에 다시 해 보세요.' };
    }
    // 광고를 보는 사이 상태가 바뀌었을 수 있으니 한도를 한 번 더 확인하고 같은 갱신 안에서 센다 (중복 지급 차단)
    if (!canWatchAd(store.getState().save, today, slot)) return { ok: false, msg: '오늘은 더 이상 쓸 수 없어요.' };
    update(sv => { recordAd(sv, today, slot); grantFn(sv); });
    void flushSave();
    return { ok: true, msg: '' };
  } finally { busy = false; }
}

/** 단추를 보여 줄지 (광고 지원 + 오늘 남은 횟수) */
export function adAvailable(slot: AdSlot): boolean { return adsSupported() && canWatchAd(store.getState().save, todayStr(), slot); }

/** 단추 문구: 「광고 보고 …」(광고 제거 보유자는 「바로 받기: …」) + 남은 횟수 */
export function adLabel(what: string, slot: AdSlot): string {
  const s = store.getState().save, left = adsLeft(s, todayStr(), slot);
  return `${s.noAds ? '바로 받기' : '광고 보고'} ${what} <small>(오늘 ${left}회)</small>`;
}
export const adSlotNo = (slot: AdSlot): string => AD_SLOTS[slot].no;

/** 오늘 임무가 없으면 뽑아 두고, fn 으로 진행도 등을 고친다 */
export function touchDaily(fn: (sv: SaveData) => void): void {
  update(sv => { const n = ensureDaily(sv, todayStr()); if (n !== sv) Object.assign(sv, n); fn(sv); });
}
