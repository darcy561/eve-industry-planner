import { describe, it, expect } from "vitest";
import { monthLabel } from "./panelParts";

// The two panels that plot months each solved half of this and lost the other
// half. Combined, both statements hold wherever months are drawn.
describe("monthLabel", () => {
  const short = [
    { month: "2026-07", complete: true },
    { month: "2026-08", complete: false },
  ];

  it("marks a month still in progress", () => {
    const label = monthLabel(short);

    expect(label("2026-07")).toBe("2026-07");
    // A partial month standing lower than the rest is not a decline, so it says
    // what it is.
    expect(label("2026-08")).toBe("2026-08 (so far)");
  });

  it("drops the century once there are too many months to fit", () => {
    const many = Array.from({ length: 13 }, (_, i) => ({
      month: `2026-${String(i + 1).padStart(2, "0")}`,
      complete: true,
    }));

    expect(monthLabel(many)("2026-01")).toBe("26-01");
  });

  // The case that needed the two halves joined: a long window whose last month
  // is still running.
  it("shortens and marks at the same time", () => {
    const many = Array.from({ length: 13 }, (_, i) => ({
      month: `2026-${String(i + 1).padStart(2, "0")}`,
      complete: i < 12,
    }));

    expect(monthLabel(many)("2026-01")).toBe("26-01");
    expect(monthLabel(many)("2026-13")).toBe("26-13 (so far)");
  });

  // A row the chart has no entry for is still labelled, rather than throwing.
  it("labels a value it has no row for", () => {
    expect(monthLabel(short)("2025-01")).toBe("2025-01");
    expect(monthLabel()("2025-01")).toBe("2025-01");
  });
});
