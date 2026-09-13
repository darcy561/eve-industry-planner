import { describe, it, expect, vi, beforeEach } from "vitest";
import { reprocessingItemTypes } from "../../Context/defaultValues";

const getReprocessingData = vi.fn();

vi.mock("../Helper/getCachedData", async () => {
  const { cachedDataMock } = await import("../../tests/archiveHarness.jsx");
  return cachedDataMock({
    getReprocessingData: (...args) => getReprocessingData(...args),
  });
});

const { primeReprocessing, resetReprocessing } =
  await import("../Static/reprocessing.js");
const { default: parseReprocessingInput } = await import("./parseOreInput.js");

const FILE = {
  1230: {
    id: "1230",
    name: "Veldspar",
    materials: { 34: 415 },
    batchSize: 100,
    itemType: reprocessingItemTypes.ore,
  },
  16264: {
    id: "16264",
    name: "Glacial Mass",
    materials: { 16273: 69 },
    batchSize: 100,
    itemType: reprocessingItemTypes.ice,
  },
};

beforeEach(async () => {
  vi.clearAllMocks();
  resetReprocessing();
  getReprocessingData.mockResolvedValue(FILE);
  await primeReprocessing();
});

describe("what a pasted ore list is read as", () => {
  it("reads a tab-separated line", () => {
    const [item] = parseReprocessingInput("Veldspar\t1000");

    expect(item.id).toBe("1230");
    expect(item.totalQuantity).toBe(1000);
  });

  it("reads a space-separated line, name and all", () => {
    const [item] = parseReprocessingInput("Glacial Mass 250");

    expect(item.id).toBe("16264");
    expect(item.totalQuantity).toBe(250);
  });

  it("reads a quantity written with separators", () => {
    const [item] = parseReprocessingInput("Veldspar\t1,250");

    expect(item.totalQuantity).toBe(1250);
  });

  // A player pastes what the game gave them, which repeats a stack across lines.
  it("adds a repeated ore together rather than listing it twice", () => {
    const items = parseReprocessingInput("Veldspar\t100\nVeldspar\t50");

    expect(items).toHaveLength(1);
    expect(items[0].totalQuantity).toBe(150);
  });

  it("ignores a line naming nothing it carries", () => {
    expect(parseReprocessingInput("Tritanium\t100")).toEqual([]);
  });

  // A quantity carrying no digits reads as none of that ore rather than as a line to discard: the
  // number parser strips what is not a digit, so "some" is an empty string and an empty string is
  // zero. The ore still appears, holding nothing.
  it("reads a quantity with no digits as zero", () => {
    const [item] = parseReprocessingInput("Veldspar\tsome");

    expect(item.id).toBe("1230");
    expect(item.totalQuantity).toBe(0);
  });

  it("ignores a line with no quantity at all", () => {
    expect(parseReprocessingInput("Veldspar")).toEqual([]);
  });

  it("reads nothing from empty input", () => {
    expect(parseReprocessingInput("")).toEqual([]);
    expect(parseReprocessingInput("   ")).toEqual([]);
    expect(parseReprocessingInput(undefined)).toEqual([]);
  });

  // Names are matched however the player cased them.
  it("matches a name whatever its case", () => {
    const [item] = parseReprocessingInput("veldspar\t10");

    expect(item.id).toBe("1230");
  });
});
