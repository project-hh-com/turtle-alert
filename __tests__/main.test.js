import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const {
  STRETCHES,
  pickRandomStretch,
  formatTime,
  resetDailyCount,
  createAppCore,
} = await import("../lib.js");

// ===== STRETCHES =====
describe("STRETCHES", () => {
  it("should have 8 stretch items", () => {
    expect(STRETCHES).toHaveLength(8);
  });

  it("should have name, desc, emoji for each stretch", () => {
    for (const stretch of STRETCHES) {
      expect(typeof stretch.name).toBe("string");
      expect(typeof stretch.desc).toBe("string");
      expect(typeof stretch.emoji).toBe("string");
    }
  });
});

// ===== pickRandomStretch =====
describe("pickRandomStretch", () => {
  it("should return a valid stretch object", () => {
    const stretch = pickRandomStretch();
    expect(stretch).toHaveProperty("name");
    expect(stretch).toHaveProperty("desc");
    expect(stretch).toHaveProperty("emoji");
  });

  it("should return items from STRETCHES array", () => {
    for (let i = 0; i < 20; i++) {
      expect(STRETCHES).toContain(pickRandomStretch());
    }
  });

  it("should use Math.random for index selection", () => {
    const spy = vi.spyOn(Math, "random").mockReturnValue(0);
    expect(pickRandomStretch()).toBe(STRETCHES[0]);
    spy.mockReturnValue(0.999);
    expect(pickRandomStretch()).toBe(STRETCHES[7]);
    spy.mockRestore();
  });
});

// ===== formatTime =====
describe("formatTime", () => {
  it("should format 0 seconds as 00:00", () => {
    expect(formatTime(0)).toBe("00:00");
  });

  it("should format seconds only", () => {
    expect(formatTime(5)).toBe("00:05");
    expect(formatTime(59)).toBe("00:59");
  });

  it("should format minutes and seconds", () => {
    expect(formatTime(60)).toBe("01:00");
    expect(formatTime(90)).toBe("01:30");
    expect(formatTime(600)).toBe("10:00");
  });

  it("should pad single digits with leading zero", () => {
    expect(formatTime(61)).toBe("01:01");
    expect(formatTime(3599)).toBe("59:59");
  });

  it("should handle large values", () => {
    expect(formatTime(3600)).toBe("60:00");
  });
});

// ===== resetDailyCount =====
describe("resetDailyCount", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-17T10:00:00"));
  });
  afterEach(() => { vi.useRealTimers(); });

  it("should not reset count if same day", () => {
    const store = {
      get: vi.fn((k) => ({ lastResetDate: new Date("2026-04-17").toDateString(), alertCount: 5 })[k]),
      set: vi.fn(),
    };
    resetDailyCount(store);
    expect(store.set).not.toHaveBeenCalled();
  });

  it("should reset count if different day", () => {
    const data = { lastResetDate: new Date("2026-04-16").toDateString(), alertCount: 10 };
    const store = {
      get: vi.fn((k) => data[k]),
      set: vi.fn((k, v) => { data[k] = v; }),
    };
    resetDailyCount(store);
    expect(store.set).toHaveBeenCalledWith("alertCount", 0);
    expect(store.set).toHaveBeenCalledWith("lastResetDate", new Date("2026-04-17T10:00:00").toDateString());
  });
});

// ===== createAppCore =====
describe("createAppCore", () => {
  let core, mockNotification, mockStore, storeData, mockApp, mockMenu, mockShell;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-17T10:00:00"));
    mockNotification = vi.fn(function() { this.show = vi.fn(); });
    mockMenu = { buildFromTemplate: vi.fn((t) => t) };
    mockApp = { quit: vi.fn(), setLoginItemSettings: vi.fn() };
    mockShell = { openPath: vi.fn() };
    storeData = { intervalMin: 30, alertCount: 0, lastResetDate: new Date("2026-04-17").toDateString(), autoStart: false, soundEnabled: true, snapshotEnabled: false, snapshotSavePath: "/tmp/test-snap" };
    mockStore = { get: vi.fn((k) => storeData[k]), set: vi.fn((k, v) => { storeData[k] = v; }) };
    core = createAppCore({ Notification: mockNotification, Menu: mockMenu, app: mockApp, store: mockStore, shell: mockShell });
  });

  afterEach(() => {
    const state = core.getState();
    if (state.timer) clearInterval(state.timer);
    vi.useRealTimers();
  });

  describe("sendAlert", () => {
    beforeEach(() => { core.setState({ tray: { setContextMenu: vi.fn(), setTitle: vi.fn() } }); });

    it("should increment alertCount", () => {
      storeData.alertCount = 3;
      core.sendAlert();
      expect(storeData.alertCount).toBe(4);
    });

    it("should create notification with critical urgency", () => {
      core.sendAlert();
      expect(mockNotification.mock.calls[0][0].title).toBe("🚨 거북이경보 발령!");
      expect(mockNotification.mock.calls[0][0].urgency).toBe("critical");
    });

    it("should include stretch info in body", () => {
      vi.spyOn(Math, "random").mockReturnValue(0);
      core.sendAlert();
      const body = mockNotification.mock.calls[0][0].body;
      expect(body).toContain(STRETCHES[0].emoji);
      expect(body).toContain(STRETCHES[0].name);
      vi.spyOn(Math, "random").mockRestore();
    });

    it("should set silent=false when soundEnabled", () => {
      storeData.soundEnabled = true;
      core.sendAlert();
      expect(mockNotification.mock.calls[0][0].silent).toBe(false);
    });

    it("should set silent=true when sound disabled", () => {
      storeData.soundEnabled = false;
      core.sendAlert();
      expect(mockNotification.mock.calls[0][0].silent).toBe(true);
    });

    it("should call show()", () => {
      const mockShow = vi.fn();
      mockNotification.mockImplementationOnce(function() { this.show = mockShow; });
      core.sendAlert();
      expect(mockShow).toHaveBeenCalled();
    });
  });

  describe("updateTrayTitle", () => {
    it("should not throw when tray is null", () => {
      core.setState({ tray: null });
      expect(() => core.updateTrayTitle()).not.toThrow();
    });

    it("should show countdown when running", () => {
      const t = { setTitle: vi.fn() };
      core.setState({ tray: t, isRunning: true, remainSec: 125 });
      core.updateTrayTitle();
      expect(t.setTitle).toHaveBeenCalledWith("🐢 02:05");
    });

    it("should show turtle only when stopped", () => {
      const t = { setTitle: vi.fn() };
      core.setState({ tray: t, isRunning: false });
      core.updateTrayTitle();
      expect(t.setTitle).toHaveBeenCalledWith("🐢");
    });
  });

  describe("startTimer", () => {
    let mockTray;
    beforeEach(() => { mockTray = { setTitle: vi.fn(), setContextMenu: vi.fn() }; core.setState({ tray: mockTray }); });

    it("should set isRunning true", () => { core.startTimer(30); expect(core.getState().isRunning).toBe(true); });
    it("should store intervalMin", () => { core.startTimer(45); expect(storeData.intervalMin).toBe(45); });
    it("should set nextAlertTime", () => { core.startTimer(30); expect(core.getState().nextAlertTime).toBe(Date.now() + 30*60*1000); });
    it("should create timer", () => { core.startTimer(30); expect(core.getState().timer).not.toBeNull(); });
    it("should compute remainSec each tick", () => { core.startTimer(1); vi.advanceTimersByTime(1000); expect(core.getState().remainSec).toBe(59); });
    it("should alert at 0 and reset", () => { core.startTimer(1); vi.advanceTimersByTime(60000); expect(mockNotification).toHaveBeenCalled(); expect(core.getState().remainSec).toBe(60); });
    it("should stop previous timer", () => { core.startTimer(15); const f = core.getState().timer; core.startTimer(30); expect(core.getState().timer).not.toBe(f); });
    it("should update title immediately", () => { core.startTimer(30); expect(mockTray.setTitle).toHaveBeenCalled(); });
    it("should update menu", () => { core.startTimer(30); expect(mockTray.setContextMenu).toHaveBeenCalled(); });
  });

  describe("stopTimer", () => {
    let mockTray;
    beforeEach(() => { mockTray = { setTitle: vi.fn(), setContextMenu: vi.fn() }; core.setState({ tray: mockTray }); });

    it("should set isRunning false", () => { core.startTimer(30); core.stopTimer(); expect(core.getState().isRunning).toBe(false); });
    it("should clear timer", () => { core.startTimer(30); core.stopTimer(); expect(core.getState().timer).toBeNull(); });
    it("should reset remainSec", () => { core.startTimer(30); vi.advanceTimersByTime(5000); core.stopTimer(); expect(core.getState().remainSec).toBe(0); });
    it("should reset nextAlertTime", () => { core.startTimer(30); core.stopTimer(); expect(core.getState().nextAlertTime).toBe(0); });
    it("should not throw without timer", () => { expect(() => core.stopTimer()).not.toThrow(); });
    it("should stop countdown", () => { core.startTimer(30); vi.advanceTimersByTime(3000); core.stopTimer(); const s = core.getState().remainSec; vi.advanceTimersByTime(5000); expect(core.getState().remainSec).toBe(s); });
  });

  describe("updateTrayMenu", () => {
    it("should not throw when tray null", () => { core.setState({ tray: null }); expect(() => core.updateTrayMenu()).not.toThrow(); });

    it("should call setContextMenu", () => {
      const t = { setTitle: vi.fn(), setContextMenu: vi.fn() }; core.setState({ tray: t });
      core.updateTrayMenu(); expect(t.setContextMenu).toHaveBeenCalled();
    });

    it("should show running status", () => {
      const t = { setTitle: vi.fn(), setContextMenu: vi.fn() }; core.setState({ tray: t, isRunning: true }); storeData.intervalMin = 30;
      core.updateTrayMenu();
      const tpl = mockMenu.buildFromTemplate.mock.calls.at(-1)[0];
      expect(tpl[0].label).toContain("실행 중"); expect(tpl[0].label).toContain("30분");
    });

    it("should show waiting status", () => {
      const t = { setTitle: vi.fn(), setContextMenu: vi.fn() }; core.setState({ tray: t, isRunning: false });
      core.updateTrayMenu();
      expect(mockMenu.buildFromTemplate.mock.calls.at(-1)[0][0].label).toBe("대기 중");
    });

    it("should display alert count", () => {
      const t = { setTitle: vi.fn(), setContextMenu: vi.fn() }; core.setState({ tray: t }); storeData.alertCount = 7;
      core.updateTrayMenu();
      const ci = mockMenu.buildFromTemplate.mock.calls.at(-1)[0].find((i) => i.label?.includes("오늘 스트레칭"));
      expect(ci.label).toContain("7회");
    });

    it("should have 4 interval options", () => {
      const t = { setTitle: vi.fn(), setContextMenu: vi.fn() }; core.setState({ tray: t });
      core.updateTrayMenu();
      expect(mockMenu.buildFromTemplate.mock.calls.at(-1)[0].find((i) => i.label === "알림 간격").submenu).toHaveLength(4);
    });

    it("should check current interval", () => {
      const t = { setTitle: vi.fn(), setContextMenu: vi.fn() }; core.setState({ tray: t }); storeData.intervalMin = 45;
      core.updateTrayMenu();
      const sub = mockMenu.buildFromTemplate.mock.calls.at(-1)[0].find((i) => i.label === "알림 간격").submenu;
      expect(sub.find((i) => i.label === "45분").checked).toBe(true);
    });

    it("should show stop when running", () => {
      const t = { setTitle: vi.fn(), setContextMenu: vi.fn() }; core.setState({ tray: t, isRunning: true });
      core.updateTrayMenu();
      expect(mockMenu.buildFromTemplate.mock.calls.at(-1)[0].find((i) => i.label === "중지" || i.label === "시작").label).toBe("중지");
    });

    it("should show start when stopped", () => {
      const t = { setTitle: vi.fn(), setContextMenu: vi.fn() }; core.setState({ tray: t, isRunning: false });
      core.updateTrayMenu();
      expect(mockMenu.buildFromTemplate.mock.calls.at(-1)[0].find((i) => i.label === "중지" || i.label === "시작").label).toBe("시작");
    });

    it("should include stretch now button", () => {
      const t = { setTitle: vi.fn(), setContextMenu: vi.fn() }; core.setState({ tray: t });
      core.updateTrayMenu();
      const btn = mockMenu.buildFromTemplate.mock.calls.at(-1)[0].find((i) => i.label === "지금 스트레칭!");
      expect(btn).toBeDefined(); expect(btn.click).toBeTypeOf("function");
    });

    it("should include sound toggle", () => {
      const t = { setTitle: vi.fn(), setContextMenu: vi.fn() }; core.setState({ tray: t }); storeData.soundEnabled = true;
      core.updateTrayMenu();
      const si = mockMenu.buildFromTemplate.mock.calls.at(-1)[0].find((i) => i.label === "알림 소리");
      expect(si.type).toBe("checkbox"); expect(si.checked).toBe(true);
    });

    it("should include auto-start toggle", () => {
      const t = { setTitle: vi.fn(), setContextMenu: vi.fn() }; core.setState({ tray: t }); storeData.autoStart = false;
      core.updateTrayMenu();
      const ai = mockMenu.buildFromTemplate.mock.calls.at(-1)[0].find((i) => i.label === "로그인 시 자동 실행");
      expect(ai.type).toBe("checkbox"); expect(ai.checked).toBe(false);
    });

    it("should reset daily count on update", () => {
      const t = { setTitle: vi.fn(), setContextMenu: vi.fn() }; core.setState({ tray: t });
      storeData.lastResetDate = new Date("2026-04-16").toDateString(); storeData.alertCount = 5;
      core.updateTrayMenu(); expect(storeData.alertCount).toBe(0);
    });

    it("should have quit item", () => {
      const t = { setTitle: vi.fn(), setContextMenu: vi.fn() }; core.setState({ tray: t });
      core.updateTrayMenu();
      expect(mockMenu.buildFromTemplate.mock.calls.at(-1)[0].find((i) => i.label === "종료")).toBeDefined();
    });
  });

  describe("menu click handlers", () => {
    let mockTray;
    beforeEach(() => { mockTray = { setTitle: vi.fn(), setContextMenu: vi.fn() }; core.setState({ tray: mockTray }); });
    function getTemplate() { core.updateTrayMenu(); return mockMenu.buildFromTemplate.mock.calls.at(-1)[0]; }

    it("should toggle sound", () => { storeData.soundEnabled = true; getTemplate().find((i) => i.label === "알림 소리").click(); expect(storeData.soundEnabled).toBe(false); });
    it("should toggle autoStart", () => { storeData.autoStart = false; getTemplate().find((i) => i.label === "로그인 시 자동 실행").click(); expect(storeData.autoStart).toBe(true); expect(mockApp.setLoginItemSettings).toHaveBeenCalledWith({ openAtLogin: true }); });
    it("should quit", () => { getTemplate().find((i) => i.label === "종료").click(); expect(mockApp.quit).toHaveBeenCalled(); });
    it("should stop timer on quit", () => { core.startTimer(30); getTemplate().find((i) => i.label === "종료").click(); expect(core.getState().isRunning).toBe(false); });
    it("should alert on stretch now", () => { getTemplate().find((i) => i.label === "지금 스트레칭!").click(); expect(mockNotification).toHaveBeenCalled(); });
    it("should reset next alert on stretch now while running", () => { storeData.intervalMin = 30; core.startTimer(30); vi.advanceTimersByTime(5000); getTemplate().find((i) => i.label === "지금 스트레칭!").click(); expect(core.getState().nextAlertTime).toBe(Date.now() + 30*60*1000); });
    it("should start timer on 감시 시작 click", () => {
      core.setState({ tray: mockTray, isRunning: false }); storeData.intervalMin = 15;
      getTemplate().find((i) => i.label === "🐢 감시 시작!").click();
      expect(core.getState().isRunning).toBe(true);
    });
    it("should send welcome notification on 감시 시작 click without incrementing alertCount", () => {
      storeData.alertCount = 0;
      getTemplate().find((i) => i.label === "🐢 감시 시작!").click();
      expect(mockNotification).toHaveBeenCalled();
      const call = mockNotification.mock.calls.at(-1)[0];
      expect(call.title).toBe("🐢 거북이경보 시작!");
      expect(storeData.alertCount).toBe(0);
    });
    it("should disable 감시 시작 when running", () => {
      core.startTimer(30);
      const item = getTemplate().find((i) => i.label === "🐢 감시 시작!");
      expect(item.enabled).toBe(false);
    });
    it("should enable 감시 시작 when stopped", () => {
      core.setState({ tray: mockTray, isRunning: false });
      const item = getTemplate().find((i) => i.label === "🐢 감시 시작!");
      expect(item.enabled).toBe(true);
    });
    it("should start on click", () => { core.setState({ tray: mockTray, isRunning: false }); storeData.intervalMin = 15; getTemplate().find((i) => i.label === "시작").click(); expect(core.getState().isRunning).toBe(true); });
    it("should stop on click", () => { core.startTimer(30); getTemplate().find((i) => i.label === "중지").click(); expect(core.getState().isRunning).toBe(false); });
    it("should start with submenu interval", () => { getTemplate().find((i) => i.label === "알림 간격").submenu.find((i) => i.label === "45분").click(); expect(storeData.intervalMin).toBe(45); });
    it("should start with 15min interval", () => { getTemplate().find((i) => i.label === "알림 간격").submenu.find((i) => i.label === "15분").click(); expect(storeData.intervalMin).toBe(15); });
    it("should start with 30min interval", () => { getTemplate().find((i) => i.label === "알림 간격").submenu.find((i) => i.label === "30분").click(); expect(storeData.intervalMin).toBe(30); });
    it("should start with 1hour interval", () => { getTemplate().find((i) => i.label === "알림 간격").submenu.find((i) => i.label === "1시간").click(); expect(storeData.intervalMin).toBe(60); });
    it("should toggle snapshot", () => { storeData.snapshotEnabled = false; core.setState({ tray: mockTray, imagesnapAvailable: true }); getTemplate().find((i) => i.label?.includes("자세 스냅샷")).click(); expect(storeData.snapshotEnabled).toBe(true); });
    it("should open snapshot folder", () => { storeData.snapshotSavePath = "/tmp/test-snap"; getTemplate().find((i) => i.label?.includes("스냅샷 폴더")).click(); expect(mockShell.openPath).toHaveBeenCalledWith("/tmp/test-snap"); });
  });

  describe("handleResume", () => {
    it("should not throw when not running", () => { core.setState({ isRunning: false }); expect(() => core.handleResume()).not.toThrow(); });

    it("should recalculate remainSec", () => {
      const t = { setTitle: vi.fn(), setContextMenu: vi.fn() }; core.setState({ tray: t });
      core.startTimer(30); vi.advanceTimersByTime(10*60*1000); core.handleResume();
      const s = core.getState();
      expect(s.remainSec).toBe(Math.max(0, Math.ceil((s.nextAlertTime - Date.now()) / 1000)));
    });

    it("should alert if expired during sleep", () => {
      const t = { setTitle: vi.fn(), setContextMenu: vi.fn() }; core.setState({ tray: t });
      core.startTimer(1); mockNotification.mockClear();
      core.setState({ nextAlertTime: Date.now() - 1000 }); core.handleResume();
      expect(mockNotification).toHaveBeenCalled();
    });

    it("should reset nextAlertTime after expired", () => {
      const t = { setTitle: vi.fn(), setContextMenu: vi.fn() }; core.setState({ tray: t }); storeData.intervalMin = 1;
      core.startTimer(1); core.setState({ nextAlertTime: Date.now() - 1000 }); core.handleResume();
      expect(core.getState().nextAlertTime).toBe(Date.now() + 60*1000);
    });
  });

  describe("integration: timer cycle", () => {
    let mockTray;
    beforeEach(() => { mockTray = { setTitle: vi.fn(), setContextMenu: vi.fn() }; core.setState({ tray: mockTray }); });

    it("should send multiple alerts", () => { storeData.alertCount = 0; core.startTimer(1); vi.advanceTimersByTime(60000); vi.advanceTimersByTime(60000); expect(storeData.alertCount).toBe(2); });
    it("should stop alerts after stop", () => { mockNotification.mockClear(); core.startTimer(1); vi.advanceTimersByTime(60000); core.stopTimer(); mockNotification.mockClear(); vi.advanceTimersByTime(120000); expect(mockNotification).not.toHaveBeenCalled(); });
  });

  describe("getState / setState", () => {
    it("should return state", () => { const s = core.getState(); expect(s).toHaveProperty("timer"); expect(s).toHaveProperty("remainSec"); expect(s).toHaveProperty("isRunning"); expect(s).toHaveProperty("tray"); expect(s).toHaveProperty("nextAlertTime"); });
    it("should update partial", () => { core.setState({ remainSec: 42, isRunning: true }); expect(core.getState().remainSec).toBe(42); expect(core.getState().isRunning).toBe(true); });
  });
});
