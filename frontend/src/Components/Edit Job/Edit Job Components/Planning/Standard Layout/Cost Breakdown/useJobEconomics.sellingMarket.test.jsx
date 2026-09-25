import { beforeEach, describe, expect, it, vi } from "vitest";
import { PricedSurface } from "../../../../../../tests/pricedSurface.jsx";
import { renderHook } from "@testing-library/react";

const { getMarketPriceForType } = vi.hoisted(() => ({
  getMarketPriceForType: vi.fn(() => 200),
}));

vi.mock("../../../../../../Functions/MarketData/prices/marketPriceForType.js", () => ({
  getPriceRefreshedAt: () => undefined,
  getMarketPriceForType: (...args) => getMarketPriceForType(...args),
}));

// No saved citadel, which is the only state in which the side's own market
// decides. `getSaleStructures` returns a placeholder today, so this case cannot
// be reached without saying so here — and it is the case the rung exists for.
vi.mock("../../../../../../Functions/MarketOrders/saleLocations", () => ({
  getDefaultSaleStructure: () => null,
  resolveSaleLocation: () => null,
}));

vi.mock(
  "../../../../../../Hooks/React Query/Character/useSellingRates",
  () => ({
    useSellingRates: () => ({ data: null, isLoading: false }),
  }),
);

vi.mock("../../../../../../Hooks/React Query/Backend/statisticsTotals", () => ({
  useAccountTotalsQuery: () => ({ data: null }),
}));

vi.mock("../../../../../../Functions/Installation Costs/installCosts", () => ({
  installCostForPlanning: () => 0,
}));

vi.mock("../../../../../../Functions/MarketOrders/sellerCharacter", () => ({
  resolveSellerCharacter: () => ({ hash: "t", name: "T", isDefault: true }),
}));

// Tritanium sits in Minerals. The rung needs the tree and the item's own group.
// Tritanium sits in Minerals. The real marketGroupData is primed rather than
// stubbed: `groupPricingFor` reads the tree and the item's group through that
// module's own state, so replacing its exports would change nothing.
//
// The shared mock carries every reader, so priming does not reach the network for
// a file it never asks for.
vi.mock("../../../../../../Functions/Helper/getCachedData", async () => {
  const { cachedDataMock } =
    await import("../../../../../../tests/cachedDataMock.js");
  return cachedDataMock({
    getMarketGroups: vi.fn(async () => ({ 1857: { name: "Minerals" } })),
    getFullItemList: vi.fn(async () => ({ 34: { market_group_id: 1857 } })),
  });
});

// The two sides name different markets, so a lookup against the wrong one is
// visible rather than passing on a fixture that agrees with itself.
vi.mock("../../../../../../Zustand/usersStore", async () => {
  const { usersStoreOverSession, usersStoreState } =
    await import("../../../../../../tests/usersStoreHarness.js");
  return usersStoreOverSession(
    usersStoreState({
      applicationSettings: {
        actions: { getCurrentLocale: () => "en-GB" },
      },
      jobData: { actions: { findJobInJobArray: () => undefined } },
    }),
  );
});

const { useJobEconomics } = await import("./useJobEconomics");
const { default: useUsersStore } =
  await import("../../../../../../Zustand/usersStore");
const { primeMarketGroupData, resetMarketGroupData } =
  await import("../../../../../../Functions/MarketData/defaults/marketGroupData.js");

const session = () => useUsersStore.getState().editSession;

/** The account's own markets, with whatever a market group says over them. */
const pricedWith = (groups = {}) =>
  useUsersStore.setState((store) => ({
    applicationSettings: {
      ...store.applicationSettings,
      defaultPricing: {
        buying: { market: "jita", orderType: "sell" },
        selling: { market: "amarr", exit: "listed", ...groups },
      },
    },
  }));

/** Ten units of Tritanium, as the planner stores the job that makes them. */
const jobDocument = () => ({
  jobID: "job-1",
  itemID: 34,
  itemsProducedPerRun: 10,
  parentJobs: [],
  layout: { setupToEdit: "setup0" },
  build: {
    materials: {},
    childJobs: {},
    extrasCosts: {},
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
  },
  esi: { industryJobs: {}, marketOrders: {}, transactions: {} },
});

// A job's output is sold, and the market it is sold on is the selling side's.
// Pricing it against the buying side quotes a sale from where the materials come
// from, which is the crossing this whole arrangement exists to remove.
describe("which market a sale is quoted against", () => {
  beforeEach(async () => {
    getMarketPriceForType.mockClear();
    pricedWith();
    // The module holds the tree for the whole worker, so another file may have
    // primed it with data of its own.
    resetMarketGroupData();
    await primeMarketGroupData();
    session().actions.closeSession();
    session().actions.openJob("job-1", jobDocument());
  });

  const price = () =>
    renderHook(() => useJobEconomics({ rows: [] }), {
      wrapper: PricedSurface,
    });

  const hubsAskedForOutput = () =>
    new Set(
      getMarketPriceForType.mock.calls
        .filter(([typeID]) => typeID === 34)
        .map(([, hub]) => hub),
    );

  it("asks the selling side's market, not the buying side's", () => {
    price();

    const forOutput = getMarketPriceForType.mock.calls.filter(
      ([typeID]) => typeID === 34,
    );

    expect(forOutput.length).toBeGreaterThan(0);
    expect(new Set(forOutput.map(([, hub]) => hub))).toEqual(
      new Set(["amarr"]),
    );
  });

  // A group default sits beneath a job's own choice and above the account's, and
  // the output is an item like any other — so pricing minerals somewhere else
  // has to reach a job that makes one.
  it("takes a market group default over the side's own market", () => {
    pricedWith({ groups: { 1857: { market: "hek" } } });

    price();

    expect(hubsAskedForOutput()).toEqual(new Set(["hek"]));
  });

  it("keeps the side's market for an item no group prices", () => {
    pricedWith({ groups: { 9999: { market: "hek" } } });

    price();

    expect(hubsAskedForOutput()).toEqual(new Set(["amarr"]));
  });
});
