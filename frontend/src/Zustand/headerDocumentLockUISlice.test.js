import { beforeEach, describe, expect, it } from "vitest";

const { default: useUsersStore } = await import("./usersStore.js");

function actions() {
  return useUsersStore.getState().headerDocumentLockUI.actions;
}

function registrations() {
  return useUsersStore.getState().headerDocumentLockUI.registrations;
}

describe("header document lock UI slice", () => {
  beforeEach(() => {
    actions().clearHeaderDocumentLockUI();
  });

  it("registers a page's lock control", () => {
    actions().registerHeaderDocumentLockUI({
      collection: "jobs",
      docID: "job-1",
      label: "Edit job",
    });

    expect(registrations()).toEqual([
      {
        collection: "jobs",
        docID: "job-1",
        enabled: true,
        readOnlyMessage: null,
        label: "Edit job",
        treeOwnership: "full",
      },
    ]);
  });

  it("patches a field without disturbing the rest", () => {
    actions().registerHeaderDocumentLockUI({
      collection: "jobs",
      docID: "job-1",
    });

    actions().patchHeaderDocumentLockUI({
      readOnlyMessage: "Someone else has it",
    });

    const state = useUsersStore.getState().headerDocumentLockUI;
    expect(state.readOnlyMessage).toBe("Someone else has it");
    expect(state.registrations).toHaveLength(1);
  });

  /*
   * The one restatement of `actions` the store keeps beside a spread: `partial`
   * crosses a public boundary from `Events/headerDocumentLockEvents.js`, so
   * nothing but this stops a caller's object taking the slice's API with it.
   */
  it("does not let a caller's patch replace the slice's actions", () => {
    const before = actions();

    actions().patchHeaderDocumentLockUI({ actions: undefined });

    expect(useUsersStore.getState().headerDocumentLockUI.actions).toBe(before);
    expect(typeof actions().patchHeaderDocumentLockUI).toBe("function");
  });

  it("clears the registrations and keeps its actions", () => {
    const before = actions();
    actions().registerHeaderDocumentLockUI({
      collection: "jobs",
      docID: "job-1",
    });

    actions().clearHeaderDocumentLockUI();

    expect(registrations()).toEqual([]);
    expect(actions()).toBe(before);
  });
});
