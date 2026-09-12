import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * The two hooks that make this stage's figures, run together for real.
 *
 * Every other test in this folder mocks one of them, so nothing exercised the
 * seam where `useMaterialsSourcing`'s rows flow into `useJobEconomics`. A change
 * to the row shape — a renamed field, a dropped one — passes every unit test and
 * breaks the page. Only the boundaries are faked here: the store, and the two
 * queries that leave the browser.
 */

const marketPrices = {
  34: { jita: { sell: 200, buy: 150, buyP95: 160, sellP05: 190 } },
  35: { jita: { sell: 5, buy: 4, buyP95: 4.2, sellP05: 4.8 } },
};

vi.mock("../../../../../../Functions/MarketData/marketPriceForType", () => ({
  getMarketPriceForType: (typeID, hub, listing) =>
    marketPrices[typeID]?.[hub]?.[listing] ?? 0,
}));

vi.mock("../../../../../../Functions/Installation Costs/installCosts", () => ({
  getJobInstallCostForPlanning: () => 100,
}));

vi.mock(
  "../../../../../../Hooks/React Query/Character/useSellingRates",
  () => ({
    useSellingRates: () => ({
      data: {
        brokerFee: { kind: "structure", base: null, rate: 1.5, terms: [] },
        salesTax: { base: 7.5, accounting: 0, rate: 7.5 },
      },
      isLoading: false,
    }),
  }),
);

vi.mock("../../../../../../Hooks/React Query/Backend/statisticsTotals", () => ({
  useAccountTotalsQuery: () => ({ data: undefined }),
}));

vi.mock(
  "../../../../../../Hooks/React Query/Backend/statisticsTimeline",
  () => ({
    useAccountTimelineQuery: () => ({ data: undefined }),
  }),
);

vi.mock("../../../../../../Functions/MarketOrders/sellerCharacter", () => ({
  resolveSellerCharacter: () => ({
    hash: "trader",
    name: "Market Alt",
    isDefault: true,
  }),
}));

vi.mock("../../../../../../Zustand/usersStore", async () => {
  const { usersStoreMock } =
    await import("../../../../../../tests/usersStoreHarness.js");
  return usersStoreMock({
    applicationSettings: {
      defaultPricing: {
        buying: { market: "jita", basis: "sell" },
        // Deliberately different: a fixture whose sides agree cannot tell a
        // surface asking for the wrong one.
        selling: { market: "amarr", basis: "buy" },
      },
      actions: {
        getCurrentLocale: () => "en-GB",
        checkTypeIDisExempt: () => false,
      },
    },
    account: {
      characters: [],
      mainCharacterHash: "main",
      actions: { findCharacterByHash: () => null },
    },
    jobData: {
      jobArray: [],
      actions: { findJobInJobArray: (id) => parentJobs[id] },
    },
    worldData: { actions: { findMarketData: () => undefined } },
  });
});

// Populated per test; the store mock closes over it.
const parentJobs = {};

const { default: PlanningEconomics } = await import("./planningEconomics");
const { jobFixture, materialFixture } =
  await import("../../../../../../tests/jobFixture");

const state = {
  activeJob: jobFixture({
    materials: [
      materialFixture({ typeID: 35, name: "Pyerite", quantity: 100 }),
    ],
    childJobs: { 35: [] },
  }),
  temporaryChildJobs: {},
  speculativeChildJobs: {},
  parentChildToEdit: { childJobs: {} },
};

const actions = {
  updateActiveJob: vi.fn(),
  getCurrentParentJobs: () => [],
  getCurrentMaterialChildJobs: () => [],
};

const panelNamed = (title) => screen.getByText(title).closest(".MuiPaper-root");

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of Object.keys(parentJobs)) delete parentJobs[key];
});

describe("the Planning stage's figures, end to end", () => {
  it("prices the materials through to a cost to build", () => {
    render(<PlanningEconomics state={state} actions={actions} />);

    // 100 Pyerite at the sell price of 5 is 500, plus 100 install.
    const cost = within(panelNamed("Cost Breakdown"));
    expect(cost.getByText("600.00")).toBeInTheDocument();
  });

  // The plan's own words: a cost to build stated on one panel and subtracted on
  // the other has to be the same number.
  it("subtracts on Returns exactly what Cost Breakdown states", async () => {
    render(<PlanningEconomics state={state} actions={actions} />);

    const stated = within(panelNamed("Cost Breakdown")).getByText("600.00");
    expect(stated).toBeInTheDocument();

    // The ledger is behind a disclosure that unmounts when closed.
    await userEvent.click(screen.getByText("How this is worked out"));

    // The ledger states it as a subtraction.
    const returns = within(panelNamed("Returns"));
    expect(returns.getByText("\u2212600.00")).toBeInTheDocument();
  });

  // Both lines in the selling band say where the charge is paid. The fee saying
  // it and the tax not made the second look like a charge from somewhere else.
  it("says where each selling charge is paid", () => {
    render(<PlanningEconomics state={state} actions={actions} />);

    const cost = within(panelNamed("Cost Breakdown"));

    expect(
      cost.getByText(/^1\.50% at Placeholder Citadel$/),
    ).toBeInTheDocument();
    expect(
      cost.getByText(/on the sale at Placeholder Citadel/),
    ).toBeInTheDocument();
  });

  it("charges the fee and tax on what the listing is worth", () => {
    render(<PlanningEconomics state={state} actions={actions} />);

    // 200 a unit across 10 is a 2,000 listing: the 1.5% fee is under the 100
    // floor, and tax is 7.5%. Asserted against their own rows, since the install
    // cost is also 100.
    const cost = within(panelNamed("Cost Breakdown"));
    const feeRow = cost.getByText("Broker fee to list").closest("tr");
    const taxRow = cost.getByText("Sales tax").closest("tr");

    expect(within(feeRow).getByText("100.00")).toBeInTheDocument();
    expect(within(taxRow).getByText("150.00")).toBeInTheDocument();
  });

  it("nets the sale down to a return", () => {
    render(<PlanningEconomics state={state} actions={actions} />);

    // 2,000 revenue less 250 of charges less 600 to build.
    // Stated as the headline and again on the route it belongs to.
    expect(
      within(panelNamed("Returns")).getAllByText("1,150.00").length,
    ).toBeGreaterThan(0);
  });
});

// The archive counts invention in what a build cost. Left out of the stage, a T2
// job reads as cheaper than its own history says every previous one was — and
// the omission is invisible on any job that invented nothing, which is most of
// the fixtures.
describe("a job that had to invent its blueprint", () => {
  it("carries the attempts into the cost to build and into the return", async () => {
    const invented = {
      ...state,
      activeJob: jobFixture({
        materials: [
          materialFixture({ typeID: 35, name: "Pyerite", quantity: 100 }),
        ],
        childJobs: { 35: [] },
        inventionEntries: [{ itemCost: 400 }, { itemCost: 200 }],
      }),
    };

    render(<PlanningEconomics state={invented} actions={actions} />);

    // 500 of materials, 100 install, 600 of attempts.
    const cost = within(panelNamed("Cost Breakdown"));
    expect(cost.getByText("Invention")).toBeInTheDocument();
    expect(cost.getByText("1,200.00")).toBeInTheDocument();

    await userEvent.click(screen.getByText("How this is worked out"));
    expect(
      within(panelNamed("Returns")).getByText("−1,200.00"),
    ).toBeInTheDocument();
  });
});

// Output owed to a parent is never listed, so no part of the stage may price it,
// charge a fee on it, or state a return for it. Each panel's silence is tested
// on its own elsewhere; this checks the stage agrees as a whole.
describe("a job whose output is owed to the job above it", () => {
  const parented = {
    ...state,
    activeJob: jobFixture({
      materials: [
        materialFixture({ typeID: 35, name: "Pyerite", quantity: 100 }),
      ],
      childJobs: { 35: [] },
    }),
  };
  const withParent = {
    ...actions,
    getCurrentParentJobs: () => ["parent-1"],
  };

  it("states no return and charges nothing when all of it is committed", () => {
    // The parent needs 10 and this job makes 10, so nothing is left to sell.
    parentJobs["parent-1"] = {
      build: {
        materials: [{ typeID: 34, quantity: 10 }],
        childJobs: { 34: ["job-1"] },
      },
      totalQuantityProduced: 10,
    };

    render(<PlanningEconomics state={parented} actions={withParent} />);

    // Contribution replaces Returns where nothing can be sold.
    expect(screen.queryByText("Returns")).not.toBeInTheDocument();

    const cost = within(panelNamed("Cost Breakdown"));
    expect(cost.queryByText("Broker fee to list")).not.toBeInTheDocument();
    expect(cost.queryByText("Sales tax")).not.toBeInTheDocument();
  });

  it("prices only the surplus when the parent needs less than the job makes", () => {
    // The parent needs 4 of the 10 produced, leaving 6 to sell.
    parentJobs["parent-1"] = {
      build: {
        materials: [{ typeID: 34, quantity: 4 }],
        childJobs: { 34: ["job-1"] },
      },
      totalQuantityProduced: 10,
    };

    render(<PlanningEconomics state={parented} actions={withParent} />);

    // 6 at 200 is a 1,200 listing: 1.5% is 18, under the 100 floor, and tax is
    // 7.5% of 1,200. The whole job's output would have charged more.
    const cost = within(panelNamed("Cost Breakdown"));
    expect(
      within(cost.getByText("Sales tax").closest("tr")).getByText("90.00"),
    ).toBeInTheDocument();
  });
});

// Every other test on this stage mocks a price in. A type the server has no
// price for is the state a newly added item is in, and it must not read as a
// free build or a sale worth nothing in particular.
describe("an item the market has no price for", () => {
  it("charges nothing to list and states no return", () => {
    const unpriced = {
      ...state,
      activeJob: jobFixture({
        itemID: 99,
        materials: [
          materialFixture({ typeID: 35, name: "Pyerite", quantity: 100 }),
        ],
        childJobs: { 35: [] },
      }),
    };

    render(<PlanningEconomics state={unpriced} actions={actions} />);

    // Nothing listed is charged nothing: the 100 ISK floor must not bill a
    // listing that cannot be made.
    const cost = within(panelNamed("Cost Breakdown"));
    expect(cost.queryByText("Broker fee to list")).not.toBeInTheDocument();
    expect(cost.queryByText("Sales tax")).not.toBeInTheDocument();
  });
});
