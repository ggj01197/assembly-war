/**
 * 광고 설정 (스튜디오 광고 방침: 보상형만, 전면·강제 광고 없음, 개발 중에는 테스트 광고만).
 * AdMob 「조립전쟁 (iOS/Android)」 앱과 보상형 광고 단위를 2026-10-19 CEO 승인으로 만들어 실제 ID 를 넣었다.
 * **ADMOB_TEST_MODE=true 인 동안은 실제 ID 로도 테스트 광고만 나온다**(실광고 클릭 위험 없음). 출시 빌드에서만 false 로 바꾼다.
 * 앱 ID 는 ios/App/App/Info.plist(GADApplicationIdentifier)·android AndroidManifest(APPLICATION_ID) 에 있다.
 */
export const ADS_ENABLED = true;
export const ADMOB_TEST_MODE = true;
export const REWARDED_UNIT_ID = {
  ios: 'ca-app-pub-8637735577267068/8161690843',      // 조립전쟁 (iOS) 보상형
  android: 'ca-app-pub-8637735577267068/8010567473',  // 조립전쟁 (Android) 보상형
};
