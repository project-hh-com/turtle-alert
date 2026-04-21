# v0.3.0 크래시 조사 기록 — 해결 완료 (v0.3.1)

작성일: 2026-04-17 / 해결일: 2026-04-21
대상 앱: 거북이경보 v0.3.0 (Electron 메뉴바 앱)
대상 환경: macOS 26.2 (25C56), MacBook Pro (Apple Silicon, arm64)

---

## 결론

**원인**: electron-builder 26.8.1 로 패키징된 앱 번들에서 `productName`이 한글(`거북이경보`)이면 Helper.app 이름이 `거북이경보 Helper.app` 처럼 한글 포함 경로가 되는데, macOS 26.2의 강화된 코드서명 검증이 이를 받아들이지 못하고 V8 Context 초기화(`v8::Context::FromSnapshot`) 단계에서 `EXC_BREAKPOINT (SIGTRAP)` 로 앱을 종료시킴. `main.js` 가 실행되기 전에 터지므로 개발자 디버깅이 어려웠음.

**해결**: `productName` 을 영문 `TurtleAlert` 로 변경하고, `extendInfo.CFBundleDisplayName` 에 `거북이경보` 를 설정하여 파일 시스템 이름은 영문, 사용자에게 보이는 이름(Finder / Dock / 알림 / 메뉴바) 은 한글로 유지.

부수적으로 기존에 연결되지 않던 `scripts/afterPack.js` (Electron Fuses 설정) 를 `build.afterPack` 에 정식 등록.

---

## 원인 확정까지의 과정

### 1. 증상
- `/Applications/거북이경보.app` 실행 시 1 초 내 종료 (exit 133 = SIGTRAP)
- 메뉴바 🐢 아이콘이 뜨지 않거나, 뜨더라도 타이머 갱신 없이 종료
- `~/Library/Logs/DiagnosticReports/거북이경보-*.ips` 에 크래시 리포트 생성
- Electron 33, Electron 41 모두 동일하게 재현
- v0.1.0 / v0.2.0 / v0.3.0 모든 릴리즈에서 동일 (v0.3.0 회귀 아님)

### 2. 크래시 스택 (항상 동일)
```
Thread 0 Crashed (CrBrowserMain):
0   Electron Framework  node::crypto::TLSWrap::GetFD() + ...
...
17  Electron Framework  v8::Context::FromSnapshot(...) + ...
18  Electron Framework  v8::Context::FromSnapshot(...) + ...
19  Electron Framework  ElectronMain + 120
20  dyld                start + 7184
```

### 3. 가설 검증 실험
| 실험 | 결과 | 결론 |
|---|---|---|
| `pnpm dev` | ✅ 정상 | 소스는 무죄 |
| dev Electron.app 껍데기 + 우리 소스 | ✅ 정상 | Electron 바이너리는 무죄 |
| dev Electron.app + packaged `app.asar` | ✅ 정상 | asar 내용물 무죄 |
| dev Electron.app + packaged Info.plist + app.asar | ✅ 정상 | Info.plist 내용 무죄 |
| `identity: "-"` 로 adhoc 재서명 | ❌ SIGTRAP | 서명 자체는 원인 아님 |
| `hardenedRuntime: false` | ❌ SIGTRAP | hardened runtime 원인 아님 |
| `EnableEmbeddedAsarIntegrityValidation: false` Fuse | ❌ SIGTRAP | asar integrity 원인 아님 |
| Framework/Helper 바이너리 dev 원본으로 교체 | ❌ SIGTRAP | 바이너리 해시 원인 아님 |
| **productName 영문으로 변경 후 빌드** | ✅ **정상** | **Helper.app 이름의 한글이 원인** |

### 4. 유력 추정
크래시 스택 하단에 Electron 내부의 `codesign_util.cc` 문자열 참조가 보였음. macOS 26.2 가 한글 경로가 포함된 Helper.app 번들을 spawn 할 때 코드서명 검증에서 NFD/NFC 정규화 불일치 또는 경로 처리 이슈로 검증 실패 → V8 초기화 직전에 trap.

---

## 적용된 수정 (v0.3.1)

### package.json
```diff
- "productName": "거북이경보",
+ "productName": "TurtleAlert",
+ "afterPack": "scripts/afterPack.js",
  "mac": {
    ...
    "extendInfo": {
+     "CFBundleDisplayName": "거북이경보",
      "NSCameraUsageDescription": "..."
    }
  }
```

### 사용자 노출 변화
- ❌ 변경: `dist` 산출물 이름 `거북이경보-*.dmg` → `TurtleAlert-*.dmg`
- ❌ 변경: `/Applications/` 내부 번들 경로가 `TurtleAlert.app`
- ✅ 유지: Finder / Dock / 알림센터 / 메뉴바 표시명은 "거북이경보"
- ✅ 유지: 기능, 문구, 스트레칭 가이드 등 동작 일체

---

## 참고
- Electron Fuses: https://www.electronjs.org/docs/latest/tutorial/fuses
- electron-builder mac options: https://www.electron.build/configuration/mac

_이 이슈는 v0.3.1 에서 해결되었으며, 본 문서는 재발 시 참고용으로 보존합니다._
