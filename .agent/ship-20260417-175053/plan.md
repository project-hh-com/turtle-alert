# 게이트 실패 분석 및 해결 계획

## 실패 원인

CI 4단계 게이트 중 **1단계 정적 분석(lint)** 실패.

`__tests__/snapshot.test.js`에서 unused variable 4건:
| 라인 | 변수 | 규칙 |
|---|---|---|
| 10 | `checkImagesnap` | no-unused-vars |
| 12 | `SNAPSHOT_CONSECUTIVE_FAIL_LIMIT` | no-unused-vars |
| 338 | `captureModule` | no-unused-vars |
| 387 | `origCapture` | no-unused-vars |

나머지 게이트 상태:
- **테스트**: 99/99 통과, 커버리지 98%+ ✅
- **보안 감사**: moderate 1건만 (high 없음) ✅
- **빌드**: 별도 실패 보고 없음 ✅

## 해결 계획

### 수정 작업 (단일 파일)

`__tests__/snapshot.test.js`에서:

1. **라인 10 `checkImagesnap`** — import에서 제거 (테스트에서 미사용)
2. **라인 12 `SNAPSHOT_CONSECUTIVE_FAIL_LIMIT`** — import에서 제거 (테스트에서 미사용)
3. **라인 338 `captureModule`** — 변수 선언 제거
4. **라인 387 `origCapture`** — 변수 선언 제거 (destructuring에서 제거)

### 검증 순서

1. `pnpm lint` — 0 errors 확인
2. `pnpm test` — 99/99 통과 확인 (제거한 변수가 실제로 미사용인지 검증)

---

## Red-Team 검토: 핵심 위험 3가지

### 위험 1: 제거한 import가 사실 side-effect로 필요한 경우

**시나리오**: `checkImagesnap`이나 `SNAPSHOT_CONSECUTIVE_FAIL_LIMIT`이 import 시 모듈 초기화에 영향을 줄 수 있음.

**방어책**: 동일 파일에서 `createAppCore`, `captureSnapshot` 등 다른 심볼을 이미 같은 모듈에서 import하고 있으므로, 개별 named export 제거는 모듈 로딩에 영향 없음. `pnpm test` 통과로 최종 확인.

### 위험 2: 변수 제거 후 테스트 의도 상실

**시나리오**: `captureModule`과 `origCapture`는 스냅샷 실패 자동 비활성화 테스트에서 mock을 시도하다 포기한 흔적. 제거하면 나중에 테스트 보완 시 맥락을 잃을 수 있음.

**방어책**: 해당 테스트(`should auto-disable snapshot after 3 consecutive failures`)의 기존 주석이 mock 전략의 한계를 이미 설명하고 있음. 미사용 변수보다 주석이 더 나은 문서. 별도 주석 추가 불필요.

### 위험 3: lint 수정만으로 근본 원인 미해결

**시나리오**: 이 unused vars는 테스트가 불완전하다는 신호. `captureSnapshot` mock이 closure 내부 호출이라 안 먹히는 구조적 문제가 있음.

**방어책**: 현재 스코프는 "게이트 통과"이며, 테스트 구조 개선은 별도 이슈로 분리. 현재 커버리지 98%로 실질적 위험은 낮음. 향후 `lib.js`를 DI 패턴으로 리팩토링하면 mock 가능해짐 — 그때 테스트 보완.

---

## 결론

단일 파일(`__tests__/snapshot.test.js`)에서 unused variable 4개 제거로 게이트 통과 가능. 테스트 동작에 영향 없음.
