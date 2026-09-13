import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const refreshStaticDataCache = vi.fn();
const primeMarketGroupData = vi.fn();
const resetMarketGroupData = vi.fn();
const resetReprocessing = vi.fn();
const resetRecipes = vi.fn();
const invalidateQueries = vi.fn();

vi.mock("../Helper/getCachedData.js", () => ({
  refreshStaticDataCache: (...args) => refreshStaticDataCache(...args),
}));
vi.mock("../MarketData/marketGroupData.js", () => ({
  primeMarketGroupData: (...args) => primeMarketGroupData(...args),
  resetMarketGroupData: (...args) => resetMarketGroupData(...args),
}));
vi.mock("./reprocessing.js", () => ({
  resetReprocessing: (...args) => resetReprocessing(...args),
}));
vi.mock("./recipes.js", () => ({
  resetRecipes: (...args) => resetRecipes(...args),
}));
vi.mock("../../queryClient.js", () => ({
  queryClient: { invalidateQueries: (...args) => invalidateQueries(...args) },
}));

const {
  refreshStaticData,
  refreshStaticDataAfterAnnouncement,
  startStaticDataSync,
  stopStaticDataSync,
} = await import("./staticDataSync.js");

function setVisibility(state) {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
}

beforeEach(() => {
  refreshStaticDataCache.mockResolvedValue({ changed: false });
  primeMarketGroupData.mockResolvedValue(undefined);
  setVisibility("visible");
});

afterEach(() => {
  stopStaticDataSync();
  vi.useRealTimers();
});

describe("reading the files again", () => {
  it("drops everything held against the build that moved", async () => {
    refreshStaticDataCache.mockResolvedValue({ changed: true });

    await refreshStaticData();

    expect(resetMarketGroupData).toHaveBeenCalled();
    expect(resetReprocessing).toHaveBeenCalled();
    expect(resetRecipes).toHaveBeenCalled();
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["static"] });
  });

  it("drops nothing when the build has not moved", async () => {
    await refreshStaticData();

    expect(resetMarketGroupData).not.toHaveBeenCalled();
    expect(resetRecipes).not.toHaveBeenCalled();
    expect(invalidateQueries).not.toHaveBeenCalled();
    // The tree is still primed: a reader that cannot await needs it either way.
    expect(primeMarketGroupData).toHaveBeenCalled();
  });

  it("survives a refresh that throws, so one outage is not permanent", async () => {
    refreshStaticDataCache.mockRejectedValue(new Error("offline"));

    await expect(refreshStaticData()).resolves.toBeUndefined();

    refreshStaticDataCache.mockResolvedValue({ changed: true });
    await refreshStaticData();
    expect(resetRecipes).toHaveBeenCalled();
  });
});

describe("starting the sync", () => {
  it("reads the files once and does not start a timer", async () => {
    vi.useFakeTimers();
    const setInterval = vi.spyOn(globalThis, "setInterval");

    await startStaticDataSync();

    expect(refreshStaticDataCache).toHaveBeenCalledTimes(1);
    expect(setInterval).not.toHaveBeenCalled();

    // The files change only when a build is published, so no amount of time
    // passing is a reason to ask again.
    await vi.advanceTimersByTimeAsync(6 * 60 * 60 * 1000);
    expect(refreshStaticDataCache).toHaveBeenCalledTimes(1);
  });

  it("starts once however many times it is called", async () => {
    await startStaticDataSync();
    await startStaticDataSync();

    expect(refreshStaticDataCache).toHaveBeenCalledTimes(1);
  });
});

describe("an announcement", () => {
  it("waits before reading, so every client does not fetch at once", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.5);

    refreshStaticDataAfterAnnouncement();
    expect(refreshStaticDataCache).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(30 * 1000);
    expect(refreshStaticDataCache).toHaveBeenCalledTimes(1);
  });

  it("spreads two clients to different moments", () => {
    vi.useFakeTimers();
    const waits = [];
    const timeout = vi
      .spyOn(globalThis, "setTimeout")
      .mockImplementation((fn, ms) => {
        waits.push(ms);
        return 1;
      });

    vi.spyOn(Math, "random").mockReturnValue(0);
    refreshStaticDataAfterAnnouncement();
    stopStaticDataSync();

    vi.spyOn(Math, "random").mockReturnValue(0.99);
    refreshStaticDataAfterAnnouncement();

    timeout.mockRestore();
    expect(waits[0]).not.toBe(waits[1]);
    expect(waits[1]).toBeGreaterThan(waits[0]);
  });

  it("collapses a second announcement into the wait already running", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.5);

    refreshStaticDataAfterAnnouncement();
    refreshStaticDataAfterAnnouncement();
    await vi.advanceTimersByTimeAsync(30 * 1000);

    expect(refreshStaticDataCache).toHaveBeenCalledTimes(1);
  });
});

describe("waking up", () => {
  it("checks when a tab that was asleep long enough is shown", async () => {
    vi.useFakeTimers();
    await startStaticDataSync();
    expect(refreshStaticDataCache).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(6 * 60 * 1000);
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(0);

    expect(refreshStaticDataCache).toHaveBeenCalledTimes(2);
  });

  it("costs nothing to alt-tab", async () => {
    vi.useFakeTimers();
    await startStaticDataSync();

    document.dispatchEvent(new Event("visibilitychange"));
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(0);

    expect(refreshStaticDataCache).toHaveBeenCalledTimes(1);
  });

  it("ignores a tab going away rather than arriving", async () => {
    vi.useFakeTimers();
    await startStaticDataSync();
    await vi.advanceTimersByTimeAsync(6 * 60 * 1000);

    setVisibility("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(0);

    expect(refreshStaticDataCache).toHaveBeenCalledTimes(1);
  });

  it("checks when the network comes back", async () => {
    vi.useFakeTimers();
    await startStaticDataSync();
    await vi.advanceTimersByTimeAsync(6 * 60 * 1000);

    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(0);

    expect(refreshStaticDataCache).toHaveBeenCalledTimes(2);
  });

  // The floor is there so alt-tabbing is free, not so a tab that failed to reach
  // the server has to wait before trying again.
  it("retries after a failed check rather than waiting out the floor", async () => {
    vi.useFakeTimers();
    refreshStaticDataCache.mockRejectedValue(new Error("offline"));
    await startStaticDataSync();
    expect(refreshStaticDataCache).toHaveBeenCalledTimes(1);

    refreshStaticDataCache.mockResolvedValue({ changed: false });
    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(0);

    expect(refreshStaticDataCache).toHaveBeenCalledTimes(2);
  });

  it("stops listening once stopped", async () => {
    vi.useFakeTimers();
    await startStaticDataSync();
    await vi.advanceTimersByTimeAsync(6 * 60 * 1000);
    stopStaticDataSync();

    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(0);

    expect(refreshStaticDataCache).toHaveBeenCalledTimes(1);
  });
});
