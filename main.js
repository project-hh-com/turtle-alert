process.on("uncaughtException", (error) => {
  try {
    const { app, dialog } = require("electron");
    if (app.isReady()) {
      dialog.showErrorBox(
        "거북이경보 오류",
        `앱에서 오류가 발생했습니다.\n\n${error.message}`
      );
    }
  } catch (_) {
    // 복구 불가 상태 — 무시
  }
  process.exit(1);
});

const {
  app,
  Tray,
  Menu,
  Notification,
  nativeImage,
  powerMonitor,
} = require("electron");
const Store = require("electron-store");
const { createAppCore } = require("./lib");

const store = new Store({
  defaults: {
    intervalMin: 30,
    alertCount: 0,
    lastResetDate: new Date().toDateString(),
    autoStart: false,
    soundEnabled: true,
  },
  clearInvalidConfig: true,
});

const core = createAppCore({ Notification, Menu, app, store });

app.whenReady().then(() => {
  // 메뉴바 전용 앱 — Dock 아이콘 숨김
  app.dock?.hide();

  // 1x1 투명 PNG — 실제 표시는 setTitle의 이모지로
  const emptyIcon = nativeImage.createEmpty();
  const tray = new Tray(emptyIcon);
  tray.setTitle("🐢");
  tray.setToolTip("거북이경보");
  core.setState({ tray });
  core.updateTrayMenu();

  // 로그인 시 자동 실행 설정 동기화
  app.setLoginItemSettings({ openAtLogin: store.get("autoStart") });

  // 시스템 슬립 복귀 시 타이머 상태 재확인
  powerMonitor.on("resume", () => core.handleResume());
});

app.on("window-all-closed", (e) => {
  e.preventDefault();
});
