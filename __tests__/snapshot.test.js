import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import path from "path";
import fs from "fs";
import os from "os";

// imagesnap 경로는 vitest.config.js의 TURTLE_IMAGESNAP_PATH로 비실존 경로로 설정됨

const {
  captureSnapshot,
  cleanOldSnapshots,
  getSnapshotFolderSize,
  createAppCore,
} = await import("../lib.js");

// ===== captureSnapshot =====
describe("captureSnapshot", () => {
  let tmpDir;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-17T14:30:00.000Z"));
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "turtle-snap-"));
  });

  afterEach(() => {
    vi.useRealTimers();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should create save directory recursively", async () => {
    const subDir = path.join(tmpDir, "nested", "dir");
    try {
      await captureSnapshot(subDir);
    } catch {
      // imagesnap likely not installed in test env
    }
    expect(fs.existsSync(subDir)).toBe(true);
  });

  it("should reject when imagesnap is not available", async () => {
    await expect(captureSnapshot(tmpDir)).rejects.toThrow();
  });
});

// ===== cleanOldSnapshots =====
describe("cleanOldSnapshots", () => {
  let tmpDir;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-17T10:00:00"));
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "turtle-clean-"));
  });

  afterEach(() => {
    vi.useRealTimers();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should not throw when directory does not exist", () => {
    expect(() => cleanOldSnapshots("/nonexistent-path-xyz-12345", 30)).not.toThrow();
  });

  it("should delete files older than retention days", () => {
    const oldFile = path.join(tmpDir, "거북이-old.jpg");
    const newFile = path.join(tmpDir, "거북이-new.jpg");
    fs.writeFileSync(oldFile, "old");
    fs.writeFileSync(newFile, "new");

    const oldTime = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    fs.utimesSync(oldFile, oldTime, oldTime);

    cleanOldSnapshots(tmpDir, 30);

    expect(fs.existsSync(oldFile)).toBe(false);
    expect(fs.existsSync(newFile)).toBe(true);
  });

  it("should keep files within retention period", () => {
    const recentFile = path.join(tmpDir, "거북이-recent.jpg");
    fs.writeFileSync(recentFile, "recent");

    cleanOldSnapshots(tmpDir, 30);

    expect(fs.existsSync(recentFile)).toBe(true);
  });

  it("should only process turtle jpg files", () => {
    const dsStore = path.join(tmpDir, ".DS_Store");
    const oldJpg = path.join(tmpDir, "거북이-old.jpg");
    fs.writeFileSync(dsStore, "ds");
    fs.writeFileSync(oldJpg, "old");

    const oldTime = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    fs.utimesSync(oldJpg, oldTime, oldTime);
    fs.utimesSync(dsStore, oldTime, oldTime);

    cleanOldSnapshots(tmpDir, 30);

    expect(fs.existsSync(dsStore)).toBe(true);
    expect(fs.existsSync(oldJpg)).toBe(false);
  });

  it("should handle empty directory", () => {
    expect(() => cleanOldSnapshots(tmpDir, 30)).not.toThrow();
  });
});

// ===== sendAlert with snapshot integration =====
describe("sendAlert with snapshot", () => {
  let core, mockNotification, mockStore, storeData, mockApp, mockMenu, mockTray;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-17T10:00:00"));

    mockNotification = vi.fn(function () {
      this.show = vi.fn();
    });
    mockMenu = { buildFromTemplate: vi.fn((t) => t) };
    mockApp = { quit: vi.fn(), setLoginItemSettings: vi.fn() };
    storeData = {
      intervalMin: 30,
      alertCount: 0,
      lastResetDate: new Date("2026-04-17").toDateString(),
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

    core = createAppCore({
      Notification: mockNotification,
      Menu: mockMenu,
      app: mockApp,
      store: mockStore,
    });
    core.setState({ tray: mockTray });
  });

  afterEach(() => {
    const state = core.getState();
    if (state.timer) clearInterval(state.timer);
    vi.useRealTimers();
  });

  it("should not attempt snapshot when snapshotEnabled is false", () => {
    storeData.snapshotEnabled = false;
    core.sendAlert();
    expect(mockNotification).toHaveBeenCalled();
    expect(mockNotification.mock.calls[0][0].title).toBe("🚨 거북이경보 발령!");
  });

  it("should still show notification when snapshot enabled", () => {
    storeData.snapshotEnabled = true;
    core.sendAlert();
    expect(mockNotification).toHaveBeenCalled();
  });

  it("should increment alertCount regardless of snapshot", () => {
    storeData.snapshotEnabled = true;
    storeData.alertCount = 3;
    core.sendAlert();
    expect(storeData.alertCount).toBe(4);
  });
});

// ===== Tray menu snapshot items =====
describe("tray menu snapshot items", () => {
  let core, mockStore, storeData, mockMenu, mockTray;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-17T10:00:00"));

    const mockNotification = vi.fn(function () {
      this.show = vi.fn();
    });
    mockMenu = { buildFromTemplate: vi.fn((t) => t) };
    const mockApp = { quit: vi.fn(), setLoginItemSettings: vi.fn() };
    storeData = {
      intervalMin: 30,
      alertCount: 0,
      lastResetDate: new Date("2026-04-17").toDateString(),
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

    core = createAppCore({
      Notification: mockNotification,
      Menu: mockMenu,
      app: mockApp,
      store: mockStore,
    });
    core.setState({ tray: mockTray });
  });

  afterEach(() => {
    const state = core.getState();
    if (state.timer) clearInterval(state.timer);
    vi.useRealTimers();
  });

  function getTemplate() {
    core.updateTrayMenu();
    return mockMenu.buildFromTemplate.mock.calls.at(-1)[0];
  }

  it("should have snapshot checkbox menu item", () => {
    const tpl = getTemplate();
    const item = tpl.find(
      (i) => i.type === "checkbox" && i.label?.includes("스냅샷")
    );
    expect(item).toBeDefined();
  });

  it("should reflect snapshotEnabled state", () => {
    storeData.snapshotEnabled = true;
    core.setState({ imagesnapAvailable: true });
    const tpl = getTemplate();
    const item = tpl.find(
      (i) => i.type === "checkbox" && i.label?.includes("스냅샷")
    );
    expect(item.checked).toBe(true);
  });

  it("should toggle snapshotEnabled on click", () => {
    storeData.snapshotEnabled = false;
    core.setState({ imagesnapAvailable: true });
    const tpl = getTemplate();
    const item = tpl.find(
      (i) => i.type === "checkbox" && i.label?.includes("스냅샷")
    );
    item.click();
    expect(storeData.snapshotEnabled).toBe(true);
  });

  it("should have open snapshot folder item", () => {
    const tpl = getTemplate();
    const item = tpl.find((i) => i.label?.includes("스냅샷 폴더"));
    expect(item).toBeDefined();
    expect(item.click).toBeTypeOf("function");
  });

  it("should reset snapshotFailCount when toggling snapshot on", () => {
    storeData.snapshotEnabled = true;
    core.setState({ imagesnapAvailable: true, snapshotFailCount: 2 });
    const tpl = getTemplate();
    const item = tpl.find(
      (i) => i.type === "checkbox" && i.label?.includes("스냅샷")
    );
    // toggle off then on
    item.click(); // off
    expect(storeData.snapshotEnabled).toBe(false);
    const tpl2 = getTemplate();
    const item2 = tpl2.find(
      (i) => i.type === "checkbox" && i.label?.includes("스냅샷")
    );
    item2.click(); // on
    expect(storeData.snapshotEnabled).toBe(true);
    expect(core.getState().snapshotFailCount).toBe(0);
  });

  it("should disable snapshot toggle when imagesnap unavailable", () => {
    core.setState({ imagesnapAvailable: false });
    const tpl = getTemplate();
    const item = tpl.find(
      (i) => i.type === "checkbox" && i.label?.includes("스냅샷")
    );
    expect(item.enabled).toBe(false);
  });

  it("should show camera emoji when snapshot enabled", () => {
    storeData.snapshotEnabled = true;
    core.setState({ imagesnapAvailable: true });
    const tpl = getTemplate();
    const item = tpl.find(
      (i) => i.type === "checkbox" && i.label?.includes("스냅샷")
    );
    expect(item.label).toContain("📸");
  });
});

// ===== getSnapshotFolderSize =====
describe("getSnapshotFolderSize", () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "turtle-size-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should return 0 for nonexistent directory", () => {
    expect(getSnapshotFolderSize("/nonexistent-xyz-999")).toBe(0);
  });

  it("should return 0 for empty directory", () => {
    expect(getSnapshotFolderSize(tmpDir)).toBe(0);
  });

  it("should sum only turtle jpg files", () => {
    fs.writeFileSync(path.join(tmpDir, "거북이-a.jpg"), "12345"); // 5 bytes
    fs.writeFileSync(path.join(tmpDir, "거북이-b.jpg"), "123");   // 3 bytes
    fs.writeFileSync(path.join(tmpDir, "other.txt"), "ignored");
    expect(getSnapshotFolderSize(tmpDir)).toBe(8);
  });

  it("should ignore non-turtle files", () => {
    fs.writeFileSync(path.join(tmpDir, "photo.jpg"), "12345");
    fs.writeFileSync(path.join(tmpDir, ".DS_Store"), "x");
    expect(getSnapshotFolderSize(tmpDir)).toBe(0);
  });
});

// ===== snapshot failure auto-disable =====
describe("snapshot failure auto-disable", () => {
  let core, mockNotification, mockStore, storeData, mockTray;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-17T10:00:00"));

    mockNotification = vi.fn(function () {
      this.show = vi.fn();
    });
    const mockMenu = { buildFromTemplate: vi.fn((t) => t) };
    const mockApp = { quit: vi.fn(), setLoginItemSettings: vi.fn() };
    storeData = {
      intervalMin: 30,
      alertCount: 0,
      lastResetDate: new Date("2026-04-17").toDateString(),
      autoStart: false,
      soundEnabled: true,
      snapshotEnabled: true,
      snapshotSavePath: "/tmp/test-snapshots",
      snapshotRetentionDays: 30,
    };
    mockStore = {
      get: vi.fn((k) => storeData[k]),
      set: vi.fn((k, v) => { storeData[k] = v; }),
    };
    mockTray = { setTitle: vi.fn(), setContextMenu: vi.fn() };

    // Mock captureSnapshot to fail
    const libModule = await import("../lib.js");

    core = libModule.createAppCore({
      Notification: mockNotification,
      Menu: mockMenu,
      app: mockApp,
      store: mockStore,
    });
    core.setState({ tray: mockTray });
  });

  afterEach(() => {
    const state = core.getState();
    if (state.timer) clearInterval(state.timer);
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("should auto-disable snapshot after 3 consecutive failures", async () => {
    // Mock captureSnapshot to reject
    vi.spyOn(await import("../lib.js"), "captureSnapshot").mockImplementation(
      () => Promise.reject(new Error("camera fail"))
    );

    // Unfortunately captureSnapshot is called directly inside createAppCore closure,
    // so we need to test via the module-level mock. Let's use child_process mock instead.
    vi.restoreAllMocks();

    // The snapshot logic uses captureSnapshot which calls execFile("imagesnap")
    // Since imagesnap isn't installed, captureSnapshot will reject
    // We need snapshotEnabled = true and send 3 alerts
    storeData.snapshotEnabled = true;
    core.setState({ snapshotFailCount: 0 });

    core.sendAlert();
    await vi.advanceTimersByTimeAsync(100);
    expect(core.getState().snapshotFailCount).toBe(1);

    core.sendAlert();
    await vi.advanceTimersByTimeAsync(100);
    expect(core.getState().snapshotFailCount).toBe(2);

    core.sendAlert();
    await vi.advanceTimersByTimeAsync(100);
    // After 3rd failure, should auto-disable
    expect(storeData.snapshotEnabled).toBe(false);
    expect(core.getState().snapshotFailCount).toBe(0);
  });

  it("should show disable notification after auto-disable", async () => {
    storeData.snapshotEnabled = true;
    core.setState({ snapshotFailCount: 2 });

    core.sendAlert();
    await vi.advanceTimersByTimeAsync(100);

    // Find the disable notification
    const disableCall = mockNotification.mock.calls.find(
      (c) => c[0].title === "📸 스냅샷 자동 비활성화"
    );
    expect(disableCall).toBeDefined();
    expect(disableCall[0].body).toContain("연속 3회");
  });
});
