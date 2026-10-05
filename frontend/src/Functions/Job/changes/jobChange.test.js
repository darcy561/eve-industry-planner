import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  heldElsewhere,
  readFromServer,
  serverHolds,
  standUpJobPlanner,
} from "../../../tests/jobPlannerHarness.js";

const saveJobsAsOneChange = vi.fn();
const saveArchivedJobs = vi.fn();

vi.mock("../../Endpoints/Private/archivedJobs.js", () => ({
  default: (...args) => saveArchivedJobs(...args),
}));
const restoreSavedJobs = vi.fn();
const requestJobDocumentsByIdsFromApi = vi.fn();

vi.mock("../sync/saveJobsViaApi.js", () => ({
  saveJobsAsOneChange: (...args) => saveJobsAsOneChange(...args),
}));

vi.mock("../sync/persistJobDocumentsToApi.js", () => ({
  restoreSavedJobs: (...args) => restoreSavedJobs(...args),
}));

vi.mock("../../Endpoints/Private/requestJobDocumentsByIds.js", () => ({
  requestJobDocumentsByIdsFromApi: (...args) =>
    requestJobDocumentsByIdsFromApi(...args),
}));

vi.mock("../../Debounce/jobDocumentsPersistSchedule.js", () => ({
  flushPendingJobDocumentsSave: vi.fn().mockResolvedValue("saved"),
}));

vi.mock("../../../Events/snackbarEvents", async () => {
  const { snackbarMock } = await import("../../../tests/snackbarHarness.js");
  return snackbarMock();
});

vi.mock("../../../Zustand/usersStore", async () => {
  const { rawStoreMock } = await import("../../../tests/rawStoreHarness.js");
  return rawStoreMock();
});

const { documentLockKey } =
  await import("../../DocumentLock/documentLockKey.js");
const { USER_JOBS_COLLECTION } =
  await import("../../DocumentLock/documentLockCollections.js");
const {
  JOB_MOVED,
  archiveJobsOnServer,
  jobsOpenElsewhere,
  nothingChangedMessage,
  readJobsForAChange,
  sendChangeFromRead,
  whatMovedSinceRead,
} = await import("./jobChange.js");
const { showSnackbarError } = await import("../../../Events/snackbarEvents");

beforeEach(() => {
  vi.clearAllMocks();
  standUpJobPlanner();
  serverHolds([]);
  requestJobDocumentsByIdsFromApi.mockImplementation(readFromServer);
  restoreSavedJobs.mockResolvedValue(undefined);
});

function stateWith({ jobs = [], held = [] } = {}) {
  return {
    documentLock: {
      scopes: Object.fromEntries(
        held.map((jobID) => [
          documentLockKey(USER_JOBS_COLLECTION, jobID),
          { readOnly: true },
        ]),
      ),
    },
    jobData: {
      actions: {
        findJobInJobArray: (jobID) =>
          jobs.find((job) => job.jobID === jobID) ?? null,
      },
    },
  };
}

function at(jobID, revision, name = jobID) {
  return { jobID, name, _meta: { revision } };
}

describe("the jobs that stop a change", () => {
  it("names a job another session holds open", () => {
    const state = stateWith({ held: ["b"] });

    expect(jobsOpenElsewhere(state, [at("a", 1), at("b", 1)])).toEqual([
      { jobID: "b", name: "b", reason: JOB_MOVED.HELD },
    ]);
  });

  it("tells a job edited since it was read from one removed or held", () => {
    const state = stateWith({
      jobs: [at("same", 2), at("edited", 3), at("held", 1)],
      held: ["held"],
    });

    const moved = whatMovedSinceRead(state, [
      at("same", 2),
      at("edited", 2),
      at("gone", 5),
      at("held", 1),
    ]);

    expect(moved).toEqual([
      { jobID: "edited", name: "edited", reason: JOB_MOVED.EDITED },
      { jobID: "gone", name: "gone", reason: JOB_MOVED.GONE },
      { jobID: "held", name: "held", reason: JOB_MOVED.HELD },
    ]);
  });
});

describe("the warning for a change that touched nothing", () => {
  it("names each job that moved", () => {
    expect(
      nothingChangedMessage("deleted", {
        moved: [
          { name: "Rifter", reason: JOB_MOVED.EDITED },
          { name: "Wolf", reason: JOB_MOVED.HELD },
        ],
      }),
    ).toBe(
      "Nothing was deleted. Rifter: edited since you selected it; Wolf: open for editing elsewhere.",
    );
  });

  it("says why the server refused it when no job is named", () => {
    expect(nothingChangedMessage("archived", { outcome: "locked" })).toBe(
      "Nothing was archived: another member is editing a job it touches.",
    );
  });

  it("takes a reason of its own over the outcome", () => {
    expect(
      nothingChangedMessage("archived", {
        outcome: "locked",
        because: "another member is editing this group",
      }),
    ).toBe("Nothing was archived: another member is editing this group.");
  });
});

describe("reading the jobs a change is built from", () => {
  it("answers what it read and which of it is open elsewhere", async () => {
    serverHolds([at("a", 1), at("b", 1)]);
    heldElsewhere("b");

    const fetched = await readJobsForAChange(["a", "b"], "deleted");

    expect(fetched.read.map((job) => job.jobID)).toEqual(["a", "b"]);
    expect(fetched.held).toEqual([
      { jobID: "b", name: "b", reason: JOB_MOVED.HELD },
    ]);
  });

  it("says so and answers nothing when the jobs cannot be read", async () => {
    requestJobDocumentsByIdsFromApi.mockRejectedValueOnce(new Error("down"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await readJobsForAChange(["a"], "merged")).toBeNull();
    expect(showSnackbarError).toHaveBeenCalledWith(
      "The jobs could not be read, so nothing was merged.",
      5,
    );
  });
});

describe("sending a change built from jobs read off the server", () => {
  it("answers that it landed", async () => {
    saveJobsAsOneChange.mockResolvedValueOnce("saved");

    const sent = await sendChangeFromRead({
      read: [at("a", 1)],
      jobs: [],
      removed: [at("a", 1)],
    });

    expect(sent).toEqual({ landed: true, moved: null });
    expect(restoreSavedJobs).not.toHaveBeenCalled();
  });

  it("puts back what it read and names what moved when the change was stale", async () => {
    saveJobsAsOneChange.mockResolvedValueOnce("conflict");

    const sent = await sendChangeFromRead({
      read: [at("a", 1)],
      jobs: [],
      removed: [at("a", 1)],
      created: ["new"],
    });

    expect(restoreSavedJobs).toHaveBeenCalledWith(["a"], ["new"]);
    expect(sent).toEqual({
      landed: false,
      moved: [{ jobID: "a", name: "a", reason: JOB_MOVED.GONE }],
    });
  });

  it("names nothing when the change failed for another reason", async () => {
    saveJobsAsOneChange.mockResolvedValueOnce("failed");

    const sent = await sendChangeFromRead({ read: [], jobs: [], removed: [] });

    expect(sent).toEqual({ landed: false, moved: null });
  });
});

describe("archiving jobs on the server", () => {
  it("answers that the jobs moved", async () => {
    saveArchivedJobs.mockResolvedValueOnce("saved");

    expect(await archiveJobsOnServer([{ jobID: "a" }])).toBe(true);
    expect(showSnackbarError).not.toHaveBeenCalled();
  });

  it("says why when nothing moved", async () => {
    saveArchivedJobs.mockResolvedValueOnce("conflict");

    expect(await archiveJobsOnServer([{ jobID: "a" }])).toBe(false);
    expect(showSnackbarError).toHaveBeenCalledWith(
      "Nothing was archived: a job was saved elsewhere since it was read. Try again.",
      5,
    );
  });
});
