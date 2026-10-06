import { describe, expect, it } from "vitest";
import { reprocessingItemTypes } from "../../Context/defaultValues";
import {
  aheadInHundred,
  varyingOutputChip,
  approximately,
  differenceSpanText,
  likelyDifference,
  likelyIsk,
  rangeOddsLine,
  spanText,
} from "./rangeFigures";

const range = {
  likely: { low: 80, high: 120 },
  shareAbove: (value) => (value < 100 ? 0.674 : 0.2),
};
const prismaticite = {
  name: "Prismaticite",
  itemType: reprocessingItemTypes.erratic,
  batchSize: 100,
  randomizedMaterials: { 34: {}, 35: {}, 36: {} },
};
const morphite = {
  name: "Unrefined Morphite",
  itemType: reprocessingItemTypes.unrefinedMineral,
  batchSize: 100,
  randomizedMaterials: { 11399: {} },
};

describe("ranged figures in words", () => {
  it("marks an expected figure", () => {
    expect(approximately("1.00")).toBe("~1.00");
  });

  it("states the likely span, and the likely difference from a fixed figure", () => {
    expect(likelyIsk(range)).toBe("likely 80.00 – 120.00");
    expect(likelyDifference(range, 100)).toBe("likely -20.00 to +20.00");
  });

  it("writes a span in any format, and a span less a fixed figure signed", () => {
    expect(spanText({ low: 1, high: 2 }, String)).toBe("1 – 2");
    expect(differenceSpanText({ low: 80, high: 120 }, 100)).toBe(
      "-20.00 to +20.00",
    );
  });

  it("counts the runs in 100 that come out ahead", () => {
    expect(aheadInHundred(range, 90)).toBe(67);
  });
});

describe("the line saying why the figures are a range", () => {
  it("names erratic ore, its minerals and its odds", () => {
    expect(rangeOddsLine([prismaticite])).toBe(
      "Prismaticite collapses into one of 3 minerals for every 100 units, so these figures are a range. They assume each of Prismaticite's minerals is equally likely, 1 in 3. Every other figure on the page follows the expected value; the likely range is where 8 in 10 outcomes land.",
    );
  });

  it("names unrefined minerals as giving a varying amount", () => {
    expect(rangeOddsLine([morphite, prismaticite])).toMatch(
      /^Prismaticite collapses into one of 3 minerals for every 100 units and Unrefined Morphite gives a varying amount, so/,
    );
  });

  it("states shared odds for more than one erratic ore", () => {
    expect(
      rangeOddsLine([prismaticite, { ...prismaticite, name: "Other" }]),
    ).toMatch(/They assume each of their minerals is equally likely\./);
  });

  it("says nothing when nothing varies", () => {
    expect(
      rangeOddsLine([
        { name: "Veldspar", itemType: reprocessingItemTypes.ore },
      ]),
    ).toBeNull();
  });
});

describe("what a row says about an item whose outputs vary", () => {
  it("says erratic ore gives one mineral for each amount it reprocesses in", () => {
    expect(varyingOutputChip(prismaticite)).toBe("One mineral per 100 units");
  });

  it("says an unrefined mineral's amount varies, and nothing for fixed outputs", () => {
    expect(varyingOutputChip(morphite)).toBe("Amount varies");
    expect(
      varyingOutputChip({
        itemType: reprocessingItemTypes.ore,
        batchSize: 100,
      }),
    ).toBeNull();
  });
});
