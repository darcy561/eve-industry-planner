import { describe, expect, it, vi } from "vitest";
import { totalInstallCost } from "../../Components/Edit Job/Edit Job Hooks/jobSelectors.js";

const reader = { own: {}, main: "me" };

vi.mock("../MarketData/prices/marketPriceForType.js", () => ({
  readAdjustedPriceForType: () => 100,
}));

const jobsByID = new Map();

vi.mock("../../Zustand/usersStore", () => ({
  default: {
    getState: () => ({
      jobData: {
        actions: { findJobInJobArray: (jobID) => jobsByID.get(jobID) ?? null },
      },
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
        actions: { findSystemIndex: (systemID) => world.indexes[systemID] },
      },
    }),
  },
}));

const world = { indexes: {} };

const { pirateFactions } = await import("../../Context/defaultValues.jsx");

const { jobFromDocument } = await import("../Job/jobDocument.js");
const { jobCostSoFar } = await import("../Groups/jobCostSoFar.js");
const {
  calculateInstallCostfromSetup,
  getJobInstallCostForPlanning,
  sumSetupInstallCostEstimates,
} = await import("./installCosts.js");

function setupFields({ jobCount = 1, selectedCharacter = "me" } = {}) {
  return {
    jobType: 1,
    jobCount,
    selectedCharacter,
    structureID: 0,
    rigID: 0,
    taxValue: 0,
    customStructureID: "",
    useAlternativeSystemIndexValue: true,
    alternativeSystemIndexValue: 0.1,
    materialCount: { 34: { typeID: 34, quantity: 10 * jobCount } },
  };
}

function jobWith(build) {
  return jobFromDocument({ jobID: "job-1", itemID: 587, jobType: 1, build });
}

function omega(hash) {
  reader.own = { [hash]: { CharacterHash: hash, isOmega: true } };
}

function alpha(hash) {
  reader.own = { [hash]: { CharacterHash: hash, isOmega: false } };
}

describe("installCosts", () => {
  it("adds up what each setup costs across its job slots", () => {
    omega("me");
    const job = jobWith({
      setup: {
        a: { id: "a", ...setupFields({ jobCount: 2 }) },
        b: { id: "b", ...setupFields({ jobCount: 1 }) },
      },
      costs: { linkedJobs: [] },
      products: { totalQuantity: 10 },
      materials: {},
    });
    const [a, b] = Object.values(job.build.setup);

    expect(sumSetupInstallCostEstimates(job.build.setup)).toBe(
      calculateInstallCostfromSetup(a) * 2 + calculateInstallCostfromSetup(b),
    );
  });

  it("planning mode uses setup estimates when nothing is linked", () => {
    omega("me");
    const job = jobWith({
      setup: { s1: { id: "s1", ...setupFields({ jobCount: 3 }) } },
      costs: { linkedJobs: [] },
      products: { totalQuantity: 10 },
      materials: {},
    });

    expect(getJobInstallCostForPlanning(job)).toBe(3 * 142.5);
    expect(totalInstallCost(job)).toBe(0);
  });

  it("planning mode prefers actual when ESI jobs are linked", () => {
    omega("me");
    const job = jobWith({
      setup: { s1: { id: "s1", ...setupFields() } },
      costs: { linkedJobs: [{ job_id: 1, cost: 42 }] },
      products: { totalQuantity: 1 },
      materials: {},
    });
    expect(getJobInstallCostForPlanning(job)).toBe(42);
    expect(totalInstallCost(job)).toBe(42);
  });

  it("actual mode returns zero when ESI linked but cost not yet recorded", () => {
    omega("me");
    const job = jobWith({
      setup: { s1: { id: "s1", ...setupFields() } },
      costs: { linkedJobs: [{ job_id: 1, cost: 0 }] },
      products: { totalQuantity: 1 },
      materials: {},
    });
    expect(totalInstallCost(job)).toBe(0);
    expect(getJobInstallCostForPlanning(job)).toBe(0);
  });

  it("charges an alpha clone a quarter of the item value, on the reader's own clone state", () => {
    const job = jobWith({
      setup: { s1: { id: "s1", ...setupFields() } },
      costs: { linkedJobs: [] },
      products: { totalQuantity: 1 },
      materials: {},
    });
    const setup = job.build.setup.s1;

    omega("me");
    const asOmega = calculateInstallCostfromSetup(setup);
    alpha("me");

    expect(calculateInstallCostfromSetup(setup)).toBe(asOmega + 1000 * 0.25);
  });

  it("reads the reader's clone state when the setup names another member", () => {
    const theirs = jobWith({
      setup: {
        s1: { id: "s1", ...setupFields({ selectedCharacter: "theirs" }) },
      },
      costs: { linkedJobs: [] },
      products: { totalQuantity: 1 },
      materials: {},
    });
    const mine = jobWith({
      setup: { s1: { id: "s1", ...setupFields() } },
      costs: { linkedJobs: [] },
      products: { totalQuantity: 1 },
      materials: {},
    });
    omega("me");

    expect(calculateInstallCostfromSetup(theirs.build.setup.s1)).toBe(
      calculateInstallCostfromSetup(mine.build.setup.s1),
    );
  });

  it("costs nothing for a setup that consumes nothing", () => {
    expect(calculateInstallCostfromSetup({})).toBe(0);
    expect(calculateInstallCostfromSetup(undefined)).toBe(0);
  });

  it("prices a stored setup as it prices the instance built over it", () => {
    const job = jobWith({
      setup: { s1: { id: "s1", ...setupFields() } },
      costs: { linkedJobs: [] },
      products: { totalQuantity: 1 },
      materials: {},
    });
    omega("me");
    const stored = job.build.setup.s1;

    expect(calculateInstallCostfromSetup(stored)).toBeGreaterThan(0);
  });
});

describe("what the place a job runs in does to its cost", () => {
  function atTheFulcrum(faction) {
    return {
      ...setupFields(),
      structureID: 4,
      ...(faction === undefined ? {} : { enlistedFaction: faction }),
    };
  }

  it("charges an NPC station's tax however little the setup stored", () => {
    omega("me");

    const stored = { ...setupFields(), structureID: 0, taxValue: 0 };

    expect(calculateInstallCostfromSetup(stored)).toBe(
      calculateInstallCostfromSetup({ ...stored, taxValue: 12 }),
    );
  });

  it("reduces the surcharge for a character flying for a pirate militia", () => {
    omega("me");

    const enlisted = calculateInstallCostfromSetup(
      atTheFulcrum(pirateFactions.guristas),
    );
    const notEnlisted = calculateInstallCostfromSetup(atTheFulcrum(null));

    expect(enlisted).toBeLessThan(notEnlisted);
  });

  it("leaves the surcharge alone for the wrong militia", () => {
    omega("me");

    expect(calculateInstallCostfromSetup(atTheFulcrum(500003))).toBe(
      calculateInstallCostfromSetup(atTheFulcrum(null)),
    );
  });

  it("leaves the surcharge alone at a place that names no militia", () => {
    omega("me");

    const npcStation = { ...setupFields(), structureID: 0 };

    expect(
      calculateInstallCostfromSetup({
        ...npcStation,
        enlistedFaction: pirateFactions.guristas,
      }),
    ).toBe(calculateInstallCostfromSetup(npcStation));
  });
});

describe("costing a chain deeper than one link", () => {
  function link(jobID, systemID, materialTypeID, childID) {
    const built = jobFromDocument({
      jobID,
      itemID: 587,
      jobType: 1,
      itemsProducedPerRun: 1,
      build: {
        setup: {
          s1: {
            id: "s1",
            ...setupFields(),
            systemID,
            useAlternativeSystemIndexValue: false,
            materialCount: {
              [materialTypeID]: { typeID: materialTypeID, quantity: 10 },
            },
          },
        },
        materials: {
          [String(materialTypeID)]: {
            typeID: materialTypeID,
            quantity: 10,
            purchasedCost: 0,
            purchaseComplete: false,
          },
        },
        childJobs: childID ? { [materialTypeID]: [childID] } : {},
        costs: { linkedJobs: [] },
        products: { totalQuantity: 10 },
      },
    });
    jobsByID.set(jobID, built);
    return built;
  }

  const KNOWN = 30000142;
  const UNKNOWN = 30002187;

  it("counts a grandchild's install cost, and loses it when nothing was fetched for its system", () => {
    omega("me");
    jobsByID.clear();
    world.indexes = { [KNOWN]: { manufacturing: 0.1 } };

    link("grandchild", UNKNOWN, 35, null);
    link("child", KNOWN, 34, "grandchild");
    const parent = link("parent", KNOWN, 34, "child");

    const missingTheGrandchild = jobCostSoFar(parent);

    world.indexes[UNKNOWN] = { manufacturing: 0.1 };
    const whole = jobCostSoFar(parent);

    expect(missingTheGrandchild).toBeLessThan(whole);
  });
});
