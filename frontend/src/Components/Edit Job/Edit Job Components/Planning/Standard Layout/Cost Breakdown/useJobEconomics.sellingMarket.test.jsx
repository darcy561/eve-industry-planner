import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const { getMarketPriceForType, sellingGroups } = vi.hoisted(() => ({
  getMarketPriceForType: vi.fn(() => 200),
  sellingGroups: { current: {} },
}));

vi.mock("../../../../../../Functions/MarketData/marketPriceForType", () => ({
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
  getJobInstallCostForPlanning: () => 0,
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
  const { usersStoreMock, usersStoreState } =
    await import("../../../../../../tests/usersStoreHarness.js");
  return usersStoreMock(() =>
    usersStoreState({
      applicationSettings: {
        actions: { getCurrentLocale: () => "en-GB" },
        defaultPricing: {
          buying: { market: "jita", basis: "sell" },
          selling: {
            market: "amarr",
            exit: "listed",
            ...sellingGroups.current,
          },
        },
      },
      jobData: { actions: { findJobInJobArray: () => undefined } },
    }),
  );
});

const { useJobEconomics } = await import("./useJobEconomics");
const { primeMarketGroupData, resetMarketGroupData } =
  await import("../../../../../../Functions/MarketData/marketGroupData");

const state = {
  activeJob: {
    itemID: 34,
    totalQuantityProduced: 10,
    layout: { setupToEdit: "setup0" },
    build: {
      setup: { setup0: { selectedCharacter: "hash" } },
      costs: { extrasCosts: [] },
    },
    get selectedSetup() {
      return this.build.setup[this.layout.setupToEdit];
    },
  },
};

// A job's output is sold, and the market it is sold on is the selling side's.
// Pricing it against the buying side quotes a sale from where the materials come
// from, which is the crossing this whole arrangement exists to remove.
describe("which market a sale is quoted against", () => {
  beforeEach(async () => {
    getMarketPriceForType.mockClear();
    sellingGroups.current = {};
    // The module holds the tree for the whole worker, so another file may have
    // primed it with data of its own.
    resetMarketGroupData();
    await primeMarketGroupData();
  });

  const price = () =>
    renderHook(() =>
      useJobEconomics({
        state,
        actions: { getCurrentParentJobs: () => [] },
        rows: [],
      }),
    );

  const hubsAskedForOutput = () =>
    new Set(
      getMarketPriceForType.mock.calls
        .filter(([typeID]) => typeID === 34)
        .map(([, hub]) => hub),
    );

  it("asks the selling side's market, not the buying side's", () => {
    renderHook(() =>
      useJobEconomics({
        state,
        actions: { getCurrentParentJobs: () => [] },
        rows: [],
      }),
    );

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
    sellingGroups.current = { groups: { 1857: { market: "hek" } } };

    price();

    expect(hubsAskedForOutput()).toEqual(new Set(["hek"]));
  });

  it("keeps the side's market for an item no group prices", () => {
    sellingGroups.current = { groups: { 9999: { market: "hek" } } };

    price();

    expect(hubsAskedForOutput()).toEqual(new Set(["amarr"]));
  });
});
