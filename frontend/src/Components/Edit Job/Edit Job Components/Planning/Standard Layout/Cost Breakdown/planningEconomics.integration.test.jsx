import { beforeEach, describe, expect, it, vi } from "vitest";
import { PricedSurface } from "../../../../../../tests/pricedSurface.jsx";
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

// The citadel's figures differ from the hub's on purpose. The sale is priced at
// the citadel now, so a surface that slipped back to pricing it at the trading
// hub would read 200 a unit here and be caught rather than quietly agreeing.
const marketPrices = {
  34: {
    jita: { sell: 200, buy: 150, buyP95: 160, sellP05: 190 },
    "citadelMarket-1": { sell: 300, buy: 250, buyP95: 260, sellP05: 290 },
  },
  35: { jita: { sell: 5, buy: 4, buyP95: 4.2, sellP05: 4.8 } },
};

vi.mock(
  "../../../../../../Functions/MarketData/prices/marketPriceForType.js",
  () => ({
    readPriceRefreshedAt: () => undefined,
    readMarketPriceForType: (typeID, hub, listing) =>
      marketPrices[typeID]?.[hub]?.[listing] ?? 0,
  }),
);

vi.mock("../../../../../../Functions/Installation Costs/installCosts", () => ({
  installCostForPlanning: () => 100,
}));

vi.mock(
  "../../../../../../Hooks/React Query/Character/useSellingRates",
  () => ({
    useSellingRates: () => ({
      data: {
        brokerFee: { kind: "citadel", base: null, rate: 1.5, terms: [] },
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
  const { usersStoreOverSession } =
    await import("../../../../../../tests/usersStoreHarness.js");
  return usersStoreOverSession({
    applicationSettings: {
      marketLocations: [
        {
          id: "citadelMarket-1",
          name: "Perimeter Azbel",
          structureID: 1035466617946,
          brokerFee: 1.5,
        },
      ],
      defaultPricing: {
        buying: { market: "jita", orderType: "sell" },
        // Deliberately different from the buying side: a fixture whose sides
        // agree cannot tell a surface asking for the wrong one. The saved
        // citadel, because these cases price a sale against its own rate.
        selling: { market: "citadelMarket-1", orderType: "buy" },
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
  });
});

// Populated per test; the store mock closes over it.
const parentJobs = {};

const { default: PlanningEconomics } = await import("./planningEconomics");
const { default: useUsersStore } =
  await import("../../../../../../Zustand/usersStore");

const session = () => useUsersStore.getState().editSession;

/**
 * Ten Tritanium made from 100 Pyerite, as the planner stores the job.
 *
 * The requirement is stated by the setup rather than on the material row, which
 * is where a job says what it takes.
 */
const jobDocument = ({ build = {}, ...rest } = {}) => ({
  jobID: "job-1",
  itemID: 34,
  name: "Tritanium",
  jobType: 1,
  itemsProducedPerRun: 10,
  parentJobs: [],
  skills: {},
  layout: { setupToEdit: "setup0" },
  build: {
    materialPriceOverrides: {},
    materials: {
      35: { typeID: 35, name: "Pyerite", jobType: 0, volume: 0.01 },
    },
    childJobs: { 35: [] },
    extrasCosts: {},
    inventionEntries: {},
    sellerCharacter: null,
    saleLocationID: null,
    setup: {
      setup0: {
        id: "setup0",
        selectedCharacter: "builder",
        jobType: 1,
        rawTime: 10000,
        runCount: 1,
        jobCount: 1,
        TE: 0,
        structureID: 0,
        rigID: 0,
        materialCount: { 35: { typeID: 35, quantity: 100 } },
      },
    },
    ...build,
  },
  esi: { industryJobs: {}, marketOrders: {}, transactions: {} },
  ...rest,
});

const show = (document = jobDocument()) => {
  session().actions.openJob(document.jobID, document);
  return render(
    <PricedSurface>
      <PlanningEconomics />
    </PricedSurface>,
  );
};

const panelNamed = (title) => screen.getByText(title).closest(".MuiPaper-root");

beforeEach(() => {
  vi.clearAllMocks();
  session().actions.closeSession();
  for (const key of Object.keys(parentJobs)) delete parentJobs[key];
});

describe("the Planning stage's figures, end to end", () => {
  it("prices the materials through to a cost to build", () => {
    show();

    // 100 Pyerite at the sell price of 5 is 500, plus 100 install.
    const cost = within(panelNamed("Cost Breakdown"));
    expect(cost.getByText("600.00")).toBeInTheDocument();
  });

  // The plan's own words: a cost to build stated on one panel and subtracted on
  // the other has to be the same number.
  it("subtracts on Returns exactly what Cost Breakdown states", async () => {
    show();

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
    show();

    const cost = within(panelNamed("Cost Breakdown"));

    expect(cost.getByText(/^1\.50% at Perimeter Azbel$/)).toBeInTheDocument();
    expect(
      cost.getByText(/on the sale at Perimeter Azbel/),
    ).toBeInTheDocument();
  });

  it("charges the fee and tax on what the listing is worth", () => {
    show();

    // 300 a unit at the citadel across 10 is a 3,000 listing: the 1.5% fee is
    // under the 100 floor, and tax is 7.5%. Asserted against their own rows,
    // since the install cost is also 100.
    const cost = within(panelNamed("Cost Breakdown"));
    const feeRow = cost.getByText("Broker fee to list").closest("tr");
    const taxRow = cost.getByText("Sales tax").closest("tr");

    expect(within(feeRow).getByText("100.00")).toBeInTheDocument();
    expect(within(taxRow).getByText("225.00")).toBeInTheDocument();
  });

  it("nets the sale down to a return", () => {
    show();

    // 3,000 revenue less 325 of charges less 600 to build.
    // Stated as the headline and again on the route it belongs to.
    expect(
      within(panelNamed("Returns")).getAllByText("2,075.00").length,
    ).toBeGreaterThan(0);
  });
});

// The archive counts invention in what a build cost. Left out of the stage, a T2
// job reads as cheaper than its own history says every previous one was — and
// the omission is invisible on any job that invented nothing, which is most of
// the fixtures.
describe("a job that had to invent its blueprint", () => {
  it("carries the attempts into the cost to build and into the return", async () => {
    show(
      jobDocument({
        build: {
          inventionEntries: {
            1: { id: 1, itemCost: 400 },
            2: { id: 2, itemCost: 200 },
          },
        },
      }),
    );

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
  const parented = () => jobDocument({ parentJobs: ["parent-1"] });

  it("states no return and charges nothing when all of it is committed", () => {
    // The parent needs 10 and this job makes 10, so nothing is left to sell.
    parentJobs["parent-1"] = {
      build: {
        materials: { [String(34)]: { typeID: 34, quantity: 10 } },
        childJobs: { 34: ["job-1"] },
      },
      totalQuantityProduced: 10,
    };

    show(parented());

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
        materials: { [String(34)]: { typeID: 34, quantity: 4 } },
        childJobs: { 34: ["job-1"] },
      },
      totalQuantityProduced: 10,
    };

    show(parented());

    // 6 at 300 is an 1,800 listing: 1.5% is 27, under the 100 floor, and tax is
    // 7.5% of 1,800. The whole job's output would have charged more.
    const cost = within(panelNamed("Cost Breakdown"));
    expect(
      within(cost.getByText("Sales tax").closest("tr")).getByText("135.00"),
    ).toBeInTheDocument();
  });
});

// Every other test on this stage mocks a price in. A type the server has no
// price for is the state a newly added item is in, and it must not read as a
// free build or a sale worth nothing in particular.
describe("an item the market has no price for", () => {
  it("charges nothing to list and states no return", () => {
    show(jobDocument({ itemID: 99 }));

    // Nothing listed is charged nothing: the 100 ISK floor must not bill a
    // listing that cannot be made.
    const cost = within(panelNamed("Cost Breakdown"));
    expect(cost.queryByText("Broker fee to list")).not.toBeInTheDocument();
    expect(cost.queryByText("Sales tax")).not.toBeInTheDocument();
  });
});
