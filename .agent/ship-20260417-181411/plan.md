# 크래시 원인 분석 및 해결 계획

## 1. 원인 분석

### 1-1. `clearInvalidConfig` 미구현 (높은 가능성)
- `main.js:39`에서 `clearInvalidConfig: true` 옵션 사용
- **electron-store v7.0.3의 `index.js`에 해당 로직이 구현되어 있지 않음** (readme에만 문서화)
- 설정 파일(`~/Library/Application Support/turtle-alert/config.json`)이 손상되면 JSON 파싱 에러로 크래시
- v7에서는 손상된 config를 자동 복구하지 않고 그대로 throw

### 1-2. `app.getPath("home")` 타이밍 이슈 (중간 가능성)
- `main.js:36`에서 `Store` 생성자의 defaults 안에서 `app.getPath("home")` 호출
- 이 코드는 모듈 로드 시점(top-level)에 실행됨 → `app.whenReady()` 이전
- Electron 41에서 app ready 전 `getPath` 호출 시 일부 환경에서 throw 가능

### 1-3. Notification `urgency` 속성 (낮은 가능성)
- `lib.js:178`에서 `urgency: "critical"` 사용
- macOS에서 `urgency`는 Linux 전용 속성 → 무시되지만, Electron 41에서 strict validation 추가 시 throw 가능

## 2. 해결 계획

### Step 1: config 손상 방어 (핵심)
**파일**: `main.js`

```js
// 변경 전
const store = new Store({
  defaults: { ... },
  clearInvalidConfig: true,  // v7에서 미구현
});

// 변경 후: 수동으로 손상된 config 복구
const storePath = path.join(app.getPath("userData"), "config.json");
try {
  if (fs.existsSync(storePath)) {
    JSON.parse(fs.readFileSync(storePath, "utf8"));
  }
} catch {
  fs.unlinkSync(storePath); // 손상된 config 삭제 → defaults로 재생성
}
const store = new Store({ defaults: { ... } });
```

### Step 2: `app.getPath` 안전하게 사용
**파일**: `main.js`

```js
// 변경 전: top-level에서 app.getPath 호출
snapshotSavePath: require("path").join(app.getPath("home"), "거북이경보-스냅샷"),

// 변경 후: os.homedir() 사용 (Electron ready 불필요)
const os = require("os");
snapshotSavePath: path.join(os.homedir(), "거북이경보-스냅샷"),
```

### Step 3: Notification urgency 제거
**파일**: `lib.js`

macOS에서 `urgency`는 효과 없으므로 제거. `silent: false`면 이미 소리 남.

## 3. Red-Team 검토: 위험 요소 3가지

### Risk 1: config 삭제 시 사용자 설정 유실
- **위험**: 손상된 config를 삭제하면 사용자의 간격/자동실행 등 설정이 초기화됨
- **방어책**: 삭제 전 `.bak` 파일로 백업. 로그에 복구 사실 기록. 설정이 적으므로 재설정 비용 낮음

### Risk 2: `os.homedir()` 반환값이 `app.getPath("home")`과 다를 수 있음
- **위험**: Electron 샌드박스 환경에서 두 값이 다를 수 있어, 기존 스냅샷 폴더 경로 불일치
- **방어책**: 변경 후에도 기존 경로에 파일이 있으면 그대로 사용. `store.get("snapshotSavePath")`가 이미 저장된 값을 반환하므로 신규 설치에만 영향

### Risk 3: uncaughtException 핸들러가 에러 정보를 삼킴
- **위험**: `main.js:1-14`의 전역 에러 핸들러가 `process.exit(1)` 호출 → 에러 로그 없이 종료
- **방어책**: `process.exit(1)` 전에 에러를 파일로 기록 (`~/Library/Logs/turtle-alert/crash.log`). dialog가 뜰 수 없는 상황(app not ready)에서도 로그 남김

## 4. 구현 순서

1. `main.js`: config 손상 방어 코드 추가 (Step 1)
2. `main.js`: `app.getPath("home")` → `os.homedir()` 교체 (Step 2)
3. `lib.js`: `urgency: "critical"` 제거 (Step 3)
4. `main.js`: uncaughtException에 크래시 로그 파일 기록 추가
5. 테스트: `pnpm dev`로 정상 실행 확인
6. 테스트: config.json 손상 시나리오 재현 → 자동 복구 확인
