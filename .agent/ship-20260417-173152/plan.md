# 게이트 실패 분석 및 해결 계획

## 현재 상태

- 테스트: 87개 전체 통과, 커버리지 84.5% (≥80% 충족)
- 보안: high/critical 취약점 없음 (moderate 1건 — ajv ReDoS, electron-store 경유)
- 빌드: 로컬 빌드 미검증 (CI에 빌드 게이트 없음)
- 정적 분석: eslint/tsc 설정 자체가 없음

**결론: 현재 CI(`pnpm test`)는 통과한다. "게이트 실패"는 CLAUDE.md에 정의된 4단계 CI 하네스 게이트 대비 누락된 부분을 의미한다.**

---

## 1. 구현 계획

### 1-1. 즉시 해결 (코드 문제)

현재 코드에 실제 런타임 버그는 없다. 모든 테스트 통과, 커버리지 기준 충족.

### 1-2. CI 게이트 보강 (`.github/workflows/ci.yml`)

CLAUDE.md가 요구하는 4단계를 실제 CI에 반영:

| 단계 | 현재 | 목표 |
|------|------|------|
| 1. 정적 분석 | 없음 | eslint 추가 (JS용, `--max-warnings 0`) |
| 2. 테스트 | `pnpm test` ✅ | 커버리지 임계값 추가 (`--coverage.thresholds.lines=80`) |
| 3. 빌드 | 없음 | `electron-builder --mac --publish never` (macOS runner 필요 또는 skip) |
| 4. 보안 | 없음 | `pnpm audit --audit-level=high` 추가 |

### 1-3. 파일 변경 목록

1. **`package.json`** — eslint 의존성 추가, lint 스크립트 추가
2. **`eslint.config.js`** — flat config 작성 (CommonJS + Node 환경)
3. **`.github/workflows/ci.yml`** — 4단계 게이트 반영
4. **`vitest.config.js`** (선택) — 커버리지 임계값 설정

---

## 2. 핵심 위험 요소 (Red-Team 검토)

### 위험 1: ubuntu CI에서 Electron 빌드 불가

- **문제**: `electron-builder --mac`은 macOS에서만 동작. ubuntu-latest에서 빌드 게이트 추가 시 실패.
- **영향**: CI 파이프라인 전체 블록.
- **방어책**: 빌드 게이트는 `macos-latest` runner에서 실행하거나, macOS 빌드는 release workflow에만 위임하고 CI에서는 skip. 현재 release.yml이 이미 존재하므로 CI에서는 빌드 검증을 생략하는 것이 현실적.

### 위험 2: eslint 도입 시 기존 코드 대량 경고

- **문제**: `--max-warnings 0`으로 설정하면 기존 코드의 스타일 위반으로 CI 즉시 실패.
- **영향**: 기능 개발 블록, eslint 수정에 시간 소모.
- **방어책**: 최소한의 룰셋으로 시작 (recommended only). 첫 커밋에서 모든 기존 경고를 수정한 후 `--max-warnings 0` 활성화. 또는 `.eslintignore`로 점진적 적용.

### 위험 3: electron-store ajv 취약점 (moderate)

- **문제**: electron-store v7 → conf → ajv 7.x에 ReDoS 취약점. `--audit-level=high`에는 걸리지 않지만, moderate로 올리면 실패.
- **영향**: 현재는 패스하지만, 보안 정책 강화 시 블로커. electron-store v8은 ESM-only라 현재 CommonJS 구조에서 사용 불가 (이전 커밋 `2918cbe`에서 이미 v8 롤백한 이력 있음).
- **방어책**: `--audit-level=high` 유지 (현재 수준). ajv는 electron-store 내부에서 설정 스키마 검증용이라 외부 입력 ReDoS 공격 경로 없음. 실질적 위험 낮음. 중장기적으로 electron-store 대안 검토 (예: `electron-json-storage`, 직접 JSON 파일 관리).

---

## 3. 실행 순서

1. eslint flat config 작성 + 기존 코드 lint 수정
2. `ci.yml`에 lint, coverage threshold, audit 단계 추가
3. 커밋 후 CI 통과 확인
4. (선택) 빌드 게이트는 release.yml에 위임, CI에서는 생략
