# 📸 자세 스냅샷 기능 구현 계획

## 기능 요약
알림 시점에 노트북 카메라로 사용자의 자세를 촬영하여 로컬에 저장하는 **옵트인** 옵션.
사용자가 나중에 자신의 자세 변화를 돌아볼 수 있게 하는 것이 목적.

---

## 1. 구현 계획

### 1-1. 의존성 추가
- `node-webcam` 또는 Electron의 `desktopCapturer`는 렌더러 전용이므로 사용 불가
- **macOS 네이티브 `imagesnap` CLI** 활용 (Homebrew 없이 번들 가능, 또는 `child_process`로 `ffmpeg` 단발 캡처)
- 권장: `imagesnap` 바이너리를 `assets/bin/imagesnap`에 번들하거나, 설치 여부 감지 후 안내
- 대안: Electron `systemPreferences.askForMediaAccess('camera')` + `child_process.execFile('imagesnap', [...])`

### 1-2. 저장소 설정 (electron-store)
```js
// store.defaults에 추가
snapshotEnabled: false,       // 옵트인 기본 OFF
snapshotSavePath: "~/거북이경보-스냅샷",  // 저장 폴더
```

### 1-3. 카메라 권한 요청
- `app.whenReady()` 후 `systemPreferences.askForMediaAccess('camera')` 호출
- 권한 거부 시 기능 비활성화 + 트레이 메뉴에서 회색 표시
- `systemPreferences.getMediaAccessStatus('camera')`로 상태 확인

### 1-4. 스냅샷 캡처 함수 (`lib.js`에 추가)
```js
async function captureSnapshot(savePath) {
  const fs = require("fs");
  const path = require("path");
  const { execFile } = require("child_process");

  // 저장 폴더 보장
  fs.mkdirSync(savePath, { recursive: true });

  const filename = `거북이-${new Date().toISOString().replace(/[:.]/g, "-")}.jpg`;
  const filepath = path.join(savePath, filename);

  return new Promise((resolve, reject) => {
    execFile("imagesnap", ["-q", filepath], (err) => {
      if (err) return reject(err);
      resolve(filepath);
    });
  });
}
```

### 1-5. sendAlert() 수정
```js
// sendAlert 내부, 알림 발송 직후
if (store.get("snapshotEnabled")) {
  captureSnapshot(store.get("snapshotSavePath")).catch((err) => {
    // 실패해도 알림 자체는 정상 동작 — 조용히 로그만
    console.error("스냅샷 실패:", err.message);
  });
}
```

### 1-6. 트레이 메뉴 항목 추가
```
─────────────────
☑ 자세 스냅샷 (카메라)     ← checkbox, snapshotEnabled 토글
  📂 스냅샷 폴더 열기       ← shell.openPath(savePath)
─────────────────
```

### 1-7. 파일 정리
- 30일 이상 된 스냅샷 자동 삭제 (앱 시작 시 1회 실행)
- `store.defaults`에 `snapshotRetentionDays: 30` 추가

### 1-8. 빌드 설정
- `package.json`의 `build.files`에 `assets/bin/` 추가 (imagesnap 번들 시)
- `build.mac.extendInfo`에 `NSCameraUsageDescription` 추가 필수

---

## 2. Red-Team: 핵심 위험 요소 3가지

### 🔴 위험 1: 프라이버시 침해 — 동의 없는 촬영
- **위협**: 기능이 켜진 줄 모르고 촬영됨. 공유 맥에서 다른 사람이 찍힘.
- **심각도**: 높음 (법적 이슈 가능)
- **방어책**:
  1. **기본값 OFF** (`snapshotEnabled: false`)
  2. 활성화 시 **확인 다이얼로그** 표시 (dialog.showMessageBox)
  3. 촬영 직전 **시스템 사운드** 또는 **트레이 타이틀에 📸 표시**하여 촬영 인지 가능하게
  4. 트레이 메뉴에 "자세 스냅샷 켜짐 📸" 상태 항상 표시

### 🔴 위험 2: 카메라 접근 실패 / imagesnap 미설치
- **위협**: imagesnap 없거나 카메라 권한 거부 시 앱 크래시 또는 무한 에러 루프
- **심각도**: 중간
- **방어책**:
  1. 앱 시작 시 `which imagesnap` 또는 번들 바이너리 존재 확인
  2. 미설치 시 메뉴에서 "(imagesnap 필요)" 비활성 표시
  3. `captureSnapshot`은 **fire-and-forget** — 실패해도 알림 흐름에 영향 없음
  4. 연속 3회 실패 시 자동으로 `snapshotEnabled = false` + 알림으로 안내

### 🔴 위험 3: 디스크 용량 폭주
- **위협**: 15분 간격 × 하루 8시간 = ~32장/일 × 30일 = ~960장. JPG 기준 ~500MB~1GB
- **심각도**: 중간
- **방어책**:
  1. 기본 보관 기간 30일, 앱 시작 시 오래된 파일 자동 삭제
  2. JPEG 품질 50%로 압축 (`imagesnap` `-q` 옵션 없으므로 후처리 또는 `sips` 활용)
  3. 트레이 메뉴 "스냅샷 폴더 열기" 옆에 현재 용량 표시
  4. 1GB 초과 시 경고 알림

---

## 3. 구현 순서 (우선순위)

| 순서 | 작업 | 파일 | 예상 규모 |
|------|------|------|-----------|
| 1 | store defaults 추가 (`snapshotEnabled`, `snapshotSavePath`, `snapshotRetentionDays`) | `main.js` | S |
| 2 | `captureSnapshot()` 함수 작성 | `lib.js` | M |
| 3 | `sendAlert()`에 스냅샷 호출 연결 | `lib.js` | S |
| 4 | 트레이 메뉴에 토글/폴더열기 추가 | `lib.js` | S |
| 5 | 카메라 권한 요청 로직 | `main.js` | S |
| 6 | 오래된 스냅샷 자동 정리 함수 | `lib.js` | S |
| 7 | `NSCameraUsageDescription` plist 추가 | `package.json` | S |
| 8 | 테스트 작성 (captureSnapshot mock, 정리 로직) | `lib.test.js` | M |
| 9 | README 문서 업데이트 | `README.md` | S |

---

## 4. 아키텍처 결정 기록 (ADR)

**결정**: 렌더러 프로세스 대신 `imagesnap` CLI로 카메라 접근
**이유**: 이 앱은 의도적으로 렌더러가 없는 메뉴바 앱. `desktopCapturer`/`getUserMedia`는 렌더러 필수. CLI 호출이 앱 아키텍처를 보존하면서 카메라 접근 가능한 유일한 방법.
**트레이드오프**: macOS 전용 (imagesnap), 크로스플랫폼 지원 시 ffmpeg 등 대안 필요.
