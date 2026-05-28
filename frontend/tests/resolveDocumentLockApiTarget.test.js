import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  USER_JOB_GROUPS_COLLECTION,
  USER_JOBS_COLLECTION,
} from "../src/Functions/DocumentLock/documentLockCollections.js";
import { resolveDocumentLockApiTarget } from "../src/Functions/DocumentLock/resolveDocumentLockApiTarget.js";

const findJobInJobArray = vi.fn();

vi.mock("../src/Zustand/usersStore.js", () => ({
  default: {
    getState: () => ({
      jobData: { actions: { findJobInJobArray } },
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
    expect(
      resolveDocumentLockApiTarget(USER_JOBS_COLLECTION, "job-1")
    ).toEqual({
      collection: USER_JOB_GROUPS_COLLECTION,
      docID: "group-1",
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
