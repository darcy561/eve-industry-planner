import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  CLEAR_ICICLE,
  VELDSPAR,
  reprocessingFile,
} from "../../tests/reprocessingFixtures.js";

const getReprocessingData = vi.fn();
const getFullItemList = vi.fn();

vi.mock("../Helper/getCachedData", async () => {
  const { cachedDataMock } = await import("../../tests/cachedDataMock.js");
  return cachedDataMock({
    getReprocessingData: (...args) => getReprocessingData(...args),
    getFullItemList: (...args) => getFullItemList(...args),
  });
});

const { primeReprocessing, resetReprocessing } =
  await import("../Static/reprocessing.js");
const { parseReprocessingInput, parseInputMineralString } =
  await import("./reprocessingInput.js");
const { primeItems, resetItems } = await import("../Static/items.js");

const ITEMS = {
  34: { type_id: 34, name: "Tritanium" },
  16273: { type_id: 16273, name: "Liquid Ozone" },
  3828: { type_id: 3828, name: "Construction Blocks" },
  90289: { type_id: 90289, name: "Unrefined Isogen" },
};

beforeEach(async () => {
  vi.clearAllMocks();
  resetReprocessing();
  resetItems();
  getReprocessingData.mockResolvedValue(
    reprocessingFile([VELDSPAR, CLEAR_ICICLE]),
  );
  getFullItemList.mockResolvedValue(ITEMS);
  await Promise.all([primeReprocessing(), primeItems()]);
});

describe("what a pasted ore list is read as", () => {
  it("reads a tab-separated line", () => {
    const { items } = parseReprocessingInput("Veldspar\t1000");

    expect(items[0].id).toBe("1230");
    expect(items[0].totalQuantity).toBe(1000);
  });

  it("reads a space-separated line, name and all", () => {
    const { items } = parseReprocessingInput("Clear Icicle 250");

    expect(items[0].id).toBe("16262");
    expect(items[0].totalQuantity).toBe(250);
  });

  it("reads a quantity written with separators", () => {
    const { items } = parseReprocessingInput("Veldspar\t1,250");

    expect(items[0].totalQuantity).toBe(1250);
  });

  it("adds a repeated ore together rather than listing it twice", () => {
    const { items } = parseReprocessingInput("Veldspar\t100\nVeldspar\t50");

    expect(items).toHaveLength(1);
    expect(items[0].totalQuantity).toBe(150);
  });

  it("matches a name whatever its case", () => {
    const { items } = parseReprocessingInput("veldspar\t10");

    expect(items[0].id).toBe("1230");
  });

  it("reads a quantity with no digits as zero", () => {
    const { items, unread } = parseReprocessingInput("Veldspar\tsome");

    expect(items[0].totalQuantity).toBe(0);
    expect(unread).toEqual([]);
  });

  it("hands back a module line, a misspelt ore and a line with no quantity as pasted", () => {
    const { items, unread } = parseReprocessingInput(
      "Small Shield Booster I\t3\n  Veldsper 100  \nVeldspar\nClear Icicle\t12",
    );

    expect(items.map((item) => item.id)).toEqual(["16262"]);
    expect(unread).toEqual([
      "Small Shield Booster I\t3",
      "Veldsper 100",
      "Veldspar",
    ]);
  });

  it("lists a real item that does not reprocess apart from what it could not read", () => {
    expect(parseReprocessingInput("Tritanium\t100\nNo Such Thing\t2")).toEqual({
      items: [],
      notReprocessable: [{ name: "Tritanium", id: 34, quantity: 100 }],
      unread: ["No Such Thing\t2"],
    });
  });

  it("reads nothing, and nothing unread, from empty input", () => {
    for (const input of ["", "   ", "\n\n", undefined]) {
      expect(parseReprocessingInput(input)).toEqual({
        items: [],
        notReprocessable: [],
        unread: [],
      });
    }
  });
});

describe("what a pasted list of wanted materials is read as", () => {
  it("takes the materials ore, moon ore or ice can give, adding repeats together", () => {
    const { items } = parseInputMineralString(
      "Tritanium\t1,000\nLiquid Ozone 50\ntritanium\t500",
    );

    expect(items).toEqual({
      34: { name: "Tritanium", id: 34, quantity: 1500 },
      16273: { name: "Liquid Ozone", id: 16273, quantity: 50 },
    });
  });

  it("lists a real item no ore gives apart from a line naming nothing", () => {
    const { items, notFromOre, unread } = parseInputMineralString(
      "Construction Blocks\t10\nUnrefined Isogen 10\nTritanum\t5\nTritanium",
    );

    expect(items).toEqual({});
    expect(notFromOre).toEqual([
      { name: "Construction Blocks", id: 3828, quantity: 10 },
      { name: "Unrefined Isogen", id: 90289, quantity: 10 },
    ]);
    expect(unread).toEqual(["Tritanum\t5", "Tritanium"]);
  });

  it("reads nothing, and nothing unread, from empty input", () => {
    expect(parseInputMineralString("  \n ")).toEqual({
      items: {},
      notFromOre: [],
      unread: [],
    });
  });

  it("reads every line as unread before the files it needs are primed", () => {
    resetReprocessing();
    resetItems();

    expect(parseInputMineralString("Tritanium\t5")).toEqual({
      items: {},
      notFromOre: [],
      unread: ["Tritanium\t5"],
    });
  });
});
