import { describe, expect, it, vi } from "vitest";

const reader = { own: {}, main: "me" };

vi.mock("../MarketData/prices/marketPriceForType.js", () => ({
  readAdjustedPriceForType: () => 100,
}));

vi.mock("../../Zustand/usersStore", () => ({
  default: {
    getState: () => ({
      jobData: { actions: { findJobInJobArray: () => null } },
      account: {
        actions: {
          findCharacterByHash: (hash) => reader.own[hash] ?? null,
          getMainCharacterHash: () => reader.main,
          getMainCharacter: () => reader.own[reader.main] ?? null,
        },
      },
      applicationSettings: {
        actions: {
          findPredefinedSystemIndex: () => null,
          getCustomStructureWithID: () => null,
        },
      },
      worldData: {
        systemIndexes: {},
        actions: { findSystemIndex: () => null },
      },
    }),
  },
}));

const { jobTypes } = await import("../../Context/defaultValues.jsx");
const { calculateInstallCostfromSetup } = await import("./installCosts.js");

const LIVE_SCC_SURCHARGE = 0.04;
const LIVE_ALPHA_CLONE_TAX = 0.25;

const liveManStructure = {
  0: { id: 0, cost: 0 },
  1: { id: 1, cost: 0.03 },
  2: { id: 2, cost: 0.04 },
  3: { id: 3, cost: 0.05 },
  4: { id: 4, cost: 0.9 },
};

function liveInstallCost(setup, corrections = {}) {
  const estimatedItemValue = Math.ceil(
    Object.values(setup.materialCount).reduce(
      (all, material) => all + (material.quantity / setup.jobCount) * 100,
      0,
    ),
  );

  const facilityModifier = liveManStructure[setup.structureID]?.cost || 0;
  const facilityTax = (corrections.taxValue ?? setup.taxValue) / 100;
  const systemIndexValue = setup.alternativeSystemIndexValue;
  const cloneValue = reader.own[setup.selectedCharacter]?.isOmega
    ? 0
    : (corrections.alphaCloneTax ?? LIVE_ALPHA_CLONE_TAX / 100);

  const taxModifierTotal =
    estimatedItemValue *
    (systemIndexValue * facilityModifier +
      facilityTax +
      LIVE_SCC_SURCHARGE +
      cloneValue);

  const systemIndexDeduction = Math.ceil(systemIndexValue * estimatedItemValue);
  const facilityBonusDeduction = Math.ceil(
    facilityModifier * systemIndexDeduction,
  );

  return systemIndexDeduction - facilityBonusDeduction + taxModifierTotal;
}

function everyLiveSetup() {
  const corpus = [];
  for (const structureID of Object.keys(liveManStructure).map(Number)) {
    for (const alternativeSystemIndexValue of [0.001, 0.05, 0.2]) {
      for (const taxValue of [0, 0.25, 2.5]) {
        for (const jobCount of [1, 3]) {
          for (const selectedCharacter of ["omega", "alpha"]) {
            corpus.push({
              jobType: jobTypes.manufacturing,
              jobCount,
              runCount: 10,
              selectedCharacter,
              structureID,
              rigSlot1: 0,
              rigSlot2: 0,
              systemTypeID: 0,
              taxValue,
              customStructureID: "",
              useAlternativeSystemIndexValue: true,
              alternativeSystemIndexValue,
              materialCount: {
                34: { typeID: 34, quantity: 3_333 * jobCount },
                36: { typeID: 36, quantity: 17 * jobCount },
              },
            });
          }
        }
      }
    }
  }
  return corpus;
}

reader.own = {
  omega: { CharacterHash: "omega", isOmega: true },
  alpha: { CharacterHash: "alpha", isOmega: false },
};

function differences() {
  return everyLiveSetup()
    .map((setup) => ({
      setup,
      live: liveInstallCost(setup),
      now: calculateInstallCostfromSetup(setup),
    }))
    .filter((entry) => Math.abs(entry.live - entry.now) > 1e-9);
}

const FIXED_TAX_STRUCTURES = new Set([0, 4]);

/**
 * Live's own formula with the three corrections this branch made, which is what
 * every setup in the corpus must now cost to the last decimal.
 */
function correctedInstallCost(setup) {
  return liveInstallCost(setup, {
    alphaCloneTax: LIVE_ALPHA_CLONE_TAX,
    taxValue: FIXED_TAX_STRUCTURES.has(setup.structureID)
      ? 0.25
      : setup.taxValue,
  });
}

/**
 * Why a setup costs something different now, or nothing when this branch never
 * meant to charge it differently.
 */
function intendedCause({ setup }) {
  if (setup.selectedCharacter === "alpha") {
    return "an alpha clone pays the quarter percent it owes, not a hundredth of it";
  }
  if (setup.structureID === 4) return "the Fulcrum's fixed tax";
  if (setup.structureID === 0 && setup.taxValue !== 0.25) {
    return "an NPC station's fixed tax";
  }
  return null;
}

describe("what installing a setup costs, against the live model", () => {
  it("covers every structure, index, tax and clone state live can hold", () => {
    expect(everyLiveSetup()).toHaveLength(5 * 3 * 3 * 2 * 2);
  });

  it("differs from live only where this branch meant it to", () => {
    expect(differences().filter((entry) => !intendedCause(entry))).toEqual([]);
  });

  it("charges an omega exactly what live charged, everywhere else", () => {
    const unchanged = everyLiveSetup()
      .filter((setup) => setup.selectedCharacter === "omega")
      .filter((setup) => setup.structureID !== 4)
      .filter((setup) => !(setup.structureID === 0 && setup.taxValue !== 0.25));

    for (const setup of unchanged) {
      expect({ ...setup, cost: calculateInstallCostfromSetup(setup) }).toEqual({
        ...setup,
        cost: liveInstallCost(setup),
      });
    }
  });

  it("charges exactly what live charged once its three corrections are applied", () => {
    const wrong = everyLiveSetup()
      .map((setup) => ({
        setup,
        want: correctedInstallCost(setup),
        got: calculateInstallCostfromSetup(setup),
      }))
      .filter((entry) => Math.abs(entry.want - entry.got) > 1e-9);

    expect(wrong).toEqual([]);
  });

  it("charges an alpha the quarter percent the branch corrected it to", () => {
    const [omega, alpha] = ["omega", "alpha"].map((selectedCharacter) =>
      calculateInstallCostfromSetup({
        ...everyLiveSetup()[0],
        selectedCharacter,
        structureID: 1,
        taxValue: 0.25,
      }),
    );

    expect(alpha - omega).toBeCloseTo((3_333 + 17) * 100 * 0.25, 6);
  });
});
