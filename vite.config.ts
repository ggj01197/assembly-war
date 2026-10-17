import { defineConfig } from 'vitest/config';

// base './' : Capacitor 가 파일을 상대 경로로 읽는다 (개냥전쟁·룬 헌터와 같은 설정)
export default defineConfig({
  base: './',
  build: { outDir: 'dist', chunkSizeWarningLimit: 1500 },
  server: { host: true, port: 5190, strictPort: true },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    testTimeout: 60000,
  },
});
