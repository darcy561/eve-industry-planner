import { beforeEach, describe, expect, it, vi } from "vitest";

// The shared mock carries every reader, so a new static data file added
// elsewhere does not break this file's mock for want of an export.
vi.mock("../Helper/getCachedData", async () => {
  const { cachedDataMock } = await import("../../tests/cachedDataMock.js");
  return cachedDataMock({
    getMarketGroups: vi.fn(),
    getFullItemList: vi.fn(),
  });
});

import { getFullItemList, getMarketGroups } from "../Helper/getCachedData";
import {
  ancestorPath,
  childrenOf,
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
  // Null and an empty tree mean different things: nothing has loaded, versus a
  // tree that answers nothing for every item.
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

  // A remembered failure would strand every later caller on what may well have
  // been a transient outage.
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

  // Most unpublished types carry none, so this is ordinary rather than missing.
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
      listingTypeRung: PRICING_RUNG.ACCOUNT,
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
    expect(answer.listingTypeRung).toBe(PRICING_RUNG.ACCOUNT);
  });

  // Each of these leaves the ladder reading as it did before the rung existed,
  // rather than answering from half the data.
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

// A branch of the real shape: a root holding two groups, one of which holds
// another. Children are listed as the published file lists them — by id — so a
// test asserting display order is asserting this module's sort rather than the
// fixture's order.
const BRANCH = {
  // Ids ascend while names descend, so id order and name order disagree — a list
  // that merely preserved the file's order would come back wrong.
  1849: { name: "Materials", children: [1857, 1996] },
  1857: { name: "Moon Materials", parent_id: 1849, children: [1998] },
  1996: { name: "Minerals", parent_id: 1849, has_types: true },
  1998: { name: "Raw Moon Materials", parent_id: 1857, has_types: true },
  // A second root: id 4 sorts first, "Blueprints" sorts first too, so the roots
  // need their own disagreement — see ROOTS_BY_NAME below.
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

    // Ids 4, 5, 1849 against names Ammunition, Materials, Zydrine Holdings: the
    // two orders disagree, so this fails if the file's order is passed through.
    expect(childrenOf().map((g) => g.name)).toEqual([
      "Ammunition",
      "Materials",
      "Zydrine Holdings",
    ]);
  });

  it("answers what sits inside a group", async () => {
    await primeBranch();

    // The file lists these as [1857, 1996] — Moon Materials then Minerals — so
    // the names come back in the opposite order to the ids.
    expect(childrenOf(1849).map((g) => g.name)).toEqual([
      "Minerals",
      "Moon Materials",
    ]);
  });

  // A reader browsing is looking for a name, so the file's id order is not the
  // order to show. Moon Materials is id 1996 and sorts after Minerals either
  // way, so the roots are what prove this.
  it("orders by name rather than by id", async () => {
    await primeBranch();

    expect(childrenOf().map((g) => g.id)).toEqual([5, 1849, 4]);
  });

  // Both answers matter to a picker: one says whether opening the row leads
  // anywhere, the other whether choosing it prices anything directly.
  it("says whether a group can be opened and whether it holds items", async () => {
    await primeBranch();

    const [minerals, moon] = childrenOf(1849);
    expect(minerals).toMatchObject({ hasChildren: false, hasTypes: true });
    expect(moon).toMatchObject({ hasChildren: true, hasTypes: false });
  });

  it("answers nothing for a leaf", async () => {
    await primeBranch();

    expect(childrenOf(1996)).toEqual([]);
  });

  it("answers nothing for a group the tree does not carry", async () => {
    await primeBranch();

    expect(childrenOf(9999)).toEqual([]);
  });

  it("answers nothing before the tree has loaded", () => {
    expect(childrenOf()).toEqual([]);
  });
});

describe("ancestorPath", () => {
  it("names what contains a group, outermost first", async () => {
    await primeBranch();

    expect(ancestorPath(1998).map((g) => g.name)).toEqual([
      "Materials",
      "Moon Materials",
      "Raw Moon Materials",
    ]);
  });

  it("answers a root as itself", async () => {
    await primeBranch();

    expect(ancestorPath(1849)).toEqual([{ id: 1849, name: "Materials" }]);
  });

  it("answers nothing for no group", async () => {
    await primeBranch();

    expect(ancestorPath(undefined)).toEqual([]);
  });

  it("answers nothing before the tree has loaded", () => {
    expect(ancestorPath(1857)).toEqual([]);
  });

  // The walk down is driven by a reader and stops when they stop; this one runs
  // per row of a list being scrolled, so a cycle must not build a path forever.
  it("stops rather than circling a tree that points at itself", async () => {
    getMarketGroups.mockResolvedValue({
      1: { name: "One", parent_id: 2 },
      2: { name: "Two", parent_id: 1 },
    });
    await primeMarketGroupData();

    expect(ancestorPath(1).length).toBeLessThanOrEqual(32);
  });
});
