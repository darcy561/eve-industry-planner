import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../Helper/getCachedData", async () => {
  const { cachedDataMock } = await import("../../../tests/cachedDataMock.js");
  return cachedDataMock({
    getMarketGroups: vi.fn(),
    getFullItemList: vi.fn(),
  });
});

import { getFullItemList, getMarketGroups } from "../../Helper/getCachedData";
import {
  ancestorPathIn,
  childrenIn,
  groupPricingFor,
  marketGroupOf,
  primeMarketGroupData,
  readMarketGroups,
  resetMarketGroupData,
} from "./marketGroupData";
import { PRICING_RUNG } from "./pricingSide";

const TREE = { 1857: { name: "Minerals", parent_id: 1849 } };
const ITEMS = { 34: { market_group_id: 1857 }, 35: {} };

beforeEach(() => {
  resetMarketGroupData();
  vi.clearAllMocks();
  getMarketGroups.mockResolvedValue(TREE);
  getFullItemList.mockResolvedValue(ITEMS);
});

describe("readMarketGroups", () => {
  it("answers null before anything has loaded", () => {
    expect(readMarketGroups()).toBeNull();
  });

  it("answers the tree once primed", async () => {
    await primeMarketGroupData();

    expect(readMarketGroups()).toEqual(TREE);
  });
});

describe("primeMarketGroupData", () => {
  it("loads once for concurrent callers", async () => {
    await Promise.all([primeMarketGroupData(), primeMarketGroupData()]);

    expect(getMarketGroups).toHaveBeenCalledTimes(1);
    expect(getFullItemList).toHaveBeenCalledTimes(1);
  });

  it("does not read the files again once it holds them", async () => {
    await primeMarketGroupData();
    await primeMarketGroupData();

    expect(getMarketGroups).toHaveBeenCalledTimes(1);
  });

  it("retries after a failed load", async () => {
    getMarketGroups.mockRejectedValueOnce(new Error("offline"));
    await expect(primeMarketGroupData()).rejects.toThrow("offline");

    await primeMarketGroupData();

    expect(readMarketGroups()).toEqual(TREE);
  });
});

describe("marketGroupOf", () => {
  it("answers undefined before the item list has loaded", () => {
    expect(marketGroupOf(34)).toBeUndefined();
  });

  it("reads an item's own market group", async () => {
    await primeMarketGroupData();

    expect(marketGroupOf(34)).toBe(1857);
  });

  it("answers undefined for an item with no market group", async () => {
    await primeMarketGroupData();

    expect(marketGroupOf(35)).toBeUndefined();
  });
});

describe("groupPricingFor", () => {
  const build = (groupDefaults) =>
    groupPricingFor({
      groupDefaults,
      marketLocationRung: PRICING_RUNG.ACCOUNT,
      orderTypeRung: PRICING_RUNG.ACCOUNT,
    });

  it("answers with the tree, the defaults and a reader", async () => {
    await primeMarketGroupData();

    const answer = build({ 1857: { market: "jita" } });
    expect(answer.marketGroups).toEqual(TREE);
    expect(answer.groupDefaults).toEqual({ 1857: { market: "jita" } });
    expect(answer.marketGroupOf(34)).toBe(1857);
  });

  it("carries the rungs through", async () => {
    await primeMarketGroupData();

    const answer = build({ 1857: { market: "jita" } });
    expect(answer.marketLocationRung).toBe(PRICING_RUNG.ACCOUNT);
    expect(answer.orderTypeRung).toBe(PRICING_RUNG.ACCOUNT);
  });

  it("answers nothing where the side has no group defaults", async () => {
    await primeMarketGroupData();

    expect(build(undefined)).toBeUndefined();
  });

  it("answers nothing where the side's table is empty", async () => {
    await primeMarketGroupData();

    expect(build({})).toBeUndefined();
  });

  it("answers nothing before the tree has loaded", () => {
    expect(build({ 1857: { market: "jita" } })).toBeUndefined();
  });
});

const BRANCH = {
  1849: { name: "Materials", children: [1857, 1996] },
  1857: { name: "Moon Materials", parent_id: 1849, children: [1998] },
  1996: { name: "Minerals", parent_id: 1849, has_types: true },
  1998: { name: "Raw Moon Materials", parent_id: 1857, has_types: true },
  4: { name: "Zydrine Holdings" },
  5: { name: "Ammunition" },
};

const primeBranch = async () => {
  getMarketGroups.mockResolvedValue(BRANCH);
  await primeMarketGroupData();
};

describe("childrenOf", () => {
  it("answers the roots when asked for nothing", async () => {
    await primeBranch();

    expect(childrenIn(readMarketGroups()).map((g) => g.name)).toEqual([
      "Ammunition",
      "Materials",
      "Zydrine Holdings",
    ]);
  });

  it("answers what sits inside a group", async () => {
    await primeBranch();

    expect(childrenIn(readMarketGroups(), 1849).map((g) => g.name)).toEqual([
      "Minerals",
      "Moon Materials",
    ]);
  });

  it("orders by name rather than by id", async () => {
    await primeBranch();

    expect(childrenIn(readMarketGroups()).map((g) => g.id)).toEqual([
      5, 1849, 4,
    ]);
  });

  it("says whether a group can be opened and whether it holds items", async () => {
    await primeBranch();

    const [minerals, moon] = childrenIn(readMarketGroups(), 1849);
    expect(minerals).toMatchObject({ hasChildren: false, hasTypes: true });
    expect(moon).toMatchObject({ hasChildren: true, hasTypes: false });
  });

  it("answers nothing for a leaf", async () => {
    await primeBranch();

    expect(childrenIn(readMarketGroups(), 1996)).toEqual([]);
  });

  it("answers nothing for a group the tree does not carry", async () => {
    await primeBranch();

    expect(childrenIn(readMarketGroups(), 9999)).toEqual([]);
  });

  it("answers nothing before the tree has loaded", () => {
    expect(childrenIn(readMarketGroups())).toEqual([]);
  });
});

describe("ancestorPath", () => {
  it("names what contains a group, outermost first", async () => {
    await primeBranch();

    expect(ancestorPathIn(readMarketGroups(), 1998).map((g) => g.name)).toEqual(
      ["Materials", "Moon Materials", "Raw Moon Materials"],
    );
  });

  it("answers a root as itself", async () => {
    await primeBranch();

    expect(ancestorPathIn(readMarketGroups(), 1849)).toEqual([
      { id: 1849, name: "Materials" },
    ]);
  });

  it("answers nothing for no group", async () => {
    await primeBranch();

    expect(ancestorPathIn(readMarketGroups(), undefined)).toEqual([]);
  });

  it("answers nothing before the tree has loaded", () => {
    expect(ancestorPathIn(readMarketGroups(), 1857)).toEqual([]);
  });

  it("stops rather than circling a tree that points at itself", async () => {
    getMarketGroups.mockResolvedValue({
      1: { name: "One", parent_id: 2 },
      2: { name: "Two", parent_id: 1 },
    });
    await primeMarketGroupData();

    expect(ancestorPathIn(readMarketGroups(), 1).length).toBeLessThanOrEqual(
      32,
    );
  });
});
