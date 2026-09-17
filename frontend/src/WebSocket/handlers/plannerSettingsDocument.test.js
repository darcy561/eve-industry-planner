import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../Functions/Endpoints/Private/planners.js", () => ({
  PLANNER_SETTINGS_COLLECTION: "planner_settings",
  fetchPlannerSettingsFromApi: async () => null,
  savePlannerSettingsToApi: async () => null,
}));

const { default: useUsersStore } = await import("../../Zustand/usersStore.js");
const { handlePlannerSettingsDelete, handlePlannerSettingsUpsert } =
  await import("./plannerSettingsDocument.js");

const OWNER = "corporation:98000001";
const OTHER_OWNER = "corporation:98000002";

function actions() {
  return useUsersStore.getState().plannerSettings.actions;
}

const setPosition = vi.fn();

/** The delivery a change to one planner's settings arrives as. */
function ctx(owner, document, position = 12) {
  return {
    owner,
    docKey: `planner_settings.${owner}`,
    document,
    position,
    rs: { setPosition },
  };
}

/** What the stored document carries: the settings themselves, not a wrapper. */
function storedSettings(categories) {
  return {
    _id: "corporation:corp_ref_x",
    schemaVersion: 1,
    extrasCategories: categories,
    defaultCitadelBrokersFee: 3,
    exemptTypeIDs: [34, 35],
  };
}

const CATEGORIES = [{ id: "cat-1", label: "Hauling", deleted: false }];

describe("planner settings change deliveries", () => {
  beforeEach(() => {
    setPosition.mockClear();
    actions().resetPlannerSettingsStore();
    useUsersStore.getState().account.actions.setLoggedIn(true);
  });

  it("holds what another member changed, and marks the planner seeded", () => {
    const applied = handlePlannerSettingsUpsert(
      ctx(OWNER, storedSettings(CATEGORIES)),
    );

    expect(applied).toBe(true);
    const settings = actions().getPlannerSettings(OWNER);
    expect(settings.extrasCategories).toEqual(CATEGORIES);
    expect(settings.defaultCitadelBrokersFee).toBe(3);
    // Merged the way a read is: the list of ids becomes the Set every consumer
    // of the account's own settings reads.
    expect(settings.exemptTypeIDs).toEqual(new Set([34, 35]));
    expect(actions().isPlannerSeeded(OWNER)).toBe(true);
    expect(setPosition).toHaveBeenCalledWith(`planner_settings.${OWNER}`, 12);
  });

  it("keys on the delivery's owner, not on the document's stored id", () => {
    handlePlannerSettingsUpsert(ctx(OWNER, storedSettings(CATEGORIES)));

    // The document's `_id` is the owner key, which spells a corporation as a ref
    // the client cannot resolve; nothing may be filed under it.
    expect(
      Object.keys(useUsersStore.getState().plannerSettings.byOwner),
    ).toEqual([OWNER]);
  });

  it("applies a planner that is not the one being worked in", () => {
    useUsersStore.getState().activePlanner.actions.setActivePlannerOwner(OWNER);

    handlePlannerSettingsUpsert(ctx(OTHER_OWNER, storedSettings(CATEGORIES)));

    expect(actions().isPlannerSeeded(OTHER_OWNER)).toBe(true);
  });

  it("leaves an edit that has not reached the server alone", () => {
    actions().setPlannerSettings(OWNER, { extrasCategories: CATEGORIES }, true);
    actions().writePlannerExtrasCategories(OWNER, (categories) => [
      ...categories,
      { id: "cat-mine", label: "Mine", deleted: false },
    ]);

    const applied = handlePlannerSettingsUpsert(
      ctx(OWNER, storedSettings([{ id: "cat-theirs", label: "Theirs" }])),
    );

    expect(applied).toBe(true);
    expect(
      actions()
        .getPlannerSettings(OWNER)
        .extrasCategories.map((entry) => entry.id),
    ).toEqual(["cat-1", "cat-mine"]);
    // Still recorded as seen: the delivery was read and decided on, so a
    // redelivery of it is a copy of a change already handled.
    expect(setPosition).toHaveBeenCalledWith(`planner_settings.${OWNER}`, 12);
  });

  it("falls the planner back to the defaults when its settings are removed", () => {
    handlePlannerSettingsUpsert(ctx(OWNER, storedSettings(CATEGORIES)));

    const applied = handlePlannerSettingsDelete(ctx(OWNER, undefined, 13));

    expect(applied).toBe(true);
    expect(actions().isPlannerSeeded(OWNER)).toBe(false);
    expect(actions().getPlannerSettings(OWNER).defaultCitadelBrokersFee).toBe(
      1,
    );
    expect(setPosition).toHaveBeenCalledWith(`planner_settings.${OWNER}`, 13);
  });

  it("keeps an unsaved edit through a delete, because the save recreates it", () => {
    actions().setPlannerSettings(OWNER, { extrasCategories: CATEGORIES }, true);
    actions().writePlannerExtrasCategories(OWNER, (categories) => categories);

    handlePlannerSettingsDelete(ctx(OWNER, undefined, 13));

    expect(actions().isPlannerSeeded(OWNER)).toBe(true);
  });

  it("ignores a delivery carrying no owner, having nothing to file it under", () => {
    expect(
      handlePlannerSettingsUpsert(ctx(null, storedSettings(CATEGORIES))),
    ).toBe(false);
    expect(handlePlannerSettingsDelete(ctx(null, undefined))).toBe(false);
    expect(setPosition).not.toHaveBeenCalled();
  });
});
