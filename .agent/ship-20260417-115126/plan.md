# 구현 계획: 앱 실행 실패 수정

## 문제 진단

앱 실행 시 다음 오류 발생:
```
ERROR:platform_util_mac.mm(257)] Unable to set login item: Operation not permitted
```

**근본 원인**: `main.js:262`에서 `app.setLoginItemSettings({ openAtLogin: store.get("autoStart") })`를
`app.whenReady()` 콜백 내에서 에러 핸들링 없이 호출. macOS 보안 정책(Ventura+)에서
코드 서명되지 않은 앱이 로그인 항목 등록 시 `Operation not permitted` 발생.

이 에러가 uncaught exception으로 전파되면 `whenReady` 콜백의 나머지 코드
(Tray 생성, powerMonitor 등록)가 실행되지 않아 앱이 **무반응 상태**로 남거나 즉시 종료됨.

---

## 수정 계획

### Step 1: whenReady 콜백 내 에러 핸들링 추가 (핵심 수정)

**파일**: `main.js:250-273`

```js
app.whenReady().then(() => {
  app.dock?.hide();

  const emptyIcon = nativeImage.createEmpty();
  tray = new Tray(emptyIcon);
  tray.setTitle("🐢");
  tray.setToolTip("거북이경보");
  updateTrayMenu();

  // setLoginItemSettings를 try-catch로 감싸기
  try {
    app.setLoginItemSettings({ openAtLogin: store.get("autoStart") });
  } catch (err) {
    // 권한 오류 시 무시 — 로그인 자동 실행은 선택 기능
  }

  powerMonitor.on("resume", () => {
    if (!isRunning) return;
    remainSec = Math.max(0, Math.ceil((nextAlertTime - Date.now()) / 1000));
    if (remainSec <= 0) {
      sendAlert();
      nextAlertTime = Date.now() + store.get("intervalMin") * 60 * 1000;
    }
    updateTrayTitle();
  });
});
```

### Step 2: 메뉴 내 autoStart 토글 핸들러도 동일하게 보호

**파일**: `main.js:225-230`

```js
click: () => {
  const newValue = !autoStart;
  store.set("autoStart", newValue);
  try {
    app.setLoginItemSettings({ openAtLogin: newValue });
  } catch (err) {
    // 권한 부족 시 설정값만 저장, 시스템 등록은 건너뜀
  }
  updateTrayMenu();
},
```

### Step 3: electron-store 초기화 보호

`electron-store` 설정 파일이 손상된 경우에도 앱이 실행되도록 보호.
`clearInvalidConfig: true`가 이미 설정되어 있으나, 파일 시스템 권한 문제 등은 커버하지 못함.

**파일**: `main.js:11-20` — Store 생성을 try-catch로 감싸고, 실패 시 인메모리 폴백:

```js
let store;
try {
  store = new Store({
    defaults: { intervalMin: 30, alertCount: 0, lastResetDate: new Date().toDateString(), autoStart: false, soundEnabled: true },
    clearInvalidConfig: true,
  });
} catch (err) {
  // 파일 시스템 접근 불가 시 인메모리 폴백
  const memData = { intervalMin: 30, alertCount: 0, lastResetDate: new Date().toDateString(), autoStart: false, soundEnabled: true };
  store = {
    get: (key) => memData[key],
    set: (key, value) => { memData[key] = value; },
  };
}
```

### Step 4: 테스트 추가

- `setLoginItemSettings`가 throw해도 앱 초기화가 완료되는지 검증
- Store 초기화 실패 시 폴백 동작 검증
- 메뉴 autoStart 토글에서 예외 발생 시 메뉴 갱신이 정상 동작하는지 검증

---

## Red-Team 검토: 핵심 위험 요소 3가지

### 위험 1: electron-store 인메모리 폴백이 사용자 혼란 유발

**공격 시나리오**: 파일 시스템 권한 문제로 인메모리 폴백이 활성화되면, 사용자가 설정을
변경해도 앱 재시작 시 초기값으로 돌아감. 사용자는 "설정이 저장되지 않는다"고 인지.

**방어책**: 
- 폴백 활성화 시 트레이 메뉴 상단에 "⚠️ 설정 저장 불가" 상태 표시
- `store` 객체에 `isFallback` 플래그 추가하여 UI에서 확인 가능하게 구현
- 앱 최초 실행 시 Notification으로 "설정 파일 접근 불가" 알림 1회 발송

### 위험 2: try-catch가 진짜 버그를 삼켜버림

**공격 시나리오**: `setLoginItemSettings`의 인자 타입 오류 등 개발자 실수에 의한
예외도 무시되어, 디버깅이 어려워짐.

**방어책**:
- catch 블록에서 `err.message`에 "not permitted" / "Operation not permitted" 포함 여부 확인
- 권한 관련 에러만 무시하고, 그 외 에러는 re-throw
- 개발 환경(`NODE_ENV !== 'production'`)에서는 모든 에러를 console.error로 출력

```js
try {
  app.setLoginItemSettings({ openAtLogin: newValue });
} catch (err) {
  if (!err.message?.includes("not permitted")) {
    throw err; // 예상치 못한 에러는 그대로 전파
  }
}
```

### 위험 3: Tray 생성 자체가 실패하는 경우 미처리

**공격 시나리오**: `nativeImage.createEmpty()`가 유효한 이미지를 반환하지 못하거나,
`new Tray()`가 실패하면 `tray = null` 상태로 남고, 이후 모든 `updateTrayMenu()`와
`updateTrayTitle()`이 조기 반환되어 앱이 아무 동작도 하지 않는 "좀비 앱"이 됨.

**방어책**:
- Tray 생성 실패 시 `app.quit()`를 호출하여 명시적으로 종료
- 종료 전 `dialog.showErrorBox()`로 사용자에게 원인 안내
  (단, 현재 프로젝트는 dialog 미사용 → Notification으로 대체 검토)
- Tray 생성을 재시도(1회)하는 로직 추가는 과도 — 실패 시 깔끔하게 종료가 적절

```js
app.whenReady().then(() => {
  app.dock?.hide();
  try {
    const emptyIcon = nativeImage.createEmpty();
    tray = new Tray(emptyIcon);
  } catch (err) {
    // 트레이 없이는 앱 사용 불가 — 종료
    app.quit();
    return;
  }
  // ... 나머지 초기화
});
```

---

## 변경 대상 파일

| 파일 | 변경 내용 |
|---|---|
| `main.js` | setLoginItemSettings try-catch, Store 폴백, Tray 생성 보호 |
| `__tests__/main.test.js` | 에러 시나리오 테스트 케이스 추가 |

## 변경하지 않는 파일

- `package.json` — 의존성 변경 불필요
- `README.md`, `DOWNLOAD.md` — 사용자 대면 변경 없음
- `vitest.config.js` — 테스트 설정 변경 불필요

## 구현 순서

1. `main.js`의 `app.whenReady()` 콜백에 Tray 생성 try-catch 추가
2. `setLoginItemSettings` 두 곳(초기화 + 메뉴 토글)에 try-catch 추가
3. `electron-store` 초기화 인메모리 폴백 추가
4. `__tests__/main.test.js`에 에러 시나리오 테스트 추가
5. `pnpm test`로 기존 + 신규 테스트 통과 확인
6. `pnpm dev`로 실제 앱 실행 검증
