import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { AdMob, RewardAdPluginEvents } from '@capacitor-community/admob';
import { ADMOB_TEST_MODE, ADS_ENABLED, REWARDED_UNIT_ID } from '../config/ads';

/**
 * 보상형 광고 (그해 여름 `platform/ads.ts` 이식). 앱에서는 진짜(테스트) 광고, 웹 개발 중에는 흉내(보상 줌 · `?mockads=fail` 이면 광고 없음).
 * 광고는 사용자가 「광고 보고 …」 단추를 눌렀을 때만 띄운다. 배너·전면 광고는 없다. 전투 중·조립 중에는 이 함수를 부르는 단추 자체가 없다.
 */
export type AdResult = 'rewarded' | 'closed' | 'unavailable';
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
const isNative = (): boolean => { try { return Capacitor.isNativePlatform(); } catch { return false; } };
const mockParam = (): string | null => { try { return new URLSearchParams(location.search).get('mockads'); } catch { return null; } };
/** 웹에서는 개발 서버이거나 ?mockads= 가 있을 때만 흉내 광고를 허용한다(웹 배포본에 가짜 광고 단추가 뜨지 않게) */
const webMock = (): boolean => !!(import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV || mockParam() !== null;

/** 광고 단추를 보여 줘도 되는가 */
export function adsSupported(): boolean { return ADS_ENABLED && (isNative() || webMock()); }

let initP: Promise<void> | null = null;
let rewardedReady: Promise<boolean> | null = null;
let npa = true;
const isAndroid = () => Capacitor.getPlatform() === 'android';
const opts = () => ({ adId: isAndroid() ? REWARDED_UNIT_ID.android : REWARDED_UNIT_ID.ios, isTesting: ADMOB_TEST_MODE, npa });
const load = () => AdMob.prepareRewardVideoAd(opts()).then(() => true, () => false);

/** 앱이 앞에 올 때까지 기다린다 — 활성 상태가 아닐 때 보낸 ATT 요청은 iOS 가 팝업 없이 무시한다 */
async function whenActive(): Promise<void> {
  if ((await App.getState()).isActive) return;
  await new Promise<void>(resolve => {
    let handle: { remove: () => void } | null = null; let fired = false;
    void App.addListener('appStateChange', ({ isActive }) => { if (!isActive || fired) return; fired = true; handle?.remove(); resolve(); }).then(h => { handle = h; if (fired) h.remove(); });
  });
}
async function requestTracking(): Promise<string> {
  let status = 'notDetermined';
  for (let i = 0; i < 4; i++) {
    ({ status } = await AdMob.trackingAuthorizationStatus());
    if (status !== 'notDetermined') break;
    await whenActive(); await sleep(1000); await AdMob.requestTrackingAuthorization();
  }
  return status;
}

/** SDK 시작 + ATT 팝업(iOS). 앱을 켠 뒤 격납고가 뜨면 한 번 부른다 (Apple 2.1 반려 교훈) */
export function initAds(): Promise<void> {
  if (!adsSupported() || !isNative()) return Promise.resolve();
  return (initP ??= (async () => {
    try { npa = isAndroid() ? true : (await requestTracking()) !== 'authorized'; } catch { npa = true; }
    await AdMob.initialize({ initializeForTesting: ADMOB_TEST_MODE });
    rewardedReady = load();
  })().catch(() => { initP = null; }));
}

/** 지금 보여 줄 광고가 준비됐는가 (단추 문구용) */
export async function isRewardedReady(): Promise<boolean> {
  if (!adsSupported()) return false;
  if (!isNative()) return mockParam() !== 'fail';
  await initAds();
  return rewardedReady ? rewardedReady : false;
}

/** 끝까지 보면 'rewarded', 중간에 닫으면 'closed', 광고가 없거나 오류면 'unavailable' */
export async function showRewardedAd(): Promise<AdResult> {
  if (!adsSupported()) return 'unavailable';
  if (!isNative()) { await sleep(900); return mockParam() === 'fail' ? 'unavailable' : 'rewarded'; }
  await initAds();
  if (!rewardedReady || !(await rewardedReady)) { rewardedReady = load(); if (!(await rewardedReady)) return 'unavailable'; }
  let earned = false, failed = false; const handles: { remove: () => void }[] = [];
  let done: () => void = () => {}; const closed = new Promise<void>(r => (done = r));
  handles.push(await AdMob.addListener(RewardAdPluginEvents.Rewarded, () => (earned = true)));
  handles.push(await AdMob.addListener(RewardAdPluginEvents.Dismissed, () => done()));
  handles.push(await AdMob.addListener(RewardAdPluginEvents.FailedToShow, () => { failed = true; done(); }));
  try { await AdMob.showRewardVideoAd(); await Promise.race([closed, sleep(90_000)]); } catch { failed = true; }
  handles.forEach(h => h.remove()); rewardedReady = load();
  return earned ? 'rewarded' : failed ? 'unavailable' : 'closed';
}
