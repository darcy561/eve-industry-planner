import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const revalidateMarketRefreshTimes = vi.fn();
const rotateSelfReadMarkets = vi.fn();
const dropUnreadMarkets = vi.fn();
vi.mock("./priceCache.js", () => ({
  revalidateMarketRefreshTimes: (...args) =>
    revalidateMarketRefreshTimes(...args),
  rotateSelfReadMarkets: (...args) => rotateSelfReadMarkets(...args),
}));
vi.mock("./priceStore.js", () => ({
  dropUnreadMarkets: (...args) => dropUnreadMarkets(...args),
}));

const {
  readSavedMarketsNow,
  startPriceRefresh,
  stopPriceRefresh,
  PROBE_INTERVAL_MS,
  WAKE_PROBE_FLOOR_MS,
} = await import("./priceRefreshSchedule.js");

function setVisibility(state) {
  Object.defineProperty(document, "visibilityState", {
    value: state,
    configurable: true,
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  vi.useFakeTimers();
  revalidateMarketRefreshTimes.mockResolvedValue(undefined);
  rotateSelfReadMarkets.mockResolvedValue(0);
  dropUnreadMarkets.mockResolvedValue(0);
});

afterEach(() => {
  stopPriceRefresh();
  vi.useRealTimers();
  setVisibility("visible");
});

describe("starting and stopping", () => {
  it("asks nothing until the first interval passes", async () => {
    startPriceRefresh();

    expect(revalidateMarketRefreshTimes).not.toHaveBeenCalled();
  });

  it("asks the markets once each interval passes", async () => {
    startPriceRefresh();

    await vi.advanceTimersByTimeAsync(PROBE_INTERVAL_MS);
    expect(revalidateMarketRefreshTimes).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(PROBE_INTERVAL_MS);
    expect(revalidateMarketRefreshTimes).toHaveBeenCalledTimes(2);
  });

  it("ignores a second start", async () => {
    startPriceRefresh();
    startPriceRefresh();

    await vi.advanceTimersByTimeAsync(PROBE_INTERVAL_MS);

    expect(revalidateMarketRefreshTimes).toHaveBeenCalledTimes(1);
  });

  it("stops asking once stopped", async () => {
    startPriceRefresh();
    stopPriceRefresh();

    await vi.advanceTimersByTimeAsync(PROBE_INTERVAL_MS * 2);
    setVisibility("hidden");
    setVisibility("visible");
    await vi.advanceTimersByTimeAsync(0);

    expect(revalidateMarketRefreshTimes).not.toHaveBeenCalled();
  });

  it("can be started again after stopping", async () => {
    startPriceRefresh();
    stopPriceRefresh();
    startPriceRefresh();

    await vi.advanceTimersByTimeAsync(PROBE_INTERVAL_MS);

    expect(revalidateMarketRefreshTimes).toHaveBeenCalledTimes(1);
  });
});

describe("coming back to the tab", () => {
  it("asks again on returning", async () => {
    startPriceRefresh();

    setVisibility("hidden");
    setVisibility("visible");
    await vi.advanceTimersByTimeAsync(0);

    expect(revalidateMarketRefreshTimes).toHaveBeenCalledTimes(1);
  });

  it("does not ask when the tab is being left", async () => {
    startPriceRefresh();

    setVisibility("hidden");

    expect(revalidateMarketRefreshTimes).not.toHaveBeenCalled();
  });

  it("does not ask again within the floor", async () => {
    startPriceRefresh();

    setVisibility("hidden");
    setVisibility("visible");
    await vi.advanceTimersByTimeAsync(0);
    setVisibility("hidden");
    setVisibility("visible");
    await vi.advanceTimersByTimeAsync(0);

    expect(revalidateMarketRefreshTimes).toHaveBeenCalledTimes(1);
  });

  it("asks again once the floor has passed", async () => {
    startPriceRefresh();

    setVisibility("hidden");
    setVisibility("visible");
    await vi.advanceTimersByTimeAsync(0);

    await vi.advanceTimersByTimeAsync(WAKE_PROBE_FLOOR_MS);
    setVisibility("hidden");
    setVisibility("visible");
    await vi.advanceTimersByTimeAsync(0);

    expect(revalidateMarketRefreshTimes).toHaveBeenCalledTimes(2);
  });

  it("counts an interval probe against the floor", async () => {
    startPriceRefresh();

    await vi.advanceTimersByTimeAsync(PROBE_INTERVAL_MS);
    expect(revalidateMarketRefreshTimes).toHaveBeenCalledTimes(1);

    setVisibility("hidden");
    setVisibility("visible");
    await vi.advanceTimersByTimeAsync(0);

    expect(revalidateMarketRefreshTimes).toHaveBeenCalledTimes(1);
  });
});

describe("when a probe cannot be made", () => {
  it("carries on to the next one", async () => {
    revalidateMarketRefreshTimes.mockRejectedValue(new Error("offline"));
    startPriceRefresh();

    await vi.advanceTimersByTimeAsync(PROBE_INTERVAL_MS);
    await vi.advanceTimersByTimeAsync(PROBE_INTERVAL_MS);

    expect(revalidateMarketRefreshTimes).toHaveBeenCalledTimes(2);
  });
});

describe("what a tick does about a reader's own markets", () => {
  it("reads the due ones as well as probing the hubs", async () => {
    startPriceRefresh();

    await vi.advanceTimersByTimeAsync(PROBE_INTERVAL_MS);

    expect(rotateSelfReadMarkets).toHaveBeenCalledTimes(1);
    expect(revalidateMarketRefreshTimes).toHaveBeenCalledTimes(1);
  });

  it("reads the due ones before throwing away what went unread", async () => {
    let finishReading;
    rotateSelfReadMarkets.mockReturnValue(
      new Promise((resolve) => {
        finishReading = () => resolve(1);
      }),
    );
    startPriceRefresh();

    await vi.advanceTimersByTimeAsync(PROBE_INTERVAL_MS);
    await vi.waitFor(() => expect(rotateSelfReadMarkets).toHaveBeenCalled());
    expect(dropUnreadMarkets).not.toHaveBeenCalled();

    finishReading();
    await vi.waitFor(() => expect(dropUnreadMarkets).toHaveBeenCalled());
  });

  it("probes the hubs even when the sweep throws", async () => {
    dropUnreadMarkets.mockRejectedValueOnce(new Error("storage is blocked"));
    startPriceRefresh();

    await vi.advanceTimersByTimeAsync(PROBE_INTERVAL_MS);

    await vi.waitFor(() =>
      expect(revalidateMarketRefreshTimes).toHaveBeenCalledTimes(1),
    );
  });

  it("probes the hubs even when reading again throws", async () => {
    rotateSelfReadMarkets.mockRejectedValueOnce(new Error("offline"));
    startPriceRefresh();

    await vi.advanceTimersByTimeAsync(PROBE_INTERVAL_MS);

    await vi.waitFor(() =>
      expect(revalidateMarketRefreshTimes).toHaveBeenCalledTimes(1),
    );
  });

  it("reads the due ones even when the hub probe fails", async () => {
    revalidateMarketRefreshTimes.mockRejectedValueOnce(new Error("offline"));
    startPriceRefresh();

    await vi.advanceTimersByTimeAsync(PROBE_INTERVAL_MS);

    expect(rotateSelfReadMarkets).toHaveBeenCalledTimes(1);
  });

  it("carries on to the next tick after either half throws", async () => {
    rotateSelfReadMarkets.mockRejectedValueOnce(new Error("offline"));
    startPriceRefresh();

    await vi.advanceTimersByTimeAsync(PROBE_INTERVAL_MS);
    await vi.advanceTimersByTimeAsync(PROBE_INTERVAL_MS);

    expect(rotateSelfReadMarkets).toHaveBeenCalledTimes(2);
    expect(revalidateMarketRefreshTimes).toHaveBeenCalledTimes(2);
  });
});

describe("reading a reader's own markets as they sign in", () => {
  it("reads them without waiting for a tick", async () => {
    readSavedMarketsNow();

    await vi.waitFor(() => expect(rotateSelfReadMarkets).toHaveBeenCalled());
  });

  it("does not need the schedule to have been started", async () => {
    stopPriceRefresh();

    readSavedMarketsNow();

    await vi.waitFor(() => expect(rotateSelfReadMarkets).toHaveBeenCalled());
  });

  it("says nothing when the read fails", async () => {
    rotateSelfReadMarkets.mockRejectedValueOnce(new Error("offline"));

    expect(() => readSavedMarketsNow()).not.toThrow();
    await vi.waitFor(() => expect(rotateSelfReadMarkets).toHaveBeenCalled());
  });

  it("throws away what has gone a day unread", async () => {
    readSavedMarketsNow();

    await vi.waitFor(() => expect(dropUnreadMarkets).toHaveBeenCalled());
  });

  it("probes the hubs, as a tick does", async () => {
    readSavedMarketsNow();

    await vi.waitFor(() =>
      expect(revalidateMarketRefreshTimes).toHaveBeenCalled(),
    );
  });

  it("counts as the tick's last probe", async () => {
    startPriceRefresh();
    readSavedMarketsNow();
    await vi.waitFor(() => expect(rotateSelfReadMarkets).toHaveBeenCalled());
    rotateSelfReadMarkets.mockClear();

    setVisibility("hidden");
    setVisibility("visible");

    expect(rotateSelfReadMarkets).not.toHaveBeenCalled();
  });

  it("sweeps even when the read fails", async () => {
    rotateSelfReadMarkets.mockRejectedValueOnce(new Error("offline"));

    readSavedMarketsNow();

    await vi.waitFor(() => expect(dropUnreadMarkets).toHaveBeenCalled());
  });
});
