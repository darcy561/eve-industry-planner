import { beforeEach, describe, expect, it, vi } from "vitest";

const scheduled = vi.fn();
vi.mock("../../Functions/Debounce/jobGroupsPersistSchedule.js", () => ({
  scheduleDebouncedGroupSave: () => scheduled(),
}));

const { default: useUsersStore } = await import("../usersStore.js");

function actions() {
  return useUsersStore.getState().jobData.actions;
}

function jobData() {
  return useUsersStore.getState().jobData;
}

/**
 * Only enough of a group for these tests: what `toDocument()` returns is what
 * the save sends, so its shape does not matter here. A real one is richer.
 */
function group(groupID, name = groupID) {
  return { groupID, name, toDocument: () => ({ groupID, name }) };
}

describe("the planner's groups", () => {
  beforeEach(() => {
    scheduled.mockClear();
    actions().resetJobDataStore();
  });

  describe("replacing the array", () => {
    it("takes the groups and the planner they belong to", () => {
      actions().replaceGroupArray([group("group-1")], { owner: "corp:1" });

      expect(jobData().groupArray).toHaveLength(1);
      expect(jobData().owner).toBe("corp:1");
    });

    it("reads an absent array as empty", () => {
      actions().replaceGroupArray(undefined);
      expect(jobData().groupArray).toEqual([]);
    });

    it("empties the queue when the groups came from the server", () => {
      actions().queueJobGroupWrites("group-1");
      actions().replaceGroupArray([], { fromServer: true });
      expect(jobData().pendingJobGroupWrites).toEqual([]);
    });

    /*
     * A local replacement is not a sync. An edit still on its way to the server
     * stays queued, or the write is lost without anything saying so.
     */
    it("keeps the queue when the groups did not", () => {
      actions().queueJobGroupWrites("group-1");
      actions().replaceGroupArray([]);
      expect(jobData().pendingJobGroupWrites).toEqual(["group-1"]);
    });

    it("leaves the owner alone when none is given", () => {
      actions().replaceGroupArray([], { owner: "corp:1" });
      actions().replaceGroupArray([]);
      expect(jobData().owner).toBe("corp:1");
    });
  });

  describe("adding and removing", () => {
    it("adds a group and queues its write", () => {
      actions().addGroupToGroupArray(group("group-1"));

      expect(jobData().groupArray).toHaveLength(1);
      expect(jobData().pendingJobGroupWrites).toEqual(["group-1"]);
    });

    it("removes a group and un-queues the write it no longer needs", () => {
      actions().addGroupToGroupArray(group("group-1"));
      actions().addGroupToGroupArray(group("group-2"));

      actions().removeGroupFromGroupArray("group-1");

      expect(jobData().groupArray.map((g) => g.groupID)).toEqual(["group-2"]);
      expect(jobData().pendingJobGroupWrites).toEqual(["group-2"]);
    });
  });

  describe("reading one back", () => {
    beforeEach(() => {
      actions().replaceGroupArray([group("group-1"), group("group-2")]);
    });

    it("finds a group by id, and says so when there is none", () => {
      expect(actions().getGroupObject("group-2").name).toBe("group-2");
      expect(actions().getGroupObject("group-gone")).toBeNull();
    });

    it("finds the group being edited", () => {
      actions().setActiveGroupID("group-1");
      expect(actions().getActiveGroupObject().name).toBe("group-1");
    });

    it("has no active group to find when none is set", () => {
      expect(actions().getActiveGroupObject()).toBeNull();
    });
  });

  describe("updating modified groups", () => {
    beforeEach(() => {
      actions().replaceGroupArray([group("group-1"), group("group-2")]);
    });

    it("replaces the ones named and queues their writes", () => {
      actions().updateModifiedGroups(group("group-1", "renamed"));

      expect(actions().getGroupObject("group-1").name).toBe("renamed");
      expect(actions().getGroupObject("group-2").name).toBe("group-2");
      expect(jobData().pendingJobGroupWrites).toEqual(["group-1"]);
      expect(scheduled).toHaveBeenCalledTimes(1);
    });

    it("can update without queueing anything to save", () => {
      actions().updateModifiedGroups(group("group-1", "renamed"), {
        queuePersist: false,
      });

      expect(actions().getGroupObject("group-1").name).toBe("renamed");
      expect(jobData().pendingJobGroupWrites).toEqual([]);
      expect(scheduled).not.toHaveBeenCalled();
    });

    it("ignores a group it does not hold", () => {
      actions().updateModifiedGroups(group("group-gone"));
      expect(jobData().groupArray).toHaveLength(2);
    });

    it.each([[null], [undefined]])("ignores %p", (input) => {
      actions().updateModifiedGroups(input);
      expect(scheduled).not.toHaveBeenCalled();
    });
  });

  describe("the queue", () => {
    it("merges rather than replaces, and does not repeat a group", () => {
      actions().queueJobGroupWrites(["group-1", "group-2"]);
      actions().queueJobGroupWrites(["group-2", "group-3"]);
      expect(jobData().pendingJobGroupWrites).toEqual([
        "group-1",
        "group-2",
        "group-3",
      ]);
    });

    it("clears the ids named, or all of them", () => {
      actions().queueJobGroupWrites(["group-1", "group-2"]);

      actions().clearPendingJobGroupWrites("group-1");
      expect(jobData().pendingJobGroupWrites).toEqual(["group-2"]);

      actions().clearPendingJobGroupWrites();
      expect(jobData().pendingJobGroupWrites).toEqual([]);
    });

    it("starts the debounced save only when asked", () => {
      actions().queueJobGroupWrites("group-1");
      expect(scheduled).not.toHaveBeenCalled();

      actions().queueJobGroupWritesAndSchedule("group-2");
      expect(scheduled).toHaveBeenCalledTimes(1);
    });
  });

  describe("the payload the save sends", () => {
    it("is each queued group as its own document", () => {
      actions().replaceGroupArray([group("group-1"), group("group-2")]);
      actions().queueJobGroupWrites("group-1");

      expect(actions().getPendingJobGroupWritesPayload()).toEqual([
        { groupID: "group-1", name: "group-1" },
      ]);
    });

    /*
     * A group deleted between the edit and the flush leaves its id queued, and
     * there is no document to send for it.
     */
    it("leaves out a queued group that is no longer held", () => {
      actions().replaceGroupArray([group("group-1")]);
      actions().queueJobGroupWrites(["group-1", "group-gone"]);

      expect(actions().getPendingJobGroupWritesPayload()).toEqual([
        { groupID: "group-1", name: "group-1" },
      ]);
    });

    it("is empty when nothing is queued", () => {
      actions().replaceGroupArray([group("group-1")]);
      expect(actions().getPendingJobGroupWritesPayload()).toEqual([]);
    });
  });
});
