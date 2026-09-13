import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import ReturnsPanel from "./returnsPanel";
import { calculateReturns } from "../../../../../../Functions/MarketData/returns";
import { compareToHistory } from "../../../../../../Functions/MarketData/buildComparison";

const inputs = {
  sellPrice: 120,
  buyPrice: 100,
  quantityProduced: 10,
  buildCost: 800,
  brokerFee: 36,
  salesTax: 45,
};

const renderPanel = (props = {}) =>
  render(
    <ReturnsPanel
      returns={calculateReturns(inputs)}
      charges={{ brokerFee: inputs.brokerFee, salesTax: inputs.salesTax }}
      buildCost={inputs.buildCost}
      {...props}
    />,
  );

describe("the Returns panel", () => {
  it("names the route the headline belongs to", () => {
    renderPanel();

    expect(screen.getByText("Net return — sell order")).toBeInTheDocument();
  });

  // The listing is the route most players plan towards, so it is what the panel
  // leads with when the account has not said otherwise.
  it("leads with the listing rather than the buy orders", () => {
    renderPanel();

    expect(screen.getByText("Net return — sell order")).toBeInTheDocument();
    expect(
      screen.queryByText("Net return — into buy orders"),
    ).not.toBeInTheDocument();
  });

  // Neither route is the answer: which one a player wants is not something the
  // app knows, so both are stated whichever leads.
  it("states both ways out whichever it leads with", () => {
    renderPanel();

    expect(screen.getByText("Sell order")).toBeInTheDocument();
    expect(screen.getByText("Into buy orders")).toBeInTheDocument();
  });

  it("states what a unit must fetch to break even", () => {
    renderPanel();

    expect(
      screen.getByText("Each unit must fetch 88.10 to break even"),
    ).toBeInTheDocument();
  });

  it("says there is nothing to break even on when nothing is produced", () => {
    renderPanel({
      returns: calculateReturns({ ...inputs, quantityProduced: 0 }),
    });

    expect(
      screen.getByText(
        "Nothing produced, so there is nothing to break even on",
      ),
    ).toBeInTheDocument();
  });

  it("shows the broker fee for the route that does list", async () => {
    renderPanel();
    await userEvent.click(screen.getByText("How this is worked out"));

    expect(screen.getByText("Broker fee")).toBeInTheDocument();
    expect(screen.getByText("−36.00")).toBeInTheDocument();
  });

  it("places the build against previous ones without judging it", () => {
    renderPanel({
      comparison: compareToHistory(
        {
          buildCount: 3,
          cheapestCostPerItem: 70,
          dearestCostPerItem: 90,
          lastCostPerItem: 80,
          lastCostMonth: { year: 2026, month: 5 },
        },
        80,
      ),
    });

    expect(
      screen.getByText("Your 3 previous builds cost 70.00 to 90.00 per unit"),
    ).toBeInTheDocument();
    expect(screen.getByText("last built May 2026")).toBeInTheDocument();
  });

  it("says nothing about previous builds when there are none", () => {
    renderPanel({ comparison: compareToHistory(undefined, 80) });

    expect(screen.queryByText(/previous build/)).not.toBeInTheDocument();
  });

  // The retiring totals panel put the market links on the output item, and they
  // are the only way to reach its price history from this stage.
  it("keeps the output item's icon and market links", () => {
    renderPanel({
      output: {
        typeID: 34,
        name: "Tritanium",
        priceHubID: "jita",
        unitPrice: 120,
        quantityProduced: 10,
      },
    });

    expect(screen.getByText("Tritanium")).toBeInTheDocument();
    expect(
      document.querySelector('img[src*="/types/34/icon"]'),
    ).toBeInTheDocument();
  });

  it("holds the sale location block a caller puts in it", () => {
    renderPanel({ children: <span>rates block</span> });

    expect(screen.getByText("rates block")).toBeInTheDocument();
  });

  it("takes its own height rather than its parent's", () => {
    const { container } = renderPanel();

    expect(container.querySelector(".MuiPaper-root")).not.toHaveStyle({
      height: "100%",
    });
  });

  it("draws nothing without figures to draw", () => {
    const { container } = render(<ReturnsPanel returns={null} />);

    expect(container).toBeEmptyDOMElement();
  });
});

// A route's figure means little without the price behind it, and the two routes
// are priced from different sides of the order book.
describe("what each route was priced from", () => {
  it("names each route's unit price and what is taken off it", () => {
    renderPanel();

    expect(
      screen.getByText("at 120.00 · less fee and tax"),
    ).toBeInTheDocument();
    expect(screen.getByText("at 100.00 · less tax")).toBeInTheDocument();
  });

  it("groups them under a caption saying what they are", () => {
    renderPanel();

    expect(screen.getByText("Exit routes")).toBeInTheDocument();
  });
});

// Break-even on its own is a number the reader has to compare against the price
// themselves.
describe("headroom above break-even", () => {
  it("states how far today's price sits above it", () => {
    renderPanel();

    // 881 of cost over 10 units is 88.10; 120 today is 36.2% above it.
    expect(
      screen.getByText(/current 120.00 · 36.2% above break-even/),
    ).toBeInTheDocument();
  });

  it("says below where the price does not cover the build", () => {
    renderPanel({
      returns: calculateReturns({ ...inputs, sellPrice: 40 }),
    });

    expect(screen.getByText(/below break-even/)).toBeInTheDocument();
  });
});

// The account says which way its output leaves, and the panel leads with that
// route: a player who dumps into bids should not be shown a listing's margin as
// the answer, with a broker fee in it they never pay.
describe("the route the panel leads with", () => {
  it("leads with the buy orders when the account sells into them", () => {
    renderPanel({ exitRoute: "immediate" });

    expect(
      screen.getByText("Net return — into buy orders"),
    ).toBeInTheDocument();
  });

  it("leads with the listing when the account lists", () => {
    renderPanel({ exitRoute: "listed" });

    expect(screen.getByText("Net return — sell order")).toBeInTheDocument();
  });
});

// The ledger and the headline above it are the same figure worked out twice, so
// a charge stated in one and not the other is a panel that disagrees with
// itself. calculateReturns charges the broker fee to the listing only.
describe("what the ledger deducts on each route", () => {
  const openDisclosure = async () => {
    await userEvent.click(screen.getByRole("button", { name: /worked out/i }));
  };

  it("states no broker fee on a route that never lists", async () => {
    renderPanel({ exitRoute: "immediate" });
    await openDisclosure();

    expect(screen.queryByText("Broker fee")).not.toBeInTheDocument();
  });

  it("states the broker fee on the listing", async () => {
    renderPanel({ exitRoute: "listed" });
    await openDisclosure();

    expect(screen.getByText("Broker fee")).toBeInTheDocument();
  });
});
