import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { cloneElement } from "react";
import { TimeSeriesChart } from "./TimeSeriesChart";
import { RankedBarChart } from "./RankedBarChart";
import { PieChart } from "./PieChart";

// jsdom performs no layout, so a ResponsiveContainer measures a zero-sized
// parent and draws nothing. Explicit dimensions are passed to test what the
// chart draws; the sizing itself is asserted on the style object instead.
function sized(ui) {
  return render(cloneElement(ui, { width: 600, height: 400 }));
}

const months = [
  { month: "2026-07", profitLoss: 4_000_000, jobCostTotal: 12_000_000 },
  { month: "2026-08", profitLoss: -1_000_000, jobCostTotal: 3_000_000 },
];

describe("chart primitives", () => {
  // The same component draws whatever series it is handed, which is what makes
  // one primitive serve several charts.
  it("draws a series list of mixed mark types", () => {
    const { container } = sized(
      <TimeSeriesChart
        rows={months}
        categoryKey="month"
        series={[
          { key: "jobCostTotal", label: "Cost", type: "bar" },
          { key: "profitLoss", label: "Profit", type: "line" },
        ]}
      />,
    );
    // Each series must actually draw. A series pointing at an axis id that does
    // not exist silently renders nothing, leaving an empty chart area.
    expect(container.querySelector(".recharts-bar")).not.toBeNull();
    expect(container.querySelector(".recharts-line")).not.toBeNull();
  });

  // Price history puts volume on a second axis while the rest use the default
  // one, so a right-hand series must not stop the left-hand ones drawing.
  it("draws both axes' series when one uses the right axis", () => {
    const { container } = sized(
      <TimeSeriesChart
        rows={months}
        categoryKey="month"
        series={[
          { key: "profitLoss", label: "Profit", type: "area" },
          { key: "jobCostTotal", label: "Volume", type: "bar", axis: "right" },
        ]}
        rightAxisLabel="Volume"
      />,
    );
    expect(container.querySelector(".recharts-area")).not.toBeNull();
    expect(container.querySelector(".recharts-bar")).not.toBeNull();
  });

  // A second value axis is what price history needs and the statistics charts
  // do not, so the primitive must support it without requiring it.
  it("draws a right-hand axis only when a series asks for one", () => {
    const { container } = sized(
      <TimeSeriesChart
        rows={months}
        categoryKey="month"
        series={[
          { key: "profitLoss", label: "Profit", type: "line" },
          { key: "jobCostTotal", label: "Volume", type: "bar", axis: "right" },
        ]}
        rightAxisLabel="Volume"
      />,
    );
    expect(container.querySelector("svg")).not.toBeNull();
  });

  // Empty rows draw nothing rather than throwing: deciding whether that means
  // loading, or no data, belongs to the panel.
  it("renders with no rows", () => {
    const { container } = sized(
      <TimeSeriesChart
        rows={[]}
        categoryKey="month"
        series={[{ key: "profitLoss", label: "Profit" }]}
      />,
    );
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("draws a ranked bar chart", () => {
    const { container } = sized(
      <RankedBarChart
        rows={[
          { name: "Rifter", profitLoss: 5_000_000 },
          { name: "Punisher", profitLoss: 2_000_000 },
        ]}
        categoryKey="name"
        valueKey="profitLoss"
        valueLabel="Profit"
      />,
    );
    expect(container.querySelector("svg")).not.toBeNull();
  });

  // Per-bar colouring goes through the shape render prop; Cell is deprecated in
  // recharts 3 and removed in 4.
  it("colours bars individually when asked", () => {
    const { container } = sized(
      <RankedBarChart
        rows={[
          { name: "Rifter", profitLoss: 5_000_000 },
          { name: "Punisher", profitLoss: -2_000_000 },
        ]}
        categoryKey="name"
        valueKey="profitLoss"
        colourFor={(row) => (row.profitLoss < 0 ? "#f03939" : "#3fa34d")}
      />,
    );
    expect(container.querySelector("svg")).not.toBeNull();
  });

  // Charts size themselves through CSS rather than a fixed pixel height, so a
  // chart follows the width of whatever page it is placed on.
  it("fills its container width at an aspect ratio by default", () => {
    const { container } = render(
      <div data-testid="parent" style={{ width: 600 }}>
        <TimeSeriesChart
          rows={months}
          categoryKey="month"
          series={[{ key: "profitLoss", label: "Profit" }]}
        />
      </div>,
    );
    const chart = container.querySelector(
      '[data-testid="parent"]',
    ).firstElementChild;
    expect(chart.style.width).toBe("100%");
    expect(chart.style.aspectRatio).not.toBe("");
  });

  // A caller that needs to fill a sized container overrides the default rather
  // than the primitive guessing which layout it is in.
  it("accepts a style override", () => {
    const { container } = render(
      <div data-testid="parent" style={{ height: 400 }}>
        <TimeSeriesChart
          rows={months}
          categoryKey="month"
          series={[{ key: "profitLoss", label: "Profit" }]}
          style={{ height: "100%", aspectRatio: "auto" }}
        />
      </div>,
    );
    const chart = container.querySelector(
      '[data-testid="parent"]',
    ).firstElementChild;
    expect(chart.style.height).toBe("100%");
  });

  // The app-shell chrome is a default, not a requirement: a caller with its own
  // look overrides it rather than being forced into the panel design.
  it("lets a caller turn the grid off", () => {
    const withGrid = sized(
      <TimeSeriesChart
        rows={months}
        categoryKey="month"
        series={[{ key: "profitLoss", label: "Profit" }]}
      />,
    );
    expect(
      withGrid.container.querySelector(".recharts-cartesian-grid"),
    ).not.toBeNull();

    const without = sized(
      <TimeSeriesChart
        rows={months}
        categoryKey="month"
        series={[{ key: "profitLoss", label: "Profit" }]}
        showGrid={false}
      />,
    );
    expect(
      without.container.querySelector(".recharts-cartesian-grid"),
    ).toBeNull();
  });

  it("draws a pie chart", () => {
    const { container } = sized(
      <PieChart
        rows={[
          { segment: "Market", total: 10 },
          { segment: "Stock", total: 4 },
        ]}
        categoryKey="segment"
        valueKey="total"
      />,
    );
    expect(container.querySelector("svg")).not.toBeNull();
  });
});

// A month nothing sold in has no average price, which is not a price of zero.
// The series therefore carries nulls, and how the line handles them decides
// whether a sparse history is readable or a scatter of fragments.
describe("a sparse line series", () => {
  const sparseMonths = [
    { month: "2026-05", price: 1000 },
    { month: "2026-06", price: null },
    { month: "2026-07", price: null },
    { month: "2026-08", price: 1400 },
  ];

  function draw(series) {
    return sized(
      <TimeSeriesChart rows={sparseMonths} categoryKey="month" series={[series]} />,
    ).container;
  }

  it("bridges the gap and marks the readings that are real", () => {
    const container = draw({
      key: "price",
      label: "Avg sale price",
      type: "line",
      sparse: true,
    });

    const curve = container.querySelector(".recharts-line-curve");
    expect(curve).not.toBeNull();
    // One unbroken path rather than a fragment per run of readings. A break is
    // written into the path data as a second move command.
    const d = curve.getAttribute("d") ?? "";
    expect(d.match(/M/g)?.length ?? 0).toBe(1);
    // The dots are what separate an observed value from the bridge drawn
    // between two of them.
    expect(container.querySelectorAll(".recharts-line-dot").length).toBe(2);
  });

  // A dense series gains nothing from either, and dots on one would be noise.
  it("leaves a series that declares no gaps alone", () => {
    const container = draw({ key: "price", label: "Price", type: "line" });

    expect(container.querySelector(".recharts-line-curve")).not.toBeNull();
    expect(container.querySelectorAll(".recharts-line-dot").length).toBe(0);
  });

  // The case that draws nothing at all without dots: a single reading has no
  // neighbour to draw a segment to.
  it("still shows a lone reading surrounded by gaps", () => {
    const { container } = sized(
      <TimeSeriesChart
        rows={[
          { month: "2026-05", price: null },
          { month: "2026-06", price: 1200 },
          { month: "2026-07", price: null },
        ]}
        categoryKey="month"
        series={[{ key: "price", label: "Price", type: "line", sparse: true }]}
      />,
    );
    expect(container.querySelectorAll(".recharts-line-dot").length).toBe(1);
  });
});
