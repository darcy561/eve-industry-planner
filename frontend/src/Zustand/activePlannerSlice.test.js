import { create } from "zustand";
import { describe, expect, it } from "vitest";
import activePlannerSlice from "./activePlannerSlice.js";
import editSessionSlice from "./editSessionSlice.js";

function storeWithAccount(accountID) {
  return create((set, get) => ({
    account: { accountID },
    ...activePlannerSlice(set, get),
    // Changing the planner ends the edit session with it, so the store it reads
    // has to hold one.
    ...editSessionSlice(set, get),
  }));
}

describe("the planner the app works in", () => {
  it("is the account's own until one is named", () => {
    const store = storeWithAccount("acct-1");

    expect(store.getState().activePlanner.owner).toBeNull();
    expect(store.getState().activePlanner.actions.getActivePlannerOwner()).toBe(
      "account:acct-1",
    );
  });

  it("is the named planner once one is set", () => {
    const store = storeWithAccount("acct-1");

    store
      .getState()
      .activePlanner.actions.setActivePlannerOwner("corporation:98000001");

    expect(store.getState().activePlanner.actions.getActivePlannerOwner()).toBe(
      "corporation:98000001",
    );
  });

  it("falls back to the account's own when the name is dropped", () => {
    const store = storeWithAccount("acct-1");
    const { setActivePlannerOwner, getActivePlannerOwner } =
      store.getState().activePlanner.actions;

    setActivePlannerOwner("corporation:98000001");
    setActivePlannerOwner(null);

    expect(getActivePlannerOwner()).toBe("account:acct-1");
  });

  // The header is left off a signed-out request, and a query key carries no
  // owner, rather than either naming a planner nobody is in.
  it("names no planner when nobody is signed in", () => {
    const store = storeWithAccount("");

    expect(
      store.getState().activePlanner.actions.getActivePlannerOwner(),
    ).toBeNull();
  });

  it("keeps the same state object when the planner does not change", () => {
    const store = storeWithAccount("acct-1");
    store
      .getState()
      .activePlanner.actions.setActivePlannerOwner("corporation:1");
    const before = store.getState().activePlanner;

    store
      .getState()
      .activePlanner.actions.setActivePlannerOwner("corporation:1");

    expect(store.getState().activePlanner).toBe(before);
  });

  it("is dropped by a sign-out", () => {
    const store = storeWithAccount("acct-1");
    const { setActivePlannerOwner, resetActivePlannerStore } =
      store.getState().activePlanner.actions;

    setActivePlannerOwner("corporation:98000001");
    resetActivePlannerStore();

    expect(store.getState().activePlanner.owner).toBeNull();
  });
});

// A job belongs to the planner it was made in. Switching planner does not take
// the reader's job with it, so what they were editing is left behind rather than
// carried into a planner it does not belong to.
describe("the job being edited when the planner changes", () => {
  const opened = (store) => {
    store
      .getState()
      .editSession.actions.openJob("job-1", { jobID: "job-1", name: "Rifter" });
    return store;
  };

  it("is left behind when another planner is named", () => {
    const store = opened(storeWithAccount("acct-1"));

    store.getState().activePlanner.actions.setActivePlannerOwner("corp:9");

    expect(store.getState().editSession.draft.base).toEqual({});
    expect(store.getState().editSession.activeJobID).toBeNull();
  });

  it("stays where it is when the planner does not actually change", () => {
    const store = storeWithAccount("acct-1");
    store.getState().activePlanner.actions.setActivePlannerOwner("corp:9");
    opened(store);

    store.getState().activePlanner.actions.setActivePlannerOwner("corp:9");

    expect(store.getState().editSession.draft.base["job-1"]).toBeDefined();
  });
});
