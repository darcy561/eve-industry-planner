import { describe, it, expect, vi, beforeAll } from "vitest";

const VOLUMES = {
  1230: 0.1,
  1228: 0.15,
  1224: 0.3,
  18: 0.35,
  20: 1.2,
  16262: 1000,
  21: 3,
  28432: 0.001,
  28430: 0.0015,
  28422: 0.0035,
  28420: 0.16,
};
const MATERIAL_VOLUMES = {
  34: 0.01,
  35: 0.01,
  36: 0.01,
  37: 0.01,
  38: 0.01,
  16272: 0.4,
  16273: 0.4,
  16274: 0.03,
  16275: 3,
};

vi.mock("../../Helper/getCachedData", async () => {
  const { cachedDataMock } = await import("../../../tests/cachedDataMock.js");
  return cachedDataMock({
    getReprocessingData: async () => ({
      items: Object.fromEntries(
        Object.entries(VOLUMES).map(([id, volume]) => [id, { id, volume }]),
      ),
      materialVolumes: MATERIAL_VOLUMES,
    }),
  });
});

const { primeReprocessing } = await import("../../Static/reprocessing.js");
const { valueReprocessing, valueOrePlan } = await import("./valuation.js");

const PRICES = {
  34: 4.1,
  35: 12.4,
  36: 48,
  37: 118,
  38: 815,
  16272: 212,
  16273: 221,
  16274: 640,
  16275: 1460,
  1230: 15.6,
  1228: 17.2,
  1224: 24.9,
  18: 34.5,
  20: 149,
  16262: 251000,
  21: 355,
  28432: 13.32,
  28430: 15.26,
  28422: 31.09,
  28420: 6165.08,
};
const priceOf = (typeID) => PRICES[typeID];

const item = (typeID, name, quantity, keptBack, outputs) => ({
  typeID,
  name,
  quantity,
  keptBack,
  outputs,
});

const TO_MINERALS = {
  items: [
    item("1230", "Veldspar", 128450, 50, { 34: 465475 }),
    item("1228", "Scordite", 64220, 20, { 34: 87276, 35: 64002 }),
    item("1224", "Pyroxeres", 31075, 75, { 35: 25285, 36: 8428 }),
    item("18", "Plagioclase", 22000, 0, { 34: 34892, 36: 13957 }),
    item("20", "Kernite", 8040, 40, { 36: 4350, 37: 8700 }),
    item("16262", "Clear Icicle", 12, 0, {
      16272: 740,
      16273: 375,
      16274: 4441,
      16275: 10,
    }),
    item("21", "Hedbergite", 45, 45, {}),
  ],
};
const RATES = { feePercent: 4.875, taxPercent: 2 };

beforeAll(() => primeReprocessing());

describe("valueReprocessing", () => {
  const valued = () => valueReprocessing(TO_MINERALS, priceOf, RATES);

  it("gives the worked example's totals to the unit", () => {
    const { totals } = valued();

    expect(Math.round(totals.marketValue)).toBe(8922970);
    expect(Math.round(totals.fees)).toBe(434995);
    expect(Math.round(totals.tax)).toBe(178459);
    expect(Math.round(totals.keptBackValue)).toBe(23711);
    expect(Math.round(totals.reprocessed)).toBe(8333227);
    expect(Math.round(totals.asIs)).toBe(8434835);
    expect(Math.round(totals.difference)).toBe(-101608);
    expect(totals.differencePercent).toBeCloseTo(-1.2, 1);
    expect(Math.round(totals.differenceWithoutTax)).toBe(76852);
  });

  it("gives each item's reprocessed figure, kept-back units sold as they are", () => {
    const byName = Object.fromEntries(
      valued().items.map((row) => [row.name, Math.round(row.reprocessed)]),
    );

    expect(byName).toMatchObject({
      Veldspar: 1777984,
      Scordite: 1072621,
      Pyroxeres: 670487,
      Plagioclase: 757100,
      Kernite: 1156136,
      "Clear Icicle": 2883704,
      Hedbergite: 15196,
    });
  });

  it("costs each output as the ore it came from, shared by value", () => {
    const scordite = valued().items.find((row) => row.name === "Scordite");

    expect(scordite.costAsThisOre[34]).toBeCloseTo(3.93, 2);
    expect(scordite.costAsThisOre[35]).toBeCloseTo(11.89, 2);
  });

  it("gives the hauling volume as they are and reprocessed", () => {
    const { hauling } = valued();

    expect(Math.round(hauling.asIs)).toBe(61284);
    expect(Math.round(hauling.reprocessed)).toBe(7946);
  });

  it("shares the value by output, largest first, adding to the whole", () => {
    const { shareByOutput } = valued();

    expect(shareByOutput[0].typeID).toBe("16274");
    expect(
      shareByOutput.reduce((total, output) => total + output.share, 0),
    ).toBeCloseTo(1, 10);
  });

  it("moves the value with the seller's fees and leaves what the run gives alone", () => {
    const cheaperSeller = valueReprocessing(TO_MINERALS, priceOf, {
      feePercent: 3,
      taxPercent: 2,
    });
    const standard = valued();

    expect(cheaperSeller.totals.reprocessed).toBeGreaterThan(
      standard.totals.reprocessed,
    );
    expect(cheaperSeller.totals.marketValue).toBe(standard.totals.marketValue);
    expect(cheaperSeller.hauling).toEqual(standard.hauling);
  });

  it("names what it could not price instead of counting it silently", () => {
    const valuedWithGap = valueReprocessing(
      TO_MINERALS,
      (typeID) => (typeID === "37" ? 0 : PRICES[typeID]),
      RATES,
    );

    expect(valuedWithGap.unpriced).toEqual(["37"]);
    expect(valuedWithGap.totals.marketValue).toBeLessThan(8922970);
  });

  it("values a ranged item by its expected run, with a range to the totals", () => {
    const valuedRanged = valueReprocessing(
      {
        items: [
          {
            typeID: "90041",
            name: "Prismaticite",
            quantity: 4000,
            keptBack: 0,
            batches: 40,
            yield: 90.63,
            outputs: { 34: 1959421 },
            randomizedMaterials: {
              34: { quantityMin: 368000, quantityMax: 496800 },
              38: { quantityMin: 2875, quantityMax: 4025 },
            },
          },
        ],
      },
      (typeID) => (typeID === "90041" ? 20500 : PRICES[typeID]),
      RATES,
    );
    const [prismaticite] = valuedRanged.items;
    const keep = 1 - 0.04875 - 0.02;

    expect(prismaticite.range.likely.low).toBeLessThan(
      prismaticite.reprocessed,
    );
    expect(prismaticite.reprocessed).toBeLessThan(
      prismaticite.range.likely.high,
    );
    expect(valuedRanged.totals.range.expected).toBeCloseTo(
      prismaticite.reprocessed,
      6,
    );
    expect(prismaticite.range.shareAbove(prismaticite.reprocessed)).toBeCloseTo(
      0.5,
      3,
    );
    expect(prismaticite.range.bounds.high).toBeCloseTo(
      40 * 4025 * 0.9063 * 815 * keep,
      0,
    );
  });
});

describe("a ranged item under rates that take everything", () => {
  const prismaticite = {
    items: [
      {
        typeID: "90041",
        name: "Prismaticite",
        quantity: 4050,
        keptBack: 50,
        batches: 40,
        yield: 90.63,
        outputs: { 34: 1959421 },
        randomizedMaterials: {
          34: { quantityMin: 368000, quantityMax: 496800 },
          38: { quantityMin: 2875, quantityMax: 4025 },
        },
      },
    ],
  };
  const price = (typeID) => (typeID === "90041" ? 20500 : PRICES[typeID]);

  it("is worth only its kept-back units when fees and tax take the whole value", () => {
    const [row] = valueReprocessing(prismaticite, price, {
      feePercent: 0,
      taxPercent: 100,
    }).items;

    expect(row.range.likely.low).toBe(row.keptBackValue);
    expect(row.range.likely.high).toBe(row.keptBackValue);
    expect(row.range.shareAbove(row.keptBackValue - 1)).toBe(1);
    expect(row.range.shareAbove(row.keptBackValue + 1)).toBe(0);
  });

  it("keeps its low end below its high end when the rates take more than the value", () => {
    const [row] = valueReprocessing(prismaticite, price, {
      feePercent: 80,
      taxPercent: 25,
    }).items;

    expect(row.range.likely.low).toBeLessThan(row.range.likely.high);
    expect(row.range.bounds.low).toBeLessThan(row.range.bounds.high);
    expect(row.range.shareAbove(row.range.bounds.low - 1)).toBeCloseTo(1, 6);
  });
});

describe("valueOrePlan", () => {
  const PLAN = {
    items: [
      item("28432", "Compressed Veldspar", 309000, 0, { 34: 1118580 }),
      item("28430", "Compressed Scordite", 450200, 0, {
        34: 607770,
        35: 445698,
      }),
      item("28422", "Compressed Plagioclase", 173300, 0, {
        34: 273814,
        36: 109179,
      }),
      item("28420", "Compressed Crokite", 600, 0, {
        35: 4350,
        36: 10872,
        38: 4350,
      }),
    ],
    outputs: { 34: 2000164, 35: 450048, 36: 120051, 38: 4350 },
  };
  const NEEDS = { 34: 2000000, 35: 450000, 36: 120000, 38: 4000 };
  const OPTIONS = {
    feePercent: 4.875,
    shipping: { mode: "perVolume", amount: 1000 },
  };

  it("gives the worked example's plan to the unit", () => {
    const plan = valueOrePlan(PLAN, NEEDS, priceOf, OPTIONS);

    expect(Math.round(plan.oreCost)).toBe(20072877);
    expect(Math.round(plan.shipping)).toBe(1686850);
    expect(Math.round(plan.delivered)).toBe(21759727);
    expect(Math.round(plan.outright.cost)).toBe(22800000);
    expect(Math.round(plan.outright.shipping)).toBe(25740000);
    expect(Math.round(plan.outright.delivered)).toBe(48540000);
    expect(Math.round(plan.leftoversValue)).toBe(288966);
    expect(Math.round(plan.leftoversAfterFees)).toBe(274879);
    expect(Math.round(plan.net)).toBe(21484848);
  });

  it("gives each ore its cost, volume and shipping", () => {
    const [veldspar] = valueOrePlan(PLAN, NEEDS, priceOf, OPTIONS).ores;

    expect(veldspar).toMatchObject({ quantity: 309000, price: 13.32 });
    expect(Math.round(veldspar.cost)).toBe(4115880);
    expect(veldspar.volume).toBeCloseTo(309, 6);
    expect(Math.round(veldspar.shipping)).toBe(309000);
  });

  it("charges a fixed shipping amount once, whatever the volume", () => {
    const plan = valueOrePlan(PLAN, NEEDS, priceOf, {
      ...OPTIONS,
      shipping: { mode: "fixed", amount: 5000000 },
    });

    expect(plan.shipping).toBe(5000000);
    expect(plan.outright.shipping).toBe(5000000);
    expect(plan.ores.every((ore) => ore.shipping === 0)).toBe(true);
  });

  it("charges nothing for shipping an empty plan", () => {
    const plan = valueOrePlan({ items: [], outputs: {} }, {}, priceOf, {
      shipping: { mode: "fixed", amount: 5000000 },
    });

    expect(plan.delivered).toBe(0);
    expect(plan.outright.delivered).toBe(0);
  });

  it("lists only what is left over beyond the need", () => {
    const { leftovers } = valueOrePlan(PLAN, NEEDS, priceOf, OPTIONS);

    expect(leftovers.map(({ typeID, units }) => [typeID, units])).toEqual([
      ["34", 164],
      ["35", 48],
      ["36", 51],
      ["38", 350],
    ]);
  });
});
