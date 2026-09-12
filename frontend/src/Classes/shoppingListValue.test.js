import { beforeEach, describe, expect, it, vi } from "vitest";
import ShoppingList from "./shoppingList.js";
import useUsersStore from "../Zustand/usersStore";

vi.mock("../Functions/Helper/getCachedData", async (importOriginal) => ({
  ...(await importOriginal()),
  getMarketGroups: async () => ({ 1857: { name: "Minerals" } }),
  getFullItemList: async () => ({ 34: { market_group_id: 1857 } }),
}));

import {
  primeMarketGroupData,
  resetMarketGroupData,
} from "../Functions/MarketData/marketGroupData";

const seed = ({ market, marketData, groups }) => {
  useUsersStore.setState((state) => ({
    ...state,
    applicationSettings: {
      ...state.applicationSettings,
      defaultPricing: {
        buying: { market, basis: "sell", groups },
        selling: { market: "amarr", basis: "buy" },
      },
    },
    worldData: { ...state.worldData, marketData },
  }));
};

const listOf = (typeID, quantity) => {
  const list = new ShoppingList();
  list.items = [
    {
      typeID,
      quantityToPurchase: quantity,
      assetQuantity: 0,
      isVisible: true,
      includeWhenCopying: true,
    },
  ];
  return list;
};

describe("what a shopping list is worth", () => {
  beforeEach(() => {
    useUsersStore.setState((state) => ({
      ...state,
      worldData: { ...state.worldData, marketData: {} },
    }));
  });

  it("totals against the buying side", () => {
    seed({
      market: "jita",
      marketData: { 34: { jita: { sell: 10 }, amarr: { buy: 999 } } },
    });

    const list = listOf(34, 5);
    list.calculateTotalValue();

    expect(list.totalValue).toBe(50);
  });

  // findMarketData builds its empty default from the four hubs, so a market it
  // does not carry misses. Indexing that twice used to raise a TypeError, which
  // took the whole dialogue down rather than pricing one row at nothing.
  it("prices at nothing rather than throwing on a market it has no figures for", () => {
    seed({
      market: "some-player-citadel",
      marketData: { 34: { jita: { sell: 10 } } },
    });

    const list = listOf(34, 5);

    expect(() => list.calculateTotalValue()).not.toThrow();
    expect(list.totalValue).toBe(0);
  });
});

// The list is a surface with no job and no per-item override, so the market group
// walk is the only rung above the account default on it. A rung that fired on the
// Planning stage and not here would price the same material two ways.
describe("a shopping list against a market group default", () => {
  beforeEach(async () => {
    resetMarketGroupData();
    await primeMarketGroupData();
  });

  it("prices an item from its group rather than the account default", async () => {
    seed({
      market: "jita",
      groups: { 1857: { market: "amarr", basis: "buy" } },
      marketData: { 34: { jita: { sell: 10 }, amarr: { buy: 3 } } },
    });

    const list = listOf(34, 5);
    list.calculateTotalValue();

    expect(list.totalValue).toBe(15);
  });

  it("leaves an item outside the group on the account default", async () => {
    seed({
      market: "jita",
      groups: { 9999: { market: "amarr", basis: "buy" } },
      marketData: { 34: { jita: { sell: 10 }, amarr: { buy: 3 } } },
    });

    const list = listOf(34, 5);
    list.calculateTotalValue();

    expect(list.totalValue).toBe(50);
  });
});
