// uncaughtException 핸들러는 모듈 로드 후 등록 (아래 참조)

const {
  app,
  Tray,
  Menu,
  Notification,
  nativeImage,
  dialog,
  powerMonitor,
  systemPreferences,
  shell,
} = require("electron");
const path = require("path");
const Store = require("electron-store");
const { createAppCore, cleanOldSnapshots } = require("./lib");

process.on("uncaughtException", (error) => {
  try {
    if (app.isReady()) {
      dialog.showErrorBox(
        "거북이경보 오류",
        `앱에서 오류가 발생했습니다.\n\n${error.message}`
      );
    }
  } catch (_ignored) {
    // 복구 불가 상태 — 무시
  }
  process.exit(1);
});

let store;
let core;

app.whenReady().then(() => {
  // 메뉴바 전용 앱 — Dock 아이콘 숨김
  app.dock?.hide();

  // Store 초기화 — app.getPath()는 ready 이후에만 안전
  store = new Store({
    defaults: {
      intervalMin: 30,
      alertCount: 0,
      lastResetDate: new Date().toDateString(),
      autoStart: false,
      soundEnabled: true,
      snapshotEnabled: false,
      snapshotSavePath: path.join(app.getPath("home"), "거북이경보-스냅샷"),
      snapshotRetentionDays: 30,
      postureCheckEnabled: false,
      postureCheckInterval: 40,
    },
    clearInvalidConfig: true,
  });

  core = createAppCore({ Notification, Menu, app, store, systemPreferences, shell });

  // 16x16 투명 PNG (유효한 이미지 버퍼) — 실제 표시는 setTitle의 이모지로
  // nativeImage.createEmpty()는 Electron 41+ macOS에서 CrBrowserMain 크래시 유발
  const TRANSPARENT_PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAADklEQVQ4jWNgGAWDEwAAAhAAATnStMoAAAAASUVORK5CYII=",
    "base64"
  );
  const trayIcon = nativeImage.createFromBuffer(TRANSPARENT_PNG, {
    width: 16,
    height: 16,
  });
  trayIcon.setTemplateImage(true);
  const tray = new Tray(trayIcon);
  tray.setTitle("🙂");
  tray.setToolTip("거북이경보");
  tray.on("click", () => core.updateTrayMenu());
  tray.on("right-click", () => core.updateTrayMenu());
  core.setState({ tray });
  core.updateTrayMenu();

  // 로그인 시 자동 실행 설정 동기화
  app.setLoginItemSettings({ openAtLogin: store.get("autoStart") });

  // 앱 시작 시 오래된 스냅샷 정리
  cleanOldSnapshots(
    store.get("snapshotSavePath"),
    store.get("snapshotRetentionDays")
  );

  // 카메라 권한 확인 후 자세 감시 복원
  if (store.get("postureCheckEnabled")) {
    const cameraStatus = systemPreferences.getMediaAccessStatus("camera");
    if (cameraStatus === "granted") {
      core.loadPostureDetector().then(() => {
        if (store.get("postureCheckEnabled")) {
          core.startPostureCheck();
        }
      });
    } else {
      // 권한 없으면 비활성화
      store.set("postureCheckEnabled", false);
    }
  }

  // 시스템 슬립 복귀 시 타이머 상태 재확인
  powerMonitor.on("resume", () => core.handleResume());
});

app.on("window-all-closed", (e) => {
  e.preventDefault();
});
