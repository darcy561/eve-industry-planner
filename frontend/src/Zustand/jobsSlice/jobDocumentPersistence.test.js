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

  /*
   * Queued rather than replaced: two edits to the same job before a flush are
   * one write, and an edit to another job in between must not be lost.
   */
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
    it("is the held job for every queued id", () => {
      actions().replaceJobArray([
        { jobID: "job-1", name: "Rifter" },
        { jobID: "job-2", name: "Punisher" },
      ]);
      actions().queueJobDocumentWrites(["job-2", "job-1"]);

      expect(actions().getPendingJobDocumentWritesPayload()).toEqual([
        { jobID: "job-2", name: "Punisher" },
        { jobID: "job-1", name: "Rifter" },
      ]);
    });

    /*
     * A job deleted between the edit and the flush leaves its id queued. The
     * payload carries what is still held rather than a gap the API would read
     * as a malformed document.
     */
    it("leaves out an id whose job is no longer held", () => {
      actions().replaceJobArray([{ jobID: "job-1", name: "Rifter" }]);
      actions().queueJobDocumentWrites(["job-1", "job-gone"]);

      expect(actions().getPendingJobDocumentWritesPayload()).toEqual([
        { jobID: "job-1", name: "Rifter" },
      ]);
    });
  });

  it("empties the queue when the array is replaced from the server", () => {
    actions().queueJobDocumentWrites("job-1");

    actions().replaceJobArray([], { fromServer: true });

    expect(queued()).toEqual([]);
  });

  /*
   * A local replacement is not a sync, so an edit still on its way to the
   * server stays queued — dropping it would lose the write silently.
   */
  it("keeps the queue when the array is replaced locally", () => {
    actions().queueJobDocumentWrites("job-1");

    actions().replaceJobArray([]);

    expect(queued()).toEqual(["job-1"]);
  });
});

// A write carries the fields the reader changed when the queue knows them, and
// the whole document when it does not. Which of the two a job gets is decided
// here, at the moment it is queued.
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

  // A write that cannot say what changed covers the whole document, and one
  // that can say does not narrow it back — the fields it does not name would
  // stop being written.
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
