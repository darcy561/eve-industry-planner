import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

const useAccountTimelineQuery = vi.fn();
vi.mock("../../Hooks/React Query/Backend/statisticsTimeline", () => ({
  useAccountTimelineQuery: (...args) => useAccountTimelineQuery(...args),
}));

const { useArchiveTimeline } = await import("./useArchiveTimeline.js");
const { resolveArchiveRange } = await import("./ArchiveRangeControl.jsx");

const months = [
  { year: 2026, month: 1, profitLoss: 20 },
  { year: 2026, month: 2, profitLoss: 40 },
];

beforeEach(() => {
  useAccountTimelineQuery.mockReset();
  useAccountTimelineQuery.mockReturnValue({
    data: { months },
    isLoading: false,
    isError: false,
  });
});

describe("useArchiveTimeline", () => {
  // The window is what is asked for, not what is kept from a wider read: two
  // months on screen is two months read.
  it("sends the window it was given", () => {
    renderHook(() => useArchiveTimeline({ from: "2026-01", to: "2026-02" }));

    expect(useAccountTimelineQuery.mock.calls[0][0]).toEqual({
      from: "2026-01",
      to: "2026-02",
    });
  });

  // The API rejects half a range rather than filling the missing bound in.
  it("sends neither bound when only one is given", () => {
    renderHook(() => useArchiveTimeline({ from: "2026-01" }));

    expect(useAccountTimelineQuery.mock.calls[0][0]).toEqual({});
  });

  // The default preset names no window, which is how the server is asked for
  // its own — this month and the one before.
  it("asks for nothing when the default preset is resolved", () => {
    const window = resolveArchiveRange("default", new Date("2026-02-15T00:00:00Z"));
    renderHook(() => useArchiveTimeline(window));

    expect(useAccountTimelineQuery.mock.calls[0][0]).toEqual({});
  });

  it("asks for every month by name rather than by a wide pair of bounds", () => {
    renderHook(() => useArchiveTimeline(resolveArchiveRange("all")));

    expect(useAccountTimelineQuery.mock.calls[0][0]).toEqual({ range: "all" });
  });

  it("asks for one item, chain builds included, when given a type", () => {
    renderHook(() =>
      useArchiveTimeline({ typeID: 34, includeProductionChain: true }),
    );

    expect(useAccountTimelineQuery.mock.calls[0][0]).toEqual({
      typeID: 34,
      includeProductionChain: true,
    });
  });

  // Chain output is counted again through the parent job that consumed it, so a
  // view summing across item types must leave it off or it counts twice.
  it("never asks for production chain output unless told to", () => {
    renderHook(() => useArchiveTimeline());

    expect(
      useAccountTimelineQuery.mock.calls[0][0].includeProductionChain,
    ).toBeUndefined();
  });

  it("returns the months the read came back with", () => {
    const { result } = renderHook(() => useArchiveTimeline());

    expect(result.current.months).toBe(months);
  });

  it("passes the read's own loading and error state through", () => {
    useAccountTimelineQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });
    const { result } = renderHook(() => useArchiveTimeline({ from: "2026-01" }));

    expect(result.current.isLoading).toBe(true);
    expect(result.current.months).toEqual([]);
  });

  // A caller memoises on it, so an unsettled read must not hand back a new array
  // every render.
  it("holds one empty array while a read is in flight", () => {
    useAccountTimelineQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });
    const { result, rerender } = renderHook(() => useArchiveTimeline());
    const first = result.current.months;
    rerender();

    expect(result.current.months).toBe(first);
  });
});
