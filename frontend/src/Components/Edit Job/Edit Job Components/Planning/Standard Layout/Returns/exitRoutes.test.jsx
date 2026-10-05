import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";

import ExitRoutes, { signTone } from "./exitRoutes";
import { FIGURE_TONE } from "../../../../../../Styled Components/Typography/figures";
import { calculateReturns } from "../../../../../../Functions/Job/figures/returns.js";

const profitable = {
  sellPrice: 120,
  buyPrice: 100,
  quantityProduced: 10,
  buildCost: 800,
  brokerFee: 36,
  salesTax: 45,
};

const routeCard = (label) => screen.getByText(label).closest("div");

describe("the exit routes", () => {
  it("states each route's own figures rather than one route's twice", () => {
    render(<ExitRoutes routes={calculateReturns(profitable).routes} />);

    // Listed: 1200 revenue − 81 charges − 800 build = 319, over 10 units.
    const listed = within(routeCard("Sell order"));
    expect(listed.getByText("319.00")).toBeInTheDocument();
    expect(listed.getByText("31.90")).toBeInTheDocument();

    // Into buy orders: 1000 revenue − 45 tax − 800 build = 155. No broker fee,
    // because nothing is listed.
    const immediate = within(routeCard("Into buy orders"));
    expect(immediate.getByText("155.00")).toBeInTheDocument();
    expect(immediate.getByText("15.50")).toBeInTheDocument();
  });

  it("states margin and return on outlay per route", () => {
    render(<ExitRoutes routes={calculateReturns(profitable).routes} />);

    const listed = within(routeCard("Sell order"));
    expect(listed.getByText("26.6%")).toBeInTheDocument();
    expect(listed.getByText("39.9%")).toBeInTheDocument();
  });

  // A ratio against nothing is unanswerable rather than zero, and an em dash is
  // how the figures say so.
  it("says nothing rather than a zero where a ratio has no answer", () => {
    render(
      <ExitRoutes
        routes={
          calculateReturns({ ...profitable, sellPrice: 0, buyPrice: 0 }).routes
        }
      />,
    );

    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("draws no per-unit figure when nothing is produced", () => {
    render(
      <ExitRoutes
        routes={calculateReturns({ ...profitable, quantityProduced: 0 }).routes}
      />,
    );

    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });
});

// Colour marks sign and nothing else: how large a return should be is the
// player's judgement, not the app's.
describe("signTone", () => {
  it("marks a loss and a gain apart", () => {
    expect(signTone(-1)).toBe(FIGURE_TONE.BAD);
    expect(signTone(1)).toBe(FIGURE_TONE.GOOD);
    expect(signTone(0)).toBe(FIGURE_TONE.GOOD);
  });

  it("marks nothing where there is no figure", () => {
    expect(signTone(null)).toBe(FIGURE_TONE.PLAIN);
    expect(signTone(undefined)).toBe(FIGURE_TONE.PLAIN);
    expect(signTone(Number.NaN)).toBe(FIGURE_TONE.PLAIN);
  });
});
