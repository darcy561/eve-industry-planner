import { describe, it, expect, vi, beforeEach } from "vitest";
import { reprocessingItemTypes } from "../../Context/defaultValues";

const getReprocessingData = vi.fn();
const fetchPrices = vi.fn();

vi.mock("../Helper/getCachedData", async () => {
  const { cachedDataMock } = await import("../../tests/cachedDataMock.js");
  return cachedDataMock({
    getReprocessingData: (...args) => getReprocessingData(...args),
  });
});

vi.mock("../MarketData/priceCache", () => ({
  fetchPrices: (...args) => fetchPrices(...args),
}));

const { resetReprocessing } = await import("../Static/reprocessing.js");
const { default: reprocessIntoMinerals } = await import("./toMinerals.js");
const { default: ReprocessingStructure } =
  await import("../../Classes/reprocessingStructure.js");

const VELDSPAR = {
  id: "1230",
  name: "Veldspar",
  materials: { 34: 415 },
  batchSize: 100,
  itemType: reprocessingItemTypes.ore,
};

/** The default structure, as Classes/reprocessing.test.js builds one. */
function structure() {
  return new ReprocessingStructure();
}

beforeEach(() => {
  vi.clearAllMocks();
  resetReprocessing();
  getReprocessingData.mockResolvedValue({ 1230: VELDSPAR });
  fetchPrices.mockResolvedValue(undefined);
});

describe("turning pasted ore into minerals", () => {
  // The file is read through its owner, so the caller primes rather than fetching for itself.
  it("reads the ore it was given", async () => {
    const result = await reprocessIntoMinerals(
      "Veldspar\t100",
      {},
      structure(),
    );

    expect(result.reprocessingObjects).toHaveLength(1);
    expect(result.reprocessingObjects[0].id).toBe("1230");
    expect(getReprocessingData).toHaveBeenCalledTimes(1);
  });

  // Every caller shares the primed copy; a second calculation does not read the file again.
  it("reads the file once across two calculations", async () => {
    await reprocessIntoMinerals("Veldspar\t100", {}, structure());
    await reprocessIntoMinerals("Veldspar\t50", {}, structure());

    expect(getReprocessingData).toHaveBeenCalledTimes(1);
  });

  // Each type is asked for at the market the page prices against, rather than at
  // every market the server holds.
  it("asks the market about what it found", async () => {
    await reprocessIntoMinerals("Veldspar\t100", {}, structure(), "jita");

    const { wants } = fetchPrices.mock.calls[0][0];
    expect(wants.map((want) => String(want.typeID))).toEqual(
      expect.arrayContaining(["1230", "34"]),
    );
    expect(new Set(wants.map((want) => want.sourceID))).toEqual(
      new Set(["jita"]),
    );
  });

  it("reads nothing from a line naming no ore it carries", async () => {
    const result = await reprocessIntoMinerals(
      "Tritanium\t100",
      {},
      structure(),
    );

    expect(result.reprocessingObjects).toEqual([]);
  });
});
