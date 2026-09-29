import { beforeEach, describe, expect, it, vi } from "vitest";

import correctSetupFigures from "./correctSetupFigures";
import { jobTypes } from "../../Context/defaultValues";
import { readIndustryBonusCatalogue } from "../Static/industryBonuses";

vi.mock("../Static/industryBonuses", () => ({
  readIndustryBonusCatalogue: vi.fn(),
}));

function bonusesHaveArrived(arrived = true) {
  readIndustryBonusCatalogue.mockReturnValue(
    arrived ? { families: {}, sources: {} } : null,
  );
}

const TRITANIUM = 34;

function jobWith(setup, { time = 600 } = {}) {
  return {
    jobType: jobTypes.manufacturing,
    rawData: {
      time,
      materials: [{ typeID: TRITANIUM, quantity: 1_000_000 }],
    },
    build: { setup: { "setup-1": setup } },
  };
}

function baseSetup(overrides = {}) {
  return {
    id: "setup-1",
    jobType: jobTypes.manufacturing,
    runCount: 1,
    jobCount: 1,
    ME: 0,
    structureID: 2,
    rigSlot1: 0,
    rigSlot2: 0,
    systemTypeID: 0,
    rawTime: 600,
    materialCount: {},
    ...overrides,
  };
}

function quantityOf(job) {
  return job.build.setup["setup-1"].materialCount[TRITANIUM].quantity;
}

describe("bringing a setup's stored figures back into step", () => {
  beforeEach(() => {
    bonusesHaveArrived();
  });

  it("corrects nothing before the bonuses have arrived", () => {
    bonusesHaveArrived(false);
    const job = jobWith(
      baseSetup({
        materialCount: {
          [TRITANIUM]: {
            typeID: TRITANIUM,
            rawQuantity: 1_000_000,
            quantity: 1,
          },
        },
      }),
    );

    expect(correctSetupFigures(job)).toEqual([]);
    expect(quantityOf(job)).toBe(1);
  });

  it("corrects a material count that disagrees with the setup's own inputs", () => {
    const job = jobWith(
      baseSetup({
        materialCount: {
          [TRITANIUM]: {
            typeID: TRITANIUM,
            rawQuantity: 1_000_000,
            quantity: 1,
          },
        },
      }),
    );

    expect(correctSetupFigures(job)).toEqual([
      { setupID: "setup-1", fields: ["materialCount"] },
    ]);
    expect(quantityOf(job)).toBe(990_000);
  });

  it("leaves the recipe's own figures alone, however far they have moved", () => {
    const job = jobWith(baseSetup({ rawTime: 60 }), { time: 900 });

    correctSetupFigures(job);

    expect(job.build.setup["setup-1"].rawTime).toBe(60);
  });

  it("leaves a setup whose figures already agree completely alone", () => {
    const job = jobWith(baseSetup());
    correctSetupFigures(job);
    const settled = job.build.setup["setup-1"];

    const again = jobWith(settled);
    expect(correctSetupFigures(again)).toEqual([]);
    expect(again.build.setup["setup-1"]).toBe(settled);
  });

  it("corrects the faction rig's material count, which its own band now scales", () => {
    const asStoredOnLive = {
      [TRITANIUM]: {
        typeID: TRITANIUM,
        rawQuantity: 1_000_000,
        quantity: 963_000,
      },
    };
    const highSec = jobWith(
      baseSetup({
        rigSlot1: 9,
        systemTypeID: 0,
        materialCount: asStoredOnLive,
      }),
    );
    const nullSec = jobWith(
      baseSetup({
        rigSlot1: 9,
        systemTypeID: 2,
        materialCount: {
          [TRITANIUM]: {
            typeID: TRITANIUM,
            rawQuantity: 1_000_000,
            quantity: 913_077,
          },
        },
      }),
    );

    correctSetupFigures(highSec);
    correctSetupFigures(nullSec);

    expect(quantityOf(highSec)).toBe(986_337);
    expect(quantityOf(nullSec)).toBe(986_337);
  });

  it("leaves the faction rig alone in low sec, where nothing changed", () => {
    const job = jobWith(
      baseSetup({
        rigSlot1: 9,
        systemTypeID: 1,
        materialCount: {
          [TRITANIUM]: {
            typeID: TRITANIUM,
            rawQuantity: 1_000_000,
            quantity: 920_403,
          },
        },
      }),
    );

    expect(correctSetupFigures(job)).toEqual([]);
  });

  it("walks every setup a job holds", () => {
    const job = jobWith(baseSetup({ materialCount: {} }));
    job.build.setup["setup-2"] = baseSetup({
      id: "setup-2",
      materialCount: {},
    });

    const corrected = correctSetupFigures(job);

    expect(corrected.map((entry) => entry.setupID).sort()).toEqual([
      "setup-1",
      "setup-2",
    ]);
  });

  it("answers nothing for a job carrying no setups", () => {
    expect(correctSetupFigures({ build: {} })).toEqual([]);
    expect(correctSetupFigures(null)).toEqual([]);
  });
});
