import type { CapacitorConfig } from '@capacitor/cli';

/**
 * 조립전쟁 / Assembly War 네이티브 래핑 설정 (TD-007).
 * appId 는 iOS Bundle ID 이자 Android 패키지명. 스튜디오의 다른 앱(개냥전쟁·Iron Frontier 등)과 절대 겹치지 않는다.
 */
const config: CapacitorConfig = {
  appId: 'com.shortappstudio.assemblywar',
  appName: '조립전쟁',
  webDir: 'dist',
  // 웹 화면이 뜨기 전 잠깐 보이는 바탕색 (격납고 어두운 남색)
  backgroundColor: '#0b1420',
  server: { androidScheme: 'https' },
  ios: { contentInset: 'never' },
};

export default config;
