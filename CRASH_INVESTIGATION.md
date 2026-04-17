# v0.3.0 크래시 조사 기록

작성일: 2026-04-17
대상 앱: 거북이경보 v0.3.0 (Electron 메뉴바 앱)
대상 환경: macOS 26.2 (25C56), MacBook Pro (Apple Silicon, arm64)

---

## 1. 증상

- `/Applications/거북이경보.app` 실행 시 **약 1초 내 크래시**
- 메뉴바 🐢 아이콘이 뜨지 않거나, 뜨더라도 타이머 갱신 없이 종료
- 터미널 stderr 출력 없음, exit code 0으로 종료되는 것처럼 보임
- `~/Library/Logs/DiagnosticReports/거북이경보-*.ips` 에 크래시 리포트 생성

## 2. 크래시 패턴 (공통)

모든 크래시가 동일한 스택을 갖습니다:

```
Exception Type:  EXC_BREAKPOINT (SIGTRAP)
Termination:     Trace/BPT trap: 5

Thread 0 Crashed (CrBrowserMain):
0   Electron Framework  node::crypto::TLSWrap::GetFD() + 827744
1   Electron Framework  node::crypto::TLSWrap::GetFD() + 826400
2   Electron Framework  v8::ObjectTemplate::SetHandler(...) + 12168
...
17  Electron Framework  v8::Context::FromSnapshot(...) + 86056
18  Electron Framework  v8::Context::FromSnapshot(...) + 84752
19  Electron Framework  ElectronMain + 120
20  dyld                start + 7184
```

- 크래시 위치: **`ElectronMain` → `v8::Context::FromSnapshot` → crypto 초기화**
- 메인 스크립트(`main.js`)는 **실행조차 되지 못함** (Electron 런타임 초기화 중 실패)
- Electron 33, Electron 41 모두 동일하게 재현됨

## 3. 시도한 대응과 결과

### 3-1. ❌ Electron 버전 업그레이드 (33 → 41)

- `package.json` devDependency를 `electron@^33` → `electron@^41.2.1` 로 변경
- `rm -rf node_modules pnpm-lock.yaml && pnpm install` 로 깨끗한 재설치
- `electron-builder --mac --arm64 --publish never` 로 재빌드 (Framework 261MB, 정상 크기)
- `/Applications/거북이경보.app` 덮어쓰기
- **결과**: 동일한 `node::crypto::TLSWrap::GetFD` 크래시 재현 (20:09:20)

### 3-2. ❌ 깨진 Electron 바이너리 의혹 검증

초기에는 `node_modules/electron/dist/Electron.app/Contents/MacOS/Electron --version`이 Electron 버전이 아닌 `v24.14.1` (Node)를 반환하는 것을 보고 바이너리가 Node placeholder로 오염되었다고 의심했음.

- 검증: `env -i PATH=/usr/bin:/bin ...Electron --version` → `v41.2.1` 정상 출력
- 원인: **`ELECTRON_RUN_AS_NODE=1` 환경변수가 Claude Code/VSCode 확장 호스트에 의해 설정**되어 있었고, 해당 세션의 자식 프로세스 전부 Electron을 Node 모드로 다운그레이드 실행시키고 있었음
- 이는 **Claude Code 세션 내 테스트 한정 이슈**, 사용자가 Finder로 직접 실행할 때는 해당 없음
- **본질적인 크래시 원인은 아니었음** (`require("electron")`이 문자열을 반환한 것은 VSCode 환경변수 상속 때문)

### 3-3. 시도하지 않은 접근

다음은 아직 시도하지 않은 가설들:

- **Electron Fuses 조정**: `enableEmbeddedAsarIntegrityValidation`, `runAsNode` 등의 fuse 설정 변경
- **다른 Electron 메이저 버전**: 28.x LTS, 30.x LTS 등 더 오래된 안정 버전
- **adhoc 서명 대신 dev 서명** 또는 재서명 (`codesign --force --deep --sign -`)
- **V8 snapshot 비활성화** 관련 커맨드라인 스위치
- **packaged .app 대신 `pnpm dev` (electron .) 실행** 시 재현 여부
- **electron-builder asar 옵션**: `asar: false` 또는 unpack 설정 변경

## 4. 유력 가설

스택 트레이스의 특징 (`v8::Context::FromSnapshot` → crypto 초기화 중 `EXC_BREAKPOINT`)은 V8 초기 컨텍스트 복원 단계 실패를 의미합니다. 이는 다음 중 하나일 가능성이 큽니다:

1. **macOS 26.2 + Electron 공통 호환성 이슈** — Electron 33/41 모두 동일하게 터짐
2. **adhoc 코드 서명 + V8 snapshot validation 충돌** — macOS 26.2가 codesign 검증을 엄격하게 수행하면서 unsigned snapshot에 trap을 발생시키는 패턴
3. **하드웨어 특이사항 (MacBookPro18,1)** — `lowPowerMode: 1` 이 활성 상태였음

## 5. 부수적으로 관찰한 것

### 빌드 중 경고
```
arm64 requires signing, but identity is set to null and signing is being skipped
```
- electron-builder가 arm64 대상으로 서명 없이 빌드
- 현재 개인 배포 수준이므로 의도된 동작이지만, macOS 26.2에서는 이게 실행을 막을 가능성이 있음

### 크래시 리포트 내 단서
- `codeSigningFlags: 570556929` (0x22010001 — adhoc + library validation)
- `codeSigningValidationCategory: 10`
- `codeSigningTrustLevel: 4294967295` (uninit)
- **adhoc 서명 상태에서 V8 snapshot 로드 실패 가능성** 시사

## 6. 현재 결론

- **v0.3.0을 그대로 릴리즈하면 다운로드한 사용자도 동일 크래시** 발생
- Electron 버전만 올리는 해결은 실패
- 다음 시도 후보: **Electron Fuses 조정** 또는 **ad-hoc 대신 dev 인증서로 재서명**
- 그 전까지 v0.3.0 릴리즈 DMG 교체/재공지 보류 권장

## 7. 재현 절차

```bash
# 설치된 앱 확인
/usr/libexec/PlistBuddy -c "Print CFBundleShortVersionString" \
  /Applications/거북이경보.app/Contents/Info.plist

# 실행
open /Applications/거북이경보.app

# 크래시 로그 확인
ls -lt ~/Library/Logs/DiagnosticReports/거북이경보-*.ips | head -1
```

## 8. 참고 리소스

- Electron Fuses: https://www.electronjs.org/docs/latest/tutorial/fuses
- macOS 26.2 릴리즈 노트 (codesign 관련)
- Electron GitHub Issues (macOS 26 / Sequoia 호환성 검색)

---

_이 파일은 v0.3.0 크래시 이슈 추적용 임시 문서입니다. 이슈 해결 후 삭제하거나 CHANGELOG.md에 요약 이동 가능._
