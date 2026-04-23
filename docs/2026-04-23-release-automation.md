# 2026-04-23 릴리즈 자동화 + imagesnap 번들 작업 기록

> v0.5.0 → v0.5.2 사이에 진행된 인프라/배포 개선 내역. 다음에 비슷한 작업을 할 때 같은 함정에 빠지지 않도록 결정의 *왜*와 *시행착오*를 남깁니다.

---

## 1. 배경

v0.5.0 출시 시점에 다음 문제들이 누적되어 있었음.

- main 푸시마다 CI가 실패 (lint: 미사용 상수)
- `electron-builder` 의존성 트리에 `@xmldom/xmldom < 0.8.13` (high 취약점 4건)
- DMG 다운로드 링크가 v0.3.1 자산명으로 하드코딩 → 404
- Release 자산명에 버전이 들어가 매 릴리즈마다 README/DOWNLOAD.md 수정 필요
- `imagesnap` CLI를 사용자가 직접 `brew install` 해야 함 → 진입장벽
- 릴리즈 절차가 수동 (빌드/업로드/문서 갱신을 매번 손으로)

---

## 2. 도입한 변경

### 2-1. 보안 패치
- `pnpm.overrides`로 `@xmldom/xmldom`을 **`~0.8.13`** 으로 핀. 처음에 `>=0.8.13`로 했더니 `0.9.x`가 들어와 `plist`와 호환이 깨졌음 (DOMParser.parseFromString mimeType 검증 strict화). plist 호환 + 취약점 해결을 동시에 만족하는 범위가 `0.8.13` 단일 버전이라 마이너 핀이 정답.

### 2-2. 자산명 규칙 (가장 중요)
- DMG 자산명은 **항상 버전 없는 이름**: `TurtleAlert-arm64.dmg`, `TurtleAlert-x64.dmg`.
- 이유: README/DOWNLOAD.md에서 `https://github.com/.../releases/latest/download/TurtleAlert-arm64.dmg` 링크를 쓰면 매 릴리즈마다 문서를 수정할 필요가 없음.
- **금지**: `TurtleAlert-0.5.2-arm64.dmg` 같은 버전 포함 이름. 이걸 쓰면 다음 릴리즈가 나오는 순간 latest 링크가 깨짐.

### 2-3. 한 줄 릴리즈 (`pnpm release:tag`)
- [scripts/release-tag.sh](../scripts/release-tag.sh): version bump → 커밋 → 태그 → push까지 처리.
- 이후 CI ([release.yml](../.github/workflows/release.yml))가 빌드 + Release 생성 + 자산 업로드.
- 사용:
  ```bash
  pnpm release:tag patch    # 0.5.0 → 0.5.1
  pnpm release:tag minor    # 0.5.0 → 0.6.0
  pnpm release:tag 0.7.2    # 명시적 버전
  ```
- 사전 검증: main 브랜치 + clean tree + origin 동기화 + 중복 태그 방지.

### 2-4. 로컬 수동 배포 (`pnpm release`)
- [scripts/release.sh](../scripts/release.sh): 로컬에서 빌드 + rename + 업로드. CI 실패나 디버깅 시 fallback.

### 2-5. CI rename 방식 변경
- 처음에는 `gh release create "dist/X.dmg#Y.dmg"`의 `#` rename syntax를 사용했으나, **GitHub Actions 환경에서 동작하지 않음** (자산이 원본 이름으로 업로드됨).
- 해결: 빌드 후 `release/` 디렉토리로 `cp`하면서 미리 rename → 그 파일을 그대로 업로드.
- 로컬 [scripts/release.sh](../scripts/release.sh)는 처음부터 cp 방식이라 영향 없음.

### 2-6. imagesnap 번들
- `vendor/imagesnap` (universal binary, arm64+x64, ~297KB, MIT) 추가.
- `rharder/imagesnap` 소스를 `xcodebuild -arch arm64 -arch x86_64 ONLY_ACTIVE_ARCH=NO`로 직접 빌드.
- [lib/imagesnap-path.js](../lib/imagesnap-path.js): 번들 우선 → 시스템 PATH fallback.
- `package.json`의 `build.extraResources`로 DMG에 포함 → `Contents/Resources/vendor/imagesnap`.
- 효과: `brew install imagesnap` 단계 불필요. DMG 설치만으로 카메라 기능(스냅샷/AI 자세 검사) 사용 가능.
- macOS 카메라 권한은 첫 실행 시 OS가 자동 요청 (`NSCameraUsageDescription` 사유 표시).

### 2-7. 테스트와 환경변수 우회
- 번들된 imagesnap이 들어가니 시스템 imagesnap이 설치된 개발자 머신에서 captureSnapshot 테스트가 "실제 카메라 호출"로 성공해버려 reject 가정 테스트가 깨짐.
- 해결: `lib/imagesnap-path.js`에 `TURTLE_IMAGESNAP_PATH` 환경변수 우회로직 추가, [vitest.config.js](../vitest.config.js)에서 `/nonexistent/imagesnap-test-binary`로 강제 → 시스템 PATH도 안 거치고 ENOENT로 reject.
- `vi.mock`은 lib.js가 CommonJS `require`를 사용해서 신뢰성 낮았음. 환경변수 방식이 더 견고.

### 2-8. 릴리즈 노트 템플릿
- [.github/RELEASE_NOTES_TEMPLATE.md](../.github/RELEASE_NOTES_TEMPLATE.md) 추가.
- 섹션: ✨ 새 기능 / 🛠 개선 / 🐛 버그 / 🔒 보안 / ⚙️ 개발배포 / 💔 호환성 / 다운로드 표 / Full Changelog.
- CI의 `--generate-notes`는 임시 채움일 뿐, 사람이 다시 정리하는 것이 원칙.

---

## 3. 삽질 / 시행착오

### 3-1. xmldom 버전 범위
- `>=0.8.13`로 override → `0.9.x` 설치 → `electron-builder` 빌드 시 `DOMParser.parseFromString: the provided mimeType "undefined" is not valid` 에러.
- `~0.8.13` 으로 좁혀서 해결.

### 3-2. `gh release create` 의 `#` rename
- 로컬에서는 동작하는 것 같았으나 CI 환경에서는 무시됨. 직접 cp로 rename하는 방식이 안전.

### 3-3. 태그 이동 + force push
- v0.5.1 빌드가 테스트 fix 누락으로 실패해서 태그를 새 커밋으로 이동해야 했음.
- main을 `git reset --soft`로 재구성하면 origin과 non-fast-forward → main을 force-push해야 함.
- 더 안전한 방법: main은 fast-forward로 추가 커밋만 push, **태그만 force-update** (`git tag -fa v0.5.1 ... && git push origin v0.5.1 --force`).
- `--force-with-lease`는 fetch 후에도 stale 판정이 날 수 있음. 태그는 단일 ref라 일반 `--force`도 비교적 안전.

### 3-4. vitest의 env 주입 시점
- `vitest.config.js`의 `test.env`는 정상 적용되지만, 캐싱이 걸리거나 시스템에 같은 이름 바이너리가 PATH에 있으면 의도와 다르게 동작할 수 있음.
- 비실존 절대경로(`/nonexistent/...`)를 강제 주입하는 게 가장 확실.

### 3-5. dist 폴더 용량
- universal 빌드 한 번에 dist/ 약 1.3GB. 로컬 디스크 관리 위해 release:tag 방식(CI가 빌드)이 권장.

---

## 4. 사용자 영향 요약

| 항목 | 이전 | 이후 |
|---|---|---|
| 설치 | DMG + `brew install imagesnap` | DMG 만으로 끝 |
| 카메라 권한 | 별도 안내 필요 | 첫 실행 시 macOS 자동 다이얼로그 |
| 다운로드 링크 | 매 릴리즈마다 README 수정 | `releases/latest/download/`로 자동 유지 |
| 알려진 high 취약점 | 4건 | 0건 |

---

## 5. 결정 한눈에

- **자산명**: `TurtleAlert-arm64.dmg` / `TurtleAlert-x64.dmg` (버전 없음). 어떤 경우에도 깨지 말 것.
- **릴리즈 명령**: `pnpm release:tag patch|minor|major|X.Y.Z`. 그 외 경로는 디버깅용.
- **릴리즈 노트**: 자동 생성된 노트는 임시 자리. [.github/RELEASE_NOTES_TEMPLATE.md](../.github/RELEASE_NOTES_TEMPLATE.md) 채워서 `gh release edit --notes`로 교체.
- **imagesnap**: 시스템 PATH fallback이 살아있지만 기본은 번들 바이너리. vendor/ 디렉토리는 git에 커밋 (gitignore 안 함).
- **xmldom**: `~0.8.13` 핀 유지. `0.9.x`는 plist 호환 깨짐.

---

## 6. 다음에 비슷한 작업 할 때 점검할 것

- [ ] `pnpm test` + `pnpm lint` 통과 후에만 `release:tag`
- [ ] release.yml workflow가 살아있는지 (`gh workflow list`)
- [ ] CI에서 자산명이 `TurtleAlert-arm64.dmg` / `TurtleAlert-x64.dmg`로 올라가는지 확인
- [ ] `--generate-notes`로 만들어진 임시 노트를 템플릿 기반으로 다시 작성
- [ ] DOWNLOAD.md / README.md의 latest 링크가 변경 없이 동작하는지 확인 (변경이 필요하면 자산명 규칙이 깨진 것)
