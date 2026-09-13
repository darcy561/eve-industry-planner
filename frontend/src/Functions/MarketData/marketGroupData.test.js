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
      marketRung: PRICING_RUNG.ACCOUNT,
      listingRung: PRICING_RUNG.ACCOUNT,
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
    expect(answer.marketRung).toBe(PRICING_RUNG.ACCOUNT);
    expect(answer.listingRung).toBe(PRICING_RUNG.ACCOUNT);
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
