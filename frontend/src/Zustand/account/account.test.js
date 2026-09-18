import { beforeEach, describe, expect, it, vi } from "vitest";

const cleared = vi.fn();
vi.mock(
  "../../Functions/Auth/tabSessionStorage.js",
  async (importOriginal) => ({
    ...(await importOriginal()),
    clearTabPlannerSession: () => cleared(),
  }),
);

const { default: useUsersStore } = await import("../usersStore.js");

function actions() {
  return useUsersStore.getState().account.actions;
}

function account() {
  return useUsersStore.getState().account;
}

describe("the account slice", () => {
  beforeEach(() => {
    cleared.mockClear();
    actions().resetAccountStore();
  });

  describe("signing out", () => {
    it("drops the session and forgets what was linked", () => {
      actions().setLoggedIn(true);
      actions().addLinkedEsiData({ ordersToAdd: [1] });

      actions().resetAccountStore();

      expect(account().isLoggedIn).toBe(false);
      expect(account().accountID).toBeNull();
      expect([...account().linkedOrders]).toEqual([]);
    });

    it("clears the tab's stored session too", () => {
      actions().resetAccountStore();
      expect(cleared).toHaveBeenCalled();
    });

    /*
     * The websocket's read positions belong to the account that was signed in;
     * carrying them into the next sign-in would resume from a stranger's place
     * in the stream.
     */
    it("forgets the websocket's positions", () => {
      const sync = useUsersStore.getState().websocketSync.actions;
      sync.setPosition("job_documents", 42);

      actions().resetAccountStore();

      expect(sync.getPosition("job_documents")).toBe(0);
    });
  });

  describe("reading the account back", () => {
    it("says whether anybody is signed in", () => {
      expect(actions().getIsLoggedIn()).toBe(false);
      actions().setLoggedIn(true);
      expect(actions().getIsLoggedIn()).toBe(true);
    });

    /*
     * The hash reads as an empty string rather than null because it is
     * interpolated unguarded — the assets scope key would otherwise read
     * `character:null`.
     */
    it("reads an unset character hash as empty, and an unset id as null", () => {
      expect(actions().getMainCharacterHash()).toBe("");
      expect(actions().getAccountID()).toBeNull();
    });
  });

  describe("whether the first-login flow is required", () => {
    it("is not, while nobody is signed in", () => {
      actions().setHasCompletedFirstLoginFlow(false);
      expect(actions().getRequiresFirstLoginFlow()).toBe(false);
    });

    describe("once signed in", () => {
      beforeEach(() => {
        actions().setLoggedIn(true);
      });

      it("is, until it has been completed", () => {
        actions().setHasCompletedFirstLoginFlow(false);
        expect(actions().getRequiresFirstLoginFlow()).toBe(true);

        actions().setHasCompletedFirstLoginFlow(true);
        expect(actions().getRequiresFirstLoginFlow()).toBe(false);
      });

      /*
       * A brand new account is sent through the flow even though nothing has
       * recorded a completion against it yet.
       */
      it("is on a first login, whatever was recorded before", () => {
        actions().setHasCompletedFirstLoginFlow(true);
        actions().setIsFirstTimeLogin(true);

        expect(actions().getRequiresFirstLoginFlow()).toBe(true);
      });
    });
  });

  it("toggles whether citadel names are shared", () => {
    const before = account().shareCitadelNames;

    actions().toggleShareCitadelNames();
    expect(account().shareCitadelNames).toBe(!before);

    actions().toggleShareCitadelNames();
    expect(account().shareCitadelNames).toBe(before);
  });

  describe("linked ESI data", () => {
    it.each([
      ["orders", "ordersToAdd", "linkedOrders"],
      ["jobs", "jobsToAdd", "linkedJobs"],
      ["transactions", "transactionsToAdd", "linkedTrans"],
    ])("adds linked %s", (_label, key, held) => {
      actions().addLinkedEsiData({ [key]: [1, 2] });
      expect([...account()[held]]).toEqual([1, 2]);
    });

    it.each([
      ["orders", "ordersToAdd", "ordersToRemove", "linkedOrders"],
      ["jobs", "jobsToAdd", "jobsToRemove", "linkedJobs"],
      [
        "transactions",
        "transactionsToAdd",
        "transactionsToRemove",
        "linkedTrans",
      ],
    ])("removes linked %s", (_label, addKey, removeKey, held) => {
      actions().addLinkedEsiData({ [addKey]: [1, 2, 3] });
      actions().addLinkedEsiData({ [removeKey]: [2] });
      expect([...account()[held]]).toEqual([1, 3]);
    });

    it("does not link the same id twice", () => {
      actions().addLinkedEsiData({ ordersToAdd: [1, 2] });
      actions().addLinkedEsiData({ ordersToAdd: [2, 3] });
      expect([...account().linkedOrders]).toEqual([1, 2, 3]);
    });

    it("adds and removes in the same call", () => {
      actions().addLinkedEsiData({ jobsToAdd: [1, 2] });
      actions().addLinkedEsiData({ jobsToAdd: [3], jobsToRemove: [1] });
      expect([...account().linkedJobs]).toEqual([2, 3]);
    });

    it.each([[null], [undefined]])("ignores %p", (input) => {
      actions().addLinkedEsiData({ ordersToAdd: [1] });
      actions().addLinkedEsiData(input);
      expect([...account().linkedOrders]).toEqual([1]);
    });

    /*
     * The three id sets go to Mongo as arrays, and the document carries the
     * account-level flags beside them — including one that lives on the
     * application settings slice rather than this one.
     */
    it("writes the linked ids and the account's flags as a document", () => {
      actions().addLinkedEsiData({
        ordersToAdd: [1],
        jobsToAdd: [2],
        transactionsToAdd: [3],
      });
      actions().setHasCompletedFirstLoginFlow(true);
      useUsersStore
        .getState()
        .applicationSettings.actions.setCloudAccountsEnabled(true);

      expect(actions().linkedEsiToDocument()).toEqual({
        linkedOrders: [1],
        linkedJobs: [2],
        linkedTrans: [3],
        userCloudAccounts: true,
        hasCompletedFirstLoginFlow: true,
        shareCitadelNames: account().shareCitadelNames,
      });
    });
  });
});
