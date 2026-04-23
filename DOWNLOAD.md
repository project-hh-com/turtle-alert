# 🐢 거북이경보 다운로드 가이드

> "어휴~ 거북이되겠다~" 잔소리형 자세 교정 알림 macOS 앱

---

## 📦 설치 방법 — 두 가지 중 하나

### ✅ 방법 1. Homebrew 로 설치 (권장)

터미널에 익숙하다면 **이게 가장 간편**합니다. 칩셋 자동 인식 + Gatekeeper 우회까지 한 방에 처리됩니다.

```bash
brew install --cask project-hh-com/turtle-alert/turtle-alert
```

제거하려면:
```bash
brew uninstall --cask turtle-alert
brew uninstall --cask --zap turtle-alert  # 설정/로그까지 전부 삭제
```

### 📥 방법 2. DMG 직접 다운로드

1. 아래에서 내 Mac 칩에 맞는 파일 받기:

| 파일 | 크기 | 대상 |
|---|---|---|
| 🍎 [**Apple Silicon**](https://github.com/project-hh-com/turtle-alert/releases/latest/download/TurtleAlert-0.5.0-arm64.dmg) | 162MB | M1/M2/M3/M4 |
| 💻 [**Intel**](https://github.com/project-hh-com/turtle-alert/releases/latest/download/TurtleAlert-0.5.0.dmg) | 167MB | Intel Mac |

터미널에서 내 칩 확인:
```bash
uname -m   # arm64 = Apple Silicon, x86_64 = Intel
```

2. DMG 더블클릭 → **거북이경보 아이콘을 Applications 폴더로 드래그**

3. **⚠️ 중요**: 이 앱은 Apple Developer ID 로 서명되지 않아 Gatekeeper가 **"손상되어 열 수 없습니다"** 경고를 표시합니다. 터미널에서 아래 한 줄을 실행해 격리 속성을 제거하세요:

```bash
xattr -dr com.apple.quarantine /Applications/TurtleAlert.app
```

이후로는 Finder 더블클릭으로 정상 실행됩니다.

> 📝 `TurtleAlert.app` 은 내부 번들 이름이고, 실제로 앱을 열면 "거북이경보" 로 표시됩니다.

---

## 🎯 사용 방법

1. 앱 실행 시 **상단 메뉴바에 🐢 이모지** 등장
2. **🐢 클릭** → 메뉴 표시
3. **"시작"** 선택 → 타이머 작동 시작
4. **"알림 간격"** 서브메뉴에서 15분 / 30분 / 45분 / 1시간 선택
5. 설정한 시간마다 **🚨 거북이경보 발령!** 알림 + 랜덤 스트레칭 가이드

### 기능 요약

| 기능 | 설명 |
|---|---|
| 🕐 **실시간 남은 시간** | 메뉴바에 `🐢 29:59` 형태로 표시 |
| 🔔 **macOS 네이티브 알림** | 알림 센터에서 확인 가능 |
| 📊 **일일 카운트** | 오늘 스트레칭 완료 횟수 자동 집계 |
| 💾 **설정 영구 저장** | 앱 재시작해도 간격 유지 |

---

## 📝 참고

- 앱을 완전히 종료하려면: 메뉴바 🐢 클릭 → **"종료"**
- 타이머만 중지: **"중지"** 선택 (앱은 계속 실행)
- 이슈/건의: [GitHub Issues](https://github.com/project-hh-com/turtle-alert/issues)
