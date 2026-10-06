import { beforeEach, describe, expect, it, vi } from "vitest";

import { jobTypes } from "../../Context/defaultValues";

const fetched = [];
const saved = [];
let nextResponse = null;
let nextError = null;

vi.mock("../../Functions/Endpoints/Private/planners.js", () => ({
  fetchPlannerSettingsFromApi: async (handle) => {
    fetched.push(handle);
    if (nextError) throw nextError;
    return nextResponse;
  },
  savePlannerSettingsToApi: async (handle, update) => {
    saved.push({ handle, update });
    if (nextError) throw nextError;
    return nextResponse;
  },
}));

const { default: useUsersStore } = await import("../usersStore.js");
const {
  extrasCategoriesDefault,
  defaultPlannerReprocessingSettings,
  compressedOreChoices,
  shippingModes,
} = await import("../../Context/defaultValues.jsx");

const OWNER = "corporation:98000001";

function aSharedMarket() {
  return {
    id: "mkt-1",
    name: "Perimeter Azbel",
    regionID: 10000002,
    structureID: 1035466617946,
    sharedWithMembers: true,
  };
}

function actions() {
  return useUsersStore.getState().plannerSettings.actions;
}

/** Holds a planner's settings, as a completed read does. */
function hold(owner) {
  actions().setPlannerSettings(
    owner,
    { extrasCategories: [...extrasCategoriesDefault] },
    true,
  );
}

describe("planner settings slice", () => {
  beforeEach(() => {
    fetched.length = 0;
    saved.length = 0;
    nextResponse = null;
    nextError = null;
    actions().resetPlannerSettingsStore();
    useUsersStore.getState().account.actions.setLoggedIn(true);
  });

  it("falls back to defaults for a planner it has not read", () => {
    const settings = actions().getPlannerSettings(OWNER);
    expect(settings.extrasCategories.length).toBeGreaterThan(0);
    expect(actions().isPlannerSeeded(OWNER)).toBe(false);
  });

  it("holds settings per owner, so one planner does not overwrite another", () => {
    actions().setPlannerSettings(
      OWNER,
      { extrasCategories: [{ id: "a", label: "Freight" }] },
      true,
    );
    actions().setPlannerSettings(
      "account:acct-1",
      { extrasCategories: [{ id: "b", label: "Fees" }] },
      true,
    );

    expect(actions().getPlannerSettings(OWNER).extrasCategories).toEqual([
      { id: "a", label: "Freight" },
    ]);
    expect(
      actions().getPlannerSettings("account:acct-1").extrasCategories,
    ).toEqual([{ id: "b", label: "Fees" }]);
  });

  it("reads a planner's settings and records that they are its own", async () => {
    nextResponse = {
      owner: OWNER,
      seeded: true,
      settings: { defaultCitadelBrokersFee: 3 },
    };

    await actions().loadPlannerSettings(OWNER);

    expect(fetched).toEqual([OWNER]);
    expect(actions().getPlannerSettings(OWNER).defaultCitadelBrokersFee).toBe(
      3,
    );
    expect(actions().isPlannerSeeded(OWNER)).toBe(true);
  });

  it("keeps defaults for fields the server omits", async () => {
    nextResponse = { owner: OWNER, seeded: true, settings: {} };

    await actions().loadPlannerSettings(OWNER);

    const settings = actions().getPlannerSettings(OWNER);
    expect(settings.defaultCitadelBrokersFee).toBe(1);
    expect(settings.customStructures).toEqual([]);
    expect(settings.extrasCategories.length).toBeGreaterThan(0);
  });

  it("records an unseeded planner as falling back", async () => {
    nextResponse = { owner: OWNER, seeded: false, settings: {} };

    await actions().loadPlannerSettings(OWNER);

    expect(actions().isPlannerSeeded(OWNER)).toBe(false);
  });

  it("reports a failed read rather than holding defaults as if they were read", async () => {
    nextError = new Error("network");

    await expect(actions().loadPlannerSettings(OWNER)).rejects.toThrow(
      "network",
    );
    expect(actions().isPlannerSeeded(OWNER)).toBe(false);
  });

  it("adds a category to one planner and leaves another's alone", () => {
    const other = "account:acct-1";
    hold(OWNER);
    actions().addPlannerExtrasCategory(OWNER, { id: "a", label: "Freight" });

    const added = actions()
      .getPlannerSettings(OWNER)
      .extrasCategories.find((entry) => entry.id === "a");
    expect(added).toEqual({
      id: "a",
      label: "Freight",
      deleted: false,
      deletedAt: null,
    });
    expect(
      actions()
        .getPlannerSettings(other)
        .extrasCategories.some((entry) => entry.id === "a"),
    ).toBe(false);
  });

  it("marks a category deleted and brings it back", () => {
    hold(OWNER);
    actions().addPlannerExtrasCategory(OWNER, { id: "a", label: "Freight" });

    actions().setPlannerExtrasCategoryDeleted(OWNER, "a", true);
    const deleted = actions()
      .getPlannerSettings(OWNER)
      .extrasCategories.find((entry) => entry.id === "a");
    expect(deleted.deleted).toBe(true);
    expect(deleted.deletedAt).toEqual(expect.any(String));

    actions().setPlannerExtrasCategoryDeleted(OWNER, "a", false);
    const restored = actions()
      .getPlannerSettings(OWNER)
      .extrasCategories.find((entry) => entry.id === "a");
    expect(restored.deleted).toBe(false);
    expect(restored.deletedAt).toBeNull();
  });

  it("refuses to delete a category costs are filed under by default", () => {
    hold(OWNER);
    actions().setPlannerExtrasCategoryDeleted(OWNER, "0", true);
    actions().setPlannerExtrasCategoryDeleted(OWNER, "5", true);

    const permanent = actions()
      .getPlannerSettings(OWNER)
      .extrasCategories.filter((entry) => ["0", "5"].includes(entry.id));
    expect(permanent).toHaveLength(2);
    expect(permanent.every((entry) => !entry.deleted)).toBe(true);
  });

  it("sends only the categories, and holds what came back", async () => {
    hold(OWNER);
    actions().addPlannerExtrasCategory(OWNER, { id: "a", label: "Freight" });
    nextResponse = {
      owner: OWNER,
      seeded: true,
      settings: { extrasCategories: [{ id: "a", label: "Freight (renamed)" }] },
    };

    await actions().savePlannerSettings(OWNER);

    expect(saved).toHaveLength(1);
    expect(saved[0].handle).toBe(OWNER);
    expect(Object.keys(saved[0].update)).toEqual(["extrasCategories"]);
    expect(actions().getPlannerSettings(OWNER).extrasCategories).toEqual([
      { id: "a", label: "Freight (renamed)" },
    ]);
  });

  it("refuses an edit to a planner whose settings have not arrived", () => {
    actions().addPlannerExtrasCategory(OWNER, { id: "a", label: "Freight" });

    expect(
      actions()
        .getPlannerSettings(OWNER)
        .extrasCategories.some((entry) => entry.id === "a"),
    ).toBe(false);
  });

  it("refuses a category with no label to show", () => {
    hold(OWNER);
    const before = actions().getPlannerSettings(OWNER).extrasCategories.length;

    actions().addPlannerExtrasCategory(OWNER, { id: "a", label: "   " });
    actions().addPlannerExtrasCategory(OWNER, { id: "b" });
    actions().addPlannerExtrasCategory(OWNER, { label: "No id" });

    expect(actions().getPlannerSettings(OWNER).extrasCategories).toHaveLength(
      before,
    );
  });

  it("sends nothing for a planner whose settings have not arrived", async () => {
    await actions().savePlannerSettings(OWNER);

    expect(saved).toEqual([]);
  });

  it("does not let a read overwrite an edit the server has not taken", async () => {
    hold(OWNER);
    actions().addPlannerExtrasCategory(OWNER, { id: "a", label: "Freight" });
    expect(actions().hasUnsavedPlannerSettings(OWNER)).toBe(true);

    nextResponse = {
      owner: OWNER,
      seeded: true,
      settings: { extrasCategories: [{ id: "0", label: "Unassigned" }] },
    };
    await actions().loadPlannerSettings(OWNER);

    expect(
      actions()
        .getPlannerSettings(OWNER)
        .extrasCategories.some((entry) => entry.id === "a"),
    ).toBe(true);
  });

  it("takes a read again once the edit has been saved", async () => {
    hold(OWNER);
    actions().addPlannerExtrasCategory(OWNER, { id: "a", label: "Freight" });

    nextResponse = {
      owner: OWNER,
      seeded: true,
      settings: { extrasCategories: [{ id: "a", label: "Freight" }] },
    };
    await actions().savePlannerSettings(OWNER);
    expect(actions().hasUnsavedPlannerSettings(OWNER)).toBe(false);

    nextResponse = {
      owner: OWNER,
      seeded: true,
      settings: { extrasCategories: [{ id: "b", label: "From elsewhere" }] },
    };
    await actions().loadPlannerSettings(OWNER);

    expect(actions().getPlannerSettings(OWNER).extrasCategories).toEqual([
      { id: "b", label: "From elsewhere" },
    ]);
  });

  it("keeps an edit held when the write fails", async () => {
    hold(OWNER);
    actions().addPlannerExtrasCategory(OWNER, { id: "a", label: "Freight" });
    nextError = new Error("refused");

    await expect(actions().savePlannerSettings(OWNER)).rejects.toThrow(
      "refused",
    );

    expect(actions().hasUnsavedPlannerSettings(OWNER)).toBe(true);
    expect(
      actions()
        .getPlannerSettings(OWNER)
        .extrasCategories.some((entry) => entry.id === "a"),
    ).toBe(true);
  });

  it("writes nothing for a signed-out user", async () => {
    hold(OWNER);
    useUsersStore.getState().account.actions.setLoggedIn(false);

    await actions().savePlannerSettings(OWNER);

    expect(saved).toEqual([]);
  });

  it("sends only the settings this session edited", async () => {
    hold(OWNER);
    actions().writePlannerMarketLocations(OWNER, () => [aSharedMarket()]);
    nextResponse = { owner: OWNER, seeded: true, settings: {} };

    await actions().savePlannerSettings(OWNER);

    expect(Object.keys(saved[0].update)).toEqual(["marketLocations"]);
  });

  it("sends both settings when both were edited", async () => {
    hold(OWNER);
    actions().addPlannerExtrasCategory(OWNER, { id: "a", label: "Freight" });
    actions().writePlannerMarketLocations(OWNER, () => [aSharedMarket()]);
    nextResponse = { owner: OWNER, seeded: true, settings: {} };

    await actions().savePlannerSettings(OWNER);

    expect(Object.keys(saved[0].update).sort()).toEqual([
      "extrasCategories",
      "marketLocations",
    ]);
  });

  it("sends nothing for a planner nothing was edited on", async () => {
    hold(OWNER);

    await actions().savePlannerSettings(OWNER);

    expect(saved).toEqual([]);
  });

  it("changes an organisation's markets", () => {
    hold(OWNER);

    actions().writePlannerMarketLocations(OWNER, () => [aSharedMarket()]);

    const lane = actions().getPlannerSettings(OWNER).marketLocations;
    expect(lane).toHaveLength(1);
    expect(lane[0].id).toBe("mkt-1");
    expect(actions().hasUnsavedPlannerSettings(OWNER)).toBe(true);
  });

  it("refuses a market edit to a planner whose settings have not arrived", () => {
    actions().writePlannerMarketLocations(OWNER, () => [aSharedMarket()]);

    expect(actions().getPlannerSettings(OWNER).marketLocations).toEqual([]);
  });

  it("leaves the account's own application settings untouched", async () => {
    const before =
      useUsersStore.getState().applicationSettings.extrasCategories;
    nextResponse = {
      owner: OWNER,
      seeded: true,
      settings: { extrasCategories: [{ id: "a", label: "Freight" }] },
    };

    await actions().loadPlannerSettings(OWNER);

    expect(useUsersStore.getState().applicationSettings.extrasCategories).toBe(
      before,
    );
  });

  it("holds exemptTypeIDs as a Set, as the account's own settings do", async () => {
    nextResponse = {
      owner: OWNER,
      seeded: true,
      settings: { exemptTypeIDs: [34, 35] },
    };

    await actions().loadPlannerSettings(OWNER);

    const held = actions().getPlannerSettings(OWNER).exemptTypeIDs;
    expect(held).toBeInstanceOf(Set);
    expect([...held]).toEqual([34, 35]);
  });

  it("reads structure rows as plain data, settled for their kind", async () => {
    nextResponse = {
      owner: OWNER,
      seeded: true,
      settings: {
        customStructures: [
          { id: "s1", jobType: jobTypes.manufacturing, name: "Raitaru" },
          { id: "s2", jobType: jobTypes.reprocessing, name: "Athanor" },
        ],
      },
    };

    await actions().loadPlannerSettings(OWNER);

    const structures = actions().getPlannerSettings(OWNER).customStructures;
    expect(structures).toHaveLength(2);
    for (const structure of structures) {
      expect(Object.getPrototypeOf(structure)).toBe(Object.prototype);
      expect(structure.default).toBe(false);
      expect(structure.rigSlot1).toBe(0);
      expect(structure.rigSlot2).toBe(0);
    }
    expect(structures[0].systemID).toBeDefined();
    expect(structures[1].implant).toBe(0);
  });

  it("reads a document still storing the four lists", async () => {
    nextResponse = {
      owner: OWNER,
      seeded: true,
      settings: {
        customStructures: {
          manufacturing: [{ id: "s1", name: "Raitaru" }],
          reprocessing: [{ id: "s2", name: "Athanor" }],
        },
      },
    };

    await actions().loadPlannerSettings(OWNER);

    const structures = actions().getPlannerSettings(OWNER).customStructures;
    expect(structures).toHaveLength(2);
    expect(structures.map((s) => s.jobType)).toEqual([
      jobTypes.manufacturing,
      jobTypes.reprocessing,
    ]);
  });

  it("resets every planner on sign-out", () => {
    actions().setPlannerSettings(OWNER, { defaultCitadelBrokersFee: 5 }, true);
    expect(actions().isPlannerSeeded(OWNER)).toBe(true);

    actions().resetPlannerSettingsStore();

    expect(actions().isPlannerSeeded(OWNER)).toBe(false);
    expect(actions().getPlannerSettings(OWNER).defaultCitadelBrokersFee).toBe(
      1,
    );
  });

  it("reads nothing for a signed-out user rather than firing a private request", async () => {
    useUsersStore.getState().account.actions.setLoggedIn(false);

    const result = await actions().loadPlannerSettings(OWNER);

    expect(result).toBeNull();
    expect(fetched).toEqual([]);
  });

  it("answers defaults with no owner at all, which is the signed-out case", () => {
    const settings = actions().getPlannerSettings(null);

    expect(settings.extrasCategories).toEqual(extrasCategoriesDefault);
    expect(settings.defaultCitadelBrokersFee).toBe(1);
  });
});

describe("a planner's reprocessing settings", () => {
  beforeEach(() => {
    saved.length = 0;
    nextResponse = null;
    nextError = null;
    actions().resetPlannerSettingsStore();
    useUsersStore.getState().account.actions.setLoggedIn(true);
  });

  it("read as the defaults for a planner that stores none", () => {
    actions().setPlannerSettings(OWNER, {}, true);

    expect(actions().getPlannerSettings(OWNER).reprocessingSettings).toEqual(
      defaultPlannerReprocessingSettings(),
    );
  });

  it("read what the planner stores, with an omitted switch or amount as off or zero", () => {
    actions().setPlannerSettings(
      OWNER,
      {
        reprocessingSettings: {
          compressedOre: compressedOreChoices.avoid,
          buyOutright: true,
          shipping: { mode: shippingModes.fixed, amount: 30000000 },
          neverChoose: [1230],
        },
      },
      true,
    );

    expect(actions().getPlannerSettings(OWNER).reprocessingSettings).toEqual({
      compressedOre: compressedOreChoices.avoid,
      countLeftoversAsSold: false,
      buyOutright: true,
      shipping: { mode: shippingModes.fixed, amount: 30000000 },
      neverChoose: [1230],
    });
  });

  it("read a choice or mode the SPA does not know as the default", () => {
    actions().setPlannerSettings(
      OWNER,
      {
        reprocessingSettings: {
          compressedOre: "always",
          shipping: { mode: "byJump" },
        },
      },
      true,
    );

    const { compressedOre, shipping, neverChoose } =
      actions().getPlannerSettings(OWNER).reprocessingSettings;
    expect(compressedOre).toBe(compressedOreChoices.prefer);
    expect(shipping).toEqual({ mode: shippingModes.perVolume, amount: 0 });
    expect(neverChoose).toEqual([]);
  });

  it("are written whole and sent alone", async () => {
    hold(OWNER);
    const settings = {
      ...defaultPlannerReprocessingSettings(),
      compressedOre: compressedOreChoices.allow,
      neverChoose: [1230],
    };

    actions().writePlannerReprocessingSettings(OWNER, settings);
    await actions().savePlannerSettings(OWNER);

    expect(saved).toEqual([
      { handle: OWNER, update: { reprocessingSettings: settings } },
    ]);
  });

  it("are not written for a planner whose settings have not been read", () => {
    actions().writePlannerReprocessingSettings(
      OWNER,
      defaultPlannerReprocessingSettings(),
    );

    expect(actions().hasUnsavedPlannerSettings(OWNER)).toBe(false);
  });
});
