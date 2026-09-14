import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const getMarketPriceForType = vi.fn();
const useSellingRates = vi.fn();
const useAccountTotalsQuery = vi.fn();

vi.mock("../../../../../../Functions/MarketData/marketPriceForType", () => ({
  getPriceRefreshedAt: () => undefined,
  getMarketPriceForType: (...args) => getMarketPriceForType(...args),
}));

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
  getJobInstallCostForPlanning: () => 100,
}));

const findJobInJobArray = vi.fn(() => undefined);

vi.mock("../../../../../../Zustand/usersStore", async () => {
  const { usersStoreMock } =
    await import("../../../../../../tests/usersStoreHarness.js");
  return usersStoreMock({
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
const { MATERIAL_PLAN } =
  await import("../../../../../../Functions/MarketData/materialSourcingRow");

// `selectedSetup` is a getter on the real Job class returning the setup itself,
// and a setup names its character in `selectedCharacter`. A fixture that flattens
// either would let a wrong read pass here and quote signed-out rates on the page.
const jobState = (setupToEdit = "setup0") => ({
  activeJob: {
    itemID: 34,
    totalQuantityProduced: 10,
    layout: { setupToEdit },
    build: {
      setup: { setup0: { selectedCharacter: "hash" } },
      costs: {
        extrasCosts: [
          { category: "1", categoryLabel: "Hauling", extraValue: 50 },
        ],
      },
    },
    get selectedSetup() {
      return this.build.setup[this.layout.setupToEdit];
    },
  },
});

const state = jobState();

const rows = [
  {
    plan: MATERIAL_PLAN.BUY,
    quantity: 100,
    remainingQuantity: 100,
    buyPrice: 5,
    paidCost: 0,
  },
];

const render = (overrides = {}) =>
  renderHook(() =>
    useJobEconomics({
      state,
      actions: { getCurrentParentJobs: () => [] },
      rows,
      ...overrides,
    }),
  );

beforeEach(() => {
  vi.clearAllMocks();
  findJobInJobArray.mockReturnValue(undefined);
  getMarketPriceForType.mockImplementation((_typeID, hub, listing) =>
    listing === "sell" ? 200 : 150,
  );
  useSellingRates.mockReturnValue({
    data: {
      brokerFee: { kind: "structure", base: null, rate: 1.5, terms: [] },
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
    render({ state: jobState(null) });

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

    const hubs = getMarketPriceForType.mock.calls.map(([, hub]) => hub);
    expect(new Set(hubs)).toEqual(new Set(["jita"]));
  });

  it("charges the fee on what the listing is worth", () => {
    getMarketPriceForType.mockImplementation((_typeID, _hub, listing) =>
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
  const withParents = (parentQuantity, produced = 10) => ({
    state: jobState(),
    actions: { getCurrentParentJobs: () => ["p1"] },
    parent: {
      build: {
        materials: [{ typeID: 34, quantity: parentQuantity }],
        childJobs: { 34: ["job-1"] },
      },
    },
    produced,
  });

  const renderWithParent = (parentQuantity, produced = 10) => {
    const fixture = withParents(parentQuantity, produced);
    fixture.state.activeJob.totalQuantityProduced = produced;
    fixture.state.activeJob.jobID = "job-1";
    findJobInJobArray.mockReturnValue(fixture.parent);

    return renderHook(() =>
      useJobEconomics({
        state: fixture.state,
        actions: fixture.actions,
        rows,
        marketLocation: "jita",
      }),
    ).result;
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
});
