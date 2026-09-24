import { beforeEach, describe, expect, it, vi } from "vitest";
import { estimatedMaterialCost } from "./estimatedMaterialCost.js";
import Job from "../../Classes/job.js";
import seedPrices, { clearSeededPrices } from "../../tests/seedPrices.js";

vi.mock("../../Zustand/usersStore.js", async () => {
  const { usersStoreMock } = await import("../../tests/usersStoreHarness.js");
  return usersStoreMock({});
});

const captureException = vi.fn();
vi.mock("@sentry/react", () => ({
  captureException: (...args) => captureException(...args),
}));

/**
 * A job producing ten of type 587 from twenty of type 34, whose setup carries
 * its own system index so what installing it costs is fixed here rather than
 * read from whatever the store happens to hold.
 *
 * @param {string} jobID
 * @param {object} [build] - Extra build fields, to link the job onward
 */
function childJob(jobID, build = {}) {
  return new Job({
    jobID,
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
      materials: {},
      childJobs: {},
      ...build,
    },
  });
}

// The market and order type are the caller's answer, resolved for its side, so
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

  it("prices at the market and order type it was given", () => {
    const material = { typeID: 34, quantity: 5, purchaseComplete: false };

    expect(estimatedMaterialCost(material, [], [], "jita", "sell")).toBe(50);
    expect(estimatedMaterialCost(material, [], [], "amarr", "sell")).toBe(125);
    expect(estimatedMaterialCost(material, [], [], "jita", "buy")).toBe(40);
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

    expect(estimatedMaterialCost(material, [], [], "dodixie", "sell")).toBe(15);
  });
});

describe("estimatedMaterialCost install rollup", () => {
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
        materials: {},
        childJobs: {},
      },
    });

    const material = { typeID: 34, quantity: 5, purchaseComplete: false };
    const cost = estimatedMaterialCost(
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

describe("pricing a material several child jobs build", () => {
  beforeEach(() => {
    clearSeededPrices();
    captureException.mockClear();
    seedPrices({}, { adjusted: { 34: 100 } });
  });

  // Two jobs building the same material are two parallel ways of producing it,
  // not two costs one after the other, so they are spread over their combined
  // output the way the cost-so-far walk spreads them.
  it("spreads several children of one material over their combined output", () => {
    const material = { typeID: 587, quantity: 5, purchaseComplete: false };

    const cost = estimatedMaterialCost(
      material,
      ["child-1", "child-2"],
      [childJob("child-1"), childJob("child-2")],
      "jita",
      "sell",
    );

    // install 200 each over 10 produced each, per unit 20, × material qty 5
    expect(cost).toBe(100);
  });

  // A material whose child jobs came to nothing is bought instead. The
  // cost-so-far walk buys it at what was paid; this one buys it at the market,
  // because a material nobody has paid for yet still has a price.
  it("prices at the market when no named child job can be found", () => {
    clearSeededPrices();
    seedPrices({ jita: { 587: { sell: 9 } } });

    const material = { typeID: 587, quantity: 5, purchaseComplete: false };

    expect(
      estimatedMaterialCost(material, ["missing-1"], [], "jita", "sell"),
    ).toBe(45);
  });

  it("charges one child the same as two that cost and produce the same", () => {
    const material = { typeID: 587, quantity: 5, purchaseComplete: false };

    const one = estimatedMaterialCost(
      material,
      ["child-1"],
      [childJob("child-1")],
      "jita",
      "sell",
    );
    const two = estimatedMaterialCost(
      material,
      ["child-1", "child-2"],
      [childJob("child-1"), childJob("child-2")],
      "jita",
      "sell",
    );

    expect(two).toBe(one);
  });
});

describe("a child job that leads back to itself", () => {
  beforeEach(() => {
    clearSeededPrices();
    captureException.mockClear();
    seedPrices({ jita: { 34: { sell: 7 } } }, { adjusted: { 34: 100 } });
  });

  // The branch is skipped rather than walked forever, and the material it was
  // building falls to the market the way an unbuilt material does — but the
  // figure is understated with no sign of it on screen, so the skip is reported.
  it("stops the walk, prices the material at the market, and says so", () => {
    const looping = childJob("loop-1", {
      materials: { 34: { typeID: 34, quantity: 1, purchaseComplete: false } },
      childJobs: { 34: ["loop-1"] },
    });

    const material = { typeID: 587, quantity: 1, purchaseComplete: false };
    const cost = estimatedMaterialCost(
      material,
      ["loop-1"],
      [looping],
      "jita",
      "sell",
    );

    // install 200 + the twenty looping materials at the market 7, over 10 produced
    expect(cost).toBe(34);
    expect(captureException).toHaveBeenCalledOnce();
  });
});
