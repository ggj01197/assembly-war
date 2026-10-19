/**
 * 광고 설정 (스튜디오 광고 방침: 보상형만, 전면·강제 광고 없음, 개발 중에는 테스트 ID 만).
 * 출시 빌드에서 ADMOB_TEST_MODE=false 로 바꾸고 아래 실제 광고 단위 ID(AdMob 「조립전쟁」 iOS·Android 앱)를 넣는다 — 지금은 구글 공식 테스트 ID.
 * 앱 ID 는 ios/App/App/Info.plist(GADApplicationIdentifier)·android AndroidManifest(APPLICATION_ID) 에 같은 테스트 값이 들어 있다.
 */
export const ADS_ENABLED = true;
export const ADMOB_TEST_MODE = true;
export const REWARDED_UNIT_ID = {
  ios: 'ca-app-pub-3940256099942544/1712485313',      // 구글 테스트 보상형(iOS)
  android: 'ca-app-pub-3940256099942544/5224354917',  // 구글 테스트 보상형(Android)
};
