# 🐢 거북이경보 (Turtle Alert)

> "어휴~ 거북이되겠다~" 잔소리형 자세 교정 알림 앱 (macOS 메뉴바 상주)

## 📥 다운로드

**사용자라면 👉 [DOWNLOAD.md](./DOWNLOAD.md)** 에서 설치 가이드를 확인하세요.

| 칩 | 바로 다운로드 |
|---|---|
| 🍎 Apple Silicon (M1/M2/M3/M4) | [TurtleAlert-arm64.dmg](https://github.com/project-hh-com/turtle-alert/releases/latest/download/TurtleAlert-arm64.dmg) |
| 💻 Intel Mac | [TurtleAlert-x64.dmg](https://github.com/project-hh-com/turtle-alert/releases/latest/download/TurtleAlert-x64.dmg) |

📦 [전체 릴리즈 보기](https://github.com/project-hh-com/turtle-alert/releases/latest)

## 📑 목차

- [1. 개요](#1-개요)
- [2. 주요 기능](#2-주요-기능)
  - [2-1. 자세 교정 알림](#2-1-자세-교정-알림)
  - [2-2. 자세 감시 AI](#2-2-자세-감시-ai)
  - [2-3. 메뉴바 UI](#2-3-메뉴바-ui)
  - [2-4. 데이터 영구 저장](#2-4-데이터-영구-저장)
- [3. 스트레칭 종류](#3-스트레칭-종류)
- [4. 파일 구조](#4-파일-구조)
- [5. 기술 스택](#5-기술-스택)
- [6. 개발 히스토리](#6-개발-히스토리)
- [7. 빌드 & 배포](#7-빌드--배포)

---

## 1. 개요

| 항목 | 값 |
|---|---|
| **앱 이름** | 거북이경보 |
| **프로젝트명** | `turtle-alert` |
| **플랫폼** | macOS (Electron) |
| **타입** | 메뉴바 상주 앱 (창 없음, Dock 숨김) |
| **설치 위치** | `/Applications/거북이경보.app` |
| **실행 스크립트** | `pnpm dev` |
| **저장소** | [project-hh-com/turtle-alert](https://github.com/project-hh-com/turtle-alert) |
| **이슈/건의** | [GitHub Issues](https://github.com/project-hh-com/turtle-alert/issues) |

---

## 2. 주요 기능

### 2-1. 자세 교정 알림
- 설정한 주기마다 macOS 네이티브 알림 발송
- 알림 제목: **"🚨 거북이경보 발령!"**
- 8가지 스트레칭 가이드 중 랜덤 선택
- 알림 센터에서 확인 가능 (앱 백그라운드 실행 중에도 동작)

### 2-2. 자세 감시 AI (v0.4.0~)
- **TensorFlow.js MoveNet** 모델로 웹캠 실시간 자세 분석 (로컬 AI, 과금 없음)
- **기준 자세 캘리브레이션**: 본인의 바른 자세를 기록하여 편차 기반 판정 — 서브모니터 대각선 카메라에서도 오탐 없음
- 8가지 감지 항목: 거북목, 어깨 기울어짐, 고개 전방 돌출, 고개 회전, 화면에 너무 가까움, 고개 기울어짐, 한쪽으로 기울어짐, 구부정한 자세
- 연속 2회 감지 시 알림 발송
- 요구사항: 카메라 권한 (앱 첫 실행 시 macOS가 자동 요청). imagesnap 바이너리는 앱에 번들되어 별도 설치 불필요.

### 2-3. 메뉴바 UI
- 상단바에 **🐢** 이모지 + 남은 시간 실시간 표시 (예: `🐢 29:59`)
- 우클릭/클릭 메뉴에서 모든 조작 가능
  - 시작/중지
  - 알림 간격 변경 (15분 / 30분 / 45분 / 1시간)
  - 자세 감시 AI 토글 / 기준 자세 설정
  - 오늘 스트레칭 횟수 확인
  - 종료
- 알림 발생 시 상단바 **🚨 5초 깜빡임** 효과

### 2-4. 데이터 영구 저장
- `electron-store` 사용
- 저장 항목: 알림 간격, 오늘 스트레칭 횟수, 마지막 리셋 날짜, 캘리브레이션 데이터
- 자정 넘으면 횟수 자동 리셋

### 2-5. 새 버전 알림 (v0.7.0~)
- **앱 시작 시 1회** GitHub Releases 를 조회하여 새 버전이 올라왔는지 확인
- 새 버전이 있으면 트레이 메뉴 최상단에 **"🆕 새 버전 vX.Y.Z 받기"** 항목이 표시되고 알림을 한 번 띄움
- 클릭하면 릴리즈 페이지가 열리고 거기서 DMG 를 받아 다시 설치
- 자동 설치 아님 — 코드 서명이 없어서 반자동(알림 + 원클릭 다운로드 링크) 방식 유지

---

## 3. 스트레칭 종류

| 이모지 | 이름 | 설명 |
|---|---|---|
| 🧘 | 목 좌우 스트레칭 | 고개를 천천히 좌우로 기울여 10초씩 유지 |
| 💪 | 어깨 으쓱 | 어깨를 귀까지 올렸다 떨어뜨리기 (5회) |
| 🐢 | 고개 뒤로 | 턱을 뒤로 당겨 이중턱 만들고 10초 유지 |
| 🙆 | 가슴 펴기 | 양손 깍지 끼고 가슴 활짝 펴기 |
| 👀 | 눈 운동 | 20-20-20 규칙 (6m 밖 20초 바라보기) |
| 🔄 | 허리 비틀기 | 의자에 앉은 채 상체 좌우 비틀기 |
| 🤚 | 손목 스트레칭 | 손가락 당겨 손목 스트레칭 |
| 🚶 | 일어서기 | 자리에서 일어나 30초 제자리 걸음 |

---

## 4. 파일 구조

```
turtle-alert/
├── main.js              # Electron 메인 프로세스 (트레이, 타이머, 알림)
├── lib.js               # 앱 코어 로직 (타이머, 알림, 자세 감시 통합)
├── lib/
│   ├── posture-detector.js  # 자세 판정 순수 로직 (캘리브레이션, 8가지 감지)
│   └── posture-capture.js   # 카메라/TensorFlow.js 의존 함수
├── __tests__/           # Vitest 테스트 (커버리지 80%+)
├── package.json         # 프로젝트 설정 + electron-builder 설정
├── assets/
│   ├── icon.svg         # 원본 아이콘 (SVG)
│   └── icon.png         # 앱 아이콘 (512x512 PNG, 자동 icns 변환)
└── dist/                # 빌드 결과물 (.app, .dmg, .zip)
```

---

## 5. 기술 스택

| 영역 | 기술 |
|---|---|
| **런타임** | Electron 41 |
| **저장소** | electron-store |
| **AI** | TensorFlow.js + MoveNet (로컬 추론) |
| **카메라** | imagesnap (macOS CLI) |
| **빌드** | electron-builder |
| **테스트** | Vitest + v8 coverage (80%+) |
| **패키지 매니저** | pnpm |

---

## 6. 개발 히스토리

### v0.7.0 — 새 버전 알림 (업데이트 체커)
1. **앱 시작 시 GitHub Releases 확인** — 새 버전이 올라와있으면 트레이 메뉴 최상단에 "🆕 새 버전 vX.Y.Z 받기" 항목이 추가되고 알림을 한 번 띄움
2. **실패는 조용히** — 네트워크 오류 / rate limit 은 사용자에게 영향 없음
3. **자동 설치 아님** — Apple Developer 서명이 없어 풀 자동 업데이트는 제약이 크므로, 클릭 한 번으로 릴리즈 페이지를 여는 반자동 방식만 도입

### v0.6.1 — AI 백엔드 초기화 추가 (v0.6.0 후속 픽스)
1. **AI 자세 검사 백엔드 누락 해결** — v0.6.0 에서 `@mediapipe/pose` 는 추가했지만 실제로는 `@tensorflow/tfjs-backend-cpu` 도 빠져있어 `createDetector` 단계에서 "No backend found in registry" 로 실패하던 문제. 백엔드 패키지 추가 + `tf.setBackend('cpu')` / `tf.ready()` 명시 호출

### v0.6.0 — AI 모델 로드 버그 수정 + Finder 한글 표시
1. **AI 자세 검사 로드 실패 수정** — `@mediapipe/pose` 가 프로덕션 빌드에서 누락되어 트레이에서 AI 자세 검사를 켤 때 "TensorFlow.js 모델을 불러올 수 없습니다" 에러가 나던 문제 해결. 자세한 원인과 디버깅 과정은 [docs/2026-04-24-ai-posture-mediapipe.md](docs/2026-04-24-ai-posture-mediapipe.md) 참고
2. **Finder 앱 이름 한글 표시** — macOS SIGTRAP 회피를 위해 번들명을 영문(`TurtleAlert`) 으로 두되, `CFBundleDisplayName` + `.lproj` 로컬라이제이션으로 Finder/Dock/메뉴바 표시를 `거북이경보` 한글로 복원

### v0.5.x — 릴리즈 파이프라인 + imagesnap 번들
1. **imagesnap 바이너리 번들** — 사용자가 `brew install imagesnap` 을 따로 하지 않아도 스냅샷/AI 기능 동작 (v0.5.1)
2. **한 줄 릴리즈 자동화** — `pnpm release:tag` 스크립트로 버전 bump → 태그 push → CI 자동 빌드·배포 (v0.5.0)
3. **고정 자산명** — 릴리즈 자산을 `TurtleAlert-arm64.dmg` / `TurtleAlert-x64.dmg` 로 고정하여 `releases/latest/download/` 영구 링크 보장
4. **취약점 대응** — `@xmldom/xmldom` 을 ≥0.8.13 으로 pnpm override
5. **UX 개선** — 감시 모드 분리(알림만 / AI 자세 검사), AI 감시 간격 선택(20초~5분), 스트레칭 27종 확대, 캘리브레이션 제거 후 절대 기준 전환

### v0.4.0 — 자세 감시 AI + 캘리브레이션
1. **TensorFlow.js MoveNet** 기반 실시간 자세 분석 기능 추가
2. **기준 자세 캘리브레이션** — 절대 임계값 → 본인 기준 편차 방식으로 전환
3. **8가지 자세 감지** — 거북목, 어깨 기울어짐, 고개 전방 돌출, 고개 회전, 화면에 너무 가까움, 고개 기울어짐, 한쪽으로 기울어짐, 구부정한 자세
4. **상단바 깜빡임 효과** — 알림 발생 시 🚨 5초 깜빡임
5. **모듈 분리** — 순수 판정 로직(`posture-detector.js`)과 카메라 의존 함수(`posture-capture.js`) 분리
6. **테스트 커버리지 80%+** 달성 (Vitest + v8)

### v0.3.1 — macOS 크래시 수정
1. **macOS 26.2 한글 productName SIGTRAP** 회피 (productName 영문 고정)
2. **Electron 41 트레이 아이콘 크래시** 회피 및 afterPack 훅 추가

### v0.2.0 — 자세 스냅샷 기능
1. **imagesnap 기반 자세 스냅샷** 촬영 기능 추가
2. **스냅샷 자동 정리** — 보관 기간 경과 시 자동 삭제
3. **연속 촬영 실패 시 자동 비활성화** (3회 연속 실패)

### v0.1.0 — 초기 버전
1. **Next.js 웹 앱으로 시작** → 브라우저 필요
2. **Electron 전환** → 창 기반 네이티브 앱
3. **메뉴바 전용 앱으로 간소화** → 창 제거, 트레이만 남김
4. **이름 변경**: Alert or Turtle → **거북이경보**
5. **아이콘 추가**: 귀여운 거북이 + 빨간 경보 표시
6. **프로젝트명 변경**: `alert-or-turtle` → `turtle-alert`

---

## 7. 빌드 & 배포

### 개발 실행
```bash
pnpm install
pnpm dev
```

### macOS 앱 빌드

**칩셋별 개별 빌드 (용량 ↓)**
```bash
npx electron-builder --mac --x64 --arm64 --publish never
```

**유니버설 빌드 (한 파일로 통합, 용량 ↑)**
```bash
npx electron-builder --mac --universal --publish never
```

빌드 결과:
- `dist/mac-arm64/TurtleAlert.app` — Apple Silicon용 앱
- `dist/mac/TurtleAlert.app` — Intel용 앱
- `dist/TurtleAlert-X.Y.Z-arm64.dmg` — Apple Silicon DMG
- `dist/TurtleAlert-X.Y.Z.dmg` — Intel DMG

### 응용 프로그램에 설치
```bash
cp -R "dist/mac-arm64/TurtleAlert.app" /Applications/
```

Spotlight(Cmd+Space)에서 **"거북이경보"** 검색 후 실행.

### GitHub Release (권장: 한 줄)

```bash
pnpm release:tag patch    # 0.5.0 -> 0.5.1 (또는 minor / major / 0.6.0)
```

스크립트가 version bump → 커밋 → 태그 → push까지 처리하면, CI([release.yml](.github/workflows/release.yml))가 자동으로 빌드 + GitHub Release 생성 + 자산 업로드를 진행합니다.

자산명은 `TurtleAlert-arm64.dmg`, `TurtleAlert-x64.dmg` (버전 없음)로 고정되어 [DOWNLOAD.md](DOWNLOAD.md)의 `releases/latest/download/` 링크가 다음 릴리즈에서도 그대로 작동합니다.

**로컬 빌드/업로드 (디버깅용)**:
```bash
gh release create vX.Y.Z --title "거북이경보 vX.Y.Z" --notes "..."
pnpm release    # 빌드 + rename + 업로드
```

---

## 📝 참고

- 메뉴바 아이콘은 16x16 투명 PNG + `tray.setTitle("🐢")` 방식으로 이모지 직접 표시
- macOS 네이티브 알림은 `urgency: "critical"`로 설정해 알림 센터 유지
- `app.dock.hide()`로 Dock 아이콘 숨김 → 메뉴바에만 상주
- 빌드 시 나오는 `Cannot cleanup` 에러는 publish 설정 누락 관련으로, `.app` 생성에는 영향 없음
