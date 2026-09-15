import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const revalidateSourceClocks = vi.fn();
const expireSavedSourceRows = vi.fn();
vi.mock("./priceCache.js", () => ({
  revalidateSourceClocks: (...args) => revalidateSourceClocks(...args),
  expireSavedSourceRows: (...args) => expireSavedSourceRows(...args),
}));

// The module's own pacing, not a second copy of it: a test carrying its own
// numbers would keep passing against a cadence that had moved.
const {
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
});

afterEach(() => {
  stopPriceRefresh();
  vi.useRealTimers();
  setVisibility("visible");
});

describe("starting and stopping", () => {
  // Nothing is asked on start: the prices a surface wants are fetched by the
  // surface, and those answers carry the clocks. This covers the gap after.
  it("asks nothing until the first interval passes", () => {
    startPriceRefresh();

    expect(revalidateSourceClocks).not.toHaveBeenCalled();
  });

  it("asks the markets once each interval passes", () => {
    startPriceRefresh();

    vi.advanceTimersByTime(PROBE_INTERVAL_MS);
    expect(revalidateSourceClocks).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(PROBE_INTERVAL_MS);
    expect(revalidateSourceClocks).toHaveBeenCalledTimes(2);
  });

  // The app starts this once from its entry point. A second call must not leave
  // two timers running, which would double every probe from then on.
  it("ignores a second start", () => {
    startPriceRefresh();
    startPriceRefresh();

    vi.advanceTimersByTime(PROBE_INTERVAL_MS);

    expect(revalidateSourceClocks).toHaveBeenCalledTimes(1);
  });

  it("stops asking once stopped", () => {
    startPriceRefresh();
    stopPriceRefresh();

    vi.advanceTimersByTime(PROBE_INTERVAL_MS * 2);
    setVisibility("hidden");
    setVisibility("visible");

    expect(revalidateSourceClocks).not.toHaveBeenCalled();
  });

  it("can be started again after stopping", () => {
    startPriceRefresh();
    stopPriceRefresh();
    startPriceRefresh();

    vi.advanceTimersByTime(PROBE_INTERVAL_MS);

    expect(revalidateSourceClocks).toHaveBeenCalledTimes(1);
  });
});

describe("coming back to the tab", () => {
  // A backgrounded tab's timers are throttled, so a reader returning would
  // otherwise sit on whatever the clock said when the interval last fired.
  it("asks again on returning", () => {
    startPriceRefresh();

    setVisibility("hidden");
    setVisibility("visible");

    expect(revalidateSourceClocks).toHaveBeenCalledTimes(1);
  });

  it("does not ask when the tab is being left", () => {
    startPriceRefresh();

    setVisibility("hidden");

    expect(revalidateSourceClocks).not.toHaveBeenCalled();
  });

  // Alt-tabbing is not a reason to ask every market for a price.
  it("does not ask again within the floor", () => {
    startPriceRefresh();

    setVisibility("hidden");
    setVisibility("visible");
    setVisibility("hidden");
    setVisibility("visible");

    expect(revalidateSourceClocks).toHaveBeenCalledTimes(1);
  });

  it("asks again once the floor has passed", () => {
    startPriceRefresh();

    setVisibility("hidden");
    setVisibility("visible");

    vi.advanceTimersByTime(WAKE_PROBE_FLOOR_MS);
    setVisibility("hidden");
    setVisibility("visible");

    expect(revalidateSourceClocks).toHaveBeenCalledTimes(2);
  });

  // The interval counts as an ask, so returning right after one does not add a
  // second for the same moment.
  it("counts an interval probe against the floor", () => {
    startPriceRefresh();

    vi.advanceTimersByTime(PROBE_INTERVAL_MS);
    expect(revalidateSourceClocks).toHaveBeenCalledTimes(1);

    setVisibility("hidden");
    setVisibility("visible");

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

// A reader-saved market is not asked anything: its rows carry the expiry its own
// book gave them, so the tick retires them locally and only the markets this
// server walks cost a request.
describe("what a tick does about a reader's own markets", () => {
  it("retires their finished rows as well as probing the hubs", () => {
    startPriceRefresh();

    vi.advanceTimersByTime(PROBE_INTERVAL_MS);

    expect(expireSavedSourceRows).toHaveBeenCalledTimes(1);
    expect(revalidateSourceClocks).toHaveBeenCalledTimes(1);
  });

  // Retiring is local and cannot fail against the network, so it must not be
  // skipped when the hubs cannot be reached.
  it("retires them even when the hub probe fails", () => {
    revalidateSourceClocks.mockRejectedValueOnce(new Error("offline"));
    startPriceRefresh();

    vi.advanceTimersByTime(PROBE_INTERVAL_MS);

    expect(expireSavedSourceRows).toHaveBeenCalledTimes(1);
  });

  // And the other direction, which is the one that actually went wrong: the two
  // halves once shared a `try`, so a fault in the local half withheld the probe
  // that keeps every hub price fresh, with nothing reporting it.
  it("probes the hubs even when retiring throws", () => {
    expireSavedSourceRows.mockImplementationOnce(() => {
      throw new TypeError("expireSavedSourceRows is not a function");
    });
    startPriceRefresh();

    vi.advanceTimersByTime(PROBE_INTERVAL_MS);

    expect(revalidateSourceClocks).toHaveBeenCalledTimes(1);
  });

  it("carries on to the next tick after either half throws", () => {
    expireSavedSourceRows.mockImplementationOnce(() => {
      throw new TypeError("nope");
    });
    startPriceRefresh();

    vi.advanceTimersByTime(PROBE_INTERVAL_MS);
    vi.advanceTimersByTime(PROBE_INTERVAL_MS);

    expect(expireSavedSourceRows).toHaveBeenCalledTimes(2);
    expect(revalidateSourceClocks).toHaveBeenCalledTimes(2);
  });
});
