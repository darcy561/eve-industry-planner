import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const useMaterialsSourcing = vi.fn();
const useJobEconomics = vi.fn();

vi.mock("../Materials And Sourcing/useMaterialsSourcing", () => ({
  useMaterialsSourcing: (...args) => useMaterialsSourcing(...args),
}));

vi.mock("./useJobEconomics", () => ({
  useJobEconomics: (...args) => useJobEconomics(...args),
}));

vi.mock(
  "../../../../../../Hooks/React Query/Backend/statisticsTimeline",
  () => ({
    useAccountTimelineQuery: () => ({ data: undefined }),
  }),
);

const { default: PlanningEconomics } = await import("./planningEconomics");

const economics = (overrides = {}) => ({
  cost: {
    toBuild: { lines: [], total: 800, perUnit: 80 },
    toSell: { lines: [], total: 0, perUnit: 0 },
    total: 800,
    perUnit: 80,
  },
  returns: {
    routes: [
      {
        id: "listed",
        label: "Sell order",
        revenue: 1200,
        net: 400,
        perUnit: 40,
        margin: 0.33,
        returnOnOutlay: 0.5,
      },
    ],
    breakEvenPerUnit: 80,
  },
  comparison: { builds: 0 },
  charges: { brokerFee: 36, salesTax: 45 },
  saleLocation: {
    kind: "structure",
    id: "citadel",
    name: "Placeholder Citadel",
    priceHubID: "jita",
    priceHubName: "Jita",
    brokerFee: 1.5,
  },
  rates: {
    brokerFee: { kind: "structure", base: null, rate: 1.5, terms: [] },
    salesTax: { base: 7.5, accounting: 5, rate: 3.375 },
  },
  ratesLoading: false,
  seller: { hash: "trader", name: "Market Alt", isDefault: false },
  commitment: { hasParents: false, outstanding: 0, committed: 0, surplus: 10 },
  contributedCost: 0,
  sellableBuildCost: 800,
  sellPrice: 120,
  ...overrides,
});

vi.mock("../../../Complete/Standard Layout/Extras Panel/extrasEditor", () => ({
  default: () => <div>extras editor</div>,
}));

const state = {
  activeJob: {
    itemID: 34,
    name: "Tritanium",
    totalQuantityProduced: 10,
    totalExtrasCost: 12000,
    layout: { setupToEdit: "setup0" },
    build: {
      setup: { setup0: { selectedCharacter: "hash" } },
      costs: { extrasCosts: [{ id: "a" }, { id: "b" }] },
    },
    get selectedSetup() {
      return this.build.setup[this.layout.setupToEdit];
    },
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  useMaterialsSourcing.mockReturnValue({ rows: [], marketLocation: "jita" });
  useJobEconomics.mockReturnValue(economics());
});

// This component is only wiring, and wiring is where a figure reaches the wrong
// panel or no panel at all — a mismatch no unit test downstream can see, because
// each of those builds its own props by hand.
describe("the planning economics wiring", () => {
  it("draws both panels from the one set of figures", () => {
    render(<PlanningEconomics state={state} actions={{}} />);

    expect(screen.getByText("Cost Breakdown")).toBeInTheDocument();
    expect(screen.getByText("Returns")).toBeInTheDocument();
  });

  it("gives Returns the cost to build rather than the cost to build and sell", () => {
    useJobEconomics.mockReturnValue(
      economics({
        cost: {
          toBuild: { lines: [], total: 800, perUnit: 80 },
          toSell: { lines: [], total: 81, perUnit: 8.1 },
          total: 881,
          perUnit: 88.1,
        },
      }),
    );

    render(<PlanningEconomics state={state} actions={{}} />);

    // The ledger states the build cost it subtracts; it must be the build band.
    expect(screen.getByText("800.00")).toBeInTheDocument();
  });

  // The headline nets off the surplus's share of the build cost, so the ledger
  // beneath it has to subtract that same share — a reader summing the rows by
  // hand must reach the figure the headline states.
  it("gives Returns the surplus's share of the cost, not the whole job's", () => {
    useJobEconomics.mockReturnValue(
      economics({
        commitment: {
          hasParents: true,
          outstanding: 4,
          committed: 4,
          surplus: 6,
        },
        sellableBuildCost: 480,
        contributedCost: 320,
      }),
    );

    render(<PlanningEconomics state={state} actions={{}} />);

    // Cost Breakdown still states the whole job's 800 — it is costing the build,
    // not the sale. It is the ledger that must be scoped.
    expect(screen.getByText("480.00")).toBeInTheDocument();
  });

  it("names the item, its hub and the seller the rates are quoted for", () => {
    render(<PlanningEconomics state={state} actions={{}} />);

    expect(screen.getByText("Tritanium")).toBeInTheDocument();
    expect(screen.getByText("Quoted for Market Alt")).toBeInTheDocument();
    expect(
      screen.getByText("Prices from Jita; the fee is this structure's own"),
    ).toBeInTheDocument();
  });

  it("states the revenue a listing would bring in", () => {
    render(<PlanningEconomics state={state} actions={{}} />);

    // 120 a unit across 10 produced.
    expect(screen.getByText("Revenue, listed")).toBeInTheDocument();
    expect(screen.getByText("1,200.00")).toBeInTheDocument();
  });

  // Extras are a cost component and an entry point both. Counting them in the
  // table without carrying the editor would make them unreachable.
  it("carries the extras editor, saying what is behind it", () => {
    render(<PlanningEconomics state={state} actions={{}} />);

    expect(screen.getByText("Extra costs — 2, 12,000.00")).toBeInTheDocument();
  });

  it("invites a first extra cost when the job has none", () => {
    const empty = {
      activeJob: {
        ...state.activeJob,
        totalExtrasCost: 0,
        build: {
          setup: { setup0: { selectedCharacter: "hash" } },
          costs: { extrasCosts: [] },
        },
        selectedSetup: { selectedCharacter: "hash" },
      },
    };

    render(<PlanningEconomics state={empty} actions={{}} />);

    expect(screen.getByText("Add an extra cost")).toBeInTheDocument();
  });

  it("draws nothing until a setup is selected", () => {
    const withoutSetup = {
      activeJob: {
        ...state.activeJob,
        layout: { setupToEdit: null },
        selectedSetup: undefined,
      },
    };

    const { container } = render(
      <PlanningEconomics state={withoutSetup} actions={{}} />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});

// The toggle changes what the components are, so the panel that draws them owns
// it — and it is a way of reading the job, never a change written to it.
describe("the pricing model toggle", () => {
  it("reprices the components when switched", async () => {
    render(<PlanningEconomics state={state} actions={{}} />);

    await userEvent.click(screen.getByText("Buy everything"));

    expect(useJobEconomics).toHaveBeenLastCalledWith(
      expect.objectContaining({ buyEverything: true }),
    );
  });

  it("starts on the model the job is actually planned as", () => {
    render(<PlanningEconomics state={state} actions={{}} />);

    expect(useJobEconomics).toHaveBeenCalledWith(
      expect.objectContaining({ buyEverything: false }),
    );
  });
});

// The chart is the history behind the figure the panel leads with, one click
// away rather than a scroll away — and fetched only once asked for.
// The cost-over-time chart belongs to Build History, which draws the same one
// from the same query. Two copies on one stage is two places to look at the same
// figures and two places for them to disagree.
describe("the cost over time chart", () => {
  it("is left to Build History rather than drawn here as well", () => {
    useJobEconomics.mockReturnValue(economics({ comparison: { builds: 7 } }));

    render(<PlanningEconomics state={state} actions={{}} />);

    expect(
      screen.queryByText(/Cost per unit over time/),
    ).not.toBeInTheDocument();
  });
});

// Invention is a cost the job carries and the breakdown counts, so it is
// recorded where the rest of the cost is read. Only a T2 or T3 item is invented.
describe("recording what invention cost", () => {
  const withMeta = (metaGroupID) => ({
    ...state,
    activeJob: { ...state.activeJob, metaLevel: metaGroupID },
  });

  it("offers it on an item that is invented", () => {
    render(<PlanningEconomics state={withMeta(2)} actions={{}} />);

    expect(screen.getByText("Add an invention cost")).toBeInTheDocument();
  });

  it("offers nothing on an item that is not", () => {
    render(<PlanningEconomics state={withMeta(1)} actions={{}} />);

    expect(screen.queryByText(/invention cost/i)).not.toBeInTheDocument();
  });

  it("counts what is recorded in the label", () => {
    const job = {
      ...state.activeJob,
      metaLevel: 2,
      totalInventionCost: 1500,
      build: {
        ...state.activeJob.build,
        costs: {
          ...state.activeJob.build.costs,
          inventionEntries: [{ id: 1, itemName: "Datacore", itemCost: 1500 }],
        },
      },
    };

    render(
      <PlanningEconomics state={{ ...state, activeJob: job }} actions={{}} />,
    );

    expect(screen.getByText(/Invention — 1,/)).toBeInTheDocument();
  });
});
