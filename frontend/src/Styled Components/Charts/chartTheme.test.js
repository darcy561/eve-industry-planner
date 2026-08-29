import { describe, it, expect } from "vitest";
import { createTheme } from "@mui/material/styles";
import {
  chartMargins,
  resolveSeriesColour,
  chartSeriesColours,
} from "./chartTheme";

const theme = createTheme();

describe("resolveSeriesColour", () => {
  // An explicit colour is the caller's, so a series that must match something
  // elsewhere on the page is not overridden by the palette.
  it("honours an explicit series colour", () => {
    expect(resolveSeriesColour(theme, { colour: "#abcdef" }, 3)).toBe(
      "#abcdef",
    );
  });

  // Charts assign colours by position, so the same series index is the same
  // colour on every chart of a page.
  it("assigns palette colours by index", () => {
    const palette = chartSeriesColours(theme);
    expect(resolveSeriesColour(theme, {}, 0)).toBe(palette[0]);
    expect(resolveSeriesColour(theme, {}, 1)).toBe(palette[1]);
  });

  // More series than colours must still render rather than returning undefined.
  it("wraps rather than running out", () => {
    const palette = chartSeriesColours(theme);
    expect(resolveSeriesColour(theme, {}, palette.length)).toBe(palette[0]);
  });
});

describe("chartMargins", () => {
  // Long category labels need room beneath the axis. Value axes size themselves.
  it("widens the bottom margin for longer categories", () => {
    const short = chartMargins([{ month: "07" }], "month");
    const long = chartMargins([{ month: "September 2026 (partial)" }], "month");
    expect(long.bottom).toBeGreaterThan(short.bottom);
  });

  // Capped so one outlier label cannot squeeze out the plot area.
  it("caps the bottom margin", () => {
    const huge = chartMargins([{ month: "x".repeat(400) }], "month");
    expect(huge.bottom).toBeLessThanOrEqual(110);
  });

  // The axis draws the formatted label, so an ISO date that renders as a longer
  // human date needs the room its rendered form takes.
  it("measures the formatted label, not the raw value", () => {
    const raw = chartMargins([{ d: "2026-07-01" }], "d");
    const formatted = chartMargins([{ d: "2026-07-01" }], "d", {
      formatCategory: () => "01 September 2026",
    });
    expect(formatted.bottom).toBeGreaterThan(raw.bottom);
  });

  // Rotated labels occupy vertical space proportional to their length.
  it("gives rotated labels more room", () => {
    const flat = chartMargins([{ d: "2026-07-01" }], "d");
    const rotated = chartMargins([{ d: "2026-07-01" }], "d", { angle: -20 });
    expect(rotated.bottom).toBeGreaterThan(flat.bottom);
  });

  // No rows still yields usable margins rather than NaN.
  it("handles empty rows", () => {
    const margins = chartMargins([], "month");
    expect(Number.isFinite(margins.left)).toBe(true);
    expect(Number.isFinite(margins.bottom)).toBe(true);
  });
});
