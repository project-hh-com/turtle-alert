const STRETCHES = [
  // 목
  { name: "목 좌우 스트레칭", desc: "고개를 천천히 좌우로 기울여 10초씩 유지하세요", emoji: "🧘" },
  { name: "목 앞뒤 스트레칭", desc: "턱을 가슴 쪽으로 당긴 후 천장을 바라보며 10초씩 유지하세요", emoji: "🙏" },
  { name: "목 돌리기", desc: "고개를 시계 방향으로 천천히 5바퀴, 반시계로 5바퀴 돌리세요", emoji: "🔃" },
  { name: "고개 뒤로", desc: "턱을 뒤로 당겨 이중턱을 만들고 10초 유지하세요", emoji: "🐢" },
  // 어깨
  { name: "어깨 으쓱", desc: "어깨를 귀까지 올렸다 힘을 빼고 떨어뜨리세요 (5회)", emoji: "💪" },
  { name: "어깨 돌리기", desc: "어깨를 앞으로 10회, 뒤로 10회 크게 돌리세요", emoji: "🔄" },
  { name: "팔 뒤로 깍지", desc: "등 뒤에서 양손을 깍지 끼고 위로 들어올리세요 (10초)", emoji: "🤝" },
  { name: "팔 교차 스트레칭", desc: "한쪽 팔을 반대쪽으로 당겨 어깨 뒤를 늘려주세요 (좌우 10초)", emoji: "💫" },
  // 가슴·등
  { name: "가슴 펴기", desc: "양손을 뒤로 깍지 끼고 가슴을 활짝 펴세요", emoji: "🙆" },
  { name: "고양이 자세", desc: "의자에서 등을 둥글게 말았다가 반대로 젖히세요 (5회)", emoji: "🐱" },
  { name: "등 비틀기", desc: "의자에 앉은 채 상체를 좌우로 비틀어 등을 늘려주세요", emoji: "🌀" },
  // 허리·골반
  { name: "허리 숙이기", desc: "의자에 앉아 상체를 천천히 앞으로 숙여 바닥을 향해 10초 유지하세요", emoji: "🙇" },
  { name: "골반 틸트", desc: "의자에 앉아 골반을 앞뒤로 천천히 기울이세요 (10회)", emoji: "🪑" },
  // 손·손목
  { name: "손목 스트레칭", desc: "손을 앞으로 뻗고 반대 손으로 손가락을 당겨주세요", emoji: "🤚" },
  { name: "손가락 펴기", desc: "주먹을 꽉 쥐었다 손가락을 활짝 펴세요 (10회)", emoji: "✋" },
  { name: "손목 돌리기", desc: "양손을 주먹 쥐고 손목을 안팎으로 10바퀴씩 돌리세요", emoji: "👊" },
  // 눈
  { name: "눈 운동", desc: "20초간 20피트(6m) 밖을 바라보세요 (20-20-20 규칙)", emoji: "👀" },
  { name: "눈 깜빡이기", desc: "의식적으로 눈을 20번 깜빡여 안구 건조를 예방하세요", emoji: "😌" },
  { name: "눈 팔자 운동", desc: "눈으로 ∞ 모양을 천천히 5번 그리세요", emoji: "♾️" },
  // 다리
  { name: "발목 돌리기", desc: "발을 들고 발목을 시계/반시계 방향으로 10바퀴씩 돌리세요", emoji: "🦶" },
  { name: "무릎 펴기", desc: "의자에 앉아 한쪽 다리를 쭉 펴서 5초 유지하세요 (좌우 5회)", emoji: "🦵" },
  { name: "종아리 스트레칭", desc: "벽에 손을 짚고 한 발을 뒤로 빼 종아리를 늘려주세요 (좌우 15초)", emoji: "🏃" },
  // 전신
  { name: "일어서기", desc: "자리에서 일어나 30초간 제자리 걸음을 하세요", emoji: "🚶" },
  { name: "기지개", desc: "양팔을 머리 위로 쭉 뻗고 온몸을 늘려주세요 (10초)", emoji: "🙌" },
  { name: "스쿼트", desc: "자리에서 일어나 가볍게 스쿼트 10회를 해보세요", emoji: "🏋️" },
  // 호흡
  { name: "심호흡", desc: "4초 들이쉬고, 4초 멈추고, 4초 내쉬세요 (3회 반복)", emoji: "🌬️" },
  { name: "복식호흡", desc: "배를 부풀리며 코로 들이쉬고 입으로 천천히 내쉬세요 (5회)", emoji: "🫁" },
];

const path = require("path");
const fs = require("fs");
const { execFile } = require("child_process");
const {
  initDetector,
  captureAndAnalyze,
  disposeDetector,
} = require("./lib/posture-capture");
const {
  DEFAULT_CHECK_INTERVAL_SEC,
  CONSECUTIVE_BAD_THRESHOLD,
} = require("./lib/posture-detector");
const { getImagesnapPath } = require("./lib/imagesnap-path");
const { startUpdateChecker } = require("./lib/update-check");

const SNAPSHOT_CONSECUTIVE_FAIL_LIMIT = 3;

/**
 * imagesnap 바이너리 사용 가능 여부를 확인합니다.
 * @returns {Promise<boolean>}
 */
function checkImagesnap() {
  return new Promise((resolve) => {
    const imagesnap = getImagesnapPath();
    if (imagesnap !== "imagesnap") {
      resolve(true);
      return;
    }
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
    execFile(getImagesnapPath(), ["-q", filepath], (err) => {
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
  let alertFlashTimer = null;
  let badPosture = false;
  let postureTimer = null;
  let postureDetectorReady = false;
  let postureDetectorLoading = false;
  let consecutiveBadCount = 0;
  let availableUpdateTag = null;
  let availableUpdateUrl = null;

  // 앱 시작 시 imagesnap 존재 여부 확인
  checkImagesnap().then((available) => {
    imagesnapAvailable = available;
  });

  // 업데이트 체커 시작 (새 버전 알림만, 자동 설치 X)
  startUpdateChecker({
    getCurrentVersion: () => app.getVersion(),
    onUpdateAvailable: (tag) => {
      const notification = new Notification({
        title: `🆕 거북이경보 ${tag} 업데이트`,
        body: "새 버전이 올라왔어요. 트레이 메뉴에서 받아보세요!",
        silent: !store.get("soundEnabled"),
      });
      notification.show();
    },
    onCheck: (tag, url) => {
      availableUpdateTag = tag;
      availableUpdateUrl = url;
      updateTrayMenu();
    },
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
    flashStretchAlert();

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

  function flashStretchAlert() {
    if (!tray) return;
    if (alertFlashTimer) {
      clearTimeout(alertFlashTimer);
      alertFlashTimer = null;
    }

    const STRETCH_ICON_DURATION_MS = 10000;
    alertFlashTimer = setTimeout(() => {
      alertFlashTimer = null;
      updateTrayTitle();
    }, STRETCH_ICON_DURATION_MS);

    updateTrayTitle();
  }

  function setPostureBad() {
    badPosture = true;
    updateTrayTitle();
  }

  function setPostureGood() {
    badPosture = false;
    updateTrayTitle();
  }

  function getTrayIcon() {
    if (alertFlashTimer) return "🙌🏻";
    if (store.get("postureCheckEnabled")) {
      return badPosture ? "🐢" : "🙂";
    }
    return "🐢";
  }

  function updateTrayTitle() {
    if (!tray) return;
    tray.setTitle(getTrayIcon());
  }

  function startTimer(intervalMin) {
    stopTimer();
    store.set("intervalMin", intervalMin);
    const intervalMs = intervalMin * 60 * 1000;
    nextAlertTime = Date.now() + intervalMs;
    remainSec = intervalMin * 60;
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
    if (alertFlashTimer) {
      clearTimeout(alertFlashTimer);
      alertFlashTimer = null;
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

    const updateMenuItems = availableUpdateTag
      ? [
          {
            label: `🆕 새 버전 ${availableUpdateTag} 받기`,
            click: () => shell.openExternal(availableUpdateUrl),
          },
          { type: "separator" },
        ]
      : [];

    const contextMenu = Menu.buildFromTemplate([
      ...updateMenuItems,
      {
        label: isRunning
          ? `⏱ ${formatTime(remainSec)} 남음 (${intervalMin}분 간격) — 메뉴를 다시 열면 갱신`
          : "대기 중",
        enabled: false,
      },
      {
        label: isRunning ? "⏸ 중지" : "🐢 감시 시작!",
        click: () => {
          if (isRunning) {
            stopTimer();
          } else {
            startTimer(store.get("intervalMin"));
            const isAiMode = store.get("postureCheckEnabled");
            const notification = new Notification({
              title: isAiMode ? "🤖 AI 자세 감시 시작!" : "🐢 거북이경보 시작!",
              body: isAiMode
                ? "AI가 자세를 감시합니다. 바르게 앉아주세요!"
                : "스트레칭 알림이 울릴 때마다 자세를 바로잡아주세요!",
              silent: !store.get("soundEnabled"),
              urgency: "critical",
            });
            notification.show();
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
            label: "5분",
            type: "radio",
            checked: intervalMin === 5,
            click: () => startTimer(5),
          },
          {
            label: "10분",
            type: "radio",
            checked: intervalMin === 10,
            click: () => startTimer(10),
          },
          {
            label: "15분",
            type: "radio",
            checked: intervalMin === 15,
            click: () => startTimer(15),
          },
          {
            label: "20분",
            type: "radio",
            checked: intervalMin === 20,
            click: () => startTimer(20),
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
          : "자세 스냅샷 (카메라 사용 불가)",
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
      { type: "separator" },
      {
        label: "감시 모드",
        submenu: [
          {
            label: "⏰ 알림만 (타이머)",
            type: "radio",
            checked: !store.get("postureCheckEnabled"),
            click: () => {
              if (store.get("postureCheckEnabled")) {
                store.set("postureCheckEnabled", false);
                stopPostureCheck();
                if (badPosture) setPostureGood();
                updateTrayMenu();
              }
            },
          },
          {
            label: postureDetectorLoading
              ? "🤖 AI 자세 검사 (모델 로딩 중...)"
              : !imagesnapAvailable
                ? "🤖 AI 자세 검사 (카메라 사용 불가)"
                : "🤖 AI 자세 검사 (알림 + 카메라)",
            type: "radio",
            checked: store.get("postureCheckEnabled") || false,
            enabled: imagesnapAvailable && !postureDetectorLoading,
            click: () => {
              if (!store.get("postureCheckEnabled")) {
                store.set("postureCheckEnabled", true);
                loadPostureDetector().then(() => {
                  if (postureDetectorReady) {
                    startPostureCheck();
                  } else {
                    store.set("postureCheckEnabled", false);
                    const failNotice = new Notification({
                      title: "🤖 자세 감시 AI 로드 실패",
                      body: "TensorFlow.js 모델을 불러올 수 없습니다. 의존성을 확인해주세요.",
                      silent: true,
                    });
                    failNotice.show();
                  }
                  updateTrayMenu();
                });
              }
              updateTrayMenu();
            },
          },
          { type: "separator" },
          {
            label: "감시 간격",
            enabled: store.get("postureCheckEnabled") || false,
            submenu: [
              { label: "20초", type: "radio", checked: store.get("postureCheckInterval") === 20, click: () => { store.set("postureCheckInterval", 20); if (store.get("postureCheckEnabled")) startPostureCheck(); updateTrayMenu(); } },
              { label: "40초", type: "radio", checked: store.get("postureCheckInterval") === 40, click: () => { store.set("postureCheckInterval", 40); if (store.get("postureCheckEnabled")) startPostureCheck(); updateTrayMenu(); } },
              { label: "1분", type: "radio", checked: store.get("postureCheckInterval") === 60, click: () => { store.set("postureCheckInterval", 60); if (store.get("postureCheckEnabled")) startPostureCheck(); updateTrayMenu(); } },
              { label: "2분", type: "radio", checked: store.get("postureCheckInterval") === 120, click: () => { store.set("postureCheckInterval", 120); if (store.get("postureCheckEnabled")) startPostureCheck(); updateTrayMenu(); } },
              { label: "5분", type: "radio", checked: store.get("postureCheckInterval") === 300, click: () => { store.set("postureCheckInterval", 300); if (store.get("postureCheckEnabled")) startPostureCheck(); updateTrayMenu(); } },
            ],
          },
        ],
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
          stopPostureCheck();
          disposeDetector();
          app.quit();
        },
      },
    ]);

    tray.setContextMenu(contextMenu);
  }

  // -- 자세 감시 (AI) --

  const POSTURE_ALERT_MESSAGES = {
    "거북목": {
      title: "🚨 거북목 감지!",
      body: "🐢 목이 앞으로 나왔어요! 턱을 뒤로 당기고 귀가 어깨 위에 오도록 자세를 교정하세요.",
    },
    "어깨 기울어짐": {
      title: "🚨 자세가 삐뚤어졌어요!",
      body: "↔️ 어깨가 한쪽으로 기울었어요. 양쪽 어깨 높이를 맞추고 허리를 펴세요.",
    },
    "고개 전방 돌출": {
      title: "🚨 고개가 앞으로 나왔어요!",
      body: "😮 모니터에 너무 가까이 다가갔어요. 등을 의자에 붙이고 모니터와 팔 길이 거리를 유지하세요.",
    },
    "고개 회전": {
      title: "🚨 고개가 돌아갔어요!",
      body: "🔄 고개가 한쪽으로 많이 돌아갔어요. 모니터를 정면으로 바라보세요.",
    },
    "화면에 너무 가까움": {
      title: "🚨 모니터에 너무 가까워요!",
      body: "📏 화면에 너무 가까이 다가갔어요. 등을 의자에 붙이고 팔 길이 거리를 유지하세요.",
    },
    "고개 기울어짐": {
      title: "🚨 고개가 기울었어요!",
      body: "↗️ 고개가 한쪽으로 기울었어요. 양쪽 귀 높이를 맞추고 바르게 앉으세요.",
    },
    "한쪽으로 기울어짐": {
      title: "🚨 몸이 기울었어요!",
      body: "⚖️ 몸이 한쪽으로 기울었어요. 모니터 정면에 앉아주세요.",
    },
    "구부정한 자세": {
      title: "🚨 자세가 구부정해졌어요!",
      body: "📐 점점 웅크리고 있어요! 허리를 펴고 등을 의자에 붙이세요.",
    },
  };

  /* c8 ignore start */
  async function loadPostureDetector() {
    if (postureDetectorReady || postureDetectorLoading) return;
    postureDetectorLoading = true;
    const success = await initDetector();
    postureDetectorReady = success;
    postureDetectorLoading = false;
    updateTrayMenu();
  }

  function sendPostureAlert(issues) {
    const soundEnabled = store.get("soundEnabled");
    const firstIssue = issues[0];
    const msg = POSTURE_ALERT_MESSAGES[firstIssue] || {
      title: "🚨 자세 교정 필요!",
      body: `감지된 문제: ${issues.join(", ")}. 바른 자세로 앉아주세요!`,
    };

    const notification = new Notification({
      title: msg.title,
      body: issues.length > 1
        ? `${msg.body}\n(추가 감지: ${issues.slice(1).join(", ")})`
        : msg.body,
      silent: !soundEnabled,
      urgency: "critical",
    });
    notification.show();
    setPostureBad();
  }

  async function runPostureCheck() {
    if (!postureDetectorReady) return;

    try {
      const result = await captureAndAnalyze();
      const isActuallyBad = !result.isGood && result.issues.length > 0 && !result.issues.includes("키포인트 신뢰도 부족");
      const isUncertain = result.issues.includes("키포인트 신뢰도 부족") || result.issues.includes("포즈를 감지하지 못했습니다") || result.issues.includes("어깨 간격이 너무 좁습니다");

      if (isActuallyBad) {
        consecutiveBadCount++;
        if (consecutiveBadCount >= CONSECUTIVE_BAD_THRESHOLD) {
          sendPostureAlert(result.issues);
          // 알림 후에도 badPosture 유지 — 정자세 복귀까지 🐢 아이콘 유지
        }
      } else if (!isUncertain) {
        // 확실히 좋은 자세일 때만 복귀
        consecutiveBadCount = 0;
        if (badPosture) {
          setPostureGood();
        }
      }
      // isUncertain이면 현재 상태 유지 (판단 불가)
    } catch {
      // 촬영/분석 실패 시 무시 (카메라 사용 중 등)
    }
  }

  /* c8 ignore stop */

  function startPostureCheck() {
    stopPostureCheck();
    const intervalSec = store.get("postureCheckInterval") || DEFAULT_CHECK_INTERVAL_SEC;
    postureTimer = setInterval(runPostureCheck, intervalSec * 1000);
    // 시작 직후 1회 체크
    runPostureCheck();
  }

  function stopPostureCheck() {
    if (postureTimer) {
      clearInterval(postureTimer);
      postureTimer = null;
    }
    consecutiveBadCount = 0;
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
    loadPostureDetector,
    startPostureCheck,
    stopPostureCheck,
    setPostureBad,
    setPostureGood,
    getState: () => ({ timer, remainSec, isRunning, tray, nextAlertTime, imagesnapAvailable, snapshotFailCount, postureDetectorReady, postureDetectorLoading, badPosture }),
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
