# Claude Code Project Guide — 거북이경보 (turtle-alert)

이 파일은 Claude Code가 이 프로젝트에서 작업할 때 따라야 할 가이드입니다.

---

## 1. 프로젝트 개요

- **이름**: 거북이경보 (turtle-alert)
- **타입**: macOS 메뉴바 상주 Electron 앱
- **목적**: 주기적 자세 교정 알림 ("어휴~ 거북이되겠다~" 잔소리 톤)
- **아키텍처**: 단일 프로세스 Electron (메인만, 렌더러 없음)
- **저장소**: https://github.com/project-hh-com/turtle-alert

---

## 2. 파일 구조

```
turtle-alert/
├── CLAUDE.md           # (이 파일) Claude Code 가이드
├── README.md           # 개발자용 문서
├── DOWNLOAD.md         # 최종 사용자용 설치 가이드
├── package.json        # electron-builder 설정 포함
├── main.js             # Electron 메인 프로세스 (전체 앱 로직)
├── .gitignore
└── assets/
    ├── icon.svg        # 원본 SVG
    └── icon.png        # 512x512 앱 아이콘
```

⚠️ 렌더러 프로세스/HTML/CSS 없음. UI는 모두 네이티브 트레이 메뉴.

---

## 3. 핵심 구현 원칙

### 3-1. 창 없는 메뉴바 앱
- `BrowserWindow` 사용 금지 — 의도적으로 제거됨
- `app.dock.hide()`로 Dock에서 숨김
- 모든 상호작용은 `Tray` + `Menu`로 처리
- 상단바 표시는 `tray.setTitle("🐢 MM:SS")` 이모지 방식 (아이콘 파일 대신)

### 3-2. 상태 관리
- 전역 변수로 `timer`, `remainSec`, `isRunning` 관리 (단순함 우선)
- 영구 저장은 `electron-store`만 사용
- 저장 키: `intervalMin`, `alertCount`, `lastResetDate`

### 3-3. 알림 발송
- `new Notification({ urgency: "critical" })` 필수 (알림센터 유지)
- 알림 제목은 **"🚨 거북이경보 발령!"** 톤 유지
- 스트레칭 가이드는 `STRETCHES` 배열에서 랜덤 선택

---

## 4. 작업 가이드

### 4-1. 기능 추가 시
1. 먼저 `main.js` 읽고 전체 흐름 파악
2. 트레이 메뉴 추가 → `updateTrayMenu()` 내 `Menu.buildFromTemplate` 수정
3. 설정값 추가 → `store.defaults`에 추가 + 관련 함수에서 `store.get/set`
4. 복잡한 UI가 필요하면 먼저 **"정말 창이 필요한가?"** 재검토

### 4-2. 스트레칭 항목 추가
- `STRETCHES` 배열에 `{ name, desc, emoji }` 객체 추가
- 톤은 명령조/가이드형으로 통일 ("~하세요", "~해보세요")

### 4-3. 문구 톤앤매너
- 앱 이름, 알림 문구는 **잔소리/훈수 느낌** 유지
- "거북이되겠다", "자세 똑바로" 계열의 한국어
- 영문 혼용 지양 (네이티브 느낌 유지)

---

## 5. 빌드 / 배포 워크플로우

### 5-1. 개발 실행
```bash
pnpm install
pnpm dev    # electron .
```

### 5-2. 칩셋별 DMG 빌드 (권장)
```bash
rm -rf dist
npx electron-builder --mac --x64 --arm64 --publish never
```
→ `dist/TurtleAlert-X.Y.Z-arm64.dmg` (Apple Silicon)
→ `dist/TurtleAlert-X.Y.Z.dmg` (Intel)

⚠️ `productName`은 영문(`TurtleAlert`) 고정. 한글로 바꾸면 macOS 26.2+ 에서 SIGTRAP 크래시 (상세: [CRASH_INVESTIGATION.md](CRASH_INVESTIGATION.md)). 사용자에게 보이는 이름은 `extendInfo.CFBundleDisplayName` 로 한글 유지 중.

### 5-3. GitHub Release 업로드 (자동 스크립트)

**반드시 `scripts/release.sh` 사용** — 자산명을 버전 없는 형태로 고정해야 [DOWNLOAD.md](DOWNLOAD.md)의 `releases/latest/download/` 링크가 매 릴리즈마다 깨지지 않습니다.

```bash
# 1) 먼저 GitHub Release를 생성 (notes 작성 필요)
gh release create vX.Y.Z --title "거북이경보 vX.Y.Z" --notes "..."

# 2) 빌드 + rename + 자산 업로드를 한 번에
pnpm release           # package.json의 현재 버전을 사용
# 또는
pnpm release v0.6.0    # 특정 태그 명시
```

스크립트가 하는 일:
- `dist/` 정리 → `electron-builder --mac --x64 --arm64` 빌드
- DMG를 **버전 없는 이름** (`TurtleAlert-arm64.dmg`, `TurtleAlert-x64.dmg`)으로 rename
- 해당 태그의 GitHub Release에서 같은 이름의 기존 자산을 제거 후 새로 업로드

⚠️ **금지 사항**: 자산명에 버전 포함 금지 (`TurtleAlert-0.5.0-arm64.dmg` ❌). 그렇게 올리면 DOWNLOAD.md 링크가 깨집니다. 수동으로 `gh release upload`를 쓸 일이 있다면 반드시 `#TurtleAlert-arm64.dmg` 형식으로 rename해서 올리세요.

### 5-4. 로컬 설치 (테스트용)
```bash
rm -rf "/Applications/TurtleAlert.app"
cp -R "dist/mac-arm64/TurtleAlert.app" /Applications/
```

⚠️ 빌드 시 `Cannot cleanup: TypeError: Cannot read properties of null (reading 'provider')` 에러는 publish 설정 누락 관련으로 **무시해도 됨**. `.app`과 `.dmg`는 정상 생성됨.

---

## 6. 버전 관리

- 버전 업데이트 시 `package.json`의 `version` 필드 수정
- 커밋 메시지 컨벤션: `feat:`, `fix:`, `docs:`, `chore:`, `build:`
- 릴리즈 태그: `v0.1.0` 형식, Git 태그와 GitHub Release 일치시킬 것
- 푸시 기본 브랜치: `main`

---

## 7. 문서 업데이트 룰

### 코드 변경 시 함께 업데이트
| 변경 내용 | 업데이트할 문서 |
|---|---|
| 기능 추가/변경 | `README.md` 2. 주요 기능 |
| 스트레칭 항목 변경 | `README.md` 3. 스트레칭 종류 |
| 빌드 명령 변경 | `README.md` 7. 빌드 & 배포, `CLAUDE.md` 5. 빌드 |
| 설치 과정 변경 | `DOWNLOAD.md` |
| 새 릴리즈 배포 | GitHub Release 생성 + `DOWNLOAD.md` 링크 확인 |

---

## 8. 코드 스타일

- JS는 ES2022+ CommonJS (`require`) — Electron 메인이므로
- 들여쓰기 2칸, 세미콜론 사용
- 한국어 주석 OK (사용자 대면 텍스트와 일관성)
- 함수 20줄 초과 시 분리 검토
- 매직 넘버 대신 상수 (`STRETCHES`, `INTERVALS` 처럼)

---

## 9. 하지 말 것

- ❌ 렌더러 프로세스 추가 (앱 컨셉에 반함)
- ❌ 영문 앱 이름으로 되돌리기 ("Alert or Turtle" 등)
- ❌ Dock 아이콘 노출 (`app.dock.show()` 금지)
- ❌ `node_modules`, `dist`, `.next` 커밋
- ❌ 코드 서명/노터라이즈 관련 작업 (현재 개인 배포 수준)

---

## 10. 유용한 참고

- Electron Tray API: https://www.electronjs.org/docs/latest/api/tray
- Electron Notification: https://www.electronjs.org/docs/latest/api/notification
- electron-builder config: https://www.electron.build/configuration/configuration
