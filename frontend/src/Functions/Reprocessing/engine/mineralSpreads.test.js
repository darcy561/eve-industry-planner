import { describe, expect, it } from "vitest";
import { reprocessingItemTypes } from "../../../Context/defaultValues";
import { likelyOutputUnits, mineralSpreads } from "./mineralSpreads";

const PRISMATICITE_RANGES = {
  34: { quantityMin: 368000, quantityMax: 496800 },
  35: { quantityMin: 89464, quantityMax: 111830 },
  36: { quantityMin: 35420, quantityMax: 45540 },
  37: { quantityMin: 23920, quantityMax: 31280 },
  38: { quantityMin: 2875, quantityMax: 4025 },
  39: { quantityMin: 1299, quantityMax: 1528 },
  40: { quantityMin: 634, quantityMax: 830 },
  11399: { quantityMin: 312, quantityMax: 624 },
};

const prismaticite = {
  typeID: "90041",
  batches: 40,
  yield: 90.63,
  itemType: reprocessingItemTypes.erratic,
  randomizedMaterials: PRISMATICITE_RANGES,
  outputs: { 34: 1963144 },
  outputRanges: { 34: { min: 0, max: 18009960 } },
};

describe("what each mineral of erratic ore could come to", () => {
  it("states what one batch gives if it gives that mineral", () => {
    expect(mineralSpreads(prismaticite)[34].perBatch).toEqual({
      low: 333518,
      high: 450250,
    });
  });

  it("takes the expected units and the possible range from the run", () => {
    const tritanium = mineralSpreads(prismaticite)[34];

    expect(tritanium.expected).toBe(1963144);
    expect(tritanium.bounds).toEqual({ low: 0, high: 18009960 });
  });

  it("gives the likely units eight in ten runs land in", () => {
    const { likely } = mineralSpreads(prismaticite)[34];

    expect(Math.abs(likely.low / 847557 - 1)).toBeLessThan(0.01);
    expect(Math.abs(likely.high / 3090314 - 1)).toBeLessThan(0.01);
  });

  it("gives every mineral the item can give", () => {
    expect(Object.keys(mineralSpreads(prismaticite))).toEqual(
      Object.keys(PRISMATICITE_RANGES),
    );
  });
});

describe("the likely units of each output across a result", () => {
  it("adds fixed units to a random item's likely units", () => {
    const veldspar = { typeID: "1230", outputs: { 34: 1000 } };
    const alone = likelyOutputUnits({
      items: [prismaticite],
      outputRanges: { 34: {} },
    });
    const mixed = likelyOutputUnits({
      items: [prismaticite, veldspar],
      outputRanges: { 34: {} },
    });

    expect(mixed[34].low).toBeCloseTo(alone[34].low + 1000, 0);
    expect(mixed[34].high).toBeCloseTo(alone[34].high + 1000, 0);
  });

  it("names only the outputs a random item touches", () => {
    const likely = likelyOutputUnits({
      items: [prismaticite],
      outputRanges: { 34: {}, 35: {} },
    });

    expect(Object.keys(likely)).toEqual(["34", "35"]);
  });
});

describe("what an unrefined mineral could come to", () => {
  const morphite = {
    typeID: "90298",
    batches: 10,
    yield: 90.63,
    itemType: reprocessingItemTypes.unrefinedMineral,
    randomizedMaterials: { 11399: { quantityMin: 93, quantityMax: 187 } },
    outputs: {},
  };

  it("gives its one mineral from every batch, so never none", () => {
    const { bounds, likely } = mineralSpreads(morphite)[11399];

    expect(bounds).toEqual({ low: 840, high: 1690 });
    expect(likely.low).toBeGreaterThan(840);
    expect(likely.high).toBeLessThan(1690);
  });
});

describe("the spread of a mineral's units", () => {
  it("states how far a run's units spread", () => {
    const { spread } = mineralSpreads(prismaticite)[34];
    const meanOfSquares = (333518 ** 2 + 333518 * 450250 + 450250 ** 2) / 3;
    const mean = (333518 + 450250) / 2;

    expect(spread).toBeCloseTo(
      Math.sqrt(40 * (meanOfSquares / 8 - (mean / 8) ** 2)),
      3,
    );
  });

  it("gives nothing for an item under one batch", () => {
    const { likely, bounds } = mineralSpreads({
      ...prismaticite,
      batches: 0,
      outputs: {},
      outputRanges: undefined,
    })[34];

    expect(likely).toEqual({
      low: expect.any(Number),
      high: expect.any(Number),
    });
    expect(likely.high).toBeLessThanOrEqual(0.5);
    expect(bounds).toEqual({ low: 0, high: 0 });
  });

  it("combines the spreads of several random items", () => {
    const one = likelyOutputUnits({
      items: [prismaticite],
      outputRanges: { 34: {} },
    })[34];
    const two = likelyOutputUnits({
      items: [prismaticite, { ...prismaticite, typeID: "other" }],
      outputRanges: { 34: {} },
    })[34];

    expect(two.high - two.low).toBeGreaterThan(one.high - one.low);
    expect(two.high - two.low).toBeLessThan(2 * (one.high - one.low));
  });
});
