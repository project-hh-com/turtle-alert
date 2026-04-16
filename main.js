const { app, Tray, Menu, Notification, nativeImage } = require("electron");
const Store = require("electron-store");

const store = new Store({
  defaults: {
    intervalMin: 30,
    alertCount: 0,
    lastResetDate: new Date().toDateString(),
  },
});

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

let tray = null;
let timer = null;
let remainSec = 0;
let isRunning = false;
let titleUpdateTimer = null;

function pickRandomStretch() {
  return STRETCHES[Math.floor(Math.random() * STRETCHES.length)];
}

function resetDailyCount() {
  const today = new Date().toDateString();
  if (store.get("lastResetDate") !== today) {
    store.set("alertCount", 0);
    store.set("lastResetDate", today);
  }
}

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function sendAlert() {
  const stretch = pickRandomStretch();
  const count = store.get("alertCount") + 1;
  store.set("alertCount", count);

  const notification = new Notification({
    title: "🚨 거북이경보 발령!",
    body: `${stretch.emoji} ${stretch.name}\n${stretch.desc}`,
    sound: "default",
    urgency: "critical",
  });

  notification.show();
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
  remainSec = intervalMin * 60;
  isRunning = true;

  timer = setInterval(() => {
    remainSec--;
    if (remainSec <= 0) {
      sendAlert();
      remainSec = intervalMin * 60;
    }
  }, 1000);

  titleUpdateTimer = setInterval(updateTrayTitle, 1000);
  updateTrayTitle();
  updateTrayMenu();
}

function stopTimer() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  if (titleUpdateTimer) {
    clearInterval(titleUpdateTimer);
    titleUpdateTimer = null;
  }
  isRunning = false;
  remainSec = 0;
  updateTrayTitle();
  updateTrayMenu();
}

function updateTrayMenu() {
  if (!tray) return;
  resetDailyCount();
  const intervalMin = store.get("intervalMin");
  const alertCount = store.get("alertCount");

  const contextMenu = Menu.buildFromTemplate([
    {
      label: isRunning ? `실행 중 — ${intervalMin}분 간격` : "대기 중",
      enabled: false,
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

app.whenReady().then(() => {
  // 메뉴바 전용 앱 — Dock 아이콘 숨김
  app.dock?.hide();

  // 1x1 투명 PNG — 실제 표시는 setTitle의 이모지로
  const emptyIcon = nativeImage.createEmpty();
  tray = new Tray(emptyIcon);
  tray.setTitle("🐢");
  tray.setToolTip("거북이경보");
  updateTrayMenu();
});

app.on("window-all-closed", (e) => {
  e.preventDefault();
});
