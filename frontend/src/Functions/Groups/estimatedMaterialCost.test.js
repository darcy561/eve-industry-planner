import { beforeEach, describe, expect, it, vi } from "vitest";
import { estimatedMaterialCost } from "./estimatedMaterialCost.js";
import { jobFromDocument } from "../Job/jobDocument";
import seedPrices, { clearSeededPrices } from "../../tests/seedPrices.js";

vi.mock("../../Zustand/usersStore.js", async () => {
  const { usersStoreMock } = await import("../../tests/usersStoreHarness.js");
  return usersStoreMock({
    account: {
      actions: {
        getMainCharacterHash: () => "me",
        findCharacterByHash: (hash) => ({ CharacterHash: hash, isOmega: true }),
      },
    },
  });
});

const captureException = vi.fn();
vi.mock("@sentry/react", () => ({
  captureException: (...args) => captureException(...args),
}));

function childJob(jobID, build = {}) {
  return jobFromDocument({
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

describe("pricing a material with no child job", () => {
  beforeEach(() => {
    clearSeededPrices();
    seedPrices({
      jita: { 34: { sell: 10, buy: 8 } },
      amarr: { 34: { sell: 25 } },
    });
  });

  it("prices at the market and order type it was given", () => {
    const material = { typeID: 34, quantity: 5, purchasing: {} };

    expect(
      estimatedMaterialCost(
        material,
        material.quantity,
        [],
        [],
        "jita",
        "sell",
      ),
    ).toBe(50);
    expect(
      estimatedMaterialCost(
        material,
        material.quantity,
        [],
        [],
        "amarr",
        "sell",
      ),
    ).toBe(125);
    expect(
      estimatedMaterialCost(material, material.quantity, [], [], "jita", "buy"),
    ).toBe(40);
  });

  it("falls back to what was paid where the market holds no figure", () => {
    const material = {
      typeID: 34,
      quantity: 5,
      purchasing: { "p-1": { id: "p-1", itemCount: 1, itemCost: 3 } },
    };

    expect(
      estimatedMaterialCost(
        material,
        material.quantity,
        [],
        [],
        "dodixie",
        "sell",
      ),
    ).toBe(15);
  });
});

describe("estimatedMaterialCost install rollup", () => {
  beforeEach(() => {
    clearSeededPrices();
    seedPrices({}, { adjusted: { 34: 100 } });
  });

  it("includes what a child's setups would cost to install", () => {
    const childJob = jobFromDocument({
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

    const material = { typeID: 34, quantity: 5, purchasing: {} };
    const cost = estimatedMaterialCost(
      material,
      material.quantity,
      ["child-1"],
      [childJob],
      "jita",
      "sell",
    );

    expect(cost).toBe(97.5);
  });
});

describe("pricing a material several child jobs build", () => {
  beforeEach(() => {
    clearSeededPrices();
    captureException.mockClear();
    seedPrices({}, { adjusted: { 34: 100 } });
  });

  it("spreads several children of one material over their combined output", () => {
    const material = { typeID: 587, quantity: 5, purchasing: {} };

    const cost = estimatedMaterialCost(
      material,
      material.quantity,
      ["child-1", "child-2"],
      [childJob("child-1"), childJob("child-2")],
      "jita",
      "sell",
    );

    expect(cost).toBe(97.5);
  });

  it("prices at the market when no named child job can be found", () => {
    clearSeededPrices();
    seedPrices({ jita: { 587: { sell: 9 } } });

    const material = { typeID: 587, quantity: 5, purchasing: {} };

    expect(
      estimatedMaterialCost(
        material,
        material.quantity,
        ["missing-1"],
        [],
        "jita",
        "sell",
      ),
    ).toBe(45);
  });

  it("charges one child the same as two that cost and produce the same", () => {
    const material = { typeID: 587, quantity: 5, purchasing: {} };

    const one = estimatedMaterialCost(
      material,
      material.quantity,
      ["child-1"],
      [childJob("child-1")],
      "jita",
      "sell",
    );
    const two = estimatedMaterialCost(
      material,
      material.quantity,
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

  it("stops the walk, prices the material at the market, and says so", () => {
    const looping = childJob("loop-1", {
      materials: { 34: { typeID: 34, purchasing: {} } },
      childJobs: { 34: ["loop-1"] },
    });

    const material = { typeID: 587, quantity: 1, purchasing: {} };
    const cost = estimatedMaterialCost(
      material,
      material.quantity,
      ["loop-1"],
      [looping],
      "jita",
      "sell",
    );

    expect(cost).toBe(33.5);
    expect(captureException).toHaveBeenCalledOnce();
  });
});
