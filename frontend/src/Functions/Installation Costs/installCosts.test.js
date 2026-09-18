import { describe, expect, it, vi } from "vitest";

/** The account doing the reading, and what it knows about its characters. */
const reader = { own: {}, main: "me" };

vi.mock("../MarketData/marketPriceForType", () => ({
  getAdjustedPriceForType: () => 100,
}));

/** The planner's jobs, for the cases that walk a chain. */
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

/** What the store has been told about each system's cost index. */
const world = { indexes: {} };

const { default: Job } = await import("../../Classes/job.js");
const { calculateCurrentJobBuildCostFromChildren } =
  await import("../Groups/calculateJobBuildCostFromChildren.js");
const {
  calculateInstallCostfromSetup,
  getJobInstallCostForPlanning,
  sumSetupInstallCostEstimates,
} = await import("./installCosts.js");

/**
 * A setup whose every cost input is fixed here rather than read from the store:
 * the system index is the setup's own alternative value, so the figure moves
 * only with what a case changes.
 */
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
  return new Job({ jobID: "job-1", itemID: 587, jobType: 1, build });
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
      materials: [],
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
      materials: [],
    });

    // Per slot, on 10 units at 100 each: 100 of system index, plus the 4%
    // surcharge and the structure's own tax on the same 1000.
    expect(getJobInstallCostForPlanning(job)).toBe(3 * 142.5);
    expect(job.totalInstallCost).toBe(0);
  });

  it("planning mode prefers actual when ESI jobs are linked", () => {
    omega("me");
    const job = jobWith({
      setup: { s1: { id: "s1", ...setupFields() } },
      costs: { linkedJobs: [{ job_id: 1, cost: 42 }] },
      products: { totalQuantity: 1 },
      materials: [],
    });
    expect(getJobInstallCostForPlanning(job)).toBe(42);
    expect(job.totalInstallCost).toBe(42);
  });

  it("actual mode returns zero when ESI linked but cost not yet recorded", () => {
    omega("me");
    const job = jobWith({
      setup: { s1: { id: "s1", ...setupFields() } },
      costs: { linkedJobs: [{ job_id: 1, cost: 0 }] },
      products: { totalQuantity: 1 },
      materials: [],
    });
    expect(job.totalInstallCost).toBe(0);
    expect(getJobInstallCostForPlanning(job)).toBe(0);
  });

  // An alpha clone pays a surcharge on every install, so whose clone state is
  // read changes the figure rather than only its label.
  it("charges the alpha surcharge against the reader's own clone state", () => {
    const job = jobWith({
      setup: { s1: { id: "s1", ...setupFields() } },
      costs: { linkedJobs: [] },
      products: { totalQuantity: 1 },
      materials: [],
    });
    const setup = job.build.setup.s1;

    omega("me");
    const asOmega = calculateInstallCostfromSetup(setup);
    alpha("me");

    expect(calculateInstallCostfromSetup(setup)).toBe(asOmega + 1000 * 0.0025);
  });

  // The setup names the member who planned the job, whose clone state this
  // account cannot see; reading it would charge every reader the alpha rate.
  it("reads the reader's clone state when the setup names another member", () => {
    const theirs = jobWith({
      setup: {
        s1: { id: "s1", ...setupFields({ selectedCharacter: "theirs" }) },
      },
      costs: { linkedJobs: [] },
      products: { totalQuantity: 1 },
      materials: [],
    });
    const mine = jobWith({
      setup: { s1: { id: "s1", ...setupFields() } },
      costs: { linkedJobs: [] },
      products: { totalQuantity: 1 },
      materials: [],
    });
    omega("me");

    expect(calculateInstallCostfromSetup(theirs.build.setup.s1)).toBe(
      calculateInstallCostfromSetup(mine.build.setup.s1),
    );
  });

  it("returns 0 from calculateInstallCostfromSetup for non-Setup input", () => {
    expect(calculateInstallCostfromSetup({})).toBe(0);
  });
});

// What a job costs to install is worked out from its system's index and its
// materials' adjusted prices. The chain walk reaches every job beneath the one
// being costed, so every one of them has to have been fetched for — which is
// what `loadAllRelatedJobs` is for on the two screens that open a chain.
describe("costing a chain deeper than one link", () => {
  /**
   * @param {string} jobID
   * @param {number} systemID
   * @param {number} materialTypeID
   * @param {string|null} childID
   */
  function link(jobID, systemID, materialTypeID, childID) {
    const built = new Job({
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
        materials: [
          {
            typeID: materialTypeID,
            quantity: 10,
            purchasedCost: 0,
            purchaseComplete: false,
          },
        ],
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

    const missingTheGrandchild =
      calculateCurrentJobBuildCostFromChildren(parent);

    world.indexes[UNKNOWN] = { manufacturing: 0.1 };
    const whole = calculateCurrentJobBuildCostFromChildren(parent);

    expect(missingTheGrandchild).toBeLessThan(whole);
  });
});
