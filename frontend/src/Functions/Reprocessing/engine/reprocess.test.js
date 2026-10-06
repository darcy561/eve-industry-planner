import { describe, it, expect, vi, beforeEach } from "vitest";
import { reprocessingItemTypes } from "../../../Context/defaultValues";
import {
  PRISMATICITE,
  SCORDITE,
  reprocessingFile,
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
const { reprocess, reprocessedQuantity } = await import("./reprocess.js");
const { reprocessingSetupFrom } = await import("./reprocessingSetup.js");
const { default: ReprocessingItem } =
  await import("../../../Classes/reprocessingItem.js");

const WORKED_EXAMPLE = [
  { typeID: 1230, quantity: 128450 },
  { typeID: 1228, quantity: 64220 },
  { typeID: 16262, quantity: 12 },
  { typeID: 21, quantity: 45 },
  { typeID: 380, quantity: 3 },
];

const npcStation = () => reprocessingSetupFrom();

beforeEach(async () => {
  resetReprocessing();
  getReprocessingData.mockResolvedValue(reprocessingFile());
  await primeReprocessing();
});

describe("reprocessedQuantity", () => {
  it("rounds each batch of ore and gives that per batch", () => {
    expect(
      reprocessedQuantity(150, 642, 90.63, reprocessingItemTypes.ore),
    ).toBe(136 * 642);
  });

  it("rounds a whole run of gas once", () => {
    expect(reprocessedQuantity(1, 10, 84, reprocessingItemTypes.gas)).toBe(8);
  });
});

describe("reprocess", () => {
  it("counts each item's batches and the units kept back under a batch", () => {
    const { items } = reprocess(WORKED_EXAMPLE, npcStation());

    expect(
      items.map(({ name, batches, keptBack }) => [name, batches, keptBack]),
    ).toEqual([
      ["Veldspar", 1284, 50],
      ["Scordite", 642, 20],
      ["Clear Icicle", 12, 0],
      ["Hedbergite", 0, 45],
    ]);
  });

  it("gives every output as a total for the run", () => {
    const { items } = reprocess(WORKED_EXAMPLE, npcStation());
    const scordite = items.find((item) => item.name === "Scordite");

    expect(scordite.yield).toBe(50);
    expect(scordite.outputs).toEqual({ 34: 75 * 642, 35: 55 * 642 });
  });

  it("combines what every item gives", () => {
    const { outputs } = reprocess(WORKED_EXAMPLE, npcStation());

    expect(outputs[34]).toBe(200 * 1284 + 75 * 642);
    expect(outputs[35]).toBe(55 * 642);
  });

  it("keeps everything back from an item under one batch", () => {
    const { items } = reprocess([{ typeID: 21, quantity: 45 }], npcStation());

    expect(items[0]).toMatchObject({ batches: 0, keptBack: 45 });
    expect(Object.values(items[0].outputs)).toEqual([0, 0]);
  });

  it("returns what is not reprocessable rather than dropping it", () => {
    const { notReprocessable } = reprocess(WORKED_EXAMPLE, npcStation());

    expect(notReprocessable).toEqual([{ typeID: "380", quantity: 3 }]);
  });

  it("reprocesses gas through the same path, as a total", () => {
    const { items } = reprocess(
      [{ typeID: 62396, quantity: 10 }],
      npcStation(),
    );

    expect(items[0]).toMatchObject({ batches: 10, keptBack: 0, yield: 80 });
    expect(items[0].outputs).toEqual({ 25268: 8 });
  });

  it("adds an item named twice together", () => {
    const { items } = reprocess(
      [
        { typeID: 1230, quantity: 150 },
        { typeID: "1230", quantity: 60 },
      ],
      npcStation(),
    );

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ quantity: 210, batches: 2, keptBack: 10 });
  });

  it("leaves what it was given untouched", () => {
    const given = structuredClone(WORKED_EXAMPLE);
    reprocess(given, npcStation());

    expect(given).toEqual(WORKED_EXAMPLE);
  });

  it("agrees with the page's item class on every figure", () => {
    const setup = reprocessingSetupFrom(undefined, {
      3385: 5,
      3389: 4,
      60377: 3,
    });
    const { items } = reprocess([{ typeID: 1228, quantity: 64220 }], setup);

    const scordite = new ReprocessingItem(SCORDITE);
    scordite.setTotalQuantity(64220);
    scordite.reprocessMaterials(setup);

    expect(items[0].yield).toBe(scordite.percentageYield);
    for (const [id, perBatch] of Object.entries(
      scordite.reprocessedMaterials,
    )) {
      expect(items[0].outputs[id]).toBe(perBatch * scordite.batchCount);
    }
  });
});

describe("reprocessing random outputs", () => {
  it("gives erratic ore's minerals as expected units, each from none to every batch", () => {
    const { items } = reprocess(
      [{ typeID: 90041, quantity: 4000 }],
      npcStation(),
    );

    expect(items[0]).toMatchObject({ batches: 40, keptBack: 0, yield: 50 });
    expect(Object.keys(items[0].outputs)).toHaveLength(8);
    expect(items[0].outputs[34]).toBe(Math.round(5 * 432400 * 0.5));
    expect(items[0].outputs[11399]).toBe(Math.round(5 * 468 * 0.5));
    expect(items[0].outputRanges[34]).toEqual({ min: 0, max: 40 * 248400 });
    expect(items[0].outputRanges[11399]).toEqual({ min: 0, max: 40 * 312 });
    expect(items[0].randomizedMaterials).toBe(PRISMATICITE.randomizedMaterials);
  });

  it("gives an unrefined mineral's one mineral between its least and most", () => {
    const { items } = reprocess(
      [{ typeID: 90298, quantity: 1000 }],
      npcStation(),
    );

    expect(items[0].outputs).toEqual({ 11399: 700 });
    expect(items[0].outputRanges).toEqual({
      11399: { min: 10 * 47, max: 10 * 94 },
    });
  });

  it("reprocesses erratic ore at the yield ore takes in the same setup", () => {
    const setup = reprocessingSetupFrom(undefined, { 3385: 5, 3389: 5 });
    const { items } = reprocess(
      [
        { typeID: 90041, quantity: 100 },
        { typeID: 1230, quantity: 100 },
      ],
      setup,
    );

    expect(items[0].yield).toBe(items[1].yield);
  });

  it("makes a combined output a range when a random item adds to it", () => {
    const { outputs, outputRanges } = reprocess(
      [
        { typeID: 1230, quantity: 100 },
        { typeID: 90041, quantity: 4000 },
      ],
      npcStation(),
    );

    expect(outputs[34]).toBe(200 + Math.round(5 * 432400 * 0.5));
    expect(outputRanges[34]).toEqual({ min: 200, max: 200 + 40 * 248400 });
    expect(outputRanges[16272]).toBeUndefined();
  });

  it("carries no ranges when nothing random was reprocessed", () => {
    const result = reprocess(WORKED_EXAMPLE, npcStation());

    expect(result.outputRanges).toEqual({});
    expect(result.items.every((item) => !item.outputRanges)).toBe(true);
  });
});
