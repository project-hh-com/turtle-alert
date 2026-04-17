# 구현 계획 — 거북이경보 (turtle-alert) 앱 아키텍처 리뷰 및 개선

> 생성일: 2026-04-17
> 상태: 아키텍처 검토 완료

---

## 1. 현재 상태 분석

### 구조
- **단일 파일 앱**: `main.js` (223줄) — Electron 메인 프로세스만 사용
- **의존성**: `electron-store` (영구 저장), `electron` + `electron-builder` (빌드)
- **UI**: 네이티브 Tray 메뉴, BrowserWindow 없음, Dock 숨김
- **기능**: 주기적 스트레칭 알림 (15/30/45/60분), 일일 카운터, 랜덤 스트레칭 가이드

### 코드 품질
- 전체 223줄, 함수당 20줄 이하 준수
- 상수(`STRETCHES`) 분리 양호
- 상태 관리: 전역 변수 3개 (`timer`, `remainSec`, `isRunning`) — 앱 규모에 적합

---

## 2. 구현 계획 (현재 기능 기준)

### Phase 1: 안정성 개선
| 단계 | 작업 | 파일 | 위험도 |
|------|------|------|--------|
| 1-1 | 타이머 동기화 문제 수정 — `setInterval` 2개(timer + titleUpdateTimer) 통합 | `main.js` | 낮음 |
| 1-2 | 시스템 절전/슬립 복귀 시 타이머 보정 로직 추가 | `main.js` | 중간 |
| 1-3 | 앱 재시작 시 이전 상태 복원 (타이머 자동 시작 옵션) | `main.js` | 낮음 |

### Phase 2: 사용성 개선
| 단계 | 작업 | 파일 | 위험도 |
|------|------|------|--------|
| 2-1 | 로그인 시 자동 실행 설정 (`app.setLoginItemSettings`) | `main.js` | 낮음 |
| 2-2 | "지금 스트레칭" 즉시 알림 메뉴 항목 추가 | `main.js` | 낮음 |
| 2-3 | 알림 소리 on/off 토글 | `main.js` | 낮음 |

### Phase 3: 빌드/배포 안정화
| 단계 | 작업 | 파일 | 위험도 |
|------|------|------|--------|
| 3-1 | `files` 배열에 `assets/` 누락 확인 및 수정 | `package.json` | 낮음 |
| 3-2 | CI 스크립트 추가 (GitHub Actions) | `.github/workflows/` | 중간 |

---

## 3. 핵심 위험 요소 Red-Team 검토

### 위험 1: 타이머 정확도 — macOS 슬립/절전 후 드리프트

**공격 시나리오**: 사용자가 노트북을 덮고 30분 후 열면, `setInterval`이 슬립 동안 멈춰 있다가 재개됨. `remainSec`는 실제 경과 시간과 무관하게 슬립 전 값을 유지하므로 알림이 지연됨.

**영향**: 사용자가 30분 간격으로 설정했지만 실제로는 1시간 이상 알림이 없을 수 있음.

**방어책**:
```javascript
// setInterval 대신 절대 시간 기반 비교
let nextAlertTime = Date.now() + intervalMin * 60 * 1000;

timer = setInterval(() => {
  remainSec = Math.max(0, Math.ceil((nextAlertTime - Date.now()) / 1000));
  if (remainSec <= 0) {
    sendAlert();
    nextAlertTime = Date.now() + intervalMin * 60 * 1000;
  }
}, 1000);
```
추가로 `electron.powerMonitor.on('resume', ...)` 이벤트에서 즉시 타이머 상태 재확인.

---

### 위험 2: electron-store 데이터 손상

**공격 시나리오**: 앱이 비정상 종료되는 시점에 `electron-store`가 JSON 파일을 쓰고 있으면 파일이 손상됨. 손상된 설정 파일은 앱 시작 시 크래시를 유발.

**영향**: 사용자의 설정(알림 간격, 일일 카운터)이 유실되고 앱이 시작 불가.

**방어책**:
```javascript
const store = new Store({
  defaults: { ... },
  clearInvalidConfig: true,  // 손상 시 기본값으로 리셋
});
```
`electron-store`는 내부적으로 `conf` 패키지를 사용하며 `clearInvalidConfig` 옵션이 이미 지원됨. 이를 활성화하면 손상된 JSON 파일을 감지하고 기본값으로 복구.

---

### 위험 3: 메모리 누수 — Notification 객체 및 setInterval 누적

**공격 시나리오**: `sendAlert()`가 호출될 때마다 `new Notification()`이 생성되지만 참조가 해제되지 않음. 장시간(하루 8시간, 15분 간격 = 32회) 실행 시 GC가 적시에 회수하지 못하면 메모리 사용량이 점진적으로 증가. 또한 `startTimer()`를 반복 호출하면 이전 `setInterval`이 정리되지 않는 시나리오가 이론적으로 가능.

**영향**: 장시간 실행 후 메모리 사용량 증가, 최악의 경우 OOM.

**방어책**:
- 현재 `stopTimer()`에서 `clearInterval` 호출 → `startTimer` 시작부에 `stopTimer()` 호출 확인됨 ✅ (이 부분은 이미 방어됨)
- Notification 객체는 `show()` 후 로컬 변수로 유지되므로 GC 대상 ✅
- 추가 방어: `notification.on('close', ...)` 콜백에서 명시적 참조 해제는 불필요 (V8 GC가 처리)
- **실제 위험도: 낮음** — 현재 코드에서 메모리 누수 경로는 확인되지 않으나, 장기 실행 앱이므로 주기적 모니터링 권장

---

## 4. 아키텍처 결정 기록 (ADR)

### ADR-001: 단일 파일 유지 vs 모듈 분리
- **결정**: 300줄 이하일 때까지 단일 `main.js` 유지
- **근거**: 렌더러 없는 트레이 앱으로 복잡도가 낮음. 파일 분리 시 오히려 탐색 비용 증가
- **전환 시점**: 300줄 초과 또는 설정 UI(BrowserWindow) 추가 시

### ADR-002: 타이머 구현 방식
- **결정**: `setInterval` + 절대 시간 비교 하이브리드
- **근거**: 순수 `setInterval`은 슬립 후 드리프트 발생. `setTimeout` 재귀는 불필요한 복잡도. 절대 시간 비교로 정확도 보장

### ADR-003: 상태 관리
- **결정**: 전역 변수 유지 (클래스/모듈 패턴 불채택)
- **근거**: 단일 프로세스, 단일 인스턴스 앱에서 전역 상태가 가장 단순하고 명확

---

## 5. 우선순위 요약

| 순위 | 작업 | 이유 |
|------|------|------|
| P0 | 슬립 복귀 타이머 보정 | 핵심 기능 정확도 |
| P0 | `clearInvalidConfig` 활성화 | 앱 시작 실패 방지 |
| P1 | 로그인 시 자동 실행 | 메뉴바 앱의 기본 기대치 |
| P1 | setInterval 2개 → 1개 통합 | 코드 단순화 + 자원 절약 |
| P2 | "지금 스트레칭" 메뉴 항목 | 사용성 향상 |
| P2 | CI/CD 파이프라인 | 배포 안정성 |
