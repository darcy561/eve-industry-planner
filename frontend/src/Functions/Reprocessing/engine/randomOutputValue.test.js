import { describe, it, expect } from "vitest";
import { combinedValueRange, randomOutputValue } from "./randomOutputValue";

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
const PRICES = {
  34: 4.1,
  35: 12.4,
  36: 48,
  37: 118,
  38: 815,
  39: 1050,
  40: 2600,
  11399: 9800,
};
const priceOf = (typeID) => PRICES[typeID];

const prismaticite = (batches) => ({
  batches,
  yield: 90.63,
  randomizedMaterials: PRISMATICITE_RANGES,
});

describe("what a run of erratic ore is worth", () => {
  it("gives the worked example's figures over forty batches", () => {
    const value = randomOutputValue(prismaticite(40), priceOf);

    expect(value.expected).toBeCloseTo(86126721, -1);
    expect(value.likely.low).toBeCloseTo(78043993, -3);
    expect(value.likely.high).toBeCloseTo(94209449, -3);
    expect(value.bounds.low).toBeCloseTo(40216287, -1);
    expect(value.bounds.high).toBeCloseTo(221688230, -1);
  });

  it("gives the spread of a run, the same way through the simulation and the normal figures", () => {
    const normal = randomOutputValue(prismaticite(30), priceOf);
    const simulated = randomOutputValue(prismaticite(29), priceOf);

    expect(normal.spread).toBeCloseTo(Math.sqrt(30) * 997184, -3);
    expect(simulated.spread / Math.sqrt(29)).toBeCloseTo(
      normal.spread / Math.sqrt(30),
      -4,
    );
  });

  it("puts the expected value in the middle of the runs", () => {
    const value = randomOutputValue(prismaticite(40), priceOf);

    expect(value.shareAbove(value.expected)).toBeCloseTo(0.5, 3);
    expect(value.shareAbove(value.likely.high)).toBeCloseTo(0.1, 2);
    expect(value.shareAbove(value.bounds.high)).toBeLessThan(1e-6);
  });

  it("simulates a short run, the same way every time", () => {
    const first = randomOutputValue(prismaticite(5), priceOf);
    const second = randomOutputValue(prismaticite(5), priceOf);

    expect(first.likely).toEqual(second.likely);
    expect(first.bounds.low).toBeLessThan(first.likely.low);
    expect(first.likely.low).toBeLessThan(first.expected);
    expect(first.expected).toBeLessThan(first.likely.high);
    expect(first.likely.high).toBeLessThan(first.bounds.high);
    expect(first.shareAbove(first.bounds.low - 1)).toBe(1);
  });

  it("agrees between the simulation and the normal figures where both apply", () => {
    const normal = randomOutputValue(prismaticite(40), priceOf);
    const simulated = randomOutputValue(prismaticite(29), priceOf);
    const scaled = 40 / 29;

    expect((simulated.likely.low * scaled) / normal.likely.low).toBeCloseTo(
      1,
      1,
    );
  });

  it("gives an unrefined mineral its single mineral's range", () => {
    const value = randomOutputValue(
      {
        batches: 10,
        yield: 50,
        randomizedMaterials: {
          11399: { quantityMin: 93, quantityMax: 187 },
        },
      },
      priceOf,
    );

    expect(value.expected).toBeCloseTo(10 * 140 * 0.5 * 9800, 6);
    expect(value.bounds).toEqual({
      low: 10 * 93 * 0.5 * 9800,
      high: 10 * 187 * 0.5 * 9800,
    });
  });

  it("is worth nothing with no batches", () => {
    const value = randomOutputValue(prismaticite(0), priceOf);

    expect(value).toMatchObject({
      expected: 0,
      likely: { low: 0, high: 0 },
      bounds: { low: 0, high: 0 },
    });
    expect(value.shareAbove(0)).toBe(0);
  });
});

describe("combinedValueRange", () => {
  const unrefinedMorphite = randomOutputValue(
    {
      batches: 40,
      yield: 90.63,
      randomizedMaterials: { 11399: { quantityMin: 93, quantityMax: 187 } },
    },
    priceOf,
  );
  const prismaticiteRun = randomOutputValue(prismaticite(40), priceOf);

  it("shifts a single ranged part by the fixed amount, exactly", () => {
    const combined = combinedValueRange(1000, [prismaticiteRun]);

    expect(combined.expected).toBe(prismaticiteRun.expected + 1000);
    expect(combined.likely.low).toBe(prismaticiteRun.likely.low + 1000);
    expect(combined.shareAbove(prismaticiteRun.likely.high + 1000)).toBe(
      prismaticiteRun.shareAbove(prismaticiteRun.likely.high),
    );
  });

  it("adds expected values and bounds, and spreads in quadrature, over several parts", () => {
    const combined = combinedValueRange(1000, [
      prismaticiteRun,
      unrefinedMorphite,
    ]);

    expect(combined.expected).toBeCloseTo(
      1000 + prismaticiteRun.expected + unrefinedMorphite.expected,
      6,
    );
    expect(combined.spread).toBeCloseTo(
      Math.hypot(prismaticiteRun.spread, unrefinedMorphite.spread),
      6,
    );
    expect(combined.bounds).toEqual({
      low: 1000 + prismaticiteRun.bounds.low + unrefinedMorphite.bounds.low,
      high: 1000 + prismaticiteRun.bounds.high + unrefinedMorphite.bounds.high,
    });
    expect(combined.likely.high - combined.expected).toBeCloseTo(
      1.2815515655446004 * combined.spread,
      3,
    );
    expect(combined.shareAbove(combined.expected)).toBeCloseTo(0.5, 3);
    expect(combined.shareAbove(combined.likely.high)).toBeCloseTo(0.1, 2);
  });

  it("is a certainty when nothing in it varies", () => {
    const fixed = {
      expected: 5,
      spread: 0,
      likely: { low: 5, high: 5 },
      bounds: { low: 5, high: 5 },
      shareAbove: (v) => Number(5 > v),
    };
    const combined = combinedValueRange(0, [fixed, fixed]);

    expect(combined.likely).toEqual({ low: 10, high: 10 });
    expect(combined.shareAbove(9)).toBe(1);
    expect(combined.shareAbove(10)).toBe(0);
  });
});
