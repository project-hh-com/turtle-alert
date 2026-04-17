# Ship Plan — v0.3.0 (자세 스냅샷 기능)

## 변경 요약

새 기능: 알림 시 카메라로 자세 스냅샷을 촬영하여 저장하는 기능 추가.
- `lib.js`: `captureSnapshot`, `cleanOldSnapshots`, `getSnapshotFolderSize`, `checkImagesnap` 함수 추가 + `createAppCore`에 스냅샷 로직 통합
- `main.js`: store defaults에 스냅샷 설정 추가, 앱 시작 시 오래된 스냅샷 정리, `shell` 의존성 주입
- `.github/workflows/ci.yml`: lint/test:coverage/audit 3단 파이프라인으로 확장
- `package.json`: eslint 추가, electron/electron-builder 버전 업, `NSCameraUsageDescription` plist 설정
- `eslint.config.js`: 신규 ESLint flat config
- 테스트 2파일 92건 통과, 커버리지 88.69%/81.81%/94.44%/90.13% (모두 80% 이상)

## 코드 리뷰 결과

### 양호
- 스냅샷 실패 3회 연속 시 자동 비활성화 — graceful degradation
- imagesnap 미설치 시 메뉴 비활성화 — 사용자 혼란 방지
- fire-and-forget 패턴으로 알림 타이머 블로킹 없음
- `cleanOldSnapshots`에서 `거북이-*.jpg` 패턴만 삭제 — 다른 파일 보호
- CI에 lint → test → audit 순서 적절

### 지적 사항 (minor, 릴리즈 차단 아님)
1. `getSnapshotFolderSize` export되지만 아무 곳에서도 사용되지 않음 — dead code
2. `main.js`에서 `systemPreferences` import하지만 사용처 없음
3. `captureSnapshot`에서 경로 injection 방어 없음 (store 값이므로 실질 위험 낮음)

## 릴리즈 계획

1. 변경사항 커밋 (feat: 자세 스냅샷 촬영 기능 추가)
2. `package.json` version → `0.3.0`
3. git tag `v0.3.0`
4. `gh release create v0.3.0` (DMG 빌드는 별도 — macOS 로컬 빌드 필요)

---

## Red-Team 검토: 핵심 위험 3가지

### 위험 1: 카메라 프라이버시 — 사용자 동의 없는 촬영

**공격 시나리오**: 사용자가 스냅샷 기능을 실수로 켜거나 의미를 이해하지 못한 채 활성화. 카메라가 주기적으로 촬영하면서 민감한 이미지가 디스크에 쌓임.

**현재 방어**: 기본값 `snapshotEnabled: false`, macOS `NSCameraUsageDescription` 권한 팝업, imagesnap 미설치 시 비활성화.

**추가 방어책**:
- [x] 기본 비활성화 (이미 적용)
- [ ] 첫 활성화 시 확인 다이얼로그 추가 검토 (v0.4.0 고려)
- [x] `NSCameraUsageDescription`에 명확한 한국어 설명 (이미 적용)

**결론**: 현재 수준으로 릴리즈 가능. macOS 시스템 권한이 1차 게이트 역할.

### 위험 2: 파일시스템 무한 팽창

**공격 시나리오**: 30분 간격 × 하루 16시간 = 32장/일 × 30일 = ~960장. JPG 200KB 기준 ~200MB. 보관 기간을 길게 설정하거나 정리가 실패하면 디스크 가득 참.

**현재 방어**: `cleanOldSnapshots`가 앱 시작 시 실행, 기본 30일 보관.

**추가 방어책**:
- [x] 앱 시작 시 자동 정리 (이미 적용)
- [ ] 폴더 용량 상한 설정 (500MB) — `getSnapshotFolderSize` 활용 가능
- [ ] 주기적 정리 (24시간마다) — 현재는 앱 시작 시만

**결론**: 30일 × 960장 = ~200MB로 현실적 위험 낮음. 릴리즈 가능.

### 위험 3: `execFile("imagesnap")` 명령 실행 안전성

**공격 시나리오**: imagesnap 바이너리가 PATH에서 악성 바이너리로 대체되면 임의 코드 실행. 또는 `savePath`에 shell metacharacter 포함 시 문제.

**현재 방어**: `execFile` 사용 (shell injection 불가, `exec`와 다름). 경로는 `electron-store` 기본값에서 설정.

**추가 방어책**:
- [x] `execFile` 사용으로 shell injection 차단 (이미 적용)
- [x] 인자를 배열로 전달 (이미 적용)
- [ ] imagesnap 절대 경로 사용 검토 (`/opt/homebrew/bin/imagesnap`)

**결론**: `execFile` + 배열 인자로 충분히 안전. 릴리즈 가능.

---

## 최종 판정

**릴리즈 승인** — 3가지 위험 모두 현재 방어 수준에서 수용 가능. minor 지적사항은 후속 PR로 처리.
