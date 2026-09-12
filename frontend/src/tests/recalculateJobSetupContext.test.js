import { beforeEach, describe, expect, it, vi } from "vitest";

// The recalculating user's settings: a different structure, a different default
// ME and a different main character from the ones the job below was built with.
const RECALCULATING_USER = {
  customStructureID: "manufacturing-theirs",
  structureID: 35827,
  rigID: 37158,
  systemTypeID: 30000142,
  systemID: 30000142,
  taxValue: 0.1,
  mainCharacter: "hash-of-the-recalculating-user",
  defaultME: 5,
};

// The job's own build context, as stored on its setup.
const JOB_AS_BUILT = {
  customStructureID: "manufacturing-the-jobs-own",
  structureID: 35825,
  rigID: 37155,
  systemTypeID: 30002187,
  systemID: 30002187,
  taxValue: 0.25,
  character: "hash-of-whoever-built-the-job",
  ME: 10,
  TE: 20,
};

vi.mock("../Zustand/usersStore", () => ({
  default: {
    getState: () => ({
      account: {
        isLoggedIn: true,
        actions: {
          getMainCharacterHash: () => RECALCULATING_USER.mainCharacter,
          getMainCharacter: () => ({
            CharacterHash: RECALCULATING_USER.mainCharacter,
          }),
          findCharacterByHash: (hash) => ({ CharacterHash: hash }),
        },
      },
      worldData: {
        marketData: {},
        systemIndexes: {},
        actions: {
          findSystemIndex: (systemID, alternativeLocation) =>
            alternativeLocation?.[systemID] ?? null,
          findMarketData: () => null,
          addSystemIndex: () => {},
          addMarketData: () => {},
        },
      },
      applicationSettings: {
        defaultMaterialEfficiencyValue: RECALCULATING_USER.defaultME,
        defaultCitadelBrokersFee: 0,
        actions: {
          getDefaultCustomStructureWithJobType: () => ({
            id: RECALCULATING_USER.customStructureID,
            structureType: RECALCULATING_USER.structureID,
            rigType: RECALCULATING_USER.rigID,
            systemType: RECALCULATING_USER.systemTypeID,
            systemID: RECALCULATING_USER.systemID,
            tax: RECALCULATING_USER.taxValue,
          }),
          // Only the recalculating user's own structure resolves. The job's is
          // absent from their settings, which is exactly a member opening
          // another's job — and what makes stamping their id onto it a defect.
          findPredefinedSystemIndex: () => null,
          getCustomStructureWithID: (id) =>
            id === RECALCULATING_USER.customStructureID
              ? { id, tax: RECALCULATING_USER.taxValue }
              : null,
        },
      },
    }),
  },
}));

// The blueprints the recalculating user holds: none, which is what makes the derived ME fall back
// to their own default rather than the job's stored value.
vi.mock("../Hooks/EveEsi/useBlueprintIndex", () => ({
  BLUEPRINT_SCOPE: { ALL: "all" },
  getCachedBlueprintIndex: () => ({
    rows: [],
    byItemId: new Map(),
    byTypeId: new Map(),
  }),
}));

const { default: recalculateJobForNewTotal } =
  await import("../Functions/JobPlanner/recalculateJobForNewTotal");
const { default: Setup } = await import("../Classes/jobSetup");

const { default: Job } = await import("../Classes/job");

/** A job with one setup, built in a structure the recalculating user does not own. */
function jobBuiltByAnotherMember({ maxProductionLimit = 10, perRun = 1 } = {}) {
  const setup = new Setup({
    runCount: 5,
    jobCount: 1,
    ME: JOB_AS_BUILT.ME,
    TE: JOB_AS_BUILT.TE,
    structureID: JOB_AS_BUILT.structureID,
    rigID: JOB_AS_BUILT.rigID,
    systemTypeID: JOB_AS_BUILT.systemTypeID,
    systemID: JOB_AS_BUILT.systemID,
    taxValue: JOB_AS_BUILT.taxValue,
    customStructureID: JOB_AS_BUILT.customStructureID,
    characterToUse: JOB_AS_BUILT.character,
    jobType: 1,
  });

  // A real Job: recalculation reads activeSetup off it, and a plain object would
  // pass the tests while the app took a different path.
  const job = Object.create(Job.prototype);
  job.jobType = 1;
  job.blueprintTypeID = 1234;
  job.maxProductionLimit = maxProductionLimit;
  job.skills = [];
  job.rawData = {
    products: [{ quantity: perRun }],
    materials: [{ typeID: 34, quantity: 10 }],
    time: 100,
  };
  job.build = { setup: { [setup.id]: setup } };
  job.layout = { setupToEdit: setup.id };
  return job;
}

// A query client that holds nothing: the figures a setup derives from skills and
// prices are not what these tests are about, and an empty cache exercises the same
// paths the app takes before those queries resolve.
function emptyQueryClient() {
  return {
    getQueryState: () => undefined,
    getQueryData: () => undefined,
  };
}

function onlySetup(job) {
  const setups = Object.values(job.build.setup);
  expect(setups).toHaveLength(1);
  return setups[0];
}

describe("recalculating a job's setups", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // The job is made where it was made, by whoever it was made by, whatever the
  // recalculating user's own settings say.
  it("keeps the job's own build context", () => {
    const job = jobBuiltByAnotherMember();

    recalculateJobForNewTotal(job, 5, emptyQueryClient());

    const setup = onlySetup(job);
    expect(setup.customStructureID).toBe(JOB_AS_BUILT.customStructureID);
    expect(setup.structureID).toBe(JOB_AS_BUILT.structureID);
    expect(setup.rigID).toBe(JOB_AS_BUILT.rigID);
    expect(setup.systemTypeID).toBe(JOB_AS_BUILT.systemTypeID);
    expect(setup.systemID).toBe(JOB_AS_BUILT.systemID);
    expect(setup.taxValue).toBe(JOB_AS_BUILT.taxValue);
    expect(setup.selectedCharacter).toBe(JOB_AS_BUILT.character);
    expect(setup.ME).toBe(JOB_AS_BUILT.ME);
    expect(setup.TE).toBe(JOB_AS_BUILT.TE);
  });

  // A job with no setups has no context to keep, so it derives one. This is the
  // path every newly built job takes, and it must not change.
  it("derives a context for a job that has no setups yet", () => {
    const job = jobBuiltByAnotherMember();
    job.build.setup = {};
    job.layout.setupToEdit = null;

    recalculateJobForNewTotal(job, 5, emptyQueryClient());

    const setup = onlySetup(job);
    expect(setup.customStructureID).toBe(RECALCULATING_USER.customStructureID);
    expect(setup.structureID).toBe(RECALCULATING_USER.structureID);
    expect(setup.selectedCharacter).toBe(RECALCULATING_USER.mainCharacter);
    expect(setup.ME).toBe(RECALCULATING_USER.defaultME);
  });

  // The layout is the part recalculation is for, and it is correct today: a new
  // quantity produces a new split. Nothing about the fix may change this.
  it("splits a new quantity across setups by the job's max run limit", () => {
    const job = jobBuiltByAnotherMember({ maxProductionLimit: 10, perRun: 1 });

    recalculateJobForNewTotal(job, 25, emptyQueryClient());

    const setups = Object.values(job.build.setup);
    const totalRuns = setups.reduce(
      (sum, s) => sum + s.runCount * s.jobCount,
      0,
    );
    expect(totalRuns).toBe(25);
    expect(setups.length).toBeGreaterThan(1);
  });

  it("points the editor at the first setup of the new layout", () => {
    const job = jobBuiltByAnotherMember();

    recalculateJobForNewTotal(job, 25, emptyQueryClient());

    expect(job.layout.setupToEdit).toBe(Object.keys(job.build.setup)[0]);
  });

  // The group template path: buildJob restores setups from a saved template, then
  // recalculates if the quantity differs. What the template supplied has to
  // survive that, or a saved template silently does not apply.
  it("keeps a restored template's context when the quantity differs", () => {
    const job = jobBuiltByAnotherMember({ maxProductionLimit: 10, perRun: 1 });
    const restored = onlySetup(job);
    expect(restored.customStructureID).toBe(JOB_AS_BUILT.customStructureID);

    recalculateJobForNewTotal(job, 7, emptyQueryClient());

    expect(onlySetup(job).customStructureID).toBe(
      JOB_AS_BUILT.customStructureID,
    );
  });

  // A quantity that needs more setups than the job has: whatever the fix does
  // about context, every setup in the new layout has to be given one.
  it("gives every setup in a larger layout the same build context", () => {
    const job = jobBuiltByAnotherMember({ maxProductionLimit: 10, perRun: 1 });

    recalculateJobForNewTotal(job, 25, emptyQueryClient());

    const setups = Object.values(job.build.setup);
    expect(setups.length).toBeGreaterThan(1);
    const contexts = new Set(
      setups.map((setup) =>
        [
          setup.customStructureID,
          setup.structureID,
          setup.ME,
          setup.selectedCharacter,
        ].join("|"),
      ),
    );
    expect(contexts.size).toBe(1);
  });

  // The alternative system index is a per-setup override a user set deliberately,
  // so it belongs to the job rather than to whoever recalculates it.
  it("keeps a setup's alternative system index override", () => {
    const job = jobBuiltByAnotherMember();
    const setup = onlySetup(job);
    setup.useAlternativeSystemIndexValue = true;
    setup.alternativeSystemIndexValue = 0.042;

    recalculateJobForNewTotal(job, 5, emptyQueryClient());

    const rebuilt = onlySetup(job);
    expect(rebuilt.useAlternativeSystemIndexValue).toBe(true);
    expect(rebuilt.alternativeSystemIndexValue).toBe(0.042);
  });

  // The layout is chosen by a calculator, and a second one exists for splitting a
  // total across the blueprint originals a user owns. It is selectable rather
  // than the default, so nothing changes for callers that do not ask for it.
  it("takes the layout from the calculator it is given", () => {
    const job = jobBuiltByAnotherMember({ maxProductionLimit: 10, perRun: 1 });
    const calculateSetupQuantities = vi.fn(() => [
      { runCount: 3, jobCount: 1 },
      { runCount: 3, jobCount: 1 },
    ]);

    recalculateJobForNewTotal(job, 6, emptyQueryClient(), {
      calculateSetupQuantities,
    });

    expect(calculateSetupQuantities).toHaveBeenCalledOnce();
    const setups = Object.values(job.build.setup);
    expect(setups).toHaveLength(2);
    // Still the job's context, whichever calculator produced the layout.
    expect(
      setups.every(
        (s) => s.customStructureID === JOB_AS_BUILT.customStructureID,
      ),
    ).toBe(true);
  });

  it("recomputes the derived figures rather than carrying them", () => {
    const job = jobBuiltByAnotherMember();
    const before = onlySetup(job);
    before.materialCount = {
      34: { typeID: 34, quantity: 999999, rawQuantity: 999999 },
      35: { typeID: 35, quantity: 1, rawQuantity: 1 },
    };
    before.estimatedTime = 123456;
    before.estimatedInstallCost = 987654;

    recalculateJobForNewTotal(job, 5, emptyQueryClient());

    // The material count is the blueprint's list, not the previous setup's.
    const rebuilt = onlySetup(job);
    expect(rebuilt.materialCount[34].rawQuantity).toBe(10);
    expect(rebuilt.materialCount[35]).toBeUndefined();
    expect(rebuilt.estimatedTime).not.toBe(123456);
    expect(rebuilt.estimatedInstallCost).not.toBe(987654);
  });

  it("leaves the setup it was built from untouched", () => {
    const job = jobBuiltByAnotherMember();
    const before = onlySetup(job);
    before.materialCount = {
      34: { typeID: 34, quantity: 999999, rawQuantity: 999999 },
    };

    recalculateJobForNewTotal(job, 5, emptyQueryClient());

    expect(before.materialCount[34].quantity).toBe(999999);
  });

  it("does not let one rebuilt setup rewrite another's quantities", () => {
    const job = jobBuiltByAnotherMember({ maxProductionLimit: 10, perRun: 1 });

    recalculateJobForNewTotal(job, 6, emptyQueryClient(), {
      calculateSetupQuantities: () => [
        { runCount: 2, jobCount: 1 },
        { runCount: 4, jobCount: 1 },
      ],
    });

    const [first, second] = Object.values(job.build.setup);
    expect(first.materialCount[34]).not.toBe(second.materialCount[34]);
    expect(first.materialCount[34].quantity).not.toBe(
      second.materialCount[34].quantity,
    );
  });

  it("does nothing without a job or a quantity", () => {
    const job = jobBuiltByAnotherMember();
    const before = Object.keys(job.build.setup);

    recalculateJobForNewTotal(job, 0, emptyQueryClient());
    recalculateJobForNewTotal(null, 5, emptyQueryClient());

    expect(Object.keys(job.build.setup)).toEqual(before);
  });
});

describe("adding a setup to a job that already has one", () => {
  // A second setup on a job is another run of the same production line, so it is
  // made where the first one is made.
  it("copies the build context of the setup being edited", async () => {
    const existing = new Setup({
      runCount: 5,
      jobCount: 1,
      ME: JOB_AS_BUILT.ME,
      TE: JOB_AS_BUILT.TE,
      structureID: JOB_AS_BUILT.structureID,
      rigID: JOB_AS_BUILT.rigID,
      systemTypeID: JOB_AS_BUILT.systemTypeID,
      systemID: JOB_AS_BUILT.systemID,
      taxValue: JOB_AS_BUILT.taxValue,
      customStructureID: JOB_AS_BUILT.customStructureID,
      characterToUse: JOB_AS_BUILT.character,
      jobType: 1,
    });

    const job = Object.create(Job.prototype);
    job.jobType = 1;
    job.blueprintTypeID = 1234;
    job.maxProductionLimit = 10;
    job.skills = [];
    job.rawData = { products: [{ quantity: 1 }], materials: [], time: 100 };
    job.build = { setup: { [existing.id]: existing } };
    job.layout = { setupToEdit: existing.id };

    job.addNewSetup(emptyQueryClient());

    const added = Object.values(job.build.setup).find(
      (s) => s.id !== existing.id,
    );
    expect(added).toBeDefined();
    expect(added.customStructureID).toBe(JOB_AS_BUILT.customStructureID);
    expect(added.structureID).toBe(JOB_AS_BUILT.structureID);
    expect(added.ME).toBe(JOB_AS_BUILT.ME);
    expect(added.selectedCharacter).toBe(JOB_AS_BUILT.character);
    // Sized for one run, though the setup it copies is set to five.
    expect(added.runCount).toBe(1);
    expect(added.jobCount).toBe(1);
  });
});

describe("building a job for the first time", () => {
  // buildJob passes the system and character a build request named. Those are an
  // explicit choice for this job, so they outrank both the inherited context and
  // the current settings.
  it("lets a build request outrank the setup it is based on", async () => {
    const {
      buildSetupContextForJob,
      buildSetupFromQuantity,
      setupQuantitiesForTotal,
    } = await import("../Functions/JobPlanner/setupBuildHelpers");

    const existing = new Setup({
      runCount: 1,
      jobCount: 1,
      systemID: JOB_AS_BUILT.systemID,
      customStructureID: JOB_AS_BUILT.customStructureID,
      characterToUse: JOB_AS_BUILT.character,
      jobType: 1,
    });

    const job = {
      jobType: 1,
      blueprintTypeID: 1234,
      maxProductionLimit: 10,
      skills: [],
      rawData: { products: [{ quantity: 1 }], materials: [], time: 100 },
      build: { setup: {} },
      layout: { setupToEdit: null },
    };

    const context = buildSetupContextForJob(job, emptyQueryClient());
    const setup = buildSetupFromQuantity(
      job,
      setupQuantitiesForTotal(job, 1, emptyQueryClient())[0],
      emptyQueryClient(),
      context,
      {
        basedOn: existing,
        overrides: {
          systemID: 30000001,
          characterToUse: "hash-from-the-build-request",
        },
      },
    );

    expect(setup.systemID).toBe(30000001);
    expect(setup.selectedCharacter).toBe("hash-from-the-build-request");
    // What the request did not name still comes from the inherited context.
    expect(setup.customStructureID).toBe(JOB_AS_BUILT.customStructureID);
  });

  it("restores a stored template row through the same builder", async () => {
    const { buildSetupContextForJob, buildSetupFromQuantity } =
      await import("../Functions/JobPlanner/setupBuildHelpers");

    const job = {
      jobType: 1,
      blueprintTypeID: 1234,
      maxProductionLimit: 10,
      skills: [],
      rawData: { products: [{ quantity: 1 }], materials: [], time: 100 },
      build: { setup: {} },
      layout: { setupToEdit: null },
    };

    const row = {
      runCount: 5,
      jobCount: 2,
      ME: 8,
      TE: 14,
      rigID: 3,
      structureID: 7,
      systemTypeID: 2,
      systemID: JOB_AS_BUILT.systemID,
      taxValue: 0.1,
      customStructureID: JOB_AS_BUILT.customStructureID,
      characterToUse: JOB_AS_BUILT.character,
    };

    const context = buildSetupContextForJob(job, emptyQueryClient());
    const setup = buildSetupFromQuantity(
      job,
      { runCount: row.runCount, jobCount: row.jobCount },
      emptyQueryClient(),
      context,
      { overrides: row },
    );

    expect(setup.runCount).toBe(5);
    expect(setup.jobCount).toBe(2);
    expect(setup.ME).toBe(8);
    expect(setup.structureID).toBe(7);
    expect(setup.taxValue).toBe(0.1);
    expect(setup.customStructureID).toBe(JOB_AS_BUILT.customStructureID);
    // The row names the character under the stored field's other name.
    expect(setup.selectedCharacter).toBe(JOB_AS_BUILT.character);
  });
});

// Every efficiency field in the editor recalculates the setup in place rather
// than rebuilding the job's layout, so this is the path an edit actually takes.
describe("recalculating one setup in place", () => {
  it("recomputes its materials from the blueprint's list", () => {
    const job = jobBuiltByAnotherMember();
    const setup = onlySetup(job);
    job.recalculateSelectedSetup(setup.id, emptyQueryClient());
    const atFullEfficiency = setup.materialCount[34].quantity;

    setup.updateMEValue(0);
    job.recalculateSelectedSetup(setup.id, emptyQueryClient());

    // Rebuilt from the blueprint's list, so the map holds exactly its rows.
    expect(Object.keys(setup.materialCount)).toEqual(["34"]);
    expect(setup.materialCount[34].rawQuantity).toBe(10);
    expect(setup.materialCount[34].quantity).toBeGreaterThan(atFullEfficiency);
  });

  it("takes the system index values it is given", async () => {
    const { default: findSystemIndexForJob } =
      await import("../Functions/Helper/findSystemIndexValue");
    const job = jobBuiltByAnotherMember();
    const setup = onlySetup(job);
    const additionalSystemIndexValues = {
      [JOB_AS_BUILT.systemID]: { manufacturing: 0.5 },
    };

    job.recalculateSelectedSetup(
      setup.id,
      emptyQueryClient(),
      undefined,
      additionalSystemIndexValues,
    );

    // The install cost these feed is NaN for a material with no adjusted price,
    // so assert the lookup they are passed to rather than the figure.
    expect(findSystemIndexForJob(setup.systemID, setup.jobType)).toBe(0);
    expect(
      findSystemIndexForJob(
        setup.systemID,
        setup.jobType,
        false,
        0,
        additionalSystemIndexValues,
      ),
    ).toBe(0.5);
  });
});

describe("calculating materials for a job type", () => {
  it("gives a reaction no structure bonus", () => {
    const fields = {
      runCount: 5,
      jobCount: 1,
      ME: 10,
      structureID: JOB_AS_BUILT.structureID,
      rigID: JOB_AS_BUILT.rigID,
      systemTypeID: JOB_AS_BUILT.systemTypeID,
      systemID: JOB_AS_BUILT.systemID,
    };
    const raw = [{ typeID: 34, quantity: 100 }];

    const manufacturing = new Setup({ ...fields, jobType: 1 });
    const reaction = new Setup({ ...fields, jobType: 2 });

    manufacturing.recalculate(raw, [], emptyQueryClient());
    reaction.recalculate(raw, [], emptyQueryClient());

    // The reaction formula reads neither the structure bonus nor ME, so it
    // cannot land on the manufacturing figure for the same fields.
    expect(reaction.materialCount[34].quantity).toBeGreaterThan(
      manufacturing.materialCount[34].quantity,
    );
    expect(reaction.materialCount[34].rawQuantity).toBe(100);
  });

  it("passes raw quantities through for a job type with no formula", async () => {
    const { default: materialQuantitiesForSetup } =
      await import("../Functions/Blueprint Calculations/calculateMaterialsForSetup");
    const setup = new Setup({ runCount: 5, jobCount: 2, jobType: 0 });

    const materials = materialQuantitiesForSetup(setup, [
      { typeID: 34, quantity: 100 },
    ]);

    expect(materials[34].quantity).toBe(100);
    expect(materials[34].rawQuantity).toBe(100);
  });
});
