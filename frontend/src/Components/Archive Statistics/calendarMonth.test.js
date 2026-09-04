import { describe, it, expect } from "vitest";
import {
  monthKey,
  monthKeyFromDate,
  monthKeyOrDash,
  monthKeyToDate,
} from "./calendarMonth.js";

// Every month the archive names is written the same way, whichever shape it
// arrives in: a stored row, a date a picker holds, or the string itself.
describe("monthKey", () => {
  // The wire format is zero-padded so lexical order matches calendar order.
  it("pads to YYYY-MM", () => {
    expect(monthKey({ year: 2026, month: 7 })).toBe("2026-07");
    expect(monthKey({ year: 2026, month: 12 })).toBe("2026-12");
  });
});


describe("months a picker holds", () => {
  it("writes a date as the stored key", () => {
    expect(monthKeyFromDate(new Date(Date.UTC(2026, 2, 15)))).toBe("2026-03");
  });

  it("reads a key back as a date in that month", () => {
    const date = monthKeyToDate("2026-03");

    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(2);
  });

  // No month is a real answer — the picker is empty and the server derives it —
  // so it round-trips as nothing rather than as the epoch.
  it("treats no month as no date, both ways", () => {
    expect(monthKeyFromDate(null)).toBe("");
    expect(monthKeyToDate("")).toBeNull();
  });
});

describe("a month for reading", () => {
  it("shows a dash when the archive never set one", () => {
    expect(monthKeyOrDash({ year: 0, month: 0 })).toBe("—");
    expect(monthKeyOrDash(undefined)).toBe("—");
  });

  it("shows the month when it has one", () => {
    expect(monthKeyOrDash({ year: 2026, month: 3 })).toBe("2026-03");
  });
});
