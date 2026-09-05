import { describe, it, expect } from "vitest";
import { createTheme } from "@mui/material/styles";
import {
  chartMargins,
  resolveSeriesColour,
  chartSeriesColours,
  sectorHighlight,
  withSeriesColours,
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

describe("withSeriesColours", () => {
  // Recharts reads a legend swatch from the entry's own fill. Colouring marks
  // only in a shape renderer draws the chart correctly and legends it grey, so
  // the colour has to reach the data.
  it("puts a colour on every row", () => {
    const rows = withSeriesColours(theme, [{ name: "A" }, { name: "B" }]);

    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.fill).toBeTruthy();
    }
  });

  it("gives neighbouring rows different colours", () => {
    const rows = withSeriesColours(theme, [{ name: "A" }, { name: "B" }, { name: "C" }]);

    expect(new Set(rows.map((row) => row.fill)).size).toBe(3);
  });

  it("keeps the row's own fields, and its own colour when it has one", () => {
    const rows = withSeriesColours(theme, [{ name: "A", value: 5, colour: "#123456" }]);

    expect(rows[0]).toMatchObject({ name: "A", value: 5, fill: "#123456" });
  });

  it("survives no rows", () => {
    expect(withSeriesColours(theme)).toEqual([]);
    expect(withSeriesColours(theme, [])).toEqual([]);
  });
});

describe("sectorHighlight", () => {
  const sector = { name: "Hauling Service", index: 1, outerRadius: 100, isActive: false };

  // Nothing is hovered, so every slice draws at full strength.
  it("leaves the chart alone when nothing is hovered", () => {
    expect(sectorHighlight(sector, null)).toMatchObject({
      active: false,
      fillOpacity: 1,
      outerRadius: 100,
    });
  });

  it("grows the slice whose legend key is hovered", () => {
    const { active, fillOpacity, outerRadius } = sectorHighlight(sector, "Hauling Service");

    expect(active).toBe(true);
    expect(fillOpacity).toBe(1);
    expect(outerRadius).toBeGreaterThan(100);
  });

  // The point of the highlight is contrast, so the others have to recede.
  it("fades the slices that are not hovered", () => {
    expect(sectorHighlight(sector, "Blueprint Copies")).toMatchObject({
      active: false,
      fillOpacity: 0.35,
      outerRadius: 100,
    });
  });

  // The legend sorts its own items, so its index is a position in the key list
  // rather than in the data. Matching on position highlights the wrong slice.
  it("matches on name rather than position", () => {
    const first = { name: "Other", index: 0, outerRadius: 100 };
    const second = { name: "Hauling Service", index: 1, outerRadius: 100 };

    expect(sectorHighlight(first, "Hauling Service").active).toBe(false);
    expect(sectorHighlight(second, "Hauling Service").active).toBe(true);
  });

  // Pointing at the slice itself reads the same as pointing at its key.
  it("honours the chart's own hover state", () => {
    expect(sectorHighlight({ ...sector, isActive: true }, null)).toMatchObject({
      active: true,
      fillOpacity: 1,
    });
  });

  // A percentage radius is resolved by the chart before the shape sees it, but a
  // non-numeric one must pass through rather than becoming NaN.
  it("passes a non-numeric radius through untouched", () => {
    expect(sectorHighlight({ name: "A", outerRadius: "75%" }, "A").outerRadius).toBe("75%");
  });
});
