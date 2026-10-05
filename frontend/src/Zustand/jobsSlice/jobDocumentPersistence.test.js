import { toDocument } from "../../Functions/Job/jobDocument.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const scheduled = vi.fn();
vi.mock("../../Functions/Debounce/jobDocumentsPersistSchedule.js", () => ({
  scheduleDebouncedJobDocumentsSave: () => scheduled(),
}));

const { default: useUsersStore } = await import("../usersStore.js");

function actions() {
  return useUsersStore.getState().jobData.actions;
}

function queued() {
  return Object.keys(useUsersStore.getState().jobData.pendingJobDocumentWrites);
}

function held(jobID, name) {
  return {
    jobID,
    name,
    _meta: { revision: 3 },
  };
}

function envelope(jobID, name) {
  return {
    jobID,
    document: toDocument(held(jobID, name)),
  };
}

describe("queueing job documents for the next save", () => {
  beforeEach(() => {
    scheduled.mockClear();
    actions().resetJobDataStore();
  });

  it.each([
    ["one id", "job-1", ["job-1"]],
    ["several", ["job-1", "job-2"], ["job-1", "job-2"]],
  ])("queues %s", (_label, input, expected) => {
    actions().queueJobDocumentWrites(input);
    expect(queued()).toEqual(expected);
  });

  it("merges into what is already waiting, without repeating a job", () => {
    actions().queueJobDocumentWrites(["job-1", "job-2"]);
    actions().queueJobDocumentWrites(["job-2", "job-3"]);
    expect(queued()).toEqual(["job-1", "job-2", "job-3"]);
  });

  it("drops empty ids rather than queueing a write for nothing", () => {
    actions().queueJobDocumentWrites(["job-1", "", null, undefined]);
    expect(queued()).toEqual(["job-1"]);
  });

  it("clears the named ids, or the whole queue", () => {
    actions().queueJobDocumentWrites(["job-1", "job-2", "job-3"]);

    actions().clearPendingJobDocumentWrites("job-2");
    expect(queued()).toEqual(["job-1", "job-3"]);

    actions().clearPendingJobDocumentWrites();
    expect(queued()).toEqual([]);
  });

  it("starts the debounced save only when asked to", () => {
    actions().queueJobDocumentWrites("job-1");
    expect(scheduled).not.toHaveBeenCalled();

    actions().queueJobDocumentWritesAndSchedule("job-2");
    expect(scheduled).toHaveBeenCalledTimes(1);
  });

  describe("queueing from the jobs themselves", () => {
    const job = { jobID: "job-1", name: "Rifter" };

    it("holds the job and queues its write in one go", () => {
      actions().queueJobDocumentWritesFromJobs(job);

      expect(queued()).toEqual(["job-1"]);
      expect(actions().findJobInJobArray("job-1")).toEqual(job);
      expect(scheduled).not.toHaveBeenCalled();
    });

    it("schedules when asked", () => {
      actions().queueJobDocumentWritesFromJobsAndSchedule([job]);
      expect(scheduled).toHaveBeenCalledTimes(1);
    });

    it("ignores jobs carrying no id", () => {
      actions().queueJobDocumentWritesFromJobs([{ name: "no id" }]);
      expect(queued()).toEqual([]);
    });
  });

  describe("the payload the save sends", () => {
    it("is the write envelope for every queued id", () => {
      actions().replaceJobArray([
        held("job-1", "Rifter"),
        held("job-2", "Punisher"),
      ]);
      actions().queueJobDocumentWrites(["job-2", "job-1"]);

      expect(actions().getPendingJobDocumentWritesPayload()).toEqual([
        envelope("job-2", "Punisher"),
        envelope("job-1", "Rifter"),
      ]);
    });

    it("narrows a write to the fields the log recorded", () => {
      actions().replaceJobArray([held("job-1", "Rifter")]);
      actions().queueJobDocumentChanges({
        "job-1": [{ patches: [{ op: "replace", path: ["name"] }] }],
      });

      expect(actions().getPendingJobDocumentWritesPayload()).toEqual([
        {
          jobID: "job-1",
          revision: 3,
          document: { name: "Rifter" },
        },
      ]);
    });

    it("leaves out an id whose job is no longer held", () => {
      actions().replaceJobArray([held("job-1", "Rifter")]);
      actions().queueJobDocumentWrites(["job-1", "job-gone"]);

      expect(actions().getPendingJobDocumentWritesPayload()).toEqual([
        envelope("job-1", "Rifter"),
      ]);
    });
  });

  it("empties the queue when the array is replaced from the server", () => {
    actions().queueJobDocumentWrites("job-1");

    actions().replaceJobArray([], { fromServer: true });

    expect(queued()).toEqual([]);
  });

  it("keeps the queue when the array is replaced locally", () => {
    actions().queueJobDocumentWrites("job-1");

    actions().replaceJobArray([]);

    expect(queued()).toEqual(["job-1"]);
  });
});

describe("what a queued write knows about its changes", () => {
  beforeEach(() => {
    actions().clearPendingJobDocumentWrites();
  });

  function changesFor(jobID) {
    return useUsersStore.getState().jobData.pendingJobDocumentWrites[jobID];
  }

  const entry = (path) => ({ patches: [{ op: "replace", path }] });

  it("keeps the entries a write was queued against", () => {
    actions().queueJobDocumentChanges({ "job-1": [entry(["name"])] });

    expect(changesFor("job-1")).toEqual([entry(["name"])]);
  });

  it("has none for a change nothing recorded", () => {
    actions().queueJobDocumentWrites("job-1");

    expect(changesFor("job-1")).toBeNull();
  });

  it("gathers the entries of two writes to one job", () => {
    actions().queueJobDocumentChanges({ "job-1": [entry(["name"])] });
    actions().queueJobDocumentChanges({ "job-1": [entry(["jobStatus"])] });

    expect(changesFor("job-1")).toEqual([
      entry(["name"]),
      entry(["jobStatus"]),
    ]);
  });

  it("stays whole once a write with no entries joins it", () => {
    actions().queueJobDocumentChanges({ "job-1": [entry(["name"])] });
    actions().queueJobDocumentWrites("job-1");
    actions().queueJobDocumentChanges({ "job-1": [entry(["jobStatus"])] });

    expect(changesFor("job-1")).toBeNull();
  });

  it("writes the whole document for a job the close did not edit", () => {
    actions().queueJobDocumentWritesFromJobs(
      [{ jobID: "job-edited" }, { jobID: "job-resized" }],
      { "job-edited": [entry(["name"])] },
    );

    expect(changesFor("job-edited")).toEqual([entry(["name"])]);
    expect(changesFor("job-resized")).toBeNull();
  });

  it("forgets a job's changes once its write has gone", () => {
    actions().queueJobDocumentChanges({
      "job-1": [entry(["name"])],
      "job-2": [entry(["name"])],
    });
    actions().clearPendingJobDocumentWrites("job-1");

    expect(queued()).toEqual(["job-2"]);
  });
});
