import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  BENCHMARK_NEEDS,
  BENCHMARK_ORES,
  benchmarkFile,
  benchmarkPrices,
} from "../../../tests/oreSelectionFixtures.js";
import {
  PRISMATICITE,
  UNREFINED_MORPHITE,
} from "../../../tests/reprocessingFixtures.js";

const getReprocessingData = vi.fn();

vi.mock("../../Helper/getCachedData", async () => {
  const { cachedDataMock } = await import("../../../tests/cachedDataMock.js");
  return cachedDataMock({
    getReprocessingData: (...args) => getReprocessingData(...args),
  });
});

const { primeReprocessing, resetReprocessing } =
  await import("../../Static/reprocessing.js");
const { oreToBuy, PREFER_COMPRESSED_BIAS } = await import("./oreToBuy.js");
const { reprocess, reprocessedQuantity } =
  await import("../engine/reprocess.js");
const { reprocessingSetupFrom, yieldFor } =
  await import("../engine/reprocessingSetup.js");
const { structureFromDocument } =
  await import("../../Custom Structures/customStructure.js");
const { jobTypes } = await import("../../../Context/defaultValues");

const PRICES = benchmarkPrices();
const priceOf = (typeID) => PRICES[typeID];
const COMPRESSED_SPODUMAIN = "62572";
const setup = reprocessingSetupFrom(
  structureFromDocument({
    jobType: jobTypes.reprocessing,
    structureType: 3,
    systemType: 2,
    rigSlot1: 4,
    implant: 3,
  }),
  { 3385: 5, 3389: 5, 60377: 5, 60378: 5, 60379: 5, 60380: 5, 12189: 5 },
);
const ALLOW = { compressedOre: "allow", buyOutright: true };

function covers(plan, needs) {
  const { outputs } = reprocess(
    plan.ores.map(({ typeID, quantity }) => ({ typeID, quantity })),
    setup,
  );
  for (const { typeID, quantity } of plan.outright) {
    outputs[typeID] = (outputs[typeID] ?? 0) + quantity;
  }
  return Object.entries(needs).every(
    ([typeID, need]) => (outputs[typeID] ?? 0) >= need,
  );
}

beforeEach(async () => {
  resetReprocessing();
  getReprocessingData.mockResolvedValue(benchmarkFile());
  await primeReprocessing();
});

describe("oreToBuy against the benchmark", () => {
  const cases = Object.entries(BENCHMARK_NEEDS).flatMap(([list, needs]) => [
    [list, "no shipping", needs, 0],
    [list, "1,000 ISK per m³", needs, 1000],
  ]);

  it.each(cases)(
    "%s, %s: covers every need within 2%% of the optimum",
    (_list, _shipping, needs, rate) => {
      const plan = oreToBuy(
        needs,
        setup,
        {
          ...ALLOW,
          neverChoose: [COMPRESSED_SPODUMAIN],
          shipping: { mode: "perVolume", amount: rate },
        },
        priceOf,
      );

      expect(plan.uncovered).toEqual([]);
      expect(covers(plan, needs)).toBe(true);
      expect(plan.cost).toBeLessThanOrEqual(plan.bound * 1.02);
    },
  );
});

describe("oreToBuy", () => {
  const needs = BENCHMARK_NEEDS.workedExample;

  it("never chooses what the reader excluded", () => {
    const veldspars = BENCHMARK_ORES.filter((ore) =>
      ore.name.endsWith("Veldspar"),
    ).map((ore) => ore.id);
    const plan = oreToBuy(
      needs,
      setup,
      { ...ALLOW, neverChoose: veldspars },
      priceOf,
    );

    expect(plan.ores.some((ore) => veldspars.includes(ore.typeID))).toBe(false);
    expect(covers(plan, needs)).toBe(true);
  });

  it("uses no compressed ore when told not to", () => {
    const plan = oreToBuy(
      needs,
      setup,
      { ...ALLOW, compressedOre: "avoid" },
      priceOf,
    );

    expect(plan.ores.some((ore) => ore.name.startsWith("Compressed"))).toBe(
      false,
    );
  });

  it("swings to compressed ore when it is preferred, reporting its real cost", () => {
    const allow = oreToBuy({ 34: 1000000 }, setup, ALLOW, priceOf);
    const prefer = oreToBuy(
      { 34: 1000000 },
      setup,
      { ...ALLOW, compressedOre: "prefer" },
      priceOf,
    );

    expect(allow.ores.map((ore) => ore.name)).toEqual(["Veldspar"]);
    expect(prefer.ores.map((ore) => ore.name)).toEqual(["Compressed Veldspar"]);
    expect(prefer.cost).toBeGreaterThan(allow.cost);
    expect(PREFER_COMPRESSED_BIAS).toBeGreaterThan(0.02);
  });

  it("buys a mineral outright when no ore beats it delivered", () => {
    const plan = oreToBuy({ 40: 1000 }, setup, ALLOW, (typeID) =>
      typeID === "40" ? 1 : PRICES[typeID],
    );

    expect(plan.ores).toEqual([]);
    expect(plan.outright).toEqual([{ typeID: "40", quantity: 1000 }]);
  });

  it("chooses the same ore whatever a fixed shipping amount is", () => {
    const none = oreToBuy(needs, setup, ALLOW, priceOf);
    const fixed = oreToBuy(
      needs,
      setup,
      { ...ALLOW, shipping: { mode: "fixed", amount: 50000000 } },
      priceOf,
    );

    expect(fixed.ores).toEqual(none.ores);
    expect(fixed.cost).toBe(none.cost);
  });

  it("says which need each ore was chosen for", () => {
    const plan = oreToBuy({ 34: 1000000 }, setup, ALLOW, priceOf);

    expect(plan.ores[0].chosenFor).toBe("34");
  });

  it("names the need an ore is tight on, not a by-product it gives far more of than is needed", () => {
    const scordite = BENCHMARK_ORES.find((ore) => ore.name === "Scordite");
    const plan = oreToBuy(
      { 34: 10000000, 35: 10000 },
      setup,
      {
        compressedOre: "avoid",
        neverChoose: BENCHMARK_ORES.filter((ore) => ore.id !== scordite.id).map(
          (ore) => ore.id,
        ),
      },
      priceOf,
    );

    expect(plan.ores.map((ore) => ore.name)).toEqual(["Scordite"]);
    expect(plan.ores[0].chosenFor).toBe("34");
  });

  it("returns what no ore gives untouched, and leaves the needs it was handed alone", () => {
    const given = { 34: 100000, 3828: 50 };
    const before = structuredClone(given);
    const plan = oreToBuy(given, setup, ALLOW, priceOf);

    expect(plan.notProducible).toEqual([{ typeID: "3828", quantity: 50 }]);
    expect(given).toEqual(before);
  });
});

describe("oreToBuy with random outputs in the file", () => {
  beforeEach(async () => {
    resetReprocessing();
    getReprocessingData.mockResolvedValue({
      ...benchmarkFile(),
      items: {
        ...benchmarkFile().items,
        [PRISMATICITE.id]: PRISMATICITE,
        [UNREFINED_MORPHITE.id]: UNREFINED_MORPHITE,
      },
    });
    await primeReprocessing();
  });

  const morphiteOnly = {
    compressedOre: "allow",
    neverChoose: ["11396", "62586"],
  };
  const prices = (typeID) =>
    ({ [PRISMATICITE.id]: 1, [UNREFINED_MORPHITE.id]: 5000 })[typeID] ??
    PRICES[typeID];

  it("plans an unrefined mineral at the least it is sure to give, and never erratic ore", () => {
    const plan = oreToBuy(
      { 11399: 10000 },
      setup,
      { ...morphiteOnly, buyOutright: false },
      prices,
    );
    const perBatch = reprocessedQuantity(
      93,
      1,
      yieldFor(setup, UNREFINED_MORPHITE),
      UNREFINED_MORPHITE.itemType,
    );

    expect(plan.ores.map((ore) => ore.name)).toEqual(["Unrefined Morphite"]);
    expect(plan.ores[0].batches).toBe(Math.ceil(10000 / perBatch));
    expect(plan.ores.some((ore) => ore.typeID === PRISMATICITE.id)).toBe(false);
  });

  it("names a need nothing can cover", () => {
    const plan = oreToBuy(
      { 11399: 10000 },
      setup,
      { ...morphiteOnly, neverChoose: [...morphiteOnly.neverChoose, "90298"] },
      prices,
    );

    expect(plan.uncovered).toEqual([{ typeID: "11399", quantity: 10000 }]);
    expect(plan.ores).toEqual([]);
  });
});
