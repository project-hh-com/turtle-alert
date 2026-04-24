# 2026-04-24 AI 자세 검사 모델 로드 실패 (v0.5.2 → v0.6.0)

> 설치된 `.app` 에서만 "TensorFlow.js 모델을 불러올 수 없습니다" 에러가 나던 이슈. `pnpm dev` 에서는 멀쩡. 원인은 `@mediapipe/pose` 가 프로덕션 `node_modules` 에 빠져있던 것.

---

## 결론

**원인**: `@tensorflow-models/pose-detection` v2.1.3 은 `blazepose_mediapipe/detector.js` 에서 **무조건적으로** `require("@mediapipe/pose")` 를 호출함. 우리가 실제로 쓰는 디텍터는 MoveNet 이지만, `index.js` 가 BlazePose 모듈을 **정적으로** import 하기 때문에 `require` 시점에 `@mediapipe/pose` 가 해석되지 않으면 모듈 전체 로드가 실패함.

`package.json` 에는 `@mediapipe/pose` 가 선언돼 있지 않았음. `pnpm dev` 에서는 과거 설치 흔적 또는 pnpm 의 호이스팅으로 우연히 해결됐지만, electron-builder 가 프로덕션 의존성만 골라 패키징하는 과정에서 누락됨.

**해결**: `@mediapipe/pose` 를 `dependencies` 에 추가.

```json
"dependencies": {
  "@mediapipe/pose": "^0.5.1675469404",
  ...
}
```

---

## 증상

- `pnpm dev` 로 실행: AI 자세 검사 정상 동작
- `/Applications/TurtleAlert.app` 으로 실행: 트레이 메뉴에서 "🤖 AI 자세 검사" 클릭 시 즉시 알림
  > 🤖 자세 감시 AI 로드 실패
  > TensorFlow.js 모델을 불러올 수 없습니다. 의존성을 확인해주세요.

---

## 원인 확정까지의 과정

### 1. 초기 오진 — `files` 화이트리스트 문제라고 생각

`package.json` 의 `build.files` 에 `main.js`, `lib.js`, `lib/`, `assets/` 만 있고 `node_modules` 가 없어서, electron-builder 의 기본 동작이 덮어써지며 `node_modules` 가 패키징에서 빠졌다고 판단. `files` 항목을 제거했음.

실제로 이 가설에는 **일부 진실**이 있었다. 제거하지 않았어도 electron-builder 가 dependencies 는 자동으로 포함하지만, 명시적 `files` 가 있으면 동작이 미묘하게 바뀌어 디버깅이 복잡해짐. 다만 **이것만으로는 이번 증상을 설명하지 못했음** — 재빌드해도 같은 에러가 반복됐으니까.

### 2. electron-builder 가 연달아 깨짐

캐시 문제로 `corrupted Electron dist` / `app.asar is corrupted` 에러가 발생. `~/Library/Caches/electron`, `~/Library/Caches/electron-builder`, `node_modules`, `dist` 를 모두 지우고 clean install 후 다시 빌드하니 `.app` 은 정상 생성. (DMG 단계는 `dmgbuild` 파이썬 모듈 문제로 계속 실패 — 이번 이슈에서는 `--dir` 모드로 `.app` 만 만들어 `/Applications` 에 직접 복사해 우회)

### 3. 실제 에러 추출

빌드된 앱에서 `console.error` 는 stdout/stderr 로 흐르지 않는 경우가 많아 진짜 에러를 볼 수 없었음. `initDetector` 의 catch 블록에서 `os.tmpdir()` 로 파일 로그를 쓰도록 임시 패치하고, 단계별로 `_logStep()` 을 박아넣음.

또 다른 함정: Electron 메인 프로세스의 `os.tmpdir()` 은 `/tmp` 가 아니라 `/var/folders/...` 를 반환. 로그 파일은 잘 쓰이고 있었는데 엉뚱한 경로를 보고 있어서 한참 헤맸음. `find /var/folders -name "turtle-alert-error.log"` 로 실제 위치 발견.

### 4. 드러난 진짜 원인

로그 내용:
```
Error: Cannot find module '@mediapipe/pose'
Require stack:
- .../app.asar/node_modules/@tensorflow-models/pose-detection/dist/blazepose_mediapipe/detector.js
- .../app.asar/node_modules/@tensorflow-models/pose-detection/dist/create_detector.js
- .../app.asar/node_modules/@tensorflow-models/pose-detection/dist/index.js
- .../app.asar/lib/posture-capture.js
```

`pose-detection` 의 `index.js` 가 BlazePose mediapipe 디텍터 파일을 조건 없이 load 하고, 그 파일 최상단이 `@mediapipe/pose` 를 `require` 함. `package.json` 에는 없는 패키지라 asar 빌드 시 포함되지 않았고, 런타임에 `Cannot find module` 로 터진 것.

`pnpm add @mediapipe/pose` 한 줄로 해결.

---

## 배운 것

1. **"dev 에서 되고 prod 에서 안 된다" = 대부분 의존성 누락 또는 파일 경로 문제.** `require` 스택만 보면 1분 만에 원인 확정 가능. 문제는 그 스택을 어떻게 확보하느냐.

2. **빌드된 Electron 앱에서 stderr 를 보려면 별도 수단이 필요.** `console.error` 를 믿지 말고, 의심되는 코드 경로에는 처음부터 파일 로그(`os.tmpdir()` 사용) 를 심는 게 빠름.

3. **`os.tmpdir()` 경로는 macOS Electron 에서 `/var/folders/...`.** `/tmp` 에 쓰는 걸로 착각하면 로그를 영영 못 찾는다.

4. **Pose Detection 라이브러리의 암묵적 peer.** 공식 문서에서 `@mediapipe/pose` 가 peerDependency 로 명시돼 있지 않고, `@tensorflow-models/pose-detection` 의 `peerDependencies` 에도 없음. 그런데 `index.js` 진입과 동시에 하드 require. 이런 종류의 숨은 의존성은 `pnpm install --production` 후 `node -e "require('@tensorflow-models/pose-detection')"` 같은 최소 재현으로만 드러남.

5. **electron-builder 의 `files` 필드는 함부로 건드리지 말 것.** 기본 동작이 `node_modules` 의 dependencies 를 알아서 포함하는데, 명시하는 순간 동작이 바뀜. 이번 이슈와 별개였지만 디버깅을 오래 헤매게 한 요소.

---

## 관련 커밋 / 파일

- `fix: AI 자세 검사 모델 로드 실패 수정` — `0728371`
- [package.json](../package.json) — `@mediapipe/pose` 추가
- [lib/posture-capture.js](../lib/posture-capture.js) — `initDetector` (변경 없음, catch 블록 구조만 원상 복구)

## 다음에 비슷한 증상이 또 나오면

1. 먼저 **진짜 에러를 확보**하라. `initDetector` 의 catch 는 `err.message` 만 찍고 스택을 버리게 되어있음. 스택까지 봐야 함.
2. dev vs prod 차이 → `pnpm install --prod` 후 `node -e "require('문제모듈')"` 로 프로덕션 동등 환경 재현.
3. `Cannot find module` 이면 99% 숨은 peer dep. `package.json` 에 추가.
