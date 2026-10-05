import { beforeEach, describe, expect, it, vi } from "vitest";
import { CLIENT_ERROR_REVISION_CONFLICT } from "./revisionConflict.js";
import { DOCUMENT_LOCK_CLIENT_ERROR_LOCK_HELD_ELSEWHERE } from "../DocumentLock/documentLockEvents.js";

const putJobDocumentsChange = vi.fn();
const putJobDocumentsBatch = vi.fn();

vi.mock("../Endpoints/Private/jobDocuments.js", async (importOriginal) => ({
  ...(await importOriginal()),
  putJobDocumentsChange: (...args) => putJobDocumentsChange(...args),
  putJobDocumentsBatch: (...args) => putJobDocumentsBatch(...args),
}));

const requestJobDocumentsByIdsFromApi = vi.fn();

vi.mock("../Endpoints/Private/requestJobDocumentsByIds.js", () => ({
  requestJobDocumentsByIdsFromApi: (...args) =>
    requestJobDocumentsByIdsFromApi(...args),
}));

const warned = vi.fn();
vi.mock("../../Events/snackbarEvents.js", () => ({
  showSnackbarWarning: (...args) => warned(...args),
}));

const { default: useUsersStore } = await import("../../Zustand/usersStore.js");
const { restoreSavedJobs, saveJobsAsOneChange } =
  await import("./saveJobsViaApi.js");
const { jobFromDocument } = await import("./jobDocument.js");

function jobAt(jobID, revision) {
  const meta = revision ? { revision } : {};
  return {
    jobID,
    name: jobID,
    _meta: meta,
    toDocument() {
      return { jobID, name: this.name, _meta: { ...this._meta } };
    },
  };
}

const renamed = [{ patches: [{ op: "replace", path: ["name"] }] }];

function signIn() {
  useUsersStore.setState((state) => ({
    account: { ...state.account, isLoggedIn: true },
  }));
}

function queued() {
  return useUsersStore.getState().jobData.pendingJobDocumentWrites;
}

function revisionOf(jobID) {
  return useUsersStore
    .getState()
    .jobData.jobArray.find((job) => job.jobID === jobID)?._meta?.revision;
}

function sentWrites() {
  return putJobDocumentsChange.mock.calls.at(-1)[0];
}

function refusal(code, extra) {
  const err = new Error("refused");
  err.code = code;
  Object.assign(err, extra);
  return err;
}

describe("saving jobs as one change", () => {
  beforeEach(() => {
    putJobDocumentsChange.mockReset();
    putJobDocumentsBatch.mockReset();
    warned.mockReset();
    useUsersStore.getState().jobData.actions.resetJobDataStore();
    signIn();
  });

  it("sends every job in one request, the edited one by what changed", async () => {
    putJobDocumentsChange.mockResolvedValueOnce(undefined);

    const outcome = await saveJobsAsOneChange(
      [jobAt("edited", 4), jobAt("linked", 2), jobAt("created")],
      { edited: renamed },
    );

    expect(outcome).toBe("saved");
    expect(putJobDocumentsChange).toHaveBeenCalledOnce();
    expect(putJobDocumentsBatch).not.toHaveBeenCalled();
    const writes = sentWrites();
    expect(writes.map((write) => write.jobID)).toEqual([
      "edited",
      "linked",
      "created",
    ]);
    expect(writes[0]).toMatchObject({
      revision: 4,
      document: { name: "edited" },
    });
    expect(writes[1]).not.toHaveProperty("revision");
    expect(writes[2].document._meta).toEqual({});
  });

  it("takes what the queue held for its jobs into the change and leaves the rest", async () => {
    const { actions } = useUsersStore.getState().jobData;
    actions.queueJobDocumentWritesFromJobs(
      [jobAt("edited", 4), jobAt("elsewhere", 1)],
      { edited: renamed, elsewhere: renamed },
    );
    putJobDocumentsChange.mockResolvedValueOnce(undefined);

    await saveJobsAsOneChange([jobAt("edited", 4)], {});

    expect(sentWrites()[0]).not.toHaveProperty("revision");
    expect(Object.keys(queued())).toEqual(["elsewhere"]);
  });

  it("folds a queued change into the edited job's own", async () => {
    const { actions } = useUsersStore.getState().jobData;
    actions.queueJobDocumentWritesFromJobs([jobAt("edited", 4)], {
      edited: [
        { patches: [{ op: "remove", path: ["build", "extrasCosts", "e-1"] }] },
      ],
    });
    putJobDocumentsChange.mockResolvedValueOnce(undefined);

    await saveJobsAsOneChange([jobAt("edited", 4)], { edited: renamed });

    expect(sentWrites()[0]).toMatchObject({
      revision: 4,
      document: { name: "edited" },
      removed: [["build", "extrasCosts", "e-1"]],
    });
  });

  it("counts every job it wrote", async () => {
    putJobDocumentsChange.mockResolvedValueOnce(undefined);

    await saveJobsAsOneChange([jobAt("edited", 4), jobAt("created")], {
      edited: renamed,
    });

    expect(revisionOf("edited")).toBe(5);
    expect(revisionOf("created")).toBe(1);
  });

  it.each([
    [
      "conflict",
      refusal(CLIENT_ERROR_REVISION_CONFLICT, {
        revisionConflict: {
          rejected: [{ docID: "linked", expected: 2, current: 3, gone: false }],
        },
      }),
      [],
    ],
    [
      "locked",
      refusal(DOCUMENT_LOCK_CLIENT_ERROR_LOCK_HELD_ELSEWHERE, {
        lockHeldDocIDs: [{ docID: "linked" }],
      }),
      ["none of it was saved"],
    ],
    [
      "failed",
      Object.assign(new Error("unreadable"), { status: 400 }),
      ["could not be read"],
    ],
    ["failed", new Error("network"), ["could not be saved"]],
  ])(
    "answers %s, counts nothing, leaves nothing queued and warns as it should",
    async (outcome, err, told) => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      putJobDocumentsChange.mockRejectedValueOnce(err);

      const answered = await saveJobsAsOneChange(
        [jobAt("edited", 4), jobAt("linked", 2)],
        { edited: renamed },
      );

      expect(answered).toBe(outcome);
      expect(revisionOf("edited")).toBe(4);
      expect(revisionOf("linked")).toBe(2);
      expect(queued()).toEqual({});
      expect(warned.mock.calls).toEqual(
        told.map((words) => [expect.stringContaining(words), 8]),
      );
    },
  );
});

describe("putting a refused change's jobs back as they are saved", () => {
  beforeEach(() => {
    useUsersStore.getState().jobData.actions.resetJobDataStore();
    useUsersStore.getState().editSession.actions.closeSession();
  });

  it("takes the saved copies, drops the jobs that are gone and the new ones it would have made", async () => {
    const { jobData, editSession } = useUsersStore.getState();
    jobData.actions.updateOrAddJobsToJobArray([
      jobFromDocument({ jobID: "edited", name: "changed here" }),
      jobFromDocument({ jobID: "linked", name: "resized here" }),
      jobFromDocument({ jobID: "deleted", name: "still held" }),
      jobFromDocument({ jobID: "created", name: "never saved" }),
    ]);
    editSession.actions.openJob("edited", {
      jobID: "edited",
      name: "changed here",
    });
    requestJobDocumentsByIdsFromApi.mockResolvedValueOnce([
      jobFromDocument({
        jobID: "edited",
        name: "as saved",
        _meta: { revision: 5 },
      }),
      jobFromDocument({
        jobID: "linked",
        name: "as saved",
        _meta: { revision: 2 },
      }),
    ]);

    await restoreSavedJobs(["edited", "linked", "deleted"], ["created"]);

    const held = Object.fromEntries(
      useUsersStore
        .getState()
        .jobData.jobArray.map((job) => [job.jobID, job.name]),
    );
    expect(held).toEqual({ edited: "as saved", linked: "as saved" });
    expect(useUsersStore.getState().editSession.draft.base.edited.name).toBe(
      "as saved",
    );
  });

  it("says so and still answers when the saved jobs cannot be read back", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    warned.mockReset();
    useUsersStore
      .getState()
      .jobData.actions.updateOrAddJobsToJobArray([
        jobFromDocument({ jobID: "created", name: "never saved" }),
      ]);
    requestJobDocumentsByIdsFromApi.mockRejectedValueOnce(new Error("offline"));

    await expect(
      restoreSavedJobs(["edited"], ["created"]),
    ).resolves.toBeUndefined();

    expect(useUsersStore.getState().jobData.jobArray).toEqual([]);
    expect(warned).toHaveBeenCalledWith(
      expect.stringContaining("could not be read back"),
      8,
    );
  });
});
