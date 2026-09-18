import { beforeEach, describe, expect, it } from "vitest";

const { default: useUsersStore } = await import("../usersStore.js");

function actions() {
  return useUsersStore.getState().jobData.actions;
}

function jobData() {
  return useUsersStore.getState().jobData;
}

describe("active job and group tracking", () => {
  beforeEach(() => {
    actions().resetJobDataStore();
  });

  it("holds the job being edited, and lets go of it", () => {
    actions().setActiveJobID("job-1");
    expect(jobData().activeJobID).toBe("job-1");

    actions().setActiveJobID(null);
    expect(jobData().activeJobID).toBeNull();
  });

  it("holds the group being edited", () => {
    actions().setActiveGroupID("group-1");
    expect(jobData().activeGroupID).toBe("group-1");

    actions().clearActiveGroupID();
    expect(jobData().activeGroupID).toBeNull();
  });

  /*
   * A group closing clears the active group only if it is the one open. Two
   * groups closing in either order must not leave the reader's own group
   * cleared behind them.
   */
  describe("clearing only the group that closed", () => {
    beforeEach(() => {
      actions().setActiveGroupID("group-1");
    });

    it("clears when the group that closed is the active one", () => {
      actions().clearActiveGroupIfMatches("group-1");
      expect(jobData().activeGroupID).toBeNull();
    });

    it("leaves another group's close alone", () => {
      actions().clearActiveGroupIfMatches("group-2");
      expect(jobData().activeGroupID).toBe("group-1");
    });

    it.each([[null], [undefined], [""]])("ignores %p", (groupID) => {
      actions().clearActiveGroupIfMatches(groupID);
      expect(jobData().activeGroupID).toBe("group-1");
    });
  });
});
