import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../../tests/usersStoreHarness.js");
  return usersStoreMock(() => usersStoreState(held.state));
});

const held = { state: {} };
const useDocumentLock = vi.fn();
const useRegisterHeaderDocumentLockUI = vi.fn();

vi.mock("../../../Hooks/DocumentLock/useDocumentLock.js", () => ({
  useDocumentLock: (...args) => useDocumentLock(...args),
}));
vi.mock(
  "../../../Hooks/DocumentLock/useRegisterHeaderDocumentLockUI.js",
  () => ({
    useRegisterHeaderDocumentLockUI: (...args) =>
      useRegisterHeaderDocumentLockUI(...args),
  }),
);

const { useEditJobDocumentLocks } =
  await import("./useEditJobDocumentLocks.js");

function locksTaken() {
  return useDocumentLock.mock.calls.map(([collection, docID, enabled]) => ({
    collection,
    docID,
    enabled,
  }));
}

beforeEach(() => {
  useDocumentLock.mockClear();
  useRegisterHeaderDocumentLockUI.mockClear();
});

describe("the locks the Edit Job page holds", () => {
  it("takes the job's own lock for a job opened on its own", () => {
    held.state = {
      account: { isLoggedIn: true },
      jobData: { activeGroupID: null },
    };

    renderHook(() =>
      useEditJobDocumentLocks({
        jobID: "job-1",
        openJobID: "job-1",
        groupID: null,
        isLoading: false,
      }),
    );

    expect(locksTaken()).toEqual([
      { collection: "job_documents", docID: "job-1", enabled: true },
      { collection: "job_groups", docID: "", enabled: false },
    ]);
  });

  it("takes the job's own lock as well as the group's when opened from its group", () => {
    held.state = {
      account: { isLoggedIn: true },
      jobData: { activeGroupID: "group-1" },
    };

    renderHook(() =>
      useEditJobDocumentLocks({
        jobID: "job-1",
        openJobID: "job-1",
        groupID: "group-1",
        isLoading: false,
      }),
    );

    expect(locksTaken()).toEqual([
      { collection: "job_documents", docID: "job-1", enabled: true },
      { collection: "job_groups", docID: "group-1", enabled: true },
    ]);
    expect(
      useRegisterHeaderDocumentLockUI.mock.calls
        .at(-1)[0]
        .registrations.map((row) => row.label),
    ).toEqual(["Job", "Group"]);
  });

  it("takes no lock for a reader who is not signed in", () => {
    held.state = {
      account: { isLoggedIn: false },
      jobData: { activeGroupID: null },
    };

    renderHook(() =>
      useEditJobDocumentLocks({
        jobID: "job-1",
        openJobID: "job-1",
        groupID: null,
        isLoading: false,
      }),
    );

    expect(locksTaken().every((lock) => lock.enabled === false)).toBe(true);
  });
});
