const STRETCHES = [
  {
    name: "목 좌우 스트레칭",
    desc: "고개를 천천히 좌우로 기울여 10초씩 유지하세요",
    emoji: "🧘",
  },
  {
    name: "어깨 으쓱",
    desc: "어깨를 귀까지 올렸다 힘을 빼고 떨어뜨리세요 (5회)",
    emoji: "💪",
  },
  {
    name: "고개 뒤로",
    desc: "턱을 뒤로 당겨 이중턱을 만들고 10초 유지하세요",
    emoji: "🐢",
  },
  {
    name: "가슴 펴기",
    desc: "양손을 뒤로 깍지 끼고 가슴을 활짝 펴세요",
    emoji: "🙆",
  },
  {
    name: "눈 운동",
    desc: "20초간 20피트(6m) 밖을 바라보세요 (20-20-20 규칙)",
    emoji: "👀",
  },
  {
    name: "허리 비틀기",
    desc: "의자에 앉은 채 상체를 좌우로 비틀어 스트레칭하세요",
    emoji: "🔄",
  },
  {
    name: "손목 스트레칭",
    desc: "손을 앞으로 뻗고 반대 손으로 손가락을 당겨주세요",
    emoji: "🤚",
  },
  {
    name: "일어서기",
    desc: "자리에서 일어나 30초간 제자리 걸음을 하세요",
    emoji: "🚶",
  },
];

const path = require("path");
const fs = require("fs");
const { execFile } = require("child_process");

const SNAPSHOT_CONSECUTIVE_FAIL_LIMIT = 3;

/**
 * imagesnap 바이너리 사용 가능 여부를 확인합니다.
 * @returns {Promise<boolean>}
 */
function checkImagesnap() {
  return new Promise((resolve) => {
    execFile("which", ["imagesnap"], (err) => {
      resolve(!err);
    });
  });
}

/**
 * 노트북 카메라로 스냅샷을 촬영하여 지정 경로에 저장합니다.
 * @param {string} savePath - 저장 폴더 경로
 * @returns {Promise<string>} 저장된 파일 경로
 */
function captureSnapshot(savePath) {
  fs.mkdirSync(savePath, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `거북이-${timestamp}.jpg`;
  const filepath = path.join(savePath, filename);

  return new Promise((resolve, reject) => {
    execFile("imagesnap", ["-q", filepath], (err) => {
      if (err) return reject(err);
      resolve(filepath);
    });
  });
}

/**
 * 보관 기간이 지난 스냅샷 파일을 삭제합니다.
 * @param {string} savePath - 스냅샷 폴더 경로
 * @param {number} retentionDays - 보관 기간 (일)
 * @returns {number} 삭제된 파일 수
 */
function cleanOldSnapshots(savePath, retentionDays) {
  if (!fs.existsSync(savePath)) return 0;

  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  let deleted = 0;

  const files = fs.readdirSync(savePath);
  for (const file of files) {
    if (!file.startsWith("거북이-") || !file.endsWith(".jpg")) continue;
    const filepath = path.join(savePath, file);
    try {
      const stat = fs.statSync(filepath);
      if (stat.mtimeMs < cutoff) {
        fs.unlinkSync(filepath);
        deleted++;
      }
    } catch {
      // 파일 접근 실패 시 건너뜀
    }
  }

  return deleted;
}

/**
 * 스냅샷 폴더의 총 용량을 바이트 단위로 계산합니다.
 * @param {string} savePath - 스냅샷 폴더 경로
 * @returns {number} 총 바이트
 */
function getSnapshotFolderSize(savePath) {
  if (!fs.existsSync(savePath)) return 0;

  let total = 0;
  const files = fs.readdirSync(savePath);
  for (const file of files) {
    if (!file.startsWith("거북이-") || !file.endsWith(".jpg")) continue;
    const stat = fs.statSync(path.join(savePath, file));
    total += stat.size;
  }
  return total;
}

function pickRandomStretch() {
  return STRETCHES[Math.floor(Math.random() * STRETCHES.length)];
}

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function resetDailyCount(store) {
  const today = new Date().toDateString();
  if (store.get("lastResetDate") !== today) {
    store.set("alertCount", 0);
    store.set("lastResetDate", today);
  }
}

/**
 * 앱 코어 로직 팩토리 — Electron 의존성을 주입받아 테스트 가능하게 만듦
 */
function createAppCore(deps) {
  const { Notification, Menu, app, store, shell } = deps;

  let tray = null;
  let timer = null;
  let remainSec = 0;
  let isRunning = false;
  let nextAlertTime = 0;
  let snapshotFailCount = 0;
  let imagesnapAvailable = false;

  // 앱 시작 시 imagesnap 존재 여부 확인
  checkImagesnap().then((available) => {
    imagesnapAvailable = available;
  });

  function sendAlert() {
    const stretch = pickRandomStretch();
    const count = store.get("alertCount") + 1;
    store.set("alertCount", count);

    const soundEnabled = store.get("soundEnabled");
    const notification = new Notification({
      title: "🚨 거북이경보 발령!",
      body: `${stretch.emoji} ${stretch.name}\n${stretch.desc}`,
      silent: !soundEnabled,
      urgency: "critical",
    });

    notification.show();

    // 스냅샷 촬영 (fire-and-forget)
    if (store.get("snapshotEnabled")) {
      const savePath = store.get("snapshotSavePath");
      captureSnapshot(savePath)
        .then(() => {
          snapshotFailCount = 0;
        })
        .catch(() => {
          snapshotFailCount++;
          if (snapshotFailCount >= SNAPSHOT_CONSECUTIVE_FAIL_LIMIT) {
            store.set("snapshotEnabled", false);
            snapshotFailCount = 0;
            const failNotice = new Notification({
              title: "📸 스냅샷 자동 비활성화",
              body: "연속 3회 촬영 실패로 자세 스냅샷을 껐습니다.",
              silent: true,
            });
            failNotice.show();
            updateTrayMenu();
          }
        });
    }

    updateTrayMenu();
  }

  function updateTrayTitle() {
    if (!tray) return;
    if (isRunning) {
      tray.setTitle(`🐢 ${formatTime(remainSec)}`);
    } else {
      tray.setTitle("🐢");
    }
  }

  function startTimer(intervalMin) {
    stopTimer();
    store.set("intervalMin", intervalMin);
    const intervalMs = intervalMin * 60 * 1000;
    nextAlertTime = Date.now() + intervalMs;
    isRunning = true;

    timer = setInterval(() => {
      remainSec = Math.max(0, Math.ceil((nextAlertTime - Date.now()) / 1000));
      if (remainSec <= 0) {
        sendAlert();
        nextAlertTime = Date.now() + intervalMs;
        remainSec = intervalMin * 60;
      }
      updateTrayTitle();
    }, 1000);

    updateTrayTitle();
    updateTrayMenu();
  }

  function stopTimer() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    isRunning = false;
    remainSec = 0;
    nextAlertTime = 0;
    updateTrayTitle();
    updateTrayMenu();
  }

  function updateTrayMenu() {
    if (!tray) return;
    resetDailyCount(store);
    const intervalMin = store.get("intervalMin");
    const alertCount = store.get("alertCount");
    const soundEnabled = store.get("soundEnabled");
    const autoStart = store.get("autoStart");

    const contextMenu = Menu.buildFromTemplate([
      {
        label: isRunning ? `실행 중 — ${intervalMin}분 간격` : "대기 중",
        enabled: false,
      },
      {
        label: "🐢 감시 시작!",
        enabled: !isRunning,
        click: () => {
          startTimer(store.get("intervalMin"));
          const notification = new Notification({
            title: "🐢 거북이경보 시작!",
            body: "지금부터 자세 감시 들어간다~ 거북이 되지 말자!",
            silent: !store.get("soundEnabled"),
            urgency: "critical",
          });
          notification.show();
        },
      },
      { type: "separator" },
      {
        label: isRunning ? "중지" : "시작",
        click: () => {
          if (isRunning) {
            stopTimer();
          } else {
            startTimer(intervalMin);
          }
        },
      },
      {
        label: "지금 스트레칭!",
        click: () => {
          sendAlert();
          if (isRunning) {
            nextAlertTime = Date.now() + store.get("intervalMin") * 60 * 1000;
          }
        },
      },
      { type: "separator" },
      {
        label: "알림 간격",
        submenu: [
          {
            label: "15분",
            type: "radio",
            checked: intervalMin === 15,
            click: () => startTimer(15),
          },
          {
            label: "30분",
            type: "radio",
            checked: intervalMin === 30,
            click: () => startTimer(30),
          },
          {
            label: "45분",
            type: "radio",
            checked: intervalMin === 45,
            click: () => startTimer(45),
          },
          {
            label: "1시간",
            type: "radio",
            checked: intervalMin === 60,
            click: () => startTimer(60),
          },
        ],
      },
      { type: "separator" },
      {
        label: "알림 소리",
        type: "checkbox",
        checked: soundEnabled,
        click: () => {
          store.set("soundEnabled", !soundEnabled);
          updateTrayMenu();
        },
      },
      {
        label: imagesnapAvailable
          ? `자세 스냅샷 (카메라)${store.get("snapshotEnabled") ? " 📸" : ""}`
          : "자세 스냅샷 (imagesnap 필요)",
        type: "checkbox",
        checked: store.get("snapshotEnabled"),
        enabled: imagesnapAvailable,
        click: () => {
          const willEnable = !store.get("snapshotEnabled");
          store.set("snapshotEnabled", willEnable);
          if (willEnable) {
            snapshotFailCount = 0;
          }
          updateTrayMenu();
        },
      },
      {
        label: "  📂 스냅샷 폴더 열기",
        click: () => {
          const savePath = store.get("snapshotSavePath");
          fs.mkdirSync(savePath, { recursive: true });
          if (shell) shell.openPath(savePath);
        },
      },
      {
        label: "로그인 시 자동 실행",
        type: "checkbox",
        checked: autoStart,
        click: () => {
          const newValue = !autoStart;
          store.set("autoStart", newValue);
          app.setLoginItemSettings({ openAtLogin: newValue });
          updateTrayMenu();
        },
      },
      { type: "separator" },
      {
        label: `오늘 스트레칭: ${alertCount}회`,
        enabled: false,
      },
      { type: "separator" },
      {
        label: "종료",
        click: () => {
          stopTimer();
          app.quit();
        },
      },
    ]);

    tray.setContextMenu(contextMenu);
  }

  function handleResume() {
    if (!isRunning) return;
    remainSec = Math.max(0, Math.ceil((nextAlertTime - Date.now()) / 1000));
    if (remainSec <= 0) {
      sendAlert();
      nextAlertTime = Date.now() + store.get("intervalMin") * 60 * 1000;
    }
    updateTrayTitle();
  }

  return {
    sendAlert,
    updateTrayTitle,
    startTimer,
    stopTimer,
    updateTrayMenu,
    handleResume,
    getState: () => ({ timer, remainSec, isRunning, tray, nextAlertTime, imagesnapAvailable, snapshotFailCount }),
    setState: (state) => {
      if ("timer" in state) timer = state.timer;
      if ("remainSec" in state) remainSec = state.remainSec;
      if ("isRunning" in state) isRunning = state.isRunning;
      if ("tray" in state) tray = state.tray;
      if ("nextAlertTime" in state) nextAlertTime = state.nextAlertTime;
      if ("imagesnapAvailable" in state) imagesnapAvailable = state.imagesnapAvailable;
      if ("snapshotFailCount" in state) snapshotFailCount = state.snapshotFailCount;
    },
  };
}

module.exports = {
  STRETCHES,
  pickRandomStretch,
  formatTime,
  resetDailyCount,
  createAppCore,
  captureSnapshot,
  cleanOldSnapshots,
  getSnapshotFolderSize,
  checkImagesnap,
  SNAPSHOT_CONSECUTIVE_FAIL_LIMIT,
};
