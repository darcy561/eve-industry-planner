import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { createTheme } from "@mui/material";

import CostTable from "./costTable";

const formatIsk = (value) => value.toLocaleString("en-GB");

const cost = (overrides = {}) => ({
  toBuild: {
    lines: [
      {
        id: "bought",
        label: "Materials bought at market",
        detail: "13 of 16",
        value: 398_600_000,
        perUnit: 39_860_000,
      },
      {
        id: "install",
        label: "Install cost",
        detail: "this job only",
        value: 12_400_000,
        perUnit: 1_240_000,
      },
    ],
    total: 411_000_000,
    perUnit: 41_100_000,
  },
  toSell: {
    lines: [
      {
        id: "brokerFee",
        label: "Broker fee to list",
        detail: "1.5% at Jita",
        value: 9_360_000,
        perUnit: 936_000,
      },
    ],
    total: 9_360_000,
    perUnit: 936_000,
  },
  total: 420_360_000,
  perUnit: 42_036_000,
  ...overrides,
});

const renderTable = (overrides) =>
  render(<CostTable cost={cost(overrides)} formatIsk={formatIsk} />);

const rowFor = (label) => screen.getByText(label).closest("tr");

describe("the cost table", () => {
  it("names its columns", () => {
    renderTable();

    expect(
      screen.getAllByRole("columnheader").map((c) => c.textContent),
    ).toEqual(["Component", "Total", "Per unit"]);
  });

  it("states each part with what it is made of", () => {
    renderTable();
    const cells = within(rowFor("Materials bought at market")).getAllByRole(
      "cell",
    );

    expect(screen.getByText("13 of 16")).toBeInTheDocument();
    expect(cells[1]).toHaveTextContent("398,600,000");
  });

  it("divides each figure by what the job makes", () => {
    renderTable();
    const cells = within(rowFor("Install cost")).getAllByRole("cell");

    expect(cells[2]).toHaveTextContent("1,240,000");
  });

  it("has no per-unit column to fill for a job that makes nothing", () => {
    render(
      <CostTable
        cost={cost({
          toBuild: {
            lines: [
              {
                id: "install",
                label: "Install cost",
                value: 12_400_000,
                perUnit: null,
              },
            ],
            total: 12_400_000,
            perUnit: null,
          },
        })}
        formatIsk={formatIsk}
      />,
    );
    const cells = within(rowFor("Install cost")).getAllByRole("cell");

    expect(cells[2]).toHaveTextContent("—");
  });

  it("states the per-unit the figures worked out, not one of its own", () => {
    // Dividing again here is how a table's total stops matching the model's.
    renderTable();

    expect(
      within(rowFor("Cost to build and sell")).getAllByRole("cell")[2],
    ).toHaveTextContent("42,036,000");
  });

  it("subtotals the build separately from the whole", () => {
    renderTable();

    expect(
      within(rowFor("Cost to build")).getAllByRole("cell")[1],
    ).toHaveTextContent("411,000,000");
    expect(
      within(rowFor("Cost to build and sell")).getAllByRole("cell")[1],
    ).toHaveTextContent("420,360,000");
  });

  it("names the selling band, because it is only paid if the output is listed", () => {
    renderTable();

    expect(screen.getByText(/Cost to sell/)).toBeInTheDocument();
  });

  it("leaves the selling band out entirely when nothing is charged", () => {
    // A job whose output never reaches the market is Stage H's case.
    renderTable({ toSell: { lines: [], total: 0 }, total: 411_000_000 });

    expect(screen.queryByText(/Cost to sell/)).toBeNull();
    expect(screen.queryByText("Cost to build and sell")).toBeNull();
    expect(screen.getByText("Cost to build")).toBeInTheDocument();
  });
});

// A table left to itself squeezes its label column to a word a line and still
// runs off the side of the panel. The scrolling belongs to ScrollingTable and is
// tested there; what is this table's own is the floor it picks and its figures
// staying on one line.
describe("a window too narrow for the table", () => {
  it("holds the table to a width its columns can be read at", () => {
    const { container } = render(
      <CostTable cost={cost()} formatIsk={formatIsk} />,
    );

    expect(getComputedStyle(container.querySelector("table")).minWidth).toBe(
      `${createTheme().breakpoints.values.sm}px`,
    );
  });

  // A figure broken across two lines cannot be read as a number.
  it("never breaks a figure across lines", () => {
    render(<CostTable cost={cost()} formatIsk={formatIsk} />);

    const figure = screen.getByText("398,600,000").closest("td");

    expect(getComputedStyle(figure).whiteSpace).toBe("nowrap");
  });
});
