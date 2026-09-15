import { beforeEach, describe, expect, it, vi } from "vitest";

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
const { extrasCategoriesDefault } =
  await import("../../Context/defaultValues.jsx");

const OWNER = "corporation:98000001";

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
    // The reads under test are a signed-in user's; the signed-out case is its
    // own test below.
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
    expect(settings.customStructures.manufacturing).toEqual([]);
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

    await actions().savePlannerExtrasCategories(OWNER);

    expect(saved).toHaveLength(1);
    expect(saved[0].handle).toBe(OWNER);
    expect(Object.keys(saved[0].update)).toEqual(["extrasCategories"]);
    expect(actions().getPlannerSettings(OWNER).extrasCategories).toEqual([
      { id: "a", label: "Freight (renamed)" },
    ]);
  });

  // Editing the fallback defaults and saving them would replace the planner's
  // stored list with them.
  it("refuses an edit to a planner whose settings have not arrived", () => {
    actions().addPlannerExtrasCategory(OWNER, { id: "a", label: "Freight" });

    expect(
      actions()
        .getPlannerSettings(OWNER)
        .extrasCategories.some((entry) => entry.id === "a"),
    ).toBe(false);
  });

  // Stripping markup from what a reader typed can leave nothing behind, and the
  // server refuses a list holding a category with no label.
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
    await actions().savePlannerExtrasCategories(OWNER);

    expect(saved).toEqual([]);
  });

  // The switch-away-and-back race: the query entry for the planner being left is
  // dropped, so coming back re-reads it. That read arrives while the edit is
  // still inside its debounce window, and applying it would discard the edit and
  // then save the server's own copy back over it.
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
    await actions().savePlannerExtrasCategories(OWNER);
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

  // A write that never landed leaves the edit held, so the reader keeps what
  // they typed and the next flush tries again.
  it("keeps an edit held when the write fails", async () => {
    hold(OWNER);
    actions().addPlannerExtrasCategory(OWNER, { id: "a", label: "Freight" });
    nextError = new Error("refused");

    await expect(actions().savePlannerExtrasCategories(OWNER)).rejects.toThrow(
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

    await actions().savePlannerExtrasCategories(OWNER);

    expect(saved).toEqual([]);
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

  it("rebuilds structure rows with their classes, so their methods survive", async () => {
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

    const { manufacturing, reprocessing, invention } =
      actions().getPlannerSettings(OWNER).customStructures;
    expect(manufacturing[0].constructor.name).toBe("CustomStructure");
    expect(reprocessing[0].constructor.name).toBe("ReprocessingStructure");
    // A lane the server omits is empty rather than missing.
    expect(invention).toEqual([]);
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
