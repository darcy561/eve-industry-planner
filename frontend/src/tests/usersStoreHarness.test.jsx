import { act, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderCounts } from "./renderCounts.jsx";
import {
  TEST_ACCOUNT_ID,
  TEST_LOCALE,
  usersStoreMock,
  usersStoreOverSession,
  usersStoreState,
} from "./usersStoreHarness.js";

// The harness stands in for the store in most of the suite, so a fault here
// reads as a fault in whatever was being tested. These cover the parts that
// would break quietly: a slice that disappears, an override that takes out the
// stubs around it, and planner actions bound before the overrides landed.
describe("usersStoreState", () => {
  it("carries every slice a component might reach for", () => {
    const state = usersStoreState();

    expect(Object.keys(state).sort()).toEqual([
      "account",
      "activePlanner",
      "applicationSettings",
      "documentLock",
      "headerDocumentLockUI",
      "jobData",
      "plannerSettings",
      "websocketSync",
      "worldData",
    ]);
  });

  it("formats against a locale without being asked", () => {
    expect(
      usersStoreState().applicationSettings.actions.getCurrentLocale(),
    ).toBe(TEST_LOCALE);
  });

  it("keeps the other actions when an override names one", () => {
    const state = usersStoreState({
      jobData: { actions: { findJobInJobArray: () => "found" } },
    });

    expect(state.jobData.actions.findJobInJobArray()).toBe("found");
    expect(state.jobData.actions.getGroupObject()).toBeNull();
    expect(state.jobData.jobArray).toEqual([]);
  });

  it("replaces values outside actions as given", () => {
    const state = usersStoreState({ account: { accountID: "acc-2" } });

    expect(state.account.accountID).toBe("acc-2");
    expect(state.account.isLoggedIn).toBe(false);
  });

  it("keeps a slice it does not model", () => {
    const state = usersStoreState({ somethingNew: { value: 1 } });

    expect(state.somethingNew).toEqual({ value: 1 });
  });

  // The planner actions read the account off the state they are attached to, so
  // binding them before the overrides land would answer from the default ID.
  it("resolves the planner owner against an overridden account", () => {
    const state = usersStoreState({ account: { accountID: "acc-2" } });

    expect(state.activePlanner.actions.getActivePlannerOwner()).toBe(
      "account:acc-2",
    );
  });

  it("prefers a named planner over the account's own", () => {
    const state = usersStoreState({ activePlanner: { owner: "corp:9" } });

    expect(state.activePlanner.actions.getActivePlannerOwner()).toBe("corp:9");
  });

  it("names no planner with no account", () => {
    const state = usersStoreState({ account: { accountID: null } });

    expect(state.activePlanner.actions.getActivePlannerOwner()).toBeNull();
  });
});

describe("usersStoreMock", () => {
  it("reads as a hook and as a module", () => {
    const { default: store } = usersStoreMock();

    expect(store((s) => s.account.accountID)).toBe(TEST_ACCOUNT_ID);
    expect(store.getState().account.accountID).toBe(TEST_ACCOUNT_ID);
  });

  it("builds a state from bare overrides", () => {
    const { default: store } = usersStoreMock({
      account: { isLoggedIn: true },
    });

    expect(store.getState().account.isLoggedIn).toBe(true);
    expect(
      store.getState().applicationSettings.actions.getCurrentLocale(),
    ).toBe(TEST_LOCALE);
  });

  // Overriding activePlanner looks like a whole state if you judge by shape,
  // and mistaking it for one would return it with every other slice missing.
  it("treats an activePlanner override as an override", () => {
    const { default: store } = usersStoreMock({
      activePlanner: { owner: "corp:9" },
    });

    expect(store.getState().account.accountID).toBe(TEST_ACCOUNT_ID);
    expect(store.getState().activePlanner.owner).toBe("corp:9");
  });

  it("takes an already-built state without rebuilding it", () => {
    const state = usersStoreState({ account: { accountID: "acc-2" } });
    const { default: store } = usersStoreMock(state);

    expect(store.getState()).toBe(state);
  });

  // Slices are merged into fresh objects, so a field set on the object a test
  // handed in lands on a copy the store no longer reads. Pinned because the
  // eager form looks like it should work: the object identity never changes.
  it("does not see a field set on an override after building eagerly", () => {
    const account = { characters: [] };
    const { default: store } = usersStoreMock({ account });

    account.characters = [{ CharacterHash: "hash-a" }];

    expect(store.getState().account.characters).toEqual([]);
  });

  it("sees that same write through the reader form", () => {
    const account = { characters: [] };
    const { default: store } = usersStoreMock(() =>
      usersStoreState({ account }),
    );

    account.characters = [{ CharacterHash: "hash-a" }];

    expect(store.getState().account.characters).toHaveLength(1);
  });

  // A test that changes the store between assertions passes a reader rather
  // than a state, so the mock sees the change instead of the state it was
  // built with.
  it("re-reads a state supplied as a function", () => {
    let state = usersStoreState({ account: { accountID: "first" } });
    const { default: store } = usersStoreMock(() => state);

    expect(store.getState().account.accountID).toBe("first");
    state = usersStoreState({ account: { accountID: "second" } });
    expect(store.getState().account.accountID).toBe("second");
  });
});

// What the counting harness is for: a component that selects one thing from the
// session must not be woken by a change to another, or a render count measures
// the harness rather than the component.
describe("usersStoreOverSession", () => {
  const openJob = (store) =>
    store.getState().editSession.actions.openJob("job-1", {
      jobID: "job-1",
      name: "Rifter",
      build: { materials: { 34: { typeID: 34 } }, extrasCosts: {} },
    });

  it("carries the stub slices and the real session together", () => {
    const { default: store } = usersStoreOverSession({
      account: { accountID: "acc-2" },
    });

    expect(store.getState().account.accountID).toBe("acc-2");
    expect(store.getState().editSession.activeJobID).toBeNull();
    expect(typeof store.getState().editSession.actions.openJob).toBe(
      "function",
    );
  });

  it("holds a component still through a change it did not select", () => {
    const { default: store } = usersStoreOverSession();
    openJob(store);
    const renders = renderCounts();
    const Panel = renders.watch("panel", () => {
      const held = store((state) => state.editSession.activeJobID);
      return <span>{held}</span>;
    });

    render(<Panel />);
    renders.reset();
    act(() => {
      store.getState().editSession.actions.run({
        name: "add extra cost",
        recipe: (job) => {
          job.build.extrasCosts = { "extra-1": { id: "extra-1", cost: 1 } };
        },
      });
    });

    expect(renders.of("panel")).toBe(0);
  });

  it("keeps the session when a test replaces the stubs", () => {
    const { default: store } = usersStoreOverSession();
    openJob(store);

    store.setState(usersStoreState({ account: { accountID: "acc-3" } }));

    expect(store.getState().account.accountID).toBe("acc-3");
    expect(store.getState().editSession.activeJobID).toBe("job-1");
  });
});
