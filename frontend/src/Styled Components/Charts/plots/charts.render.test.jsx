import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { cloneElement } from "react";
import { TimeSeriesChart } from "./TimeSeriesChart";
import { RankedBarChart } from "./RankedBarChart";
import { PieChart } from "./PieChart";

function sized(ui) {
  return render(cloneElement(ui, { width: 600, height: 400 }));
}

const months = [
  { month: "2026-07", profitLoss: 4_000_000, jobCostTotal: 12_000_000 },
  { month: "2026-08", profitLoss: -1_000_000, jobCostTotal: 3_000_000 },
];

describe("chart primitives", () => {
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
    expect(container.querySelector(".recharts-bar")).not.toBeNull();
    expect(container.querySelector(".recharts-line")).not.toBeNull();
  });

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

describe("a sparse line series", () => {
  const sparseMonths = [
    { month: "2026-05", price: 1000 },
    { month: "2026-06", price: null },
    { month: "2026-07", price: null },
    { month: "2026-08", price: 1400 },
  ];

  function draw(series) {
    return sized(
      <TimeSeriesChart
        rows={sparseMonths}
        categoryKey="month"
        series={[series]}
      />,
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
    const d = curve.getAttribute("d") ?? "";
    expect(d.match(/M/g)?.length ?? 0).toBe(1);
    expect(container.querySelectorAll(".recharts-line-dot").length).toBe(2);
  });

  it("leaves a series that declares no gaps alone", () => {
    const container = draw({ key: "price", label: "Price", type: "line" });

    expect(container.querySelector(".recharts-line-curve")).not.toBeNull();
    expect(container.querySelectorAll(".recharts-line-dot").length).toBe(0);
  });

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

describe("an area split at zero", () => {
  const series = {
    key: "cumulativeProfit",
    label: "Running profit",
    type: "area",
    splitAtZero: true,
  };

  function stops(container) {
    const gradient = container.querySelector("linearGradient");
    return [...(gradient?.children ?? [])].map((stop) => ({
      offset: stop.getAttribute("offset"),
      colour: stop.getAttribute("stop-color"),
    }));
  }

  it("breaks the fill where the running total crosses zero", () => {
    const { container } = sized(
      <TimeSeriesChart
        rows={[
          { month: "2026-07", cumulativeProfit: 300 },
          { month: "2026-08", cumulativeProfit: -100 },
        ]}
        categoryKey="month"
        series={[series]}
      />,
    );

    const [above, below] = stops(container);
    expect(above.offset).toBe("0.75");
    expect(below.offset).toBe("0.75");
    expect(below.colour).not.toBe(above.colour);
    const area = container.querySelector(".recharts-area-area");
    expect(area.getAttribute("fill")).toMatch(/^url\(#/);
  });

  it("leaves an ordinary area on its series colour", () => {
    const { container } = sized(
      <TimeSeriesChart
        rows={months}
        categoryKey="month"
        series={[{ key: "profitLoss", label: "Profit", type: "area" }]}
      />,
    );

    expect(container.querySelector("linearGradient")).toBeNull();
    expect(
      container.querySelector(".recharts-area-area").getAttribute("fill"),
    ).not.toMatch(/^url\(#/);
  });
});

describe("series a reader has set aside", () => {
  const series = [
    { key: "jobCostTotal", label: "Cost", type: "bar", stackId: "c" },
    { key: "profitLoss", label: "Profit", type: "bar", stackId: "c" },
  ];

  function draw(hiddenKey) {
    return sized(
      <TimeSeriesChart
        rows={months}
        categoryKey="month"
        series={series.map((s) => ({ ...s, hidden: s.key === hiddenKey }))}
        showLegend={false}
      />,
    );
  }

  it("draws only the series still on show", () => {
    const all = draw(null).container.querySelectorAll(".recharts-bar").length;
    const one =
      draw("jobCostTotal").container.querySelectorAll(".recharts-bar").length;

    expect(all).toBe(2);
    expect(one).toBe(1);
  });

  it("leaves its own legend out when asked", () => {
    const { container } = draw(null);

    expect(container.querySelector(".recharts-legend-wrapper")).toBeNull();
  });
});

describe("a pinned axis", () => {
  it("holds the domain it was given", () => {
    const { container } = sized(
      <TimeSeriesChart
        rows={[{ month: "2026-07", share: 100.00000000000003 }]}
        categoryKey="month"
        series={[{ key: "share", label: "Share", type: "bar" }]}
        leftDomain={[0, 100]}
        formatAxisTick={(value) => `${value}%`}
      />,
    );
    const ticks = [
      ...container.querySelectorAll(".recharts-cartesian-axis-tick-value"),
    ]
      .map((tick) => tick.textContent)
      .filter((text) => text.endsWith("%"));

    expect(ticks).toContain("100%");
    expect(ticks.some((tick) => tick.includes("100.0000"))).toBe(false);
  });

  it("rules a line at zero only when asked", () => {
    const rows = [
      { name: "Veldspar", difference: 500 },
      { name: "Scordite", difference: -300 },
    ];
    const plain = sized(
      <RankedBarChart rows={rows} categoryKey="name" valueKey="difference" />,
    );
    expect(
      plain.container.querySelector(".recharts-reference-line"),
    ).toBeNull();
    plain.unmount();

    const marked = sized(
      <RankedBarChart
        rows={rows}
        categoryKey="name"
        valueKey="difference"
        markZero
      />,
    );
    expect(
      marked.container.querySelector(".recharts-reference-line"),
    ).not.toBeNull();
  });
});
