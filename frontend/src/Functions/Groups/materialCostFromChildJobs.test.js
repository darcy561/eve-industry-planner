import { beforeEach, describe, expect, it, vi } from "vitest";
import { calculateMaterialCostFromChildJobs } from "./materialCostFromChildJobs.js";
import Job from "../../Classes/job.js";
import seedPrices, { clearSeededPrices } from "../../tests/seedPrices.js";

vi.mock("../../Zustand/usersStore.js", async () => {
  const { usersStoreMock } = await import("../../tests/usersStoreHarness.js");
  return usersStoreMock({});
});

// The market and listing type are the caller's answer, resolved for its side, so
// this prices at whatever it is handed rather than choosing for itself. Two
// markets in the fixture, because one that agrees cannot tell them apart.
describe("pricing a material with no child job", () => {
  beforeEach(() => {
    clearSeededPrices();
    seedPrices({
      jita: { 34: { sell: 10, buy: 8 } },
      amarr: { 34: { sell: 25 } },
    });
  });

  it("prices at the market and basis it was given", () => {
    const material = { typeID: 34, quantity: 5, purchaseComplete: false };

    expect(
      calculateMaterialCostFromChildJobs(material, [], [], "jita", "sell"),
    ).toBe(50);
    expect(
      calculateMaterialCostFromChildJobs(material, [], [], "amarr", "sell"),
    ).toBe(125);
    expect(
      calculateMaterialCostFromChildJobs(material, [], [], "jita", "buy"),
    ).toBe(40);
  });

  // Nothing was fetched at this market, so the cache holds no row. Falling back
  // to what the reader already paid is better than pricing the line at nothing.
  it("falls back to what was paid where the market holds no figure", () => {
    const material = {
      typeID: 34,
      quantity: 5,
      purchaseComplete: false,
      purchasedCost: 3,
    };

    expect(
      calculateMaterialCostFromChildJobs(material, [], [], "dodixie", "sell"),
    ).toBe(15);
  });
});

describe("calculateMaterialCostFromChildJobs install rollup", () => {
  beforeEach(() => {
    clearSeededPrices();
    seedPrices({}, { adjusted: { 34: 100 } });
  });

  it("includes what a child's setups would cost to install", () => {
    // The helper asks the job what it produces, so this is a real Job. Its
    // setup carries its own system index, so what installing it costs is fixed
    // here rather than read from whatever the store happens to hold.
    const childJob = new Job({
      jobID: "child-1",
      itemID: 587,
      jobType: 1,
      itemsProducedPerRun: 5,
      build: {
        setup: {
          s1: {
            id: "s1",
            jobType: 1,
            runCount: 1,
            jobCount: 2,
            structureID: 0,
            rigID: 0,
            useAlternativeSystemIndexValue: true,
            alternativeSystemIndexValue: 0.055,
            materialCount: { 34: { typeID: 34, quantity: 20 } },
          },
        },
        costs: { linkedJobs: [] },
        materials: [],
        childJobs: {},
      },
    });

    const material = { typeID: 34, quantity: 5, purchaseComplete: false };
    const cost = calculateMaterialCostFromChildJobs(
      material,
      ["child-1"],
      [childJob],
      "jita",
      "sell",
    );

    // install 200 + extras 0, per unit 20, × material qty 5 = 100
    expect(cost).toBe(100);
  });
});
