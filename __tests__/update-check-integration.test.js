/**
 * createAppCore 내부의 업데이트 체커 연동(알림 콜백, onCheck 콜백, 트레이 메뉴 항목)
 * 분기를 커버하기 위한 통합 테스트. startUpdateChecker 를 deps 로 주입받아
 * 넘어온 콜백을 직접 꺼내 호출한다 — 실제 네트워크나 타이머에 의존하지 않는다.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { createAppCore } = await import("../lib.js");

describe("createAppCore — update checker wiring", () => {
  let core;
  let mockNotification;
  let mockMenu;
  let mockStore;
  let mockApp;
  let mockShell;
  let mockTray;
  let storeData;
  let lastBuiltTemplate;
  let capturedOptions;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-24T10:00:00Z"));

    mockNotification = vi.fn(function () {
      this.show = vi.fn();
    });
    mockMenu = {
      buildFromTemplate: vi.fn((template) => {
        lastBuiltTemplate = template;
        return template;
      }),
    };
    mockApp = {
      quit: vi.fn(),
      setLoginItemSettings: vi.fn(),
      getVersion: vi.fn(() => "0.7.0"),
    };
    mockShell = { openExternal: vi.fn() };
    storeData = {
      intervalMin: 30,
      alertCount: 0,
      lastResetDate: new Date("2026-04-24").toDateString(),
      autoStart: false,
      soundEnabled: true,
      snapshotEnabled: false,
      snapshotSavePath: "/tmp/test-snapshots",
      snapshotRetentionDays: 30,
    };
    mockStore = {
      get: vi.fn((k) => storeData[k]),
      set: vi.fn((k, v) => {
        storeData[k] = v;
      }),
    };
    mockTray = { setTitle: vi.fn(), setContextMenu: vi.fn() };

    const stubStartUpdateChecker = vi.fn((opts) => {
      capturedOptions = opts;
      return () => {};
    });

    core = createAppCore({
      Notification: mockNotification,
      Menu: mockMenu,
      app: mockApp,
      store: mockStore,
      shell: mockShell,
      startUpdateChecker: stubStartUpdateChecker,
    });
    core.setState({ tray: mockTray });
  });

  afterEach(() => {
    const state = core.getState();
    if (state.timer) clearInterval(state.timer);
    if (state.postureTimer) clearInterval(state.postureTimer);
    vi.useRealTimers();
  });

  it("should register a checker with getCurrentVersion delegating to app.getVersion", () => {
    expect(capturedOptions).toBeDefined();
    expect(capturedOptions.getCurrentVersion()).toBe("0.7.0");
    expect(mockApp.getVersion).toHaveBeenCalled();
  });

  it("should show a notification when onUpdateAvailable fires", () => {
    capturedOptions.onUpdateAvailable("v0.8.0", "https://example.com/r");
    expect(mockNotification).toHaveBeenCalledTimes(1);
    const opts = mockNotification.mock.calls[0][0];
    expect(opts.title).toContain("v0.8.0");
    expect(opts.silent).toBe(false); // soundEnabled=true
  });

  it("should respect soundEnabled=false for update notification", () => {
    storeData.soundEnabled = false;
    capturedOptions.onUpdateAvailable("v0.8.0", "https://x");
    const opts = mockNotification.mock.calls[0][0];
    expect(opts.silent).toBe(true);
  });

  it("should add an update menu item at top of tray when onCheck reports an update", () => {
    capturedOptions.onCheck("v0.8.0", "https://example.com/release");

    // updateTrayMenu fires after onCheck → last built template should have update item at index 0
    expect(lastBuiltTemplate).toBeDefined();
    expect(lastBuiltTemplate[0].label).toBe("🆕 새 버전 v0.8.0 받기");
    expect(lastBuiltTemplate[1]).toEqual({ type: "separator" });

    // Clicking the item should open the release URL via shell
    lastBuiltTemplate[0].click();
    expect(mockShell.openExternal).toHaveBeenCalledWith("https://example.com/release");
  });

  it("should NOT add an update menu item when onCheck reports no update", () => {
    capturedOptions.onCheck(null, null);
    expect(lastBuiltTemplate).toBeDefined();
    // First item should be the timer/standby status line, not an update entry
    expect(lastBuiltTemplate[0].label).not.toContain("새 버전");
  });
});
