# 구현 계획 — 거북이경보 v2 기능 강화

## 변경 요약

staged/unstaged diff 기반으로 식별된 기능 목록:

| # | 기능 | 파일 | 상태 |
|---|---|---|---|
| 1 | 글로벌 에러 핸들러 (`uncaughtException` → 다이얼로그) | main.js | 구현 완료 |
| 2 | "지금 스트레칭!" 즉시 알림 버튼 | main.js | 구현 완료 |
| 3 | 알림 소리 ON/OFF 토글 (`soundEnabled`) | main.js | 구현 완료 |
| 4 | 로그인 시 자동 실행 (`autoStart` + `setLoginItemSettings`) | main.js | 구현 완료 |
| 5 | 시스템 슬립 복귀 시 타이머 보정 (`powerMonitor.resume`) | main.js | 구현 완료 |
| 6 | 타이머를 절대 시각 기반으로 리팩토링 (`nextAlertTime`) | main.js | 구현 완료 |
| 7 | 테스트 인프라 (vitest + `module.exports`) | main.js, package.json, vitest.config.js | 구현 완료 |
| 8 | electron-store 8→7 다운그레이드, 빌드 설정 보강 | package.json | 구현 완료 |

---

## 핵심 위험 요소 Red-Team 검토

### 위험 1: `uncaughtException` 핸들러에서 `require("electron")` 지연 로딩

**문제**: 프로세스 최상단에서 `dialog`를 지연 `require`하는데, Electron app이 `ready` 되기 전에 예외가 발생하면 `dialog.showErrorBox`가 실패할 수 있음.

**심각도**: 중 — 앱 시작 직후 크래시 시 무한 루프(에러→다이얼로그 에러→...) 가능.

**방어책**: `app.isReady()` 체크를 추가하거나, ready 전 에러는 `console.error` + `process.exit(1)`로 폴백.

```js
process.on("uncaughtException", (error) => {
  try {
    const { app, dialog } = require("electron");
    if (app.isReady()) {
      dialog.showErrorBox("거북이경보 오류", `앱에서 오류가 발생했습니다.\n\n${error.message}`);
    }
  } catch (_) {
    // 무시 — 이미 복구 불가 상태
  }
  process.exit(1);
});
```

### 위험 2: `setLoginItemSettings` 비서명 앱 동작

**문제**: 코드 서명 없는 앱에서 `app.setLoginItemSettings({ openAtLogin: true })`를 호출하면 macOS가 무시하거나 보안 경고를 띄울 수 있음. 사용자가 체크박스를 켜도 실제로 자동 실행이 안 될 수 있다.

**심각도**: 중 — 기능이 조용히 실패하면 사용자 혼란.

**방어책**: 
- 설정 후 `app.getLoginItemSettings()`로 실제 등록 여부를 검증하고, 실패 시 트레이 메뉴에 "(미지원)" 표시.
- CLAUDE.md에 "코드 서명 없는 환경에서 자동 실행은 보장되지 않음" 문서화.

### 위험 3: 테스트에서 Electron 모듈 모킹 부재

**문제**: `main.js`가 최상단에서 `electron`을 `require`하므로 Node.js 환경(vitest)에서 직접 import하면 `Cannot find module 'electron'`으로 즉시 실패. 테스트 인프라는 추가했으나 실제 테스트 파일(`__tests__/`)과 모킹 전략이 확인 필요.

**심각도**: 높 — 테스트가 아예 실행 불가능할 수 있음.

**방어책**:
- `vitest.config.js`에서 `electron` 모듈을 모킹하는 setup 파일 구성.
- `__tests__/` 디렉토리에 Electron mock factory 생성.
- CI에서 `pnpm test` 통과 확인 후 머지.

---

## 실행 순서

1. **위험 1 수정**: `uncaughtException` 핸들러에 `app.isReady()` 가드 + `process.exit(1)` 추가
2. **위험 3 확인**: `__tests__/` 파일 확인 및 vitest에서 electron 모킹 동작 검증 (`pnpm test`)
3. **위험 2 문서화**: 자동 실행 제약사항을 README에 주석 수준으로 기록
4. **최종 검증**: `pnpm test` + `pnpm dev`로 수동 확인
5. **커밋 & PR**: 변경 사항 단일 커밋

---

## 판정

구현 자체는 완료 상태. 위험 1(에러 핸들러)과 위험 3(테스트 실행 가능성)만 실제 코드 수정이 필요하며, 위험 2는 문서화로 충분.
