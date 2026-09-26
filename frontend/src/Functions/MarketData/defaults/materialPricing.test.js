import { describe, expect, it } from "vitest";

import JobMaterial from "../../../Classes/jobMaterial";
import {
  getEffectiveMaterialPriceHub,
  materialCostByOrderType,
  materialPurchaseState,
  summariseOrderTypeUse,
  priceAge,
} from "./materialPricing";
import { PRICING_RUNG } from "./pricingSide";

const PRICES = {
  34: { jita: { buy: 5, sell: 10, buyP95: 6, sellP05: 9 } },
  35: { jita: { buy: 50, sell: 100, buyP95: 60, sellP05: 90 } },
  36: { amarr: { buy: 500, sell: 1000, buyP95: 600, sellP05: 900 } },
};

const getPrice = (typeID, hub, orderType) =>
  PRICES[typeID]?.[hub]?.[orderType] ?? 0;

const materials = [
  { typeID: 34, quantity: 10 },
  { typeID: 35, quantity: 2 },
];

function orderTypeById(options) {
  return Object.fromEntries(options.map((o) => [o.id, o]));
}

describe("materialCostByOrderType", () => {
  it("costs the job on every order type the app offers", () => {
    const options = materialCostByOrderType({
      rows: materials,
      build: {},
      marketLocation: "jita",
      orderType: "sell",
      getPrice,
    });

    const byId = orderTypeById(options);
    expect(byId.buy.total).toBe(10 * 5 + 2 * 50);
    expect(byId.sell.total).toBe(10 * 10 + 2 * 100);
    expect(byId.buyP95.total).toBe(10 * 6 + 2 * 60);
    expect(byId.sellP05.total).toBe(10 * 9 + 2 * 90);
  });

  it("marks the order type in effect and measures the others against it", () => {
    const byId = orderTypeById(
      materialCostByOrderType({
        rows: materials,
        build: {},
        marketLocation: "jita",
        orderType: "sell",
        getPrice,
      }),
    );

    expect(byId.sell.isCurrent).toBe(true);
    expect(byId.sell.delta).toBe(0);
    expect(byId.buy.delta).toBe(-150);
    expect(byId.buyP95.isCurrent).toBe(false);
  });

  it("keeps a row's own order type override on every candidate", () => {
    const build = {
      materialPriceOverrides: { 34: { orderDisplay: "buy" } },
    };

    const byId = orderTypeById(
      materialCostByOrderType({
        rows: materials,
        build,
        marketLocation: "jita",
        orderType: "sell",
        getPrice,
      }),
    );

    expect(byId.sell.total).toBe(10 * 5 + 2 * 100);
    expect(byId.buyP95.total).toBe(10 * 5 + 2 * 60);
  });

  it("keeps a row's own hub override too", () => {
    const build = {
      materialPriceOverrides: { 36: { marketDisplay: "amarr" } },
    };

    const byId = orderTypeById(
      materialCostByOrderType({
        rows: [{ typeID: 36, quantity: 1 }],
        build,
        marketLocation: "jita",
        orderType: "sell",
        getPrice,
      }),
    );

    expect(byId.sell.total).toBe(1000);
  });

  it("costs a job with no materials at zero on every order type", () => {
    const options = materialCostByOrderType({
      rows: [],
      build: {},
      marketLocation: "jita",
      orderType: "sell",
      getPrice,
    });

    expect(options).toHaveLength(4);
    expect(options.every((o) => o.total === 0 && o.delta === 0)).toBe(true);
  });

  it("treats a price the market has no figure for as zero rather than failing", () => {
    const byId = orderTypeById(
      materialCostByOrderType({
        rows: [{ typeID: 999, quantity: 5 }],
        build: {},
        marketLocation: "jita",
        orderType: "sell",
        getPrice,
      }),
    );

    expect(byId.sell.total).toBe(0);
  });
});

describe("materialPurchaseState", () => {
  const materialBought = (required, purchases) =>
    new JobMaterial(
      { typeID: 34, name: "Tritanium", purchasing: purchases },
      required,
    );

  it("reports a fully bought material as paid, at what it cost", () => {
    const material = materialBought(100, [
      { id: "p1", itemCount: 100, itemCost: 7 },
    ]);

    expect(materialPurchaseState(material)).toMatchObject({
      kind: "paid",
      paidQuantity: 100,
      paidCost: 700,
      remainingQuantity: 0,
    });
  });

  it("reports a partly bought material as both paid and outstanding", () => {
    const material = materialBought(100, [
      { id: "p1", itemCount: 40, itemCost: 7 },
    ]);

    expect(materialPurchaseState(material)).toMatchObject({
      kind: "part-paid",
      paidQuantity: 40,
      paidCost: 280,
      remainingQuantity: 60,
    });
  });

  it("reports an unbought material as an estimate", () => {
    const material = materialBought(100, []);

    expect(materialPurchaseState(material)).toMatchObject({
      kind: "estimated",
      paidQuantity: 0,
      paidCost: 0,
      remainingQuantity: 100,
    });
  });

  it("does not count buying more than the job needs as extra cost", () => {
    const material = materialBought(100, [
      { id: "p1", itemCount: 250, itemCost: 7 },
    ]);
    const state = materialPurchaseState(material);

    expect(state.kind).toBe("paid");
    expect(state.paidQuantity).toBe(100);
    expect(state.paidCost).toBe(700);
  });
});

describe("a material the job needs none of", () => {
  it("is an estimate with nothing outstanding and nothing counted", () => {
    const material = new JobMaterial(
      {
        typeID: 34,
        name: "Tritanium",
        purchasing: [{ id: "p1", itemCount: 50, itemCost: 7 }],
      },
      0,
    );

    expect(materialPurchaseState(material)).toMatchObject({
      kind: "estimated",
      paidQuantity: 0,
      paidCost: 0,
      remainingQuantity: 0,
    });
  });
});

describe("summariseOrderTypeUse", () => {
  const row = (overrides) => ({
    marketLocation: "jita",
    orderType: "sell",
    plan: "buy",
    ...overrides,
  });

  it("counts a row priced against another hub", () => {
    const rows = [row(), row({ marketLocation: "amarr" })];

    expect(summariseOrderTypeUse(rows, "jita", "sell").overridden).toBe(1);
  });

  it("counts a row priced on another order type", () => {
    const rows = [row(), row({ orderType: "buyP95" })];

    expect(summariseOrderTypeUse(rows, "jita", "sell").overridden).toBe(1);
  });

  it("counts a row departing on both as one row, not two", () => {
    const rows = [row({ marketLocation: "amarr", orderType: "buy" })];

    expect(summariseOrderTypeUse(rows, "jita", "sell").overridden).toBe(1);
  });

  it("counts rows that are not estimates at all", () => {
    const rows = [row(), row({ plan: "paid" }), row({ plan: "paid" })];

    expect(summariseOrderTypeUse(rows, "jita", "sell").purchased).toBe(2);
  });

  it("counts nothing when every row is on the order type", () => {
    expect(summariseOrderTypeUse([row(), row()], "jita", "sell")).toMatchObject(
      {
        overridden: 0,
        purchased: 0,
      },
    );
  });

  it("copes with no rows", () => {
    expect(summariseOrderTypeUse(undefined, "jita", "sell").overridden).toBe(0);
  });
});

describe("priceAge", () => {
  const now = Date.now();
  const refreshedAt = (byType) => (typeID) => byType[typeID];

  it("reports the age of the stalest price behind the total", () => {
    const age = priceAge(
      [{ typeID: 34 }, { typeID: 35 }],
      refreshedAt({ 34: now - 60_000, 35: now - 600_000 }),
    );

    expect(age).toBeGreaterThanOrEqual(600_000);
    expect(age).toBeLessThan(700_000);
  });

  it("passes over a material whose price carries no timestamp", () => {
    const age = priceAge(
      [{ typeID: 34 }, { typeID: 35 }],
      refreshedAt({ 34: now - 60_000, 35: undefined }),
    );

    expect(age).toBeLessThan(70_000);
  });

  it("has no age to state when nothing is priced", () => {
    expect(priceAge([{ typeID: 34 }], refreshedAt({}))).toBeNull();
    expect(priceAge([], refreshedAt({}))).toBeNull();
  });

  it("does not read a missing price as one from the epoch", () => {
    const age = priceAge(
      [{ typeID: 34 }, { typeID: 35 }],
      refreshedAt({ 34: now - 60_000, 35: 0 }),
    );

    expect(age).toBeLessThan(70_000);
  });
});

const MARKET_GROUPS = {
  1857: { name: "Minerals", parent_id: 1849 },
  1849: { name: "Materials" },
};

const GROUP_OF = { 34: 1857 };

function groupPricing(groupDefaults, rung = PRICING_RUNG.ACCOUNT) {
  return {
    marketGroups: MARKET_GROUPS,
    groupDefaults,
    marketGroupOf: (typeID) => GROUP_OF[typeID],
    marketLocationRung: rung,
    orderTypeRung: rung,
  };
}

describe("getEffectiveMaterialPriceHub — the market group rung", () => {
  it("prices from the item's group rather than the account default", () => {
    const resolved = getEffectiveMaterialPriceHub(
      {},
      34,
      "jita",
      "sell",
      groupPricing({ 1857: { market: "amarr", orderType: "buy" } }),
    );

    expect(resolved).toEqual({ marketLocation: "amarr", orderType: "buy" });
  });

  it("climbs to an ancestor group", () => {
    const resolved = getEffectiveMaterialPriceHub(
      {},
      34,
      "jita",
      "sell",
      groupPricing({ 1849: { market: "hek" } }),
    );

    expect(resolved.marketLocation).toBe("hek");
    expect(resolved.orderType).toBe("sell");
  });

  it("leaves an item with no market group on the panel default", () => {
    const resolved = getEffectiveMaterialPriceHub(
      {},
      35,
      "jita",
      "sell",
      groupPricing({ 1857: { market: "amarr" } }),
    );

    expect(resolved).toEqual({ marketLocation: "jita", orderType: "sell" });
  });

  it("yields to a job that named the axis", () => {
    const resolved = getEffectiveMaterialPriceHub(
      {},
      34,
      "jita",
      "sell",
      groupPricing(
        { 1857: { market: "amarr", orderType: "buy" } },
        PRICING_RUNG.JOB,
      ),
    );

    expect(resolved).toEqual({ marketLocation: "jita", orderType: "sell" });
  });

  it("yields per axis, where the job named only one", () => {
    const resolved = getEffectiveMaterialPriceHub({}, 34, "jita", "sell", {
      ...groupPricing({ 1857: { market: "amarr", orderType: "buy" } }),
      marketLocationRung: PRICING_RUNG.JOB,
      orderTypeRung: PRICING_RUNG.ACCOUNT,
    });

    expect(resolved).toEqual({ marketLocation: "jita", orderType: "buy" });
  });

  it("loses to the row's own override", () => {
    const build = {
      materialPriceOverrides: { 34: { marketDisplay: "dodixie" } },
    };

    const resolved = getEffectiveMaterialPriceHub(
      build,
      34,
      "jita",
      "sell",
      groupPricing({ 1857: { market: "amarr", orderType: "buy" } }),
    );

    expect(resolved.marketLocation).toBe("dodixie");
    expect(resolved.orderType).toBe("buy");
  });

  it("treats an empty row override as the row's answer", () => {
    const build = { materialPriceOverrides: { 34: { marketDisplay: "" } } };

    const resolved = getEffectiveMaterialPriceHub(
      build,
      34,
      "jita",
      "sell",
      groupPricing({ 1857: { market: "amarr" } }),
    );

    expect(resolved.marketLocation).toBe("");
  });

  it("yields where the rung that answered was not named", () => {
    const resolved = getEffectiveMaterialPriceHub({}, 34, "jita", "sell", {
      ...groupPricing({ 1857: { market: "amarr", orderType: "buy" } }),
      marketLocationRung: undefined,
      orderTypeRung: undefined,
    });

    expect(resolved).toEqual({ marketLocation: "jita", orderType: "sell" });
  });

  it("reads as it did before the rung when the tree has not loaded", () => {
    expect(getEffectiveMaterialPriceHub({}, 34, "jita", "sell")).toEqual({
      marketLocation: "jita",
      orderType: "sell",
    });
  });

  it("still costs each order type apart when a group names one", () => {
    const byId = orderTypeById(
      materialCostByOrderType({
        rows: materials,
        build: {},
        marketLocation: "jita",
        orderType: "sell",
        getPrice,
        groupPricing: groupPricing({ 1857: { orderType: "buy" } }),
      }),
    );

    expect(byId.sell.total).toBe(10 * 10 + 2 * 100);
    expect(byId.buy.total).toBe(10 * 5 + 2 * 50);
  });

  it("keeps a group's market on every candidate order type", () => {
    const byId = orderTypeById(
      materialCostByOrderType({
        rows: [{ typeID: 34, quantity: 1 }],
        build: {},
        marketLocation: "amarr",
        orderType: "sell",
        getPrice,
        groupPricing: groupPricing({ 1857: { market: "jita" } }),
      }),
    );

    expect(byId.sell.total).toBe(10);
    expect(byId.buy.total).toBe(5);
  });
});
