import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const revalidateSourceClocks = vi.fn();
const expireSavedSourceRows = vi.fn();
const rotateSelfReadMarkets = vi.fn();
vi.mock("./priceCache.js", () => ({
  revalidateSourceClocks: (...args) => revalidateSourceClocks(...args),
  expireSavedSourceRows: (...args) => expireSavedSourceRows(...args),
  rotateSelfReadMarkets: (...args) => rotateSelfReadMarkets(...args),
}));

// The module's own pacing, not a second copy of it: a test carrying its own
// numbers would keep passing against a cadence that had moved.
const {
  readSavedMarketsNow,
  startPriceRefresh,
  stopPriceRefresh,
  PROBE_INTERVAL_MS,
  WAKE_PROBE_FLOOR_MS,
} = await import("./priceRefreshSchedule.js");

/** Puts the tab in a state and tells anyone listening it changed. */
function setVisibility(state) {
  Object.defineProperty(document, "visibilityState", {
    value: state,
    configurable: true,
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  vi.useFakeTimers();
  revalidateSourceClocks.mockResolvedValue(undefined);
  rotateSelfReadMarkets.mockResolvedValue(0);
});

afterEach(() => {
  stopPriceRefresh();
  vi.useRealTimers();
  setVisibility("visible");
});

describe("starting and stopping", () => {
  // Nothing is asked on start: the prices a surface wants are fetched by the
  // surface, and those answers carry the clocks. This covers the gap after.
  it("asks nothing until the first interval passes", async () => {
    startPriceRefresh();

    expect(revalidateSourceClocks).not.toHaveBeenCalled();
  });

  it("asks the markets once each interval passes", async () => {
    startPriceRefresh();

    await vi.advanceTimersByTimeAsync(PROBE_INTERVAL_MS);
    expect(revalidateSourceClocks).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(PROBE_INTERVAL_MS);
    expect(revalidateSourceClocks).toHaveBeenCalledTimes(2);
  });

  // The app starts this once from its entry point. A second call must not leave
  // two timers running, which would double every probe from then on.
  it("ignores a second start", async () => {
    startPriceRefresh();
    startPriceRefresh();

    await vi.advanceTimersByTimeAsync(PROBE_INTERVAL_MS);

    expect(revalidateSourceClocks).toHaveBeenCalledTimes(1);
  });

  it("stops asking once stopped", async () => {
    startPriceRefresh();
    stopPriceRefresh();

    await vi.advanceTimersByTimeAsync(PROBE_INTERVAL_MS * 2);
    setVisibility("hidden");
    setVisibility("visible");
    await vi.advanceTimersByTimeAsync(0);

    expect(revalidateSourceClocks).not.toHaveBeenCalled();
  });

  it("can be started again after stopping", async () => {
    startPriceRefresh();
    stopPriceRefresh();
    startPriceRefresh();

    await vi.advanceTimersByTimeAsync(PROBE_INTERVAL_MS);

    expect(revalidateSourceClocks).toHaveBeenCalledTimes(1);
  });
});

describe("coming back to the tab", () => {
  // A backgrounded tab's timers are throttled, so a reader returning would
  // otherwise sit on whatever the clock said when the interval last fired.
  it("asks again on returning", async () => {
    startPriceRefresh();

    setVisibility("hidden");
    setVisibility("visible");
    await vi.advanceTimersByTimeAsync(0);

    expect(revalidateSourceClocks).toHaveBeenCalledTimes(1);
  });

  it("does not ask when the tab is being left", async () => {
    startPriceRefresh();

    setVisibility("hidden");

    expect(revalidateSourceClocks).not.toHaveBeenCalled();
  });

  // Alt-tabbing is not a reason to ask every market for a price.
  it("does not ask again within the floor", async () => {
    startPriceRefresh();

    setVisibility("hidden");
    setVisibility("visible");
    await vi.advanceTimersByTimeAsync(0);
    setVisibility("hidden");
    setVisibility("visible");
    await vi.advanceTimersByTimeAsync(0);

    expect(revalidateSourceClocks).toHaveBeenCalledTimes(1);
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

    expect(revalidateSourceClocks).toHaveBeenCalledTimes(2);
  });

  // The interval counts as an ask, so returning right after one does not add a
  // second for the same moment.
  it("counts an interval probe against the floor", async () => {
    startPriceRefresh();

    await vi.advanceTimersByTimeAsync(PROBE_INTERVAL_MS);
    expect(revalidateSourceClocks).toHaveBeenCalledTimes(1);

    setVisibility("hidden");
    setVisibility("visible");
    await vi.advanceTimersByTimeAsync(0);

    expect(revalidateSourceClocks).toHaveBeenCalledTimes(1);
  });
});

describe("when a probe cannot be made", () => {
  it("carries on to the next one", async () => {
    revalidateSourceClocks.mockRejectedValue(new Error("offline"));
    startPriceRefresh();

    await vi.advanceTimersByTimeAsync(PROBE_INTERVAL_MS);
    await vi.advanceTimersByTimeAsync(PROBE_INTERVAL_MS);

    expect(revalidateSourceClocks).toHaveBeenCalledTimes(2);
  });
});

// A market the reader reads themselves is paced by the expiry its own orders
// carried: the tick reads again the ones that have lapsed, so nobody waits on a
// whole market on the render that needs one price, and retires whatever could
// not be read.
describe("what a tick does about a reader's own markets", () => {
  it("reads the lapsed ones and retires the rest, as well as probing the hubs", async () => {
    startPriceRefresh();

    await vi.advanceTimersByTimeAsync(PROBE_INTERVAL_MS);

    expect(rotateSelfReadMarkets).toHaveBeenCalledTimes(1);
    expect(expireSavedSourceRows).toHaveBeenCalledTimes(1);
    expect(revalidateSourceClocks).toHaveBeenCalledTimes(1);
  });

  // Dropping first would leave a surface blank until the read landed, which is
  // the wait the read exists to avoid.
  it("reads again before retiring, not after", async () => {
    let finishReading;
    rotateSelfReadMarkets.mockReturnValue(
      new Promise((resolve) => {
        finishReading = () => resolve(1);
      }),
    );
    startPriceRefresh();

    await vi.advanceTimersByTimeAsync(PROBE_INTERVAL_MS);
    await vi.waitFor(() => expect(rotateSelfReadMarkets).toHaveBeenCalled());

    // Finished, not merely called: the point of the order is that a market
    // which can be read is replaced rather than emptied, and a sweep running
    // while the read is still out would empty it.
    expect(expireSavedSourceRows).not.toHaveBeenCalled();

    finishReading();
    await vi.waitFor(() => expect(expireSavedSourceRows).toHaveBeenCalled());
  });

  // A whole market read is the one part of a tick that spends the reader's own
  // ESI allowance, and nobody is reading a price they cannot see.
  it("does not read a lapsed market while the tab is hidden", async () => {
    startPriceRefresh();
    setVisibility("hidden");

    await vi.advanceTimersByTimeAsync(PROBE_INTERVAL_MS);

    expect(rotateSelfReadMarkets).not.toHaveBeenCalled();
    // The cheap halves still run: retiring asks nothing, and the probe costs a
    // row, so a reader coming back is not looking at superseded hub figures.
    expect(expireSavedSourceRows).toHaveBeenCalledTimes(1);
    expect(revalidateSourceClocks).toHaveBeenCalledTimes(1);
  });

  // It reaches the network, so it fails like the probe does and must take
  // nothing else down with it.
  it("retires and probes even when reading again throws", async () => {
    rotateSelfReadMarkets.mockRejectedValueOnce(new Error("offline"));
    startPriceRefresh();

    await vi.advanceTimersByTimeAsync(PROBE_INTERVAL_MS);
    await vi.waitFor(() => expect(revalidateSourceClocks).toHaveBeenCalled());

    expect(expireSavedSourceRows).toHaveBeenCalledTimes(1);
  });

  // Retiring is local and cannot fail against the network, so it must not be
  // skipped when the hubs cannot be reached.
  it("retires them even when the hub probe fails", async () => {
    revalidateSourceClocks.mockRejectedValueOnce(new Error("offline"));
    startPriceRefresh();

    await vi.advanceTimersByTimeAsync(PROBE_INTERVAL_MS);

    expect(expireSavedSourceRows).toHaveBeenCalledTimes(1);
  });

  // And the other direction, which is the one that actually went wrong: the two
  // halves once shared a `try`, so a fault in the local half withheld the probe
  // that keeps every hub price fresh, with nothing reporting it.
  it("probes the hubs even when retiring throws", async () => {
    expireSavedSourceRows.mockImplementationOnce(() => {
      throw new TypeError("expireSavedSourceRows is not a function");
    });
    startPriceRefresh();

    await vi.advanceTimersByTimeAsync(PROBE_INTERVAL_MS);

    expect(revalidateSourceClocks).toHaveBeenCalledTimes(1);
  });

  it("carries on to the next tick after either half throws", async () => {
    expireSavedSourceRows.mockImplementationOnce(() => {
      throw new TypeError("nope");
    });
    startPriceRefresh();

    await vi.advanceTimersByTimeAsync(PROBE_INTERVAL_MS);
    await vi.advanceTimersByTimeAsync(PROBE_INTERVAL_MS);

    expect(expireSavedSourceRows).toHaveBeenCalledTimes(2);
    expect(revalidateSourceClocks).toHaveBeenCalledTimes(2);
  });
});

// A reader signing in has their saved markets known at that moment, and waiting
// for the first tick would leave prices they saved those markets for up to a
// quarter of an hour behind.
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

  // A market that cannot be read is put back a turn by the rotation itself, and
  // nobody signing in is told about a market they have not looked at.
  it("says nothing when the read fails", async () => {
    rotateSelfReadMarkets.mockRejectedValueOnce(new Error("offline"));

    expect(() => readSavedMarketsNow()).not.toThrow();
    await vi.waitFor(() => expect(rotateSelfReadMarkets).toHaveBeenCalled());
  });
});
