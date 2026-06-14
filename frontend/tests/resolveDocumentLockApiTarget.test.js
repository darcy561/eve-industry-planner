import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  USER_JOB_GROUPS_COLLECTION,
  USER_JOBS_COLLECTION,
} from "../src/Functions/DocumentLock/documentLockCollections.js";
import { resolveDocumentLockApiTarget } from "../src/Functions/DocumentLock/resolveDocumentLockApiTarget.js";

const findJobInJobArray = vi.fn();
const getGroupObject = vi.fn();

vi.mock("../src/Zustand/usersStore.js", () => ({
  default: {
    getState: () => ({
      jobData: { actions: { findJobInJobArray, getGroupObject } },
    }),
  },
}));

describe("resolveDocumentLockApiTarget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects group member jobs to the group lock", () => {
    findJobInJobArray.mockReturnValue({
      jobID: "job-1",
      includedInGroup: true,
      groupID: "group-1",
    });
    getGroupObject.mockReturnValue({ groupID: "group-1" });
    expect(
      resolveDocumentLockApiTarget(USER_JOBS_COLLECTION, "job-1")
    ).toEqual({
      collection: USER_JOB_GROUPS_COLLECTION,
      docID: "group-1",
    });
  });

  it("uses per-job lock when the group document is gone", () => {
    findJobInJobArray.mockReturnValue({
      jobID: "job-orphan",
      includedInGroup: true,
      groupID: "group-deleted",
    });
    getGroupObject.mockReturnValue(null);
    expect(
      resolveDocumentLockApiTarget(USER_JOBS_COLLECTION, "job-orphan")
    ).toEqual({
      collection: USER_JOBS_COLLECTION,
      docID: "job-orphan",
    });
  });

  it("leaves solo jobs on the job collection", () => {
    findJobInJobArray.mockReturnValue({
      jobID: "job-2",
      includedInGroup: false,
      groupID: null,
    });
    expect(
      resolveDocumentLockApiTarget(USER_JOBS_COLLECTION, "job-2")
    ).toEqual({
      collection: USER_JOBS_COLLECTION,
      docID: "job-2",
    });
  });

  it("passes group collection through unchanged", () => {
    expect(
      resolveDocumentLockApiTarget(USER_JOB_GROUPS_COLLECTION, "group-1")
    ).toEqual({
      collection: USER_JOB_GROUPS_COLLECTION,
      docID: "group-1",
    });
  });
});
