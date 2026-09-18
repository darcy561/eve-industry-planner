import { describe, expect, it, vi } from "vitest";

const { default: useUsersStore } = await import("./usersStore.js");

/**
 * Every slice's reset, by the store key it rebuilds.
 *
 * A reset that rebuilds from the defaults carries no `actions` of its own and
 * restates them by hand; one that spreads the current slice first inherits
 * them. Both are here because either way, a reset that loses them takes the
 * slice's whole API with it.
 */
const resets = [
  [
    "account",
    () => useUsersStore.getState().account.actions.resetAccountStore(),
  ],
  [
    "applicationSettings",
    () =>
      useUsersStore
        .getState()
        .applicationSettings.actions.resetApplicationSettingsStore(),
  ],
  [
    "activePlanner",
    () =>
      useUsersStore.getState().activePlanner.actions.resetActivePlannerStore(),
  ],
  [
    "plannerSettings",
    () =>
      useUsersStore
        .getState()
        .plannerSettings.actions.resetPlannerSettingsStore(),
  ],
  [
    "worldData",
    () => useUsersStore.getState().worldData.actions.resetWorldDataStore(),
  ],
  [
    "jobData",
    () => useUsersStore.getState().jobData.actions.resetJobDataStore(),
  ],
  [
    "websocketSync",
    () => useUsersStore.getState().websocketSync.actions.reset(),
  ],
  [
    "documentLock",
    () => useUsersStore.getState().documentLock.actions.resetAllDocumentLocks(),
  ],
];

describe("the store merges what an updater returns", () => {
  it("leaves slices the updater did not name alone, by reference", () => {
    // Fails if an action ever passes `replace`, which would drop them entirely.
    const before = useUsersStore.getState();

    useUsersStore
      .getState()
      .applicationSettings.actions.setCloudAccountsEnabled(
        !before.applicationSettings.userCloudAccounts,
      );

    const after = useUsersStore.getState();
    expect(after).not.toBe(before);
    expect(after.applicationSettings).not.toBe(before.applicationSettings);
    expect(after.account).toBe(before.account);
    expect(after.jobData).toBe(before.jobData);
    expect(after.documentLock).toBe(before.documentLock);
  });

  it("keeps the rest of a slice when an updater names one field of it", () => {
    const actions = useUsersStore.getState().applicationSettings.actions;
    actions.setCloudAccountsEnabled(true);
    const before = useUsersStore.getState().applicationSettings;

    actions.setCloudAccountsEnabled(false);

    const after = useUsersStore.getState().applicationSettings;
    expect(after.userCloudAccounts).toBe(false);
    expect(after.actions).toBe(before.actions);
    expect(Object.keys(after).sort()).toEqual(Object.keys(before).sort());
  });

  it.each(resets)(
    "leaves %s's actions callable after a reset",
    (key, reset) => {
      const before = useUsersStore.getState()[key].actions;

      reset();

      const after = useUsersStore.getState()[key].actions;
      expect(after).toBe(before);
      for (const name of Object.keys(before)) {
        expect(typeof after[name]).toBe("function");
      }
    },
  );

  it("does not notify subscribers when an updater returns the state it was given", () => {
    const { registerHeaderDocumentLockUI } =
      useUsersStore.getState().headerDocumentLockUI.actions;
    const registration = { collection: "jobs", docID: "job-1" };
    registerHeaderDocumentLockUI(registration);

    const listener = vi.fn();
    const unsubscribe = useUsersStore.subscribe(listener);
    registerHeaderDocumentLockUI(registration);
    unsubscribe();

    expect(listener).not.toHaveBeenCalled();
  });
});
