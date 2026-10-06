import { describe, it, expect, vi, beforeEach } from "vitest";
import { reprocessingItemTypes } from "../../Context/defaultValues";
import {
  VELDSPAR,
  reprocessingFile,
} from "../../tests/reprocessingFixtures.js";

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
  volumeOf,
  producibleByReprocessing,
  producibleTypeIDs,
} = await import("./reprocessing.js");

beforeEach(() => {
  vi.clearAllMocks();
  resetReprocessing();
  getReprocessingData.mockResolvedValue(reprocessingFile());
});

describe("priming", () => {
  it("reads the file back once primed", async () => {
    await primeReprocessing();
    expect(readReprocessingItems()?.[1230]?.name).toBe("Veldspar");
  });

  it("answers null before it has loaded", () => {
    expect(readReprocessingItems()).toBeNull();
    expect(selectableItems()).toEqual([]);
    expect(reprocessableByName("Veldspar")).toBeUndefined();
  });

  it("loads once for concurrent callers", async () => {
    await Promise.all([primeReprocessing(), primeReprocessing()]);
    expect(getReprocessingData).toHaveBeenCalledTimes(1);
  });

  it("retries after a failure", async () => {
    getReprocessingData.mockRejectedValueOnce(new Error("offline"));
    await expect(primeReprocessing()).rejects.toThrow("offline");

    await primeReprocessing();
    expect(readReprocessingItems()?.[1230]?.name).toBe("Veldspar");
  });
});

describe("what ore selection may choose from", () => {
  it("admits ore, compressed ore, moon ore and ice", async () => {
    await primeReprocessing();

    expect(
      selectableItems()
        .map((item) => item.name)
        .sort(),
    ).toEqual([
      "Batch Compressed Veldspar II-Grade",
      "Bitumens",
      "Clear Icicle",
      "Hedbergite",
      "Mercoxit",
      "Scordite",
      "Veldspar",
    ]);
  });

  it("leaves gas out", async () => {
    await primeReprocessing();

    expect(
      selectableItems().some(
        (item) => item.itemType === reprocessingItemTypes.gas,
      ),
    ).toBe(false);
  });

  it("leaves out erratic ore and unrefined minerals, whose minerals are not fixed", async () => {
    await primeReprocessing();
    const ids = selectableItems().map((item) => item.id);
    expect(ids).not.toContain("90041");
    expect(ids).not.toContain("90298");
  });

  it("hands back the same set each time", async () => {
    await primeReprocessing();
    expect(selectableItems()).toBe(selectableItems());
  });
});

describe("matching a pasted name", () => {
  it("finds an item by the name it is pasted under", async () => {
    await primeReprocessing();
    expect(reprocessableByName("Clear Icicle")?.id).toBe("16262");
  });

  it("ignores case and surrounding space", async () => {
    await primeReprocessing();
    expect(reprocessableByName("  clear icicle ")?.id).toBe("16262");
  });

  it("matches gas, which selection would not choose", async () => {
    await primeReprocessing();
    expect(reprocessableByName("Compressed Amber Cytoserocin")?.id).toBe(
      "62396",
    );
  });

  it("matches erratic ore and unrefined minerals, which a player may hold", async () => {
    await primeReprocessing();
    expect(reprocessableByName("Prismaticite")?.id).toBe("90041");
    expect(reprocessableByName("Unrefined Morphite")?.id).toBe("90298");
  });

  it("answers nothing for a name the file does not carry", async () => {
    await primeReprocessing();
    expect(reprocessableByName("Tritanium")).toBeUndefined();
  });
});

describe("resetReprocessing", () => {
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
    getReprocessingData.mockResolvedValue(reprocessingFile([VELDSPAR], {}));
    await primeReprocessing();

    expect(selectableItems()).toHaveLength(1);
    expect(reprocessableByName("Clear Icicle")).toBeUndefined();
  });
});

describe("volumeOf", () => {
  it("gives a reprocessable item's own volume", async () => {
    await primeReprocessing();
    expect(volumeOf(1230)).toBe(0.1);
  });

  it("gives the volume of a material an item yields", async () => {
    await primeReprocessing();
    expect(volumeOf(34)).toBe(0.01);
    expect(volumeOf("16273")).toBe(0.4);
  });

  it("answers nothing for a type the file holds no volume for", async () => {
    await primeReprocessing();
    expect(volumeOf(16633)).toBeUndefined();
    expect(volumeOf(587)).toBeUndefined();
  });

  it("answers nothing before the file arrives", () => {
    expect(volumeOf(1230)).toBeUndefined();
  });
});

describe("a file with nothing in it", () => {
  it("reads as empty rather than failing", async () => {
    getReprocessingData.mockResolvedValue(undefined);
    await primeReprocessing();
    expect(readReprocessingItems()).toEqual({});
    expect(selectableItems()).toEqual([]);
    expect(volumeOf(34)).toBeUndefined();
  });
});

describe("what ore can produce", () => {
  it("counts every material an ore, moon ore or ice item gives", async () => {
    await primeReprocessing();
    expect(producibleTypeIDs().sort((a, b) => a - b)).toEqual([
      34, 35, 36, 38, 11399, 16272, 16273, 16274, 16275, 16633,
    ]);
  });

  it("does not count gas, or a mineral only erratic ore gives at random", async () => {
    await primeReprocessing();
    expect(producibleByReprocessing(25268)).toBe(false);
    expect(producibleByReprocessing(40)).toBe(false);
  });

  it("does not count a component, a PI material or Construction Blocks", async () => {
    await primeReprocessing();
    for (const typeID of [11530, 2393, 3828]) {
      expect(producibleByReprocessing(typeID)).toBe(false);
    }
  });

  it("reads a type id given as a string", async () => {
    await primeReprocessing();
    expect(producibleByReprocessing("34")).toBe(true);
  });

  it("answers no before the file arrives", () => {
    expect(producibleByReprocessing(34)).toBe(false);
    expect(producibleTypeIDs()).toEqual([]);
  });
});
