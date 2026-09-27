import { beforeEach, describe, expect, it, vi } from "vitest";

const RECALCULATING_USER = {
  customStructureID: "manufacturing-theirs",
  structureID: 35827,
  rigSlot1: 37158,
  systemTypeID: 30000142,
  systemID: 30000142,
  taxValue: 0.1,
  mainCharacter: "hash-of-the-recalculating-user",
  defaultME: 5,
};

const JOB_AS_BUILT = {
  customStructureID: "manufacturing-the-jobs-own",
  structureID: 35825,
  rigSlot1: 37155,
  systemTypeID: 30002187,
  systemID: 30002187,
  taxValue: 0.25,
  character: "hash-of-whoever-built-the-job",
  ME: 10,
  TE: 20,
};

vi.mock("../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("./usersStoreHarness.js");
  return usersStoreMock(() =>
    usersStoreState({
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
        systemIndexes: {},
        actions: {
          findSystemIndex: (systemID, alternativeLocation) =>
            alternativeLocation?.[systemID] ?? null,
          addSystemIndex: () => {},
        },
      },
      applicationSettings: {
        defaultMaterialEfficiencyValue: RECALCULATING_USER.defaultME,
        defaultCitadelBrokersFee: 0,
        actions: {
          getDefaultCustomStructureWithJobType: () => ({
            id: RECALCULATING_USER.customStructureID,
            structureType: RECALCULATING_USER.structureID,
            rigSlot1: RECALCULATING_USER.rigSlot1,
            rigSlot2: 0,
            systemType: RECALCULATING_USER.systemTypeID,
            systemID: RECALCULATING_USER.systemID,
            tax: RECALCULATING_USER.taxValue,
          }),
          findPredefinedSystemIndex: () => null,
          getCustomStructureWithID: (id) =>
            id === RECALCULATING_USER.customStructureID
              ? { id, tax: RECALCULATING_USER.taxValue }
              : null,
        },
      },
    }),
  );
});

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

function jobBuiltByAnotherMember({ maxProductionLimit = 10, perRun = 1 } = {}) {
  const setup = new Setup({
    runCount: 5,
    jobCount: 1,
    ME: JOB_AS_BUILT.ME,
    TE: JOB_AS_BUILT.TE,
    structureID: JOB_AS_BUILT.structureID,
    rigSlot1: JOB_AS_BUILT.rigSlot1,
    systemTypeID: JOB_AS_BUILT.systemTypeID,
    systemID: JOB_AS_BUILT.systemID,
    taxValue: JOB_AS_BUILT.taxValue,
    customStructureID: JOB_AS_BUILT.customStructureID,
    characterToUse: JOB_AS_BUILT.character,
    jobType: 1,
  });

  const job = {};
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

  it("keeps the job's own build context", () => {
    const job = jobBuiltByAnotherMember();

    recalculateJobForNewTotal(job, 5, emptyQueryClient());

    const setup = onlySetup(job);
    expect(setup.customStructureID).toBe(JOB_AS_BUILT.customStructureID);
    expect(setup.structureID).toBe(JOB_AS_BUILT.structureID);
    expect(setup.rigSlot1).toBe(JOB_AS_BUILT.rigSlot1);
    expect(setup.systemTypeID).toBe(JOB_AS_BUILT.systemTypeID);
    expect(setup.systemID).toBe(JOB_AS_BUILT.systemID);
    expect(setup.taxValue).toBe(JOB_AS_BUILT.taxValue);
    expect(setup.selectedCharacter).toBe(JOB_AS_BUILT.character);
    expect(setup.ME).toBe(JOB_AS_BUILT.ME);
    expect(setup.TE).toBe(JOB_AS_BUILT.TE);
  });

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

  it("keeps a restored template's context when the quantity differs", () => {
    const job = jobBuiltByAnotherMember({ maxProductionLimit: 10, perRun: 1 });
    const restored = onlySetup(job);
    expect(restored.customStructureID).toBe(JOB_AS_BUILT.customStructureID);

    recalculateJobForNewTotal(job, 7, emptyQueryClient());

    expect(onlySetup(job).customStructureID).toBe(
      JOB_AS_BUILT.customStructureID,
    );
  });

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
    expect(
      setups.every(
        (s) => s.customStructureID === JOB_AS_BUILT.customStructureID,
      ),
    ).toBe(true);
  });

  it("rebuilds the material count rather than carrying it", () => {
    const job = jobBuiltByAnotherMember();
    const before = onlySetup(job);
    before.materialCount = {
      34: { typeID: 34, quantity: 999999, rawQuantity: 999999 },
      35: { typeID: 35, quantity: 1, rawQuantity: 1 },
    };

    recalculateJobForNewTotal(job, 5, emptyQueryClient());

    const rebuilt = onlySetup(job);
    expect(rebuilt.materialCount[34].rawQuantity).toBe(10);
    expect(rebuilt.materialCount[35]).toBeUndefined();
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
  it("copies the build context of the setup being edited", async () => {
    const existing = new Setup({
      runCount: 5,
      jobCount: 1,
      ME: JOB_AS_BUILT.ME,
      TE: JOB_AS_BUILT.TE,
      structureID: JOB_AS_BUILT.structureID,
      rigSlot1: JOB_AS_BUILT.rigSlot1,
      systemTypeID: JOB_AS_BUILT.systemTypeID,
      systemID: JOB_AS_BUILT.systemID,
      taxValue: JOB_AS_BUILT.taxValue,
      customStructureID: JOB_AS_BUILT.customStructureID,
      characterToUse: JOB_AS_BUILT.character,
      jobType: 1,
    });

    const job = {};
    job.jobType = 1;
    job.blueprintTypeID = 1234;
    job.maxProductionLimit = 10;
    job.skills = [];
    job.rawData = { products: [{ quantity: 1 }], materials: [], time: 100 };
    job.build = { setup: { [existing.id]: existing } };
    job.layout = { setupToEdit: existing.id };

    const { buildSetupFromQuantity, buildSetupContextForJob } =
      await import("../Functions/JobPlanner/setupBuildHelpers");
    const { setupToBuildFrom } =
      await import("../Components/Edit Job/Edit Job Hooks/jobSelectors");
    const { attachNewSetupToJob } =
      await import("../Components/Edit Job/Edit Job Hooks/jobCommands");

    const client = emptyQueryClient();
    const document = {
      build: { setup: { ...job.build.setup } },
      layout: { ...job.layout },
    };
    attachNewSetupToJob(
      buildSetupFromQuantity(
        job,
        { runCount: 1, jobCount: 1 },
        client,
        buildSetupContextForJob(job, client),
        { basedOn: setupToBuildFrom(job) },
      ),
    ).recipe(document);

    const added = Object.values(document.build.setup).find(
      (setup) => setup.id !== existing.id,
    );

    expect(Object.keys(document.build.setup)).toHaveLength(2);
    expect(document.layout.setupToEdit).toBe(added.id);
    expect(added.customStructureID).toBe(JOB_AS_BUILT.customStructureID);
    expect(added.structureID).toBe(JOB_AS_BUILT.structureID);
    expect(added.ME).toBe(JOB_AS_BUILT.ME);
    expect(added.selectedCharacter).toBe(JOB_AS_BUILT.character);
    expect(added.runCount).toBe(1);
    expect(added.jobCount).toBe(1);
  });
});

describe("building a job for the first time", () => {
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
      rigSlot1: 3,
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
    expect(setup.selectedCharacter).toBe(JOB_AS_BUILT.character);
  });
});

describe("recalculating one setup in place", () => {
  it("recomputes its materials from the blueprint's list", async () => {
    const { recalculateSetupMaterials } =
      await import("../Functions/JobPlanner/setupBuildHelpers");
    const job = jobBuiltByAnotherMember();
    const setupID = onlySetup(job).id;

    recalculateSetupMaterials(job, setupID);
    const atFullEfficiency =
      job.build.setup[setupID].materialCount[34].quantity;

    job.build.setup[setupID].ME = 0;
    recalculateSetupMaterials(job, setupID);

    const row = job.build.setup[setupID];
    expect(Object.keys(row.materialCount)).toEqual(["34"]);
    expect(row.materialCount[34].rawQuantity).toBe(10);
    expect(row.materialCount[34].quantity).toBeGreaterThan(atFullEfficiency);
  });
});

describe("calculating materials for a job type", () => {
  it("gives a reaction no structure bonus", () => {
    const fields = {
      runCount: 5,
      jobCount: 1,
      ME: 10,
      structureID: JOB_AS_BUILT.structureID,
      rigSlot1: JOB_AS_BUILT.rigSlot1,
      systemTypeID: JOB_AS_BUILT.systemTypeID,
      systemID: JOB_AS_BUILT.systemID,
    };
    const raw = [{ typeID: 34, quantity: 100 }];

    const manufacturing = new Setup({ ...fields, jobType: 1 });
    const reaction = new Setup({ ...fields, jobType: 2 });

    manufacturing.recalculateMaterials(raw);
    reaction.recalculateMaterials(raw);

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
