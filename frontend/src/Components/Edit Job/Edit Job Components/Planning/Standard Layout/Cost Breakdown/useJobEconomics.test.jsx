import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const readMarketPriceForType = vi.fn();

// The refresh times the prices came back with. The figures below are read out of the
// cache rather than subscribed to, so this is what tells this hook they moved —
// mocked, rather than run behind `tests/pricedSurface.jsx`, only in the one case
// that drives it.
let refreshTimes = { jita: 1 };
vi.mock("../../../../../../Hooks/React Query/World/marketPrices", () => ({
  useMarketPricesQuery: () => ({
    isLoading: false,
    isError: false,
    error: null,
    refreshTimes,
  }),
}));
const useSellingRates = vi.fn();
const useAccountTotalsQuery = vi.fn();

vi.mock(
  "../../../../../../Functions/MarketData/prices/marketPriceForType.js",
  () => ({
    readPriceRefreshedAt: () => undefined,
    readMarketPriceForType: (...args) => readMarketPriceForType(...args),
  }),
);

vi.mock(
  "../../../../../../Hooks/React Query/Character/useSellingRates",
  () => ({
    useSellingRates: (...args) => useSellingRates(...args),
  }),
);

vi.mock("../../../../../../Hooks/React Query/Backend/statisticsTotals", () => ({
  useAccountTotalsQuery: (...args) => useAccountTotalsQuery(...args),
}));

vi.mock("../../../../../../Functions/Installation Costs/installCosts", () => ({
  installCostForPlanning: () => 100,
}));

const findJobInJobArray = vi.fn(() => undefined);

vi.mock("../../../../../../Zustand/usersStore", async () => {
  const { usersStoreOverSession } =
    await import("../../../../../../tests/usersStoreHarness.js");
  return usersStoreOverSession({
    applicationSettings: { actions: { getCurrentLocale: () => "en-GB" } },
    jobData: {
      actions: { findJobInJobArray: (...a) => findJobInJobArray(...a) },
    },
  });
});

vi.mock("../../../../../../Functions/MarketOrders/sellerCharacter", () => ({
  resolveSellerCharacter: () => ({
    hash: "trader",
    name: "Market Alt",
    isDefault: true,
  }),
}));

const { useJobEconomics } = await import("./useJobEconomics");
const { default: useUsersStore } =
  await import("../../../../../../Zustand/usersStore");
const { MATERIAL_PLAN } =
  await import("../../../../../../Functions/Job/materialSourcingRow.js");

const session = () => useUsersStore.getState().editSession;

/** Ten items made, 50 of extras on them, as the planner stores a job. */
const jobDocument = ({ setupToEdit = "setup0", ...rest } = {}) => ({
  jobID: "job-1",
  itemID: 34,
  itemsProducedPerRun: 10,
  parentJobs: [],
  layout: { setupToEdit },
  build: {
    materials: {},
    childJobs: {},
    inventionEntries: {},
    setup: {
      setup0: {
        id: "setup0",
        selectedCharacter: "hash",
        runCount: 1,
        jobCount: 1,
        materialCount: {},
      },
    },
    extrasCosts: {
      e1: {
        id: "e1",
        category: "1",
        categoryLabel: "Hauling",
        extraValue: 50,
      },
    },
  },
  esi: { industryJobs: {}, marketOrders: {}, transactions: {} },
  ...rest,
});

const rows = [
  {
    plan: MATERIAL_PLAN.BUY,
    quantity: 100,
    remainingQuantity: 100,
    buyPrice: 5,
    paidCost: 0,
  },
];

const render = ({ document = jobDocument(), ...overrides } = {}) => {
  session().actions.openJob(document.jobID, document);
  return renderHook(() => useJobEconomics({ rows, ...overrides }));
};

beforeEach(() => {
  vi.clearAllMocks();
  session().actions.closeSession();
  findJobInJobArray.mockReturnValue(undefined);
  readMarketPriceForType.mockImplementation((_typeID, hub, listing) =>
    listing === "sell" ? 200 : 150,
  );
  useSellingRates.mockReturnValue({
    data: {
      brokerFee: { kind: "citadel", base: null, rate: 1.5, terms: [] },
      salesTax: { base: 7.5, accounting: 5, rate: 3.375 },
    },
    isLoading: false,
  });
  useAccountTotalsQuery.mockReturnValue({ data: undefined });
});

describe("useJobEconomics", () => {
  // The character that builds is not the character that sells: market skills and
  // the standings grind usually sit on a trading alt, and quoting the builder
  // prices every sale at the untrained rate.
  it("quotes the seller rather than the setup's character", () => {
    const { result } = render();

    expect(useSellingRates).toHaveBeenCalledWith(expect.anything(), "trader");
    expect(result.current.seller.name).toBe("Market Alt");
  });

  it("still quotes a seller when no setup is selected", () => {
    render({ document: jobDocument({ setupToEdit: null }) });

    expect(useSellingRates).toHaveBeenCalledWith(expect.anything(), "trader");
  });

  // The sell band is what Returns subtracts for itself. Passing a total that
  // already carries it takes the fee and the tax off twice.
  it("hands Returns the cost to build, not the cost to build and sell", () => {
    const { result } = render();
    const { cost, returns } = result.current;

    // 100 units at 5, plus 100 install and 50 extras, is 650 to build. The
    // listing is 200 a unit across 10, so 2,000 revenue less the 100 fee floor
    // and 67.50 tax leaves 1,182.50 — not 2,000 less 817.50, which is what
    // passing the total rather than the build band would give.
    expect(cost.toBuild.total).toBe(650);
    expect(cost.toSell.total).toBe(167.5);
    const listed = returns.routes.find((i) => i.id === "listed");
    expect(listed.net).toBe(1182.5);
  });

  // The archive's marks are build cost per unit, so a comparison against the
  // total would read every build as dearer than it was.
  it("compares against the build band rather than the total", () => {
    useAccountTotalsQuery.mockReturnValue({
      data: {
        history: {
          buildCount: 2,
          cheapestCostPerItem: 40,
          dearestCostPerItem: 80,
          lastCostPerItem: 60,
          lastCostMonth: { year: 2026, month: 5 },
        },
      },
    });

    const { result } = render();

    // 650 to build over 10 units: the archive's marks are build cost per unit,
    // so a comparison against the 81.75 total would read every build as dearer
    // than it was.
    expect(result.current.comparison.bar.value).toBe(65);
  });

  // A citadel holds no market of its own, so what it sells for is a hub's price
  // — the one the saved row names, not whatever the materials are priced at.
  it("prices the output at the sale location's hub", () => {
    render();

    const hubs = readMarketPriceForType.mock.calls.map(([, hub]) => hub);
    expect(new Set(hubs)).toEqual(new Set(["jita"]));
  });

  it("charges the fee on what the listing is worth", () => {
    readMarketPriceForType.mockImplementation((_typeID, _hub, listing) =>
      listing === "sell" ? 20000 : 15000,
    );

    const { result } = render();

    // 20,000 sell × 10 produced = 200,000, at the placeholder citadel's 1.5%.
    expect(result.current.charges.brokerFee).toBeCloseTo(3000);
    expect(result.current.charges.salesTax).toBeCloseTo(6750);
  });

  // The game charges a 100 ISK minimum however small the order is, so a cheap
  // listing costs more than its percentage.
  it("never quotes a fee under the floor the game charges", () => {
    const { result } = render();

    expect(result.current.charges.brokerFee).toBe(100);
  });

  it("charges nothing until the rates arrive", () => {
    useSellingRates.mockReturnValue({ data: undefined, isLoading: true });

    const { result } = render();

    expect(result.current.charges).toEqual({ brokerFee: 0, salesTax: 0 });
    expect(result.current.cost.toSell.lines).toEqual([]);
  });
});

// A job with parents is building to order. Its committed output is never listed,
// so quoting a sale price for it invites a player to read a profit that does not
// exist.
describe("a job whose output is owed to a parent", () => {
  const renderWithParent = (parentQuantity) => {
    findJobInJobArray.mockReturnValue({
      build: {
        materials: { [String(34)]: { typeID: 34, quantity: parentQuantity } },
        childJobs: { 34: ["job-1"] },
      },
    });

    return render({
      document: jobDocument({ parentJobs: ["p1"] }),
      marketLocation: "jita",
    }).result;
  };

  it("states no returns when every unit is spoken for", () => {
    const result = renderWithParent(10);

    expect(result.current.commitment.committed).toBe(10);
    expect(result.current.commitment.surplus).toBe(0);
    expect(result.current.returns).toBeNull();
  });

  // No listing means no listing fee. A fee on output that is never listed is a
  // cost the player will not pay.
  it("charges no broker fee or tax on committed output", () => {
    const result = renderWithParent(10);

    expect(result.current.charges).toEqual({ brokerFee: 0, salesTax: 0 });
    expect(result.current.cost.toSell.lines).toEqual([]);
  });

  it("states what the committed output cost to make", () => {
    const result = renderWithParent(10);

    // 65 a unit across the 10 the parent takes.
    expect(result.current.contributedCost).toBe(650);
  });

  // The honest edge case: a job making more than its parents need has something
  // it can genuinely sell, and the sale figures belong to that part only.
  it("prices the surplus, and only the surplus", () => {
    const result = renderWithParent(4);

    expect(result.current.commitment.committed).toBe(4);
    expect(result.current.commitment.surplus).toBe(6);

    const listed = result.current.returns.routes.find((i) => i.id === "listed");
    // 200 a unit across the 6 spare, not across all 10.
    expect(listed.revenue).toBe(1200);
  });

  it("leaves a job without parents selling everything it makes", () => {
    const { result } = render();

    expect(result.current.commitment.hasParents).toBe(false);
    expect(result.current.commitment.surplus).toBe(10);
    expect(result.current.returns).not.toBeNull();
  });

  // The figures are read out of the price cache as the memo runs, so a fetch
  // landing changes nothing this hook can see of its own.
  //
  // This asserts the figures move, not which dependency moves them: the memo
  // recomputes on every render today regardless, because `seller` is rebuilt
  // unmemoised by `useJobSellingContext`. Naming the refresh times is what keeps this
  // true if that is ever fixed.
  it("takes up the figures once the prices have settled", () => {
    readMarketPriceForType.mockReturnValue(0);
    const { result, rerender } = render();
    const beforeTheyLanded = result.current.returns.routes.find(
      (route) => route.id === "listed",
    ).revenue;

    readMarketPriceForType.mockReturnValue(500);
    refreshTimes = { jita: 2 };
    rerender();

    const afterTheyLanded = result.current.returns.routes.find(
      (route) => route.id === "listed",
    ).revenue;
    expect(afterTheyLanded).not.toBe(beforeTheyLanded);
  });
});
