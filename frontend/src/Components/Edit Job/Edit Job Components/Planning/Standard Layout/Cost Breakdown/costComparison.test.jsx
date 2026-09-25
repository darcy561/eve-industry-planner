import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import CostComparison from "./costComparison";
import { compareToHistory } from "../../../../../../Functions/Job/buildComparison.js";

const history = (overrides = {}) => ({
  buildCount: 4,
  cheapestCostPerItem: 228,
  dearestCostPerItem: 236,
  lastCostPerItem: 230,
  lastCostMonth: { year: 2026, month: 5 },
  ...overrides,
});

const formatIsk = (value) => String(Math.round(value));

const renderFor = (h, perUnit) =>
  render(
    <CostComparison
      comparison={compareToHistory(h, perUnit)}
      formatIsk={formatIsk}
    />,
  );

describe("the cost comparison", () => {
  it("places the build on a range drawn from the archive's own ends", () => {
    renderFor(history(), 234);

    // The ends say which is which: two bare numbers under a line do not.
    expect(screen.getByText("cheapest 228")).toBeInTheDocument();
    expect(screen.getByText("dearest 236")).toBeInTheDocument();
    expect(screen.getByRole("img")).toHaveAccessibleName(
      /Where this build's cost per unit falls between the cheapest and dearest/,
    );
  });

  it("names the month the last build's cost is filed under", () => {
    renderFor(history(), 234);

    expect(screen.getByText("vs last build (May 2026)")).toBeInTheDocument();
    expect(screen.getByText("+1.7%")).toBeInTheDocument();
  });

  // A dot pinned to an end says nothing about how far past it the build is.
  it("says so when the build falls outside every previous one", () => {
    renderFor(history(), 200);

    expect(
      screen.getByText("Cheaper than any build you have archived"),
    ).toBeInTheDocument();
  });

  it("draws no range against a single previous build", () => {
    renderFor(
      history({
        buildCount: 1,
        cheapestCostPerItem: 230,
        dearestCostPerItem: 230,
      }),
      240,
    );

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("+4.3%")).toBeInTheDocument();
  });

  // A first build is information rather than an absence: it says the estimate
  // has nothing to be checked against. It is also what a signed-out reader sees,
  // so there is one path and not two.
  it("says there is nothing to compare against rather than rendering nothing", () => {
    renderFor(undefined, 234);

    expect(
      screen.getByText(/No archived builds of this item yet/),
    ).toBeInTheDocument();
  });

  // The count sat under the middle of the bar, where it read as a label for
  // whatever the midpoint is rather than for the whole comparison.
  it("says what the bar shows above it rather than under its middle", () => {
    renderFor(history(), 234);

    expect(screen.getByText("Against your 4 builds")).toBeInTheDocument();
  });

  // Hover is where a reader asks what a picture means.
  it("describes itself to a reader hovering it", async () => {
    renderFor(history(), 234);

    await userEvent.hover(screen.getByRole("img"));

    // Says what the picture means. The figures are written underneath it, and a
    // tooltip is a poor place to read a long number.
    const tip = await screen.findByRole("tooltip");
    expect(tip).toHaveTextContent("The upright mark is their average");
    expect(tip.textContent).not.toMatch(/\d{3}/);
  });

  // Where this build sits between the ends means little without the average to
  // read it against.
  // The bar draws a dot and an upright line and neither says what it is, so the
  // line was a mark in the middle of a picture with no way to find out.
  it("names both of the bar's marks beside what they stand for", () => {
    renderFor(history(), 234);

    expect(screen.getByText("this build")).toBeInTheDocument();
    expect(screen.getByText("average 232")).toBeInTheDocument();
  });

  // The panel's headline states this build's cost per unit two inches away.
  // Repeating it here was one of three places the same number appeared.
  it("does not repeat this build's own figure", () => {
    renderFor(history(), 234);

    expect(screen.queryByText(/this build 234/)).not.toBeInTheDocument();
  });
});

// A range bar is read by where the marker falls along it, so a narrow one puts
// every build in much the same place. It takes the width the headline leaves
// rather than sitting at a fixed size — which is also what the design draws.
describe("the width it takes beside the headline", () => {
  const flexOf = (element) => window.getComputedStyle(element).flexGrow;

  it("grows into the space the headline leaves", () => {
    const { container } = renderFor(history(), 234);

    expect(flexOf(container.firstChild)).toBe("1");
  });

  it("grows the same way with nothing to compare against", () => {
    const { container } = renderFor(null, 234);

    expect(flexOf(container.firstChild)).toBe("1");
  });
});
