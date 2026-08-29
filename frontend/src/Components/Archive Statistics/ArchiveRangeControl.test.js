import { describe, it, expect } from "vitest";
import { resolveArchiveRange } from "./ArchiveRangeControl";

// Mid-month, to catch anything that assumes the first or last day.
const now = new Date(Date.UTC(2026, 7, 17)); // 2026-08-17

describe("resolveArchiveRange", () => {
  // No range is how a caller asks the server to choose the window, which is the
  // current month and the one before it.
  it("returns no bounds for the default", () => {
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
