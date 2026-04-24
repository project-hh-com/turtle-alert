import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const {
  parseSemver,
  isNewer,
  fetchLatestRelease,
  startUpdateChecker,
} = await import("../lib/update-check.js");

describe("parseSemver", () => {
  it("should parse 'vX.Y.Z' with leading v", () => {
    expect(parseSemver("v1.2.3")).toEqual([1, 2, 3]);
  });

  it("should parse 'X.Y.Z' without leading v", () => {
    expect(parseSemver("0.6.0")).toEqual([0, 6, 0]);
  });

  it("should trim whitespace", () => {
    expect(parseSemver("  v2.0.1  ")).toEqual([2, 0, 1]);
  });

  it("should return null for invalid input", () => {
    expect(parseSemver("not-a-version")).toBeNull();
    expect(parseSemver(null)).toBeNull();
    expect(parseSemver(undefined)).toBeNull();
    expect(parseSemver(123)).toBeNull();
  });

  it("should ignore pre-release suffix", () => {
    expect(parseSemver("v1.2.3-beta.1")).toEqual([1, 2, 3]);
  });
});

describe("isNewer", () => {
  it("should return true when patch version is higher", () => {
    expect(isNewer("0.6.1", "0.6.0")).toBe(true);
  });

  it("should return true when minor version is higher", () => {
    expect(isNewer("0.7.0", "0.6.9")).toBe(true);
  });

  it("should return true when major version is higher", () => {
    expect(isNewer("1.0.0", "0.99.99")).toBe(true);
  });

  it("should return false when versions are equal", () => {
    expect(isNewer("0.6.0", "0.6.0")).toBe(false);
  });

  it("should return false when latest is older", () => {
    expect(isNewer("0.5.9", "0.6.0")).toBe(false);
  });

  it("should handle leading v on either side", () => {
    expect(isNewer("v0.6.1", "0.6.0")).toBe(true);
    expect(isNewer("0.6.1", "v0.6.0")).toBe(true);
  });

  it("should return false on parse failure", () => {
    expect(isNewer("garbage", "0.6.0")).toBe(false);
    expect(isNewer("0.6.0", "garbage")).toBe(false);
  });
});

describe("fetchLatestRelease", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("should return tagName and htmlUrl on success", async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        tag_name: "v0.7.0",
        html_url: "https://example.com/release",
      }),
    });

    const result = await fetchLatestRelease();
    expect(result).toEqual({
      tagName: "v0.7.0",
      htmlUrl: "https://example.com/release",
    });
  });

  it("should return null on non-2xx response", async () => {
    fetch.mockResolvedValue({ ok: false, json: async () => ({}) });
    expect(await fetchLatestRelease()).toBeNull();
  });

  it("should return null when response has no tag_name", async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    expect(await fetchLatestRelease()).toBeNull();
  });

  it("should return null on network error", async () => {
    fetch.mockRejectedValue(new Error("network down"));
    expect(await fetchLatestRelease()).toBeNull();
  });
});

describe("startUpdateChecker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("should call onUpdateAvailable once when new version is found", async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        tag_name: "v1.0.0",
        html_url: "https://example.com/r",
      }),
    });

    const onUpdateAvailable = vi.fn();
    const onCheck = vi.fn();

    const stop = startUpdateChecker({
      getCurrentVersion: () => "0.6.0",
      onUpdateAvailable,
      onCheck,
    });

    await vi.waitFor(() => {
      expect(onCheck).toHaveBeenCalledWith("v1.0.0", "https://example.com/r");
    });
    expect(onUpdateAvailable).toHaveBeenCalledWith("v1.0.0", "https://example.com/r");
    expect(onUpdateAvailable).toHaveBeenCalledTimes(1);

    stop();
  });

  it("should not call onUpdateAvailable when current is up to date", async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ tag_name: "v0.6.0", html_url: "https://x" }),
    });

    const onUpdateAvailable = vi.fn();
    const onCheck = vi.fn();

    const stop = startUpdateChecker({
      getCurrentVersion: () => "0.6.0",
      onUpdateAvailable,
      onCheck,
    });

    await vi.waitFor(() => {
      expect(onCheck).toHaveBeenCalled();
    });
    expect(onCheck).toHaveBeenCalledWith(null, null);
    expect(onUpdateAvailable).not.toHaveBeenCalled();

    stop();
  });

  it("should pass null to onCheck when fetch fails", async () => {
    fetch.mockRejectedValue(new Error("oops"));

    const onCheck = vi.fn();
    const stop = startUpdateChecker({
      getCurrentVersion: () => "0.6.0",
      onUpdateAvailable: vi.fn(),
      onCheck,
    });

    await vi.waitFor(() => {
      expect(onCheck).toHaveBeenCalledWith(null, null);
    });

    stop();
  });
});
