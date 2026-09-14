import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const revalidateSourceClocks = vi.fn();
vi.mock("./priceCache.js", () => ({
  revalidateSourceClocks: (...args) => revalidateSourceClocks(...args),
}));

const { startPriceRefresh, stopPriceRefresh } =
  await import("./priceRefreshSchedule.js");

const PROBE_INTERVAL_MS = 15 * 60 * 1000;
const WAKE_PROBE_FLOOR_MS = 5 * 60 * 1000;

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
