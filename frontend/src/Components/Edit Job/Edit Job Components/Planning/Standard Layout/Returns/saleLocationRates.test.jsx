import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../../../../../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../../../../../tests/usersStoreHarness.js");
  const { structureKinds } =
    await import("../../../../../../Context/defaultValues");
  return usersStoreMock(() =>
    usersStoreState({
      applicationSettings: {
        customStructures: [
          {
            id: "citadelMarket-1",
            jobType: structureKinds.citadelMarket,
            name: "Perimeter Azbel",
            brokerFee: 1.5,
            default: true,
          },
          {
            id: "citadelMarket-2",
            jobType: structureKinds.citadelMarket,
            name: "Jita Sotiyo",
            brokerFee: 3.25,
            default: false,
          },
        ],
      },
    }),
  );
});

const { default: SaleLocationRates } = await import("./saleLocationRates");
const { SALE_LOCATION_KIND } =
  await import("../../../../../../Functions/MarketOrders/saleLocations");

const hub = {
  kind: SALE_LOCATION_KIND.NPC_STATION,
  id: "jita",
  name: "Jita",
  feeStationID: 60003760,
  brokerFee: null,
};

const structure = {
  kind: SALE_LOCATION_KIND.CITADEL,
  id: "citadelMarket-1",
  name: "Perimeter Azbel",
  feeStationID: 60003760,
  brokerFee: 1.5,
};

const hubRates = {
  brokerFee: {
    kind: SALE_LOCATION_KIND.NPC_STATION,
    base: 3,
    rate: 1.35,
    terms: [
      {
        id: "brokerRelations",
        label: "Broker Relations",
        amount: 1.5,
        level: 5,
      },
      { id: "faction", label: "Faction standing", amount: 0.15, level: 5 },
      { id: "corporation", label: "Corporation standing", amount: 0, level: 0 },
    ],
  },
  salesTax: { base: 7.5, accounting: 5, rate: 3.375 },
};

const structureRates = {
  brokerFee: {
    kind: SALE_LOCATION_KIND.CITADEL,
    base: null,
    rate: 1.5,
    terms: [],
  },
  salesTax: { base: 7.5, accounting: 5, rate: 3.375 },
};

describe("the sale location rates block", () => {
  it("shows every subtraction at a station, because they are the seller's own", () => {
    render(<SaleLocationRates saleLocation={hub} rates={hubRates} />);

    expect(screen.getByText("Broker fee, base")).toBeInTheDocument();
    expect(screen.getByText("3.00%")).toBeInTheDocument();
    expect(screen.getByText("−1.50%")).toBeInTheDocument();
    expect(screen.getByText("level 5")).toBeInTheDocument();
    expect(screen.getByText("1.35%")).toBeInTheDocument();
  });

  // A standing of zero is a reduction not earned, which is different from one
  // the app failed to read — so the term stays on screen, and states the zero it
  // read rather than leaving the row looking unanswered.
  it("states a standing of zero as a figure it read", () => {
    render(<SaleLocationRates saleLocation={hub} rates={hubRates} />);

    expect(screen.getByText("Corporation standing")).toBeInTheDocument();
    expect(screen.getByText("0.00 with them")).toBeInTheDocument();
    // The reduction it did not earn, stated rather than left blank.
    expect(screen.getAllByText("0.00%").length).toBeGreaterThan(0);
  });

  // A standing below zero raises the fee. Always taking the figure off rendered
  // the sign twice.
  it("adds a negative standing to the fee rather than subtracting it", () => {
    const penalised = {
      ...hubRates,
      brokerFee: {
        ...hubRates.brokerFee,
        terms: hubRates.brokerFee.terms.map((term) =>
          term.id === "faction"
            ? { ...term, level: -2.5, amount: -0.075 }
            : term,
        ),
      },
    };

    render(<SaleLocationRates saleLocation={hub} rates={penalised} />);

    expect(screen.getByText("+0.08%")).toBeInTheDocument();
    expect(screen.getByText("-2.50 with them")).toBeInTheDocument();
  });

  it("shows one line at a citadel and says why there is no working", () => {
    render(
      <SaleLocationRates saleLocation={structure} rates={structureRates} />,
    );

    expect(
      screen.getByText("the rate this citadel's owner set"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Broker fee, base")).not.toBeInTheDocument();
    expect(
      screen.getByText(/Broker Relations does not reduce a citadel's fee/),
    ).toBeInTheDocument();
  });

  // Prices from one location, fee from another — the assembly is explicit
  // rather than hidden, because a citadel has no market of its own.
  it("names the hub a citadel's prices came from", () => {
    render(
      <SaleLocationRates
        saleLocation={structure}
        rates={structureRates}
        pricedAtName="Jita"
      />,
    );

    expect(
      screen.getByText("Prices from Jita; the fee is this citadel's own"),
    ).toBeInTheDocument();
  });

  it("does not claim a hub's prices came from somewhere else", () => {
    render(
      <SaleLocationRates
        saleLocation={hub}
        rates={hubRates}
        pricedAtName="Jita"
      />,
    );

    expect(screen.queryByText(/Prices from/)).not.toBeInTheDocument();
  });

  // Standings are per character, so the same station quotes two characters
  // different fees; the block says whose it is quoting.
  it("names the seller it is quoting", () => {
    render(
      <SaleLocationRates
        saleLocation={hub}
        rates={hubRates}
        seller={{ hash: "trader", name: "Market Alt", isDefault: false }}
      />,
    );

    expect(screen.getByText("Quoted for Market Alt")).toBeInTheDocument();
  });

  // The seller is usually a trading alt rather than whoever builds, so standing
  // in with the main is a guess and has to read as one.
  it("says when the seller is a stand-in rather than a choice", () => {
    render(
      <SaleLocationRates
        saleLocation={hub}
        rates={hubRates}
        seller={{ hash: "main", name: "Main Pilot", isDefault: true }}
      />,
    );

    expect(
      screen.getByText(/until this job or your settings name a seller/),
    ).toBeInTheDocument();
  });

  it("states an untrained Accounting as the zero it read", () => {
    render(
      <SaleLocationRates
        saleLocation={hub}
        rates={{
          ...hubRates,
          salesTax: { base: 7.5, accounting: 0, rate: 7.5 },
        }}
      />,
    );

    expect(
      screen.getByText("Accounting 0, from a base of 7.50%"),
    ).toBeInTheDocument();
  });

  // The untrained rate and a rate quoted without knowing the level are the same
  // number, so the line has to say which of the two it is.
  it("says when Accounting could not be read", () => {
    render(
      <SaleLocationRates
        saleLocation={hub}
        rates={{
          ...hubRates,
          salesTax: { base: 7.5, accounting: 0, rate: 7.5, unknown: true },
        }}
      />,
    );

    expect(
      screen.getByText("Accounting could not be read"),
    ).toBeInTheDocument();
  });

  // The block states which subtractions the fee has before it knows what they
  // come to — that much is settled by the location alone — but never a figure.
  it("waits rather than quoting a rate it does not have yet", () => {
    const { container } = render(
      <SaleLocationRates saleLocation={hub} isLoading />,
    );

    expect(container.textContent).not.toMatch(/%/);
    expect(screen.getByText("Jita")).toBeInTheDocument();
  });

  it("draws nothing without a location", () => {
    const { container } = render(<SaleLocationRates saleLocation={null} />);

    expect(container).toBeEmptyDOMElement();
  });
});

// Stage F stated the location because there was nowhere to write a choice.
// JobSale.Plan is that somewhere.
describe("naming where this job sells", () => {
  const withPickers = (props = {}) => {
    const onPlanChange = vi.fn();
    render(
      <SaleLocationRates
        saleLocation={hub}
        rates={hubRates}
        plan={{ sellerCharacter: null, saleLocationID: null }}
        onPlanChange={onPlanChange}
        {...props}
      />,
    );
    return onPlanChange;
  };

  it("offers every saved citadel and every hub", async () => {
    withPickers();

    await userEvent.click(screen.getByLabelText("Where this job sells from"));

    expect(
      within(screen.getByRole("listbox")).getByText("Perimeter Azbel"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("listbox")).getByText("Jita"),
    ).toBeInTheDocument();
  });

  it("names the account default as the option that leaves it alone", async () => {
    withPickers();

    await userEvent.click(screen.getByLabelText("Where this job sells from"));

    expect(
      within(screen.getByRole("listbox")).getByText(/account default/),
    ).toBeInTheDocument();
  });

  it("writes the location the job is given", async () => {
    const onPlanChange = withPickers();

    await userEvent.click(screen.getByLabelText("Where this job sells from"));
    await userEvent.click(
      within(screen.getByRole("listbox")).getByText("Jita Sotiyo"),
    );

    expect(onPlanChange).toHaveBeenCalledWith({
      saleLocationID: "citadelMarket-2",
    });
  });

  // The default is the item it resolves to rather than an entry of its own, so
  // choosing it writes nothing: the job keeps following the default rather than
  // pinning itself to whatever the default happens to be today.
  it("writes nothing when the account default is chosen from the list", async () => {
    const onPlanChange = withPickers({
      plan: { sellerCharacter: null, saleLocationID: "jita" },
    });

    await userEvent.click(screen.getByLabelText("Where this job sells from"));
    await userEvent.click(
      within(screen.getByRole("listbox")).getByText("Perimeter Azbel"),
    );

    expect(onPlanChange).toHaveBeenCalledWith({ saleLocationID: null });
  });

  // A citadel charges the rate its owner set; an NPC station charges one derived
  // from the seller's own skill and standings. Which of the two a location is
  // decides how the fee below was worked out.
  it("keeps citadels and NPC stations apart", async () => {
    withPickers();

    await userEvent.click(screen.getByLabelText("Where this job sells from"));
    const listbox = within(screen.getByRole("listbox"));

    expect(listbox.getByText("Citadels")).toBeInTheDocument();
    expect(listbox.getByText("NPC stations")).toBeInTheDocument();
  });

  it("selects the default rather than showing it as a separate entry", async () => {
    withPickers();

    await userEvent.click(screen.getByLabelText("Where this job sells from"));
    const listbox = within(screen.getByRole("listbox"));

    // Once, as the option it resolves to — not again as an entry of its own.
    expect(listbox.getAllByText("Perimeter Azbel")).toHaveLength(1);
    expect(listbox.getAllByText(/account default/)).toHaveLength(1);
  });

  // Most jobs sell the usual way, so getting back to the default has to be one
  // click rather than picking the same thing again from a list.
  it("offers the way back once the job has departed", async () => {
    const onPlanChange = withPickers({
      plan: {
        sellerCharacter: null,
        saleLocationID: "citadelMarket-1",
      },
    });

    await userEvent.click(screen.getByText("Back to the account default"));

    expect(onPlanChange).toHaveBeenCalledWith({
      sellerCharacter: null,
      saleLocationID: null,
    });
  });

  it("offers no way back while the job is on the default", () => {
    withPickers();

    expect(
      screen.queryByText("Back to the account default"),
    ).not.toBeInTheDocument();
  });

  it("states the location without choosing it when given no writer", () => {
    render(<SaleLocationRates saleLocation={hub} rates={hubRates} />);

    expect(
      screen.queryByLabelText("Where this job sells from"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Jita")).toBeInTheDocument();
  });
});

// "No standing with them" and "untrained" are both statements about the seller.
// When a figure could not be read the app knows neither, and the fee below is
// quoted without it either way — so it has to say which of the two it is. Every
// term has the same trap, including Broker Relations: a fixture that carves one
// out is how the bug survived the first time.
describe("a fee quoted without the figures behind it", () => {
  const unreadable = (ids) => ({
    ...hubRates,
    brokerFee: {
      ...hubRates.brokerFee,
      terms: hubRates.brokerFee.terms.map((term) =>
        ids.includes(term.id)
          ? { ...term, level: 0, amount: 0, unknown: true }
          : term,
      ),
    },
  });

  it.each(["brokerRelations", "faction", "corporation"])(
    "says %s could not be read rather than claiming a zero",
    (id) => {
      render(<SaleLocationRates saleLocation={hub} rates={unreadable([id])} />);

      expect(screen.getAllByText("could not be read").length).toBe(1);
    },
  );

  it("does not claim the seller has no standing", () => {
    render(
      <SaleLocationRates
        saleLocation={hub}
        rates={unreadable(["faction", "corporation"])}
      />,
    );

    expect(screen.queryByText("no standing with them")).not.toBeInTheDocument();
  });

  it("does not call an unreadable skill untrained", () => {
    render(
      <SaleLocationRates
        saleLocation={hub}
        rates={unreadable(["brokerRelations"])}
      />,
    );

    expect(screen.queryByText("untrained")).not.toBeInTheDocument();
  });

  it("still says no standing where that is what was read", () => {
    render(<SaleLocationRates saleLocation={hub} rates={hubRates} />);

    expect(screen.queryAllByText("could not be read")).toHaveLength(0);
  });
});

// Changing where the build is sold from re-reads the rates, and the block used
// to collapse to two loose lines while that happened. Every panel below it moved
// twice for one choice — down into the placeholder and back out again. The
// pending block is the rows it is about to become, so nothing moves.
describe("the rates block while a new location is being worked out", () => {
  /** Every label the block states, pending or settled. */
  const labelsOf = () =>
    screen
      .getAllByText(
        /Broker fee|Broker Relations|Faction standing|Corporation standing|Sales tax/,
      )
      .map((node) => node.textContent);

  /**
   * How many rows carry a second line under the label.
   *
   * Counting labels alone cannot see the height this block is holding: a settled
   * term states what it was worked out from underneath itself, and a pending row
   * without that line is a row shorter than the one it becomes.
   */
  const detailLineCount = (container) =>
    container.querySelectorAll(".MuiTypography-caption").length;

  it("states the same rows pending as it does settled, at a station", () => {
    const first = render(
      <SaleLocationRates saleLocation={hub} isLoading pricedAtName="Jita" />,
    );
    const pending = labelsOf();
    const pendingDetails = detailLineCount(first.container);
    first.unmount();

    const settled = render(
      <SaleLocationRates
        saleLocation={hub}
        rates={hubRates}
        pricedAtName="Jita"
      />,
    );

    expect(pending).toEqual(labelsOf());
    expect(pendingDetails).toBe(detailLineCount(settled.container));
  });

  it("states the same rows pending as it does settled, at a citadel", () => {
    const first = render(
      <SaleLocationRates
        saleLocation={structure}
        isLoading
        pricedAtName="Jita"
      />,
    );
    const pending = labelsOf();
    const pendingDetails = detailLineCount(first.container);
    first.unmount();

    const settled = render(
      <SaleLocationRates
        saleLocation={structure}
        rates={structureRates}
        pricedAtName="Jita"
      />,
    );

    expect(pending).toEqual(labelsOf());
    expect(pendingDetails).toBe(detailLineCount(settled.container));
  });

  // A citadel's fee is one line and a station's is a base, three subtractions
  // and a total. Which it will be is settled by the location, not by the rates,
  // so the pending block already knows which shape to hold.
  it("holds a station's shape rather than a citadel's", () => {
    render(<SaleLocationRates saleLocation={hub} isLoading />);

    expect(screen.getByText("Broker Relations")).toBeInTheDocument();
    expect(screen.getByText("Faction standing")).toBeInTheDocument();
    expect(screen.getByText("Corporation standing")).toBeInTheDocument();
  });

  it("holds a citadel's shape rather than a station's", () => {
    render(<SaleLocationRates saleLocation={structure} isLoading />);

    expect(screen.queryByText("Broker Relations")).toBeNull();
    expect(
      screen.getByText(/Broker Relations does not reduce/),
    ).toBeInTheDocument();
  });

  // Said in the markup as well as visually, so a reader who is not looking at
  // the box is told the figures in it are still being worked out.
  it("says it is busy while it waits", () => {
    const { container } = render(
      <SaleLocationRates saleLocation={hub} isLoading />,
    );

    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
  });
});
