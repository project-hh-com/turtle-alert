# 🐢 거북이경보 (Turtle Alert)

> "어휴~ 거북이되겠다~" 잔소리형 자세 교정 알림 앱 (macOS 메뉴바 상주)

## 📥 다운로드

**사용자라면 👉 [DOWNLOAD.md](./DOWNLOAD.md)** 에서 설치 가이드를 확인하세요.

| 칩 | 바로 다운로드 |
|---|---|
| 🍎 Apple Silicon (M1/M2/M3/M4) | [거북이경보-AppleSilicon.dmg](https://github.com/project-hh-com/turtle-alert/releases/latest/download/%EA%B1%B0%EB%B6%81%EC%9D%B4%EA%B2%BD%EB%B3%B4-AppleSilicon.dmg) |
| 💻 Intel Mac | [거북이경보-Intel.dmg](https://github.com/project-hh-com/turtle-alert/releases/latest/download/%EA%B1%B0%EB%B6%81%EC%9D%B4%EA%B2%BD%EB%B3%B4-Intel.dmg) |

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
- 요구사항: `brew install imagesnap` + 카메라 권한

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

### GitHub Release 업로드
```bash
gh release create vX.Y.Z \
  "dist/TurtleAlert-X.Y.Z-arm64.dmg#거북이경보-AppleSilicon.dmg" \
  "dist/TurtleAlert-X.Y.Z.dmg#거북이경보-Intel.dmg" \
  --title "거북이경보 vX.Y.Z" --notes "릴리즈 노트"
```

> 태그 푸시 시 CI가 자동으로 빌드 + 릴리즈합니다 (`.github/workflows/release.yml`).

---

## 📝 참고

- 메뉴바 아이콘은 16x16 투명 PNG + `tray.setTitle("🐢")` 방식으로 이모지 직접 표시
- macOS 네이티브 알림은 `urgency: "critical"`로 설정해 알림 센터 유지
- `app.dock.hide()`로 Dock 아이콘 숨김 → 메뉴바에만 상주
- 빌드 시 나오는 `Cannot cleanup` 에러는 publish 설정 누락 관련으로, `.app` 생성에는 영향 없음
