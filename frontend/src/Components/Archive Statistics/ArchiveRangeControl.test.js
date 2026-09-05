import { describe, it, expect } from "vitest";
import { ARCHIVE_RANGES, resolveArchiveRange } from "./ArchiveRangeControl";

// Mid-month, to catch anything that assumes the first or last day.
const now = new Date(Date.UTC(2026, 7, 17)); // 2026-08-17

describe("resolveArchiveRange", () => {
  // Unbounded is how the API is asked for its own window, which is this month
  // and the one before — what the label says. Sending bounds for it would be a
  // second cache entry holding months already read.
  it("resolves the default to no bounds at all", () => {
    expect(resolveArchiveRange("default", now)).toEqual({});
  });

  it("returns no bounds for an unknown key", () => {
    expect(resolveArchiveRange("nonsense", now)).toEqual({});
  });

  // The window ends with the current month and counts back inclusively, so six
  // months means six months of data rather than seven.
  it("counts back inclusively from the current month", () => {
    expect(resolveArchiveRange("6m", now)).toEqual({
      from: "2026-03",
      to: "2026-08",
    });
  });

  // A window crossing a year boundary is the common case for the longer
  // presets, not an edge one.
  it("crosses year boundaries", () => {
    expect(resolveArchiveRange("12m", now)).toEqual({
      from: "2025-09",
      to: "2026-08",
    });
    expect(resolveArchiveRange("24m", now)).toEqual({
      from: "2024-09",
      to: "2026-08",
    });
  });

  // The bounds are zero-padded so lexical order matches calendar order, which
  // is what the stored month keys rely on.
  it("zero-pads single-digit months", () => {
    const january = new Date(Date.UTC(2026, 0, 5));
    expect(resolveArchiveRange("6m", january)).toEqual({
      from: "2025-08",
      to: "2026-01",
    });
  });

  // Both bounds travel together: the API rejects half a range rather than
  // filling in the missing one.
  it("always returns both bounds or neither", () => {
    for (const key of ["default", "6m", "12m", "24m"]) {
      const range = resolveArchiveRange(key, now);
      const bounds = [range.from, range.to].filter(Boolean);
      expect(bounds.length === 0 || bounds.length === 2).toBe(true);
    }
  });
});

// The server caps an explicit range, so "everything" cannot be expressed as a
// very wide window: it is asked for by name and bounded by what the account has.
describe("all time", () => {
  it("resolves to a named range rather than a pair of bounds", () => {
    const resolved = resolveArchiveRange("all", new Date("2026-09-01T00:00:00Z"));

    expect(resolved).toEqual({ range: "all" });
    expect(resolved.from).toBeUndefined();
    expect(resolved.to).toBeUndefined();
  });

  it("is offered as the last preset", () => {
    expect(ARCHIVE_RANGES.at(-1)).toMatchObject({ key: "all", label: "All time" });
  });

  // The month presets keep working alongside it.
  it("leaves a month preset resolving to bounds", () => {
    const resolved = resolveArchiveRange("6m", new Date("2026-09-01T00:00:00Z"));

    expect(resolved).toEqual({ from: "2026-04", to: "2026-09" });
    expect(resolved.range).toBeUndefined();
  });
});
