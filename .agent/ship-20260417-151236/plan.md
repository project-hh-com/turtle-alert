# 거북이경보 크래시 수정 계획

## 근본 원인 분석

`electron-store@^8.x`는 **ESM-only** 패키지이나, `main.js`에서 `require("electron-store")`로 로드 중.
→ Electron 메인 프로세스(CommonJS)에서 ESM 모듈을 `require()` 하면 즉시 크래시.

```
Error [ERR_REQUIRE_ESM]: require() of ES Module .../electron-store/index.js not supported
```

---

## 구현 계획

### Step 1: electron-store 버전 다운그레이드

`electron-store@^8.x` (ESM-only) → `electron-store@^7.0.3` (마지막 CJS 버전)으로 변경.

```bash
pnpm remove electron-store
pnpm add electron-store@7.0.3
```

**이유**: `main.js`가 CommonJS이고, Electron 메인 프로세스에서 ESM 전환은 불필요한 복잡도 유발.

### Step 2: API 호환성 확인

v7과 v8의 API 차이 점검:
- `new Store({ defaults, clearInvalidConfig })` — v7에서도 동일하게 지원됨
- `store.get()`, `store.set()` — 동일

**변경 필요 코드: 없음** (v7 API와 현재 코드 100% 호환)

### Step 3: 앱 실행 검증

```bash
pnpm dev
```

트레이 아이콘 표시, 타이머 시작/중지, 알림 발송 확인.

### Step 4: 방어 코드 추가 — 글로벌 에러 핸들러

`main.js` 최상단에 uncaught exception 핸들러 추가하여, 크래시 대신 에러 알림 표시:

```js
process.on('uncaughtException', (error) => {
  const { dialog } = require('electron');
  dialog.showErrorBox('거북이경보 오류', error.message);
});
```

### Step 5: 테스트 실행

```bash
pnpm test
```

기존 테스트 통과 확인.

---

## Red-Team 검토: 핵심 위험 요소 3가지

### 위험 1: v7 다운그레이드 시 기존 저장 데이터 호환성

- **시나리오**: 사용자가 v8로 생성된 config 파일이 있을 경우 v7에서 읽지 못할 수 있음
- **심각도**: 중간
- **방어책**: `clearInvalidConfig: true` 옵션이 이미 설정되어 있어, 파싱 실패 시 자동 초기화됨. 저장 데이터가 `intervalMin`, `alertCount` 등 재생성 가능한 값뿐이므로 데이터 손실 영향 없음.

### 위험 2: electron-store@7의 보안 취약점 존재 가능성

- **시나리오**: v7이 EOL이고 알려진 CVE가 있을 수 있음
- **심각도**: 낮음
- **방어책**: electron-store는 로컬 JSON 파일 읽기/쓰기만 수행하는 단순 라이브러리. 네트워크 접근 없음. `npm audit` 결과 확인 후 진행. 장기적으로는 `conf` 패키지(같은 작자, CJS 지원)로 마이그레이션 검토.

### 위험 3: Electron 33 + electron-store@7 조합의 런타임 비호환

- **시나리오**: Electron 33의 Node.js 버전에서 electron-store@7 내부 의존성이 동작하지 않을 수 있음
- **심각도**: 중간
- **방어책**: electron-store@7의 핵심 의존성(`conf@10`, `atomically`)은 모두 CJS이며 Node 20+ 호환. `pnpm dev`로 즉시 검증 가능. 만약 비호환 발견 시, `electron-store` 대신 직접 `fs.writeFileSync`로 JSON 저장하는 50줄 미만의 간단한 store 구현으로 대체 (이 앱의 저장 데이터는 5개 키뿐).

---

## 요약

| 단계 | 작업 | 예상 변경 파일 |
|------|------|---------------|
| 1 | electron-store@7.0.3 다운그레이드 | `package.json`, `pnpm-lock.yaml` |
| 2 | API 호환성 확인 | 없음 |
| 3 | 앱 실행 검증 | 없음 |
| 4 | 글로벌 에러 핸들러 추가 | `main.js` (3줄) |
| 5 | 테스트 실행 | 없음 |

**변경 범위**: 최소 (패키지 버전 1개 + 방어 코드 3줄)
