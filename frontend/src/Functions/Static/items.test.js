import { describe, it, expect, vi, beforeEach } from "vitest";

const getFullItemList = vi.fn();
const getSearchIndex = vi.fn();
const getMarketGroups = vi.fn();

vi.mock("../Helper/getCachedData", async () => {
  const { cachedDataMock } = await import("../../tests/cachedDataMock.js");
  return cachedDataMock({
    getFullItemList: (...args) => getFullItemList(...args),
    getSearchIndex: (...args) => getSearchIndex(...args),
    getMarketGroups: (...args) => getMarketGroups(...args),
  });
});

const {
  primeItems,
  primeItemSearchIndex,
  itemRecord,
  readItemRecords,
  searchEntryByName,
  searchEntryByNameIn,
  resetItems,
} = await import("./items.js");

beforeEach(() => {
  vi.clearAllMocks();
  resetItems();
  getFullItemList.mockResolvedValue({
    34: { type_id: 34, name: "Tritanium", market_group_id: 1857 },
  });
  getSearchIndex.mockResolvedValue([
    { itemID: 587, name: "Rifter", blueprintID: 683 },
  ]);
  getMarketGroups.mockResolvedValue({ 1857: { name: "Minerals" } });
});

describe("priming the records", () => {
  it("reads one item back once primed", async () => {
    await primeItems();
    expect(itemRecord(34)?.name).toBe("Tritanium");
  });

  // Null rather than an empty map: a lookup against an empty one answers nothing for every type,
  // which reads as the list disagreeing rather than as data that has not arrived.
  it("answers null before it has loaded", () => {
    expect(readItemRecords()).toBeNull();
    expect(itemRecord(34)).toBeUndefined();
  });

  it("loads once for concurrent callers", async () => {
    await Promise.all([primeItems(), primeItems()]);
    expect(getFullItemList).toHaveBeenCalledTimes(1);
  });

  // A failure remembered as the answer would leave every later caller inheriting one outage.
  it("retries after a failure", async () => {
    getFullItemList.mockRejectedValueOnce(new Error("offline"));
    await expect(primeItems()).rejects.toThrow("offline");

    await primeItems();
    expect(itemRecord(34)?.name).toBe("Tritanium");
  });

  // Pricing a row should not wait on the file the fit importer reads.
  it("does not read the search index", async () => {
    await primeItems();
    expect(getSearchIndex).not.toHaveBeenCalled();
  });
});

describe("matching a name against the search index", () => {
  it("finds an entry by the name it is pasted under", async () => {
    await primeItemSearchIndex();
    expect(searchEntryByName("Rifter")?.itemID).toBe(587);
  });

  it("ignores case and surrounding space", async () => {
    await primeItemSearchIndex();
    expect(searchEntryByName("  rifter ")?.itemID).toBe(587);
  });

  it("answers nothing before the index has loaded", () => {
    expect(searchEntryByName("Rifter")).toBeUndefined();
  });

  // For a hook that subscribed to the index rather than priming it.
  it("matches against an index the caller holds", () => {
    const entries = [{ itemID: 1, name: "Veldspar" }];
    expect(searchEntryByNameIn(entries, "veldspar")?.itemID).toBe(1);
    expect(searchEntryByNameIn(entries, "Rifter")).toBeUndefined();
  });
});

describe("resetItems", () => {
  // A refresh can bring a new SDE build, and what was primed is the old one.
  it("makes the next prime read the files again", async () => {
    await primeItems();
    resetItems();
    await primeItems();

    expect(getFullItemList).toHaveBeenCalledTimes(2);
  });
});

// The market group tree is primed alongside the records but held in a different module, so a
// caller that drops the records alone must not leave a prime short-circuiting on the tree.
describe("dropping the records independently", () => {
  it("lets marketGroupData prime them again", async () => {
    const { primeMarketGroupData, marketGroupOf, resetMarketGroupData } =
      await import("../MarketData/marketGroupData.js");

    resetMarketGroupData();
    await primeMarketGroupData();
    expect(marketGroupOf(34)).toBe(1857);

    resetItems();
    await primeMarketGroupData();

    expect(marketGroupOf(34)).toBe(1857);
  });
});
