# 조립전쟁 / Assembly War

노바1492식 로봇 부품 조립 RTS 를 세로 한 손 3분 전투로 옮긴 모바일 게임. Phaser 3 + TypeScript + Vite + Capacitor 8.
기획·결정·위험·절차 문서는 `../00_PROJECT_CONTROL/` (기획안_FINAL · TECH_DECISIONS · RISK_REGISTER · PROJECT_RESUME_CARD).

```bash
npm install
npm test          # domain 규칙 테스트 (Vitest)
npm run dev       # http://localhost:5190
npm run build     # lint-names → tsc → vite build → dist/
npx cap sync      # dist → ios/ · android/
```

- `src/domain/` — Phaser 무의존 순수 규칙 (조립·가격·전투 시뮬·강화·매칭·세이브)
- `src/data/` — 부품·스킬·영웅·스테이지 JSON + zod 스키마
- `src/game/` — Phaser 씬(전장), `src/ui/` — HTML 오버레이
- `scripts/` — 시트 자르기(`cut-sheet.mjs`), 27조합 점검(`combo-check.mjs`), 이름 린트
- 서명 키·비밀값은 저장소 밖 `../서명키/`
