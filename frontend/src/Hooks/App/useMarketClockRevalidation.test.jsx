import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const revalidateSourceClocks = vi.fn();
vi.mock("../../Functions/MarketData/priceCache", () => ({
  revalidateSourceClocks: (...args) => revalidateSourceClocks(...args),
}));

const { default: useMarketClockRevalidation } =
  await import("./useMarketClockRevalidation.js");

const PROBE_INTERVAL = 15 * 60 * 1000;

beforeEach(() => {
  vi.useFakeTimers();
  revalidateSourceClocks.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

/** Puts the tab in a state and tells anyone listening it changed. */
function setVisibility(state) {
  Object.defineProperty(document, "visibilityState", {
    value: state,
    configurable: true,
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("keeping held prices in step with their markets", () => {
  // Nothing is asked on mount: the prices a surface wants are fetched by the
  // surface, and those answers carry the clocks. This only covers the gap after.
  it("asks nothing until the first interval passes", () => {
    renderHook(() => useMarketClockRevalidation());

    expect(revalidateSourceClocks).not.toHaveBeenCalled();
  });

  it("asks the markets once each interval passes", () => {
    renderHook(() => useMarketClockRevalidation());

    vi.advanceTimersByTime(PROBE_INTERVAL);
    expect(revalidateSourceClocks).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(PROBE_INTERVAL);
    expect(revalidateSourceClocks).toHaveBeenCalledTimes(2);
  });

  // A backgrounded tab's timers are throttled, so a reader coming back would
  // otherwise sit on whatever the clock said when the interval last fired.
  it("asks again when the reader comes back to the tab", () => {
    renderHook(() => useMarketClockRevalidation());

    // Away and back, rather than straight to visible: a tab starts visible, so
    // asserting from there proves only that the handler runs, not that the
    // return from a backgrounded tab is what it runs on.
    setVisibility("hidden");
    setVisibility("visible");

    expect(revalidateSourceClocks).toHaveBeenCalledTimes(1);
  });

  it("does not ask when the tab is being left", () => {
    renderHook(() => useMarketClockRevalidation());

    setVisibility("hidden");

    expect(revalidateSourceClocks).not.toHaveBeenCalled();
  });

  it("stops asking once unmounted", () => {
    const { unmount } = renderHook(() => useMarketClockRevalidation());

    unmount();
    vi.advanceTimersByTime(PROBE_INTERVAL * 2);
    setVisibility("visible");

    expect(revalidateSourceClocks).not.toHaveBeenCalled();
  });

  // A market not answering says nothing about the rows held for it, so the
  // failure is dropped and the next tick asks again rather than the app seeing
  // an unhandled rejection.
  it("survives a probe that could not be made", () => {
    revalidateSourceClocks.mockRejectedValue(new Error("offline"));
    renderHook(() => useMarketClockRevalidation());

    expect(() => vi.advanceTimersByTime(PROBE_INTERVAL)).not.toThrow();
    expect(revalidateSourceClocks).toHaveBeenCalledTimes(1);
  });
});
