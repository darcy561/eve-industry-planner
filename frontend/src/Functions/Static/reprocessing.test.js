import { describe, it, expect, vi, beforeEach } from "vitest";
import { reprocessingItemTypes } from "../../Context/defaultValues";

const getReprocessingData = vi.fn();

vi.mock("../Helper/getCachedData", async () => {
  const { cachedDataMock } = await import("../../tests/cachedDataMock.js");
  return cachedDataMock({
    getReprocessingData: (...args) => getReprocessingData(...args),
  });
});

const {
  primeReprocessing,
  readReprocessingItems,
  selectableItems,
  reprocessableByName,
  resetReprocessing,
} = await import("./reprocessing.js");

const VELDSPAR = {
  id: "1230",
  name: "Veldspar",
  materials: { 34: 415 },
  batchSize: 100,
  itemType: reprocessingItemTypes.ore,
};
const MERCOXIT = {
  id: "11396",
  name: "Mercoxit",
  materials: { 11399: 140 },
  batchSize: 100,
  itemType: reprocessingItemTypes.ore,
};
const GLACIAL_MASS = {
  id: "16264",
  name: "Glacial Mass",
  materials: { 16273: 69 },
  batchSize: 100,
  itemType: reprocessingItemTypes.ice,
};
const BITUMENS = {
  id: "45492",
  name: "Bitumens",
  materials: { 34: 1 },
  batchSize: 100,
  itemType: reprocessingItemTypes.moonOre,
};
const COMPRESSED = {
  id: "28430",
  name: "Compressed Veldspar",
  materials: { 34: 415 },
  batchSize: 1,
  itemType: reprocessingItemTypes.unrefinedOre,
};
const FULLERITE = {
  id: "30370",
  name: "Fullerite-C50",
  materials: { 30370: 1 },
  batchSize: 1,
  itemType: reprocessingItemTypes.gas,
};

const FILE = {
  1230: VELDSPAR,
  11396: MERCOXIT,
  16264: GLACIAL_MASS,
  45492: BITUMENS,
  28430: COMPRESSED,
  30370: FULLERITE,
};

beforeEach(() => {
  vi.clearAllMocks();
  resetReprocessing();
  getReprocessingData.mockResolvedValue(FILE);
});

describe("priming", () => {
  it("reads the file back once primed", async () => {
    await primeReprocessing();
    expect(readReprocessingItems()?.[1230]?.name).toBe("Veldspar");
  });

  // Null rather than an empty map: a walk over an empty one answers nothing for every item, which
  // reads as the file disagreeing rather than as data that has not arrived.
  it("answers null before it has loaded", () => {
    expect(readReprocessingItems()).toBeNull();
    expect(selectableItems()).toEqual([]);
    expect(reprocessableByName("Veldspar")).toBeUndefined();
  });

  it("loads once for concurrent callers", async () => {
    await Promise.all([primeReprocessing(), primeReprocessing()]);
    expect(getReprocessingData).toHaveBeenCalledTimes(1);
  });

  // A failure remembered as the answer would leave every later caller inheriting one outage.
  it("retries after a failure", async () => {
    getReprocessingData.mockRejectedValueOnce(new Error("offline"));
    await expect(primeReprocessing()).rejects.toThrow("offline");

    await primeReprocessing();
    expect(readReprocessingItems()?.[1230]?.name).toBe("Veldspar");
  });
});

describe("what ore selection may choose from", () => {
  // The figures the page recommends come from this set, so what it admits is the behaviour that
  // matters most here.
  it("admits ore, unrefined ore, moon ore and ice", async () => {
    await primeReprocessing();

    expect(
      selectableItems()
        .map((item) => item.name)
        .sort(),
    ).toEqual([
      "Bitumens",
      "Compressed Veldspar",
      "Glacial Mass",
      "Mercoxit",
      "Veldspar",
    ]);
  });

  // Gas reprocesses into gas rather than minerals, so it is never a source for producing them.
  it("leaves gas out", async () => {
    await primeReprocessing();

    expect(
      selectableItems().some(
        (item) => item.itemType === reprocessingItemTypes.gas,
      ),
    ).toBe(false);
  });

  it("hands back the same set each time", async () => {
    await primeReprocessing();
    expect(selectableItems()).toBe(selectableItems());
  });
});

describe("matching a pasted name", () => {
  it("finds an item by the name it is pasted under", async () => {
    await primeReprocessing();
    expect(reprocessableByName("Glacial Mass")?.id).toBe("16264");
  });

  it("ignores case and surrounding space", async () => {
    await primeReprocessing();
    expect(reprocessableByName("  glacial mass ")?.id).toBe("16264");
  });

  // Gas is matched here even though selection will not choose it: a player pasting gas is telling
  // the page what they hold, which is a different question from what it should buy.
  it("matches gas, which selection would not choose", async () => {
    await primeReprocessing();
    expect(reprocessableByName("Fullerite-C50")?.id).toBe("30370");
  });

  it("answers nothing for a name the file does not carry", async () => {
    await primeReprocessing();
    expect(reprocessableByName("Tritanium")).toBeUndefined();
  });
});

describe("resetReprocessing", () => {
  // A refresh can bring a new SDE build, and what was primed is the old one.
  it("makes the next prime read the file again", async () => {
    await primeReprocessing();
    resetReprocessing();
    await primeReprocessing();

    expect(getReprocessingData).toHaveBeenCalledTimes(2);
  });

  it("drops the views built from the old file", async () => {
    await primeReprocessing();
    selectableItems();
    reprocessableByName("Veldspar");

    resetReprocessing();
    getReprocessingData.mockResolvedValue({ 1230: VELDSPAR });
    await primeReprocessing();

    expect(selectableItems()).toHaveLength(1);
    expect(reprocessableByName("Glacial Mass")).toBeUndefined();
  });
});
